// Karten, Packs und das Sterne-System.
import { weightedPick, deepClone, applyPatches } from './util.js';

/** Zieht `count` Karten-IDs aus einem Pack gemäß seinen Seltenheits-Gewichten. */
export function drawCards(pack, data, count, rng, rarityUpChance = 0) {
  const byRarity = {};
  for (const id of pack.pool) {
    const card = data.cardIndex[id];
    if (card) (byRarity[card.def.rarity] ||= []).push(id);
  }
  const weights = Object.entries(pack.rarityWeights).filter(([r]) => byRarity[r]?.length);
  const out = [];
  const order = Object.keys(data.rarities).sort((a, b) => data.rarities[a].order - data.rarities[b].order);
  for (let i = 0; i < count; i++) {
    let rarity = weightedPick(weights, rng);
    // "Glückliches Händchen": Chance auf eine Stufe höhere Seltenheit (falls im Pool vorhanden)
    if (rarityUpChance > 0 && rng() < rarityUpChance) {
      const higher = order.slice(order.indexOf(rarity) + 1).find((r) => byRarity[r]?.length);
      if (higher) rarity = higher;
    }
    const list = byRarity[rarity];
    out.push(list[Math.floor(rng() * list.length)]);
  }
  return out;
}

/** Preis eines Packs nach `timesBought` Käufen in diesem Run (+12 % pro Kauf, per Mastery reduzierbar). */
export function packPrice(pack, timesBought, mods, balance) {
  const growth = Math.max(balance.economy.minPackPriceGrowth, balance.economy.packPriceGrowth + mods.priceGrowthAdd);
  return Math.round(pack.basePrice * Math.max(0.3, mods.packPriceMul) * Math.pow(1 + growth, timesBought));
}

/** Sterne aus der Anzahl gesammelter Duplikate. */
export function starsForCopies(copies, balance) {
  const t = balance.stars.thresholds;
  let stars = 1;
  for (let i = 1; i < t.length; i++) if (copies >= t[i]) stars = i + 1;
  return Math.min(stars, balance.stars.max);
}

/** Duplikate, die für den nächsten Stern nötig sind (null bei Maximum). */
export function copiesForNextStar(stars, balance) {
  return stars >= balance.stars.max ? null : balance.stars.thresholds[stars];
}

export const starMultiplier = (stars, balance) => 1 + balance.stars.statPerStar * (stars - 1);

/**
 * Baut die effektive Definition einer Karte für diesen Run:
 * Basisdaten + Mastery-Spezialisierungen + (ab 3 Sternen) verstärkte Fähigkeit.
 */
export function buildCardDef(baseDef, stars, mods, balance) {
  const def = deepClone(baseDef);
  applyPatches(def, mods.specs[baseDef.id]);
  if (stars >= balance.stars.enhancedFromStar && def.star3) applyPatches(def, def.star3.patches);
  return def;
}
