// Zeichnet den Kampf auf einen Canvas in Referenzauflösung 1920×1080.
// Weltkoordinaten (Spielfeld) liegen zwischen oberer Leiste (90 px) und unterer Leiste (180 px).
// Pixel-Grafik wird ganzzahlig und ohne Weichzeichnen skaliert.
import { SpriteBank, frameAt } from './sprites.js';
import { drawBackground } from './backgrounds.js';

const STAGE_W = 1920;
const STAGE_H = 1080;
const PIXEL_FONT = '"Pixelify Sans", "Press Start 2P", monospace';
const FPS = { idle: 5, walk: 7, attack: 20, death: 10 };

export class Renderer {
  constructor(canvas, data, bank = new SpriteBank(data)) {
    this.canvas = canvas;
    this.canvas.width = STAGE_W;
    this.canvas.height = STAGE_H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.data = data;
    this.bank = bank;
    this.F = data.balance.field;
    this.S = data.balance.sprites.scale;
    this.selected = null;
    this.shake = 0;
    this.shakeEnabled = true;
    this.bossIntro = 0;
    this.goldTarget = { x: 1560, y: 45 }; // Position der Gold-Anzeige (Bühnenkoordinaten), wird von der UI gesetzt
  }

  addShake(power) {
    if (this.shakeEnabled) this.shake = Math.max(this.shake, power);
  }

  /** Bühnen- → Weltkoordinaten (für Klicks). */
  toWorld(stageX, stageY) {
    return { x: stageX, y: stageY - this.F.offsetY };
  }

  draw(run, t, dtReal) {
    const c = this.ctx;
    const F = this.F;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, STAGE_W, STAGE_H);
    c.imageSmoothingEnabled = false;

    // Bildschirmwackeln
    let sx = 0, sy = 0;
    if (this.shake > 0.2) {
      sx = Math.round((Math.random() - 0.5) * this.shake);
      sy = Math.round((Math.random() - 0.5) * this.shake);
      this.shake *= Math.pow(0.02, dtReal);
    } else this.shake = 0;

    c.save();
    c.translate(sx, F.offsetY + sy);
    c.beginPath();
    c.rect(-20, 0, STAGE_W + 40, F.height);
    c.clip();

    drawBackground(c, run.chapter.id, STAGE_W, F.height, t, 0);
    this.drawPortal(t);
    for (const z of run.zones) this.drawZone(z, t);
    for (const tg of run.telegraphs) this.drawTelegraph(tg, t);
    this.drawSlots(run);
    if (run.iceWall) this.drawIceWall(run.iceWall);

    // Tiefensortierung: weiter hinten (kleineres y der Füße) zuerst
    const things = [];
    for (const h of run.heroes) things.push([h.footY, () => this.drawHero(run, h, t)]);
    for (const m of run.minions) things.push([m.y + 20, () => this.drawMinion(m)]);
    for (const e of run.enemies) things.push([this.footOf(e), () => this.drawEnemy(run, e, t)]);
    for (const e of run.corpses || []) things.push([this.footOf(e), () => this.drawCorpse(e)]);
    things.sort((a, b) => a[0] - b[0]);
    this.drawTower(run);
    for (const [, fn] of things) fn();

    for (const p of run.projectiles) this.drawProjectile(p);
    for (const f of run.effects) if (f.type !== 'coin') this.drawEffect(f);
    this.drawBuffs(run);

    // Boss-Intro: Spielfeld abdunkeln, nur der Boss bleibt hell
    if (this.bossIntro > 0) {
      const boss = run.enemies.find((e) => e.boss);
      c.fillStyle = `rgba(0,0,0,${Math.min(0.65, this.bossIntro * 0.5).toFixed(2)})`;
      c.fillRect(-20, 0, STAGE_W + 40, F.height);
      if (boss) this.drawEnemy(run, boss, t);
      this.bossIntro = Math.max(0, this.bossIntro - dtReal);
    }
    c.restore();

