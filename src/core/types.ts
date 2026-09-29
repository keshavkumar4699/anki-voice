// Shared domain types. Everything under src/core is plain TypeScript with no
// React Native imports so it can be reused by the desktop build later.

export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

export interface SrsState {
  ef: number;
  reps: number;
  interval: number; // days
  due: number; // epoch ms
  lapses: number;
  lastReview: number | null;
  lastQuality: Quality | null;
}

export interface Card extends SrsState {
  id: string;
  deckId: string;
  question: string;
  answer: string;
  created: number;
}

export interface Deck {
  id: string;
  name: string;
  created: number;
}

export const DEFAULT_DECK_ID = 'default';

/** How the listener tells the app "I don't know" before the think window runs out. */
export type DontKnowSignal = 'timeout' | 'double' | 'next' | 'voice';

export interface Settings {
  language: string; // BCP-47, used for TTS and recognition
  voice: string | null; // TTS voice identifier
  rate: number; // TTS speed
  fastMs: number; // press within this after the question ends -> quality 5
  mediumMs: number; // -> quality 4
  thinkMs: number; // -> quality 3; no press by then -> don't know
  doublePressMs: number; // window for detecting a double press
  dontKnowSignal: DontKnowSignal;
  correctionMs: number; // after the answer, a press means "I was actually wrong" (0 disables)
  gapMs: number; // silence between cards
  beep: boolean; // beep when the think window starts
  maxNewPerSession: number;
  maxPerSession: number;
  maxSameDayRepeats: number;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en-US',
  voice: null,
  rate: 1,
  fastMs: 2500,
  mediumMs: 5000,
  thinkMs: 10000,
  doublePressMs: 500,
  dontKnowSignal: 'timeout',
  correctionMs: 3000,
  gapMs: 800,
  beep: true,
  maxNewPerSession: 10,
  maxPerSession: 40,
  maxSameDayRepeats: 3,
};

/** What produced a grade; stored in the review log. */
export type GradeSignal = 'press' | 'timeout' | 'double' | 'next' | 'voice' | 'button' | 'correction';
