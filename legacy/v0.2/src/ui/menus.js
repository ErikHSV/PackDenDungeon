// Startbildschirm, Hauptmenü und Kapitelauswahl (Landkarte).
import { $, el, escapeHtml, showTip } from './dom.js';
import { drawBackground } from '../render/backgrounds.js';
import { frameAt } from '../render/sprites.js';
import { anyAffordable } from '../core/starmap.js';
import { hash } from '../render/pixel.js';

// ---------------------------------------------------------------------
// Animierte Hintergründe für Start und Hauptmenü
// ---------------------------------------------------------------------

/** Zeichnet den Moorwald bildschirmfüllend (Himmel oben ergänzt). */
function drawScene(ctx, t, scroll) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1d2b2a';
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.save();
  ctx.translate(0, 270);
  drawBackground(ctx, 1, 1920, 810, t, scroll);
  ctx.restore();
  // ein paar Sterne im ergänzten Himmel
  for (let i = 0; i < 40; i++) {
    const a = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.8 + i));
    ctx.fillStyle = `rgba(244,235,217,${a.toFixed(2)})`;
    ctx.fillRect(Math.round(hash(i, 1) * 480) * 4, Math.round(hash(i, 2) * 60) * 4, 4, 4);
  }
}

export class MenuScenes {
  constructor(game) {
    this.game = game;
    this.t0 = performance.now();
    this.menuHeroes = [];
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  pickMenuHeroes() {
    const found = this.game.data.heroes.filter((h) => this.game.save.collection[h.id] > 0).map((h) => h.id);
    const pool = found.length ? found : ['torwaechter', 'schleuderjunge'];
    const out = [];
    while (out.length < Math.min(3, pool.length)) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      if (!out.includes(id)) out.push(id);
    }
    this.menuHeroes = out;
  }

  loop(now) {
    const t = (now - this.t0) / 1000;
    if ($('#screen-start').classList.contains('active')) {
      drawScene($('#start-canvas').getContext('2d'), t, t * 40); // langsam vorbeiziehende Parallax-Ebenen
    } else if ($('#screen-menu').classList.contains('active')) {
      const ctx = $('#menu-canvas').getContext('2d');
      drawScene(ctx, t, t * 8);
      // Schaubild: Turm mit gefundenen Helden in Idle-Animation
      const bank = this.game.bank;
      const tower = bank.tower();
      ctx.drawImage(tower, 1180, 990 - tower.height);
      this.menuHeroes.forEach((id, i) => {
        const fr = bank.hero(id);
        const img = frameAt(fr, 'idle', t + i * 0.7, 5);
        ctx.drawImage(img, 1420 + i * 130, 990 - 128 - (i % 2) * 40, 128, 128);
      });
    }
    requestAnimationFrame(this.loop);
  }
}

// ---------------------------------------------------------------------
// Hauptmenü
// ---------------------------------------------------------------------

export function renderMainMenu(game) {
  const { save, data } = game;
  ['#start-canvas', '#menu-canvas'].forEach((s) => { $(s).width = 1920; $(s).height = 1080; });
  $('#menu-points').textContent = save.masteryPoints > 0 ? `${save.masteryPoints}` : '';
  $('#menu-dot').classList.toggle('hidden', !anyAffordable(data, save));
  const found = data.allCards.filter((id) => save.collection[id] > 0).length;
  $('#menu-collection').textContent = `${found}/${data.allCards.length}`;
  const best = Math.max(0, ...Object.values(save.stats.bestWave));
  $('#menu-stats').textContent = `Beste Welle: ${best} | Runs: ${save.stats.runs}`;
  $('#version').textContent = `v${data.balance.version}`;
  game.menuScenes.pickMenuHeroes();
  // Tutorial 5: nach dem ersten Run auf die Sternenkarte hinweisen
  if (save.stats.runs >= 1 && !save.tutorial.masteryHintShown && save.masteryPoints > 0) {
    save.tutorial.masteryHintShown = true;
    game.persist();
    setTimeout(() => { if (game.current === 'menu') showTip('Investiere deine Mastery-Punkte!', $('#menu-mastery'), 'left', 6000); }, 450);
  }
}

