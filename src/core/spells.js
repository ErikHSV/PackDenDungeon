// Zauber-Karten: Aufladen, automatisches/manuelles Auslösen und Effekte.
// Neue Zaubereffekte: Eintrag in SPELL_EFFECTS ergänzen und in spells.json unter effect.type verwenden.
import { dist } from './util.js';
import { damageEnemy, applyStatus, densestPoint, healHero, fx } from './combat.js';

/** Zauberstärke wächst mit der Welle, damit Zauber auch später relevant bleiben. */
const waveScale = (run) => Math.pow(run.balance.spells.waveScaling, Math.max(0, run.wave - 1));

const SPELL_EFFECTS = {
  rockfall(run, s, eff) {
    const cands = run.enemies.filter((e) => !e.dead && e.x < run.field.width);
    const p = densestPoint(run, cands, eff.radius);
    if (!p) return false;
    const dmg = eff.damage * run.mods.damageMul * waveScale(run);
    fx(run, { type: 'rocks', x: p.x, y: p.y, r: eff.radius, color: s.def.color, life: 0.6 });
    for (const e of cands) {
      if (dist(e, p) > eff.radius) continue;
      damageEnemy(run, e, dmg, eff.damageType, { aoe: true });
      if (eff.stun) applyStatus(run, e, { type: 'stun', duration: eff.stun });
    }
    return true;
  },

  heal(run, s, eff) {
    run.healTower(eff.tower * waveScale(run));
    for (const h of run.heroes) healHero(run, h, h.maxHp * eff.heroPct);
    fx(run, { type: 'ring', x: run.tower.x, y: run.tower.y, r: 120, color: '#6fe39a', life: 0.6 });
    return true;
  },

  goldRush(run, s, eff) {
    run.buffs.goldRush = { time: eff.duration, multiplier: eff.multiplier };
    return true;
  },

  iceWall(run, s, eff) {
    run.iceWall = { x: run.field.frontX + 70, time: eff.duration, maxTime: eff.duration };
    return true;
  },

  warHorn(run, s, eff) {
    run.buffs.warHorn = { time: eff.duration, amount: eff.amount };
    return true;
  },

  curse(run, s, eff) {
    run.buffs.curse = { time: eff.duration, amount: eff.amount };
    return true;
  },
};

/** Prüft die Auto-Bedingungen aus den Daten (eine erfüllte Bedingung reicht). */
function shouldAutoCast(run, s) {
  const a = s.def.auto || {};
  const alive = run.enemies.filter((e) => !e.dead && e.x < run.field.width);
  if (a.minEnemies && alive.length >= a.minEnemies) return true;
  if (a.bossPresent && alive.some((e) => e.boss)) return true;
  if (a.minEnemiesNearFront) {
    const near = alive.filter((e) => !e.flying && !e.blocker && e.x < run.field.frontX + 300 && e.x > run.field.frontX).length;
    if (near >= a.minEnemiesNearFront) return true;
  }
  if (a.towerBelow && run.tower.hp / run.tower.maxHp < a.towerBelow) return true;
  if (a.heroesBelow && run.heroes.some((h) => h.alive && h.hp / h.maxHp < a.heroesBelow)) return true;
  return false;
}

export function castSpell(run, s) {
  if (run.over || s.charge < s.cooldown) return false;
  const ok = SPELL_EFFECTS[s.def.effect.type]?.(run, s, s.def.effect);
  if (!ok) return false;
  s.charge = 0;
  s.flash = 0.4;
  run.stats.spellsCast++;
  run.emit('spellCast', { spell: s });
  return true;
}

export function updateSpells(run, dt) {
  for (const s of run.spells) {
    s.flash = Math.max(0, (s.flash || 0) - dt);
    s.charge = Math.min(s.cooldown, s.charge + dt);
    if (s.charge >= s.cooldown && run.settings.autoSpells && shouldAutoCast(run, s)) castSpell(run, s);
  }
}
