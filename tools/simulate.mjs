#!/usr/bin/env node
// Balancing-Simulation: ein einfacher Bot spielt viele Runs hintereinander,
// kauft Packs, sobald er kann, und investiert Mastery-Punkte.
//
// Aufruf:  node tools/simulate.mjs [anzahlRuns=15] [seed=1] [--verbose] [--first] [--chapter=N]
//   --first      jeder Run ist ein "erster Run" ohne Mastery (misst die Einstiegs-Schwierigkeit)
//   --chapter=N  alle Runs in Kapitel N (mit allen Packs bis N freigeschaltet)
// Ausgabe: erreichte Welle pro Run, Sieg/Niederlage, Dauer, Mastery-Punkte.
import { loadData } from './load-data.mjs';
import { Run } from '../src/core/run.js';
import { computeModifiers, nodeCost, purchaseBlocker, buyNode } from '../src/core/starmap.js';
import { mulberry32 } from '../src/core/util.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const verbose = process.argv.includes('--verbose');
const firstOnly = process.argv.includes('--first');
const fixedChapter = Number((process.argv.find((a) => a.startsWith('--chapter=')) || '').split('=')[1]) || null;
const runs = Number(args[0] ?? 15);
const seed = Number(args[1] ?? 1);

const data = loadData();
const rng = mulberry32(seed);
const save = { masteryPoints: 0, splinters: 0, mastery: {}, collection: {}, unlockedChapter: 1, bestWave: {}, bossKills: {} };

/** Bot-Strategie für die Sternenkarte: immer den günstigsten kaufbaren Knoten (Runenkreis-Knoten ausgenommen – der Bot hat keinen Cursor). */
function spendMastery() {
  for (;;) {
    const options = data.starmap.knoten
      .filter((n) => n.ast !== 'runen' && !purchaseBlocker(n, save, data))
      .sort((a, b) => nodeCost(a, save.mastery[a.id] || 0).mp - nodeCost(b, save.mastery[b.id] || 0).mp);
    if (!options.length) return;
    buyNode(options[0], save, data);
  }
}

/** Bot-Strategie im Run: teuerstes leistbares Pack kaufen, sobald genug Gold da ist. */
function botBuy(run) {
  const packs = [...run.availablePacks].sort((a, b) => b.basePrice - a.basePrice);
  for (const p of packs) {
    if (run.canBuy(p.id)) { run.buyPack(p.id); return; }
  }
}

console.log(`Simulation: ${runs} Runs, Seed ${seed}`);
console.log('Run | Kap | Welle | Ergebnis | Dauer  | Punkte | Packs | Team');
for (let i = 1; i <= runs; i++) {
  if (firstOnly) { save.mastery = {}; save.masteryPoints = 0; }
  if (fixedChapter) save.unlockedChapter = Math.max(save.unlockedChapter, fixedChapter);
  const chapterId = fixedChapter ?? save.unlockedChapter;
  const mods = computeModifiers(data.starmap, save.mastery);
  const run = new Run({ data, chapterId, mods, unlockedChapter: save.unlockedChapter, rng, headless: true, settings: { damageNumbers: false } });
  let t = 0;
  while (!run.over && t < 60 * 30) {
    botBuy(run);
    // Der Bot hält den Runenkreis auf den vordersten Gegner (wie ein aufmerksamer Spieler)
    const front = run.enemies.filter((e) => !e.dead).sort((a, b) => a.x - b.x)[0];
    if (front) run.setCursor(front.x, front.y, true); else run.setCursor(0, 0, false);
    run.update(0.25);
    t += 0.25;
  }
  if (!run.over) run.finish(false);
  const r = run.result;
  save.masteryPoints += r.points;
  for (const [id, n] of Object.entries(r.drawCounts)) save.collection[id] = (save.collection[id] || 0) + n;
  // Sternensplitter: erster Bosssieg (3), neue Rekordwelle (1)
  if (!firstOnly) {
    if (r.wave > (save.bestWave[chapterId] || 0)) { if (save.bestWave[chapterId]) save.splinters += data.balance.mastery.splintersNewRecord; save.bestWave[chapterId] = r.wave; }
    if (r.bossKilled && !save.bossKills[chapterId]) { save.splinters += data.balance.mastery.splintersFirstBoss; save.bossKills[chapterId] = 1; }
  }
  if (r.victory && !firstOnly) save.unlockedChapter = Math.min(data.chapters.length, Math.max(save.unlockedChapter, chapterId + 1));
  const team = r.heroes.map((h) => `${data.heroIndex[h.id].short}${h.stars}`).join(' ');
  const mm = `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`;
  console.log(`${String(i).padStart(3)} | ${chapterId}   | ${String(r.wave).padStart(5)} | ${r.victory ? 'SIEG    ' : 'verloren'} | ${mm.padStart(6)} | ${String(r.points).padStart(6)} | ${String(r.stats.packsOpened).padStart(5)} | ${team}`);
  if (verbose) console.log('     Schaden:', r.heroes.map((h) => `${h.id}:${h.damage}`).join(', '));
  if (!firstOnly) spendMastery();
}
console.log('Sternenkarte am Ende:', Object.entries(save.mastery).map(([k, v]) => `${k}:${v}`).join(' '), '| Splitter:', save.splinters);
