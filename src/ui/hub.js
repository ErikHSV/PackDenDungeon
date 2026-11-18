// Hub (14.2): EIN Bildschirm zwischen den Runs. Links Kapitelwahl + Shop, rechts Reiter
// UPGRADE / SAMMLUNG / BESTIARIUM / RELIKTE, oben rechts Quests, Erfolge, Einstellungen, unten rechts KAMPF.
import { $, $$, escapeHtml, confirmDialog, showTip, show, countTo, stage } from './dom.js';
import { showPopups } from './result.js';
import { UpgradeTree } from './upgradeTree.js';
import { renderCollection, renderBestiary, renderRelics } from './screens.js';
import {
  chapterUnlocked, describeOffer, buyOffer, rollOffers, rerollCost, canReroll, reroll, resetPurchases, walletTotal, shopSlots,
  gateState, openGate, prestigeAvailable, modifiersAvailable, anyNodeAffordable, claimableQuests, bagItems,
} from '../core/meta.js';
import { hash } from '../render/pixel.js';
import { play } from '../audio.js';

const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const TABS = { upgrade: '#3B78D8', sammlung: '#D8D8E0', bestiarium: '#E0603A', relikte: '#B23ED8' };

export class Hub {
  constructor(game) {
    this.game = game;
    this.canvas = $('#hub-canvas');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.ctx = this.canvas.getContext('2d');
    this.active = false;
    this.tab = 'upgrade';
    this.tree = new UpgradeTree(game);
    $('#btn-fight').addEventListener('click', () => this.fight());
    $('#shop-reroll').addEventListener('click', () => {
      const { data, save } = this.game;
      const mods = this.game.mods();
      if (!canReroll(mods)) { play('error'); this.game.toast('Schalte „Neu würfeln“ in den Upgrades frei.', true); return; }
      if (!reroll(data, save, mods)) { play('error'); this.game.toast('Nicht genug Münzen.', true); return; }
      play('buy');
      this.game.persist();
      this.renderShop();
    });
    $('#shop-reset').addEventListener('click', () => {
      const { data, save } = this.game;
      const before = save.coins;
      if (!resetPurchases(data, save)) return;
      play('click');
      this.game.persist();
      this.lastCoins = before;
      this.renderShop(true);
    });
    $('#ch-prev').addEventListener('click', () => this.stepChapter(-1));
    $('#ch-next').addEventListener('click', () => this.stepChapter(1));
    $$('.hub-tab').forEach((b) => b.addEventListener('click', () => { play('click'); this.showTab(b.dataset.tab); }));
  }

