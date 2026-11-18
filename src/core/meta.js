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
  tagesEinkommen: 0, muenzenMul: 1, shopPlaetze: 0, taschenPlaetze: 0, masteryMul: 1, jackpotChance: 0,
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
  for (const id of save.relics.equipped) {
    const r = data.relicIndex[id];
    if (r?.ausloeser !== 'passiv') continue;
    if (r.aktion.typ === 'wert') applyOp(mods, r.aktion.ziel, r.aktion.op, r.aktion.wert);
    if (r.aktion.typ === 'werte') for (const w of r.aktion.werte) applyOp(mods, w.ziel, w.op, w.wert);
  }
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
// Shop: Tage, Angebote, Jackpots, Run-Tasche
// ===========================================================================

export function shopSlots(data, mods) {
  return Math.min(data.balance.shop.angebotsPlaetzeMax, data.balance.shop.angebotsPlaetzeStart + mods.shopPlaetze);
}

/** Fassungsvermögen der Run-Tasche (Packs pro Run). */
export function bagCapacity(data, mods) {
  return (data.balance.shop.taschenPlaetze ?? Infinity) + (mods?.taschenPlaetze || 0);
}

function priceFactor(data, save) {
  return Math.pow(1 + data.balance.wirtschaft.preisWachstumProKapitel, highestChapter(save, data) - 1);
}

/** Angebot eines Platzes: { kind: 'angebot'|'jackpot', id, name, items:[{artikel, anzahl}], preis } */
export function describeOffer(slot, data, save) {
  if (!slot) return null;
  if (slot.jackpot) {
    const j = data.shop.jackpots.find((x) => x.id === slot.id);
    return { kind: 'jackpot', id: j.id, name: j.name, items: j.inhalt, preis: Math.round(j.grundPreis * priceFactor(data, save)), sold: slot.sold };
  }
  const o = data.offerIndex[slot.id];
  const p = data.packIndex[o.artikel];
  return { kind: 'angebot', id: o.id, name: o.anzahl > 1 ? `${o.anzahl} × ${p.name}` : p.name, items: [{ artikel: o.artikel, anzahl: o.anzahl }], preis: Math.round(o.grundPreis * priceFactor(data, save)), sold: slot.sold };
}

/** Würfelt die Angebotsplätze für den neuen Tag. */
export function rollOffers(data, save, mods, rng = Math.random) {
  const pool = data.shop.angebote.filter((o) => packUnlocked(data.packIndex[o.artikel], save));
  const jpPool = data.shop.jackpots.filter((j) => j.inhalt.every((i) => { const p = data.packIndex[i.artikel]; return p.art === 'relikt' || packUnlocked(p, save); }));
  const jpChance = data.balance.shop.jackpot.chance + mods.jackpotChance;
  save.shop.offers = Array.from({ length: shopSlots(data, mods) }, (_, i) => {
    if (i > 0 && jpPool.length && rng() < jpChance) return { id: weightedPick(jpPool.map((j) => [j.id, j.gewicht]), rng), jackpot: true };
    return { id: weightedPick(pool.map((o) => [o.id, o.gewicht]), rng), jackpot: false };
  });
  if (!save.shop.offers.some((o) => o.id === 'a_holz')) save.shop.offers[0] = { id: 'a_holz', jackpot: false }; // nie ohne Einstiegsangebot
}

export function rerollCost(data, save) {
  const r = data.balance.shop.neuWuerfeln;
  return Math.round(r.grundKosten * Math.pow(r.wachstum, save.shop.rerolls || 0));
}

export const canReroll = (mods) => !!mods.flags.neuWuerfeln;

export function reroll(data, save, mods, rng = Math.random) {
  const cost = rerollCost(data, save);
  if (!canReroll(mods) || save.coins < cost) return false;
  save.coins -= cost;
  save.stats.muenzenAusgegeben += cost;
  save.shop.rerolls = (save.shop.rerolls || 0) + 1;
  rollOffers(data, save, mods, rng);
  return true;
}

/** Kauft ein Angebot. Normale Angebote sind beliebig oft kaufbar, Jackpots nur einmal. Reliktpacks werden sofort geöffnet. */
export function buyOffer(slotIndex, data, save, rng = Math.random, cap = Infinity) {
  const slot = save.shop.offers[slotIndex];
  const o = describeOffer(slot, data, save);
  if (!o || o.sold || save.coins < o.preis) return null;
  const packs = o.items.filter((i) => data.packIndex[i.artikel].art !== 'relikt').reduce((s, i) => s + i.anzahl, 0);
  if (packs && save.shop.bag.length + packs > cap) return { full: true };
  save.coins -= o.preis;
  save.stats.muenzenAusgegeben += o.preis;
  const n = o.items.reduce((s, i) => s + i.anzahl, 0);
  const got = [];
  for (const i of o.items) for (let k = 0; k < i.anzahl; k++) {
    if (data.packIndex[i.artikel].art === 'relikt') got.push({ relikt: openRelicPack(data, save, rng) });
    else save.shop.bag.push({ artikel: i.artikel, preis: o.preis / n });
  }
  if (o.kind === 'jackpot') slot.sold = true;
  return { offer: o, got };
}

/** Pack aus der Run-Tasche entfernen: volle Rückerstattung. */
export function removeFromBag(index, data, save) {
  const item = save.shop.bag[index];
  if (!item) return;
  const back = Math.round(item.preis * data.balance.shop.rueckerstattung);
  save.coins += back;
  save.stats.muenzenAusgegeben -= back;
  save.shop.bag.splice(index, 1);
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
  save.coins += out.muenzen + out.einkommen;
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
    case 'shopPlaetze': case 'kartenProPack': case 'taschenPlaetze': return level ? `+${v}` : '–';
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
