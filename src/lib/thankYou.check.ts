import {
  DEFAULT_THANK_YOU_COPY,
  applyEndPage,
  countExportSteps,
  countPdfPages,
  layoutThankYou,
  migrateStoredCopy,
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
    const copyLines = laid.lines.filter((line) => line.role === 'copyright');
    if (copy.copyright.trim()) {
      assert(copyLines.length > 0, `${label} ${name} is missing the copyright`);
      assert(
        copyLines.every((line) => line.size >= 0.1),
        `${label} ${name} copyright is under 7pt`,
      );
      const brand = laid.boxes.filter((box) => box.role === 'brand');
      const legal = laid.boxes.filter((box) => box.role === 'copyright');
      if (brand.length && legal.length) {
        const brandBottom = Math.max(...brand.map((box) => box.y + box.h));
        const legalTop = Math.min(...legal.map((box) => box.y));
        assert(legalTop >= brandBottom + 0.06, `${label} ${name} copyright crowds the handle`);
      }
    }
  }
}

const now2026 = new Date(2026, 10, 20);
const now2027 = new Date(2027, 0, 15);
const resolved = resolveThankYouText(DEFAULT_THANK_YOU_COPY, now2026);
const promo = [
  resolved.heading,
  resolved.intro,
  resolved.review,
  resolved.freebie,
  resolved.closing,
  resolved.brand,
].join('\n');
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
  assert(!promo.toLowerCase().includes(phrase), `default copy contains “${phrase}”`);
}
assert(resolved.heading === 'Thank you for exploring!', 'heading');
assert(resolved.review.includes('honest review'), 'review invitation');
assert(resolved.reviewTitle === 'Enjoyed the puzzles?', 'review heading');
assert(
  resolved.review ===
    'Please leave an honest review on Amazon.\nYour feedback helps us make better books.',
  'review lines',
);
assert(resolved.freebieTitle === 'Want more puzzles?', 'freebie heading');
assert(
  resolved.freebie === 'Get a free puzzle PDF.\nFollow and DM @iqexploratorium on Instagram.',
  'freebie lines',
);
assert(!resolved.freebie.toLowerCase().includes('review'), 'free PDF does not mention a review');
assert(!resolved.review.toLowerCase().includes('pdf'), 'review does not mention the free PDF');
assert(
  resolved.freebie.includes('Follow and DM @iqexploratorium on Instagram.'),
  'free PDF asks to follow and DM',
);
assert(resolved.brand === '@iqexploratorium', 'brand is the handle');
assert(resolved.closing === 'Happy puzzling!', 'closing');
assert(resolved.copyright.startsWith('Copyright © 2026 IQ EXPLORATORIUM.'), 'copyright year is 2026 today');
assert(
  resolved.copyright ===
    'Copyright © 2026 IQ EXPLORATORIUM.\nAll rights reserved.\nNo reproduction or distribution\nwithout prior written permission.',
  'copyright notice is set line by line',
);
assert(!resolved.copyright.toLowerCase().includes('youtube'), 'copyright has no YouTube URL');
assert(!resolved.copyright.includes('('), 'copyright has no parenthetical link');
assert(resolved.copyright.includes('No reproduction or distribution'), 'copyright keeps the restriction');
assert(resolved.copyright.includes('without prior written permission.'), 'copyright keeps the permission line');
assert(!resolved.copyright.toLowerCase().includes('word search'), 'copyright is not a word search notice');
assert(!resolved.copyright.includes('{year}'), 'year token is printed');
assert(!/\b20\d\d\s*[-–]\s*20\d\d\b/.test(resolved.copyright), 'copyright is a single year');
const nextYear = resolveThankYouText(DEFAULT_THANK_YOU_COPY, now2027);
assert(nextYear.copyright.startsWith('Copyright © 2027 IQ EXPLORATORIUM'), '2027 follows the clock');
assert(!nextYear.copyright.includes('© 2026'), 'auto year does not stay on 2026');
assert(DEFAULT_THANK_YOU_COPY.copyright.includes('{year}'), 'stored default keeps the year token');
assert(DEFAULT_THANK_YOU_COPY.copyrightYear === 'auto', 'default year mode is auto');
const fixed = resolveThankYouText(
  { ...DEFAULT_THANK_YOU_COPY, copyrightYear: 2018 },
  now2027,
);
assert(fixed.copyright.startsWith('Copyright © 2018 IQ EXPLORATORIUM'), 'manual year stays fixed');
const kept = migrateStoredCopy({
  heading: 'Mine',
  brand: 'Kept Press',
  reviewTitle: 'Hello',
  review: 'A note we wrote ourselves.',
  freebieTitle: 'Extras',
  freebie: 'Write to us for another maze.',
  copyright: 'Copyright © 2018 Kept Press. All rights reserved.',
  copyrightYear: 2018,
});
assert(kept.copy.heading === 'Mine', 'custom heading survives');
assert(kept.copy.brand === 'Kept Press', 'custom brand survives');
assert(kept.copy.review === 'A note we wrote ourselves.', 'custom review survives');
assert(kept.copy.freebie === 'Write to us for another maze.', 'custom freebie survives');
assert(kept.copy.copyright === 'Copyright © 2018 Kept Press. All rights reserved.', 'fixed notice survives');
assert(kept.copy.copyrightYear === 2018, 'fixed year survives');
assert(!kept.changed, 'a manual year is not rewritten');
const upgraded = migrateStoredCopy({
  heading: 'Thanks, puzzlers!',
  brand: 'iq exploratorium',
  copyright: DEFAULT_THANK_YOU_COPY.copyright.split('{year}').join('2026'),
});
assert(upgraded.changed, 'old footer is migrated');
assert(upgraded.copy.heading === 'Thanks, puzzlers!', 'edited heading is kept');
assert(upgraded.copy.brand === '@iqexploratorium', 'old wordmark becomes the handle');
assert(upgraded.copy.copyrightYear === 'auto', 'migrated year stays automatic');
assert(upgraded.copy.copyright.includes('{year}'), 'migrated notice does not freeze 2026');
assert(!upgraded.copy.copyright.includes('2026'), 'stored notice has no baked year');
assert(!upgraded.copy.copyright.toLowerCase().includes('youtube'), 'untouched default drops the URL');
const oldUrl =
  'Copyright © {year} IQ EXPLORATORIUM (https://m.youtube.com/@iqexploratorium). All rights reserved. No part of this puzzle book may be reproduced or distributed without prior written permission.';
