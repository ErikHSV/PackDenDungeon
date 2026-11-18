// Schadensberechnung, Statuseffekte und Tod von Einheiten.
import { dist } from './util.js';

// ---------- Visuelle Effekte (werden vom Renderer gezeichnet) ----------

export function fx(run, effect) {
  if (run.headless) return;
  if ((effect.type === 'text' || effect.type === 'coin') && run.effects.length > 220) return; // Schutz vor Effektflut
  run.effects.push({ age: 0, life: 0.8, ...effect });
}

/** Schadenszahl: weiß = normal, gelb + größer = kritisch, blau = magisch. */
function damageText(run, target, amount, crit, magic) {
  if (!run.settings.damageNumbers || amount < 1) return;
  fx(run, {
    type: 'text', x: target.x + (Math.random() * 26 - 13), y: target.y - (target.size || 30) - 10,
    text: String(Math.round(amount)) + (crit ? '!' : ''),
    color: crit ? '#FFD24A' : magic ? '#5AA9F0' : '#FFFFFF',
    size: crit ? 30 : 20, life: 0.8,
  });
}

// ---------- Statuseffekte auf Gegnern ----------

export function newStatusBlock() {
  return { stun: 0, slow: { factor: 1, time: 0 }, burn: { dps: 0, time: 0 }, vuln: { amount: 0, time: 0 } };
}

/**
 * Wendet einen Statuseffekt aus den Daten an.
 * hitDamage wird für Brennen (dpsFactor) verwendet.
 */
export function applyStatus(run, e, st, hitDamage = 0) {
  if (e.dead) return;
  if (st.chance != null && run.rng() > st.chance) return;
  const C = run.balance.combat;
  const bossF = e.boss ? C.statusBossFactor : 1;
  switch (st.type) {
    case 'stun':
      e.st.stun = Math.max(e.st.stun, st.duration * bossF);
      break;
    case 'slow': {
      // kleinerer Faktor = stärker; Boss-Verlangsamung wird halbiert
      const factor = 1 - (1 - st.factor) * bossF;
      if (factor <= e.st.slow.factor || e.st.slow.time <= 0) e.st.slow.factor = factor;
      e.st.slow.time = Math.max(e.st.slow.time, st.duration);
      break;
    }
    case 'burn': {
      const dps = st.dps ?? hitDamage * (st.dpsFactor ?? 0.2);
      e.st.burn.dps = Math.max(e.st.burn.time > 0 ? e.st.burn.dps : 0, dps);
      e.st.burn.time = Math.max(e.st.burn.time, st.duration);
      break;
    }
    case 'vulnerable':
      e.st.vuln.amount = Math.max(e.st.vuln.time > 0 ? e.st.vuln.amount : 0, st.amount);
      e.st.vuln.time = Math.max(e.st.vuln.time, st.duration);
      break;
    case 'knockback': {
      if (e.flying) break;
      let d = st.distance;
      if (e.boss) d *= C.knockbackBossFactor;
      else if (e.elite) d *= C.knockbackEliteFactor;
      e.x = Math.min(run.field.spawnX - 20, e.x + d);
      // Rückstoß löst eine Blockade – der Gegner muss erneut anlaufen
      if (e.blocker && d > 10) { e.blocker = null; e.passedFront = false; }
      break;
    }
  }
}

export function applyOnHit(run, e, list, hitDamage) {
  if (!list) return;
  for (const st of list) applyStatus(run, e, st, hitDamage);
}

// ---------- Schaden an Gegnern ----------

/**
 * Fügt einem Gegner Schaden zu und berücksichtigt Immunität, Frontschild,
 * Rüstung, Magieresistenz, Verwundbarkeit und Fluch.
 * opts: { aoe, bypassShield, crit, silent, source }
 */
export function damageEnemy(run, e, amount, type, opts = {}) {
  if (!e || e.dead || amount <= 0) return 0;
  if (type && e.immune.includes(type)) {
    if (!opts.silent) fx(run, { type: 'text', x: e.x, y: e.y - e.size - 14, text: 'IMMUN', color: '#9fe8ff', size: 16 });
    return 0;
  }
  if (e.frontalShield && !opts.aoe && !opts.bypassShield) {
    if (!opts.silent) fx(run, { type: 'text', x: e.x, y: e.y - e.size - 14, text: 'BLOCK', color: '#d9c38c', size: 16 });
    return 0;
  }
  let d = amount;
  if (type === 'physical') d = Math.max(d * run.balance.combat.armorMinFraction, d - e.armor);
  else if (type === 'magic') d *= 1 - e.magicResist;
  if (e.st.vuln.time > 0) d *= 1 + e.st.vuln.amount;
  if (run.buffs.curse.time > 0) d *= 1 + run.buffs.curse.amount;

  e.hp -= d;
  e.hitFlash = 0.1;
  e.wasHit = true;
  run.stats.damageDealt += d;
  if (opts.source) opts.source.damageDone = (opts.source.damageDone || 0) + d;
  if (!opts.silent) damageText(run, e, d, opts.crit, type === 'magic');
  if (e.hp <= 0) killEnemy(run, e);
  return d;
}

