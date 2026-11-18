// Kampfbildschirm: Spielschleife, Runenkreis (Maus/Touch), Klicks auf Tomes und Boss-Angriffe,
// Info-Fenster, Neue-Karte-Präsentation, Banner, Boss-Intro, Pause, Ergebnis.
import { $, $$, show, stage, toast, showTip, confirmDialog, escapeHtml } from './dom.js';
import { cardElement } from './cardView.js';
import { showResult } from './result.js';
import { Run } from '../core/run.js';
import { bagItems, consumeBag } from '../core/meta.js';
import { Renderer } from '../render/renderer.js';
import { play, startMusic } from '../audio.js';
import { formatNumber } from '../core/util.js';

export class BattleController {
  constructor(game) {
    this.game = game;
    this.renderer = new Renderer($('#field'), game);
    this.run = null;
    this.paused = false;
    this.presenting = [];
    this.speedIndex = 0;
    this.cursor = { x: 960, y: 560, active: false, fade: 1 };
    this.bind();
  }

  // =====================================================================

  start(opts) {
    const { data, save } = this.game;
    this.opts = opts;
    this.mods = this.game.mods(opts);
    const bag = bagItems(data, save);
    consumeBag(save); // gekaufte Angebote werden im Run verbraucht
    this.game.persist();
    this.run = new Run({
      data, save, chapterId: opts.chapter, mods: this.mods, bag,
      sessionMinutes: (performance.now() - this.game.sessionStart) / 60000,
      settings: { damageNumbers: save.settings.damageNumbers },
      events: (n, p) => this.onEvent(n, p),
    });
    this.paused = false;
    this.presenting = [];
    this.bossIntro = 0;
    this.ending = false;
    this.speedIndex = 0;
    $('#btn-speed').textContent = '1×';
    $('#hud-relics').innerHTML = save.relics.equipped.map((id) => {
      const r = data.relicIndex[id];
      return `<img src="${this.game.bank.iconUrl(r.symbol)}" title="${escapeHtml(r.name + ': ' + r.beschreibung + (r.nachteil ? ' Nachteil: ' + r.nachteil : ''))}" alt="">`;
    }).join('');
    $('#hud-coin-icon').src = this.game.bank.iconUrl('coin');
    show('#debug-panel', this.game.debug);
    $('.boss-track').classList.remove('boss');
    startMusic(`akt${this.run.chapter.akt}`);
    this.firstRuns = save.stats.runs < 3;
    if (this.firstRuns && !save.tutorial.packHint) setTimeout(() => this.tip('Halte deinen Runenkreis über ein Pack, um es zu öffnen!', { x: 860, y: 380 }), 3600);
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.loop(t));
    requestAnimationFrame(() => { const r = stage.rectOf($('#hud-coin-icon')); this.renderer.coinTarget = { x: r.cx, y: r.cy }; });
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = null; }

  timeScale() {
    if (this.paused || this.presenting.length) return 0;
    const run = this.run;
    if (run.over) return 0.35;
    const base = this.game.data.balance.run.geschwindigkeiten[this.speedIndex];
    if (run.slowmo > 0) return base * this.game.data.balance.run.seltenZeitlupeFaktor;
    return base;
  }

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const run = this.run;
    const scaled = dt * this.timeScale();
    // Cursor an den Run übergeben (gesperrt in Pausen)
    const locked = this.paused || this.presenting.length > 0;
    run.setCursor(this.cursor.x, this.cursor.y, this.cursor.active && !locked);
    if (scaled > 0) run.update(scaled);
    else if (run.slowmo > 0) run.slowmo = Math.max(0, run.slowmo - dt);
    this.bossIntro = Math.max(0, this.bossIntro - dt);
    if (!this.cursor.touch) this.cursor.fade = 1;
    else if (!this.cursor.active) this.cursor.fade = Math.max(0, this.cursor.fade - dt * 3);
    this.renderer.draw(run, now / 1000, dt, { bossIntro: this.bossIntro, cursor: this.cursor.fade > 0 ? { ...this.cursor, locked } : null });
    this.hud();
    this.infoHover(dt);
    if (run.over && !this.ending) this.ending = true, this.endSequence();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  hud() {
    const run = this.run;
    $('#hud-coins').textContent = formatNumber(run.coins);
    const track = $('.boss-track');
    if (run.boss && !run.boss.dead) {
      track.classList.add('boss');
      $('#boss-label').textContent = run.boss.name + (run.boss.foil ? ' (Foil)' : '');
      $('#boss-fill').style.width = `${Math.max(0, run.boss.hp / run.boss.maxHp) * 100}%`;
    } else if (!run.bossSpawned) {
      const k = Math.min(1, run.time / run.bossTime);
      $('#boss-label').textContent = run.state === 'countdown' ? 'Bereit machen …' : `Boss in ${Math.ceil(run.bossTime - run.time)} s`;
      $('#boss-fill').style.width = `${k * 100}%`;
    }
  }

  // =====================================================================
  // Ereignisse
  // =====================================================================

  onEvent(name, p) {
    const save = this.game.save;
    switch (name) {
      case 'fightStart': play('packLaunch'); break;
      case 'packOpened': play('packOpen'); if (!save.tutorial.packHint) { save.tutorial.packHint = true; } break;
      case 'newCard':
        if (!save.settings.fastPackOpening) { this.presenting.push(p); if (this.presenting.length === 1) setTimeout(() => this.presentNext(), 650); }
        else toast(`Neu: ${this.game.data.cardIndex[p.id].def.name}`);
        if (this.firstRuns && !save.tutorial.unitHint && this.game.data.cardIndex[p.id].art === 'einheit') {
          save.tutorial.unitHint = true;
          setTimeout(() => this.tip('Deine Helden kämpfen allein.', { x: 860, y: 420 }), 1600);
        }
        if (this.firstRuns && !save.tutorial.tomeHint && this.game.data.cardIndex[p.id].art === 'tome') {
          save.tutorial.tomeHint = true;
          setTimeout(() => this.tip('Klicke das Buch an, um den Zauber zu wirken.', { x: 860, y: 420 }), 1600);
        }
        break;
      case 'rareCard': play(p.rarity === 'legendary' ? 'legendary' : p.rarity === 'epic' ? 'epic' : 'rare'); break;
      case 'foil': play('foil'); break;
      case 'grenzgaenger': play('grenz'); this.banner('Ein Grenzgänger!', 'danger'); break;
      case 'eliteWave': play('eliteWave'); this.banner('Elitewelle!', 'danger'); break;
      case 'bossSpawned':
        play('boss'); startMusic('boss');
        this.bossIntro = 2;
        this.banner(p.enemy.name + (p.enemy.foil ? ' (Foil)' : ''), 'boss');
        break;
      case 'bossWarning': if (p.text) this.banner(p.text, 'danger'); play('bossSkill'); break;
      case 'bossInterrupted': toast('Schrei unterbrochen!'); play('parry'); break;
      case 'hazard': this.banner(p.hazard.text, 'danger'); break;
      case 'evolved': play('evolve'); break;
      case 'tomeUsed': play('tome'); break;
      case 'towerHit': { const n = performance.now(); if (!this.towerSnd || n - this.towerSnd > 220) { play('towerHit'); this.towerSnd = n; } break; }
      case 'coins': { const n = performance.now(); if (!this.coinSnd || n - this.coinSnd > 90) { play('coin'); this.coinSnd = n; } break; } // zusammengefasst
      case 'shake': this.renderer.addShake(p.power); break;
      case 'sound': play(p); break;
    }
  }

  banner(text, kind = '') {
    const b = $('#banner');
    b.textContent = text;
    b.className = `banner ${kind}`;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.add('hidden'), 1650);
  }

  tip(text, at) { showTip(text, at, 'down', 4500); }

  /** Neue Karte groß präsentieren; weiter mit Klick irgendwo. */
  presentNext() {
    const p = this.presenting[0];
    if (!p) return;
    const box = $('#newcard');
    box.innerHTML = '';
    const card = cardElement(p.id, this.game, { foil: p.foil, isNew: true });
    card.classList.add('big');
    box.appendChild(card);
    show('#overlay-newcard', true);
    play('newCard');
  }

  closePresentation() {
    this.presenting.shift();
    if (this.presenting.length) this.presentNext();
    else { show('#overlay-newcard', false); this.last = performance.now(); }
  }

  /** Info-Fenster: 0,6 s still über einer Einheit, einem Monster oder Pack. */
  infoHover(dt) {
    const c = this.cursor;
    const moved = Math.hypot(c.x - (this.lastPos?.x ?? 0), c.y - (this.lastPos?.y ?? 0)) > 4;
    this.lastPos = { x: c.x, y: c.y };
    if (moved || !c.active) { this.still = 0; show('#info-pop', false); return; }
    this.still = (this.still || 0) + dt;
    if (this.still < this.game.data.balance.cursor.infoVerzoegerung || !$('#info-pop').classList.contains('hidden')) return;
    const run = this.run;
    const thing = run.thingAt(c.x, c.y) ?? run.packs.find((p) => p.landed && Math.hypot(p.x - c.x, p.y - 30 - c.y) < 40) ?? null;
    if (!thing) return;
    const pop = $('#info-pop');
    if (thing.kind === 'unit') {
      const d = thing.def;
      pop.innerHTML = `<b>${escapeHtml(d.name)}${thing.foil ? ' ✦' : ''}</b><br>${escapeHtml(d.rolle)} · ❤ ${Math.ceil(thing.hp)}/${Math.round(thing.maxHp)}<br>⚔ ${Math.round(d.werte.schaden)} · Kills ${thing.kills}<br>${escapeHtml(d.beschreibung)}${d.entwicklung && !thing.evolved ? `<br><span class="muted">${escapeHtml(d.entwicklung.text)}</span>` : ''}`;
    } else if (thing.kind === 'enemy') {
      pop.innerHTML = `<b>${escapeHtml(thing.name)}${thing.elite ? ' (Elite)' : ''}${thing.foil ? ' ✦' : ''}</b><br>❤ ${Math.ceil(thing.hp)}/${Math.round(thing.maxHp)} · Rüstung ${thing.ruestung}<br>${escapeHtml(thing.def.beschreibung)}`;
    } else {
      pop.innerHTML = `<b>${escapeHtml(thing.def.name)}</b><br>Widerstand ${Math.ceil(thing.hp)}/${Math.round(thing.maxHp)} · ${thing.def.kartenProPack} Karten`;
    }
    pop.style.left = `${Math.min(1540, c.x + 30)}px`;
    pop.style.top = `${Math.max(90, c.y - 140)}px`;
    show('#info-pop', true);
  }

  async endSequence() {
    const r = this.run.result;
    play(r.sieg ? 'victory' : 'defeat');
    await new Promise((res) => setTimeout(res, r.sieg ? 2000 : 1400));
    stage.fade(() => {
      this.stop();
      showResult(this.game, r, this.mods, this.opts);
    });
  }

  // =====================================================================
  // Eingaben (nur Maus bzw. ein Finger; Tasten sind optionale Abkürzungen)
  // =====================================================================

  bind() {
    const field = $('#field');
    const toStage = (ev) => stage.toStage(ev.clientX, ev.clientY);
    const touchOffset = this.game.data.balance.cursor.touchVersatzY;
    const place = (ev) => {
      const p = toStage(ev);
      const touch = ev.pointerType !== 'mouse';
      this.cursor.touch = touch;
      this.cursor.x = p.x;
      this.cursor.y = p.y + (touch ? touchOffset : 0);
      return p;
    };
    field.addEventListener('pointermove', (ev) => {
      place(ev);
      this.cursor.active = ev.pointerType === 'mouse' || ev.buttons > 0;
      if (this.cursor.active) this.cursor.fade = 1;
    });
    field.addEventListener('pointerdown', (ev) => {
      const p = place(ev);
      this.cursor.active = true; this.cursor.fade = 1;
      if (!this.run || this.paused) return;
      // Klick: Tome öffnen / Hammer parieren (Touch: am Fingerpunkt, nicht am versetzten Kreis)
      this.run.click(p.x, p.y) ?? this.run.click(this.cursor.x, this.cursor.y);
    });
    field.addEventListener('pointerup', (ev) => { if (ev.pointerType !== 'mouse') this.cursor.active = false; });
    field.addEventListener('pointerleave', () => { this.cursor.active = false; });
    $('#overlay-newcard').addEventListener('pointerdown', () => this.closePresentation());

    $('#btn-speed').addEventListener('click', () => {
      const sp = this.game.data.balance.run.geschwindigkeiten;
      this.speedIndex = (this.speedIndex + 1) % sp.length;
      $('#btn-speed').textContent = `${sp[this.speedIndex]}×`;
    });
    $('#btn-pause').addEventListener('click', () => this.pause(true));
    $('#pause-resume').addEventListener('click', () => this.pause(false));
    $('#pause-settings').addEventListener('click', () => this.game.goto('settings', { back: 'battle' }));
    $('#pause-end').addEventListener('click', async () => {
      if (!(await confirmDialog('Run jetzt beenden? Alle bisherigen Belohnungen bleiben erhalten.', 'Beenden', 'Weiterspielen'))) return;
      show('#overlay-pause', false);
      this.paused = false;
      this.run.finish(false);
    });
    window.addEventListener('keydown', (ev) => {
      if (!this.run || !$('#screen-battle').classList.contains('active')) return;
      if (ev.key === ' ') { ev.preventDefault(); this.pause(!this.paused); }
    });
    $$('[data-debug]').forEach((b) => b.addEventListener('click', () => this.debug(b.dataset.debug)));
  }

  pause(on) {
    if (!this.run || this.run.over) return;
    this.paused = on;
    show('#overlay-pause', on);
    this.last = performance.now();
  }

  debug(a) {
    const run = this.run;
    if (!run || run.over) return;
    if (a === 'coins') run.coins += 500;
    if (a === 'time') run.update(this.game.data.balance.debug.zeitVorspulenSekunden);
    if (a === 'boss') { run.time = Math.max(run.time, run.bossTime); run.state = 'fight'; }
    if (a === 'pack') run.launchPack('silberpack');
    if (a === 'end') run.finish(false);
  }
}
