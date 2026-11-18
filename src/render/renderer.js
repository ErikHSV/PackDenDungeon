// Kampf-Darstellung auf einem 1920×1080-Canvas (Draufsicht-Arena, Turm in der Mitte).
import { frameAt } from './sprites.js';
import { arenaFloor, worldOf } from './arena.js';
import { whiteOut, makeCanvas } from './pixel.js';

const PIXEL = '"Jersey 10", "Pixelify Sans", monospace';
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

  /**
   * Shiny-Glanz (7.5): diagonaler Regenbogen-Streifen wandert alle 1,5 s über die Figur (nur auf deren Pixeln).
   * img wird an (dx, dy) in (w × h) gezeichnet – im aktuellen Koordinatensystem.
   */
  shinySheen(img, dx, dy, w, h, t, seed = 0) {
    const k = ((t + seed * 0.37) % 1.5) / 1.5;
    if (k > 0.55) return;
    const W = Math.ceil(w), H = Math.ceil(h);
    if (!this.sheenCanvas || this.sheenCanvas.width < W || this.sheenCanvas.height < H) this.sheenCanvas = makeCanvas(Math.max(W, 128), Math.max(H, 128));
    const o = this.sheenCanvas.getContext('2d');
    o.imageSmoothingEnabled = false;
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, W, H);
    o.drawImage(img, 0, 0, W, H);
    o.globalCompositeOperation = 'source-atop';
    const p = -W + (k / 0.55) * (W * 2 + H);
    const g = o.createLinearGradient(p, 0, p + W * 0.7, H);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.35, 'rgba(255,140,220,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.65, 'rgba(120,230,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    o.fillStyle = g;
    o.fillRect(0, 0, W, H);
    this.ctx.drawImage(this.sheenCanvas, 0, 0, W, H, dx, dy, w, h);
  }

  /** Feine Glitzerpartikel, die gelegentlich über Shiny-Figuren aufsteigen. */
  glitter(x, top, w, h, t, seed) {
    const c = this.ctx;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.8 + i / 3 + seed * 0.13) % 1;
      const r = ((Math.floor(t * 0.8 + i / 3 + seed * 0.13) * 7919 + i * 104729 + seed * 31) % 1000) / 1000;
      const px = x - w / 2 + r * w, py = top + h * 0.8 - ph * (h + 14);
      c.globalAlpha = Math.sin(ph * Math.PI);
      c.fillStyle = RAINBOW[(i + Math.floor(t * 4)) % RAINBOW.length];
      const s = ph > 0.4 && ph < 0.6 ? 3 : 2;
      c.fillRect(Math.round(px), Math.round(py), s, s);
      if (s === 3) { c.fillRect(Math.round(px) - 2, Math.round(py) + 1, 1, 1); c.fillRect(Math.round(px) + 4, Math.round(py) + 1, 1, 1); }
    }
    c.globalAlpha = 1;
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
    for (const f of run.effects) if (f.type !== 'coin' && f.type !== 'shimmerFly') this.drawEffect(f, alpha);
    for (const f of run.effects) if (f.type === 'shimmerFly') this.drawShimmerFly(f);
    this.drawTowerBar(run);
    if (worldOf(run.chapter).thema === 'frost') this.drawSnow(t);
    if (run.freezeAll > 0) { c.fillStyle = 'rgba(166,227,255,0.12)'; c.fillRect(0, 0, 1920, 1080); }
    if (ui.bossIntro > 0) {
      c.fillStyle = `rgba(0,0,0,${Math.min(0.6, ui.bossIntro * 0.5).toFixed(2)})`;
      c.fillRect(0, 0, 1920, 1080);
      if (run.boss) this.drawEnemy(run, run.boss, t);
    }
    if (run.state === 'countdown') this.text(String(Math.ceil(run.countdown)), run.tower.x, run.tower.y - 130, 96, '#FFD24A');
    c.restore();
    if (ui.cursor) this.drawCursor(run, ui.cursor, t);
  }

  /** Frost: Schneeflocken fallen langsam. */
  drawSnow(t) {
    const c = this.ctx;
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 70; i++) {
      const sp = 20 + (i % 7) * 6;
      const x = ((i * 271) % 1920 + Math.sin(t * 0.6 + i) * 20 + 1920) % 1920;
      const y = ((i * 137) % 1080 + t * sp) % 1080;
      c.fillRect(Math.round(x), Math.round(y), i % 3 ? 2 : 3, i % 3 ? 2 : 3);
    }
  }

  drawTower(run) {
    const c = this.ctx;
    const tw = run.tower;
    const frac = tw.hp / tw.maxHp;
    const st = this.data.balance.turm.rissStufen;
    const cracks = st.filter((s) => frac < s).length;
    const light = worldOf(run.chapter).turmlicht;
    const img = this.bank.fieldTower(light, cracks, tw.hitFlash > 0);
    const x = tw.x - img.width / 2, y = tw.y + 16 - img.height;
    // Lichtschein in Kapitelfarbe am Turmfuß
    const g = c.createRadialGradient(tw.x, tw.y + 8, 0, tw.x, tw.y + 8, 70);
    g.addColorStop(0, light + '55'); g.addColorStop(1, light + '00');
    c.fillStyle = g; c.fillRect(tw.x - 70, tw.y - 62, 140, 140);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(tw.x, tw.y + 14, 26, 8, 0, 0, Math.PI * 2); c.fill();
    if (run.over && run.result && !run.result.sieg) {
      const k = Math.min(1, run.endAge / 1.4);
      const B = 8;
      for (let by = 0; by < img.height; by += B) for (let bx = 0; bx < img.width; bx += B) {
        const r = ((bx * 7919 + by * 104729) % 1000) / 1000;
        const kk = Math.max(0, k - (1 - by / img.height) * 0.3);
        c.globalAlpha = Math.max(0, 1 - kk);
        c.drawImage(img, bx, by, B, B, Math.round(x + bx + (r - 0.5) * 80 * kk), Math.round(y + by + kk * kk * (120 + r * 120)), B, B);
      }
      c.globalAlpha = 1;
      return;
    }
    c.drawImage(img, Math.round(x), Math.round(y));
    // Bollwerk: Schild um den Turm, solange er hält
    if (tw.shield > 0) {
      const a = 0.25 + 0.15 * Math.sin(run.time * 4);
      c.strokeStyle = `rgba(122,200,255,${(a + 0.3).toFixed(2)})`;
      c.fillStyle = `rgba(122,200,255,${(a * 0.4).toFixed(2)})`;
      c.lineWidth = 3;
      c.beginPath(); c.ellipse(tw.x, tw.y - 24, 44, 60, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  }

  /** Kleine Lebensleiste direkt über dem Turm – nur nach Schaden, verblasst nach 3 s. */
  drawTowerBar(run) {
    const tw = run.tower;
    if (run.over && !run.result?.sieg) return;
    if (tw.lastHit == null) return;
    const age = run.time - tw.lastHit;
    if (age > 3.5) return;
    this.ctx.globalAlpha = age < 3 ? 1 : 1 - (age - 3) / 0.5;
    this.bar(tw.x - 24, tw.y - 78, 48, 4, tw.hp / tw.maxHp, '#E04848');
    if (tw.shield > 0) this.bar(tw.x - 24, tw.y - 86, 48, 3, tw.shield / tw.maxShield, '#7ac8ff');
    this.ctx.globalAlpha = 1;
  }

  drawBuilding(b) {
    const c = this.ctx;
    const img = this.bank.building(b.id);
    c.drawImage(img, Math.round(b.x - img.width), Math.round(b.y - img.height * 2 + 6), img.width * 2, img.height * 2);
    const k = 1 - b.timer / b.interval;
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.beginPath(); c.arc(b.x, b.y - 58, 8, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#FFD24A';
    c.beginPath(); c.arc(b.x, b.y - 58, 8, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); c.stroke();
  }

  /** Pack wie im Shop: ca. 30×40 px, leicht gedreht auf dem Boden. */
  drawPack(p, t, ui) {
    const c = this.ctx;
    if (p.t < 0) return;
    const img = this.bank.shopItem(p.packId);
    const w = 30, h = 40;
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(p.landed ? p.x : p.tx, (p.landed ? p.y : p.ty) + 2, 16, 5, 0, 0, Math.PI * 2); c.fill();
    c.save();
    c.translate(Math.round(p.x), Math.round(p.y - h / 2));
    c.rotate((p.landed ? p.rot || 0 : p.t * 9) + (p.wobble > 0 ? Math.sin(p.wobble * 70) * 0.15 : 0));
    const halo = this.halo(img);
    c.globalAlpha = 0.5;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) c.drawImage(halo, -w / 2 + dx, -h / 2 + dy, w, h);
    c.globalAlpha = 1;
    c.drawImage(img, -w / 2, -h / 2, w, h);
    if (p.wobble > 0.12) { c.globalAlpha = 0.6; c.drawImage(halo, -w / 2, -h / 2, w, h); c.globalAlpha = 1; } // blinkt weiß beim Treffer
    // Risse
    c.strokeStyle = '#120a16'; c.lineWidth = 2;
    const cr = [[-8, -14, -2, -2, -6, 6], [8, -12, 3, 0, 9, 10], [-10, 4, -2, 14, 6, 8]];
    for (let i = 0; i < p.cracks; i++) { const q = cr[i]; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.lineTo(q[4], q[5]); c.stroke(); }
    // wandernder Folienglanz
    const k = (t * 0.6 + p.uid * 0.37) % 1.6;
    if (k < 1) { c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(-w / 2 + k * w - 2, -h / 2 + 3, 3, h - 6); }
    c.restore();
    if (p.landed && p.hp < p.maxHp) this.bar(p.x - 15, p.y + 6, 30, 3, p.hp / p.maxHp, '#F4EBD9');
  }

  /** Tome: Buch mit Motiv auf dem Einband, liegt leicht gedreht auf dem Boden und glimmt. */
  drawTome(tm, t, ui) {
    const c = this.ctx;
    const def = tm.def;
    const col = this.data.rarities[def.rarity].farbe;
    const x = tm.x, y = tm.y - 12;
    const glow = 0.35 + 0.25 * Math.sin(t * 3 + tm.bob);
    const g = c.createRadialGradient(x, y, 0, x, y, 34);
    const gc = tm.foil ? RAINBOW[Math.floor(t * 6) % RAINBOW.length] : col;
    g.addColorStop(0, gc + Math.round(glow * 255).toString(16).padStart(2, '0')); g.addColorStop(1, gc + '00');
    c.fillStyle = g; c.fillRect(x - 34, y - 34, 68, 68);
    const img = this.bank.tome(tm.id);
    const halo = this.halo(img);
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.rotate(tm.rot || 0);
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) c.drawImage(halo, -18 + dx, -18 + dy, 36, 36);
    c.drawImage(img, -18, -18, 36, 36);
    if (tm.foil) this.shinySheen(img, -18, -18, 36, 36, t, tm.uid);
    c.restore();
    if (tm.foil) this.glitter(x, y - 20, 36, 36, t, tm.uid);
    const hover = ui.cursor && Math.hypot(ui.cursor.x - x, ui.cursor.y - y) < 34;
    if (hover) { c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 26, 0, Math.PI * 2); c.stroke(); }
    if (tm.souls) this.text(`${tm.souls}`, x + 20, y - 14, 16, '#a6e3ff');
  }

  drawFlyingCard(card) {
    if (card.t < 0) return;
    const c = this.ctx;
    const k = Math.min(1, card.t / card.dur);
    const flip = card.shop ? 1 : Math.abs(Math.cos(k * Math.PI * 1.5));
    const def = this.data.cardIndex[card.id].def;
    const col = this.data.rarities[def.rarity].farbe;
    const w = 24 * Math.max(0.1, flip), h = 34;
    c.save();
    c.translate(Math.round(card.x), Math.round(card.y));
    c.fillStyle = '#1a1422'; c.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
    if (card.flipped || card.shop) {
      c.fillStyle = card.foil ? RAINBOW[Math.floor(card.t * 14) % 6] : col; c.fillRect(-w / 2, -h / 2, w, h);
      c.fillStyle = '#2a2640'; c.fillRect(-w / 2 + 2, -h / 2 + 2, Math.max(0, w - 4), h - 4);
      if (w > 14) {
        const img = this.data.cardIndex[card.id].art === 'tome' ? this.bank.tome(card.id) : this.bank.unit(card.id).idle[0];
        c.drawImage(img, -10, -14, 20, 20);
      }
    } else {
      c.fillStyle = '#C9A45C'; c.fillRect(-w / 2, -h / 2, w, h);
      c.fillStyle = '#3a2f66'; c.fillRect(-w / 2 + 2, -h / 2 + 2, Math.max(0, w - 4), h - 4);
    }
    c.restore();
  }

  drawUnit(run, u, t) {
    const c = this.ctx;
    const frames = this.bank.unit(u.id, u.def.sprite);
    const scale = u.giant ? 2 : 1; // Helden ca. 16–24 px hoch (Abschnitt 3)
    const size = 32 * scale;
    let img;
    if (u.hitFlash > 0.05) img = frames.hit[0];
    else if (u.attackAnim > 0) img = frames.attack[Math.min(5, Math.floor((0.3 - u.attackAnim) / 0.05))];
    else img = frameAt(frames, 'idle', u.animTime, u.moving ? 8 : 5);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(u.x, u.y, size * 0.3, size * 0.1, 0, 0, Math.PI * 2); c.fill();
    c.save();
    c.translate(Math.round(u.x), Math.round(u.y));
    if (u.facing < 0) c.scale(-1, 1);
    if (u.geist) c.globalAlpha = 0.55;
    if (u.foil) {
      const ol = this.bank.foilOutline(u.id, u.def.sprite, frames.idle[0]);
      const tint = this.tinted(ol, RAINBOW[Math.floor(t * 8) % RAINBOW.length]);
      for (const [dx, dy] of [[-scale, 0], [scale, 0], [0, -scale], [0, scale]]) c.drawImage(tint, -size / 2 + dx, -size + 4 + dy, size, size);
    }
    c.drawImage(img, -size / 2, -size + 4, size, size);
    if (u.foil) this.shinySheen(img, -size / 2, -size + 4, size, size, t, u.uid);
    c.restore();
    c.globalAlpha = 1;
    const top = u.y - size + 4;
    if (u.foil) this.glitter(u.x, top, size * 0.7, size, t, u.uid);
    if (u.frozen > 0) { c.fillStyle = 'rgba(166,227,255,0.45)'; c.fillRect(u.x - 12, top + 4, 24, size - 6); }
    // Grenzgänger: magentafarbenes Fragezeichen über der Figur
    if (u.def.rarity === 'grenzgaenger') c.drawImage(this.bank.icon('grenz'), Math.round(u.x - 7), Math.round(top - 16 + Math.sin(t * 4) * 2), 14, 14);
    if (u.hp < u.maxHp) this.bar(u.x - 12, top - 3, 24, 3, u.hp / u.maxHp, u.summoned ? '#a6e3ff' : '#5ED17A');
    if (u.life != null) this.bar(u.x - 12, top + 1, 24, 2, u.life / 20, '#b3a990');
  }

  drawEnemy(run, e, t) {
    const c = this.ctx;
    const frames = this.bank.enemy(e.id, e.elite);
    const size = frames.size; // Massenmonster klein, Elite ×2, Bosse 64 px
    let img;
    // Bosse blitzen bei Dauertreffern nur kurz auf, statt komplett weiß zu bleiben
    if (e.hitFlash > 0.05 && (!e.isBoss || Math.floor(t * 10) % 4 === 0)) img = frames.hit[0];
    else if (e.attackAnim > 0) img = frames.attack[Math.min(5, Math.floor((0.15 - e.attackAnim) / 0.025))];
    else img = frameAt(frames, 'idle', e.animTime, run.freezeAll > 0 || e.st.stun > 0 ? 0 : 7);
    const lift = e.fliegt ? 30 : 0;
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(e.x, e.y + 1, size * 0.3, size * 0.09, 0, 0, Math.PI * 2); c.fill();
    c.save();
    c.translate(Math.round(e.x), Math.round(e.y - lift));
    if (e.facing < 0) c.scale(-1, 1);
    if (e.spawnAge < 0.4) c.globalAlpha = e.spawnAge / 0.4;
    if (e.foil) {
      const tint = this.tinted(img, RAINBOW[Math.floor(t * 8) % RAINBOW.length]);
      c.globalAlpha *= 0.9;
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) c.drawImage(tint, -size / 2 + dx, -size + 2 + dy, size, size);
      c.globalAlpha = e.spawnAge < 0.4 ? e.spawnAge / 0.4 : 1;
    }
    c.drawImage(img, -size / 2, -size + 2, size, size);
    if (e.foil) this.shinySheen(img, -size / 2, -size + 2, size, size, t, e.uid);
    c.restore();
    c.globalAlpha = 1;
    const top = e.y - lift - size + 2;
    if (e.foil) this.glitter(e.x, top, size * 0.7, size, t, e.uid);
    // Statussymbole direkt am Monster
    const icons = [];
    if (e.st.slow.t > 0) icons.push('slow');
    if (e.st.burn.t > 0 || e.st.poison.t > 0) icons.push('burn');
    if (e.st.vuln.t > 0 || e.st.plague) icons.push('vuln');
    icons.forEach((n, i) => c.drawImage(this.bank.icon(n), Math.round(e.x - 12 + i * 12), Math.round(top - 12), 11, 11));
    if (e.st.stun > 0 || run.freezeAll > 0) {
      const z = this.bank.icon(run.freezeAll > 0 ? 'slow' : 'zap');
      for (let i = 0; i < 2; i++) { const a = t * 6 + i * Math.PI; c.drawImage(z, Math.round(e.x + Math.cos(a) * size * 0.4 - 6), Math.round(top + 2 + Math.sin(a) * 3), 12, 12); }
    }
    if (e.wasHit && !e.isBoss) this.bar(e.x - size * 0.4, top - 4, size * 0.8, 2, e.hp / e.maxHp, '#E04848');
    // Schrei mit Schwachpunkt (Medaillon)
    if (e.boss?.scream) {
      const s = e.boss.scream;
      const mx = e.x, my = e.y - size * 0.5;
      c.drawImage(this.bank.icon('medal'), mx - 16, my - 16, 32, 32);
      c.strokeStyle = '#FFD24A'; c.lineWidth = 4;
      c.beginPath(); c.arc(mx, my, 24, -Math.PI / 2, -Math.PI / 2 + (s.hits / s.need) * Math.PI * 2); c.stroke();
      this.text('Triff das Medaillon!', e.x, top - 30, 22, '#FFD24A');
      this.bar(e.x - 70, top - 22, 140, 6, 1 - s.t / s.max, '#ff7a2a');
    }
  }

  drawCorpse(k) {
    const frames = k.kind === 'unit' ? this.bank.unit(k.id, k.def.sprite) : this.bank.enemy(k.id, k.elite);
    const size = frames.size;
    this.ctx.drawImage(frameAt(frames, 'death', k.deathAge, 9), Math.round(k.x - size / 2), Math.round(k.y - size + 2 - (k.fliegt ? 30 : 0)), size, size);
  }

  drawProjectile(p) {
    const c = this.ctx;
    const x = Math.round(p.x), y = Math.round(p.y);
    c.fillStyle = '#1a1422'; c.fillRect(x - 4, y - 4, 8, 8);
    c.fillStyle = p.type === 'magic' ? (p.color || '#5AA9F0') : '#e8e0d0';
    c.fillRect(x - 3, y - 3, 6, 6);
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
      case 'text': this.text(f.text, f.x, f.y - k * 40, f.size || 20, f.color === 'rainbow' ? RAINBOW[Math.floor(f.age * 10) % RAINBOW.length] : f.color); break;
      case 'sparkles':
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2 + i;
          c.fillStyle = RAINBOW[i % RAINBOW.length];
          c.fillRect(Math.round(f.x + Math.cos(a) * 50 * k), Math.round(f.y + Math.sin(a) * 30 * k - k * 60), i % 3 ? 3 : 5, i % 3 ? 3 : 5);
        }
        break;
      case 'ring': c.strokeStyle = f.color; c.lineWidth = 6; c.beginPath(); c.ellipse(f.x, f.y, f.r * (0.4 + 0.6 * k), f.r * 0.6 * (0.4 + 0.6 * k), 0, 0, Math.PI * 2); c.stroke(); break;
      case 'burst':
        c.fillStyle = f.color;
        for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; c.fillRect(Math.round(f.x + Math.cos(a) * f.r * k), Math.round(f.y + Math.sin(a) * f.r * 0.6 * k), 8, 8); }
        break;
      case 'flash': {
        const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (0.5 + k));
        g.addColorStop(0, '#ffffff');
        if (f.color === 'rainbow') RAINBOW.forEach((col, i) => g.addColorStop(0.2 + i * 0.12, col + 'cc'));
        else g.addColorStop(0.35, f.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
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

  /** Schimmer: kleiner Regenbogen-Kristall springt aus der Quelle und fliegt zum Run-Zähler oben mittig. */
  drawShimmerFly(f) {
    const k = (f.age - (f.delay || 0)) / (f.life - (f.delay || 0));
    if (k < 0) return;
    const c = this.ctx;
    const ex = 960, ey = 34;
    let x, y;
    if (k < 0.3) { const j = k / 0.3; x = f.x; y = f.y - Math.sin(j * Math.PI) * 40 - j * 10; } // Sprung aus dem Monster
    else {
      const e = (k - 0.3) / 0.7, q = e * e;
      const sx = f.x, sy = f.y - 10, cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 120;
      x = (1 - q) * (1 - q) * sx + 2 * (1 - q) * q * cx + q * q * ex;
      y = (1 - q) * (1 - q) * sy + 2 * (1 - q) * q * cy + q * q * ey;
    }
    const s = 18;
    c.globalAlpha = k > 0.92 ? (1 - k) / 0.08 : 1;
    c.drawImage(this.bank.icon('crystal_regen'), Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    c.fillStyle = RAINBOW[Math.floor(f.age * 20) % RAINBOW.length];
    c.fillRect(Math.round(x) - 1, Math.round(y + s / 2 + 2), 2, 2);
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
  /** Cursor (Abschnitt 6): dünner, schlichter Kreis mit Mittelpunkt; blitzt beim Treffer kurz heller auf. */
  drawCursor(run, cur, t) {
    const c = this.ctx;
    const cs = run.cursorStats();
    const circles = run.cursor.circles ?? [{ x: cur.x, y: cur.y, r: cs.radius }];
    const hit = (run.cursor.hit || 0) > 0 && !cur.locked;
    const a = (cur.fade ?? 1) * (cur.locked ? 0.25 : hit ? 0.95 : 0.5);
    c.strokeStyle = `rgba(240,240,245,${a.toFixed(2)})`;
    c.fillStyle = c.strokeStyle;
    c.lineWidth = hit ? 2 : 1.5;
    circles.forEach((ci, i) => {
      const x = i === 0 ? cur.x : ci.x, y = i === 0 ? cur.y : ci.y;
      const r = i === 0 ? cs.radius : ci.r;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    });
    c.fillRect(Math.round(cur.x) - 1, Math.round(cur.y) - 1, 3, 3);
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
