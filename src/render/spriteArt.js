// Pixel-Art-Definitionen (Platzhalter in Originalgröße).
// Jede Funktion zeichnet EIN Frame auf ein Pix-Raster. f = { anim, i, b, sw, pull }
//   anim: 'idle' | 'attack', i: Frame-Index, b: Atem-Versatz (0/1), sw: Schwungwinkel, pull: Zug (0–2)
// Helden: 32×32, Blick nach rechts. Gegner: 24×24, Bosse: 32×32 (werden gespiegelt → Blick nach links).
// Echte Grafiken können später per Sprite-Sheet ersetzt werden (siehe sprites.js).
import { shade } from './pixel.js';

const SKIN = '#f2c79a';
const SKIN2 = '#d9a274';
const EYE = '#2a1e2e';

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

/** Grundfigur: Beine/Robe, Rumpf, Kopf. Gibt Ankerpunkte zurück (Hand, Kopf, Schulter). */
function body(p, f, o) {
  const x = o.x ?? 16;
  const b = f.b;
  const w = o.w ?? 10;
  const top = (o.top ?? 15) + b;
  const legTop = o.legTop ?? 24;
  const cloth = o.cloth;
  // Beine oder Robe
  if (o.robe) {
    const rw = o.robeW ?? w + 4;
    for (let y = top + 4; y <= 30; y++) {
      const t = (y - top - 4) / (30 - top - 4);
      const ww = Math.round(w + (rw - w) * t);
      p.rect(x - ww / 2, y, ww, 1, y > 27 ? shade(cloth, -0.2) : cloth);
    }
    p.rect(x - 3, 30, 2, 1, o.boots ?? '#3a2a22');
    p.rect(x + 2, 30, 2, 1, o.boots ?? '#3a2a22');
  } else {
    const lw = o.legW ?? 3;
    p.rect(x - lw - 1, legTop, lw, 30 - legTop, o.legs ?? shade(cloth, -0.3));
    p.rect(x + 1, legTop, lw, 30 - legTop, o.legs ?? shade(cloth, -0.3));
    p.rect(x - lw - 2, 29, lw + 1, 2, o.boots ?? '#4a3426');
    p.rect(x + 1, 29, lw + 1, 2, o.boots ?? '#4a3426');
  }
  // Rumpf
  p.rect(x - w / 2, top, w, legTop - top + 1, cloth);
  p.rect(x - w / 2, top, w, 1, shade(cloth, 0.25));
  p.rect(x - w / 2, legTop - 1, w, 1, o.belt ?? shade(cloth, -0.35));
  // Kopf
  const hx = x + (o.headDx ?? 0);
  const hy = top - 5;
  const hr = o.headR ?? 4;
  p.ellipse(hx, hy, hr, hr, o.skin ?? SKIN);
  p.rect(hx + 1, hy - 1, 1, 2, EYE);
  p.px(hx + 3, hy + 1, o.skin2 ?? SKIN2);
  return { x, hx, hy, hr, top, w, hand: { x: x + w / 2 + 1, y: top + 6 }, shoulder: { x: x + w / 2 - 1, y: top + 1 } };
}

/** Arm vom Schultergelenk zur Hand. */
function arm(p, from, to, col, thick = 2) {
  p.line(from.x, from.y, to.x, to.y, col, thick);
  p.rect(to.x - 1, to.y - 1, 2, 2, SKIN);
}

// ---------------------------------------------------------------------------
// Helden (32×32, Blick nach rechts)
// ---------------------------------------------------------------------------

