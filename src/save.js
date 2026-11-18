// Dauerhafter Spielstand (localStorage). Laufende Runs werden nicht gespeichert.

const KEY = 'packdendungeon-save-v3';

export function defaultSave(data) {
  return {
    version: 6,
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
      muenzenAusgegeben: 0, bossKills: {}, bosseBesiegt: {}, besteZeit: {}, prestige: {}, prestigeGeschafft: 0,
      foilBossBesiegt: 0, torGeoeffnet: 0, foilStaubGesamt: 0, gesuchtSiege: {},
    },
    tutorial: { packHint: false, unitHint: false, tomeHint: false, starmapHint: false, firstRunDone: false },
    settings: {
      musicVolume: 0.5, sfxVolume: 0.8, screenShake: true, damageNumbers: true, fastPackOpening: false,
      skipAnimations: false, effectAlpha: 0.6, language: 'de',
    },
  };
}

function merge(base, raw) {
  const out = { ...base, ...raw };
  for (const k of ['stats', 'tutorial', 'settings', 'relics', 'shop', 'selection', 'ui', 'foiltree', 'questProgress']) out[k] = { ...base[k], ...(raw[k] || {}) };
  return out;
}

export function loadSave(data) {
  const base = defaultSave(data);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw) return base;
    const s = merge(base, raw);
    // Alter Shop (vor 14.2): Run-Tasche erstatten, Angebote neu würfeln
    if (s.shop.offers.some((o) => !o.kind) || s.shop.bag) {
      for (const b of s.shop.bag || []) s.coins += Math.round(b.preis || 0);
      s.shop = { ...base.shop, seen: s.shop.seen || [] };
    }
    if ((raw.version || 0) < 5) migrateV5(s, raw, data);
    if ((raw.version || 0) < 6) migrateV6(s);
    return s;
  } catch {
    return base;
  }
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
