// Meta-Ebene zwischen den Runs: Modifikatoren, Shop (Tage, Jackpots, Run-Tasche), Belohnungen,
// Sternenkarte (Kaufen, Nebel, Reset), Tor/Akte, Prestige, Relikte, Quests, Erfolge.
import { weightedPick } from './util.js';

// ===========================================================================
// Modifikatoren für einen Run
// ===========================================================================

export const MOD_DEFAULTS = {
  // Runenkreis
  cursorSchaden: 0, cursorSchadenMul: 1, cursorRadiusMul: 1, cursorTickMul: 1, cursorPackSchadenMul: 1, cursorKrit: 0,
  // Wirtschaft
  tagesEinkommen: 0, bonusEinkommen: 0, muenzenMul: 1, shopPlaetze: 0, freieRerolls: 0, masteryMul: 1, jackpotChance: 0,
  // Packs
  packWiderstandMul: 1, foilChance: 0, foilChanceMul: 1, kartenProPack: 0, packImPack: 0, grenzgaengerChance: 0,
  // Foil
  foilStaerkeMul: 1, foilMonsterChance: 0,
  // Helden
  heldenSchadenMul: 1, heldenLebenMul: 1, heldenTempoMul: 1, bossSchadenMul: 1, heldenVerfallProSekunde: 0, heldenHeilungProKill: 0,
  // Turm
  turmLebenMul: 1, turmRegen: 0, turmSchuetze: 0, turmDornen: 0,
  // Tomes
  tomeWirkungMul: 1, tomeDauerMul: 1, tomeDoppeltChance: 0, tomeZweimalChance: 0, tomesErlaubt: true,
  // Kapitel-Modifikatoren
  gegnerTempoMul: 1, gegnerLebenMul: 1, gegnerSchadenMul: 1, elitewelleIntervallMul: 1, bossZeitMul: 1, erlaubteKI: null,
};

export const levelOf = (save, id) => (id === 'start' ? 1 : save.starmap[id] || 0);

function applyOp(mods, ziel, op, wert, times = 1) {
  if (op === 'set') { mods[ziel] = wert; return; }
  if (!(ziel in mods)) mods[ziel] = op === 'mul' ? 1 : 0;
  if (op === 'mul' || op === 'multiplizieren') mods[ziel] *= Math.pow(wert, times);
  else mods[ziel] += wert * times;
}

/**
 * @param {object} opts { modifierId, prestige, gesucht }
 */
export function computeMods(data, save, opts = {}) {
  const mods = { ...MOD_DEFAULTS, gebaeude: {}, einheiten: {}, flags: {}, modifierMastery: 1, prestige: null, gesucht: false };
  for (const node of data.starmap.knoten) {
    const lvl = levelOf(save, node.id);
    if (!lvl || node.typ === 'start') continue;
    const e = node.effekt;
    if (e.ziel === 'flag') mods.flags[e.flag] = true;
    else if (e.ziel === 'gebaeude') mods.gebaeude[e.gebaeude] = (mods.gebaeude[e.gebaeude] || 0) + lvl;
    else if (e.ziel === 'einheit') { const list = (mods.einheiten[e.karte] ||= []); for (let i = 0; i < lvl; i++) list.push(...e.patches); }
    else if ('wert' in e) applyOp(mods, e.ziel, e.rechenart === 'multiplizieren' ? 'mul' : 'add', e.wert, lvl);
  }
  const vorRelikten = mods.tagesEinkommen;
  for (const id of save.relics.equipped) {
    const r = data.relicIndex[id];
    if (r?.ausloeser !== 'passiv') continue;
    if (r.aktion.typ === 'wert') applyOp(mods, r.aktion.ziel, r.aktion.op, r.aktion.wert);
    if (r.aktion.typ === 'werte') for (const w of r.aktion.werte) applyOp(mods, w.ziel, w.op, w.wert);
  }
  mods.bonusEinkommen = Math.max(0, mods.tagesEinkommen - vorRelikten) + (save.questBonus.tagesEinkommen || 0);
  mods.tagesEinkommen += save.questBonus.tagesEinkommen || 0;
  const m = opts.modifierId && data.modifierIndex[opts.modifierId];
  if (m) { for (const ef of m.effekte) applyOp(mods, ef.ziel, ef.op, ef.wert); mods.modifierMastery = m.belohnung.masteryMul ?? 1; }
  if (opts.prestige) mods.prestige = data.balance.prestige.stufen.find((s) => s.stufe === opts.prestige) ?? null;
  mods.gesucht = !!opts.gesucht;
  return mods;
}

