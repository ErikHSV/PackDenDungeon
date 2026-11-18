// Dauerhafter Spielstand (localStorage). Laufende Runs werden nicht gespeichert.

const KEY = 'packdendungeon-save-v3';

export function defaultSave(data) {
  return {
    version: 4,
    coins: data?.balance.wirtschaft.startMuenzen ?? 30,
    mastery: 0,
    crystals: 0,
    foilDust: 0,
    day: 1,
    act: 1,
    starmap: {},
    lastBought: null,
    collection: {},     // Karten-ID -> { normal, foil }
    bestiary: {},       // Gegner-ID -> { normal, foil } (Kills)
    relics: { owned: [], equipped: [], extraSlots: 0, destroyed: [], newCount: 0 },
    quests: { claimed: [] },
    questBonus: { tagesEinkommen: 0 },
    achievements: {},   // Erfolg-ID -> Tag der Freischaltung
    shop: { offers: [], bag: [], rerolls: 0 },
    selection: { chapter: 1, prestige: 0, gesucht: false, modifier: null },
    stats: {
      runs: 0, kills: 0, killsGegner: {}, zeitGesamt: 0, laengsterRun: 0, tomesGenutzt: 0, entwicklungen: 0,
      foilsGezogen: 0, foilMonsterBesiegt: 0, grenzgaengerGezogen: 0, packsGeoeffnet: {}, packsGesamt: 0,
      muenzenAusgegeben: 0, bossKills: {}, bosseBesiegt: {}, besteZeit: {}, prestige: {}, prestigeGeschafft: 0,
      foilBossBesiegt: 0, torGeoeffnet: 0,
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
  for (const k of ['stats', 'tutorial', 'settings', 'relics', 'shop', 'quests', 'questBonus', 'selection']) out[k] = { ...base[k], ...(raw[k] || {}) };
  return out;
}

export function loadSave(data) {
  const base = defaultSave(data);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return raw ? merge(base, raw) : base;
  } catch {
    return base;
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* privater Modus – Spiel läuft trotzdem */ }
}

export function resetSave(data) {
  try { localStorage.removeItem(KEY); } catch { /* ignorieren */ }
  return defaultSave(data);
}
