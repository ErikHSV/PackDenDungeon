// Einstiegspunkt: lädt Daten und Spielstand, verbindet alle Bildschirme.
import { DATA_FILES, prepareData, validateReferences } from './core/data.js';
import { computeModifiers } from './core/starmap.js';
import { loadSave, writeSave } from './save.js';
import { setVolumes, play, startMusic } from './audio.js';
import { $, $$, stage, toast, show } from './ui/dom.js';
import { cardElement } from './ui/cardView.js';
import { MenuScenes, renderMainMenu, renderChapterSelect } from './ui/menus.js';
import { BattleController } from './ui/battle.js';
import { StarmapScreen } from './ui/starmapScreen.js';
import { renderCollection } from './ui/collection.js';
import { bindSettings, refreshSettings } from './ui/settings.js';
import { SpriteBank } from './render/sprites.js';

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

async function boot() {
  stage.init();
  let data;
  try { data = await loadData(); } catch (err) { showLoadError(err); return; }
  const problems = validateReferences(data);
  if (problems.length) console.warn('Datenprobleme:', problems);
  try { await document.fonts?.load('32px "Pixelify Sans"'); } catch { /* Schrift optional */ }

  const game = {
    data,
    save: loadSave(),
    bank: new SpriteBank(data),
    debug: new URLSearchParams(location.search).has('debug'),
    persist() { writeSave(this.save); },
    mods() { return computeModifiers(this.data.starmap, this.save.mastery); },
    card(id, opts) { return cardElement(id, this, opts); },
    toast,
    showScreen(name) {
      $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
      this.current = name;
    },
    /** Bildschirm wechseln. opts.back: wohin "Zurück" führt. */
    goto(name, opts = {}) {
      if (this.current === 'starmap' && name !== 'starmap') this.starmap.close();
      if (name !== 'battle' && this.current === 'battle' && !this.battle.paused) this.battle.stop();
      show('#tip', false);
      switch (name) {
        case 'menu': renderMainMenu(this); break;
        case 'chapters': renderChapterSelect(this, (id) => this.startRun(id)); break;
        case 'starmap': this.starmap.backTarget = opts.back ?? 'menu'; break;
        case 'collection': renderCollection(this); break;
        case 'settings': this.settingsBack = opts.back ?? 'menu'; refreshSettings(this); break;
        case 'battle': this.battle.resumeScreen(); break;
      }
      this.showScreen(name);
      if (name === 'starmap') this.starmap.open();
    },
    /** Run starten: Abblenden (0,4 s), Kampfbildschirm mit leerem Feld. */
    startRun(chapterId) {
      stage.fade(() => {
        if (this.current === 'starmap') this.starmap.close();
        ['#overlay-runend', '#overlay-pause', '#overlay-unlock'].forEach((s) => show(s, false));
        this.showScreen('battle');
        this.battle.start(chapterId);
      });
    },
  };
  game.battle = new BattleController(game);
  game.starmap = new StarmapScreen(game);
  game.menuScenes = new MenuScenes(game);
  setVolumes(game.save.settings.musicVolume, game.save.settings.sfxVolume);
  bindSettings(game);
  document.title = data.balance.gameTitle;
  $('#start-logo').textContent = data.balance.gameTitle;
  $('#menu-logo').textContent = data.balance.gameTitle;

  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => { play('click'); game.goto(b.dataset.goto); }));
  $('#menu-quit').addEventListener('click', () => {
    window.close(); // klappt nur in manchen Umgebungen – sonst zurück zum Startbildschirm
    stage.fade(() => game.showScreen('start'));
  });

  // Startbildschirm: Klick/Tipp → abblenden ins Hauptmenü (startet auch die Musik)
  $('#screen-start').addEventListener('pointerdown', () => {
    startMusic('menu');
    play('click');
    stage.fade(() => game.goto('menu'));
  });
  ['#start-canvas', '#menu-canvas'].forEach((s) => { $(s).width = 1920; $(s).height = 1080; });
  game.showScreen('start');
  window.game = game; // für Debugging in der Konsole
}

boot();
