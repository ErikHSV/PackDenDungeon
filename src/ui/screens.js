// Nebenbildschirme: Sammlung (14.11), Relikte (14.10), Quests und Erfolge (14.12), Einstellungen (14.13).
import { $, $$, el, escapeHtml, show, confirmDialog, toast } from './dom.js';
import { cardElement } from './cardView.js';
import { relicSlots, equipRelic, destroyRelic, progressOf, claimQuest } from '../core/meta.js';
import { resetSave } from '../save.js';
import { setVolumes, play } from '../audio.js';
import { formatNumber } from '../core/util.js';

// =====================================================================
// Sammlung: Einheiten/Tomes, Foils, Bestiarium, Grenzgänger, Relikte
// =====================================================================

const COL_TABS = [['karten', 'Einheiten & Tomes'], ['foils', 'Foils'], ['bestiarium', 'Bestiarium'], ['grenz', 'Grenzgänger'], ['relikte', 'Relikte']];

export function renderCollection(game, tab = game.colTab ?? 'karten') {
  const { data, save, bank } = game;
  game.colTab = tab;
  const has = (id) => (save.collection[id]?.normal || 0) + (save.collection[id]?.foil || 0) > 0;
  const normalCards = data.allCards.filter((id) => data.cardIndex[id].def.rarity !== 'grenzgaenger');
  $('#col-progress').textContent = `${data.allCards.filter(has).length} / ${data.allCards.length} Karten`;
  $('#col-tabs').innerHTML = COL_TABS.map(([id, name]) => `<button class="tab${id === tab ? ' active' : ''}" data-tab="${id}">${name}</button>`).join('');
  $$('#col-tabs .tab').forEach((b) => b.addEventListener('click', () => { play('click'); renderCollection(game, b.dataset.tab); }));
  const grid = $('#col-grid');
  grid.innerHTML = '';
  const add = (node) => grid.appendChild(node);
  const rank = (id) => data.rarities[data.cardIndex[id].def.rarity].rang;
  const sorted = (ids) => [...ids].sort((a, b) => rank(a) - rank(b));

  if (tab === 'karten') {
    for (const id of sorted(normalCards)) {
      const c = save.collection[id];
      add(cardElement(id, game, { found: has(id), count: c ? c.normal + c.foil : null }));
    }
  } else if (tab === 'foils') {
    for (const id of sorted(normalCards)) add(cardElement(id, game, { found: save.collection[id]?.foil > 0, foil: save.collection[id]?.foil > 0, count: save.collection[id]?.foil || null }));
  } else if (tab === 'grenz') {
    const ids = data.allCards.filter((id) => data.cardIndex[id].def.rarity === 'grenzgaenger');
    add(el('<div class="beast" style="grid-column:1/-1;width:auto;height:auto;padding:14px">Grenzgänger sind geheime Karten. Die Chance auf sie steigt, je länger du am Stück spielst.</div>'));
    for (const id of ids) add(cardElement(id, game, { found: has(id), count: save.collection[id] ? save.collection[id].normal + save.collection[id].foil : null }));
  } else if (tab === 'bestiarium') {
    for (const e of data.enemies) {
      const b = save.bestiary[e.id];
      const seen = (b?.normal || 0) + (b?.foil || 0) > 0;
      add(el(`<div class="beast${b?.foil ? ' foil' : ''}${seen ? '' : ' unknown'}">
        <img src="${bank.enemyUrl(e.id)}" alt="">
        <b>${seen ? escapeHtml(e.name) : '???'}${e.boss ? ' (Boss)' : ''}</b>
        <span class="muted">${seen ? `${b.normal} besiegt${b.foil ? ` · ${b.foil} Foil ✦` : ''}` : 'Noch nicht besiegt'}</span>
        ${seen ? `<span style="font-size:13px">${escapeHtml(e.beschreibung ?? '')}</span>` : ''}</div>`));
    }
  } else {
    for (const r of data.relics) {
      const owned = save.relics.owned.includes(r.id);
      const gone = save.relics.destroyed?.includes(r.id);
      add(el(`<div class="beast${owned ? '' : ' unknown'}" style="border-color:${data.rarities[r.rarity].farbe}">
        <img src="${bank.iconUrl(r.symbol)}" alt="">
        <b>${owned || gone ? escapeHtml(r.name) : '???'}${r.verflucht && (owned || gone) ? ' ☠' : ''}</b>
        <span class="muted">${gone ? 'Zerstört' : owned ? escapeHtml(r.beschreibung) : 'Noch nicht gefunden'}</span></div>`));
    }
  }
}

// =====================================================================
// Relikte: Plätze, Inventar, Ausrüsten (Klick oder Ziehen), Zerstören
// =====================================================================

