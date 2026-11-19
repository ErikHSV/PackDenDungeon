// Meta-Ebene zwischen den Runs: Modifikatoren, Shop (Tage, Jackpot bei drei gleichen Angeboten, Run-Tasche), Belohnungen,
// Skill-Tree (Upgrade-, Freischalt-, Relikt-, Quest- und Tor-Knoten), Foil-Baum, Akt-Wechsel, Prestige, Relikte, Erfolge.
//
// Währungen (Abschnitt 10) – genau drei:
//   save.coins / save.bonusCoins  Münzen, nur für den Shop (Tageseinkommen + Bonus-Münzen)
//   save.mastery                  Mastery (blauer Kristall), Skill-Tree
//   save.foilDust                 Foil-Staub („Schimmer“, Regenbogen-Kristall), Foil-Baum
import { weightedPick } from './util.js';

// ===========================================================================
// Modifikatoren für einen Run
// ===========================================================================

export const MOD_DEFAULTS = {
  // Runenkreis
  cursorSchaden: 0, cursorSchadenMul: 1, cursorRadiusMul: 1, cursorTickMul: 1, cursorPackSchadenMul: 1, cursorKrit: 0,
  // Wirtschaft
  tagesEinkommen: 0, bonusEinkommen: 0, shopPlaetze: 0, freieRerolls: 0, masteryMul: 1, jackpotBonus: 0, rabattChance: 0, masteryNeueKarte: 0,
  // Packs
  packWiderstandMul: 1, packTrefferWeniger: 0, foilChance: 0, foilChanceMul: 1, kartenProPack: 0, bonusKarteChance: 0, packImPack: 0, grenzgaengerChance: 0,
  // Shiny / Foil-Baum
  foilStaerkeMul: 1, foilMonsterChance: 0, reliktPlaetze: 0, zinsen: 0, aktStartMastery: 0, gesuchtStaub: 0,
  heldenKrit: 0, heldenBlock: 0, packImPack2: 0, rerollRabatt: 0,
  // Helden
  heldenSchadenMul: 1, heldenLebenMul: 1, heldenTempoMul: 1, heldenLaufMul: 1, turmVerfallProSekunde: 0, bossSchadenMul: 1, heldenVerfallProSekunde: 0, heldenHeilungProKill: 0,
  // Turm und Gebäude
  turmLebenMul: 1, turmRegen: 0, turmSchuetze: 0, turmDornen: 0, gebaeudeIntervallMul: 1,
  // Tomes
  tomeWirkungMul: 1, tomeDauerMul: 1, tomeDoppeltChance: 0, tomeZweimalChance: 0, tomesErlaubt: true,
  // Kapitel-Modifikatoren
  gegnerTempoMul: 1, gegnerLebenMul: 1, gegnerSchadenMul: 1, elitewelleIntervallMul: 1, bossZeitMul: 1, erlaubteKI: null,
};

/** Stufe eines Skill-Tree-Knotens (Quest-/Relikt-/Tor-Knoten: 1 = abgeschlossen). */
export const levelOf = (save, id) => (id === 'start' ? 1 : save.starmap[id] || 0);
/** Stufe eines Foil-Baum-Knotens. */
export const foilLevelOf = (save, id) => (id === 'f_start' ? 1 : save.foiltree?.[id] || 0);

function applyOp(mods, ziel, op, wert, times = 1) {
  if (op === 'set') { mods[ziel] = wert; return; }
  if (!(ziel in mods)) mods[ziel] = op === 'mul' ? 1 : 0;
  if (op === 'mul' || op === 'multiplizieren') mods[ziel] *= Math.pow(wert, times);
  else mods[ziel] += wert * times;
}

function applyNodeEffect(mods, node, lvl) {
  const e = node.effekt;
  if (e.ziel === 'flag') mods.flags[e.flag] = true;
  else if (e.ziel === 'gebaeude') mods.gebaeude[e.gebaeude] = (mods.gebaeude[e.gebaeude] || 0) + lvl;
  else if (e.ziel === 'gebaeudeBonus') { const b = (mods.gebaeudeBonus[e.gebaeude] ||= {}); b[e.feld] = (b[e.feld] || 0) + e.wert * lvl; }
  else if (e.ziel === 'einheit') { const list = (mods.einheiten[e.karte] ||= []); for (let i = 0; i < lvl; i++) list.push(...e.patches); }
  else if (e.ziel === 'tome') { const t = (mods.tomes[e.tome] ||= { wirkungMul: 1, dauerMul: 1 }); t[`${e.art}Mul`] += e.betrag * lvl; }
  else if ('wert' in e && typeof e.wert === 'number') applyOp(mods, e.ziel, e.rechenart === 'multiplizieren' ? 'mul' : 'add', e.wert, lvl);
}

/**
 * @param {object} opts { modifierId, prestige, gesucht }
 */
export function computeMods(data, save, opts = {}) {
  const mods = { ...MOD_DEFAULTS, gebaeude: {}, gebaeudeBonus: {}, einheiten: {}, tomes: {}, flags: {}, seltenheitMul: {}, modifierMastery: 1, prestige: null, gesucht: false };
  mods.tagesEinkommen = data.balance.wirtschaft.tagesEinkommen ?? 0;
  for (const node of data.starmap.knoten) {
    const lvl = Math.min(levelOf(save, node.id), node.maxStufe ?? 1); // alte Spielstände: Stufen über dem neuen Maximum zählen nicht
    if (!lvl || node.typ === 'start' || node.typ === 'relikt' || node.typ === 'tor') continue;
    if (node.typ === 'quest') { mods.tagesEinkommen += node.belohnung?.tagesEinkommen || 0; continue; }
    applyNodeEffect(mods, node, lvl);
  }
  for (const node of data.foiltree.knoten) {
    const lvl = foilLevelOf(save, node.id);
    if (lvl && node.typ !== 'start') applyNodeEffect(mods, node, lvl);
  }
  // Relikte: zusätzliches Einkommen aus Relikten zählt als Bonus-Münzen
  const vorRelikten = mods.tagesEinkommen;
  for (const id of save.relics.equipped) {
    const r = data.relicIndex[id];
    if (r?.ausloeser !== 'passiv') continue;
    if (r.aktion.typ === 'wert') applyOp(mods, r.aktion.ziel, r.aktion.op, r.aktion.wert);
    if (r.aktion.typ === 'werte') for (const w of r.aktion.werte) applyOp(mods, w.ziel, w.op, w.wert);
    // Seltenheits-Gewichte beim Ziehen (Funkenlaute, Riesenhelm) plus optionales Flag
    if (r.aktion.typ === 'seltenheit') for (const [rar, m] of Object.entries(r.aktion.gewichte)) mods.seltenheitMul[rar] = (mods.seltenheitMul[rar] ?? 1) * m;
    if (r.aktion.flag) mods.flags[r.aktion.flag] = true;
  }
  mods.bonusEinkommen = Math.max(0, mods.tagesEinkommen - vorRelikten);
  mods.tagesEinkommen = vorRelikten;
  const m = opts.modifierId && data.modifierIndex[opts.modifierId];
  if (m) { for (const ef of m.effekte) applyOp(mods, ef.ziel, ef.op, ef.wert); mods.modifierMastery = m.belohnung.masteryMul ?? 1; }
  if (opts.prestige) mods.prestige = data.balance.prestige.stufen.find((s) => s.stufe === opts.prestige) ?? null;
  mods.gesucht = !!opts.gesucht;
  return mods;
}

