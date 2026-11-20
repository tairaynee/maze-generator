import {
  DEFAULT_THANK_YOU_COPY,
  applyEndPage,
  countExportSteps,
  countPdfPages,
  layoutThankYou,
  printHandle,
  resolveThankYouText,
  type LaidBox,
  type ThankYouCopy,
} from './thankYouLayout';

/** Pinky-promise crop is 583×261. */
const ART = 583 / 261;

const TRIMS = {
  '5x8': { w: 5, h: 8 },
  '6x9': { w: 6, h: 9 },
  a4: { w: 210 / 25.4, h: 297 / 25.4 },
} as const;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function measure(text: string, size: number, bold: boolean) {
  return text.length * size * (bold ? 0.58 : 0.54);
}

function overlaps(a: LaidBox, b: LaidBox): boolean {
  return a.x + a.w > b.x + 0.015 && b.x + b.w > a.x + 0.015 && a.y + a.h > b.y + 0.015 && b.y + b.h > a.y + 0.015;
}

function checkLayout(copy: ThankYouCopy, label: string) {
  for (const [name, size] of Object.entries(TRIMS)) {
    const laid = layoutThankYou({
      pageW: size.w,
      pageH: size.h,
      copy,
      artAspect: ART,
      measure,
    });
    assert(!laid.clipped, `${label} ${name} clipped text`);
    assert(laid.art, `${label} ${name} is missing the drawing`);
    assert(laid.margin >= 0.48, `${label} ${name} margin ${laid.margin} is under 0.48in`);
    for (const box of laid.boxes) {
      assert(box.x >= laid.margin - 0.03, `${label} ${name} ${box.role} left ${box.x}`);
      assert(
        box.x + box.w <= size.w - laid.margin + 0.03,
        `${label} ${name} ${box.role} right ${box.x + box.w}`,
      );
      assert(box.y >= laid.margin - 0.03, `${label} ${name} ${box.role} top ${box.y}`);
      assert(
        box.y + box.h <= size.h - laid.margin + 0.03,
        `${label} ${name} ${box.role} bottom ${box.y + box.h}`,
      );
    }
    for (let i = 0; i < laid.boxes.length; i++) {
      for (let j = i + 1; j < laid.boxes.length; j++) {
        const a = laid.boxes[i];
        const b = laid.boxes[j];
        if (a.role === 'brand' && b.role === 'brand') continue;
        assert(!overlaps(a, b), `${label} ${name} overlap ${a.role} and ${b.role}`);
      }
    }
    const art = laid.boxes.find((b) => b.role === 'art')!;
    const closing = laid.boxes.filter((b) => b.role === 'closing');
    if (closing.length) {
      const bottom = Math.max(...closing.map((b) => b.y + b.h));
      assert(art.y >= bottom, `${label} ${name} drawing overlaps the closing line`);
    }
    const review = laid.boxes.filter((b) => b.role === 'review');
    const freebie = laid.boxes.filter((b) => b.role === 'freebie');
    if (review.length && freebie.length) {
      assert(laid.rule, `${label} ${name} is missing the separator`);
      const reviewBottom = Math.max(...review.map((b) => b.y + b.h));
      const freebieTop = Math.min(...freebie.map((b) => b.y));
      assert(
        reviewBottom < laid.rule.y && laid.rule.y < freebieTop,
        `${label} ${name} separator is not between the review and the free PDF note`,
      );
    }
  }
}

const resolved = resolveThankYouText(DEFAULT_THANK_YOU_COPY);
const rendered = Object.values(resolved).join('\n');
const banned = [
  'in exchange',
  'screenshot',
  'star rating',
  '5 star',
  'five star',
  'asin',
  'amazon.com',
  'http',
  'www.',
  'proof of',
  'must review',
  'review to get',
];
for (const phrase of banned) {
  assert(!rendered.toLowerCase().includes(phrase), `default copy contains “${phrase}”`);
}
assert(rendered.includes('Thank you for exploring!'), 'heading');
assert(rendered.includes('honest review'), 'review invitation');
assert(rendered.includes('No review required.'), 'free PDF is not conditional');
assert(rendered.includes('@iqexploratorium'), 'printed handle');
assert(rendered.includes('Happy puzzling!'), 'closing');
assert(rendered.includes('iq exploratorium'), 'brand');
assert(!rendered.includes('{handle}'), 'handle token left in the print');
assert(printHandle('iqexploratorium') === '@iqexploratorium', 'handle gains @');
assert(printHandle('  bad handle! ') === '@badhandle', 'handle strips spaces');
assert(printHandle('') === '@iqexploratorium', 'empty handle falls back');

checkLayout(DEFAULT_THANK_YOU_COPY, 'default');
checkLayout(
  {
    ...DEFAULT_THANK_YOU_COPY,
    heading: 'Thanks for every puzzle in this book and the next one too',
    review: 'Please consider an honest review. '.repeat(8).trim(),
    freebie: 'DM {handle} on Instagram for a free puzzle PDF. No review required. '.repeat(3).trim(),
  },
  'long',
);

type Page = { kind: string; id: string; role?: string };
const text = (id: string): Page => ({ kind: 'text', id });
const maze = (id: string): Page => ({ kind: 'maze', id });
const image = (id: string, role?: string): Page => ({ kind: 'image', id, role });
const thanks = (): Page => ({ kind: 'thank-you', id: 'preset-thank-you' });

let pages: Page[] = [];
pages = applyEndPage(pages, true, thanks);
pages = applyEndPage(pages, true, () => ({ kind: 'thank-you', id: 'other' }));
assert(pages.length === 1 && pages[0].id === 'preset-thank-you', 'include once');
pages = [text('t'), maze('m'), ...pages];
pages = applyEndPage(pages, true, thanks);
assert(
  pages.map((p) => p.kind).join(',') === 'text,maze,thank-you',
  'existing closing page stays single and last',
);
pages = applyEndPage(pages, false, thanks);
assert(pages.every((p) => p.kind !== 'thank-you'), 'remove clears it');
assert(applyEndPage(pages, false, thanks).length === pages.length, 'remove is stable');

const book = [image('c', 'cover'), maze('m1'), maze('m2'), text('n'), thanks()];
assert(countExportSteps(book, 'after-each') === 5, 'steps after each');
assert(countExportSteps(book, 'at-end') === 7, 'steps at end');
assert(countPdfPages(book, 'after-each') === 7, 'pdf after each, cover skips title');
assert(countPdfPages(book, 'at-end') === 7, 'pdf at end, cover skips title');
const plain = [maze('m'), text('t'), thanks()];
assert(countPdfPages(plain, 'after-each') === 5, 'title + maze + solution + text + thanks');
assert(countPdfPages(plain, 'at-end') === 5, 'title + maze + text + solution + thanks');
assert(countPdfPages([thanks()], 'at-end') === 2, 'title + thanks');
assert(countPdfPages([], 'after-each') === 0, 'empty export');

console.log('thank-you checks passed');
