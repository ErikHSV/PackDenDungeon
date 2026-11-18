// Zeichnet das Spielfeld auf einen Canvas. Nur Platzhalter-Grafik: Formen + Text.
// Echte Sprites können später hier eingehängt werden (drawHero, drawEnemy, …).

export class Renderer {
  constructor(canvas, data) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    this.F = data.balance.field;
    this.scale = 1;
    this.selected = null;
    this.resize();
  }

  /** Passt die interne Auflösung an die angezeigte Größe an (scharf auf Retina). */
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || this.F.width;
    this.scale = w / this.F.width;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(this.F.height * this.scale * dpr);
    this.ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, 0, 0);
  }

  /** Bildschirm- → Spielfeldkoordinaten. */
  toField(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / this.scale, y: (clientY - r.top) / this.scale };
  }

  draw(run, realTime) {
    const c = this.ctx;
    const F = this.F;
    this.drawBackground(run);
    for (const z of run.zones) this.drawZone(z);
    if (run.iceWall) this.drawIceWall(run.iceWall);
    this.drawTower(run);
    this.drawSlots(run);
    for (const m of run.minions) this.drawMinion(m);
    for (const h of run.heroes) this.drawHero(run, h, realTime);
    const enemies = run.enemies.filter((e) => !e.dead).sort((a, b) => a.y - b.y);
    for (const e of enemies) this.drawEnemy(run, e, realTime);
    for (const p of run.projectiles) this.drawProjectile(p);
    for (const f of run.effects) this.drawEffect(f);
    this.drawBossBar(run);
    this.drawBuffs(run);

    if (run.waveState !== 'active' && !run.over) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(F.width / 2 - 170, 18, 340, 40);
      c.fillStyle = '#fff';
      c.font = 'bold 20px system-ui, sans-serif';
      c.textAlign = 'center';
      const label = run.wave === 0 ? 'Erste Welle' : `Welle ${run.wave + 1}`;
      c.fillText(`${label} in ${Math.max(0, run.waveTimer).toFixed(1)} s`, F.width / 2, 45);
    }
  }

  // ---------------------------------------------------------------------

  drawBackground(run) {
    const c = this.ctx;
    const F = this.F;
    const col = run.chapter.colors;
    const g = c.createLinearGradient(0, 0, 0, F.groundY);
    g.addColorStop(0, col.sky);
    g.addColorStop(1, col.skyBottom);
    c.fillStyle = g;
    c.fillRect(0, 0, F.width, F.height);
    c.fillStyle = col.ground;
    c.fillRect(0, F.groundY + 5, F.width, F.height - F.groundY);
    // Luftebene andeuten
    c.strokeStyle = 'rgba(255,255,255,0.06)';
    c.setLineDash([6, 10]);
    c.beginPath(); c.moveTo(F.towerX, F.airY); c.lineTo(F.width, F.airY); c.stroke();
    // Frontlinie
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.moveTo(F.frontX, F.groundY - 140); c.lineTo(F.frontX, F.groundY + 20); c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('Luft', F.width - 40, F.airY - 6);
  }

  drawTower(run) {
    const c = this.ctx;
    const F = this.F;
    const t = run.tower;
    const x = 18;
    const w = F.towerX - 20;
    const top = F.groundY - 190;
    c.fillStyle = t.hitFlash > 0 ? '#c96a6a' : '#6b6f7d';
    c.fillRect(x, top, w, F.groundY + 10 - top);
    // Zinnen
    c.fillStyle = '#7d8292';
    for (let i = 0; i < 4; i++) c.fillRect(x + i * (w / 4) + 2, top - 14, w / 4 - 6, 14);
    c.fillStyle = '#2a2c34';
    c.fillRect(x + w / 2 - 12, F.groundY - 40, 24, 50);
    c.fillStyle = '#fff';
    c.font = 'bold 13px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('TURM', x + w / 2, top + 30);
    this.bar(x, top - 26, w, 8, t.hp / t.maxHp, '#4ade80');
  }

  drawSlots(run) {
    const c = this.ctx;
    const pos = this.F.slotPositions;
    for (let i = 0; i < pos.length; i++) {
      const [x, y] = pos[i];
      const unlocked = i < run.slotCount;
      c.strokeStyle = unlocked ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)';
      c.setLineDash([4, 4]);
      c.strokeRect(x - 24, y - 24, 48, 48);
      c.setLineDash([]);
      if (!unlocked) {
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.font = '16px system-ui';
        c.textAlign = 'center';
        c.fillText('🔒', x, y + 6);
      }
    }
  }

  drawHero(run, h, t) {
    const c = this.ctx;
    const rar = this.data.rarities[h.def.rarity];
    const s = 46;
    const bob = h.attackAnim > 0 ? -3 : 0;
    const x = h.x - s / 2;
    const y = h.y - s / 2 + bob;
    c.globalAlpha = h.alive ? 1 : 0.35;
    // Seltenheits-Leuchten
    if (rar.glow && h.alive) { c.shadowColor = rar.color; c.shadowBlur = 12; }
    c.fillStyle = h.hitFlash > 0 ? '#ff8a8a' : h.def.color;
    this.roundRect(x, y, s, s, 8); c.fill();
    c.shadowBlur = 0;
    c.lineWidth = 3;
    c.strokeStyle = rar.color;
    this.roundRect(x, y, s, s, 8); c.stroke();
    c.lineWidth = 1;
    c.fillStyle = this.textColorFor(h.def.color);
    c.font = 'bold 16px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(h.def.short, h.x, h.y + 6 + bob);
    // Sterne
    c.fillStyle = '#ffd34d';
    c.font = '10px system-ui, sans-serif';
    c.fillText('★'.repeat(h.stars), h.x, h.y + s / 2 + 11);
    c.globalAlpha = 1;
    if (h.alive) {
      this.bar(h.x - 22, y - 9, 44, 5, h.hp / h.maxHp, '#4ade80');
    } else {
      c.fillStyle = '#fff';
      c.font = 'bold 12px system-ui';
      c.fillText(`${Math.ceil(h.reviveTimer)}s`, h.x, h.y - 30);
    }
    if (h.freeze > 0) {
      c.fillStyle = 'rgba(160,220,255,0.55)';
      this.roundRect(x - 3, y - 3, s + 6, s + 6, 10); c.fill();
    }
    if (h.root > 0) {
      c.strokeStyle = '#8b5a2b';
      c.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        c.beginPath(); c.moveTo(x + 6 + i * 15, y + s + 4); c.quadraticCurveTo(x + 14 + i * 15, y + s / 2, x + 4 + i * 15, y + 6); c.stroke();
      }
      c.lineWidth = 1;
    }
    if (this.selected === h) {
      c.strokeStyle = '#fff';
      c.setLineDash([3, 3]);
      c.beginPath(); c.arc(h.x, h.y, Math.max(30, h.def.stats.range), 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
  }

  drawMinion(m) {
    const c = this.ctx;
    c.globalAlpha = Math.min(1, m.life / 2);
    c.fillStyle = '#e8e4d8';
    c.fillRect(m.x - 9, m.y - 12, 18, 22);
    c.fillStyle = '#222';
    c.font = 'bold 9px system-ui';
    c.textAlign = 'center';
    c.fillText('Sk', m.x, m.y + 3);
    c.globalAlpha = 1;
    this.bar(m.x - 10, m.y - 18, 20, 3, m.hp / m.maxHp, '#cfe8cf');
  }

  drawEnemy(run, e, t) {
    const c = this.ctx;
    const r = e.size;
    if (e.flying) {
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.beginPath(); c.ellipse(e.x, this.F.groundY + 8, r, r * 0.3, 0, 0, Math.PI * 2); c.fill();
    }
    if (e.elite || e.boss) {
      c.strokeStyle = e.boss ? '#ff4d4d' : '#ffd34d';
      c.lineWidth = 3;
      c.beginPath(); c.arc(e.x, e.y, r + 5, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 1;
    }
    c.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.def.color;
    this.shape(e.def.shape, e.x, e.y + (e.attackAnim > 0 ? -2 : 0), r, e.flying ? Math.sin(t * 8 + e.uid) * 2 : 0);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.stroke();
    if (e.frontalShield) {
      c.fillStyle = '#b89b5e';
      c.fillRect(e.x - r - 6, e.y - r, 5, r * 2);
    }
    c.fillStyle = this.textColorFor(e.def.color);
    c.font = `bold ${Math.max(9, Math.round(r * 0.7))}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.fillText(e.def.short, e.x, e.y + r * 0.25);
    // Statusanzeigen
    let sx = e.x - r;
    const sy = e.y - r - 14;
    const dot = (color) => { c.fillStyle = color; c.beginPath(); c.arc(sx, sy, 3, 0, Math.PI * 2); c.fill(); sx += 8; };
    if (e.st.stun > 0) dot('#ffe08a');
    if (e.isSlowed) dot('#7fd3ff');
    if (e.st.burn.time > 0) dot('#ff7a2a');
    if (e.st.vuln.time > 0 || run.buffs.curse.time > 0) dot('#c084fc');
    if (e.regenerating) dot('#4ade80');
    if (!e.boss) this.bar(e.x - r, e.y - r - 9, r * 2, 3, e.hp / e.maxHp, '#ef4444');
    if (e.bossState?.charging > 0) {
      c.fillStyle = '#fff';
      c.font = 'bold 12px system-ui';
      c.fillText('Schrei lädt …', e.x, e.y - r - 30);
      this.bar(e.x - 40, e.y - r - 24, 80, 6, 1 - e.bossState.charging / e.bossState.chargeMax, '#f97316');
    }
  }

  drawProjectile(p) {
    const c = this.ctx;
    c.fillStyle = p.color;
    if (p.shape === 'bird') {
      c.beginPath(); c.moveTo(p.x + 7, p.y); c.lineTo(p.x - 5, p.y - 5); c.lineTo(p.x - 2, p.y); c.lineTo(p.x - 5, p.y + 5); c.closePath(); c.fill();
    } else {
      c.beginPath(); c.arc(p.x, p.y, p.isTower ? 3 : 4, 0, Math.PI * 2); c.fill();
    }
  }

  drawZone(z) {
    const c = this.ctx;
    const a = Math.min(1, z.time / 0.5) * 0.35;
    c.fillStyle = z.type === 'ice' ? `rgba(140,210,255,${a})` : `rgba(255,100,30,${a + 0.1})`;
    c.beginPath(); c.ellipse(z.x, z.y + 4, z.r, z.type === 'ice' ? 22 : z.r * 0.5, 0, 0, Math.PI * 2); c.fill();
  }

  drawIceWall(w) {
    const c = this.ctx;
    c.fillStyle = `rgba(190,235,255,${0.5 + 0.3 * Math.min(1, w.time)})`;
    c.fillRect(w.x - 8, this.F.groundY - 90, 16, 100);
    c.strokeStyle = '#e8f8ff';
    c.strokeRect(w.x - 8, this.F.groundY - 90, 16, 100);
  }

  drawEffect(f) {
    const c = this.ctx;
    const k = f.age / f.life;
    c.globalAlpha = Math.max(0, 1 - k);
    switch (f.type) {
      case 'text':
        c.fillStyle = f.color;
        c.font = `bold ${f.size || 13}px system-ui, sans-serif`;
        c.textAlign = 'center';
        c.strokeStyle = 'rgba(0,0,0,0.6)';
        c.lineWidth = 3;
        c.strokeText(f.text, f.x, f.y - k * 24);
        c.fillText(f.text, f.x, f.y - k * 24);
        c.lineWidth = 1;
        break;
      case 'ring':
        c.strokeStyle = f.color;
        c.lineWidth = 3;
        c.beginPath(); c.arc(f.x, f.y, f.r * (0.4 + 0.6 * k), 0, Math.PI * 2); c.stroke();
        c.lineWidth = 1;
        break;
      case 'arc':
        c.strokeStyle = f.color;
        c.lineWidth = 5;
        c.beginPath(); c.arc(f.x, f.y, f.r, Math.PI * 0.6, Math.PI * 1.4); c.stroke();
        c.lineWidth = 1;
        break;
      case 'line':
      case 'dash':
        c.strokeStyle = f.color;
        c.lineWidth = f.width || 2;
        c.beginPath(); c.moveTo(f.x1, f.y1); c.lineTo(f.x2, f.y2); c.stroke();
        c.lineWidth = 1;
        break;
      case 'slash':
        c.strokeStyle = f.color;
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(f.x - 10, f.y - 10); c.lineTo(f.x + 10, f.y + 10); c.stroke();
        c.lineWidth = 1;
        break;
      case 'rocks':
        c.fillStyle = f.color;
        for (let i = 0; i < 7; i++) {
          const ang = (i / 7) * Math.PI * 2;
          const rr = f.r * 0.6 * ((i * 37) % 10) / 10;
          c.beginPath(); c.arc(f.x + Math.cos(ang) * rr, f.y + Math.sin(ang) * rr * 0.5 - (1 - k) * 60, 7, 0, Math.PI * 2); c.fill();
        }
        c.strokeStyle = f.color;
        c.beginPath(); c.ellipse(f.x, f.y, f.r, f.r * 0.35, 0, 0, Math.PI * 2); c.stroke();
        break;
    }
    c.globalAlpha = 1;
  }

  drawBossBar(run) {
    const boss = run.enemies.find((e) => e.boss && !e.dead);
    if (!boss) return;
    const c = this.ctx;
    const w = 460;
    const x = (this.F.width - w) / 2;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(x - 6, 70, w + 12, 34);
    c.fillStyle = '#fff';
    c.font = 'bold 13px system-ui';
    c.textAlign = 'center';
    c.fillText(boss.name, this.F.width / 2, 84);
    this.bar(x, 90, w, 9, boss.hp / boss.maxHp, '#ef4444');
  }

  drawBuffs(run) {
    const c = this.ctx;
    const items = [];
    if (run.buffs.goldRush.time > 0) items.push(['Goldfieber', run.buffs.goldRush.time, '#f1c40f']);
    if (run.buffs.warHorn.time > 0) items.push(['Kriegshorn', run.buffs.warHorn.time, '#d35400']);
    if (run.buffs.curse.time > 0) items.push(['Fluch', run.buffs.curse.time, '#8e44ad']);
    if (run.auras.haste > 0) items.push([`Tempo +${Math.round(run.auras.haste * 100)} %`, null, '#e0c36b']);
    c.font = 'bold 12px system-ui';
    c.textAlign = 'left';
    items.forEach(([label, time, color], i) => {
      const y = 120 + i * 20;
      c.fillStyle = color;
      c.fillText(time != null ? `${label} ${time.toFixed(0)} s` : label, 130, y);
    });
  }

  // ---------- Hilfen ----------

  bar(x, y, w, h, frac, color) {
    const c = this.ctx;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(x, y, w, h);
    c.fillStyle = color;
    c.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  roundRect(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  shape(kind, x, y, r, wobble = 0) {
    const c = this.ctx;
    c.beginPath();
    switch (kind) {
      case 'triangle': c.moveTo(x - r, y); c.lineTo(x + r, y - r); c.lineTo(x + r, y + r); c.closePath(); break;
      case 'square': c.rect(x - r, y - r, r * 2, r * 2); break;
      case 'diamond': c.moveTo(x, y - r + wobble); c.lineTo(x + r, y); c.lineTo(x, y + r - wobble); c.lineTo(x - r, y); c.closePath(); break;
      default: c.arc(x, y, r, 0, Math.PI * 2);
    }
  }

  textColorFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return lum > 150 ? '#1a1a1a' : '#ffffff';
  }

  /** Held an Position finden (für Klick/Touch). */
  heroAt(run, p) {
    return run.heroes.find((h) => Math.abs(h.x - p.x) <= 26 && Math.abs(h.y - p.y) <= 26) || null;
  }
}