// ===========================================================================
// Freischaltungen, Akte, Prestige
// ===========================================================================

export function packUnlocked(pack, save) {
  const f = pack.freischaltung;
  if (f.typ === 'start') return true;
  if (f.typ === 'boss') return (save.stats.bossKills[f.kapitel] || 0) > 0;
  if (f.typ === 'knoten') return levelOf(save, f.knoten) > 0 && (!f.kapitel || (save.stats.bossKills[f.kapitel] || 0) > 0);
  if (f.typ === 'foilknoten') return foilLevelOf(save, f.knoten) > 0;
  return false;
}

export function chapterUnlocked(ch, save, data) {
  if (ch.art === 'reliktjagd') return save.act >= 2 && (save.stats.bossKills[ch.freischaltung?.boss ?? 1] || 0) > 0; // Relikte erst nach dem ersten Akt-Wechsel
  if (ch.art === 'riss') return save.act >= 2 && (save.stats.bossKills[ch.freischaltung?.boss ?? 6] || 0) > 0; // Riss nach dem Ende von Akt 2
  if (ch.akt > save.act) return false;
  const act = data.actIndex[ch.akt];
  const list = act.kapitel;
  const i = list.indexOf(ch.id);
  if (i <= 0) return ch.akt === 1 || save.act >= ch.akt;
  return (save.stats.bossKills[list[i - 1]] || 0) > 0;
}

export function highestChapter(save, data) {
  return Math.max(1, ...data.chapters.filter((c) => c.art === 'kapitel' && chapterUnlocked(c, save, data)).map((c) => (c.akt - 1) * 3 + (data.actIndex[c.akt].kapitel.indexOf(c.id) + 1)));
}

/**
 * Akt-Wechsel über den Tor-Knoten (11.5): Skill-Tree zurücksetzen (volle Rückerstattung), Quest-Fortschritt neu.
 * Erhalten bleiben Foil-Baum, Foil-Staub, Sammlung, Bestiarium, Relikte.
 */
export function changeAct(node, data, save) {
  if (node?.typ !== 'tor' || !nodeVisible('skill', node, save, data)) return null;
  const mods = computeMods(data, save);
  const refund = data.balance.akte.sternenkarteResetBeiAktwechsel ? resetStarmap(data, save) : { mp: 0 };
  save.questProgress = {};
  save.act = Math.max(save.act, node.effekt.akt);
  save.stats.torGeoeffnet = 1;
  const bonus = Math.round(mods.aktStartMastery || 0);
  save.mastery += bonus;
  return { act: save.act, refund: refund.mp, bonus };
}

/** Reiter BESTIARIUM und RELIKTE schalten sich erst mit dem ersten Akt-Wechsel (Tor) frei. */
export const tabUnlocked = (tab, save) => !['bestiarium', 'relikte'].includes(tab) || save.act >= 2;

export function prestigeAvailable(ch, save, data) {
  if (!ch.prestige || !(save.stats.bossKills[ch.id] > 0)) return [];
  const done = save.stats.prestige[ch.id] || 0;
  return data.balance.prestige.stufen.filter((s) => s.stufe <= done + 1).map((s) => s.stufe);
}

export function modifiersAvailable(data, save) {
  return data.modifiers.filter((m) => save.act >= m.abAkt);
}

// ===========================================================================
// Shop: Tage, Angebote, Jackpot (drei gleiche Pack-Angebote), Einzelkarten (Paar/Trio, Shiny), Glanzpack,
// Rabatt, Kaufen/Rückgängig, Reset, Reroll
// ===========================================================================
//
// save.shop.offers[] = { uid, kind: 'angebot'|'karte'|'glanz', id, karte?, anzahl?, foil?, jackpot?, rabatt, neu, sold, paid: {coins, bonus} }
// save.shop.jackpot = { id, artikel, bonus: [Pack-IDs], relikt?, gezeigt } – höchstens einer pro Tag.
// Gekaufte Plätze und Jackpot-Bonus-Packs bilden die Run-Tasche (bagItems).

export function shopSlots(data, mods) {
  return Math.min(data.balance.shop.angebotsPlaetzeMax, data.balance.shop.angebotsPlaetzeStart + mods.shopPlaetze);
}

function priceFactor(data, save) {
  return Math.pow(1 + (data.balance.wirtschaft.preisWachstumProKapitel || 0), highestChapter(save, data) - 1);
}

/** Verfügbare Münzen gesamt (Tagesmünzen + Bonus-Münzen). */
export const walletTotal = (save) => (save.coins || 0) + (save.bonusCoins || 0);

const condOk = (cond, mods) => !cond?.flag || !!mods?.flags?.[cond.flag];

/** Angebot eines Platzes: { kind, name, items:[{artikel|karte, anzahl, foil}], preis, basisPreis, sold, rabatt, neu, foil } */
export function describeOffer(slot, data, save) {
  if (!slot) return null;
  const f = priceFactor(data, save);
  const S = data.balance.shop;
  const base = { uid: slot.uid, sold: !!slot.sold, rabatt: !!slot.rabatt, neu: !!slot.neu, opened: !!slot.opened, foil: !!slot.foil };
  let o;
  if (slot.kind === 'jackpot') return null; // alte Jackpot-Plätze (vor 4/9.6) gibt es nicht mehr
  base.jackpot = !!slot.jackpot;
  if (slot.kind === 'karte') {
    const c = data.cardIndex[slot.karte];
    if (!c) return null;
    const E = data.shop.einzelkarten;
    const n = slot.anzahl || 1;
    const p = (E.preisNachSeltenheit[c.def.rarity] ?? 3) + (c.art === 'tome' ? E.tomeAufschlag : 0);
    const mul = n === 3 ? S.paar.trioPreisMul : n === 2 ? S.paar.preisMul : 1;
    const label = n === 3 ? 'Trio: ' : n === 2 ? 'Paar: ' : '';
    o = { ...base, kind: 'karte', id: slot.karte, anzahl: n, name: `${label}${c.def.name}${slot.foil ? ' (Shiny)' : ''}`, items: [{ karte: slot.karte, anzahl: n, foil: !!slot.foil }], basisPreis: Math.max(1, Math.round(p * mul * f)) };
  } else if (slot.kind === 'glanz') {
    const g = data.shop.glanzpack;
    const pk = data.packIndex[g.artikel];
    o = { ...base, kind: 'glanz', id: g.artikel, name: pk.name, items: [{ artikel: g.artikel, anzahl: 1 }], basisPreis: Math.max(1, Math.round(g.grundPreis * f)) };
  } else {
    const a = data.offerIndex[slot.id];
    if (!a) return null;
    const pk = data.packIndex[a.artikel];
    o = { ...base, kind: 'angebot', id: a.id, name: a.anzahl > 1 ? `${a.anzahl} × ${pk.name}` : pk.name, items: [{ artikel: a.artikel, anzahl: a.anzahl }], basisPreis: Math.max(1, Math.round(a.grundPreis * f)) };
  }
  o.preis = o.rabatt ? Math.max(1, Math.round(o.basisPreis * S.rabatt.faktor)) : o.basisPreis;
  if (slot.sold && slot.paid) o.preis = slot.paid.coins + slot.paid.bonus;
  return o;
}

