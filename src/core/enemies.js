// Gegner: Bewegung, Blockade, Angriffe, Statuseffekte und Boss-Verhalten.
// Neue Boss-Fähigkeiten: Eintrag in BOSS_ABILITIES ergänzen und in enemies.json unter "bossAbilities" verwenden.
import { dist, applyPatches } from './util.js';
import { damageEnemy, damageHero, damageMinion, damageTower, fx } from './combat.js';

// ---------- Blockade ----------

const blockLoad = (run, blocker) =>
  run.enemies.reduce((s, e) => s + (!e.dead && e.blocker === blocker ? e.blockSlots : 0), 0);

function blockerValid(b) {
  return b.kind === 'hero' ? b.alive : b.hp > 0;
}

/** Versucht, einen Bodengegner an der Frontlinie festzuhalten (Tank-Helden, Diener). */
function tryBlock(run, e) {
  for (const h of run.heroes) {
    const cap = h.alive && h.def.abilities.block?.count;
    if (cap && blockLoad(run, h) + e.blockSlots <= cap) { e.blocker = h; return true; }
  }
  for (const m of run.minions) {
    if (m.hp > 0 && blockLoad(run, m) + e.blockSlots <= m.blockCap) { e.blocker = m; return true; }
  }
  return false;
}

// ---------- Boss-Fähigkeiten ----------

function pickHeroes(run, n) {
  const alive = run.heroes.filter((h) => h.alive);
  const out = [];
  while (out.length < n && alive.length) out.push(alive.splice(Math.floor(run.rng() * alive.length), 1)[0]);
  return out;
}

function bossTimer(e, key, interval, dt) {
  const t = e.bossState.timers;
  t[key] ??= interval * 0.6;
  t[key] -= dt;
  if (t[key] > 0) return false;
  t[key] = interval;
  return true;
}

const BOSS_ABILITIES = {
  /** Wurzeln halten zufällige Helden fest (können nicht angreifen). */
  roots(run, e, ab, dt) {
    if (!bossTimer(e, 'roots', ab.interval, dt)) return;
    for (const h of pickHeroes(run, ab.targets)) {
      h.root = ab.duration;
      fx(run, { type: 'text', x: h.x, y: h.y - 40, text: 'Verwurzelt!', color: '#a0764a', size: 12, life: 1 });
    }
    run.emit('sound', 'bossSkill');
  },

  /** Ruft Verstärkung herbei. */
  summon(run, e, ab, dt) {
    if (!bossTimer(e, 'summon', ab.interval, dt)) return;
    for (let i = 0; i < ab.count; i++) run.spawnEnemy(ab.enemy, { x: e.x + 30 + i * 22, wave: e.wave });
  },

  /** Lädt einen Schrei auf – nur durch Betäubung unterbrechbar. */
  scream(run, e, ab, dt) {
    const bs = e.bossState;
    if (bs.charging > 0) {
      if (e.st.stun > 0) {
        bs.charging = 0;
        bs.timers.scream = ab.interval;
        fx(run, { type: 'text', x: e.x, y: e.y - e.size - 30, text: 'Unterbrochen!', color: '#ffe08a', size: 16, life: 1.4 });
        run.emit('bossInterrupted', { enemy: e });
        return;
      }
      bs.charging -= dt;
      if (bs.charging <= 0) {
        bs.charging = 0;
        const scale = run.chapter.damageMult;
        damageTower(run, ab.towerDamage * scale);
        for (const h of run.heroes) damageHero(run, h, ab.heroDamage * scale);
        fx(run, { type: 'ring', x: e.x, y: e.y, r: 700, color: '#d0d4dd', life: 0.6 });
        fx(run, { type: 'text', x: e.x, y: e.y - e.size - 30, text: 'SCHREI!', color: '#ff6b6b', size: 20, life: 1.2 });
        run.emit('sound', 'scream');
      }
      return;
    }
    if (e.st.stun > 0) return;
    if (bossTimer(e, 'scream', ab.interval, dt)) {
      bs.charging = ab.chargeTime;
      bs.chargeMax = ab.chargeTime;
      run.emit('bossWarning', { enemy: e, text: `${e.name} holt Luft – betäube sie!` });
    }
  },

  /** Erzeugt Lavafelder unter Helden. */
  lavaField(run, e, ab, dt) {
    if (!bossTimer(e, 'lavaField', ab.interval, dt)) return;
    for (const h of pickHeroes(run, 1)) {
      run.zones.push({ type: 'lava', x: h.x, y: h.y, r: ab.radius, dps: ab.dps * run.chapter.damageMult, time: ab.duration, maxTime: ab.duration });
    }
  },

  /** Regeneriert Leben, solange der Boss nicht verlangsamt ist. */
  regen(run, e, ab, dt) {
    if (e.isSlowed) return;
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * ab.perSecond * dt);
    e.regenerating = true;
  },

  /** Friert zufällige Helden ein. */
  freeze(run, e, ab, dt) {
    if (!bossTimer(e, 'freeze', ab.interval, dt)) return;
    for (const h of pickHeroes(run, ab.count)) {
      h.freeze = ab.duration;
      fx(run, { type: 'text', x: h.x, y: h.y - 40, text: 'Eingefroren!', color: '#bfe9ff', size: 12, life: 1 });
    }
    run.emit('sound', 'bossSkill');
  },
};

