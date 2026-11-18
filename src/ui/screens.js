// Hub-Reiter Sammlung, Bestiarium, Relikte (14.2.6–14.2.8) sowie Quests, Erfolge und Einstellungen.
import { $, $$, el, escapeHtml, show, confirmDialog, toast } from './dom.js';
import { cardElement } from './cardView.js';
import { relicSlots, equipRelic, destroyRelic, progressOf, claimQuest } from '../core/meta.js';
import { resetSave } from '../save.js';
import { setVolumes, play } from '../audio.js';
import { formatNumber } from '../core/util.js';

// =====================================================================
// Reiter SAMMLUNG (14.2.6): Kacheln im Shop-Stil, Filter, Fortschritt, große Karte per Klick
// =====================================================================

const FILTERS = [['alle', 'Alle'], ['helden', 'Helden'], ['tomes', 'Tomes'], ['foil', 'Foil'], ['grenz', 'Grenzgänger']];

export function renderCollection(game, filter = game.colFilter ?? 'alle') {
  const { data, save, bank } = game;
  game.colFilter = filter;
  const has = (id) => (save.collection[id]?.normal || 0) + (save.collection[id]?.foil || 0) > 0;
  const total = data.allCards.length;
  $('#col-progress').innerHTML = `${data.allCards.filter(has).length} / ${total}<br><span style="color:var(--foil)">Foil: ${data.allCards.filter((id) => save.collection[id]?.foil > 0).length} / ${total}</span>`;
  $('#col-filters').innerHTML = FILTERS.map(([id, n]) => `<button class="filter${id === filter ? ' active' : ''}" data-f="${id}">${n}</button>`).join('');
  $$('#col-filters .filter').forEach((b) => b.addEventListener('click', () => { play('click'); renderCollection(game, b.dataset.f); }));
  const rank = (id) => data.rarities[data.cardIndex[id].def.rarity].rang;
  const ids = [...data.allCards].sort((a, b) => rank(a) - rank(b)).filter((id) => {
    const c = data.cardIndex[id];
    const gg = c.def.rarity === 'grenzgaenger';
    if (filter === 'helden') return c.art === 'einheit' && !gg;
    if (filter === 'tomes') return c.art === 'tome';
    if (filter === 'foil') return !gg;
    if (filter === 'grenz') return gg;
    return true;
  });
  const grid = $('#col-grid');
  grid.innerHTML = '';
  for (const id of ids) {
    const c = data.cardIndex[id];
    const col = save.collection[id];
    const found = filter === 'foil' ? col?.foil > 0 : has(id);
    const secret = c.def.rarity === 'grenzgaenger' && !found;
    const t = el(`<div class="tile${found ? '' : ' unknown'}${filter === 'foil' && found ? ' foil' : ''}">
      <div class="field" style="--r:${data.rarities[c.def.rarity].farbe}"><img src="${secret ? bank.iconUrl('quest') : bank.cardUrl(id)}" alt="">
        <span class="r"></span>${found ? `<span class="cnt">×${filter === 'foil' ? col.foil : col.normal + col.foil}</span>` : ''}${col?.foil ? '<span class="fo">✦</span>' : ''}</div>
      <div class="nm">${found ? escapeHtml(c.def.name) : '???'}</div></div>`);
    t.addEventListener('click', () => { if (has(id)) { play('click'); showCardDetail(game, id); } });
    grid.appendChild(t);
  }
}

