import type { ReelEvents } from './scene';

const RATE = 44100;

/**
 * Original soundtrack synthesized in the browser. Nothing here is a
 * recording or a licensed sample: drums, bass, and hits are oscillators
 * and noise buffers.
 */
export async function renderReelAudio(
  duration: number,
  events: ReelEvents,
  volume: number,
): Promise<AudioBuffer> {
  const seconds = Math.max(0.5, duration);
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume)) * 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.15;
  master.connect(comp).connect(ctx.destination);

  scheduleBed(ctx, master, seconds);
  blip(ctx, master, events.hook, 520, 0.18, 'sine', 0.12);
  for (let i = 0; i < events.countdown.length; i++) {
    blip(ctx, master, events.countdown[i], 480 + i * 90, 0.12, 'triangle', 0.16);
  }
  for (const time of events.colorChanges) {
    blip(ctx, master, time, 740, 0.07, 'sine', 0.05);
  }
  finishHit(ctx, master, events.finish);
  return ctx.startRendering();
}

function scheduleBed(ctx: BaseAudioContext, out: AudioNode, duration: number): void {
  const bpm = 108;
  const beat = 60 / bpm;
  const beats = Math.floor(duration / beat);
  for (let i = 0; i < beats; i++) {
    const t = i * beat;
    kick(ctx, out, t);
    if (i % 2 === 0) hat(ctx, out, t + beat * 0.5);
    hat(ctx, out, t + beat * 0.5);
    bass(ctx, out, t, i % 4 === 0 ? 55 : i % 4 === 2 ? 73 : 65);
    if (i % 2 === 0) chord(ctx, out, t, i % 8 < 4 ? 0 : i % 8 < 6 ? 5 : 7);
  }
}

function kick(ctx: BaseAudioContext, out: AudioNode, time: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(48, time + 0.09);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.55, time + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
  osc.connect(g).connect(out);
  osc.start(time);
  osc.stop(time + 0.18);
}

function hat(ctx: BaseAudioContext, out: AudioNode, time: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, 0.04);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.07, time + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
  src.connect(filter).connect(g).connect(out);
  src.start(time);
  src.stop(time + 0.05);
}

function bass(ctx: BaseAudioContext, out: AudioNode, time: number, freq: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.2, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
  osc.connect(g).connect(out);
  osc.start(time);
  osc.stop(time + 0.2);
}

function chord(ctx: BaseAudioContext, out: AudioNode, time: number, semi: number): void {
  const root = 196 * 2 ** (semi / 12);
  for (const mul of [1, 1.25, 1.5]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = root * mul;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.035, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
    osc.connect(g).connect(out);
    osc.start(time);
    osc.stop(time + 0.3);
  }
}

function blip(
  ctx: BaseAudioContext,
  out: AudioNode,
  time: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  peak: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.4, time + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(peak, time + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(g).connect(out);
  osc.start(time);
  osc.stop(time + dur + 0.02);
}

function finishHit(ctx: BaseAudioContext, out: AudioNode, time: number): void {
  for (const freq of [262, 330, 392, 523]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.12, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.7);
    osc.connect(g).connect(out);
    osc.start(time);
    osc.stop(time + 0.75);
  }
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, 0.25);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(400, time);
  filter.frequency.exponentialRampToValueAtTime(2400, time + 0.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.12, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
  src.connect(filter).connect(g).connect(out);
  src.start(time);
  src.stop(time + 0.3);
}

function noise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.ceil(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    data[i] = s / 4294967296 * 2 - 1;
  }
  return buf;
}
