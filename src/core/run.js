// Ein Run in der Arena. Kennt kein DOM – Darstellung und Sound hängen sich über `events` an.
import { dist, weightedPick } from './util.js';
import { drawCard, grenzgaengerChance, buildUnitDef } from './cards.js';
import { newStatus, fx, damageEnemy, applyStatus, damageUnit, damageTower } from './combat.js';
import { updateUnits, updateProjectiles, updateZones, UNIT_R } from './units.js';
import { updateEnemies } from './enemies.js';
import { masteryFor } from './meta.js';

export const SIM_STEP = 1 / 60;

const PACK_MID = 20; // Packs liegen ca. 30×40 px groß; Mitte 20 px über dem Fußpunkt
const PACK_HIT = 18;

export class Run {
  /**
   * @param {object} o
   * @param {object} o.data      aufbereitete Spieldaten
   * @param {object} o.save      Spielstand (nur gelesen: Sammlung, Relikte, Statistik)
   * @param {number} o.chapterId
   * @param {object} o.mods      computeMods(...)
   * @param {string[]} o.bag     Pack-IDs aus der Run-Tasche, Einzelkarten als "karte:<id>"
   * @param {function} o.events  (name, payload) => void
   * @param {boolean} o.headless Simulation ohne Darstellung (Karten erscheinen sofort)
   */
  constructor({ data, save, chapterId, mods, bag = [], rng = Math.random, events = () => {}, headless = false, settings = {}, sessionMinutes = 0 }) {
    this.data = data;
    this.save = save;
    this.B = data.balance;
    this.A = data.balance.arena;
    this.chapter = data.chapterIndex[chapterId];
    this.mods = mods;
    this.rng = rng;
    this.emit = events;
    this.headless = headless;
    this.settings = { damageNumbers: true, ...settings };
    this.bag = [...bag];
    this.sessionMinutes = sessionMinutes;

    this.time = 0;          // Kampfzeit (nach dem Countdown)
    this.state = 'countdown';
    this.countdown = this.B.run.countdown;
    this.tower = { x: this.A.mitteX, y: this.A.mitteY, r: this.B.turm.kontaktRadius, maxHp: Math.round(this.B.turm.leben * mods.turmLebenMul), hp: 0, hitFlash: 0, shotTimer: 1, boltTimer: 6 };
    this.tower.hp = this.tower.maxHp;

    this.units = []; this.enemies = []; this.packs = []; this.tomes = []; this.cards = [];
    this.projectiles = []; this.zones = []; this.effects = []; this.corpses = []; this.telegraphs = []; this.hammers = [];
    this.buffs = { blutrausch: { t: 0, bonus: 0 }, trommel: { t: 0, bonus: 0 }, riesen: { t: 0, schadenMul: 1, reichweiteMul: 1, lebenMul: 1, groesseMul: 1 } };
    this.freezeAll = 0;
    this.hail = null;
    this.blizzard = 0; this.blizzardRate = 0;
    this.slowmo = 0;
    this.coins = 0;
    this.uid = 1;
    this.cursor = { x: 0, y: 0, active: false, tick: 0, angle: 0, pulse: 0, busy: false };
    this.seenThisRun = new Set();
    this.revivesUsed = 0;

    // Wellen
    // Monsterstrom und Elitegruppen (Abschnitt 5)
    this.spawnTimer = 0.5;
    this.eliteTimer = this.B.wellen.elite.ersteBei * mods.elitewelleIntervallMul;
    this.pendingElite = null;
    this.bossWarned = false;
    this.bossTime = this.chapter.bossNachSekunden * mods.bossZeitMul;
    this.bossSpawned = false;
    this.boss = null;
    this.hazards = this.chapter.gefahren.map((h) => ({ ...h, next: h.abSekunde, left: 0 }));

    // Gebäude aus der Sternenkarte
    this.buildings = Object.entries(mods.gebaeude).filter(([, lvl]) => lvl > 0).map(([id, lvl]) => {
      const def = data.buildingIndex[id];
      const p = this.edgePoint(def.position.winkel, this.A.gebaeudeRing);
      const stufe = def.stufen[Math.min(def.stufen.length - 1, lvl - 1)];
      const interval = stufe.intervall * (mods.gebaeudeIntervallMul ?? 1);
      return { id, def, level: lvl, x: p.x, y: p.y, interval, crateChance: stufe.kistenChance, timer: interval * 0.5 };
    });

    // bonusMastery: Mastery außerhalb der Überlebensformel (erste Shinys, Tome-Verbot), foilStaub: Schimmer aus Shinys
    this.stats = { kills: 0, killWert: 0, bossAbschnitte: 0, muenzen: 0, bonusMastery: 0, foilStaub: 0, schimmer: {}, ersteShinys: [], packsGeoeffnet: {}, gezogen: {}, neueKarten: [], foils: 0, grenzgaenger: 0, tomesGenutzt: 0, entwicklungen: 0, killsNachArt: {}, foilMonster: 0, elitewellen: 0 };
    this.over = false;
    this.result = null;
    this.endAge = 0;
  }

  // =====================================================================
  // Arena-Geometrie
  // =====================================================================

  /** 0 = Mitte, 1 = Rand des Ovals. */
  edgeFactor(p) {
    return Math.hypot((p.x - this.A.mitteX) / this.A.radiusX, (p.y - this.A.mitteY) / this.A.radiusY);
  }

  clampToArena(p, max = 1) {
    const f = this.edgeFactor(p);
    if (f <= max) return;
    p.x = this.A.mitteX + (p.x - this.A.mitteX) * (max / f);
    p.y = this.A.mitteY + (p.y - this.A.mitteY) * (max / f);
  }

  /** Punkt auf dem Oval bei Winkel (Grad, 0 = rechts, 90 = unten) und Radiusanteil. */
  edgePoint(deg, frac = 1) {
    const a = (deg * Math.PI) / 180;
    return { x: this.A.mitteX + Math.cos(a) * this.A.radiusX * frac, y: this.A.mitteY + Math.sin(a) * this.A.radiusY * frac };
  }

  randomRingPoint() {
    const [lo, hi] = this.A.packLandeRing;
    return this.edgePoint(this.rng() * 360, lo + this.rng() * (hi - lo));
  }

  // =====================================================================
  // Packs
  // =====================================================================

  /** Pack fliegt im Bogen von (fromX, fromY) auf einen Platz im Ring um den Turm. Kisten werden zu Einzelpacks. */
  launchPack(packId, from = this.tower, delay = 0) {
    const def = this.data.packIndex[packId];
    if (!def) return;
    if (def.art === 'kiste') {
      for (let i = 0; i < def.inhalt.anzahl; i++) this.launchPack(def.inhalt.pack, from, delay + i * 0.12);
      return;
    }
    if (def.art !== 'pack') return;
    const target = this.randomRingPoint();
    const hp = def.widerstand * this.mods.packWiderstandMul;
    this.packs.push({
      uid: this.uid++, packId, def, sx: from.x, sy: from.y - 60, tx: target.x, ty: target.y, x: from.x, y: from.y,
      t: -delay, flight: this.headless ? 0 : this.B.run.packFlugzeit, landed: this.headless, hp, maxHp: hp, wobble: 0, cracks: 0, rot: (this.rng() - 0.5) * 0.52,
    });
  }

