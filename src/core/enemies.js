// Gegner: laufen zum Turm, kämpfen gegen Helden im Weg, Statuseffekte, Boss-Fähigkeiten mit Vorwarnung.
// Neue Boss-Fähigkeiten: Eintrag in BOSS_ABILITIES.
import { dist, applyPatches } from './util.js';
import { damageEnemy, damageUnit, damageTower, fx } from './combat.js';
import { UNIT_R } from './units.js';

function bossTimer(e, key, interval, dt) {
  const t = e.boss.timers;
  t[key] ??= interval * 0.7;
  t[key] -= dt;
  if (t[key] > 0) return false;
  t[key] = interval;
  return true;
}

const BOSS_ABILITIES = {
  /** Schockwelle: Vorwarnring, dann werden Helden im Radius zurückgeworfen. */
  schockwelle(run, e, ab, dt) {
    if (!bossTimer(e, 'schock', ab.intervall, dt)) return;
    run.telegraph({ x: e.x, y: e.y, r: ab.radius, time: ab.vorwarnung, kind: 'ring', apply: () => {
      fx(run, { type: 'ring', x: e.x, y: e.y, r: ab.radius, color: '#e8d8b0', life: 0.5 });
      for (const u of run.units) {
        if (u.dead || dist(u, e) > ab.radius) continue;
        const ang = Math.atan2(u.y - e.y, u.x - e.x);
        u.x += Math.cos(ang) * ab.rueckstoss; u.y += Math.sin(ang) * ab.rueckstoss * 0.6;
        run.clampToArena(u, 0.95);
        damageUnit(run, u, ab.schaden * run.chapter.wellen.schadenMul);
      }
      run.emit('shake', { power: 12 });
      run.emit('sound', 'bossSkill');
    } });
    run.emit('bossWarning', { text: ab.text });
  },

  /** Schrei: lädt auf; der Runenkreis muss den Schwachpunkt (Medaillon) oft genug treffen. */
  schrei(run, e, ab, dt) {
    const bs = e.boss;
    if (bs.scream) {
      bs.scream.t -= dt;
      if (bs.scream.hits >= ab.schwachpunkt.treffer) {
        bs.scream = null;
        fx(run, { type: 'text', x: e.x, y: e.y - e.r - 50, text: 'Unterbrochen!', color: '#FFD24A', size: 30, life: 1.4 });
        run.emit('bossInterrupted');
        return;
      }
      if (bs.scream.t <= 0) {
        bs.scream = null;
        const m = run.chapter.wellen.schadenMul;
        damageTower(run, ab.turmSchaden * m, null, true);
        for (const u of run.units) if (!u.dead) damageUnit(run, u, ab.heldenSchaden * m);
        fx(run, { type: 'ring', x: e.x, y: e.y, r: 1400, color: '#d0d4dd', life: 0.6 });
        fx(run, { type: 'text', x: e.x, y: e.y - e.r - 50, text: 'SCHREI!', color: '#E04848', size: 36, life: 1.2 });
        run.emit('shake', { power: 18 });
        run.emit('sound', 'scream');
      }
      return;
    }
    if (bossTimer(e, 'schrei', ab.intervall, dt)) {
      bs.scream = { t: ab.aufladen, max: ab.aufladen, hits: 0, need: ab.schwachpunkt.treffer };
      run.emit('bossWarning', { text: ab.text });
    }
  },

  /** Hammerwurf: Hämmer fliegen auf Ziele; Klick im Parierfenster kurz vor dem Einschlag wehrt sie ab. */
  hammerwurf(run, e, ab, dt) {
    if (!bossTimer(e, 'hammer', ab.intervall, dt)) return;
    const targets = [run.tower, ...run.units.filter((u) => !u.dead)];
    for (let i = 0; i < ab.anzahl; i++) {
      const t = targets[Math.floor(run.rng() * targets.length)];
      run.hammers.push({ fromX: e.x, fromY: e.y - e.r, x: e.x, y: e.y, tx: t.x + (run.rng() - 0.5) * 40, ty: t.y + (t === run.tower ? 30 : 0),
        t: 0, flight: ab.flugzeit + i * 0.35, window: ab.parierFenster, dmg: ab.schaden * run.chapter.wellen.schadenMul, r: ab.radius, boss: e });
    }
    run.emit('bossWarning', { text: ab.text });
  },

  /** Einfrieren: Vorwarnung unter Helden, dann eingefroren. */
  einfrieren(run, e, ab, dt) {
    if (!bossTimer(e, 'frost', ab.intervall, dt)) return;
    const alive = run.units.filter((u) => !u.dead);
    for (let i = 0; i < ab.anzahl && alive.length; i++) {
      const u = alive.splice(Math.floor(run.rng() * alive.length), 1)[0];
      run.telegraph({ x: u.x, y: u.y, r: 50, time: ab.vorwarnung, kind: 'circle', follow: u, apply: () => {
        if (u.dead) return;
        u.frozen = ab.dauer;
        fx(run, { type: 'text', x: u.x, y: u.y - 80, text: 'Eingefroren!', color: '#bfe9ff', size: 18 });
      } });
    }
    run.emit('bossWarning', { text: ab.text });
  },

  /** Shiny-Boss (Gesucht): Prisma-Salve – Vorwarnkreise unter Helden bzw. am Turm, dann Regenbogen-Einschläge. */
  prismaSalve(run, e, ab, dt) {
    if (!bossTimer(e, 'prisma', ab.intervall, dt)) return;
    const alive = run.units.filter((u) => !u.dead);
    const targets = [];
    for (let i = 0; i < ab.anzahl; i++) targets.push(alive.length ? alive.splice(Math.floor(run.rng() * alive.length), 1)[0] : run.tower);
    for (const t of targets) {
      const p = { x: t.x + (run.rng() - 0.5) * 30, y: t.y + (run.rng() - 0.5) * 20 };
      run.telegraph({ x: p.x, y: p.y, r: ab.radius, time: ab.vorwarnung, kind: 'circle', apply: () => {
        fx(run, { type: 'flash', x: p.x, y: p.y, r: ab.radius * 1.4, color: 'rainbow', life: 0.4 });
        for (const u of run.units) if (!u.dead && dist(u, p) <= ab.radius) damageUnit(run, u, ab.schaden * run.chapter.wellen.schadenMul);
        if (dist(run.tower, p) <= ab.radius + run.tower.r) damageTower(run, ab.schaden * 0.5 * run.chapter.wellen.schadenMul, e, true);
      } });
    }
    run.emit('bossWarning', { text: ab.text });
  },

  beschwoeren(run, e, ab, dt) {
    if (!bossTimer(e, 'summon', ab.intervall, dt)) return;
    for (let i = 0; i < ab.anzahl; i++) {
      const a = run.rng() * Math.PI * 2;
      run.spawnEnemy(ab.gegner, { x: e.x + Math.cos(a) * 80, y: e.y + Math.sin(a) * 50 });
    }
  },
};