export const HERO_ART = {
  /** Breit, schwer, großer Turmschild. */
  torwaechter(p, f) {
    const steel = '#8d97a6';
    const a = body(p, f, { w: 14, cloth: steel, legs: '#5d6572', top: 14, legW: 4, belt: '#5a4632' });
    // Helm mit Sehschlitz
    p.ellipse(a.hx, a.hy, 5, 5, '#a7b1bf');
    p.rect(a.hx - 5, a.hy, 11, 1, '#5d6572');
    p.rect(a.hx + 1, a.hy - 1, 4, 1, EYE);
    p.rect(a.hx - 1, a.hy - 7, 2, 2, '#c0392b');
    // Schulterplatten
    p.rect(a.x - 9, a.top, 4, 3, '#b6bfcc');
    p.rect(a.x + 5, a.top, 4, 3, '#b6bfcc');
    // Schwert (Angriff: Stoß nach vorn)
    const lunge = f.anim === 'attack' ? [0, -1, 3, 4, 2, 0][f.i] : 0;
    p.rect(a.x + 4 + lunge, a.top + 4, 9, 2, '#dfe6ee');
    p.rect(a.x + 3 + lunge, a.top + 3, 2, 4, '#7a5a3a');
    // Turmschild vorn
    const sx = a.x + 5 + Math.max(0, lunge - 1);
    p.rect(sx, a.top - 1, 6, 15, '#6b4a2e');
    p.rect(sx + 1, a.top, 4, 13, '#8a6038');
    p.rect(sx + 2, a.top + 4, 2, 4, '#e0b84a');
  },

  /** Schlank, Mütze, Schleuder. */
  schleuderjunge(p, f) {
    const a = body(p, f, { w: 8, cloth: '#c79a5b', legs: '#6b5338', top: 16, headR: 4 });
    p.rect(a.hx - 4, a.hy - 4, 8, 3, '#7a4b2a');
    p.rect(a.hx + 2, a.hy - 2, 4, 1, '#7a4b2a');
    p.px(a.hx - 2, a.hy + 2, '#d98b6b');
    const pull = f.pull ?? 0;
    const hand = { x: a.hand.x + 3, y: a.hand.y - 2 };
    arm(p, a.shoulder, hand, '#c79a5b');
    // Y-Schleuder
    p.line(hand.x, hand.y, hand.x + 2, hand.y - 3, '#6b4423');
    p.line(hand.x, hand.y, hand.x + 3, hand.y - 1, '#6b4423');
    // Band + Kiesel (wird beim Angriff gespannt)
    const bx = hand.x - pull * 2;
    p.line(hand.x + 2, hand.y - 3, bx, hand.y - 1, '#b8b0a0');
    if (f.anim !== 'attack' || f.i < 4) p.px(bx, hand.y - 1, '#9a9a9a');
  },

  /** Heilerin mit Kräuterbeutel und Herzstab. */
  feldscherin(p, f) {
    const a = body(p, f, { w: 10, cloth: '#efe6d2', robe: true, robeW: 14, top: 15 });
    p.ellipse(a.hx - 1, a.hy - 2, 4, 3, '#8a5a3a');
    p.circle(a.hx - 4, a.hy - 3, 2, '#8a5a3a');
    // Schürze mit grünem Blatt-Abzeichen
    p.rect(a.x - 3, a.top + 3, 6, 8, '#ffffff');
    p.rect(a.x - 1, a.top + 5, 2, 3, '#5ED17A');
    p.px(a.x, a.top + 4, '#5ED17A');
    // Stab mit Herz
    const lift = f.anim === 'attack' ? [0, 1, 3, 3, 2, 0][f.i] : 0;
    p.rect(a.x + 7, a.top - 6 - lift, 1, 21, '#9a6b3e');
    p.circle(a.x + 6.5, a.top - 8 - lift, 2, '#E04848');
    p.circle(a.x + 8.5, a.top - 8 - lift, 2, '#E04848');
    p.tri(a.x + 4.5, a.top - 8 - lift, a.x + 10.5, a.top - 8 - lift, a.x + 7.5, a.top - 4 - lift, '#E04848');
    arm(p, a.shoulder, { x: a.x + 7, y: a.top + 6 }, '#efe6d2');
    // Kräuterbeutel
    p.rect(a.x - 8, a.top + 6, 4, 4, '#6b8a3a');
  },

  /** Kräftig, Kopftuch, Kettenkugel im Halbkreis. */
  kettenschwinger(p, f) {
    const a = body(p, f, { w: 12, cloth: '#8f5b3a', legs: '#4a3426', top: 15, legW: 4, headR: 4 });
    p.rect(a.hx - 4, a.hy - 4, 8, 3, '#c0392b');
    p.px(a.hx - 5, a.hy - 2, '#c0392b');
    p.rect(a.hx - 1, a.hy + 3, 4, 1, '#6b3b1e');
    const ang = f.anim === 'attack' ? [-2.2, -2.6, -1.2, 0.2, 0.7, 0.3][f.i] : -0.9 + Math.sin(f.i * 1.6) * 0.15;
    const hand = { x: a.hand.x + 1, y: a.hand.y - 1 };
    arm(p, a.shoulder, hand, '#d9a274', 3);
    const end = p.ray(hand.x, hand.y, ang, 9, '#b7b7b7');
    p.circle(end.x, end.y, 2.5, '#5d6572');
    p.px(end.x - 3, end.y, '#cfd6de'); p.px(end.x + 3, end.y, '#cfd6de'); p.px(end.x, end.y - 3, '#cfd6de');
  },

  /** Grüner Umhang, Falke auf dem Arm. */
  falknerin(p, f) {
    const a = body(p, f, { w: 8, cloth: '#3f7a4a', legs: '#4a3a2a', top: 16 });
    p.ellipse(a.hx - 1, a.hy - 1, 5, 4, '#2f5e38');
    p.rect(a.hx - 1, a.hy - 1, 4, 4, SKIN);
    p.rect(a.hx + 1, a.hy, 1, 1, EYE);
    p.rect(a.x - 6, a.top + 1, 3, 12, '#2f5e38');
    const hand = { x: a.hand.x + 2, y: a.hand.y - 3 };
    arm(p, a.shoulder, hand, '#3f7a4a');
    p.rect(hand.x - 1, hand.y, 3, 2, '#8a6038');
    // Falke: sitzt im Idle, fliegt beim Angriff los
    const fly = f.anim === 'attack' ? [0, 1, 4, 7, 4, 1][f.i] : 0;
    const bx = hand.x + 1 + fly;
    const by = hand.y - 4 - Math.min(fly, 3);
    p.ellipse(bx, by, 2, 2, '#9a6a3a');
    p.px(bx + 2, by - 1, '#f2b630');
    p.px(bx + 1, by - 1, EYE);
    const wing = fly > 0 ? (f.i % 2 ? -3 : 1) : 0;
    p.line(bx - 1, by, bx - 4, by + wing, '#7a4e28', 2);
  },

  /** Stämmig, roter Bart, Hammer und schwebende Rune. */
  runenschmied(p, f) {
    const a = body(p, f, { w: 12, cloth: '#6b4a32', legs: '#3a2a22', top: 17, legTop: 25, legW: 4, headR: 4 });
    p.rect(a.x - 4, a.top + 1, 8, 8, '#4a3a2e'); // Schürze
    p.ellipse(a.hx, a.hy + 3, 4, 3, '#d9622b'); // Bart
    p.rect(a.hx - 4, a.hy - 4, 8, 2, '#5d6572');
    p.rect(a.hx + 1, a.hy - 1, 1, 1, EYE);
    const up = f.anim === 'attack' ? [0, -2, -3, 1, 2, 0][f.i] : 0;
    const hand = { x: a.hand.x + 1, y: a.hand.y + up };
    arm(p, a.shoulder, hand, '#d9a274', 3);
    p.rect(hand.x, hand.y - 6, 1, 8, '#8a6038');
    p.rect(hand.x - 2, hand.y - 8, 5, 3, '#9aa3ad');
    // Rune (leuchtet, pulsiert)
    const glow = f.i % 2 ? '#7fe8ff' : '#5AA9F0';
    const ry = 6 - f.b;
    p.rect(a.x - 12, ry, 5, 7, '#24364a');
    p.line(a.x - 11, ry + 1, a.x - 9, ry + 5, glow);
    p.line(a.x - 9, ry + 1, a.x - 11, ry + 5, glow);
  },

  /** Spitze Kapuze, Eiskristall-Stab. */
  frostweberin(p, f) {
    const a = body(p, f, { w: 9, cloth: '#7fb8e0', robe: true, robeW: 15, top: 16 });
    p.tri(a.hx - 5, a.hy + 1, a.hx + 4, a.hy + 1, a.hx - 2, a.hy - 9, '#5d8fbf');
    p.rect(a.hx - 1, a.hy - 1, 4, 4, SKIN);
    p.px(a.hx + 1, a.hy, EYE);
    p.rect(a.x - 4, a.top + 5, 8, 1, '#e8f6ff');
    const hand = { x: a.hand.x + 2, y: a.hand.y };
    arm(p, a.shoulder, hand, '#7fb8e0');
    const raise = f.anim === 'attack' ? [0, 1, 3, 3, 1, 0][f.i] : 0;
    p.rect(hand.x + 1, hand.y - 12 - raise, 1, 18, '#cfe8ff');
    const glow = f.i % 2 ? '#ffffff' : '#a6e3ff';
    p.tri(hand.x - 1.5, hand.y - 13 - raise, hand.x + 3.5, hand.y - 13 - raise, hand.x + 1, hand.y - 18 - raise, glow);
    p.tri(hand.x - 1.5, hand.y - 13 - raise, hand.x + 3.5, hand.y - 13 - raise, hand.x + 1, hand.y - 10 - raise, '#5AA9F0');
  },

  /** Dunkler Umhang, Maske, zwei Dolche, geduckte Haltung. */
  schattenlaeuferin(p, f) {
    const lunge = f.anim === 'attack' ? [0, -1, 3, 4, 2, 0][f.i] : 0;
    const a = body(p, f, { x: 15 + lunge, w: 8, cloth: '#4b3b6b', legs: '#2e2442', top: 17, headR: 4 });
    p.ellipse(a.hx, a.hy, 4, 4, '#3a2d55');
    p.rect(a.hx - 1, a.hy - 1, 5, 2, '#d9cbe8');
    p.px(a.hx + 2, a.hy - 1, '#A55CE0');
    p.tri(a.x - 4, a.top, a.x - 12, a.top + 12, a.x - 2, a.top + 10, '#2e2442'); // flatternder Umhang
    const hand = { x: a.hand.x + 2, y: a.hand.y - 1 };
    arm(p, a.shoulder, hand, '#4b3b6b');
    p.line(hand.x, hand.y, hand.x + 5, hand.y - 3, '#e6e6f0');
    p.line(a.x - 3, a.top + 6, a.x - 7, a.top + 3, '#e6e6f0');
  },

  /** Braune Kutte, Tonsur, Glocke am Stab. */
  glockenmoench(p, f) {
    const a = body(p, f, { w: 11, cloth: '#7a5236', robe: true, robeW: 15, top: 16, belt: '#d9b45a' });
    p.rect(a.hx - 3, a.hy - 4, 6, 2, SKIN2);
    p.rect(a.hx - 4, a.hy - 3, 1, 3, '#5a3a22');
    p.rect(a.hx + 3, a.hy - 3, 1, 3, '#5a3a22');
    const hand = { x: a.hand.x + 1, y: a.hand.y };
    arm(p, a.shoulder, hand, '#7a5236');
    p.rect(hand.x + 1, hand.y - 13, 1, 17, '#9a6b3e');
    p.rect(hand.x + 1, hand.y - 13, 6, 1, '#9a6b3e');
    const swing = f.anim === 'attack' ? [0, -1, 2, 2, -1, 0][f.i] : (f.i % 2);
    const gx = hand.x + 6 + swing;
    p.tri(gx - 3, hand.y - 6, gx + 3, hand.y - 6, gx, hand.y - 12, '#f2b630');
    p.rect(gx - 3, hand.y - 7, 7, 2, '#e09a20');
    p.px(gx, hand.y - 5, '#8a5a1a');
  },

  /** Wildes weißes Haar, Blitzstab. */
  sturmruferin(p, f) {
    const a = body(p, f, { w: 9, cloth: '#3b4fbf', robe: true, robeW: 15, top: 16, belt: '#f2d34a' });
    for (let i = 0; i < 5; i++) p.line(a.hx - 4 + i * 2, a.hy - 3, a.hx - 6 + i * 2 + (f.i % 2), a.hy - 7, '#eef2ff', 2);
    p.rect(a.hx - 4, a.hy - 4, 8, 2, '#eef2ff');
    const hand = { x: a.hand.x + 2, y: a.hand.y - 1 };
    arm(p, a.shoulder, hand, '#3b4fbf');
    const raise = f.anim === 'attack' ? [0, 2, 4, 4, 2, 0][f.i] : 0;
    p.rect(hand.x + 1, hand.y - 10 - raise, 1, 16, '#c0c8e0');
    const orb = f.i % 2 ? '#fff6a0' : '#f2d34a';
    p.circle(hand.x + 1.5, hand.y - 12 - raise, 2.5, orb);
    if (f.anim === 'attack' && f.i >= 2 && f.i <= 3) {
      p.line(hand.x + 3, hand.y - 13 - raise, hand.x + 8, hand.y - 17 - raise, '#fff6a0');
      p.line(hand.x + 8, hand.y - 17 - raise, hand.x + 6, hand.y - 20 - raise, '#fff6a0');
    }
  },

  /** Kapuze, blasse Robe, Schädellaterne (freundlich, nicht gruselig). */
  knochenfluesterer(p, f) {
    const a = body(p, f, { w: 10, cloth: '#7a9a7a', robe: true, robeW: 15, top: 16, belt: '#4a5a4a' });
    p.ellipse(a.hx - 1, a.hy - 1, 5, 5, '#5a7a5a');
    p.rect(a.hx - 1, a.hy - 1, 4, 4, '#e8f0e0');
    p.px(a.hx + 1, a.hy, '#5ED17A');
    const hand = { x: a.hand.x + 2, y: a.hand.y };
    arm(p, a.shoulder, hand, '#7a9a7a');
    const raise = f.anim === 'attack' ? [0, 1, 3, 3, 1, 0][f.i] : 0;
    p.rect(hand.x + 1, hand.y - 11 - raise, 1, 16, '#6b5a4a');
    const sy = hand.y - 15 - raise;
    p.ellipse(hand.x + 1.5, sy, 3, 3, '#f0ead8');
    p.px(hand.x, sy, f.i % 2 ? '#7dff9a' : '#5ED17A');
    p.px(hand.x + 3, sy, f.i % 2 ? '#7dff9a' : '#5ED17A');
    p.rect(hand.x, sy + 2, 3, 1, '#c8c0a8');
  },

  /** Goldener Mantel, Monokel, schwebende Zahnräder, große Taschenuhr. */
  uhrmacher(p, f) {
    const a = body(p, f, { w: 10, cloth: '#8a5a2a', legs: '#4a3020', top: 15 });
    p.rect(a.x - 5, a.top, 2, 10, '#e0c36b');
    p.rect(a.x + 3, a.top, 2, 10, '#e0c36b');
    p.ellipse(a.hx, a.hy - 4, 4, 2, '#d8d8d8'); // weißes Haar
    p.rect(a.hx + 1, a.hy - 1, 3, 3, '#e0c36b'); // Monokel
    p.px(a.hx + 2, a.hy, '#a6e3ff');
    const hand = { x: a.hand.x + 2, y: a.hand.y };
    arm(p, a.shoulder, hand, '#8a5a2a');
    // Taschenuhr
    p.circle(hand.x + 3, hand.y, 3, '#F2B630');
    p.circle(hand.x + 3, hand.y, 2, '#fff6dc');
    const ang = (f.i / 4) * Math.PI * 2;
    p.ray(hand.x + 3, hand.y, ang, 2, '#2a1e2e');
    // Zahnräder
    const g = f.i % 2;
    p.circle(a.x - 11, 8 + g, 2, '#e0c36b');
    p.px(a.x - 11, 8 + g, '#8a5a2a');
    p.circle(a.x + 11, 4 - g, 1.5, '#e0c36b');
  },
};

