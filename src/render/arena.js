// Arena-Boden je Kapitel: ovale Kampffläche in Draufsicht mit leichter Neigung, Umgebung und Portale.
// Gezeichnet in 480×270 und ganzzahlig ×4 skaliert (→ 1920×1080).
import { Pix, shade, hash, upscale } from './pixel.js';

const W = 480, H = 270, K = 4;
const cache = new Map();

/** Umgebungsdeko außerhalb der Arena je Kapitel-Thema (Farbe des Bodens bestimmt das Thema). */
function decor(p, theme, x, y, i) {
  switch (theme) {
    case 'moor':
      if (i % 3 === 0) { p.rect(x, y + 6, 2, 6, '#3a2a1a'); p.ellipse(x + 1, y + 3, 6, 5, '#2f4a2c'); p.ellipse(x - 1, y + 1, 4, 3, '#3a5a34'); }
      else if (i % 3 === 1) { p.ellipse(x, y + 8, 6, 2, '#2a3a3a'); p.px(x - 2, y + 7, '#5a7a8a'); }
      else { p.px(x, y, '#6f8a4f'); p.px(x + 1, y - 1, '#6f8a4f'); p.px(x + 2, y, '#5f7a44'); }
      break;
    case 'gruft':
      if (i % 2 === 0) { p.rect(x - 3, y, 6, 8, '#5a6272'); p.ellipse(x, y, 3, 2, '#5a6272'); p.rect(x - 1, y + 2, 2, 3, '#3e4452'); }
      else { p.rect(x - 1, y + 2, 2, 6, '#e8e0c8'); p.px(x, y + 1, '#ffd24a'); }
      break;
    case 'schmiede':
      if (i % 2 === 0) { p.tri(x - 6, y + 10, x + 6, y + 10, x, y - 4, '#2a1814'); }
      else { p.rect(x - 6, y + 4, 12, 2, '#ff7a2a'); p.rect(x - 4, y + 6, 8, 1, '#d8401a'); }
      break;
    default: // frost
      if (i % 2 === 0) { p.tri(x - 4, y + 8, x + 4, y + 8, x, y - 6, '#a6d8f0'); p.line(x, y - 4, x, y + 6, '#e8f8ff'); }
      else { p.ellipse(x, y + 6, 5, 2, '#ffffff'); }
  }
}

function themeOf(ch) {
  const g = ch.boden.grund;
  if (ch.id === 9 || g === '#d9e6f0') return 'frost';
  if (g === '#3a3a44') return 'gruft';
  if (g === '#3d2a22') return 'schmiede';
  return 'moor';
}

export function arenaFloor(ch, arena) {
  const key = ch.id;
  if (cache.has(key)) return cache.get(key);
  const p = new Pix(W, H);
  const theme = themeOf(ch);
  const { grund, akzent, detail } = ch.boden;
  const outside = shade(grund, -0.45);
  const cx = arena.mitteX / K, cy = arena.mitteY / K, rx = arena.radiusX / K, ry = arena.radiusY / K;
  // Hintergrund außerhalb der Arena
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = hash(x, y, 1);
    p.px(x, y, n > 0.92 ? shade(outside, 0.12) : n < 0.06 ? shade(outside, -0.25) : outside);
  }
  // Boden der Arena mit Texturflecken
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (f > 1) continue;
    const n = hash(x >> 1, y >> 1, 3);
    let col = n > 0.85 ? akzent : n < 0.08 ? shade(grund, -0.12) : grund;
    if (f > 0.96) col = shade(grund, -0.3);           // dunkler Rand
    else if (f > 0.93) col = shade(akzent, 0.1);       // heller Randsaum
    p.px(x, y, col);
  }
  // Bodendetails in der Arena
  for (let i = 0; i < 140; i++) {
    const a = hash(i, 5) * Math.PI * 2, r = Math.sqrt(hash(i, 6)) * 0.88;
    const x = Math.round(cx + Math.cos(a) * rx * r), y = Math.round(cy + Math.sin(a) * ry * r);
    if (Math.hypot(x - cx, (y - cy) * 1.6) < 26) continue; // Turmplatz frei lassen
    if (theme === 'schmiede' && i % 7 === 0) { p.rect(x, y, 6, 1, detail); continue; }
    p.px(x, y, i % 3 ? shade(akzent, 0.15) : detail);
  }
  // Steinkreis um den Turm
  p.ellipse(cx, cy + 6, 22, 11, shade(grund, -0.2));
  p.ellipse(cx, cy + 6, 19, 9, shade(akzent, -0.1));
  // Deko außen
  for (let i = 0; i < 70; i++) {
    const a = hash(i, 9) * Math.PI * 2, r = 1.06 + hash(i, 10) * 0.3;
    const x = Math.round(cx + Math.cos(a) * rx * r), y = Math.round(cy + Math.sin(a) * ry * r);
    if (x < 4 || x > W - 6 || y < 4 || y > H - 12) continue;
    decor(p, theme, x, y, i);
  }
  // Portale
  if (ch.spawn.modus === 'portale') {
    for (const port of ch.spawn.portale) {
      const a = (port.winkel * Math.PI) / 180;
      const x = cx + Math.cos(a) * rx * 1.0, y = cy + Math.sin(a) * ry * 1.0;
      p.ellipse(x, y, 9, 6, '#1a1030');
      p.ellipse(x, y, 7, 4, '#5a3a9a');
      p.ellipse(x, y, 4, 2, '#c8a8ff');
    }
  }
  const img = upscale(p.c, K);
  cache.set(key, img);
  return img;
}