function bossTick(run, e, dt) {
  const bs = e.boss;
  const phases = e.def.phasen || [];
  while (bs.phase < phases.length && e.hp / e.maxHp <= phases[bs.phase].lebenUnter) {
    const ph = phases[bs.phase++];
    applyPatches(e.def, ph.patches);
    if (ph.tempoMul) e.speed *= ph.tempoMul;
    for (const s of ph.beschwoeren || []) for (let i = 0; i < s.anzahl; i++) run.spawnEnemy(s.gegner, { x: e.x + (i - s.anzahl / 2) * 40, y: e.y + 60 });
    run.emit('bossWarning', { text: ph.text });
    run.emit('shake', { power: 14 });
  }
  for (const [type, ab] of Object.entries(e.def.bossFaehigkeiten || {})) {
    if (e.st.stun > 0 && type !== 'schrei') continue;
    BOSS_ABILITIES[type]?.(run, e, ab, dt);
  }
}

function tickStatus(run, e, dt) {
  const S = e.st;
  S.stun = Math.max(0, S.stun - dt);
  if (S.slow.t > 0) { S.slow.t -= dt; if (S.slow.t <= 0) S.slow.f = 1; }
  if (S.vuln.t > 0) S.vuln.t -= dt;
  if (S.plague) { S.plague.t -= dt; if (S.plague.t <= 0) S.plague = null; }
  if (S.burn.t > 0) { S.burn.t -= dt; damageEnemy(run, e, S.burn.dps * dt, null, { aoe: true, silent: true }); }
  if (S.poison.t > 0) { S.poison.t -= dt; damageEnemy(run, e, S.poison.dps * dt, null, { aoe: true, silent: true }); }
}

function attack(run, e, dt, target) {
  e.atkTimer -= dt;
  if (e.atkTimer > 0) return;
  e.atkTimer = e.def.angriffsIntervall;
  e.attackAnim = 0.15;
  if (target === run.tower) {
    const steal = e.def.eigenschaften?.masteryStehlen;
    if (steal) {
      const amount = steal.anzahl;
      run.stats.bonusMastery -= amount; // Grabräuber stiehlt im Run gesammelte Mastery
      fx(run, { type: 'text', x: e.x, y: e.y - 50, text: `-${amount} Mastery`, color: '#E04848', size: 22, life: 1.2 });
      run.emit('sound', 'steal');
      e.dead = true; e.fled = true; // flieht mit der Beute
      return;
    }
    damageTower(run, e.damage, e, !!e.boss);
  } else {
    damageUnit(run, target, e.damage, e);
    const sl = e.def.eigenschaften?.verlangsamtHelden;
    if (sl) { target.slow = sl.faktor; target.slowT = sl.dauer; }
  }
}

