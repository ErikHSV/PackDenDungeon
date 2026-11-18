// Erzeugt die Gegner-Warteschlange einer Welle aus den Kapiteldaten.
import { weightedPick } from './util.js';

export function isBossWave(chapter, wave) {
  return wave === chapter.waves;
}

/** Jede n-te Welle (außer der Bosswelle) ist eine Elitewelle. */
export function isEliteWave(chapter, wave, balance) {
  const n = balance.waves.eliteWaveEvery;
  return !!n && wave % n === 0 && !isBossWave(chapter, wave);
}

/** Über wie viele Sekunden die Gegner dieser Welle verteilt erscheinen (15 s → 25 s im Kapitelverlauf). */
export function spawnDuration(chapter, wave, balance) {
  const W = balance.waves;
  const t = chapter.waves > 1 ? (wave - 1) / (chapter.waves - 1) : 0;
  return W.spawnDurationFirst + (W.spawnDurationLast - W.spawnDurationFirst) * t;
}

/**
 * Liefert eine Liste { id, elite, delay } in Spawn-Reihenfolge.
 * delay = Wartezeit vor diesem Spawn. Gruppen (z. B. Krähenschwärme) erscheinen dicht hintereinander.
 */
export function buildWave(chapter, wave, data, rng) {
  const B = data.balance;
  const W = B.waves;
  let count = Math.min(W.countMax, W.countBase + Math.floor(W.countPerWave * (wave - 1)));
  if (isBossWave(chapter, wave)) count = Math.max(2, Math.round(count * (W.bossWaveCountFactor ?? 1)));
  const pool = chapter.enemies.filter((e) => wave >= (e.fromWave ?? 1) && wave <= (e.toWave ?? Infinity));
  let eliteChance = wave >= W.eliteFromWave
    ? Math.min(W.eliteChanceMax, W.eliteChancePerWave * (wave - W.eliteFromWave + 1))
    : 0;
  if (isEliteWave(chapter, wave, B)) eliteChance = Math.max(eliteChance, W.eliteWaveChance);

  // Zuerst Gruppen bilden, dann gleichmäßig über die Spawn-Dauer verteilen
  const groups = [];
  while (count > 0) {
    const entry = weightedPick(pool.map((e) => [e, e.weight]), rng);
    const size = Math.min(count, data.enemyIndex[entry.id].groupSize || 1);
    groups.push(Array.from({ length: size }, () => ({ id: entry.id, elite: rng() < eliteChance })));
    count -= size;
  }
  const gap = spawnDuration(chapter, wave, B) / Math.max(1, groups.length);
  const queue = [];
  groups.forEach((g, gi) => g.forEach((s, i) => queue.push({ ...s, delay: i === 0 ? (gi === 0 ? 0 : gap) : W.groupSpawnInterval })));

  if (isBossWave(chapter, wave)) {
    queue.splice(Math.floor(queue.length / 3), 0, { id: chapter.boss, elite: false, delay: gap });
  }
  return queue;
}

/** Skalierungsfaktoren für Gegner einer bestimmten Welle. */
export function waveScaling(chapter, wave, balance) {
  const W = balance.waves;
  const growth = chapter.hpGrowth ?? W.hpGrowth;
  return {
    hp: chapter.hpMult * Math.pow(growth, wave - 1),
    bossHp: chapter.hpMult,
    gold: chapter.goldMult * Math.pow(W.goldGrowth, wave - 1),
    damage: chapter.damageMult * Math.pow(W.damageGrowth, wave - 1),
  };
}