const contentKey = (slot) => (slot.kind === 'karte' ? `karte:${slot.karte}` : `${slot.kind}:${slot.id}`);

/** Zufällige Einzelkarte aus einem freigeschalteten Pack. */
function rollSingleCard(data, save, rng) {
  const packs = data.packs.filter((p) => p.art === 'pack' && p.pool?.length && packUnlocked(p, save));
  if (!packs.length) return null;
  const pack = packs[Math.floor(rng() * packs.length)];
  if (pack.kartenGewichte) return weightedPick(Object.entries(pack.kartenGewichte).filter(([id]) => data.cardIndex[id]), rng);
  const rars = Object.entries(pack.seltenheitsGewichte).filter(([r]) => pack.pool.some((id) => data.cardIndex[id]?.def.rarity === r));
  const r = weightedPick(rars, rng);
  const ids = pack.pool.filter((id) => data.cardIndex[id]?.def.rarity === r);
  return ids[Math.floor(rng() * ids.length)];
}

/** Karten-Shiny-Chance (Grundchance + Foil-Baum + Relikte). */
export const cardFoilChance = (data, mods) => (data.balance.karten.foilChance + (mods?.foilChance || 0)) * (mods?.foilChanceMul ?? 1);

function rollSlot(data, save, mods, rng, index, uid, fromReroll) {
  const S = data.balance.shop;
  const pool = data.shop.angebote.filter((o) => packUnlocked(data.packIndex[o.artikel], save));
  const E = condOk(data.shop.einzelkarten.bedingung, mods) ? data.shop.einzelkarten : null;
  let slot;
  if (index > 0 && mods?.flags?.glanzpack && rng() < S.glanzpack.chance) {
    slot = { kind: 'glanz', id: data.shop.glanzpack.artikel };
  } else {
    const total = pool.reduce((a, o) => a + o.gewicht, 0) + (E ? E.gewicht : 0);
    const x = rng() * total;
    const karte = E && index > 0 && x >= total - E.gewicht ? rollSingleCard(data, save, rng) : null;
    if (karte) {
      slot = { kind: 'karte', karte };
      // Foil-Knoten Doppel-/Dreier-Angebot: Helden als Paar oder Trio
      if (data.cardIndex[karte].art === 'einheit' && mods?.flags?.paarAngebot && rng() < S.paar.chance) slot.anzahl = mods.flags.trioAngebot && rng() < S.paar.trioChance ? 3 : 2;
      if (rng() < cardFoilChance(data, mods) * (S.shinyEinzelkarte?.faktor ?? 1)) slot.foil = true;
    } else slot = { kind: 'angebot', id: weightedPick(pool.map((o) => [o.id, o.gewicht]), rng) };
    const rerollBonus = fromReroll ? ((save.shop.rerolls || 0) + (save.shop.freeUsed || 0)) * (mods?.rerollRabatt || 0) : 0;
    if (rng() < S.rabatt.chance + (mods?.rabattChance || 0) + rerollBonus) slot.rabatt = true;
  }
  slot.uid = uid;
  const seen = (save.shop.seen ||= []);
  const key = contentKey(slot);
  if (!seen.includes(key)) { slot.neu = true; seen.push(key); }
  return slot;
}

function nextUid(save) { save.shop.uid = (save.shop.uid || 0) + 1; return save.shop.uid; }

/**
 * Jackpot (4): erscheinen drei gleiche Pack-Angebote gleichzeitig, leuchten ihre Kacheln golden und es gibt ein
 * Bonus-Pack gratis (mit „Glückssträhne“ mehr); mit dem Foil-Knoten „Jackpot-Relikt“ zu 25 % zusätzlich ein Reliktpack.
 * Höchstens ein Jackpot pro Tag; nur wenn mindestens zwei Angebotsarten im Shop möglich sind (sonst wäre zu Beginn,
 * wenn es nur Holzpacks gibt, jeder Tag ein Jackpot).
 */
function checkJackpot(data, save, mods, rng) {
  const J = data.balance.shop.jackpot;
  if (save.shop.jackpot) return null;
  const types = data.shop.angebote.filter((o) => packUnlocked(data.packIndex[o.artikel], save)).length + (condOk(data.shop.einzelkarten.bedingung, mods) ? 1 : 0);
  if (types < J.minTypen) return null;
  const groups = {};
  save.shop.offers.forEach((o, i) => { if (o.kind === 'angebot') (groups[o.id] ||= []).push(i); });
  const hit = Object.entries(groups).find(([, list]) => list.length >= 3);
  if (!hit) return null;
  const [id, list] = hit;
  for (const i of list.slice(0, 3)) save.shop.offers[i].jackpot = true;
  const artikel = data.offerIndex[id].artikel;
  const jp = { id, artikel, bonus: Array(J.bonusAnzahl + (mods?.jackpotBonus || 0)).fill(artikel), relikt: null, staub: 0, gezeigt: false };
  if (mods?.flags?.jackpotRelikt && save.act >= 2 && rng() < J.reliktChance) {
    const before = save.foilDust;
    const r = openRelicPack(data, save, rng);
    jp.relikt = r?.id ?? null;
    jp.staub = save.foilDust - before;
  }
  save.shop.jackpot = jp;
  return jp;
}

/** Würfelt die Angebotsplätze (gekaufte bleiben stehen, falls keepSold) und prüft auf einen Jackpot. */
export function rollOffers(data, save, mods, rng = Math.random, keepSold = false, fromReroll = false) {
  const n = shopSlots(data, mods);
  const old = save.shop.offers || [];
  const out = [];
  for (let i = 0; i < n; i++) {
    if (keepSold && old[i] && (old[i].sold || !fromReroll)) out.push(old[i]);
    else out.push(rollSlot(data, save, mods, rng, i, nextUid(save), fromReroll));
  }
  // Nie ohne Einstiegsangebot: Platz 0 ist ein Holzpack, wenn sonst keines da ist
  if (!keepSold && !out.some((o) => o.kind === 'angebot' && o.id === 'a_holz')) out[0] = { kind: 'angebot', id: 'a_holz', uid: nextUid(save), neu: !(save.shop.seen || []).includes('angebot:a_holz') };
  if (!(save.shop.seen || []).includes('angebot:a_holz')) (save.shop.seen ||= []).push('angebot:a_holz');
  save.shop.offers = out;
  return checkJackpot(data, save, mods, rng);
}