export function updateEnemies(run, dt) {
  const T = run.tower;
  run.auraCarriers = run.enemies.filter((e) => !e.dead && e.def.eigenschaften?.aura);
  const contactTower = run.data.balance.turm.kontaktRadius;
  for (const e of run.enemies) {
    if (e.dead) continue;
    e.hitFlash = Math.max(0, (e.hitFlash || 0) - dt);
    e.attackAnim = Math.max(0, (e.attackAnim || 0) - dt);
    e.spawnAge += dt;
    tickStatus(run, e, dt);
    if (e.dead) continue;
    if (e.boss) bossTick(run, e, dt);
    if (e.dead || run.over) continue;
    if (run.freezeAll > 0 || e.st.stun > 0 || e.boss?.scream) continue;

    const speed = e.speed * (e.st.slow.t > 0 ? e.st.slow.f : 1) * run.mods.gegnerTempoMul;
    // Schatzträger und Eskorte laufen quer über das Feld zum Ausgang (der Träger kämpft nicht)
    if (e.route) {
      const isCarrier = !!e.def.eigenschaften?.schatztraeger;
      if (!isCarrier && !e.fliegt) {
        if (e.engaged && (e.engaged.dead || dist(e, e.engaged) > e.r + UNIT_R + 14)) e.engaged = null;
        if (!e.engaged) for (const u of run.units) { if (!u.dead && !u.dash && dist(e, u) <= e.r + UNIT_R + 8) { e.engaged = u; break; } }
        if (e.engaged) { e.facing = e.engaged.x >= e.x ? 1 : -1; attack(run, e, dt, e.engaged); continue; }
      }
      const rx = e.route.x - e.x, ry = e.route.y - e.y, rd = Math.hypot(rx, ry);
      e.facing = rx >= 0 ? 1 : -1;
      if (rd < 12) { e.dead = true; e.fled = true; if (isCarrier) fx(run, { type: 'text', x: e.x, y: e.y - 50, text: 'Entkommen!', color: '#E04848', size: 22, life: 1.2 }); continue; }
      const st = Math.min(speed * dt, rd);
      e.x += (rx / rd) * st; e.y += (ry / rd) * st;
      e.moving = true;
      continue;
    }
    // Armbrustschützen: auf Abstand bleiben und schießen (Helden in Reichweite zuerst, sonst der Turm)
    const fk = e.def.eigenschaften?.fernkampf;
    if (fk) {
      const target = run.units.filter((u) => !u.dead && dist(u, e) <= fk.reichweite).sort((a, b) => dist(a, e) - dist(b, e))[0]
        ?? (dist(T, e) <= fk.reichweite + contactTower ? T : null);
      if (target) {
        e.moving = false;
        e.facing = target.x >= e.x ? 1 : -1;
        e.rangedTimer = (e.rangedTimer ?? fk.intervall * 0.5) - dt;
        if (e.rangedTimer <= 0) {
          e.rangedTimer = fk.intervall;
          e.attackAnim = 0.15;
          fx(run, { type: 'arrow', x1: e.x, y1: e.y - 14, x2: target.x, y2: target.y - 10, life: 0.18 });
          const dmg = fk.schaden * run.chapter.wellen.schadenMul * (1 + run.B.wellen.schadenProSekunde * run.time) * (e.elite ? run.B.wellen.elite.schadenMul : 1);
          if (target === T) damageTower(run, dmg, e); else damageUnit(run, target, dmg, null);
        }
        continue;
      }
    }
    // Kampf gegen Helden, die im Weg stehen (fliegende Gegner ignorieren sie)
    if (!e.fliegt) {
      if (e.engaged && (e.engaged.dead || dist(e, e.engaged) > e.r + UNIT_R + 14)) e.engaged = null;
      if (!e.engaged) {
        for (const u of run.units) {
          if (u.dead || u.dash) continue;
          if (dist(e, u) <= e.r + UNIT_R + 8) { e.engaged = u; break; }
        }
      }
      if (e.engaged) { e.facing = e.engaged.x >= e.x ? 1 : -1; attack(run, e, dt, e.engaged); continue; }
    }
    const dx = T.x - e.x, dy = (T.y - e.y);
    const d = Math.hypot(dx, dy);
    e.facing = dx >= 0 ? 1 : -1;
    if (d > contactTower + e.r * 0.5) {
      const step = Math.min(speed * dt, d - contactTower);
      e.x += (dx / d) * step; e.y += (dy / d) * step;
      e.moving = true;
    } else {
      e.moving = false;
      attack(run, e, dt, T);
    }
  }
}
