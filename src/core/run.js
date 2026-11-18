// Ein einzelner Run: Wirtschaft, Packs, Team, Wellen und Simulation.
// Diese Klasse kennt kein DOM – Darstellung & Sound hängen sich über `events` an.
import { drawCards, packPrice, starsForCopies, copiesForNextStar, starMultiplier, buildCardDef } from './cards.js';
import { buildWave, waveScaling, isBossWave, isEliteWave } from './waves.js';
import { newStatusBlock, fx, damageHero } from './combat.js';
import { updateHeroes, updateProjectiles } from './heroes.js';
import { updateEnemies, updateMinions } from './enemies.js';
import { updateSpells, castSpell } from './spells.js';
import { dist, deepClone, getPath } from './util.js';
import { masteryPointsFor } from './starmap.js';
import { damageEnemy, applyStatus } from './combat.js';

export const SIM_STEP = 1 / 60;

/** Höhe eines Helden-Sprites in Weltpixeln (32 px × 3). Helden stehen mit den Füßen auf ihrem Slot. */
const HERO_HALF = 48;

export class Run {
  /**
   * @param {object} o
   * @param {object} o.data        aufbereitete Spieldaten (prepareData)
   * @param {number} o.chapterId
   * @param {object} o.mods        Mastery-Modifikatoren (computeModifiers)
   * @param {number} o.unlockedChapter höchstes freigeschaltetes Kapitel (bestimmt verfügbare Packs)
   * @param {object} o.settings    { autoSpells, damageNumbers }
   * @param {function} o.rng
   * @param {function} o.events    (name, payload) => void
   * @param {boolean} o.headless   keine visuellen Effekte; volle Slots werden automatisch verkauft (Simulation)
   */
  constructor({ data, chapterId, mods, unlockedChapter = 1, settings = {}, rng = Math.random, events = () => {}, headless = false }) {
    this.data = data;
    this.balance = data.balance;
    this.field = data.balance.field;
    this.chapter = data.chapterIndex[chapterId];
    this.mods = mods;
    this.rng = rng;
    this.emit = events;
    this.headless = headless;
    this.settings = { autoSpells: true, damageNumbers: true, ...settings };

    const B = this.balance;
    const F = this.field;
    this.time = 0;
    this.gold = B.economy.startGold + mods.startGold;
    this.tower = {
      x: F.towerX / 2, y: F.groundY - 150,
      maxHp: Math.round(B.tower.hp * mods.towerHpMul), hp: 0, atkTimer: 0.5, hitFlash: 0,
    };
    this.tower.hp = this.tower.maxHp;
    this.slotCount = Math.min(B.heroes.maxSlots, F.slots.length, B.heroes.baseSlots + mods.extraSlots);

    this.availablePacks = data.packs.filter((p) => p.unlockChapter <= unlockedChapter || mods.earlyPacks.includes(p.id));
    this.spellSlots = B.spells.maxSlots + mods.extraSpellSlots;
    this.coins = [];
    this.cursor = { x: 0, y: 0, active: false, tick: 0, pulse: 0, angle: 0 };
    this.lastStandUsed = false;
    this.lastPack = null;
    this.packBuys = {};
    this.owned = {};        // Karten-ID -> { copies, stars } (nur dieser Run)
    this.drawCounts = {};   // Karten-ID -> wie oft gezogen (für die Sammlung)
    this.heroes = [];
    this.spells = [];
    this.pending = [];      // gezogene Helden, für die kein Slot frei ist (Entscheidung des Spielers)
    this.enemies = [];
    this.minions = [];
    this.projectiles = [];
    this.effects = [];
    this.zones = [];
    this.iceWall = null;
    this.telegraphs = [];
    this.corpses = [];
    this.goldBonus = 0;
    this.earlyCall = false;
    this.buffs = { goldRush: { time: 0, multiplier: 1 }, warHorn: { time: 0, amount: 0 }, curse: { time: 0, amount: 0 } };
    this.auras = { haste: 0, armor: 0, bossSlow: 0 };
    this.seenTypes = new Set();

    this.wave = 0;
    this.waveState = 'prep'; // prep | active | break
    this.waveTimer = B.waves.prepTime;
    this.waveElapsed = 0;
    this.waveTotal = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;

    this.stats = { kills: 0, goldEarned: 0, goldSpent: 0, goldStolen: 0, damageDealt: 0, packsOpened: 0, spellsCast: 0 };
    this.over = false;
    this.result = null;
    this.bossKilled = false;
    this.nextUid = 1;
  }

