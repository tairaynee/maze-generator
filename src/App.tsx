import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasWall, solvePath } from './lib/maze';
import {
  drawMaze,
  mazePixelSize,
  mazeToSVG,
  renderToCanvas,
  MARGIN_CELLS,
} from './lib/render';
import {
  createTextPage,
  exportBookPdf,
  exportBookZip,
  generateBatch,
  pageAspectRatio,
  regenerateOne,
  renderTextPageCanvas,
  replaceMazeBatch,
  type BookPage,
  type PageSize,
  type SolutionMode,
} from './lib/book';
import { PRIMARY_KEYWORDS } from './lib/themes';

const LEVELS = [
  { name: 'Easy', cols: 36 },
  { name: 'Medium', cols: 52 },
  { name: 'Hard', cols: 72 },
  { name: 'Expert', cols: 96 },
  { name: 'Insane', cols: 124 },
];

type Status = 'idle' | 'loading' | 'ready' | 'error';
interface Progress {
  label: string;
  done: number;
  total: number;
}

function dirBetween(a: number, b: number, cols: number): number {
  const ar = Math.floor(a / cols),
    ac = a % cols;
  const br = Math.floor(b / cols),
    bc = b % cols;
  if (br === ar - 1 && bc === ac) return 0;
  if (br === ar && bc === ac + 1) return 1;
  if (br === ar + 1 && bc === ac) return 2;
  if (br === ar && bc === ac - 1) return 3;
  return -1;
}