/** Große Karte mit Fähigkeit, Herkunfts-Packs und Statistik. */
export function showCardDetail(game, id) {
  const { data, save, bank } = game;
  const c = data.cardIndex[id];
  const col = save.collection[id] || { normal: 0, foil: 0 };
  const packs = data.packs.filter((p) => p.pool?.includes(id));
  const box = $('#card-detail');
  box.innerHTML = '';
  const card = cardElement(id, game, { foil: col.foil > 0, count: col.normal + col.foil });
  card.classList.add('big');
  box.appendChild(card);
  box.appendChild(el(`<div class="info panel">
    <h2>${escapeHtml(c.def.name)}</h2>
    <div style="color:${data.rarities[c.def.rarity].farbe}">${data.rarities[c.def.rarity].name} · ${c.art === 'tome' ? 'Tome' : escapeHtml(c.def.rolle ?? '')}</div>
    <p>${escapeHtml(c.def.beschreibung)}</p>
    ${c.def.entwicklung ? `<p class="muted">Entwicklung: ${escapeHtml(c.def.entwicklung.name ?? '')}</p>` : ''}
    <p class="packs">Herkunft: ${packs.length ? packs.map((p) => `<img src="${bank.shopItemUrl(p.id)}" title="${escapeHtml(p.name)}">`).join('') : c.def.rarity === 'grenzgaenger' ? 'jedes Pack (sehr selten)' : 'Shop'}</p>
    <p>Gezogen: ${col.normal} normal · ${col.foil} Foil</p>
    <p class="muted">Klicken zum Schließen</p></div>`));
  show('#overlay-card', true);
  $('#overlay-card').onclick = () => show('#overlay-card', false);
}

// =====================================================================
// Reiter BESTIARIUM (14.2.7): nach Kapiteln gruppiert, Foil-Markierung, Kills, Monster-Quests
// =====================================================================

export function renderBestiary(game) {
  const { data, save, bank } = game;
  const known = (id) => (save.bestiary[id]?.normal || 0) + (save.bestiary[id]?.foil || 0) > 0;
  $('#beast-progress').textContent = `${data.enemies.filter((e) => known(e.id)).length} / ${data.enemies.length} · Foil: ${data.enemies.filter((e) => save.bestiary[e.id]?.foil > 0).length}`;
  const traits = (e) => {
    const t = [];
    if (e.fliegt) t.push('fliegt');
    if (e.ruestung) t.push(`Rüstung ${e.ruestung}`);
    if (e.magieResistenz) t.push(`Magieresistenz ${Math.round(e.magieResistenz * 100)} %`);
    const ei = e.eigenschaften || {};
    if (ei.muenzenStehlen) t.push('stiehlt Münzen');
    if (ei.explodiertBeimTod) t.push('explodiert');
    if (ei.frontSchild) t.push('Frontschild');
    if (ei.teiltSichBeimTod) t.push('teilt sich');
    if (ei.verlangsamtHelden) t.push('verlangsamt Helden');
    return t.join(' · ') || 'keine Besonderheiten';
  };
  const done = new Set();
  let html = '';
  for (const ch of data.chapters) {
    const ids = [...new Set([...ch.gegner.map((g) => g.id), ch.boss])].filter((id) => data.enemyIndex[id] && !done.has(id));
    // Nachwuchs (z. B. kleine Lavaschleime) gehört zum gleichen Kapitel
    for (const id of [...ids]) { const sp = data.enemyIndex[id].eigenschaften?.teiltSichBeimTod?.in; if (sp && !ids.includes(sp)) ids.push(sp); }
    if (!ids.length) continue;
    ids.forEach((id) => done.add(id));
    html += `<h3>${escapeHtml(ch.name)}</h3><div class="beast-row">`;
    for (const id of ids) {
      const e = data.enemyIndex[id];
      const b = save.bestiary[id];
      const k = known(id);
      const quests = data.quests.filter((q) => q.ziel.statistik === 'killsGegner' && q.ziel.filter?.gegner === id);
      html += `<div class="beast${k ? '' : ' unknown'}${e.boss ? ' boss' : ''}">
        <img src="${bank.enemyUrl(id)}" alt="">
        <div><b>${k ? escapeHtml(e.name) : '?'}${e.boss ? ' (Boss)' : ''}</b>
          ${k ? `<div>${escapeHtml(traits(e))}</div><div>Besiegt: ${b.normal + b.foil}</div>` : '<div class="muted">Noch nicht besiegt</div>'}
          <div class="foilmark${b?.foil ? ' on' : ''}">✦ Foil ${b?.foil ? `besiegt (${b.foil})` : 'noch nicht besiegt'}</div>
          ${quests.map((q) => { const p = progressOf(q, data, save); return `<div style="font-size:13px">${escapeHtml(q.name)} ${formatNumber(p.value)}/${formatNumber(p.target)}</div><div class="qb"><div style="width:${(100 * p.value) / p.target}%"></div></div>`; }).join('')}
        </div></div>`;
    }
    html += '</div>';
  }
  $('#beast-list').innerHTML = html;
}

