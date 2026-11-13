// Tiny synthesized sound effects (placeholder until real sounds in the polish step).

let ctx: AudioContext | null = null;

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
  if (!ctx || ctx.state !== 'running') return;
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

export const sfx = {
  kick(power: number): void { tone(170 + power * 90, 55, 0.13, 0.25 + power * 0.25, 'triangle'); },
  bounce(): void { tone(240, 120, 0.07, 0.12, 'sine'); },
  save(): void { tone(320, 90, 0.16, 0.3, 'square'); },
  slide(): void { tone(500, 140, 0.22, 0.08, 'sawtooth'); },
  goal(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 0.22, 'square', i * 0.11));
  },
  conceded(): void { tone(300, 110, 0.5, 0.2, 'sawtooth'); },
};