export const canReroll = (mods) => !!mods.flags.neuWuerfeln;

export function rerollCost(data, save, mods) {
  if ((save.shop.freeUsed || 0) < (mods?.freieRerolls || 0)) return 0;
  const r = data.balance.shop.neuWuerfeln;
  return Math.max(1, Math.round(r.grundKosten * Math.pow(r.wachstum, save.shop.rerolls || 0)));
}

/** Bonus-Münzen zuerst, dann normale Münzen. Gibt die Aufteilung für eine exakte Erstattung zurück. */
function pay(save, amount) {
  const bonus = Math.min(save.bonusCoins || 0, amount);
  save.bonusCoins = (save.bonusCoins || 0) - bonus;
  save.coins -= amount - bonus;
  save.stats.muenzenAusgegeben += amount;
  return { bonus, coins: amount - bonus };
}

function refund(save, paid) {
  save.bonusCoins = (save.bonusCoins || 0) + paid.bonus;
  save.coins += paid.coins;
  save.stats.muenzenAusgegeben -= paid.bonus + paid.coins;
}

/** Würfelt alle nicht gekauften Angebote neu (dabei kann ein Jackpot entstehen). */
export function reroll(data, save, mods, rng = Math.random) {
  if (!canReroll(mods)) return false;
  const cost = rerollCost(data, save, mods);
  if (walletTotal(save) < cost) return false;
  if (cost === 0) save.shop.freeUsed = (save.shop.freeUsed || 0) + 1;
  else { pay(save, cost); save.shop.rerolls = (save.shop.rerolls || 0) + 1; }
  return { jackpot: rollOffers(data, save, mods, rng, true, true) };
}

/**
 * Kauft ein Angebot – oder macht den Kauf rückgängig, wenn es schon gekauft ist (volle Erstattung).
 * Rückgabe: { bought, undone, offer, relics: [...] } oder null (zu teuer / nicht möglich).
 */
export function buyOffer(slotIndex, data, save, rng = Math.random) {
  const slot = save.shop.offers[slotIndex];
  const o = describeOffer(slot, data, save);
  if (!o) return null;
  if (slot.sold) {
    if (slot.opened) return null; // sofort geöffnete Reliktpacks sind endgültig
    refund(save, slot.paid);
    slot.sold = false;
    slot.paid = null;
    return { undone: true, offer: o, relics: [] };
  }
  if (walletTotal(save) < o.preis) return null;
  slot.paid = pay(save, o.preis);
  slot.sold = true;
  slot.neu = false;
  const relics = [];
  for (const i of o.items) for (let k = 0; k < i.anzahl; k++) {
    if (i.artikel && data.packIndex[i.artikel].art === 'relikt') { relics.push(openRelicPack(data, save, rng)); slot.opened = true; }
  }
  return { bought: true, offer: o, relics };
}

/** Macht alle Käufe des Tages rückgängig (außer sofort geöffneten Reliktpacks). */
export function resetPurchases(data, save) {
  let n = 0;
  for (const slot of save.shop.offers) if (slot.sold && !slot.opened) { refund(save, slot.paid); slot.sold = false; slot.paid = null; n++; }
  return n;
}

/** Inhalt der Run-Tasche: Pack-/Kisten-IDs, Jackpot-Bonus-Packs und Einzelkarten als "karte:<id>" bzw. "karte:<id>:foil". */
export function bagItems(data, save) {
  const out = [...(save.shop.jackpot?.bonus || [])];
  for (const slot of save.shop.offers) {
    if (!slot.sold) continue;
    const o = describeOffer(slot, data, save);
    for (const i of o.items) for (let k = 0; k < i.anzahl; k++) {
      if (i.karte) out.push(`karte:${i.karte}${i.foil ? ':foil' : ''}`);
      else if (data.packIndex[i.artikel].art !== 'relikt') out.push(i.artikel);
    }
  }
  return out;
}

/** Zu Beginn eines Runs: gekaufte Plätze werden verbraucht. */
export function consumeBag(save) {
  save.shop.offers = save.shop.offers.filter((s) => !s.sold);
  if (save.shop.jackpot) save.shop.jackpot.bonus = [];
}

// ===========================================================================
// Belohnungen nach einem Run
// ===========================================================================

/** Mastery eines Runs. result.kills zählt Shiny-Monster bereits mehrfach (killWert). */
export function masteryFor(result, data, mods) {
  const B = data.balance.belohnungen;
  const base = result.zeit * B.masteryProSekunde + result.kills * B.masteryProKill + result.elitewellen * B.masteryProElitewelle + (result.sieg ? B.masteryProBoss : 0)
    + (result.packs || 0) * (B.masteryProPack || 0);
  const ch = data.chapterIndex[result.kapitel];
  const kapitelMul = ch?.masteryMul ?? ch?.wellen.muenzenMul ?? 1; // höhere Kapitel geben deutlich mehr Mastery
  return Math.round(base * kapitelMul * mods.masteryMul * mods.modifierMastery * (mods.prestige?.belohnungMul ?? 1));
}

export const SCHIMMER_QUELLEN = {
  shinyMonster: 'Shiny-Monster', ersteShinyMonster: 'neues Shiny-Monster', neueShinyKarte: 'neue Shiny-Karte',
  doppelteShinyKarte: 'doppelte Shiny-Karte', gesucht: 'Shiny-Boss', gesuchtErst: 'erster Sieg gegen den Shiny-Boss',
  reliktpack: 'Reliktpack', erfolge: 'Erfolge', schatzpack: 'Schatzpack', shinySchatz: 'Shiny-Schatzträger',
};

/** Schimmer pro Sieg gegen den Shiny-Boss eines Kapitels (Kapitel 1: 1, Kapitel 4: 4 …) plus Foil-Knoten „Gesucht-Belohnung“. */
export function gesuchtSchimmer(ch, data, mods) {
  return (ch?.gesuchtSchimmer ?? 1) + (mods?.gesuchtStaub || 0);
}