  // ===================================================================
  // Wirtschaft & Packs
  // ===================================================================

  addGold(amount) {
    this.gold += amount;
    this.stats.goldEarned += amount;
  }

  packPrice(packId) {
    return packPrice(this.data.packIndex[packId], this.packBuys[packId] || 0, this.mods, this.balance);
  }

  canBuy(packId) {
    return !this.over && this.availablePacks.some((p) => p.id === packId) && this.gold >= this.packPrice(packId);
  }

  /** Kauft ein Pack und verarbeitet die gezogenen Karten. Gibt die Ergebnisse zurück (oder null). */
  buyPack(packId) {
    if (!this.canBuy(packId)) return null;
    const pack = this.data.packIndex[packId];
    const price = this.packPrice(packId);
    this.gold -= price;
    this.stats.goldSpent += price;
    this.packBuys[packId] = (this.packBuys[packId] || 0) + 1;
    this.stats.packsOpened++;
    const count = this.balance.economy.cardsPerPack + (this.mods.flags.vierteKarte ? 1 : 0);
    const ids = drawCards(pack, this.data, count, this.rng, this.mods.rarityUpChance);
    if (this.stats.packsOpened === 1 && this.balance.economy.firstPackGuaranteesAttacker) this.ensureAttacker(pack, ids);
    const results = ids.map((id) => this.addCard(id));
    this.lastPack = { pack, results, rerolled: !this.mods.flags.wahlDesGluecks };
    // Die erste Welle startet sofort nach dem ersten Pack
    if (this.waveState === 'prep' && this.balance.waves.startOnFirstPack) this.waveTimer = Math.min(this.waveTimer, 0);
    this.emit('packOpened', { pack, results });
    return results;
  }

  /** "Wahl des Glücks": eine Karte des zuletzt geöffneten Packs neu ziehen (einmal pro Pack). */
  canReroll() {
    return !!this.lastPack && !this.lastPack.rerolled;
  }

  rerollCard(index) {
    if (!this.canReroll()) return null;
    const lp = this.lastPack;
    const old = lp.results[index];
    if (!old) return null;
    this.undoCard(old);
    const [id] = drawCards(lp.pack, this.data, 1, this.rng, this.mods.rarityUpChance);
    const res = this.addCard(id);
    res.rerolled = true;
    lp.results[index] = res;
    lp.rerolled = true;
    this.emit('cardRerolled', { index, result: res });
    return res;
  }

  /** Macht die Wirkung einer gezogenen Karte rückgängig (für das Neuziehen). */
  undoCard(res) {
    const id = res.id;
    this.drawCounts[id] = Math.max(0, (this.drawCounts[id] || 1) - 1);
    if (res.gold) { this.gold = Math.max(0, this.gold - res.gold); this.stats.goldEarned -= res.gold; }
    if (res.outcome === 'slotsFull') { const i = this.pending.indexOf(id); if (i >= 0) this.pending.splice(i, 1); return; }
    const own = this.owned[id];
    if (!own) return;
    if (res.outcome === 'new') {
      delete this.owned[id];
      const h = this.heroes.find((x) => x.id === id);
      if (h) { for (const e of this.enemies) if (e.blocker === h) e.blocker = null; this.heroes = this.heroes.filter((x) => x !== h); }
      this.spells = this.spells.filter((s) => s.id !== id);
    } else if (res.outcome === 'copy' || res.outcome === 'starUp') {
      own.copies = Math.max(0, own.copies - 1);
      const stars = starsForCopies(own.copies, this.balance);
      if (stars !== own.stars) { own.stars = stars; this.refreshCard(id); }
    }
  }

  /** Ersetzt die letzte Karte durch einen angreifenden Helden der niedrigsten Seltenheit, falls keiner gezogen wurde. */
  ensureAttacker(pack, ids) {
    const attacks = (id) => this.data.cardIndex[id].kind === 'hero' && this.data.heroIndex[id].attack.kind !== 'none';
    if (ids.some(attacks)) return;
    const order = (id) => this.data.rarities[this.data.cardIndex[id].def.rarity].order;
    const cands = pack.pool.filter(attacks);
    const minOrder = Math.min(...cands.map(order));
    const pool = cands.filter((id) => order(id) === minOrder);
    ids[ids.length - 1] = pool[Math.floor(this.rng() * pool.length)];
  }

  sellValue(id) {
    const rar = this.data.rarities[this.data.cardIndex[id].def.rarity];
    return Math.round(rar.sellValue * this.balance.economy.overflowGoldFactor * this.chapter.goldMult);
  }