export function renderRelics(game, selected = null) {
  const { data, save, bank } = game;
  save.relics.newCount = 0;
  game.persist();
  const slots = relicSlots(data, save);
  const max = data.balance.relikte.plaetzeMax;
  const eq = save.relics.equipped;
  $('#relic-slots').innerHTML = Array.from({ length: max }, (_, i) => {
    if (i >= slots) return '<div class="r-slot locked" title="Zerstöre ein Relikt, um einen Platz freizuschalten.">🔒</div>';
    const id = eq[i];
    return id ? `<div class="r-slot filled" data-id="${id}" title="${escapeHtml(data.relicIndex[id].name)}"><img src="${bank.iconUrl(data.relicIndex[id].symbol)}" alt=""></div>` : '<div class="r-slot" data-drop="1"></div>';
  }).join('');
  const inv = $('#relic-inv');
  inv.innerHTML = data.relics.map((r) => {
    const owned = save.relics.owned.includes(r.id);
    if (!owned) return `<div class="r-item unknown" style="--rar:#4a4266"><img src="${bank.iconUrl('relic')}" alt="">???</div>`;
    return `<div class="r-item${eq.includes(r.id) ? ' equipped' : ''}${r.verflucht ? ' cursed' : ''}" style="--rar:${data.rarities[r.rarity].farbe}" data-id="${r.id}" draggable="true"><img src="${bank.iconUrl(r.symbol)}" alt="">${escapeHtml(r.name)}</div>`;
  }).join('');
  const sel = selected && data.relicIndex[selected];
  $('#relic-detail').innerHTML = sel ? `
      <h2>${escapeHtml(sel.name)}${sel.verflucht ? ' <span class="curse">(verflucht)</span>' : ''}</h2>
      <div style="color:${data.rarities[sel.rarity].farbe}">${data.rarities[sel.rarity].name}</div>
      <p>${escapeHtml(sel.beschreibung)}</p>
      ${sel.nachteil ? `<p class="curse">Nachteil: ${escapeHtml(sel.nachteil)}</p>` : ''}
      <div class="row">
        <button class="btn btn-primary" id="relic-toggle">${eq.includes(sel.id) ? 'Ablegen' : 'Ausrüsten'}</button>
        <button class="btn btn-danger" id="relic-destroy">Zerstören</button>
      </div>
      <p class="muted">Zerstören entfernt das Relikt dauerhaft und schaltet dafür einen weiteren Reliktplatz frei (max. ${max}). Fehlende Relikte findest du in der Reliktjagd.</p>`
    : `<h2>Relikte</h2><p>${save.relics.owned.length} von ${data.relics.length} gefunden · ${eq.length}/${slots} Plätze belegt.</p>
       <p class="muted">Klicke ein Relikt an, um es auszurüsten, oder ziehe es auf einen Platz. Verfluchte Relikte sind stark, haben aber einen Nachteil.</p>`;

  const toggle = (id) => {
    if (!equipRelic(id, data, save)) { play('error'); toast('Alle Plätze belegt – lege zuerst ein Relikt ab.', true); return; }
    play('click');
    game.persist();
    renderRelics(game, id);
  };
  $$('.r-item[data-id]', inv).forEach((it) => {
    it.addEventListener('click', () => { play('click'); renderRelics(game, it.dataset.id); });
    it.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', it.dataset.id));
  });
  $$('.r-slot.filled').forEach((s) => s.addEventListener('click', () => toggle(s.dataset.id)));
  $$('.r-slot[data-drop]').forEach((s) => {
    s.addEventListener('dragover', (e) => e.preventDefault());
    s.addEventListener('drop', (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id && !eq.includes(id)) toggle(id); });
  });
  $('#relic-toggle')?.addEventListener('click', () => toggle(sel.id));
  $('#relic-destroy')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`${sel.name} wirklich zerstören? Es ist danach für immer weg, du erhältst einen zusätzlichen Reliktplatz.`, 'Zerstören', 'Behalten'))) return;
    destroyRelic(sel.id, data, save);
    play('bossSkill');
    game.persist();
    renderRelics(game);
  });
}

// =====================================================================
// Quests und Erfolge
// =====================================================================

function rewardText(b) {
  const p = [];
  if (b.tagesEinkommen) p.push(`+${b.tagesEinkommen} Münzen pro Tag`);
  if (b.kristalle) p.push(`+${b.kristalle} Kristalle`);
  if (b.reliktpack) p.push(`${b.reliktpack}× Reliktpack`);
  return p.join(', ');
}

