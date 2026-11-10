import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { resetCatalogClaims } from '../lib/shape';
import { PRIMARY_KEYWORDS } from '../lib/themes';
import { encodeReel, type EncodeResult } from './encode';
import { makeReelMaze, type BuiltMaze } from './makeMaze';
import {
  AUTO_BACKGROUND,
  PALETTES,
  paletteByName,
  takeBackgrounds,
  type PaletteQueue,
} from './palettes';
import { routeStats } from './route';
import {
  drawFrame,
  drawSplash,
  REEL_H,
  REEL_W,
  type ReelLook,
  type ReelScene,
} from './scene';
import { buildTimeline } from './timeline';

const DENSITIES = [
  { id: 'chunky', label: 'Chunky', cols: 18 },
  { id: 'medium', label: 'Medium', cols: 24 },
  { id: 'fine', label: 'Fine', cols: 32 },
] as const;

interface SavedReel {
  id: string;
  url: string;
  poster: string;
  filename: string;
  paletteName: string;
  subject: string;
  label: string;
  blob: Blob;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'maze';
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (m) => m.toUpperCase());
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function ReelsApp() {
  const [theme, setTheme] = useState('animals');
  const [density, setDensity] = useState<(typeof DENSITIES)[number]['id']>('medium');
  const [paletteName, setPaletteName] = useState(AUTO_BACKGROUND);
  const [activeBg, setActiveBg] = useState('');
  const [duration, setDuration] = useState(14);
  const [countdown, setCountdown] = useState(true);
  const [endCard, setEndCard] = useState(true);
  const [cta, setCta] = useState('Follow for a new maze every day');
  const [handle, setHandle] = useState('');
  const [cover, setCover] = useState<HTMLImageElement | null>(null);
  const [coverName, setCoverName] = useState('');
  const [batchCount, setBatchCount] = useState(3);
  const [built, setBuilt] = useState<BuiltMaze | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playId, setPlayId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [formatNote, setFormatNote] = useState('');
  const [saved, setSaved] = useState<SavedReel[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ReelScene | null>(null);
  const lookRef = useRef<ReelLook>({
    countdown: true,
    endCard: true,
    duration: 14,
    cta: 'Follow for a new maze every day',
    handle: '',
    cover: null,
  });
  const coverUrl = useRef<string | null>(null);
  const rotRef = useRef(0);
  const themeRef = useRef(theme);
  const cancelRef = useRef(false);
  const savedRef = useRef<SavedReel[]>([]);
  const activeCancel = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const paletteRef = useRef(paletteByName(PALETTES[0].name));
  const queueRef = useRef<PaletteQueue>({ items: [], last: null });

  const palette = paletteName === AUTO_BACKGROUND ? null : paletteByName(paletteName);
  const cols = DENSITIES.find((d) => d.id === density)?.cols ?? 24;
  const timeline = buildTimeline(duration, countdown, endCard);

  lookRef.current = { countdown, endCard, duration, cta, handle, cover };
  if (palette) paletteRef.current = palette;
  busyRef.current = busy;

  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    return () => {
      savedRef.current.forEach((r) => URL.revokeObjectURL(r.url));
      if (coverUrl.current) URL.revokeObjectURL(coverUrl.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = REEL_W;
    canvas.height = REEL_H;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx && !sceneRef.current) drawSplash(ctx);
  }, []);

  useEffect(() => {
    if (playing || busyRef.current) return;
    const scene = sceneRef.current;
    const ctx = canvasRef.current?.getContext('2d');
    if (!scene || !ctx) return;
    if (paletteName !== AUTO_BACKGROUND) {
      scene.palette = paletteByName(paletteName);
      scene.cache = null;
    }
    drawFrame(ctx, scene, lookRef.current, 0);
  }, [paletteName, countdown]);

  useEffect(() => {
    if (!playing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let alive = true;
    const t0 = performance.now();
    const tick = (now: number) => {
      const scene = sceneRef.current;
      const look = lookRef.current;
      if (!scene) return;
      const elapsed = (now - t0) / 1000;
      drawFrame(ctx, scene, look, Math.min(look.duration, elapsed));
      if (!alive) return;
      if (elapsed < look.duration) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [playing, playId]);

  const stats = built ? routeStats(built.maze, built.route) : null;

  function stopPlay() {
    setPlaying(false);
  }

  async function onCover(file: File | null) {
    if (coverUrl.current) {
      URL.revokeObjectURL(coverUrl.current);
      coverUrl.current = null;
    }
    if (!file) {
      setCover(null);
      setCoverName('');
      return;
    }
    const url = URL.createObjectURL(file);
    coverUrl.current = url;
    const img = new Image();
    img.onload = () => {
      setCover(img);
      setCoverName(file.name);
    };
    img.onerror = () => setError('Could not read that cover image.');
    img.src = url;
  }

  function assignBackgrounds(count: number) {
    const pin = paletteName === AUTO_BACKGROUND ? null : paletteByName(paletteName);
    const seed = Math.floor(Math.random() * 1e9) + 1;
    const taken = takeBackgrounds(queueRef.current, count, pin, seed);
    queueRef.current = taken.queue;
    return taken.backgrounds;
  }

  async function previewOne() {
    if (busy) return;
    setBusy(true);
    setError('');
    setProgress('Finding a themed shape…');
    stopPlay();
    try {
      if (themeRef.current !== theme) {
        resetCatalogClaims(theme);
        themeRef.current = theme;
        rotRef.current = 0;
      }
      const rotation = rotRef.current++;
      const seed = Math.floor(Math.random() * 1e9) + 1;
      const next = await makeReelMaze(theme, cols, rotation, seed);
      const [background] = assignBackgrounds(1);
      setActiveBg(background.name);
      sceneRef.current = {
        maze: next.maze,
        route: next.route,
        palette: background,
        subject: next.subject,
        seed: next.seed,
        cache: null,
      };
      setBuilt(next);
      setPlayId((n) => n + 1);
      setPlaying(true);
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build a maze.');
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  function drawCurrent(ctx: CanvasRenderingContext2D, t: number, scene: ReelScene) {
    drawFrame(ctx, scene, lookRef.current, t);
  }

  async function encodeScene(
    scene: ReelScene,
    subject: string,
    index: number,
    total: number,
    signal: AbortSignal,
  ): Promise<{ result: EncodeResult; filename: string }> {
    const result = await encodeReel(
      (ctx, t) => drawCurrent(ctx, t, scene),
      lookRef.current.duration,
      canvasRef.current,
      (frame, frames) => {
        setProgress(
          total > 1
            ? `Video ${index} of ${total} · frame ${frame}/${frames}`
            : `Encoding frame ${frame}/${frames}`,
        );
      },
      signal,
    );
    const filename = `${String(index).padStart(2, '0')}-${slug(subject)}.${result.extension}`;
    return { result, filename };
  }

  function remember(scene: ReelScene, subject: string, filename: string, result: EncodeResult) {
    const item: SavedReel = {
      id: `${scene.seed}-${filename}`,
      url: URL.createObjectURL(result.blob),
      poster: result.poster,
      filename,
      paletteName: scene.palette.name,
      subject,
      label: result.label,
      blob: result.blob,
    };
    setSaved((prev) => [...prev, item]);
    setFormatNote(`${result.label} · 1080×1920 · ${lookRef.current.duration}s · 30 fps`);
    return item;
  }

  async function downloadCurrent() {
    const scene = sceneRef.current;
    if (!scene || !built || busy) return;
    setBusy(true);
    setError('');
    stopPlay();
    const signal = new AbortController();
    activeCancel.current = () => signal.abort();
    try {
      const { result, filename } = await encodeScene(scene, built.subject, 1, 1, signal.signal);
      remember(scene, built.subject, filename, result);
      downloadBlob(result.blob, filename);
      setProgress('');
    } catch (err) {
      if (!isAbort(err)) {
        setError(err instanceof Error ? err.message : 'Export failed.');
      }
      setProgress('');
    } finally {
      activeCancel.current = null;
      setBusy(false);
    }
  }

  async function downloadBatch() {
    if (busy) return;
    const count = Math.max(1, Math.min(8, batchCount));
    setBusy(true);
    setError('');
    stopPlay();
    cancelRef.current = false;
    const signalCtrl = new AbortController();
    activeCancel.current = () => {
      cancelRef.current = true;
      signalCtrl.abort();
    };
    setSaved((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.url));
      return [];
    });
    resetCatalogClaims(theme);
    themeRef.current = theme;
    const base = Math.floor(Math.random() * 1e9) + 1;
    const backgrounds = assignBackgrounds(count);
    const files: SavedReel[] = [];
    try {
      for (let i = 0; i < count; i++) {
        if (cancelRef.current) break;
        setProgress(`Video ${i + 1} of ${count} · finding a shape…`);
        const next = await makeReelMaze(theme, cols, i, base + i * 997);
        const pal = backgrounds[i];
        setActiveBg(pal.name);
        const scene: ReelScene = {
          maze: next.maze,
          route: next.route,
          palette: pal,
          subject: next.subject,
          seed: next.seed,
          cache: null,
        };
        sceneRef.current = scene;
        setBuilt(next);
        const { result, filename } = await encodeScene(
          scene,
          next.subject,
          i + 1,
          count,
          signalCtrl.signal,
        );
        sceneRef.current = scene;
        const item = remember(scene, next.subject, filename, result);
        files.push(item);
      }
      if (!cancelRef.current && files.length === 1) {
        downloadBlob(files[0].blob, files[0].filename);
      } else if (!cancelRef.current && files.length > 1) {
        setProgress('Zipping videos…');
        const zip = new JSZip();
        for (const file of files) zip.file(file.filename, file.blob);
        const blob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(blob, `maze-reels-${slug(theme)}.zip`);
      }
      setProgress('');
      rotRef.current = count;
    } catch (err) {
      if (!isAbort(err)) {
        setError(err instanceof Error ? err.message : 'Export failed.');
      }
      setProgress('');
    } finally {
      activeCancel.current = null;
      setBusy(false);
    }
  }

  function replay() {
    if (!sceneRef.current || busy) return;
    setPlayId((n) => n + 1);
    setPlaying(true);
  }

  const coloring = Math.max(0, timeline.walkEnd - timeline.countEnd);

  return (
    <div className="studio">
      <header>
        <a className="back" href={import.meta.env.BASE_URL}>
          ← Book generator
        </a>
        <h1>Maze Reels Studio</h1>
        <p className="sub">
          Vertical videos for Instagram. A light follows the real solution
          in marker colors — red, yellow, green, blue, pink, orange — and
          never steps into a dead end. Auto gives every reel a new background.
        </p>
      </header>

      <div className="layout">
        <div className="panel">
          <label className="row">
            <span>Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} disabled={busy}>
              {PRIMARY_KEYWORDS.map(({ label, key }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="row">
            <span>Maze detail</span>
            <select
              value={density}
              onChange={(e) => setDensity(e.target.value as (typeof DENSITIES)[number]['id'])}
              disabled={busy}
            >
              {DENSITIES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span>Background</span>
            <div className="swatches">
              <button
                type="button"
                className={paletteName === AUTO_BACKGROUND ? 'on' : ''}
                style={{
                  background:
                    'conic-gradient(#1d4bff, #ff2f92, #ffe500, #14d46a, #6d28ff, #00c2ff, #1d4bff)',
                  color: '#ffffff',
                }}
                aria-pressed={paletteName === AUTO_BACKGROUND}
                onClick={() => setPaletteName(AUTO_BACKGROUND)}
                disabled={busy}
              >
                Auto
              </button>
              {PALETTES.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={p.name === paletteName ? 'on' : ''}
                  style={{ background: `linear-gradient(160deg, ${p.bg}, ${p.bgEnd})`, color: p.text }}
                  aria-pressed={p.name === paletteName}
                  onClick={() => {
                    setPaletteName(p.name);
                    setActiveBg(p.name);
                    if (sceneRef.current) {
                      sceneRef.current.palette = p;
                      sceneRef.current.cache = null;
                    }
                  }}
                  disabled={busy}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <p className="note">
              Auto is a new saturated background every reel. A batch always
              uses a different color for each video
              {palette ? `, starting from ${palette.name}` : ''}.
            </p>
          </div>

          <label className="row">
            <span>Length</span>
            <input
              type="range"
              min={10}
              max={20}
              step={1}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={busy}
            />
            <strong>{duration}s</strong>
          </label>
          <p className="note">
            Hook 1s
            {countdown ? ` · countdown ${(timeline.countEnd - timeline.hookEnd).toFixed(1)}s` : ''}
            {' · '}coloring {coloring.toFixed(1)}s · finish{' '}
            {(timeline.burstEnd - timeline.walkEnd).toFixed(1)}s
            {endCard ? ` · end card ${(timeline.duration - timeline.burstEnd).toFixed(1)}s` : ''}.
            Shorter length means a faster coloring.
          </p>

          <label className="check">
            <input
              type="checkbox"
              checked={countdown}
              onChange={(e) => setCountdown(e.target.checked)}
              disabled={busy}
            />
            3-2-1 countdown after the hook
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={endCard}
              onChange={(e) => setEndCard(e.target.checked)}
              disabled={busy}
            />
            End card
          </label>
          <label className="field">
            <span>End-card text</span>
            <input
              type="text"
              value={cta}
              maxLength={90}
              onChange={(e) => setCta(e.target.value)}
              disabled={busy || !endCard}
            />
          </label>
          <label className="field">
            <span>
              Handle <em>optional</em>
            </span>
            <input
              type="text"
              value={handle}
              placeholder="@yourhandle"
              maxLength={40}
              onChange={(e) => setHandle(e.target.value)}
              disabled={busy || !endCard}
            />
          </label>
          <div className="field">
            <span>
              Book cover <em>optional, shown on the end card</em>
            </span>
            <div className="row">
              <label className="file">
                Upload image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy || !endCard}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    void onCover(file);
                    e.target.value = '';
                  }}
                />
              </label>
              {coverName && (
                <button type="button" onClick={() => void onCover(null)} disabled={busy}>
                  Remove
                </button>
              )}
              {coverName && <em className="file-name">{coverName}</em>}
            </div>
          </div>

          <label className="row">
            <span>Batch</span>
            <input
              type="number"
              min={1}
              max={8}
              value={batchCount}
              onChange={(e) => setBatchCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
              disabled={busy}
            />
          </label>

          <p className="note">
            1080×1920 · 30 fps · H.264 MP4 when this browser can encode it,
            otherwise WebM. Everything stays in the browser.
          </p>

          <div className="actions">
            {!busy ? (
              <>
                <button className="primary" type="button" onClick={() => void previewOne()}>
                  {built ? 'New maze' : 'Preview maze'}
                </button>
                <button type="button" onClick={replay} disabled={!built}>
                  Replay
                </button>
                <button type="button" onClick={() => void downloadCurrent()} disabled={!built}>
                  Download this video
                </button>
                <button type="button" onClick={() => void downloadBatch()}>
                  Download {batchCount} video{batchCount === 1 ? '' : 's'}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => activeCancel.current?.()}>
                Stop
              </button>
            )}
          </div>
        </div>

        <div className="stage">
          <div className="phone">
            <canvas ref={canvasRef} width={REEL_W} height={REEL_H} />
          </div>
          {built && stats && (
            <p className="proof">
              <strong>{titleCase(built.subject)}</strong>
              {' · '}
              {activeBg}
              {' · '}
              solution checked, {stats.steps} steps from start to goal
              {stats.deadEnds > 0 ? `, ${stats.deadEnds} dead ends left empty` : ''}.
            </p>
          )}
          {progress && (
            <div className="progress">
              <div className="bar">
                <span />
              </div>
              {progress}
            </div>
          )}
          {formatNote && <p className="note center">{formatNote}</p>}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {saved.length > 0 && (
        <section className="gallery">
          <h2>Ready to post</h2>
          <div className="grid">
            {saved.map((reel) => (
              <figure key={reel.id}>
                <video
                  src={reel.url}
                  poster={reel.poster}
                  controls
                  playsInline
                  preload="metadata"
                />
                <figcaption>
                  <span>
                    {titleCase(reel.subject)} · {reel.paletteName}
                  </span>
                  <button type="button" onClick={() => downloadBlob(reel.blob, reel.filename)}>
                    Save
                  </button>
                </figcaption>
                <code>
                  {reel.filename} · {reel.label}
                </code>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
