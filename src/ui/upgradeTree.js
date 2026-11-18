// Reiter UPGRADE (14.2.5): Skill-Tree als Schaltplan über dem abgedunkelten Bild der eigenen Basis.
// Quadratische Knoten (48 px), rechtwinklige gelbe Leitungen, Symbol + Eckabzeichen, Nebel (unentdeckte Knoten fehlen).
import { $, escapeHtml, show, stage, confirmDialog, countTo } from './dom.js';
import { levelOf, nodeCost, nodeBlocker, buyNode, nodeReachable, describeNodeEffect, resetStarmap, nodeVisibleInAct, computeMods } from '../core/meta.js';
import { hash } from '../render/pixel.js';
import { play } from '../audio.js';

const NODE = 48;
const ZMIN = 0.55, ZMAX = 1.5;
const HOLD_INTERVAL = 150;
const LINE = '#C8C24A', LINE_ON = '#FFD24A', FRAME = '#C8C24A';
const TYPE_NAME = { klein: 'Knoten', gross: 'Großer Knoten', schluessel: 'Schlüsselknoten', freischalt: 'Freischaltung', start: 'Ursprung' };
const costText = (c) => `${c.amount} ${c.waehrung === 'foilstaub' ? 'Foil-Staub' : 'MP'}${c.kristalle ? ` + ${c.kristalle} Kristalle` : ''}`;

export class UpgradeTree {
  constructor(game) {
    this.game = game;
    this.canvas = $('#tree-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.anim = {};
    this.particles = [];
    this.hover = null;
    this.tapped = null;
    this.active = false;
    this.jumpIndex = 0;
    this.t0 = performance.now();
    this.loop = this.loop.bind(this);
    this.bind();
  }

  get data() { return this.game.data; }
  get save() { return this.game.save; }
  get map() { return this.game.data.starmap; }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(200, Math.round(r.width / stage.scale));
    this.H = Math.max(200, Math.round(r.height / stage.scale));
    if (this.canvas.width !== this.W || this.canvas.height !== this.H) { this.canvas.width = this.W; this.canvas.height = this.H; }
  }

  open() {
    this.active = true;
    this.resize();
    if (!this.centered) {
      this.centered = true;
      this.centerOn(this.data.starIndex[this.save.lastBought] ?? this.data.starIndex[this.map.start]);
    }
    this.updateCurrency(false);
    show('#tree-info', false);
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    if (!this.save.tutorial.starmapOpened) {
      const n = this.map.knoten.find((k) => k.ast === 'cursor' && !nodeBlocker(k, this.save, this.data));
      if (n) { this.save.tutorial.starmapOpened = true; this.game.persist(); this.hint = { node: n, until: performance.now() + 7000 }; }
    }
  }

  close() { this.active = false; this.hint = null; show('#tree-info', false); cancelAnimationFrame(this.raf); }

  // ---------------------------------------------------------------------
  // Kamera
  // ---------------------------------------------------------------------

  centerOn(node) { this.cam.x = node.position.x; this.cam.y = node.position.y; this.clampCam(); }

