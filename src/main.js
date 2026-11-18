// Einstiegspunkt: lädt die Daten, den Spielstand und verbindet alle Bildschirme.
import { DATA_FILES, prepareData, validateReferences } from './core/data.js';
import { loadSave, writeSave, resetSave } from './save.js';
import { setSoundEnabled, play } from './audio.js';
import { $, $$ } from './ui/dom.js';
import { showScreen, renderMenu, renderChapters, renderMastery, renderCollection, bindSettings, refreshSettings } from './ui/screens.js';
import { BattleController } from './ui/battle.js';

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
  box.innerHTML = `<div><h2>Spieldaten konnten nicht geladen werden</h2>
    <p>${err.message}</p>
    <p>Das Spiel lädt JSON-Dateien und muss deshalb über einen Webserver laufen,<br>
    z. B. <code>npx serve .</code> oder <code>python3 -m http.server</code> im Projektordner<br>
    (oder über GitHub Pages).</p></div>`;
  box.classList.remove('hidden');
}

async function boot() {
  let data;
  try {
    data = await loadData();
  } catch (err) {
    showLoadError(err);
    return;
  }
  const problems = validateReferences(data);
  if (problems.length) console.warn('Datenprobleme:', problems);

  const game = { data, save: loadSave() };
  setSoundEnabled(game.save.settings.sound);
  document.title = data.balance.gameTitle;
  $('#game-title').textContent = data.balance.gameTitle;

  const battle = new BattleController(game, { onExit: (screen) => goto(screen) });

  function goto(name) {
    if (name !== 'battle') battle.stop();
    if (name === 'menu') renderMenu(game);
    if (name === 'chapters') renderChapters(game, startRun);
    if (name === 'mastery') renderMastery(game);
    if (name === 'collection') renderCollection(game);
    if (name === 'settings') refreshSettings(game);
    showScreen(name);
  }

  function startRun(chapterId) {
    showScreen('battle');
    battle.start(chapterId);
  }

  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => { play('click'); goto(b.dataset.goto); }));

  bindSettings(game, () => {
    setSoundEnabled(game.save.settings.sound);
    refreshSettings(game);
  });

  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Spielstand wirklich löschen? Mastery, Sammlung und Statistiken gehen verloren.')) return;
    game.save = resetSave();
    writeSave(game.save);
    refreshSettings(game);
    goto('menu');
  });

  // ?debug in der URL schaltet die Debug-Werkzeuge ein
  if (new URLSearchParams(location.search).has('debug')) { game.save.settings.debug = true; writeSave(game.save); }

  goto('menu');
}

boot();
