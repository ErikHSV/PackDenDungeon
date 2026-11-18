// Einheiten: KI (angreifen, abstand, bewachen, springen, folgen), Angriffe, Fähigkeiten, Geschosse, Zonen.
// Neue Fähigkeiten: Eintrag in ABILITIES; neue Angriffsarten: Eintrag in ATTACKS.
import { dist } from './util.js';
import { damageEnemy, applyOnHit, applyStatus, fx } from './combat.js';

export const UNIT_R = 12; // Kollisionsradius einer Einheit (Weltpixel; Helden sind ca. 16–24 px hoch)

// Fliegende Gegner: nur Luft-Treffer – außer sie greifen gerade den Turm an (dann sind sie in Reichweite aller Helden)
const canHit = (u, e) => !e.dead && !e.verborgen && (!e.fliegt || u.def.trifftLuft || !e.moving);

function nearestEnemy(run, u, from, maxDist) {
  let best = null, bd = maxDist;
  for (const e of run.enemies) {
    if (!canHit(u, e)) continue;
    const d = dist(from, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function unitDamage(run, u) {
  const giant = run.buffs.riesen.t > 0 ? run.buffs.riesen.schadenMul : 1;
  return u.def.werte.schaden * run.mods.heldenSchadenMul * giant * (u.riese ? 1.3 : 1); // Shiny ändert den Schaden nicht
}

/** Reichweite inkl. Foil (+50 %) und Riesenwuchs. */
export function unitRange(run, u) {
  return u.range * (run.buffs.riesen.t > 0 ? run.buffs.riesen.reichweiteMul : 1);
}

export function unitAttackInterval(run, u) {
  const buff = 1 + (run.buffs.blutrausch.t > 0 ? run.buffs.blutrausch.bonus : 0) + (u.cheer > 0 ? u.cheerBonus : 0) + (run.buffs.trommel.t > 0 ? run.buffs.trommel.bonus : 0);
  const wut = u.def.faehigkeiten?.wut ? 1 + u.def.faehigkeiten.wut.tempoMax * (1 - u.hp / u.maxHp) : 1;
  return 1 / (u.def.werte.angriffsTempo * run.mods.heldenTempoMul * buff * wut);
}

function moveToward(run, u, tx, ty, dt, stopAt = 0) {
  const dx = tx - u.x, dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d <= stopAt || d < 1) return true;
  const step = Math.min(d - stopAt, u.def.werte.lauftempo * run.mods.heldenLaufMul * (u.slow ?? 1) * dt);
  u.x += (dx / d) * step;
  u.y += (dy / d) * step;
  u.facing = dx >= 0 ? 1 : -1;
  u.moving = true;
  run.clampToArena(u, 0.95);
  return false;
}

// ---------------------------------------------------------------------------
// Angriffe
// ---------------------------------------------------------------------------

const ATTACKS = {
  nahkampf(run, u, t, dmg) {
    damageEnemy(run, t, dmg, u.def.werte.schadensTyp, { source: u, from: u });
    applyOnHit(run, t, u.def.angriff.beiTreffer, dmg, u);
    fx(run, { type: 'slash', x: t.x, y: t.y, color: '#ffffff', life: 0.15 });
    const sp = u.def.angriff.spiegelung;
    if (sp) for (const o of run.enemies) if (o !== t && canHit(u, o) && dist(o, t) <= sp.radius) damageEnemy(run, o, dmg * sp.anteil, u.def.werte.schadensTyp, { aoe: true, source: u });
  },
  /** Kegel nach vorne: trifft alle Gegner im Radius innerhalb des Öffnungswinkels Richtung Ziel. */
  kegel(run, u, t, dmg) {
    const a = u.def.angriff;
    const r = (a.radius ?? 90) * (u.foil ? run.foilBonus('flaecheMul') : 1) * (run.buffs.riesen.t > 0 ? run.buffs.riesen.reichweiteMul : 1);
    const half = ((a.winkel ?? 100) * Math.PI) / 360;
    const dir = Math.atan2(t.y - u.y, t.x - u.x);
    fx(run, { type: 'cone', x: u.x, y: u.y - 10, r, dir, half, color: u.def.farbe, life: 0.22 });
    for (const e of run.enemies) {
      if (!canHit(u, e) || dist(e, u) > r + e.r) continue;
      let d = Math.abs(Math.atan2(e.y - u.y, e.x - u.x) - dir);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d > half && e !== t) continue;
      damageEnemy(run, e, dmg, u.def.werte.schadensTyp, { aoe: true, source: u });
      applyOnHit(run, e, a.beiTreffer, dmg, u);
    }
  },
  halbkreis(run, u, t, dmg) {
    const r = (u.def.angriff.radius ?? 70) * (u.foil ? run.foilBonus('flaecheMul') : 1);
    fx(run, { type: 'arc', x: t.x, y: t.y, r, color: u.def.farbe, life: 0.22 });
    for (const e of run.enemies) if (canHit(u, e) && dist(e, t) <= r) {
      damageEnemy(run, e, dmg, u.def.werte.schadensTyp, { aoe: true, source: u });
      applyOnHit(run, e, u.def.angriff.beiTreffer, dmg, u);
    }
  },
  geschoss(run, u, t, dmg) {
    const a = u.def.angriff;
    run.projectiles.push({
      x: u.x + u.facing * 6, y: u.y - 14, target: t, tx: t.x, ty: t.y, speed: a.geschossTempo ?? 600, damage: dmg,
      type: u.def.werte.schadensTyp, source: u, bounces: a.abpraller ?? 0, hit: new Set(), color: u.def.farbe,
      onHit: a.beiTreffer, zone: a.flaeche ? { ...a.flaeche, radius: a.flaeche.radius * (u.foil ? run.foilBonus('flaecheMul') : 1) } : null,
      explosion: a.explosion ? a.explosion.radius * (u.foil ? run.foilBonus('flaecheMul') : 1) : 0,
    });
    // Zweite Feuerkugel mit Chance (auf ein anderes Ziel in Reichweite, sonst dasselbe)
    if (a.zweitschussChance && run.rng() < a.zweitschussChance) {
      const other = run.enemies.find((e) => !e.dead && e !== t && dist(e, u) <= u.range) ?? t;
      const first = run.projectiles[run.projectiles.length - 1];
      run.projectiles.push({ ...first, target: other, tx: other.x, ty: other.y, hit: new Set(), y: first.y - 6 });
    }
  },
};

// ---------------------------------------------------------------------------
// Fähigkeiten (tick pro Simulationsschritt)
// ---------------------------------------------------------------------------

function timer(u, key, interval, dt) {
  u.timers[key] ??= interval * 0.5;
  u.timers[key] -= dt;
  return u.timers[key] <= 0;
}

/** Ort mit den meisten Gegnern (Kandidaten = Gegnerpositionen). */
export function densest(run, list, radius) {
  let best = null, n = 0;
  for (const c of list) {
    let k = 0;
    for (const o of list) if (dist(c, o) <= radius) k++;
    if (k > n) { n = k; best = c; }
  }
  return best;
}

const ABILITIES = {
  /** Sprint durch Gegnergruppen: Schaden + Rückstoß auf der Strecke (bei beiAngriff: ausgelöst durch jeden Angriff). */
  sprint(run, u, ab, dt) {
    if (u.dash || ab.beiAngriff) return;
    if (!timer(u, 'sprint', ab.intervall, dt)) return;
    const t = nearestEnemy(run, u, u, 700);
    if (!t) { u.timers.sprint = 0.3; return; }
    const ang = Math.atan2(t.y - u.y, t.x - u.x);
    u.dash = { ang, left: ab.laenge, hit: new Set(), remaining: (ab.anzahl ?? 1) - 1, ab };
    u.timers.sprint = ab.intervall;
    fx(run, { type: 'text', x: u.x, y: u.y - 80, text: 'Sprint!', color: '#7fd3c0', size: 16 });
  },
  /** Wirbelsturm wandert zufällig über das Feld. */
  wirbelsturm(run, u, ab, dt) {
    if (!timer(u, 'wirbelsturm', ab.intervall, dt)) return;
    u.timers.wirbelsturm = ab.intervall;
    const a = run.rng() * Math.PI * 2;
    run.zones.push({ type: 'wirbel', x: u.x, y: u.y, r: ab.radius * (u.foil ? run.foilBonus('flaecheMul') : 1), t: ab.dauer, max: ab.dauer, dps: ab.schadenProSekunde, vx: Math.cos(a) * ab.tempo, vy: Math.sin(a) * ab.tempo, knock: ab.rueckstoss, source: u });
  },
  /** Glockenschlag betäubt alle Gegner im Umkreis. */
  glocke(run, u, ab, dt) {
    if (!timer(u, 'glocke', ab.intervall, dt)) return;
    const r = ab.radius * (u.foil ? run.foilBonus('flaecheMul') : 1);
    if (!run.enemies.some((e) => dist(e, u) <= r)) { u.timers.glocke = 0.3; return; }
    u.timers.glocke = ab.intervall;
    fx(run, { type: 'ring', x: u.x, y: u.y, r, color: '#ffe08a', life: 0.6 });
    for (const e of run.enemies) if (dist(e, u) <= r) applyStatus(run, e, { typ: 'betaeubung', dauer: ab.betaeubung });
    run.emit('sound', 'bell');
  },
  /** Grenzgänger: Dimensionssprung zu einer Gegnergruppe mit Schadenswelle. */
  dimensionssprung(run, u, ab, dt) {
    if (!timer(u, 'dim', ab.intervall, dt)) return;
    const p = densest(run, run.enemies.filter((e) => !e.dead), ab.radius);
    if (!p) { u.timers.dim = 0.3; return; }
    u.timers.dim = ab.intervall;
    fx(run, { type: 'glitch', x: u.x, y: u.y, life: 0.3 });
    u.x = p.x + 40; u.y = p.y;
    run.clampToArena(u, 0.95);
    fx(run, { type: 'ring', x: u.x, y: u.y, r: ab.radius, color: '#2EE6D6', life: 0.4 });
    for (const e of run.enemies) if (dist(e, u) <= ab.radius) damageEnemy(run, e, unitDamage(run, u) * ab.schadenMul, 'magic', { aoe: true, source: u });
  },
  /** Grenzgänger: Riss im Boden (Schadenszone). */
  riss(run, u, ab, dt) {
    if (!timer(u, 'riss', ab.intervall, dt)) return;
    const p = densest(run, run.enemies.filter((e) => !e.dead && !e.fliegt), ab.radius);
    if (!p) { u.timers.riss = 0.3; return; }
    u.timers.riss = ab.intervall;
    run.zones.push({ type: 'riss', x: p.x, y: p.y, r: ab.radius, t: ab.dauer, max: ab.dauer, dps: ab.schadenProSekunde, source: u });
  },
};

// ---------------------------------------------------------------------------
// KI und Update
// ---------------------------------------------------------------------------

function chooseTarget(run, u) {
  const T = run.tower;
  switch (u.def.ki) {
    case 'bewachen': {
      // Tanks verteidigen den Turm: nur Gegner nahe am Turm oder in eigener Reichweite
      let best = null, bd = Infinity;
      for (const e of run.enemies) {
        if (!canHit(u, e)) continue;
        const dt = dist(e, T), du = dist(e, u);
        if (dt > 340 && du > u.range) continue;
        if (du < bd) { bd = du; best = e; }
      }
      return best;
    }
    case 'folgen':
      return nearestEnemy(run, u, u, 360);
    default: {
      // Verteidigen statt jagen: Gegner nahe am Turm zählen mehr, weit entfernte nur, wenn sie ohnehin nah am Helden sind
      let best = null, bs = Infinity;
      for (const e of run.enemies) {
        if (!canHit(u, e)) continue;
        const dt = dist(e, T), du = dist(e, u);
        if (dt > 520 && du > u.range + 80) continue;
        const score = du + dt * 0.8;
        if (score < bs) { bs = score; best = e; }
      }
      return best;
    }
  }
}

export function updateUnits(run, dt) {
  const T = run.tower;
  for (const u of run.units) {
    if (u.dead) continue;
    u.hitFlash = Math.max(0, (u.hitFlash || 0) - dt);
    u.attackAnim = Math.max(0, (u.attackAnim || 0) - dt);
    u.cheer = Math.max(0, (u.cheer || 0) - dt);
    u.moving = false;
    if (u.life != null) { u.life -= dt; if (u.life <= 0) { run.killUnit(u, true); continue; } }
    if (u.frozen > 0) { u.frozen -= dt; continue; }
    if (u.spawnDelay > 0) { u.spawnDelay -= dt; continue; }
    // Gefahren / Modifikatoren: langsamer Lebensverlust
    if (run.blizzard > 0) u.hp -= u.maxHp * run.blizzardRate * dt;
    if (run.mods.heldenVerfallProSekunde) u.hp -= u.maxHp * run.mods.heldenVerfallProSekunde * dt;
    if (u.hp <= 0) { run.killUnit(u); continue; }

    // Sprint läuft
    if (u.dash) {
      const d = u.dash;
      const step = Math.min(d.left, 900 * dt);
      u.x += Math.cos(d.ang) * step; u.y += Math.sin(d.ang) * step;
      u.facing = Math.cos(d.ang) >= 0 ? 1 : -1;
      d.left -= step;
      run.clampToArena(u, 0.95);
      for (const e of run.enemies) {
        if (d.hit.has(e) || e.dead || e.fliegt || dist(e, u) > 50) continue;
        d.hit.add(e);
        damageEnemy(run, e, unitDamage(run, u) * d.ab.schadenMul, 'physical', { aoe: true, source: u });
        applyStatus(run, e, { typ: 'rueckstoss', distanz: d.ab.rueckstoss }, 0, u);
        // Aufprall: geschleuderte Gegner verletzen andere in ihrer Nähe
        if (d.ab.aufprall) for (const o of run.enemies) if (o !== e && !o.dead && dist(o, e) <= d.ab.aufprall.radius) damageEnemy(run, o, unitDamage(run, u) * d.ab.aufprall.schadenMul, 'physical', { aoe: true, source: u });
      }
      if (d.left <= 0 || run.edgeFactor(u) > 0.94) {
        if (d.remaining > 0) { d.remaining--; d.left = d.ab.laenge; d.ang += Math.PI + (run.rng() - 0.5); d.hit.clear(); }
        else u.dash = null;
      }
      continue;
    }

    for (const [type, params] of Object.entries(u.def.faehigkeiten)) ABILITIES[type]?.(run, u, params, dt);

    const target = chooseTarget(run, u);
    const range = unitRange(run, u);
    const reach = range + (target ? target.r : 0) + UNIT_R * 0.5;
    if (target) {
      const d = dist(u, target);
      if (u.def.ki === 'abstand') {
        if (d < range * 0.4) {
          // zu nah: etwas zurückweichen (Richtung Turm)
          const ang = Math.atan2(u.y - target.y, u.x - target.x);
          moveToward(run, u, u.x + Math.cos(ang) * 60 + (T.x - u.x) * 0.1, u.y + Math.sin(ang) * 60 + (T.y - u.y) * 0.1, dt);
        } else if (d > reach) moveToward(run, u, target.x, target.y, dt, reach * 0.9);
      } else if (d > reach) moveToward(run, u, target.x, target.y, dt, reach * 0.8);
      u.facing = target.x >= u.x ? 1 : -1;
      u.atkTimer -= dt;
      if (d <= reach + 4 && u.atkTimer <= 0) {
        ATTACKS[u.def.angriff.art]?.(run, u, target, unitDamage(run, u));
        u.atkTimer = unitAttackInterval(run, u);
        u.attackAnim = 0.3;
        // Windläufer: sprintet bei jedem Angriff durch die Gegnergruppe
        const sp = u.def.faehigkeiten.sprint;
        if (sp?.beiAngriff && !u.dash) u.dash = { ang: Math.atan2(target.y - u.y, target.x - u.x), left: sp.laenge, hit: new Set(), remaining: (sp.anzahl ?? 1) - 1, ab: sp };
        // Bannerträger: Angriffe feuern nahe Verbündete an
        const ch = u.def.faehigkeiten.anfeuern;
        if (ch) for (const o of run.units) if (o !== u && !o.dead && dist(o, u) <= ch.radius) { o.cheer = ch.dauer; o.cheerBonus = ch.tempoBonus; }
      }
    } else {
      // keine Ziele: Ausgangsposition halten / in Turmnähe bleiben
      if (u.def.ki === 'bewachen') moveToward(run, u, T.x + u.homeDx, T.y + u.homeDy, dt, 10);
      else if (u.def.ki === 'folgen') {
        const ally = run.units.find((o) => o !== u && !o.dead && o.def.ki !== 'folgen');
        if (ally) moveToward(run, u, ally.x - 40, ally.y + 20, dt, 50);
      }
    }
    if (u.def.ki === 'bewachen' && dist(u, T) > 360) moveToward(run, u, T.x, T.y, dt, 200);
  }
  // Abstand halten (keine Stapel)
  const list = run.units.filter((u) => !u.dead);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.01;
    const min = UNIT_R * 1.6;
    if (d < min) {
      const push = (min - d) / 2;
      a.x -= (dx / d) * push; a.y -= (dy / d) * push * 0.6;
      b.x += (dx / d) * push; b.y += (dy / d) * push * 0.6;
    }
  }
}