const dropped = migrateStoredCopy({
  heading: 'Thanks, puzzlers!',
  brand: '@iqexploratorium',
  copyright: oldUrl,
  copyrightYear: 2018,
});
assert(dropped.changed, 'previous default notice is updated');
assert(dropped.copy.heading === 'Thanks, puzzlers!', 'heading stays with the URL migration');
assert(dropped.copy.copyrightYear === 2018, 'fixed year stays when the default URL is removed');
assert(dropped.copy.copyright === DEFAULT_THANK_YOU_COPY.copyright, 'default notice loses the URL');
assert(!dropped.copy.copyright.includes('youtube'), 'migrated default has no URL');
const customUrl = migrateStoredCopy({
  brand: '@iqexploratorium',
  copyright: 'Copyright © {year} My House (https://m.youtube.com/@iqexploratorium). Custom.',
  copyrightYear: 'auto',
});
assert(
  customUrl.copy.copyright.includes('https://m.youtube.com/@iqexploratorium'),
  'a custom notice that mentions the URL is kept',
);
assert(customUrl.copy.copyright.includes('Custom'), 'custom wording is kept');
const oldFreebie = migrateStoredCopy({
  heading: 'Thanks, puzzlers!',
  brand: '@iqexploratorium',
  freebie: 'Want more puzzles? DM {handle} on Instagram for a free puzzle PDF. No review required.',
  review:
    'Enjoyed the puzzles? Please consider leaving an honest review on Amazon. Your feedback helps us create better puzzle books!',
  copyrightYear: 'auto',
});
assert(oldFreebie.copy.freebieTitle === 'Want more puzzles?', 'old freebie gains a heading');
assert(
  oldFreebie.copy.freebie === DEFAULT_THANK_YOU_COPY.freebie,
  'untouched freebie drops the extra sentence',
);
assert(oldFreebie.copy.reviewTitle === 'Enjoyed the puzzles?', 'old review gains a heading');
assert(oldFreebie.copy.review === DEFAULT_THANK_YOU_COPY.review, 'untouched review is the new lines');
assert(oldFreebie.copy.heading === 'Thanks, puzzlers!', 'edited heading stays with the copy update');
const customFreebie = migrateStoredCopy({
  brand: '@iqexploratorium',
  freebie: 'DM {handle} any time for extra mazes.',
  freebieTitle: 'More from us',
  review: 'A custom review sentence.',
  reviewTitle: 'Hello',
  copyrightYear: 'auto',
});
assert(customFreebie.copy.freebie === 'DM {handle} any time for extra mazes.', 'custom freebie stays');
assert(customFreebie.copy.freebieTitle === 'More from us', 'custom freebie heading stays');
assert(customFreebie.copy.review === 'A custom review sentence.', 'custom review stays');
const linesOf = (role: string, size: { w: number; h: number } = { w: 5, h: 8 }) =>
  layoutThankYou({
    pageW: size.w,
    pageH: size.h,
    copy: DEFAULT_THANK_YOU_COPY,
    artAspect: ART,
    measure,
    now: now2026,
  }).lines.filter((line) => line.role === role).map((line) => line.text);
