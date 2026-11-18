// Ordnet den Skill-Tree hochkant als „Schaltplan“ an (14.2.5) und setzt Symbole und Eckabzeichen.
//
// - Senkrechter Stamm in der Mitte, der Startknoten sitzt unten (über der Turm-Basis).
// - Die Wurzel jedes Astes liegt auf dem Stamm; der Ast wächst waagerecht nach links bzw. rechts,
//   seine Zweige liegen untereinander. Äste werden abwechselnd links/rechts gestapelt (jeweils auf
//   die niedrigere Seite), dadurch ist der Baum deutlich höher als breit.
// - Leitungen im Ast: waagerecht – senkrecht – waagerecht (`leitung: "hvh"`).
// - Symbol = WAS verbessert wird, `abzeichen` = WELCHER Wert (Uhr, Schwert, Herz, Plus, Pfeil, Blitz, Stern).
//
//   node tools/layout-starmap.mjs        (schreibt data/starmap.json)
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../data/starmap.json', import.meta.url);
const GX = 104; // Abstand der Ebenen (waagerecht)
const GY = 84;  // Abstand der Zeilen (senkrecht)
const map = JSON.parse(readFileSync(FILE, 'utf8'));
const relics = Object.fromEntries(JSON.parse(readFileSync(new URL('../data/relics.json', import.meta.url), 'utf8')).map((r) => [r.id, r]));
const idx = Object.fromEntries(map.knoten.map((n) => [n.id, n]));
const start = idx[map.start];

// Reihenfolge der Äste vom Start nach oben (frühe Äste nah am Start)
const ORDER = ['wirtschaft', 'cursor', 'packs', 'turm', 'akt', 'gebaeude', 'einheiten', 'tomes'];

// Spannbaum per Breitensuche
const children = {};
const seen = new Set([start.id]);
const queue = [start.id];
while (queue.length) {
  const id = queue.shift();
  children[id] = [];
  for (const v of idx[id].verbindungen) {
    if (seen.has(v)) continue;
    seen.add(v); children[id].push(v); queue.push(v);
  }
}
for (const id of Object.keys(idx)) children[id] ||= [];
// Akt-2-Knoten ans Ende, Quests zuerst (sie liegen dann nah am Stamm)
const rank = (id) => (idx[id].akt ?? 1) * 10 + (idx[id].typ === 'quest' ? 0 : 1);
for (const id of Object.keys(children)) children[id].sort((a, b) => rank(a) - rank(b));

const breadth = (id) => Math.max(1, children[id].reduce((s, c) => s + breadth(c), 0));
const pos = {}; // { lane (Zeile, von unten gezählt), depth, side }
function place(id, lane, depth, side) {
  const b = breadth(id);
  pos[id] = { lane: lane + (b - 1) / 2, depth, side };
  let l = lane;
  for (const ch of children[id]) { place(ch, l, depth + 1, side); l += breadth(ch); }
}

pos[start.id] = { lane: 0, depth: 0, side: 0 };
const height = { '-1': 1, 1: 1 }; // belegte Zeilen je Seite (Zeile 0 = Start)
const roots = children[start.id].sort((a, b) => ORDER.indexOf(idx[a].ast) - ORDER.indexOf(idx[b].ast));
for (const r of roots) {
  const side = height[-1] < height[1] ? -1 : 1;
  const b = breadth(r);
  // Wurzel auf dem Stamm, ihre Kinder ab Ebene 1 seitlich
  let l = height[side];
  pos[r] = { lane: l + (b - 1) / 2, depth: 0, side, trunk: true };
  for (const ch of children[r]) { place(ch, l, 1, side); l += breadth(ch); }
  height[side] += b + 1; // eine Leerzeile zwischen Ästen
}

const lanes = Object.values(pos).map((p) => p.lane);
const depths = Object.values(pos).map((p) => p.depth);
const maxLane = Math.max(...lanes), maxDepth = Math.max(...depths);
const margin = 2;
const W = Math.round((maxDepth * 2 + 2 * margin) * GX);
const H = Math.round((maxLane + 2 * margin + 2) * GY); // unten Platz für die Basis
const cx = W / 2;
for (const n of map.knoten) {
  const p = pos[n.id];
  n.position = { x: Math.round(cx + p.side * p.depth * GX), y: Math.round(H - (margin + 1.5) * GY - p.lane * GY) };
}
map.groesse = { breite: W, hoehe: H };
map.leitung = 'hvh';

