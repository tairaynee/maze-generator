import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny';
import { REEL_H, REEL_W } from './scene';

export const REEL_FPS = 30;

export interface EncodeResult {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
  poster: string;
  /** Short description of what was actually written. */
  label: string;
}

const BITRATE = 8_000_000;
const AAC_BITRATE = 128_000;

/**
 * AAC-LC in an MP4 is what Chrome, Safari, QuickTime, and Instagram all play.
 * Opus (or MP3) inside an MP4 is a common reason a file looks silent.
 */
const AAC_PROBE = {
  numberOfChannels: 2,
  sampleRate: 44100,
  bitrate: AAC_BITRATE,
  fullCodecString: 'mp4a.40.2',
} as const;

class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

const AAC_FAILED =
  'Could not save an MP4 with AAC audio, so nothing was downloaded. A silent file, or one with Opus audio, looks broken in Chrome, Safari, QuickTime, and Instagram.';

function quality(): Quality {
  return new Quality({ bitrate: BITRATE, bitrateMode: 'variable' });
}

let wasmAac: Promise<void> | null = null;

function registerWasmAac(): Promise<void> {
  if (!wasmAac) {
    wasmAac = import('@mediabunny/aac-encoder').then(({ registerAacEncoder }) => {
      registerAacEncoder();
    });
  }
  return wasmAac;
}

/** Prefer the browser's AAC encoder. Otherwise use the bundled AAC-LC encoder. */
async function ensureAacEncoder(forceWasm: boolean): Promise<void> {
  if (forceWasm) {
    await registerWasmAac();
    return;
  }
  const native = await canEncodeAudio('aac', AAC_PROBE).catch(() => false);
  if (!native) await registerWasmAac();
}

function soundtrackAudible(audio: AudioBuffer): boolean {
  const step = 32;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < data.length; i += step) {
      const s = data[i];
      sum += s * s;
      n++;
    }
  }
  return n > 0 && Math.sqrt(sum / n) > 0.002;
}

function rateLabel(rate: number): string {
  if (rate === 44100) return '44.1 kHz';
  if (rate === 48000) return '48 kHz';
  if (rate % 1000 === 0) return `${rate / 1000} kHz`;
  return `${Math.round(rate)} Hz`;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

async function supports(codec: VideoCodec): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    return await canEncodeVideo(codec, {
      width: REEL_W,
      height: REEL_H,
      quality: quality(),
      frameRate: REEL_FPS,
    });
  } catch {
    return false;
  }
}

export async function encodeReel(
  draw: (ctx: CanvasRenderingContext2D, t: number) => void,
  duration: number,
  preview: HTMLCanvasElement | null,
  onProgress: (frame: number, total: number) => void,
  signal?: AbortSignal,
  audio?: AudioBuffer | null,
): Promise<EncodeResult> {
  const soundtrack = audio ?? null;
  if (soundtrack && !soundtrackAudible(soundtrack)) {
    throw new ExportError('The soundtrack was silent, so the video was not saved.');
  }
  if (soundtrack) {
    let last: unknown;
    const h264 = await supports('avc');
    if (h264) {
      for (let attempt = 0; attempt < 2; attempt++) {
        await ensureAacEncoder(attempt > 0);
        try {
          return await encodeWebCodecs(
            'mp4',
            'avc',
            draw,
            duration,
            preview,
            onProgress,
            signal,
            soundtrack,
          );
        } catch (err) {
          if (isAbort(err)) throw err;
          last = err;
        }
      }
    }
    if (last instanceof ExportError) throw last;
    const detail = last instanceof Error ? ` ${last.message}` : '';
    throw new ExportError(
      h264
        ? `${AAC_FAILED}${detail}`
        : `${AAC_FAILED} This browser cannot encode H.264 video.`,
    );
  }
  if (await supports('avc')) {
    try {
      return await encodeWebCodecs('mp4', 'avc', draw, duration, preview, onProgress, signal, null);
    } catch (err) {
      if (isAbort(err)) throw err;
      console.warn('H.264 encode failed, trying WebM', err);
    }
  }
  for (const codec of ['vp9', 'vp8'] as const) {
    if (await supports(codec)) {
      try {
        return await encodeWebCodecs('webm', codec, draw, duration, preview, onProgress, signal, null);
      } catch (err) {
        if (isAbort(err)) throw err;
        console.warn(`${codec} encode failed`, err);
      }
    }
  }
  return encodeMediaRecorder(draw, duration, preview, onProgress, signal);
}

