// Sprite-Bank: erzeugt und cached alle Animations-Frames als kleine Canvas.
// Frames: idle (4), attack (6), hit (2, weißes Aufblitzen), death (5, Zerfall in Funken).
// Gegner werden mit Blick nach rechts erzeugt und beim Zeichnen je nach Laufrichtung gespiegelt.
import { Pix, outline, whiteOut, upscale, hash, makeCanvas } from './pixel.js';
import { HERO_ART, ENEMY_ART, ICON_ART, PACK_ART, TOME_ART, BUILDING_ART, TOWER_TOP_ART, SHOP_PACK_ART, CRATE_ART, NARROW_TOWER_ART, TOME_MOTIF } from './spriteArt.js';

export const ANIM = { idle: 4, attack: 6, hit: 2, death: 5 };
const BREATH = [0, 1, 1, 0];
const PULL = [0, 1, 2, 2, 0, 0];
const OUTLINE = '#1a1422';

function pose(anim, i) {
  return { anim, i, b: anim === 'idle' ? BREATH[i] : 0, pull: anim === 'attack' ? PULL[i] : 0 };
}

/** Zerfall in Funken. */
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
      if (r > cut) { d[i] = src[i]; d[i + 1] = src[i + 1]; d[i + 2] = src[i + 2]; d[i + 3] = src[i + 3]; }
      else if (r > cut - 0.12) {
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

function buildFrames(draw, size, { outlineColor = OUTLINE, scale = 1 } = {}) {
  const make = (anim, i) => {
    const p = new Pix(size);
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

const fallback = (color) => (p, f) => { p.rect(9, 8 + f.b, 14, 22 - f.b, color); p.rect(11, 3 + f.b, 10, 6, color); };

/** Regenbogen-Umriss für Foil-Einheiten (wird pro Frame mit wanderndem Farbton gezeichnet). */
function rainbowOutline(src) {
  const w = src.width, h = src.height;
  const s = src.getContext('2d').getImageData(0, 0, w, h).data;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && s[(y * w + x) * 4 + 3] > 40;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid(x, y) || !(solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) continue;
    const i = (y * w + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export class SpriteBank {
  constructor(data) {
    this.data = data;
    this.cache = new Map();
    this.urls = new Map();
  }

  get(key, build) {
    if (!this.cache.has(key)) this.cache.set(key, build());
    return this.cache.get(key);
  }

  /** Einheiten-Frames (32×32). spriteKey erlaubt die Entwicklungsform (z. B. "waffenknecht"). */
  unit(id, spriteKey = null) {
    const def = this.data.unitIndex[id];
    const key = spriteKey ?? def?.sprite ?? id;
    return this.get(`unit:${key}`, () => buildFrames(HERO_ART[key] ?? fallback(def?.color ?? '#888'), 32));
  }

  /** Weiße Kontur einer Einheit (für den Foil-Regenbogen). */
  foilOutline(id, spriteKey, frameCanvas) {
    return this.get(`foil:${spriteKey ?? id}:${this.unit(id, spriteKey).idle.indexOf(frameCanvas)}`, () => rainbowOutline(frameCanvas));
  }

  /** Gegner: normal 24/32 px, Elite = doppelte Pixelgröße mit rotem Umriss, Bosse 32 px ×3 (96). */
  enemy(id, elite = false) {
    const def = this.data.enemyIndex[id];
    const art = ENEMY_ART[def.sprite ?? id] ?? fallback(def.farbe);
    if (def.boss) return this.get(`boss:${id}`, () => buildFrames(art, 32, { scale: 2 }));
    if (def.eigenschaften?.schatztraeger) return this.get(`schatz:${id}`, () => buildFrames(art, 24, { outlineColor: '#FFD24A', scale: 2 }));
    const base = def.groesse === 32 ? 32 : 24;
    if (elite) return this.get(`elite:${id}`, () => buildFrames(art, base, { outlineColor: '#E04848', scale: 2 }));
    return this.get(`enemy:${id}`, () => buildFrames(art, base));
  }

  /** Pack-Grafik (16×21) mit 0–3 Riss-Stufen. */
  pack(packId, cracks = 0) {
    return this.get(`pack:${packId}:${cracks}`, () => {
      const def = this.data.packIndex[packId];
      const p = new Pix(16, 21);
      PACK_ART(p, def?.farbe ?? '#8b5a2b', packId === 'sternenpack' ? '#fff6a0' : packId === 'silberpack' ? '#5AA9F0' : '#FFD24A');
      const col = '#1a1422';
      if (cracks >= 1) { p.line(4, 4, 7, 9, col); p.line(7, 9, 5, 12, col); }
      if (cracks >= 2) { p.line(12, 5, 10, 11, col); p.line(10, 11, 13, 15, col); }
      if (cracks >= 3) { p.line(6, 14, 9, 18, col); p.line(2, 9, 5, 10, col); p.line(14, 12, 11, 17, col); }
      return outline(p.c, OUTLINE);
    });
  }

  tome(tomeId, open = false) {
    return this.get(`tome:${tomeId}:${open}`, () => {
      const def = this.data.tomeIndex[tomeId];
      const p = new Pix(16);
      TOME_ART(p, this.data.rarities[def.rarity].farbe, open, (TOME_MOTIF[tomeId] ?? TOME_MOTIF._));
      return outline(p.c, OUTLINE);
    });
  }

  building(id) {
    return this.get(`building:${id}`, () => {
      const p = new Pix(24);
      (BUILDING_ART[id] ?? BUILDING_ART.taverne)(p);
      return outline(p.c, OUTLINE);
    });
  }

  /** Turm 30×40 → ×4. Riss-Stufen 0–3, Variante "hit" rot getönt. */
  tower(cracks = 0, hit = false) {
    return this.get(`tower:${cracks}:${hit}`, () => {
      const p = new Pix(30, 40);
      TOWER_TOP_ART(p, cracks);
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

  /** Schmaler Kampf-Turm (40×80) mit Licht in Kapitelfarbe. */
  fieldTower(light, cracks = 0, hit = false) {
    return this.get(`ftower:${light}:${cracks}:${hit}`, () => {
      const p = new Pix(10, 20);
      NARROW_TOWER_ART(p, light, cracks);
      let c = outline(p.c, OUTLINE);
      if (hit) {
        const t = makeCanvas(c.width, c.height);
        const g = t.getContext('2d');
        g.drawImage(c, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillRect(0, 0, t.width, t.height);
        c = t;
      }
      return upscale(c, 4);
    });
  }

  icon(name) {
    return this.get(`icon:${name}`, () => {
      const p = new Pix(12);
      ICON_ART[name]?.(p);
      return outline(p.c, OUTLINE);
    });
  }

  /** Shop-Bild eines Artikels: Pack (24×32) oder Kiste (28×28), ganzzahlig ×4 skaliert. */
  shopItem(artikel) {
    return this.get(`shop:${artikel}`, () => {
      const def = this.data.packIndex[artikel];
      const packDef = def?.art === 'kiste' ? this.data.packIndex[def.inhalt.pack] : def;
      if (def?.art === 'schatz') { const q = new Pix(28); CRATE_ART(q, '#e0a83a', '#fff2a0'); return upscale(outline(q.c, '#6b4a12'), 4); }
      const color = def?.art === 'relikt' ? '#F2B630' : packDef?.farbe ?? '#8b5a2b';
      const motif = artikel.includes('sternen') ? '#fff6a0' : artikel.includes('silber') ? '#5AA9F0' : def?.art === 'relikt' ? '#E04848' : '#FFD24A';
      let p;
      if (def?.art === 'kiste') { p = new Pix(28); CRATE_ART(p, color, motif); }
      else { p = new Pix(24, 32); SHOP_PACK_ART(p, color, motif); }
      return upscale(outline(p.c, OUTLINE), 4);
    });
  }
  shopItemUrl(artikel) { return this.url(this.shopItem(artikel)); }

  url(canvas) {
    if (!this.urls.has(canvas)) this.urls.set(canvas, canvas.toDataURL());
    return this.urls.get(canvas);
  }

  cardUrl(id) {
    const c = this.data.cardIndex[id];
    if (!c) return this.iconUrl('book');
    return c.art === 'tome' ? this.url(this.tome(id)) : this.url(this.unit(id).idle[0]);
  }
  unitUrl(id, key) { return this.url(this.unit(id, key).idle[0]); }
  enemyUrl(id) { return this.url(this.enemy(id).idle[0]); }
  packUrl(id) {
    const def = this.data.packIndex[id];
    return this.url(this.pack(def?.art === 'kiste' ? def.inhalt.pack : id));
  }
  iconUrl(name) { return this.url(this.icon(name)); }
}

export function frameAt(frames, anim, t, fps) {
  const list = frames[anim];
  const i = Math.max(0, Math.floor(t * fps));
  return anim === 'death' ? list[Math.min(list.length - 1, i)] : list[i % list.length];
}
