// Kampfbildschirm: Spielschleife, HUD (8.2.4), Runenkreis, Shop, Team, Zauber, Einblendungen, Pause, Run-Ende.
import { $, $$, el, escapeHtml, toast, show, stage, confirmDialog, showTip } from './dom.js';
import { heroStatsAt } from './cardView.js';
import { openPack } from './packOverlay.js';
import { showRunEnd } from './runEnd.js';
import { Run } from '../core/run.js';
import { Renderer } from '../render/renderer.js';
import { play, startMusic } from '../audio.js';
import { formatNumber } from '../core/util.js';
import { isEliteWave } from '../core/waves.js';

const TOP = 90; // Höhe der oberen Leiste = Versatz des Spielfelds

export class BattleController {
  constructor(game) {
    this.game = game;
    this.renderer = new Renderer($('#field'), game.data, game.bank);
    this.run = null;
    this.speedIndex = 0;
    this.paused = false;
    this.overlay = null;      // 'pack' | 'slots' | null → Zeitlupe (25 %)
    this.raf = null;
    this.targeting = null;    // Zauber, der gerade per Klick gezielt wird
    this.bindControls();
  }

  // =====================================================================
  // Run-Lebenszyklus
  // =====================================================================

  start(chapterId) {
    const { data, save } = this.game;
    this.chapterId = chapterId;
    save.lastChapter = chapterId;
    this.game.persist();
    this.firstRun = !save.tutorial.firstRunDone;
    this.tutorial = { pack: false, auto: false, dup: false, air: false };
    this.seenThisRun = new Set();
    this.run = new Run({
      data, chapterId,
      mods: this.game.mods(),
      unlockedChapter: save.unlockedChapter,
      settings: { damageNumbers: save.settings.damageNumbers },
      events: (name, payload) => this.onEvent(name, payload),
    });
    this.paused = false;
    this.overlay = null;
    this.targeting = null;
    this.ending = false;
    this.speedIndex = 0;
    this.renderer.selected = null;
    this.renderer.shakeEnabled = save.settings.screenShake;
    this.renderer.bossIntro = 0;
    this.lastGold = -1;
    $('#btn-speed').textContent = `${data.balance.speeds[0]}×`;
    show('#boss-bar', false);
    show('#enemy-card', false);
    show('#team-tooltip', false);
    show('#debug-panel', this.game.debug);
    this.buildShop();
    this.buildSpells();
    this.buildTeam();
    $('#icon-tower').src = this.game.bank.iconUrl('tower');
    $('#icon-gold').src = this.game.bank.iconUrl('coin');
    startMusic(`chapter${chapterId}`);
    this.lastTime = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.loop(t));
    requestAnimationFrame(() => {
      const g = stage.rectOf($('#icon-gold'));
      this.renderer.goldTarget = { x: g.cx, y: g.cy };
      if (this.firstRun) showTip('Kaufe dein erstes Pack!', $('#shop .chest'), 'down', 0);
    });
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  timeScale() {
    if (this.paused) return 0;
    const B = this.game.data.balance;
    const base = B.speeds[this.speedIndex];
    if (this.run.over) return 0.3;                         // Zeitlupe nach Sieg/Niederlage
    if (this.overlay) return base * B.packOpeningTimeScale; // Pack-Overlay / Slots voll: 25 %
    return base;
  }

