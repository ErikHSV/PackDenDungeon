// Hub-Reiter Sammlung, Bestiarium, Relikte (14.2.6–14.2.8) sowie Erfolge und Einstellungen.
// Quests gibt es nur als Knoten im Skill-Tree (11.3). Shiny: drei getrennte Sammlungen (Helden, Tomes, Monster).
import { $, $$, el, escapeHtml, show, confirmDialog, toast } from './dom.js';
import { cardElement } from './cardView.js';
import { relicSlots, relicsToNextSlot, equipRelic, destroyRelic, repairRelic, progressOf, levelOf, questProgress, nodeVisible } from '../core/meta.js';
import { resetSave, exportSaveJson, exportSaveCode, importSave } from '../save.js';
import { setVolumes, play } from '../audio.js';
import { formatNumber } from '../core/util.js';

// =====================================================================
// Reiter SAMMLUNG (14.2.6): Kacheln im Shop-Stil, Filter, Fortschritt, große Karte per Klick
// =====================================================================

const FILTERS = [['alle', 'Alle'], ['helden', 'Helden'], ['tomes', 'Tomes'], ['foil', 'Shiny'], ['grenz', 'Grenzgänger']];

export function renderCollection(game, filter = game.colFilter ?? 'alle') {
  const { data, save, bank } = game;
  game.colFilter = filter;
  const has = (id) => (save.collection[id]?.normal || 0) + (save.collection[id]?.foil || 0) > 0;
  const total = data.allCards.length;
  const shinyOf = (art) => { const ids = data.allCards.filter((id) => data.cardIndex[id].art === art); return `${ids.filter((id) => save.collection[id]?.foil > 0).length} / ${ids.length}`; };
  $('#col-progress').innerHTML = `${data.allCards.filter(has).length} / ${total}<br><span class="rainbow-text">Shiny-Helden ${shinyOf('einheit')} · Shiny-Tomes ${shinyOf('tome')}</span>`;
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
    const shiny = col?.foil > 0;
    const t = el(`<div class="tile${found ? '' : ' unknown'}">
      <div class="field${shiny ? ' shiny-frame shiny-sheen' : ''}" style="--r:${data.rarities[c.def.rarity].farbe}"><img src="${secret ? bank.iconUrl('quest') : bank.cardUrl(id)}" alt="">
        <span class="r"></span>${found ? `<span class="cnt">×${filter === 'foil' ? col.foil : col.normal + col.foil}</span>` : ''}${shiny ? '<span class="fo">✦</span>' : ''}</div>
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
    <p>Gezogen: ${col.normal} normal · ${col.foil} Shiny</p>
    ${col.foil ? `<p class="rainbow-text">SHINY: ${c.art === 'tome' ? '+50 % Wirkungsdauer und +50 % Fläche bzw. Häufigkeit' : 'doppeltes Leben, +50 % Reichweite bzw. Wirkungsfläche'}</p>` : ''}
    <p class="muted">Klicken zum Schließen</p></div>`));
  show('#overlay-card', true);
  $('#overlay-card').onclick = () => show('#overlay-card', false);
}

// =====================================================================
// Reiter BESTIARIUM (14.2.7): nach Kapiteln gruppiert, Shiny-Markierung, Kills, sichtbare Monster-Quests
// =====================================================================

