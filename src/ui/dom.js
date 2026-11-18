// Kleine DOM-Helfer, die von allen UI-Modulen genutzt werden.

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

export function showOverlay(id, show = true) {
  $(id).classList.toggle('hidden', !show);
}
