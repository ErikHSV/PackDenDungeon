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
export function drawCard(pack, data, rng, { foilChance, grenzChance }) {
  if (grenzChance > 0 && rng() < grenzChance) {
    const gg = data.units.filter((u) => u.rarity === 'grenzgaenger');
    if (gg.length) return { id: gg[Math.floor(rng() * gg.length)].id, foil: rng() < foilChance };
  }
  const byRarity = {};
  for (const id of pack.pool) {
    const c = data.cardIndex[id];
    if (c) (byRarity[c.def.rarity] ||= []).push(id);
  }
  let rarity = weightedPick(Object.entries(pack.seltenheitsGewichte), rng);
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
export function buildUnitDef(base, mods, evolved = false) {
  const def = deepClone(base);
  applyPatches(def, mods.einheiten[base.id]);
  if (evolved && def.entwicklung) {
    const ev = def.entwicklung;
    for (const [k, m] of Object.entries(ev.werteMul || {})) def.werte[k] *= m;
    applyPatches(def, ev.patches);
    def.name = ev.name;
    def.sprite = ev.sprite ?? def.sprite;
  }
  return def;
}
