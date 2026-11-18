// Sound- und Musik-Platzhalter über die Web-Audio-API.
// Effekte: kurze synthetische Töne. Musik: ruhige, in Schleife gespielte Melodie.
// Später durch echte Dateien ersetzbar (gleiche Namen in SOUNDS bzw. startMusic()).

let ctx = null;
let sfxGain = null;
let musicGain = null;
let volumes = { music: 0.5, sfx: 0.8 };
let musicTimer = null;

const SOUNDS = {
  click:      [{ f: 660, d: 0.05, type: 'square', v: 0.05 }],
  buy:        [{ f: 520, d: 0.06 }, { f: 780, d: 0.08, at: 0.06 }],
  chest:      [{ f: 180, d: 0.08, type: 'square', v: 0.05 }, { f: 160, d: 0.08, at: 0.12, type: 'square', v: 0.05 }],
  lid:        [{ f: 300, d: 0.1, type: 'triangle' }, { f: 600, d: 0.2, at: 0.08, type: 'triangle' }],
  // Karte umdrehen: je seltener, desto heller und länger
  flip:       [{ f: 420, d: 0.05, type: 'triangle' }],
  flipCommon: [{ f: 440, d: 0.06, type: 'triangle' }],
  flipUncommon: [{ f: 620, d: 0.1, type: 'triangle' }, { f: 780, d: 0.08, at: 0.06, type: 'triangle' }],
  rare:       [{ f: 880, d: 0.12 }, { f: 1320, d: 0.18, at: 0.1 }],
  epic:       [{ f: 660, d: 0.12 }, { f: 990, d: 0.12, at: 0.1 }, { f: 1320, d: 0.25, at: 0.2 }],
  legendary:  [{ f: 523, d: 0.15 }, { f: 659, d: 0.15, at: 0.12 }, { f: 784, d: 0.15, at: 0.24 }, { f: 1047, d: 0.4, at: 0.36 }],
  starUp:     [{ f: 700, d: 0.08 }, { f: 1050, d: 0.15, at: 0.08 }],
  waveStart:  [{ f: 220, d: 0.2, type: 'sawtooth', v: 0.04 }],
  eliteWave:  [{ f: 440, d: 0.15, type: 'square', v: 0.05 }, { f: 330, d: 0.15, at: 0.18, type: 'square', v: 0.05 }, { f: 440, d: 0.15, at: 0.36, type: 'square', v: 0.05 }],
  boss:       [{ f: 110, d: 0.6, type: 'sawtooth', v: 0.07 }, { f: 82, d: 0.8, at: 0.3, type: 'sawtooth', v: 0.07 }],
  bossSkill:  [{ f: 160, d: 0.25, type: 'sawtooth', v: 0.05 }],
  scream:     [{ f: 300, d: 0.5, type: 'sawtooth', v: 0.08, slide: 80 }],
  bell:       [{ f: 988, d: 0.5, type: 'sine', v: 0.06 }],
  spell:      [{ f: 600, d: 0.1, type: 'triangle' }, { f: 900, d: 0.15, at: 0.08, type: 'triangle' }],
  steal:      [{ f: 400, d: 0.1, type: 'square', v: 0.04, slide: 200 }],
  coin:       [{ f: 1200, d: 0.05, type: 'square', v: 0.02 }, { f: 1600, d: 0.06, at: 0.04, type: 'square', v: 0.015 }],
  towerHit:   [{ f: 120, d: 0.12, type: 'square', v: 0.05, slide: 70 }],
  error:      [{ f: 200, d: 0.12, type: 'square', v: 0.04 }],
  keystone:   [{ f: 98, d: 1.2, type: 'sine', v: 0.12 }, { f: 147, d: 1.2, at: 0.05, type: 'sine', v: 0.08 }, { f: 196, d: 1.4, at: 0.3, type: 'triangle', v: 0.06 }, { f: 392, d: 1.0, at: 0.6, type: 'triangle', v: 0.04 }],
  newEnemy:   [{ f: 500, d: 0.08, type: 'triangle' }, { f: 400, d: 0.12, at: 0.1, type: 'triangle' }],
  victory:    [{ f: 523, d: 0.2 }, { f: 659, d: 0.2, at: 0.18 }, { f: 784, d: 0.2, at: 0.36 }, { f: 1047, d: 0.6, at: 0.54 }],
  defeat:     [{ f: 330, d: 0.3, type: 'triangle' }, { f: 247, d: 0.3, at: 0.28, type: 'triangle' }, { f: 165, d: 0.6, at: 0.56, type: 'triangle' }],
  count:      [{ f: 900, d: 0.03, type: 'square', v: 0.03 }],
  packLaunch: [{ f: 260, d: 0.18, type: 'triangle', slide: 520 }],
  packLand:   [{ f: 140, d: 0.08, type: 'square', v: 0.04 }],
  packHit:    [{ f: 380 + 0, d: 0.03, type: 'square', v: 0.02 }],
  packOpen:   [{ f: 300, d: 0.06, type: 'square', v: 0.04 }, { f: 700, d: 0.15, at: 0.05, type: 'triangle' }],
  newCard:    [{ f: 660, d: 0.08, type: 'triangle' }, { f: 990, d: 0.12, at: 0.07, type: 'triangle' }],
  foil:       [{ f: 1320, d: 0.1 }, { f: 1760, d: 0.1, at: 0.08 }, { f: 2093, d: 0.3, at: 0.16 }],
  grenz:      [{ f: 220, d: 0.3, type: 'sawtooth', v: 0.05, slide: 880 }, { f: 1760, d: 0.2, at: 0.25, type: 'square', v: 0.03, slide: 440 }],
  evolve:     [{ f: 392, d: 0.1 }, { f: 523, d: 0.1, at: 0.08 }, { f: 784, d: 0.25, at: 0.16 }],
  tome:       [{ f: 500, d: 0.12, type: 'triangle' }, { f: 750, d: 0.12, at: 0.1, type: 'triangle' }, { f: 1000, d: 0.2, at: 0.2, type: 'sine' }],
  parry:      [{ f: 1800, d: 0.06, type: 'square', v: 0.05 }, { f: 900, d: 0.2, at: 0.04, type: 'triangle' }],
  bolt:       [{ f: 1500, d: 0.08, type: 'sawtooth', v: 0.04, slide: 200 }],
  building:   [{ f: 330, d: 0.08, type: 'triangle' }, { f: 440, d: 0.1, at: 0.08, type: 'triangle' }],
  fanfare:    [{ f: 523, d: 0.14, type: 'square', v: 0.04 }, { f: 659, d: 0.14, at: 0.12, type: 'square', v: 0.04 }, { f: 784, d: 0.14, at: 0.24, type: 'square', v: 0.04 }, { f: 1047, d: 0.5, at: 0.36, type: 'triangle', v: 0.06 }, { f: 784, d: 0.5, at: 0.36, type: 'triangle', v: 0.04 }],
  unlock:     [{ f: 523, d: 0.12 }, { f: 784, d: 0.12, at: 0.1 }, { f: 1047, d: 0.12, at: 0.2 }, { f: 1568, d: 0.4, at: 0.3 }],
};

