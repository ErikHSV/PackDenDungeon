// Helden: Angriffe, Zielwahl und Fähigkeiten.
// Neue Fähigkeiten: Eintrag in ABILITIES ergänzen und in heroes.json unter "abilities" verwenden.
import { dist } from './util.js';
import { damageEnemy, applyOnHit, applyStatus, densestPoint, healHero, fx } from './combat.js';

// ---------- Werte ----------

export function heroDamage(run, h) {
  const horn = run.buffs.warHorn.time > 0 ? 1 + run.buffs.warHorn.amount : 1;
  return h.def.stats.damage * h.power * run.mods.damageMul * horn;
}

export function heroAttackInterval(run, h) {
  const aps = h.def.stats.attackSpeed * run.mods.attackSpeedMul * (1 + run.auras.haste);
  return aps > 0 ? 1 / aps : Infinity;
}

const canHit = (h, e) => !e.dead && (!e.flying || h.def.canHitAir);

/**
 * Wählt bis zu n Ziele gemäß Zielpriorität des Helden.
 * nearest = am nächsten am Turm, weakest = wenigste Leben, elite = Elite/Boss zuerst, air = Flieger zuerst.
 */
export function selectTargets(run, h, n = 1) {
  const a = h.def.attack;
  const range = h.def.stats.range;
  let list = run.enemies.filter((e) => {
    if (!canHit(h, e) || e.x > run.field.width + 10) return false;
    const r = (a.eliteRange && (e.elite || e.boss)) ? a.eliteRange : range;
    return dist(h, e) <= r;
  });
  if (!list.length) return list;
  // Gegner bevorzugen, die nicht immun gegen unseren Schadenstyp sind
  const hittable = list.filter((e) => !e.immune.includes(h.def.damageType));
  if (hittable.length) list = hittable;

  const byFront = (x, y) => x.x - y.x;
  switch (h.def.targeting) {
    case 'weakest': list.sort((x, y) => x.hp - y.hp); break;
    case 'elite': list.sort((x, y) => (Number(y.elite || y.boss) - Number(x.elite || x.boss)) || byFront(x, y)); break;
    case 'air': list.sort((x, y) => (Number(y.flying) - Number(x.flying)) || byFront(x, y)); break;
    default: list.sort(byFront);
  }
  return list.slice(0, n);
}

function rollCrit(run, a, dmg) {
  if (a.critChance && run.rng() < a.critChance) return { dmg: dmg * (a.critMult || 2), crit: true };
  return { dmg, crit: false };
}

// ---------- Angriffsarten ----------