// ---------------------------------------------------------------------------
// Gegner (24×24 bzw. Bosse 32×32). Gezeichnet mit Blick nach RECHTS, werden gespiegelt.
// ---------------------------------------------------------------------------

export const ENEMY_ART = {
  schlammling(p, f) {
    const sq = f.anim === 'attack' ? [0, 1, -2, -2, 0, 0][f.i] : [0, 1, 0, 1][f.i];
    p.ellipse(12, 17 + sq / 2, 8 + sq / 2, 6 - sq / 2, '#7a8f3f');
    p.ellipse(12, 15 + sq / 2, 6, 3, '#94ad52');
    p.px(10, 18, '#5a6a2a'); p.px(16, 20, '#5a6a2a');
    p.rect(14, 13 + sq, 2, 3, '#ffffff'); p.px(15, 14 + sq, EYE);
    p.rect(9, 13 + sq, 2, 3, '#ffffff'); p.px(10, 14 + sq, EYE);
  },

  moorwolf(p, f) {
    const step = f.anim === 'attack' ? 0 : f.i % 2;
    const lunge = f.anim === 'attack' ? [0, -1, 2, 3, 1, 0][f.i] : 0;
    const x = 2 + lunge;
    p.rect(x + 4, 11, 12, 6, '#7b6a58');
    p.rect(x + 4, 11, 12, 2, '#9a8770');
    p.rect(x + 14, 8, 5, 5, '#7b6a58');
    p.rect(x + 18, 10, 3, 2, '#9a8770');
    p.px(x + 16, 9, '#f2d34a');
    p.tri(x + 14, 8, x + 16, 8, x + 15, 5, '#5a4a3a');
    p.line(x + 4, 12, x, 9, '#5a4a3a', 2);
    p.rect(x + 5 + step, 17, 2, 5, '#5a4a3a');
    p.rect(x + 13 - step, 17, 2, 5, '#5a4a3a');
    if (f.anim === 'attack' && f.i >= 2 && f.i <= 3) p.rect(x + 19, 12, 2, 1, '#ffffff');
  },

  kraehe(p, f) {
    const flap = f.anim === 'attack' ? [0, -1, 1, 1, 0, 0][f.i] : [-3, -1, 2, -1][f.i];
    p.ellipse(12, 12, 5, 3, '#3a3a46');
    p.circle(17, 10, 2.5, '#3a3a46');
    p.tri(19, 9, 19, 12, 22, 11, '#f2b630');
    p.px(17, 9, '#ffffff');
    p.tri(8, 11, 15, 11, 10, 11 + flap * 2, '#2a2a34');
    p.tri(6, 12, 9, 12, 3, 14, '#2a2a34');
  },

  knochenritter(p, f) {
    const lunge = f.anim === 'attack' ? [0, -1, 2, 3, 1, 0][f.i] : 0;
    const b = f.b;
    p.rect(9, 15, 2, 7, '#e8e2d0'); p.rect(13, 15, 2, 7, '#e8e2d0');
    p.rect(8, 21, 3, 2, '#6b5a4a'); p.rect(13, 21, 3, 2, '#6b5a4a');
    p.rect(8, 8 + b, 8, 8, '#8a6a4a');
    p.rect(9, 9 + b, 6, 1, '#e8e2d0'); p.rect(9, 11 + b, 6, 1, '#e8e2d0');
    p.ellipse(12, 5 + b, 4, 4, '#e8e2d0');
    p.rect(8, 2 + b, 8, 3, '#7a7f8a');
    p.px(14, 5 + b, EYE); p.px(12, 5 + b, EYE);
    p.rect(11, 8 + b, 3, 1, '#c8c0a8');
    p.rect(16 + lunge, 11 + b, 6, 1, '#cfd6de');
    p.rect(15 + lunge, 10 + b, 1, 3, '#6b4a2e');
    p.rect(4, 9 + b, 4, 8, '#6b4a2e');
    p.rect(5, 10 + b, 2, 6, '#9a7a4a');
  },

  irrlicht(p, f) {
    const bob = [0, -1, -2, -1][f.i % 4];
    const glow = f.i % 2 ? '#d8fbff' : '#9fe8ff';
    p.circle(12, 10 + bob, 5, '#5ab8d8');
    p.circle(12, 10 + bob, 3, glow);
    p.tri(8, 12 + bob, 16, 12 + bob, 6 + (f.i % 2) * 2, 21 + bob, '#5ab8d8');
    p.px(13, 9 + bob, '#24364a'); p.px(11, 9 + bob, '#24364a');
  },

  grabraeuber(p, f) {
    const step = f.anim === 'attack' ? 0 : f.i % 2;
    p.rect(9 + step, 16, 2, 6, '#3a2e4a'); p.rect(13 - step, 16, 2, 6, '#3a2e4a');
    p.rect(8, 9, 8, 8, '#5c4a7a');
    p.ellipse(12, 6, 4, 4, '#4a3a66');
    p.rect(12, 5, 3, 3, SKIN);
    p.px(14, 6, EYE);
    p.rect(11, 7, 4, 1, '#2a1e2e');
    p.ellipse(5, 12, 4, 4, '#b89a6a');
    p.rect(4, 8, 2, 2, '#8a6a3a');
    p.px(5, 12, '#FFD24A');
  },

  feuerkaefer(p, f) {
    const step = f.i % 2;
    p.ellipse(11, 14, 7, 5, '#b8321a');
    p.ellipse(11, 13, 6, 3, f.i % 2 ? '#ffb347' : '#ff7a2a');
    p.line(11, 9, 11, 18, '#7a1e10');
    p.circle(18, 15, 2.5, '#3a1a10');
    p.px(19, 14, '#ffd24a');
    p.line(19, 13, 22, 10, '#3a1a10');
    for (let i = 0; i < 3; i++) p.rect(6 + i * 4 + (i % 2 ? step : -step), 19, 1, 3, '#3a1a10');
  },

  schildtraeger(p, f) {
    const push = f.anim === 'attack' ? [0, -1, 2, 2, 1, 0][f.i] : 0;
    const b = f.b;
    p.rect(7, 16, 3, 6, '#4a3426'); p.rect(12, 16, 3, 6, '#4a3426');
    p.rect(6, 8 + b, 10, 9, '#8a6d3b');
    p.ellipse(11, 5 + b, 4, 4, SKIN);
    p.rect(7, 1 + b, 8, 3, '#7a7f8a');
    p.px(13, 5 + b, EYE);
    // großer Schild vorn
    p.rect(15 + push, 3, 5, 19, '#7a5a32');
    p.rect(16 + push, 4, 3, 17, '#a07a44');
    p.rect(17 + push, 10, 1, 4, '#d9c38c');
  },

  lavaschleim(p, f) {
    const sq = f.anim === 'attack' ? [0, 1, -2, -2, 0, 0][f.i] : [0, 1, 0, 1][f.i];
    p.ellipse(12, 16 + sq / 2, 9 + sq / 2, 7 - sq / 2, '#d8401a');
    p.ellipse(12, 14 + sq / 2, 7, 3, '#ff7a2a');
    p.line(7, 18, 10, 20, '#ffd24a'); p.line(14, 17, 17, 19, '#ffd24a');
    p.rect(14, 11 + sq, 2, 3, '#fff2c0'); p.px(15, 12 + sq, EYE);
    p.rect(9, 11 + sq, 2, 3, '#fff2c0'); p.px(10, 12 + sq, EYE);
  },

  lavaschleim_klein(p, f) {
    const sq = [0, 1, 0, 1][f.i % 4];
    p.ellipse(12, 18 + sq / 2, 5, 4 - sq / 2, '#e8582a');
    p.ellipse(12, 17, 3, 2, '#ffa04a');
    p.px(13, 16 + sq, EYE); p.px(10, 16 + sq, EYE);
  },

  eisgeist(p, f) {
    const bob = [0, -1, -2, -1][f.i % 4];
    p.ellipse(12, 10 + bob, 6, 6, '#dff6ff');
    p.tri(6, 11 + bob, 18, 11 + bob, 9 + (f.i % 2) * 3, 22 + bob, '#bfe9ff');
    p.rect(13, 8 + bob, 2, 2, '#3a6a9a'); p.rect(9, 8 + bob, 2, 2, '#3a6a9a');
    p.tri(4, 4 + bob, 6, 4 + bob, 5, 0 + bob, '#a6e3ff');
    p.tri(18, 4 + bob, 20, 4 + bob, 19, 0 + bob, '#a6e3ff');
  },

  // ----- Bosse (32×32) -----

  borkenkoloss(p, f) {
    const b = f.b;
    const lunge = f.anim === 'attack' ? [0, -2, 3, 4, 2, 0][f.i] : 0;
    p.rect(8, 22, 5, 9, '#5b4630'); p.rect(19, 22, 5, 9, '#5b4630');
    p.rect(6, 9 + b, 20, 15, '#6e5438');
    for (let y = 10; y < 23; y += 3) p.line(8, y + b, 24, y + 1 + b, '#5b4630');
    p.ellipse(16, 8 + b, 11, 5, '#4f7a3a'); // Moos
    p.circle(9, 5 + b, 3, '#5f8f44'); p.circle(22, 4 + b, 3, '#5f8f44');
    p.rect(17, 12 + b, 3, 2, '#f2d34a'); p.rect(11, 12 + b, 3, 2, '#f2d34a');
    p.line(25, 13 + b, 29 + lunge, 18 + b, '#6e5438', 4);
    p.line(7, 13 + b, 3, 19 + b, '#6e5438', 4);
    p.px(30 + lunge, 19 + b, '#4f7a3a');
  },

  graue_aebtissin(p, f) {
    const b = f.b;
    for (let y = 12; y <= 31; y++) {
      const ww = 8 + Math.round((y - 12) * 0.55);
      p.rect(16 - ww / 2, y + (y < 28 ? b : 0), ww, 1, y > 27 ? '#6a6f78' : '#8a8f98');
    }
    p.ellipse(16, 8 + b, 5, 6, '#c8ccd4'); // Schleier
    p.rect(14, 6 + b, 5, 5, '#e8e2d8');
    p.px(17, 8 + b, EYE); p.px(15, 8 + b, EYE);
    const open = f.anim === 'attack' && f.i >= 2 && f.i <= 3;
    p.rect(15, 10 + b, 3, open ? 2 : 1, '#5a4a5a');
    // Kerzenleuchter
    p.rect(23, 14 + b, 1, 9, '#c8a050');
    p.rect(22, 14 + b, 3, 1, '#c8a050');
    p.px(23, 13 + b, f.i % 2 ? '#fff6a0' : '#FFD24A');
    p.px(23, 12 + b, '#ff9a3a');
  },

  magmafuerst(p, f) {
    const b = f.b;
    const lunge = f.anim === 'attack' ? [0, -2, 3, 4, 2, 0][f.i] : 0;
    p.rect(9, 23, 5, 8, '#4a2a22'); p.rect(19, 23, 5, 8, '#4a2a22');
    p.rect(7, 10 + b, 19, 14, '#5a3428');
    p.line(9, 12 + b, 14, 20 + b, '#ff7a2a'); p.line(20, 11 + b, 17, 21 + b, '#ff7a2a'); p.line(12, 16 + b, 22, 15 + b, '#ffb347');
    p.ellipse(16, 7 + b, 6, 5, '#5a3428');
    p.rect(17, 6 + b, 2, 2, '#ffd24a'); p.rect(13, 6 + b, 2, 2, '#ffd24a');
    const fl = f.i % 2;
    p.tri(11, 3 + b, 13, 3 + b, 12, -1 + b + fl, '#ff7a2a');
    p.tri(15, 2 + b, 17, 2 + b, 16, -2 + b - fl, '#ffb347');
    p.tri(19, 3 + b, 21, 3 + b, 20, -1 + b + fl, '#ff7a2a');
    p.line(26, 13 + b, 30 + lunge, 17 + b, '#5a3428', 4);
    p.line(7, 13 + b, 3, 18 + b, '#5a3428', 4);
  },

  winterkoenigin(p, f) {
    const b = f.b;
    for (let y = 13; y <= 31; y++) {
      const ww = 8 + Math.round((y - 13) * 0.75);
      p.rect(16 - ww / 2, y + (y < 29 ? b : 0), ww, 1, y % 4 === 0 ? '#bfe9ff' : '#dff6ff');
    }
    p.ellipse(16, 8 + b, 4, 5, '#f4f8ff');
    p.rect(13, 4 + b, 7, 3, '#ffffff'); // Haar
    p.px(17, 8 + b, '#3a6a9a'); p.px(15, 8 + b, '#3a6a9a');
    // Eiskrone
    for (let i = 0; i < 4; i++) p.tri(12 + i * 2.5, 3 + b, 14 + i * 2.5, 3 + b, 13 + i * 2.5, (i % 2 ? -1 : 0) + b, '#a6e3ff');
    // Zepter
    const raise = f.anim === 'attack' ? [0, 2, 4, 4, 2, 0][f.i] : 0;
    p.rect(24, 9 - raise + b, 1, 15, '#c8e8ff');
    p.tri(22, 9 - raise + b, 27, 9 - raise + b, 24.5, 3 - raise + b, f.i % 2 ? '#ffffff' : '#a6e3ff');
  },
};

