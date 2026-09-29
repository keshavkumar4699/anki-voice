// SM-2 spaced repetition (SuperMemo 2, Wozniak 1987).
// Quality q is 0..5:
//   5 perfect, instant recall      2 wrong, but the answer felt familiar
//   4 correct after a hesitation   1 wrong, answer barely recognised
//   3 correct with serious effort  0 total blackout
import type { Quality, SrsState } from './types';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_EF = 1.3;

export function newSrsState(now: number): SrsState {
  return { ef: 2.5, reps: 0, interval: 0, due: now, lapses: 0, lastReview: null, lastQuality: null };
}

export function nextEf(ef: number, q: Quality): number {
  const d = 5 - q;
  return Math.max(MIN_EF, ef + (0.1 - d * (0.08 + d * 0.02)));
}

/** Returns the state after reviewing with quality q. Does not mutate the input. */
export function review(state: SrsState, q: Quality, now: number): SrsState {
  if (!Number.isInteger(q) || q < 0 || q > 5) throw new RangeError(`quality must be 0..5, got ${q}`);
  let { reps, interval, lapses } = state;

  if (q < 3) {
    reps = 0;
    interval = 1;
    lapses += 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * state.ef);
  }

  return {
    ef: nextEf(state.ef, q),
    reps,
    interval,
    lapses,
    due: now + interval * DAY_MS,
    lastReview: now,
    lastQuality: q,
  };
}

/**
 * SM-2 rule: after the day's session, repeat every item that scored below 4
 * until it scores at least 4. Those repeats do not change the schedule.
 */
export function needsRepeatToday(q: Quality): boolean {
  return q < 4;
}
