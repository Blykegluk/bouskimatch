// Tiny synthesized sound effects (placeholder until real sounds in the polish step).

let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem('bm-muted') === '1';
} catch {
  // Private browsing: just start with sound on.
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(v: boolean): void {
  muted = v;
  try {
    localStorage.setItem('bm-muted', v ? '1' : '0');
  } catch {
    // Nothing to remember it with; the setting lasts for this session only.
  }
}

/** Browsers only allow audio after a user gesture; call this from one. */
export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, endFreq: number, dur: number, vol: number, type: OscillatorType, delay = 0): void {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, delay = 0): void {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + delay;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
}

/** A crowd is just filtered noise that swells and fades. */
function crowd(dur: number, vol: number, freq: number, delay = 0): void {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + delay;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const env = Math.min(1, k * 6) * (1 - k) ** 1.4;
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
}

export const sfx = {
  cheer(): void { crowd(2.2, 0.3, 900); crowd(1.8, 0.18, 1800, 0.1); },
  groan(): void { crowd(1.4, 0.16, 420); },
  ooh(): void { crowd(0.7, 0.1, 600); },
  kick(power: number): void { tone(170 + power * 90, 55, 0.13, 0.2 + power * 0.22, 'triangle'); },
  pass(): void { tone(430, 300, 0.09, 0.14, 'triangle'); },
  bounce(): void { tone(240, 120, 0.07, 0.12, 'sine'); },
  save(): void { tone(320, 90, 0.16, 0.28, 'square'); },
  slide(): void { noise(0.25, 0.14, 1400); },
  stun(): void { tone(180, 70, 0.3, 0.2, 'sawtooth'); [0, 0.12, 0.24].forEach((d, i) => tone(900 - i * 150, 700 - i * 150, 0.08, 0.1, 'sine', d)); },
  pickup(): void { [660, 880, 1170].forEach((f, i) => tone(f, f, 0.1, 0.18, 'sine', i * 0.06)); },
  ready(): void { [523, 784].forEach((f, i) => tone(f, f, 0.14, 0.16, 'triangle', i * 0.09)); },
  cannon(): void { noise(0.45, 0.3, 320); tone(140, 40, 0.4, 0.35, 'sawtooth'); },
  turbo(): void { tone(300, 900, 0.3, 0.16, 'sawtooth'); },
  giant(): void { tone(120, 400, 0.4, 0.22, 'square'); },
  whistle(): void { tone(2100, 2300, 0.18, 0.1, 'sine'); tone(2300, 2100, 0.16, 0.1, 'sine', 0.19); },
  goal(): void { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 0.2, 'square', i * 0.11)); },
  whistleLong(): void { tone(2000, 2200, 0.5, 0.11, 'sine'); },
  conceded(): void { tone(300, 110, 0.5, 0.18, 'sawtooth'); },
  win(): void { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.3, 0.2, 'square', i * 0.13)); },
  lose(): void { [440, 392, 330, 262].forEach((f, i) => tone(f, f, 0.32, 0.18, 'triangle', i * 0.16)); },
  click(): void { tone(700, 500, 0.06, 0.14, 'triangle'); },
};
