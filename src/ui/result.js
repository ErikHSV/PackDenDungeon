// Ergebnis-Bildschirm (14.8) und Freischaltungs-Popups mit Konfetti.
import { $, el, escapeHtml, show, countTo } from './dom.js';
import { applyRunResult, anyNodeAffordable, foilTreeUnlocked } from '../core/meta.js';
import { play, startMusic } from '../audio.js';
import { showUnlocks } from './reveal.js';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function showResult(game, r, mods, opts) {
  const { data, save, bank } = game;
  const foilBefore = foilTreeUnlocked(save);
  const info = applyRunResult(r, data, save, mods);
  save.tutorial.firstRunDone = true;
  game.persist();
  startMusic('menu');
  const box = $('#result-box');
  const best = r.besteEinheit;
  box.innerHTML = `
    <h1 class="${r.sieg ? 'win' : 'lose'}">${r.sieg ? 'Sieg!' : 'Niederlage'}</h1>
    <div class="muted">${escapeHtml(data.chapterIndex[r.kapitel].name)}${mods.prestige ? ` · Prestige ${mods.prestige.stufe}` : ''}${mods.gesucht ? ' · Gesucht' : ''} · Tag ${save.day - 1}</div>
    <div class="res-grid">
      <div>Überlebt<b>${fmtTime(r.zeit)}</b></div>
      <div>Kills<b data-to="${r.kills}">0</b></div>
      <div>Mastery <img class="cur" src="${bank.iconUrl('mastery')}" alt=""><b data-to="${info.mastery}">0</b><span class="muted">${info.zinsen ? `+${info.zinsen} Zinsen` : info.gesuchtErstsieg ? `inkl. ${info.gesuchtErstsieg} Erstsieg-Bonus` : ''}</span></div>
      <div>Schimmer <img class="cur" src="${bank.iconUrl('crystal_regen')}" alt=""><b data-to="${info.foilStaub}">0</b><span class="muted teile">${info.schimmerTeile.length ? info.schimmerTeile.map((t) => `${escapeHtml(t.name)} +${t.n}`).join(', ') : 'kein Shiny-Ereignis'}</span></div>
      <div>Neuer Tag: Münzen <img class="cur" src="${bank.iconUrl('coin')}" alt=""><b data-to="${info.einkommen}">0</b><span class="muted">Tageseinkommen${info.bonus ? ` · +${info.bonus} Bonus` : ''}${info.verfallen ? ` · ${info.verfallen} übrige verfallen` : ''}</span></div>
      <div>Elitewellen<b>${r.elitewellen}</b></div>
      <div>Packs geöffnet<b>${Object.values(r.packsGeoeffnet).reduce((a, b) => a + b, 0)}</b></div>
    </div>
    ${info.neueKarten.length ? `<div class="res-row"><b>Neue Karten:</b>${info.neueKarten.map((id) => `<img src="${bank.cardUrl(id)}" title="${escapeHtml(data.cardIndex[id].def.name)}">`).join('')}</div>` : ''}
    ${best ? `<div class="res-row"><b>Beste Einheit:</b><img src="${bank.unitUrl(best.id)}"> ${escapeHtml(best.name)}${best.foil ? ' ✦' : ''} – ${best.schaden} Schaden, ${best.kills} Kills</div>` : ''}
    <div class="res-row">      ${info.schatzRelikt ? `<span style="color:#FFD24A">Relikt-Jagd: ${escapeHtml(info.schatzRelikt.name)} ist jetzt im Reiter RELIKTE.</span>` : ''}${info.schatzBonus ? ` <span style="color:#FFD24A">Beuteteilung: ${escapeHtml(info.schatzBonus.name)}!</span>` : ''}
      ${r.ersteShinys?.length ? `<span class="rainbow-text">Erste Shinys: ${r.ersteShinys.map((id) => escapeHtml(data.cardIndex[id].def.name)).join(', ')}</span>` : ''}
      ${info.erfolge.map((a) => `<span style="color:#FFD24A">★ Erfolg: ${escapeHtml(a.name)}</span>`).join('')}</div>
    <div class="row">
      <button class="btn btn-primary btn-big" id="res-star">Weiter zu den Upgrades${anyNodeAffordable(data, save) ? ' •' : ''}</button>
    </div>`;
  show('#overlay-result', true);
  // Zahlen zählen in ca. 2 s hoch; ein Klick in das Fenster zeigt sofort die Endwerte
  let skip = false;
  box.querySelectorAll('b[data-to]').forEach((b) => countTo(b, 0, Number(b.dataset.to), 2000, () => { if (skip) b.textContent = b.dataset.to; else play('count'); }));
  box.onpointerdown = () => { skip = true; box.querySelectorAll('b[data-to]').forEach((b) => { b.textContent = b.dataset.to; }); };

  const close = () => show('#overlay-result', false);
  $('#res-star').onclick = () => { close(); game.goto('hub', { tab: 'upgrade', autoClaim: true }); };

  // Freischaltungen nacheinander zeigen (14.6b)
  const items = [];
  if (info.kapitelFrei) items.push({ title: 'NEUES KAPITEL!', name: info.kapitelFrei.name, img: bank.url(bank.fieldTower(info.kapitelFrei.farbwelt?.turmlicht ?? '#7ab8ff')), w: 100, h: 200 });
  for (const p of info.packsFrei) items.push({ title: p.art === 'kiste' ? 'NEUE BOOSTER-KISTE!' : 'NEUES PACK!', name: p.name, img: bank.shopItemUrl(p.id), w: p.art === 'kiste' ? 200 : 180, h: p.art === 'kiste' ? 200 : 240 });
  if (!foilBefore && foilTreeUnlocked(save)) items.push({ title: 'FOIL-BAUM!', name: 'Dein erster Schimmer! Der Foil-Baum ist jetzt über den Regenbogen-Kristall im Reiter UPGRADE erreichbar.', img: bank.iconUrl('crystal_regen'), w: 160, h: 160 });
  if (!info.relikt && info.reliktStaub) items.push({ title: 'ALLE RELIKTE GEFUNDEN!', name: `Stattdessen: +${info.reliktStaub} Schimmer`, img: bank.iconUrl('crystal_regen'), w: 160, h: 160 });
  if (info.relikt) items.push({ title: 'NEUES RELIKT!', name: `${info.relikt.name}: ${info.relikt.beschreibung}`, img: bank.iconUrl(info.relikt.symbol), w: 180, h: 180 });
  for (const a of info.erfolge) items.push({ title: 'ERFOLG!', name: `${a.name} – ${a.beschreibung}${a.belohnung?.foilStaub ? ` (+${a.belohnung.foilStaub} Schimmer)` : ''}`, img: bank.iconUrl('crown'), w: 160, h: 160 });
  if (items.length) setTimeout(() => showUnlocks(items), 900);
}

export function showPopups(list) {
  if (!list.length) return;
  const box = $('#popup-box');
  box.innerHTML = `${list[0]}<div class="row"><button class="btn btn-primary btn-big" id="popup-ok">Super!</button></div>`;
  show('#overlay-popup', true);
  play('unlock');
  const stop = confetti($('#confetti'));
  $('#popup-ok').onclick = () => { stop(); show('#overlay-popup', false); showPopups(list.slice(1)); };
}

function confetti(canvas) {
  const ctx = canvas.getContext('2d');
  const cols = ['#FFD24A', '#E04848', '#5AA9F0', '#5ED17A', '#A55CE0', '#F4EBD9'];
  const parts = Array.from({ length: 160 }, () => ({ x: Math.random() * 1920, y: -Math.random() * 600, vx: (Math.random() - 0.5) * 120, vy: 160 + Math.random() * 240, c: cols[Math.floor(Math.random() * 6)], s: 8 + Math.floor(Math.random() * 3) * 4 }));
  let raf, last = performance.now();
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, 1920, 1080);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > 1100) { p.y = -20; p.x = Math.random() * 1920; } ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4, p.s, p.s / 2); }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, 1920, 1080); };
}
