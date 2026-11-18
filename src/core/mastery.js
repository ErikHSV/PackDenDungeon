// Meta-Progression: Mastery-Baum.

export const MOD_DEFAULTS = {
  startGold: 0,
  killGoldMul: 1,
  packPriceMul: 1,
  priceGrowthAdd: 0,
  bonusCardChance: 0,
  towerHpMul: 1,
  towerDamageMul: 1,
  attackSpeedMul: 1,
  damageMul: 1,
  heroHpMul: 1,
  extraSlots: 0,
};

/** Kosten für den Kauf der nächsten Stufe (aktuelle Stufe = level). */
export function nodeCost(node, level) {
  return Math.round(node.baseCost * Math.pow(node.costGrowth ?? 1.5, level));
}

/** Rechnet alle gekauften Mastery-Stufen in Modifikatoren für einen Run um. */
export function computeModifiers(masteryData, levels = {}) {
  const mods = { ...MOD_DEFAULTS, specs: {} };
  for (const node of masteryData.nodes) {
    const lvl = levels[node.id] || 0;
    if (!lvl) continue;
    const e = node.effect;
    if (e.type === 'spec') (mods.specs[e.card] ||= []).push(...e.patches);
    else if (e.type === 'stat') mods[e.stat] = (mods[e.stat] ?? 0) + e.perLevel * lvl;
  }
  return mods;
}

/** Gründe, warum ein Knoten (noch) nicht gekauft werden kann; null = kaufbar. */
export function purchaseBlocker(node, save) {
  const lvl = save.mastery[node.id] || 0;
  if (lvl >= node.maxLevel) return 'Maximum erreicht';
  if (node.effect.type === 'spec' && !(save.collection[node.effect.card] > 0)) return 'Karte noch nicht gefunden';
  if (save.masteryPoints < nodeCost(node, lvl)) return 'Zu wenig Punkte';
  return null;
}

export function buyNode(node, save) {
  if (purchaseBlocker(node, save)) return false;
  const lvl = save.mastery[node.id] || 0;
  save.masteryPoints -= nodeCost(node, lvl);
  save.mastery[node.id] = lvl + 1;
  return true;
}

/** Mastery-Punkte für ein Run-Ergebnis. */
export function masteryPointsFor(result, balance) {
  return result.wave * balance.mastery.pointsPerWave + (result.bossKilled ? balance.mastery.pointsPerBoss : 0);
}