export function renderBestiary(game) {
  const { data, save, bank } = game;
  const known = (id) => (save.bestiary[id]?.normal || 0) + (save.bestiary[id]?.foil || 0) > 0;
  $('#beast-progress').innerHTML = `${data.enemies.filter((e) => known(e.id)).length} / ${data.enemies.length} · <span class="rainbow-text">Shiny-Monster ${data.enemies.filter((e) => save.bestiary[e.id]?.foil > 0).length} / ${data.enemies.length}</span>`;
  const traits = (e) => {
    const t = [];
    if (e.fliegt) t.push('fliegt');
    if (e.ruestung) t.push(`Rüstung ${e.ruestung}`);
    if (e.magieResistenz) t.push(`Magieresistenz ${Math.round(e.magieResistenz * 100)} %`);
    const ei = e.eigenschaften || {};
    if (ei.masteryStehlen) t.push('stiehlt Mastery');
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
      const quests = data.starmap.knoten.filter((q) => q.typ === 'quest' && q.aufgabe.statistik === 'killsGegner' && q.aufgabe.filter?.gegner === id && levelOf(save, q.id) === 0 && nodeVisible('skill', q, save, data));
      html += `<div class="beast${k ? '' : ' unknown'}${e.boss ? ' boss' : ''}${b?.foil ? ' shiny' : ''}">
        <div class="bimg${b?.foil ? ' shiny-frame shiny-sheen' : ''}"><img src="${bank.enemyUrl(id)}" alt=""></div>
        <div><b>${k ? escapeHtml(e.name) : '?'}${e.boss ? ' (Boss)' : ''}</b>
          ${k ? `<div>${escapeHtml(traits(e))}</div><div>Besiegt: ${b.normal + b.foil}</div>` : '<div class="muted">Noch nicht besiegt</div>'}
          <div class="foilmark${b?.foil ? ' on' : ''}">✦ Shiny ${b?.foil ? `besiegt (${b.foil})` : 'noch nicht besiegt'}</div>
          ${quests.map((q) => { const p = questProgress(q, data, save); return `<div style="font-size:13px">${escapeHtml(q.name)} ${formatNumber(p.value)}/${formatNumber(p.target)}</div><div class="qb"><div style="width:${(100 * p.value) / p.target}%"></div></div>`; }).join('')}
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
  $('#relic-slots').innerHTML = Array.from({ length: Math.max(max, slots) }, (_, i) => {
    if (i >= slots) return `<div class="r-slot locked" title="Zerstöre Relikte oder kaufe „Weiterer Relikt-Platz“ im Foil-Baum."><img src="${bank.iconUrl('lock')}" alt=""></div>`;
    const id = eq[i];
    const r = id && data.relicIndex[id];
    return r ? `<div class="r-slot filled${r.verflucht ? ' cursed' : ''}" data-id="${id}" title="${escapeHtml(r.name)}"><img src="${bank.iconUrl(r.symbol)}" alt=""></div>` : '<div class="r-slot"></div>';
  }).join('');
  const inv = $('#relic-inv');
  inv.innerHTML = data.relics.map((r) => {
    if (save.relics.destroyed?.includes(r.id)) return `<div class="r-item unknown destroyed" style="--rar:#4a4266" data-broken="${r.id}"><img src="${bank.iconUrl(r.symbol)}" alt="">${escapeHtml(r.name)} (zerstört)</div>`;
    if (!save.relics.owned.includes(r.id)) return `<div class="r-item unknown" style="--rar:#4a4266"><img src="${bank.iconUrl('relic')}" alt="">${r.nurBaum ? '??? (Skill-Tree)' : '???'}</div>`;
    return `<div class="r-item${eq.includes(r.id) ? ' equipped' : ''}${r.verflucht ? ' cursed' : ''}" style="--rar:${data.rarities[r.rarity].farbe}" data-id="${r.id}"><img src="${bank.iconUrl(r.symbol)}" alt="">${escapeHtml(r.name)}</div>`;
  }).join('');
  const sel = selected && data.relicIndex[selected];
  const mods = game.mods();
  const repairCost = data.balance.foilbaum.reliktReparaturKosten;
  if (sel && save.relics.destroyed?.includes(sel.id)) {
    $('#relic-detail').innerHTML = `<h2>${escapeHtml(sel.name)} <span class="curse">(zerstört)</span></h2><p>${escapeHtml(sel.beschreibung)}</p>
      ${mods.flags.reliktReparatur ? `<button class="btn btn-primary" id="relic-repair">Reparieren (${repairCost} Schimmer)</button>` : '<p class="muted">Mit dem Foil-Knoten „Relikt-Wiederherstellung“ (ab Akt 3) kannst du zerstörte Relikte gegen Schimmer reparieren.</p>'}`;
    $('#relic-repair')?.addEventListener('click', () => {
      if (!repairRelic(sel.id, data, save, mods)) { play('error'); toast('Zu wenig Schimmer.', true); return; }
      play('unlock'); game.persist(); renderRelics(game, sel.id);
    });
  } else $('#relic-detail').innerHTML = sel ? `
      <h2>${escapeHtml(sel.name)}${sel.verflucht ? ' <span class="curse">(verflucht)</span>' : ''}</h2>
      <div style="color:${data.rarities[sel.rarity].farbe}">${data.rarities[sel.rarity].name}</div>
      <p>${escapeHtml(sel.beschreibung)}</p>
      ${sel.nachteil ? `<p class="curse">Nachteil: ${escapeHtml(sel.nachteil)}</p>` : ''}
      <div class="row" style="justify-content:flex-start">
        <button class="btn btn-primary" id="relic-toggle">${eq.includes(sel.id) ? 'Ablegen' : 'Ausrüsten'}</button>
        <button class="btn btn-danger" id="relic-destroy">Zerstören</button>
      </div>
      <p class="muted">Zerstören entfernt das Relikt. Zerstörte Relikte schalten Plätze frei: der erste Platz kostet 1, jeder weitere mehr (${relicsToNextSlot(data, save) == null ? 'alle Plätze frei' : `noch ${relicsToNextSlot(data, save)} bis zum nächsten Platz`}). Ab Akt 3 kann es über den Foil-Knoten „Relikt-Wiederherstellung“ zurückgeholt werden. Quellen: Quest- und Relikt-Knoten im Skill-Tree, Jackpots beim Neu-Würfeln (Foil-Knoten „Jackpot-Relikt“), Relikt-Jagd.</p>`
    : `<h2>Relikte</h2><p>${save.relics.owned.length} von ${data.relics.length} gefunden · ${eq.length}/${slots} Plätze belegt.</p>
       <p class="muted">Klicke ein Relikt an, um es auszurüsten oder abzulegen. Verfluchte Relikte (violett-roter Rand) sind stark, haben aber einen Nachteil.</p>`;

  const toggle = (id) => {
    if (!equipRelic(id, data, save)) { play('error'); toast('Alle Plätze belegt – lege zuerst ein Relikt ab.', true); return; }
    play('click');
    game.persist();
    renderRelics(game, id);
  };
  $$('.r-item[data-id]', inv).forEach((it) => it.addEventListener('click', () => toggle(it.dataset.id)));
  $$('.r-item[data-broken]', inv).forEach((it) => it.addEventListener('click', () => { play('click'); renderRelics(game, it.dataset.broken); }));
  $$('.r-slot.filled').forEach((s) => s.addEventListener('click', () => toggle(s.dataset.id)));
  $('#relic-toggle')?.addEventListener('click', () => toggle(sel.id));
  $('#relic-destroy')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`${sel.name} wirklich zerstören? Es ist danach für immer weg.${relicsToNextSlot(data, save) === 1 ? ' Dafür bekommst du einen zusätzlichen Reliktplatz.' : ''}`, 'Zerstören', 'Behalten'))) return;
    destroyRelic(sel.id, data, save);
    play('bossSkill');
    game.persist();
    renderRelics(game);
  });
  // Zuletzt angeklicktes Relikt im Detail zeigen (Klick toggelt, Detail zeigt es trotzdem)
}

// =====================================================================
// Erfolge
// =====================================================================

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

  // Spielstand speichern/laden
  const applyImported = async (text) => {
    let s;
    try { s = importSave(game.data, text); } catch (err) { toast(err.message, true); return; }
    const info = `Tag ${s.day ?? '?'}, Akt ${s.act ?? 1}, ${Object.keys(s.collection || {}).length} Karten`;
    if (!(await confirmDialog(`Diesen Spielstand laden (${info})? Der aktuelle Spielstand wird ersetzt.`, 'Laden', 'Abbrechen'))) return;
    game.save = s;
    game.persist();
    refreshSettings(game);
    toast('Spielstand geladen');
    game.goto('hub');
  };
  $('#save-file').addEventListener('click', () => {
    game.persist();
    const blob = new Blob([exportSaveJson(game.save)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `packdendungeon-tag${game.save.day ?? 1}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Spielstand als Datei gespeichert');
  });
  $('#load-file').addEventListener('click', () => $('#load-file-input').click());
  $('#load-file-input').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (file) await applyImported(await file.text());
  });
  $('#save-code').addEventListener('click', async () => {
    game.persist();
    const code = exportSaveCode(game.save);
    const box = $('#save-code-box');
    box.value = code;
    box.classList.remove('hidden');
    $('#load-code-go').classList.add('hidden');
    box.select();
    try { await navigator.clipboard.writeText(code); toast('Code kopiert – gut aufbewahren!'); } catch { toast('Code markiert – bitte mit Strg+C kopieren'); }
  });
  $('#load-code').addEventListener('click', () => {
    const box = $('#save-code-box');
    box.value = '';
    box.classList.remove('hidden');
    $('#load-code-go').classList.remove('hidden');
    box.focus();
  });
  $('#load-code-go').addEventListener('click', () => applyImported($('#save-code-box').value));

  $('#btn-reset').addEventListener('click', async () => {
    if (!(await confirmDialog('Spielstand wirklich löschen? Skill-Tree, Foil-Baum, Sammlung, Relikte und Statistiken gehen verloren.', 'Löschen', 'Abbrechen'))) return;
    if (!(await confirmDialog('Bist du ganz sicher? Das kann nicht rückgängig gemacht werden.', 'Endgültig löschen', 'Abbrechen'))) return;
    game.save = resetSave(game.data);
    game.persist();
    refreshSettings(game);
    toast('Spielstand gelöscht');
    game.goto('hub');
  });

  // Debug-Werkzeuge (nur mit ?debug)
  const save = () => game.save;
  $('#dbg-currency').addEventListener('click', () => { const g = save(); g.coins += 100; g.mastery += 10000; g.foilDust += 100; g.stats.foilStaubGesamt = (g.stats.foilStaubGesamt || 0) + 100; game.persist(); toast('+100 Münzen, +10.000 Mastery, +100 Schimmer'); });
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

