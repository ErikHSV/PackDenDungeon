// Sprite-Bank: erzeugt und cached alle Animations-Frames.
// Frames pro Figur: idle (4), attack (6), hit (2, weißes Aufblitzen), death (5, Zerfall in Funken).
//
// Später echte Grafiken: in heroes.json / enemies.json ein Feld
//   "spriteSheet": { "src": "assets/held.png", "frame": 32, "rows": { "idle": 0, "attack": 1, "hit": 2, "death": 3 } }
// angeben. Dann wird das Sheet geladen und ersetzt die Platzhalter automatisch.
import { Pix, outline, whiteOut, upscale, hash, makeCanvas } from './pixel.js';
import { HERO_ART, ENEMY_ART, CHEST_ART, ICON_ART, TOWER_ART } from './spriteArt.js';

export const ANIM = { idle: 4, attack: 6, hit: 2, death: 5 };
const BREATH = [0, 1, 1, 0];
const PULL = [0, 1, 2, 2, 0, 0];
const OUTLINE = '#1a1422';
const ELITE_OUTLINE = '#E04848';

function pose(anim, i) {
  return { anim, i, b: anim === 'idle' ? BREATH[i] : 0, pull: anim === 'attack' ? PULL[i] : 0 };
}

/** Zerfall in Funken: Pixel verschwinden nach und nach, Funken steigen auf. */
function deathFrames(base) {
  const w = base.width, h = base.height;
  const src = base.getContext('2d').getImageData(0, 0, w, h).data;
  const frames = [];
  for (let k = 1; k <= ANIM.death; k++) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const d = img.data;
    const cut = k / (ANIM.death + 0.5);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] < 40) continue;
      const r = hash(x, y, 7);
      if (r > cut) {
        d[i] = src[i]; d[i + 1] = src[i + 1]; d[i + 2] = src[i + 2]; d[i + 3] = src[i + 3];
      } else if (r > cut - 0.12) {
        // Funke: nach oben versetzt, warm leuchtend
        const ny = y - Math.round(k * h * 0.06 + hash(x, y, 3) * 3);
        const nx = x + Math.round((hash(x, y, 5) - 0.5) * 4);
        if (ny >= 0 && nx >= 0 && nx < w) {
          const j = (ny * w + nx) * 4;
          const warm = hash(x, y, 9) > 0.5;
          d[j] = 255; d[j + 1] = warm ? 210 : 245; d[j + 2] = warm ? 74 : 180; d[j + 3] = 255;
        }
      }
    }
    g.putImageData(img, 0, 0);
    frames.push(c);
  }
  return frames;
}

function buildFrames(draw, size, { flip = false, outlineColor = OUTLINE, scale = 1 } = {}) {
  const make = (anim, i) => {
    const p = new Pix(size);
    p.flip = flip;
    draw(p, pose(anim, i));
    outline(p.c, outlineColor);
    return scale > 1 ? upscale(p.c, scale) : p.c;
  };
  const frames = {};
  for (const anim of ['idle', 'attack']) frames[anim] = Array.from({ length: ANIM[anim] }, (_, i) => make(anim, i));
  frames.hit = [whiteOut(frames.idle[0]), frames.idle[0]];
  frames.death = deathFrames(frames.idle[0]);
  frames.size = size * scale;
  return frames;
}

/** Fallback, falls für eine ID keine Zeichnung existiert: farbiger Block mit Kürzel-Farbe. */
function fallbackArt(color) {
  return (p, f) => { p.rect(8, 8 + f.b, 16, 22 - f.b, color); p.rect(10, 4 + f.b, 12, 6, color); };
}

export class SpriteBank {
  constructor(data) {
    this.data = data;
    this.cache = new Map();
    this.urls = new Map();
    this.sheets = new Map();
    this.loadSheets();
  }

  get(key, build) {
    if (!this.cache.has(key)) this.cache.set(key, build());
    return this.cache.get(key);
  }