/** Überträgt das Ergebnis in den Spielstand. Ein Run = ein Tag; danach beginnt der nächste Tag. */
export function applyRunResult(result, data, save, mods, rng = Math.random) {
  const s = save.stats;
  const G = data.balance.gesucht;
  const out = { neueKarten: result.neueKarten, kapitelFrei: null, packsFrei: [], relikt: null, reliktStaub: 0, questsFertig: [] };
  // Quest-Knoten: Fortschritt zählt nur, wenn die Quest beim Spielen schon sichtbar war
  out.questsFertig = advanceQuests(result, data, save);

  const packs = Object.values(result.packsGeoeffnet).reduce((a, b) => a + b, 0);
  out.mastery = Math.max(0, masteryFor({ ...result, kills: result.killWert ?? result.kills, packs }, data, mods) + (result.bonusMastery || 0));
  // Schimmer (10.1) mit Aufschlüsselung für den Ergebnis-Bildschirm
  const teile = { ...(result.schimmer || {}) };
  if (result.sieg && mods.gesucht) {
    teile.gesucht = gesuchtSchimmer(data.chapterIndex[result.kapitel], data, mods);
    const first = !(s.gesuchtSiege?.[result.boss] > 0);
    (s.gesuchtSiege ||= {})[result.boss] = (s.gesuchtSiege[result.boss] || 0) + 1;
    if (first) { out.mastery += G.erstsiegMastery; out.gesuchtErstsieg = G.erstsiegMastery; teile.gesuchtErst = G.erstsiegSchimmer; }
  }
  save.mastery += out.mastery;
  out.bonusAusRun = Math.round(result.muenzen || 0); // Bonus-Münzen aus Fähigkeiten/Effekten im Run

  s.runs++;
  s.kills += result.kills;
  s.zeitGesamt += result.zeit;
  s.laengsterRun = Math.max(s.laengsterRun, result.zeit);
  s.tomesGenutzt += result.tomesGenutzt;
  s.entwicklungen += result.entwicklungen;
  s.foilsGezogen += result.foils;
  s.grenzgaengerGezogen += result.grenzgaenger;
  s.foilMonsterBesiegt += result.foilMonster;
  for (const [pack, n] of Object.entries(result.packsGeoeffnet)) { s.packsGeoeffnet[pack] = (s.packsGeoeffnet[pack] || 0) + n; s.packsGesamt += n; }
  for (const [id, c] of Object.entries(result.gezogen)) {
    const col = (save.collection[id] ||= { normal: 0, foil: 0 });
    col.normal += c.normal; col.foil += c.foil;
  }
  const kg = (s.killsGegner[result.kapitel] ||= {});
  for (const [id, c] of Object.entries(result.killsNachArt)) {
    kg[id] = (kg[id] || 0) + c.normal + c.foil;
    const b = (save.bestiary[id] ||= { normal: 0, foil: 0 });
    b.normal += c.normal; b.foil += c.foil;
  }
  s.besteZeit[result.kapitel] = Math.max(s.besteZeit[result.kapitel] || 0, result.zeit);

  // Relikt-Jagd: einmal pro Kapitel und Akt; das Relikt aus dem Schatzpack gibt es nach dem Run
  if (result.reliktJagd) {
    (s.reliktJagden ||= {})[`${save.act}:${result.kapitel}`] = true;
    s.reliktJagdenGesamt = (s.reliktJagdenGesamt || 0) + 1;
    const r = result.schatzRelikt && data.relicIndex[result.schatzRelikt];
    if (r && !save.relics.owned.includes(r.id) && !save.relics.destroyed?.includes(r.id)) { giveRelic(r, data, save); out.schatzRelikt = r; }
  }
  if (result.sieg) {
    const first = !s.bossKills[result.kapitel];
    s.bossKills[result.kapitel] = (s.bossKills[result.kapitel] || 0) + 1;
    s.bosseBesiegt[result.boss] = (s.bosseBesiegt[result.boss] || 0) + 1;
    if (mods.prestige) { s.prestige[result.kapitel] = Math.max(s.prestige[result.kapitel] || 0, mods.prestige.stufe); s.prestigeGeschafft++; }
    if (mods.gesucht) { s.foilBossBesiegt++; const b = (save.bestiary[result.boss] ||= { normal: 0, foil: 0 }); b.foil++; }
    const ch = data.chapterIndex[result.kapitel];
    if (ch.belohnung?.fehlendesRelikt) {
      out.relikt = openRelicPack(data, save, rng, true);
      if (!out.relikt) out.reliktStaub = teile.reliktpack = data.balance.belohnungen.reliktpackOhneRelikt.foilStaub;
    }
    if (first && ch.art === 'kapitel') {
      const act = data.actIndex[ch.akt];
      const next = act.kapitel[act.kapitel.indexOf(ch.id) + 1];
      if (next) out.kapitelFrei = data.chapterIndex[next];
      out.packsFrei = data.packs.filter((p) => p.freischaltung.typ === 'boss' && p.freischaltung.kapitel === ch.id);
    }
  }
  out.erfolge = checkAchievements(data, save, true);
  const erfolgStaub = out.erfolge.reduce((a, e) => a + (e.belohnung?.foilStaub || 0), 0);
  if (erfolgStaub) teile.erfolge = erfolgStaub;
  out.schimmerTeile = Object.entries(teile).filter(([, n]) => n > 0).map(([k, n]) => ({ quelle: k, name: SCHIMMER_QUELLEN[k] ?? k, n }));
  out.foilStaub = out.schimmerTeile.reduce((a, t) => a + t.n, 0);
  save.foilDust += out.foilStaub;
  s.foilStaubGesamt = (s.foilStaubGesamt || 0) + out.foilStaub;

  // Neuer Tag: Tageseinkommen wird gutgeschrieben (Bonus-Münzen getrennt), Zinsen auf ungenutzte Mastery, Shop würfelt neu
  save.day++;
  out.einkommen = mods.tagesEinkommen;
  out.bonus = (mods.bonusEinkommen || 0) + out.bonusAusRun;
  // Münzen verfallen am Tagesende: Der neue Tag startet mit genau dem Tageseinkommen,
  // dazu die Bonus-Münzen dieses Runs (Relikte, Fähigkeiten). Nicht ausgegebene Münzen gehen verloren.
  out.verfallen = walletTotal(save);
  save.coins = out.einkommen;
  save.bonusCoins = out.bonus;
  save.dayBudget = out.einkommen;
  if (mods.zinsen > 0) {
    out.zinsen = Math.min(data.balance.foilbaum.zinsenMax, Math.floor(save.mastery * mods.zinsen));
    save.mastery += out.zinsen;
  }
  save.shop.rerolls = 0;
  save.shop.freeUsed = 0;
  save.shop.jackpot = null;
  out.jackpot = rollOffers(data, save, mods, rng);
  return out;
}

// ===========================================================================
// Quest-Knoten (11.3)
// ===========================================================================

/** Kapitel, in denen eine Quest zählt (null = überall). */
export function questChapters(node, data) {
  const a = node.aufgabe, f = a.filter || {};
  if (f.kapitel) return [f.kapitel];
  if (a.statistik === 'killsGegner') return data.chapters.filter((c) => c.art === 'kapitel' && (c.gegner.some((g) => g.id === f.gegner) || c.boss === f.gegner)).map((c) => c.id);
  if (a.statistik === 'reliktJagden') return data.chapters.filter((c) => c.reliktJagd).map((c) => c.id);
  if (a.statistik === 'bossBesiegt' && f.boss) return data.chapters.filter((c) => c.art === 'kapitel' && c.boss === f.boss).map((c) => c.id);
  return null;
}

