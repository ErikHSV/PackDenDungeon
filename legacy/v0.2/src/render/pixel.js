// Mini-Bibliothek für Pixel-Art: zeichnet auf kleine Canvas-Raster (z. B. 32×32)
// und erzeugt daraus scharfe, ganzzahlig skalierbare Sprites.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Hex-Farbe aufhellen (f > 0) oder abdunkeln (f < 0). */
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** Zeichenfläche mit Pixel-Primitiven. Alle Koordinaten werden auf ganze Pixel gerundet. */
export class Pix {
  constructor(w, h = w) {
    this.w = w;
    this.h = h;
    this.c = makeCanvas(w, h);
    this.g = this.c.getContext('2d');
    this.flip = false; // horizontal spiegeln (Gegner schauen nach links)
  }

  X(x, w = 1) { return this.flip ? this.w - Math.round(x) - w : Math.round(x); }

  px(x, y, col) { this.rect(x, y, 1, 1, col); }

  rect(x, y, w, h, col) {
    if (w <= 0 || h <= 0) return;
    this.g.fillStyle = col;
    this.g.fillRect(this.X(x, Math.round(w)), Math.round(y), Math.round(w), Math.round(h));
  }

  /** Gefüllte Ellipse (pixelgenau). */
  ellipse(cx, cy, rx, ry, col) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / (rx + 0.25);
        const dy = (y + 0.5 - cy) / (ry + 0.25);
        if (dx * dx + dy * dy <= 1) this.px(x, y, col);
      }
    }
  }

  circle(cx, cy, r, col) { this.ellipse(cx, cy, r, r, col); }

  /** Linie (Bresenham), optional mit Dicke. */
  line(x0, y0, x1, y1, col, thick = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.rect(x0 - (thick >> 1), y0 - (thick >> 1), thick, thick, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Linie per Winkel (rad) und Länge ab einem Punkt – für Waffen in Angriffsposen. */
  ray(x, y, angle, len, col, thick = 1) {
    const x1 = x + Math.cos(angle) * len;
    const y1 = y + Math.sin(angle) * len;
    this.line(x, y, x1, y1, col, thick);
    return { x: x1, y: y1 };
  }

  /** Dreieck (gefüllt, grob). */
  tri(x0, y0, x1, y1, x2, y2, col) {
    const minX = Math.floor(Math.min(x0, x1, x2)), maxX = Math.ceil(Math.max(x0, x1, x2));
    const minY = Math.floor(Math.min(y0, y1, y2)), maxY = Math.ceil(Math.max(y0, y1, y2));
    const area = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const A = area(x0, y0, x1, y1, x2, y2);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = area(x1, y1, x2, y2, px, py), w1 = area(x2, y2, x0, y0, px, py), w2 = area(x0, y0, x1, y1, px, py);
      if ((A > 0 && w0 >= 0 && w1 >= 0 && w2 >= 0) || (A < 0 && w0 <= 0 && w1 <= 0 && w2 <= 0)) this.px(x, y, col);
    }
  }
}

/** Fügt um alle sichtbaren Pixel eine 1-px-Kontur hinzu (Lesbarkeit vor jedem Hintergrund). */
export function outline(canvas, color = '#1a1422') {
  const g = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
  const n = parseInt(color.slice(1), 16);
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) out.push((y * w + x) * 4);
  }
  for (const i of out) { d[i] = n >> 16; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return canvas;
}

/** Kopie, in der alle sichtbaren Pixel weiß sind (Treffer-Aufblitzen). */
export function whiteOut(canvas) {
  const c = makeCanvas(canvas.width, canvas.height);
  const g = c.getContext('2d');
  g.drawImage(canvas, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Ganzzahlig vergrößerte Kopie (nearest neighbour). */
export function upscale(canvas, k) {
  const c = makeCanvas(canvas.width * k, canvas.height * k);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

/** Deterministische Pseudo-Zufallszahl 0..1 aus Ganzzahlen (für Zerfalls-Animationen u. Ä.). */
export function hash(a, b = 0, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
