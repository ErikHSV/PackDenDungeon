// Dauerhafter Spielstand (localStorage). Laufende Runs werden nicht gespeichert.

import { REMOVED_V12, REMOVED_V14 } from './refunds.js';

const KEY = 'packdendungeon-save-v3';

export function defaultSave(data) {
  return {
    version: 15,
    // Genau drei Währungen (Abschnitt 10)
    coins: data?.balance.wirtschaft.startMuenzen ?? 3, // Münzen: nur für den Shop
    bonusCoins: 0,      // Bonus-Münzen aus Relikten und Effekten (werden zuerst ausgegeben)
    dayBudget: data?.balance.wirtschaft.startMuenzen ?? 3, // Einkommen des aktuellen Tages (Anzeige "x+b/Budget")
    mastery: 0,         // Mastery (blauer Kristall): Skill-Tree
    foilDust: 0,        // Foil-Staub („Schimmer“, Regenbogen-Kristall): Foil-Baum, bleibt bei Akt-Wechseln
    day: 1,
    act: 1,
    starmap: {},        // Skill-Tree: Knoten-ID -> Stufe (Quest-Knoten: 1 = abgeholt)
    foiltree: {},       // Foil-Baum: Knoten-ID -> Stufe (dauerhaft)
    questProgress: {},  // Quest-Knoten-ID -> Fortschritt (zählt nur, solange die Quest sichtbar ist)
    lastBought: null,
    collection: {},     // Karten-ID -> { normal, foil }
    bestiary: {},       // Gegner-ID -> { normal, foil } (Kills)
    relics: { owned: [], equipped: [], extraSlots: 0, destroyed: [], newCount: 0 },
    achievements: {},   // Erfolg-ID -> Tag der Freischaltung
    shop: { offers: [], rerolls: 0, freeUsed: 0, seen: [], uid: 0 },
    selection: { chapter: 1, prestige: 0, gesucht: false, modifier: null },
    ui: { cardsSeen: 0, beastsSeen: 0, foilTreeSeen: false, prestigeSeen: 0 }, // rote Punkte, Blinken
    stats: {
      runs: 0, kills: 0, killsGegner: {}, zeitGesamt: 0, laengsterRun: 0, tomesGenutzt: 0, entwicklungen: 0,
      foilsGezogen: 0, foilMonsterBesiegt: 0, grenzgaengerGezogen: 0, packsGeoeffnet: {}, packsGesamt: 0,
      muenzenAusgegeben: 0, bossKills: {}, aktBossKills: {}, bosseBesiegt: {}, besteZeit: {}, prestige: {}, prestigeGeschafft: 0,
      foilBossBesiegt: 0, torGeoeffnet: 0, foilStaubGesamt: 0, gesuchtSiege: {},
    },
    tutorial: { packHint: false, unitHint: false, tomeHint: false, starmapHint: false, firstRunDone: false },
    settings: {
      musicVolume: 0.5, sfxVolume: 0.8, screenShake: true, damageNumbers: true, fastPackOpening: false,
      skipAnimations: false, effectAlpha: 0.6, language: 'de', tempo: 1,
    },
  };
}

function merge(base, raw) {
  const out = { ...base, ...raw };
  for (const k of ['stats', 'tutorial', 'settings', 'relics', 'shop', 'selection', 'ui', 'foiltree', 'questProgress']) out[k] = { ...base[k], ...(raw[k] || {}) };
  return out;
}

export function loadSave(data) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw) return defaultSave(data);
    return parseSave(data, raw);
  } catch {
    return defaultSave(data);
  }
}

/** Rohdaten (z. B. aus einer Datei) in einen gültigen Spielstand überführen, inkl. Migrationen. */
function parseSave(data, raw) {
  const base = defaultSave(data);
  const s = merge(base, raw);
  // Alter Shop (vor 14.2): Run-Tasche erstatten, Angebote neu würfeln
  if (s.shop.offers.some((o) => !o.kind) || s.shop.bag) {
    for (const b of s.shop.bag || []) s.coins += Math.round(b.preis || 0);
    s.shop = { ...base.shop, seen: s.shop.seen || [] };
  }
  if ((raw.version || 0) < 5) migrateV5(s, raw, data);
  if ((raw.version || 0) < 6) migrateV6(s);
  if ((raw.version || 0) < 7) migrateV7(s, data);
  if ((raw.version || 0) < 8) migrateV8(s);
  if ((raw.version || 0) < 9) migrateV9(s, data);
  if ((raw.version || 0) < 10) migrateV10(s, data);
  if ((raw.version || 0) < 11) migrateV11(s, data);
  if ((raw.version || 0) < 12) migrateV12(s, data);
  if ((raw.version || 0) < 13) migrateV13(s, data);
  if ((raw.version || 0) < 14) migrateV14(s, data);
  if ((raw.version || 0) < 15) migrateV15(s, data);
  s.version = base.version; // Migrationen nur einmal ausführen
  return s;
}