const taken = new Map();
for (const n of map.knoten) {
  const k = `${n.position.x},${n.position.y}`;
  if (taken.has(k)) console.warn('Überlappung:', taken.get(k), n.id);
  taken.set(k, n.id);
}

// ---------------------------------------------------------------------------
// Symbole und Eckabzeichen
// ---------------------------------------------------------------------------
function badgeFor(n) {
  const e = n.effekt;
  const z = e.ziel;
  if (n.typ === 'quest' || n.typ === 'tor') return null;
  if (z === 'relikt') return 'star';
  if (z === 'tome') return e.art === 'dauer' ? 'clock' : 'bolt';
  if (z === 'rabattChance') return 'star';
  if (z === 'flag') return 'bolt';
  if (z === 'gebaeude') return n.id.endsWith('_aus') ? 'clock' : 'plus';
  if (z === 'einheit') {
    const pf = e.patches.map((p) => p.pfad).join(' ');
    if (/leben|killHeilung/.test(pf)) return 'heart';
    if (/schaden|zweitschuss/i.test(pf)) return 'sword';
    if (/tempo|entwicklung|intervall|dauer/i.test(pf)) return 'clock';
    if (/reichweite|radius|laenge|aufprall/i.test(pf)) return 'arrow';
    if (/anzahl|ziele|abpraller|chance/i.test(pf)) return 'plus';
    return 'bolt';
  }
  if (/Tick|Tempo|Dauer|Regen$/.test(z)) return z === 'turmRegen' ? 'heart' : 'clock';
  if (/Leben/.test(z)) return 'heart';
  if (/Schaden|Krit|Dornen|Schuetze|Widerstand/.test(z)) return 'sword';
  if (/Radius|Reichweite/.test(z)) return 'arrow';
  if (/foil|Foil|grenz|jackpot|mastery|Karte/.test(z)) return 'star';
  if (/Plaetze|kartenProPack|packImPack|Einkommen|muenzen|Rerolls|Doppelt|Zweimal/.test(z)) return 'plus';
  return 'bolt';
}

function symbolFor(n) {
  if (n.typ === 'start') return 'tower';
  if (n.typ === 'quest') return 'quest';
  if (n.typ === 'tor') return 'gate';
  const e = n.effekt;
  if (e.ziel === 'relikt') return relics[e.relikt]?.symbol ?? 'gem';
  if (e.ziel === 'tome') return `card:${e.tome}`;
  if (e.ziel === 'einheit' || n.voraussetzung?.karte) return `card:${e.karte ?? n.voraussetzung.karte}`;
  switch (n.ast) {
    case 'cursor': return e.ziel === 'cursorSchaden' || e.ziel === 'cursorKrit' ? 'claw' : 'hand';
    case 'wirtschaft': return 'coin';
    case 'packs': return 'pack';
    case 'gebaeude': return 'house';
    case 'einheiten': return 'sword';
    case 'turm': return e.ziel === 'turmLebenMul' ? 'bigheart' : 'tower';
    case 'tomes': return 'book';
    case 'akt': return 'gate';
    default: return n.symbol ?? 'rune';
  }
}

for (const n of map.knoten) {
  n.symbol = symbolFor(n);
  const badge = n.typ !== 'start' && badgeFor(n);
  if (badge) n.abzeichen = badge; else delete n.abzeichen;
}
map.$kommentar = 'Skill-Tree als Schaltplan (11, 14.2.5), hochkant: Stamm in der Mitte, Äste links/rechts. Knotentypen: start, klein/gross/schluessel (Upgrade), freischalt, relikt, quest (aufgabe + belohnung, kostenlos), tor (Akt-Wechsel). Positionen, Symbole und Abzeichen erzeugt tools/layout-starmap.mjs.';
writeFileSync(FILE, JSON.stringify(map, null, 2) + '\n');
console.log(`Layout: ${map.knoten.length} Knoten, ${map.groesse.breite}×${map.groesse.hoehe} px (hochkant)`);
