// Darstellung einer Karte (Held oder Zauber) als DOM-Element – Platzhalter-Grafik.
import { el, escapeHtml } from './dom.js';

const DAMAGE_TYPES = { physical: 'Physisch', magic: 'Magisch' };
const TARGETING = { nearest: 'nächstes Ziel', weakest: 'schwächstes Ziel', elite: 'Elite zuerst', air: 'Luftziel zuerst' };

function textColorFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#1a1a1a' : '#ffffff';
}

/**
 * @param {string} id  Karten-ID
 * @param {object} data Spieldaten
 * @param {object} opts { found=true, count, stars }
 */
export function cardElement(id, data, opts = {}) {
  const { kind, def } = data.cardIndex[id];
  const rar = data.rarities[def.rarity];
  const found = opts.found !== false;
  let sub;
  if (kind === 'hero') {
    sub = `${escapeHtml(def.role)} · ${def.damageType ? DAMAGE_TYPES[def.damageType] : '–'}`;
    if (def.attack.kind !== 'none') sub += ` · ${def.canHitAir ? 'Boden + Luft' : 'nur Boden'}`;
  } else {
    sub = `Zauber · ${Math.round(def.cooldown)} s`;
  }
  const stars = opts.stars ? `<div class="stars">${'★'.repeat(opts.stars)}</div>` : '';
  const node = el(`
    <div class="card ${found ? '' : 'silhouette'} ${rar.glow && found ? 'glow' : ''}" style="--rar:${rar.color}">
      ${opts.count != null && found ? `<div class="count">×${opts.count}</div>` : ''}
      <div class="art ${kind === 'spell' ? 'spell' : ''}" style="background:${def.color};color:${textColorFor(def.color)}">${found ? escapeHtml(def.short) : "?"}</div>
      <div class="name">${found ? escapeHtml(def.name) : '???'}</div>
      <div class="sub" style="color:${rar.color}">${rar.name}</div>
      ${found ? `<div class="sub">${sub}</div>
      <div class="desc">${escapeHtml(def.description)}</div>
      ${def.star3 ? `<div class="star3">★★★ ${escapeHtml(def.star3.text)}</div>` : ''}` : '<div class="desc muted">Noch nicht gefunden</div>'}
      ${stars}
    </div>`);
  return node;
}

/** Kurzer Info-Text für einen platzierten Helden (Seitenleiste). */
export function heroInfoHtml(run, h) {
  const d = h.def;
  const lines = [
    `<h4>${escapeHtml(d.name)} <span style="color:#ffd34d">${'★'.repeat(h.stars)}</span></h4>`,
    `<div class="muted">${escapeHtml(d.role)} · ${d.damageType ? DAMAGE_TYPES[d.damageType] : 'kein Schaden'}${d.attack.kind !== 'none' ? ' · ' + TARGETING[d.targeting] : ''}</div>`,
    `<div>❤️ ${Math.round(h.hp)} / ${Math.round(h.maxHp)}</div>`,
  ];
  if (d.attack.kind !== 'none') {
    lines.push(`<div>⚔️ ${Math.round(d.stats.damage * h.power * run.mods.damageMul)} Schaden · ${(d.stats.attackSpeed * run.mods.attackSpeedMul * (1 + run.auras.haste)).toFixed(2)}/s · Reichweite ${d.stats.range}</div>`);
  }
  lines.push(`<div>${escapeHtml(d.description)}</div>`);
  if (h.stars >= run.balance.stars.enhancedFromStar && d.star3) lines.push(`<div style="color:#f5b942">★★★ ${escapeHtml(d.star3.text)}</div>`);
  const own = run.owned[h.id];
  const next = run.balance.stars.thresholds[h.stars];
  if (next != null) lines.push(`<div class="muted">Duplikate: ${own.copies} / ${next} für ${h.stars + 1}★</div>`);
  lines.push(`<div class="muted">Gesamtschaden: ${Math.round(h.damageDone)}</div>`);
  return lines.join('');
}