  clampCam() {
    const W = this.map.groesse.breite, H = this.map.groesse.hoehe;
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

  /** Punkt im Canvas (lokale Koordinaten) aus einem Pointer-Ereignis. */
  local(ev) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / stage.scale, y: (ev.clientY - r.top) / stage.scale };
  }

  // ---------------------------------------------------------------------
  // Zustände
  // ---------------------------------------------------------------------

  cardMissing(node) {
    const card = node.voraussetzung?.karte;
    const c = card && this.save.collection[card];
    return !!card && !((c?.normal || 0) + (c?.foil || 0) > 0);
  }

  /** Sichtbar = gekauft oder an einen gekauften Knoten angeschlossen. Alles andere bleibt im Dunkeln. */
  visible(node) {
    if (!nodeVisibleInAct(node, this.save)) return false;
    return levelOf(this.save, node.id) > 0 || nodeReachable(node, this.save);
  }

  state(node) {
    const lvl = levelOf(this.save, node.id);
    if (node.typ === 'start') return 'max';
    if (lvl >= node.maxStufe) return 'max';
    if (this.cardMissing(node)) return 'locked';
    const blocked = nodeBlocker(node, this.save, this.data);
    if (lvl > 0) return blocked ? 'bought' : 'boughtAffordable';
    return blocked ? 'expensive' : 'affordable';
  }

  nodeAt(sx, sy) {
    const w = this.toWorld(sx, sy);
    const r = NODE / 2 + 6;
    return this.map.knoten.find((n) => this.visible(n) && Math.abs(n.position.x - w.x) <= r && Math.abs(n.position.y - w.y) <= r) ?? null;
  }

  // ---------------------------------------------------------------------
  // Kaufen
  // ---------------------------------------------------------------------

  tryBuy(node) {
    const save = this.save;
    const firstTime = levelOf(save, node.id) === 0;
    const before = { mp: save.mastery, kr: save.crystals, fs: save.foilDust };
    if (!buyNode(node, save, this.data)) { play('error'); return false; }
    this.game.persist();
    const skip = save.settings.skipAnimations;
    const color = this.data.branchIndex[node.ast]?.farbe ?? '#ffffff';
    this.anim[node.id] = { pop: skip ? 0 : performance.now(), reveal: firstTime && !skip ? performance.now() : this.anim[node.id]?.reveal };
    if (!skip) for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 200;
      this.particles.push({ x: node.position.x, y: node.position.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, age: 0, color });
    }
    if (skip) this.updateCurrency(false);
    else { countTo($('#tree-mp'), before.mp, save.mastery, 350); countTo($('#tree-kr'), before.kr, save.crystals, 350); countTo($('#tree-fs'), before.fs, save.foilDust, 350); }
    if (node.typ === 'schluessel' && !skip) {
      play('keystone');
      const b = $('#tree-banner');
      b.innerHTML = `<h2>${escapeHtml(node.name)}</h2><p>${escapeHtml(node.beschreibung)}</p>`;
      b.classList.remove('hidden');
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => b.classList.add('hidden'), 3000);
    } else play('buy');
    this.hint = null;
    this.showInfo(node);
    this.game.hub?.onUpgradeBought();
    return true;
  }

  updateCurrency(animate = true) {
    if (!animate) { $('#tree-mp').textContent = this.save.mastery; $('#tree-kr').textContent = this.save.crystals; $('#tree-fs').textContent = this.save.foilDust; }
    const foilVisible = this.map.knoten.some((n) => n.waehrung === 'foilstaub' && this.visible(n)) || this.save.foilDust > 0;
    $('#tree-fs-wrap').classList.toggle('hidden', !foilVisible);
  }

  // ---------------------------------------------------------------------
  // Info-Fenster
  // ---------------------------------------------------------------------

  showInfo(node) {
    if (!node) { show('#tree-info', false); return; }
    const save = this.save;
    const lvl = levelOf(save, node.id);
    const st = this.state(node);
    const box = $('#tree-info');
    const col = this.data.branchIndex[node.ast]?.farbe ?? '#fff';
    let html = `<h3 style="color:${col}">${escapeHtml(this.cardMissing(node) ? '???' : node.name)}</h3>
      <div class="typ">${TYPE_NAME[node.typ]} · ${escapeHtml(this.data.branchIndex[node.ast]?.name ?? '')}</div>`;
    if (this.cardMissing(node)) html += '<div class="req">Finde diese Karte, um ihre Upgrades freizuschalten.</div>';
    else {
      html += `<div>${escapeHtml(node.beschreibung)}</div>`;
      if (node.typ !== 'start') {
        if ('wert' in node.effekt && node.maxStufe > 1) {
          html += `<div>Aktuell: ${escapeHtml(describeNodeEffect(node, lvl))}</div>`;
          if (lvl < node.maxStufe) html += `<div class="next">Nächste Stufe: ${escapeHtml(describeNodeEffect(node, lvl + 1))}</div>`;
        }
        html += `<div>Stufe ${lvl}/${node.maxStufe}</div>`;
        if (st === 'max') html += '<div class="cost">MAXIMUM ✓</div>';
        else {
          const c = nodeCost(node, lvl);
          const why = nodeBlocker(node, save, this.data);
          html += `<div class="cost ${why ? 'no' : ''}">Kosten: ${costText(c)}</div>`;
          if (why && !/Zu wenig/.test(why)) html += `<div class="req">${escapeHtml(why)}</div>`;
          else html += '<div class="hint">Klicken zum Kaufen · gedrückt halten für mehrere Stufen</div>';
        }
      }
    }
    box.innerHTML = html;
    const p = this.toScreen(node.position.x, node.position.y);
    const r = (NODE / 2) * this.cam.zoom + 18;
    const left = p.x + r + 430 > this.W - 80 ? p.x - r - 430 : p.x + r;
    box.style.left = `${Math.max(10, left)}px`;
    box.style.top = `${Math.max(70, Math.min(this.H - 260, p.y - 70))}px`;
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
      if (node && ev.button === 0) {
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
      if (!node) { this.tapped = null; show('#tree-info', false); return; }
      if (d.type === 'mouse') { this.tryBuy(node); return; }
      if (this.tapped === node) this.tryBuy(node); else { this.tapped = node; this.showInfo(node); }
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

    // Navigationsleiste
    $('#tree-jump').addEventListener('click', () => {
      const list = this.map.knoten.filter((n) => this.visible(n) && n.typ !== 'start' && !nodeBlocker(n, this.save, this.data));
      if (!list.length) { play('error'); this.game.toast('Gerade ist kein Knoten bezahlbar.', true); return; }
      const n = list[this.jumpIndex++ % list.length];
      this.centerOn(n);
      this.hint = { node: n, until: performance.now() + 1500, quiet: true };
      play('click');
    });
    const pan = (dir) => { this.cam.y += dir * this.H * 0.6 / this.cam.zoom; this.clampCam(); play('click'); show('#tree-info', false); };
    $('#tree-up').addEventListener('click', () => pan(-1));
    $('#tree-down').addEventListener('click', () => pan(1));
    $('#tree-reset').addEventListener('click', async () => {
      if (!(await confirmDialog('Alle Punkte zurückerhalten? Alle gekauften Upgrades werden zurückgesetzt.', 'Zurücksetzen', 'Abbrechen'))) return;
      const r = resetStarmap(this.data, this.save);
      this.game.persist();
      this.updateCurrency(false);
      this.anim = {};
      this.centerOn(this.data.starIndex[this.map.start]);
      play('unlock');
      if (r.mp || r.fs || r.kr) this.game.toast(`${r.mp} MP, ${r.kr} Kristalle und ${r.fs} Foil-Staub zurückerhalten`);
      this.game.hub?.onUpgradeBought();
    });
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

  /** Abgedunkeltes Bild der eigenen Basis: Turm in der Mitte, gebaute Gebäude daneben. */
  drawBase(c, t) {
    const { bank, data } = this.game;
    c.fillStyle = '#120a16';
    c.fillRect(0, 0, this.W, this.H);
    for (let i = 0; i < 90; i++) {
      const a = 0.15 + 0.35 * Math.abs(Math.sin(t * (0.4 + hash(i, 3)) + i));
      c.fillStyle = `rgba(244,235,217,${a.toFixed(2)})`;
      c.fillRect(Math.round(hash(i, 1) * this.W), Math.round(hash(i, 2) * this.H), 3, 3);
    }
    const cx = this.W / 2, cy = this.H * 0.56;
    c.fillStyle = '#1d1424';
    c.beginPath(); c.ellipse(cx, cy + 40, 420, 150, 0, 0, Math.PI * 2); c.fill();
    const tower = bank.tower(0);
    c.globalAlpha = 0.4;
    c.drawImage(tower, Math.round(cx - tower.width / 2), Math.round(cy - tower.height + 60));
    const mods = this.mods ?? computeMods(data, this.save);
    data.buildings.forEach((b, i) => {
      if (!mods.gebaeude[b.id]) return;
      const img = bank.building(b.id);
      const x = cx + (i - 1) * 240 + (i === 1 ? 0 : 0), y = cy + 60 + (i === 1 ? 70 : 0);
      c.drawImage(img, Math.round(x - img.width * 2), Math.round(y - img.height * 2), img.width * 4, img.height * 4);
    });
    c.globalAlpha = 1;
  }

  draw(t, dt, now) {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    this.mods = computeMods(this.data, this.save);
    this.drawBase(c, t);

    const z = this.cam.zoom;
    c.save();
    c.translate(this.W / 2, this.H / 2);
    c.scale(z, z);
    c.translate(-this.cam.x, -this.cam.y);

    const nodes = this.map.knoten;
    const idx = this.data.starIndex;
    const vis = Object.fromEntries(nodes.map((n) => [n.id, this.visible(n)]));

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
        // von oben nach unten bzw. vom Start weg zeichnen
        const [a, b] = Math.abs(n.position.y - this.map.groesse.hoehe / 2) <= Math.abs(m.position.y - this.map.groesse.hoehe / 2) ? [n, m] : [m, n];
        const both = levelOf(this.save, n.id) > 0 && levelOf(this.save, m.id) > 0;
        const fade = !(vis[n.id] && vis[m.id]); // eine Seite im Dunkeln: Leitung endet im Dunkeln
        this.wire(c, a.position, b.position, both ? LINE_ON : LINE, both ? 3 : 2, fade ? (vis[a.id] ? 'end' : 'start') : null);
        if (both && !this.save.settings.skipAnimations) {
          const f = (t * 0.6 + hash(a.position.x, b.position.y)) % 1;
          const p = this.alongWire(a.position, b.position, f);
          c.fillStyle = '#fff6c0';
          c.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 6, 6);
        }
      }
    }

    for (const n of nodes) if (vis[n.id]) this.drawNode(n, t, now);

    for (const p of this.particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
      c.globalAlpha = Math.max(0, 1 - p.age / p.life);
      c.fillStyle = p.color;
      c.fillRect(Math.round(p.x) - 4, Math.round(p.y) - 4, 8, 8);
    }
    c.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.age < p.life);
    c.restore();

    if (this.hint && now < this.hint.until) {
      const p = this.toScreen(this.hint.node.position.x, this.hint.node.position.y);
      const bob = Math.sin(t * 6) * 6;
      c.fillStyle = '#FFD24A';
      c.beginPath(); c.moveTo(p.x, p.y - 36 + bob); c.lineTo(p.x - 18, p.y - 66 + bob); c.lineTo(p.x + 18, p.y - 66 + bob); c.closePath(); c.fill();
      if (!this.hint.quiet) {
        c.font = 'bold 26px "Pixelify Sans", monospace';
        c.textAlign = 'center';
        c.lineWidth = 6; c.strokeStyle = '#120a16';
        c.strokeText('Verbessere deinen Runenkreis!', p.x, p.y - 78 + bob);
        c.fillText('Verbessere deinen Runenkreis!', p.x, p.y - 78 + bob);
      }
    }
  }

  wirePoints(a, b) {
    if (a.x === b.x || a.y === b.y) return [a, b];
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

  drawNode(n, t, now) {
    const c = this.ctx;
    const st = this.state(n);
    const lvl = levelOf(this.save, n.id);
    let size = n.typ === 'start' ? 64 : n.typ === 'schluessel' ? 56 : NODE;
    const a = this.anim[n.id];
    if (a?.pop) { const k = (now - a.pop) / 250; if (k < 1) size *= 1 + Math.sin(k * Math.PI) * 0.3; }
    const h = size / 2;
    const { x, y } = n.position;
    const locked = st === 'locked';
    const bought = lvl > 0 || n.typ === 'start';

    // Rahmen-Leuchten
    if (st === 'affordable' || st === 'boughtAffordable') {
      const pulse = 0.35 + 0.35 * Math.sin(t * 4);
      c.fillStyle = `rgba(255,246,160,${pulse.toFixed(2)})`;
      c.fillRect(x - h - 6, y - h - 6, size + 12, size + 12);
    }
    if (st === 'max' && n.typ !== 'start') { c.fillStyle = 'rgba(255,210,74,0.35)'; c.fillRect(x - h - 5, y - h - 5, size + 10, size + 10); }
    c.fillStyle = '#1a1020';
    c.fillRect(x - h, y - h, size, size);
    c.lineWidth = 3;
    c.strokeStyle = locked ? '#55505c' : st === 'max' ? '#FFD24A' : bought ? '#FFD24A' : FRAME;
    c.strokeRect(x - h + 1.5, y - h + 1.5, size - 3, size - 3);

    // Symbol
    const img = this.symbolImage(n);
    if (img) {
      const s = Math.round(size * 0.72);
      c.globalAlpha = locked ? 0.3 : bought ? 1 : st === 'affordable' ? 0.85 : 0.5;
      if (locked) c.filter = 'grayscale(1) brightness(0.6)';
      c.drawImage(img, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      c.filter = 'none';
      c.globalAlpha = 1;
    }
    // Eckabzeichen oben rechts
    if (n.abzeichen && !locked) {
      const bs = 20;
      c.fillStyle = '#120a16';
      c.fillRect(x + h - bs + 4, y - h - 4, bs, bs);
      c.drawImage(this.game.bank.icon(n.abzeichen), x + h - bs + 6, y - h - 2, bs - 4, bs - 4);
    }
    // Maximal: kleiner Haken
    if (st === 'max' && n.typ !== 'start') c.drawImage(this.game.bank.icon('check'), x - h - 6, y + h - 14, 20, 20);
    // Stufe
    if (n.typ !== 'start' && n.maxStufe > 1 && lvl > 0) {
      c.font = 'bold 16px "Pixelify Sans", monospace';
      c.textAlign = 'center';
      c.lineWidth = 4; c.strokeStyle = '#120a16';
      const label = `${lvl}/${n.maxStufe}`;
      c.strokeText(label, x, y + h + 16);
      c.fillStyle = lvl >= n.maxStufe ? '#FFD24A' : '#F4EBD9';
      c.fillText(label, x, y + h + 16);
    }
  }

  symbolImage(n) {
    const bank = this.game.bank;
    const sym = n.symbol ?? 'rune';
    if (sym.startsWith('card:')) {
      const id = sym.slice(5);
      const card = this.data.cardIndex[id];
      if (!card) return bank.icon('sword');
      return card.art === 'einheit' ? bank.unit(id).idle[0] : bank.tome(id);
    }
    return bank.icon(sym);
  }
}