// ---------------------------------------------------------------------------
// Truhen (32×24), Deckel offen/zu
// ---------------------------------------------------------------------------

export const CHEST_ART = {
  holzkiste(p, open) {
    const wood = '#8b5a2b', dark = '#5e3a1a', iron = '#5d6572';
    p.rect(3, 11, 26, 12, wood);
    for (let x = 3; x < 29; x += 6) p.rect(x, 11, 1, 12, dark);
    p.rect(3, 15, 26, 2, iron); p.rect(3, 21, 26, 2, iron);
    p.rect(14, 13, 4, 5, '#9aa3ad'); p.px(15, 15, '#2a1e2e');
    if (open) { p.rect(3, 2, 26, 4, shade(wood, -0.2)); p.rect(3, 6, 26, 2, iron); }
    else { p.rect(3, 5, 26, 7, shade(wood, 0.1)); p.rect(3, 9, 26, 2, iron); p.rect(3, 5, 26, 1, shade(wood, 0.3)); }
  },
  silberkiste(p, open) {
    const silver = '#b8c4d0', dark = '#7a8794';
    p.rect(3, 11, 26, 12, silver);
    p.rect(3, 11, 26, 1, '#e8eef4');
    p.rect(3, 21, 26, 2, dark); p.rect(3, 15, 26, 1, dark);
    p.rect(14, 13, 4, 5, '#3E8EDE'); p.px(15, 14, '#a6e3ff');
    p.rect(6, 17, 2, 2, '#3E8EDE'); p.rect(24, 17, 2, 2, '#3E8EDE');
    if (open) { p.rect(3, 2, 26, 4, dark); p.rect(13, 3, 6, 2, '#3E8EDE'); }
    else { p.ellipse(16, 8, 13, 4, silver); p.rect(3, 8, 26, 4, silver); p.rect(13, 6, 6, 3, '#3E8EDE'); p.rect(3, 10, 26, 1, dark); }
  },
  sternenkiste(p, open) {
    const blue = '#2a2f7a', dark = '#1a1e50';
    p.rect(3, 11, 26, 12, blue);
    p.rect(3, 21, 26, 2, '#F2B630'); p.rect(3, 11, 26, 1, '#F2B630');
    for (const [x, y] of [[6, 14], [10, 18], [21, 13], [25, 17], [17, 19]]) p.px(x, y, '#fff6a0');
    p.line(6, 14, 10, 18, '#7a84ff'); p.line(21, 13, 25, 17, '#7a84ff');
    p.rect(14, 13, 4, 5, '#F2B630');
    if (open) { p.rect(3, 2, 26, 4, dark); }
    else { p.ellipse(16, 8, 13, 4, blue); p.rect(3, 8, 26, 4, blue); p.px(9, 7, '#fff6a0'); p.px(22, 6, '#fff6a0'); p.px(16, 5, '#fff6a0'); p.rect(3, 10, 26, 1, '#F2B630'); }
  },
};