  open(opts = {}) {
    const { data, save } = this.game;
    if (!save.shop.offers.length) { rollOffers(data, save, this.game.mods()); this.game.persist(); }
    if (!chapterUnlocked(data.chapterIndex[save.selection.chapter], save, data)) { save.selection.chapter = 1; save.selection.prestige = 0; }
    this.active = true;
    this.renderChapter();
    this.renderShop();
    this.showTab(opts.tab ?? this.tab);
    this.t0 = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.loop(t));
    if (!save.stats.runs && !bagItems(data, save).length) setTimeout(() => { if (this.game.current === 'hub') showTip('Kaufe ein Pack für deinen ersten Run!', $('.offer'), 'down', 6000); }, 500);
  }

  close() { this.active = false; this.tree.close(); cancelAnimationFrame(this.raf); show('#shop-info', false); }

  // -------------------------------------------------------------------
  // Reiter
  // -------------------------------------------------------------------

  showTab(tab) {
    const { save } = this.game;
    this.tab = tab;
    $$('.hub-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-page').forEach((p) => p.classList.toggle('active', p.dataset.page === tab));
    $('#hub-panel').style.setProperty('--tab', TABS[tab]);
    if (tab === 'upgrade') this.tree.open(); else this.tree.close();
    if (tab === 'sammlung') { renderCollection(this.game); save.ui.cardsSeen = this.foundCards(); }
    if (tab === 'bestiarium') { renderBestiary(this.game); save.ui.beastsSeen = this.knownBeasts(); }
    if (tab === 'relikte') { renderRelics(this.game); save.relics.newCount = 0; }
    this.game.persist();
    this.renderDots();
  }

  foundCards() { const { data, save } = this.game; return data.allCards.filter((id) => save.collection[id]).length; }
  knownBeasts() { const { data, save } = this.game; return data.enemies.filter((e) => save.bestiary[e.id]).length; }

  renderDots() {
    const { data, save } = this.game;
    const dot = (tab, on) => $(`.hub-tab[data-tab="${tab}"] .red-dot`).classList.toggle('hidden', !on || this.tab === tab);
    dot('upgrade', anyNodeAffordable(data, save));
    dot('sammlung', this.foundCards() > (save.ui.cardsSeen ?? 0));
    dot('bestiarium', this.knownBeasts() > (save.ui.beastsSeen ?? 0));
    dot('relikte', save.relics.newCount > 0);
    $('#dot-quests').classList.toggle('hidden', !claimableQuests(data, save));
  }

  /** Nach einem Upgrade-Kauf: Shop-Plätze, Rerolls und Gebäude können sich geändert haben. */
  onUpgradeBought() {
    const { data, save } = this.game;
    const mods = this.game.mods();
    if (save.shop.offers.length < shopSlots(data, mods)) rollOffers(data, save, mods, Math.random, true);
    this.game.persist();
    this.renderShop();
    this.renderDots();
  }

  // -------------------------------------------------------------------
  // Kapitelwahl (▲/▼, römische Ziffer = Prestige-Stufe)
  // -------------------------------------------------------------------

  chapterEntries() {
    const { data, save } = this.game;
    const out = [];
    for (const act of data.acts) {
      for (const id of [...(act.kapitel ?? []), ...(act.sonder ?? [])]) {
        const ch = data.chapterIndex[id];
        if (!ch || !chapterUnlocked(ch, save, data)) continue;
        out.push({ chapter: id, prestige: 0 });
        for (const p of prestigeAvailable(ch, save, data)) out.push({ chapter: id, prestige: p });
      }
    }
    return out;
  }

  stepChapter(dir) {
    const sel = this.game.save.selection;
    const list = this.chapterEntries();
    const i = list.findIndex((e) => e.chapter === sel.chapter && e.prestige === (sel.prestige || 0));
    const next = list[Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + dir))];
    if (!next) return;
    sel.chapter = next.chapter;
    sel.prestige = next.prestige;
    play('click');
    this.game.persist();
    this.renderChapter();
  }

  chapterLabel(ch) {
    const { data } = this.game;
    if (ch.art === 'reliktjagd') return `SONDERKAPITEL – AKT ${ch.akt}`;
    if (ch.art === 'riss') return `ELEMENTAR-RISS – AKT ${ch.akt}`;
    const nr = data.acts.filter((a) => a.id < ch.akt).reduce((s, a) => s + (a.kapitel?.length || 0), 0) + data.actIndex[ch.akt].kapitel.indexOf(ch.id) + 1;
    return `KAPITEL ${nr} – AKT ${ch.akt}`;
  }

  renderChapter() {
    const { data, save } = this.game;
    const sel = save.selection;
    const ch = data.chapterIndex[sel.chapter];
    const list = this.chapterEntries();
    let i = list.findIndex((e) => e.chapter === sel.chapter && e.prestige === (sel.prestige || 0));
    if (i < 0) { sel.prestige = 0; i = list.findIndex((e) => e.chapter === sel.chapter && !e.prestige); }
    $('#ch-prev').disabled = i <= 0;
    $('#ch-next').disabled = i < 0 || i >= list.length - 1;
    const best = save.stats.besteZeit[ch.id];
    $('#ch-sub').textContent = this.chapterLabel(ch) + (best ? ` · BESTZEIT ${Math.floor(best / 60)}:${String(Math.floor(best % 60)).padStart(2, '0')}` : '');
    $('#ch-name').textContent = `${ch.name}${sel.prestige ? ' ' + ROMAN[sel.prestige] : ''}`;
    $('#ch-name').title = ch.intro ?? '';
    const extra = [];
    const canWanted = ch.gesucht && save.stats.bossKills[ch.id] > 0;
    if (!canWanted) sel.gesucht = false;
    if (canWanted) extra.push(`<button class="chip${sel.gesucht ? ' on' : ''}" id="sel-gesucht" title="Der Boss erscheint als Foil-Boss: stärker, mehr Belohnung.">GESUCHT ✦</button>`);
    const modsAvail = ch.art === 'kapitel' ? modifiersAvailable(data, save) : [];
    if (!modsAvail.some((m) => m.id === sel.modifier)) sel.modifier = null;
    if (modsAvail.length) extra.push(`<span class="chip"><select id="sel-mod" title="Kapitel-Modifikator"><option value="">kein Modifikator</option>${modsAvail.map((m) => `<option value="${m.id}"${sel.modifier === m.id ? ' selected' : ''} title="${escapeHtml(m.beschreibung)}">${escapeHtml(m.name)} (×${m.belohnung.masteryMul})</option>`).join('')}</select></span>`);
    const g = gateState(data, save);
    if (g.stones.some((s) => s.owned) || g.opened) extra.push(`<button class="chip gate" id="sel-gate">${g.opened ? 'TOR OFFEN' : `TOR ${g.stones.filter((s) => s.owned).length}/${g.stones.length}`}</button>`);
    $('#ch-extra').innerHTML = extra.join('');
    $('#sel-gesucht')?.addEventListener('click', () => { sel.gesucht = !sel.gesucht; play('click'); this.game.persist(); this.renderChapter(); });
    $('#sel-mod')?.addEventListener('change', (e) => { sel.modifier = e.target.value || null; this.game.persist(); });
    $('#sel-gate')?.addEventListener('click', () => this.showGate());
  }

  showGate() {
    const { data, save } = this.game;
    const g = gateState(data, save);
    const box = $('#popup-box');
    box.innerHTML = `<h1>${escapeHtml(g.tor.name)}</h1>
      <div class="row" style="gap:24px;margin:16px 0">${g.stones.map((s) => `<div title="${escapeHtml(s.name)}" style="width:80px;height:80px;border-radius:50%;border:5px solid ${s.owned ? '#FFD24A' : '#4a4266'};background:${s.owned ? s.farbe : '#14121e'};box-shadow:${s.owned ? `0 0 20px ${s.farbe}` : 'none'};display:grid;place-items:center;font-family:var(--pixel);font-size:28px">${s.owned ? '' : '?'}</div>`).join('')}</div>
      <p>${escapeHtml(g.opened ? 'Das Tor ist offen. Neue Upgrades, Kapitel-Modifikatoren und der Riss des Frosts warten.' : g.tor.beschreibung)}</p>
      <div class="row">${!g.opened && g.complete ? '<button class="btn btn-primary btn-big" id="gate-open">Tor öffnen</button>' : ''}<button class="btn btn-big" id="gate-close">Schließen</button></div>`;
    show('#overlay-popup', true);
    $('#gate-close').onclick = () => show('#overlay-popup', false);
    $('#gate-open')?.addEventListener('click', async () => {
      show('#overlay-popup', false);
      if (!(await confirmDialog(g.tor.warnung, 'Tor öffnen', 'Noch nicht'))) return;
      if (!openGate(data, save)) return;
      play('keystone');
      this.game.persist();
      this.renderChapter();
      this.tree.updateCurrency(false);
      this.renderDots();
      showPopups(['<h1>Akt 2 beginnt!</h1><p style="font-size:24px">Deine Mastery-Punkte wurden vollständig erstattet. Neue Upgrades sind sichtbar.</p>']);
    });
  }

  // -------------------------------------------------------------------
  // Shop
  // -------------------------------------------------------------------

  renderCoins(animateFrom = null) {
    const { save } = this.game;
    const el = $('#shop-coins');
    if (animateFrom != null && animateFrom !== save.coins) countTo(el, animateFrom, save.coins, 350);
    else el.textContent = save.coins;
    $('#shop-bonus').textContent = save.bonusCoins ? `+${save.bonusCoins}` : '';
    $('#shop-budget').textContent = `/${save.dayBudget ?? save.coins}`;
  }

  offerArt(o) {
    const { bank, data } = this.game;
    if (o.kind === 'karte') {
      const c = data.cardIndex[o.id];
      return c.art === 'tome' ? `<img class="tome" src="${bank.url(bank.tome(o.id))}" alt="">` : `<img class="hero" src="${bank.unitUrl(o.id)}" alt="">`;
    }
    const first = o.items.find((i) => data.packIndex[i.artikel]?.art !== 'relikt') ?? o.items[0];
    return `<img class="art" src="${bank.shopItemUrl(first.artikel)}" alt="">`;
  }

  renderShop(animate = false) {
    const { data, save, bank } = this.game;
    const mods = this.game.mods();
    const grid = $('#shop-grid');
    grid.innerHTML = '';
    const total = walletTotal(save);
    save.shop.offers.forEach((slot, i) => {
      const o = describeOffer(slot, data, save);
      if (!o) return;
      const div = document.createElement('div');
      div.className = `offer${o.kind === 'jackpot' ? ' jackpot' : ''}${o.sold ? ' sold' : total < o.preis ? ' poor' : ''}${o.opened ? ' final' : ''}`;
      div.innerHTML = `<div class="tag-price">${o.rabatt && !o.sold ? `<s>${o.basisPreis}</s>` : ''}${o.preis}<img src="${bank.iconUrl('coin')}" alt=""></div>
        <div class="field">${this.offerArt(o)}</div>
        ${o.rabatt && !o.sold ? `<div class="rabatt">−${Math.round((1 - data.balance.shop.rabatt.faktor) * 100)} %</div>` : ''}
        ${o.neu ? '<div class="neu"><span>NEU</span></div>' : ''}`;
      div.addEventListener('click', () => { if (this.longPressed) { this.longPressed = false; return; } this.buy(i); });
      this.bindInfo(div, o);
      grid.appendChild(div);
    });
    this.renderCoins(animate ? this.lastCoins : null);
    this.lastCoins = save.coins;
    $('#shop-reset').disabled = !save.shop.offers.some((s) => s.sold && !s.opened);
    const rr = $('#shop-reroll');
    if (!canReroll(mods)) { rr.innerHTML = `<img src="${bank.iconUrl('lock')}" alt=""> REROLL`; rr.disabled = true; }
    else {
      const cost = rerollCost(data, save, mods);
      rr.innerHTML = `REROLL&nbsp; ${cost} <img src="${bank.iconUrl('coin')}" alt="">`;
      rr.disabled = total < cost;
    }
  }

  buy(i) {
    const { data, save, bank } = this.game;
    const before = save.coins;
    const res = buyOffer(i, data, save);
    if (!res) {
      play('error');
      if (!save.shop.offers[i]?.opened) this.game.toast('Nicht genug Münzen.', true);
      return;
    }
    play(res.undone ? 'click' : 'buy');
    show('#tip', false);
    show('#shop-info', false);
    this.game.persist();
    this.lastCoins = before;
    this.renderShop(true);
    if (res.relics.length) {
      showPopups(res.relics.map((r) => r
        ? `<h1>Neues Relikt!</h1><img src="${bank.iconUrl(r.symbol)}" style="width:96px;height:96px"><p style="font-size:28px">${escapeHtml(r.name)}</p><p>${escapeHtml(r.beschreibung)}</p>`
        : '<h1>Alle Relikte gefunden!</h1><p>Stattdessen: +10 Kristalle</p>'));
      this.renderDots();
      if (this.tab === 'relikte') renderRelics(this.game);
    }
  }

  /** Info-Fenster: Überfahren (Maus) bzw. lang drücken (Touch). */
  bindInfo(div, o) {
    let timer = null;
    div.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') this.showOfferInfo(div, o); });
    div.addEventListener('pointerleave', () => { clearTimeout(timer); show('#shop-info', false); });
    div.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse') return;
      timer = setTimeout(() => { this.longPressed = true; this.showOfferInfo(div, o); }, 450);
    });
    div.addEventListener('pointerup', () => clearTimeout(timer));
  }

  showOfferInfo(div, o) {
    const { data, save, bank } = this.game;
    const has = (id) => (save.collection[id]?.normal || 0) + (save.collection[id]?.foil || 0) > 0;
    let html = `<h3>${escapeHtml(o.name)}</h3>`;
    const packInfo = (packId) => {
      const p = data.packIndex[packId];
      if (p.art === 'kiste') return `<div>Enthält ${p.inhalt.anzahl} × ${escapeHtml(data.packIndex[p.inhalt.pack].name)}.</div>` + packInfo(p.inhalt.pack);
      if (p.art === 'relikt') return '<div>Wird sofort geöffnet: ein Relikt, das dir noch fehlt.</div>';
      // Effektive Ziehchancen: fehlende Seltenheiten fallen auf die nächstniedrigere vorhandene zurück
      const present = [...new Set(p.pool.map((id) => data.cardIndex[id].def.rarity))];
      const byRank = Object.entries(data.rarities).filter(([, r]) => !r.geheim).sort((a, b) => a[1].rang - b[1].rang).map(([k]) => k);
      const eff = {};
      const sum = Object.values(p.seltenheitsGewichte).reduce((a, b) => a + b, 0);
      for (const [r, w] of Object.entries(p.seltenheitsGewichte)) {
        let k = byRank.indexOf(r);
        while (k > 0 && !present.includes(byRank[k])) k--;
        const t = present.includes(byRank[k]) ? byRank[k] : present[0];
        eff[t] = (eff[t] || 0) + w / sum;
      }
      const odds = byRank.filter((r) => eff[r]).map((r) => `<span style="color:${data.rarities[r].farbe}">${data.rarities[r].name} ${Math.round(eff[r] * 1000) / 10} %</span>`).join('');
      const pool = p.pool.map((id) => `<img src="${bank.cardUrl(id)}" class="${has(id) ? '' : 'unknown'}" style="--r:${data.rarities[data.cardIndex[id].def.rarity].farbe}" title="${has(id) ? escapeHtml(data.cardIndex[id].def.name) : '???'}">`).join('');
      return `<div>${p.kartenProPack} Karten pro Pack · Widerstand ${p.widerstand}</div><div class="odds">${odds}</div><div class="pool">${pool}</div>`;
    };
    if (o.kind === 'karte') {
      const c = data.cardIndex[o.id];
      html += `<div style="color:${data.rarities[c.def.rarity].farbe}">${data.rarities[c.def.rarity].name} · ${c.art === 'tome' ? 'Tome' : escapeHtml(c.def.rolle)}</div>
        <div>${escapeHtml(c.def.beschreibung)}</div>
        <div style="margin-top:6px">${has(o.id) ? '✓ In deiner Sammlung' : '<span style="color:var(--gold)">Noch nicht in deiner Sammlung</span>'}</div>
        <div class="muted">Landet im Kampf als aufgedeckte Karte.</div>`;
    } else {
      for (const it of o.items) html += (o.items.length > 1 ? `<div style="margin-top:6px"><b>${it.anzahl} × ${escapeHtml(data.packIndex[it.artikel].name)}</b></div>` : '') + packInfo(it.artikel);
    }
    if (o.sold) html += `<div class="muted" style="margin-top:6px">${o.opened ? 'Bereits geöffnet.' : 'Gekauft – erneut klicken macht den Kauf rückgängig.'}</div>`;
    const box = $('#shop-info');
    box.innerHTML = html;
    show('#shop-info', true);
    const r = stage.rectOf(div);
    box.style.left = `${Math.min(1920 - 440, r.x + r.w + 10)}px`;
    box.style.top = `${Math.max(10, Math.min(1080 - box.offsetHeight - 10, r.y))}px`;
  }

  // -------------------------------------------------------------------

  async fight() {
    const { data, save } = this.game;
    if (!bagItems(data, save).length) {
      const ok = await confirmDialog('Du hast nichts gekauft. Ohne Packs bekommst du keine Helden. Trotzdem kämpfen?', 'Kämpfen', 'Zum Shop');
      if (!ok) return;
    }
    play('click');
    const s = save.selection;
    this.game.startRun({ chapter: s.chapter, prestige: s.prestige || 0, gesucht: !!s.gesucht, modifierId: s.modifier || null });
  }

  /** Hintergrund: sehr dunkles Violett mit schwach funkelnden Pixelpunkten. */
  loop(now) {
    if (!this.active) return;
    const c = this.ctx;
    const t = (now - this.t0) / 1000;
    c.fillStyle = '#1A1020';
    c.fillRect(0, 0, 1920, 1080);
    for (let i = 0; i < 140; i++) {
      const a = 0.08 + 0.4 * Math.max(0, Math.sin(t * (0.3 + hash(i, 5)) + i * 1.7));
      c.fillStyle = `rgba(244,235,217,${a.toFixed(2)})`;
      const s = hash(i, 6) > 0.9 ? 4 : 2;
      c.fillRect(Math.round(hash(i, 7) * 1920), Math.round(hash(i, 8) * 1080), s, s);
    }
    this.raf = requestAnimationFrame((tt) => this.loop(tt));
  }
}
