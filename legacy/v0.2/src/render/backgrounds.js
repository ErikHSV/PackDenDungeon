// Kapitel-Hintergründe: je 3 Parallax-Ebenen (fern, mitte, nah) als Pixel-Grafik
// plus animierte Details (Glühwürmchen, Kerzen, Funken, Schnee, Polarlicht).
// Gezeichnet in 480×203 und ganzzahlig ×4 skaliert (→ 1920×812).
import { Pix, shade, hash, upscale } from './pixel.js';

const W = 480;
const H = 203;
export const BG_SCALE = 4;
/** Bodenoberkante in Niedrig-Auflösung (× 4 = Weltkoordinate ~620). */
const GROUND = 155;

/** Zeichnet ein Element so, dass die Ebene nahtlos wiederholt werden kann. */
function wrap(fn, x) { fn(x); fn(x - W); fn(x + W); }

function skyBands(p, colors) {
  const n = colors.length;
  for (let y = 0; y < H; y++) {
    const t = y / H * (n - 1);
    const i = Math.min(n - 2, Math.floor(t));
    const f = t - i;
    // Dithering zwischen zwei Farbbändern (Pixel-Look statt weichem Verlauf)
    for (let x = 0; x < W; x += 1) {
      const pick = ((x + y) % 2 === 0 ? f > 0.5 : f > 0.25 && f > hash(x, y) * 0.5 + 0.25);
      p.px(x, y, pick ? colors[i + 1] : colors[i]);
    }
  }
}

function groundBand(p, top, col, col2, detail) {
  for (let y = top; y < H; y++) p.rect(0, y, W, 1, (y - top) % 6 < 3 ? col : col2);
  p.rect(0, top, W, 1, shade(col, 0.25));
  for (let i = 0; i < 90; i++) detail(Math.floor(hash(i, 1) * W), top + 2 + Math.floor(hash(i, 2) * (H - top - 4)), i);
}

// ---------------------------------------------------------------------------