    // Münzen fliegen über das Spielfeld hinaus bis zur Gold-Anzeige
    for (const f of run.effects) if (f.type === 'coin') this.drawCoin(f);
  }

  footOf(e) {
    if (e.flying) return e.y + 40;
    return e.y + e.size;
  }

  // ---------------------------------------------------------------------

  drawPortal(t) {
    const c = this.ctx;
    const x = this.F.spawnX + 10;
    const y = this.F.groundY - 90;
    for (let i = 0; i < 6; i++) {
      const r = 60 - i * 8 + Math.sin(t * 3 + i) * 4;
      c.fillStyle = i % 2 ? 'rgba(160,140,200,0.18)' : 'rgba(90,70,140,0.22)';
      c.fillRect(Math.round((x - r * 0.55) / 4) * 4, Math.round((y - r) / 4) * 4, Math.round(r * 1.1 / 4) * 4, Math.round(r * 2 / 4) * 4);
    }
    c.fillStyle = 'rgba(230,220,255,0.25)';
    for (let i = 0; i < 8; i++) {
      const a = t * 1.5 + i * 0.8;
      c.fillRect(Math.round((x + Math.cos(a) * 28) / 4) * 4, Math.round((y + Math.sin(a) * 50) / 4) * 4, 4, 4);
    }
  }

  drawTower(run) {
    const c = this.ctx;
    const img = this.bank.tower(run.tower.hitFlash > 0);
    const top = this.F.groundY - img.height + 8;
    if (run.over && run.result && !run.result.victory) {
      // Niederlage: Der Turm bricht in Pixelteilen zusammen
      const k = Math.min(1, (run.endAge || 0) / 1.4);
      const B = 20;
      for (let by = 0; by < img.height; by += B) for (let bx = 0; bx < img.width; bx += B) {
        const r = ((bx * 7919 + by * 104729) % 1000) / 1000;
        const delay = (1 - by / img.height) * 0.4 + r * 0.2;
        const kk = Math.max(0, (k - delay * 0.6) / (1 - delay * 0.6));
        const dy = kk * kk * (300 + r * 300);
        const dx = (r - 0.5) * 160 * kk;
        c.globalAlpha = Math.max(0, 1 - kk * 0.9);
        c.drawImage(img, bx, by, B, B, Math.round(bx + dx), Math.round(top + by + dy), B, B);
      }
      c.globalAlpha = 1;
      return;
    }
    c.drawImage(img, 0, top);
  }

  drawTelegraph(tg, t) {
    const c = this.ctx;
    const k = 1 - tg.time / tg.maxTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * 18);
    c.strokeStyle = `rgba(224,72,72,${(0.6 + 0.4 * pulse).toFixed(2)})`;
    c.fillStyle = `rgba(224,72,72,${(0.15 + 0.25 * k).toFixed(2)})`;
    c.lineWidth = 6;
    c.beginPath();
    c.ellipse(tg.x, tg.y - 6, tg.r, tg.r * 0.32, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.ellipse(tg.x, tg.y - 6, tg.r * k, tg.r * 0.32 * k, 0, 0, Math.PI * 2);
    c.stroke();
  }

  drawSlots(run) {
    const c = this.ctx;
    this.F.slots.forEach((s, i) => {
      const occupied = run.heroes.some((h) => h.slot === i);
      if (occupied) return;
      const unlocked = i < run.slotCount;
      c.strokeStyle = unlocked ? 'rgba(244,235,217,0.55)' : 'rgba(244,235,217,0.18)';
      c.lineWidth = 4;
      c.setLineDash([8, 8]);
      c.beginPath();
      c.ellipse(s.x, s.y - 4, 40, 14, 0, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      if (!unlocked) c.drawImage(this.bank.icon('lock'), s.x - 18, s.y - 52, 36, 36);
    });
  }

  drawHero(run, h, t) {
    const c = this.ctx;
    const frames = this.bank.hero(h.id);
    const size = frames.size * this.S;
    const x = Math.round(h.x - size / 2);
    const y = Math.round(h.footY - size);
    let img;
    if (!h.alive) {
      if (h.deathAge != null && h.deathAge < 0.5) img = frameAt(frames, 'death', h.deathAge, FPS.death);
      else {
        c.globalAlpha = 0.35;
        c.drawImage(frames.death[0], x, y, size, size);
        c.globalAlpha = 1;
        this.text(`${Math.ceil(h.reviveTimer)}`, h.x, y + 30, 26, '#F4EBD9');
        return;
      }
    } else if (h.hitFlash > 0.05) img = frames.hit[0];
    else if (h.attackAnim > 0) img = frames.attack[Math.min(5, Math.floor((0.3 - h.attackAnim) / 0.05))];
    else img = frameAt(frames, 'idle', h.animTime, FPS.idle);

    c.drawImage(img, x, y, size, size);

    if (!h.alive) return;
    if (h.freeze > 0) {
      c.fillStyle = 'rgba(166,227,255,0.45)';
      c.fillRect(x + 12, y + 8, size - 24, size - 8);
    }
    if (h.root > 0) {
      c.fillStyle = '#6b4a2e';
      for (let i = 0; i < 4; i++) c.fillRect(x + 20 + i * 16, h.footY - 30 - (i % 2) * 8, 6, 30 + (i % 2) * 8);
    }
    // Sterne über dem Kopf
    const star = this.bank.icon('stun');
    const sw = 18;
    const sx = h.x - (h.stars * sw) / 2;
    for (let i = 0; i < h.stars; i++) c.drawImage(star, Math.round(sx + i * sw), y - 4, sw, sw);
    // kleine Lebensleiste, wenn verletzt
    if (h.hp < h.maxHp - 0.5) this.bar(h.x - 30, y - 12, 60, 6, h.hp / h.maxHp, '#5ED17A');
    if (this.selected === h) {
      c.strokeStyle = 'rgba(244,235,217,0.6)';
      c.setLineDash([10, 10]);
      c.lineWidth = 3;
      c.beginPath();
      c.arc(h.x, h.y, Math.max(60, h.def.stats.range), 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
  }

  drawMinion(m) {
    const c = this.ctx;
    const frames = this.bank.minion();
    const size = frames.size * this.S * 0.67;
    c.globalAlpha = Math.min(1, m.life / 2);
    const img = m.attackAnim > 0 ? frames.attack[3] : frameAt(frames, 'idle', m.animTime, FPS.idle);
    c.drawImage(img, Math.round(m.x - size / 2), Math.round(m.y + 20 - size), size, size);
    c.globalAlpha = 1;
    this.bar(m.x - 20, m.y - 30, 40, 5, m.hp / m.maxHp, '#cfe8cf');
  }

  enemyFrames(e) {
    return this.bank.enemy(e.id, e.elite);
  }

  drawEnemy(run, e, t) {
    const c = this.ctx;
    const frames = this.enemyFrames(e);
    const size = frames.size * this.S;
    const foot = this.footOf(e);
    const x = Math.round(e.x - size / 2);
    const y = Math.round(foot - size);

    if (e.flying) {
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.beginPath();
      c.ellipse(e.x, this.F.groundY + 4, size * 0.3, size * 0.08, 0, 0, Math.PI * 2);
      c.fill();
    }
    let img;
    if (e.hitFlash > 0.05) img = frames.hit[0];
    else if (e.attackAnim > 0) img = frames.attack[Math.min(5, Math.floor((0.15 - e.attackAnim) / 0.025))];
    else img = frameAt(frames, 'idle', e.animTime, e.st.stun > 0 ? 0 : FPS.walk);
    if (e.spawnAge < 0.4) c.globalAlpha = e.spawnAge / 0.4; // tritt aus dem Nebelportal
    c.drawImage(img, x, y, size, size);
    c.globalAlpha = 1;

    // Statussymbole
    const icons = [];
    if (e.isSlowed) icons.push('slow');
    if (e.st.burn.time > 0) icons.push('burn');
    if (e.st.vuln.time > 0 || run.buffs.curse.time > 0) icons.push('vuln');
    icons.forEach((name, i) => c.drawImage(this.bank.icon(name), x + i * 26, y - 30, 24, 24));
    if (e.st.stun > 0) {
      const star = this.bank.icon('stun');
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + (i * Math.PI * 2) / 3;
        c.drawImage(star, Math.round(e.x + Math.cos(a) * size * 0.3 - 9), Math.round(y + 6 + Math.sin(a) * 8), 18, 18);
      }
    }
    // Lebensleiste erst nach dem ersten Treffer (Bosse haben die große Leiste oben)
    if (e.wasHit && !e.boss) this.bar(e.x - size * 0.35, y - 8, size * 0.7, 6, e.hp / e.maxHp, '#E04848');
    if (e.bossState?.charging > 0) {
      this.text('Schrei lädt …', e.x, y - 30, 26, '#F4EBD9');
      this.bar(e.x - 90, y - 20, 180, 12, 1 - e.bossState.charging / e.bossState.chargeMax, '#ff7a2a');
    }
  }

  drawCorpse(e) {
    const frames = this.enemyFrames(e);
    const size = frames.size * this.S;
    const foot = this.footOf(e);
    this.ctx.drawImage(frameAt(frames, 'death', e.deathAge, FPS.death), Math.round(e.x - size / 2), Math.round(foot - size), size, size);
  }

  drawProjectile(p) {
    const c = this.ctx;
    const x = Math.round(p.x / 4) * 4, y = Math.round(p.y / 4) * 4;
    c.fillStyle = '#1a1422';
    if (p.shape === 'bird') {
      c.fillRect(x - 10, y - 6, 20, 12);
      c.fillStyle = '#9a6a3a';
      c.fillRect(x - 8, y - 4, 16, 8);
      c.fillStyle = '#f2b630';
      c.fillRect(x + 8, y - 2, 4, 4);
    } else if (p.shape === 'bolt' || p.isTower) {
      c.fillRect(x - 10, y - 4, 20, 8);
      c.fillStyle = p.color;
      c.fillRect(x - 8, y - 2, 16, 4);
    } else {
      c.fillRect(x - 6, y - 6, 12, 12);
      c.fillStyle = p.type === 'magic' ? '#5AA9F0' : p.color;
      c.fillRect(x - 4, y - 4, 8, 8);
      if (p.type === 'magic') { c.fillStyle = '#ffffff'; c.fillRect(x - 2, y - 2, 4, 4); }
    }
  }

  drawZone(z, t) {
    const c = this.ctx;
    const a = Math.min(1, z.time / 0.5);
    if (z.type === 'ice') {
      c.fillStyle = `rgba(166,227,255,${(0.35 * a).toFixed(2)})`;
      c.beginPath(); c.ellipse(z.x, this.F.groundY - 4, z.r, 30, 0, 0, Math.PI * 2); c.fill();
      const ice = this.bank.icon('slow');
      for (let i = 0; i < 4; i++) c.drawImage(ice, Math.round(z.x - z.r * 0.6 + i * z.r * 0.4), this.F.groundY - 20 - (i % 2) * 10, 20, 20);
    } else {
      c.fillStyle = `rgba(255,${100 + Math.round(Math.sin(t * 6) * 30)},30,${(0.45 * a).toFixed(2)})`;
      c.beginPath(); c.ellipse(z.x, z.y + 40, z.r, z.r * 0.35, 0, 0, Math.PI * 2); c.fill();
    }
  }

  drawIceWall(w) {
    const c = this.ctx;
    const top = this.F.groundY - 150;
    c.fillStyle = '#1a1422';
    c.fillRect(w.x - 16, top - 4, 32, 160);
    c.fillStyle = `rgba(190,235,255,${(0.7 + 0.3 * Math.min(1, w.time)).toFixed(2)})`;
    c.fillRect(w.x - 12, top, 24, 152);
    c.fillStyle = '#ffffff';
    c.fillRect(w.x - 8, top + 8, 4, 60);
  }

  drawEffect(f) {
    const c = this.ctx;
    const k = f.age / f.life;
    c.globalAlpha = Math.max(0, 1 - k);
    switch (f.type) {
      case 'text':
        this.text(f.text, f.x, f.y - k * 40, f.size || 20, f.color);
        break;
      case 'ring':
        c.strokeStyle = f.color;
        c.lineWidth = 6;
        c.beginPath(); c.arc(f.x, f.y, f.r * (0.4 + 0.6 * k), 0, Math.PI * 2); c.stroke();
        break;
      case 'burst':
        c.fillStyle = f.color;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const r = f.r * k;
          c.fillRect(Math.round((f.x + Math.cos(a) * r) / 4) * 4, Math.round((f.y + Math.sin(a) * r * 0.6) / 4) * 4, 8, 8);
        }
        break;
      case 'arc':
        c.strokeStyle = f.color;
        c.lineWidth = 8;
        c.beginPath(); c.arc(f.x, f.y, f.r, Math.PI * 0.6, Math.PI * 1.4); c.stroke();
        break;
      case 'bolt': {
        c.strokeStyle = '#ffffff';
        c.lineWidth = f.width || 4;
        c.beginPath();
        c.moveTo(f.x1, f.y1);
        const n = 5;
        for (let i = 1; i < n; i++) {
          const tx = f.x1 + (f.x2 - f.x1) * (i / n) + (Math.random() - 0.5) * 24;
          const ty = f.y1 + (f.y2 - f.y1) * (i / n) + (Math.random() - 0.5) * 24;
          c.lineTo(tx, ty);
        }
        c.lineTo(f.x2, f.y2);
        c.stroke();
        c.strokeStyle = f.color;
        c.lineWidth = 2;
        c.stroke();
        break;
      }
      case 'line':
      case 'dash':
        c.strokeStyle = f.color;
        c.lineWidth = (f.width || 2) * 2;
        c.beginPath(); c.moveTo(f.x1, f.y1); c.lineTo(f.x2, f.y2); c.stroke();
        break;
      case 'slash':
        c.fillStyle = f.color;
        for (let i = -3; i <= 3; i++) c.fillRect(Math.round(f.x + i * 5), Math.round(f.y + i * 5), 6, 6);
        break;
      case 'rays': {
        // Boss explodiert in Lichtstrahlen
        c.globalAlpha = Math.max(0, 1 - k * 0.8);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + f.age * 0.8;
          const len = 300 + 900 * k;
          c.fillStyle = i % 2 ? 'rgba(255,240,180,0.55)' : 'rgba(255,210,74,0.45)';
          c.beginPath();
          c.moveTo(f.x, f.y);
          c.lineTo(f.x + Math.cos(a - 0.05) * len, f.y + Math.sin(a - 0.05) * len);
          c.lineTo(f.x + Math.cos(a + 0.05) * len, f.y + Math.sin(a + 0.05) * len);
          c.closePath();
          c.fill();
        }
        c.fillStyle = `rgba(255,255,255,${Math.max(0, 0.8 - k).toFixed(2)})`;
        c.beginPath(); c.arc(f.x, f.y, 60 + 200 * k, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'goldrain': {
        c.globalAlpha = 1;
        const coin = this.bank.icon('coin');
        for (let i = 0; i < 70; i++) {
          const r1 = ((i * 7919) % 1000) / 1000, r2 = ((i * 104729) % 1000) / 1000;
          const y = -40 + ((f.age * (500 + r2 * 400) + r1 * 900) % (this.F.height + 40));
          c.drawImage(coin, Math.round(r1 * 1900), Math.round(y), 24, 24);
        }
        break;
      }
      case 'towerfall':
        break; // wird in drawTower gezeichnet
      case 'rocks': {
        const rock = this.bank.icon('rock');
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const rr = f.r * 0.6 * (((i * 37) % 10) / 10);
          c.drawImage(rock, Math.round(f.x + Math.cos(a) * rr - 16), Math.round(f.y + Math.sin(a) * rr * 0.4 - (1 - k) * 300 - 16), 32, 32);
        }
        c.strokeStyle = f.color;
        c.lineWidth = 4;
        c.beginPath(); c.ellipse(f.x, f.y + 20, f.r, f.r * 0.25, 0, 0, Math.PI * 2); c.stroke();
        break;
      }
    }
    c.globalAlpha = 1;
    c.lineWidth = 1;
  }

  /** Münze: kurzer Hüpfer, dann Bogen zur Gold-Anzeige oben rechts. */
  drawCoin(f) {
    const c = this.ctx;
    const tt = (f.age - (f.delay || 0)) / (f.life - (f.delay || 0));
    if (tt < 0) return;
    const sx = f.x + (f.seed - 0.5) * 40, sy = f.y + this.F.offsetY;
    const ex = this.goldTarget.x, ey = this.goldTarget.y;
    let x, y;
    if (tt < 0.2) {
      const k = tt / 0.2;
      x = sx + (f.seed - 0.5) * 30 * k;
      y = sy - Math.sin(k * Math.PI) * 40;
    } else {
      const k = (tt - 0.2) / 0.8;
      const e = k * k;
      const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 260;
      x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * ex;
      y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * ey;
    }
    c.drawImage(this.bank.icon('coin'), Math.round(x - 12), Math.round(y - 12), 24, 24);
  }

  drawBuffs(run) {
    const items = [];
    if (run.buffs.goldRush.time > 0) items.push([`Goldfieber ${run.buffs.goldRush.time.toFixed(0)} s`, '#FFD24A']);
    if (run.buffs.warHorn.time > 0) items.push([`Kriegshorn ${run.buffs.warHorn.time.toFixed(0)} s`, '#ff9a5a']);
    if (run.buffs.curse.time > 0) items.push([`Fluch ${run.buffs.curse.time.toFixed(0)} s`, '#c58cff']);
    if (run.auras.haste > 0) items.push([`Tempo +${Math.round(run.auras.haste * 100)} %`, '#e0c36b']);
    items.forEach(([label, color], i) => this.text(label, 210, this.F.height - 30 - i * 30, 22, color, 'left'));
  }

  // ---------- Hilfen ----------

  text(str, x, y, size, color, align = 'center') {
    const c = this.ctx;
    c.font = `${size}px ${PIXEL_FONT}`;
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
    c.fillStyle = '#1a1422';
    c.fillRect(x - 2, y - 2, w + 4, h + 4);
    c.fillStyle = '#3a3048';
    c.fillRect(x, y, w, h);
    c.fillStyle = color;
    c.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
  }

  /** Held an einer Weltposition finden (Klick / Touch). */
  heroAt(run, p) {
    return run.heroes.find((h) => Math.abs(h.x - p.x) <= 44 && p.y <= h.footY + 6 && p.y >= h.footY - 96) || null;
  }
}