  /** Einzelne, bereits aufgedeckte Karte (aus dem Shop) fliegt aufs Feld. */
  launchCard(cardId, from = this.tower, delay = 0, foil = false) {
    if (!this.data.cardIndex[cardId]) return;
    // Gekaufte Helden sammeln sich nah am Turmfuß
    const a = this.rng() * Math.PI * 2, d = 70 + this.rng() * 60;
    const land = { x: this.tower.x + Math.cos(a) * d, y: this.tower.y + 20 + Math.abs(Math.sin(a)) * d * 0.6 };
    this.cards.push({ id: cardId, foil, x: from.x, y: from.y - 60, sx: from.x, sy: from.y - 60, tx: land.x, ty: land.y, t: -delay, dur: this.headless ? 0 : 0.8, shop: true });
  }

  updatePacks(dt) {
    for (const p of this.packs) {
      if (!p.landed) {
        p.t += dt;
        if (p.t < 0) continue;
        const k = Math.min(1, p.t / p.flight);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * 220;
        if (k >= 1) { p.landed = true; p.x = p.tx; p.y = p.ty; fx(this, { type: 'dust', x: p.x, y: p.y + 20, life: 0.35 }); this.emit('sound', 'packLand'); }
      }
      p.wobble = Math.max(0, p.wobble - dt);
    }
  }

  damagePack(p, amount) {
    if (p.opened || !p.landed) return;
    p.hp -= amount;
    p.wobble = 0.18;
    const frac = p.hp / p.maxHp;
    const cracks = frac < 0.25 ? 3 : frac < 0.5 ? 2 : frac < 0.8 ? 1 : 0;
    if (cracks > p.cracks) { p.cracks = cracks; fx(this, { type: 'splinter', x: p.x, y: p.y - 30, color: p.def.farbe, life: 0.4 }); }
    this.emit('sound', 'packHit');
    if (p.hp <= 0) this.openPack(p);
  }

  /** Pack platzt auf: Karten werden gezogen und fliegen zu ihrem Landepunkt. */
  openPack(p) {
    p.opened = true;
    const def = p.def;
    const S = this.stats;
    S.packsGeoeffnet[def.id] = (S.packsGeoeffnet[def.id] || 0) + 1;
    fx(this, { type: 'flash', x: p.x, y: p.y - 30, r: 90, color: '#ffffff', life: 0.35 });
    this.emit('packOpened', { pack: p });
    // Bonuskarte: Chance auf eine zusätzliche Karte pro Pack
    const count = def.kartenProPack + this.mods.kartenProPack + (this.rng() < (this.mods.bonusKarteChance || 0) ? 1 : 0);
    const foilChance = (this.B.karten.foilChance + this.mods.foilChance) * this.mods.foilChanceMul;
    const grenzChance = grenzgaengerChance(this.data, this.sessionMinutes + this.time / 60, this.mods.grenzgaengerChance);
    // Glanzpack: gezielt seltene Karten, die noch fehlen (sonst beliebige seltene)
    let src = def;
    if (def.nurFehlende) {
      const rank = (id) => this.data.rarities[this.data.cardIndex[id].def.rarity].rang;
      const minRank = Math.min(...Object.keys(def.seltenheitsGewichte).map((r) => this.data.rarities[r].rang));
      const all = [...new Set(this.data.packs.filter((x) => x.art === 'pack' && x.pool?.length).flatMap((x) => x.pool))].filter((id) => rank(id) >= minRank);
      const missing = all.filter((id) => !this.save.collection[id] && !this.seenThisRun.has(id));
      src = { ...def, pool: missing.length ? missing : all };
    }
    for (let i = 0; i < count; i++) {
      const card = drawCard(src, this.data, this.rng, { foilChance, grenzChance });
      const a = (i / count) * Math.PI * 2 + this.rng();
      const land = { x: p.x + Math.cos(a) * 60, y: p.y + Math.sin(a) * 34 };
      this.clampToArena(land, 0.95);
      this.cards.push({ ...card, x: p.x, y: p.y - 30, sx: p.x, sy: p.y - 30, tx: land.x, ty: land.y, t: -i * this.B.run.kartenDrehzeit, dur: 0.6, pack: def });
    }
    // Sternenkarte: Aufplatzen (Schockwelle)
    if (this.mods.flags.aufplatzen) {
      fx(this, { type: 'ring', x: p.x, y: p.y, r: 170, color: '#A55CE0', life: 0.4 });
      for (const e of this.enemies) if (!e.dead && dist(e, p) <= 170) {
        damageEnemy(this, e, 15 * this.chapter.wellen.lebenMul, 'magic', { aoe: true, cursor: true });
        applyStatus(this, e, { typ: 'rueckstoss', distanz: 70 }, 0, p);
      }
    }
    // Pack im Pack (Silberpack lässt ein Holzpack fallen)
    if (def.id === 'silberpack' && this.rng() < this.mods.packImPack) this.launchPack('holzpack', p);
    // Relikte beim Öffnen
    for (const r of this.relics('packGeoeffnet')) {
      if (r.aktion.typ === 'giftwolke') this.zones.push({ type: 'gift', x: p.x, y: p.y, r: r.aktion.radius, t: r.aktion.dauer, max: r.aktion.dauer, dps: r.aktion.schadenProSekunde });
    }
    if (this.headless) for (const c of this.cards) c.t = c.dur;
  }

  updateCards(dt) {
    for (const c of this.cards) {
      c.t += dt;
      if (c.t < 0) continue;
      const k = Math.min(1, c.t / c.dur);
      c.x = c.sx + (c.tx - c.sx) * k;
      c.y = c.sy + (c.ty - c.sy) * k - Math.sin(k * Math.PI) * 140;
      c.flipped = k > 0.35;
      if (k >= 1 && !c.done) { c.done = true; this.materialize(c); }
    }
    this.cards = this.cards.filter((c) => !c.done);
  }