/** Beitrag eines Runs (bzw. Live-Werte eines laufenden Runs) zu einer Quest. */
export function questRunValue(node, r, data) {
  const a = node.aufgabe, f = a.filter || {};
  const chs = questChapters(node, data);
  if (chs && !chs.includes(r.kapitel)) return 0;
  switch (a.statistik) {
    case 'packsGeoeffnet': return f.pack ? r.packsGeoeffnet[f.pack] || 0 : Object.values(r.packsGeoeffnet).reduce((x, y) => x + y, 0);
    case 'kills': return r.kills;
    case 'killsGegner': { const k = r.killsNachArt[f.gegner]; return k ? k.normal + k.foil : 0; }
    case 'kartenGefunden': { const g = r.gezogen[f.karte]; return g ? g.normal + g.foil : 0; }
    case 'killsEinheit': return r.killsEinheit?.[f.einheit] || 0;
    case 'ueberleben': return Math.floor(r.zeit);
    case 'foilMonsterBesiegt': return r.foilMonster;
    case 'bossBesiegt': return r.sieg && (!f.boss || r.boss === f.boss) ? 1 : 0;
    case 'tomesGenutzt': return r.tomesGenutzt;
    case 'reliktJagden': return r.reliktJagd ? 1 : 0;
    default: return 0;
  }
}

/** Fortschritt einer Quest. „ueberleben“ zählt den besten Run, alle anderen werden aufsummiert. */
export function questProgress(node, data, save, live = null) {
  const target = node.aufgabe.anzahl;
  let value = save.questProgress?.[node.id] || 0;
  if (live) {
    const v = questRunValue(node, live, data);
    value = node.aufgabe.statistik === 'ueberleben' ? Math.max(value, v) : value + v;
  }
  if (levelOf(save, node.id) > 0) value = target;
  return { value: Math.min(target, value), target, done: value >= target };
}

function advanceQuests(result, data, save) {
  const fresh = [];
  save.questProgress ||= {};
  for (const n of data.starmap.knoten) {
    if (n.typ !== 'quest' || levelOf(save, n.id) > 0 || !nodeVisible('skill', n, save, data)) continue;
    const before = questProgress(n, data, save);
    const v = questRunValue(n, result, data);
    save.questProgress[n.id] = n.aufgabe.statistik === 'ueberleben' ? Math.max(save.questProgress[n.id] || 0, v) : (save.questProgress[n.id] || 0) + v;
    if (!before.done && questProgress(n, data, save).done) fresh.push(n);
  }
  return fresh;
}

/** Erfüllte Quest abholen: Belohnung gutschreiben, Knoten gilt als abgeschlossen. */
export function claimQuestNode(node, data, save, rng = Math.random) {
  if (node.typ !== 'quest' || levelOf(save, node.id) > 0 || !questProgress(node, data, save).done) return null;
  save.starmap[node.id] = 1;
  save.lastBought = node.id;
  const b = node.belohnung || {};
  const out = { parts: [], relics: [] };
  if (b.tagesEinkommen) {
    // Einkommen gilt schon für den laufenden Tag
    save.coins += b.tagesEinkommen;
    save.dayBudget = (save.dayBudget || 0) + b.tagesEinkommen;
    out.parts.push(`+${b.tagesEinkommen} Tageseinkommen (gilt schon heute)`);
  }
  for (const id of save.relics.equipped) {
    const r = data.relicIndex[id];
    if (r?.aktion.typ === 'questMuenzen') { save.coins += r.aktion.wert; out.parts.push(`+${r.aktion.wert} Münze (${r.name})`); }
  }
  if (b.mastery) { save.mastery += b.mastery; out.parts.push(`+${b.mastery} Mastery`); }
  if (b.relikt) {
    const r = data.relicIndex[b.relikt];
    if (r && !save.relics.owned.includes(r.id) && !save.relics.destroyed?.includes(r.id)) { giveRelic(r, data, save); out.relics.push(r); out.parts.push(`Relikt: ${r.name}`); }
    else { const st = data.balance.belohnungen.reliktDoppelt.foilStaub; save.foilDust += st; save.stats.foilStaubGesamt = (save.stats.foilStaubGesamt || 0) + st; out.parts.push(`+${st} Schimmer`); }
  }
  for (let i = 0; i < (b.reliktpack || 0); i++) {
    const before = save.foilDust;
    const r = openRelicPack(data, save, rng);
    out.relics.push(r);
    out.parts.push(r ? `Relikt: ${r.name}` : `+${save.foilDust - before} Schimmer`);
  }
  return out;
}

export function describeReward(b = {}, relicName = null) {
  const p = [];
  if (b.tagesEinkommen) p.push(`+${b.tagesEinkommen} Tageseinkommen`);
  if (b.mastery) p.push(`+${b.mastery} Mastery`);
  if (b.reliktpack) p.push(b.reliktpack > 1 ? `${b.reliktpack} Reliktpacks` : 'Reliktpack');
  if (b.relikt) p.push(`Relikt „${relicName ?? b.relikt}“`);
  return p.join(', ') || 'Neue Knoten';
}

/** Alle erfüllten, sichtbaren Quests abholen (nach dem Run beim Wechsel ins Menü). Rückgabe: [{ node, res }]. */
export function autoClaimQuests(data, save, rng = Math.random) {
  const out = [];
  for (let guard = 0; guard < 100; guard++) {
    const n = data.starmap.knoten.find((q) => q.typ === 'quest' && levelOf(save, q.id) === 0 && nodeVisible('skill', q, save, data) && questProgress(q, data, save).done);
    if (!n) break;
    const res = claimQuestNode(n, data, save, rng);
    if (!res) break;
    out.push({ node: n, res });
  }
  return out;
}

export function claimableQuests(data, save) {
  return data.starmap.knoten.filter((n) => n.typ === 'quest' && levelOf(save, n.id) === 0 && nodeVisible('skill', n, save, data) && questProgress(n, data, save).done).length;
}

// ===========================================================================
// Skill-Tree und Foil-Baum
// ===========================================================================

const TREE = {
  skill: { map: (d) => d.starmap, index: (d) => d.starIndex, store: 'starmap', level: levelOf, wallet: 'mastery', faktor: (d) => d.balance.skilltree.kostenFaktorStandard },
  foil: { map: (d) => d.foiltree, index: (d) => d.foilIndex, store: 'foiltree', level: foilLevelOf, wallet: 'foilDust', faktor: (d) => d.balance.foilbaum.kostenFaktorStandard },
};
export const treeMap = (kind, data) => TREE[kind].map(data);
export const treeIndex = (kind, data) => TREE[kind].index(data);
export const treeLevel = (kind, save, id) => TREE[kind].level(save, id);