function bossTick(run, e, dt) {
  const bs = e.bossState;
  // Phasenwechsel
  const phases = e.def.phases || [];
  while (bs.phase < phases.length && e.hp / e.maxHp <= phases[bs.phase].hpBelow) {
    const ph = phases[bs.phase++];
    applyPatches(e.def, ph.patches);
    if (ph.speedMul) e.speed *= ph.speedMul;
    for (const s of ph.spawn || []) for (let i = 0; i < s.count; i++) run.spawnEnemy(s.id, { x: e.x + 40 + i * 20, wave: e.wave });
    run.emit('bossWarning', { enemy: e, text: ph.text || 'Neue Phase!' });
  }
  e.regenerating = false;
  for (const [type, ab] of Object.entries(e.def.bossAbilities || {})) {
    if (type !== 'scream' && type !== 'regen' && e.st.stun > 0) continue; // betäubt: keine Fähigkeiten
    BOSS_ABILITIES[type]?.(run, e, ab, dt);
  }
}

// ---------- Update ----------

function tickStatuses(run, e, dt) {
  const st = e.st;
  st.stun = Math.max(0, st.stun - dt);
  if (st.slow.time > 0) { st.slow.time -= dt; if (st.slow.time <= 0) st.slow.factor = 1; }
  if (st.vuln.time > 0) st.vuln.time -= dt;
  if (st.burn.time > 0) {
    st.burn.time -= dt;
    damageEnemy(run, e, st.burn.dps * dt, null, { aoe: true, silent: true });
  }
}

function attack(run, e, dt, target) {
  e.atkTimer -= dt;
  if (e.atkTimer > 0) return;
  e.atkTimer = e.attackInterval;
  e.attackAnim = 0.15;
  if (target === 'tower') {
    const steal = e.traits.stealGold;
    if (steal) {
      const amount = Math.min(run.gold, Math.round(steal.amount * run.chapter.goldMult * e.goldScaleRaw));
      run.gold -= amount;
      run.stats.goldStolen += amount;
      fx(run, { type: 'text', x: e.x, y: e.y - 30, text: `-${amount} Gold`, color: '#ff6b6b', size: 14, life: 1.2 });
      run.emit('sound', 'steal');
      e.dead = true; // flieht mit der Beute (keine Belohnung)
      return;
    }
    damageTower(run, e.damage);
  } else if (target.kind === 'hero') {
    damageHero(run, target, e.damage);
  } else {
    damageMinion(run, target, e.damage);
  }
}

export function updateEnemies(run, dt) {
  const F = run.field;
  const wall = run.iceWall && run.iceWall.time > 0 ? run.iceWall : null;

  for (const e of run.enemies) {
    if (e.dead) continue;
    e.hitFlash = Math.max(0, (e.hitFlash || 0) - dt);
    e.attackAnim = Math.max(0, (e.attackAnim || 0) - dt);
    tickStatuses(run, e, dt);
    if (e.dead) continue;

    // Verlangsamung aus Status, Eisfeldern und Boss-Aura
    let slow = e.st.slow.time > 0 ? e.st.slow.factor : 1;
    if (!e.flying) {
      for (const z of run.zones) {
        if (z.type === 'ice' && Math.abs(e.x - z.x) <= z.r) {
          const f = 1 - z.slow * (e.boss ? run.balance.combat.statusBossFactor : 1);
          slow = Math.min(slow, f);
        }
      }
    }
    if (e.boss && run.auras.bossSlow > 0) slow *= 1 - run.auras.bossSlow;
    e.isSlowed = slow < 0.999;

    if (e.boss) bossTick(run, e, dt);
    if (e.dead || run.over) continue;
    if (e.st.stun > 0 || e.bossState?.charging > 0) continue;

    const speed = e.speed * slow;
    const towerContact = F.towerX + 6 + e.size;

    if (e.flying) {
      if (e.x > towerContact + 20) e.x -= speed * dt;
      else attack(run, e, dt, 'tower');
      continue;
    }

    // Bodengegner
    if (e.blocker && !blockerValid(e.blocker)) e.blocker = null;
    if (e.blocker) { attack(run, e, dt, e.blocker); continue; }

    if (wall && e.x > wall.x && e.x - speed * dt <= wall.x + e.size) {
      e.x = wall.x + e.size; // wartet an der Eiswand
      continue;
    }
    if (!e.passedFront && e.x - e.size <= F.frontX) {
      if (tryBlock(run, e)) { e.x = F.frontX + e.size; continue; }
      e.passedFront = true;
    }
    if (e.x > towerContact) e.x = Math.max(towerContact, e.x - speed * dt);
    else attack(run, e, dt, 'tower');
  }
}

// ---------- Skelett-Diener ----------

export function updateMinions(run, dt) {
  for (const m of run.minions) {
    m.life -= dt;
    if (m.hp <= 0 || m.life <= 0) continue;
    m.atkTimer -= dt;
    if (m.atkTimer > 0) continue;
    // greift den Gegner an, den er blockt, sonst den nächsten Bodengegner in Reichweite
    let target = run.enemies.find((e) => !e.dead && e.blocker === m);
    if (!target) {
      let best = 110;
      for (const e of run.enemies) {
        if (e.dead || e.flying) continue;
        const d = dist(m, e);
        if (d < best) { best = d; target = e; }
      }
    }
    if (!target) continue;
    damageEnemy(run, target, m.damage, 'physical', { source: m });
    fx(run, { type: 'slash', x: target.x, y: target.y, color: '#e8e4d8', life: 0.12 });
    m.atkTimer = 1 / m.attackSpeed;
  }
  const gone = run.minions.filter((m) => m.hp <= 0 || m.life <= 0);
  if (gone.length) {
    for (const e of run.enemies) if (gone.includes(e.blocker)) e.blocker = null;
    run.minions = run.minions.filter((m) => !gone.includes(m));
    run.layoutMinions();
  }
}
