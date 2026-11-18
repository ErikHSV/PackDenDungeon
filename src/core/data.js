// Bereitet die rohen JSON-Daten auf: baut Nachschlage-Tabellen (Indizes).
// Wird sowohl im Browser (main.js) als auch in Node (tools/*.mjs) verwendet.

export const DATA_FILES = ['balance', 'rarities', 'heroes', 'spells', 'enemies', 'packs', 'chapters', 'mastery'];

export function prepareData(raw) {
  const data = { ...raw };
  data.heroIndex = Object.fromEntries(raw.heroes.map((h) => [h.id, h]));
  data.spellIndex = Object.fromEntries(raw.spells.map((s) => [s.id, s]));
  data.enemyIndex = Object.fromEntries(raw.enemies.map((e) => [e.id, e]));
  data.packIndex = Object.fromEntries(raw.packs.map((p) => [p.id, p]));
  data.chapterIndex = Object.fromEntries(raw.chapters.map((c) => [c.id, c]));
  data.masteryIndex = Object.fromEntries(raw.mastery.nodes.map((n) => [n.id, n]));

  // Alle Karten (Helden + Zauber) in einem Index
  data.cardIndex = {};
  for (const h of raw.heroes) data.cardIndex[h.id] = { kind: 'hero', def: h };
  for (const s of raw.spells) data.cardIndex[s.id] = { kind: 'spell', def: s };
  data.allCards = [...raw.heroes, ...raw.spells]
    .map((d) => d.id)
    .sort((a, b) =>
      raw.rarities[data.cardIndex[a].def.rarity].order - raw.rarities[data.cardIndex[b].def.rarity].order);
  return data;
}

/**
 * Prüft Querverweise in den Daten (Pack-Pools, Kapitel-Gegner, Spezialisierungen …).
 * Gibt eine Liste von Fehlermeldungen zurück (leer = alles ok).
 */
export function validateReferences(data) {
  const errors = [];
  const rarityIds = Object.keys(data.rarities);
  for (const c of [...data.heroes, ...data.spells]) {
    if (!rarityIds.includes(c.rarity)) errors.push(`Karte ${c.id}: unbekannte Seltenheit ${c.rarity}`);
  }
  for (const p of data.packs) {
    for (const id of p.pool) if (!data.cardIndex[id]) errors.push(`Pack ${p.id}: unbekannte Karte ${id}`);
    for (const r of Object.keys(p.rarityWeights)) {
      if (!p.pool.some((id) => data.cardIndex[id]?.def.rarity === r)) errors.push(`Pack ${p.id}: keine Karte der Seltenheit ${r} im Pool`);
    }
  }
  for (const ch of data.chapters) {
    for (const e of ch.enemies) if (!data.enemyIndex[e.id]) errors.push(`Kapitel ${ch.id}: unbekannter Gegner ${e.id}`);
    if (!data.enemyIndex[ch.boss]?.boss) errors.push(`Kapitel ${ch.id}: Boss ${ch.boss} fehlt oder ist kein Boss`);
  }
  for (const e of data.enemies) {
    const split = e.traits?.splitOnDeath;
    if (split && !data.enemyIndex[split.into]) errors.push(`Gegner ${e.id}: splitOnDeath -> ${split.into} fehlt`);
    const sum = e.bossAbilities?.summon;
    if (sum && !data.enemyIndex[sum.enemy]) errors.push(`Boss ${e.id}: summon -> ${sum.enemy} fehlt`);
    for (const ph of e.phases || []) for (const s of ph.spawn || []) {
      if (!data.enemyIndex[s.id]) errors.push(`Boss ${e.id}: Phase spawnt unbekannten Gegner ${s.id}`);
    }
  }
  const branchIds = data.mastery.branches.map((b) => b.id);
  for (const n of data.mastery.nodes) {
    if (!branchIds.includes(n.branch)) errors.push(`Mastery ${n.id}: unbekannter Ast ${n.branch}`);
    if (n.effect.type === 'spec' && !data.cardIndex[n.effect.card]) errors.push(`Mastery ${n.id}: unbekannte Karte ${n.effect.card}`);
  }
  return errors;
}
