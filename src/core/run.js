// Ein einzelner Run: Wirtschaft, Packs, Team, Wellen und Simulation.
// Diese Klasse kennt kein DOM – Darstellung & Sound hängen sich über `events` an.
import { drawCards, packPrice, starsForCopies, copiesForNextStar, starMultiplier, buildCardDef } from './cards.js';
import { buildWave, waveScaling, isBossWave } from './waves.js';
import { newStatusBlock, fx, damageHero } from './combat.js';
import { updateHeroes, updateProjectiles } from './heroes.js';
import { updateEnemies, updateMinions } from './enemies.js';
import { updateSpells, castSpell } from './spells.js';
import { dist, deepClone, getPath } from './util.js';
import { masteryPointsFor } from './mastery.js';

export const SIM_STEP = 1 / 60;

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
   * @param {boolean} o.headless   keine visuellen Effekte (Simulation)
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
      x: F.towerX - 45, y: F.groundY - 90,
      maxHp: Math.round(B.tower.hp * mods.towerHpMul), hp: 0, atkTimer: 0.5, hitFlash: 0,
    };
    this.tower.hp = this.tower.maxHp;
    this.slotCount = Math.min(B.heroes.maxSlots, F.slotPositions.length, B.heroes.baseSlots + mods.extraSlots);

    this.availablePacks = data.packs.filter((p) => p.unlockChapter <= unlockedChapter);
    this.packBuys = {};
    this.owned = {};        // Karten-ID -> { copies, stars } (nur dieser Run)
    this.drawCounts = {};   // Karten-ID -> wie oft gezogen (für die Sammlung)
    this.heroes = [];
    this.spells = [];
    this.enemies = [];
    this.minions = [];
    this.projectiles = [];
    this.effects = [];
    this.zones = [];
    this.iceWall = null;
    this.buffs = { goldRush: { time: 0, multiplier: 1 }, warHorn: { time: 0, amount: 0 }, curse: { time: 0, amount: 0 } };
    this.auras = { haste: 0, armor: 0, bossSlow: 0 };

    this.wave = 0;
    this.waveState = 'prep'; // prep | active | break
    this.waveTimer = B.waves.firstWaveDelay;
    this.waveElapsed = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;

    this.stats = { kills: 0, goldEarned: 0, goldStolen: 0, damageDealt: 0, packsOpened: 0, spellsCast: 0 };
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
    this.gold -= this.packPrice(packId);
    this.packBuys[packId] = (this.packBuys[packId] || 0) + 1;
    this.stats.packsOpened++;
    let count = this.balance.economy.cardsPerPack;
    const bonus = this.rng() < this.mods.bonusCardChance;
    if (bonus) count++;
    const ids = drawCards(pack, this.data, count, this.rng);
    if (this.stats.packsOpened === 1 && this.balance.economy.firstPackGuaranteesAttacker) this.ensureAttacker(pack, ids);
    const results = ids.map((id) => this.addCard(id));
    if (bonus) results[results.length - 1].bonus = true;
    this.emit('packOpened', { pack, results });
    return results;
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

  /**
   * Fügt eine gezogene Karte hinzu:
   * neu → Held wird platziert / Zauber kommt in die Leiste,
   * Duplikat → Fortschritt zum nächsten Stern, bei 5 Sternen oder ohne freien Slot → Gold.
   */
  addCard(id) {
    const card = this.data.cardIndex[id];
    const B = this.balance;
    const sellGold = Math.round(this.data.rarities[card.def.rarity].sellValue * B.economy.overflowGoldFactor * this.chapter.goldMult);
    this.drawCounts[id] = (this.drawCounts[id] || 0) + 1;
    const res = { id, kind: card.kind, rarity: card.def.rarity };
    const own = this.owned[id];

    if (own) {
      if (own.stars >= B.stars.max) {
        this.addGold(sellGold);
        return { ...res, outcome: 'maxed', gold: sellGold, stars: own.stars };
      }
      own.copies++;
      const stars = starsForCopies(own.copies, B);
      const starUp = stars > own.stars;
      own.stars = stars;
      if (starUp) this.refreshCard(id);
      return { ...res, outcome: starUp ? 'starUp' : 'copy', stars, copies: own.copies, nextAt: copiesForNextStar(stars, B) };
    }

    if (card.kind === 'hero') {
      const slot = this.freeSlot();
      if (slot < 0) {
        this.addGold(sellGold);
        return { ...res, outcome: 'noSlot', gold: sellGold };
      }
      this.owned[id] = { copies: 0, stars: 1 };
      this.placeHero(id, slot);
    } else {
      this.owned[id] = { copies: 0, stars: 1 };
      this.addSpell(id);
    }
    return { ...res, outcome: 'new', stars: 1, copies: 0, nextAt: copiesForNextStar(1, B) };
  }

  freeSlot() {
    for (let i = 0; i < this.slotCount; i++) if (!this.heroes.some((h) => h.slot === i)) return i;
    return -1;
  }

  // ===================================================================
  // Helden & Zauber
  // ===================================================================

  placeHero(id, slot) {
    const [x, y] = this.field.slotPositions[slot];
    const h = {
      kind: 'hero', id, slot, x, y, alive: true, reviveTimer: 0,
      atkTimer: 0.3 + this.rng() * 0.4, abilityTimers: {}, root: 0, freeze: 0, hitFlash: 0, damageDone: 0,
      hp: 0, maxHp: 0,
    };
    this.heroes.push(h);
    this.recalcHero(h);
    h.hp = h.maxHp;
    fx(this, { type: 'ring', x, y, r: 36, color: this.data.rarities[h.def.rarity].color, life: 0.6 });
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
    const s = { id, charge: 0, cooldown: 1, flash: 0 };
    this.spells.push(s);
    this.recalcSpell(s);
    s.charge = s.cooldown * this.balance.spells.initialChargeFraction;
  }

  recalcSpell(s) {
    const own = this.owned[s.id];
    const B = this.balance;
    s.stars = own.stars;
    s.def = buildCardDef(this.data.spellIndex[s.id], own.stars, this.mods, B);
    const m = starMultiplier(own.stars, B);
    for (const path of s.def.scale || []) {
      const keys = path.split('.');
      const parent = getPath(s.def, keys.slice(0, -1).join('.'));
      if (parent && typeof parent[keys.at(-1)] === 'number') parent[keys.at(-1)] *= m;
    }
    s.cooldown = s.def.cooldown * Math.max(0.3, 1 - B.spells.cooldownReductionPerStar * (own.stars - 1));
  }

  refreshCard(id) {
    const h = this.heroes.find((x) => x.id === id);
    if (h) {
      this.recalcHero(h);
      fx(this, { type: 'ring', x: h.x, y: h.y, r: 44, color: '#ffd34d', life: 0.7 });
    }
    const s = this.spells.find((x) => x.id === id);
    if (s) this.recalcSpell(s);
  }

  castSpell(id) {
    const s = this.spells.find((x) => x.id === id);
    return s ? castSpell(this, s) : false;
  }

  healTower(amount, silent = false) {
    const t = this.tower;
    const before = t.hp;
    t.hp = Math.min(t.maxHp, t.hp + amount);
    if (!silent && t.hp - before >= 1 && this.settings.damageNumbers) {
      fx(this, { type: 'text', x: t.x, y: t.y - 100, text: `+${Math.round(t.hp - before)}`, color: '#6fe39a', size: 14 });
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
      kind: 'enemy', uid: this.nextUid++, id, def: deepClone(base), name: base.name, wave,
      boss: !!base.boss, elite, flying: base.flying,
      x: opts.x ?? F.spawnX + this.rng() * 30,
      y: base.flying ? F.airY + (this.rng() * 60 - 30) : F.groundY - size + (this.rng() * 14 - 7),
      size, hp, maxHp: hp,
      speed: base.speed * (0.92 + this.rng() * 0.16),
      armor: base.armor, magicResist: base.magicResist, immune: base.immune || [],
      frontalShield: !!base.traits?.frontalShield, traits: base.traits || {},
      gold: base.gold * sc.gold * (elite ? E.gold : 1), goldScaleRaw: sc.gold / this.chapter.goldMult,
      damage: base.damage * sc.damage * (elite ? E.damage : 1), damageScale: sc.damage,
      attackInterval: base.attackInterval, atkTimer: 0.3,
      blockSlots: base.blockSlots || 1, blocker: null, passedFront: false,
      st: newStatusBlock(), hitFlash: 0, isSlowed: false,
      bossState: base.boss ? { timers: {}, phase: 0, charging: 0, chargeMax: 1 } : null,
    };
    this.enemies.push(e);
    if (e.boss) this.emit('bossSpawned', { enemy: e });
    return e;
  }

  spawnMinion(hero, ab, x) {
    const m = {
      kind: 'minion', x: Math.min(x, this.field.frontX + 30), y: this.field.groundY - 12, size: 12,
      hp: ab.hp * hero.power, maxHp: ab.hp * hero.power,
      damage: ab.damage * hero.power * this.mods.damageMul, attackSpeed: ab.attackSpeed, atkTimer: 0.5,
      life: ab.duration, maxLife: ab.duration, blockCap: 1,
    };
    this.minions.push(m);
    this.layoutMinions();
    fx(this, { type: 'text', x: m.x, y: m.y - 24, text: 'Erhebe dich!', color: '#cfe8cf', size: 11 });
  }

  /** Diener stellen sich nebeneinander an der Frontlinie auf. */
  layoutMinions() {
    this.minions.forEach((m, i) => { m.x = this.field.frontX - 8 - (i % 4) * 18; m.y = this.field.groundY - 12 - Math.floor(i / 4) * 16; });
  }

  startWave(n) {
    this.wave = n;
    this.waveState = 'active';
    this.waveElapsed = 0;
    this.spawnTimer = 0;
    this.spawnQueue = buildWave(this.chapter, n, this.data, this.rng);
    this.emit('waveStart', { wave: n, boss: isBossWave(this.chapter, n) });
  }

  /** Nächste Welle sofort rufen (in Pause/Vorbereitung) – gibt etwas Bonusgold für die gesparte Zeit. */
  callNextWave() {
    if (this.over || this.waveState === 'active' || this.wave >= this.chapter.waves) return false;
    const bonus = Math.round(this.waveTimer * this.balance.waves.earlyCallGoldPerSecond * this.chapter.goldMult);
    if (bonus > 0) this.addGold(bonus);
    this.waveTimer = 0;
    return true;
  }

  updateWaves(dt) {
    const W = this.balance.waves;
    if (this.waveState !== 'active') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.startWave(this.wave + 1);
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
    if (this.wave >= this.chapter.waves) return; // Bosswelle: läuft, bis Boss oder Turm fällt
    const alive = this.enemies.some((e) => !e.dead);
    if (!alive) {
      this.waveState = 'break';
      this.waveTimer = W.breakBetweenWaves;
      this.emit('waveCleared', { wave: this.wave });
    } else if (this.waveElapsed >= W.maxWaveDuration) {
      this.startWave(this.wave + 1);
    }
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
    const A = this.balance.tower.attack;
    t.atkTimer -= dt;
    if (t.atkTimer > 0) return;
    const origin = { x: this.field.towerX - 20, y: this.field.groundY - 170 };
    let target = null;
    for (const e of this.enemies) {
      if (e.dead || (e.flying && !A.canHitAir)) continue;
      if (dist(origin, e) <= A.range && (!target || e.x < target.x)) target = e;
    }
    if (!target) { t.atkTimer = 0.15; return; }
    const dmg = A.damage * this.mods.towerDamageMul * Math.pow(A.waveGrowth, Math.max(0, this.wave - 1));
    this.projectiles.push({
      x: origin.x, y: origin.y, target, tx: target.x, ty: target.y, speed: 700, damage: dmg, crit: false,
      type: A.damageType, splash: 0, onHit: null, bonusVsAir: 1, color: '#e6d3a3', shape: 'dot', isTower: true,
    });
    t.atkTimer = A.interval;
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
    // visuelle Effekte altern in Echtzeit-Spielzeit
    for (const f of this.effects) f.age += dt;
    this.effects = this.effects.filter((f) => f.age < f.life);
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
    updateSpells(this, dt);
    if (this.enemies.length > 60 || this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
  }

  onBossKilled(e) {
    this.bossKilled = true;
    fx(this, { type: 'ring', x: e.x, y: e.y, r: 200, color: '#ffd34d', life: 1 });
    this.finish(true);
  }

  /** Beendet den Run und berechnet das Ergebnis. */
  finish(victory) {
    if (this.over) return;
    this.over = true;
    const result = {
      victory,
      chapterId: this.chapter.id,
      wave: this.wave,
      bossKilled: this.bossKilled,
      time: this.time,
      drawCounts: { ...this.drawCounts },
      stats: { ...this.stats },
      heroes: this.heroes.map((h) => ({ id: h.id, stars: h.stars, damage: Math.round(h.damageDone) })),
    };
    result.points = masteryPointsFor(result, this.balance);
    this.result = result;
    this.emit('runOver', result);
  }
}
