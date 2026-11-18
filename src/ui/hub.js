// Hub (14.2): Währungen, Tag, Seitenleiste mit roten Punkten, Kapitelwahl, Shop mit Run-Tasche, Altes Tor.
import { $, $$, escapeHtml, confirmDialog, showTip, show } from './dom.js';
import { showPopups } from './result.js';
import {
  chapterUnlocked, describeOffer, buyOffer, removeFromBag, rollOffers, rerollCost, canReroll, reroll,
  gateState, openGate, prestigeAvailable, modifiersAvailable, anyNodeAffordable, claimableQuests, bagCapacity,
} from '../core/meta.js';
import { arenaFloor } from '../render/arena.js';
import { frameAt } from '../render/sprites.js';
import { formatNumber } from '../core/util.js';
import { play } from '../audio.js';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Hub {
  constructor(game) {
    this.game = game;
    this.canvas = $('#hub-canvas');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.ctx = this.canvas.getContext('2d');
    this.active = false;
    $('#btn-fight').addEventListener('click', () => this.fight());
    $('#btn-reroll').addEventListener('click', () => {
      const { data, save } = this.game;
      if (!reroll(data, save, this.game.mods())) { play('error'); return; }
      play('buy');
      this.game.persist();
      this.render();
    });
  }

  open() {
    const { data, save } = this.game;
    if (!save.shop.offers.length) { rollOffers(data, save, this.game.mods()); this.game.persist(); }
    if (!chapterUnlocked(data.chapterIndex[save.selection.chapter], save, data)) save.selection.chapter = 1;
    this.render();
    this.active = true;
    this.t0 = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    // Einstiegshilfe: erstes Pack kaufen
    if (!save.stats.runs && !save.shop.bag.length) setTimeout(() => { if (this.game.current === 'hub') showTip('Kaufe ein Pack für deinen ersten Run!', $('.offer'), 'down', 6000); }, 500);
    else if (save.tutorial.firstRunDone && !save.tutorial.starmapHint && anyNodeAffordable(data, save)) {
      save.tutorial.starmapHint = true;
      this.game.persist();
      setTimeout(() => { if (this.game.current === 'hub') showTip('Gib deine Mastery-Punkte in der Sternenkarte aus!', $('[data-goto="starmap"]'), 'left', 6000); }, 500);
    }
  }

  close() { this.active = false; }

  render() {
    this.renderTop();
    this.renderChapters();
    this.renderShop();
    this.renderGate();
  }

  renderTop() {
    const { data, save } = this.game;
    const mods = this.game.mods();
    $('#hub-coins').textContent = formatNumber(save.coins);
    $('#hub-mastery').textContent = formatNumber(save.mastery);
    $('#hub-crystals').textContent = formatNumber(save.crystals);
    $('#hub-dust').textContent = formatNumber(save.foilDust);
    $('#hub-day').textContent = `Tag ${save.day}${mods.tagesEinkommen ? ` · +${mods.tagesEinkommen} Münzen/Tag` : ''}`;
    $('#dot-starmap').classList.toggle('hidden', !anyNodeAffordable(data, save));
    $('#dot-quests').classList.toggle('hidden', !claimableQuests(data, save));
    $('#dot-relics').classList.toggle('hidden', !(save.relics.newCount > 0));
  }

  // -------------------------------------------------------------------
  // Kapitelwahl
  // -------------------------------------------------------------------

  renderChapters() {
    const { data, save, bank } = this.game;
    const sel = save.selection;
    const box = $('#chapter-pick');
    const list = data.chapters.filter((c) => c.art !== 'reliktjagd' || chapterUnlocked(c, save, data));
    const btns = list.map((c) => {
      const open = chapterUnlocked(c, save, data);
      const label = c.art === 'reliktjagd' ? 'Reliktjagd' : c.art === 'riss' ? 'Riss' : `${c.akt}-${data.actIndex[c.akt].kapitel.indexOf(c.id) + 1}`;
      const done = save.stats.bossKills[c.id] > 0 ? ' ✓' : '';
      return `<button class="ch-btn${c.id === sel.chapter ? ' active' : ''}${open ? '' : ' locked'}" data-ch="${c.id}" title="${escapeHtml(open ? c.name : 'Noch gesperrt')}">${open ? label + done : '🔒'}</button>`;
    }).join('');
    const ch = data.chapterIndex[sel.chapter];
    const ids = [...ch.gegner.map((g) => g.id), ch.boss];
    const seen = (id) => (save.bestiary[id]?.normal || 0) + (save.bestiary[id]?.foil || 0) > 0;
    const enemies = ids.map((id) => seen(id) ? `<span title="${escapeHtml(data.enemyIndex[id].name)}"><img src="${bank.enemyUrl(id)}" alt=""></span>` : '<span title="Unbekannt">?</span>').join('');
    const prest = prestigeAvailable(ch, save, data);
    if (sel.prestige && !prest.includes(sel.prestige)) sel.prestige = 0;
    const canWanted = ch.gesucht && save.stats.bossKills[ch.id] > 0;
    if (!canWanted) sel.gesucht = false;
    const modsAvail = ch.art === 'kapitel' ? modifiersAvailable(data, save) : [];
    if (!modsAvail.some((m) => m.id === sel.modifier)) sel.modifier = null;
    box.innerHTML = `
      <h3>Kapitel wählen</h3>
      <div class="ch-list">${btns}</div>
      <div class="ch-info">
        <b>${escapeHtml(ch.name)}</b><br>
        <span class="muted">${escapeHtml(ch.intro ?? '')}</span>
        <div class="enemies">${enemies}</div>
        Boss nach ${fmtTime(ch.bossNachSekunden)} · Bestzeit: ${save.stats.besteZeit[ch.id] ? fmtTime(save.stats.besteZeit[ch.id]) : '–'}
        ${ch.art === 'reliktjagd' ? '<br><span style="color:var(--gold)">Belohnung: ein fehlendes Relikt</span>' : ''}
      </div>
      <div class="ch-opts">
        ${prest.length ? `<label>Prestige <select id="sel-prestige"><option value="0">aus</option>${prest.map((p) => { const s = data.balance.prestige.stufen.find((x) => x.stufe === p); return `<option value="${p}"${sel.prestige === p ? ' selected' : ''}>Stufe ${p} (Belohnung ×${s.belohnungMul})</option>`; }).join('')}</select></label>` : ''}
        ${canWanted ? `<button class="btn${sel.gesucht ? ' on' : ''}" id="sel-gesucht" title="Der Boss erscheint als Foil-Boss: stärker, mehr Belohnung.">Gesucht ✦</button>` : ''}
        ${modsAvail.length ? `<label>Modifikator <select id="sel-mod"><option value="">keiner</option>${modsAvail.map((m) => `<option value="${m.id}"${sel.modifier === m.id ? ' selected' : ''} title="${escapeHtml(m.beschreibung)}">${escapeHtml(m.name)} (MP ×${m.belohnung.masteryMul})</option>`).join('')}</select></label>` : ''}
      </div>`;
    $$('.ch-btn', box).forEach((b) => b.addEventListener('click', () => {
      const c = data.chapterIndex[Number(b.dataset.ch)];
      if (!chapterUnlocked(c, save, data)) { play('error'); this.game.toast('Besiege zuerst den Boss des vorherigen Kapitels.', true); return; }
      play('click');
      sel.chapter = c.id;
      this.game.persist();
      this.renderChapters();
    }));
    $('#sel-prestige', box)?.addEventListener('change', (e) => { sel.prestige = Number(e.target.value); this.game.persist(); });
    $('#sel-gesucht', box)?.addEventListener('click', () => { sel.gesucht = !sel.gesucht; play('click'); this.game.persist(); this.renderChapters(); });
    $('#sel-mod', box)?.addEventListener('change', (e) => { sel.modifier = e.target.value || null; this.game.persist(); });
  }

  // -------------------------------------------------------------------
  // Shop und Run-Tasche
  // -------------------------------------------------------------------

  renderShop() {
    const { data, save, bank } = this.game;
    const mods = this.game.mods();
    const rr = $('#btn-reroll');
    rr.classList.toggle('hidden', !canReroll(mods));
    rr.innerHTML = `Neu würfeln <img src="${bank.iconUrl('coin')}" style="width:20px;height:20px;vertical-align:middle"> ${rerollCost(data, save)}`;
    rr.disabled = save.coins < rerollCost(data, save);
    const box = $('#offers');
    box.innerHTML = '';
    save.shop.offers.forEach((slot, i) => {
      const o = describeOffer(slot, data, save);
      if (!o) return;
      const imgs = o.items.flatMap((it) => Array.from({ length: Math.min(it.anzahl, 4) }, () => `<img src="${bank.packUrl(it.artikel)}" alt="">`)).join('');
      const div = document.createElement('div');
      div.className = `offer${o.kind === 'jackpot' ? ' jackpot' : ''}${o.sold ? ' sold' : save.coins < o.preis ? ' poor' : ''}`;
      div.innerHTML = `${o.kind === 'jackpot' ? '<div class="jp">JACKPOT</div>' : ''}<div class="packs">${imgs}</div>
        <div class="on">${escapeHtml(o.name)}</div>
        <div class="price">${o.sold ? 'Verkauft' : `<img src="${bank.iconUrl('coin')}" alt="">${formatNumber(o.preis)}`}</div>`;
      div.title = o.items.map((it) => `${it.anzahl}× ${data.packIndex[it.artikel].name}: ${data.packIndex[it.artikel].beschreibung ?? ''}`).join('\n');
      div.addEventListener('click', () => this.buy(i));
      box.appendChild(div);
    });
    $('#bag-count').textContent = `${save.shop.bag.length} / ${bagCapacity(data, mods)}`;
    const bag = $('#bag');
    bag.innerHTML = save.shop.bag.length
      ? save.shop.bag.map((b, i) => `<img src="${bank.packUrl(b.artikel)}" data-i="${i}" title="${escapeHtml(data.packIndex[b.artikel].name)} – antippen zum Zurückgeben">`).join('')
      : '<span class="muted" style="padding:20px">Leer – kaufe Packs im Shop. Sie fallen im Run auf das Feld.</span>';
    $$('img', bag).forEach((img) => img.addEventListener('click', () => {
      removeFromBag(Number(img.dataset.i), data, save);
      play('click');
      this.game.persist();
      this.render();
    }));
  }

  buy(i) {
    const { data, save, bank } = this.game;
    const res = buyOffer(i, data, save, Math.random, bagCapacity(data, this.game.mods()));
    if (res?.full) { play('error'); this.game.toast('Die Run-Tasche ist voll.', true); return; }
    if (!res) { play('error'); const o = describeOffer(save.shop.offers[i], data, save); if (o && !o.sold) this.game.toast('Nicht genug Münzen.', true); return; }
    play('buy');
    show('#tip', false);
    this.game.persist();
    this.render();
    const relics = res.got.filter((g) => 'relikt' in g);
    if (relics.length) {
      showPopups(relics.map((g) => g.relikt
        ? `<h1>Neues Relikt!</h1><img src="${bank.iconUrl(g.relikt.symbol)}" style="width:96px;height:96px"><p style="font-size:28px">${escapeHtml(g.relikt.name)}</p><p>${escapeHtml(g.relikt.beschreibung)}</p>`
        : '<h1>Alle Relikte gefunden!</h1><p>Stattdessen: +10 Kristalle</p>'));
      this.renderTop();
    }
  }

  // -------------------------------------------------------------------
  // Altes Tor
  // -------------------------------------------------------------------

  renderGate() {
    const { data, save } = this.game;
    const g = gateState(data, save);
    const box = $('#gate');
    const anyStone = g.stones.some((s) => s.owned);
    box.classList.toggle('hidden', !anyStone && !g.opened);
    box.innerHTML = `<h3>${escapeHtml(g.tor.name)}</h3>
      <div class="stones">${g.stones.map((s) => `<div class="stone${s.owned ? ' owned' : ''}" style="${s.owned ? `background:${s.farbe};color:${s.farbe};border-color:#FFD24A` : ''}" title="${escapeHtml(s.name)}">${s.owned ? '' : '?'}</div>`).join('')}</div>
      ${g.opened ? '<p style="color:var(--gold)">Das Tor ist offen. Neue Äste der Sternenkarte, Kapitel-Modifikatoren und der Riss des Frosts warten.</p>'
        : g.complete ? '<button class="btn btn-primary" id="btn-gate">Tor öffnen</button>'
        : `<p>${escapeHtml(g.tor.beschreibung)}</p>`}`;
    $('#btn-gate', box)?.addEventListener('click', async () => {
      const ok = await confirmDialog(g.tor.warnung, 'Tor öffnen', 'Noch nicht');
      if (!ok) return;
      if (openGate(data, save)) {
        play('keystone');
        this.game.persist();
        this.render();
        showPopups(['<h1>Akt 2 beginnt!</h1><p style="font-size:24px">Deine Mastery-Punkte wurden vollständig erstattet. Neue Äste der Sternenkarte sind sichtbar.</p>']);
      }
    });
  }

  // -------------------------------------------------------------------

  async fight() {
    const { save } = this.game;
    if (!save.shop.bag.length) {
      const ok = await confirmDialog('Deine Run-Tasche ist leer. Ohne Packs bekommst du keine Einheiten. Trotzdem kämpfen?', 'Kämpfen', 'Zum Shop');
      if (!ok) return;
    }
    play('click');
    const s = save.selection;
    this.game.startRun({ chapter: s.chapter, prestige: s.prestige || 0, gesucht: !!s.gesucht, modifierId: s.modifier || null });
  }

  // -------------------------------------------------------------------
  // Hintergrund: ruhige Arena mit Turm und Gebäuden
  // -------------------------------------------------------------------

  loop(now) {
    if (!this.active) return;
    const { data, save, bank } = this.game;
    const c = this.ctx;
    const t = (now - this.t0) / 1000;
    c.imageSmoothingEnabled = false;
    const ch = data.chapterIndex[save.selection.chapter] ?? data.chapterIndex[1];
    c.drawImage(arenaFloor(ch, data.balance.arena), 0, 0);
    const A = data.balance.arena;
    const tower = bank.tower(0);
    c.drawImage(tower, Math.round(A.mitteX - tower.width / 2), Math.round(A.mitteY - tower.height + 50));
    const mods = this.game.mods();
    data.buildings.forEach((b, i) => {
      if (!mods.gebaeude[b.id]) return;
      const ang = ((b.position?.winkel ?? i * 120) * Math.PI) / 180;
      const img = bank.building(b.id);
      const x = A.mitteX + Math.cos(ang) * A.radiusX * 0.45, y = A.mitteY + Math.sin(ang) * A.radiusY * 0.45 + Math.sin(t * 2 + i) * 3;
      c.drawImage(img, Math.round(x - img.width * 2), Math.round(y - img.height * 2), img.width * 4, img.height * 4);
    });
    // eine Wache patrouilliert
    const fr = frameAt(bank.unit('stalljunge'), 'idle', t, 4);
    c.drawImage(fr, Math.round(A.mitteX + 160 + Math.sin(t * 0.6) * 60), Math.round(A.mitteY + 40), 96, 96);
    c.fillStyle = 'rgba(14,11,26,0.45)';
    c.fillRect(0, 0, 1920, 1080);
    requestAnimationFrame((tt) => this.loop(tt));
  }
}