  loop(now) {
    const dtReal = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const run = this.run;
    if (run) {
      const dt = dtReal * this.timeScale();
      if (dt > 0) run.update(dt);
      this.renderer.draw(run, now / 1000, dtReal);
      this.drawCursor(run);
      this.updateHud();
      if (run.over && !this.ending) this.beginEnding();
    }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  /** Runenkreis um den Cursor (auf dem Canvas, über allem anderen). */
  drawCursor(run) {
    const c = this.renderer.ctx;
    const cur = run.cursor;
    if (!cur.active || run.over) return;
    const cs = run.cursorStats();
    const y = cur.y + TOP;
    const pulse = cur.pulse > 0 ? 1 + cur.pulse : 1;
    const drawRing = (x, yy, r, alpha) => {
      c.strokeStyle = `rgba(90,169,240,${alpha})`;
      c.lineWidth = 4;
      c.setLineDash([12, 8]);
      c.lineDashOffset = -cur.angle * 20;
      c.beginPath(); c.arc(x, yy, r * pulse, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      c.fillStyle = `rgba(90,169,240,${alpha * 0.15})`;
      c.fill();
      for (let i = 0; i < 6; i++) {
        const a = cur.angle + (i * Math.PI) / 3;
        c.fillStyle = '#a6d8ff';
        c.fillRect(Math.round(x + Math.cos(a) * r * pulse) - 4, Math.round(yy + Math.sin(a) * r * pulse) - 4, 8, 8);
      }
    };
    drawRing(cur.x, y, cs.radius, 0.9);
    if (run.mods.flags.zwillingsrune) {
      const d = cs.radius * 1.5;
      drawRing(cur.x + Math.cos(cur.angle) * d, y + Math.sin(cur.angle) * d, cs.radius * this.game.data.balance.cursor.twinRadius, 0.6);
    }
    if (this.targeting) {
      const s = run.spells.find((x) => x.id === this.targeting);
      c.strokeStyle = '#FFD24A';
      c.lineWidth = 4;
      c.beginPath(); c.ellipse(cur.x, y, s.def.effect.radius, s.def.effect.radius * 0.35, 0, 0, Math.PI * 2); c.stroke();
    }
  }

  /** Niederlage: 1 s Zeitlupe, Turm zerfällt, abblenden. Sieg: Lichtstrahlen + Goldregen, nach 2 s Run-Ende. */
  beginEnding() {
    this.ending = true;
    this.targeting = null;
    show('#boss-bar', false);
    const r = this.run.result;
    play(r.victory ? 'victory' : 'defeat');
    if (r.victory) startMusic('menu');
    setTimeout(() => {
      stage.fade(async () => {
        this.stop();
        showRunEnd(this.game, r, { onAgain: () => this.game.startRun(this.chapterId) });
      });
    }, r.victory ? 2000 : 1400);
  }

  // =====================================================================
  // Ereignisse aus dem Spielkern
  // =====================================================================

  onEvent(name, p) {
    const run = this.run;
    const { save, data } = this.game;
    switch (name) {
      case 'waveStart':
        if (p.boss) break; // Boss-Intro übernimmt
        this.waveBanner(p.elite ? 'Elitewelle!' : `Welle ${p.wave}`, p.elite);
        play(p.elite ? 'eliteWave' : 'waveStart');
        break;
      case 'bossSpawned':
        this.bossIntro(p.enemy);
        break;
      case 'bossWarning':
        this.waveBanner(p.text, true);
        break;
      case 'bossInterrupted':
        toast('Schrei unterbrochen!');
        break;
      case 'enemyFirstSeen':
        if (!save.seenEnemies[p.id] && !data.enemyIndex[p.id].boss) this.enemyCard(p.id);
        if (p.enemy.flying && this.firstRun && !this.tutorial.air) {
          this.tutorial.air = true;
          showTip('Achtung, fliegende Gegner!', { x: p.enemy.x - 40, y: p.enemy.y + TOP - 30 }, 'down', 4000);
        }
        break;
      case 'coinsCollected': {
        const now = performance.now();
        if (!this.coinSoundAt || now - this.coinSoundAt > 90) { play('coin'); this.coinSoundAt = now; } // zusammengefasst
        break;
      }
      case 'towerHit': {
        const now = performance.now();
        if (!this.towerSoundAt || now - this.towerSoundAt > 250) { play('towerHit'); this.towerSoundAt = now; }
        break;
      }
      case 'interest':
        toast(`Zinsen: +${p.amount} Gold`);
        break;
      case 'shake':
        this.renderer.addShake(p.power);
        break;
      case 'spellCast':
        play('spell');
        break;
      case 'sound':
        play(p);
        break;
      case 'heroPlaced':
      case 'slotsFull':
        this.buildTeam();
        break;
    }
  }

  waveBanner(text, elite = false) {
    const b = $('#wave-banner');
    b.textContent = text;
    b.classList.toggle('elite', elite);
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), 1250);
  }

  /** Boss-Intro: Spielfeld dunkelt ab, Namensbanner (2 s), danach große Lebensleiste. */
  bossIntro(boss) {
    play('boss');
    startMusic('boss');
    this.renderer.bossIntro = 2;
    const b = $('#boss-banner');
    b.textContent = boss.name;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    setTimeout(() => {
      b.classList.add('hidden');
      $('#boss-name').textContent = boss.name;
      show('#boss-bar', true);
    }, 2000);
  }

