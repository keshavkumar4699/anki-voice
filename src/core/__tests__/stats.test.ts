import { DAY_MS, newSrsState } from '../sm2';
import { forecast, retention, startOfDay, streak, summarize } from '../stats';
import type { Card } from '../types';

const NOW = new Date(2026, 5, 15, 14, 0).getTime(); // local time, mid-afternoon

test('streak counts consecutive days ending today', () => {
  const reviews = [0, 1, 2, 4].map((d) => ({ ts: NOW - d * DAY_MS }));
  expect(streak(reviews, NOW)).toBe(3);
});

test('streak still counts when nothing reviewed yet today', () => {
  const reviews = [1, 2].map((d) => ({ ts: NOW - d * DAY_MS }));
  expect(streak(reviews, NOW)).toBe(2);
  expect(streak([], NOW)).toBe(0);
});

test('retention ignores same-day repeats and old reviews', () => {
  const r = [
    { ts: NOW, quality: 5 as const, reactionMs: 1000, sameDayRepeat: false },
    { ts: NOW, quality: 1 as const, reactionMs: null, sameDayRepeat: false },
    { ts: NOW, quality: 1 as const, reactionMs: null, sameDayRepeat: true },
    { ts: NOW - 40 * DAY_MS, quality: 1 as const, reactionMs: null, sameDayRepeat: false },
  ];
  expect(retention(r, NOW - 30 * DAY_MS)).toBe(0.5);
  expect(retention([], 0)).toBeNull();
});

test('forecast buckets due cards by day, overdue into today, skipping new', () => {
  const base = (over: Partial<Card>): Card => ({
    id: 'x',
    deckId: 'default',
    question: '',
    answer: '',
    created: NOW,
    ...newSrsState(NOW),
    ...over,
  });
  const cards = [
    base({ lastReview: NOW, due: NOW - 3 * DAY_MS }),
    base({ lastReview: NOW, due: startOfDay(NOW) + DAY_MS + 1000 }),
    base({ lastReview: NOW, due: NOW + 30 * DAY_MS }),
    base({}),
  ];
  expect(forecast(cards, NOW, 3)).toEqual([1, 1, 0]);
});

test('summarize', () => {
  const s = summarize([
    { quality: 5, reactionMs: 1000 },
    { quality: 3, reactionMs: 3000 },
    { quality: 1, reactionMs: null },
  ]);
  expect(s).toMatchObject({ total: 3, recalled: 2, forgotten: 1, avgReactionMs: 2000 });
  expect(s.byQuality[5]).toBe(1);
});
