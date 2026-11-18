// Kartendarstellung (2:3, 200×300): Name, Bildfenster, Rollensymbol, ein Satz Beschreibung, Seltenheitsleiste.
// Rahmenfarbe = Seltenheit. Episch/Legendär mit wanderndem Glanz. Zauber mit rundem Bildrahmen.
import { el, escapeHtml } from './dom.js';
import { shade } from '../render/pixel.js';

const ROLE_ICON = { sword: 'sword', shield: 'shield', bow: 'bow', staff: 'staff', heart: 'heart' };

/** Erster Satz einer Beschreibung (Karten zeigen nur einen Satz). */
export function firstSentence(text) {
  const m = String(text).match(/^.*?[.!?](\s|$)/);
  return m ? m[0].trim() : text;
}

/**
 * @param {string} id Karten-ID
 * @param {object} game { data, bank }
 * @param {object} opts { found = true, stars, count }
 */
export function cardElement(id, game, opts = {}) {
  const { data, bank } = game;
  const { kind, def } = data.cardIndex[id];
  const rar = data.rarities[def.rarity];
  const found = opts.found !== false;
  const isSpell = kind === 'spell';
  const img = isSpell ? bank.iconUrl(def.icon) : bank.heroUrl(id);
  const roleIcon = isSpell ? 'staff' : ROLE_ICON[def.roleIcon] ?? 'sword';
  const role = isSpell ? 'Zauber' : def.role;
  const bg = `radial-gradient(circle at 50% 40%, ${shade(def.color, 0.25)}, ${shade(def.color, -0.45)})`;
  return el(`
    <div class="card ${isSpell ? 'spell' : ''} ${rar.shine && found ? 'shine' : ''} ${found ? '' : 'silhouette'}" style="--rar:${rar.color}">
      <div class="c-name">${found ? escapeHtml(def.name) : '???'}</div>
      <div class="c-art" style="background:${found ? bg : '#1a1828'}"><img src="${img}" alt=""></div>
      <div class="c-role"><img src="${bank.iconUrl(roleIcon)}" alt="">${found ? escapeHtml(role) : '???'}</div>
      <div class="c-text">${found ? escapeHtml(firstSentence(def.description)) : 'Noch nicht gefunden'}</div>
      ${opts.stars ? `<div class="c-stars">${'★'.repeat(opts.stars)}</div>` : ''}
      ${opts.count != null && found ? `<div class="c-count">×${opts.count}</div>` : ''}
      <div class="c-rar">${rar.name}</div>
    </div>`);
}

/** Werte eines Helden bei einem bestimmten Stern (für Tooltips und Sammlung). */
export function heroStatsAt(def, stars, balance, mods = null) {
  const m = 1 + balance.stars.statPerStar * (stars - 1);
  return {
    hp: Math.round(def.stats.hp * m * (mods?.heroHpMul ?? 1)),
    damage: Math.round(def.stats.damage * m * (mods?.damageMul ?? 1)),
    aps: def.stats.attackSpeed * (mods?.attackSpeedMul ?? 1),
    range: def.stats.range,
  };
}
