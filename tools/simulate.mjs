// Fortschritts-Simulation ohne Browser: ein Bot spielt viele Tage hintereinander.
// Pro Tag: Shop (teuerste bezahlbare Angebote, Reroll wenn billig) → Run (Runenkreis zuerst auf Packs, dann auf
// Gegner nahe am Turm, Boss-Hämmer parieren) → Belohnungen → erfüllte Quest-Knoten abholen → Skill-Tree und
// Foil-Baum kaufen (günstigster Knoten zuerst) → Tor öffnen, sobald möglich → nächstes Kapitel.
//
//   node tools/simulate.mjs [tage=40] [seed=1] [--verbose]
import { loadData } from './load-data.mjs';
import { Run } from '../src/core/run.js';
import {
  bagItems, consumeBag, walletTotal, canReroll, reroll, rerollCost, computeMods, rollOffers, describeOffer, buyOffer, applyRunResult,
  buyNode, nodeBlocker, nodeCost, nodeVisible, treeLevel, chapterUnlocked, claimQuestNode, changeAct, questProgress, levelOf,
} from '../src/core/meta.js';
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

let day = 0;
function botRun(chapterId, mods, bag) {
  const run = new Run({ data, save, chapterId, mods, bag, rng, headless: true, sessionMinutes: 10, events: () => {} });
  const cur = { x: run.tower.x, y: run.tower.y };
  const dt = 1 / 30;
  let target = null, think = 0;
  while (!run.over && run.time < 900) {
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
    if (process.env.TRACE && day >= Number(process.env.TRACE) && Math.floor(run.time / 10) !== Math.floor((run.time - dt) / 10)) console.log(`   t=${run.time.toFixed(0)} Turm ${Math.round(run.tower.hp)}/${run.tower.maxHp} Gegner ${run.enemies.filter((e) => !e.dead).length} amTurm ${run.enemies.filter((e) => !e.dead && Math.hypot(e.x - run.tower.x, e.y - run.tower.y) < 90).length} Helden ${run.units.filter((u) => !u.dead).length} Kills ${run.stats.kills} Packs offen ${run.packs.filter((x) => x.landed && !x.opened).length} | Helden: ${run.units.filter((u) => !u.dead).map((u) => `${u.id.slice(0, 5)}→${u.lock && !u.lock.dead ? u.lock.id.slice(0, 5) + '@' + Math.round(Math.hypot(u.lock.x - u.x, u.lock.y - u.y)) : '-'}`).join(' ')}`);
    if (process.env.BOSSLOG && run.boss && !run.boss.dead && Math.floor(run.time * 2) !== Math.floor((run.time - dt) * 2)) console.log('   boss', run.time.toFixed(1), Math.round(run.boss.hp), '/', Math.round(run.boss.maxHp), 'helden', run.units.length, 'gegner', run.enemies.length);
  }
  return run;
}

function shop() {
  const mods = computeMods(data, save);
  for (let round = 0; round < 6; round++) {
    for (let guard = 0; guard < 20; guard++) {
      const opts = save.shop.offers.map((s, i) => ({ i, o: describeOffer(s, data, save) })).filter((x) => x.o && !x.o.sold && x.o.preis <= walletTotal(save));
      if (!opts.length) break;
      opts.sort((a, b) => b.o.preis - a.o.preis);
      buyOffer(opts[0].i, data, save, rng);
    }
    if (!canReroll(mods) || rerollCost(data, save, mods) > walletTotal(save) / 3) break;
    reroll(data, save, mods, rng);
  }
}

function spendTrees() {
  for (const n of data.starmap.knoten) if (n.typ === 'quest' && levelOf(save, n.id) === 0 && nodeVisible('skill', n, save, data) && questProgress(n, data, save).done) claimQuestNode(n, data, save, rng);
  for (const kind of ['skill', 'foil']) {
    const list = kind === 'skill' ? data.starmap.knoten : data.foiltree.knoten;
    for (let guard = 0; guard < 500; guard++) {
      const cand = list.filter((n) => n.typ !== 'quest' && n.typ !== 'tor' && nodeVisible(kind, n, save, data) && !nodeBlocker(kind, n, save, data));
      if (!cand.length) break;
      cand.sort((a, b) => nodeCost(kind, a, treeLevel(kind, save, a.id), data, save).amount - nodeCost(kind, b, treeLevel(kind, save, b.id), data, save).amount);
      buyNode(kind, cand[0], save, data);
    }
  }
  const tor = data.starmap.knoten.find((n) => n.typ === 'tor' && nodeVisible('skill', n, save, data));
  if (tor) { changeAct(tor, data, save); spendTrees(); }
}