const ATTACKS = {
  /** Sofortiger Nahkampftreffer auf ein Ziel. */
  melee(run, h, targets, dmg) {
    const t = targets[0];
    const r = rollCrit(run, h.def.attack, dmg);
    damageEnemy(run, t, r.dmg, h.def.damageType, { crit: r.crit, source: h });
    applyOnHit(run, t, h.def.attack.onHit, r.dmg);
    fx(run, { type: 'slash', x: t.x, y: t.y, color: '#ffffff', life: 0.15 });
  },

  /** Geschoss(e), die zum Ziel fliegen. */
  projectile(run, h, targets, dmg) {
    const a = h.def.attack;
    for (const t of targets) {
      const r = rollCrit(run, a, dmg);
      run.projectiles.push({
        x: h.x, y: h.y - 14, target: t, tx: t.x, ty: t.y,
        speed: a.projectileSpeed || 600, damage: r.dmg, crit: r.crit, type: h.def.damageType,
        splash: a.splash || 0, onHit: a.onHit, bonusVsAir: a.bonusVsAir || 1,
        color: h.def.color, shape: a.projectileShape || 'dot', source: h,
      });
    }
  },

  /** Halbkreis-Schlag: trifft alle Bodengegner im Radius um das Ziel. */
  arc(run, h, targets, dmg) {
    const a = h.def.attack;
    const t = targets[0];
    fx(run, { type: 'arc', x: t.x, y: t.y, r: a.radius, color: h.def.color, life: 0.25 });
    for (const e of run.enemies) {
      if (!canHit(h, e) || dist(e, t) > a.radius) continue;
      const r = rollCrit(run, a, dmg);
      damageEnemy(run, e, r.dmg, h.def.damageType, { aoe: true, crit: r.crit, source: h });
      applyOnHit(run, e, a.onHit, r.dmg);
    }
  },

  /** Kettenblitz: springt zum jeweils nächsten noch nicht getroffenen Gegner. */
  chain(run, h, targets, dmg) {
    const a = h.def.attack;
    const hit = new Set();
    let cur = targets[0];
    let from = { x: h.x, y: h.y - 14 };
    let d = dmg;
    for (let i = 0; i < a.jumps && cur; i++) {
      hit.add(cur);
      fx(run, { type: 'line', x1: from.x, y1: from.y, x2: cur.x, y2: cur.y, color: '#9db4ff', width: 3, life: 0.2 });
      damageEnemy(run, cur, d, h.def.damageType, { aoe: true, source: h });
      applyOnHit(run, cur, a.onHit, d);
      from = { x: cur.x, y: cur.y };
      d *= a.falloff ?? 0.85;
      let next = null;
      let best = a.jumpRange ?? 150;
      for (const e of run.enemies) {
        if (hit.has(e) || !canHit(h, e)) continue;
        const dd = dist(from, e);
        if (dd <= best) { best = dd; next = e; }
      }
      cur = next;
    }
  },

  /** Sprungangriff: ignoriert Frontschilde, große Reichweite gegen Eliten. */
  leap(run, h, targets, dmg) {
    const a = h.def.attack;
    const t = targets[0];
    const r = rollCrit(run, a, dmg);
    fx(run, { type: 'dash', x1: h.x, y1: h.y, x2: t.x, y2: t.y, color: h.def.color, life: 0.25 });
    damageEnemy(run, t, r.dmg, h.def.damageType, { bypassShield: true, crit: r.crit, source: h });
    applyOnHit(run, t, a.onHit, r.dmg);
  },
};

// ---------- Fähigkeiten ----------
// tick(run, hero, params, dt) wird jede Simulationsstufe aufgerufen.
// Passive Auren (block, armorAura, haste, bossSlow) werden in run.computeAuras() ausgewertet.

/** Zählt den Fähigkeits-Timer herunter; true, sobald die Fähigkeit bereit ist. */
function ready(h, key, interval, dt) {
  h.abilityTimers[key] ??= interval * 0.5;
  h.abilityTimers[key] -= dt;
  return h.abilityTimers[key] <= 0;
}
/** Fähigkeit wurde ausgelöst → Timer neu starten. Ohne Ziel: kurz warten und erneut prüfen. */
const restart = (h, key, interval) => { h.abilityTimers[key] = interval; };
const retrySoon = (h, key) => { h.abilityTimers[key] = 0.2; };

