// Kartendarstellung (2:3, 200×300). Rahmenfarbe = Seltenheit, Foil mit Regenbogenglanz, Tomes mit rundem Bildrahmen.
import { el, escapeHtml } from './dom.js';
import { shade } from '../render/pixel.js';

export function firstSentence(t) {
  const m = String(t).match(/^.*?[.!?](\s|$)/);
  return m ? m[0].trim() : t;
}

/** opts: { found = true, foil, isNew, count } */
export function cardElement(id, game, opts = {}) {
  const { data, bank } = game;
  const { art, def } = data.cardIndex[id];
  const rar = data.rarities[def.rarity];
  const found = opts.found !== false;
  const tome = art === 'tome';
  const img = bank.cardUrl(id);
  const role = tome ? 'Tome' : def.rolle;
  const icon = tome ? 'book' : def.rollenSymbol;
  const bg = `radial-gradient(circle at 50% 40%, ${shade(def.farbe, 0.25)}, ${shade(def.farbe, -0.45)})`;
  const cls = ['card', tome && 'tome', found && rar.lichtblitz && rar.rang >= 3 && 'shine', found && opts.foil && 'foil', !found && 'silhouette', def.rarity === 'grenzgaenger' && found && 'glitch'].filter(Boolean).join(' ');
  return el(`
    <div class="${cls}" style="--rar:${rar.farbe}">
      <div class="c-name">${found ? escapeHtml(def.name) : '???'}${opts.foil ? ' ✦' : ''}</div>
      <div class="c-art" style="background:${found ? bg : '#1a1828'}"><img src="${img}" alt=""></div>
      <div class="c-role"><img src="${bank.iconUrl(icon)}" alt="">${found ? escapeHtml(role) : '???'}</div>
      <div class="c-text">${found ? escapeHtml(firstSentence(def.beschreibung)) : 'Noch nicht gefunden'}</div>
      ${opts.isNew ? '<div class="c-new">NEU!</div>' : ''}
      ${opts.count != null && found ? `<div class="c-count">×${opts.count}</div>` : ''}
      <div class="c-rar">${rar.name}${opts.foil ? ' · Foil' : ''}</div>
    </div>`);
}
