// Ordnet die Sternenkarte als „Schaltplan“ an (14.2.5) und setzt Symbole und Eckabzeichen.
//
// - Waagerechte Hauptlinie durch den Startknoten. Die Wurzel jedes Astes sitzt als Verteiler auf der Linie.
// - Vier Äste wachsen nach oben, vier nach unten (aufgeräumter Baum, Raster `G` px).
// - Symbol = WAS verbessert wird, `abzeichen` = WELCHER Wert (Uhr, Schwert, Herz, Plus, Pfeil, Blitz, Stern).
//
//   node tools/layout-starmap.mjs        (schreibt data/starmap.json)
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../data/starmap.json', import.meta.url);
const G = 96; // Rasterabstand
const map = JSON.parse(readFileSync(FILE, 'utf8'));
const relics = Object.fromEntries(JSON.parse(readFileSync(new URL('../data/relics.json', import.meta.url), 'utf8')).map((r) => [r.id, r]));
const idx = Object.fromEntries(map.knoten.map((n) => [n.id, n]));
const start = idx[map.start];

const UP = ['cursor', 'wirtschaft', 'packs', 'gebaeude'];
const DOWN = ['einheiten', 'turm', 'tomes', 'akt'];

// Spannbaum per Breitensuche (Reihenfolge der Verbindungen bleibt erhalten)
const parent = {}, children = {};
const seen = new Set([start.id]);
const queue = [start.id];
while (queue.length) {
  const id = queue.shift();
  children[id] = [];
  for (const v of idx[id].verbindungen) {
    if (seen.has(v)) continue;
    seen.add(v); parent[v] = id; children[id].push(v); queue.push(v);
  }
}
for (const id of Object.keys(idx)) children[id] ||= [];
// Akt-2-Knoten ans Ende, Einheiten-Blöcke nach Karte sortiert (bleiben zusammen)
for (const id of Object.keys(children)) children[id].sort((a, b) => (idx[a].akt ?? 1) - (idx[b].akt ?? 1));

const width = (id) => Math.max(1, children[id].reduce((s, c) => s + width(c), 0));
const pos = {};
function place(id, col, depth, dir) {
  const w = width(id);
  pos[id] = { col: col + (w - 1) / 2, row: depth * dir };
  let c = col;
  for (const ch of children[id]) { place(ch, c, depth + 1, dir); c += width(ch); }
}

function side(branches, dir) {
  const roots = children[start.id].filter((id) => branches.includes(idx[id].ast)).sort((a, b) => branches.indexOf(idx[a].ast) - branches.indexOf(idx[b].ast));
  const total = roots.reduce((s, r) => s + width(r), 0) + roots.length - 1; // eine Spalte Abstand zwischen Ästen
  let col = -total / 2;
  for (const r of roots) {
    // Wurzel als Verteiler auf der Hauptlinie (Zeile ±1), Kinder ab Zeile ±2
    const w = width(r);
    pos[r] = { col: col + (w - 1) / 2, row: dir };
    let c = col;
    for (const ch of children[r]) { place(ch, c, 2, dir); c += width(ch); }
    col += w + 1;
  }
}
pos[start.id] = { col: 0, row: 0 };
side(UP, -1);
side(DOWN, 1);

const cols = Object.values(pos).map((p) => p.col), rows = Object.values(pos).map((p) => p.row);
const minC = Math.min(...cols), maxC = Math.max(...cols), minR = Math.min(...rows), maxR = Math.max(...rows);
const margin = 3;
for (const n of map.knoten) {
  const p = pos[n.id];
  n.position = { x: Math.round((p.col - minC + margin) * G / 2) * 2, y: Math.round((p.row - minR + margin) * G) };
}
map.groesse = { breite: Math.round((maxC - minC + 2 * margin) * G), hoehe: Math.round((maxR - minR + 2 * margin) * G) };

// Verbindungen auf der Hauptlinie: Startknoten ↔ Verteiler werden über die Linie gezogen (Renderer)
// Doppelt belegte Rasterplätze melden
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
    if (/leben/.test(pf)) return 'heart';
    if (/schaden/i.test(pf)) return 'sword';
    if (/tempo|entwicklung|intervall|dauer/i.test(pf)) return 'clock';
    if (/reichweite|radius|laenge/i.test(pf)) return 'arrow';
    if (/anzahl|ziele|abpraller/i.test(pf)) return 'plus';
    return 'bolt';
  }
  if (/Tick|Tempo|Dauer|Regen$/.test(z)) return z === 'turmRegen' ? 'heart' : 'clock';
  if (/Leben/.test(z)) return 'heart';
  if (/Schaden|Krit|Dornen|Schuetze|Widerstand/.test(z)) return 'sword';
  if (/Radius|Reichweite/.test(z)) return 'arrow';
  if (/foil|Foil|grenz|jackpot|mastery/.test(z)) return 'star';
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
map.$kommentar = 'Skill-Tree als Schaltplan (11, 14.2.5). Knotentypen: start, klein/gross/schluessel (Upgrade), freischalt, relikt, quest (aufgabe + belohnung, kostenlos), tor (Akt-Wechsel). Positionen und Symbole erzeugt tools/layout-starmap.mjs – danach von Hand anpassbar. abzeichen: clock|sword|heart|plus|arrow|bolt|star.';
writeFileSync(FILE, JSON.stringify(map, null, 2) + '\n');
console.log(`Layout: ${map.knoten.length} Knoten, ${map.groesse.breite}×${map.groesse.hoehe} px, Raster ${G}`);
