// Reiter UPGRADE (11, 11.6, 14.2.5): Skill-Tree und Foil-Baum als Schaltplan.
// - Skill-Tree über dem abgedunkelten Bild der eigenen Basis, gelbe rechtwinklige Leitungen, Mastery.
// - Foil-Baum (Regenbogen-Kristall am rechten Rand): dunkles Feld mit Regenbogen-Schlieren, Regenbogen-Leitungen
//   und -Ränder, gekaufte Knoten mit wanderndem Shiny-Glanz, Foil-Staub. Bleibt bei Akt-Wechseln erhalten.
// Knotentypen: Upgrade, Freischaltung, Relikt, Quest (kostenlos, wird durch Spielen erfüllt), Tor (Akt-Wechsel).
import { $, escapeHtml, show, stage, confirmDialog, countTo } from './dom.js';
import {
  treeMap, treeIndex, treeLevel, nodeVisible, nodePreviewable, nodeCost, nodeBlocker, buyNode, describeNodeEffect, computeMods,
  questProgress, questChapters, claimQuestNode, describeReward, changeAct, foilTreeUnlocked, prestigeAvailable, chapterUnlocked,
} from '../core/meta.js';
import { hash } from '../render/pixel.js';
import { play } from '../audio.js';
import { showUnlocks } from './reveal.js';

const NODE = 48;
const ZMIN = 0.55, ZMAX = 1.5;
const HOLD_INTERVAL = 150;
const LINE = '#C8C24A', LINE_ON = '#FFD24A', FRAME = '#C8C24A';
const TYPE_NAME = {
  klein: 'Upgrade', gross: 'Großes Upgrade', schluessel: 'Schlüssel-Upgrade', freischalt: 'Freischaltung', start: 'Ursprung',
  relikt: 'Relikt-Knoten', quest: 'Quest', tor: 'Tor',
};
const rainbow = (h, l = 62, a = 1) => `hsla(${((h % 360) + 360) % 360},90%,${l}%,${a})`;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtNum = (n) => n.toLocaleString('de-DE');

export class UpgradeTree {
  constructor(game) {
    this.game = game;
    this.canvas = $('#tree-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.kind = 'skill';
    this.cams = { skill: { x: 0, y: 0, zoom: 1, centered: false }, foil: { x: 0, y: 0, zoom: 1, centered: false } };
    this.anim = {};
    this.particles = [];
    this.hover = null;
    this.tapped = null;
    this.active = false;
    this.t0 = performance.now();
    this.loop = this.loop.bind(this);
    this.bind();
  }

  get data() { return this.game.data; }
  get save() { return this.game.save; }
  get map() { return treeMap(this.kind, this.game.data); }
  get index() { return treeIndex(this.kind, this.game.data); }
  get cam() { return this.cams.skill; } // beide Bäume liegen auf einer gemeinsamen Fläche
  get foil() { return this.kind === 'foil'; }
  level(id) { return treeLevel(this.kind, this.save, id); }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(200, Math.round(r.width / stage.scale));
    this.H = Math.max(200, Math.round(r.height / stage.scale));
    if (this.canvas.width !== this.W || this.canvas.height !== this.H) { this.canvas.width = this.W; this.canvas.height = this.H; }
  }

  open() {
    this.active = true;
    this.resize();
    this.kind = 'skill';
    if (!this.cam.centered) {
      this.cam.centered = true;
      this.cam.zoom = 0.8; // hochkanter Baum: etwas kleiner, damit beide Seiten sichtbar sind
      this.centerOn(this.data.starIndex[this.save.lastBought] || this.data.starIndex[this.data.starmap.start]);
    }
    this.updateCurrency(false);
    this.updateNav();
    show('#tree-info', false);
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    if (!this.save.tutorial.starmapOpened) {
      const n = this.data.starIndex.q_holz2 ?? this.map.knoten.find((k) => k.ast === 'cursor');
      if (n) { this.save.tutorial.starmapOpened = true; this.game.persist(); this.hint = { node: n, until: performance.now() + 7000, text: 'Quests erfüllst du durch Spielen!' }; }
    }
  }

  close() { this.active = false; this.hint = null; show('#tree-info', false); cancelAnimationFrame(this.raf); }

  /** Regenbogen-Knopf: Kamera zum Schimmer-Baum (rechts neben dem Skill-Tree) und wieder zurück. */
  toggleKind() {
    if (!foilTreeUnlocked(this.save)) return;
    this.save.ui.foilTreeSeen = true;
    this.game.persist();
    const f = this.data.foilIndex[this.data.foiltree.start].position;
    const nearFoil = Math.abs(this.cam.x - f.x) < this.W / this.cam.zoom * 0.6;
    const target = nearFoil ? (this.data.starIndex[this.save.lastBought] || this.data.starIndex[this.data.starmap.start]).position : f;
    this.cam.x = target.x; this.cam.y = target.y; this.clampCam();
    const w = $('#tree-wipe');
    w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
    this.hover = null; this.tapped = null; this.hint = null;
    show('#tree-info', false);
    this.updateNav();
    play(nearFoil ? 'click' : 'foil');
  }

  // ---------------------------------------------------------------------
  // Kamera
  // ---------------------------------------------------------------------

  centerOn(node) { this.cam.x = node.position.x; this.cam.y = node.position.y; this.clampCam(); }

  clampCam() {
    const G = this.data.treeGroesse ?? this.data.starmap.groesse;
    const W = foilTreeUnlocked(this.save) ? G.breite : this.data.starmap.groesse.breite, H = G.hoehe;
    const hw = this.W / 2 / this.cam.zoom, hh = this.H / 2 / this.cam.zoom;
    this.cam.x = W <= hw * 2 ? W / 2 : Math.max(hw, Math.min(W - hw, this.cam.x));
    this.cam.y = H <= hh * 2 ? H / 2 : Math.max(hh, Math.min(H - hh, this.cam.y));
  }

