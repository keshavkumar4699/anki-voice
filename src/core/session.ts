// Podcast session as a pure reducer: (state, event) -> { state, effects }.
// The runner (src/session/runner.ts) performs the effects (speech, timers,
// beeps, saving grades) and feeds results back in as events. Every phase that
// waits on speech or a timer gets a fresh `token`; events carrying a stale
// token are ignored, so late callbacks from a cancelled phase can't leak.
import { CORRECTION_QUALITY, DONT_KNOW_QUALITY, qualityFromReaction } from './grading';
import { needsRepeatToday } from './sm2';
import type { GradeSignal, Quality, Settings } from './types';

export interface SessionItem {
  cardId: string;
  question: string;
  answer: string;
  /** Same-day repeat (SM-2 "repeat until >= 4"): graded but not rescheduled. */
  repeat: number;
}

export type Phase =
  | 'idle'
  | 'question' // question is being read
  | 'thinking' // think window running
  | 'awaitDouble' // first press seen, waiting to see if a second one follows
  | 'answer' // answer is being read
  | 'correction' // short window after the answer to say "I was wrong"
  | 'gap' // pause before the next card
  | 'paused'
  | 'done';

export interface PendingGrade {
  quality: Quality;
  reactionMs: number | null;
  signal: GradeSignal;
}

export interface SessionState {
  phase: Phase;
  items: SessionItem[];
  pos: number;
  token: number;
  thinkStartedAt: number | null;
  firstPressReaction: number | null; // reaction of the first press while in awaitDouble
  pending: PendingGrade | null;
  settings: Settings;
}

export type SessionEvent =
  | { type: 'START' }
  | { type: 'TTS_DONE'; token: number; at: number }
  | { type: 'TIMEOUT'; token: number; at: number }
  | { type: 'PRESS'; at: number } // play/pause on headphones, lock screen, or the big on-screen button
  | { type: 'NEXT'; at: number } // next-track button
  | { type: 'PREV'; at: number } // previous-track button: repeat
  | { type: 'VOICE'; kind: 'know' | 'dontknow'; at: number }
  | { type: 'DONT_KNOW'; at: number } // on-screen button
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' };

export type SessionEffect =
  | { type: 'speak'; text: string; token: number }
  | { type: 'stopSpeech' }
  | { type: 'timer'; ms: number; token: number }
  | { type: 'beep' }
  | { type: 'listen'; on: boolean }
  | { type: 'grade'; item: SessionItem; grade: PendingGrade }
  | { type: 'nowPlaying'; title: string; subtitle: string }
  | { type: 'done' };

export interface Step {
  state: SessionState;
  effects: SessionEffect[];
}

export function createSession(items: Omit<SessionItem, 'repeat'>[], settings: Settings): SessionState {
  return {
    phase: 'idle',
    items: items.map((i) => ({ ...i, repeat: 0 })),
    pos: 0,
    token: 0,
    thinkStartedAt: null,
    firstPressReaction: null,
    pending: null,
    settings,
  };
}

export function currentItem(s: SessionState): SessionItem | null {
  return s.items[s.pos] ?? null;
}

export function reduce(s: SessionState, e: SessionEvent): Step {
  if (e.type === 'STOP') return stop(s);

  switch (s.phase) {
    case 'idle':
      return e.type === 'START' ? enterQuestion(s, 0) : noop(s);

    case 'paused':
      if (e.type === 'RESUME' || e.type === 'PRESS') return enterQuestion(s, s.pos);
      return noop(s);

    case 'question':
      if (e.type === 'TTS_DONE' && e.token === s.token) return enterThinking(s, e.at);
      if (e.type === 'PRESS') return press(s, 0);
      return common(s, e);

    case 'thinking':
      if (e.type === 'TIMEOUT' && e.token === s.token) return dontKnow(s, 'timeout');
      if (e.type === 'PRESS') return press(s, Math.max(0, e.at - (s.thinkStartedAt ?? e.at)));
      return common(s, e);

    case 'awaitDouble':
      if (e.type === 'PRESS') return dontKnow(s, 'double');
      if (e.type === 'TIMEOUT' && e.token === s.token) return know(s, s.firstPressReaction ?? 0, 'press');
      return common(s, e);

    case 'answer':
      if (e.type === 'TTS_DONE' && e.token === s.token) {
        const p = s.pending!;
        if (s.settings.correctionMs > 0 && p.quality >= 3) {
          const token = s.token + 1;
          return { state: { ...s, phase: 'correction', token }, effects: [{ type: 'timer', ms: s.settings.correctionMs, token }] };
        }
        return finalize(s);
      }
      if (e.type === 'PRESS' && s.pending && s.pending.quality >= 3) {
        // Pressed while hearing the answer: "I thought I knew it, but no."
        return { state: { ...s, pending: { ...s.pending, quality: CORRECTION_QUALITY, signal: 'correction' } }, effects: [] };
      }
      if (e.type === 'NEXT') return finalize({ ...s }, [{ type: 'stopSpeech' }]);
      if (e.type === 'PREV') return speakAnswer(s);
      if (e.type === 'PAUSE') return finalize(s, [{ type: 'stopSpeech' }], true);
      return noop(s);

    case 'correction':
      if (e.type === 'PRESS') return finalize({ ...s, pending: { ...s.pending!, quality: CORRECTION_QUALITY, signal: 'correction' } });
      if ((e.type === 'TIMEOUT' && e.token === s.token) || e.type === 'NEXT') return finalize(s);
      if (e.type === 'PREV') return speakAnswer(s);
      if (e.type === 'PAUSE') return finalize(s, [], true);
      return noop(s);

    case 'gap':
      if ((e.type === 'TIMEOUT' && e.token === s.token) || e.type === 'NEXT') return enterQuestion(s, s.pos + 1);
      if (e.type === 'PAUSE') return pauseAt(s, s.pos + 1, []);
      return noop(s);

    case 'done':
      return noop(s);
  }
}