const CHAPTERS = {
  // ---------------- Kapitel 1: Moorwald ----------------
  1: {
    far(p) {
      skyBands(p, ['#1d2b2a', '#2a3d33', '#3d5240', '#56684a']);
      p.circle(390, 34, 12, '#e8e4c0'); p.circle(394, 31, 10, '#d8d4b0');
      for (let i = 0; i < 26; i++) {
        const x = i * 19 + hash(i, 3) * 10, h = 30 + hash(i, 4) * 30;
        wrap((xx) => p.ellipse(xx, 128 - h / 2, 14, h / 2 + 4, '#2a3a2c'), x);
      }
    },
    mid(p) {
      for (let i = 0; i < 7; i++) {
        const x = 30 + i * 70 + hash(i, 5) * 20;
        wrap((xx) => {
          // knorriger Baum
          p.rect(xx - 4, 70, 8, 90, '#4a3a2a');
          p.rect(xx - 2, 70, 2, 90, '#5e4a36');
          p.line(xx, 90, xx - 18, 70, '#4a3a2a', 3);
          p.line(xx - 18, 70, xx - 24, 74, '#4a3a2a', 2);
          p.line(xx, 80, xx + 16, 62, '#4a3a2a', 3);
          p.line(xx + 16, 62, xx + 22, 66, '#4a3a2a', 2);
          p.ellipse(xx - 4, 60, 22, 14, '#2f4a2c');
          p.ellipse(xx + 10, 54, 16, 10, '#3a5a34');
          p.ellipse(xx - 14, 66, 10, 6, '#3a5a34');
          p.rect(xx - 12, 72, 1, 8, '#5f7a44'); // hängendes Moos
          p.rect(xx + 12, 66, 1, 10, '#5f7a44');
        }, x);
      }
    },
    near(p) {
      groundBand(p, GROUND, '#3b4a2b', '#344226', (x, y, i) => {
        if (i % 3 === 0) { p.px(x, y, '#5f7a44'); p.px(x + 1, y - 1, '#6f8a4f'); p.px(x + 2, y, '#5f7a44'); }
        else if (i % 7 === 0) p.ellipse(x, y + 2, 8, 2, '#2a3a3a');
        else p.px(x, y, '#2a3420');
      });
      for (let i = 0; i < 12; i++) {
        const x = hash(i, 8) * W;
        wrap((xx) => { p.rect(xx, GROUND - 3, 1, 3, '#5f7a44'); p.rect(xx + 2, GROUND - 4, 1, 4, '#6f8a4f'); }, x);
      }
    },
    fog: 'rgba(200,220,200,0.10)',
    particles: 'fireflies',
  },

  // ---------------- Kapitel 2: Versunkene Gruft ----------------
  2: {
    far(p) {
      skyBands(p, ['#151820', '#1e2330', '#2a3142', '#343c50']);
      for (let x = 0; x < W; x += 60) {
        p.rect(x + 10, 30, 40, 120, '#252b3a');
        p.ellipse(x + 30, 30, 20, 16, '#151820');
        p.rect(x + 8, 24, 4, 126, '#3a4256');
        p.rect(x + 48, 24, 4, 126, '#3a4256');
      }
      for (let i = 0; i < 40; i++) p.rect(hash(i, 1) * W, hash(i, 2) * 140, 6, 3, '#2e3546');
    },
    mid(p) {
      for (let i = 0; i < 9; i++) {
        const x = 20 + i * 54 + hash(i, 6) * 18;
        const h = 18 + hash(i, 7) * 12;
        wrap((xx) => {
          p.rect(xx - 7, GROUND - h, 14, h + 2, '#5a6272');
          p.ellipse(xx, GROUND - h, 7, 5, '#5a6272');
          p.rect(xx - 7, GROUND - h, 2, h, '#6e7788');
          p.rect(xx - 1, GROUND - h + 4, 2, 7, '#3e4452');
          p.rect(xx - 3, GROUND - h + 6, 6, 2, '#3e4452');
          p.px(xx + 4, GROUND - 3, '#4f7a5a');
        }, x);
      }
    },
    near(p) {
      groundBand(p, GROUND, '#3a3a44', '#33333c', (x, y, i) => {
        if (i % 5 === 0) p.ellipse(x, y + 2, 10, 2, '#4a6a8a'); // Pfütze
        else if (i % 5 === 1) p.px(x, y, '#9fc8e8');
        else p.rect(x, y, 4, 1, '#2a2a32');
      });
      for (let x = 0; x < W; x += 16) p.rect(x, GROUND + 1, 1, 6, '#2a2a32');
    },
    fog: 'rgba(160,180,220,0.08)',
    particles: 'candles',
  },

  // ---------------- Kapitel 3: Aschenschmiede ----------------
  3: {
    far(p) {
      skyBands(p, ['#1a0d0a', '#2a1612', '#4a2318', '#6a2f1a']);
      for (let i = 0; i < 18; i++) {
        const x = i * 28 + hash(i, 1) * 10, h = 40 + hash(i, 2) * 50;
        wrap((xx) => p.tri(xx - 20, 150, xx + 20, 150, xx, 150 - h, '#2a1814'), x);
      }
      for (let i = 0; i < 3; i++) {
        const x = 80 + i * 160;
        for (let y = 20; y < 150; y++) p.rect(x + Math.round(Math.sin(y / 9) * 2), y, 4, 1, y % 5 ? '#ff7a2a' : '#ffb347');
      }
    },
    mid(p) {
      for (let i = 0; i < 5; i++) {
        const x = 50 + i * 100;
        wrap((xx) => {
          // Amboss und Kette
          p.rect(xx - 12, GROUND - 12, 24, 5, '#3a3a40');
          p.rect(xx - 6, GROUND - 7, 12, 7, '#2e2e34');
          p.rect(xx - 16, GROUND - 12, 6, 3, '#3a3a40');
          for (let y = 0; y < 60; y += 4) p.rect(xx + 30, y, 2, 3, '#4a4048');
          p.circle(xx + 31, 62, 3, '#4a4048');
        }, x);
      }
    },
    near(p) {
      groundBand(p, GROUND, '#3d2a22', '#35241d', (x, y, i) => {
        if (i % 4 === 0) p.rect(x, y, 12, 2, i % 8 === 0 ? '#ff7a2a' : '#d8401a'); // Lavarinne
        else p.px(x, y, '#2a1a14');
      });
      for (let x = 0; x < W; x++) if (hash(x, 9) > 0.7) p.px(x, GROUND, '#ff7a2a');
    },
    fog: 'rgba(255,120,40,0.06)',
    particles: 'sparks',
  },

  // ---------------- Kapitel 4: Frostthron ----------------
  4: {
    far(p) {
      skyBands(p, ['#0e1626', '#152234', '#22385a', '#2b4566']);
      for (let i = 0; i < 60; i++) p.px(hash(i, 1) * W, hash(i, 2) * 90, hash(i, 3) > 0.5 ? '#ffffff' : '#a6c8ff');
      for (let i = 0; i < 9; i++) {
        const x = i * 60 + hash(i, 4) * 20, h = 50 + hash(i, 5) * 40;
        wrap((xx) => {
          p.tri(xx - 40, 150, xx + 40, 150, xx, 150 - h, '#4a6a8a');
          p.tri(xx - 12, 150 - h + 18, xx + 12, 150 - h + 18, xx, 150 - h, '#e8f4ff');
        }, x);
      }
    },
    mid(p) {
      for (let i = 0; i < 22; i++) {
        const x = i * 22 + hash(i, 6) * 8, l = 8 + hash(i, 7) * 22;
        wrap((xx) => p.tri(xx - 4, 0, xx + 4, 0, xx, l, i % 2 ? '#bfe9ff' : '#dff6ff'), x); // Eiszapfen
      }
      for (let i = 0; i < 6; i++) {
        const x = 40 + i * 80;
        wrap((xx) => { p.tri(xx - 6, GROUND, xx + 6, GROUND, xx, GROUND - 26, '#a6d8f0'); p.line(xx, GROUND - 24, xx, GROUND - 4, '#e8f8ff'); }, x);
      }
    },
    near(p) {
      groundBand(p, GROUND, '#d9e6f0', '#c8d8e6', (x, y, i) => {
        if (i % 3 === 0) p.px(x, y, '#ffffff');
        else p.rect(x, y, 3, 1, '#b0c4d6');
      });
    },
    fog: 'rgba(230,245,255,0.08)',
    particles: 'snow',
    aurora: true,
  },
};

