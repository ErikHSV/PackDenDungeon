// Fortschritts-Simulation ohne Browser: ein Bot spielt viele Tage hintereinander.
// Pro Tag: Packs kaufen → Run (Runenkreis zuerst auf Packs, dann auf Gegner nahe am Turm, Boss-Hämmer parieren)
// → Belohnungen → Sternenkarte kaufen (günstigster Knoten zuerst) → ggf. nächstes Kapitel.
//
//   node tools/simulate.mjs [tage=40] [seed=1] [--verbose]
import { loadData } from './load-data.mjs';
import { Run } from '../src/core/run.js';
import { bagCapacity, computeMods, rollOffers, describeOffer, buyOffer, applyRunResult, buyNode, nodeBlocker, nodeCost, levelOf, chapterUnlocked, gateState, openGate, claimQuest, questDone } from '../src/core/meta.js';
import { defaultSave } from '../src/save.js';
import { mulberry32 } from '../src/core/util.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DAYS = Number(args[0] ?? 40);
const SEED = Number(args[1] ?? 1);
const VERBOSE = process.argv.includes('--verbose');
// Bot-Fähigkeiten (menschenähnlich): Cursor-Tempo, Reaktionszeit beim Zielwechsel
const CURSOR_SPEED = Number(process.env.BOT_SPEED ?? 900); // px/s
const REACTION = Number(process.env.BOT_REACTION ?? 0.35);  // s zwischen Zielentscheidungen

const data = loadData();
const rng = mulberry32(SEED);
const save = defaultSave(data);

function botRun(chapterId, mods, bag) {
  const run = new Run({ data, save, chapterId, mods, bag, rng, headless: true, sessionMinutes: 10, events: () => {} });
  const cur = { x: run.tower.x, y: run.tower.y };
  const dt = 1 / 30;
  let target = null, think = 0;
  while (!run.over && run.time < 900) {
    // Boss-Hämmer haben Vorrang: anklicken = parieren
    for (const h of run.hammers) if (!h.parried && h.parryable) run.click(h.x, h.y);
    const p = run.packs.find((x) => x.landed && !x.opened);
    const alive = run.enemies.filter((e) => !e.dead);
    const near = alive.sort((a, b) => Math.hypot(a.x - run.tower.x, a.y - run.tower.y) - Math.hypot(b.x - run.tower.x, b.y - run.tower.y))[0];
    think -= dt;
    if (think <= 0) {
      think = REACTION;
      target = p && (!near || Math.hypot(near.x - run.tower.x, near.y - run.tower.y) > 250) ? { x: p.x, y: p.y - 30 } : (near ?? (p && { x: p.x, y: p.y - 30 }));
    } else if (target?.kind === 'enemy' && target.dead) target = null;
    if (target) {
      const dx = target.x - cur.x, dy = target.y - cur.y, d = Math.hypot(dx, dy), step = CURSOR_SPEED * dt;
      if (d > step) { cur.x += (dx / d) * step; cur.y += (dy / d) * step; } else { cur.x = target.x; cur.y = target.y; }
    }
    run.setCursor(cur.x, cur.y, true);
    for (const tm of [...run.tomes]) run.useTome(tm);
    run.update(dt);
  }
  return run;
}

function shop() {
  // Bevorzugt das beste bezahlbare Angebot (teuerstes), solange Geld da ist
  // Bevorzugt das beste bezahlbare Angebot (teuerstes), bis Geld oder Tasche erschöpft sind
  const cap = bagCapacity(data, computeMods(data, save));
  for (let guard = 0; guard < 60; guard++) {
    const opts = save.shop.offers.map((s, i) => ({ i, o: describeOffer(s, data, save) })).filter((x) => x.o && !x.o.sold && x.o.preis <= save.coins);
    if (!opts.length) break;
    opts.sort((a, b) => b.o.preis - a.o.preis);
    let ok = false;
    for (const x of opts) { const r = buyOffer(x.i, data, save, rng, cap); if (r && !r.full) { ok = true; break; } }
    if (!ok) break;
  }
}

function spendStarmap() {
  for (let guard = 0; guard < 500; guard++) {
    const cand = data.starmap.knoten.filter((n) => !nodeBlocker(n, save, data));
    if (!cand.length) break;
    cand.sort((a, b) => nodeCost(a, levelOf(save, a.id)).amount - nodeCost(b, levelOf(save, b.id)).amount);
    buyNode(cand[0], save, data);
  }
}

function pickChapter() {
  // Höchstes freigeschaltetes reguläres Kapitel, dessen Boss noch nicht besiegt ist – sonst das höchste
  const list = data.chapters.filter((c) => c.art === 'kapitel' && chapterUnlocked(c, save, data));
  return (list.find((c) => !save.stats.bossKills[c.id]) ?? list[list.length - 1]).id;
}

console.log(`Simulation: ${DAYS} Tage, Seed ${SEED}`);
console.log('Tag Kap  Zeit   Sieg Kills Münzen  MP   Kris Packs Einh. Knoten');
rollOffers(data, save, computeMods(data, save), rng);
const firstWin = {};
for (let day = 1; day <= DAYS; day++) {
  shop();
  const bag = save.shop.bag.map((b) => b.artikel);
  save.shop.bag = [];
  const ch = pickChapter();
  const mods = computeMods(data, save, {});
  const run = botRun(ch, mods, bag);
  const r = run.result;
  const info = applyRunResult(r, data, save, mods, rng);
  if (r.sieg && !firstWin[ch]) firstWin[ch] = day;
  for (const q of data.quests) if (!save.quests.claimed.includes(q.id) && questDone(q, data, save)) claimQuest(q, data, save, rng);
  if (gateState(data, save).complete && save.act < 2) openGate(data, save);
  spendStarmap();
  const nodes = Object.values(save.starmap).reduce((a, b) => a + b, 0);
  console.log(`${String(day).padStart(3)} ${String(ch).padStart(3)} ${r.zeit.toFixed(0).padStart(5)}s ${r.sieg ? ' ja ' : ' -  '} ${String(r.kills).padStart(5)} ${String(info.muenzen + info.einkommen).padStart(6)} ${String(info.mastery).padStart(4)} ${String(info.kristalle).padStart(5)} ${String(bag.length).padStart(5)} ${String(run.units.length).padStart(5)} ${String(nodes).padStart(6)}`);
  if (VERBOSE) console.log('   ', JSON.stringify(save.starmap));
}
console.log('Erste Siege (Kapitel → Tag):', JSON.stringify(firstWin), '· Akt', save.act);
