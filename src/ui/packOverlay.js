// Pack-Öffnungs-Overlay (8.2.5). Das Spiel läuft währenddessen mit 25 % Geschwindigkeit weiter.
import { $, el, show, stage, wait } from './dom.js';
import { play } from '../audio.js';

const CARD_W = 200, CARD_H = 300, GAP = 40, CARD_TOP = 190;
const CHEST = { x: 800, y: 640, w: 320, h: 240 };

function outcomeHtml(r, isNew) {
  let html = isNew ? '<div class="new-banner">NEU!</div>' : '';
  const prog = (v) => (r.nextAt ? Math.max(0, Math.min(1, (v - r.prevAt) / (r.nextAt - r.prevAt))) : 1);
  switch (r.outcome) {
    case 'copy':
      html += `<div class="dup-info">+1<div class="bar"><div style="width:${prog(r.copiesBefore) * 100}%" data-to="${prog(r.copies) * 100}"></div></div></div>`;
      break;
    case 'starUp':
      html += `<div class="dup-info star">+1 → ${'★'.repeat(r.stars)}<div class="bar"><div style="width:${prog(r.copiesBefore) * 100}%" data-to="100"></div></div></div>`;
      break;
    case 'maxed': html += `<div class="dup-info gold">Max ★ → +${r.gold} Gold</div>`; break;
    case 'spellsFull': html += `<div class="dup-info gold">Zauberleiste voll → +${r.gold} Gold</div>`; break;
    case 'slotsFull': html += '<div class="dup-info" style="color:#E04848">Kein Slot frei!</div>'; break;
    case 'sold': html += `<div class="dup-info gold">+${r.gold} Gold</div>`; break;
  }
  return html;
}

/** Ziel einer Karte nach dem Aufdecken (Bühnenkoordinaten). */
function targetOf(r, run, battle) {
  const F = run.field;
  if (r.kind === 'hero' && (r.outcome === 'new' || r.outcome === 'copy' || r.outcome === 'starUp')) {
    const h = run.heroes.find((x) => x.id === r.id);
    if (h) return { x: h.x, y: h.footY + F.offsetY - 48 };
  }
  if (r.kind === 'spell' && battle.spellEls?.[r.id]) return stage.rectOf(battle.spellEls[r.id]);
  if (r.gold) { const g = stage.rectOf($('#icon-gold')); return { x: g.cx, y: g.cy }; }
  if (r.outcome === 'slotsFull') { const t = stage.rectOf($('#team')); return { x: t.cx, y: t.cy }; }
  return { x: 960, y: 1080 };
}

