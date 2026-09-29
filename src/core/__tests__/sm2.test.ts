import { CORRECTION_QUALITY, classifyUtterance, qualityFromReaction } from '../grading';
import { parseBulk } from '../import';
import { buildQueue } from '../queue';
import { DAY_MS, MIN_EF, newSrsState, nextEf, review } from '../sm2';
import type { Card } from '../types';

const NOW = Date.UTC(2026, 0, 1);

describe('SM-2', () => {
  test('intervals go 1 -> 6 -> round(6 * EF)', () => {
    let s = newSrsState(NOW);
    s = review(s, 4, NOW);
    expect(s.interval).toBe(1);
    s = review(s, 4, NOW);
    expect(s.interval).toBe(6);
    const ef = s.ef;
    s = review(s, 4, NOW);
    expect(s.interval).toBe(Math.round(6 * ef));
    expect(s.reps).toBe(3);
    expect(s.due).toBe(NOW + s.interval * DAY_MS);
  });

  test('quality < 3 resets repetitions and counts a lapse', () => {
    let s = newSrsState(NOW);
    s = review(review(review(s, 5, NOW), 5, NOW), 5, NOW);
    s = review(s, 2, NOW);
    expect(s.reps).toBe(0);
    expect(s.interval).toBe(1);
    expect(s.lapses).toBe(1);
  });

  test('EF changes by the SM-2 formula and never drops below 1.3', () => {
    expect(nextEf(2.5, 5)).toBeCloseTo(2.6);
    expect(nextEf(2.5, 4)).toBeCloseTo(2.5);
    expect(nextEf(2.5, 3)).toBeCloseTo(2.36);
    let ef = 2.5;
    for (let i = 0; i < 20; i++) ef = nextEf(ef, 0);
    expect(ef).toBe(MIN_EF);
  });

  test('rejects invalid quality', () => {
    expect(() => review(newSrsState(NOW), 6 as never, NOW)).toThrow(RangeError);
  });
});

describe('reaction time -> quality', () => {
  const t = { fastMs: 2500, mediumMs: 5000, thinkMs: 10000 };
  test.each([
    [0, 5],
    [2500, 5],
    [2501, 4],
    [5000, 4],
    [5001, 3],
    [10000, 3],
    [10001, 1],
    [null, 1],
  ])('%p ms -> %p', (ms, q) => {
    expect(qualityFromReaction(ms, t)).toBe(q);
  });

  test('correction quality counts as a lapse', () => {
    expect(review(newSrsState(NOW), CORRECTION_QUALITY, NOW).lapses).toBe(1);
  });
});

describe('voice classification', () => {
  test.each([
    ["I don't know", 'dontknow'],
    ['pass', 'dontknow'],
    ['no', 'dontknow'],
    ['yes', 'know'],
    ['I know', 'know'],
    ['banana', null],
  ])('%p -> %p', (text, kind) => {
    expect(classifyUtterance(text)).toBe(kind);
  });
});

describe('queue', () => {
  const card = (id: string, over: Partial<Card>): Card => ({
    id,
    deckId: 'default',
    question: id,
    answer: id,
    created: NOW,
    ...newSrsState(NOW),
    ...over,
  });

  test('due reviews first (most overdue first), then capped new cards', () => {
    const cards = [
      card('new1', { created: NOW + 1 }),
      card('new2', { created: NOW + 2 }),
      card('later', { lastReview: NOW - DAY_MS, due: NOW + DAY_MS }),
      card('due1', { lastReview: NOW - 5 * DAY_MS, due: NOW - DAY_MS }),
      card('due2', { lastReview: NOW - 5 * DAY_MS, due: NOW - 3 * DAY_MS }),
    ];
    const q = buildQueue(cards, { maxNewPerSession: 1, maxPerSession: 10 }, NOW);
    expect(q.map((c) => c.id)).toEqual(['due2', 'due1', 'new1']);
  });
});

describe('bulk import', () => {
  test('parses Anki plain-text export and semicolon lines', () => {
    const text = [
      '#separator:tab',
      '#html:true',
      'Capital of France?\t<b>Paris</b>',
      '"Quoted"\t"x &amp; y"',
      'H2O ; water',
      'no separator here',
      '',
    ].join('\n');
    expect(parseBulk(text)).toEqual([
      { question: 'Capital of France?', answer: 'Paris' },
      { question: 'Quoted', answer: 'x & y' },
      { question: 'H2O', answer: 'water' },
    ]);
  });
});