  /** Karte landet und verwandelt sich in Einheit oder Tome. */
  materialize(c) {
    const S = this.stats;
    const def = this.data.cardIndex[c.id].def;
    const rar = this.data.rarities[def.rarity];
    const got = (S.gezogen[c.id] ||= { normal: 0, foil: 0 });
    const known = (this.save.collection[c.id]?.normal || 0) + (this.save.collection[c.id]?.foil || 0) > 0;
    const firstShiny = c.foil && !(this.save.collection[c.id]?.foil > 0) && !got.foil;
    got[c.foil ? 'foil' : 'normal']++;
    if (c.foil) {
      // Shiny: Regenbogenblitz statt Seltenheitsfarbe, heller Sound, kurze Zeitlupe
      S.foils++;
      fx(this, { type: 'flash', x: c.tx, y: c.ty - 30, r: 170, color: 'rainbow', life: 0.6 });
      fx(this, { type: 'sparkles', x: c.tx, y: c.ty - 20, life: 1.2 });
      if (!this.headless) this.slowmo = this.B.run.seltenZeitlupe;
      this.emit('foil', { card: c });
      if (firstShiny) {
        const E = this.B.belohnungen.erstesShiny;
        S.bonusMastery += E.masteryKarte; S.ersteShinys.push(c.id);
        this.gainShimmer(E.foilStaubKarte, 'neueShinyKarte', c.tx, c.ty - 30);
      } else if (this.rng() < (this.B.belohnungen.doppelteShinyKarte.chance ?? 1)) this.gainShimmer(this.B.belohnungen.doppelteShinyKarte.foilStaub, 'doppelteShinyKarte', c.tx, c.ty - 30);
    }
    if (def.rarity === 'grenzgaenger') S.grenzgaenger++;
    if (rar.lichtblitz && !c.foil) { fx(this, { type: 'flash', x: c.tx, y: c.ty - 30, r: 160, color: rar.farbe, life: 0.5 }); this.emit('rareCard', { card: c, rarity: def.rarity }); }
    if (rar.zeitlupe && !this.headless) this.slowmo = this.B.run.seltenZeitlupe;
    // Neu entdeckte Karte bzw. erstes Shiny einer Karte: Präsentation (UI pausiert)
    if (def.rarity === 'grenzgaenger') this.emit('grenzgaenger', { card: c });
    if (!known && !this.seenThisRun.has(c.id)) {
      S.neueKarten.push(c.id);
      S.bonusMastery += (this.B.belohnungen.masteryNeueKarte || 0) + (this.mods.masteryNeueKarte || 0); // neuer Sammlungseintrag
      this.emit('newCard', { id: c.id, foil: c.foil });
    } else if (firstShiny) this.emit('newCard', { id: c.id, foil: true, shiny: true });
    this.seenThisRun.add(c.id);

    if (this.data.cardIndex[c.id].art === 'tome') {
      if (this.mods.tomesErlaubt === false) { S.bonusMastery += 1; fx(this, { type: 'text', x: c.tx, y: c.ty - 40, text: '+1 Mastery', color: '#7cc4ff', size: 18 }); return; }
      this.spawnTome(c.id, c.tx, c.ty, c.foil);
      if (this.rng() < this.mods.tomeZweimalChance) this.spawnTome(c.id, c.tx + 50, c.ty + 10, c.foil);
      return;
    }
    if (this.mods.erlaubteKI && !this.mods.erlaubteKI.includes(def.ki)) {
      this.coins += 3; fx(this, { type: 'text', x: c.tx, y: c.ty - 40, text: '+3 Bonus-Münzen', color: '#FFD24A', size: 18 }); return;
    }
    this.spawnUnit(c.id, c.tx, c.ty, { foil: c.foil });
  }

  // =====================================================================
  // Einheiten
  // =====================================================================

  spawnUnit(id, x, y, { foil = false, life = null } = {}) {
    const base = this.data.unitIndex[id];
    const def = buildUnitDef(base, this.mods);
    const a = this.rng() * Math.PI * 2;
    const u = {
      uid: this.uid++, kind: 'unit', id, def, x, y, foil, life, summoned: life != null,
      maxHp: def.werte.leben * this.mods.heldenLebenMul * (foil ? this.foilBonus('lebenMul') : 1), hp: 0, geist: !!def.geist,
      range: def.werte.reichweite * (foil ? this.foilBonus('reichweiteMul') : 1),
      atkTimer: 0.3 + this.rng() * 0.3, timers: {}, kills: 0, blocks: 0, damage: 0, facing: 1, evolved: false,
      homeDx: Math.cos(a) * 110, homeDy: Math.sin(a) * 70, animTime: this.rng() * 2, spawnDelay: 0.15,
    };
    u.hp = u.maxHp;
    this.units.push(u);
    fx(this, { type: 'ring', x, y, r: 50, color: this.data.rarities[base.rarity].farbe, life: 0.45 });
    return u;
  }

  /**
   * Schimmer verdienen (10.1): Betrag merken (für die Aufschlüsselung im Ergebnis), kleiner Regenbogen-Kristall
   * springt aus der Quelle und fliegt zum Run-Zähler oben mittig.
   */
  gainShimmer(n, source, x, y) {
    if (!n) return;
    this.stats.foilStaub += n;
    this.stats.schimmer[source] = (this.stats.schimmer[source] || 0) + n;
    for (let i = 0; i < n; i++) fx(this, { type: 'shimmerFly', x: x + (i - (n - 1) / 2) * 10, y, delay: i * 0.08, life: 0.9 + i * 0.08 });
    this.emit('schimmer', { amount: n });
  }

  /** Shiny-Bonus als Faktor; „Starker Glanz“ (Foil-Baum) verstärkt nur den Bonusanteil. */
  foilBonus(key) {
    return 1 + (this.B.karten.foil[key] - 1) * this.mods.foilStaerkeMul;
  }

  /** Entwicklung im Run: Bedingung erfüllt → Lichtsäule, volle Heilung, neue Werte und neues Aussehen. */
  checkEvolution(u) {
    const ev = u.def.entwicklung;
    if (!ev || u.evolved) return;
    const n = ev.bedingung.typ === 'kills' ? u.kills : ev.bedingung.typ === 'blocks' ? u.blocks : 0;
    if (n < ev.bedingung.anzahl) return;
    const ratio = u.hp / u.maxHp;
    u.evolved = true;
    u.def = buildUnitDef(this.data.unitIndex[u.id], this.mods, true);
    u.maxHp = u.def.werte.leben * this.mods.heldenLebenMul * (u.foil ? this.foilBonus('lebenMul') : 1);
    u.hp = ev.volleHeilung ? u.maxHp : ratio * u.maxHp;
    u.range = u.def.werte.reichweite * (u.foil ? this.foilBonus('reichweiteMul') : 1);
    this.stats.entwicklungen++;
    fx(this, { type: 'pillar', x: u.x, y: u.y, life: 0.9 });
    fx(this, { type: 'text', x: u.x, y: u.y - 100, text: `${ev.name}!`, color: '#FFD24A', size: 24, life: 1.4 });
    this.emit('evolved', { unit: u });
  }