export function updateProjectiles(run, dt) {
  for (const p of run.projectiles) {
    if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y - (p.target.fliegt ? 0 : 10); }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d > step + 10) { p.x += (dx / d) * step; p.y += (dy / d) * step; continue; }
    p.done = true;
    const t = p.target;
    if (t && !t.dead) {
      damageEnemy(run, t, p.damage, p.type, { source: p.source, from: p.source ?? run.tower, cursor: p.isTower });
      applyOnHit(run, t, p.onHit, p.damage, p.source);
      p.hit.add(t);
    }
    if (p.explosion) {
      fx(run, { type: 'burst', x: p.tx, y: p.ty, r: p.explosion, color: '#ff9a3a', life: 0.35 });
      for (const e of run.enemies) if (e !== t && !e.dead && !e.fliegt && Math.hypot(e.x - p.tx, e.y - p.ty) <= p.explosion) damageEnemy(run, e, p.damage * 0.7, p.type, { aoe: true, source: p.source });
    }
    if (p.zone) run.zones.push({ type: 'brand', x: p.tx, y: p.ty + 10, r: p.zone.radius, t: p.zone.dauer, max: p.zone.dauer, dps: p.zone.schadenProSekunde * run.mods.heldenSchadenMul, source: p.source });
    // Abpraller auf ein weiteres Ziel
    if (p.bounces > 0) {
      let next = null, bd = 260;
      for (const e of run.enemies) {
        if (e.dead || p.hit.has(e) || (e.fliegt && !p.source?.def.trifftLuft)) continue;
        const dd = Math.hypot(e.x - p.tx, e.y - p.ty);
        if (dd < bd) { bd = dd; next = e; }
      }
      if (next) run.projectiles.push({ ...p, x: p.tx, y: p.ty, target: next, tx: next.x, ty: next.y, bounces: p.bounces - 1, done: false, damage: p.damage * 0.8 });
    }
  }
  run.projectiles = run.projectiles.filter((p) => !p.done);
}

/** Zonen: Brandflächen, Wirbelstürme, Risse, Giftwolken, Hagel. */
export function updateZones(run, dt) {
  for (const z of run.zones) {
    z.t -= dt;
    if (z.vx) {
      z.x += z.vx * dt; z.y += z.vy * dt;
      if (run.edgeFactor(z) > 0.9) { z.vx *= -1; z.vy *= -1; }
      if (run.rng() < dt * 0.5) { const a = run.rng() * Math.PI * 2; const sp = Math.hypot(z.vx, z.vy); z.vx = Math.cos(a) * sp; z.vy = Math.sin(a) * sp; }
    }
    if (!z.dps) continue;
    for (const e of run.enemies) {
      if (e.dead || (z.type !== 'wirbel' && e.fliegt)) continue;
      if (Math.hypot(e.x - z.x, (e.y - z.y) * 1.4) > z.r) continue;
      damageEnemy(run, e, z.dps * dt, z.type === 'gift' ? null : 'magic', { aoe: true, silent: true, source: z.source });
      if (z.knock && run.rng() < dt * 2) applyStatus(run, e, { typ: 'rueckstoss', distanz: z.knock }, 0, z);
    }
  }
  run.zones = run.zones.filter((z) => z.t > 0);
}
