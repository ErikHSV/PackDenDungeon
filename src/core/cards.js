// Kartenziehung aus Packs: Seltenheit (mit Fallback), Foil, geheime Grenzgänger.
import { weightedPick, deepClone, applyPatches } from './util.js';

/** Chance auf einen Grenzgänger: steigt leicht mit der Spielzeit der aktuellen Sitzung (+ Sternenkarte). */
export function grenzgaengerChance(data, sessionMinutes = 0, bonus = 0) {
  const G = data.balance.karten.grenzgaenger;
  return Math.min(G.maxChance + bonus, G.grundChance + G.proSitzungsMinute * sessionMinutes + bonus);
}

/**
 * Zieht eine Karte aus einem Pack.
 * @returns {{ id: string, foil: boolean }}
 */
export function drawCard(pack, data, rng, { foilChance, grenzChance, seltenheitMul = {} }) {
  if (grenzChance > 0 && rng() < grenzChance) {
    const gg = data.units.filter((u) => u.rarity === 'grenzgaenger');
    if (gg.length) return { id: gg[Math.floor(rng() * gg.length)].id, foil: rng() < foilChance };
  }
  // Feste Ergebnisse mit Gewichten (Holzpack: Stalljunge 60, Kettenschwinger 30, Schleuderin 9, Seltenes 1)
  if (pack.kartenGewichte) {
    const entries = Object.entries(pack.kartenGewichte).filter(([id]) => data.cardIndex[id])
      .map(([id, w]) => [id, w * (seltenheitMul[data.cardIndex[id].def.rarity] ?? 1)]);
    return { id: weightedPick(entries, rng), foil: rng() < foilChance };
  }
  const byRarity = {};
  for (const id of pack.pool) {
    const c = data.cardIndex[id];
    if (c) (byRarity[c.def.rarity] ||= []).push(id);
  }
  let rarity = weightedPick(Object.entries(pack.seltenheitsGewichte).map(([r, w]) => [r, w * (seltenheitMul[r] ?? 1)]), rng);
  if (!byRarity[rarity]) {
    // Fallback: nächstniedrigere vorhandene Seltenheit (sonst nächsthöhere)
    const order = Object.keys(data.rarities).sort((a, b) => data.rarities[a].rang - data.rarities[b].rang);
    const idx = order.indexOf(rarity);
    rarity = order.slice(0, idx).reverse().find((r) => byRarity[r]) ?? order.slice(idx).find((r) => byRarity[r]);
  }
  const list = byRarity[rarity];
  return { id: list[Math.floor(rng() * list.length)], foil: rng() < foilChance };
}

/** Effektive Einheiten-Definition: Basis + Sternenkarten-Patches (+ optional Entwicklung). */
/** Effektive Einheiten-Definition: Basis + Skill-Tree-Patches; stage 1/2 = erste/zweite Entwicklung. */
export function buildUnitDef(base, mods, stage = 0) {
  const def = deepClone(base);
  applyPatches(def, mods.einheiten[base.id]);
  const ev = def.entwicklung;
  if (stage >= 1 && ev) {
    for (const [k, m] of Object.entries(ev.werteMul || {})) def.werte[k] *= m;
    applyPatches(def, ev.patches);
    def.name = ev.name;
    def.sprite = ev.sprite ?? def.sprite;
  }
  if (stage >= 2 && ev?.stufe2) {
    for (const [k, m] of Object.entries(ev.stufe2.werteMul || {})) def.werte[k] *= m;
    applyPatches(def, ev.stufe2.patches);
    def.name = ev.stufe2.name;
  }
  return def;
}