  /** Kleine Karte am Rand beim ersten Erscheinen eines Gegnertyps. */
  enemyCard(id) {
    const def = this.game.data.enemyIndex[id];
    this.game.save.seenEnemies[id] = true;
    play('newEnemy');
    const card = $('#enemy-card');
    card.innerHTML = `<img src="${this.game.bank.enemyUrl(id)}" alt="">
      <div><div class="tag">Neuer Gegner</div><div class="nm">${escapeHtml(def.name)}</div><div class="ds">${escapeHtml(def.hint)}</div></div>`;
    card.classList.remove('hidden');
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => card.classList.add('hidden'), 4500);
  }

  // =====================================================================
  // Shop (untere Leiste links), Team (rechts), Zauber (rechte Spalte)
  // =====================================================================

  buildShop() {
    const { data } = this.game;
    const shop = $('#shop');
    shop.innerHTML = '';
    this.chests = {};
    for (const pack of data.packs) {
      const available = this.run.availablePacks.includes(pack);
      const c = el(`
        <button class="chest ${available ? '' : 'locked'}" ${available ? '' : 'disabled'} title="${escapeHtml(pack.name + ': ' + pack.description)}">
          <span class="cname">${escapeHtml(pack.name)}</span>
          <img src="${this.game.bank.chestUrl(pack.id)}" alt="">
          <span class="price">${available ? '' : `Kap. ${pack.unlockChapter}`}</span>
        </button>`);
      if (available) {
        c.addEventListener('click', () => this.buyPack(pack.id));
        this.chests[pack.id] = c;
      }
      shop.appendChild(c);
    }
  }

  buyPack(packId) {
    const run = this.run;
    if (!run || run.over || this.overlay) return;
    if (!run.canBuy(packId)) { toast('Nicht genug Gold!', true); return; }
    $('#tip').classList.add('hidden');
    const results = run.buyPack(packId);
    play('buy');
    this.buildSpells();
    this.buildTeam();
    const pack = this.game.data.packIndex[packId];
    const neverFound = results.map((r) => {
      const isNew = !(this.game.save.collection[r.id] > 0) && !this.seenThisRun.has(r.id);
      this.seenThisRun.add(r.id);
      return isNew;
    });
    if (this.firstRun && !this.tutorial.dup && results.some((r) => r.outcome === 'copy' || r.outcome === 'starUp')) {
      this.tutorial.dup = true;
      this.pendingTip = 'dup';
    }
    const done = () => {
      this.overlay = null;
      this.buildSpells();
      this.buildTeam();
      this.lastTime = performance.now();
      this.afterPack();
    };
    if (this.game.save.settings.fastPackOpening) {
      const names = results.map((r) => this.game.data.cardIndex[r.id].def.name + (r.outcome === 'starUp' ? ` (${r.stars}★)` : '')).join(', ');
      toast(`${pack.name}: ${names}`);
      const best = results.reduce((m, r) => Math.max(m, this.game.data.rarities[r.rarity].order), 0);
      play(['flip', 'flip', 'rare', 'epic', 'legendary'][best]);
      done();
      return;
    }
    this.overlay = 'pack';
    openPack({ game: this.game, battle: this, run, pack, results, neverFound, chestEl: this.chests[packId], onDone: done });
  }

  /** Nach dem Pack: Slots-voll-Entscheidungen, Tutorial-Hinweise. */
  afterPack() {
    if (this.run.pending.length) { this.showSlotsFull(); return; }
    if (this.firstRun && !this.tutorial.auto && this.run.heroes.length) {
      this.tutorial.auto = true;
      const h = this.run.heroes[0];
      showTip('Deine Helden kämpfen automatisch.', { x: h.x - 20, y: h.footY + TOP - 110 }, 'down', 4500);
    } else if (this.pendingTip === 'dup') {
      this.pendingTip = null;
      showTip('Doppelte Helden werden stärker.', $('#team .portrait'), 'down', 4500);
    }
  }

  /** Popup "Slots voll": Helden ersetzen (50 % Rückerstattung) oder neue Karte verkaufen. */
  showSlotsFull() {
    const run = this.run;
    const id = run.pending[0];
    if (!id) { this.overlay = null; return; }
    const { data, bank } = this.game;
    this.overlay = 'slots';
    const left = $('#slots-new');
    left.innerHTML = '';
    left.appendChild(this.game.card(id));
    const right = $('#slots-heroes');
    right.innerHTML = '';
    for (const h of run.heroes) {
      const refund = Math.round(run.heroValue(h) * data.balance.heroes.replaceRefund);
      const b = el(`<button class="slot-pick" style="--rar:${data.rarities[h.def.rarity].color}">
        <img src="${bank.heroUrl(h.id)}" alt=""><b>${escapeHtml(h.def.name)}</b><span style="color:#FFD24A">${'★'.repeat(h.stars)}</span>
        <span>Ersetzen</span><span class="refund">+${refund} Gold</span></button>`);
      b.addEventListener('click', () => { run.replaceHero(id, h); play('buy'); this.closeSlots(); });
      right.appendChild(b);
    }
    $('#slots-sell').textContent = `Neue Karte verkaufen (+${run.sellValue(id)} Gold)`;
    $('#slots-sell').onclick = () => { run.sellPending(id); play('coin'); this.closeSlots(); };
    show('#overlay-slots', true);
  }

  closeSlots() {
    show('#overlay-slots', false);
    this.overlay = null;
    this.buildTeam();
    if (this.run.pending.length) this.showSlotsFull();
  }

  buildTeam() {
    const run = this.run;
    const team = $('#team');
    team.innerHTML = '';
    this.portraits = [];
    for (let i = 0; i < run.slotCount; i++) {
      const h = run.heroes.find((x) => x.slot === i);
      if (!h) { team.appendChild(el('<div class="portrait empty"></div>')); continue; }
      const p = el(`<div class="portrait" style="--rar:${this.game.data.rarities[h.def.rarity].color}">
        <img src="${this.game.bank.heroUrl(h.id)}" alt=""><div class="pstars">${'★'.repeat(h.stars)}</div><div class="php"><div></div></div></div>`);
      const showTip2 = () => this.showHeroTooltip(h, p);
      p.addEventListener('mouseenter', showTip2);
      p.addEventListener('mouseleave', () => show('#team-tooltip', false));
      // Touch: lange gedrückt halten
      let timer = null;
      p.addEventListener('touchstart', () => { timer = setTimeout(showTip2, 400); }, { passive: true });
      p.addEventListener('touchend', () => { clearTimeout(timer); setTimeout(() => show('#team-tooltip', false), 1500); });
      team.appendChild(p);
      this.portraits.push({ h, p });
    }
  }

  showHeroTooltip(h, anchor) {
    const run = this.run;
    const B = this.game.data.balance;
    const d = h.def;
    const st = heroStatsAt(d, h.stars, B, run.mods);
    const own = run.owned[h.id];
    const next = B.stars.thresholds[h.stars];
    const tt = $('#team-tooltip');
    tt.innerHTML = `<h4>${escapeHtml(d.name)} <span style="color:#FFD24A">${'★'.repeat(h.stars)}</span></h4>
      <div>❤ Leben: ${Math.round(h.hp)} / ${Math.round(h.maxHp)}</div>
      ${d.attack.kind !== 'none' ? `<div>⚔ Schaden: ${st.damage} · Angriffstempo: ${(st.aps * (1 + run.auras.haste)).toFixed(2)}/s</div>` : ''}
      <div>${escapeHtml(d.description)}</div>
      ${h.stars >= B.stars.enhancedFromStar ? `<div style="color:#FFD24A">★★★ ${escapeHtml(d.star3.text)}</div>` : ''}
      ${next != null ? `<div style="color:#b3a990">Duplikate: ${Math.floor(own.copies)} / ${next} für ${h.stars + 1}★</div>` : ''}`;
    const r = stage.rectOf(anchor);
    tt.style.left = `${Math.min(1460, r.x - 160)}px`;
    tt.style.top = `${r.y - 250}px`;
    show('#team-tooltip', true);
  }

  buildSpells() {
    const run = this.run;
    const col = $('#spell-column');
    col.innerHTML = '';
    this.spellEls = {};
    for (let i = 0; i < run.spellSlots; i++) {
      const s = run.spells[i];
      if (!s) { col.appendChild(el('<div class="spell"><div class="spell-empty"></div></div>')); continue; }
      const rar = this.game.data.rarities[s.def.rarity];
      const wrap = el(`<div class="spell">
        <button class="spell-btn" style="--rar:${rar.color};--p:0" title="${escapeHtml(s.def.name + ': ' + s.def.description)}">
          <img src="${this.game.bank.iconUrl(s.def.icon)}" alt=""><span class="stars"></span></button>
        <button class="auto-toggle ${s.auto ? 'on' : ''}">Auto</button></div>`);
      const btn = wrap.querySelector('.spell-btn');
      btn.addEventListener('click', () => this.useSpell(s));
      const tog = wrap.querySelector('.auto-toggle');
      tog.addEventListener('click', () => { run.setSpellAuto(s.id, !s.auto); tog.classList.toggle('on', s.auto); });
      col.appendChild(wrap);
      this.spellEls[s.id] = btn;
    }
  }

  /** Zauber per Klick: Flächenzauber werden danach mit einem Klick aufs Spielfeld gezielt. */
  useSpell(s) {
    if (this.run.over) return;
    if (s.charge < s.cooldown) { toast('Lädt noch …', true); return; }
    if (s.def.effect.targeted) {
      this.targeting = this.targeting === s.id ? null : s.id;
      if (this.targeting) toast('Klicke aufs Spielfeld zum Zielen');
      return;
    }
    if (!this.run.castSpell(s.id)) toast('Kein Ziel', true);
  }

  // =====================================================================
  // HUD aktualisieren
  // =====================================================================

  updateHud() {
    const run = this.run;
    const t = run.tower;
    const frac = Math.max(0, t.hp / t.maxHp);
    $('#tower-fill').style.width = `${frac * 100}%`;
    $('#tower-text').textContent = `${Math.ceil(t.hp)} / ${t.maxHp}`;
    $('#tower-bar').classList.toggle('low', frac < 0.25);

    const wt = $('#wave-text');
    if (run.waveState === 'prep') {
      wt.textContent = `Erste Welle in ${Math.ceil(Math.max(0, run.waveTimer))}`;
      wt.classList.add('countdown');
    } else if (run.waveState === 'break') {
      wt.textContent = `Nächste Welle in ${Math.ceil(Math.max(0, run.waveTimer))}`;
      wt.classList.add('countdown');
    } else {
      const elite = isEliteWave(run.chapter, run.wave, this.game.data.balance);
      wt.textContent = `${elite ? 'Elitewelle' : 'Welle'} ${run.wave} / ${run.chapter.waves}`;
      wt.classList.remove('countdown');
    }
    $('#wave-progress').style.width = `${run.waveProgress() * 100}%`;
    $('#btn-call-wave').classList.toggle('hidden', !(run.waveState === 'break' && !run.over && !run.earlyCall));

    const g = Math.floor(run.gold);
    if (g !== this.lastGold) {
      const num = $('#gold-num');
      num.textContent = formatNumber(g);
      if (g > this.lastGold && this.lastGold >= 0) { num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump'); }
      this.lastGold = g;
    }
    for (const [id, c] of Object.entries(this.chests)) {
      const price = run.packPrice(id);
      const ok = run.gold >= price && !run.over;
      c.querySelector('.price').textContent = formatNumber(price);
      c.classList.toggle('poor', !ok);
      c.classList.toggle('affordable', ok);
    }
    for (const s of run.spells) {
      const b = this.spellEls?.[s.id];
      if (!b) continue;
      const p = Math.min(1, s.charge / s.cooldown);
      b.style.setProperty('--p', p.toFixed(3));
      b.classList.toggle('ready', p >= 1);
      b.classList.toggle('targeting', this.targeting === s.id);
      b.querySelector('.stars').textContent = '★'.repeat(s.stars);
    }
    for (const { h, p } of this.portraits || []) {
      p.classList.toggle('down', !h.alive);
      p.querySelector('.php div').style.width = `${Math.max(0, h.hp / h.maxHp) * 100}%`;
      p.querySelector('.pstars').textContent = '★'.repeat(h.stars);
    }
    const boss = run.enemies.find((e) => e.boss);
    if (boss) $('#boss-fill').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
  }

  // =====================================================================
  // Eingaben
  // =====================================================================

  bindControls() {
    const speeds = this.game.data.balance.speeds;
    $('#btn-speed').addEventListener('click', () => {
      this.speedIndex = (this.speedIndex + 1) % speeds.length;
      $('#btn-speed').textContent = `${speeds[this.speedIndex]}×`;
    });
    $('#btn-pause').addEventListener('click', () => this.pause(true));
    $('#pause-resume').addEventListener('click', () => this.pause(false));
    $('#pause-settings').addEventListener('click', () => this.game.goto('settings', { back: 'battle' }));
    $('#pause-abandon').addEventListener('click', async () => {
      const ok = await confirmDialog('Wirklich aufgeben? Du erhältst trotzdem Mastery-Punkte für die erreichte Welle.', 'Aufgeben', 'Weiterspielen');
      if (!ok) return;
      show('#overlay-pause', false);
      this.paused = false;
      this.run.finish(false);
    });
    $('#btn-call-wave').addEventListener('click', () => { if (this.run?.callNextWave()) toast('+10 % Gold in dieser Welle!'); });

    // Runenkreis: Maus bewegt sich über dem Spielfeld, Touch solange der Finger liegt
    const field = $('#field');
    const toWorld = (ev) => { const s = stage.toStage(ev.clientX, ev.clientY); return { x: s.x, y: s.y - TOP }; };
    const inField = (p) => p.y >= 0 && p.y <= this.game.data.balance.field.height;
    field.addEventListener('pointermove', (ev) => {
      if (!this.run) return;
      const p = toWorld(ev);
      const active = inField(p) && (ev.pointerType === 'mouse' || ev.buttons > 0 || ev.pressure > 0);
      this.run.setCursor(p.x, p.y, active);
    });
    field.addEventListener('pointerleave', () => this.run?.setCursor(0, 0, false));
    field.addEventListener('pointerup', (ev) => { if (ev.pointerType !== 'mouse') this.run?.setCursor(0, 0, false); });
    field.addEventListener('pointerdown', (ev) => {
      if (!this.run || this.run.over) return;
      const p = toWorld(ev);
      if (!inField(p)) return;
      this.run.setCursor(p.x, p.y, true);
      if (this.targeting) {
        if (this.run.castSpell(this.targeting, { x: p.x, y: p.y })) this.targeting = null;
        return;
      }
      const h = this.renderer.heroAt(this.run, p);
      this.renderer.selected = h === this.renderer.selected ? null : h;
    });
    field.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.targeting = null; });

    window.addEventListener('keydown', (ev) => {
      if (!this.run || this.run.over || !$('#screen-battle').classList.contains('active')) return;
      if (ev.key === ' ') { ev.preventDefault(); this.pause(!this.paused); }
      if (ev.key === 'Escape') this.targeting = null;
      if (ev.key.toLowerCase() === 's') $('#btn-speed').click();
      const pack = this.game.data.packs[Number(ev.key) - 1];
      if (pack && this.chests[pack.id]) this.buyPack(pack.id);
    });

    $$('[data-debug]').forEach((b) => b.addEventListener('click', () => this.debug(b.dataset.debug)));
  }

  pause(on) {
    if (!this.run || this.run.over) return;
    this.paused = on;
    if (on) {
      const s = this.run.stats;
      $('#pause-stats').innerHTML = `Welle: <b>${this.run.wave}</b> · Gegner besiegt: <b>${s.kills}</b> · Gold ausgegeben: <b>${formatNumber(s.goldSpent)}</b>`;
    } else this.lastTime = performance.now();
    show('#overlay-pause', on);
  }

  /** Zurück aus den Einstellungen (Pause bleibt aktiv). */
  resumeScreen() {
    this.renderer.shakeEnabled = this.game.save.settings.screenShake;
    this.run.settings.damageNumbers = this.game.save.settings.damageNumbers;
  }

  debug(action) {
    const run = this.run;
    if (!run || run.over) return;
    switch (action) {
      case 'gold': run.addGold(1000); break;
      case 'skip':
        for (const e of run.enemies) if (!e.boss) e.dead = true;
        run.spawnQueue = [];
        if (run.wave < run.chapter.waves) run.startWave(run.wave + 1);
        break;
      case 'heal': run.tower.hp = run.tower.maxHp; break;
      case 'boss': for (const e of run.enemies) e.dead = true; run.startWave(run.chapter.waves); break;
      case 'lose': run.finish(false); break;
    }
  }
}