  /**
   * Fügt eine gezogene Karte hinzu:
   * neu → Held wird platziert / Zauber kommt in die Leiste,
   * Duplikat → Fortschritt zum nächsten Stern, bei 5 Sternen → Gold,
   * kein Slot frei → Entscheidung des Spielers (pending), kein Zauber-Slot frei → Gold.
   */
  addCard(id) {
    const card = this.data.cardIndex[id];
    const B = this.balance;
    const sellGold = this.sellValue(id);
    this.drawCounts[id] = (this.drawCounts[id] || 0) + 1;
    const res = { id, kind: card.kind, rarity: card.def.rarity };
    const own = this.owned[id];

    if (own) {
      if (own.stars >= B.stars.max) {
        this.addGold(sellGold);
        return { ...res, outcome: 'maxed', gold: sellGold, stars: own.stars };
      }
      const prevAt = B.stars.thresholds[own.stars - 1];
      const before = own.copies;
      own.copies++;
      const stars = starsForCopies(own.copies, B);
      const starUp = stars > own.stars;
      own.stars = stars;
      if (starUp) { this.refreshCard(id); this.starfire(id); }
      return {
        ...res, outcome: starUp ? 'starUp' : 'copy', stars, copies: own.copies, copiesBefore: before,
        nextAt: copiesForNextStar(stars, B), prevAt: starUp ? B.stars.thresholds[stars - 1] : prevAt,
      };
    }

    if (card.kind === 'hero') {
      const slot = this.freeSlot(card.def.row);
      if (slot < 0) {
        if (this.headless) {
          this.addGold(sellGold);
          return { ...res, outcome: 'sold', gold: sellGold };
        }
        this.pending.push(id);
        this.emit('slotsFull', { id });
        return { ...res, outcome: 'slotsFull' };
      }
      this.owned[id] = this.freshOwned();
      this.placeHero(id, slot);
    } else {
      if (this.spells.length >= this.spellSlots) {
        this.addGold(sellGold);
        return { ...res, outcome: 'spellsFull', gold: sellGold };
      }
      this.owned[id] = this.freshOwned();
      this.addSpell(id);
    }
    return { ...res, outcome: 'new', stars: 1, copies: this.owned[id].copies, nextAt: copiesForNextStar(1, B), prevAt: 0 };
  }

  /** Neuer Kartenbesitz. "Erfahrene Rekruten" geben Startfortschritt zum nächsten Stern. */
  freshOwned() {
    return { copies: this.mods.recruitProgress * this.balance.stars.thresholds[1], stars: 1 };
  }

  /** "Sternenfeuer": Sternaufstieg eines Helden löst eine Schockwelle aus. */
  starfire(id) {
    if (!this.mods.flags.sternenfeuer) return;
    const h = this.heroes.find((x) => x.id === id);
    if (!h) return;
    const H = this.balance.heroes;
    const dmg = Math.max(10, h.def.stats.damage) * h.power * this.mods.damageMul * H.starfireDamage;
    fx(this, { type: 'ring', x: h.x, y: h.y, r: H.starfireRadius, color: '#FFD24A', life: 0.6 });
    for (const e of this.enemies) {
      if (e.dead || dist(e, h) > H.starfireRadius + 200) continue;
      damageEnemy(this, e, dmg, 'magic', { aoe: true });
      applyStatus(this, e, { type: 'knockback', distance: 80 });
    }
    this.emit('shake', { power: 6 });
  }

  /** Freier Slot, bevorzugt in der gewünschten Reihe (vorn/hinten). -1 = alles voll. */
  freeSlot(row) {
    const free = [];
    for (let i = 0; i < this.slotCount; i++) if (!this.heroes.some((h) => h.slot === i)) free.push(i);
    if (!free.length) return -1;
    return free.find((i) => this.field.slots[i].row === row) ?? free[0];
  }

  /** Wert eines platzierten Helden (für das Ersetzen): Verkaufswert × (1 + Duplikate). */
  heroValue(h) {
    return this.sellValue(h.id) * (1 + (this.owned[h.id]?.copies || 0));
  }

  /** Spieler-Entscheidung bei vollen Slots: neue Karte verkaufen. */
  sellPending(id) {
    const i = this.pending.indexOf(id);
    if (i < 0) return 0;
    this.pending.splice(i, 1);
    const g = this.sellValue(id);
    this.addGold(g);
    return g;
  }

