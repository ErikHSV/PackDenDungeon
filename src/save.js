// Dauerhafter Spielstand (localStorage). Der laufende Run wird bewusst NICHT gespeichert.

const KEY = 'packdendungeon-save-v1';

export function defaultSave() {
  return {
    version: 1,
    masteryPoints: 0,
    mastery: {},              // Knoten-ID -> Stufe
    unlockedChapter: 1,       // höchstes freigeschaltetes Kapitel (bestimmt auch die Packs)
    collection: {},           // Karten-ID -> wie oft insgesamt gezogen
    stats: {
      runs: 0,
      bestWave: {},           // Kapitel-ID -> beste Welle
      bossKills: {},          // Kapitel-ID -> Anzahl
      totalKills: 0,
      packsOpened: 0,
      totalMasteryEarned: 0,
    },
    settings: {
      sound: true,
      autoSpells: true,
      damageNumbers: true,
      fastPackOpening: false,
      debug: false,
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

/** Überträgt ein Run-Ergebnis in den dauerhaften Spielstand. Gibt true zurück, wenn ein Kapitel neu freigeschaltet wurde. */
export function applyRunResult(save, result, chapterCount) {
  const s = save.stats;
  s.runs++;
  s.totalKills += result.stats.kills;
  s.packsOpened += result.stats.packsOpened;
  s.totalMasteryEarned += result.points;
  s.bestWave[result.chapterId] = Math.max(s.bestWave[result.chapterId] || 0, result.wave);
  save.masteryPoints += result.points;
  for (const [id, n] of Object.entries(result.drawCounts)) save.collection[id] = (save.collection[id] || 0) + n;
  let unlocked = false;
  if (result.bossKilled) {
    s.bossKills[result.chapterId] = (s.bossKills[result.chapterId] || 0) + 1;
    const next = Math.min(chapterCount, result.chapterId + 1);
    if (next > save.unlockedChapter) { save.unlockedChapter = next; unlocked = true; }
  }
  return unlocked;
}
