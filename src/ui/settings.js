// Einstellungen (8.2.11): Lautstärken, Schnelles Öffnen, Bildschirmwackeln, Schadenszahlen, Sprache, Spielstand löschen.
import { $, $$, show, confirmDialog, toast } from './dom.js';
import { setVolumes } from '../audio.js';
import { resetSave } from '../save.js';

export function bindSettings(game) {
  const s = () => game.save.settings;
  for (const r of $$('[data-volume]')) {
    r.addEventListener('input', () => {
      s()[r.dataset.volume] = Number(r.value) / 100;
      setVolumes(s().musicVolume, s().sfxVolume);
      game.persist();
    });
  }
  for (const box of $$('[data-setting]')) {
    box.addEventListener('change', () => { s()[box.dataset.setting] = box.checked; game.persist(); });
  }
  $('#language').addEventListener('change', (ev) => { s().language = ev.target.value; game.persist(); });

  // Spielstand löschen – mit doppelter Rückfrage
  $('#btn-reset').addEventListener('click', async () => {
    if (!(await confirmDialog('Spielstand wirklich löschen? Sternenkarte, Sammlung und Statistiken gehen verloren.', 'Löschen', 'Abbrechen'))) return;
    if (!(await confirmDialog('Bist du ganz sicher? Das kann nicht rückgängig gemacht werden.', 'Endgültig löschen', 'Abbrechen'))) return;
    game.save = resetSave();
    game.persist();
    refreshSettings(game);
    toast('Spielstand gelöscht');
    game.goto('menu');
  });

  // Debug-Werkzeuge (nur mit ?debug in der URL)
  $('#dbg-points').addEventListener('click', () => { game.save.masteryPoints += 100; game.save.splinters = (game.save.splinters || 0) + 5; game.persist(); toast('+100 MP, +5 Splitter'); });
  $('#dbg-unlock').addEventListener('click', () => { game.save.unlockedChapter = game.data.chapters.length; game.persist(); toast('Alle Kapitel freigeschaltet'); });
  $('#dbg-collect').addEventListener('click', () => {
    for (const id of game.data.allCards) game.save.collection[id] ||= 1;
    game.persist(); toast('Alle Karten gefunden');
  });
  $('#settings-back').addEventListener('click', () => game.goto(game.settingsBack ?? 'menu'));
}

export function refreshSettings(game) {
  const st = game.save.settings;
  for (const r of $$('[data-volume]')) r.value = Math.round((st[r.dataset.volume] ?? 0.5) * 100);
  for (const box of $$('[data-setting]')) box.checked = !!st[box.dataset.setting];
  $('#language').value = st.language || 'de';
  show('#debug-meta', game.debug);
}