/** Foil-Baum sichtbar ab dem ersten Foil-Staub (11.6.3). */
export const foilTreeUnlocked = (save) => (save.stats.foilStaubGesamt || 0) > 0 || save.foilDust > 0;

/** Karte, die ein Knoten voraussetzt (Einheiten- und Tome-Blöcke erscheinen erst mit der Karte). */
export const nodeCard = (node) => node.voraussetzung?.karte ?? null;

export function nodeInAct(node, save) {
  if (node.nurAkt != null && node.nurAkt !== save.act) return false;
  return (node.akt ?? 1) <= save.act;
}

export function nodeReachable(kind, node, save) {
  const lvl = TREE[kind].level;
  return node.typ === 'start' || node.verbindungen.some((id) => lvl(save, id) > 0);
}

/** Sichtbar = im aktuellen Akt, gekauft oder an einen gekauften/abgeschlossenen Knoten angeschlossen, Karte vorhanden. */
export function nodeVisible(kind, node, save, data) {
  if (kind === 'foil' && !foilTreeUnlocked(save)) return false;
  if (!nodeInAct(node, save)) return false;
  // Gebäude-, Pack- und Shop-Knoten erst nach dem ersten bzw. zweiten Boss (11.7)
  if (node.abBoss && !(save.stats.bossKills[node.abBoss] > 0)) return false;
  const card = nodeCard(node);
  if (card && !((save.collection[card]?.normal || 0) + (save.collection[card]?.foil || 0) > 0)) return false;
  return TREE[kind].level(save, node.id) > 0 || nodeReachable(kind, node, save);
}

/** Kosten der nächsten Stufe. Skill-Tree: ab Akt 2 mal balance.skilltree.aktKostenMul (neuer Baum, gleiche Startlogik). */
export function nodeCost(kind, node, level, data, save = null) {
  const f = node.kostenFaktor ?? TREE[kind].faktor(data);
  const aktMul = kind === 'skill' ? (data.balance.skilltree.aktKostenMul?.[save?.act ?? 1] ?? 1) : 1;
  return { amount: Math.round(node.basisKosten * Math.pow(f, level) * aktMul), waehrung: TREE[kind].wallet, muenzen: level === 0 ? node.muenzKosten || 0 : 0 };
}

export function nodeBlocker(kind, node, save, data) {
  const lvl = TREE[kind].level(save, node.id);
  if (!nodeInAct(node, save)) return `Erst ab Akt ${node.akt}`;
  if (node.typ === 'start') return 'Ursprung';
  if (lvl >= node.maxStufe) return node.typ === 'quest' ? 'Abgeschlossen' : 'Maximum erreicht';
  if (!nodeReachable(kind, node, save)) return 'Noch nicht erreichbar';
  if (node.typ === 'quest') return questProgress(node, data, save).done ? null : 'Aufgabe noch nicht erfüllt';
  if (node.typ === 'tor') return null;
  const c = nodeCost(kind, node, lvl, data, save);
  if (save[c.waehrung] < c.amount) return kind === 'foil' ? 'Zu wenig Schimmer' : 'Zu wenig Mastery';
  if (c.muenzen && (save.coins || 0) + (save.bonusCoins || 0) < c.muenzen) return 'Zu wenig Münzen';
  return null;
}

/**
 * Upgrade-, Freischalt- oder Relikt-Knoten kaufen. Quest-Knoten: claimQuestNode, Tor-Knoten: changeAct.
 * Rückgabe: false oder { relic, staub }.
 */
export function buyNode(kind, node, save, data) {
  if (node.typ === 'quest' || node.typ === 'tor' || nodeBlocker(kind, node, save, data)) return false;
  const T = TREE[kind];
  const lvl = T.level(save, node.id);
  const c = nodeCost(kind, node, lvl, data, save);
  save[c.waehrung] -= c.amount;
  if (c.muenzen) pay(save, c.muenzen);
  (save[T.store] ||= {})[node.id] = lvl + 1;
  if (kind === 'skill') save.lastBought = node.id;
  const out = { relic: null, staub: 0 };
  if (node.effekt.ziel === 'relikt') {
    const r = data.relicIndex[node.effekt.relikt];
    if (save.relics.owned.includes(r.id) || save.relics.destroyed?.includes(r.id)) {
      out.staub = data.balance.belohnungen.reliktDoppelt.foilStaub;
      save.foilDust += out.staub;
      save.stats.foilStaubGesamt = (save.stats.foilStaubGesamt || 0) + out.staub;
    } else { giveRelic(r, data, save); out.relic = r; }
  }
  return out;
}

/** Skill-Tree zurücksetzen (volle Rückerstattung der Mastery). Quest-Knoten gelten wieder als offen. */
export function resetStarmap(data, save) {
  let mp = 0;
  for (const node of data.starmap.knoten) {
    if (node.typ === 'quest' || node.typ === 'tor') continue;
    for (let l = 0; l < (save.starmap[node.id] || 0); l++) { const c = nodeCost('skill', node, l, data, save); mp += c.amount; if (c.muenzen) save.coins += c.muenzen; }
  }
  save.mastery += mp;
  save.starmap = {};
  save.lastBought = null;
  return { mp };
}

export function anyNodeAffordable(data, save, kind = 'skill') {
  return treeMap(kind, data).knoten.some((n) => n.typ !== 'tor' && nodeVisible(kind, n, save, data) && !nodeBlocker(kind, n, save, data));
}

export function describeNodeEffect(node, level) {
  const e = node.effekt;
  if (e.ziel === 'tome') return level ? `+${Math.round(e.betrag * level * 100)} %` : '–';
  if (!('wert' in e) || e.ziel === 'gebaeude') return level > 0 ? (e.ziel === 'gebaeude' ? `Stufe ${level}` : 'Aktiv') : '–';
  const v = e.rechenart === 'multiplizieren' ? Math.pow(e.wert, level) : e.wert * level;
  const pct = (x) => `${x >= 0 ? '+' : ''}${(Math.round(x * 1000) / 10).toString().replace('.', ',')} %`;
  switch (e.ziel) {
    case 'cursorSchaden': return `+${v} Runen-Schaden`;
    case 'tagesEinkommen': return `+${v} Münzen pro Tag`;
    case 'shopPlaetze': case 'kartenProPack': case 'freieRerolls': case 'reliktPlaetze': case 'gesuchtStaub': return level ? `+${v}` : '–';
    case 'aktStartMastery': return `+${v} Mastery`;
    case 'masteryNeueKarte': return `+${v} Mastery pro neuer Karte`;
    case 'packTrefferWeniger': return level ? `${v} Treffer weniger` : '–';
    case 'turmSchuetze': return `Stufe ${v}`;
    case 'turmDornen': return `${v} Schaden zurück`;
    case 'turmRegen': return `${pct(v)} Leben/s`;
    default: return pct(v);
  }
}

