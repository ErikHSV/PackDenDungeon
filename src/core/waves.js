// Erzeugt die Gegner-Warteschlange einer Welle aus den Kapiteldaten.
import { weightedPick } from './util.js';

export function isBossWave(chapter, wave) {
  return wave === chapter.waves;
}

/**
 * Liefert eine Liste { id, elite, delay } in Spawn-Reihenfolge.
 * Anzahl wächst linear, Elite-Chance steigt ab `eliteFromWave`.
 */
export function buildWave(chapter, wave, data, rng) {
  const W = data.balance.waves;
  let count = Math.min(W.countMax, W.countBase + Math.floor(W.countPerWave * (wave - 1)));
  const pool = chapter.enemies.filter((e) => wave >= (e.fromWave ?? 1) && wave <= (e.toWave ?? Infinity));
  const eliteChance = wave >= W.eliteFromWave
    ? Math.min(W.eliteChanceMax, W.eliteChancePerWave * (wave - W.eliteFromWave + 1))
    : 0;

  const queue = [];
  while (count > 0) {
    const entry = weightedPick(pool.map((e) => [e, e.weight]), rng);
    const group = data.enemyIndex[entry.id].groupSize || 1;
    for (let g = 0; g < group && count > 0; g++, count--) {
      queue.push({ id: entry.id, elite: rng() < eliteChance, delay: g === 0 ? W.spawnInterval : W.groupSpawnInterval });
    }
  }
  if (isBossWave(chapter, wave)) {
    queue.splice(Math.floor(queue.length / 3), 0, { id: chapter.boss, elite: false, delay: 1.5 });
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