export function killEnemy(run, e, { noReward = false } = {}) {
  if (e.dead) return;
  e.dead = true;
  e.hp = 0;
  if (noReward) return;
  run.stats.kills++;

  // Gold fällt als Münzen auf den Boden und muss mit dem Runenkreis eingesammelt werden
  const goldMul = run.mods.killGoldMul * (run.buffs.goldRush.time > 0 ? run.buffs.goldRush.multiplier : 1);
  const gold = Math.max(1, Math.round(e.gold * goldMul));
  if (e.elite && run.mods.flags.goldader) run.dropCoins(e, gold * run.balance.coins.nuggetMultiplier, true);
  else run.dropCoins(e, gold);

  const t = e.traits;
  // Explosion beim Tod: schadet nahen Helden und Dienern
  if (t.explodeOnDeath) {
    const { damage, radius } = t.explodeOnDeath;
    const dmg = damage * e.damageScale;
    fx(run, { type: 'burst', x: e.x, y: e.y, r: radius, color: '#ff7a2a', life: 0.5 });
    for (const h of run.heroes) if (h.alive && dist(h, e) <= radius) damageHero(run, h, dmg);
    for (const m of run.minions) if (m.hp > 0 && dist(m, e) <= radius) damageMinion(run, m, dmg);
  }
  // Teilung beim Tod
  if (t.splitOnDeath) {
    for (let i = 0; i < t.splitOnDeath.count; i++) {
      run.spawnEnemy(t.splitOnDeath.into, { x: e.x + 18 + i * 14, wave: e.wave, elite: false });
    }
  }
  // Knochenflüsterer: Diener erwecken
  if (!e.boss && !e.flying) {
    for (const h of run.heroes) {
      const ab = h.alive && h.def.abilities.raiseDead;
      if (ab && run.minions.length < ab.maxMinions && run.rng() < ab.chance) {
        run.spawnMinion(h, ab, e.x);
        break;
      }
    }
  }
  if (e.boss) run.onBossKilled(e);
  run.emit('kill', { enemy: e });
}

// ---------- Schaden an Helden / Dienern ----------

export function damageHero(run, h, amount) {
  if (!h.alive) return 0;
  const C = run.balance.combat;
  const d = Math.max(amount * C.heroArmorMinFraction, amount - run.auras.armor);
  h.hp -= d;
  h.hitFlash = 0.1;
  if (h.hp <= 0) {
    h.hp = 0;
    h.alive = false;
    h.reviveTimer = run.balance.heroes.reviveTime;
    h.root = 0;
    h.freeze = 0;
    for (const e of run.enemies) if (e.blocker === h) e.blocker = null;
    h.deathAge = 0;
    fx(run, { type: 'text', x: h.x, y: h.y - 60, text: 'K.O.', color: '#E04848', size: 22, life: 1.2 });
    run.emit('heroDown', { hero: h });
  }
  return d;
}

export function healHero(run, h, amount) {
  if (!h.alive || amount <= 0) return 0;
  const before = h.hp;
  h.hp = Math.min(h.maxHp, h.hp + amount);
  const healed = h.hp - before;
  if (healed >= 1 && run.settings.damageNumbers) {
    fx(run, { type: 'text', x: h.x, y: h.y - 60, text: `+${Math.round(healed)}`, color: '#5ED17A', size: 18 });
  }
  return healed;
}

export function damageMinion(run, m, amount) {
  m.hp -= amount;
  if (m.hp <= 0) {
    m.hp = 0;
    for (const e of run.enemies) if (e.blocker === m) e.blocker = null;
  }
}

export function damageTower(run, amount, fromBoss = false) {
  run.tower.hp -= amount;
  run.tower.hitFlash = 0.15;
  run.emit('towerHit', { amount });
  if (fromBoss || amount >= run.tower.maxHp * run.balance.tower.heavyHitFraction) run.emit('shake', { power: fromBoss ? 12 : 8 });
  // "Letztes Bollwerk": einmal pro Run überlebt der Turm einen tödlichen Treffer
  if (run.tower.hp <= 0 && run.mods.flags.letztesBollwerk && !run.lastStandUsed) {
    run.lastStandUsed = true;
    run.tower.hp = run.tower.maxHp * run.balance.tower.lastStandHp;
    fx(run, { type: 'text', x: run.tower.x, y: run.tower.y - 180, text: 'Letztes Bollwerk!', color: '#FFD24A', size: 30, life: 2 });
    run.emit('shake', { power: 14 });
    return;
  }
  if (run.tower.hp <= 0) {
    run.tower.hp = 0;
    run.finish(false);
  }
}

// ---------- Zielsuche ----------

/** Ort mit den meisten Gegnern (für Eisfelder, Glocke, Steinregen). */
export function densestPoint(run, candidates, radius) {
  let best = null;
  let bestCount = 0;
  for (const c of candidates) {
    let n = 0;
    for (const o of candidates) if (dist(c, o) <= radius) n += o.boss ? 3 : 1;
    if (n > bestCount) { bestCount = n; best = c; }
  }
  return best ? { x: best.x, y: best.y, count: bestCount } : null;
}

export function aliveEnemies(run) {
  return run.enemies.filter((e) => !e.dead);
}