  /** Spieler-Entscheidung bei vollen Slots: bestehenden Helden ersetzen (Rückerstattung 50 % seines Wertes). */
  replaceHero(pendingId, hero) {
    const i = this.pending.indexOf(pendingId);
    if (i < 0 || !this.heroes.includes(hero)) return 0;
    this.pending.splice(i, 1);
    const refund = Math.round(this.heroValue(hero) * this.balance.heroes.replaceRefund);
    this.addGold(refund);
    for (const e of this.enemies) if (e.blocker === hero) e.blocker = null;
    this.heroes = this.heroes.filter((h) => h !== hero);
    delete this.owned[hero.id];
    this.owned[pendingId] = this.owned[pendingId] || this.freshOwned();
    this.placeHero(pendingId, hero.slot);
    return refund;
  }

  // ===================================================================
  // Helden & Zauber
  // ===================================================================

  placeHero(id, slot) {
    const s = this.field.slots[slot];
    const h = {
      kind: 'hero', id, slot, x: s.x, y: s.y - HERO_HALF, footY: s.y, alive: true, reviveTimer: 0,
      atkTimer: 0.3 + this.rng() * 0.4, abilityTimers: {}, root: 0, freeze: 0, hitFlash: 0, damageDone: 0,
      hp: 0, maxHp: 0, animTime: this.rng() * 2, attackAnim: 0,
    };
    this.heroes.push(h);
    this.recalcHero(h);
    h.hp = h.maxHp;
    fx(this, { type: 'ring', x: h.x, y: h.y, r: 60, color: this.data.rarities[h.def.rarity].color, life: 0.6 });
    this.emit('heroPlaced', { hero: h });
  }

  recalcHero(h) {
    const own = this.owned[h.id];
    const ratio = h.maxHp ? h.hp / h.maxHp : 1;
    h.stars = own.stars;
    h.def = buildCardDef(this.data.heroIndex[h.id], own.stars, this.mods, this.balance);
    h.power = starMultiplier(own.stars, this.balance);
    h.maxHp = h.def.stats.hp * h.power * this.mods.heroHpMul;
    h.hp = h.alive ? Math.max(1, ratio * h.maxHp) : 0;
  }

  addSpell(id) {
    const s = { id, charge: 0, cooldown: 1, flash: 0, auto: this.settings.autoSpells !== false };
    this.spells.push(s);
    this.recalcSpell(s);
    s.charge = s.cooldown * this.balance.spells.initialChargeFraction;
  }

  recalcSpell(s) {
    const own = this.owned[s.id];
    const B = this.balance;
    s.stars = own.stars;
    s.def = buildCardDef(this.data.spellIndex[s.id], own.stars, this.mods, B);
    // Sterne und "Verstärkte Magie" erhöhen die Zauberwirkung
    const m = starMultiplier(own.stars, B) * this.mods.spellPowerMul;
    for (const path of s.def.scale || []) {
      const keys = path.split('.');
      const parent = getPath(s.def, keys.slice(0, -1).join('.'));
      if (parent && typeof parent[keys.at(-1)] === 'number') parent[keys.at(-1)] *= m;
    }
    s.cooldown = s.def.cooldown * Math.max(0.3, 1 - B.spells.cooldownReductionPerStar * (own.stars - 1)) * Math.max(0.3, this.mods.spellCooldownMul);
  }

  refreshCard(id) {
    const h = this.heroes.find((x) => x.id === id);
    if (h) {
      this.recalcHero(h);
      fx(this, { type: 'ring', x: h.x, y: h.y, r: 70, color: '#FFD24A', life: 0.7 });
    }
    const s = this.spells.find((x) => x.id === id);
    if (s) this.recalcSpell(s);
  }

  /** Zauber auslösen. target = {x, y} für Flächenzauber, die per Klick gezielt werden. */
  castSpell(id, target = null) {
    const s = this.spells.find((x) => x.id === id);
    return s ? castSpell(this, s, target) : false;
  }

  setSpellAuto(id, on) {
    const s = this.spells.find((x) => x.id === id);
    if (s) s.auto = on;
  }

  healTower(amount, silent = false) {
    const t = this.tower;
    const before = t.hp;
    t.hp = Math.min(t.maxHp, t.hp + amount);
    if (!silent && t.hp - before >= 1 && this.settings.damageNumbers) {
      fx(this, { type: 'text', x: t.x, y: t.y - 160, text: `+${Math.round(t.hp - before)}`, color: '#5ED17A', size: 22 });
    }
  }

  // ===================================================================
  // Gegner, Diener & Wellen
  // ===================================================================