// ---------------------------------------------------------------------------
// Export / Import (Datei oder Code zum Kopieren)
// ---------------------------------------------------------------------------

const CODE_PREFIX = 'PDD1:';

/** Spielstand als JSON-Text (für die Datei). */
export function exportSaveJson(save) {
  return JSON.stringify({ spiel: 'PackDenDungeon', exportiert: new Date().toISOString(), spielstand: save }, null, 1);
}

/** Spielstand als kurzer Text-Code (Base64, UTF-8-sicher). */
export function exportSaveCode(save) {
  const bytes = new TextEncoder().encode(JSON.stringify(save));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return CODE_PREFIX + btoa(bin);
}

/** Datei-Inhalt oder Code einlesen. Wirft einen Fehler mit deutscher Meldung, wenn es kein Spielstand ist. */
export function importSave(data, text) {
  const t = String(text || '').trim();
  let raw;
  try {
    if (t.startsWith(CODE_PREFIX)) {
      const bin = atob(t.slice(CODE_PREFIX.length).replace(/\s+/g, ''));
      raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    } else {
      raw = JSON.parse(t);
      if (raw && raw.spielstand) raw = raw.spielstand;
    }
  } catch {
    throw new Error('Das ist kein gültiger Spielstand (Datei oder Code beschädigt).');
  }
  if (!raw || typeof raw !== 'object' || !raw.version || !raw.stats || !raw.collection) throw new Error('Das ist kein Spielstand von PackDenDungeon.');
  return parseSave(data, raw);
}

/**
 * v5: nur noch drei Währungen, Quests als Knoten im Skill-Tree, neuer Foil-Baum.
 * Kristalle werden zu Mastery, gekaufte Skill-Tree-Knoten werden erstattet (der Baum ist neu aufgebaut).
 */
function migrateV5(s, raw, data) {
  let mp = (raw.crystals || 0) * 3;
  const old = raw.starmap || {};
  for (const [id, lvl] of Object.entries(old)) {
    const n = data?.starIndex[id];
    const base = n?.basisKosten ?? 5;
    for (let l = 0; l < lvl; l++) mp += Math.round(base * Math.pow(1.45, l));
  }
  s.mastery = (s.mastery || 0) + mp;
  s.starmap = {};
  s.lastBought = null;
  s.questProgress = {};
  s.foiltree = {};
  s.stats.foilStaubGesamt = s.foilDust || 0;
  delete s.crystals; delete s.quests; delete s.questBonus;
  s.coins = Math.min(s.coins || 0, 20);
  s.shop = { offers: [], rerolls: 0, freeUsed: 0, seen: s.shop.seen || [], uid: s.shop.uid || 0 };
  s.version = 5;
}

/** v6: neuer Skill-Tree (11.7, Startphase) und kleinere Mastery-Zahlen – Baum zurücksetzen, Mastery umrechnen. */
/**
 * v7: Skill-Tree nach dem Original – weniger Cursor- und Turm-Knoten. Gekaufte Stufen entfernter Knoten
 * werden als Mastery erstattet (Basis × Faktor^Stufe × Akt-Faktor).
 */
const REMOVED_V7 = {
  c_tempo: [100, 1.45], c_packreisser: [100, 1.45], c_glut: [1500, 1.45], c_zwilling: [2500, 1.45], c_pfeilregen: [3500, 1.45],
  t_schuetze: [100, 1.8], t_dornen: [80, 1.45], t_regen: [120, 1.45], t_blitz: [2000, 1.45], a2_cursor: [80, 1.45], a2_turm: [80, 1.45],
  q_ueberleben: [0, 1],
};
function migrateV7(s, data) {
  const aktMul = data.balance.skilltree.aktKostenMul?.[s.act ?? 1] ?? 1;
  let refund = 0;
  for (const [id, [basis, f]] of Object.entries(REMOVED_V7)) {
    const lvl = s.starmap?.[id] || 0;
    for (let l = 0; l < lvl; l++) refund += Math.round(basis * Math.pow(f, l) * aktMul);
    if (s.starmap) delete s.starmap[id];
  }
  s.mastery = (s.mastery || 0) + refund;
  if (refund) s.migrationHinweis = `Skill-Tree umgebaut: ${refund} Mastery für entfernte Cursor- und Turm-Knoten erstattet.`;
}