const ABILITIES = {
  heal: {
    tick(run, h, ab, dt) {
      if (!ready(h, 'heal', ab.interval, dt)) return;
      const hurt = run.heroes.filter((o) => o.alive && o.hp < o.maxHp)
        .sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)
        .slice(0, ab.targets || 1);
      for (const o of hurt) {
        healHero(run, o, ab.amount * h.power);
        fx(run, { type: 'line', x1: h.x, y1: h.y, x2: o.x, y2: o.y, color: '#6fe39a', width: 2, life: 0.3 });
      }
      if (ab.towerAmount) run.healTower(ab.towerAmount * h.power);
      if (hurt.length || ab.towerAmount) restart(h, 'heal', ab.interval);
      else retrySoon(h, 'heal');
    },
  },

  towerRepair: {
    tick(run, h, ab, dt) {
      run.healTower(ab.perSecond * h.power * dt, true);
    },
  },

  iceField: {
    tick(run, h, ab, dt) {
      if (!ready(h, 'iceField', ab.interval, dt)) return;
      const cands = run.enemies.filter((e) => !e.dead && !e.flying && dist(h, e) <= h.def.stats.range);
      const p = densestPoint(run, cands, ab.radius);
      if (!p) return retrySoon(h, 'iceField');
      run.zones.push({ type: 'ice', x: p.x, y: run.field.groundY, r: ab.radius, slow: ab.slow, time: ab.duration, maxTime: ab.duration });
      restart(h, 'iceField', ab.interval);
    },
  },

  bell: {
    tick(run, h, ab, dt) {
      if (!ready(h, 'bell', ab.interval, dt)) return;
      const cands = run.enemies.filter((e) => !e.dead && dist(h, e) <= h.def.stats.range + ab.radius * 0.5);
      // Bosse, die gerade aufladen, haben Vorrang (Unterbrechung!)
      const charging = cands.find((e) => e.bossState?.charging > 0);
      const p = charging ? { x: charging.x, y: charging.y } : densestPoint(run, cands, ab.radius);
      if (!p) return retrySoon(h, 'bell');
      fx(run, { type: 'ring', x: p.x, y: p.y, r: ab.radius, color: '#ffe08a', life: 0.5 });
      for (const e of run.enemies) {
        if (!e.dead && dist(e, p) <= ab.radius) applyStatus(run, e, { type: 'stun', duration: ab.stun });
      }
      if (ab.heal) for (const o of run.heroes) healHero(run, o, ab.heal * h.power);
      run.emit('sound', 'bell');
      restart(h, 'bell', ab.interval);
    },
  },
};

// ---------- Update ----------

export function updateHeroes(run, dt) {
  for (const h of run.heroes) {
    h.hitFlash = Math.max(0, (h.hitFlash || 0) - dt);
    if (!h.alive) {
      h.reviveTimer -= dt;
      if (h.reviveTimer <= 0) {
        h.alive = true;
        h.hp = h.maxHp * run.balance.heroes.reviveHpFraction;
        fx(run, { type: 'ring', x: h.x, y: h.y, r: 30, color: '#ffffff', life: 0.4 });
      }
      continue;
    }
    h.root = Math.max(0, h.root - dt);
    h.freeze = Math.max(0, h.freeze - dt);
    if (h.root > 0 || h.freeze > 0) continue; // festgehalten / eingefroren: handlungsunfähig

    for (const [type, params] of Object.entries(h.def.abilities)) {
      ABILITIES[type]?.tick(run, h, params, dt);
    }

    const a = h.def.attack;
    if (a.kind === 'none') continue;
    h.atkTimer -= dt;
    if (h.atkTimer > 0) continue;
    const targets = selectTargets(run, h, a.multishot || 1);
    if (!targets.length) { h.atkTimer = 0.1; continue; }
    ATTACKS[a.kind](run, h, targets, heroDamage(run, h));
    h.atkTimer = heroAttackInterval(run, h);
    h.attackAnim = 0.12;
  }
}

/** Geschosse bewegen und beim Ziel einschlagen lassen. */
export function updateProjectiles(run, dt) {
  for (const p of run.projectiles) {
    if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d <= step + run.balance.combat.projectileHitRadius) {
      p.done = true;
      const t = p.target;
      if (t && !t.dead) {
        const dmg = p.damage * (t.flying ? p.bonusVsAir : 1);
        damageEnemy(run, t, dmg, p.type, { crit: p.crit, source: p.source, isTower: p.isTower });
        applyOnHit(run, t, p.onHit, dmg);
      }
      if (p.splash) {
        fx(run, { type: 'ring', x: p.tx, y: p.ty, r: p.splash, color: p.color, life: 0.25 });
        for (const e of run.enemies) {
          if (e !== t && !e.dead && dist(e, { x: p.tx, y: p.ty }) <= p.splash) damageEnemy(run, e, p.damage * 0.6, p.type, { aoe: true, source: p.source });
        }
      }
    } else {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
    }
  }
  run.projectiles = run.projectiles.filter((p) => !p.done);
}
