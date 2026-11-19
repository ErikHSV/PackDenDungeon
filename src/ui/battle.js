// Kampfbildschirm: Spielschleife, Runenkreis (Maus/Touch), Klicks auf Tomes und Boss-Angriffe,
// Info-Fenster, Neue-Karte-Präsentation, Banner, Boss-Intro, Pause, Ergebnis.
import { $, $$, show, stage, toast, showTip, confirmDialog, escapeHtml } from './dom.js';
import { cardElement } from './cardView.js';
import { showResult } from './result.js';
import { NewCardReveal, showUnlocks } from './reveal.js';
import { Run } from '../core/run.js';
import { bagItems, consumeBag, masteryFor, levelOf, nodeVisible, questProgress, questChapters, chapterUnlocked } from '../core/meta.js';
import { worldOf } from '../render/arena.js';
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
    this.reveal = new NewCardReveal(game, () => this.closePresentation());
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
    const fastFrom = this.game.data.chapters.find((c) => c.art === 'kapitel' && this.game.data.actIndex[c.akt].kapitel.indexOf(c.id) + 1 + (c.akt - 1) * 3 === (this.game.data.balance.run.zweifachAbKapitel ?? 2));
    this.fastUnlocked = !fastFrom || chapterUnlocked(fastFrom, save, this.game.data);
    // Gewähltes Tempo bleibt über Runs erhalten (2× erst ab Kapitel 2)
    const sp = this.game.data.balance.run.geschwindigkeiten;
    this.speedIndex = Math.max(0, sp.indexOf(save.settings.tempo ?? 1));
    if (!this.speedAllowed(sp[this.speedIndex])) this.speedIndex = sp.indexOf(1.5) >= 0 && this.speedAllowed(1.5) ? sp.indexOf(1.5) : 0;
    this.renderSpeed();
    this.renderer.eliteWarn = null;
    this.renderer.huntWarn = null;
    this.renderer.bossWarn = 0;
    $('#hud-progress').classList.remove('blink');
    this.setupHud();
    startMusic(`akt${this.run.chapter.akt}`);
    this.firstRuns = save.stats.runs < 3;
    if (this.firstRuns && !save.tutorial.packHint) setTimeout(() => this.tip('Halte deinen Runenkreis über ein Pack, um es zu öffnen!', { x: 860, y: 380 }), 3600);
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = null; }

  speedAllowed(v) { return v < 2 || this.fastUnlocked; }

  /** Tempo-Knöpfe 1× / 1,5× / 2× oben rechts. */
  renderSpeed() {
    const sp = this.game.data.balance.run.geschwindigkeiten;
    const fmt = (v) => `${String(v).replace('.', ',')}×`;
    $('#hud-speed').innerHTML = sp.map((v, i) => `<button data-speed="${i}" class="${i === this.speedIndex ? 'on' : ''}${this.speedAllowed(v) ? '' : ' locked'}" title="${this.speedAllowed(v) ? `Tempo ${fmt(v)}` : `Tempo ${fmt(v)} wird mit Kapitel 2 freigeschaltet.`}">${fmt(v)}</button>`).join('');
  }

  setSpeed(i) {
    const sp = this.game.data.balance.run.geschwindigkeiten;
    if (!this.speedAllowed(sp[i])) { play('error'); toast(`Tempo ${String(sp[i]).replace('.', ',')}× wird mit Kapitel 2 freigeschaltet.`, true); return; }
    this.speedIndex = i;
    this.game.save.settings.tempo = sp[i];
    this.game.persist();
    play('click');
    this.renderSpeed();
  }

  timeScale() {
    if (this.paused || this.presenting.length || !$('#overlay-unlock').classList.contains('hidden')) return 0;
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
    if (run.over && !this.ending) this.ending = true, this.endSequence();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  /** HUD einrichten (14.5): Relikt-Spalte, Run-Zähler mit Gebiets-Kristall, Multiplikator, Quest-Anzeige. */
  setupHud() {
    const { data, save, bank } = this.game;
    const run = this.run;
    const box = $('#hud-relics');
    box.innerHTML = save.relics.equipped.map((id) => {
      const r = data.relicIndex[id];
      return `<div data-relic="${id}" class="${r.verflucht ? 'cursed' : ''}"><img src="${bank.iconUrl(r.symbol)}" alt=""></div>`;
    }).join('');
    $$('[data-relic]', box).forEach((d) => {
      d.addEventListener('pointerenter', () => {
        const r = data.relicIndex[d.dataset.relic];
        const tip = $('#relic-tip');
        tip.innerHTML = `<b>${escapeHtml(r.name)}</b><br>${escapeHtml(r.beschreibung)}${r.nachteil ? `<br><span style="color:#ff7aa8">${escapeHtml(r.nachteil)}</span>` : ''}`;
        tip.style.top = `${stage.rectOf(d).y - 4}px`;
        show('#relic-tip', true);
      });
      d.addEventListener('pointerleave', () => show('#relic-tip', false));
    });
    $('#hud-mastery-icon').src = bank.iconUrl('mastery'); // Mastery = blauer Kristall (einzige Run-Währung)
    // Multiplikator und Herkunft (Prestige, Modifikator, Sternenkarte, Kapitel)
    const m = this.mods;
    const kapitelMul = run.chapter.wellen.muenzenMul ?? 1;
    const parts = [];
    if (m.prestige) parts.push(['crown', m.prestige.belohnungMul]);
    if (m.modifierMastery !== 1) parts.push(['skull', m.modifierMastery]);
    if (m.masteryMul !== 1) parts.push(['mastery', m.masteryMul]);
    if (kapitelMul !== 1) parts.push(['tower', kapitelMul]);
    const total = parts.reduce((a, [, v]) => a * v, 1);
    $('#hud-mult').innerHTML = `${Math.round(total * 100)} % ${parts.map(([ic]) => `<img src="${bank.iconUrl(ic)}" alt="">`).join('')}`;
    show('#hud-mult', Math.abs(total - 1) > 0.001);
    this.questRows = this.chapterQuests();
    show('#hud-quests', this.questRows.length > 0);
    show('#hud-bossbar', false);
    show('#hud-shimmer', false);
    this.shimmerSum = 0;
    show('#relic-tip', false);
    this.lastHud = {};
    show('#debug-panel', this.game.debug);
  }

  /** Bis zu drei offene, im Skill-Tree sichtbare Quests, die im aktuellen Kapitel Fortschritt machen können. */
  chapterQuests() {
    const { data, save, bank } = this.game;
    const run = this.run;
    const ch = run.chapter;
    const packsHere = new Set(run.bag.flatMap((b) => { const p = data.packIndex[b]; return p ? [b, p.inhalt?.pack].filter(Boolean) : []; }));
    for (const b of run.buildings) { packsHere.add(b.def.pack); if (b.def.kiste) packsHere.add(data.packIndex[b.def.kiste]?.inhalt?.pack); }
    const rows = [];
    for (const n of data.starmap.knoten) {
      if (n.typ !== 'quest' || levelOf(save, n.id) > 0 || !nodeVisible('skill', n, save, data)) continue;
      const p = questProgress(n, data, save);
      if (p.done) continue;
      const chs = questChapters(n, data);
      if (chs && !chs.includes(ch.id)) continue;
      const a = n.aufgabe, f = a.filter || {};
      if (a.statistik === 'packsGeoeffnet' && f.pack && !packsHere.has(f.pack)) continue;
      if (a.statistik === 'killsEinheit' && !run.units.some((u) => u.id === f.einheit) && !data.packs.some((pk) => pk.pool?.includes(f.einheit) && packsHere.has(pk.id)) && f.einheit !== 'skelettkrieger' && data.unitIndex[f.einheit]?.rarity !== 'grenzgaenger') continue;
      if (a.statistik === 'kartenGefunden' && !data.packs.some((pk) => pk.pool?.includes(f.karte) && packsHere.has(pk.id)) && !run.bag.includes(`karte:${f.karte}`)) continue;
      let icon = bank.iconUrl('quest');
      if (a.statistik === 'killsGegner') icon = bank.enemyUrl(f.gegner);
      else if (a.statistik === 'bossBesiegt') icon = bank.enemyUrl(f.boss ?? ch.boss);
      else if (a.statistik === 'packsGeoeffnet') icon = bank.shopItemUrl(f.pack ?? 'holzpack');
      else if (a.statistik === 'kartenGefunden') icon = bank.cardUrl(f.karte);
      else if (a.statistik === 'killsEinheit') icon = bank.unitUrl(f.einheit);
      else if (a.statistik === 'foilMonsterBesiegt') icon = bank.iconUrl('crystal_regen');
      else if (a.statistik === 'kills') icon = bank.iconUrl('skull');
      else if (a.statistik === 'ueberleben') icon = bank.iconUrl('tower');
      rows.push({ n, icon });
      if (rows.length >= 3) break;
    }
    return rows;
  }

  hud() {
    const run = this.run;
    const { data } = this.game;
    // Fortschritt bis zum Boss bzw. Boss-Lebensleiste
    if (run.boss && !run.boss.dead) {
      show('#hud-bossbar', true);
      $('#bb-name').textContent = run.boss.name + (run.boss.foil ? ' ✦' : '');
      $('#bb-fill').style.width = `${Math.max(0, run.boss.hp / run.boss.maxHp) * 100}%`;
      $('.bb-track').style.setProperty('--seg', `${100 / data.balance.wellen.boss.abschnitte}%`);
      $('#hud-progress').style.opacity = 0;
    } else {
      show('#hud-bossbar', false);
      $('#hud-progress').style.opacity = 1;
      $('#hud-progress-fill').style.width = `${Math.min(1, run.time / run.bossTime) * 100}%`;
    }
    // Run-Zähler: in diesem Run gesammelte Mastery (Shiny-Monster zählen dreifach)
    const mp = Math.max(0, masteryFor({ zeit: run.time, kills: run.stats.killWert, elitewellen: run.stats.elitewellen, sieg: !!run.result?.sieg, kapitel: run.chapter.id, packs: Object.values(run.stats.packsGeoeffnet).reduce((x, y) => x + y, 0) }, data, this.mods) + run.stats.bonusMastery);
    if (mp !== this.lastHud.mp) { $('#hud-mastery').textContent = formatNumber(mp); this.lastHud.mp = mp; }
    // Quests live: gespeicherter Fortschritt + Werte des laufenden Runs
    if (this.questRows.length) {
      const live = {
        kapitel: run.chapter.id, packsGeoeffnet: run.stats.packsGeoeffnet, kills: run.stats.kills, killsNachArt: run.stats.killsNachArt, killsEinheit: run.stats.killsEinheit,
        gezogen: run.stats.gezogen, zeit: run.time, foilMonster: run.stats.foilMonster, sieg: !!run.result?.sieg, boss: run.chapter.boss, tomesGenutzt: run.stats.tomesGenutzt,
      };
      const html = this.questRows.map((r) => {
        const p = questProgress(r.n, data, this.game.save, live);
        const text = r.n.beschreibung.replace(/ \(.*\)/, '').replace(/\.$/, '');
        const val = r.n.aufgabe.statistik === 'ueberleben' ? `${Math.floor(p.value / 60)}:${String(p.value % 60).padStart(2, '0')}/${Math.floor(p.target / 60)}:${String(p.target % 60).padStart(2, '0')}` : `${formatNumber(p.value)}/${formatNumber(p.target)}`;
        return `<div class="hq${p.done ? ' done' : ''}"><img src="${r.icon}" alt=""><span>${escapeHtml(text.toUpperCase())}</span><b>${val}</b></div>`;
      }).join('');
      if (html !== this.lastHud.q) { $('#hud-quests').innerHTML = html; this.lastHud.q = html; }
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
      case 'schimmer': {
        // Kristall braucht ca. 0,9 s bis zum Zähler; dann kurz „+n ◆“ in Regenbogenfarbe
        setTimeout(() => {
          this.shimmerSum = (this.shimmerSum || 0) + p.amount;
          const el = $('#hud-shimmer');
          el.innerHTML = `+${this.shimmerSum} <img src="${this.game.bank.iconUrl('crystal_regen')}" alt="">`;
          show('#hud-shimmer', true);
          el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
          play('foil');
          clearTimeout(this.shimmerT);
          this.shimmerT = setTimeout(() => { show('#hud-shimmer', false); this.shimmerSum = 0; }, 1600);
        }, 850);
        break;
      }
      case 'grenzgaenger': play('grenz'); this.banner('Ein Grenzgänger!', 'danger'); break;
      case 'eliteWarning': play('eliteWave'); this.renderer.eliteWarn = { ...p.point, t: this.game.data.balance.wellen.elite.warnung }; break;
      case 'eliteWave': this.banner('Elitegruppe!', 'danger'); break;
      case 'bossWarnung': {
        // 5 s vor dem Boss: Rand pulsiert rot, tiefer Trommelschlag, Fortschrittsbalken blinkt
        show('#boss-warn', true);
        $('#hud-progress').classList.add('blink');
        let n = 0;
        const drum = () => { if (!this.run || this.run.bossSpawned || this.run.over || n++ >= 5) return; if (!this.paused) play('trommel'); setTimeout(drum, 1000); };
        drum();
        break;
      }
      case 'bossSegment': play('starUp'); break;
      case 'huntWarning': play('horn'); this.renderer.huntWarn = { ...p.point, t: this.run.chapter.reliktJagd?.ankuendigung ?? 3 }; this.banner('RELIKT-JAGD!', 'gold'); break;
      case 'huntWon': play('unlock'); this.banner('Schatzträger besiegt! Öffne das Schatzpack!', 'gold'); break;
      case 'huntLost': play('error'); this.banner('Der Schatz ist entkommen …', 'danger'); break;
      case 'treasureOpened':
        play('fanfare');
        if (p.relic) showUnlocks([{ title: 'NEUES RELIKT!', name: `${p.relic.name}: ${p.relic.beschreibung} (ab dem nächsten Run im Reiter RELIKTE)`, img: this.game.bank.iconUrl(p.relic.symbol), w: 180, h: 180 }]);
        else this.banner('Alle Relikte gefunden – Schimmer!', 'gold');
        break;
      case 'bossSpawned':
        show('#boss-warn', false);
        $('#hud-progress').classList.remove('blink');
        play('boss'); startMusic('boss');
        this.bossIntro = 2;
        this.banner(p.enemy.name + (p.enemy.foil ? ' (Shiny)' : ''), 'boss');
        break;
      case 'bossWarning': if (p.text) this.banner(p.text, 'danger'); play('bossSkill'); break;
      case 'bossInterrupted': toast('Schrei unterbrochen!'); play('parry'); break;
      case 'hazard': this.banner(p.hazard.text, 'danger'); break;
      case 'evolved': play('evolve'); break;
      case 'tomeUsed': play('tome'); break;
      case 'towerHit': { const n = performance.now(); if (!this.towerSnd || n - this.towerSnd > 220) { play('towerHit'); this.towerSnd = n; } break; }
      case 'coins': { const n = performance.now(); if (!this.coinSnd || n - this.coinSnd > 90) { play('coin'); this.coinSnd = n; } break; } // zusammengefasst
      case 'shake': this.renderer.addShake(p.power); break;
      case 'relicTriggered': { const d = $(`#hud-relics [data-relic="${p.id}"]`); if (d) { d.classList.remove('flash'); void d.offsetWidth; d.classList.add('flash'); } break; }
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

  /** Neue Karte groß präsentieren (14.6); weiter mit Klick irgendwo oder Escape. */
  presentNext() {
    const p = this.presenting[0];
    if (!p) return;
    this.reveal.open(p.id, p.foil);
    $('#nc-sheen').style.setProperty('--fig', `url(${$('#nc-fig').src})`);
  }

  closePresentation() {
    this.presenting.shift();
    if (this.presenting.length) this.presentNext();
    else this.last = performance.now();
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

  /**
   * Ende (5.8): Niederlage = Zeitlupe, Turm zerbricht (≈ 2,2 s); Sieg = Boss explodiert, Monster lösen sich auf,
   * Goldregen (≈ 2,5 s); Abbruch über das Pause-Menü = sofort zum Ergebnis. Danach Abblenden (0,4 s).
   */
  async endSequence() {
    const r = this.run.result;
    show('#boss-warn', false);
    if (this.aborted) { this.aborted = false; this.stop(); showResult(this.game, r, this.mods, this.opts); return; }
    play(r.sieg ? 'victory' : 'defeat');
    await new Promise((res) => setTimeout(res, r.sieg ? 2500 : 2200));
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

    $('#hud-speed').addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      const b = ev.target.closest('button[data-speed]');
      if (b) this.setSpeed(Number(b.dataset.speed));
    });
    $('#btn-pause').addEventListener('click', () => this.pause(true));
    $('#pause-resume').addEventListener('click', () => this.pause(false));
    $('#pause-settings').addEventListener('click', () => this.game.goto('settings', { back: 'battle' }));
    $('#pause-end').addEventListener('click', async () => {
      if (!(await confirmDialog('Run jetzt beenden? Alle bisherigen Belohnungen bleiben erhalten.', 'Beenden', 'Weiterspielen'))) return;
      show('#overlay-pause', false);
      this.paused = false;
      this.aborted = true;
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
    if (a === 'shiny') { const id = run.chapter.gegner[0].id; run.spawnEnemy(id, { foil: true }); }
    if (a === 'time') run.update(this.game.data.balance.debug.zeitVorspulenSekunden);
    if (a === 'boss') { run.time = Math.max(run.time, run.bossTime); run.state = 'fight'; }
    if (a === 'pack') run.launchPack('silberpack');
    if (a === 'end') run.finish(false);
  }
}
