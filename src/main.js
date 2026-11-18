// Einstiegspunkt: lädt Daten und Spielstand, verbindet alle Bildschirme.
import { DATA_FILES, prepareData, validateReferences } from './core/data.js';
import { computeMods } from './core/meta.js';
import { loadSave, writeSave } from './save.js';
import { setVolumes, play, startMusic } from './audio.js';
import { $, $$, stage, toast, show } from './ui/dom.js';
import { cardElement } from './ui/cardView.js';
import { BattleController } from './ui/battle.js';
import { StarmapScreen } from './ui/starmapScreen.js';
import { Hub } from './ui/hub.js';
import { renderCollection, renderRelics, renderQuests, renderAchievements, bindSettings, refreshSettings } from './ui/screens.js';
import { SpriteBank, frameAt } from './render/sprites.js';
import { arenaFloor } from './render/arena.js';

async function loadData() {
  const entries = await Promise.all(DATA_FILES.map(async (f) => {
    const res = await fetch(`data/${f}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`data/${f}.json: HTTP ${res.status}`);
    return [f, await res.json()];
  }));
  return prepareData(Object.fromEntries(entries));
}

function showLoadError(err) {
  const box = $('#load-error');
  box.innerHTML = `<div><h2>Spieldaten konnten nicht geladen werden</h2><p>${err.message}</p>
    <p>Das Spiel lädt JSON-Dateien und muss über einen Webserver laufen,<br>
    z. B. <code>python3 -m http.server</code> im Projektordner (oder GitHub Pages).</p></div>`;
  box.classList.remove('hidden');
}

/** Pixel-Pfeil als Mauszeiger (außerhalb des Kampfes). */
function pixelCursor() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const rows = ['X', 'XX', 'XWX', 'XWWX', 'XWWWX', 'XWWWWX', 'XWWWWWX', 'XWWWWWWX', 'XWWWWXXX', 'XWXWWX', 'XX XWWX', '   XWWX', '    XX'];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === ' ') return; g.fillStyle = ch === 'X' ? '#1E1B2E' : '#F4EBD9'; g.fillRect(x * 2, y * 2, 2, 2); }));
  document.body.style.cursor = `url(${c.toDataURL()}) 0 0, auto`;
}

/** Startbildschirm: ruhige Arena, Monster ziehen langsam zum Turm. */
function startScreen(game) {
  const cv = $('#start-canvas');
  cv.width = 1920; cv.height = 1080;
  const c = cv.getContext('2d');
  const { data, bank } = game;
  const A = data.balance.arena;
  const t0 = performance.now();
  const walkers = Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2, id: ['moorling', 'sumpfratte', 'kraehe'][i % 3], off: Math.random() }));
  const loop = (now) => {
    if (game.current !== 'start') return;
    const t = (now - t0) / 1000;
    c.imageSmoothingEnabled = false;
    c.drawImage(arenaFloor(data.chapterIndex[1], A), 0, 0);
    const tower = bank.tower(0);
    c.drawImage(tower, Math.round(A.mitteX - tower.width / 2), Math.round(A.mitteY - tower.height + 50));
    for (const w of walkers) {
      const k = 1 - ((t * 0.04 + w.off) % 1) * 0.75;
      const x = A.mitteX + Math.cos(w.a + t * 0.05) * A.radiusX * k, y = A.mitteY + Math.sin(w.a + t * 0.05) * A.radiusY * k;
      const fr = frameAt(bank.enemy(w.id), 'idle', t + w.off, 5);
      c.drawImage(fr, Math.round(x - fr.width * 1.5), Math.round(y - fr.height * 1.5), fr.width * 3, fr.height * 3);
    }
    c.fillStyle = 'rgba(14,11,26,0.35)';
    c.fillRect(0, 0, 1920, 1080);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

async function boot() {
  stage.init();
  let data;
  try { data = await loadData(); } catch (err) { showLoadError(err); return; }
  const problems = validateReferences(data);
  if (problems.length) console.warn('Datenprobleme:', problems);
  try { await document.fonts?.load('32px "Pixelify Sans"'); } catch { /* Schrift optional */ }

  const game = {
    data,
    save: loadSave(data),
    bank: new SpriteBank(data),
    debug: new URLSearchParams(location.search).has('debug'),
    sessionStart: performance.now(),
    current: null,
    lastBag: [],
    persist() { writeSave(this.save); },
    /** Modifikatoren für einen Run (opts: modifierId, prestige, gesucht) oder für den Hub. */
    mods(opts = {}) { return computeMods(this.data, this.save, opts); },
    card(id, opts) { return cardElement(id, this, opts); },
    toast,
    showScreen(name) {
      $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
      this.current = name;
    },
    /** Bildschirm wechseln. opts.back: wohin "Zurück" führt. */
    goto(name, opts = {}) {
      if (this.current === 'starmap' && name !== 'starmap') this.starmap.close();
      if (this.current === 'hub' && name !== 'hub') this.hub.close();
      if (name !== 'battle' && this.current === 'battle' && !this.battle.paused) this.battle.stop();
      show('#tip', false);
      switch (name) {
        case 'starmap': this.starmap.backTarget = opts.back ?? 'hub'; break;
        case 'collection': renderCollection(this); break;
        case 'relics': renderRelics(this); break;
        case 'quests': renderQuests(this); break;
        case 'achievements': renderAchievements(this); break;
        case 'settings': this.settingsBack = opts.back ?? 'hub'; refreshSettings(this); break;
      }
      if (name !== 'battle') startMusic('menu');
      // Einstellungen aus der Pause: Pause-Overlay aus- und bei der Rückkehr wieder einblenden
      show('#overlay-pause', name === 'battle' && this.battle.paused);
      this.showScreen(name);
      if (name === 'starmap') this.starmap.open();
      if (name === 'hub') this.hub.open();
    },
    /** Run starten: Abblenden (0,4 s), Kampfbildschirm mit leerem Feld. */
    startRun(opts) {
      this.lastBag = this.save.shop.bag.map((b) => b.artikel);
      stage.fade(() => {
        if (this.current === 'starmap') this.starmap.close();
        if (this.current === 'hub') this.hub.close();
        ['#overlay-result', '#overlay-pause', '#overlay-popup'].forEach((s) => show(s, false));
        this.showScreen('battle');
        this.battle.start(opts);
      });
    },
  };
  game.battle = new BattleController(game);
  game.starmap = new StarmapScreen(game);
  game.hub = new Hub(game);
  setVolumes(game.save.settings.musicVolume, game.save.settings.sfxVolume);
  bindSettings(game);
  document.title = data.balance.gameTitle ?? 'PackDenDungeon';
  $('#start-logo').textContent = document.title;
  for (const img of $$('img[data-icon]')) img.src = game.bank.iconUrl(img.dataset.icon);
  pixelCursor();

  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => { play('click'); game.goto(b.dataset.goto); }));

  // Startbildschirm: Klick/Tipp → abblenden in den Hub (startet auch die Musik)
  $('#screen-start').addEventListener('pointerdown', () => {
    if (game.current !== 'start') return;
    startMusic('menu');
    play('click');
    stage.fade(() => game.goto('hub'));
  });
  game.showScreen('start');
  startScreen(game);
  window.game = game; // für Debugging in der Konsole
}

boot();
