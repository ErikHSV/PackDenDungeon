// Sound-Platzhalter: kurze synthetische Töne über die Web-Audio-API.
// Später einfach durch echte Sounddateien ersetzbar (gleiche Namen in SOUNDS).

let ctx = null;
let enabled = true;

const SOUNDS = {
  click:      [{ f: 660, d: 0.05, type: 'square', v: 0.05 }],
  buy:        [{ f: 520, d: 0.06 }, { f: 780, d: 0.08, at: 0.06 }],
  flip:       [{ f: 420, d: 0.05, type: 'triangle' }],
  rare:       [{ f: 880, d: 0.12 }, { f: 1320, d: 0.18, at: 0.1 }],
  epic:       [{ f: 660, d: 0.12 }, { f: 990, d: 0.12, at: 0.1 }, { f: 1320, d: 0.25, at: 0.2 }],
  legendary:  [{ f: 523, d: 0.15 }, { f: 659, d: 0.15, at: 0.12 }, { f: 784, d: 0.15, at: 0.24 }, { f: 1047, d: 0.4, at: 0.36 }],
  starUp:     [{ f: 700, d: 0.08 }, { f: 1050, d: 0.15, at: 0.08 }],
  waveStart:  [{ f: 220, d: 0.2, type: 'sawtooth', v: 0.04 }],
  boss:       [{ f: 110, d: 0.6, type: 'sawtooth', v: 0.07 }, { f: 82, d: 0.8, at: 0.3, type: 'sawtooth', v: 0.07 }],
  bossSkill:  [{ f: 160, d: 0.25, type: 'sawtooth', v: 0.05 }],
  scream:     [{ f: 300, d: 0.5, type: 'sawtooth', v: 0.08, slide: 80 }],
  bell:       [{ f: 988, d: 0.5, type: 'sine', v: 0.06 }],
  spell:      [{ f: 600, d: 0.1, type: 'triangle' }, { f: 900, d: 0.15, at: 0.08, type: 'triangle' }],
  steal:      [{ f: 400, d: 0.1, type: 'square', v: 0.04, slide: 200 }],
  victory:    [{ f: 523, d: 0.2 }, { f: 659, d: 0.2, at: 0.18 }, { f: 784, d: 0.2, at: 0.36 }, { f: 1047, d: 0.6, at: 0.54 }],
  defeat:     [{ f: 330, d: 0.3, type: 'triangle' }, { f: 247, d: 0.3, at: 0.28, type: 'triangle' }, { f: 165, d: 0.6, at: 0.56, type: 'triangle' }],
};

export function setSoundEnabled(on) { enabled = on; }

export function play(name) {
  if (!enabled || !SOUNDS[name]) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    for (const n of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = now + (n.at || 0);
      osc.type = n.type || 'sine';
      osc.frequency.setValueAtTime(n.f, t0);
      if (n.slide) osc.frequency.linearRampToValueAtTime(n.slide, t0 + n.d);
      gain.gain.setValueAtTime(n.v ?? 0.06, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + n.d + 0.02);
    }
  } catch { /* Audio nicht verfügbar */ }
}
