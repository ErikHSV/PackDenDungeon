// Meta-Ebene zwischen den Runs: Modifikatoren (Sternenkarte, Relikte, Kapitel-Modifikatoren, Quests),
// Shop (Angebote, Preise, Run-Tasche, Neu würfeln), Belohnungen, Quests und Freischaltungen.
import { weightedPick } from './util.js';

// ---------------------------------------------------------------------------
// Modifikatoren
// ---------------------------------------------------------------------------

export const MOD_DEFAULTS = {
  // Runenkreis
  cursorSchaden: 0, cursorRadiusMul: 1, cursorTickMul: 1, cursorPackSchadenMul: 1, cursorKrit: 0,
  // Wirtschaft
  grundEinkommen: 0, muenzenMul: 1, shopPlaetze: 0, masteryMul: 1,
  // Packs
  packWiderstandMul: 1, foilChance: 0, foilChanceMul: 1, kartenProPack: 0, packImPack: 0,
  // Helden
  heldenSchadenMul: 1, heldenLebenMul: 1, heldenTempoMul: 1, bossSchadenMul: 1, heldenVerfallProSekunde: 0,
  // Turm
  turmLebenMul: 1, turmRegen: 0, turmSchuetze: 0, turmDornen: 0,
  // Tomes
  tomeWirkungMul: 1, tomeDoppeltChance: 0, tomeZweimalChance: 0, tomesErlaubt: true,
  // Kapitel-Modifikatoren
  gegnerTempoMul: 1, gegnerLebenMul: 1, elitewelleIntervallMul: 1, bossZeitMul: 1, erlaubteKI: null,
};

export function levelOf(save, id) {
  return id === 'start' ? 1 : (save.starmap[id] || 0);
}

function applyOp(mods, ziel, op, wert, times = 1) {
  if (op === 'set') { mods[ziel] = wert; return; }
  if (!(ziel in mods)) mods[ziel] = op === 'mul' ? 1 : 0;
  if (op === 'mul' || op === 'multiplizieren') mods[ziel] *= Math.pow(wert, times);
  else mods[ziel] += wert * times;
}

/**
 * Alle Modifikatoren für einen Run.
 * @param {object} data aufbereitete Spieldaten
 * @param {object} save Spielstand
 * @param {string|null} modifierId gewählter Kapitel-Modifikator
 */
export function computeMods(data, save, modifierId = null) {
  const mods = { ...MOD_DEFAULTS, gebaeude: {}, einheiten: {}, flags: {}, modifierMastery: 1 };
  for (const node of data.starmap.knoten) {
    const lvl = levelOf(save, node.id);
    if (!lvl || node.typ === 'start') continue;
    const e = node.effekt;
    if (e.ziel === 'flag') mods.flags[e.flag] = true;
    else if (e.ziel === 'gebaeude') mods.gebaeude[e.gebaeude] = (mods.gebaeude[e.gebaeude] || 0) + lvl;
    else if (e.ziel === 'einheit') {
      const list = (mods.einheiten[e.karte] ||= []);
      for (let i = 0; i < lvl; i++) list.push(...e.patches); // Patch einmal pro Stufe
    } else if ('wert' in e) applyOp(mods, e.ziel, e.rechenart === 'multiplizieren' ? 'mul' : 'add', e.wert, lvl);
  }
  // Relikte (passiv)
  for (const id of save.relics.equipped) {
    const r = data.relicIndex[id];
    if (r?.ausloeser === 'passiv' && r.aktion.typ === 'wert') applyOp(mods, r.aktion.ziel, r.aktion.op, r.aktion.wert);
  }
  // Dauerhafte Quest-Boni
  mods.grundEinkommen += save.questBonus.grundEinkommen || 0;
  // Kapitel-Modifikator
  const m = modifierId && data.modifierIndex[modifierId];
  if (m) {
    for (const ef of m.effekte) applyOp(mods, ef.ziel, ef.op, ef.wert);
    mods.modifierMastery = m.belohnung.masteryMul ?? 1;
  }
  return mods;
}

// ---------------------------------------------------------------------------
// Freischaltungen
// ---------------------------------------------------------------------------

export function packUnlocked(pack, save) {
  const f = pack.freischaltung;
  if (f.typ === 'start') return true;
  if (f.typ === 'boss') return (save.stats.bossKills[f.kapitel] || 0) > 0;
  return false;
}

