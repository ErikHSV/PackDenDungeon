// Kampf-Darstellung auf einem 1920×1080-Canvas (Draufsicht-Arena, Turm in der Mitte).
import { frameAt } from './sprites.js';
import { arenaFloor } from './arena.js';
import { whiteOut, makeCanvas } from './pixel.js';

const PIXEL = '"Pixelify Sans", monospace';
const RAINBOW = ['#ff5a5a', '#ffb347', '#fff06a', '#6ae87a', '#5aa9f0', '#b77aff'];

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    canvas.width = 1920; canvas.height = 1080;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.data = game.data;
    this.bank = game.bank;
    this.shake = 0;
    this.coinTarget = { x: 120, y: 120 };
    this.tintCache = new Map();
    this.haloCache = new Map();
  }

  addShake(p) { if (this.game.save.settings.screenShake) this.shake = Math.max(this.shake, p); }

  /** Farbig getönte Kopie (für Foil-Regenbogen-Umrisse). */
  tinted(canvas, color) {
    const key = canvas;
    let m = this.tintCache.get(key);
    if (!m) { m = new Map(); this.tintCache.set(key, m); }
    if (!m.has(color)) {
      const c = makeCanvas(canvas.width, canvas.height);
      const g = c.getContext('2d');
      g.drawImage(canvas, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      m.set(color, c);
    }
    return m.get(color);
  }

  /** Heller Umriss (Packs und Tomes müssen sich vom Boden abheben). */
  halo(canvas) {
    if (!this.haloCache.has(canvas)) this.haloCache.set(canvas, whiteOut(canvas));
    return this.haloCache.get(canvas);
  }

  draw(run, t, dtReal, ui = {}) {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    let sx = 0, sy = 0;
    if (this.shake > 0.3) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; this.shake *= Math.pow(0.02, dtReal); } else this.shake = 0;
    c.save();
    c.translate(Math.round(sx), Math.round(sy));
    c.drawImage(arenaFloor(run.chapter, run.A), 0, 0);
    if (run.blizzard > 0) { c.fillStyle = 'rgba(230,245,255,0.12)'; c.fillRect(0, 0, 1920, 1080); }

    for (const b of run.buildings) this.drawBuilding(b);
    const alpha = this.game.save.settings.effectAlpha;
    for (const z of run.zones) this.drawZone(z, t, alpha);
    for (const tg of run.telegraphs) this.drawTelegraph(tg, t);

    // Tiefensortierung nach Fußpunkt
    const items = [];
    items.push([run.tower.y + 20, () => this.drawTower(run)]);
    for (const p of run.packs) items.push([p.landed ? p.y : p.ty, () => this.drawPack(p, t, ui)]);
    for (const tm of run.tomes) items.push([tm.y, () => this.drawTome(tm, t, ui)]);
    for (const u of run.units) items.push([u.y, () => this.drawUnit(run, u, t)]);
    for (const e of run.enemies) items.push([e.y, () => this.drawEnemy(run, e, t)]);
    for (const k of run.corpses) items.push([k.y, () => this.drawCorpse(k)]);
    items.sort((a, b) => a[0] - b[0]);
    for (const [, fn] of items) fn();

    for (const card of run.cards) this.drawFlyingCard(card);
    for (const p of run.projectiles) this.drawProjectile(p);
    for (const h of run.hammers) this.drawHammer(h, t);
    for (const f of run.effects) if (f.type !== 'coin') this.drawEffect(f, alpha);
    this.drawTowerBar(run);
    if (run.freezeAll > 0) { c.fillStyle = 'rgba(166,227,255,0.12)'; c.fillRect(0, 0, 1920, 1080); }
    if (ui.bossIntro > 0) {
      c.fillStyle = `rgba(0,0,0,${Math.min(0.6, ui.bossIntro * 0.5).toFixed(2)})`;
      c.fillRect(0, 0, 1920, 1080);
      if (run.boss) this.drawEnemy(run, run.boss, t);
    }
    if (run.state === 'countdown') this.text(String(Math.ceil(run.countdown)), run.tower.x, run.tower.y - 190, 120, '#FFD24A');
    c.restore();
    for (const f of run.effects) if (f.type === 'coin') this.drawCoin(f);
    if (ui.cursor) this.drawCursor(run, ui.cursor, t);
  }

  // ---------------------------------------------------------------------

  drawTower(run) {
    const c = this.ctx;
    const tw = run.tower;
    const frac = tw.hp / tw.maxHp;
    const st = this.data.balance.turm.rissStufen;
    const cracks = st.filter((s) => frac < s).length;
    const img = this.bank.tower(cracks, tw.hitFlash > 0);
    const x = tw.x - img.width / 2, y = tw.y - img.height + 30;
    if (run.over && run.result && !run.result.sieg) {
      const k = Math.min(1, run.endAge / 1.4);
      const B = 16;
      for (let by = 0; by < img.height; by += B) for (let bx = 0; bx < img.width; bx += B) {
        const r = ((bx * 7919 + by * 104729) % 1000) / 1000;
        const kk = Math.max(0, k - (1 - by / img.height) * 0.3);
        c.globalAlpha = Math.max(0, 1 - kk);
        c.drawImage(img, bx, by, B, B, Math.round(x + bx + (r - 0.5) * 140 * kk), Math.round(y + by + kk * kk * (250 + r * 250)), B, B);
      }
      c.globalAlpha = 1;
      return;
    }
    c.drawImage(img, Math.round(x), Math.round(y));
  }

  drawTowerBar(run) {
    const tw = run.tower;
    if (run.over && !run.result?.sieg) return;
    this.bar(tw.x - 75, tw.y + 40, 150, 12, tw.hp / tw.maxHp, '#E04848');
  }

  drawBuilding(b) {
    const c = this.ctx;
    const img = this.bank.building(b.id);
    c.drawImage(img, Math.round(b.x - 36), Math.round(b.y - 60), 72, 72);
    const k = 1 - b.timer / b.interval;
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.beginPath(); c.arc(b.x, b.y - 80, 16, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#FFD24A';
    c.beginPath(); c.arc(b.x, b.y - 80, 16, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); c.stroke();
  }

  drawPack(p, t, ui) {
    const c = this.ctx;
    const img = this.bank.pack(p.packId, p.cracks);
    const w = 48, h = 63;
    if (p.t < 0) return;
    // Schatten am Landepunkt
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(p.landed ? p.x : p.tx, (p.landed ? p.y : p.ty) + 4, 24, 8, 0, 0, Math.PI * 2); c.fill();
    c.save();
    c.translate(Math.round(p.x), Math.round(p.y));
    if (p.wobble > 0) c.rotate(Math.sin(p.wobble * 70) * 0.12);
    const halo = this.halo(img);
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) c.drawImage(halo, -w / 2 + dx, -h + dy, w, h);
    c.drawImage(img, -w / 2, -h, w, h);
    // wandernder Folienglanz
    const k = (t * 0.6 + p.uid * 0.37) % 1.6;
    if (k < 1) { c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-w / 2 + k * w - 4, -h + 6, 6, h - 12); }
    c.restore();
    if (p.landed && p.hp < p.maxHp) this.bar(p.x - 24, p.y + 8, 48, 6, p.hp / p.maxHp, '#F4EBD9');
  }

  drawTome(tm, t, ui) {
    const c = this.ctx;
    const def = tm.def;
    const col = this.data.rarities[def.rarity].farbe;
    const bob = Math.sin(tm.bob * 2) * 6;
    const x = tm.x, y = tm.y - 40 + bob;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(x, tm.y + 4, 20, 6, 0, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(x, y, 0, x, y, 50);
    g.addColorStop(0, col + 'aa'); g.addColorStop(1, col + '00');
    c.fillStyle = g; c.fillRect(x - 50, y - 50, 100, 100);
    const img = this.bank.tome(tm.id);
    const halo = this.halo(img);
    const hover = ui.cursor && Math.hypot(ui.cursor.x - x, ui.cursor.y - y) < 50;
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) c.drawImage(halo, x - 24 + dx, y - 24 + dy, 48, 48);
    c.drawImage(img, x - 24, y - 24, 48, 48);
    if (hover) { c.strokeStyle = '#FFD24A'; c.lineWidth = 4; c.setLineDash([8, 6]); c.beginPath(); c.arc(x, y, 38, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
    if (tm.souls) this.text(`${tm.souls}`, x + 26, y - 20, 22, '#a6e3ff');
  }

  drawFlyingCard(card) {
    if (card.t < 0) return;
    const c = this.ctx;
    const k = Math.min(1, card.t / card.dur);
    const flip = Math.abs(Math.cos(k * Math.PI * 1.5));
    const def = this.data.cardIndex[card.id].def;
    const col = this.data.rarities[def.rarity].farbe;
    const w = 40 * Math.max(0.1, flip), h = 56;
    c.save();
    c.translate(Math.round(card.x), Math.round(card.y));
    c.fillStyle = '#1a1422'; c.fillRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
    if (card.flipped) {
      c.fillStyle = card.foil ? RAINBOW[Math.floor(k * 12) % 6] : col; c.fillRect(-w / 2, -h / 2, w, h);
      c.fillStyle = '#2a2640'; c.fillRect(-w / 2 + 4, -h / 2 + 4, Math.max(0, w - 8), h - 8);
      if (w > 24) {
        const img = this.data.cardIndex[card.id].art === 'tome' ? this.bank.tome(card.id) : this.bank.unit(card.id).idle[0];
        c.drawImage(img, -16, -20, 32, 32);
      }
    } else {
      c.fillStyle = '#C9A45C'; c.fillRect(-w / 2, -h / 2, w, h);
      c.fillStyle = '#3a2f66'; c.fillRect(-w / 2 + 4, -h / 2 + 4, Math.max(0, w - 8), h - 8);
    }
    c.restore();
  }

  drawUnit(run, u, t) {
    const c = this.ctx;
    const frames = this.bank.unit(u.id, u.def.sprite);
    const scale = u.giant ? 4 : 3;
    const size = 32 * scale;
    let img;
    if (u.hitFlash > 0.05) img = frames.hit[0];
    else if (u.attackAnim > 0) img = frames.attack[Math.min(5, Math.floor((0.3 - u.attackAnim) / 0.05))];
    else img = frameAt(frames, 'idle', u.animTime, u.moving ? 8 : 5);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(u.x, u.y + 2, size * 0.25, size * 0.08, 0, 0, Math.PI * 2); c.fill();
    c.save();
    c.translate(Math.round(u.x), Math.round(u.y));
    if (u.facing < 0) c.scale(-1, 1);
    if (u.geist) c.globalAlpha = 0.55;
    if (u.foil) {
      const ol = this.bank.foilOutline(u.id, u.def.sprite, frames.idle[0]);
      const tint = this.tinted(ol, RAINBOW[Math.floor(t * 8) % RAINBOW.length]);
      for (const [dx, dy] of [[-scale, 0], [scale, 0], [0, -scale], [0, scale]]) c.drawImage(tint, -size / 2 + dx, -size + dy, size, size);
    }
    c.drawImage(img, -size / 2, -size, size, size);
    c.restore();
    c.globalAlpha = 1;
    if (u.frozen > 0) { c.fillStyle = 'rgba(166,227,255,0.45)'; c.fillRect(u.x - 30, u.y - size + 10, 60, size - 10); }
    if (u.hp < u.maxHp) this.bar(u.x - 28, u.y - size - 4, 56, 6, u.hp / u.maxHp, u.summoned ? '#a6e3ff' : '#5ED17A');
    if (u.life != null) this.bar(u.x - 28, u.y - size + 4, 56, 3, u.life / 20, '#b3a990');
  }

  drawEnemy(run, e, t) {
    const c = this.ctx;
    const frames = this.bank.enemy(e.id, e.elite);
    const scale = e.isBoss ? 2 : e.elite ? 2 : 3;
    const size = frames.size * scale;
    let img;
    // Bosse blitzen bei Dauertreffern nur kurz auf, statt komplett weiß zu bleiben
    if (e.hitFlash > 0.05 && (!e.isBoss || Math.floor(t * 10) % 4 === 0)) img = frames.hit[0];
    else if (e.attackAnim > 0) img = frames.attack[Math.min(5, Math.floor((0.15 - e.attackAnim) / 0.025))];
    else img = frameAt(frames, 'idle', e.animTime, run.freezeAll > 0 || e.st.stun > 0 ? 0 : 7);
    const lift = e.fliegt ? 60 : 0;
    if (e.fliegt || true) { c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(e.x, e.y + 2, size * 0.25, size * 0.07, 0, 0, Math.PI * 2); c.fill(); }
    c.save();
    c.translate(Math.round(e.x), Math.round(e.y - lift));
    if (e.facing < 0) c.scale(-1, 1);
    if (e.spawnAge < 0.4) c.globalAlpha = e.spawnAge / 0.4;
    if (e.foil) {
      const tint = this.tinted(img, RAINBOW[Math.floor(t * 8) % RAINBOW.length]);
      c.globalAlpha *= 0.9;
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) c.drawImage(tint, -size / 2 + dx, -size + dy, size, size);
      c.globalAlpha = e.spawnAge < 0.4 ? e.spawnAge / 0.4 : 1;
    }
    c.drawImage(img, -size / 2, -size, size, size);
    c.restore();
    c.globalAlpha = 1;
    const top = e.y - lift - size;
    // Statussymbole
    const icons = [];
    if (e.st.slow.t > 0) icons.push('slow');
    if (e.st.burn.t > 0 || e.st.poison.t > 0) icons.push('burn');
    if (e.st.vuln.t > 0 || e.st.plague) icons.push('vuln');
    icons.forEach((n, i) => c.drawImage(this.bank.icon(n), e.x - 30 + i * 22, top - 26, 20, 20));
    if (e.st.stun > 0 || run.freezeAll > 0) {
      const star = this.bank.icon(run.freezeAll > 0 ? 'slow' : 'stun');
      for (let i = 0; i < 3; i++) { const a = t * 5 + (i * Math.PI * 2) / 3; c.drawImage(star, Math.round(e.x + Math.cos(a) * 24 - 8), Math.round(top + 8 + Math.sin(a) * 6), 16, 16); }
    }
    if (e.wasHit && !e.isBoss) this.bar(e.x - size * 0.3, top - 6, size * 0.6, 5, e.hp / e.maxHp, '#E04848');
    // Schrei mit Schwachpunkt (Medaillon)
    if (e.boss?.scream) {
      const s = e.boss.scream;
      const mx = e.x, my = e.y - size * 0.55;
      c.drawImage(this.bank.icon('medal'), mx - 24, my - 24, 48, 48);
      c.strokeStyle = '#FFD24A'; c.lineWidth = 5;
      c.beginPath(); c.arc(mx, my, 34, -Math.PI / 2, -Math.PI / 2 + (s.hits / s.need) * Math.PI * 2); c.stroke();
      this.text('Triff das Medaillon!', e.x, top - 40, 24, '#FFD24A');
      this.bar(e.x - 100, top - 30, 200, 10, 1 - s.t / s.max, '#ff7a2a');
    }
  }

  drawCorpse(k) {
    const frames = k.kind === 'unit' ? this.bank.unit(k.id, k.def.sprite) : this.bank.enemy(k.id, k.elite);
    const scale = k.kind === 'unit' ? 3 : k.isBoss || k.elite ? 2 : 3;
    const size = frames.size * scale;
    this.ctx.drawImage(frameAt(frames, 'death', k.deathAge, 9), Math.round(k.x - size / 2), Math.round(k.y - size - (k.fliegt ? 60 : 0)), size, size);
  }

  drawProjectile(p) {
    const c = this.ctx;
    const x = Math.round(p.x), y = Math.round(p.y);
    c.fillStyle = '#1a1422'; c.fillRect(x - 7, y - 7, 14, 14);
    c.fillStyle = p.type === 'magic' ? (p.color || '#5AA9F0') : '#d8d0c0';
    c.fillRect(x - 5, y - 5, 10, 10);
  }

  drawHammer(h, t) {
    const c = this.ctx;
    // Zielmarkierung am Boden
    const k = Math.min(1, h.t / h.flight);
    c.strokeStyle = h.parryable ? '#FFD24A' : 'rgba(224,72,72,0.85)';
    c.lineWidth = 5;
    c.beginPath(); c.ellipse(h.tx, h.ty, h.r * (1.4 - k * 0.4), h.r * 0.4 * (1.4 - k * 0.4), 0, 0, Math.PI * 2); c.stroke();
    c.save();
    c.translate(h.x, h.y);
    c.rotate(t * 10);
    c.drawImage(this.bank.icon('hammer'), -28, -28, 56, 56);
    c.restore();
    if (h.parryable && !h.parried) { c.strokeStyle = '#FFD24A'; c.lineWidth = 4; c.beginPath(); c.arc(h.x, h.y, 40 + Math.sin(t * 30) * 4, 0, Math.PI * 2); c.stroke(); }
  }

  drawZone(z, t, alpha) {
    const c = this.ctx;
    const fade = Math.min(1, z.t / 0.4);
    const colors = { brand: '255,122,42', wirbel: '220,235,255', riss: '122,74,255', gift: '155,232,74' };
    c.fillStyle = `rgba(${colors[z.type] ?? '255,255,255'},${(0.35 * alpha * fade).toFixed(2)})`;
    c.beginPath(); c.ellipse(z.x, z.y, z.r, z.r * 0.6, z.type === 'wirbel' ? t * 4 : 0, 0, Math.PI * 2); c.fill();
    if (z.type === 'wirbel') {
      c.strokeStyle = `rgba(255,255,255,${(0.6 * fade).toFixed(2)})`; c.lineWidth = 3;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(z.x, z.y - i * 18, z.r * (0.4 + i * 0.25), z.r * 0.15, t * 6 + i, 0, Math.PI * 1.5); c.stroke(); }
    }
  }

  drawTelegraph(tg, t) {
    const c = this.ctx;
    const k = 1 - tg.time / tg.max;
    const pulse = 0.5 + 0.5 * Math.sin(t * 18);
    c.strokeStyle = `rgba(224,72,72,${(0.6 + 0.4 * pulse).toFixed(2)})`;
    c.fillStyle = `rgba(224,72,72,${(0.12 + 0.2 * k).toFixed(2)})`;
    c.lineWidth = 5;
    c.beginPath(); c.ellipse(tg.x, tg.y, tg.r, tg.r * 0.55, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(tg.x, tg.y, tg.r * k, tg.r * 0.55 * k, 0, 0, Math.PI * 2); c.stroke();
  }

  drawEffect(f, alpha) {
    const c = this.ctx;
    const k = f.age / f.life;
    c.globalAlpha = Math.max(0, 1 - k);
    switch (f.type) {
      case 'text': this.text(f.text, f.x, f.y - k * 40, f.size || 20, f.color); break;
      case 'ring': c.strokeStyle = f.color; c.lineWidth = 6; c.beginPath(); c.ellipse(f.x, f.y, f.r * (0.4 + 0.6 * k), f.r * 0.6 * (0.4 + 0.6 * k), 0, 0, Math.PI * 2); c.stroke(); break;
      case 'burst':
        c.fillStyle = f.color;
        for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; c.fillRect(Math.round(f.x + Math.cos(a) * f.r * k), Math.round(f.y + Math.sin(a) * f.r * 0.6 * k), 8, 8); }
        break;
      case 'flash': {
        const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (0.5 + k));
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, f.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(f.x - f.r * 2, f.y - f.r * 2, f.r * 4, f.r * 4);
        break;
      }
      case 'arc': c.strokeStyle = f.color; c.lineWidth = 8; c.beginPath(); c.arc(f.x, f.y, f.r, Math.PI * 0.6, Math.PI * 1.4); c.stroke(); break;
      case 'cone':
        c.fillStyle = f.color; c.globalAlpha *= 0.5;
        c.beginPath(); c.moveTo(f.x, f.y); c.arc(f.x, f.y, f.r, f.dir - f.half, f.dir + f.half); c.closePath(); c.fill();
        break;
      case 'bolt': {
        c.strokeStyle = '#ffffff'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(f.x1, f.y1);
        for (let i = 1; i < 5; i++) c.lineTo(f.x1 + (f.x2 - f.x1) * (i / 5) + (Math.random() - 0.5) * 22, f.y1 + (f.y2 - f.y1) * (i / 5) + (Math.random() - 0.5) * 22);
        c.lineTo(f.x2, f.y2); c.stroke(); c.strokeStyle = f.color; c.lineWidth = 2; c.stroke();
        break;
      }
      case 'slash': c.fillStyle = f.color; for (let i = -3; i <= 3; i++) c.fillRect(Math.round(f.x + i * 5), Math.round(f.y - 30 + i * 5), 6, 6); break;
      case 'dust': c.fillStyle = 'rgba(220,210,190,0.7)'; for (let i = 0; i < 6; i++) c.fillRect(Math.round(f.x + (i - 3) * 10 * (1 + k)), Math.round(f.y - k * 10), 8, 6); break;
      case 'splinter': c.fillStyle = f.color; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.fillRect(Math.round(f.x + Math.cos(a) * 40 * k), Math.round(f.y + Math.sin(a) * 30 * k + k * k * 30), 6, 4); } break;
      case 'pillar': {
        const g = c.createLinearGradient(f.x, f.y - 400, f.x, f.y);
        g.addColorStop(0, 'rgba(255,240,180,0)'); g.addColorStop(1, 'rgba(255,240,180,0.8)');
        c.fillStyle = g; c.fillRect(f.x - 30 * (1 - k * 0.5), f.y - 400, 60 * (1 - k * 0.5), 400);
        break;
      }
      case 'glitch': for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#2EE6D6' : '#E62E9A'; c.fillRect(f.x - 40 + Math.random() * 60, f.y - 90 + i * 14, 30, 4); } break;
      case 'soul': {
        const x = f.x1 + (f.x2 - f.x1) * k, y = f.y1 + (f.y2 - f.y1) * k - Math.sin(k * Math.PI) * 80;
        c.fillStyle = '#a6e3ff'; c.fillRect(Math.round(x) - 6, Math.round(y) - 6, 12, 12);
        break;
      }
      case 'hail': c.fillStyle = '#e8f8ff'; for (let i = 0; i < 4; i++) c.fillRect(Math.round(f.x + (i - 2) * 12), Math.round(f.y - (1 - k) * 200 - i * 8), 6, 10); break;
      case 'rays':
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + f.age * 0.8; const len = 300 + 1000 * k;
          c.fillStyle = i % 2 ? 'rgba(255,240,180,0.5)' : 'rgba(255,210,74,0.4)';
          c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x + Math.cos(a - 0.05) * len, f.y + Math.sin(a - 0.05) * len); c.lineTo(f.x + Math.cos(a + 0.05) * len, f.y + Math.sin(a + 0.05) * len); c.fill();
        }
        break;
      case 'goldrain': {
        c.globalAlpha = 1;
        const coin = this.bank.icon('coin');
        for (let i = 0; i < 80; i++) { const r1 = ((i * 7919) % 1000) / 1000, r2 = ((i * 104729) % 1000) / 1000; c.drawImage(coin, Math.round(r1 * 1900), Math.round(-40 + ((f.age * (500 + r2 * 400) + r1 * 900) % 1120)), 24, 24); }
        break;
      }
    }
    c.globalAlpha = 1;
  }

  /** Münze fliegt im Bogen zur Münzanzeige oben links. */
  drawCoin(f) {
    const k = (f.age - (f.delay || 0)) / (f.life - (f.delay || 0));
    if (k < 0) return;
    const sx = f.x + (f.seed - 0.5) * 40, sy = f.y - 30;
    const ex = this.coinTarget.x, ey = this.coinTarget.y;
    const e = k * k;
    const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 200;
    const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * ex;
    const y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * ey;
    this.ctx.drawImage(this.bank.icon('coin'), Math.round(x - 12), Math.round(y - 12), 24, 24);
  }

  /** Runenkreis: blau (leer), orange pulsierend (etwas im Kreis), grau (gesperrt). */
  drawCursor(run, cur, t) {
    const c = this.ctx;
    const cs = run.cursorStats();
    const circles = run.cursor.circles ?? [{ x: cur.x, y: cur.y, r: cs.radius }];
    const locked = cur.locked;
    const busy = run.cursor.busy && !locked;
    const col = locked ? '#7a7a8a' : busy ? '#FF9A3A' : '#5AA9F0';
    const pulse = busy ? 1 + Math.sin(t * 14) * 0.06 : 1;
    c.globalAlpha = cur.fade ?? 1;
    circles.forEach((ci, i) => {
      const r = (i === 0 ? cs.radius : ci.r) * pulse * (run.cursor.pulse > 0 ? 1.08 : 1);
      const x = i === 0 ? cur.x : ci.x, y = i === 0 ? cur.y : ci.y;
      c.strokeStyle = '#1a1422'; c.lineWidth = 7;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = col; c.lineWidth = 4;
      c.setLineDash([10, 6]); c.lineDashOffset = -t * 30;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      for (let k = 0; k < 6; k++) { const a = t * 1.6 + (k * Math.PI) / 3; c.fillStyle = col; c.fillRect(Math.round(x + Math.cos(a) * r) - 4, Math.round(y + Math.sin(a) * r) - 4, 8, 8); }
    });
    c.fillStyle = col;
    c.fillRect(cur.x - 10, cur.y - 1, 20, 3); c.fillRect(cur.x - 1, cur.y - 10, 3, 20);
    c.globalAlpha = 1;
  }

  text(str, x, y, size, color, align = 'center') {
    const c = this.ctx;
    c.font = `${size}px ${PIXEL}`;
    c.textAlign = align;
    c.lineWidth = Math.max(3, size / 5);
    c.strokeStyle = '#1a1422';
    c.strokeText(str, x, y);
    c.fillStyle = color;
    c.fillText(str, x, y);
  }

  bar(x, y, w, h, frac, color) {
    const c = this.ctx;
    x = Math.round(x); y = Math.round(y); w = Math.round(w);
    c.fillStyle = '#1a1422'; c.fillRect(x - 2, y - 2, w + 4, h + 4);
    c.fillStyle = '#3a3048'; c.fillRect(x, y, w, h);
    c.fillStyle = color; c.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
  }
}