  hero(id) {
    if (this.sheets.has(id)) return this.sheets.get(id);
    const def = this.data.heroIndex[id];
    const size = this.data.balance.sprites.hero;
    return this.get(`hero:${id}`, () => buildFrames(HERO_ART[def?.sprite ?? id] ?? fallbackArt(def?.color ?? '#888'), size));
  }

  /** Gegner-Frames. Elite = doppelte Pixelgröße (48×48) mit rotem Umriss, Boss = 3-fach (96×96). */
  enemy(id, elite = false) {
    if (this.sheets.has(id) && !elite) return this.sheets.get(id);
    const def = this.data.enemyIndex[id];
    const base = def.spriteSize ?? (def.boss ? 32 : 24);
    const art = ENEMY_ART[def.sprite ?? id] ?? fallbackArt(def.color);
    if (def.boss) return this.get(`boss:${id}`, () => buildFrames(art, base, { flip: true, scale: this.data.balance.sprites.boss / base }));
    if (elite) return this.get(`elite:${id}`, () => buildFrames(art, base, { flip: true, outlineColor: ELITE_OUTLINE, scale: 2 }));
    return this.get(`enemy:${id}`, () => buildFrames(art, base, { flip: true }));
  }

  /** Turm 45×90 → ×4 = 180×360. Variante 'hit' ist rot getönt (Blinken bei Treffern). */
  tower(hit = false) {
    return this.get(`tower:${hit}`, () => {
      const p = new Pix(45, 90);
      TOWER_ART(p);
      outline(p.c, OUTLINE);
      let c = p.c;
      if (hit) {
        const t = makeCanvas(c.width, c.height);
        const g = t.getContext('2d');
        g.drawImage(c, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(224,72,72,0.55)';
        g.fillRect(0, 0, t.width, t.height);
        c = t;
      }
      return upscale(c, 4);
    });
  }

  minion() {
    return this.get('minion', () => buildFrames((p, f) => ENEMY_ART.knochenritter(p, f), 24));
  }

  chest(id, open = false) {
    return this.get(`chest:${id}:${open}`, () => {
      const p = new Pix(32, 24);
      (CHEST_ART[id] ?? CHEST_ART.holzkiste)(p, open);
      return outline(p.c, OUTLINE);
    });
  }

  icon(name) {
    return this.get(`icon:${name}`, () => {
      const p = new Pix(12);
      ICON_ART[name]?.(p);
      return outline(p.c, OUTLINE);
    });
  }

  /** Data-URL eines Canvas (für <img> in Karten und Menüs). */
  url(canvas) {
    if (!this.urls.has(canvas)) this.urls.set(canvas, canvas.toDataURL());
    return this.urls.get(canvas);
  }

  heroUrl(id, frame = 0) { return this.url(this.hero(id).idle[frame]); }
  enemyUrl(id) { return this.url(this.enemy(id).idle[0]); }
  chestUrl(id, open = false) { return this.url(this.chest(id, open)); }
  iconUrl(name) { return this.url(this.icon(name)); }

  /** Lädt optionale Sprite-Sheets aus den Daten (ersetzt Platzhalter, sobald geladen). */
  loadSheets() {
    const defs = [...this.data.heroes, ...this.data.enemies].filter((d) => d.spriteSheet);
    for (const def of defs) {
      const sh = def.spriteSheet;
      const img = new Image();
      img.onload = () => {
        const frames = { size: sh.frame };
        for (const [anim, row] of Object.entries(sh.rows)) {
          frames[anim] = Array.from({ length: ANIM[anim] }, (_, i) => {
            const c = makeCanvas(sh.frame, sh.frame);
            c.getContext('2d').drawImage(img, i * sh.frame, row * sh.frame, sh.frame, sh.frame, 0, 0, sh.frame, sh.frame);
            return c;
          });
        }
        this.sheets.set(def.id, frames);
      };
      img.src = sh.src;
    }
  }
}

/** Frame-Auswahl für eine Animation anhand der verstrichenen Zeit. */
export function frameAt(frames, anim, t, fps) {
  const list = frames[anim];
  const i = Math.max(0, Math.floor(t * fps));
  return anim === 'death' ? list[Math.min(list.length - 1, i)] : list[i % list.length];
}