export function renderQuests(game) {
  const { data, save } = game;
  const list = $('#quest-list');
  const items = data.quests.map((q) => ({ q, p: progressOf(q, data, save), claimed: save.quests.claimed.includes(q.id) }))
    .sort((a, b) => (a.claimed - b.claimed) || ((b.p.value >= b.p.target) - (a.p.value >= a.p.target)));
  list.innerHTML = items.map(({ q, p, claimed }) => {
    const done = p.value >= p.target;
    return `<div class="q${claimed ? ' claimed' : done ? ' done' : ''}">
      <div class="qi"><div class="qn">${escapeHtml(q.name)}</div><div>${escapeHtml(q.beschreibung)}</div>
        <div class="qbar"><div style="width:${(100 * p.value) / p.target}%"></div></div><span class="muted">${formatNumber(p.value)} / ${formatNumber(p.target)}</span></div>
      <div class="qr">Belohnung: ${escapeHtml(rewardText(q.belohnung))}</div>
      ${claimed ? '<b class="muted">Abgeholt</b>' : `<button class="btn${done ? ' btn-primary' : ''}" data-claim="${q.id}"${done ? '' : ' disabled'}>Abholen</button>`}
    </div>`;
  }).join('');
  $$('[data-claim]', list).forEach((b) => b.addEventListener('click', () => {
    const msg = claimQuest(data.questIndex[b.dataset.claim], data, save);
    if (!msg) return;
    play('unlock');
    toast(msg);
    game.persist();
    renderQuests(game);
  }));
}

export function renderAchievements(game) {
  const { data, save } = game;
  const done = data.achievements.filter((a) => save.achievements[a.id]).length;
  $('#ach-progress').textContent = `${done} / ${data.achievements.length}`;
  const cats = [...new Set(data.achievements.map((a) => a.kategorie))];
  $('#ach-list').innerHTML = cats.map((cat) => `<h2 style="margin:10px 0 0">${escapeHtml(cat)}</h2>` + data.achievements.filter((a) => a.kategorie === cat).map((a) => {
    const p = progressOf(a, data, save);
    const got = save.achievements[a.id];
    return `<div class="q${got ? ' done' : ''}"><div class="qi"><div class="qn">${escapeHtml(a.name)}</div><div>${escapeHtml(a.beschreibung)}</div>
      <div class="qbar"><div style="width:${(100 * p.value) / p.target}%"></div></div></div>
      <div class="qr">${got ? `Erreicht an Tag ${got}` : `${formatNumber(p.value)} / ${formatNumber(p.target)}`}</div></div>`;
  }).join('')).join('');
}

// =====================================================================
// Einstellungen
// =====================================================================

export function bindSettings(game) {
  const s = () => game.save.settings;
  for (const r of $$('[data-volume]')) r.addEventListener('input', () => { s()[r.dataset.volume] = Number(r.value) / 100; setVolumes(s().musicVolume, s().sfxVolume); game.persist(); });
  for (const r of $$('[data-percent]')) r.addEventListener('input', () => { s()[r.dataset.percent] = Number(r.value) / 100; game.persist(); });
  for (const box of $$('[data-setting]')) box.addEventListener('change', () => { s()[box.dataset.setting] = box.checked; game.persist(); });
  $('#language').addEventListener('change', (ev) => { s().language = ev.target.value; game.persist(); });

  $('#btn-reset').addEventListener('click', async () => {
    if (!(await confirmDialog('Spielstand wirklich löschen? Sternenkarte, Sammlung, Relikte und Statistiken gehen verloren.', 'Löschen', 'Abbrechen'))) return;
    if (!(await confirmDialog('Bist du ganz sicher? Das kann nicht rückgängig gemacht werden.', 'Endgültig löschen', 'Abbrechen'))) return;
    game.save = resetSave(game.data);
    game.persist();
    refreshSettings(game);
    toast('Spielstand gelöscht');
    game.goto('hub');
  });

  // Debug-Werkzeuge (nur mit ?debug)
  const save = () => game.save;
  $('#dbg-currency').addEventListener('click', () => { const g = save(); g.coins += 1000; g.mastery += 1000; g.crystals += 1000; g.foilDust += 1000; game.persist(); toast('+1000 aller Währungen'); });
  $('#dbg-chapters').addEventListener('click', () => {
    for (const c of game.data.chapters) save().stats.bossKills[c.id] ||= 1;
    save().act = Math.max(save().act, 2);
    game.persist(); toast('Alle Kapitel freigeschaltet (Tor offen)');
  });
  $('#dbg-cards').addEventListener('click', () => { for (const id of game.data.allCards) save().collection[id] ||= { normal: 1, foil: 0 }; game.persist(); toast('Alle Karten gefunden'); });
  $('#dbg-relics').addEventListener('click', () => { for (const r of game.data.relics) if (!save().relics.owned.includes(r.id)) save().relics.owned.push(r.id); game.persist(); toast('Alle Relikte erhalten'); });
  $('#settings-back').addEventListener('click', () => game.goto(game.settingsBack ?? 'hub'));
}

export function refreshSettings(game) {
  const st = game.save.settings;
  for (const r of $$('[data-volume]')) r.value = Math.round((st[r.dataset.volume] ?? 0.5) * 100);
  for (const r of $$('[data-percent]')) r.value = Math.round((st[r.dataset.percent] ?? 0.6) * 100);
  for (const box of $$('[data-setting]')) box.checked = !!st[box.dataset.setting];
  $('#language').value = st.language || 'de';
  show('#debug-meta', game.debug);
}

