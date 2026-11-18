// Schaden, Statuseffekte und Tod – für Gegner, Einheiten und den Turm.
import { dist } from './util.js';

/** Visueller Effekt (nur im Browser; headless werden Effekte übersprungen). */
export function fx(run, e) {
  if (run.headless) return;
  if (run.effects.length > 260 && (e.type === 'text' || e.type === 'coin')) return;
  run.effects.push({ age: 0, life: 0.8, ...e });
}

export function newStatus() {
  return { stun: 0, freeze: 0, slow: { f: 1, t: 0 }, burn: { dps: 0, t: 0 }, poison: { dps: 0, t: 0 }, vuln: { a: 0, t: 0 }, plague: null };
}

function dmgText(run, target, amount, crit, magic) {
  if (!run.settings.damageNumbers || amount < 0.5) return;
  fx(run, {
    type: 'text', x: target.x + (Math.random() * 20 - 10), y: target.y - (target.r || 20) - 18,
    text: String(Math.round(amount)) + (crit ? '!' : ''), color: crit ? '#FFD24A' : magic ? '#5AA9F0' : '#FFFFFF', size: crit ? 28 : 19,
  });
}

// ---------------------------------------------------------------------------
// Statuseffekte auf Gegnern
// ---------------------------------------------------------------------------

export function applyStatus(run, e, st, hit = 0, source = null) {
  if (e.dead) return;
  if (st.chance != null && run.rng() > st.chance) return;
  const boss = e.boss ? 0.5 : 1;
  const S = e.st;
  switch (st.typ) {
    case 'betaeubung': S.stun = Math.max(S.stun, (st.dauer ?? 1) * boss); break;
    case 'verlangsamung': {
      const f = 1 - (1 - (st.faktor ?? 0.6)) * boss;
      if (f < S.slow.f || S.slow.t <= 0) S.slow.f = f;
      S.slow.t = Math.max(S.slow.t, st.dauer ?? 2);
      break;
    }
    case 'brennen': S.burn = { dps: Math.max(S.burn.t > 0 ? S.burn.dps : 0, st.schadenProSekunde ?? hit * (st.anteil ?? 0.3)), t: Math.max(S.burn.t, st.dauer ?? 3) }; break;
    case 'gift': S.poison = { dps: Math.max(S.poison.t > 0 ? S.poison.dps : 0, st.schadenProSekunde ?? hit * 0.25), t: Math.max(S.poison.t, st.dauer ?? 4) }; break;
    case 'verwundbarkeit': S.vuln = { a: Math.max(S.vuln.t > 0 ? S.vuln.a : 0, st.anteil ?? 0.2), t: Math.max(S.vuln.t, st.dauer ?? 3) }; break;
    case 'seuche': S.plague = { t: st.dauer ?? 6, dmg: st.explosionSchaden ?? 20, r: st.explosionRadius ?? 80 }; break;
    case 'rueckstoss': {
      if (e.fliegt) break;
      const d = (st.distanz ?? 40) * (e.boss ? 0.15 : e.elite ? 0.5 : 1);
      const from = source ?? run.tower;
      const ang = Math.atan2(e.y - from.y, e.x - from.x);
      e.x += Math.cos(ang) * d;
      e.y += Math.sin(ang) * d;
      run.clampToArena(e, 1.05);
      e.engaged = null;
      break;
    }
  }
}

export function applyOnHit(run, e, list, hit, source) {
  for (const st of list || []) applyStatus(run, e, st, hit, source);
}

// ---------------------------------------------------------------------------
// Schaden an Gegnern
// ---------------------------------------------------------------------------

/**
 * opts: { aoe, crit, silent, source (Einheit), from ({x,y} Angriffsrichtung), cursor }
 */
