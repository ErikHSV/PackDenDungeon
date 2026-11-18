// Meta-Progression: die "Sternenkarte" (ein zusammenhängender Skill-Tree).
// Datenformat: data/starmap.json (Felder laut Spezifikation 6.5, deutsche Schlüssel).

/** Grundwerte aller Modifikatoren, die Knoten verändern können. */
export const MOD_DEFAULTS = {
  // Runenkreis (Cursor)
  cursorDamage: 0, cursorRadiusMul: 1, cursorTickMul: 1, magnet: 0, cursorCrit: 0,
  // Wirtschaft
  startGold: 0, killGoldMul: 1, coinLifetime: 0, interest: 0, mpBonus: 0,
  // Packs
  packPriceMul: 1, priceGrowthAdd: 0, rarityUpChance: 0,
  // Helden
  damageMul: 1, heroHpMul: 1, attackSpeedMul: 1, extraSlots: 0, recruitProgress: 0,
  // Turm
  towerHpMul: 1, towerRegen: 0, towerBowDamage: 0, towerBowSpeed: 0, towerBowMulti: 0,
  // Zauber
  spellCooldownMul: 1, spellPowerMul: 1, extraSpellSlots: 0,
};

export function nodeLevel(save, id) {
  return id === 'start' ? 1 : (save.mastery[id] || 0);
}

/** Kosten der nächsten Stufe: { mp, splitter }. */
export function nodeCost(node, level) {
  return {
    mp: Math.round(node.basisKosten * Math.pow(node.kostenFaktor ?? 1.45, level)),
    splitter: node.splitterKosten || 0,
  };
}

/** Rechnet alle gekauften Knoten in Modifikatoren für einen Run um. */
export function computeModifiers(starmap, levels = {}) {
  const mods = { ...MOD_DEFAULTS, specs: {}, flags: {}, earlyPacks: [] };
  for (const node of starmap.knoten) {
    const lvl = levels[node.id] || 0;
    if (!lvl) continue;
    const e = node.effekt;
    if (e.ziel === 'spec') (mods.specs[e.karte] ||= []).push(...e.patches);
    else if (e.ziel === 'flag') mods.flags[e.flag] = true;
    else if (e.ziel === 'packFrueher') mods.earlyPacks.push(e.pack);
    else if (e.ziel in mods) {
      if (e.rechenart === 'multiplizieren') mods[e.ziel] *= Math.pow(e.wert, lvl);
      else mods[e.ziel] += e.wert * lvl;
    }
  }
  return mods;
}

/** Ein Knoten ist erreichbar, wenn ein verbundener Nachbar mindestens Stufe 1 hat. */
export function isReachable(node, save) {
  return node.typ === 'start' || node.verbindungen.some((id) => nodeLevel(save, id) > 0);
}

/** Sichtbar (nicht im Nebel): gekauft oder direkter Nachbar eines gekauften Knotens. */
export function isVisible(node, save) {
  return nodeLevel(save, node.id) > 0 || isReachable(node, save);
}

/** Grund, warum ein Knoten nicht gekauft werden kann; null = kaufbar. */
export function purchaseBlocker(node, save, data) {
  const lvl = nodeLevel(save, node.id);
  if (lvl >= node.maxStufe) return 'Maximum erreicht';
  if (!isReachable(node, save)) {
    const names = node.verbindungen.map((id) => data.starIndex[id]?.name).filter(Boolean);
    return `Benötigt: ${names.join(' oder ')} Stufe 1`;
  }
  const card = node.voraussetzung?.karte;
  if (card && !(save.collection[card] > 0)) return `Finde die Karte ${data.cardIndex[card]?.def.name ?? card}`;
  const cost = nodeCost(node, lvl);
  if (save.masteryPoints < cost.mp) return 'Zu wenig Mastery-Punkte';
  if ((save.splinters || 0) < cost.splitter) return 'Zu wenig Sternensplitter';
  return null;
}

export function buyNode(node, save, data) {
  if (purchaseBlocker(node, save, data)) return false;
  const lvl = nodeLevel(save, node.id);
  const cost = nodeCost(node, lvl);
  save.masteryPoints -= cost.mp;
  save.splinters = (save.splinters || 0) - cost.splitter;
  save.mastery[node.id] = lvl + 1;
  save.lastBought = node.id;
  return true;
}

/** Setzt alle Knoten zurück und erstattet MP und Splitter vollständig. */
export function resetStarmap(starmap, save) {
  let mp = 0, sp = 0;
  for (const node of starmap.knoten) {
    const lvl = save.mastery[node.id] || 0;
    for (let l = 0; l < lvl; l++) { const c = nodeCost(node, l); mp += c.mp; sp += c.splitter; }
  }
  save.masteryPoints += mp;
  save.splinters = (save.splinters || 0) + sp;
  save.mastery = {};
  save.lastBought = null;
  return { mp, sp };
}

/** Gibt es mindestens einen bezahlbaren Knoten? (roter Punkt am Knopf "Sternenkarte") */
export function anyAffordable(data, save) {
  return data.starmap.knoten.some((n) => !purchaseBlocker(n, save, data));
}

/** Beschreibung der Wirkung bei einer Stufe (für das Info-Fenster). */
export function describeEffect(node, level) {
  const e = node.effekt;
  if (!('wert' in e)) return level > 0 ? 'Aktiv' : node.beschreibung;
  const v = e.rechenart === 'multiplizieren' ? Math.pow(e.wert, level) : e.wert * level;
  const pct = (x) => `${x >= 0 ? '+' : ''}${(Math.round(x * 1000) / 10).toString().replace('.', ',')} %`;
  switch (e.ziel) {
    case 'cursorDamage': return `+${v} Runen-Schaden`;
    case 'magnet': return `+${v} px Magnetbereich`;
    case 'startGold': return `+${v} Startgold`;
    case 'coinLifetime': return `Münzen +${v} s länger`;
    case 'extraSlots': return level ? 'Slot freigeschaltet' : '–';
    case 'extraSpellSlots': return level ? 'Zauber-Slot freigeschaltet' : '–';
    case 'towerBowDamage': case 'towerBowSpeed': case 'towerBowMulti': return `Stufe ${v}`;
    case 'towerRegen': return `${pct(v)} Leben/s`;
    case 'priceGrowthAdd': return `Preissteigerung ${pct(v)}`;
    case 'recruitProgress': return `${pct(v)} Startfortschritt`;
    default: return pct(v);
  }
}

/**
 * Mastery-Punkte eines Runs: 1 pro erreichter Welle, +3 pro erreichter Elitewelle, +15 für den Boss,
 * multipliziert mit (1 + Bonus aus der Sternenkarte).
 */
export function masteryPointsFor(result, balance, mods) {
  const M = balance.mastery;
  const waves = result.wave * M.pointsPerWave;
  const elite = Math.floor(result.wave / balance.waves.eliteWaveEvery) * M.pointsPerEliteWave;
  const boss = result.bossKilled ? M.pointsPerBoss : 0;
  const bonusMul = 1 + (mods?.mpBonus || 0);
  return { waves, elite, boss, bonusMul, total: Math.round((waves + elite + boss) * bonusMul) };
}
