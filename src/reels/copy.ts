/** Opening hooks and closing lines. A shuffle queue keeps each new reel off the last one. */

export const HOOKS: string[][] = [
  ['Can you', 'solve this maze?'],
  ['99% of people', "can't"],
  ["Don't scroll", 'past this'],
  ['Bet you', 'get lost'],
  ['Most people', 'quit here'],
  ['Think you see', 'the path?'],
  ['This one', 'is mean'],
  ['Only one path', 'is real'],
  ['Try it before', 'the answer'],
  ['Nobody nails', 'the first try'],
  ['Prove you', 'can finish'],
  ['The easy turn', 'is a trap'],
  ['Looks easy.', "It isn't."],
  ['Start to goal.', 'No hints.'],
  ['Your brain', 'vs this maze'],
  ['Blink and', "you're lost"],
  ['Wait.', 'Can you see it?'],
  ['Eyes on', 'the exit'],
  ['Stuck', 'already?'],
  ["Don't trust", 'the first turn'],
  ['It fights', 'back'],
  ['Solve it', 'in your head'],
  ['Find the exit', 'before it shows'],
  ['This exit', 'is hiding'],
  ['Fair warning.', "It's tricky."],
  ['One way out.', 'Go find it.'],
  ['You will', 'second-guess it'],
  ['The path', 'is in there'],
  ['Can you beat', 'the clock?'],
  ['No peeking.', 'Try it.'],
  ['Still think', "it's obvious?"],
  ['Lost yet?', 'Good.'],
];

export const CTAS: readonly string[] = [
  'Follow for a new maze every day',
  'Save this and try it later',
  "Follow for tomorrow's maze",
  'Save it if you solved it',
  'A new maze drops tomorrow',
  'Tag someone who gets lost',
  'Follow so you catch the next one',
  'Save it and race a friend',
  'Comment your time if you finished',
  'Follow for a maze you can try',
  'Share this with a competitive friend',
  'Save this for a quieter scroll',
  'Follow if you like a fair fight',
  'Come back tomorrow for a new one',
  'Double tap if you saw the path',
  'Follow for mazes that play fair',
  'Save it before the answer shows',
  'Send this to an overthinker',
  'Hit follow. A new maze every day.',
  'Stuck? Follow for the next one',
  'Save this for the easy-mode friend',
  'Comment solved if you made it',
  "Tomorrow's maze is already meaner",
  'Share it if you want a rematch',
  'Follow. The next one is worse.',
  'Save this maze and solve it slow',
  'New maze every day if you follow',
  "Send it to someone who won't quit",
];

export interface ReelCopy {
  hook: string[];
  cta: string;
}

export interface CopyQueue {
  hooks: string[][];
  ctas: string[];
  lastHook: string | null;
  lastCta: string | null;
}

export function emptyCopyQueue(): CopyQueue {
  return { hooks: [], ctas: [], lastHook: null, lastCta: null };
}

function hookKey(lines: readonly string[]): string {
  return lines.join('\n');
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function takeFrom<T>(
  items: readonly T[],
  last: string | null,
  count: number,
  pool: readonly T[],
  keyOf: (item: T) => string,
  seed: number,
): { picked: T[]; items: T[]; last: string | null } {
  const bag = items.slice();
  const picked: T[] = [];
  const seen = new Set<string>();

  const refill = () => {
    const more = shuffle(pool, seed + bag.length * 17 + picked.length * 131);
    const fresh = more.filter((item) => !seen.has(keyOf(item)));
    const used = more.filter((item) => seen.has(keyOf(item)));
    bag.push(...fresh, ...used);
    const prev = picked.length ? keyOf(picked[picked.length - 1]) : last;
    if (prev && bag[0] && keyOf(bag[0]) === prev && bag.length > 1) {
      const swapAt = bag.findIndex((item, i) => i > 0 && !seen.has(keyOf(item)));
      if (swapAt > 0) {
        const [choice] = bag.splice(swapAt, 1);
        bag.unshift(choice);
      }
    }
  };

  let guard = 0;
  while (picked.length < count && guard < count * (pool.length + 2)) {
    guard += 1;
    if (!bag.length) {
      if (seen.size >= pool.length) break;
      refill();
    }
    const next = bag.shift();
    if (!next) break;
    const key = keyOf(next);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(next);
  }

  while (picked.length < count) {
    const prev = picked.length ? keyOf(picked[picked.length - 1]) : last;
    const extra = pool.find((item) => keyOf(item) !== prev);
    if (!extra) break;
    picked.push(extra);
  }

  return {
    picked,
    items: bag,
    last: picked.length ? keyOf(picked[picked.length - 1]) : last,
  };
}

/** One line pair per reel. A batch is internally unique, and the first pick avoids the previous reel. */
export function takeCopy(
  queue: CopyQueue,
  count: number,
  seed: number,
): { copies: ReelCopy[]; queue: CopyQueue } {
  const n = Math.max(1, count);
  const hooks = takeFrom(queue.hooks, queue.lastHook, n, HOOKS, hookKey, seed);
  const ctas = takeFrom(queue.ctas, queue.lastCta, n, CTAS, (line) => line, seed + 917);
  const copies = hooks.picked.map((hook, i) => ({
    hook: [...hook],
    cta: ctas.picked[i] ?? CTAS[i % CTAS.length],
  }));
  return {
    copies,
    queue: {
      hooks: hooks.items,
      ctas: ctas.items,
      lastHook: hooks.last,
      lastCta: ctas.last,
    },
  };
}