export function damageEnemy(run, e, amount, type, opts = {}) {
  if (!e || e.dead || amount <= 0) return 0;
  if (type && e.immun.includes(type) && !opts.cursor) {
    if (!opts.silent) fx(run, { type: 'text', x: e.x, y: e.y - e.r - 14, text: 'IMMUN', color: '#9fe8ff', size: 15 });
    return 0;
  }
  // Frontschild: blockt Einzeltreffer von vorn (aus Richtung des Turms)
  if (e.frontSchild && !opts.aoe && !opts.cursor && opts.from) {
    const facing = Math.atan2(run.tower.y - e.y, run.tower.x - e.x);
    const incoming = Math.atan2(opts.from.y - e.y, opts.from.x - e.x);
    let diff = Math.abs(facing - incoming);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff < Math.PI / 2) {
      if (!opts.silent) fx(run, { type: 'text', x: e.x, y: e.y - e.r - 14, text: 'BLOCK', color: '#d9c38c', size: 15 });
      return 0;
    }
  }
  let d = amount;
  if (type === 'physical') d = Math.max(d * 0.2, d - e.ruestung);
  else if (type === 'magic') d *= 1 - e.magieResistenz;
  if (e.st.vuln.t > 0) d *= 1 + e.st.vuln.a;
  if (e.boss && opts.source) d *= run.mods.bossSchadenMul;
  e.hp -= d;
  e.hitFlash = 0.1;
  e.wasHit = true;
  if (opts.source) opts.source.damage = (opts.source.damage || 0) + d;
  if (!opts.silent) dmgText(run, e, d, opts.crit, type === 'magic');
  if (e.hp <= 0) killEnemy(run, e, opts.source);
  return d;
}

export function killEnemy(run, e, killer = null) {
  if (e.dead) return;
  e.dead = true;
  e.hp = 0;
  run.stats.kills++;
  const k = (run.stats.killsNachArt[e.id] ||= { normal: 0, foil: 0 });
  k[e.foil ? 'foil' : 'normal']++;
  if (e.foil) {
    // Shiny-Monster (10.1): das erste Shiny jeder Art gibt sicher +1 Schimmer (und Mastery), danach +1 mit 25 % Chance.
    // Shiny-Bosse zahlen ihren Schimmer erst nach dem Sieg (Gesucht).
    run.stats.foilMonster++;
    fx(run, { type: 'sparkles', x: e.x, y: e.y - 20, life: 1 });
    if (!e.isBoss) {
      const E = run.B.belohnungen.erstesShiny;
      if (!(run.save.bestiary[e.id]?.foil > 0) && k.foil === 1) { run.stats.bonusMastery += E.masteryMonster; run.gainShimmer(E.foilStaubMonster, 'ersteShinyMonster', e.x, e.y - 20); }
      else if (run.rng() < run.B.wellen.foilMonster.schimmerChance) run.gainShimmer(1, 'shinyMonster', e.x, e.y - 20);
    }
  }
  if (killer && run.mods.heldenHeilungProKill && !killer.dead) killer.hp = Math.min(killer.maxHp, killer.hp + killer.maxHp * run.mods.heldenHeilungProKill);
  // Münzen gibt es nur aus dem Tageseinkommen. Fähigkeiten wie „Bonus-Münzen pro Kill“ bringen Bonus-Münzen für den nächsten Tag.
  const coins = killer?.def?.faehigkeiten?.bonusMuenzen?.proKill ?? 0;
  if (coins > 0) {
    run.coins += coins;
    run.stats.muenzen += coins;
    fx(run, { type: 'coin', x: e.x, y: e.y, delay: 0, life: 0.85, seed: Math.random() });
    run.emit('coins', { amount: coins });
  }

  // Heilung bei Kills (z. B. Waffenknecht)
  const kh = killer?.def?.faehigkeiten?.killHeilung;
  if (kh && !killer.dead && (!kh.nurEntwickelt || killer.evolved)) killer.hp = Math.min(killer.maxHp, killer.hp + killer.maxHp * kh.anteil);
  if (killer) {
    killer.kills = (killer.kills || 0) + 1;
    run.checkEvolution(killer);
  }
  const t = e.def.eigenschaften || {};
  if (t.explodiertBeimTod) {
    const { schaden, radius } = t.explodiertBeimTod;
    fx(run, { type: 'burst', x: e.x, y: e.y, r: radius, color: '#ff7a2a', life: 0.45 });
    for (const u of run.units) if (!u.dead && dist(u, e) <= radius) damageUnit(run, u, schaden * run.chapter.wellen.schadenMul);
  }
  if (t.teiltSichBeimTod) {
    for (let i = 0; i < t.teiltSichBeimTod.anzahl; i++) {
      run.spawnEnemy(t.teiltSichBeimTod.in, { x: e.x + (i ? 24 : -24), y: e.y + (i ? 12 : -12), wave: e.wave });
    }
  }
  // Seuche: infizierte Gegner explodieren beim Tod
  if (e.st.plague?.t > 0) {
    const p = e.st.plague;
    fx(run, { type: 'burst', x: e.x, y: e.y, r: p.r, color: '#9be84a', life: 0.45 });
    for (const o of run.enemies) if (o !== e && !o.dead && dist(o, e) <= p.r) damageEnemy(run, o, p.dmg, 'magic', { aoe: true, silent: true });
  }
  if (e.boss) run.onBossKilled(e);
  run.emit('kill', { enemy: e });
}