export function openPack({ game, battle, run, pack, results, neverFound, chestEl, onDone }) {
  const { data, bank } = game;
  const overlay = $('#overlay-pack');
  const chest = $('#pack-chest');
  const light = $('#pack-light');
  const cardsBox = $('#pack-cards');
  cardsBox.innerHTML = '';
  light.classList.remove('on');
  chest.className = 'pack-chest';
  chest.src = bank.chestUrl(pack.id, false);
  // Start an der Position der Truhe im Shop
  const from = chestEl ? stage.rectOf(chestEl) : { x: CHEST.x, y: CHEST.y, w: 160, h: 120 };
  Object.assign(chest.style, { transition: 'none', left: `${from.x}px`, top: `${from.y}px`, width: '160px', height: '120px' });
  show('#overlay-pack', true);

  let finished = false;
  let skipped = false;
  const flips = [];
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  const finish = (immediate) => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    const close = () => { show('#overlay-pack', false); cardsBox.innerHTML = ''; onDone?.(); };
    if (immediate) { close(); return; }
    // Karten fliegen zu ihrem Ziel: Helden zum Slot, Zauber in die Leiste, Gold zur Anzeige
    flips.forEach((f, i) => {
      const t = targetOf(results[i], run, battle);
      f.node.style.left = `${(t.cx ?? t.x) - CARD_W / 2}px`;
      f.node.style.top = `${(t.cy ?? t.y) - CARD_H / 2}px`;
      f.node.style.transform = 'scale(0.2)';
      f.node.style.opacity = '0';
    });
    chest.style.opacity = '0';
    light.classList.remove('on');
    setTimeout(() => { chest.style.opacity = ''; close(); }, 550);
  };

  $('#pack-skip').onclick = () => { skipped = true; flips.forEach((f) => f.open(true)); finish(true); };

  // 1) Truhe springt in die Mitte und wackelt (0,4 s)
  requestAnimationFrame(() => {
    Object.assign(chest.style, { transition: '', left: `${CHEST.x}px`, top: `${CHEST.y}px`, width: `${CHEST.w}px`, height: `${CHEST.h}px` });
  });
  play('chest');
  later(() => chest.classList.add('shake'), 260);

  // 2) Deckel springt auf, Licht in der Farbe der höchsten Seltenheit
  const best = results.reduce((m, r) => (data.rarities[r.rarity].order > data.rarities[m].order ? r.rarity : m), results[0].rarity);
  later(() => {
    chest.classList.remove('shake');
    chest.classList.add('pop');
    chest.src = bank.chestUrl(pack.id, true);
    light.style.background = `radial-gradient(circle, #ffffff 0%, ${data.rarities[best].color} 35%, transparent 70%)`;
    light.style.top = `${CHEST.y + 40}px`;
    light.classList.add('on');
    play('lid');
  }, 680);

  // 3) Karten fliegen verdeckt heraus und legen sich nebeneinander
  const n = results.length;
  const totalW = n * CARD_W + (n - 1) * GAP;
  results.forEach((r, i) => {
    const rar = data.rarities[r.rarity];
    const node = el(`<div class="flip ${rar.flipSlow ? 'slow' : ''}" style="--rar:${rar.color};left:${CHEST.x + CHEST.w / 2 - CARD_W / 2}px;top:${CHEST.y}px;transform:scale(.3)">
      <div class="flip-inner"><div class="flip-back">?</div><div class="flip-front"></div></div></div>`);
    const front = node.querySelector('.flip-front');
    const fill = (res, isNew) => {
      front.innerHTML = '';
      front.appendChild(game.card(res.id, { stars: res.stars }));
      front.insertAdjacentHTML('beforeend', outcomeHtml(res, isNew));
    };
    fill(r, neverFound[i]);
    cardsBox.appendChild(node);
    const flip = {
      node, opened: false, fill,
      open(silent = false) {
        if (this.opened) return;
        this.opened = true;
        node.classList.add('open');
        if (silent) return;
        // je seltener, desto heller und länger der Ton; seltene Karten mit Lichtexplosion
        const sound = { common: 'flipCommon', uncommon: 'flipUncommon', rare: 'rare', epic: 'epic', legendary: 'legendary' }[r.rarity];
        play(sound);
        if (rar.flipSlow) node.querySelector('.flip-front').insertAdjacentHTML('afterbegin', '<div class="burst"></div>');
        const res = results[i];
        if (res.outcome === 'starUp') setTimeout(() => play('starUp'), 350);
        setTimeout(() => node.querySelectorAll('.bar div[data-to]').forEach((b) => { b.style.width = `${b.dataset.to}%`; }), 300);
        checkAllOpen();
      },
    };
    node.addEventListener('click', () => flip.open());
    flips.push(flip);
    later(() => {
      node.style.left = `${960 - totalW / 2 + i * (CARD_W + GAP)}px`;
      node.style.top = `${CARD_TOP}px`;
      node.style.transform = 'scale(1)';
    }, 900 + i * 90);
  });

  // 4) Automatisch nacheinander umdrehen (0,3 s Abstand, seltene Karten langsamer)
  let t = 1500;
  flips.forEach((f, i) => {
    later(() => f.open(), t);
    t += data.rarities[results[i].rarity].flipSlow ? 700 : 300;
  });

  function checkAllOpen() {
    if (skipped || !flips.every((f) => f.opened)) return;
    if (run.canReroll()) offerReroll();
    else later(() => finish(false), 1300);
  }

  // "Wahl des Glücks": eine Karte darf neu gezogen werden
  function offerReroll() {
    const buttons = [];
    const go = el('<button class="btn btn-primary" style="position:absolute;left:860px;top:560px;pointer-events:auto">Weiter</button>');
    go.onclick = () => finish(false);
    cardsBox.appendChild(go);
    flips.forEach((f, i) => {
      const b = el(`<button class="btn" style="position:absolute;left:${parseFloat(f.node.style.left) + 20}px;top:${CARD_TOP - 64}px;font-size:18px;pointer-events:auto">↻ Neu ziehen</button>`);
      b.onclick = () => {
        buttons.forEach((x) => x.remove());
        const res = run.rerollCard(i);
        if (!res) return;
        results[i] = res;
        f.node.classList.remove('open');
        setTimeout(() => { f.fill(res, !(game.save.collection[res.id] > 0)); f.opened = false; f.open(); battle.buildSpells(); battle.buildTeam(); }, 350);
      };
      cardsBox.appendChild(b);
      buttons.push(b);
    });
  }
}
