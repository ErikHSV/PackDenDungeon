// Ein Run in der Arena. Kennt kein DOM – Darstellung und Sound hängen sich über `events` an.
import { dist, weightedPick } from './util.js';
import { drawCard, grenzgaengerChance, buildUnitDef } from './cards.js';
import { newStatus, fx, damageEnemy, applyStatus, damageUnit, damageTower } from './combat.js';
import { updateUnits, updateProjectiles, updateZones, UNIT_R } from './units.js';
import { updateEnemies } from './enemies.js';

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
    this.waveIndex = 0;
    this.waveTimer = 1.5;
    this.spawnQueue = [];
    this.eliteTimer = this.B.wellen.elitewelleAlleSekunden * mods.elitewelleIntervallMul;
    this.nextIsElite = false;
    this.bossTime = this.chapter.bossNachSekunden * mods.bossZeitMul;
    this.bossSpawned = false;
    this.boss = null;
    this.hazards = this.chapter.gefahren.map((h) => ({ ...h, next: h.abSekunde, left: 0 }));

    // Gebäude aus der Sternenkarte
    this.buildings = Object.entries(mods.gebaeude).filter(([, lvl]) => lvl > 0).map(([id, lvl]) => {
      const def = data.buildingIndex[id];
      const p = this.edgePoint(def.position.winkel, this.A.gebaeudeRing);
      const stufe = def.stufen[Math.min(def.stufen.length - 1, lvl - 1)];
      return { id, def, level: lvl, x: p.x, y: p.y, interval: stufe.intervall, crateChance: stufe.kistenChance, timer: stufe.intervall * 0.5 };
    });

    this.stats = { kills: 0, muenzen: 0, kristalle: 0, foilStaub: 0, packsGeoeffnet: {}, gezogen: {}, neueKarten: [], foils: 0, grenzgaenger: 0, tomesGenutzt: 0, entwicklungen: 0, killsNachArt: {}, foilMonster: 0, elitewellen: 0 };
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
  launchCard(cardId, from = this.tower, delay = 0) {
    if (!this.data.cardIndex[cardId]) return;
    // Gekaufte Helden sammeln sich nah am Turmfuß
    const a = this.rng() * Math.PI * 2, d = 70 + this.rng() * 60;
    const land = { x: this.tower.x + Math.cos(a) * d, y: this.tower.y + 20 + Math.abs(Math.sin(a)) * d * 0.6 };
    this.cards.push({ id: cardId, foil: false, x: from.x, y: from.y - 60, sx: from.x, sy: from.y - 60, tx: land.x, ty: land.y, t: -delay, dur: this.headless ? 0 : 0.8, shop: true });
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
    S.kristalle += def.kristalle;
    fx(this, { type: 'flash', x: p.x, y: p.y - 30, r: 90, color: '#ffffff', life: 0.35 });
    this.emit('packOpened', { pack: p });
    const count = def.kartenProPack + this.mods.kartenProPack;
    const foilChance = (this.B.karten.foilChance + this.mods.foilChance) * this.mods.foilChanceMul;
    const grenzChance = grenzgaengerChance(this.data, this.sessionMinutes + this.time / 60, this.mods.grenzgaengerChance);
    for (let i = 0; i < count; i++) {
      const card = drawCard(def, this.data, this.rng, { foilChance, grenzChance });
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
    got[c.foil ? 'foil' : 'normal']++;
    if (c.foil) { S.foils++; S.foilStaub += this.B.belohnungen.foilStaubProFoilKarte; this.emit('foil', { card: c }); }
    if (def.rarity === 'grenzgaenger') S.grenzgaenger++;
    if (rar.lichtblitz) { fx(this, { type: 'flash', x: c.tx, y: c.ty - 30, r: 160, color: rar.farbe, life: 0.5 }); this.emit('rareCard', { card: c, rarity: def.rarity }); }
    if (rar.zeitlupe && !this.headless) this.slowmo = this.B.run.seltenZeitlupe;
    // Neu entdeckte Karte: Präsentation (UI pausiert)
    const known = (this.save.collection[c.id]?.normal || 0) + (this.save.collection[c.id]?.foil || 0) > 0;
    if (def.rarity === 'grenzgaenger') this.emit('grenzgaenger', { card: c });
    if (!known && !this.seenThisRun.has(c.id)) {
      S.neueKarten.push(c.id);
      S.kristalle += this.B.belohnungen.kristalleNeueKarte;
      this.emit('newCard', { id: c.id, foil: c.foil });
    }
    this.seenThisRun.add(c.id);

    if (this.data.cardIndex[c.id].art === 'tome') {
      if (this.mods.tomesErlaubt === false) { S.kristalle += 1; fx(this, { type: 'text', x: c.tx, y: c.ty - 40, text: '+1 Kristall', color: '#c58cff', size: 18 }); return; }
      this.spawnTome(c.id, c.tx, c.ty);
      if (this.rng() < this.mods.tomeZweimalChance) this.spawnTome(c.id, c.tx + 50, c.ty + 10);
      return;
    }
    if (this.mods.erlaubteKI && !this.mods.erlaubteKI.includes(def.ki)) {
      this.coins += 3; fx(this, { type: 'text', x: c.tx, y: c.ty - 40, text: '+3 Münzen', color: '#FFD24A', size: 18 }); return;
    }
    this.spawnUnit(c.id, c.tx, c.ty, { foil: c.foil });
  }

  // =====================================================================
  // Einheiten
  // =====================================================================

  spawnUnit(id, x, y, { foil = false, life = null } = {}) {
    const base = this.data.unitIndex[id];
    const def = buildUnitDef(base, this.mods);
    const F = this.B.karten.foil;
    const a = this.rng() * Math.PI * 2;
    const u = {
      uid: this.uid++, kind: 'unit', id, def, x, y, foil, life, summoned: life != null,
      maxHp: def.werte.leben * this.mods.heldenLebenMul * (foil ? F.lebenMul * this.mods.foilStaerkeMul : 1), hp: 0, geist: !!def.geist,
      range: def.werte.reichweite * (foil ? F.reichweiteMul : 1),
      atkTimer: 0.3 + this.rng() * 0.3, timers: {}, kills: 0, blocks: 0, damage: 0, facing: 1, evolved: false,
      homeDx: Math.cos(a) * 110, homeDy: Math.sin(a) * 70, animTime: this.rng() * 2, spawnDelay: 0.15,
    };
    u.hp = u.maxHp;
    this.units.push(u);
    fx(this, { type: 'ring', x, y, r: 50, color: this.data.rarities[base.rarity].farbe, life: 0.45 });
    return u;
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
    u.maxHp = u.def.werte.leben * this.mods.heldenLebenMul * (u.foil ? this.B.karten.foil.lebenMul : 1);
    u.hp = ev.volleHeilung ? u.maxHp : ratio * u.maxHp;
    u.range = u.def.werte.reichweite * (u.foil ? this.B.karten.foil.reichweiteMul : 1);
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
    const s = u.def.beimTod?.beschwoeren;
    if (s && !expired) for (let i = 0; i < s.anzahl; i++) this.spawnUnit(s.einheit, u.x + i * 20, u.y, { life: s.dauer ?? 10 });
    this.emit('unitDied', { unit: u });
  }

  // =====================================================================
  // Tomes
  // =====================================================================

  spawnTome(id, x, y) {
    this.tomes.push({ uid: this.uid++, id, def: this.data.tomeIndex[id], x, y, bob: this.rng() * 6, rot: (this.rng() - 0.5) * 0.52 });
  }

  /** Klick auf ein Buch löst den Zauber aus (einmalig). */
  useTome(t) {
    this.tomes = this.tomes.filter((x) => x !== t);
    this.stats.tomesGenutzt++;
    const times = this.rng() < this.mods.tomeDoppeltChance ? 2 : 1;
    for (let i = 0; i < times; i++) this.castTome(t.def, t);
    fx(this, { type: 'flash', x: t.x, y: t.y - 40, r: 120, color: this.data.rarities[t.def.rarity].farbe, life: 0.4 });
    if (times > 1) fx(this, { type: 'text', x: t.x, y: t.y - 90, text: 'Doppelt!', color: '#3ED6C4', size: 22 });
    this.emit('tomeUsed', { tome: t.def });
  }

  castTome(def, at) {
    const e = def.effekt;
    const mul = this.mods.tomeWirkungMul;
    const dur = this.mods.tomeDauerMul * mul;
    switch (e.typ) {
      case 'geisterFreisetzen': {
        const n = Math.max(e.mindestens ?? 1, at.souls || 0);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.spawnUnit(e.einheit, at.x + Math.cos(a) * 70, at.y + Math.sin(a) * 40, { life: e.dauer * dur });
        }
        fx(this, { type: 'text', x: at.x, y: at.y - 90, text: `${n} Geisterkrieger!`, color: '#a6e3ff', size: 22 });
        break;
      }
      case 'riesenwuchs':
        this.buffs.riesen = { t: e.dauer * dur, schadenMul: e.schadenMul, reichweiteMul: e.reichweiteMul, lebenMul: e.lebenMul, groesseMul: e.groesseMul };
        for (const u of this.units) if (!u.dead && !u.giant) { u.giant = true; u.maxHp *= e.lebenMul; u.hp *= e.lebenMul; }
        break;
      case 'hagel':
        this.hail = { t: e.dauer * dur, rate: e.einschlaegeProSekunde, dmg: e.schaden * mul * this.chapter.wellen.lebenMul, r: e.radius, acc: 0, type: e.schadensTyp };
        break;
      case 'beschwoeren':
        for (let i = 0; i < e.anzahl; i++) {
          const a = (i / e.anzahl) * Math.PI * 2;
          this.spawnUnit(e.einheit, this.tower.x + Math.cos(a) * 120, this.tower.y + Math.sin(a) * 75, { life: e.dauer * dur });
        }
        break;
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
    const wave = opts.wave ?? this.waveIndex;
    const ch = this.chapter.wellen;
    const elite = !!opts.elite && !base.boss;
    const E = W.elite;
    // Bosse erscheinen etwas weiter innen, damit ihr großes Sprite ganz sichtbar bleibt
    const p = opts.x != null ? { x: opts.x, y: opts.y } : base.boss ? this.edgePoint(this.rng() * 360, 0.72) : this.spawnPoint();
    const scale = base.boss ? 1 : Math.pow(W.lebenWachstum, wave);
    const P = this.mods.prestige;
    const G = this.data.balance.gesucht;
    const FM = W.foilMonster;
    const foil = !base.boss ? (opts.foil ?? this.rng() < FM.chance + this.mods.foilMonsterChance) : this.mods.gesucht;
    const hp = base.leben * ch.lebenMul * scale * this.mods.gegnerLebenMul * (elite ? E.lebenMul : 1) * (P?.lebenMul ?? 1)
      * (foil ? (base.boss ? G.bossLebenMul : FM.lebenMul) : 1);
    // Darstellungsgröße (Abschnitt 3): kleine Massenmonster, Elite doppelt, Bosse 64 px
    const px = base.boss ? 64 : elite ? base.groesse * 2 : base.groesse;
    const e = {
      uid: this.uid++, kind: 'enemy', id, def: base.boss ? JSON.parse(JSON.stringify(base)) : base, name: base.name,
      x: p.x, y: p.y, wave, elite, fliegt: base.fliegt, frontSchild: !!base.eigenschaften?.frontSchild,
      r: Math.max(9, Math.round(px * 0.4)), px, hp, maxHp: hp, speed: base.tempo * (0.9 + this.rng() * 0.2),
      ruestung: base.ruestung, magieResistenz: base.magieResistenz, immun: base.immun,
      damage: base.schaden * ch.schadenMul * Math.pow(W.schadenWachstum, wave) * (elite ? E.schadenMul : 1) * (P?.schadenMul ?? 1) * this.mods.gegnerSchadenMul * (foil && base.boss ? G.bossSchadenMul : 1),
      muenzen: base.muenzen * (elite ? E.muenzenMul : 1) * (foil && !base.boss ? FM.muenzenMul : 1), foil, atkTimer: 0.4, st: newStatus(), facing: 1, spawnAge: 0, animTime: this.rng() * 2,
      boss: base.boss ? { timers: {}, phase: 0, scream: null } : null,
    };
    if (base.boss) { e.isBoss = true; this.boss = e; }
    this.enemies.push(e);
    return e;
  }

  queueWave() {
    const W = this.B.wellen;
    const idx = this.waveIndex++;
    const elite = this.nextIsElite;
    this.nextIsElite = false;
    let count = Math.min(W.maxAnzahl, W.grundAnzahl + Math.floor(W.anzahlProWelle * idx));
    if (this.bossSpawned) count = Math.ceil(count / 2);
    const pool = this.chapter.gegner.filter((g) => this.time >= (g.abSekunde ?? 0) && this.time <= (g.bisSekunde ?? Infinity));
    let t = 0;
    while (count > 0) {
      const g = weightedPick(pool.map((x) => [x, x.gewicht]), this.rng);
      const group = this.data.enemyIndex[g.id].gruppe || 1;
      for (let i = 0; i < group && count > 0; i++, count--) {
        this.spawnQueue.push({ id: g.id, at: t + i * 0.15, elite: elite && this.rng() < 0.45, wave: idx });
      }
      t += W.intervall / Math.max(4, W.grundAnzahl + idx);
    }
    if (elite) { this.stats.elitewellen++; this.emit('eliteWave'); }
  }

  updateWaves(dt) {
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) { this.waveTimer += this.B.wellen.intervall; this.queueWave(); }
    this.eliteTimer -= dt;
    if (this.eliteTimer <= 0) { this.eliteTimer += this.B.wellen.elitewelleAlleSekunden * this.mods.elitewelleIntervallMul; this.nextIsElite = true; this.waveTimer = Math.min(this.waveTimer, 0.5); }
    for (const s of this.spawnQueue) { s.at -= dt; if (s.at <= 0) { this.spawnEnemy(s.id, { elite: s.elite, wave: s.wave }); s.done = true; } }
    this.spawnQueue = this.spawnQueue.filter((s) => !s.done);
    if (!this.bossSpawned && this.time >= this.bossTime) {
      this.bossSpawned = true;
      const e = this.spawnEnemy(this.chapter.boss);
      this.emit('bossSpawned', { enemy: e });
      for (const r of this.relics('bossErscheint')) if (r.aktion.typ === 'verstaerken') this.buffs.trommel = { t: r.aktion.dauer, bonus: r.aktion.bonus };
    }
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
        if (this.mods.flags.glutkreis) applyStatus(this, e, { typ: 'brennen', schadenProSekunde: dmg * 0.6, dauer: 3 });
        // Schwachpunkt (Medaillon) beim Schrei
        if (e.boss?.scream) e.boss.scream.hits++;
      }
      for (const p of this.packs) if (p.landed && !p.opened && inside(c, packAt(p), PACK_HIT)) { hitSomething = true; this.damagePack(p, dmg * cs.packMul * this.relicMul('cursorPackSchadenMul')); }
    }
    if (hitSomething) cur.hit = 0.12; // Kreis blitzt kurz heller auf
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
        t.boltTimer = 6;
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
        this.bag.forEach((id, i) => (String(id).startsWith('karte:') ? this.launchCard(id.slice(6), this.tower, i * 0.08) : this.launchPack(id, this.tower, i * 0.08)));
        this.emit('fightStart');
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
      kills: this.stats.kills, muenzen: this.coins, kristalle: this.stats.kristalle, foilStaub: this.stats.foilStaub,
      killsNachArt: this.stats.killsNachArt, foilMonster: this.stats.foilMonster, elitewellen: this.stats.elitewellen,
      packsGeoeffnet: this.stats.packsGeoeffnet, gezogen: this.stats.gezogen, neueKarten: this.stats.neueKarten,
      foils: this.stats.foils, grenzgaenger: this.stats.grenzgaenger, tomesGenutzt: this.stats.tomesGenutzt, entwicklungen: this.stats.entwicklungen,
      besteEinheit: best ? { id: best.id, name: best.def.name, schaden: Math.round(best.damage || 0), kills: best.kills, foil: best.foil } : null,
    };
    this.emit('runOver', this.result);
  }
}

export { UNIT_R };