  /** Erzeugt einen Gegner. opts: { elite, x, wave } */
  spawnEnemy(id, opts = {}) {
    const base = this.data.enemyIndex[id];
    const F = this.field;
    const B = this.balance;
    const wave = opts.wave ?? Math.max(1, this.wave);
    const sc = waveScaling(this.chapter, wave, B);
    const elite = !!opts.elite && !base.boss;
    const E = B.waves.elite;
    const hp = base.hp * (base.boss ? sc.bossHp : sc.hp) * (elite ? E.hp : 1);
    const size = base.size * (elite ? E.size : 1);
    const e = {
      kind: 'enemy', uid: this.nextUid++, id, def: deepClone(base), name: base.name, wave, waveNo: this.wave,
      boss: !!base.boss, elite, flying: base.flying,
      x: opts.x ?? F.spawnX + this.rng() * 40,
      y: base.flying ? F.airY + (this.rng() * 96 - 48) : F.groundY - size + (this.rng() * 22 - 11),
      size, hp, maxHp: hp, wasHit: false, animTime: this.rng() * 2, spawnAge: 0,
      speed: base.speed * (0.92 + this.rng() * 0.16),
      armor: base.armor, magicResist: base.magicResist, immune: base.immune || [],
      frontalShield: !!base.traits?.frontalShield, traits: base.traits || {},
      gold: base.gold * sc.gold * (elite ? E.gold : 1) * (1 + this.goldBonus), goldScaleRaw: sc.gold / this.chapter.goldMult,
      damage: base.damage * sc.damage * (elite ? E.damage : 1), damageScale: sc.damage,
      attackInterval: base.attackInterval, atkTimer: 0.3,
      blockSlots: base.blockSlots || 1, blocker: null, passedFront: false,
      st: newStatusBlock(), hitFlash: 0, isSlowed: false,
      bossState: base.boss ? { timers: {}, phase: 0, charging: 0, chargeMax: 1 } : null,
    };
    this.enemies.push(e);
    if (!this.seenTypes.has(id)) {
      this.seenTypes.add(id);
      this.emit('enemyFirstSeen', { id, enemy: e });
    }
    if (e.boss) this.emit('bossSpawned', { enemy: e });
    return e;
  }

  spawnMinion(hero, ab, x) {
    const m = {
      kind: 'minion', x: Math.min(x, this.field.frontX + 48), y: this.field.groundY - 20, size: 20,
      hp: ab.hp * hero.power, maxHp: ab.hp * hero.power,
      damage: ab.damage * hero.power * this.mods.damageMul, attackSpeed: ab.attackSpeed, atkTimer: 0.5,
      life: ab.duration, maxLife: ab.duration, blockCap: 1, animTime: 0,
    };
    this.minions.push(m);
    this.layoutMinions();
    fx(this, { type: 'text', x: m.x, y: m.y - 40, text: 'Erhebe dich!', color: '#cfe8cf', size: 18 });
  }

  /** Diener stellen sich nebeneinander an der Frontlinie auf. */
  layoutMinions() {
    this.minions.forEach((m, i) => {
      m.x = this.field.frontX - 10 - (i % 4) * 30;
      m.y = this.field.groundY - 20 - Math.floor(i / 4) * 24;
    });
  }

  startWave(n) {
    this.wave = n;
    this.waveState = 'active';
    this.waveElapsed = 0;
    this.spawnTimer = 0;
    this.spawnQueue = buildWave(this.chapter, n, this.data, this.rng);
    this.waveTotal = this.spawnQueue.length;
    this.emit('waveStart', { wave: n, boss: isBossWave(this.chapter, n), elite: isEliteWave(this.chapter, n, this.balance) });
  }

  /** Fortschritt der aktuellen Welle (0–1): Anteil der bereits besiegten bzw. durchgebrochenen Gegner. */
  waveProgress() {
    if (this.waveState !== 'active' || !this.waveTotal) return this.waveState === 'break' ? 1 : 0;
    const alive = this.enemies.filter((e) => !e.dead && e.waveNo === this.wave).length;
    return Math.max(0, Math.min(1, 1 - (this.spawnQueue.length + alive) / this.waveTotal));
  }

  /** Zwischen den Wellen: nächste Welle sofort rufen → +10 % Gold pro Kill in dieser Welle. */
  callNextWave() {
    if (this.over || this.waveState === 'active' || this.wave >= this.chapter.waves) return false;
    this.waveTimer = 0;
    this.earlyCall = true;
    return true;
  }

