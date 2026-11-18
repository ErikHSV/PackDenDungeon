// Einblendungen im Comic-Stil (Halbton-Raster als wiederkehrendes Element):
// 14.6  Neue-Karte-Präsentation: Punktfleck in Seltenheitsfarbe, Figur ~6-fach, Name + Fähigkeit, Pfeil „>“.
// 14.6b Freischaltung: drehender orange-goldener Strahlenkranz mit Halbton-Enden, Objekt groß, Titel + Name.
import { $, show } from './dom.js';
import { firstSentence } from './cardView.js';
import { play } from '../audio.js';
import { hash } from '../render/pixel.js';

/** Halbton-Fleck: Punkte im Raster, zum Rand hin kleiner und ausfransend. */
export function halftoneBlob(canvas, color, grow = 1) {
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, R = (W / 2) * 0.86 * grow;
  c.clearRect(0, 0, W, H);
  c.fillStyle = color;
  const step = 11;
  for (let y = step / 2; y < H; y += step) for (let x = step / 2 + ((y / step) % 2) * step / 2; x < W; x += step) {
    const d = Math.hypot(x - W / 2, y - H / 2) / R;
    const fray = (hash(Math.round(x), Math.round(y), 7) - 0.5) * 0.35;
    const k = 1 - Math.max(0, d + fray);
    if (k <= 0) continue;
    const r = Math.min(step * 0.62, step * 0.75 * Math.sqrt(k) + (d < 0.55 ? 1 : 0));
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
}

// ---------------------------------------------------------------------
// 14.6 Neue Karte
// ---------------------------------------------------------------------

export class NewCardReveal {
  constructor(game, onClose) {
    this.game = game;
    this.onClose = onClose;
    this.box = $('#overlay-newcard');
    this.blob = $('#nc-blob');
    const close = (ev) => { ev.stopPropagation(); this.close(); };
    this.box.addEventListener('pointerdown', close);
    window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !this.box.classList.contains('hidden')) this.close(); });
  }

  open(id, foil = false) {
    const { data, bank } = this.game;
    const card = data.cardIndex[id];
    const def = card.def;
    const rar = data.rarities[def.rarity];
    $('#nc-name').textContent = def.name.toUpperCase() + (foil ? ' ✦' : '');
    $('#nc-name').style.color = rar.farbe;
    $('#nc-ability').textContent = firstSentence(def.beschreibung).replace(/\.$/, '').toUpperCase();
    const img = $('#nc-fig');
    img.src = card.art === 'tome' ? bank.url(bank.tome(id)) : bank.unitUrl(id);
    img.className = card.art === 'tome' ? 'tome' : '';
    show('#tip', false);
    show('#overlay-newcard', true);
    this.box.classList.remove('out');
    // Punktfleck wächst in 0,3 s auf
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 300);
      halftoneBlob(this.blob, rar.farbe, 0.2 + 0.8 * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
    play('newCard');
  }

  close() {
    if (this.box.classList.contains('hidden') || this.closing) return;
    this.closing = true;
    this.box.classList.add('out'); // Ausblenden 0,2 s
    setTimeout(() => { this.closing = false; show('#overlay-newcard', false); this.box.classList.remove('out'); this.onClose?.(); }, 200);
  }
}

// ---------------------------------------------------------------------
// 14.6b Freischaltung
// ---------------------------------------------------------------------

let queue = [];
let raf = null;

/**
 * Zeigt Freischaltungen nacheinander.
 * item: { title: 'NEUES PACK!', name: 'Silberpack', img: url, w, h }
 */
export function showUnlocks(items, done) {
  queue.push(...items.filter(Boolean).map((i) => ({ ...i, done: null })));
  if (done && queue.length) queue[queue.length - 1].done = done;
  if ($('#overlay-unlock').classList.contains('hidden')) next();
}

function next() {
  const it = queue.shift();
  if (!it) { show('#overlay-unlock', false); cancelAnimationFrame(raf); return; }
  $('#ul-title').textContent = it.title;
  $('#ul-name').textContent = it.name;
  const img = $('#ul-img');
  img.src = it.img;
  img.style.width = `${it.w ?? 200}px`;
  img.style.height = `${it.h ?? 200}px`;
  img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
  show('#overlay-unlock', true);
  play('fanfare');
  const cv = $('#ul-rays');
  const c = cv.getContext('2d');
  const t0 = performance.now();
  cancelAnimationFrame(raf);
  const draw = (now) => {
    const t = (now - t0) / 1000;
    c.clearRect(0, 0, cv.width, cv.height);
    const cx = cv.width / 2, cy = cv.height / 2;
    const n = 14, len = 470;
    for (let i = 0; i < n; i++) {
      const a = t * 0.25 + (i / n) * Math.PI * 2, w = 0.11;
      const g = c.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.addColorStop(0, 'rgba(255,190,60,0.95)'); g.addColorStop(0.65, 'rgba(255,140,30,0.6)'); g.addColorStop(1, 'rgba(255,140,30,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a - w) * len * 0.72, cy + Math.sin(a - w) * len * 0.72);
      c.lineTo(cx + Math.cos(a + w) * len * 0.72, cy + Math.sin(a + w) * len * 0.72);
      c.closePath(); c.fill();
      // Halbton-Enden: Punkte entlang des Strahls, nach außen kleiner
      c.fillStyle = '#ffb03a';
      for (let k = 0; k < 9; k++) {
        const d = len * (0.7 + k * 0.035);
        for (let j = -2; j <= 2; j++) {
          const aa = a + j * w * 0.4;
          const r = Math.max(0, 6 - k * 0.7 - Math.abs(j) * 0.8);
          if (r <= 0.3) continue;
          c.beginPath(); c.arc(cx + Math.cos(aa) * d, cy + Math.sin(aa) * d, r, 0, Math.PI * 2); c.fill();
        }
      }
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  const ov = $('#overlay-unlock');
  ov.onpointerdown = () => { const d = it.done; next(); d?.(); };
}