// ---------------------------------------------------------------------------
// Symbole (12×12): Rollen, Zauber, Status
// ---------------------------------------------------------------------------

export const ICON_ART = {
  sword(p) { p.line(2, 10, 9, 3, '#dfe6ee', 2); p.line(2, 7, 5, 10, '#c9a45c', 2); p.px(10, 2, '#ffffff'); },
  shield(p) { p.rect(2, 1, 8, 6, '#3E8EDE'); p.tri(2, 7, 10, 7, 6, 11, '#3E8EDE'); p.rect(5, 2, 2, 7, '#e8eef4'); },
  bow(p) { p.line(3, 1, 3, 11, '#9a6b3e'); p.line(3, 1, 8, 4, '#9a6b3e'); p.line(8, 4, 8, 8, '#9a6b3e'); p.line(8, 8, 3, 11, '#9a6b3e'); p.line(3, 6, 11, 6, '#dfe6ee'); },
  staff(p) { p.line(2, 11, 8, 4, '#9a6b3e', 2); p.circle(9, 3, 2, '#5AA9F0'); p.px(9, 2, '#ffffff'); },
  heart(p) { p.circle(4, 4, 2.5, '#E04848'); p.circle(8, 4, 2.5, '#E04848'); p.tri(1.5, 5, 10.5, 5, 6, 10.5, '#E04848'); p.px(3, 3, '#ffb0b0'); },
  rock(p) { p.circle(6, 7, 4, '#8d7b68'); p.circle(4, 5, 2, '#a89580'); p.px(8, 8, '#5e4e3e'); p.line(9, 1, 7, 3, '#ffd24a'); },
  coin(p) { p.circle(6, 6, 4.5, '#FFD24A'); p.circle(6, 6, 3, '#f2b630'); p.rect(5, 4, 2, 5, '#fff2a0'); },
  ice(p) { p.tri(6, 0, 9, 6, 3, 6, '#a6e3ff'); p.tri(3, 6, 9, 6, 6, 12, '#5AA9F0'); p.px(6, 4, '#ffffff'); },
  horn(p) { p.tri(1, 4, 1, 8, 10, 6, '#d35400'); p.circle(10, 6, 2, '#e8803a'); p.rect(1, 5, 2, 2, '#c9a45c'); },
  skull(p) { p.circle(6, 5, 4, '#e8e2f0'); p.rect(4, 8, 5, 3, '#e8e2f0'); p.rect(4, 4, 2, 2, '#A55CE0'); p.rect(7, 4, 2, 2, '#A55CE0'); p.px(6, 7, '#7a4aa0'); },
  slow(p) { p.line(6, 1, 6, 11, '#a6e3ff'); p.line(1, 6, 11, 6, '#a6e3ff'); p.line(2, 2, 10, 10, '#5AA9F0'); p.line(10, 2, 2, 10, '#5AA9F0'); },
  burn(p) { p.tri(2, 11, 10, 11, 6, 1, '#ff7a2a'); p.tri(4, 11, 8, 11, 6, 5, '#ffd24a'); },
  stun(p) { p.tri(6, 0, 8, 5, 4, 5, '#FFD24A'); p.tri(2, 4, 10, 4, 6, 8, '#FFD24A'); p.tri(6, 7, 3, 11, 5, 6, '#FFD24A'); p.tri(6, 7, 9, 11, 7, 6, '#FFD24A'); },
  vuln(p) { ICON_ART.skull(p); },
  lock(p) { p.rect(2, 5, 8, 6, '#c9a45c'); p.rect(3, 1, 1, 5, '#9a9a9a'); p.rect(8, 1, 1, 5, '#9a9a9a'); p.rect(3, 1, 6, 1, '#9a9a9a'); p.px(5, 7, '#3a2a1a'); p.px(6, 7, '#3a2a1a'); },
  crown(p) { p.rect(1, 6, 10, 4, '#F2B630'); p.tri(1, 6, 3, 6, 1, 2, '#F2B630'); p.tri(5, 6, 7, 6, 6, 1, '#F2B630'); p.tri(9, 6, 11, 6, 11, 2, '#F2B630'); p.px(6, 8, '#E04848'); },
  rune(p) { p.circle(6, 6, 5, '#C9A45C'); p.circle(6, 6, 3.5, '#1E1B2E'); p.line(6, 3, 6, 9, '#FFD24A'); p.line(4, 5, 8, 7, '#FFD24A'); p.px(6, 6, '#ffffff'); },
  crystal(p) { p.tri(6, 0, 11, 5, 1, 5, '#c58cff'); p.tri(1, 5, 11, 5, 6, 12, '#A55CE0'); p.line(6, 1, 6, 10, '#e8d0ff'); },
  chest(p) { p.rect(1, 4, 10, 7, '#8b5a2b'); p.rect(1, 3, 10, 3, '#a8703a'); p.rect(1, 6, 10, 1, '#5d6572'); p.rect(5, 5, 2, 3, '#FFD24A'); },
  tower(p) { p.rect(3, 3, 6, 9, '#8d97a6'); p.rect(2, 1, 2, 3, '#8d97a6'); p.rect(5, 1, 2, 3, '#8d97a6'); p.rect(8, 1, 2, 3, '#8d97a6'); p.rect(5, 8, 2, 4, '#3a2a22'); },
};

// ---------------------------------------------------------------------------
// Turm (45×90, im Spiel ×4 = 180×360)
// ---------------------------------------------------------------------------

