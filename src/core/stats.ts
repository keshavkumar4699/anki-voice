// Study statistics. Pure functions over cards and review-log rows.
import { isNew } from './queue';
import { DAY_MS } from './sm2';
import type { Card, Quality } from './types';

export interface ReviewRow {
  ts: number;
  quality: Quality;
  reactionMs: number | null;
  sameDayRepeat: boolean;
}

/** Local-midnight epoch ms for the day containing `ts`. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Consecutive days with at least one review, ending today (or yesterday if nothing yet today). */
export function streak(reviews: Pick<ReviewRow, 'ts'>[], now: number): number {
  const days = new Set(reviews.map((r) => startOfDay(r.ts)));
  let day = startOfDay(now);
  if (!days.has(day)) day = startOfDay(day - DAY_MS / 2);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = startOfDay(day - DAY_MS / 2);
  }
  return n;
}

/** Share of scheduled (non-repeat) reviews that were recalled (quality >= 3). Null without data. */
export function retention(reviews: ReviewRow[], since: number): number | null {
  const scored = reviews.filter((r) => r.ts >= since && !r.sameDayRepeat);
  if (!scored.length) return null;
  return scored.filter((r) => r.quality >= 3).length / scored.length;
}

/** Cards due on each of the next `days` days; index 0 includes everything overdue. New cards are excluded. */
export function forecast(cards: Card[], now: number, days = 7): number[] {
  const out = new Array<number>(days).fill(0);
  const today = startOfDay(now);
  for (const c of cards) {
    if (isNew(c)) continue;
    const idx = Math.max(0, Math.floor((startOfDay(c.due) - today) / DAY_MS));
    if (idx < days) out[idx]++;
  }
  return out;
}

export interface SessionSummary {
  total: number;
  recalled: number;
  forgotten: number;
  byQuality: Record<Quality, number>;
  avgReactionMs: number | null;
}

export function summarize(results: { quality: Quality; reactionMs: number | null }[]): SessionSummary {
  const byQuality: Record<Quality, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const times: number[] = [];
  for (const r of results) {
    byQuality[r.quality]++;
    if (r.reactionMs != null && r.quality >= 3) times.push(r.reactionMs);
  }
  const recalled = results.filter((r) => r.quality >= 3).length;
  return {
    total: results.length,
    recalled,
    forgotten: results.length - recalled,
    byQuality,
    avgReactionMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
  };
}

/** Rough listening time: question + think window + answer + gap. */
export function estimateMinutes(cardCount: number, thinkMs: number): number {
  return Math.max(1, Math.round((cardCount * (9000 + thinkMs * 0.5)) / 60000));
}
