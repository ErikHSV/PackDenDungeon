// Menü-Bildschirme: Hauptmenü, Kapitelwahl, Mastery-Baum, Sammlung, Einstellungen.
import { $, $$, el, escapeHtml, toast } from './dom.js';
import { cardElement } from './cardView.js';
import { nodeCost, purchaseBlocker, buyNode } from '../core/mastery.js';
import { writeSave } from '../save.js';
import { play } from '../audio.js';

export function showScreen(name) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  window.scrollTo(0, 0);
}

// ---------- Hauptmenü ----------

export function renderMenu(game) {
  const { save, data } = game;
  $('#menu-points').textContent = save.masteryPoints > 0 ? save.masteryPoints : '';
  const s = save.stats;
  const best = Object.entries(s.bestWave).map(([ch, w]) => `${data.chapterIndex[ch]?.name ?? ch}: Welle ${w}`).join(' · ');
  $('#menu-stats').innerHTML = s.runs
    ? `Runs: <b>${s.runs}</b> · Besiegte Gegner: <b>${s.totalKills}</b> · Packs: <b>${s.packsOpened}</b><br>${best ? 'Beste Welle – ' + escapeHtml(best) : ''}`
    : 'Willkommen! Starte deinen ersten Run.';
}

// ---------- Kapitelwahl ----------

export function renderChapters(game, onStart) {
  const { save, data } = game;
  const list = $('#chapter-list');
  list.innerHTML = '';
  for (const ch of data.chapters) {
    const locked = ch.id > save.unlockedChapter;
    const best = save.stats.bestWave[ch.id] || 0;
    const kills = save.stats.bossKills[ch.id] || 0;
    const boss = data.enemyIndex[ch.boss];
    const packs = data.packs.filter((p) => p.unlockChapter === ch.id).map((p) => p.name).join(', ');
    const node = el(`
      <div class="chapter ${locked ? 'locked' : ''}" style="border-color:${ch.colors.skyBottom}">
        <h3>Kapitel ${ch.id} – ${escapeHtml(ch.name)}</h3>
        <p>${escapeHtml(ch.intro || '')}</p>
        <p class="q">„${escapeHtml(ch.question || '')}“</p>
        <div class="meta">${ch.waves} Wellen · Boss: ${locked ? '???' : escapeHtml(boss.name)}${packs ? ` · schaltet frei: ${escapeHtml(packs)}` : ''}</div>
        <div class="meta">Beste Welle: ${best} / ${ch.waves}${kills ? ` · Boss ${kills}× besiegt ✔` : ''}</div>
        <button class="btn ${locked ? '' : 'btn-primary'}" ${locked ? 'disabled' : ''}>${locked ? '🔒 Gesperrt' : 'Run starten'}</button>
      </div>`);
    if (!locked) node.querySelector('button').addEventListener('click', () => onStart(ch.id));
    list.appendChild(node);
  }
}

// ---------- Mastery ----------

export function renderMastery(game) {
  const { save, data } = game;
  $('#mastery-points').textContent = save.masteryPoints;
  const tree = $('#mastery-tree');
  tree.innerHTML = '';
  for (const br of data.mastery.branches) {
    const col = el(`<div class="branch" style="--bcol:${br.color}"><h3>${escapeHtml(br.name)}</h3></div>`);
    for (const node of data.mastery.nodes.filter((n) => n.branch === br.id)) {
      const lvl = save.mastery[node.id] || 0;
      const maxed = lvl >= node.maxLevel;
      const blocker = purchaseBlocker(node, save);
      const notFound = blocker === 'Karte noch nicht gefunden';
      const cost = nodeCost(node, lvl);
      const card = node.effect.type === 'spec' ? data.cardIndex[node.effect.card]?.def : null;
      const n = el(`
        <div class="node ${maxed ? 'maxed' : ''} ${notFound ? 'locked' : ''}">
          <div class="info">
            <div class="nname">${escapeHtml(node.name)}${card ? ` <span class="muted">(${notFound ? '???' : escapeHtml(card.name)})</span>` : ''}</div>
            <div class="ndesc">${notFound ? 'Wird freigeschaltet, sobald du diese Karte einmal gezogen hast.' : escapeHtml(node.description)}</div>
            <div class="lvl">Stufe ${lvl} / ${node.maxLevel}</div>
          </div>
          <button class="btn btn-small ${blocker ? '' : 'btn-primary'}" ${blocker ? 'disabled' : ''} title="${escapeHtml(blocker || '')}">
            ${maxed ? '✔' : notFound ? '🔒' : `${cost} P`}
          </button>
        </div>`);
      n.querySelector('button').addEventListener('click', () => {
        if (buyNode(node, save)) {
          writeSave(save);
          play('buy');
          renderMastery(game);
        }
      });
      col.appendChild(n);
    }
    tree.appendChild(col);
  }
}

// ---------- Sammlung ----------

export function renderCollection(game) {
  const { save, data } = game;
  const grid = $('#collection');
  grid.innerHTML = '';
  let found = 0;
  for (const id of data.allCards) {
    const count = save.collection[id] || 0;
    if (count) found++;
    grid.appendChild(cardElement(id, data, { found: count > 0, count }));
  }
  $('#collection-count').textContent = `(${found} / ${data.allCards.length} gefunden)`;
}

// ---------- Einstellungen ----------

export function bindSettings(game, onChange) {
  const { save } = game;
  for (const box of $$('[data-setting]')) {
    box.checked = !!save.settings[box.dataset.setting];
    box.addEventListener('change', () => {
      save.settings[box.dataset.setting] = box.checked;
      writeSave(save);
      onChange();
    });
  }
  $('#dbg-points').addEventListener('click', () => { save.masteryPoints += 100; writeSave(save); toast('+100 Mastery-Punkte'); onChange(); });
  $('#dbg-unlock').addEventListener('click', () => { save.unlockedChapter = game.data.chapters.length; writeSave(save); toast('Alle Kapitel freigeschaltet'); onChange(); });
  $('#dbg-collect').addEventListener('click', () => {
    for (const id of game.data.allCards) save.collection[id] ||= 1;
    writeSave(save); toast('Alle Karten gefunden'); onChange();
  });
}

export function refreshSettings(game) {
  for (const box of $$('[data-setting]')) box.checked = !!game.save.settings[box.dataset.setting];
  $('#debug-meta').classList.toggle('hidden', !game.save.settings.debug);
}