export function TOWER_ART(p) {
  const stone = '#8a8fa0', stone2 = '#767b8c', mortar = '#5d6272';
  p.rect(4, 14, 37, 76, stone);
  for (let y = 16; y < 90; y += 6) {
    p.rect(4, y, 37, 1, mortar);
    const off = (y / 6) % 2 ? 0 : 5;
    for (let x = 4 + off; x < 41; x += 10) p.rect(x, y - 5, 1, 5, mortar);
  }
  p.rect(4, 14, 3, 76, stone2);
  p.rect(38, 14, 3, 76, '#a0a5b5');
  // Zinnen
  p.rect(2, 8, 41, 7, stone);
  for (let x = 2; x < 43; x += 8) p.rect(x, 3, 5, 5, stone);
  p.rect(2, 14, 41, 1, mortar);
  // Fenster mit warmem Licht
  p.rect(18, 30, 9, 12, '#3a2a1e');
  p.rect(19, 31, 7, 10, '#ffd24a');
  p.rect(22, 31, 1, 10, '#3a2a1e');
  p.rect(19, 35, 7, 1, '#3a2a1e');
  p.rect(10, 52, 5, 7, '#3a2a1e');
  p.rect(11, 53, 3, 5, '#e8a83a');
  // Tor
  p.ellipse(22, 76, 8, 6, '#4a3020');
  p.rect(14, 76, 16, 14, '#4a3020');
  p.rect(16, 76, 1, 14, '#5e3e28'); p.rect(21, 72, 1, 18, '#5e3e28'); p.rect(26, 76, 1, 14, '#5e3e28');
  p.px(25, 82, '#c9a45c');
  // Fahne
  p.rect(30, 0, 1, 8, '#5a4632');
  p.rect(31, 0, 8, 4, '#C9A45C');
  p.rect(31, 4, 6, 1, '#a8853c');
  p.px(34, 1, '#E04848');
}

// ===========================================================================
// v0.3: Neues Roster (Draufsicht mit leichter Neigung – Figuren von schräg vorn)
// ===========================================================================

Object.assign(HERO_ART, {
  /** Junger Stallbursche mit Strohhaar und Knüppel. */
  stalljunge(p, f) {
    const a = body(p, f, { w: 9, cloth: '#9a7a4a', legs: '#5e4a2e', top: 16 });
    p.rect(a.hx - 4, a.hy - 4, 8, 3, '#e8c860');
    p.px(a.hx - 4, a.hy - 1, '#e8c860'); p.px(a.hx + 3, a.hy - 2, '#e8c860');
    const ang = f.anim === 'attack' ? [-2.2, -2.5, -1.0, 0.3, 0.5, 0.0][f.i] : -1.2;
    const hand = { x: a.hand.x + 1, y: a.hand.y - 1 };
    arm(p, a.shoulder, hand, '#9a7a4a');
    p.ray(hand.x, hand.y, ang, 8, '#7a5a3a', 2);
  },
  /** Entwickelte Form: Helm, Brustplatte, Schwert. */
  waffenknecht(p, f) {
    const a = body(p, f, { w: 11, cloth: '#7d8590', legs: '#4e5562', top: 15 });
    p.ellipse(a.hx, a.hy - 1, 5, 4, '#a7b1bf');
    p.rect(a.hx - 5, a.hy, 10, 1, '#5d6572');
    p.rect(a.x - 3, a.top + 2, 6, 5, '#c9a45c');
    const ang = f.anim === 'attack' ? [-2.2, -2.5, -1.0, 0.3, 0.5, 0.0][f.i] : -1.1;
    const hand = { x: a.hand.x + 1, y: a.hand.y - 1 };
    arm(p, a.shoulder, hand, '#7d8590');
    p.ray(hand.x, hand.y, ang, 10, '#e6eef6', 2);
  },
  /** Schleuderin mit Zopf. */
  schleuderin(p, f) {
    const a = body(p, f, { w: 8, cloth: '#5f8f6a', legs: '#4a3a2a', top: 16, robe: true, robeW: 11 });
    p.ellipse(a.hx - 1, a.hy - 2, 4, 3, '#a0522d');
    p.rect(a.hx - 5, a.hy - 1, 2, 7, '#a0522d');
    p.px(a.hx - 5, a.hy + 6, '#e04848');
    const pull = f.pull ?? 0;
    const hand = { x: a.hand.x + 3, y: a.hand.y - 2 };
    arm(p, a.shoulder, hand, '#5f8f6a');
    p.line(hand.x, hand.y, hand.x + 2, hand.y - 3, '#6b4423');
    p.line(hand.x, hand.y, hand.x + 3, hand.y - 1, '#6b4423');
    const bx = hand.x - pull * 2;
    p.line(hand.x + 2, hand.y - 3, bx, hand.y - 1, '#d8d0c0');
    if (f.anim !== 'attack' || f.i < 4) p.px(bx, hand.y - 1, '#9a9a9a');
  },
  /** Torwächterin: Plattenrüstung, Federbusch, großer Schild. */
  torwaechterin(p, f) {
    HERO_ART.torwaechter(p, f);
    const b = f.b;
    p.rect(13, 1 + b, 2, 4, '#e04848');
    p.rect(12, 9 + b, 1, 5, '#c08040');
  },
  /** Windläufer: Kapuze, flatternder türkiser Schal, zwei kurze Klingen. */
  windlaeufer(p, f) {
    const lunge = f.anim === 'attack' ? [0, -1, 3, 4, 2, 0][f.i] : 0;
    const a = body(p, f, { x: 15 + lunge, w: 8, cloth: '#3f6a7a', legs: '#2a3a44', top: 16 });
    p.ellipse(a.hx, a.hy - 1, 4, 4, '#2a4a58');
    p.rect(a.hx - 1, a.hy - 1, 4, 3, SKIN);
    p.px(a.hx + 1, a.hy, EYE);
    const wave = f.i % 2;
    p.line(a.x - 3, a.top + 1, a.x - 11, a.top - 1 + wave * 2, '#7fd3c0', 2);
    p.line(a.x - 11, a.top - 1 + wave * 2, a.x - 14, a.top + 2, '#7fd3c0');
    const hand = { x: a.hand.x + 2, y: a.hand.y - 1 };
    arm(p, a.shoulder, hand, '#3f6a7a');
    p.line(hand.x, hand.y, hand.x + 5, hand.y - 2, '#e6eef6');
    p.line(a.x - 3, a.top + 7, a.x - 7, a.top + 5, '#e6eef6');
  },
  /** Glutweberin: rote Robe, Feuerkugel in der Hand. */
  glutweberin(p, f) {
    const a = body(p, f, { w: 9, cloth: '#b8321a', robe: true, robeW: 15, top: 16, belt: '#f2b630' });
    p.ellipse(a.hx, a.hy - 2, 5, 4, '#2a1a14');
    p.rect(a.hx - 1, a.hy - 1, 4, 4, SKIN);
    p.px(a.hx + 1, a.hy, EYE);
    const hand = { x: a.hand.x + 2, y: a.hand.y - 2 };
    arm(p, a.shoulder, hand, '#b8321a');
    const grow = f.anim === 'attack' ? [1, 2, 3, 3, 1, 0][f.i] : 0;
    p.circle(hand.x + 2, hand.y - 3, 2 + grow * 0.6, f.i % 2 ? '#ffd24a' : '#ff7a2a');
    p.px(hand.x + 2, hand.y - 3, '#fff6c0');
  },
  /** Bannerträger: Soldat mit hohem Banner. */
  bannertraeger(p, f) {
    const a = body(p, f, { w: 10, cloth: '#7a2a2a', legs: '#3a2a22', top: 16 });
    p.rect(a.hx - 4, a.hy - 4, 8, 2, '#5d6572');
    const sway = f.anim === 'attack' ? [0, -1, 1, 2, 1, 0][f.i] : (f.i % 2);
    const hand = { x: a.hand.x + 1, y: a.hand.y };
    arm(p, a.shoulder, hand, '#7a2a2a');
    p.rect(hand.x + 1, 2, 1, hand.y, '#8a6038');
    p.rect(hand.x + 2, 2 + sway, 8, 6, '#c0392b');
    p.rect(hand.x + 2, 8 + sway, 6, 2, '#a02a1e');
    p.rect(hand.x + 5, 4 + sway, 2, 2, '#f2b630');
  },
  /** Moorhexer: gebückt, grüne Kapuze, blubbernde Flasche. */
  moorhexer(p, f) {
    const a = body(p, f, { x: 15, w: 10, cloth: '#4f6a3a', robe: true, robeW: 15, top: 17 });
    p.ellipse(a.hx, a.hy - 1, 5, 5, '#3a5a2a');
    p.rect(a.hx, a.hy - 1, 3, 3, '#b8d8a0');
    p.px(a.hx + 2, a.hy, '#e8f060');
    const hand = { x: a.hand.x + 2, y: a.hand.y };
    arm(p, a.shoulder, hand, '#4f6a3a');
    const lift = f.anim === 'attack' ? [0, -2, -3, 1, 1, 0][f.i] : 0;
    p.rect(hand.x, hand.y - 3 + lift, 4, 4, '#7a9a5a');
    p.rect(hand.x + 1, hand.y - 5 + lift, 2, 2, '#c8b88a');
    p.px(hand.x + 1 + (f.i % 2), hand.y - 7 + lift, '#b8f060');
  },
  /** Wolkenhirtin: hellblaues Kleid, Hirtenstab mit kleiner Wolke. */
  wolkenhirtin(p, f) {
    const a = body(p, f, { w: 9, cloth: '#9fb8e8', robe: true, robeW: 15, top: 16, belt: '#ffffff' });
    p.ellipse(a.hx - 1, a.hy - 2, 5, 3, '#f0f0ff');
    const hand = { x: a.hand.x + 2, y: a.hand.y };
    arm(p, a.shoulder, hand, '#9fb8e8');
    p.rect(hand.x + 1, hand.y - 12, 1, 17, '#8a6038');
    p.line(hand.x + 1, hand.y - 12, hand.x + 4, hand.y - 14, '#8a6038');
    const bob = f.i % 2;
    p.ellipse(hand.x + 6, hand.y - 18 - bob, 4, 2, '#ffffff');
    p.ellipse(hand.x + 3, hand.y - 17 - bob, 2, 2, '#e8f0ff');
  },
  /** Grenzgänger: Flackerling – verschobene Farbkanäle. */
  flackerling(p, f) {
    const o = f.i % 2 ? 1 : -1;
    for (const [dx, col] of [[o, '#2EE6D6'], [-o, '#E62E9A']]) {
      p.ellipse(16 + dx, 18, 6, 9, col);
      p.circle(16 + dx, 8 + f.b, 4, col);
    }
    p.ellipse(16, 18, 5, 8, '#1a1a2a');
    p.circle(16, 8 + f.b, 3, '#1a1a2a');
    p.rect(14, 7 + f.b, 1, 2, '#ffffff'); p.rect(17, 7 + f.b, 1, 2, '#ffffff');
    for (let i = 0; i < 4; i++) p.rect(8 + ((f.i * 7 + i * 5) % 16), 4 + i * 6, 3, 1, i % 2 ? '#2EE6D6' : '#E62E9A');
  },
  /** Grenzgänger: Spiegelsplitter – kantige Kristallgestalt. */
  spiegelsplitter(p, f) {
    const lunge = f.anim === 'attack' ? [0, -1, 2, 3, 1, 0][f.i] : 0;
    p.tri(16 + lunge, 2 + f.b, 24 + lunge, 18, 8 + lunge, 18, '#E62E9A');
    p.tri(8 + lunge, 18, 24 + lunge, 18, 16 + lunge, 30, '#a01e6a');
    p.line(16 + lunge, 3 + f.b, 16 + lunge, 28, '#ffd0f0');
    p.rect(14 + lunge, 10 + f.b, 2, 2, '#2EE6D6'); p.rect(18 + lunge, 10 + f.b, 2, 2, '#2EE6D6');
    p.tri(24 + lunge, 12, 30 + lunge, 8, 28 + lunge, 16, '#ff7ac8');
  },
  /** Grenzgänger: Leerläufer – Kapuze voller Sterne. */
  leerlaeufer(p, f) {
    const a = body(p, f, { w: 11, cloth: '#2a1a5a', robe: true, robeW: 17, top: 15, belt: '#7a4aff' });
    p.ellipse(a.hx, a.hy - 1, 5, 5, '#1a0e3a');
    p.ellipse(a.hx + 1, a.hy, 3, 3, '#000010');
    p.px(a.hx, a.hy - 1, '#ffffff'); p.px(a.hx + 2, a.hy + 1, '#7a4aff');
    for (let i = 0; i < 5; i++) p.px(a.x - 5 + i * 2 + ((f.i + i) % 2), a.top + 4 + i * 2, '#c8b8ff');
    const r = 2 + (f.i % 2);
    p.circle(a.x + 10, 8, r, '#7a4aff');
    p.circle(a.x + 10, 8, r - 1, '#000010');
  },
  /** Rostgolem: klobiger rostiger Golem. */
  rostgolem(p, f) {
    const b = f.b;
    const lunge = f.anim === 'attack' ? [0, -1, 2, 3, 1, 0][f.i] : 0;
    p.rect(9, 24, 5, 7, '#6a3a22'); p.rect(18, 24, 5, 7, '#6a3a22');
    p.rect(7, 11 + b, 18, 14, '#8a5a3a');
    p.rect(9, 13 + b, 3, 3, '#a8703a'); p.rect(19, 17 + b, 4, 3, '#5e3a22');
    p.ellipse(16, 8 + b, 5, 4, '#7a4a2a');
    p.rect(17, 7 + b, 2, 2, '#ff9a3a');
    p.line(25, 14 + b, 28 + lunge, 20 + b, '#8a5a3a', 4);
    p.line(7, 14 + b, 4, 20 + b, '#8a5a3a', 4);
  },
  /** Skelettkrieger (freundlich): Knochen, kleiner Schild, Schwert. */
  skelettkrieger(p, f) {
    const b = f.b;
    const lunge = f.anim === 'attack' ? [0, -1, 2, 3, 1, 0][f.i] : 0;
    p.rect(13, 20, 2, 9, '#e8e2d0'); p.rect(17, 20, 2, 9, '#e8e2d0');
    p.rect(12, 12 + b, 8, 8, '#e8e2d0');
    p.rect(13, 13 + b, 6, 1, '#b8b0a0'); p.rect(13, 15 + b, 6, 1, '#b8b0a0'); p.rect(13, 17 + b, 6, 1, '#b8b0a0');
    p.ellipse(16, 8 + b, 4, 4, '#f0ead8');
    p.px(17, 8 + b, EYE); p.px(15, 8 + b, EYE);
    p.rect(20 + lunge, 13 + b, 7, 1, '#cfd6de');
    p.rect(8, 13 + b, 4, 6, '#6b4a2e');
  },
});