function pickChapter() {
  const list = data.chapters.filter((c) => c.art === 'kapitel' && chapterUnlocked(c, save, data));
  return (list.find((c) => !save.stats.bossKills[c.id]) ?? list[list.length - 1]).id;
}

console.log(`Simulation: ${DAYS} Tage, Seed ${SEED}`);
console.log('Tag Kap  Zeit   Sieg Kills Münzen   MP  Staub Packs Einh. Knoten Eink.');
rollOffers(data, save, computeMods(data, save), rng);
const firstWin = {};
let minutes = 0, firstDust = null;
const dustBy = {};
const HUB_MINUTES = 0.75; // geschätzte Zeit im Hub pro Tag (Shop, Baum)
for (day = 1; day <= DAYS; day++) {
  const coinsBefore = walletTotal(save);
  shop();
  const bag = bagItems(data, save);
  consumeBag(save);
  // Jeder 4. Tag: Gesucht (Shiny-Boss) eines bereits geschafften Kapitels – Hauptquelle für Schimmer wie im Original.
  // Gewählt wird das früheste Kapitel, dessen Shiny-Boss noch nie besiegt wurde, und nur, wenn das nächste Kapitel schon geschafft ist.
  let ch = pickChapter();
  let gesucht = false;
  if (day % 4 === 0 && save.act >= 2) {
    const done = data.chapters.filter((c) => c.art === 'kapitel' && save.stats.bossKills[c.id] > 0).map((c) => c.id);
    const cand = done.find((id) => !(save.stats.gesuchtSiege?.[data.chapterIndex[id].boss] > 0) && done.includes(id + 1)) ?? (done.length >= 3 ? done[0] : null);
    if (cand) { ch = cand; gesucht = true; }
  }
  const mods = computeMods(data, save, { gesucht });
  const run = botRun(ch, mods, bag);
  const r = run.result;
  const info = applyRunResult(r, data, save, mods, rng);
  if (r.sieg && !firstWin[ch]) firstWin[ch] = `Tag ${day}, ~${Math.round(minutes + r.zeit / 60 + HUB_MINUTES)} min`;
  minutes += r.zeit / 60 + HUB_MINUTES;
  for (const t of info.schimmerTeile) dustBy[t.quelle] = (dustBy[t.quelle] || 0) + t.n;
  if (firstDust == null && save.stats.foilStaubGesamt > 0) firstDust = { day, min: Math.round(minutes), quellen: info.schimmerTeile.map((t) => t.quelle).join('+') };
  spendTrees();
  const nodes = Object.values(save.starmap).reduce((a, b) => a + b, 0);
  console.log(`${String(day).padStart(3)} ${(gesucht ? 'G' : '') + String(ch).padStart(gesucht ? 2 : 3)} ${r.zeit.toFixed(0).padStart(5)}s ${r.sieg ? ' ja ' : ' -  '} ${String(r.kills).padStart(5)} ${String(coinsBefore).padStart(6)} ${String(info.mastery).padStart(5)} ${String(info.foilStaub).padStart(5)} ${String(bag.length).padStart(5)} ${String(run.units.length).padStart(5)} ${String(nodes).padStart(6)} ${String(info.einkommen).padStart(5)}`);
  if (VERBOSE) console.log('   ', JSON.stringify(save.starmap), JSON.stringify(save.foiltree));
  if (process.env.TURMLOG) console.log('    Turmschaden', JSON.stringify(Object.fromEntries(Object.entries(run.stats.turmSchaden || {}).map(([k, v]) => [k, Math.round(v)]))), 'Helden lebend', run.units.filter((u) => !u.dead).length);
}
console.log(`Schimmer: erster an Tag ${firstDust?.day ?? '–'} (~${firstDust?.min ?? '–'} min, ${firstDust?.quellen ?? ''}), insgesamt ${save.stats.foilStaubGesamt} nach ${Math.round(minutes)} min`, JSON.stringify(dustBy));
console.log('Erste Siege (Kapitel → Tag):', JSON.stringify(firstWin), '· Akt', save.act, '· Foil-Baum', JSON.stringify(save.foiltree));