// ===========================================================================
// Freischaltungen, Akte, Tor, Prestige
// ===========================================================================

export function packUnlocked(pack, save) {
  const f = pack.freischaltung;
  if (f.typ === 'start') return true;
  if (f.typ === 'boss') return (save.stats.bossKills[f.kapitel] || 0) > 0;
  return false;
}

export function chapterUnlocked(ch, save, data) {
  if (ch.art === 'reliktjagd') return (save.stats.bossKills[ch.freischaltung?.boss ?? 1] || 0) > 0;
  if (ch.art === 'riss') return save.act >= 2; // Elementar-Risse öffnen sich mit dem Tor
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

/** Schlüsselsteine des Tors (Akt 1): je besiegtem Boss einer. */
export function gateState(data, save) {
  const act = data.actIndex[1];
  const stones = act.tor.schluesselsteine.map((s) => ({ ...s, owned: (save.stats.bossKills[s.kapitel] || 0) > 0 }));
  return { tor: act.tor, stones, complete: stones.every((s) => s.owned), opened: save.act >= 2 };
}

/** Tor öffnen → Akt 2. Die Sternenkarte wird zurückgesetzt (volle Rückerstattung). */
export function openGate(data, save) {
  const g = gateState(data, save);
  if (!g.complete || g.opened) return false;
  if (data.balance.akte.sternenkarteResetBeiAktwechsel) resetStarmap(data, save);
  save.act = 2;
  save.stats.torGeoeffnet = 1;
  return true;
}

export function prestigeAvailable(ch, save, data) {
  if (!ch.prestige || !(save.stats.bossKills[ch.id] > 0)) return [];
  const done = save.stats.prestige[ch.id] || 0;
  return data.balance.prestige.stufen.filter((s) => s.stufe <= done + 1).map((s) => s.stufe);
}

export function modifiersAvailable(data, save) {
  return data.modifiers.filter((m) => save.act >= m.abAkt);
}

// ===========================================================================
// Shop: Tage, Angebote, Jackpots, Einzelkarten, Rabatt, Kaufen/Rückgängig, Reset, Reroll
// ===========================================================================
//
// save.shop.offers[] = { uid, kind: 'angebot'|'jackpot'|'karte', id, karte?, rabatt, neu, sold, paid: {coins, bonus}, opened }
// Gekaufte Plätze bilden die Run-Tasche (bagItems). Relikt-Jackpots werden sofort geöffnet und sind endgültig.

export function shopSlots(data, mods) {
  return Math.min(data.balance.shop.angebotsPlaetzeMax, data.balance.shop.angebotsPlaetzeStart + mods.shopPlaetze);
}

function priceFactor(data, save) {
  return Math.pow(1 + data.balance.wirtschaft.preisWachstumProKapitel, highestChapter(save, data) - 1);
}

/** Verfügbare Münzen gesamt (Tagesmünzen + Bonus-Münzen). */
export const walletTotal = (save) => (save.coins || 0) + (save.bonusCoins || 0);

/** Angebot eines Platzes: { kind, name, items:[{artikel|karte, anzahl}], preis, basisPreis, sold, rabatt, neu } */
export function describeOffer(slot, data, save) {
  if (!slot) return null;
  const f = priceFactor(data, save);
  const base = { uid: slot.uid, sold: !!slot.sold, rabatt: !!slot.rabatt, neu: !!slot.neu, opened: !!slot.opened };
  let o;
  if (slot.kind === 'jackpot') {
    const j = data.shop.jackpots.find((x) => x.id === slot.id);
    if (!j) return null;
    o = { ...base, kind: 'jackpot', id: j.id, name: j.name, items: j.inhalt, basisPreis: Math.max(1, Math.round(j.grundPreis * f)) };
  } else if (slot.kind === 'karte') {
    const c = data.cardIndex[slot.karte];
    if (!c) return null;
    const E = data.shop.einzelkarten;
    const p = E.preisNachSeltenheit[c.def.rarity] ?? 5;
    o = { ...base, kind: 'karte', id: slot.karte, name: c.def.name, items: [{ karte: slot.karte, anzahl: 1 }], basisPreis: Math.max(1, Math.round((p + (c.art === 'tome' ? E.tomeAufschlag : 0)) * f)) };
  } else {
    const a = data.offerIndex[slot.id];
    if (!a) return null;
    const pk = data.packIndex[a.artikel];
    o = { ...base, kind: 'angebot', id: a.id, name: a.anzahl > 1 ? `${a.anzahl} × ${pk.name}` : pk.name, items: [{ artikel: a.artikel, anzahl: a.anzahl }], basisPreis: Math.max(1, Math.round(a.grundPreis * f)) };
  }
  o.preis = o.rabatt ? Math.max(1, Math.round(o.basisPreis * data.balance.shop.rabatt.faktor)) : o.basisPreis;
  if (slot.sold && slot.paid) o.preis = slot.paid.coins + slot.paid.bonus;
  return o;
}

const contentKey = (slot) => (slot.kind === 'karte' ? `karte:${slot.karte}` : `${slot.kind}:${slot.id}`);

/** Zufällige Einzelkarte aus einem freigeschalteten Pack. */
function rollSingleCard(data, save, rng) {
  const packs = data.packs.filter((p) => p.art === 'pack' && p.pool?.length && packUnlocked(p, save));
  if (!packs.length) return null;
  const pack = packs[Math.floor(rng() * packs.length)];
  const rars = Object.entries(pack.seltenheitsGewichte).filter(([r]) => pack.pool.some((id) => data.cardIndex[id]?.def.rarity === r));
  const r = weightedPick(rars, rng);
  const ids = pack.pool.filter((id) => data.cardIndex[id]?.def.rarity === r);
  return ids[Math.floor(rng() * ids.length)];
}

function rollSlot(data, save, mods, rng, index, uid) {
  const pool = data.shop.angebote.filter((o) => packUnlocked(data.packIndex[o.artikel], save));
  const jpPool = data.shop.jackpots.filter((j) => j.inhalt.every((i) => { const p = data.packIndex[i.artikel]; return p.art === 'relikt' || packUnlocked(p, save); }));
  const jpChance = data.balance.shop.jackpot.chance + mods.jackpotChance;
  const E = data.shop.einzelkarten;
  let slot;
  if (index > 0 && jpPool.length && rng() < jpChance) slot = { kind: 'jackpot', id: weightedPick(jpPool.map((j) => [j.id, j.gewicht]), rng) };
  else {
    const total = pool.reduce((a, o) => a + o.gewicht, 0) + (E ? E.gewicht : 0);
    let x = rng() * total;
    const karte = E && index > 0 && x >= total - E.gewicht ? rollSingleCard(data, save, rng) : null;
    slot = karte ? { kind: 'karte', karte } : { kind: 'angebot', id: weightedPick(pool.map((o) => [o.id, o.gewicht]), rng) };
    if (rng() < data.balance.shop.rabatt.chance) slot.rabatt = true;
  }
  slot.uid = uid;
  const seen = (save.shop.seen ||= []);
  const key = contentKey(slot);
  if (!seen.includes(key)) { slot.neu = true; seen.push(key); }
  return slot;
}

function nextUid(save) { save.shop.uid = (save.shop.uid || 0) + 1; return save.shop.uid; }

/** Würfelt die Angebotsplätze für den neuen Tag (gekaufte bleiben stehen, falls keepSold). */
export function rollOffers(data, save, mods, rng = Math.random, keepSold = false) {
  const n = shopSlots(data, mods);
  const old = save.shop.offers || [];
  const out = [];
  for (let i = 0; i < n; i++) {
    if (keepSold && old[i]?.sold) out.push(old[i]);
    else out.push(rollSlot(data, save, mods, rng, i, nextUid(save)));
  }
  // Nie ohne Einstiegsangebot: Platz 0 ist ein Holzpack, wenn sonst keines da ist
  if (!keepSold && !out.some((o) => o.kind === 'angebot' && o.id === 'a_holz')) out[0] = { kind: 'angebot', id: 'a_holz', uid: nextUid(save), neu: !(save.shop.seen || []).includes('angebot:a_holz') };
  if (!(save.shop.seen || []).includes('angebot:a_holz')) (save.shop.seen ||= []).push('angebot:a_holz');
  save.shop.offers = out;
}

export const canReroll = (mods) => !!mods.flags.neuWuerfeln;

export function rerollCost(data, save, mods) {
  if ((save.shop.freeUsed || 0) < (mods?.freieRerolls || 0)) return 0;
  const r = data.balance.shop.neuWuerfeln;
  return Math.max(1, Math.round(r.grundKosten * Math.pow(r.wachstum, save.shop.rerolls || 0)));
}

/** Pay with bonus coins first, then normal coins. Returns the split for an exact refund. */
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

/** Würfelt alle nicht gekauften Angebote neu. */
export function reroll(data, save, mods, rng = Math.random) {
  if (!canReroll(mods)) return false;
  const cost = rerollCost(data, save, mods);
  if (walletTotal(save) < cost) return false;
  if (cost === 0) save.shop.freeUsed = (save.shop.freeUsed || 0) + 1;
  else { pay(save, cost); save.shop.rerolls = (save.shop.rerolls || 0) + 1; }
  rollOffers(data, save, mods, rng, true);
  return true;
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

/** Inhalt der Run-Tasche: Pack-/Kisten-IDs und Einzelkarten als "karte:<id>". */
export function bagItems(data, save) {
  const out = [];
  for (const slot of save.shop.offers) {
    if (!slot.sold) continue;
    const o = describeOffer(slot, data, save);
    for (const i of o.items) for (let k = 0; k < i.anzahl; k++) {
      if (i.karte) out.push(`karte:${i.karte}`);
      else if (data.packIndex[i.artikel].art !== 'relikt') out.push(i.artikel);
    }
  }
  return out;
}

/** Zu Beginn eines Runs: gekaufte Plätze werden verbraucht. */
export function consumeBag(save) {
  save.shop.offers = save.shop.offers.filter((s) => !s.sold);
}

// ===========================================================================
// Belohnungen nach einem Run
// ===========================================================================

export function masteryFor(result, data, mods) {
  const B = data.balance.belohnungen;
  const base = result.zeit * B.masteryProSekunde + result.kills * B.masteryProKill + result.elitewellen * B.masteryProElitewelle + (result.sieg ? B.masteryProBoss : 0);
  const kapitelMul = data.chapterIndex[result.kapitel]?.wellen.muenzenMul ?? 1; // höhere Kapitel geben mehr Mastery
  return Math.round(base * kapitelMul * mods.masteryMul * mods.modifierMastery * (mods.prestige?.belohnungMul ?? 1));
}

/** Überträgt das Ergebnis in den Spielstand. Ein Run = ein Tag. */
export function applyRunResult(result, data, save, mods, rng = Math.random) {
  const s = save.stats;
  const out = { neueKarten: result.neueKarten, kapitelFrei: null, packsFrei: [], relikt: null, schluesselstein: null };
  const prestMul = mods.prestige?.belohnungMul ?? 1;
  out.muenzen = Math.round(result.muenzen * prestMul);
  out.einkommen = mods.tagesEinkommen;
  out.mastery = masteryFor(result, data, mods);
  out.kristalle = Math.round(result.kristalle * prestMul) + (result.sieg && mods.gesucht ? data.balance.gesucht.kristalle : 0);
  out.foilStaub = result.foilStaub + (result.sieg && mods.gesucht ? data.balance.gesucht.foilStaub : 0);
  // Tagesbudget = Münzen aus dem Run + Einkommen aus der Sternenkarte; Bonus-Münzen = Einkommen aus Quests und Relikten
  out.bonus = Math.min(out.einkommen, mods.bonusEinkommen || 0);
  save.coins += out.muenzen + out.einkommen - out.bonus;
  save.bonusCoins = (save.bonusCoins || 0) + out.bonus;
  save.dayBudget = out.muenzen + out.einkommen - out.bonus;
  save.mastery += out.mastery;
  save.crystals += out.kristalle;
  save.foilDust += out.foilStaub;

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

  if (result.sieg) {
    const first = !s.bossKills[result.kapitel];
    s.bossKills[result.kapitel] = (s.bossKills[result.kapitel] || 0) + 1;
    s.bosseBesiegt[result.boss] = (s.bosseBesiegt[result.boss] || 0) + 1;
    if (mods.prestige) { s.prestige[result.kapitel] = Math.max(s.prestige[result.kapitel] || 0, mods.prestige.stufe); s.prestigeGeschafft++; }
    if (mods.gesucht) { s.foilBossBesiegt++; const b = (save.bestiary[result.boss] ||= { normal: 0, foil: 0 }); b.foil++; }
    const ch = data.chapterIndex[result.kapitel];
    if (ch.belohnung?.fehlendesRelikt) out.relikt = openRelicPack(data, save, rng);
    if (first && ch.art === 'kapitel') {
      const act = data.actIndex[ch.akt];
      const next = act.kapitel[act.kapitel.indexOf(ch.id) + 1];
      if (next) out.kapitelFrei = data.chapterIndex[next];
      out.packsFrei = data.packs.filter((p) => p.freischaltung.typ === 'boss' && p.freischaltung.kapitel === ch.id);
      out.schluesselstein = act.tor?.schluesselsteine.find((st) => st.kapitel === ch.id) ?? null;
    }
  }
  out.erfolge = checkAchievements(data, save);
  // Neuer Tag: Tageseinkommen ist gutgeschrieben, Shop würfelt neu
  save.day++;
  save.shop.rerolls = 0;
  save.shop.freeUsed = 0;
  rollOffers(data, save, mods, rng);
  return out;
}

// ===========================================================================
// Sternenkarte
// ===========================================================================

export function nodeVisibleInAct(node, save) {
  return (node.akt ?? 1) <= save.act;
}

export function nodeReachable(node, save) {
  return node.typ === 'start' || node.verbindungen.some((id) => levelOf(save, id) > 0);
}

export function nodeCost(node, level) {
  return { amount: Math.round(node.basisKosten * Math.pow(node.kostenFaktor ?? 1.45, level)), waehrung: node.waehrung ?? 'mastery', kristalle: node.kristallKosten || 0 };
}

const wallet = (save, w) => (w === 'foilstaub' ? save.foilDust : save.mastery);

export function nodeBlocker(node, save, data) {
  const lvl = levelOf(save, node.id);
  if (!nodeVisibleInAct(node, save)) return 'Erst nach dem Tor verfügbar';
  if (lvl >= node.maxStufe) return 'Maximum erreicht';
  if (!nodeReachable(node, save)) return `Benötigt: ${node.verbindungen.map((id) => data.starIndex[id]?.name).filter(Boolean).join(' oder ')} Stufe 1`;
  const card = node.voraussetzung?.karte;
  if (card && !((save.collection[card]?.normal || 0) + (save.collection[card]?.foil || 0) > 0)) return `Finde die Karte ${data.cardIndex[card]?.def.name ?? card}`;
  const c = nodeCost(node, lvl);
  if (wallet(save, c.waehrung) < c.amount) return c.waehrung === 'foilstaub' ? 'Zu wenig Foil-Staub' : 'Zu wenig Mastery-Punkte';
  if (save.crystals < c.kristalle) return 'Zu wenig Kristalle';
  return null;
}

export function buyNode(node, save, data) {
  if (nodeBlocker(node, save, data)) return false;
  const lvl = levelOf(save, node.id);
  const c = nodeCost(node, lvl);
  if (c.waehrung === 'foilstaub') save.foilDust -= c.amount; else save.mastery -= c.amount;
  save.crystals -= c.kristalle;
  save.starmap[node.id] = lvl + 1;
  save.lastBought = node.id;
  return true;
}

export function resetStarmap(data, save) {
  let mp = 0, fs = 0, kr = 0;
  for (const node of data.starmap.knoten) {
    for (let l = 0; l < (save.starmap[node.id] || 0); l++) {
      const c = nodeCost(node, l);
      if (c.waehrung === 'foilstaub') fs += c.amount; else mp += c.amount;
      kr += c.kristalle;
    }
  }
  save.mastery += mp; save.foilDust += fs; save.crystals += kr;
  save.starmap = {};
  save.lastBought = null;
  return { mp, fs, kr };
}

export function anyNodeAffordable(data, save) {
  return data.starmap.knoten.some((n) => !nodeBlocker(n, save, data));
}

export function describeNodeEffect(node, level) {
  const e = node.effekt;
  if (!('wert' in e) || e.ziel === 'gebaeude') return level > 0 ? (e.ziel === 'gebaeude' ? `Stufe ${level}` : 'Aktiv') : '–';
  const v = e.rechenart === 'multiplizieren' ? Math.pow(e.wert, level) : e.wert * level;
  const pct = (x) => `${x >= 0 ? '+' : ''}${(Math.round(x * 1000) / 10).toString().replace('.', ',')} %`;
  switch (e.ziel) {
    case 'cursorSchaden': return `+${v} Runen-Schaden`;
    case 'tagesEinkommen': return `+${v} Münzen pro Tag`;
    case 'shopPlaetze': case 'kartenProPack': case 'freieRerolls': return level ? `+${v}` : '–';
    case 'turmSchuetze': return `Stufe ${v}`;
    case 'turmDornen': return `${v} Schaden zurück`;
    case 'turmRegen': return `${pct(v)} Leben/s`;
    case 'foilChance': case 'grenzgaengerChance': case 'foilMonsterChance': case 'jackpotChance': return `${pct(v)}`;
    default: return pct(v);
  }
}

// ===========================================================================
// Relikte
// ===========================================================================

export function relicSlots(data, save) {
  return Math.min(data.balance.relikte.plaetzeMax, data.balance.relikte.plaetzeStart + (save.relics.extraSlots || 0));
}

/** Reliktpack öffnen: bevorzugt ein noch fehlendes Relikt. */
export function openRelicPack(data, save, rng = Math.random) {
  const destroyed = save.relics.destroyed || [];
  const free = data.relics.filter((r) => !save.relics.owned.includes(r.id) && !destroyed.includes(r.id));
  if (!free.length) { save.crystals += 10; return null; }
  const r = free[Math.floor(rng() * free.length)];
  save.relics.owned.push(r.id);
  save.relics.newCount = (save.relics.newCount || 0) + 1;
  if (save.relics.equipped.length < relicSlots(data, save)) save.relics.equipped.push(r.id);
  return r;
}

export function equipRelic(id, data, save) {
  const eq = save.relics.equipped;
  if (eq.includes(id)) { save.relics.equipped = eq.filter((x) => x !== id); return true; }
  if (eq.length >= relicSlots(data, save)) return false;
  eq.push(id);
  return true;
}

/** Relikt zerstören: es ist weg, dafür gibt es einen zusätzlichen Platz (bis zum Maximum). */
export function destroyRelic(id, data, save) {
  if (!save.relics.owned.includes(id)) return false;
  save.relics.owned = save.relics.owned.filter((x) => x !== id);
  save.relics.equipped = save.relics.equipped.filter((x) => x !== id);
  (save.relics.destroyed ||= []).push(id);
  if (data.balance.relikte.zerstoerenGibtPlatz && relicSlots(data, save) < data.balance.relikte.plaetzeMax) save.relics.extraSlots = (save.relics.extraSlots || 0) + 1;
  return true;
}

// ===========================================================================
// Quests und Erfolge
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
    case 'monsterArten': return data.enemies.length;
    case 'reliktArten': return data.relics.length;
    default: return 1;
  }
}

