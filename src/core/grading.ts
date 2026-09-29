import type { Quality, Settings } from './types';

export const DONT_KNOW_QUALITY: Quality = 1;
export const CORRECTION_QUALITY: Quality = 2;

/**
 * Maps how fast the listener signalled "I know it" to an SM-2 quality.
 * reactionMs is measured from the moment the question finished playing;
 * a press while the question is still playing counts as 0.
 */
export function qualityFromReaction(
  reactionMs: number | null,
  { fastMs, mediumMs, thinkMs }: Pick<Settings, 'fastMs' | 'mediumMs' | 'thinkMs'>,
): Quality {
  if (reactionMs == null || reactionMs > thinkMs) return DONT_KNOW_QUALITY;
  if (reactionMs <= fastMs) return 5;
  if (reactionMs <= mediumMs) return 4;
  return 3;
}

export const QUALITY_LABEL: Record<Quality, string> = {
  0: 'Blackout',
  1: "Didn't know",
  2: 'Wrong',
  3: 'Hard',
  4: 'Good',
  5: 'Easy',
};

const DONT_KNOW_PHRASES = /\b(don'?t know|do not know|no idea|pass|skip|no)\b/;
const KNOW_PHRASES = /\b(yes|got it|know it|i know|okay|ok)\b/;

/** Classifies a recognised phrase for the "say it" don't-know signal. */
export function classifyUtterance(text: string): 'know' | 'dontknow' | null {
  const t = text.toLowerCase();
  if (DONT_KNOW_PHRASES.test(t)) return 'dontknow';
  if (KNOW_PHRASES.test(t)) return 'know';
  return null;
}