Object.assign(ENEMY_ART, {
  moorling(p, f) { ENEMY_ART.schlammling(p, f); },
  /** Sumpfratte: klein, flink, langer Schwanz. */
  sumpfratte(p, f) {
    const step = f.anim === 'attack' ? 0 : f.i % 2;
    const lunge = f.anim === 'attack' ? [0, -1, 2, 3, 1, 0][f.i] : 0;
    const x = 3 + lunge;
    p.ellipse(x + 10, 15, 6, 4, '#6a5a4a');
    p.ellipse(x + 16, 13, 3, 3, '#7a6a58');
    p.px(x + 17, 12, '#ff4a4a');
    p.px(x + 19, 14, '#d8a8a0');
    p.circle(x + 15, 10, 1.5, '#b88a80');
    p.line(x + 4, 15, x, 12, '#b88a80');
    p.rect(x + 7 + step, 18, 1, 3, '#4a3a2a'); p.rect(x + 13 - step, 18, 1, 3, '#4a3a2a');
  },
  /** Frostwolf: heller Wolf mit Eiskristallen. */
  frostwolf(p, f) {
    ENEMY_ART.moorwolf(p, f);
    const lunge = f.anim === 'attack' ? [0, -1, 2, 3, 1, 0][f.i] : 0;
    p.rect(6 + lunge, 11, 12, 2, '#e8f4ff');
    p.tri(8 + lunge, 11, 10 + lunge, 11, 9 + lunge, 8, '#a6e3ff');
    p.tri(12 + lunge, 11, 14 + lunge, 11, 13 + lunge, 8, '#a6e3ff');
  },
  /** Boss: Der Trommler – massige Moorkreatur mit großer Trommel. */
  trommler(p, f) {
    const b = f.b;
    const hit = f.anim === 'attack' ? [0, -2, -3, 2, 1, 0][f.i] : 0;
    p.rect(9, 24, 5, 7, '#4a3a2a'); p.rect(18, 24, 5, 7, '#4a3a2a');
    p.ellipse(16, 16 + b, 10, 9, '#6a7a3a');
    p.ellipse(16, 7 + b, 6, 5, '#7a8a4a');
    p.rect(13, 6 + b, 2, 2, '#ffd24a'); p.rect(18, 6 + b, 2, 2, '#ffd24a');
    p.rect(14, 10 + b, 4, 1, '#3a2a1a');
    // Trommel vor dem Bauch
    p.ellipse(16, 20 + b, 8, 4, '#8a5a3a');
    p.ellipse(16, 18 + b, 8, 3, '#e8d8b0');
    p.line(9, 18 + b, 23, 21 + b, '#c0392b');
    // Schlegel
    p.line(25, 12 + b + hit, 20, 17 + b + hit, '#d8c8a0', 2);
    p.circle(20, 17 + b + hit, 1.5, '#c0392b');
    p.line(7, 12 + b - hit, 12, 17 + b - hit, '#d8c8a0', 2);
  },
  /** Boss: Der Schmied – breiter Schmied mit Lederschürze und Riesenhammer. */
  schmied(p, f) {
    const b = f.b;
    const up = f.anim === 'attack' ? [0, -3, -5, 2, 3, 0][f.i] : 0;
    p.rect(9, 24, 6, 7, '#3a2a22'); p.rect(18, 24, 6, 7, '#3a2a22');
    p.rect(7, 11 + b, 19, 14, '#a05a3a');
    p.rect(11, 13 + b, 11, 12, '#5e3a22');
    p.ellipse(16, 7 + b, 5, 5, '#d9a274');
    p.ellipse(16, 10 + b, 5, 3, '#3a2a22');
    p.rect(17, 6 + b, 2, 1, EYE); p.rect(14, 6 + b, 2, 1, EYE);
    p.rect(10, 3 + b, 12, 2, '#5d6572');
    p.line(26, 14 + b, 29, 8 + b + up, '#8a6038', 2);
    p.rect(26, 3 + b + up, 6, 5, '#5d6572');
    p.rect(26, 3 + b + up, 6, 1, '#ff7a2a');
    p.line(7, 14 + b, 4, 20 + b, '#d9a274', 3);
  },
});