/** v11: Turmleben nur noch zwei Knoten (wie im Original wenig Turm-Upgrades) – III bis V werden erstattet. */
const REMOVED_V11 = { t_mauern1_3: 66, t_mauern1_4: 192, t_mauern1_5: 1147 };
function migrateV11(s, data) {
  const aktMul = data.balance.skilltree.aktKostenMul?.[s.act ?? 1] ?? 1;
  let refund = 0;
  for (const [id, cost] of Object.entries(REMOVED_V11)) if (s.starmap?.[id]) { refund += Math.round(cost * aktMul); delete s.starmap[id]; }
  s.mastery = (s.mastery || 0) + refund;
  if (refund) s.migrationHinweis = [s.migrationHinweis, `Turmleben gekürzt: ${refund} Mastery erstattet.`].filter(Boolean).join(' ');
}

function migrateV12(s, data) {
  const aktMul = data.balance.skilltree.aktKostenMul?.[s.act ?? 1] ?? 1;
  let refund = 0;
  for (const [id, cost] of Object.entries(REMOVED_V12)) if (s.starmap?.[id]) { refund += Math.round(cost * aktMul); delete s.starmap[id]; }
  s.mastery = (s.mastery || 0) + refund;
  if (refund) s.migrationHinweis = [s.migrationHinweis, `Helden-Äste gekürzt (Fähigkeiten statt endloser Werte-Stufen): ${refund} Mastery erstattet.`].filter(Boolean).join(' ');
}

/** v13: Bonus-Einheit gilt nur noch für das Pack ihrer Stufe (Holz I/II, Silber I/II, Sternen, Kronen) – III bis V erstattet. */
const REMOVED_V13 = { p_bonuskarte_3: 210, p_bonuskarte_4: 305, p_bonuskarte_5: 442 };
function migrateV13(s, data) {
  const aktMul = data.balance.skilltree.aktKostenMul?.[s.act ?? 1] ?? 1;
  let refund = 0;
  for (const [id, cost] of Object.entries(REMOVED_V13)) if (s.starmap?.[id]) { refund += Math.round(cost * aktMul); delete s.starmap[id]; }
  s.mastery = (s.mastery || 0) + refund;
  if (refund) s.migrationHinweis = [s.migrationHinweis, `Bonus-Einheit gilt jetzt je Pack: ${refund} Mastery erstattet.`].filter(Boolean).join(' ');
}

function migrateV14(s, data) {
  const aktMul = data.balance.skilltree.aktKostenMul?.[s.act ?? 1] ?? 1;
  let refund = 0;
  for (const [id, cost] of Object.entries(REMOVED_V14)) if (s.starmap?.[id]) { refund += Math.round(cost * aktMul); delete s.starmap[id]; }
  s.mastery = (s.mastery || 0) + refund;
  if (refund) s.migrationHinweis = [s.migrationHinweis, `Skill-Tree neu: gleiche Upgrades gebündelt, Helden mit neuen Fähigkeiten und Quests – ${refund} Mastery erstattet.`].filter(Boolean).join(' ');
}

/**
 * v15: Jeder Akt beginnt wieder bei Kapitel 1 und hat ein Kapitel mehr (Akt 1: 1–3, Akt 2: 1–4, …).
 * Fortschritt je Akt: Siege über Kapitel des aktuellen Akts aus den bisherigen Bosssiegen übernehmen (nichts geht verloren).
 */
function migrateV15(s, data) {
  const list = data.actIndex[s.act ?? 1]?.kapitel ?? [];
  s.stats.aktBossKills ||= {};
  for (const id of list) if (s.stats.bossKills?.[id] > 0) s.stats.aktBossKills[id] = s.stats.bossKills[id];
  if ((s.act ?? 1) >= 2) s.migrationHinweis = [s.migrationHinweis, `Neue Akt-Struktur: Jeder Akt beginnt wieder bei Kapitel 1 und hat ein Kapitel mehr. Dein Akt ${s.act} umfasst die Kapitel 1–${list.length}.`].filter(Boolean).join(' ');
}