async function encodeWebCodecs(
  kind: 'mp4' | 'webm',
  codec: VideoCodec,
  draw: (ctx: CanvasRenderingContext2D, t: number) => void,
  duration: number,
  preview: HTMLCanvasElement | null,
  onProgress: (frame: number, total: number) => void,
  signal?: AbortSignal,
  audio?: AudioBuffer | null,
): Promise<EncodeResult> {
  const canvas = document.createElement('canvas');
  canvas.width = REEL_W;
  canvas.height = REEL_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create a canvas.');

  const target = new BufferTarget();
  const output = new Output({
    format:
      kind === 'mp4'
        ? new Mp4OutputFormat({ fastStart: 'in-memory' })
        : new WebMOutputFormat(),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec,
    quality: quality(),
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source);
  let audioSource: AudioBufferSource | null = null;
  if (audio) {
    if (kind !== 'mp4') {
      throw new ExportError(AAC_FAILED);
    }
    audioSource = new AudioBufferSource({
      codec: 'aac' satisfies AudioCodec,
      bitrate: AAC_BITRATE,
      fullCodecString: 'mp4a.40.2',
    });
    output.addAudioTrack(audioSource);
  }
  await output.start();

  const total = Math.max(1, Math.round(duration * REEL_FPS));
  const frameDur = 1 / REEL_FPS;
  const previewCtx = preview?.getContext('2d') ?? null;
  try {
    if (audioSource && audio) await audioSource.add(audio);
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        await output.cancel();
        throw new DOMException('Cancelled', 'AbortError');
      }
      const t = i === total - 1 ? duration : i / REEL_FPS;
      draw(ctx, t);
      if (previewCtx) previewCtx.drawImage(canvas, 0, 0);
      await source.add(i / REEL_FPS, frameDur, { keyFrame: i % (REEL_FPS * 2) === 0 });
      if (i % 6 === 0 || i === total - 1) onProgress(i + 1, total);
    }
    await output.finalize();
  } catch (err) {
    if (output.state !== 'finalized' && output.state !== 'canceled') {
      try {
        await output.cancel();
      } catch {
        /* already torn down */
      }
    }
    throw err;
  }

  if (!target.buffer?.byteLength) throw new Error('Encoder produced an empty file.');
  const poster = canvas.toDataURL('image/jpeg', 0.72);
  const mimeType = kind === 'mp4' ? 'video/mp4' : 'video/webm';
  const blob = new Blob([target.buffer], { type: mimeType });
  const label =
    kind === 'mp4'
      ? await describeMp4(blob, duration, Boolean(audio))
      : `WebM · ${codec.toUpperCase()} · silent`;
  return { blob, mimeType, extension: kind, poster, label };
}

/** Read the file back and refuse anything Instagram or QuickTime would treat as silent. */
async function describeMp4(blob: Blob, duration: number, withAudio: boolean): Promise<string> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  try {
    const video = await input.getPrimaryVideoTrack();
    const videoCodec = video ? await video.getCodec() : null;
    const videoName = videoCodec === 'avc' ? 'H.264' : (videoCodec ?? 'video').toUpperCase();
    if (!withAudio) return `MP4 · ${videoName} · silent`;
    const track = await input.getPrimaryAudioTrack();
    if (!track) {
      throw new ExportError('The encoder wrote a silent MP4, so the file was not saved.');
    }
    const codec = await track.getCodec();
    const param = (await track.getCodecParameterString()) ?? '';
    const rate = await track.getSampleRate();
    const channels = await track.getNumberOfChannels();
    const audioDuration = await input.computeDuration([track]);
    const aacLc = codec === 'aac' && (param === '' || param.includes('mp4a.40.2'));
    if (!aacLc) {
      const found = param || codec || 'missing';
      throw new ExportError(
        `The MP4 audio is ${found}, which Safari, QuickTime, and Instagram usually ignore. The file was not saved.`,
      );
    }
    if (!(audioDuration > Math.min(duration, 1) * 0.5)) {
      throw new ExportError('The audio track is empty, so the file was not saved.');
    }
    const ch = channels === 2 ? 'stereo' : channels === 1 ? 'mono' : `${channels} ch`;
    const coded = param.includes('mp4a.40.2') ? 'AAC-LC (mp4a.40.2)' : 'AAC-LC';
    return `MP4 · ${videoName} · ${coded} · ${rateLabel(rate)} ${ch}`;
  } finally {
    input.dispose();
  }
}

function pickRecorder(): { mime: string; extension: 'mp4' | 'webm' } {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') {
    return { mime: 'video/webm', extension: 'webm' };
  }
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return { mime, extension: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
    }
  }
  return { mime: 'video/webm', extension: 'webm' };
}

/** Real-time capture used only when WebCodecs cannot encode. */
async function encodeMediaRecorder(
  draw: (ctx: CanvasRenderingContext2D, t: number) => void,
  duration: number,
  preview: HTMLCanvasElement | null,
  onProgress: (frame: number, total: number) => void,
  signal?: AbortSignal,
): Promise<EncodeResult> {
  const canvas = document.createElement('canvas');
  canvas.width = REEL_W;
  canvas.height = REEL_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create a canvas.');
  const previewCtx = preview?.getContext('2d') ?? null;
  const { mime, extension } = pickRecorder();
  const stream = canvas.captureStream(REEL_FPS);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: BITRATE,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('MediaRecorder failed.'));
  });
  const total = Math.max(1, Math.round(duration * REEL_FPS));
  draw(ctx, 0);
  if (previewCtx) previewCtx.drawImage(canvas, 0, 0);
  recorder.start();
  const started = performance.now();
  await new Promise<void>((resolve, reject) => {
    const tick = (now: number) => {
      if (signal?.aborted) {
        reject(new DOMException('Cancelled', 'AbortError'));
        return;
      }
      const t = Math.min(duration, (now - started) / 1000);
      try {
        draw(ctx, t);
        if (previewCtx) previewCtx.drawImage(canvas, 0, 0);
        onProgress(Math.min(total, Math.round(t * REEL_FPS)), total);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('draw failed'));
        return;
      }
      if (t >= duration) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }).catch(async (err) => {
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach((tr) => tr.stop());
    throw err;
  });
  await new Promise((r) => setTimeout(r, 160));
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  const blob = new Blob(chunks, { type: mime });
  if (!blob.size) throw new Error('Recorder produced an empty file.');
  const h264 = extension === 'mp4';
  return {
    blob,
    mimeType: mime,
    extension,
    poster: canvas.toDataURL('image/jpeg', 0.72),
    label: h264 ? 'MP4 · H.264 · silent' : 'WebM · silent (this browser cannot encode H.264)',
  };
}