export default function App() {
  const [keyword, setKeyword] = useState('animals');
  const [level, setLevel] = useState(1);
  const [count, setCount] = useState(30);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [pages, setPages] = useState<BookPage[]>([]);
  const [page, setPage] = useState(0);
  const [solMode, setSolMode] = useState<SolutionMode>('after-each');
  const [pageSize, setPageSize] = useState<PageSize>('6x9');
  const [showSolution, setShowSolution] = useState(false);
  const [userPath, setUserPath] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');

  const shapeSeedRef = useRef(1);
  const usedEverRef = useRef<Set<number>>(new Set());
  const mainRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const current = pages[page] ?? null;
  const bookMaze = current?.kind === 'maze' ? current.maze : null;
  const maze = bookMaze?.maze ?? null;
  const markers = bookMaze?.markers ?? null;
  const busy = progress !== null || status === 'loading';

  const mazes = useMemo(
    () => pages.flatMap((p) => (p.kind === 'maze' ? [p.maze] : [])),
    [pages],
  );

  const pageLabels = useMemo(() => {
    let mazeNo = 0;
    return pages.map((p) => {
      if (p.kind === 'maze') {
        mazeNo += 1;
        return `Maze ${mazeNo}`;
      }
      const title = p.title.trim();
      return title ? `Text — ${title.slice(0, 48)}` : 'Text page';
    });
  }, [pages]);

  const cell = useMemo(() => {
    if (!maze) return 14;
    const m = MARGIN_CELLS * 2;
    const spanC = maze.bbox.maxC - maze.bbox.minC + 1 + m;
    const spanR = maze.bbox.maxR - maze.bbox.minR + 1 + m;
    return Math.max(5, Math.min(22, Math.floor(Math.min(900 / spanC, 680 / spanR))));
  }, [maze]);

  useEffect(() => {
    setPage((p) => (pages.length === 0 ? 0 : Math.min(p, pages.length - 1)));
  }, [pages.length]);

  const resetTrace = () => {
    setUserPath([]);
    setSolved(false);
    setShowSolution(false);
  };

  const runBatch = useCallback(
    async (kw: string, base: number) => {
      setProgress({ label: 'Generating unique shapes', done: 0, total: count });
      const { book: list, warning } = await generateBatch(
        kw,
        base,
        LEVELS[level].cols,
        count,
        (d, t) =>
          setProgress({ label: 'Generating unique shapes', done: d, total: t }),
      );
      setPages((prev) => replaceMazeBatch(prev, list));
      usedEverRef.current = new Set(list.map((b) => b.subjIdx));
      setPage(0);
      resetTrace();
      // Partial-success warning is non-fatal — book is still usable.
      setWarning(warning ?? '');
      setStatus('ready');
      setProgress(null);
    },
    [count, level],
  );

  const generate = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw || busy) return;
    setStatus('loading');
    setError('');
    setWarning('');
    // Reroll the shape seed on every Generate so the same keyword yields a
    // different set of shapes (and a different order) each run.
    // Text pages already in the book stay put.
    shapeSeedRef.current = Math.floor(Math.random() * 1e9);
    try {
      await runBatch(kw, shapeSeedRef.current);
    } catch (e) {
      setStatus('error');
      setProgress(null);
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }, [keyword, busy, runBatch]);

  const regenSingle = useCallback(async () => {
    if (busy || !maze || current?.kind !== 'maze') return;
    const currentId = current.id;
    let mazeSlot = 0;
    for (let i = 0; i <= page; i++) if (pages[i]?.kind === 'maze') mazeSlot++;
    mazeSlot = Math.max(0, mazeSlot - 1);
    setError('');
    setWarning('');
    setProgress({
      label: `Regenerating maze ${mazeSlot + 1}`,
      done: 0,
      total: 1,
    });
    try {
      const salt = Math.floor(Math.random() * 1e9);
      // Skip every subject ever used in this book session, not just the
      // ones currently visible — otherwise a freed slot gets re-picked.
      const used = new Set<number>(usedEverRef.current);
      mazes.forEach((m) => used.add(m.subjIdx));
      const bm = await regenerateOne(
        keyword.trim(),
        shapeSeedRef.current,
        LEVELS[level].cols,
        salt,
        used,
        mazeSlot,
      );
      if (!bm) throw new Error('Could not regenerate — try again.');
      usedEverRef.current.add(bm.subjIdx);
      setPages((arr) =>
        arr.map((p) => (p.id === currentId && p.kind === 'maze' ? { ...p, maze: bm } : p)),
      );
      resetTrace();
      setProgress({
        label: `Regenerating maze ${mazeSlot + 1}`,
        done: 1,
        total: 1,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not regenerate.');
    } finally {
      setProgress(null);
    }
  }, [busy, maze, current, keyword, page, level, mazes, pages]);

  const newMazes = useCallback(async () => {
    const kw = keyword.trim();
    if (busy || !kw) return;
    shapeSeedRef.current = Math.floor(Math.random() * 1e9);
    try {
      await runBatch(kw, shapeSeedRef.current);
    } catch (e) {
      setStatus('error');
      setProgress(null);
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }, [busy, keyword, runBatch]);

  const addText = (where: 'start' | 'after' | 'end') => {
    if (busy) return;
    const item = createTextPage(draftTitle, draftBody);
    setPages((arr) => {
      if (where === 'start') return [item, ...arr];
      if (where === 'end') return [...arr, item];
      const at = Math.min(arr.length, Math.max(0, page + 1));
      return [...arr.slice(0, at), item, ...arr.slice(at)];
    });
    setPage((p) => {
      if (where === 'start') return 0;
      if (where === 'end') return pages.length;
      return Math.min(pages.length, p + 1);
    });
    setDraftTitle('');
    setDraftBody('');
    resetTrace();
  };

  const updateCurrentText = (patch: { title?: string; body?: string }) => {
    if (current?.kind !== 'text') return;
    const id = current.id;
    setPages((arr) =>
      arr.map((p) => (p.kind === 'text' && p.id === id ? { ...p, ...patch } : p)),
    );
  };

  const deleteCurrentText = () => {
    if (busy || current?.kind !== 'text') return;
    const id = current.id;
    const idx = page;
    setPages((arr) => arr.filter((p) => p.id !== id));
    setPage((p) => {
      const nextLen = pages.length - 1;
      if (nextLen <= 0) return 0;
      const landed = p > idx ? p - 1 : p;
      return Math.min(landed, nextLen - 1);
    });
    resetTrace();
  };

  const movePage = (delta: -1 | 1) => {
    if (busy) return;
    const j = page + delta;
    if (j < 0 || j >= pages.length) return;
    setPages((arr) => {
      if (j >= arr.length) return arr;
      const next = arr.slice();
      const tmp = next[page];
      next[page] = next[j];
      next[j] = tmp;
      return next;
    });
    setPage(j);
    resetTrace();
  };

  const goTo = (i: number) => {
    setPage(i);
    resetTrace();
  };

  // Draw the current maze.
  useEffect(() => {
    if (!maze || !mainRef.current) return;
    const { width, height } = mazePixelSize(maze, cell);
    const cv = mainRef.current;
    cv.width = width;
    cv.height = height;
    const ov = overlayRef.current!;
    ov.width = width;
    ov.height = height;
    drawMaze(cv.getContext('2d')!, maze, {
      cell,
      wall: '#e8edff',
      solution: showSolution ? solvePath(maze) : null,
      markers,
    });
  }, [maze, cell, showSolution, markers]);

  // Draw the traced path.
  useEffect(() => {
    const ov = overlayRef.current;
    if (!ov || !maze) return;
    const ctx = ov.getContext('2d')!;
    ctx.clearRect(0, 0, ov.width, ov.height);
    if (userPath.length < 2) return;
    ctx.strokeStyle = solved ? 'rgba(34,197,94,0.85)' : 'rgba(56,189,248,0.8)';
    ctx.lineWidth = Math.max(2, cell * 0.5);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    userPath.forEach((idx, i) => {
      const r = Math.floor(idx / maze.cols) - maze.bbox.minR + MARGIN_CELLS;
      const c = (idx % maze.cols) - maze.bbox.minC + MARGIN_CELLS;
      const x = c * cell + cell / 2;
      const y = r * cell + cell / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [userPath, solved, maze, cell]);

  const cellAt = useCallback(
    (e: React.PointerEvent): number => {
      const ov = overlayRef.current!;
      const rect = ov.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (ov.width / rect.width);
      const py = (e.clientY - rect.top) * (ov.height / rect.height);
      const c = Math.floor(px / cell) + maze!.bbox.minC - MARGIN_CELLS;
      const r = Math.floor(py / cell) + maze!.bbox.minR - MARGIN_CELLS;
      if (r < 0 || c < 0 || r >= maze!.rows || c >= maze!.cols) return -1;
      return r * maze!.cols + c;
    },
    [cell, maze],
  );

  const onDown = (e: React.PointerEvent) => {
    if (!maze) return;
    if (cellAt(e) === maze.start) {
      drawing.current = true;
      setSolved(false);
      setUserPath([maze.start]);
      overlayRef.current!.setPointerCapture(e.pointerId);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current || !maze) return;
    const idx = cellAt(e);
    if (idx < 0 || !maze.cells[idx]) return;
    setUserPath((path) => {
      const last = path[path.length - 1];
      if (idx === last) return path;
      if (path.length >= 2 && idx === path[path.length - 2]) return path.slice(0, -1);
      const d = dirBetween(last, idx, maze.cols);
      if (d < 0 || hasWall(maze, last, d)) return path;
      if (idx === maze.end) {
        setSolved(true);
        drawing.current = false;
      }
      return [...path, idx];
    });
  };

  const onUp = () => {
    drawing.current = false;
  };

  const flip = (d: number) => {
    goTo(Math.min(pages.length - 1, Math.max(0, page + d)));
  };

  const download = (data: string, filename: string) => {
    const a = document.createElement('a');
    a.href = data;
    a.download = filename;
    a.click();
  };

  const runExport = async (kind: 'pdf' | 'zip') => {
    if (busy || !pages.length) return;
    const label = kind === 'pdf' ? 'Building PDF book' : 'Zipping PNGs';
    setProgress({ label, done: 0, total: pages.length });
    try {
      const cb = (d: number, t: number) => setProgress({ label, done: d, total: t });
      if (kind === 'pdf')
        await exportBookPdf(pages, keyword, solMode, pageSize, cb);
      else await exportBookZip(pages, keyword, pageSize, cb);
    } finally {
      setProgress(null);
    }
  };

  const downloadCurrentPng = () => {
    if (!current) return;
    if (current.kind === 'text') {
      download(
        renderTextPageCanvas(current.title, current.body, pageSize).toDataURL('image/png'),
        `${slug}-page-${page + 1}.png`,
      );
      return;
    }
    if (!maze) return;
    download(
      renderToCanvas(
        maze,
        22,
        showSolution,
        markers,
        `${pageLabels[page] ?? 'Maze'}${showSolution ? ' — Solution' : ''}`,
      ).toDataURL('image/png'),
      `${slug}-${page + 1}.png`,
    );
  };

  const slug = keyword.trim().replace(/\s+/g, '-').toLowerCase() || 'maze';
  const pct = progress
    ? Math.round((progress.done / Math.max(1, progress.total)) * 100)
    : 0;
  const aiCartoons = mazes.filter(
    (b) => b.markers.start || b.markers.end,
  ).length;
  const onMaze = current?.kind === 'maze';

  return (
    <div className="app">
      <header>
        <h1>Theme Maze Book Generator</h1>
        <p className="sub">
          One keyword → a whole book of mazes in that shape. Add text pages
          for instructions or section titles, then export. Free AI art, no
          sign-up.
        </p>
      </header>

      <div className="panel">
        <div className="row">
          <select
            className="keyword-select"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          >
            {PRIMARY_KEYWORDS.map(({ label, key }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <label className="num">
            Mazes
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) =>
                setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
              }
            />
          </label>
          <button className="primary" onClick={generate} disabled={busy}>
            {busy ? 'Working…' : 'Generate book'}
          </button>
        </div>

        <div className="row">
          <label className="diff">
            Difficulty: <strong>{LEVELS[level].name}</strong>
            <input
              type="range"
              min={0}
              max={LEVELS.length - 1}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            />
          </label>
          <label className="sel">
            Solutions
            <select
              value={solMode}
              onChange={(e) => setSolMode(e.target.value as SolutionMode)}
            >
              <option value="after-each">after each maze</option>
              <option value="at-end">all at the back</option>
            </select>
          </label>
          <label className="sel">
            Page
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as PageSize)}
            >
              <option value="6x9">6 × 9 in</option>
              <option value="5x8">5 × 8 in</option>
              <option value="a4">A4</option>
            </select>
          </label>
        </div>

        <p className="note">
          General words expand per maze (e.g. <em>animals</em> → cat, dog,
          rat…). Each maze = its own AI shape + start/end cartoons, ~
          {count * 3} image{count === 1 ? '' : 's'}
          {count > 25 ? '; large counts take several minutes.' : '.'}
        </p>

        <div className="text-tools">
          <h3>Text pages</h3>
          {current?.kind === 'text' && (
            <div className="text-edit">
              <p className="note">
                Editing {pageLabels[page] ?? 'this text page'}. Changes update
                the preview and the export.
              </p>
              <label className="field">
                Title <span className="opt">(optional)</span>
                <input
                  type="text"
                  value={current.title}
                  placeholder="How to use this book"
                  onChange={(e) => updateCurrentText({ title: e.target.value })}
                  disabled={busy}
                />
              </label>
              <label className="field">
                Body
                <textarea
                  value={current.body}
                  rows={4}
                  placeholder="Find the path from the start character to the goal."
                  onChange={(e) => updateCurrentText({ body: e.target.value })}
                  disabled={busy}
                />
              </label>
              <div className="row">
                <button className="danger" onClick={deleteCurrentText} disabled={busy}>
                  Delete this text page
                </button>
              </div>
            </div>
          )}

          <p className="note">
            Add instructions, an intro, a section title, or blank notes. One
            text page exports as one page at the trim size you picked; extra
            text is clipped.
          </p>
          <label className="field">
            Title <span className="opt">(optional)</span>
            <input
              type="text"
              value={draftTitle}
              placeholder="Section title"
              onChange={(e) => setDraftTitle(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            Body
            <textarea
              value={draftBody}
              rows={4}
              placeholder="Write the page, or leave both fields empty for a blank page."
              onChange={(e) => setDraftBody(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="row">
            <button onClick={() => addText('start')} disabled={busy}>
              Add at start
            </button>
            <button onClick={() => addText('after')} disabled={busy}>
              Add after current
            </button>
            <button onClick={() => addText('end')} disabled={busy}>
              Add at end
            </button>
          </div>
        </div>

        {pages.length > 0 && (
          <div className="row actions">
            {mazes.length > 0 && (
              <button onClick={newMazes} disabled={busy}>
                New shapes
              </button>
            )}
            {onMaze && (
              <>
                <button onClick={regenSingle} disabled={busy}>
                  Regenerate this maze
                </button>
                <button onClick={() => setShowSolution((s) => !s)} disabled={busy}>
                  {showSolution ? 'Hide solution' : 'Show solution'}
                </button>
                <button
                  onClick={() => {
                    setUserPath([]);
                    setSolved(false);
                  }}
                  disabled={busy}
                >
                  Clear path
                </button>
              </>
            )}
            <span className="spacer" />
            <button onClick={() => runExport('pdf')} disabled={busy}>
              Download PDF book
            </button>
            <button onClick={() => runExport('zip')} disabled={busy}>
              Download PNGs (.zip)
            </button>
            <button disabled={busy} onClick={downloadCurrentPng}>
              This page PNG
            </button>
            {onMaze && (
              <button
                disabled={busy}
                onClick={() =>
                  maze &&
                  download(
                    'data:image/svg+xml;charset=utf-8,' +
                      encodeURIComponent(mazeToSVG(maze, 22, markers)),
                    `${slug}-${page + 1}.svg`,
                  )
                }
              >
                SVG
              </button>
            )}
          </div>
        )}
      </div>

      {progress && (
        <div className="progress">
          <div className="bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <small>
            {progress.label}: {progress.done} / {progress.total} ({pct}%)
          </small>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {warning && !error && (
        <div className="error" style={{ background: '#1d2540', borderColor: '#3b4d80', color: '#ffd58a' }}>
          {warning}
        </div>
      )}
      {mazes.length > 0 && (() => {
        const icon = mazes.filter((m) => m.source === 'icon').length;
        const proc = mazes.length - icon;
        const allProc = proc === mazes.length;
        // Count unique shapes (catalog slugs) so the banner detects when
        // different-named mazes reuse the same icon URL.
        const keys = mazes.map((m) => m.shapeKey).filter((k): k is string => !!k);
        const uniqueShapes = new Set(keys).size;
        const dupeShapes = keys.length - uniqueShapes;
        const allUnique = dupeShapes === 0 && icon === mazes.length;
        return (
          <div className="error" style={{
            background: allProc ? '#3d1f1f' : dupeShapes > 0 ? '#3a3320' : '#1d3a1d',
            borderColor: allProc ? '#7a3a3a' : dupeShapes > 0 ? '#7a6a3a' : '#3a7a3a',
            color: allProc ? '#ffb3b3' : dupeShapes > 0 ? '#ffe9a8' : '#b3ffb3',
          }}>
            <strong>{icon}/{mazes.length}</strong> on-theme ·{' '}
            <strong>{proc}/{mazes.length}</strong> procedural fallback ·{' '}
            <strong>{uniqueShapes}/{icon}</strong> unique shapes
            {dupeShapes > 0 && ` (${dupeShapes} repeats)`}
            {allUnique && ' — every shape distinct ✓'}
            {allProc && ' — Iconify isn\'t reaching your browser. Check Network tab in DevTools for failed api.iconify.design requests.'}
          </div>
        );
      })()}

      {status === 'loading' && !progress && pages.length === 0 && (
        <div className="stage loadingbox">
          <div className="spinner" />
          <p>Drawing the “{keyword.trim()}” start &amp; goal characters…</p>
          <small>Then each maze gets its own shape.</small>
        </div>
      )}

      {current && (
        <>
          <div className="pager">
            <button onClick={() => flip(-1)} disabled={page === 0 || busy}>
              ‹ Prev
            </button>
            <button onClick={() => movePage(-1)} disabled={page === 0 || busy}>
              Move earlier
            </button>
            <span>
              Page <strong>{page + 1}</strong> of {pages.length}
              {pageLabels[page] ? <> · {pageLabels[page]}</> : null}
            </span>
            <label className="sel">
              <select
                value={page}
                onChange={(e) => goTo(Number(e.target.value))}
                disabled={busy}
              >
                {pages.map((p, i) => (
                  <option key={p.id} value={i}>
                    {i + 1}. {pageLabels[i]}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => movePage(1)}
              disabled={page >= pages.length - 1 || busy}
            >
              Move later
            </button>
            <button
              onClick={() => flip(1)}
              disabled={page >= pages.length - 1 || busy}
            >
              Next ›
            </button>
          </div>
          <div className="stage">
            <div
              className={
                current.kind === 'text' ? 'page-frame text-sheet' : 'page-frame'
              }
              style={{ aspectRatio: pageAspectRatio(pageSize) }}
            >
              {current.kind === 'maze' ? (
                <>
                  <h2 className="maze-title">
                    {pageLabels[page]}
                    <span style={{
                      marginLeft: 12, fontSize: '0.6em', fontWeight: 400,
                      color: current.maze.source === 'icon' ? '#2e7d32' : '#c62828',
                    }}>
                      {current.maze.subject} ·{' '}
                      {current.maze.source === 'icon' ? '✓ on-theme' : '⚠ procedural fallback'}
                    </span>
                  </h2>
                  <div className="maze-fit">
                    <div className="canvas-wrap">
                      <canvas ref={mainRef} className="maze" />
                      <canvas
                        ref={overlayRef}
                        className="overlay"
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sheet-inner">
                  {current.title.trim() ? (
                    <h2 className="text-sheet-title">{current.title}</h2>
                  ) : null}
                  {current.body.trim() ? (
                    <div className="text-sheet-body">{current.body}</div>
                  ) : !current.title.trim() ? (
                    <p className="text-sheet-empty">
                      Blank page. Add a title or notes — it still exports at
                      this trim size.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          <div className={'status' + (solved && onMaze ? ' win' : '')}>
            {current.kind === 'text' ? (
              <>Text page · included in the PDF and the PNG zip.</>
            ) : solved ? (
              <strong>Solved! 🎉</strong>
            ) : (
              <>Drag from the start character to the goal to trace a path.</>
            )}
            <span className="src">
              {pages.length} page{pages.length === 1 ? '' : 's'}
              {mazes.length > 0 && (
                <>
                  {' '}
                  · {mazes.length} maze{mazes.length === 1 ? '' : 's'} · AI
                  cartoons on {aiCartoons}/{mazes.length}
                  {aiCartoons < mazes.length && ' (rest use flag markers)'}
                </>
              )}
            </span>
          </div>
        </>
      )}

      {pages.length === 0 && status !== 'loading' && (
        <div className="stage hint">
          <p>
            Pick a theme word and a count, then “Generate book”. Or add a
            text page first — it stays in front of the mazes.
          </p>
        </div>
      )}
    </div>
  );
}
