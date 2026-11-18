// Kampfbildschirm: Spielschleife, HUD, Pack-Shop, Zauberleiste, Ereignisse, Debug-Werkzeuge.
import { $, $$, el, escapeHtml, toast, showOverlay } from './dom.js';
import { heroInfoHtml } from './cardView.js';
import { showPackOpening } from './packOverlay.js';
import { Run } from '../core/run.js';
import { computeModifiers } from '../core/mastery.js';
import { applyRunResult, writeSave } from '../save.js';
import { Renderer } from '../render/renderer.js';
import { play } from '../audio.js';
import { formatNumber } from '../core/util.js';

export class BattleController {
  constructor(game, { onExit }) {
    this.game = game;
    this.onExit = onExit;
    this.renderer = new Renderer($('#field'), game.data);
    this.run = null;
    this.speedIndex = 0;
    this.paused = false;      // Pause-Menü
    this.modalOpen = false;   // Pack-Overlay/Run-Ende pausiert ebenfalls
    this.lastTime = 0;
    this.selectedHero = null;
    this.raf = null;
    this.bindControls();
    window.addEventListener('resize', () => this.renderer.resize());
  }

  // ---------------------------------------------------------------------
  // Run-Lebenszyklus
  // ---------------------------------------------------------------------

  start(chapterId) {
    const { data, save } = this.game;
    this.chapterId = chapterId;
    this.run = new Run({
      data, chapterId,
      mods: computeModifiers(data.mastery, save.mastery),
      unlockedChapter: save.unlockedChapter,
      settings: { autoSpells: save.settings.autoSpells, damageNumbers: save.settings.damageNumbers },
      events: (name, payload) => this.onEvent(name, payload),
    });
    this.paused = false;
    this.modalOpen = false;
    this.selectedHero = null;
    this.renderer.selected = null;
    this.speedIndex = 0;
    $('#btn-speed').textContent = `${data.balance.speeds[0]}×`;
    $('#hero-info').classList.add('hidden');
    $('#debug-panel').classList.toggle('hidden', !save.settings.debug);
    $('#auto-spells-label').textContent = save.settings.autoSpells ? '(automatisch)' : '(antippen zum Wirken)';
    this.spellButtons = {};
    $('#spellbar').innerHTML = '<p class="muted small">Ziehe Zauberkarten aus Packs.</p>';
    this.buildShop();
    requestAnimationFrame(() => this.renderer.resize());
    this.banner(`Kapitel ${chapterId}: ${data.chapterIndex[chapterId].name}`, false, 2200);
    this.lastTime = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  loop(now) {
    const dtReal = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const run = this.run;
    if (run && !this.paused && !this.modalOpen && !run.over) {
      run.update(dtReal * this.game.data.balance.speeds[this.speedIndex]);
    }
    if (run) {
      this.renderer.draw(run, now / 1000);
      this.updateHud();
    }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------------------------------------------------------------
  // Ereignisse aus dem Spielkern
  // ---------------------------------------------------------------------

  onEvent(name, p) {
    const run = this.run;
    switch (name) {
      case 'waveStart':
        if (p.boss) { this.banner(`BOSS: ${this.game.data.enemyIndex[run.chapter.boss].name}`, true, 2500); play('boss'); }
        else { this.banner(`Welle ${p.wave}`, false, 1200); play('waveStart'); }
        break;
      case 'bossWarning':
        this.banner(p.text, true, 2200);
        play('bossSkill');
        break;
      case 'bossInterrupted':
        toast('Schrei unterbrochen!');
        break;
      case 'spellCast':
        play('spell');
        break;
      case 'heroPlaced':
        break;
      case 'sound':
        play(p);
        break;
      case 'runOver':
        setTimeout(() => this.showRunEnd(p), 600);
        break;
    }
  }

  banner(text, boss = false, ms = 1500) {
    const b = $('#banner');
    b.textContent = text;
    b.classList.toggle('boss', boss);
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
  }

  // ---------------------------------------------------------------------
  // Shop & Zauberleiste
  // ---------------------------------------------------------------------

  buildShop() {
    const { data, save } = this.game;
    const shop = $('#shop');
    shop.innerHTML = '';
    this.packButtons = {};
    for (const pack of data.packs) {
      const unlocked = pack.unlockChapter <= save.unlockedChapter;
      const btn = el(`
        <button class="btn pack-btn ${unlocked ? '' : 'locked'}" style="--pack-color:${pack.color}" ${unlocked ? '' : 'disabled'}>
          <span class="pack-icon">📦</span>
          <span><span class="pack-name">${escapeHtml(pack.name)}</span><br>
          <span class="pack-desc">${unlocked ? escapeHtml(pack.description) : `ab Kapitel ${pack.unlockChapter}`}</span></span>
          <span class="pack-price"></span>
        </button>`);
      if (unlocked) {
        btn.addEventListener('click', () => this.buyPack(pack.id));
        this.packButtons[pack.id] = btn;
      }
      shop.appendChild(btn);
    }
  }

  buyPack(packId) {
    const run = this.run;
    if (!run || run.over || this.modalOpen) return;
    if (!run.canBuy(packId)) { toast('Nicht genug Gold!', true); return; }
    const results = run.buyPack(packId);
    play('buy');
    this.syncSpellbar();
    const pack = this.game.data.packIndex[packId];
    if (this.game.save.settings.fastPackOpening) {
      const names = results.map((r) => this.game.data.cardIndex[r.id].def.name + (r.outcome === 'starUp' ? ` (${r.stars}★)` : '')).join(', ');
      toast(`${pack.name}: ${names}`);
      if (results.some((r) => this.game.data.rarities[r.rarity].glow)) play('rare');
      return;
    }
    this.modalOpen = true;
    showPackOpening(pack, results, this.game.data, () => { this.modalOpen = false; this.lastTime = performance.now(); });
  }

  syncSpellbar() {
    const bar = $('#spellbar');
    const run = this.run;
    if (!run.spells.length) return;
    if (bar.querySelector('p')) bar.innerHTML = '';
    for (const s of run.spells) {
      if (this.spellButtons[s.id]) continue;
      const rar = this.game.data.rarities[s.def.rarity];
      const b = el(`<button class="spell-btn" style="--col:${s.def.color};--rar:${rar.color}" title="${escapeHtml(s.def.name + ': ' + s.def.description)}">
        <div class="fill"></div><span class="lbl">${escapeHtml(s.def.short)}</span><div class="stars"></div></button>`);
      b.addEventListener('click', () => {
        if (!this.run.castSpell(s.id)) toast(s.charge < s.cooldown ? 'Lädt noch …' : 'Kein Ziel', true);
      });
      bar.appendChild(b);
      this.spellButtons[s.id] = b;
    }
  }

  // ---------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------

  updateHud() {
    const run = this.run;
    const t = run.tower;
    $('#hud-tower').textContent = `${Math.ceil(t.hp)} / ${t.maxHp}`;
    $('#hud-tower-bar').style.width = `${(t.hp / t.maxHp) * 100}%`;
    $('#hud-gold').textContent = formatNumber(run.gold);
    $('#hud-wave').textContent = `${run.wave} / ${run.chapter.waves}`;
    $('#btn-next-wave').disabled = run.waveState === 'active' || run.over || run.wave >= run.chapter.waves;

    for (const [id, btn] of Object.entries(this.packButtons)) {
      const price = run.packPrice(id);
      btn.querySelector('.pack-price').textContent = `💰 ${formatNumber(price)}`;
      btn.disabled = run.gold < price || run.over;
    }
    for (const s of run.spells) {
      const b = this.spellButtons[s.id];
      if (!b) continue;
      const frac = s.charge / s.cooldown;
      b.querySelector('.fill').style.height = `${frac * 100}%`;
      b.classList.toggle('ready', frac >= 1);
      b.querySelector('.stars').textContent = '★'.repeat(s.stars);
      if (s.flash > 0.35) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }
    }
    if (this.selectedHero) {
      // Info nur alle ~0,25 s neu zeichnen
      if (!this.infoTick || performance.now() - this.infoTick > 250) {
        this.infoTick = performance.now();
        $('#hero-info').innerHTML = heroInfoHtml(run, this.selectedHero);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Bedienung
  // ---------------------------------------------------------------------

  bindControls() {
    const speeds = this.game.data.balance.speeds;
    $('#btn-speed').addEventListener('click', () => {
      this.speedIndex = (this.speedIndex + 1) % speeds.length;
      $('#btn-speed').textContent = `${speeds[this.speedIndex]}×`;
    });
    $('#btn-pause').addEventListener('click', () => { this.paused = true; showOverlay('#overlay-pause', true); });
    $('#pause-resume').addEventListener('click', () => { this.paused = false; this.lastTime = performance.now(); showOverlay('#overlay-pause', false); });
    $('#pause-abandon').addEventListener('click', () => {
      showOverlay('#overlay-pause', false);
      this.paused = false;
      this.run.finish(false);
    });
    $('#btn-next-wave').addEventListener('click', () => this.run?.callNextWave());

    // Held antippen → Infos
    $('#field').addEventListener('pointerdown', (ev) => {
      if (!this.run) return;
      const h = this.renderer.heroAt(this.run, this.renderer.toField(ev.clientX, ev.clientY));
      this.selectedHero = h === this.selectedHero ? null : h;
      this.renderer.selected = this.selectedHero;
      this.infoTick = 0;
      $('#hero-info').classList.toggle('hidden', !this.selectedHero);
    });

    // Tastatur: 1-3 Packs, Leertaste Pause, S Tempo
    window.addEventListener('keydown', (ev) => {
      if (!this.run || this.run.over || !$('#screen-battle').classList.contains('active')) return;
      if (ev.key === ' ') { ev.preventDefault(); $(this.paused ? '#pause-resume' : '#btn-pause').click(); }
      if (ev.key.toLowerCase() === 's') $('#btn-speed').click();
      const idx = Number(ev.key) - 1;
      const pack = this.game.data.packs[idx];
      if (pack && this.packButtons[pack.id] && !this.modalOpen) this.buyPack(pack.id);
      if (ev.key === 'Enter' && this.modalOpen) $('#pack-close').click();
    });

    // Debug-Werkzeuge
    $$('[data-debug]').forEach((b) => b.addEventListener('click', () => this.debug(b.dataset.debug)));

    $('#runend-again').addEventListener('click', () => { showOverlay('#overlay-runend', false); this.start(this.chapterId); });
    $('#runend-mastery').addEventListener('click', () => { showOverlay('#overlay-runend', false); this.stop(); this.onExit('mastery'); });
    $('#runend-menu').addEventListener('click', () => { showOverlay('#overlay-runend', false); this.stop(); this.onExit('menu'); });
  }

  debug(action) {
    const run = this.run;
    if (!run || run.over) return;
    switch (action) {
      case 'gold': run.addGold(1000); break;
      case 'kill': for (const e of run.enemies) if (!e.boss) e.dead = true; break;
      case 'skip':
        for (const e of run.enemies) if (!e.boss) e.dead = true;
        run.spawnQueue = [];
        if (run.wave < run.chapter.waves) run.startWave(run.wave + 1);
        break;
      case 'heal': run.tower.hp = run.tower.maxHp; break;
      case 'boss':
        for (const e of run.enemies) e.dead = true;
        run.startWave(run.chapter.waves);
        break;
      case 'lose': run.finish(false); break;
    }
  }

  // ---------------------------------------------------------------------
  // Run-Ende
  // ---------------------------------------------------------------------

  showRunEnd(result) {
    const { save, data } = this.game;
    const unlocked = applyRunResult(save, result, data.chapters.length);
    writeSave(save);
    play(result.victory ? 'victory' : 'defeat');
    const ch = data.chapterIndex[result.chapterId];
    $('#runend-title').textContent = result.victory ? `🏆 ${ch.name} bezwungen!` : '💀 Der Turm ist gefallen';
    const mins = `${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, '0')}`;
    const heroes = result.heroes
      .sort((a, b) => b.damage - a.damage)
      .map((h) => `${escapeHtml(data.heroIndex[h.id].name)} ${'★'.repeat(h.stars)} (${formatNumber(h.damage)})`).join(' · ');
    let extra = '';
    if (unlocked) {
      const next = data.chapterIndex[save.unlockedChapter];
      const packs = data.packs.filter((p) => p.unlockChapter === next.id).map((p) => p.name).join(', ');
      extra = `<p><b>Neu freigeschaltet:</b> Kapitel ${next.id} – ${escapeHtml(next.name)}${packs ? ` und ${escapeHtml(packs)}` : ''}!</p>`;
    }
    $('#runend-body').innerHTML = `
      <div class="result-grid">
        <div>Erreichte Welle<b>${result.wave} / ${ch.waves}</b></div>
        <div>Mastery-Punkte<b>+${result.points}</b></div>
        <div>Besiegte Gegner<b>${result.stats.kills}</b></div>
        <div>Dauer<b>${mins}</b></div>
      </div>
      ${extra}
      <p class="result-heroes">${heroes || 'Keine Helden eingesetzt.'}</p>
      <p class="muted">Du hast jetzt <b>${save.masteryPoints}</b> Mastery-Punkte.</p>`;
    showOverlay('#overlay-runend', true);
  }
}