/** Pack auf dem Feld (16×21 → ×3 ≈ 48×64): foliertes Päckchen mit gezackten Rändern und Emblem. */
export function PACK_ART(p, color, emblem = '#FFD24A') {
  const dark = shade(color, -0.35), light = shade(color, 0.35);
  p.rect(1, 2, 14, 17, color);
  for (let x = 1; x < 15; x += 2) { p.px(x, 1, dark); p.px(x + 1, 2, dark); p.px(x, 19, dark); p.px(x + 1, 18, dark); }
  p.rect(1, 4, 14, 1, light);
  p.rect(1, 16, 14, 1, dark);
  p.rect(3, 5, 2, 10, light); // Folienglanz
  p.circle(8.5, 10, 3, emblem);
  p.circle(8.5, 10, 1.5, shade(emblem, -0.3));
}

/** Zauberbuch (16×16), Farbe = Seltenheit. */
export function TOME_ART(p, color, open = false) {
  if (open) {
    p.rect(1, 5, 7, 8, '#f4ebd9'); p.rect(8, 5, 7, 8, '#e8dcc0');
    p.rect(7, 4, 2, 10, shade(color, -0.3));
    for (let y = 7; y < 12; y += 2) { p.rect(2, y, 4, 1, '#b3a990'); p.rect(10, y, 4, 1, '#b3a990'); }
  } else {
    p.rect(3, 2, 10, 12, color);
    p.rect(3, 2, 2, 12, shade(color, -0.3));
    p.rect(12, 3, 1, 10, '#f4ebd9');
    p.rect(6, 5, 5, 5, shade(color, 0.4));
    p.px(8, 7, '#ffffff');
  }
}

/** Gebäude (24×24). */
export const BUILDING_ART = {
  taverne(p) {
    p.rect(3, 10, 18, 12, '#8b5a2b');
    p.tri(1, 11, 23, 11, 12, 2, '#a0412b');
    p.rect(9, 15, 5, 7, '#4a3020');
    p.rect(15, 13, 4, 3, '#ffd24a');
    p.rect(4, 13, 4, 3, '#ffd24a');
    p.rect(19, 6, 3, 4, '#5d6572');
  },
  kaserne(p) {
    p.rect(2, 8, 20, 14, '#8a8fa0');
    for (let x = 2; x < 22; x += 4) p.rect(x, 5, 2, 3, '#8a8fa0');
    p.rect(9, 14, 6, 8, '#4a3020');
    p.rect(11, 0, 1, 6, '#5a4632');
    p.rect(12, 0, 5, 3, '#3E8EDE');
  },
  sternwarte(p) {
    p.rect(6, 10, 12, 12, '#6a6f80');
    p.ellipse(12, 10, 7, 5, '#3b2f7a');
    p.line(13, 8, 20, 3, '#c9a45c', 2);
    p.px(5, 3, '#fff6a0'); p.px(19, 9, '#fff6a0'); p.px(3, 12, '#fff6a0');
    p.rect(10, 16, 4, 6, '#2a1e3a');
  },
};

/** Turm in Draufsicht-Neigung (30×40 → ×4 = 120×160). cracks = 0–3 Riss-Stufen. */
export function TOWER_TOP_ART(p, cracks = 0) {
  const stone = '#8a8fa0', dark = '#6a6f80', mortar = '#5d6272';
  p.ellipse(15, 37, 13, 3, 'rgba(0,0,0,0.35)');
  p.rect(4, 12, 22, 26, stone);
  for (let y = 14; y < 38; y += 5) {
    p.rect(4, y, 22, 1, mortar);
    const off = (y / 5) % 2 ? 0 : 4;
    for (let x = 4 + off; x < 26; x += 8) p.rect(x, y - 4, 1, 4, mortar);
  }
  p.rect(4, 12, 3, 26, dark);
  p.ellipse(15, 11, 13, 5, '#9a9fb0'); // Plattform von oben
  p.ellipse(15, 11, 10, 3, '#b0b5c4');
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.rect(15 + Math.cos(a) * 11.5 - 1, 11 + Math.sin(a) * 4.2 - 2, 3, 3, stone); }
  p.rect(13, 28, 5, 10, '#4a3020');
  p.rect(12, 18, 6, 6, '#3a2a1e'); p.rect(13, 19, 4, 4, '#ffd24a');
  p.rect(14, 2, 1, 8, '#5a4632'); p.rect(15, 2, 6, 3, '#C9A45C'); p.px(17, 3, '#E04848');
  const crackCol = '#2a2430';
  if (cracks >= 1) { p.line(7, 15, 10, 21, crackCol); p.line(10, 21, 8, 25, crackCol); }
  if (cracks >= 2) { p.line(22, 16, 19, 22, crackCol); p.line(19, 22, 23, 27, crackCol); p.line(6, 30, 10, 33, crackCol); }
  if (cracks >= 3) { p.line(15, 13, 13, 17, crackCol); p.line(24, 30, 20, 35, crackCol); p.rect(5, 12, 3, 2, '#141220'); p.rect(22, 12, 4, 2, '#141220'); }
}

Object.assign(ICON_ART, {
  clock(p) { p.circle(6, 6, 5, '#F2B630'); p.circle(6, 6, 3.5, '#fff6dc'); p.line(6, 6, 6, 3, '#2a1e2e'); p.line(6, 6, 8, 7, '#2a1e2e'); },
  book(p) { p.rect(2, 1, 8, 10, '#A55CE0'); p.rect(2, 1, 2, 10, '#6a3a9a'); p.rect(9, 2, 1, 8, '#f4ebd9'); p.px(6, 5, '#ffffff'); },
  hammer(p) { p.line(3, 10, 8, 5, '#8a6038', 2); p.rect(6, 1, 5, 4, '#5d6572'); p.rect(6, 1, 5, 1, '#ff7a2a'); },
  medal(p) { p.line(4, 0, 6, 4, '#c0392b'); p.line(8, 0, 6, 4, '#c0392b'); p.circle(6, 7, 4, '#c8ccd4'); p.circle(6, 7, 2, '#8a8f98'); },
  quest(p) { p.rect(2, 1, 8, 10, '#e8dcc0'); p.rect(3, 3, 6, 1, '#8a6a3a'); p.rect(3, 5, 6, 1, '#8a6a3a'); p.rect(3, 7, 4, 1, '#8a6a3a'); p.px(8, 9, '#E04848'); },
  relic(p) { p.tri(6, 0, 11, 5, 1, 5, '#F2B630'); p.tri(1, 5, 11, 5, 6, 11, '#c9a45c'); p.px(6, 4, '#ffffff'); },
  settings(p) { p.circle(6, 6, 4.5, '#9a9fb0'); p.circle(6, 6, 2, '#1E1B2E'); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; p.rect(6 + Math.cos(a) * 5 - 1, 6 + Math.sin(a) * 5 - 1, 2, 2, '#9a9fb0'); } },
  arrow(p) { for (let y = 0; y < 10; y++) p.rect(0, y, Math.max(1, Math.min(y + 1, 7 - Math.max(0, y - 6))), 1, '#F4EBD9'); p.line(0, 0, 0, 10, '#1E1B2E'); },
});