assert(linesOf('heading').join('|') === 'Thank you for exploring!', 'heading is one line on 5x8');
assert(linesOf('intro').join('|') === 'We hope you enjoyed these puzzles!', 'intro is one line on 5x8');
assert(linesOf('reviewTitle').join('|') === 'Enjoyed the puzzles?', 'review heading is one line');
assert(
  linesOf('review').join('|') ===
    'Please leave an honest review on Amazon.|Your feedback helps us make better books.',
  'each review sentence is one line',
);
assert(linesOf('freebieTitle').join('|') === 'Want more puzzles?', 'freebie heading is one line');
assert(
  linesOf('freebie').join('|') ===
    'Get a free puzzle PDF.|Follow and DM @iqexploratorium on Instagram.',
  'each freebie sentence is one line',
);
const fiveByEight = layoutThankYou({
  pageW: 5,
  pageH: 8,
  copy: DEFAULT_THANK_YOU_COPY,
  artAspect: ART,
  measure,
  now: now2026,
});
const brandBottom = Math.max(
  ...fiveByEight.boxes.filter((box) => box.role === 'brand').map((box) => box.y + box.h),
);
const legalTop = Math.min(
  ...fiveByEight.boxes.filter((box) => box.role === 'copyright').map((box) => box.y),
);
assert(legalTop - brandBottom >= 0.3, `copyright sits clear of the handle (${(legalTop - brandBottom).toFixed(2)}in)`);
const legalBottom = Math.max(
  ...fiveByEight.boxes.filter((box) => box.role === 'copyright').map((box) => box.y + box.h),
);
assert(legalBottom <= 8 - fiveByEight.margin + 0.02, 'copyright stays inside the 5x8 margin');
assert(
  linesOf('copyright').join('|') ===
    'Copyright © 2026 IQ EXPLORATORIUM.|All rights reserved.|No reproduction or distribution|without prior written permission.',
  'copyright is deliberate lines',
);
for (const size of Object.values(TRIMS)) {
  for (const role of ['heading', 'intro', 'reviewTitle', 'review', 'freebieTitle', 'freebie', 'closing', 'copyright'] as const) {
    const parts = linesOf(role, size);
    assert(parts.length > 0, `${role} missing on ${size.w}`);
    assert(parts.every((line) => !line.includes(' ' ) || line.length < 80), `${role} line exploded`);
  }
}
const laid2027 = layoutThankYou({
  pageW: 6,
  pageH: 9,
  copy: DEFAULT_THANK_YOU_COPY,
  artAspect: ART,
  measure,
  now: now2027,
});
assert(
  laid2027.lines.some((line) => line.role === 'copyright' && line.text.includes('2027')),
  'layout prints 2027 when the clock says 2027',
);
assert(!laid2027.lines.some((line) => line.text.includes('2026')), '2026 is not left on the 2027 page');
assert(!resolveThankYouText(DEFAULT_THANK_YOU_COPY, now2026).copyright.includes('{handle}'), 'tokens');
assert(printHandle('iqexploratorium') === '@iqexploratorium', 'handle gains @');
assert(printHandle('  bad handle! ') === '@badhandle', 'handle strips spaces');
assert(printHandle('') === '@iqexploratorium', 'empty handle falls back');

checkLayout(DEFAULT_THANK_YOU_COPY, 'default');
checkLayout(
  {
    ...DEFAULT_THANK_YOU_COPY,
    review: 'Please leave an honest review on Amazon.\nThank you for reading this book.',
  },
  'extra line',
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