// ===========================================================================
// Relikte
// ===========================================================================

export function relicSlots(data, save) {
  const R = data.balance.relikte;
  const foil = data.foiltree.knoten.filter((n) => n.effekt.ziel === 'reliktPlaetze').reduce((s, n) => s + foilLevelOf(save, n.id) * n.effekt.wert, 0);
  return Math.min(R.plaetzeMax, R.plaetzeStart + (save.relics.extraSlots || 0)) + foil;
}

function giveRelic(r, data, save) {
  save.relics.owned.push(r.id);
  save.relics.newCount = (save.relics.newCount || 0) + 1;
  if (save.relics.equipped.length < relicSlots(data, save)) save.relics.equipped.push(r.id);
}

/** Reliktpack öffnen: ein noch fehlendes, zufällig erhältliches Relikt – sonst Foil-Staub. */
export function openRelicPack(data, save, rng = Math.random, deferDust = false) {
  const destroyed = save.relics.destroyed || [];
  const free = data.relics.filter((r) => !r.nurBaum && !save.relics.owned.includes(r.id) && !destroyed.includes(r.id));
  if (!free.length) {
    if (deferDust) return null;
    const st = data.balance.belohnungen.reliktpackOhneRelikt.foilStaub;
    save.foilDust += st;
    save.stats.foilStaubGesamt = (save.stats.foilStaubGesamt || 0) + st;
    return null;
  }
  const r = free[Math.floor(rng() * free.length)];
  giveRelic(r, data, save);
  return r;
}

export function equipRelic(id, data, save) {
  const eq = save.relics.equipped;
  if (eq.includes(id)) { save.relics.equipped = eq.filter((x) => x !== id); return true; }
  if (eq.length >= relicSlots(data, save)) return false;
  eq.push(id);
  return true;
}

/** Zusätzliche Plätze durch Zerstören: Schwellen kumuliert (1, 3, 6, 10 zerstörte Relikte → +1, +2, +3, +4). */
export function slotsFromDestroyed(data, save) {
  const R = data.balance.relikte;
  const n = save.relics.destroyed?.length || 0;
  const sw = R.zerstoerenSchwellen ?? [1, 2, 3, 4];
  return Math.min(R.plaetzeMax - R.plaetzeStart, sw.filter((x) => n >= x).length);
}

/** Wie viele Relikte noch zerstört werden müssen, bis der nächste Platz frei wird (null = Maximum erreicht). */
export function relicsToNextSlot(data, save) {
  const R = data.balance.relikte;
  const n = save.relics.destroyed?.length || 0;
  const next = (R.zerstoerenSchwellen ?? [1, 2, 3, 4]).find((x) => n < x);
  if (next == null || slotsFromDestroyed(data, save) >= R.plaetzeMax - R.plaetzeStart) return null;
  return next - n;
}

/** Relikt zerstören: es ist weg; genug zerstörte Relikte schalten weitere Plätze frei. */
export function destroyRelic(id, data, save) {
  if (!save.relics.owned.includes(id)) return false;
  save.relics.owned = save.relics.owned.filter((x) => x !== id);
  save.relics.equipped = save.relics.equipped.filter((x) => x !== id);
  (save.relics.destroyed ||= []).push(id);
  save.relics.extraSlots = slotsFromDestroyed(data, save);
  return true;
}

/** Foil-Knoten „Relikt-Wiederherstellung“: zerstörtes Relikt gegen Foil-Staub zurückholen. */
export function repairRelic(id, data, save, mods) {
  const cost = data.balance.foilbaum.reliktReparaturKosten;
  if (!mods.flags.reliktReparatur || !save.relics.destroyed?.includes(id) || save.foilDust < cost) return false;
  save.foilDust -= cost;
  save.relics.destroyed = save.relics.destroyed.filter((x) => x !== id);
  giveRelic(data.relicIndex[id], data, save);
  return true;
}

// ===========================================================================
// Erfolge
// ===========================================================================

function statValue(z, data, save) {
  const s = save.stats;
  const f = z.filter || {};
  switch (z.statistik) {
    case 'packsGeoeffnet': return f.pack ? s.packsGeoeffnet[f.pack] || 0 : s.packsGesamt;
    case 'bossBesiegt': return f.boss ? s.bosseBesiegt[f.boss] || 0 : Object.values(s.bosseBesiegt).reduce((a, b) => a + b, 0);
    case 'killsGegner': return f.kapitel ? s.killsGegner[f.kapitel]?.[f.gegner] || 0 : Object.values(s.killsGegner).reduce((a, k) => a + (k[f.gegner] || 0), 0);
    case 'laengsterRun': return Math.floor(s.laengsterRun);
    case 'kartenArten': return data.allCards.filter((id) => (save.collection[id]?.normal || 0) + (save.collection[id]?.foil || 0) > 0).length;
    case 'foilArten': return data.allCards.filter((id) => save.collection[id]?.foil > 0).length;
    case 'foilMonsterArten': return data.enemies.filter((e) => save.bestiary[e.id]?.foil > 0).length;
    case 'grenzgaengerArten': return data.units.filter((u) => u.rarity === 'grenzgaenger' && save.collection[u.id]).length;
    case 'monsterArten': return data.enemies.filter((e) => save.bestiary[e.id]?.normal > 0).length;
    case 'reliktArten': return save.relics.owned.length;
    default: return s[z.statistik] || 0;
  }
}

function statTarget(z, data) {
  if (z.anzahl !== 'alle') return z.anzahl;
  switch (z.statistik) {
    case 'kartenArten': case 'foilArten': return data.allCards.length;
    case 'grenzgaengerArten': return data.units.filter((u) => u.rarity === 'grenzgaenger').length;
    case 'monsterArten': case 'foilMonsterArten': return data.enemies.length;
    case 'reliktArten': return data.relics.length;
    default: return 1;
  }
}

export function progressOf(item, data, save) {
  const target = statTarget(item.ziel, data);
  return { value: Math.min(target, statValue(item.ziel, data, save)), target };
}

/**
 * Prüft Erfolge und schaltet neue frei. Gibt die neu freigeschalteten zurück.
 * Shiny-Erfolge geben einmalig Schimmer (belohnung.foilStaub); mit deferDust zählt ihn der Aufrufer selbst.
 */
export function checkAchievements(data, save, deferDust = false) {
  const fresh = [];
  for (const a of data.achievements) {
    if (save.achievements[a.id]) continue;
    const p = progressOf(a, data, save);
    if (p.value >= p.target) {
      save.achievements[a.id] = save.day;
      fresh.push(a);
      const st = a.belohnung?.foilStaub || 0;
      if (st && !deferDust) { save.foilDust += st; save.stats.foilStaubGesamt = (save.stats.foilStaubGesamt || 0) + st; }
    }
  }
  return fresh;
}
