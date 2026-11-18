// Dauerhafter Spielstand (localStorage). Der laufende Run wird bewusst NICHT gespeichert.

const KEY = 'packdendungeon-save-v1';

export function defaultSave() {
  return {
    version: 3,
    masteryPoints: 0,
    splinters: 0,             // Sternensplitter (seltene Währung für Schlüsselknoten)
    lastBought: null,         // zuletzt gekaufter Sternenkarten-Knoten (Karte zentriert sich darauf)
    lastChapter: 1,
    mastery: {},              // Knoten-ID -> Stufe
    unlockedChapter: 1,       // höchstes freigeschaltetes Kapitel (bestimmt auch die Packs)
    collection: {},           // Karten-ID -> wie oft insgesamt gezogen
    highestStar: {},          // Karten-ID -> höchster erreichter Stern
    seenEnemies: {},          // Gegner-ID -> true (für Kapitelkarte und "Neuer Gegner"-Einblendung)
    stats: {
      runs: 0,
      bestWave: {},           // Kapitel-ID -> beste Welle
      bossKills: {},          // Kapitel-ID -> Anzahl
      totalKills: 0,
      packsOpened: 0,
      totalMasteryEarned: 0,
    },
    tutorial: {
      firstRunDone: false,    // Hinweise 1–4 nur im allerersten Run
      masteryHintShown: false,
      starmapHintShown: false,
    },
    settings: {
      musicVolume: 0.5,
      sfxVolume: 0.8,
      fastPackOpening: false,
      screenShake: true,
      damageNumbers: true,
      language: 'de',
    },
  };
}

/** Lädt den Spielstand und ergänzt fehlende Felder (für spätere Versionen). */
export function loadSave() {
  const base = defaultSave();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw) return base;
    return {
      ...base, ...raw,
      stats: { ...base.stats, ...raw.stats },
      tutorial: { ...base.tutorial, ...raw.tutorial },
      settings: { ...base.settings, ...raw.settings },
    };
  } catch {
    return base;
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* z. B. privater Modus – Spiel läuft trotzdem */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignorieren */ }
  return defaultSave();
}

/**
 * Überträgt ein Run-Ergebnis in den dauerhaften Spielstand.
 * Gibt { newRecord, unlockedChapter, unlockedPacks } zurück.
 */
export function applyRunResult(save, result, data) {
  const s = save.stats;
  const prevBest = s.bestWave[result.chapterId] || 0;
  s.runs++;
  s.totalKills += result.stats.kills;
  s.packsOpened += result.stats.packsOpened;
  s.totalMasteryEarned += result.points;
  s.bestWave[result.chapterId] = Math.max(prevBest, result.wave);
  save.masteryPoints += result.points;
  for (const [id, n] of Object.entries(result.drawCounts)) save.collection[id] = (save.collection[id] || 0) + n;
  for (const [id, st] of Object.entries(result.maxStars)) save.highestStar[id] = Math.max(save.highestStar[id] || 0, st);
  for (const id of result.seenEnemies) save.seenEnemies[id] = true;
  save.tutorial.firstRunDone = true;

  const M = data.balance.mastery;
  const out = { newRecord: result.wave > prevBest && prevBest > 0, unlockedChapter: null, unlockedPacks: [], splinters: 0 };
  // Sternensplitter: neue Rekordwelle in diesem Kapitel (1), erster Sieg gegen den Boss (3)
  if (result.wave > prevBest) out.splinters += M.splintersNewRecord;
  if (result.bossKilled && !s.bossKills[result.chapterId]) out.splinters += M.splintersFirstBoss;
  save.splinters = (save.splinters || 0) + out.splinters;
  if (result.bossKilled) {
    s.bossKills[result.chapterId] = (s.bossKills[result.chapterId] || 0) + 1;
    const next = Math.min(data.chapters.length, result.chapterId + 1);
    if (next > save.unlockedChapter) {
      save.unlockedChapter = next;
      out.unlockedChapter = next;
      out.unlockedPacks = data.packs.filter((p) => p.unlockChapter === next);
    }
  }
  return out;
}
