// Run-Ende (8.2.8) und Freischaltungs-Popup mit Konfetti (8.2.12).
import { $, el, escapeHtml, show, countTo, wait, stage } from './dom.js';
import { applyRunResult } from '../save.js';
import { anyAffordable } from '../core/starmap.js';
import { play, startMusic } from '../audio.js';
import { formatNumber } from '../core/util.js';

export function showRunEnd(game, result, { onAgain }) {
  const { save, data, bank } = game;
  const info = applyRunResult(save, result, data);
  game.persist();
  startMusic('menu');
  game.showScreen('battle'); // Overlay liegt über dem (eingefrorenen) Kampf

  const title = $('#runend-title');
  title.textContent = result.victory ? 'Kapitel geschafft!' : 'Niederlage';
  title.className = result.victory ? 'win' : 'lose';
  $('#runend-wave').textContent = `Welle erreicht: ${result.wave}`;
  show('#runend-record', info.newRecord);

  // Mastery-Punkte: Zeilen erscheinen nacheinander und zählen hoch
  const mp = result.mp;
  const rows = [['Wellen', mp.waves], ['Elitewellen', mp.elite]];
  if (mp.boss) rows.push(['Boss-Bonus', mp.boss]);
  const box = $('#runend-points');
  box.innerHTML = '';
  const sumLabel = el('<span class="sum">Summe</span>');
  const sumVal = el('<b class="sum">0</b>');
  const rowEls = rows.map(([label]) => {
    const l = el(`<span>${label}</span>`);
    const v = el('<b>+0</b>');
    box.append(l, v);
    return v;
  });
  if (mp.bonusMul > 1) box.append(el('<span>Meisterschüler</span>'), el(`<b>×${mp.bonusMul.toFixed(2).replace('.', ',')}</b>`));
  box.append(sumLabel, sumVal);
  if (info.splinters) box.append(el('<span>Sternensplitter</span>'), el(`<b style="color:#c58cff">+${info.splinters}</b>`));

  (async () => {
    for (let i = 0; i < rows.length; i++) {
      await countTo(rowEls[i], 0, rows[i][1], 500, (v) => { rowEls[i].textContent = `+${v}`; if (v % 3 === 0) play('count'); });
    }
    await countTo(sumVal, 0, mp.total, 600);
  })();

  // Team, sortiert nach Schaden; der beste Held bekommt eine Krone
  const team = $('#runend-team');
  team.innerHTML = '';
  const sorted = [...result.heroes].sort((a, b) => b.damage - a.damage);
  sorted.forEach((h, i) => {
    const def = data.heroIndex[h.id];
    team.appendChild(el(`<div class="rt" style="--rar:${data.rarities[def.rarity].color}">
      ${i === 0 && h.damage > 0 ? `<img class="crown" src="${bank.iconUrl('crown')}" alt="">` : ''}
      <img class="spr" src="${bank.heroUrl(h.id)}" alt="">
      <div>${escapeHtml(def.name)}</div><div style="color:#FFD24A">${'★'.repeat(h.stars)}</div>
      <div class="dmg">${formatNumber(h.damage)}</div></div>`));
  });
  if (!sorted.length) team.innerHTML = '<p>Keine Helden eingesetzt.</p>';

  // Roter Punkt an "Sternenkarte", wenn ein Knoten bezahlbar ist
  const starBtn = $('#runend-mastery');
  starBtn.innerHTML = `Sternenkarte${anyAffordable(data, save) ? ' <span class="red-dot" style="position:relative;display:inline-block;top:4px;right:0"></span>' : ''}`;

  $('#runend-again').onclick = () => { show('#overlay-runend', false); onAgain(); };
  starBtn.onclick = () => { show('#overlay-runend', false); game.goto('starmap', { back: 'menu' }); };
  $('#runend-menu').onclick = () => { show('#overlay-runend', false); game.goto('menu'); };
  show('#overlay-runend', true);

  if (info.unlockedChapter) setTimeout(() => showUnlock(game, info), 1400);
}

/** "Neues Kapitel freigeschaltet!" / "Neues Pack verfügbar!" mit Konfetti. */
async function showUnlock(game, info) {
  const { data, bank } = game;
  const ch = data.chapterIndex[info.unlockedChapter];
  const box = $('#unlock-box');
  box.innerHTML = `<h1>Neues Kapitel freigeschaltet!</h1>
    <p style="font-size:30px">Kapitel ${ch.id}: <b>${escapeHtml(ch.name)}</b></p>
    ${info.unlockedPacks.map((p) => `<h2 style="color:#A55CE0;margin-top:20px">Neues Pack verfügbar!</h2>
      <img src="${bank.chestUrl(p.id)}" alt=""><p style="font-size:26px">${escapeHtml(p.name)} – ${escapeHtml(p.description)}</p>`).join('')}
    <button class="btn btn-primary btn-big" id="unlock-ok">Super!</button>`;
  show('#overlay-unlock', true);
  play('unlock');
  const stop = confetti($('#confetti'));
  $('#unlock-ok').onclick = () => { stop(); show('#overlay-unlock', false); };
}

/** Einfaches Pixel-Konfetti. Gibt eine Stopp-Funktion zurück. */
function confetti(canvas) {
  const ctx = canvas.getContext('2d');
  const cols = ['#FFD24A', '#E04848', '#5AA9F0', '#5ED17A', '#A55CE0', '#F4EBD9'];
  const parts = Array.from({ length: 180 }, () => ({
    x: Math.random() * 1920, y: -Math.random() * 600, vx: (Math.random() - 0.5) * 120, vy: 150 + Math.random() * 250,
    c: cols[Math.floor(Math.random() * cols.length)], s: 8 + Math.floor(Math.random() * 3) * 4, r: Math.random() * 6,
  }));
  let raf;
  let last = performance.now();
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, 1920, 1080);
    for (const p of parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 5;
      if (p.y > 1100) { p.y = -20; p.x = Math.random() * 1920; }
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4, p.s, Math.max(4, Math.round(Math.abs(Math.sin(p.r)) * p.s / 4) * 4));
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, 1920, 1080); };
}