export function progressOf(item, data, save) {
  const target = statTarget(item.ziel, data);
  return { value: Math.min(target, statValue(item.ziel, data, save)), target };
}

export const questDone = (q, data, save) => { const p = progressOf(q, data, save); return p.value >= p.target; };

export function claimQuest(q, data, save, rng = Math.random) {
  if (save.quests.claimed.includes(q.id) || !questDone(q, data, save)) return null;
  save.quests.claimed.push(q.id);
  const b = q.belohnung;
  const parts = [];
  if (b.tagesEinkommen) { save.questBonus.tagesEinkommen = (save.questBonus.tagesEinkommen || 0) + b.tagesEinkommen; parts.push(`+${b.tagesEinkommen} Tageseinkommen`); }
  if (b.kristalle) { save.crystals += b.kristalle; parts.push(`+${b.kristalle} Kristalle`); }
  for (let i = 0; i < (b.reliktpack || 0); i++) { const r = openRelicPack(data, save, rng); parts.push(r ? `Relikt: ${r.name}` : '+10 Kristalle'); }
  return parts.join(', ');
}

export function claimableQuests(data, save) {
  return data.quests.filter((q) => !save.quests.claimed.includes(q.id) && questDone(q, data, save)).length;
}

/** Prüft Erfolge und schaltet neue frei. Gibt die neu freigeschalteten zurück. */
export function checkAchievements(data, save) {
  const fresh = [];
  for (const a of data.achievements) {
    if (save.achievements[a.id]) continue;
    const p = progressOf(a, data, save);
    if (p.value >= p.target) { save.achievements[a.id] = save.day; fresh.push(a); }
  }
  return fresh;
}