/**
 * v10: keine Mehrfachstufen mehr – mehrstufige Knoten sind jetzt Ketten aus Einzelknoten (Feld `alt` = frühere Stufen).
 * Ganz bezahlte Abschnitte werden übernommen, angefangene als Mastery bzw. Schimmer erstattet.
 */
function splitLevels(tree, store, data, aktMul) {
  const groups = {};
  for (const n of tree.knoten) if (n.alt) (groups[n.alt.id] ||= []).push(n);
  let refund = 0;
  for (const [altId, list] of Object.entries(groups)) {
    const L = store?.[altId] || 0;
    for (const n of list) {
      const { von, bis, basis, faktor } = n.alt;
      if (L >= bis) store[n.id] = 1;
      else {
        if (store) delete store[n.id];
        for (let l = von; l < Math.min(L, bis); l++) refund += Math.round(basis * Math.pow(faktor, l) * aktMul);
      }
    }
  }
  return refund;
}
function migrateV10(s, data) {
  s.starmap ||= {}; s.foiltree ||= {};
  const aktMul = data.balance.skilltree.aktKostenMul?.[s.act ?? 1] ?? 1;
  const mp = splitLevels(data.starmap, s.starmap, data, aktMul);
  const fs = splitLevels(data.foiltree, s.foiltree, data, 1);
  s.mastery = (s.mastery || 0) + mp;
  s.foilDust = (s.foilDust || 0) + fs;
  if (mp || fs) s.migrationHinweis = [s.migrationHinweis, `Keine Mehrfachstufen mehr: ${mp ? `${mp} Mastery` : ''}${mp && fs ? ' und ' : ''}${fs ? `${fs} Schimmer` : ''} für angefangene Abschnitte erstattet.`].filter(Boolean).join(' ');
}

/** v9: Turm und Cursor wie im Wiki – Turmleben und Cursor-Schaden sind jetzt je ein mehrstufiger Knoten. Entfernte Stufen werden erstattet. */
const REMOVED_V9 = { t_mauern2: [30, 1.45], t_leben: [60, 1.45], c_klinge2: [25, 1.45], c_schaden: [60, 1.45] };
function migrateV9(s, data) {
  const aktMul = data.balance.skilltree.aktKostenMul?.[s.act ?? 1] ?? 1;
  let refund = 0;
  for (const [id, [basis, f]] of Object.entries(REMOVED_V9)) {
    const lvl = s.starmap?.[id] || 0;
    for (let l = 0; l < lvl; l++) refund += Math.round(basis * Math.pow(f, l) * aktMul);
    if (s.starmap) delete s.starmap[id];
  }
  s.mastery = (s.mastery || 0) + refund;
  if (refund) s.migrationHinweis = [s.migrationHinweis, `Turm- und Cursor-Knoten zusammengelegt: ${refund} Mastery erstattet.`].filter(Boolean).join(' ');
}

/** v8: Foil-Baum nach dem Original – entfernte Knoten werden als Schimmer erstattet. */
const REMOVED_V8 = { f_jackpotrelikt: 8, f_glanzpack: 12, f_neubeginn: 8, f_glanzauge: 1, f_schimmerjagd: 2, f_starkerglanz: 6, f_gesucht: 6 };
function migrateV8(s) {
  let refund = 0;
  for (const [id, basis] of Object.entries(REMOVED_V8)) {
    const lvl = s.foiltree?.[id] || 0;
    for (let l = 0; l < lvl; l++) refund += Math.round(basis * Math.pow(1.6, l));
    if (s.foiltree) delete s.foiltree[id];
  }
  s.foilDust = (s.foilDust || 0) + refund;
  if (refund) s.migrationHinweis = [s.migrationHinweis, `Foil-Baum umgebaut: ${refund} Schimmer für entfernte Knoten erstattet.`].filter(Boolean).join(' ');
}

function migrateV6(s) {
  s.mastery = Math.round((s.mastery || 0) * 0.2) + 60;
  s.starmap = {};
  s.lastBought = null;
  s.questProgress = {};
  s.shop = { ...s.shop, offers: [], jackpot: null };
  s.version = 6;
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* privater Modus – Spiel läuft trotzdem */ }
}

export function resetSave(data) {
  try { localStorage.removeItem(KEY); } catch { /* ignorieren */ }
  return defaultSave(data);
}