// ---------------------------------------------------------------------
// Kapitelauswahl: gezeichnete Landkarte mit 4 Orten
// ---------------------------------------------------------------------

const MAP_POINTS = { 1: [220, 700], 2: [520, 470], 3: [840, 690], 4: [1010, 230] };
const MAP_W = 1220, MAP_H = 920;

function drawMap(ctx, data, save) {
  ctx.imageSmoothingEnabled = false;
  // Pergament
  for (let y = 0; y < MAP_H; y += 8) for (let x = 0; x < MAP_W; x += 8) {
    const n = hash(x, y, 3);
    ctx.fillStyle = n > 0.92 ? '#c9b48a' : n > 0.5 ? '#e2d2ac' : '#dccaa0';
    ctx.fillRect(x, y, 8, 8);
  }
  const blob = (cx, cy, r, col, seed) => {
    for (let i = 0; i < 26; i++) {
      const a = hash(i, seed) * Math.PI * 2, d = hash(i, seed + 1) * r;
      const s = 24 + Math.round(hash(i, seed + 2) * 4) * 8;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round((cx + Math.cos(a) * d) / 8) * 8, Math.round((cy + Math.sin(a) * d * 0.7) / 8) * 8, s, s);
    }
  };
  // Regionen
  blob(220, 720, 170, '#8fa86a', 10); // Moorwald
  for (let i = 0; i < 14; i++) { const x = 100 + hash(i, 4) * 260, y = 600 + hash(i, 5) * 220; ctx.fillStyle = '#4f7a3a'; ctx.fillRect(Math.round(x / 8) * 8, Math.round(y / 8) * 8, 24, 24); ctx.fillStyle = '#5b4630'; ctx.fillRect(Math.round(x / 8) * 8 + 8, Math.round(y / 8) * 8 + 24, 8, 16); }
  blob(520, 470, 150, '#9aa0aa', 20); // Gruft
  for (let i = 0; i < 9; i++) { const x = 420 + hash(i, 6) * 200, y = 380 + hash(i, 7) * 180; ctx.fillStyle = '#6a6f78'; ctx.fillRect(Math.round(x / 8) * 8, Math.round(y / 8) * 8, 16, 24); }
  blob(840, 690, 150, '#c08060', 30); // Schmiede
  ctx.fillStyle = '#6a3a2a';
  for (let k = 0; k < 7; k++) ctx.fillRect(840 - 120 + k * 16, 600 - k * 16, 240 - k * 32, 16);
  ctx.fillStyle = '#ff7a2a'; ctx.fillRect(832, 488, 16, 16); ctx.fillRect(824, 504, 32, 8);
  blob(1010, 230, 150, '#e8f0f6', 40); // Frostthron
  ctx.fillStyle = '#a6c8e0';
  for (let p = 0; p < 3; p++) for (let k = 0; k < 8; k++) ctx.fillRect(900 + p * 90 - 8 * k + 64, 180 + k * 16, 16 + 16 * k, 16);
  // Meer am Rand
  ctx.fillStyle = '#8fb0c8';
  for (let y = 0; y < MAP_H; y += 8) ctx.fillRect(0, y, 24 + Math.round(hash(y, 9) * 3) * 8, 8);
  // gestrichelter Pfad
  const pts = [1, 2, 3, 4].map((i) => MAP_POINTS[i]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const steps = Math.hypot(x1 - x0, y1 - y0) / 24;
    for (let s = 0; s < steps; s++) {
      if (s % 2) continue;
      const k = s / steps;
      const unlocked = i + 2 <= save.unlockedChapter;
      ctx.fillStyle = unlocked ? '#8a3a2a' : '#9a8a70';
      ctx.fillRect(Math.round((x0 + (x1 - x0) * k + Math.sin(k * 6) * 20) / 8) * 8, Math.round((y0 + (y1 - y0) * k) / 8) * 8, 12, 12);
    }
  }
  // Kartenrand
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 16; ctx.strokeRect(8, 8, MAP_W - 16, MAP_H - 16);
}

