// Sammlung (8.2.10): Raster aller Karten, filterbar; Detailansicht mit Animation und Werten je Stern.
import { $, el, escapeHtml, show } from './dom.js';
import { heroStatsAt } from './cardView.js';
import { frameAt } from '../render/sprites.js';
import { starMultiplier } from '../core/cards.js';
import { getPath } from '../core/util.js';

const filter = { type: 'all', rarity: 'all' };

export function renderCollection(game) {
  const { data, save } = game;
  const bar = $('#collection-filters');
  bar.innerHTML = '';
  const add = (key, value, label, extra = '') => {
    const b = el(`<button class="filter ${filter[key] === value ? 'active' : ''} ${extra}">${label}</button>`);
    b.addEventListener('click', () => { filter[key] = value; renderCollection(game); });
    bar.appendChild(b);
  };
  add('type', 'all', 'Alle'); add('type', 'hero', 'Helden'); add('type', 'spell', 'Zauber');
  add('rarity', 'all', 'Jede Seltenheit', 'sep');
  for (const [id, r] of Object.entries(data.rarities)) add('rarity', id, r.name);

  const grid = $('#collection-grid');
  grid.innerHTML = '';
  const found = data.allCards.filter((id) => save.collection[id] > 0).length;
  $('#collection-count').textContent = `${found} / ${data.allCards.length}`;
  for (const id of data.allCards) {
    const c = data.cardIndex[id];
    if (filter.type !== 'all' && c.kind !== filter.type) continue;
    if (filter.rarity !== 'all' && c.def.rarity !== filter.rarity) continue;
    const isFound = save.collection[id] > 0;
    const node = game.card(id, { found: isFound, count: save.collection[id] || 0 });
    if (isFound) node.addEventListener('click', () => showDetail(game, id));
    grid.appendChild(node);
  }
}

function showDetail(game, id) {
  const { data, save, bank } = game;
  const { kind, def } = data.cardIndex[id];
  const B = data.balance;
  const packs = data.packs.filter((p) => p.pool.includes(id)).map((p) => p.name).join(', ') || '–';
  let table = '';
  if (kind === 'hero') {
    const rows = [1, 2, 3, 4, 5].map((s) => {
      const st = heroStatsAt(def, s, B);
      return `<tr><th>${'★'.repeat(s)}</th><td>${st.hp}</td><td>${def.attack.kind === 'none' ? '–' : st.damage}</td><td>${def.attack.kind === 'none' ? '–' : st.aps.toFixed(2)}</td></tr>`;
    }).join('');
    table = `<table><tr><th>Stern</th><th>Leben</th><th>Schaden</th><th>Angriffe/s</th></tr>${rows}</table>`;
  } else {
    const path = def.scale?.[0];
    const rows = [1, 2, 3, 4, 5].map((s) => {
      const v = path ? Math.round(getPath(def, path) * starMultiplier(s, B)) : '–';
      const cd = (def.cooldown * Math.max(0.3, 1 - B.spells.cooldownReductionPerStar * (s - 1))).toFixed(1).replace('.', ',');
      return `<tr><th>${'★'.repeat(s)}</th><td>${v}</td><td>${cd} s</td></tr>`;
    }).join('');
    table = `<table><tr><th>Stern</th><th>Wirkung</th><th>Aufladezeit</th></tr>${rows}</table>`;
  }
  const box = $('#card-detail');
  box.innerHTML = `
    <div><div class="big"></div><canvas class="anim-box" width="96" height="96"></canvas></div>
    <div class="info">
      <h2>${escapeHtml(def.name)}</h2>
      <div style="color:${data.rarities[def.rarity].color};font-family:var(--pixel)">${data.rarities[def.rarity].name} · ${kind === 'hero' ? escapeHtml(def.role) : 'Zauber'}</div>
      <div>${escapeHtml(def.description)}</div>
      ${def.star3 ? `<div style="color:#FFD24A">Ab ★★★: ${escapeHtml(def.star3.text)}</div>` : ''}
      ${table}
      <div><b>Enthalten in:</b> ${escapeHtml(packs)}</div>
      <div><b>Wie oft gezogen:</b> ${save.collection[id] || 0} · <b>Höchster Stern:</b> ${'★'.repeat(save.highestStar[id] || 1)}</div>
      <button class="btn btn-primary" id="detail-close" style="align-self:flex-start">Schließen</button>
    </div>`;
  box.querySelector('.big').appendChild(game.card(id));
  show('#overlay-card', true);
  // animiertes Sprite (Idle + gelegentlich Angriff)
  const cv = box.querySelector('.anim-box');
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const frames = kind === 'hero' ? bank.hero(id) : null;
  const t0 = performance.now();
  let raf;
  const loop = (now) => {
    const t = (now - t0) / 1000;
    g.clearRect(0, 0, 96, 96);
    if (frames) {
      const anim = t % 3 > 2.4 ? 'attack' : 'idle';
      g.drawImage(frameAt(frames, anim, t % 3 > 2.4 ? (t % 3) - 2.4 : t, anim === 'attack' ? 10 : 5), 0, 0, 96, 96);
    } else {
      const s = 48 + Math.sin(t * 3) * 6;
      g.drawImage(bank.icon(def.icon), 48 - s / 2, 48 - s / 2, s, s);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const close = () => { cancelAnimationFrame(raf); show('#overlay-card', false); };
  $('#detail-close').onclick = close;
  $('#overlay-card').onclick = (ev) => { if (ev.target.id === 'overlay-card') close(); };
}
