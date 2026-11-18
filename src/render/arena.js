// Spielfeld je Kapitel (Abschnitt 3 und 15): Das GESAMTE Bild ist Spielfeld. Kein Arenakreis, keine Mauer.
// Boden: nahezu einfarbig dunkel in Kapitelfarbe mit sehr wenigen kleinen Details.
// Bildränder: dichte Kapitel-Deko + Vignette = natürlicher Spielfeldrand.
// Gezeichnet in 480×270 und ganzzahlig ×4 skaliert (→ 1920×1080).
import { Pix, shade, hash, upscale } from './pixel.js';

const W = 480, H = 270, K = 4;
const cache = new Map();

/** Farbwelt eines Kapitels (Fallback für alte Daten). */
export function worldOf(ch) {
  return ch.farbwelt ?? { thema: 'moor', boden: '#14231C', turmlicht: '#7ab8ff', waehrung: 'blau' };
}

/** Randdeko je Thema; (x, y) = Fußpunkt, s = Größe 0..1 (näher am Rand = größer). */
function decor(p, theme, x, y, i, s) {
  const big = s > 0.55;
  switch (theme) {
    case 'moor':
      if (i % 4 === 0) { // Felsen
        p.ellipse(x, y, big ? 7 : 4, big ? 5 : 3, '#2e3a36'); p.ellipse(x - 1, y - 1, big ? 5 : 3, big ? 3 : 2, '#3c4a44'); p.px(x - 2, y - 2, '#52625a');
      } else if (i % 4 === 1) { // toter Strauch
        p.line(x, y, x, y - (big ? 9 : 6), '#3a2e24'); p.line(x, y - 4, x - 4, y - 8, '#3a2e24'); p.line(x, y - 5, x + 3, y - 9, '#3a2e24');
      } else if (i % 4 === 2) { // Pilze
        p.rect(x, y - 3, 1, 3, '#d8d0c0'); p.ellipse(x, y - 4, 2, 1, '#c0392b'); p.rect(x + 3, y - 2, 1, 2, '#d8d0c0'); p.ellipse(x + 3, y - 3, 1.5, 1, '#e86a3a');
      } else { // Grasbüschel, dunkel
        p.line(x, y, x - 2, y - 4, '#24402e'); p.line(x, y, x, y - 5, '#2e5038'); p.line(x, y, x + 2, y - 4, '#24402e');
      }
      break;
    case 'gruft':
      if (i % 3 === 0) { p.rect(x - 3, y - 8, 6, 8, '#4a5262'); p.ellipse(x, y - 8, 3, 2, '#4a5262'); p.rect(x - 1, y - 6, 2, 3, '#323846'); }
      else if (i % 3 === 1) { p.rect(x - 3, y - 1, 6, 1, '#cfc8b4'); p.px(x - 4, y - 2, '#cfc8b4'); p.px(x + 3, y, '#cfc8b4'); }
      else { p.ellipse(x, y, big ? 6 : 4, 3, '#2a303c'); p.px(x, y - 1, '#3a4252'); }
      break;
    case 'schmiede':
      if (i % 3 === 0) { p.line(x - 6, y, x + 5, y - 2, '#ff6a1a'); p.line(x - 5, y + 1, x + 3, y - 1, '#ffb030'); }
      else if (i % 3 === 1) { p.rect(x - 4, y - 4, 8, 2, '#3a3438'); p.rect(x - 2, y - 2, 4, 2, '#2a2428'); p.rect(x - 3, y, 6, 1, '#3a3438'); }
      else { p.ellipse(x, y, big ? 6 : 4, 3, '#3a1e16'); p.px(x + 1, y - 1, '#5a2e1e'); }
      break;
    default: // frost: lila-weiße Eiskristall-Gruppen
      for (let k = 0; k < (big ? 3 : 2); k++) {
        const dx = (k - 1) * 3, h = (big ? 10 : 6) - Math.abs(k - 1) * 3;
        p.tri(x + dx - 2, y, x + dx + 2, y, x + dx, y - h, k === 1 ? '#e8e0ff' : '#b8a8e8');
        p.line(x + dx, y - 1, x + dx, y - h + 2, '#ffffff');
      }
  }
}

/** Kleine Bodendetails (sehr wenige). */
function detail(p, theme, x, y, i, base) {
  const c = shade(base, 0.18);
  switch (theme) {
    case 'moor': if (i % 2) { p.px(x, y, '#2a4a34'); p.px(x + 1, y - 1, '#2a4a34'); } else p.px(x, y, c); break;
    case 'gruft': p.px(x, y, c); if (i % 3 === 0) p.px(x + 1, y, c); break;
    case 'schmiede': if (i % 4 === 0) p.rect(x, y, 2, 1, '#6a2a14'); else p.px(x, y, c); break;
    default: if (i % 3 === 0) { p.px(x, y, '#9ab8e8'); p.px(x, y - 1, '#d8e8ff'); } else p.px(x, y, c);
  }
}

export function arenaFloor(ch, arena) {
  const key = ch.id;
  if (cache.has(key)) return cache.get(key);
  const p = new Pix(W, H);
  const world = worldOf(ch);
  const theme = world.thema;
  const base = world.boden;
  // Boden: nahezu einfarbig mit ganz leichter Körnung
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = hash(x >> 2, y >> 2, 3);
    p.px(x, y, n > 0.93 ? shade(base, 0.05) : n < 0.05 ? shade(base, -0.06) : base);
  }
  // Sehr wenige Details im Inneren
  const cx = arena.mitteX / K, cy = arena.mitteY / K;
  for (let i = 0; i < 46; i++) {
    const x = Math.round(30 + hash(i, 21) * (W - 60)), y = Math.round(24 + hash(i, 22) * (H - 48));
    if (Math.hypot(x - cx, (y - cy) * 1.5) < 30) continue;
    detail(p, theme, x, y, i, base);
  }
  // Dichte Randdeko: je näher am Bildrand, desto dichter und größer
  const items = [];
  for (let i = 0; i < 900; i++) {
    const x = hash(i, 31) * W, y = hash(i, 32) * H;
    const edge = Math.min(x / W, 1 - x / W, y / H * 1.4, (1 - y / H) * 1.4); // 0 am Rand
    const s = 1 - Math.min(1, edge / 0.12);
    if (s <= 0 || hash(i, 33) > s * 0.9) continue;
    items.push([Math.round(x), Math.round(y), i, s]);
  }
  items.sort((a, b) => a[1] - b[1]);
  for (const [x, y, i, s] of items) decor(p, theme, x, y, i, s);
  // Portale (falls das Kapitel welche hat) am Bildrand
  if (ch.spawn.modus === 'portale') {
    for (const port of ch.spawn.portale) {
      const a = (port.winkel * Math.PI) / 180;
      const x = cx + Math.cos(a) * (arena.radiusX / K) * 0.98, y = cy + Math.sin(a) * (arena.radiusY / K) * 0.98;
      p.ellipse(x, y, 9, 6, '#1a1030'); p.ellipse(x, y, 7, 4, '#5a3a9a'); p.ellipse(x, y, 4, 2, '#c8a8ff');
    }
  }
  const img = upscale(p.c, K);
  // Vignette (weich, nicht gepixelt)
  const g = img.getContext('2d');
  const v = g.createRadialGradient(960, 540, 380, 960, 540, 1150);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  v.addColorStop(1, 'rgba(0,0,0,0.8)');
  g.fillStyle = v;
  g.fillRect(0, 0, 1920, 1080);
  cache.set(key, img);
  return img;
}