  killUnit(u, expired = false) {
    if (u.dead) return;
    // Relikt "Zweite Chance": erster toter Held pro Run steht wieder auf
    if (!expired && !u.summoned) {
      for (const r of this.relics('heldGestorben')) {
        if (r.aktion.typ === 'wiederbeleben' && this.revivesUsed < r.aktion.maxProRun) {
          this.revivesUsed++;
          u.hp = u.maxHp * r.aktion.lebenAnteil;
          fx(this, { type: 'pillar', x: u.x, y: u.y, life: 0.8 });
          fx(this, { type: 'text', x: u.x, y: u.y - 90, text: 'Zweite Chance!', color: '#5ED17A', size: 20 });
          return;
        }
      }
    }
    u.dead = true;
    u.deathAge = 0;
    this.corpses.push(u);
    // Seelenkrug: sammelt, solange er liegt, die Seelen gefallener Helden
    if (!u.summoned) for (const t of this.tomes) {
      const le = t.def.liegendEffekt;
      if (le?.typ === 'seelenSammeln' && (t.souls || 0) < le.maxSeelen) {
        t.souls = (t.souls || 0) + 1;
        fx(this, { type: 'soul', x1: u.x, y1: u.y - 40, x2: t.x, y2: t.y - 40, life: 0.8 });
        break;
      }
    }
    for (const e of this.enemies) if (e.engaged === u) e.engaged = null;
    // Knochenruf-Spezial: beschworene Skelette explodieren beim Tod
    if (u.summoned && u.id === 'skelettkrieger' && this.mods.flags.knochenExplosion) {
      fx(this, { type: 'burst', x: u.x, y: u.y, r: 70, color: '#e8e2f0', life: 0.4 });
      for (const e of this.enemies) if (!e.dead && dist(e, u) <= 70) damageEnemy(this, e, 20 * this.chapter.wellen.lebenMul, 'physical', { aoe: true });
    }
    // Relikt Knochenecho: gefallene Helden kehren mit Chance als Skelett zurück
    if (!u.summoned && !expired) for (const r of this.relics('heldGestorben')) {
      if (r.aktion.typ === 'skelett' && this.rng() < r.aktion.chance) {
        this.spawnUnit('skelettkrieger', u.x, u.y, { life: r.aktion.dauer });
        fx(this, { type: 'text', x: u.x, y: u.y - 70, text: 'Knochenecho!', color: '#e8e2f0', size: 18 });
      }
    }
    const s = u.def.beimTod?.beschwoeren;
    if (s && !expired) for (let i = 0; i < s.anzahl; i++) this.spawnUnit(s.einheit, u.x + i * 20, u.y, { life: s.dauer ?? 10 });
    this.emit('unitDied', { unit: u });
  }

  // =====================================================================
  // Tomes
  // =====================================================================

  spawnTome(id, x, y, foil = false) {
    this.tomes.push({ uid: this.uid++, id, def: this.data.tomeIndex[id], x, y, foil, bob: this.rng() * 6, rot: (this.rng() - 0.5) * 0.52 });
  }

  /** Klick auf ein Buch löst den Zauber aus (einmalig). */
  useTome(t) {
    this.tomes = this.tomes.filter((x) => x !== t);
    this.stats.tomesGenutzt++;
    const times = this.rng() < this.mods.tomeDoppeltChance ? 2 : 1;
    for (let i = 0; i < times; i++) this.castTome(t.def, t, t.foil);
    fx(this, { type: 'flash', x: t.x, y: t.y - 40, r: 120, color: this.data.rarities[t.def.rarity].farbe, life: 0.4 });
    if (times > 1) fx(this, { type: 'text', x: t.x, y: t.y - 90, text: 'Doppelt!', color: '#3ED6C4', size: 22 });
    this.emit('tomeUsed', { tome: t.def });
  }