// ---------------------------------------------------------------------------
// Schaden an Einheiten
// ---------------------------------------------------------------------------

/** Schaden an einer Einheit. attacker = Gegner (für Blocken mit Betäubung). */
export function damageUnit(run, u, amount, attacker = null) {
  if (u.dead || amount <= 0) return 0;
  const block = u.def.faehigkeiten.blocken;
  if (block && attacker && run.rng() < block.chance) {
    u.blocks = (u.blocks || 0) + 1;
    fx(run, { type: 'text', x: u.x, y: u.y - 70, text: 'Block!', color: '#d9c38c', size: 16 });
    if (block.betaeuben) applyStatus(run, attacker, { typ: 'betaeubung', dauer: 1 });
    // Schildstoß: Block betäubt alle Gegner im Umkreis
    if (block.umkreis) {
      fx(run, { type: 'ring', x: u.x, y: u.y, r: block.umkreis.radius, color: '#d9c38c', life: 0.35 });
      for (const e of run.enemies) if (!e.dead && dist(e, u) <= block.umkreis.radius) applyStatus(run, e, { typ: 'betaeubung', dauer: block.umkreis.dauer });
    }
    if (block.blitz && (block.blitzChance == null || run.rng() < block.blitzChance)) {
      fx(run, { type: 'bolt', x1: u.x, y1: u.y - 40, x2: attacker.x, y2: attacker.y, color: '#fff6a0', life: 0.2 });
      damageEnemy(run, attacker, block.blitz, 'magic', { aoe: true, source: u });
    }
    run.checkEvolution(u);
    return 0;
  }
  u.hp -= amount;
  u.hitFlash = 0.1;
  if (u.hp <= 0) run.killUnit(u);
  return amount;
}

export function healUnit(run, u, amount) {
  if (u.dead) return;
  u.hp = Math.min(u.maxHp, u.hp + amount);
}

// ---------------------------------------------------------------------------
// Turm
// ---------------------------------------------------------------------------

export function damageTower(run, amount, attacker = null, heavy = false) {
  const t = run.tower;
  if (run.over) return;
  // Bollwerk-Schild fängt Schaden ab; zerbricht er, betäubt eine Schockwelle alle Gegner
  if (t.shield > 0) {
    const absorbed = Math.min(t.shield, amount);
    t.shield -= absorbed;
    amount -= absorbed;
    if (t.shield <= 0) {
      fx(run, { type: 'ring', x: t.x, y: t.y, r: 1400, color: '#7ac8ff', life: 0.9 });
      fx(run, { type: 'flash', x: t.x, y: t.y - 30, r: 300, color: '#7ac8ff', life: 0.6 });
      for (const e of run.enemies) if (!e.dead) { applyStatus(run, e, { typ: 'betaeubung', dauer: 3 }); damageEnemy(run, e, 25 * run.chapter.wellen.lebenMul, 'magic', { aoe: true, silent: true }); }
      run.emit('shake', { power: 18 });
      run.emit('sound', 'bossSkill');
    }
    if (amount <= 0) { t.hitFlash = 0.1; return; }
  }
  t.hp -= amount;
  t.hitFlash = 0.15;
  t.lastHit = run.time; // kleine Lebensleiste über dem Turm erscheint für 3 s
  run.emit('towerHit', { amount });
  if (heavy || amount >= t.maxHp * run.data.balance.turm.schweresTrefferAnteil) run.emit('shake', { power: heavy ? 14 : 8 });
  // Dornen (Sternenkarte) und Dornenmauer (Relikt)
  const thorns = run.mods.turmDornen + run.relicValue('rueckschaden', 'schaden');
  if (attacker && thorns > 0) damageEnemy(run, attacker, thorns, null, { aoe: true, silent: true });
  if (t.hp <= 0) { t.hp = 0; run.finish(false); }
}
