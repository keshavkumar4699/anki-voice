import type { Card, Settings } from './types';

export function isNew(card: Card): boolean {
  return card.lastReview == null;
}

/** Due reviews first (most overdue first), then a capped number of new cards. */
export function buildQueue(cards: Card[], settings: Pick<Settings, 'maxNewPerSession' | 'maxPerSession'>, now: number): Card[] {
  const due = cards.filter((c) => !isNew(c) && c.due <= now).sort((a, b) => a.due - b.due);
  const fresh = cards
    .filter(isNew)
    .sort((a, b) => a.created - b.created)
    .slice(0, settings.maxNewPerSession);
  return [...due, ...fresh].slice(0, settings.maxPerSession);
}

export function countDue(cards: Card[], now: number): { due: number; fresh: number } {
  let due = 0;
  let fresh = 0;
  for (const c of cards) {
    if (isNew(c)) fresh++;
    else if (c.due <= now) due++;
  }
  return { due, fresh };
}

/** Practice ("study ahead"): the cards closest to being due, without touching their schedule. */
export function buildPracticeQueue(cards: Card[], max: number): Card[] {
  return [...cards].sort((a, b) => a.due - b.due).slice(0, max);
}
