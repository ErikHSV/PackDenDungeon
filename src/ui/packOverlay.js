// Pack-Öffnungs-Overlay: Karten drehen sich nacheinander um, seltene Karten leuchten und klingen.
import { $, el, showOverlay } from './dom.js';
import { cardElement } from './cardView.js';
import { play } from '../audio.js';

function outcomeLabel(r, data) {
  switch (r.outcome) {
    case 'new': return { text: r.kind === 'hero' ? 'NEU – platziert!' : 'NEU – Zauber!', cls: '' };
    case 'starUp': return { text: `${r.stars}★ erreicht!`, cls: 'star' };
    case 'copy': return { text: `Duplikat ${r.copies}/${r.nextAt}`, cls: '' };
    case 'maxed': return { text: `Max ★ → +${r.gold} Gold`, cls: 'gold' };
    case 'noSlot': return { text: `Kein Slot → +${r.gold} Gold`, cls: 'gold' };
    default: return { text: '', cls: '' };
  }
}

/** Zeigt die gezogenen Karten an. onClose wird beim Schließen aufgerufen. */
export function showPackOpening(pack, results, data, onClose) {
  $('#pack-title').textContent = pack.name;
  const wrap = $('#pack-cards');
  wrap.innerHTML = '';
  const timers = [];
  const flips = results.map((r, i) => {
    const rar = data.rarities[r.rarity];
    const flip = el(`<div class="flip ${rar.glow ? 'glow' : ''}" style="--rar:${rar.color}"><div class="flip-inner"><div class="flip-back">?</div></div></div>`);
    const front = el('<div class="flip-front"></div>');
    front.appendChild(cardElement(r.id, data, { stars: r.stars }));
    const o = outcomeLabel(r, data);
    if (r.bonus) o.text = '🍀 Bonus · ' + o.text;
    front.appendChild(el(`<div class="outcome ${o.cls}">${o.text}</div>`));
    flip.firstChild.appendChild(front);
    const open = () => {
      if (flip.classList.contains('open')) return;
      flip.classList.add('open');
      play(r.rarity === 'legendary' ? 'legendary' : r.rarity === 'epic' ? 'epic' : rar.glow ? 'rare' : 'flip');
      if (r.outcome === 'starUp') setTimeout(() => play('starUp'), 250);
    };
    flip.addEventListener('click', open);
    timers.push(setTimeout(open, 350 + i * 420));
    wrap.appendChild(flip);
    return open;
  });

  const close = () => {
    timers.forEach(clearTimeout);
    flips.forEach((open) => open());
    showOverlay('#overlay-pack', false);
    $('#pack-close').onclick = null;
    onClose?.();
  };
  $('#pack-close').onclick = close;
  showOverlay('#overlay-pack', true);
}