// =====================================================================
// Reiter RELIKTE (14.2.8): Plätze, Inventar, Klick = ausrüsten/ablegen, Zerstören mit Rückfrage
// =====================================================================

export function renderRelics(game, selected = null) {
  const { data, save, bank } = game;
  const slots = relicSlots(data, save);
  const max = data.balance.relikte.plaetzeMax;
  const eq = save.relics.equipped;
  $('#relic-slots').innerHTML = Array.from({ length: max }, (_, i) => {
    if (i >= slots) return `<div class="r-slot locked" title="Zerstöre ein Relikt, um einen Platz freizuschalten."><img src="${bank.iconUrl('lock')}" alt=""></div>`;
    const id = eq[i];
    const r = id && data.relicIndex[id];
    return r ? `<div class="r-slot filled${r.verflucht ? ' cursed' : ''}" data-id="${id}" title="${escapeHtml(r.name)}"><img src="${bank.iconUrl(r.symbol)}" alt=""></div>` : '<div class="r-slot"></div>';
  }).join('');
  const inv = $('#relic-inv');
  inv.innerHTML = data.relics.map((r) => {
    if (!save.relics.owned.includes(r.id)) return `<div class="r-item unknown" style="--rar:#4a4266"><img src="${bank.iconUrl('relic')}" alt="">${save.relics.destroyed?.includes(r.id) ? 'Zerstört' : '???'}</div>`;
    return `<div class="r-item${eq.includes(r.id) ? ' equipped' : ''}${r.verflucht ? ' cursed' : ''}" style="--rar:${data.rarities[r.rarity].farbe}" data-id="${r.id}"><img src="${bank.iconUrl(r.symbol)}" alt="">${escapeHtml(r.name)}</div>`;
  }).join('');
  const sel = selected && data.relicIndex[selected];
  $('#relic-detail').innerHTML = sel ? `
      <h2>${escapeHtml(sel.name)}${sel.verflucht ? ' <span class="curse">(verflucht)</span>' : ''}</h2>
      <div style="color:${data.rarities[sel.rarity].farbe}">${data.rarities[sel.rarity].name}</div>
      <p>${escapeHtml(sel.beschreibung)}</p>
      ${sel.nachteil ? `<p class="curse">Nachteil: ${escapeHtml(sel.nachteil)}</p>` : ''}
      <div class="row" style="justify-content:flex-start">
        <button class="btn btn-primary" id="relic-toggle">${eq.includes(sel.id) ? 'Ablegen' : 'Ausrüsten'}</button>
        <button class="btn btn-danger" id="relic-destroy">Zerstören</button>
      </div>
      <p class="muted">Zerstören entfernt das Relikt dauerhaft und schaltet dafür einen weiteren Reliktplatz frei (max. ${max}). Fehlende Relikte findest du in der Reliktjagd.</p>`
    : `<h2>Relikte</h2><p>${save.relics.owned.length} von ${data.relics.length} gefunden · ${eq.length}/${slots} Plätze belegt.</p>
       <p class="muted">Klicke ein Relikt an, um es auszurüsten oder abzulegen. Verfluchte Relikte (violett-roter Rand) sind stark, haben aber einen Nachteil.</p>`;

  const toggle = (id) => {
    if (!equipRelic(id, data, save)) { play('error'); toast('Alle Plätze belegt – lege zuerst ein Relikt ab.', true); return; }
    play('click');
    game.persist();
    renderRelics(game, id);
  };
  $$('.r-item[data-id]', inv).forEach((it) => it.addEventListener('click', () => toggle(it.dataset.id)));
  $$('.r-slot.filled').forEach((s) => s.addEventListener('click', () => toggle(s.dataset.id)));
  $('#relic-toggle')?.addEventListener('click', () => toggle(sel.id));
  $('#relic-destroy')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`${sel.name} wirklich zerstören? Es ist danach für immer weg, du erhältst einen zusätzlichen Reliktplatz.`, 'Zerstören', 'Behalten'))) return;
    destroyRelic(sel.id, data, save);
    play('bossSkill');
    game.persist();
    renderRelics(game);
  });
  // Zuletzt angeklicktes Relikt im Detail zeigen (Klick toggelt, Detail zeigt es trotzdem)
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