export function chapterUnlocked(chapter, save, data) {
  if (chapter.id === 1) return true;
  const prev = data.chapterIndex[chapter.id - 1];
  return !!prev && (save.stats.bossKills[prev.id] || 0) > 0;
}

/** Modifikatoren ab Akt N sind verfügbar, sobald alle Kapitel von Akt N−1 besiegt sind. */
export function modifierUnlocked(mod, save, data) {
  const prevAct = data.chapters.filter((c) => c.akt === mod.abAkt - 1);
  return prevAct.length > 0 && prevAct.every((c) => (save.stats.bossKills[c.id] || 0) > 0);
}

export function highestChapter(save, data) {
  return Math.max(1, ...data.chapters.filter((c) => chapterUnlocked(c, save, data)).map((c) => c.id));
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export function shopSlots(data, mods) {
  return Math.min(data.balance.shop.angebotsPlaetzeMax, data.balance.shop.angebotsPlaetzeStart + mods.shopPlaetze);
}

export function offerPrice(offer, data, save) {
  const k = highestChapter(save, data);
  return Math.round(offer.grundPreis * Math.pow(1 + data.balance.wirtschaft.preisWachstumProKapitel, k - 1));
}

/** Würfelt alle Angebotsplätze neu (nur freigeschaltete Artikel). */
export function rollOffers(data, save, mods, rng = Math.random) {
  const pool = data.shop.angebote.filter((o) => packUnlocked(data.packIndex[o.artikel], save));
  const n = shopSlots(data, mods);
  save.shop.offers = Array.from({ length: n }, () => weightedPick(pool.map((o) => [o.id, o.gewicht]), rng));
  // Erster Platz zeigt immer das günstigste Grundangebot, damit man nie ohne Pack dasteht
  if (!save.shop.offers.includes('a_holz')) save.shop.offers[0] = 'a_holz';
}

export function rerollCost(data, save) {
  const r = data.balance.shop.neuWuerfeln;
  return Math.round(r.grundKosten * Math.pow(r.wachstum, save.shop.rerolls || 0));
}

export function canReroll(mods) {
  return !!mods.flags.neuWuerfeln;
}

export function buyOffer(offerId, data, save) {
  const offer = data.offerIndex[offerId];
  const price = offerPrice(offer, data, save);
  if (save.coins < price) return false;
  save.coins -= price;
  for (let i = 0; i < offer.anzahl; i++) save.shop.bag.push({ artikel: offer.artikel, preis: price / offer.anzahl });
  return true;
}

/** Pack aus der Run-Tasche entfernen (volle Rückerstattung). */
export function removeFromBag(index, data, save) {
  const item = save.shop.bag[index];
  if (!item) return;
  save.coins += Math.round(item.preis * data.balance.shop.rueckerstattung);
  save.shop.bag.splice(index, 1);
}

export function reroll(data, save, mods, rng = Math.random) {
  const cost = rerollCost(data, save);
  if (!canReroll(mods) || save.coins < cost) return false;
  save.coins -= cost;
  save.shop.rerolls = (save.shop.rerolls || 0) + 1;
  rollOffers(data, save, mods, rng);
  return true;
}

// ---------------------------------------------------------------------------
// Belohnungen
// ---------------------------------------------------------------------------

/** Mastery-Punkte: Überlebenszeit, Kills und Boss – multipliziert mit Sternenkarte und Modifikator. */
export function masteryFor(result, data, mods) {
  const B = data.balance.belohnungen;
  const base = result.zeit * B.masteryProSekunde + result.kills * B.masteryProKill + (result.sieg ? B.masteryProBoss : 0);
  return Math.round(base * mods.masteryMul * mods.modifierMastery);
}

/** Überträgt ein Run-Ergebnis in den Spielstand. Gibt eine Zusammenfassung für den Ergebnis-Bildschirm zurück. */
export function applyRunResult(result, data, save, mods) {
  const s = save.stats;
  const out = { neueKarten: [], kapitelFrei: null, packsFrei: [] };
  const einkommen = mods.grundEinkommen;
  out.muenzen = result.muenzen + einkommen;
  out.einkommen = einkommen;
  out.mastery = masteryFor(result, data, mods);
  out.kristalle = result.kristalle;
  save.coins += out.muenzen;
  save.mastery += out.mastery;
  save.crystals += out.kristalle;

  s.runs++;
  s.kills += result.kills;
  s.zeitGesamt += result.zeit;
  s.laengsterRun = Math.max(s.laengsterRun, result.zeit);
  s.tomesGenutzt += result.tomesGenutzt;
  s.entwicklungen += result.entwicklungen;
  s.foilsGezogen += result.foils;
  s.grenzgaengerGezogen += result.grenzgaenger;
  for (const [pack, n] of Object.entries(result.packsGeoeffnet)) {
    s.packsGeoeffnet[pack] = (s.packsGeoeffnet[pack] || 0) + n;
    s.packsGesamt += n;
  }
  for (const [id, c] of Object.entries(result.gezogen)) {
    const col = (save.collection[id] ||= { normal: 0, foil: 0 });
    col.normal += c.normal;
    col.foil += c.foil;
  }
  out.neueKarten = result.neueKarten;
  s.besteZeit[result.kapitel] = Math.max(s.besteZeit[result.kapitel] || 0, result.zeit);

  if (result.sieg) {
    const first = !s.bossKills[result.kapitel];
    s.bossKills[result.kapitel] = (s.bossKills[result.kapitel] || 0) + 1;
    s.bosseBesiegt[result.boss] = (s.bosseBesiegt[result.boss] || 0) + 1;
    if (first) {
      const next = data.chapterIndex[result.kapitel + 1];
      if (next) out.kapitelFrei = next;
      out.packsFrei = data.packs.filter((p) => p.freischaltung.typ === 'boss' && p.freischaltung.kapitel === result.kapitel);
    }
  }
  save.shop.rerolls = 0;
  rollOffers(data, save, mods);
  return out;
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export function questProgress(quest, save) {
  const s = save.stats;
  const z = quest.ziel;
  switch (z.statistik) {
    case 'packsGeoeffnet': return z.filter?.pack ? (s.packsGeoeffnet[z.filter.pack] || 0) : s.packsGesamt;
    case 'bossBesiegt': return z.filter?.boss ? (s.bosseBesiegt[z.filter.boss] || 0) : Object.values(s.bosseBesiegt).reduce((a, b) => a + b, 0);
    case 'laengsterRun': return Math.floor(s.laengsterRun);
    default: return s[z.statistik] || 0;
  }
}

export function questDone(quest, save) {
  return questProgress(quest, save) >= quest.ziel.anzahl;
}

/** Holt die Belohnung einer erfüllten Quest ab. Gibt eine Beschreibung zurück (oder null). */
export function claimQuest(quest, data, save, rng = Math.random) {
  if (save.quests.claimed.includes(quest.id) || !questDone(quest, save)) return null;
  save.quests.claimed.push(quest.id);
  const b = quest.belohnung;
  const parts = [];
  if (b.grundEinkommen) { save.questBonus.grundEinkommen = (save.questBonus.grundEinkommen || 0) + b.grundEinkommen; parts.push(`+${b.grundEinkommen} Grundeinkommen`); }
  if (b.kristalle) { save.crystals += b.kristalle; parts.push(`+${b.kristalle} Kristalle`); }
  for (let i = 0; i < (b.reliktpack || 0); i++) {
    const relic = openRelicPack(data, save, rng);
    parts.push(relic ? `Relikt: ${relic.name}` : 'Reliktpack (alle Relikte gesammelt: +10 Kristalle)');
  }
  return parts.join(', ');
}

/** Reliktpack öffnen: zufälliges, noch nicht besessenes Relikt. */
export function openRelicPack(data, save, rng = Math.random) {
  const free = data.relics.filter((r) => !save.relics.owned.includes(r.id));
  if (!free.length) { save.crystals += 10; return null; }
  const r = free[Math.floor(rng() * free.length)];
  save.relics.owned.push(r.id);
  if (save.relics.equipped.length < relicSlots(data, save)) save.relics.equipped.push(r.id);
  return r;
}

export function relicSlots(data, save) {
  return Math.min(data.balance.relikte.plaetzeMax, data.balance.relikte.plaetzeStart + (save.relics.extraSlots || 0));
}