  updateWaves(dt) {
    const W = this.balance.waves;
    if (this.waveState !== 'active') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.goldBonus = this.earlyCall ? W.earlyCallGoldBonus : 0;
        this.earlyCall = false;
        this.startWave(this.wave + 1);
      }
      return;
    }
    this.waveElapsed += dt;
    if (this.spawnQueue.length) {
      this.spawnTimer -= dt;
      while (this.spawnTimer <= 0 && this.spawnQueue.length) {
        const s = this.spawnQueue.shift();
        this.spawnEnemy(s.id, { elite: s.elite });
        this.spawnTimer += this.spawnQueue[0]?.delay ?? 0;
      }
      return;
    }
    if (this.wave >= this.chapter.waves) {
      // Bosswelle: läuft, bis Boss oder Turm fällt – kleine Gegner kommen weiter, aber seltener
      this.trickleTimer = (this.trickleTimer ?? W.bossTrickleInterval) - dt;
      if (this.trickleTimer <= 0) {
        this.trickleTimer = W.bossTrickleInterval;
        const pool = this.chapter.enemies.filter((e) => this.wave >= (e.fromWave ?? 1) && this.wave <= (e.toWave ?? Infinity));
        this.spawnEnemy(pool[Math.floor(this.rng() * pool.length)].id);
      }
      return;
    }
    // Spawnzeit vorbei → nach 5 s kommt die nächste Welle, auch wenn noch Gegner leben
    this.waveState = 'break';
    this.waveTimer = W.nextWaveDelay;
    // "Zinsen": Bonus auf das aktuelle Gold am Ende jeder Welle
    if (this.mods.interest > 0) {
      const bonus = Math.floor(this.gold * this.mods.interest);
      if (bonus > 0) { this.addGold(bonus); this.emit('interest', { amount: bonus }); }
    }
    this.emit('waveSpawnDone', { wave: this.wave });
  }

  /** Boss-Angriffe mit Vorwarnung: roter Kreis am Boden, nach `time` Sekunden wird `apply` ausgeführt. */
  telegraph(t) {
    this.telegraphs.push({ time: this.balance.combat.bossTelegraphTime, maxTime: this.balance.combat.bossTelegraphTime, ...t });
  }

  updateTelegraphs(dt) {
    for (const t of this.telegraphs) {
      t.time -= dt;
      if (t.time <= 0 && !t.done) { t.done = true; t.apply(); }
    }
    this.telegraphs = this.telegraphs.filter((t) => !t.done);
  }

  // ===================================================================
  // Auren, Turm, Buffs
  // ===================================================================

  computeAuras() {
    const a = { haste: 0, armor: 0, bossSlow: 0 };
    for (const h of this.heroes) {
      if (!h.alive) continue;
      const ab = h.def.abilities;
      if (ab.haste) a.haste += ab.haste.amount;
      if (ab.armorAura) a.armor += ab.armorAura.armor;
      if (ab.bossSlow) a.bossSlow = Math.max(a.bossSlow, ab.bossSlow.amount);
    }
    this.auras = a;
  }

  updateTower(dt) {
    const t = this.tower;
    t.hitFlash = Math.max(0, t.hitFlash - dt);
    if (this.mods.towerRegen > 0) this.healTower(t.maxHp * this.mods.towerRegen * dt, true); // "Mörtel"
    // Der Turm schießt nur mit dem Sternenkarten-Knoten "Turmbogen"
    const lvl = this.mods.towerBowDamage;
    if (lvl <= 0) return;
    const A = this.balance.tower.attack;
    t.atkTimer -= dt;
    if (t.atkTimer > 0) return;
    const origin = { x: this.field.towerX / 2, y: this.field.groundY - 300 };
    const targets = this.enemies
      .filter((e) => !e.dead && (!e.flying || A.canHitAir) && dist(origin, e) <= A.range)
      .sort((a, b) => a.x - b.x)
      .slice(0, 1 + this.mods.towerBowMulti);
    if (!targets.length) { t.atkTimer = 0.15; return; }
    const dmg = A.damage * (1 + A.damagePerLevel * (lvl - 1)) * Math.pow(A.waveGrowth, Math.max(0, this.wave - 1));
    for (const target of targets) {
      this.projectiles.push({
        x: origin.x, y: origin.y, target, tx: target.x, ty: target.y, speed: 1100, damage: dmg, crit: false,
        type: A.damageType, splash: 0, onHit: null, bonusVsAir: 1, color: '#F4EBD9', shape: 'bolt', isTower: true,
      });
    }
    t.atkTimer = A.interval * Math.max(0.3, 1 - A.speedPerLevel * this.mods.towerBowSpeed);
  }

  // ===================================================================
  // Runenkreis (Cursor) & Münzen
  // ===================================================================

  /** Aktuelle Werte des Runenkreises. */
  cursorStats() {
    const C = this.balance.cursor;
    return {
      radius: C.radius * this.mods.cursorRadiusMul,
      tick: C.tick * Math.max(0.3, this.mods.cursorTickMul),
      damage: (C.damage + this.mods.cursorDamage) * Math.pow(C.waveGrowth, Math.max(0, this.wave - 1)),
      magnet: C.magnet + this.mods.magnet,
      crit: this.mods.cursorCrit,
    };
  }

  /** Setzt die Cursor-Position (Weltkoordinaten); active = Maus/Finger über dem Spielfeld. */
  setCursor(x, y, active) {
    this.cursor.x = x;
    this.cursor.y = y;
    this.cursor.active = active;
  }

  /** Runenkreis: trifft periodisch alle Gegner im Radius (plus Zwillingsrune). */
  updateCursor(dt) {
    const cur = this.cursor;
    const C = this.balance.cursor;
    const cs = this.cursorStats();
    cur.angle += dt * 2.4;
    cur.pulse = Math.max(0, cur.pulse - dt);
    if (!cur.active) return;
    cur.tick -= dt;
    if (cur.tick > 0) return;
    cur.tick = cs.tick;
    cur.pulse = 0.18;
    const circles = [{ x: cur.x, y: cur.y, r: cs.radius, f: 1 }];
    if (this.mods.flags.zwillingsrune) {
      const d = cs.radius * 1.5;
      circles.push({ x: cur.x + Math.cos(cur.angle) * d, y: cur.y + Math.sin(cur.angle) * d, r: cs.radius * C.twinRadius, f: C.twinFraction });
    }
    for (const c of circles) {
      for (const e of this.enemies) {
        if (e.dead || dist(e, c) > c.r + e.size * 0.6) continue;
        const crit = cs.crit > 0 && this.rng() < cs.crit;
        const dmg = cs.damage * c.f * (crit ? 2 : 1);
        damageEnemy(this, e, dmg, C.damageType, { aoe: true, crit });
        if (this.mods.flags.glutkreis) applyStatus(this, e, { type: 'burn', dpsFactor: C.burnDpsFactor, duration: C.burnDuration }, dmg);
        if (this.mods.flags.frostkreis) applyStatus(this, e, { type: 'slow', factor: 1 - C.frostSlow, duration: cs.tick + 0.2 });
        // "Funkenregen": kritische Treffer springen auf einen Nachbargegner über
        if (crit && this.mods.flags.funkenregen) {
          const n = this.enemies.find((o) => o !== e && !o.dead && dist(o, e) < 220);
          if (n) {
            fx(this, { type: 'bolt', x1: e.x, y1: e.y, x2: n.x, y2: n.y, color: '#FFD24A', width: 3, life: 0.2 });
            damageEnemy(this, n, dmg * C.sparkFraction, C.damageType, { aoe: true });
          }
        }
      }
    }
  }

  /** Gegner lässt Münzen fallen. In der Simulation (headless) wird das Gold sofort gutgeschrieben. */
  dropCoins(e, value, nugget = false) {
    if (this.headless) { this.addGold(value); return; }
    const n = nugget ? 1 : Math.min(4, 1 + Math.floor(Math.log2(1 + value / 8)));
    const per = value / n;
    for (let i = 0; i < n; i++) {
      if (this.coins.length >= this.balance.coins.maxOnField) { this.addGold(per); continue; }
      const ground = e.flying ? this.field.groundY - 20 : e.y + e.size - 14;
      this.coins.push({
        x: e.x + (this.rng() - 0.5) * 50, y: Math.min(this.field.groundY - 8, ground), fromY: e.y,
        value: per, age: 0, life: this.balance.coins.lifetime + this.mods.coinLifetime, nugget,
      });
    }
  }

  updateCoins(dt) {
    if (!this.coins.length) return;
    const cs = this.cursorStats();
    const reach = cs.radius + cs.magnet;
    const auto = this.mods.flags.sammelgeist ? this.balance.coins.autoCollectAfter : Infinity;
    let collected = 0;
    for (const c of this.coins) {
      c.age += dt;
      const near = this.cursor.active && dist(c, this.cursor) <= reach;
      if ((near && c.age > 0.25) || c.age >= auto) {
        c.done = true;
        collected += c.value;
        fx(this, { type: 'coin', x: c.x, y: c.y, delay: 0, life: 0.7, seed: this.rng(), nugget: c.nugget });
      } else if (c.age >= c.life) {
        c.done = true; // verfallen
        this.stats.goldLost = (this.stats.goldLost || 0) + c.value;
      }
    }
    if (collected > 0) {
      this.addGold(collected);
      this.emit('coinsCollected', { amount: collected });
    }
    this.coins = this.coins.filter((c) => !c.done);
  }

  updateBuffs(dt) {
    for (const b of Object.values(this.buffs)) if (b.time > 0) b.time = Math.max(0, b.time - dt);
    if (this.iceWall) { this.iceWall.time -= dt; if (this.iceWall.time <= 0) this.iceWall = null; }
    for (const z of this.zones) {
      z.time -= dt;
      if (z.type === 'lava') {
        for (const h of this.heroes) {
          if (h.alive && dist(h, z) <= z.r) damageHero(this, h, z.dps * dt);
        }
      }
    }
    this.zones = this.zones.filter((z) => z.time > 0);
  }

  // ===================================================================
  // Hauptschleife
  // ===================================================================

  /** Simuliert dt Sekunden in festen Schritten. */
  update(dt) {
    let left = dt;
    while (left > 1e-6 && !this.over) {
      const step = Math.min(SIM_STEP, left);
      this.step(step);
      left -= step;
    }
    // Animationen und Effekte altern in Spielzeit
    for (const f of this.effects) f.age += dt;
    this.effects = this.effects.filter((f) => f.age < f.life);
    for (const h of this.heroes) { h.animTime += dt; h.attackAnim = Math.max(0, h.attackAnim - dt); }
    for (const e of this.enemies) { e.animTime += dt; e.spawnAge += dt; }
    for (const c of this.corpses) c.deathAge += dt;
    this.corpses = this.corpses.filter((c) => c.deathAge < 0.6);
    if (this.over) this.endAge = (this.endAge || 0) + dt;
    for (const m of this.minions) { m.animTime += dt; m.attackAnim = Math.max(0, (m.attackAnim || 0) - dt); }
  }

  step(dt) {
    this.time += dt;
    this.updateBuffs(dt);
    this.updateWaves(dt);
    this.computeAuras();
    updateHeroes(this, dt);
    updateMinions(this, dt);
    this.updateTower(dt);
    updateProjectiles(this, dt);
    updateEnemies(this, dt);
    this.updateCursor(dt);
    this.updateCoins(dt);
    updateSpells(this, dt);
    this.updateTelegraphs(dt);
    // Tote Gegner kurz für die Todesanimation behalten (nicht der Dieb, der mit der Beute flieht)
    if (this.enemies.some((e) => e.dead)) {
      if (!this.headless) for (const e of this.enemies) if (e.dead && !e.stolen) { e.deathAge = 0; this.corpses.push(e); }
      this.enemies = this.enemies.filter((e) => !e.dead);
    }
  }

  onBossKilled(e) {
    this.bossKilled = true;
    // Boss explodiert in Lichtstrahlen, alle übrigen Gegner lösen sich auf, Goldregen
    fx(this, { type: 'rays', x: e.x, y: e.y, life: 2 });
    fx(this, { type: 'goldrain', x: 0, y: 0, life: 2.2 });
    if (!this.headless) for (const o of this.enemies) if (!o.dead) { o.dead = true; o.deathAge = 0; this.corpses.push(o); }
    this.enemies = [];
    this.finish(true);
  }

  /** Beendet den Run und berechnet das Ergebnis. */
  finish(victory) {
    if (this.over) return;
    this.over = true;
    this.endAge = 0;
    if (!victory) fx(this, { type: 'towerfall', x: this.tower.x, y: this.field.groundY, life: 1.6 });
    const result = {
      victory,
      chapterId: this.chapter.id,
      wave: this.wave,
      bossKilled: this.bossKilled,
      time: this.time,
      drawCounts: { ...this.drawCounts },
      maxStars: Object.fromEntries(Object.entries(this.owned).map(([id, o]) => [id, o.stars])),
      seenEnemies: [...this.seenTypes],
      stats: { ...this.stats },
      heroes: this.heroes.map((h) => ({ id: h.id, stars: h.stars, damage: Math.round(h.damageDone) })),
    };
    // Liegengebliebene Münzen am Ende gutschreiben (bei Sieg: Goldregen) – zählt aber nicht mehr für Packs
    result.mp = masteryPointsFor(result, this.balance, this.mods);
    result.points = result.mp.total;
    this.result = result;
    this.emit('runOver', result);
  }
}