function ensure() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  sfxGain = ctx.createGain();
  musicGain = ctx.createGain();
  sfxGain.connect(ctx.destination);
  musicGain.connect(ctx.destination);
  applyVolumes();
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  sfxGain.gain.value = volumes.sfx;
  musicGain.gain.value = volumes.music * 0.6;
}

export function setVolumes(music, sfx) {
  volumes = { music, sfx };
  applyVolumes();
}

function tone(n, t0, out) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = n.type || 'sine';
  osc.frequency.setValueAtTime(n.f, t0);
  if (n.slide) osc.frequency.linearRampToValueAtTime(n.slide, t0 + n.d);
  gain.gain.setValueAtTime(n.v ?? 0.06, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + n.d + 0.02);
}

export function play(name) {
  if (!SOUNDS[name] || volumes.sfx <= 0) return;
  try {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    for (const n of SOUNDS[name]) tone(n, now + (n.at || 0), sfxGain);
  } catch { /* Audio nicht verfügbar */ }
}

// ---------------------------------------------------------------------
// Musik-Platzhalter: eigenes Thema pro Kapitel plus schnellere Boss-Variante
// ---------------------------------------------------------------------

const THEMES = {
  menu:     { beat: 0.42, wave: 'triangle', melody: [523, 587, 659, 784, 659, 587, 523, 440, 392, 440, 523, 587, 523, 440, 392, 330], bass: [131, 131, 147, 147, 165, 165, 131, 131] },
  akt1:     { beat: 0.40, wave: 'triangle', melody: [392, 440, 523, 440, 392, 330, 294, 330, 392, 440, 392, 330, 294, 262, 294, 330], bass: [98, 98, 110, 110, 131, 131, 98, 98] },
  akt2:     { beat: 0.46, wave: 'sine',     melody: [330, 0, 392, 330, 294, 0, 262, 294, 330, 0, 349, 330, 294, 262, 247, 0], bass: [82, 82, 87, 87, 98, 98, 82, 82] },
  akt3:     { beat: 0.34, wave: 'square',   melody: [294, 349, 392, 349, 294, 262, 294, 0, 294, 349, 440, 392, 349, 294, 262, 0], bass: [73, 73, 73, 87, 98, 98, 87, 73], v: 0.02 },
  akt4:     { beat: 0.44, wave: 'sine',     melody: [659, 784, 880, 784, 659, 587, 523, 587, 659, 0, 587, 523, 494, 523, 587, 0], bass: [165, 165, 147, 147, 131, 131, 147, 147] },
  boss:     { beat: 0.22, wave: 'square',   melody: [220, 233, 220, 196, 220, 262, 247, 220, 220, 233, 220, 196, 175, 196, 208, 220], bass: [55, 55, 58, 58, 55, 55, 49, 49], v: 0.025 },
};
let currentTheme = null;

/** Startet ein Musikthema (muss nach einer Nutzeraktion aufgerufen werden). */
export function startMusic(theme = 'menu') {
  try {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { return; }
  if (currentTheme === theme && musicTimer) return;
  stopMusic();
  currentTheme = theme;
  const th = THEMES[theme] ?? THEMES.menu;
  let step = 0;
  let next = ctx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    while (next < ctx.currentTime + 0.5) {
      const f = th.melody[step % th.melody.length];
      if (f) tone({ f, d: th.beat * 0.9, type: th.wave, v: th.v ?? 0.035 }, next, musicGain);
      if (step % 2 === 0) tone({ f: th.bass[(step / 2) % th.bass.length], d: th.beat * 1.8, type: 'sine', v: 0.05 }, next, musicGain);
      step++;
      next += th.beat;
    }
  }, 100);
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
  currentTheme = null;
}