  toScreen(x, y) { return { x: (x - this.cam.x) * this.cam.zoom + this.W / 2, y: (y - this.cam.y) * this.cam.zoom + this.H / 2 }; }
  toWorld(sx, sy) { return { x: (sx - this.W / 2) / this.cam.zoom + this.cam.x, y: (sy - this.H / 2) / this.cam.zoom + this.cam.y }; }

  setZoom(z, anchor = { x: this.W / 2, y: this.H / 2 }) {
    const before = this.toWorld(anchor.x, anchor.y);
    this.cam.zoom = Math.max(ZMIN, Math.min(ZMAX, z));
    const after = this.toWorld(anchor.x, anchor.y);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }

  local(ev) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / stage.scale, y: (ev.clientY - r.top) / stage.scale };
  }

  // ---------------------------------------------------------------------
  // Zustände
  // ---------------------------------------------------------------------

  visible(node) { return nodeVisible(this.kind, node, this.save, this.data); }

  /** Grau angezeigt: gesperrt, aber neben einem sichtbaren Knoten. */
  preview(node) {
    if (this.visible(node) || !nodePreviewable(this.kind, node, this.save)) return false;
    return node.verbindungen.some((id) => { const m = this.index[id]; return m && this.visible(m); });
  }

  state(node) {
    if (this.preview(node)) return 'locked';
    const lvl = this.level(node.id);
    if (node.typ === 'start') return 'max';
    if (node.typ === 'quest') return lvl > 0 ? 'max' : questProgress(node, this.data, this.save).done ? 'claimable' : 'quest';
    if (node.typ === 'tor') return 'tor';
    if (lvl >= node.maxStufe) return 'max';
    const blocked = nodeBlocker(this.kind, node, this.save, this.data);
    if (lvl > 0) return blocked ? 'bought' : 'boughtAffordable';
    return blocked ? 'expensive' : 'affordable';
  }

  nodeAt(sx, sy) {
    const w = this.toWorld(sx, sy);
    const r = NODE / 2 + 6;
    const kinds = foilTreeUnlocked(this.save) ? ['skill', 'foil'] : ['skill'];
    for (const kind of kinds) {
      this.kind = kind;
      const n = this.map.knoten.find((k) => Math.abs(k.position.x - w.x) <= r && Math.abs(k.position.y - w.y) <= r && (this.visible(k) || this.preview(k)));
      if (n) return n;
    }
    this.kind = 'skill';
    return null;
  }

  // ---------------------------------------------------------------------
  // Kaufen, Abholen, Tor
  // ---------------------------------------------------------------------

  burst(node, colorFn, n = 16) {
    if (this.save.settings.skipAnimations) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 200;
      this.particles.push({ x: node.position.x, y: node.position.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, age: 0, color: colorFn(i) });
    }
  }

  /** Klick auf einen Knoten: kaufen, Quest abholen oder Tor öffnen. */
  activate(node) {
    if (this.preview(node)) { play('error'); this.showInfo(node); return false; }
    if (node.typ === 'quest') return this.claim(node);
    if (node.typ === 'tor') { this.openGate(node); return false; }
    return this.tryBuy(node);
  }

  tryBuy(node) {
    const save = this.save;
    if (node.typ === 'start') return false;
    const firstTime = this.level(node.id) === 0;
    const before = { mp: save.mastery, fs: save.foilDust };
    const res = buyNode(this.kind, node, save, this.data);
    if (!res) { play('error'); return false; }
    this.game.persist();
    const skip = save.settings.skipAnimations;
    const color = this.foil ? null : this.data.branchIndex[node.ast]?.farbe ?? '#ffffff';
    this.anim[node.id] = { pop: skip ? 0 : performance.now() };
    this.burst(node, (i) => color ?? rainbow(i * 40));
    if (skip) this.updateCurrency(false);
    else { countTo($('#tree-mp'), before.mp, save.mastery, 350); countTo($('#tree-fs'), before.fs, save.foilDust, 350); }
    if (node.typ === 'schluessel' && !skip) { play('keystone'); this.banner(node.name, node.beschreibung); } else play(this.foil ? 'foil' : 'buy');
    this.hint = null;
    this.showInfo(node);
    this.game.hub?.onUpgradeBought();
    if (firstTime && node.effekt.ziel === 'gebaeude') {
      const b = this.data.buildingIndex[node.effekt.gebaeude];
      if (b) showUnlocks([{ title: 'NEUES GEBÄUDE!', name: `${b.name}: ${b.beschreibung}`, img: this.game.bank.url(this.game.bank.building(b.id)), w: 192, h: 192 }]);
    }
    if (res.relic) showUnlocks([{ title: 'NEUES RELIKT!', name: `${res.relic.name}: ${res.relic.beschreibung}`, img: this.game.bank.iconUrl(res.relic.symbol), w: 180, h: 180 }]);
    if (res.staub) this.game.toast(`Relikt schon im Besitz: +${res.staub} Schimmer`);
    return true;
  }

  /** Erfüllte Quest abholen (kurze Belohnungs-Animation, per Klick überspringbar). */
  claim(node) {
    const before = { mp: this.save.mastery, fs: this.save.foilDust };
    const res = claimQuestNode(node, this.data, this.save);
    if (!res) { play('error'); this.showInfo(node); return false; }
    this.game.persist();
    play('questDone');
    this.anim[node.id] = { pop: performance.now() };
    this.burst(node, (i) => ['#FFD24A', '#fff6c0', '#5ED17A'][i % 3], 28);
    countTo($('#tree-mp'), before.mp, this.save.mastery, 350);
    countTo($('#tree-fs'), before.fs, this.save.foilDust, 350);
    this.banner('QUEST ERFÜLLT!', `${node.name}: ${res.parts.join(', ') || 'neue Knoten freigeschaltet'}`);
    this.showInfo(node);
    this.game.hub?.onUpgradeBought();
    const relics = res.relics.filter(Boolean);
    if (relics.length) showUnlocks(relics.map((r) => ({ title: 'NEUES RELIKT!', name: `${r.name}: ${r.beschreibung}`, img: this.game.bank.iconUrl(r.symbol), w: 180, h: 180 })));
    return true;
  }

  /** Automatisch abgeholte Quests nacheinander zeigen: Knoten anfliegen, Aufploppen, Funken, Banner (Klick überspringt). */
  playClaims(claims) {
    clearTimeout(this.claimTimer);
    const relics = [];
    let i = 0;
    const startMp = this.save.mastery - claims.reduce((s, c) => s + (c.node.belohnung?.mastery || 0), 0);
    let shownMp = startMp;
    $('#tree-mp').textContent = fmtNum(startMp);
    const step = () => {
      if (!this.active || i >= claims.length) {
        countTo($('#tree-mp'), shownMp, this.save.mastery, 300);
        if (relics.length) showUnlocks(relics.map((r) => ({ title: 'NEUES RELIKT!', name: `${r.name}: ${r.beschreibung}`, img: this.game.bank.iconUrl(r.symbol), w: 180, h: 180 })));
        this.game.hub?.onUpgradeBought();
        return;
      }
      const { node, res } = claims[i++];
      this.centerOn(node);
      play('questDone');
      this.anim[node.id] = { pop: performance.now() };
      this.burst(node, (k) => ['#FFD24A', '#fff6c0', '#5ED17A'][k % 3], 36);
      const mp = node.belohnung?.mastery || 0;
      if (mp) { countTo($('#tree-mp'), shownMp, shownMp + mp, 500); shownMp += mp; }
      relics.push(...res.relics.filter(Boolean));
      this.banner('QUEST ERFÜLLT!', `${node.name}: ${res.parts.join(', ') || 'neue Knoten freigeschaltet'}${claims.length > 1 ? ` (${i}/${claims.length})` : ''}`, 'quest');
      this.claimTimer = setTimeout(step, this.save.settings.skipAnimations ? 400 : 1500);
    };
    this.claimTimer = setTimeout(step, 350);
  }

  async openGate(node) {
    const { data, save } = this;
    const act = data.acts.find((a) => a.tor?.knoten === node.id);
    const next = node.effekt.akt;
    const text = act?.tor?.warnung ?? `Akt ${next} beginnen? Der Skill-Tree wird zurückgesetzt. Erhalten bleiben: Foil-Baum, Foil-Staub, Sammlung, Bestiarium, Relikte.`;
    show('#tree-info', false);
    if (!(await confirmDialog(text, `Akt ${next} beginnen`, 'Noch nicht'))) return;
    const res = changeAct(node, data, save);
    if (!res) { play('error'); return; }
    this.game.persist();
    play('keystone');
    this.anim = {};
    this.centerOn(this.data.starIndex[this.data.starmap.start]);
    this.updateCurrency(false);
    this.game.hub?.onActChanged();
    const parts = [`${fmtNum(res.refund)} Mastery erstattet`];
    if (res.bonus) parts.push(`+${fmtNum(res.bonus)} Mastery (Schneller Neubeginn)`);
    showUnlocks([
      { title: `AKT ${res.act}!`, name: `${data.actIndex[res.act]?.name ?? ''} – ${parts.join(', ')}.`, img: this.game.bank.iconUrl('gate'), w: 180, h: 180 },
      { title: 'NEUE REITER!', name: 'BESTIARIUM und RELIKTE sind jetzt verfügbar.', img: this.game.bank.iconUrl('crown'), w: 160, h: 160 },
    ]);
  }

  banner(title, text, kind = '') {
    const b = $('#tree-banner');
    b.innerHTML = `${kind === 'quest' ? `<img class="tb-icon" src="${this.game.bank.iconUrl('quest')}" alt="">` : ''}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>`;
    b.classList.toggle('quest', kind === 'quest');
    // Animation bei jedem Banner neu starten
    b.classList.add('hidden'); void b.offsetWidth;
    b.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), 2600);
  }

  /** Kauf- und Abhol-Animationen per Klick überspringen. */
  skipAnimations() {
    const had = this.particles.length > 0 || !$('#tree-banner').classList.contains('hidden');
    this.particles = [];
    $('#tree-banner').classList.add('hidden');
    for (const a of Object.values(this.anim)) a.pop = 0;
    return had;
  }

  updateCurrency(animate = true) {
    if (!animate) { $('#tree-mp').textContent = this.save.mastery; $('#tree-fs').textContent = this.save.foilDust; }
    $('.tree-cur').classList.remove('foil-mode');
    $('#tree-fs-wrap').classList.toggle('hidden', !foilTreeUnlocked(this.save));
  }

  /** Navigationsleiste: Regenbogen-Kristall (Umschalten), ^ / vv (Ebenen), Prestige-Hinweis blinkt. */
  updateNav() {
    const btn = $('#tree-foil');
    const unlocked = foilTreeUnlocked(this.save);
    btn.classList.toggle('hidden', !unlocked);
    btn.classList.remove('on');
    btn.classList.toggle('blink', unlocked && !this.save.ui.foilTreeSeen);
    $('#tree-up').classList.toggle('blink', this.prestigeCount() > (this.save.ui.prestigeSeen || 0));
  }

  prestigeCount() {
    const { data, save } = this;
    return data.chapters.filter((c) => chapterUnlocked(c, save, data)).reduce((s, c) => s + prestigeAvailable(c, save, data).length, 0);
  }

  // ---------------------------------------------------------------------
  // Info-Fenster
  // ---------------------------------------------------------------------

  showInfo(node) {
    if (!node) { show('#tree-info', false); return; }
    const { save, data } = this;
    const lvl = this.level(node.id);
    const st = this.state(node);
    const box = $('#tree-info');
    const col = this.foil ? '#ff9ad8' : node.typ === 'quest' ? '#e8dcc0' : data.branchIndex[node.ast]?.farbe ?? '#fff';
    const branch = this.foil ? data.foiltree.aeste.find((a) => a.id === node.ast)?.name : data.branchIndex[node.ast]?.name;
    let html = `<h3 style="color:${col}">${escapeHtml(node.name)}</h3><div class="typ">${TYPE_NAME[node.typ] ?? ''}${branch ? ` · ${escapeHtml(branch)}` : ''}</div>`;
    if (st === 'locked') {
      const boss = node.abBoss && !(save.stats.bossKills[node.abBoss] > 0);
      const bossName = boss ? data.enemies.find((e) => e.id === data.chapterIndex[node.abBoss]?.boss)?.name : null;
      html += `<div>${escapeHtml(node.typ === 'quest' ? node.beschreibung : node.beschreibung)}</div>
        <div class="cost no">Gesperrt – ${boss ? `erst nach dem Sieg über ${escapeHtml(bossName ?? `den Boss von Kapitel ${node.abBoss}`)}` : 'zuerst den angrenzenden Knoten kaufen'}.</div>`;
      box.innerHTML = html;
      box.style.borderColor = '#5a5468';
      show('#tree-info', true);
      return;
    }
    if (node.typ === 'quest') {
      const p = questProgress(node, data, save);
      const chs = questChapters(node, data);
      const val = node.aufgabe.statistik === 'ueberleben' ? `${fmtTime(p.value)} / ${fmtTime(p.target)}` : `${fmtNum(p.value)} / ${fmtNum(p.target)}`;
      html += `<div><b>Aufgabe:</b> ${escapeHtml(node.beschreibung)}</div>
        <div class="qbar"><i style="width:${Math.round((p.value / p.target) * 100)}%"></i><span>${val}</span></div>
        <div><b>Belohnung:</b> ${escapeHtml(describeReward(node.belohnung))}${node.verbindungen.length > 1 ? ' · schaltet neue Knoten frei' : ''}</div>
        <div><b>Zählt in:</b> ${chs ? chs.map((id) => escapeHtml(this.game.hub?.chapterShort(data.chapterIndex[id]) ?? `Kapitel ${id}`)).join(', ') : 'allen Kapiteln'}</div>`;
      if (st === 'max') html += '<div class="cost">ABGESCHLOSSEN ✓</div>';
      else if (st === 'claimable') html += '<div class="cost">Erfüllt! Klicken zum Abholen</div>';
      else html += '<div class="hint">Wird durch Spielen erfüllt. Fortschritt zählt nur, solange die Quest im Baum sichtbar ist.</div>';
    } else if (node.typ === 'tor') {
      html += `<div>${escapeHtml(node.beschreibung)}</div>`;
      if (node.torBosse) {
        const done = node.torBosse.filter((ch) => save.stats.bossKills?.[ch] > 0).length;
        html += `<div><b>Tor-Zähler:</b> ${done}/${node.torBosse.length} Bosse besiegt</div>`;
      }
      html += `<div class="cost">Klicken, um Akt ${node.effekt.akt} zu beginnen</div>`;
    } else {
      html += `<div>${escapeHtml(node.beschreibung)}</div>`;
      if (node.effekt.ziel === 'relikt') {
        const r = data.relicIndex[node.effekt.relikt];
        if (save.relics.owned.includes(r.id)) html += `<div class="hint">Relikt schon im Besitz – Kauf gibt stattdessen ${data.balance.belohnungen.reliktDoppelt.foilStaub} Schimmer.</div>`;
      }
      if (node.typ !== 'start') {
        if (('wert' in node.effekt || node.effekt.ziel === 'tome') && node.maxStufe > 1) {
          html += `<div>Aktuell: ${escapeHtml(describeNodeEffect(node, lvl))}</div>`;
          if (lvl < node.maxStufe) html += `<div class="next">Nächste Stufe: ${escapeHtml(describeNodeEffect(node, lvl + 1))}</div>`;
        }
        html += `<div>Stufe ${lvl}/${node.maxStufe}</div>`;
        if (st === 'max') html += '<div class="cost">MAXIMUM ✓</div>';
        else {
          const c = nodeCost(this.kind, node, lvl, data, save);
          const why = nodeBlocker(this.kind, node, save, data);
          html += `<div class="cost ${why ? 'no' : ''}">Kosten: ${fmtNum(c.amount)} <img src="${this.game.bank.iconUrl(this.foil ? 'crystal_regen' : 'mastery')}" alt=""> ${this.foil ? 'Schimmer' : 'Mastery'}${c.muenzen ? ` + ${c.muenzen} <img src="${this.game.bank.iconUrl('coin')}" alt=""> Münzen` : ''}</div>`;
          if (why && !/Zu wenig/.test(why)) html += `<div class="req">${escapeHtml(why)}</div>`;
          else html += `<div class="hint">Klicken zum Kaufen${node.maxStufe > 1 ? ' · gedrückt halten für mehrere Stufen' : ''}</div>`;
        }
      }
    }
    if (this.foil) html += '<div class="perm">Dauerhaft – bleibt bei Akt-Wechsel erhalten</div>';
    box.innerHTML = html;
    box.classList.toggle('foil', this.foil);
    const p = this.toScreen(node.position.x, node.position.y);
    const r = (NODE / 2) * this.cam.zoom + 18;
    const left = p.x + r + 430 > this.W - 80 ? p.x - r - 430 : p.x + r;
    box.style.left = `${Math.max(10, left)}px`;
    box.style.top = `${Math.max(70, Math.min(this.H - 280, p.y - 70))}px`;
    show('#tree-info', true);
  }

  // ---------------------------------------------------------------------
  // Eingaben
  // ---------------------------------------------------------------------

  bind() {
    const cv = this.canvas;
    const pointers = new Map();
    let drag = null, pinch = null, hold = null;
    const stopHold = () => { if (hold) { clearTimeout(hold.timer); clearInterval(hold.iv); hold = null; } };

    cv.addEventListener('pointerdown', (ev) => {
      cv.setPointerCapture(ev.pointerId);
      const p = this.local(ev);
      pointers.set(ev.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.cam.zoom };
        drag = null; stopHold();
        return;
      }
      drag = { x: p.x, y: p.y, camX: this.cam.x, camY: this.cam.y, moved: false, type: ev.pointerType };
      const node = this.nodeAt(p.x, p.y);
      // Gedrückt halten: mehrere Stufen kaufen (nur Upgrade-Knoten)
      if (node && ev.button === 0 && node.maxStufe > 1 && !['quest', 'tor', 'start'].includes(node.typ)) {
        hold = { node, bought: 0, timer: setTimeout(() => {
          if (!hold) return;
          hold.iv = setInterval(() => { if (!hold || !this.tryBuy(hold.node)) stopHold(); else hold.bought++; }, HOLD_INTERVAL);
        }, 350) };
      }
    });
    cv.addEventListener('pointermove', (ev) => {
      const p = this.local(ev);
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, p);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        this.setZoom(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        return;
      }
      if (drag) {
        const dx = p.x - drag.x, dy = p.y - drag.y;
        if (Math.hypot(dx, dy) > 8) { drag.moved = true; stopHold(); cv.classList.add('dragging'); }
        if (drag.moved) {
          this.cam.x = drag.camX - dx / this.cam.zoom;
          this.cam.y = drag.camY - dy / this.cam.zoom;
          this.clampCam();
          show('#tree-info', false);
        }
        return;
      }
      if (ev.pointerType === 'mouse') {
        const n = this.nodeAt(p.x, p.y);
        if (n !== this.hover) { this.hover = n; this.showInfo(n); }
      }
    });
    const up = (ev) => {
      cv.releasePointerCapture?.(ev.pointerId);
      pointers.delete(ev.pointerId);
      cv.classList.remove('dragging');
      if (pinch) { if (pointers.size < 2) pinch = null; return; }
      const d = drag;
      drag = null;
      const held = hold?.bought > 0;
      stopHold();
      if (!d || d.moved || held || ev.button !== 0) return;
      const p = this.local(ev);
      const node = this.nodeAt(p.x, p.y);
      if (!node) { if (!this.skipAnimations()) { this.tapped = null; show('#tree-info', false); } return; }
      if (d.type === 'mouse') { this.activate(node); return; }
      if (this.tapped === node) this.activate(node); else { this.tapped = node; this.showInfo(node); }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (!drag) { this.hover = null; show('#tree-info', false); } });
    cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
    cv.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      this.setZoom(this.cam.zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), this.local(ev));
      show('#tree-info', false);
    }, { passive: false });
    $('#tree-banner').addEventListener('pointerdown', () => $('#tree-banner').classList.add('hidden'));

    // Navigationsleiste
    $('#tree-foil').addEventListener('click', () => this.toggleKind());
    const pan = (dir) => { this.cam.y += dir * this.H * 0.6 / this.cam.zoom; this.clampCam(); play('click'); show('#tree-info', false); };
    $('#tree-up').addEventListener('click', () => {
      const n = this.prestigeCount();
      if (n > (this.save.ui.prestigeSeen || 0)) {
        this.save.ui.prestigeSeen = n;
        this.game.persist();
        this.updateNav();
        this.game.hub?.selectNewestPrestige();
        this.game.toast('Neue Prestige-Stufe! Sie ist links in der Kapitelwahl ausgewählt (römische Ziffer).');
        play('unlock');
        return;
      }
      pan(-1);
    });
    $('#tree-down').addEventListener('click', () => pan(1));
  }

  // ---------------------------------------------------------------------
  // Zeichnen
  // ---------------------------------------------------------------------

  loop(now) {
    if (!this.active) return;
    this.resize();
    const t = (now - this.t0) / 1000;
    const dt = Math.min(0.05, (now - (this.lastNow || now)) / 1000);
    this.lastNow = now;
    this.draw(t, dt, now);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Skill-Tree: abgedunkeltes Bild der eigenen Basis (Turm, gebaute Gebäude) unter dem Startknoten. */
  drawBase(c, t) {
    const { bank, data } = this.game;
    c.fillStyle = '#120a16';
    c.fillRect(0, 0, this.W, this.H);
    for (let i = 0; i < 90; i++) {
      const a = 0.15 + 0.35 * Math.abs(Math.sin(t * (0.4 + hash(i, 3)) + i));
      c.fillStyle = `rgba(244,235,217,${a.toFixed(2)})`;
      c.fillRect(Math.round(hash(i, 1) * this.W), Math.round(hash(i, 2) * this.H), 3, 3);
    }
    const sp = this.index[this.map.start].position;
    const s = this.toScreen(sp.x, sp.y);
    const z = this.cam.zoom;
    const cx = s.x, cy = s.y + 120 * z; // Basis unter dem Startknoten
    c.fillStyle = '#1d1424';
    c.beginPath(); c.ellipse(cx, cy + 40 * z, 420 * z, 150 * z, 0, 0, Math.PI * 2); c.fill();
    const tower = bank.tower(0);
    c.globalAlpha = 0.4;
    c.drawImage(tower, Math.round(cx - (tower.width * z) / 2), Math.round(cy - tower.height * z + 60 * z), tower.width * z, tower.height * z);
    const mods = this.mods;
    data.buildings.forEach((b, i) => {
      if (!mods.gebaeude[b.id]) return;
      const img = bank.building(b.id);
      const x = cx + (i - 1) * 240 * z, y = cy + (60 + (i === 1 ? 70 : 0)) * z;
      c.drawImage(img, Math.round(x - img.width * 2 * z), Math.round(y - img.height * 2 * z), img.width * 4 * z, img.height * 4 * z);
    });
    c.globalAlpha = 1;
  }

  /** Foil-Baum: dunkles Feld mit langsam schimmernden Regenbogen-Schlieren (sehr dezent). */
  drawFoilBase(c, t) {
    // Bereich des Schimmer-Baums (Welt → Bildschirm), weich ausgeblendeter Regenbogen-Schleier
    const fk = this.data.foiltree.knoten;
    const pad = 160;
    const a = this.toScreen(Math.min(...fk.map((n) => n.position.x)) - pad, Math.min(...fk.map((n) => n.position.y)) - pad);
    const b = this.toScreen(Math.max(...fk.map((n) => n.position.x)) + pad, Math.max(...fk.map((n) => n.position.y)) + pad);
    if (b.x < 0 || a.x > this.W || b.y < 0 || a.y > this.H) return;
    c.save();
    c.beginPath(); c.rect(a.x, a.y, b.x - a.x, b.y - a.y); c.clip();
    c.fillStyle = 'rgba(13,9,18,0.85)';
    c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const y = this.H * (0.12 + i * 0.19) + Math.sin(t * 0.25 + i * 1.7) * 60;
      const g = c.createLinearGradient(0, y - 80, this.W, y + 80);
      const h = t * 12 + i * 70;
      g.addColorStop(0, rainbow(h, 55, 0));
      g.addColorStop(0.35, rainbow(h + 60, 55, 0.07));
      g.addColorStop(0.65, rainbow(h + 140, 55, 0.07));
      g.addColorStop(1, rainbow(h + 200, 55, 0));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x <= this.W; x += 40) c.lineTo(x, y + Math.sin(x / 180 + t * 0.4 + i) * 40);
      for (let x = this.W; x >= 0; x -= 40) c.lineTo(x, y + 70 + Math.sin(x / 200 + t * 0.3 + i * 2) * 40);
      c.closePath(); c.fill();
    }
    c.restore();
    for (let i = 0; i < 60; i++) {
      const al = 0.1 + 0.3 * Math.abs(Math.sin(t * (0.3 + hash(i, 9)) + i));
      c.fillStyle = rainbow(hash(i, 4) * 360, 75, al);
      c.fillRect(Math.round(a.x + hash(i, 5) * (b.x - a.x)), Math.round(a.y + hash(i, 6) * (b.y - a.y)), 2, 2);
    }
    // Rahmen und Titel
    c.strokeStyle = rainbow(t * 40, 70, 0.5); c.lineWidth = 2;
    c.strokeRect(a.x + 1, a.y + 1, b.x - a.x - 2, b.y - a.y - 2);
    c.font = 'bold 28px "Jersey 10", "Pixelify Sans", monospace';
    c.textAlign = 'left'; c.fillStyle = rainbow(t * 60, 80, 0.95);
    c.fillText('SCHIMMER-BAUM (dauerhaft)', a.x + 16, a.y + 34);
    c.restore();
  }

  draw(t, dt, now) {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    this.mods = computeMods(this.data, this.save);
    this.kind = 'skill';
    this.drawBase(c, t);
    const foilOn = foilTreeUnlocked(this.save);
    if (foilOn) this.drawFoilBase(c, t);

    const z = this.cam.zoom;
    c.save();
    c.translate(this.W / 2, this.H / 2);
    c.scale(z, z);
    c.translate(-this.cam.x, -this.cam.y);

    for (const kind of foilOn ? ['skill', 'foil'] : ['skill']) {
    this.kind = kind;
    const nodes = this.map.knoten;
    const idx = this.index;
    const vis = Object.fromEntries(nodes.map((n) => [n.id, this.visible(n)]));
    const startPos = idx[this.map.start].position;

    // Leitungen: rechtwinklig (senkrecht – waagerecht – senkrecht)
    const drawn = new Set();
    c.lineCap = 'square';
    for (const n of nodes) {
      for (const id of n.verbindungen) {
        const key = n.id < id ? `${n.id}|${id}` : `${id}|${n.id}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const m = idx[id];
        if (!vis[n.id] && !vis[m.id]) continue;
        const [a, b] = Math.abs(n.position.y - startPos.y) <= Math.abs(m.position.y - startPos.y) ? [n, m] : [m, n];
        const both = this.level(n.id) > 0 && this.level(m.id) > 0;
        const fade = !(vis[n.id] && vis[m.id]) ? (vis[a.id] ? 'end' : 'start') : null;
        if (this.foil) this.wireRainbow(c, a.position, b.position, both ? 3 : 2, fade, t, both ? 1 : 0.65);
        else this.wire(c, a.position, b.position, both ? LINE_ON : LINE, both ? 3 : 2, fade);
        if (both && !this.save.settings.skipAnimations) {
          const f = (t * 0.6 + hash(a.position.x, b.position.y)) % 1;
          const p = this.alongWire(a.position, b.position, f);
          c.fillStyle = this.foil ? rainbow(t * 120 + p.x * 0.3, 85) : '#fff6c0';
          c.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 6, 6);
        }
      }
    }

    for (const n of nodes) if (vis[n.id] || this.preview(n)) this.drawNode(n, t, now);
    }
    this.kind = 'skill';

    for (const p of this.particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
      c.globalAlpha = Math.max(0, 1 - p.age / p.life);
      c.fillStyle = p.color;
      c.fillRect(Math.round(p.x) - 4, Math.round(p.y) - 4, 8, 8);
    }
    c.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.age < p.life);
    c.restore();

    if (this.hint && now < this.hint.until && this.visible(this.hint.node)) {
      const p = this.toScreen(this.hint.node.position.x, this.hint.node.position.y);
      const bob = Math.sin(t * 6) * 6;
      c.fillStyle = '#FFD24A';
      c.beginPath(); c.moveTo(p.x, p.y - 36 + bob); c.lineTo(p.x - 18, p.y - 66 + bob); c.lineTo(p.x + 18, p.y - 66 + bob); c.closePath(); c.fill();
      if (this.hint.text) {
        c.font = 'bold 26px "Jersey 10", "Pixelify Sans", monospace';
        c.textAlign = 'center';
        c.lineWidth = 6; c.strokeStyle = '#120a16';
        c.strokeText(this.hint.text, p.x, p.y - 78 + bob);
        c.fillText(this.hint.text, p.x, p.y - 78 + bob);
      }
    }
  }

  /** Gesperrter Nachbar-Knoten: graues Kästchen mit blassem, entsättigtem Symbol. */
  drawLocked(n) {
    const c = this.ctx;
    const size = n.typ === 'schluessel' || n.typ === 'tor' ? 56 : NODE, h = size / 2;
    const { x, y } = n.position;
    c.fillStyle = '#1c1a22';
    c.fillRect(x - h, y - h, size, size);
    c.lineWidth = 3; c.strokeStyle = '#4a4656';
    c.strokeRect(x - h + 1.5, y - h + 1.5, size - 3, size - 3);
    const img = this.symbolImage(n);
    if (img) {
      const s = Math.round(size * 0.72);
      c.save(); c.globalAlpha = 0.35; c.filter = 'grayscale(1) brightness(0.8)';
      c.drawImage(img, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      c.restore();
    }
    c.drawImage(this.game.bank.icon('lock'), x + h - 16, y + h - 16, 18, 18);
  }

  /** Rechtwinklige Leitung: hochkanter Skill-Tree waagerecht – senkrecht – waagerecht, sonst senkrecht – waagerecht – senkrecht. */
  wirePoints(a, b) {
    if (a.x === b.x || a.y === b.y) return [a, b];
    if (this.map.leitung === 'hvh') {
      const mx = (a.x + b.x) / 2;
      return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
    }
    const my = (a.y + b.y) / 2;
    return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
  }

  alongWire(a, b, f) {
    const pts = this.wirePoints(a, b);
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y); segs.push(l); total += l; }
    let d = f * total;
    for (let i = 0; i < segs.length; i++) {
      if (d <= segs[i] || i === segs.length - 1) { const k = segs[i] ? d / segs[i] : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k }; }
      d -= segs[i];
    }
    return b;
  }

  /** Leitung zeichnen; fade = 'end' bzw. 'start': diese Seite verschwindet im Dunkeln. */
  wire(c, a, b, color, width, fade) {
    const pts = this.wirePoints(a, b);
    if (fade) {
      const g = c.createLinearGradient(a.x, a.y, b.x, b.y);
      const col = color === LINE ? 'rgba(200,194,74,' : 'rgba(255,210,74,';
      g.addColorStop(fade === 'end' ? 0 : 1, `${col}0.9)`);
      g.addColorStop(0.55, `${col}0)`);
      g.addColorStop(fade === 'end' ? 1 : 0, `${col}0)`);
      c.strokeStyle = g;
    } else c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.stroke();
  }

  /** Regenbogen-Leitung (Foil-Baum): Farbton wandert langsam entlang der Leitung. */
  wireRainbow(c, a, b, width, fade, t, alpha) {
    const pts = this.wirePoints(a, b);
    const g = c.createLinearGradient(a.x, a.y, b.x, b.y);
    const h = t * 40 + (a.x + a.y) * 0.2;
    const fa = (k) => (fade === 'end' ? Math.max(0, 1 - k / 0.55) : fade === 'start' ? Math.max(0, (k - 0.45) / 0.55) : 1) * alpha;
    for (const k of [0, 0.25, 0.5, 0.75, 1]) g.addColorStop(k, rainbow(h + k * 160, 62, fa(k)));
    c.strokeStyle = g;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.stroke();
  }

  drawNode(n, t, now) {
    const c = this.ctx;
    const st = this.state(n);
    if (st === 'locked') return this.drawLocked(n);
    const lvl = this.level(n.id);
    let size = n.typ === 'start' ? 64 : n.typ === 'schluessel' || n.typ === 'tor' ? 56 : NODE;
    const a = this.anim[n.id];
    if (a?.pop) { const k = (now - a.pop) / 250; if (k < 1) size *= 1 + Math.sin(k * Math.PI) * 0.3; }
    const h = size / 2;
    const { x, y } = n.position;
    const bought = lvl > 0 || n.typ === 'start';
    const quest = n.typ === 'quest';

    // Leuchten: kaufbar, erfüllte Quest (pulsiert), Tor
    if (st === 'affordable' || st === 'boughtAffordable' || st === 'claimable' || st === 'tor') {
      const pulse = (st === 'claimable' ? 0.5 : 0.35) + 0.35 * Math.sin(t * (st === 'claimable' ? 7 : 4));
      c.fillStyle = st === 'claimable' ? `rgba(255,210,74,${pulse.toFixed(2)})` : st === 'tor' ? `rgba(255,154,58,${pulse.toFixed(2)})` : this.foil ? rainbow(t * 90, 70, pulse) : `rgba(255,246,160,${pulse.toFixed(2)})`;
      const g = st === 'claimable' ? 10 : 6;
      c.fillRect(x - h - g, y - h - g, size + g * 2, size + g * 2);
    }
    if (st === 'max' && n.typ !== 'start' && !this.foil) { c.fillStyle = quest ? 'rgba(232,220,192,0.25)' : 'rgba(255,210,74,0.35)'; c.fillRect(x - h - 5, y - h - 5, size + 10, size + 10); }
    c.fillStyle = quest ? '#2a2016' : '#1a1020';
    c.fillRect(x - h, y - h, size, size);

    // Rahmen
    if (this.foil) this.rainbowFrame(c, x, y, size, t, bought ? 1 : 0.7);
    else if (quest) {
      // Schriftrollen-Rahmen: Pergament mit eingerollten Enden oben und unten
      c.lineWidth = 3; c.strokeStyle = st === 'max' ? '#c8b890' : '#e8dcc0';
      c.strokeRect(x - h + 1.5, y - h + 1.5, size - 3, size - 3);
      c.fillStyle = st === 'max' ? '#a89870' : '#e8dcc0';
      c.fillRect(x - h - 4, y - h - 3, size + 8, 6); c.fillRect(x - h - 4, y + h - 3, size + 8, 6);
      c.fillStyle = '#8a6a3a';
      c.fillRect(x - h - 4, y - h - 3, 4, 6); c.fillRect(x + h, y - h - 3, 4, 6); c.fillRect(x - h - 4, y + h - 3, 4, 6); c.fillRect(x + h, y + h - 3, 4, 6);
    } else {
      c.lineWidth = 3;
      c.strokeStyle = n.typ === 'tor' ? '#FF9A3A' : n.typ === 'relikt' ? '#B23ED8' : bought ? '#FFD24A' : FRAME;
      c.strokeRect(x - h + 1.5, y - h + 1.5, size - 3, size - 3);
    }

    // Symbol
    const img = this.symbolImage(n);
    if (img) {
      const s = Math.round(size * 0.72);
      c.globalAlpha = bought || quest || n.typ === 'tor' ? 1 : st === 'affordable' ? 0.85 : 0.5;
      c.drawImage(img, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      c.globalAlpha = 1;
    }
    // Gekaufte Foil-Knoten: wandernder Shiny-Glanz (diagonaler Streifen alle 1,5 s)
    if (this.foil && bought) this.sheen(c, x, y, size, t);

    // Eckabzeichen oben rechts bzw. Ausrufezeichen bei erfüllter Quest
    const badge = st === 'claimable' ? 'exclam' : n.abzeichen;
    if (badge) {
      const bs = 20;
      c.fillStyle = '#120a16';
      c.fillRect(x + h - bs + 4, y - h - 4, bs, bs);
      c.drawImage(this.game.bank.icon(badge), x + h - bs + 6, y - h - 2, bs - 4, bs - 4);
    }
    if (st === 'max' && n.typ !== 'start') c.drawImage(this.game.bank.icon('check'), x - h - 6, y + h - 14, 20, 20);

    // Quest: Fortschrittsbalken unter dem Knoten
    if (quest && st !== 'max') {
      const p = questProgress(n, this.data, this.save);
      const w = size + 8, bx = x - w / 2, by = y + h + 7;
      c.fillStyle = '#120a16'; c.fillRect(bx - 2, by - 2, w + 4, 10);
      c.fillStyle = st === 'claimable' ? '#5ED17A' : '#e8dcc0';
      c.fillRect(bx, by, Math.round(w * (p.value / p.target)), 6);
    }
    // Stufe
    if (!quest && n.typ !== 'start' && n.maxStufe > 1 && lvl > 0) {
      c.font = 'bold 18px "Jersey 10", "Pixelify Sans", monospace';
      c.textAlign = 'center';
      c.lineWidth = 4; c.strokeStyle = '#120a16';
      const label = `${lvl}/${n.maxStufe}`;
      c.strokeText(label, x, y + h + 17);
      c.fillStyle = lvl >= n.maxStufe ? '#FFD24A' : '#F4EBD9';
      c.fillText(label, x, y + h + 17);
    }
  }

  /** Regenbogenrand: jede Seite in einem eigenen, langsam wandernden Farbton. */
  rainbowFrame(c, x, y, size, t, alpha) {
    const h = size / 2, w = 3;
    const base = t * 60 + (x + y) * 0.1;
    const sides = [[x - h, y - h, size, w], [x + h - w, y - h, w, size], [x - h, y + h - w, size, w], [x - h, y - h, w, size]];
    sides.forEach(([sx, sy, sw, sh], i) => {
      const g = sw > sh ? c.createLinearGradient(sx, sy, sx + sw, sy) : c.createLinearGradient(sx, sy, sx, sy + sh);
      g.addColorStop(0, rainbow(base + i * 90, 62, alpha));
      g.addColorStop(1, rainbow(base + i * 90 + 90, 62, alpha));
      c.fillStyle = g;
      c.fillRect(sx, sy, sw, sh);
    });
  }

  /** Diagonaler Glanzstreifen, der alle 1,5 s über das Quadrat wandert. */
  sheen(c, x, y, size, t) {
    const k = ((t + hash(x, y) * 1.5) % 1.5) / 1.5;
    if (k > 0.5) return;
    const h = size / 2;
    const p = -size + k * 4 * size;
    c.save();
    c.beginPath(); c.rect(x - h, y - h, size, size); c.clip();
    const g = c.createLinearGradient(x - h + p, y - h, x - h + p + size * 0.6, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(x - h, y - h, size, size);
    c.restore();
  }

  symbolImage(n) {
    const bank = this.game.bank;
    const sym = n.symbol ?? 'rune';
    if (sym.startsWith('card:')) {
      const id = sym.slice(5);
      const card = this.data.cardIndex[id];
      if (!card) return this.data.unitIndex[id] ? bank.unit(id).idle[0] : bank.icon('sword');
      return card.art === 'einheit' ? bank.unit(id).idle[0] : bank.tome(id);
    }
    return bank.icon(sym);
  }
}
