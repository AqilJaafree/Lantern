/**
 * Procedural sound for the vault (Web Audio, no asset files). Silent until unlock()
 * runs inside a user gesture, as browsers require.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let humGain: GainNode | null = null;
let humFilter: BiquadFilterNode | null = null;
let humDetune: OscillatorNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

export function unlock() {
  if (ctx) {
    void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  master.connect(comp);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // Ambient hum: the lantern's "voice". Warm when backed, dissonant when not.
  humFilter = ctx.createBiquadFilter();
  humFilter.type = "lowpass";
  humFilter.frequency.value = 320;
  humFilter.Q.value = 6;
  humGain = ctx.createGain();
  humGain.gain.value = 0;
  humFilter.connect(humGain).connect(master);
  const root = ctx.createOscillator();
  root.type = "sawtooth";
  root.frequency.value = 55;
  humDetune = ctx.createOscillator();
  humDetune.type = "sawtooth";
  humDetune.frequency.value = 82.5;
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 27.5;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.13;
  lfoGain.gain.value = 140;
  lfo.connect(lfoGain).connect(humFilter.frequency);
  for (const o of [root, humDetune, sub]) o.connect(humFilter);
  for (const o of [root, humDetune, sub, lfo]) o.start();
  humGain.gain.setTargetAtTime(0.09, ctx.currentTime, 2.5);
}

export function setMuted(m: boolean) {
  muted = m;
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.08);
}

/** level 0..1 = backing (capped). Below 1 the fifth drifts flat and the filter closes. */
export function setHealth(level: number) {
  if (!ctx || !humDetune || !humFilter) return;
  const t = ctx.currentTime;
  humDetune.frequency.setTargetAtTime(level >= 0.999 ? 82.5 : 77 + level * 4, t, 0.6);
  humFilter.frequency.setTargetAtTime(160 + level * 260, t, 0.6);
}

function out(gain: number, at = 0) {
  const g = ctx!.createGain();
  g.gain.value = 0;
  g.connect(master!);
  return { g, t: ctx!.currentTime + at, peak: gain };
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0) {
  if (!ctx) return;
  const { g, t, peak } = out(gain, at);
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  o.connect(g);
  env(g, t, peak, 0.005, dur);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, gain: number, type: BiquadFilterType, f0: number, f1: number, q = 1, at = 0) {
  if (!ctx || !noiseBuf) return;
  const { g, t, peak } = out(gain, at);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  src.connect(f).connect(g);
  env(g, t, peak, 0.01, dur);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export const sfx = {
  click() {
    tone("square", 1800, 1200, 0.03, 0.04);
  },
  /** A gold bar landing. Pitch varies so a rain of bars doesn't sound mechanical. */
  thud() {
    const p = 0.8 + Math.random() * 0.4;
    tone("sine", 140 * p, 45 * p, 0.18, 0.22);
    tone("triangle", 2400 * p, 1900 * p, 0.06, 0.03);
    noise(0.06, 0.05, "bandpass", 900, 500, 2);
  },
  dissolve() {
    noise(1.1, 0.25, "bandpass", 300, 4500, 3);
    tone("sawtooth", 220, 880, 0.9, 0.05);
  },
  whoosh() {
    noise(0.9, 0.2, "lowpass", 300, 2600, 1);
  },
  laser() {
    tone("sawtooth", 2400, 300, 0.9, 0.09);
    tone("square", 3200, 2800, 0.9, 0.025);
    noise(0.9, 0.08, "highpass", 6000, 3000, 1);
  },
  alarm() {
    for (let i = 0; i < 3; i++) {
      tone("square", 740, 740, 0.16, 0.07, i * 0.36);
      tone("square", 520, 520, 0.16, 0.07, i * 0.36 + 0.18);
    }
  },
  slam() {
    tone("sine", 90, 28, 0.7, 0.5);
    noise(0.5, 0.3, "lowpass", 1200, 80, 1);
  },
  reject() {
    tone("sawtooth", 110, 70, 0.45, 0.16);
    tone("square", 116, 72, 0.45, 0.08);
  },
  beam() {
    tone("sine", 220, 1760, 1.2, 0.08);
    noise(1.2, 0.08, "bandpass", 800, 6000, 6);
  },
  /** Attestation lands: a bell (inharmonic partials) plus a soft sub. */
  chime() {
    for (const [f, g] of [[880, 0.12], [1318.5, 0.07], [1760, 0.05], [2637, 0.03]] as const) tone("sine", f, f * 0.998, 2.2, g);
    tone("sine", 110, 108, 1.4, 0.12);
  },
  mint() {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone("triangle", f, f, 0.35, 0.06, i * 0.06));
  },
  /** A fortune stick lifting under the cursor. */
  tick() {
    tone("triangle", 1500, 950, 0.035, 0.025);
  },
  /** Wooden sign catching on its rope. */
  knock() {
    tone("triangle", 420, 170, 0.09, 0.12);
    noise(0.05, 0.12, "bandpass", 1900, 900, 4);
    tone("sine", 150, 85, 0.2, 0.1);
  },
  enter() {
    tone("sine", 55, 55, 3, 0.18);
    [261.6, 392, 523.3].forEach((f, i) => tone("sine", f, f, 2.6, 0.05, 0.15 + i * 0.12));
    noise(2.4, 0.06, "lowpass", 200, 3000, 1);
  },
};