// Events handled the same way while a question is open (question/thinking/awaitDouble).
function common(s: SessionState, e: SessionEvent): Step {
  switch (e.type) {
    case 'NEXT':
      return s.settings.dontKnowSignal === 'next' || s.settings.dontKnowSignal === 'double' ? dontKnow(s, 'next') : noop(s);
    case 'DONT_KNOW':
      return dontKnow(s, 'button');
    case 'VOICE':
      if (s.settings.dontKnowSignal !== 'voice') return noop(s);
      if (e.kind === 'dontknow') return dontKnow(s, 'voice');
      return s.phase === 'awaitDouble' ? noop(s) : press(s, s.phase === 'thinking' ? Math.max(0, e.at - (s.thinkStartedAt ?? e.at)) : 0);
    case 'PREV':
      return enterQuestion(s, s.pos);
    case 'PAUSE':
      return pauseAt(s, s.pos, [{ type: 'listen', on: false }]);
    default:
      return noop(s);
  }
}

function press(s: SessionState, reactionMs: number): Step {
  if (s.settings.dontKnowSignal === 'double') {
    const token = s.token + 1;
    return {
      state: { ...s, phase: 'awaitDouble', token, firstPressReaction: reactionMs },
      effects: [{ type: 'stopSpeech' }, { type: 'timer', ms: s.settings.doublePressMs, token }],
    };
  }
  return know(s, reactionMs, 'press');
}

function know(s: SessionState, reactionMs: number, signal: GradeSignal): Step {
  return speakAnswer({ ...s, pending: { quality: qualityFromReaction(reactionMs, s.settings), reactionMs, signal } });
}

function dontKnow(s: SessionState, signal: GradeSignal): Step {
  return speakAnswer({ ...s, pending: { quality: DONT_KNOW_QUALITY, reactionMs: null, signal } });
}

function speakAnswer(s: SessionState): Step {
  const item = currentItem(s)!;
  const token = s.token + 1;
  return {
    state: { ...s, phase: 'answer', token },
    effects: [
      { type: 'stopSpeech' },
      { type: 'listen', on: false },
      { type: 'nowPlaying', title: item.question, subtitle: 'Answer' },
      { type: 'speak', text: item.answer, token },
    ],
  };
}

function enterQuestion(s: SessionState, pos: number): Step {
  if (pos >= s.items.length) return { state: { ...s, phase: 'done', pos }, effects: [{ type: 'done' }] };
  const item = s.items[pos];
  const token = s.token + 1;
  return {
    state: { ...s, phase: 'question', pos, token, pending: null, thinkStartedAt: null, firstPressReaction: null },
    effects: [
      { type: 'stopSpeech' },
      { type: 'nowPlaying', title: item.question, subtitle: `Card ${pos + 1} of ${s.items.length}${item.repeat ? ' · repeat' : ''}` },
      { type: 'speak', text: item.question, token },
    ],
  };
}

function enterThinking(s: SessionState, at: number): Step {
  const token = s.token + 1;
  const effects: SessionEffect[] = [];
  if (s.settings.beep) effects.push({ type: 'beep' });
  if (s.settings.dontKnowSignal === 'voice') effects.push({ type: 'listen', on: true });
  effects.push({ type: 'timer', ms: s.settings.thinkMs, token });
  return { state: { ...s, phase: 'thinking', token, thinkStartedAt: at }, effects };
}

// Emits the grade, queues a same-day repeat if SM-2 asks for one, then waits `gapMs`.
function finalize(s: SessionState, pre: SessionEffect[] = [], pauseAfter = false): Step {
  const item = currentItem(s)!;
  const grade = s.pending!;
  let items = s.items;
  if (needsRepeatToday(grade.quality) && item.repeat < s.settings.maxSameDayRepeats) {
    items = [...items, { ...item, repeat: item.repeat + 1 }];
  }
  const effects: SessionEffect[] = [...pre, { type: 'grade', item, grade }];
  const next = { ...s, items, pending: null };
  if (pauseAfter) return pauseAt(next, s.pos + 1, effects);
  const token = s.token + 1;
  return { state: { ...next, phase: 'gap', token }, effects: [...effects, { type: 'timer', ms: s.settings.gapMs, token }] };
}

function pauseAt(s: SessionState, pos: number, effects: SessionEffect[]): Step {
  return {
    state: { ...s, phase: 'paused', pos, token: s.token + 1, pending: null },
    effects: [...effects, { type: 'stopSpeech' }, { type: 'nowPlaying', title: 'Paused', subtitle: 'Press play to continue' }],
  };
}

function stop(s: SessionState): Step {
  if (s.phase === 'done') return noop(s);
  const effects: SessionEffect[] = [{ type: 'stopSpeech' }, { type: 'listen', on: false }];
  if (s.pending && (s.phase === 'answer' || s.phase === 'correction')) {
    effects.push({ type: 'grade', item: currentItem(s)!, grade: s.pending });
  }
  effects.push({ type: 'done' });
  return { state: { ...s, phase: 'done', token: s.token + 1, pending: null }, effects };
}

function noop(s: SessionState): Step {
  return { state: s, effects: [] };
}