/** Liefert die 3 Ebenen eines Kapitels als hochskalierte Canvas (gecacht). */
const cache = new Map();
export function chapterLayers(id) {
  if (cache.has(id)) return cache.get(id);
  const def = CHAPTERS[id] ?? CHAPTERS[1];
  const layers = ['far', 'mid', 'near'].map((name) => {
    const p = new Pix(W, H);
    def[name](p);
    return upscale(p.c, BG_SCALE);
  });
  const result = { layers, def };
  cache.set(id, result);
  return result;
}

/**
 * Zeichnet den Hintergrund. scroll = Kamera-Versatz in Pixeln (Startbildschirm),
 * t = Zeit in Sekunden für Animationen. Ebenen bewegen sich unterschiedlich schnell (Parallax).
 */
export function drawBackground(ctx, id, width, height, t, scroll = 0) {
  const { layers, def } = chapterLayers(id);
  const speeds = [0.15, 0.4, 1];
  ctx.imageSmoothingEnabled = false;
  layers.forEach((layer, i) => {
    const lw = layer.width;
    const off = -((scroll * speeds[i]) % lw);
    for (let x = off; x < width; x += lw) ctx.drawImage(layer, Math.round(x), 0, lw, Math.min(height, layer.height), Math.round(x), 0, lw, Math.min(height, layer.height));
    if (i === 0 && def.aurora) drawAurora(ctx, width, t);
    if (i === 1) drawFog(ctx, def.fog, width, height, t, scroll);
  });
  drawParticles(ctx, def.particles, width, height, t);
}

function drawFog(ctx, color, width, height, t, scroll) {
  ctx.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const y = 380 + i * 60;
    const x = ((t * (12 + i * 6) + scroll * 0.6 + i * 400) % (width + 800)) - 400;
    for (let k = 0; k < 3; k++) {
      ctx.fillRect(Math.round((x + k * 700) % (width + 800) - 400), y, 520, 24);
      ctx.fillRect(Math.round((x + k * 700 + 60) % (width + 800) - 400), y - 12, 360, 12);
    }
  }
}

function drawAurora(ctx, width, t) {
  const cols = ['rgba(94,209,122,0.18)', 'rgba(90,169,240,0.16)', 'rgba(165,92,224,0.12)'];
  for (let b = 0; b < 3; b++) {
    ctx.fillStyle = cols[b];
    for (let x = 0; x < width; x += 8) {
      const y = 60 + b * 26 + Math.sin(x / 140 + t * 0.6 + b) * 30 + Math.sin(x / 47 + t * 1.3) * 8;
      ctx.fillRect(x, Math.round(y / 4) * 4, 8, 28 + b * 4);
    }
  }
}

function drawParticles(ctx, kind, width, height, t) {
  const N = { fireflies: 26, candles: 8, sparks: 40, snow: 70 }[kind] || 0;
  for (let i = 0; i < N; i++) {
    const r1 = hash(i, 11), r2 = hash(i, 12), r3 = hash(i, 13);
    let x, y, col, s = 4;
    if (kind === 'fireflies') {
      x = (r1 * width + Math.sin(t * 0.7 + i) * 40) % width;
      y = 250 + r2 * 400 + Math.cos(t * 0.9 + i * 2) * 20;
      const a = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2 + i * 1.7));
      col = `rgba(220,255,120,${a.toFixed(2)})`;
    } else if (kind === 'candles') {
      x = 120 + r1 * (width - 240);
      y = 120 + r2 * 260 + Math.sin(t + i) * 10;
      ctx.fillStyle = '#e8e0c8';
      ctx.fillRect(Math.round(x / 4) * 4, Math.round(y / 4) * 4 + 8, 8, 20);
      col = Math.sin(t * 9 + i * 3) > 0 ? '#ffd24a' : '#ff9a3a';
      s = 8;
    } else if (kind === 'sparks') {
      const life = (t * (0.15 + r3 * 0.2) + r2) % 1;
      x = r1 * width + Math.sin(t * 3 + i) * 10;
      y = height - life * height * 0.9;
      col = life < 0.5 ? '#ffd24a' : '#ff7a2a';
    } else if (kind === 'snow') {
      const life = (t * (0.05 + r3 * 0.06) + r2) % 1;
      x = (r1 * width + Math.sin(t + i) * 30 + life * 120) % width;
      y = life * height;
      col = '#ffffff';
    }
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x / 4) * 4, Math.round(y / 4) * 4, s, s);
  }
}

/** Bodenoberkante in Weltkoordinaten (für Layout-Hilfen). */
export const GROUND_TOP = GROUND * BG_SCALE;