export function renderChapterSelect(game, onStart, selectedId) {
  const { data, save, bank } = game;
  const canvas = $('#map-canvas');
  canvas.width = MAP_W; canvas.height = MAP_H;
  drawMap(canvas.getContext('2d'), data, save);
  const pins = $('#map-points');
  pins.innerHTML = '';
  let selected = selectedId ?? save.lastChapter ?? save.unlockedChapter;
  if (selected > save.unlockedChapter) selected = save.unlockedChapter;
  const emblem = { 1: 'schlammling', 2: 'knochenritter', 3: 'feuerkaefer', 4: 'eisgeist' };
  for (const ch of data.chapters) {
    const [x, y] = MAP_POINTS[ch.id] ?? [600, 460];
    const locked = ch.id > save.unlockedChapter;
    const prevBoss = data.chapterIndex[ch.id - 1] ? data.enemyIndex[data.chapterIndex[ch.id - 1].boss].name : '';
    const p = el(`
      <div class="map-point ${locked ? 'locked' : ''} ${ch.id === selected ? 'selected' : ''}" style="left:${x}px;top:${y}px">
        <div class="pin"><img src="${bank.enemyUrl(emblem[ch.id] ?? data.chapterIndex[ch.id].enemies[0].id)}" alt=""></div>
        ${locked ? `<img class="lock" src="${bank.iconUrl('lock')}" alt="">` : ''}
        <div class="label">${ch.id}. ${escapeHtml(ch.name)}</div>
        ${locked ? `<div class="hint">Besiege ${escapeHtml(prevBoss)}, um freizuschalten</div>` : ''}
      </div>`);
    p.addEventListener('click', () => { if (!locked) renderChapterSelect(game, onStart, ch.id); });
    pins.appendChild(p);
  }
  renderChapterInfo(game, data.chapterIndex[selected], onStart);
}

function renderChapterInfo(game, ch, onStart) {
  const { data, save, bank } = game;
  const best = save.stats.bestWave[ch.id] || 0;
  const ids = [...new Set(ch.enemies.map((e) => e.id).concat(ch.boss))];
  const enemies = ids.map((id) => save.seenEnemies[id]
    ? `<div class="ei" title="${escapeHtml(data.enemyIndex[id].name)}"><img src="${bank.enemyUrl(id)}" alt=""></div>`
    : '<div class="ei">?</div>').join('');
  const packs = data.packs.filter((p) => p.unlockChapter <= save.unlockedChapter || game.mods().earlyPacks.includes(p.id))
    .map((p) => `<img src="${bank.chestUrl(p.id)}" title="${escapeHtml(p.name)}" alt="">`).join('');
  const info = $('#chapter-info');
  info.innerHTML = `
    <h2>${escapeHtml(ch.name)}</h2>
    <div class="mood">${escapeHtml(ch.intro)} ${escapeHtml(ch.question ? '„' + ch.question + '“' : '')}</div>
    <div class="meta">${ch.waves} Wellen · Beste Welle: <b>${best}</b>${save.stats.bossKills[ch.id] ? ' · Boss besiegt ✔' : ''}</div>
    <div class="label">Gegner in diesem Gebiet</div>
    <div class="enemy-icons">${enemies}</div>
    <div class="label">Verfügbare Packs</div>
    <div class="pack-icons">${packs}</div>
    <button class="btn btn-primary start">Run starten</button>`;
  info.querySelector('.start').addEventListener('click', () => onStart(ch.id));
}