  /** Tome wirken. Shiny-Tome: +50 % Dauer und +50 % Fläche bzw. Häufigkeit (mehr Einschläge, mehr Beschworene). */
  castTome(def, at, foil = false) {
    const e = def.effekt;
    const own = this.mods.tomes?.[def.id] ?? { wirkungMul: 1, dauerMul: 1 };
    const mul = this.mods.tomeWirkungMul * own.wirkungMul;
    const dur = this.mods.tomeDauerMul * mul * own.dauerMul * (foil ? this.foilBonus('tomeDauerMul') : 1);
    const area = foil ? this.foilBonus('tomeFlaecheMul') : 1;
    const often = foil ? this.foilBonus('tomeHaeufigkeitMul') : 1;
    switch (e.typ) {
      case 'geisterFreisetzen': {
        const n = Math.round(Math.max(e.mindestens ?? 1, at.souls || 0) * often);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.spawnUnit(e.einheit, at.x + Math.cos(a) * 70, at.y + Math.sin(a) * 40, { life: e.dauer * dur });
        }
        fx(this, { type: 'text', x: at.x, y: at.y - 90, text: `${n} Geisterkrieger!`, color: '#a6e3ff', size: 22 });
        break;
      }
      case 'riesenwuchs':
        this.buffs.riesen = { t: e.dauer * dur, schadenMul: e.schadenMul, reichweiteMul: e.reichweiteMul * area, lebenMul: e.lebenMul, groesseMul: e.groesseMul };
        for (const u of this.units) if (!u.dead && !u.giant) { u.giant = true; u.maxHp *= e.lebenMul; u.hp *= e.lebenMul; }
        break;
      case 'hagel':
        this.hail = { t: e.dauer * dur, rate: e.einschlaegeProSekunde * often, dmg: e.schaden * mul * this.chapter.wellen.lebenMul, r: e.radius * area, acc: 0, type: e.schadensTyp };
        break;
      case 'beschwoeren': {
        const n = Math.round(e.anzahl * often);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.spawnUnit(e.einheit, this.tower.x + Math.cos(a) * 120 * area, this.tower.y + Math.sin(a) * 75 * area, { life: e.dauer * dur });
        }
        break;
      }
      case 'verstaerken':
        this.buffs.blutrausch = { t: e.dauer * dur, bonus: e.bonus * mul };
        break;
      case 'einfrieren':
        this.freezeAll = e.dauer * dur;
        break;
    }
  }

  updateTomeEffects(dt) {
    if (this.freezeAll > 0) this.freezeAll -= dt;
    const giant = this.buffs.riesen.t > 0;
    for (const b of Object.values(this.buffs)) if (b.t > 0) b.t -= dt;
    if (giant && this.buffs.riesen.t <= 0) for (const u of this.units) if (u.giant) { u.giant = false; u.maxHp /= this.buffs.riesen.lebenMul; u.hp = Math.min(u.hp, u.maxHp); }
    if (this.hail) {
      const h = this.hail;
      h.t -= dt;
      h.acc += dt * h.rate;
      while (h.acc >= 1) {
        h.acc -= 1;
        const alive = this.enemies.filter((x) => !x.dead);
        if (!alive.length) break;
        const target = alive[Math.floor(this.rng() * alive.length)];
        fx(this, { type: 'hail', x: target.x, y: target.y, life: 0.3 });
        for (const e of alive) if (dist(e, target) <= h.r) damageEnemy(this, e, h.dmg, h.type, { aoe: true });
      }
      if (h.t <= 0) this.hail = null;
    }
  }

  // =====================================================================
  // Gegner und Wellen
  // =====================================================================

  spawnPoint() {
    const sp = this.chapter.spawn;
    if (sp.modus === 'portale') {
      const p = sp.portale[Math.floor(this.rng() * sp.portale.length)];
      return this.edgePoint(p.winkel + (this.rng() - 0.5) * 12, this.A.spawnRand);
    }
    return this.edgePoint(this.rng() * 360, this.A.spawnRand);
  }

  spawnEnemy(id, opts = {}) {
    const base = this.data.enemyIndex[id];
    if (!base) return null;
    const W = this.B.wellen;
    const ch = this.chapter.wellen;
    const elite = !!opts.elite && !base.boss;
    const E = W.elite;
    // Bosse betreten das Feld vom Rand (etwas innen, damit das große Sprite sichtbar bleibt)
    const p = opts.x != null ? { x: opts.x, y: opts.y } : base.boss ? this.edgePoint(this.rng() * 360, W.boss.spawnRand) : this.spawnPoint();
    // Leben = Basis × (1 + 0,02 × Sekunden), Schaden wächst langsamer mit
    const scale = base.boss ? 1 : 1 + W.lebenProSekunde * this.time;
    const dmgScale = base.boss ? 1 : 1 + W.schadenProSekunde * this.time;
    const P = this.mods.prestige;
    const G = this.data.balance.gesucht;
    const FM = W.foilMonster;
    // Shiny-Monster würfeln beim Erscheinen; Bosse sind nur über „Gesucht“ shiny
    const foil = !base.boss ? (opts.foil ?? this.rng() < FM.chance + this.mods.foilMonsterChance) : this.mods.gesucht;
    const hp = base.leben * ch.lebenMul * scale * this.mods.gegnerLebenMul * (elite ? E.lebenMul : 1) * (P?.lebenMul ?? 1)
      * (foil ? (base.boss ? G.bossLebenMul : FM.lebenMul) : 1);
    // Darstellungsgröße (Abschnitt 3): kleine Massenmonster, Elite doppelt, Bosse 64 px
    const px = base.boss ? 64 : elite ? base.groesse * 2 : base.groesse;
    const e = {
      uid: this.uid++, kind: 'enemy', id, def: base.boss ? JSON.parse(JSON.stringify(base)) : base, name: base.name,
      x: p.x, y: p.y, elite, fliegt: base.fliegt, frontSchild: !!base.eigenschaften?.frontSchild,
      r: Math.max(9, Math.round(px * 0.4)), px, hp, maxHp: hp, speed: base.tempo * (0.9 + this.rng() * 0.2) * (foil && !base.boss ? FM.tempoMul : 1),
      ruestung: base.ruestung, magieResistenz: base.magieResistenz, immun: base.immun,
      damage: base.schaden * ch.schadenMul * dmgScale * (elite ? E.schadenMul : 1) * (P?.schadenMul ?? 1) * this.mods.gegnerSchadenMul * (foil && base.boss ? G.bossSchadenMul : 1),
      foil, atkTimer: 0.4, st: newStatus(), facing: 1, spawnAge: 0, animTime: this.rng() * 2,
      boss: base.boss ? { timers: {}, phase: 0, scream: null } : null,
    };
    // Relikt Portalsiegel: neu erscheinende Monster sind kurz betäubt
    const seal = this.relicValue('spawnBetaeubung', 'dauer');
    if (seal > 0 && !base.boss && opts.x == null) e.st.stun = seal;
    if (base.boss) {
      e.isBoss = true; this.boss = e;
      // Shiny-Boss (Gesucht): zusätzlicher Angriff
      if (foil) (e.def.bossFaehigkeiten ||= {}).prismaSalve = { ...G.zusatzAngriff };
    }
    this.enemies.push(e);
    return e;
  }

  /**
   * Abstand zwischen zwei Monster-Spawns (Abschnitt 5): Öffnung 1,5 s → Aufbau linear bis 0,6 s → Druck linear bis 0,3 s
   * (bei Bosszeit − 30 s), danach 50 % weniger („Ruhe vor dem Sturm“), im Bosskampf 30 % der Rate.
   */
  spawnInterval(t = this.time) {
    const S = this.B.wellen.strom;
    const pre = this.bossTime - S.vorBossSekunden;
    let iv;
    if (t < S.oeffnungBis) iv = S.oeffnungIntervall;
    else if (t < S.aufbauBis) iv = S.oeffnungIntervall + (S.aufbauIntervall - S.oeffnungIntervall) * ((t - S.oeffnungBis) / (S.aufbauBis - S.oeffnungBis));
    else iv = S.aufbauIntervall + (S.minIntervall - S.aufbauIntervall) * Math.min(1, (t - S.aufbauBis) / Math.max(1, pre - S.aufbauBis));
    if (this.bossSpawned) return iv / S.bossRate;
    if (t >= pre) return iv / S.vorBossRate;
    return iv;
  }

  /** Ein Monster (bzw. seine Gruppe) aus dem aktuellen Kapitel-Pool. */
  spawnFromPool() {
    const pool = this.chapter.gegner.filter((g) => this.time >= (g.abSekunde ?? 0) && this.time <= (g.bisSekunde ?? Infinity));
    if (!pool.length) return;
    // Öffnungsphase: nur das schwächste (erste) Monster des Kapitels
    const g = this.time < this.B.wellen.strom.oeffnungBis ? pool[0] : weightedPick(pool.map((x) => [x, x.gewicht]), this.rng);
    const group = this.data.enemyIndex[g.id].gruppe || 1;
    const p = this.spawnPoint();
    for (let i = 0; i < group; i++) this.spawnEnemy(g.id, i ? { x: p.x + (this.rng() - 0.5) * 40, y: p.y + (this.rng() - 0.5) * 30 } : { x: p.x, y: p.y });
  }

  /** Elitegruppe: 3–5 Elitemonster aus einer Richtung, 2 s vorher Warnsymbol am Bildrand. */
  announceElite() {
    const E = this.B.wellen.elite;
    const pool = this.chapter.gegner.filter((g) => this.time + E.warnung >= (g.abSekunde ?? 0) && this.time <= (g.bisSekunde ?? Infinity));
    const g = pool[pool.length - 1] ?? this.chapter.gegner[0];
    const ang = this.chapter.spawn.modus === 'portale' ? this.chapter.spawn.portale[Math.floor(this.rng() * this.chapter.spawn.portale.length)].winkel : this.rng() * 360;
    const n = E.gruppe[0] + Math.floor(this.rng() * (E.gruppe[1] - E.gruppe[0] + 1));
    this.pendingElite = { id: g.id, ang, n, t: E.warnung };
    this.stats.elitewellen++;
    this.emit('eliteWarning', { winkel: ang, point: this.edgePoint(ang, 0.97) });
  }

  updateWaves(dt) {
    const W = this.B.wellen;
    // Monsterstrom
    this.spawnTimer = (this.spawnTimer ?? 0.5) - dt;
    while (this.spawnTimer <= 0) { this.spawnTimer += this.spawnInterval(); this.spawnFromPool(); }
    // Elitegruppen alle 45 s (erste bei 0:45), nicht mehr im Bosskampf
    if (!this.bossSpawned) {
      this.eliteTimer -= dt;
      if (this.eliteTimer <= W.elite.warnung && !this.pendingElite) this.announceElite();
    }
    if (this.pendingElite) {
      const pe = this.pendingElite;
      pe.t -= dt;
      if (pe.t <= 0) {
        for (let i = 0; i < pe.n; i++) {
          const p = this.edgePoint(pe.ang + (i - (pe.n - 1) / 2) * 3, this.A.spawnRand);
          this.spawnEnemy(pe.id, { elite: true, x: p.x, y: p.y });
        }
        this.emit('eliteWave');
        this.pendingElite = null;
        this.eliteTimer += W.elite.alleSekunden * this.mods.elitewelleIntervallMul;
      }
    }
    // 5 s vor dem Boss: Warnung (UI: roter Rand, Trommel, blinkender Balken)
    if (!this.bossWarned && !this.bossSpawned && this.time >= this.bossTime - W.boss.warnungSekunden) { this.bossWarned = true; this.emit('bossWarnung'); }
    if (!this.bossSpawned && this.time >= this.bossTime) {
      this.bossSpawned = true;
      this.bossStart = this.time;
      const e = this.spawnEnemy(this.chapter.boss);
      if (!this.headless) this.slowmo = W.boss.introSekunden * W.boss.introTempo; // Intro: 2 s bei 25 % Tempo
      this.emit('bossSpawned', { enemy: e });
      for (const r of this.relics('bossErscheint')) if (r.aktion.typ === 'verstaerken') this.buffs.trommel = { t: r.aktion.dauer, bonus: r.aktion.bonus };
    }
    if (this.boss && !this.boss.dead) this.updateBossProgress(dt);
    // Gefahren (z. B. Schneesturm)
    for (const h of this.hazards) {
      if (h.left > 0) { h.left -= dt; if (h.left <= 0) { this.blizzard = 0; this.emit('hazardEnd', { hazard: h }); } continue; }
      if (this.time >= h.next) {
        h.next += h.intervall;
        h.left = h.dauer;
        this.blizzard = h.dauer;
        this.blizzardRate = h.heldenLebenProSekunde;
        this.emit('hazard', { hazard: h });
      }
    }
    if (this.blizzard > 0) this.blizzard -= dt;
  }

  /** Boss-Abschnitte (Mastery-Bonus je erreichtem Abschnitt) und Wut nach 3 Minuten Bosskampf. */
  updateBossProgress() {
    const B = this.B.wellen.boss;
    const boss = this.boss;
    const reached = Math.floor((1 - boss.hp / boss.maxHp) * B.abschnitte + 1e-6);
    while ((this.bossSegments || 0) < Math.min(reached, B.abschnitte)) {
      this.bossSegments = (this.bossSegments || 0) + 1;
      const bonus = Math.max(1, Math.round(this.runMastery() * B.abschnittBonus));
      this.stats.bonusMastery += bonus;
      this.stats.bossAbschnitte = this.bossSegments;
      fx(this, { type: 'text', x: boss.x, y: boss.y - boss.px - 20, text: `+${bonus} Mastery`, color: '#7cc4ff', size: 22, life: 1.4 });
      this.emit('bossSegment', { nr: this.bossSegments, bonus });
    }
    const age = this.time - this.bossStart;
    const steps = age >= B.wutAbSekunden ? Math.floor((age - B.wutAbSekunden) / B.wutAlleSekunden) + 1 : 0;
    if (steps > (this.bossRage || 0)) {
      this.bossRage = steps;
      boss.damage *= 1 + B.wutSchadenPlus;
      this.emit('bossWarning', { text: 'Der Boss wird wütend! +10 % Schaden' });
    }
  }

  /** Bisher im Run verdiente Mastery (ohne Bonus-Quellen), für Boss-Abschnitte. */
  runMastery() {
    const packs = Object.values(this.stats.packsGeoeffnet).reduce((x, y) => x + y, 0);
    return masteryFor({ zeit: this.time, kills: this.stats.killWert, elitewellen: this.stats.elitewellen, sieg: false, kapitel: this.chapter.id, packs }, this.data, this.mods);
  }

  // =====================================================================
  // Boss-Mechaniken mit Vorwarnung
  // =====================================================================

  telegraph(t) {
    this.telegraphs.push({ ...t, max: t.time });
  }

  updateTelegraphs(dt) {
    for (const t of this.telegraphs) {
      t.time -= dt;
      if (t.follow && !t.follow.dead) { t.x = t.follow.x; t.y = t.follow.y; }
      if (t.time <= 0 && !t.done) { t.done = true; t.apply(); }
    }
    this.telegraphs = this.telegraphs.filter((t) => !t.done);
  }

  updateHammers(dt) {
    for (const h of this.hammers) {
      h.t += dt;
      const k = Math.min(1, h.t / h.flight);
      if (h.parried) {
        // fliegt zurück zum Boss
        const b = h.boss;
        h.x += (b.x - h.x) * Math.min(1, dt * 6); h.y += (b.y - h.y) * Math.min(1, dt * 6);
        if (Math.hypot(b.x - h.x, b.y - h.y) < 30) { h.done = true; if (!b.dead) damageEnemy(this, b, b.maxHp * 0.02, null, { aoe: true }); }
        continue;
      }
      h.x = h.fromX + (h.tx - h.fromX) * k;
      h.y = h.fromY + (h.ty - h.fromY) * k - Math.sin(k * Math.PI) * 260;
      h.parryable = h.flight - h.t <= h.window;
      if (k >= 1) {
        h.done = true;
        fx(this, { type: 'burst', x: h.tx, y: h.ty, r: h.r, color: '#ff7a2a', life: 0.4 });
        if (dist({ x: h.tx, y: h.ty }, this.tower) <= h.r + this.tower.r) this.damageTowerSafe(h.dmg);
        for (const u of this.units) if (!u.dead && dist(u, { x: h.tx, y: h.ty }) <= h.r) damageUnit(this, u, h.dmg);
        this.emit('shake', { power: 10 });
      }
    }
    this.hammers = this.hammers.filter((h) => !h.done);
  }

  damageTowerSafe(amount) {
    damageTower(this, amount, null, true);
  }

  // =====================================================================
  // Runenkreis (Cursor)
  // =====================================================================

  cursorStats() {
    const C = this.B.cursor;
    return {
      radius: C.radius * this.mods.cursorRadiusMul,
      tick: C.tickAbstand * Math.max(0.3, this.mods.cursorTickMul),
      damage: (C.schaden + this.mods.cursorSchaden) * this.mods.cursorSchadenMul,
      packMul: this.mods.cursorPackSchadenMul,
      crit: this.mods.cursorKrit,
    };
  }

  setCursor(x, y, active) {
    this.cursor.x = x; this.cursor.y = y; this.cursor.active = active;
  }

  updateCursor(dt) {
    const cur = this.cursor;
    const cs = this.cursorStats();
    cur.angle += dt * 1.6;
    cur.pulse = Math.max(0, cur.pulse - dt);
    cur.hit = Math.max(0, (cur.hit || 0) - dt);
    const circles = [{ x: cur.x, y: cur.y, r: cs.radius, f: 1 }];
    if (this.mods.flags.zwillingsrune) {
      const d = cs.radius * 1.7;
      circles.push({ x: cur.x + Math.cos(cur.angle * 1.5) * d, y: cur.y + Math.sin(cur.angle * 1.5) * d, r: cs.radius * 0.6, f: 0.4 });
    }
    cur.circles = circles;
    const inside = (c, o, extra = 0) => Math.hypot(o.x - c.x, o.y - c.y) <= c.r + extra;
    const body = (e) => ({ x: e.x, y: e.y - e.px * 0.45 - (e.fliegt ? 30 : 0) }); // Körpermitte statt Fußpunkt
    const packAt = (p) => ({ x: p.x, y: p.y - PACK_MID });
    cur.busy = cur.active && circles.some((c) => this.enemies.some((e) => !e.dead && inside(c, body(e), e.r)) || this.packs.some((p) => p.landed && !p.opened && inside(c, packAt(p), PACK_HIT)));
    if (!cur.active) return;
    cur.tick -= dt;
    if (cur.tick > 0) return;
    cur.tick = cs.tick;
    cur.pulse = 0.15;
    let hitSomething = false;
    for (const c of circles) {
      const crit = cs.crit > 0 && this.rng() < cs.crit;
      const dmg = cs.damage * c.f * (crit ? 2 : 1);
      for (const e of this.enemies) {
        if (e.dead || !inside(c, body(e), e.r)) continue;
        hitSomething = true;
        damageEnemy(this, e, dmg, this.B.cursor.schadensTyp, { cursor: true, aoe: true, crit });
        // Relikt Funkennadel: Cursor-Treffer springen mit Chance als Kettenblitz über
        const spark = this.relicValue('kettenblitz', 'chance');
        if (spark > 0 && this.rng() < spark) this.chainLightning(e, this.relicValue('kettenblitz', 'ziele') || 3, dmg * (this.relicValue('kettenblitz', 'schadenMul') || 1));
        if (this.mods.flags.glutkreis) applyStatus(this, e, { typ: 'brennen', schadenProSekunde: dmg * 0.6, dauer: 3 });
        // Schwachpunkt (Medaillon) beim Schrei
        if (e.boss?.scream) e.boss.scream.hits++;
      }
      for (const p of this.packs) if (p.landed && !p.opened && inside(c, packAt(p), PACK_HIT)) { hitSomething = true; this.damagePack(p, dmg * cs.packMul * this.relicMul('cursorPackSchadenMul')); }
    }
    if (hitSomething) cur.hit = 0.12; // Kreis blitzt kurz heller auf
  }

  /** Kettenblitz von einem Gegner zu den nächsten (Relikt Funkennadel). */
  chainLightning(from, n, dmg) {
    let cur = from;
    const hit = new Set([from]);
    for (let i = 0; i < n; i++) {
      const next = this.enemies.filter((e) => !e.dead && !hit.has(e)).sort((a, b) => dist(a, cur) - dist(b, cur))[0];
      if (!next || dist(next, cur) > 220) break;
      fx(this, { type: 'bolt', x1: cur.x, y1: cur.y - 10, x2: next.x, y2: next.y - 10, color: '#a6e3ff', life: 0.2 });
      damageEnemy(this, next, dmg, 'magic', { aoe: true, cursor: true });
      hit.add(next);
      cur = next;
    }
    this.emit('relicTriggered', { id: this.save.relics.equipped.find((id) => this.data.relicIndex[id]?.aktion.typ === 'kettenblitz') });
  }

  /** Klick/Tipp auf das Spielfeld: Tomes auslösen, Hämmer parieren. Gibt zurück, was getroffen wurde. */
  click(x, y) {
    for (const h of this.hammers) {
      if (h.parried || Math.hypot(h.x - x, h.y - y) > 70) continue;
      if (h.parryable) {
        h.parried = true;
        fx(this, { type: 'text', x: h.x, y: h.y - 40, text: 'Pariert!', color: '#FFD24A', size: 26 });
        this.emit('sound', 'parry');
        return 'hammer';
      }
      fx(this, { type: 'text', x: h.x, y: h.y - 40, text: 'Zu früh!', color: '#b3a990', size: 18 });
      return 'early';
    }
    const t = this.tomes.find((o) => Math.hypot(o.x - x, o.y - 12 - y) <= 34);
    if (t) { this.useTome(t); return 'tome'; }
    return null;
  }

  /** Objekt unter dem Cursor (für das Info-Fenster). */
  thingAt(x, y) {
    let best = null, bd = 30;
    for (const u of this.units) { if (u.dead) continue; const d = Math.hypot(u.x - x, u.y - 12 - y); if (d < bd) { bd = d; best = u; } }
    for (const e of this.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.y - e.px * 0.35 - y); if (d < Math.max(bd, e.r + 10)) { bd = d; best = e; } }
    return best;
  }

  // =====================================================================
  // Turm, Gebäude, Relikte
  // =====================================================================

  updateTower(dt) {
    const t = this.tower;
    t.hitFlash = Math.max(0, t.hitFlash - dt);
    if (this.mods.turmRegen > 0) t.hp = Math.min(t.maxHp, t.hp + t.maxHp * this.mods.turmRegen * dt);
    const lvl = this.mods.turmSchuetze;
    if (lvl > 0) {
      t.shotTimer -= dt;
      if (t.shotTimer <= 0) {
        let target = null, bd = 520;
        for (const e of this.enemies) { if (e.dead) continue; const d = dist(e, t); if (d < bd) { bd = d; target = e; } }
        if (target) {
          this.projectiles.push({ x: t.x, y: t.y - 76, target, tx: target.x, ty: target.y, speed: 900, damage: 6 * (1 + 0.6 * (lvl - 1)) * this.chapter.wellen.lebenMul,
            type: 'physical', source: null, bounces: 0, hit: new Set(), color: '#F4EBD9', isTower: true });
          t.shotTimer = 1.3 * (1 - 0.15 * (lvl - 1));
        } else t.shotTimer = 0.2;
      }
    }
    if (this.mods.flags.blitzableiter) {
      t.boltTimer -= dt;
      if (t.boltTimer <= 0) {
        t.boltTimer = 5; // Sturmspitze: Blitz alle 5 s
        const near = this.enemies.filter((e) => !e.dead && dist(e, t) < 450);
        if (near.length) {
          const e = near[Math.floor(this.rng() * near.length)];
          fx(this, { type: 'bolt', x1: t.x, y1: t.y - 80, x2: e.x, y2: e.y, color: '#fff6a0', life: 0.25 });
          damageEnemy(this, e, 40 * this.chapter.wellen.lebenMul, 'magic', { aoe: true });
          this.emit('sound', 'bolt');
        }
      }
    }
  }

  updateBuildings(dt) {
    for (const b of this.buildings) {
      b.timer -= dt;
      if (b.timer > 0) continue;
      b.timer = b.interval;
      const crate = b.def.kiste && this.rng() < b.crateChance;
      this.launchPack(crate ? b.def.kiste : b.def.pack, b);
      this.emit('sound', 'building');
    }
  }

  relics(trigger) {
    const list = this.save.relics.equipped.map((id) => this.data.relicIndex[id]).filter((r) => r && r.ausloeser === trigger);
    for (const r of list) this.emit('relicTriggered', { id: r.id }); // Symbol in der Relikt-Spalte blinkt
    return list;
  }

  relicValue(typ, key) {
    let s = 0;
    for (const id of this.save.relics.equipped) { const r = this.data.relicIndex[id]; if (r?.aktion.typ === typ) s += r.aktion[key] || 0; }
    return s;
  }

  relicMul() { return 1; } // passive Relikt-Multiplikatoren stecken bereits in mods (computeMods)

  // =====================================================================
  // Hauptschleife
  // =====================================================================

  update(dt) {
    if (!this.over) {
      let left = dt;
      while (left > 1e-6 && !this.over) {
        const step = Math.min(SIM_STEP, left);
        this.step(step);
        left -= step;
      }
    } else this.endAge += dt;
    for (const f of this.effects) f.age += dt;
    this.effects = this.effects.filter((f) => f.age < f.life);
    for (const u of this.units) { u.animTime = (u.animTime || 0) + dt; if (u.slowT > 0) { u.slowT -= dt; if (u.slowT <= 0) u.slow = 1; } }
    for (const e of this.enemies) e.animTime += dt;
    for (const c of this.corpses) c.deathAge += dt;
    this.corpses = this.corpses.filter((c) => c.deathAge < 0.6);
    for (const t of this.tomes) t.bob += dt;
    this.slowmo = Math.max(0, this.slowmo - dt);
  }

  step(dt) {
    if (this.state === 'countdown') {
      this.countdown -= dt;
      this.updateCursor(dt);
      if (this.countdown <= 0) {
        this.state = 'fight';
        // Alle gekauften Packs regnen aufs Feld
        // Einzelkarten ("karte:<id>") landen als bereits aufgedeckte Karte und werden sofort zur Einheit bzw. zum Tome
        this.bag.forEach((id, i) => { // alle gekauften Angebote fliegen gleichzeitig los (Flugzeit 0,6 s)
          if (!String(id).startsWith('karte:')) { this.launchPack(id, this.tower, i * 0.08); return; }
          const [, card, foil] = id.split(':');
          this.launchCard(card, this.tower, i * 0.08, foil === 'foil');
        });
        this.emit('fightStart');
        // Bollwerk: Schild mit 50 % des Turmlebens zu Kampfbeginn
        if (this.mods.flags.bollwerk) { this.tower.maxShield = this.tower.maxHp * 0.5; this.tower.shield = this.tower.maxShield; }
        for (const r of this.relics('runStart')) if (r.aktion.typ === 'verstaerken') this.buffs.trommel = { t: r.aktion.dauer, bonus: r.aktion.bonus };
      }
      return;
    }
    this.time += dt;
    this.updateWaves(dt);
    this.updatePacks(dt);
    this.updateCards(dt);
    this.updateCursor(dt);
    this.updateTomeEffects(dt);
    this.updateTelegraphs(dt);
    this.updateHammers(dt);
    this.updateBuildings(dt);
    this.updateTower(dt);
    updateUnits(this, dt);
    updateProjectiles(this, dt);
    updateZones(this, dt);
    updateEnemies(this, dt);
    if (this.enemies.some((e) => e.dead)) {
      if (!this.headless) for (const e of this.enemies) if (e.dead && !e.fled) { e.deathAge = 0; this.corpses.push(e); }
      this.enemies = this.enemies.filter((e) => !e.dead);
    }
    this.units = this.units.filter((u) => !u.dead);
    this.packs = this.packs.filter((p) => !p.opened);
  }

  onBossKilled(e) {
    fx(this, { type: 'rays', x: e.x, y: e.y, life: 2 });
    fx(this, { type: 'goldrain', x: 0, y: 0, life: 2.2 });
    if (!this.headless) for (const o of this.enemies) if (!o.dead) { o.dead = true; o.deathAge = 0; this.corpses.push(o); }
    this.enemies = [];
    this.finish(true);
  }

  /** Run beenden (Sieg, Niederlage oder Aufgeben). */
  finish(victory) {
    if (this.over) return;
    this.over = true;
    this.endAge = 0;
    if (!victory) fx(this, { type: 'towerfall', x: this.tower.x, y: this.tower.y, life: 1.6 });
    // Beste Einheit: meister Schaden
    const all = [...this.units, ...this.corpses.filter((c) => c.kind === 'unit')];
    const best = all.filter((u) => !u.summoned).sort((a, b) => (b.damage || 0) - (a.damage || 0))[0];
    this.result = {
      sieg: victory, kapitel: this.chapter.id, boss: this.chapter.boss, zeit: this.time,
      kills: this.stats.kills, killWert: this.stats.killWert, bossAbschnitte: this.stats.bossAbschnitte,
      muenzen: Math.max(0, this.coins), bonusMastery: this.stats.bonusMastery, foilStaub: this.stats.foilStaub, schimmer: this.stats.schimmer, ersteShinys: this.stats.ersteShinys,
      killsNachArt: this.stats.killsNachArt, foilMonster: this.stats.foilMonster, elitewellen: this.stats.elitewellen,
      packsGeoeffnet: this.stats.packsGeoeffnet, gezogen: this.stats.gezogen, neueKarten: this.stats.neueKarten,
      foils: this.stats.foils, grenzgaenger: this.stats.grenzgaenger, tomesGenutzt: this.stats.tomesGenutzt, entwicklungen: this.stats.entwicklungen,
      besteEinheit: best ? { id: best.id, name: best.def.name, schaden: Math.round(best.damage || 0), kills: best.kills, foil: best.foil } : null,
    };
    this.emit('runOver', this.result);
  }
}

export { UNIT_R };

