// Sternenkarte (14.9): großer, verschiebbarer Skill-Tree mit Nebel des Unbekannten, Ästen A–H und Akt-2-Knoten.
import { $, escapeHtml, show, stage, confirmDialog, countTo } from './dom.js';
import { levelOf as nodeLevel, nodeCost, nodeBlocker, buyNode, nodeReachable as isReachable, describeNodeEffect as describeEffect, resetStarmap, nodeVisibleInAct } from '../core/meta.js';
import { hash } from '../render/pixel.js';
import { play } from '../audio.js';

const ZOOMS = [0.45, 0.8, 1.25];
const SIZE = { klein: 48, gross: 72, schluessel: 96, freischalt: 60, start: 88 };
const TYPE_NAME = { klein: 'Kleiner Knoten', gross: 'Großer Knoten', schluessel: 'Schlüsselknoten', freischalt: 'Freischaltung', start: 'Startknoten' };
const HOLD_INTERVAL = 150;
const costText = (c) => `${c.amount} ${c.waehrung === 'foilstaub' ? 'Foil-Staub' : 'MP'}${c.kristalle ? ` + ${c.kristalle} Kristalle` : ''}`;

export class StarmapScreen {
  constructor(game) {
    this.game = game;
    this.canvas = $('#star-canvas');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.ctx = this.canvas.getContext('2d');
    this.cam = { x: 2400, y: 2400, zoom: ZOOMS[1] };
    this.anim = {};         // Knoten-ID -> { pop, reveal } (Kauf-Feedback)
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
  get map() { return this.game.data.starmap; }

  open() {
    this.active = true;
    const id = this.save.lastBought ?? this.map.start;
    this.centerOn(this.data.starIndex[id] ?? this.data.starIndex[this.map.start]);
    this.updateCurrency(false);
    show('#star-info', false);
    requestAnimationFrame(this.loop);
    // Erster Besuch: Pfeil auf den ersten bezahlbaren Knoten im Runenkreis-Ast
    if (!this.save.tutorial.starmapOpened) {
      const n = this.map.knoten.find((k) => k.ast === 'cursor' && !nodeBlocker(k, this.save, this.data));
      if (n) {
        this.save.tutorial.starmapOpened = true;
        this.game.persist();
        this.hint = { node: n, until: performance.now() + 7000 };
      }
    }
  }

  close() { this.active = false; this.hint = null; }

  // ---------------------------------------------------------------------
  // Kamera
  // ---------------------------------------------------------------------

  centerOn(node) {
    this.cam.x = node.position.x;
    this.cam.y = node.position.y;
    this.clampCam();
  }

  clampCam() {
    const W = this.map.groesse.breite, H = this.map.groesse.hoehe;
    const hw = 960 / this.cam.zoom, hh = 540 / this.cam.zoom;
    this.cam.x = Math.max(Math.min(hw, W / 2), Math.min(W - Math.min(hw, W / 2), this.cam.x));
    this.cam.y = Math.max(Math.min(hh, H / 2), Math.min(H - Math.min(hh, H / 2), this.cam.y));
  }

  toScreen(x, y) {
    return { x: (x - this.cam.x) * this.cam.zoom + 960, y: (y - this.cam.y) * this.cam.zoom + 540 };
  }

  toWorld(sx, sy) {
    return { x: (sx - 960) / this.cam.zoom + this.cam.x, y: (sy - 540) / this.cam.zoom + this.cam.y };
  }

  setZoom(z, anchor = { x: 960, y: 540 }) {
    const before = this.toWorld(anchor.x, anchor.y);
    this.cam.zoom = Math.max(ZOOMS[0], Math.min(ZOOMS[2], z));
    const after = this.toWorld(anchor.x, anchor.y);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }

  // ---------------------------------------------------------------------
  // Zustände
  // ---------------------------------------------------------------------

  /** Sichtbar = gekauft oder direkter Nachbar; "am Nebelrand" = zwei Schritte entfernt. */
  visibility(node) {
    if (!nodeVisibleInAct(node, this.save)) return 'hidden';
    if (nodeLevel(this.save, node.id) > 0 || isReachable(node, this.save)) return 'visible';
    const edge = node.verbindungen.some((id) => isReachable(this.data.starIndex[id], this.save) && nodeLevel(this.save, id) === 0);
    return edge ? 'edge' : 'hidden';
  }

  state(node) {
    const lvl = nodeLevel(this.save, node.id);
    if (lvl >= node.maxStufe) return 'max';
    if (lvl > 0) return nodeBlocker(node, this.save, this.data) ? 'bought' : 'boughtAffordable';
    if (!isReachable(node, this.save)) return 'locked';
    if (this.cardMissing(node)) return 'locked';
    return nodeBlocker(node, this.save, this.data) ? 'expensive' : 'affordable';
  }

  cardMissing(node) {
    const card = node.voraussetzung?.karte;
    const c = card && this.save.collection[card];
    return !!card && !((c?.normal || 0) + (c?.foil || 0) > 0);
  }

  nodeAt(sx, sy) {
    const w = this.toWorld(sx, sy);
    let best = null;
    for (const n of this.map.knoten) {
      if (this.visibility(n) === 'hidden') continue;
      const r = (SIZE[n.typ] ?? 48) / 2 + 10;
      const d = Math.hypot(n.position.x - w.x, n.position.y - w.y);
      if (d <= r && (!best || d < best.d)) best = { n, d };
    }
    return best?.n ?? null;
  }

  // ---------------------------------------------------------------------
  // Kaufen
  // ---------------------------------------------------------------------

  tryBuy(node) {
    const save = this.save;
    const firstTime = nodeLevel(save, node.id) === 0;
    const before = { mp: save.mastery, fs: save.foilDust };
    if (!buyNode(node, save, this.data)) {
      play('error');
      return false;
    }
    this.game.persist();
    const color = this.data.branchIndex[node.ast]?.farbe ?? '#ffffff';
    const skip = save.settings.skipAnimations;
    this.anim[node.id] = { pop: skip ? 0 : performance.now(), reveal: firstTime && !skip ? performance.now() : this.anim[node.id]?.reveal };
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 220;
      this.particles.push({ x: node.position.x, y: node.position.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, age: 0, color });
    }
    if (save.settings.skipAnimations) this.updateCurrency(false);
    else { countTo($('#star-mp'), before.mp, save.mastery, 400); countTo($('#star-fs'), before.fs, save.foilDust, 400); $('#star-kr').textContent = save.crystals; }
    if (node.typ === 'schluessel' && !save.settings.skipAnimations) {
      play('keystone');
      const f = $('#star-flash');
      f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
      const b = $('#star-banner');
      b.innerHTML = `<h2>${escapeHtml(node.name)}</h2><p>${escapeHtml(node.beschreibung)}</p>`;
      b.classList.remove('hidden');
      b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => b.classList.add('hidden'), 3200);
    } else play('buy');
    this.hint = null;
    this.showInfo(node);
    return true;
  }

  updateCurrency(animate = true) {
    if (!animate) { $('#star-mp').textContent = this.save.mastery; $('#star-fs').textContent = this.save.foilDust; }
    $('#star-kr').textContent = this.save.crystals;
  }

  // ---------------------------------------------------------------------
  // Info-Fenster
  // ---------------------------------------------------------------------

  showInfo(node) {
    if (!node) { show('#star-info', false); return; }
    const save = this.save;
    const lvl = nodeLevel(save, node.id);
    const st = this.state(node);
    const box = $('#star-info');
    const cardMissing = this.cardMissing(node);
    let html = `<h3 style="color:${this.data.branchIndex[node.ast]?.farbe}">${escapeHtml(cardMissing ? '???' : node.name)}</h3>
      <div class="typ">${TYPE_NAME[node.typ]} · ${escapeHtml(this.data.branchIndex[node.ast]?.name ?? '')}</div>`;
    if (cardMissing) {
      html += `<div class="req">Finde diese Karte, um sie freizuschalten.</div>`;
    } else {
      html += `<div>${escapeHtml(node.beschreibung)}</div>`;
      if (node.typ !== 'start') {
        if ('wert' in node.effekt && node.maxStufe > 1) {
          html += `<div>Aktuell: ${escapeHtml(describeEffect(node, lvl))}</div>`;
          if (lvl < node.maxStufe) html += `<div class="next">Nächste Stufe: ${escapeHtml(describeEffect(node, lvl + 1))}</div>`;
        }
        html += `<div>Stufe ${lvl} / ${node.maxStufe}</div>`;
      }
      if (st === 'locked') {
        const names = node.verbindungen.map((id) => this.data.starIndex[id]?.name).filter(Boolean);
        html += `<div class="req">Benötigt: ${escapeHtml(names.join(' oder '))} Stufe 1</div>`;
      } else if (st !== 'max' && node.typ !== 'start') {
        const c = nodeCost(node, lvl);
        html += `<div class="cost ${nodeBlocker(node, save, this.data) ? 'no' : ''}">Kosten: ${costText(c)}</div>`;
        html += `<div class="hint">Klicken zum Kaufen · gedrückt halten für mehrere Stufen</div>`;
      } else if (st === 'max') html += '<div class="cost">MAX</div>';
    }
    box.innerHTML = html;
    const p = this.toScreen(node.position.x, node.position.y);
    const r = ((SIZE[node.typ] ?? 48) / 2) * this.cam.zoom + 24;
    const left = p.x + r + 460 > 1900 ? p.x - r - 460 : p.x + r;
    box.style.left = `${Math.max(10, left)}px`;
    box.style.top = `${Math.max(150, Math.min(760, p.y - 80))}px`;
    show('#star-info', true);
  }

  // ---------------------------------------------------------------------
  // Eingaben: Ziehen, Zoomen, Antippen, Gedrückthalten
  // ---------------------------------------------------------------------

  bind() {
    const cv = this.canvas;
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    let hold = null;

    const stopHold = () => { if (hold) { clearTimeout(hold.timer); clearInterval(hold.iv); hold = null; } };

    cv.addEventListener('pointerdown', (ev) => {
      cv.setPointerCapture(ev.pointerId);
      const p = stage.toStage(ev.clientX, ev.clientY);
      pointers.set(ev.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.cam.zoom };
        drag = null; stopHold();
        return;
      }
      drag = { x: p.x, y: p.y, camX: this.cam.x, camY: this.cam.y, moved: false, type: ev.pointerType };
      const node = this.nodeAt(p.x, p.y);
      if (node && ev.button === 0) {
        // Gedrückt halten: nach kurzer Zeit fortlaufend weitere Stufen kaufen
        hold = { node, bought: 0, timer: setTimeout(() => {
          if (!hold) return;
          hold.iv = setInterval(() => { if (!hold || !this.tryBuy(hold.node)) stopHold(); else hold.bought++; }, HOLD_INTERVAL);
        }, 350) };
      }
    });

    cv.addEventListener('pointermove', (ev) => {
      const p = stage.toStage(ev.clientX, ev.clientY);
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, p);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.setZoom(pinch.zoom * (d / pinch.d), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        return;
      }
      if (drag) {
        const dx = p.x - drag.x, dy = p.y - drag.y;
        if (Math.hypot(dx, dy) > 8) { drag.moved = true; stopHold(); cv.classList.add('dragging'); }
        if (drag.moved) {
          this.cam.x = drag.camX - dx / this.cam.zoom;
          this.cam.y = drag.camY - dy / this.cam.zoom;
          this.clampCam();
          show('#star-info', false);
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
      const p = stage.toStage(ev.clientX, ev.clientY);
      const node = this.nodeAt(p.x, p.y);
      if (!node) { this.tapped = null; show('#star-info', false); return; }
      if (d.type === 'mouse') { this.tryBuy(node); return; }
      // Touch: erstes Antippen zeigt Infos, zweites kauft
      if (this.tapped === node) this.tryBuy(node);
      else { this.tapped = node; this.showInfo(node); }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (!drag) { this.hover = null; show('#star-info', false); } });
    cv.addEventListener('contextmenu', (ev) => ev.preventDefault()); // Rechtsklick: nichts

    cv.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const i = ZOOMS.findIndex((z) => Math.abs(z - this.cam.zoom) < 0.01);
      const cur = i >= 0 ? i : ZOOMS.reduce((bi, z, k) => (Math.abs(z - this.cam.zoom) < Math.abs(ZOOMS[bi] - this.cam.zoom) ? k : bi), 0);
      const next = Math.max(0, Math.min(ZOOMS.length - 1, cur + (ev.deltaY < 0 ? 1 : -1)));
      this.setZoom(ZOOMS[next], stage.toStage(ev.clientX, ev.clientY));
      show('#star-info', false);
    }, { passive: false });

    $('#star-center').addEventListener('click', () => { this.centerOn(this.data.starIndex[this.map.start]); });
    $('#star-reset').addEventListener('click', async () => {
      const ok = await confirmDialog('Alle Punkte zurückerhalten? Alle gekauften Knoten werden zurückgesetzt.', 'Zurücksetzen', 'Abbrechen');
      if (!ok) return;
      const r = resetStarmap(this.data, this.save);
      this.game.persist();
      this.updateCurrency(false);
      this.anim = {};
      this.centerOn(this.data.starIndex[this.map.start]);
      play('unlock');
      if (r.mp || r.fs || r.kr) this.game.toast(`${r.mp} MP, ${r.fs} Foil-Staub und ${r.kr} Kristalle zurückerhalten`);
    });
    $('#star-back').addEventListener('click', () => this.game.goto(this.backTarget ?? 'hub'));
    // "Neuer Run": in den Hub (Packs kaufen); liegen schon Packs in der Tasche, direkt los
    $('#star-newrun').addEventListener('click', () => {
      const s = this.save.selection;
      if (this.save.shop.bag.length) this.game.startRun({ chapter: s.chapter, prestige: s.prestige || 0, gesucht: !!s.gesucht, modifierId: s.modifier || null });
      else this.game.goto('hub');
    });
  }

  // ---------------------------------------------------------------------
  // Zeichnen
  // ---------------------------------------------------------------------

  loop(now) {
    if (!this.active) return;
    const t = (now - this.t0) / 1000;
    const dt = Math.min(0.05, (now - (this.lastNow || now)) / 1000);
    this.lastNow = now;
    this.draw(t, dt, now);
    requestAnimationFrame(this.loop);
  }

  draw(t, dt, now) {
    const c = this.ctx;
    const z = this.cam.zoom;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    // Nachthimmel mit funkelnden Pixelsternen (leichte Parallaxe) und Nebeltextur
    c.fillStyle = '#0E0B1A';
    c.fillRect(0, 0, 1920, 1080);
    for (let i = 0; i < 220; i++) {
      const x = (hash(i, 1) * 2400 - this.cam.x * 0.15) % 1920;
      const y = (hash(i, 2) * 1400 - this.cam.y * 0.15) % 1080;
      const a = 0.25 + 0.75 * Math.abs(Math.sin(t * (0.5 + hash(i, 3)) + i));
      c.fillStyle = `rgba(244,235,217,${a.toFixed(2)})`;
      const s = hash(i, 4) > 0.85 ? 6 : 3;
      c.fillRect(Math.round((x + 1920) % 1920), Math.round((y + 1080) % 1080), s, s);
    }
    for (let i = 0; i < 6; i++) {
      const x = 960 + Math.sin(t * 0.03 + i * 2) * 600 - (this.cam.x - 2400) * 0.25;
      const y = 540 + Math.cos(t * 0.025 + i) * 300 - (this.cam.y - 2400) * 0.25;
      const g = c.createRadialGradient(x, y, 0, x, y, 520);
      g.addColorStop(0, i % 2 ? 'rgba(90,60,140,0.10)' : 'rgba(40,80,140,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 1920, 1080);
    }

    c.save();
    c.translate(960, 540);
    c.scale(z, z);
    c.translate(-this.cam.x, -this.cam.y);

    const nodes = this.map.knoten;
    const idx = this.data.starIndex;
    const vis = Object.fromEntries(nodes.map((n) => [n.id, this.visibility(n)]));
    const startNode = idx[this.map.start];

    // Verbindungslinien
    const drawn = new Set();
    for (const n of nodes) {
      for (const id of n.verbindungen) {
        const key = n.id < id ? `${n.id}|${id}` : `${id}|${n.id}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const m = idx[id];
        if (vis[n.id] === 'hidden' || vis[m.id] === 'hidden') continue;
        const both = nodeLevel(this.save, n.id) > 0 && nodeLevel(this.save, m.id) > 0;
        const col = this.data.branchIndex[n.ast === 'start' ? m.ast : n.ast]?.farbe ?? '#ffffff';
        c.lineWidth = both ? 8 : 5;
        c.strokeStyle = both ? col : 'rgba(150,150,170,0.45)';
        c.setLineDash(both ? [] : [14, 12]);
        c.beginPath(); c.moveTo(n.position.x, n.position.y); c.lineTo(m.position.x, m.position.y); c.stroke();
        c.setLineDash([]);
        if (both) {
          // kleine Lichtpunkte wandern vom Start nach außen
          const dn = Math.hypot(n.position.x - startNode.position.x, n.position.y - startNode.position.y);
          const dm = Math.hypot(m.position.x - startNode.position.x, m.position.y - startNode.position.y);
          const [a, b] = dn <= dm ? [n, m] : [m, n];
          for (let k = 0; k < 2; k++) {
            const f = (t * 0.5 + k * 0.5 + hash(a.position.x, b.position.y) ) % 1;
            c.fillStyle = '#ffffff';
            c.fillRect(Math.round(a.position.x + (b.position.x - a.position.x) * f) - 5, Math.round(a.position.y + (b.position.y - a.position.y) * f) - 5, 10, 10);
          }
        }
      }
    }

    // Knoten
    for (const n of nodes) if (vis[n.id] !== 'hidden') this.drawNode(n, vis[n.id], t, now);

    // Partikel
    for (const p of this.particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
      c.globalAlpha = Math.max(0, 1 - p.age / p.life);
      c.fillStyle = p.color;
      c.fillRect(Math.round(p.x) - 5, Math.round(p.y) - 5, 10, 10);
    }
    c.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.age < p.life);
    c.restore();

    this.drawFog(nodes, vis, now);

    // Hinweis-Pfeil beim ersten Öffnen
    if (this.hint && now < this.hint.until) {
      const p = this.toScreen(this.hint.node.position.x, this.hint.node.position.y);
      const bob = Math.sin(t * 6) * 8;
      c.fillStyle = '#FFD24A';
      c.beginPath(); c.moveTo(p.x, p.y - 50 + bob); c.lineTo(p.x - 24, p.y - 90 + bob); c.lineTo(p.x + 24, p.y - 90 + bob); c.closePath(); c.fill();
      c.font = 'bold 30px "Pixelify Sans", monospace';
      c.textAlign = 'center';
      c.lineWidth = 6; c.strokeStyle = '#1E1B2E';
      c.strokeText('Verbessere deinen Runenkreis!', p.x, p.y - 104 + bob);
      c.fillText('Verbessere deinen Runenkreis!', p.x, p.y - 104 + bob);
    }
  }

  drawNode(n, visState, t, now) {
    const c = this.ctx;
    const st = visState === 'edge' ? 'locked' : this.state(n);
    const col = n.typ === 'start' ? '#F4EBD9' : this.data.branchIndex[n.ast]?.farbe ?? '#ffffff';
    const lvl = nodeLevel(this.save, n.id);
    let size = SIZE[n.typ] ?? 48;
    const a = this.anim[n.id];
    if (a?.pop) {
      const k = (now - a.pop) / 250;
      if (k < 1) size *= 1 + Math.sin(k * Math.PI) * 0.35; // Federeffekt
    }
    const r = size / 2;
    const { x, y } = n.position;
    const dim = st === 'locked';
    const filled = lvl > 0;

    // Strahlenkranz für verfügbare Schlüsselknoten
    if (n.typ === 'schluessel' && (st === 'affordable' || st === 'expensive')) {
      for (let i = 0; i < 12; i++) {
        const ang = t * 0.4 + (i * Math.PI) / 6;
        c.fillStyle = 'rgba(255,210,74,0.25)';
        c.beginPath(); c.moveTo(x, y);
        c.lineTo(x + Math.cos(ang - 0.08) * r * 2.1, y + Math.sin(ang - 0.08) * r * 2.1);
        c.lineTo(x + Math.cos(ang + 0.08) * r * 2.1, y + Math.sin(ang + 0.08) * r * 2.1);
        c.fill();
      }
    }
    // Pulsierendes Leuchten (verfügbar + bezahlbar) bzw. ruhiges Leuchten (maximal)
    if (st === 'affordable' || st === 'boughtAffordable' || st === 'max') {
      const pulse = st === 'max' ? 0.35 : 0.3 + 0.3 * Math.sin(t * 3);
      c.fillStyle = st === 'max' ? `rgba(255,210,74,${pulse})` : this.alpha(col, pulse);
      this.shapePath(n.typ, x, y, r + 14);
      c.fill();
    }
    // Körper
    this.shapePath(n.typ, x, y, r);
    c.fillStyle = dim ? '#2a2836' : filled ? col : '#1E1B2E';
    c.fill();
    c.lineWidth = n.typ === 'schluessel' || st === 'max' ? 8 : 6;
    c.strokeStyle = st === 'max' || n.typ === 'schluessel' ? (dim ? '#6a6050' : '#FFD24A') : dim ? '#555566' : col;
    c.stroke();
    if (filled && n.typ !== 'start') { this.shapePath(n.typ, x, y, r - 8); c.fillStyle = this.alpha('#000000', 0.25); c.fill(); }

    // Symbol
    const icon = this.symbolImage(n);
    if (icon) {
      const s = Math.round(r * 1.15);
      c.globalAlpha = dim ? 0.35 : 1;
      c.drawImage(icon.img, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      if (icon.silhouette) { c.globalCompositeOperation = 'source-atop'; }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    // Stufenanzeige
    if (n.typ !== 'start' && (lvl > 0)) {
      c.font = 'bold 22px "Pixelify Sans", monospace';
      c.textAlign = 'center';
      c.lineWidth = 5; c.strokeStyle = '#0E0B1A';
      const label = lvl >= n.maxStufe ? 'MAX' : `${lvl}/${n.maxStufe}`;
      c.strokeText(label, x, y + r + 26);
      c.fillStyle = lvl >= n.maxStufe ? '#FFD24A' : '#F4EBD9';
      c.fillText(label, x, y + r + 26);
    }
    // Kreisender Funke um bezahlbare Knoten
    if (st === 'affordable' || st === 'boughtAffordable') {
      const ang = t * 2.5 + x;
      c.fillStyle = '#FFD24A';
      c.fillRect(Math.round(x + Math.cos(ang) * (r + 10)) - 5, Math.round(y + Math.sin(ang) * (r + 10)) - 5, 10, 10);
    }
    // Kosten rot anzeigen, wenn zu teuer und überfahren
    if (this.hover === n && st === 'expensive') {
      const cost = nodeCost(n, lvl);
      c.font = 'bold 22px "Pixelify Sans", monospace';
      c.textAlign = 'center';
      c.fillStyle = '#E04848';
      c.fillText(costText(cost), x, y - r - 14);
    }
  }

  symbolImage(n) {
    const bank = this.game.bank;
    const sym = n.symbol ?? (n.typ === 'freischalt' ? 'lock' : n.typ === 'start' ? 'rune' : null);
    if (!sym) return null;
    if (sym.startsWith('card:')) {
      const id = sym.slice(5);
      const card = this.data.cardIndex[id];
      const col = this.save.collection[id];
      const found = (col?.normal || 0) + (col?.foil || 0) > 0;
      const img = card.art === 'einheit' ? bank.unit(id).idle[0] : bank.tome(id);
      return { img: found ? img : this.silhouette(img), silhouette: !found };
    }
    return { img: bank.icon(sym) };
  }

  silhouette(img) {
    this.silCache ||= new Map();
    if (!this.silCache.has(img)) {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#3a3650';
      g.fillRect(0, 0, c.width, c.height);
      this.silCache.set(img, c);
    }
    return this.silCache.get(img);
  }

  shapePath(typ, x, y, r) {
    const c = this.ctx;
    c.beginPath();
    if (typ === 'gross') {
      for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3 + Math.PI / 6; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      c.closePath();
    } else if (typ === 'schluessel') {
      for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2; const rr = i % 2 ? r * 0.55 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      c.closePath();
    } else if (typ === 'freischalt') {
      c.rect(x - r, y - r, r * 2, r * 2);
    } else {
      c.arc(x, y, r, 0, Math.PI * 2);
    }
  }

  alpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(2)})`;
  }

  /** Nebel des Unbekannten: dunkle Schicht mit Löchern um sichtbare Knoten (lichtet sich weich beim ersten Kauf). */
  drawFog(nodes, vis, now) {
    this.fog ||= Object.assign(document.createElement('canvas'), { width: 960, height: 540 });
    const f = this.fog.getContext('2d');
    f.globalCompositeOperation = 'source-over';
    f.fillStyle = 'rgba(8,6,16,0.93)';
    f.clearRect(0, 0, 960, 540);
    f.fillRect(0, 0, 960, 540);
    f.globalCompositeOperation = 'destination-out';
    for (const n of nodes) {
      const v = vis[n.id];
      if (v === 'hidden') continue;
      const bought = nodeLevel(this.save, n.id) > 0;
      let rad = (bought ? 330 : v === 'visible' ? 190 : 110) * this.cam.zoom;
      const a = this.anim[n.id];
      if (a?.reveal) { const k = Math.min(1, (now - a.reveal) / 600); rad *= 0.35 + 0.65 * (1 - Math.pow(1 - k, 3)); }
      const p = this.toScreen(n.position.x, n.position.y);
      const g = f.createRadialGradient(p.x / 2, p.y / 2, 0, p.x / 2, p.y / 2, rad / 2);
      g.addColorStop(0, `rgba(0,0,0,${v === 'edge' ? 0.55 : 1})`);
      g.addColorStop(0.6, `rgba(0,0,0,${v === 'edge' ? 0.4 : 0.85})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = g;
      f.fillRect(p.x / 2 - rad / 2, p.y / 2 - rad / 2, rad, rad);
    }
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.fog, 0, 0, 1920, 1080);
    this.ctx.imageSmoothingEnabled = false;
  }
}
