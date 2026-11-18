// Kleine Hilfsfunktionen ohne DOM-Abhängigkeit (auch in Node nutzbar).

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const deepClone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

/**
 * Wendet einen Daten-Patch an, z. B. { path: "abilities.block.count", op: "add", value: 2 }.
 * Fehlende Zwischenobjekte werden angelegt. Zahlen in Pfaden adressieren Array-Indizes.
 */
export function applyPatch(obj, { path, op = 'set', value }) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  const k = keys[keys.length - 1];
  if (op === 'add') cur[k] = (cur[k] ?? 0) + value;
  else if (op === 'mul') cur[k] = (cur[k] ?? 1) * value;
  else cur[k] = deepClone(value);
}

export function applyPatches(obj, patches = []) {
  for (const p of patches) applyPatch(obj, p);
  return obj;
}

export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

/** Gewichtete Zufallsauswahl. entries: [[item, gewicht], ...] */
export function weightedPick(entries, rng) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [item, w] of entries) {
    if ((r -= w) < 0) return item;
  }
  return entries[entries.length - 1][0];
}

/** Deterministischer Zufallsgenerator (für Simulationen/Tests). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const formatNumber = (n) => {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' Mio.';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace('.', ',') + 'k';
  return String(n);
};
