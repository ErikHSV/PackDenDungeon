// DOM-Helfer und die skalierte 1920×1080-Bühne.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Erzeugt ein Element aus einem HTML-String. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, bad = false) {
  const t = el(`<div class="toast${bad ? ' bad' : ''}">${escapeHtml(msg)}</div>`);
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

export function show(sel, on = true) {
  $(sel).classList.toggle('hidden', !on);
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------
// Bühne (Referenzauflösung 1920×1080, proportional skaliert)
// ---------------------------------------------------------------------

export const stage = {
  scale: 1,
  left: 0,
  top: 0,

  init() {
    const fit = () => {
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      this.scale = s;
      this.left = Math.round((window.innerWidth - 1920 * s) / 2);
      this.top = Math.round((window.innerHeight - 1080 * s) / 2);
      $('#stage').style.transform = `translate(${this.left}px, ${this.top}px) scale(${s})`;
    };
    window.addEventListener('resize', fit);
    fit();
  },

  /** Bildschirm- → Bühnenkoordinaten. */
  toStage(clientX, clientY) {
    return { x: (clientX - this.left) / this.scale, y: (clientY - this.top) / this.scale };
  },

  /** Rechteck eines Elements in Bühnenkoordinaten. */
  rectOf(elem) {
    const r = elem.getBoundingClientRect();
    const a = this.toStage(r.left, r.top);
    return { x: a.x, y: a.y, w: r.width / this.scale, h: r.height / this.scale, cx: a.x + r.width / this.scale / 2, cy: a.y + r.height / this.scale / 2 };
  },

  /** Abblenden (0,4 s), Aktion ausführen, wieder aufblenden. */
  async fade(action) {
    const f = $('#fade');
    f.classList.add('on');
    await wait(400);
    await action();
    f.classList.remove('on');
  },
};

/** Rückfrage-Dialog; liefert ein Promise<boolean>. */
export function confirmDialog(text, yes = 'Ja', no = 'Abbrechen') {
  return new Promise((resolve) => {
    $('#confirm-text').textContent = text;
    $('#confirm-yes').textContent = yes;
    $('#confirm-no').textContent = no;
    show('#overlay-confirm', true);
    const done = (v) => { show('#overlay-confirm', false); $('#confirm-yes').onclick = $('#confirm-no').onclick = null; resolve(v); };
    $('#confirm-yes').onclick = () => done(true);
    $('#confirm-no').onclick = () => done(false);
  });
}

/** Hinweis mit Pfeil (blockiert nichts). target = Element oder {x,y} in Bühnenkoordinaten. */
export function showTip(text, target, dir = 'down', ms = 5000) {
  const tip = $('#tip');
  $('#tip-text').textContent = text;
  const arrow = $('#tip-arrow');
  arrow.className = `tip-arrow ${dir}`;
  tip.classList.remove('hidden');
  const r = target instanceof Element ? stage.rectOf(target) : { cx: target.x, cy: target.y, x: target.x, y: target.y, w: 0, h: 0 };
  // tip im aktiven Bildschirm anzeigen (liegt im Kampfbildschirm; sonst an die Bühne hängen)
  if (tip.parentElement !== $('#stage')) $('#stage').appendChild(tip);
  const box = tip.getBoundingClientRect();
  const w = box.width / stage.scale, h = box.height / stage.scale;
  if (dir === 'down') { tip.style.left = `${Math.max(10, r.cx - 62)}px`; tip.style.top = `${r.y - h - 34}px`; }
  else { tip.style.left = `${r.x + r.w + 34}px`; tip.style.top = `${r.cy - 30}px`; }
  clearTimeout(showTip.timer);
  if (ms) showTip.timer = setTimeout(() => tip.classList.add('hidden'), ms);
  return () => tip.classList.add('hidden');
}

/** Zahl animiert hochzählen (Run-Ende, Sternenkarte). */
export function countTo(elem, from, to, ms = 800, onStep) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      elem.textContent = v;
      onStep?.(v);
      if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}
