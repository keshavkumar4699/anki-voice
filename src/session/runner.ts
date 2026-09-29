// Runs a podcast session: feeds events into the pure reducer (src/core/session)
// and performs its effects with the Android adapters.
import { PodcastControls, type RemoteAction } from '../../modules/podcast-controls';
import { speak, stopSpeaking, listenContinuously } from '@/adapters/speech';
import { classifyUtterance } from '@/core/grading';
import { createSession, currentItem, reduce, type PendingGrade, type SessionEffect, type SessionEvent, type SessionState } from '@/core/session';
import { review } from '@/core/sm2';
import type { Card, Quality, Settings, SrsState } from '@/core/types';
import { logReview, saveSrsState, updateReviewQuality } from '@/data/db';

export interface GradeResult {
  cardId: string;
  question: string;
  grade: PendingGrade;
  repeat: boolean;
  before: SrsState;
  after: SrsState;
  logId: number;
}

export interface RunnerSnapshot {
  session: SessionState;
  last: GradeResult | null;
  /** Every graded answer this session, including same-day repeats. */
  results: { quality: Quality; reactionMs: number | null; repeat: boolean }[];
  practice: boolean;
  title: string;
}

export interface RunnerOptions {
  /** Practice mode: nothing is saved and no card is rescheduled. */
  practice?: boolean;
  /** Shown in the notification, e.g. the deck name. */
  title?: string;
}

export class PodcastRunner {
  private session: SessionState;
  private cards = new Map<string, Card>();
  private last: GradeResult | null = null;
  private results: RunnerSnapshot['results'] = [];
  private readonly practice: boolean;
  private readonly title: string;
  private listeners = new Set<() => void>();
  private subs: { remove(): void }[] = [];
  private jsTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private stopListening: (() => void) | null = null;
  private pausedByInterrupt = false;
  private snapshot: RunnerSnapshot;

  constructor(
    cards: Card[],
    private settings: Settings,
    options: RunnerOptions = {},
  ) {
    this.practice = options.practice ?? false;
    this.title = options.title ?? 'Anki Voice';
    cards.forEach((c) => this.cards.set(c.id, c));
    this.session = createSession(
      cards.map((c) => ({ cardId: c.id, question: c.question, answer: c.answer })),
      settings,
    );
    this.snapshot = this.makeSnapshot();
  }

  // --- UI binding (useSyncExternalStore) ---
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  start() {
    if (PodcastControls) {
      this.subs.push(
        PodcastControls.addListener('onRemote', (e) => this.onRemote(e.action, e.ageMs)),
        PodcastControls.addListener('onTimer', (e) => this.dispatch({ type: 'TIMEOUT', token: e.token, at: Date.now() })),
      );
      PodcastControls.start(this.title, `${this.session.items.length} cards`);
    }
    this.dispatch({ type: 'START' });
  }

  dispatch = (e: SessionEvent) => {
    const step = reduce(this.session, e);
    this.session = step.state;
    step.effects.forEach((fx) => this.run(fx));
    this.emit();
  };

  press = () => this.dispatch({ type: 'PRESS', at: Date.now() });
  dontKnow = () => this.dispatch({ type: 'DONT_KNOW', at: Date.now() });
  repeat = () => this.dispatch({ type: 'PREV', at: Date.now() });
  next = () => this.dispatch({ type: 'NEXT', at: Date.now() });
  pause = () => this.dispatch({ type: 'PAUSE' });
  resume = () => this.dispatch({ type: 'RESUME' });
  stop = () => this.dispatch({ type: 'STOP' });

  /** Replace the grade of the most recently graded card (e.g. the timing guessed wrong). */
  async overrideLast(quality: Quality) {
    const last = this.last;
    if (!last || last.grade.quality === quality) return;
    const idx = this.results.length - 1;
    if (idx >= 0) this.results[idx] = { ...this.results[idx], quality };
    if (this.practice) {
      this.last = { ...last, grade: { ...last.grade, quality, signal: 'button' } };
      this.emit();
      return;
    }
    const now = Date.now();
    const after = last.repeat ? last.before : review(last.before, quality, now);
    await saveSrsState(last.cardId, after);
    if (last.logId >= 0) await updateReviewQuality(last.logId, quality);
    const card = this.cards.get(last.cardId);
    if (card) this.cards.set(last.cardId, { ...card, ...after });
    this.last = { ...last, grade: { ...last.grade, quality, signal: 'button' }, after };
    this.emit();
  }

  private onRemote(action: RemoteAction, ageMs: number) {
    const at = Date.now() - ageMs;
    switch (action) {
      case 'press':
        return this.dispatch({ type: 'PRESS', at });
      case 'next':
        return this.dispatch({ type: 'NEXT', at });
      case 'previous':
        return this.dispatch({ type: 'PREV', at });
      case 'stop':
        return this.dispatch({ type: 'STOP' });
      case 'interrupt':
        // Phone call, alarm or another media app took audio focus. The speech
        // recognizer also takes focus, so ignore losses while we're listening.
        if (this.stopListening) return;
        if (this.session.phase !== 'paused' && this.session.phase !== 'done') {
          this.pausedByInterrupt = true;
          this.dispatch({ type: 'PAUSE' });
        }
        return;
      case 'focusGain':
        if (this.pausedByInterrupt && this.session.phase === 'paused') {
          this.pausedByInterrupt = false;
          this.dispatch({ type: 'RESUME' });
        }
        return;
    }
  }

  private run(fx: SessionEffect) {
    switch (fx.type) {
      case 'speak':
        void speak(fx.text, this.settings).then(() => this.dispatch({ type: 'TTS_DONE', token: fx.token, at: Date.now() }));
        return;
      case 'stopSpeech':
        stopSpeaking();
        return;
      case 'timer':
        // Native timers keep running when the screen is off; JS timers don't.
        if (PodcastControls) PodcastControls.setTimer(fx.token, fx.ms);
        else this.jsTimers.set(fx.token, setTimeout(() => this.dispatch({ type: 'TIMEOUT', token: fx.token, at: Date.now() }), fx.ms));
        return;
      case 'beep':
        PodcastControls?.beep(150);
        return;
      case 'listen':
        this.stopListening?.();
        this.stopListening = null;
        if (fx.on) {
          this.stopListening = listenContinuously(this.settings.language, (text) => {
            const kind = classifyUtterance(text);
            if (kind) this.dispatch({ type: 'VOICE', kind, at: Date.now() });
          });
        }
        return;
      case 'grade':
        void this.applyGrade(fx.item.cardId, fx.item.question, fx.item.repeat > 0, fx.grade).catch((err) =>
          console.warn('Failed to save review', err),
        );
        return;
      case 'nowPlaying':
        PodcastControls?.update(fx.title, fx.subtitle);
        return;
      case 'done':
        this.cleanup();
        return;
    }
  }

  private async applyGrade(cardId: string, question: string, repeat: boolean, grade: PendingGrade) {
    const card = this.cards.get(cardId);
    if (!card) return;
    const now = Date.now();
    this.results.push({ quality: grade.quality, reactionMs: grade.reactionMs, repeat });
    if (this.practice) {
      this.last = { cardId, question, grade, repeat, before: card, after: card, logId: -1 };
      this.emit();
      return;
    }
    // Same-day repeats are logged but don't reschedule (SM-2 rule).
    const after = repeat ? card : review(card, grade.quality, now);
    // Record the result before the async writes so the UI and a quick override see it.
    this.last = { cardId, question, grade, repeat, before: card, after, logId: -1 };
    this.emit();
    if (!repeat) {
      this.cards.set(cardId, { ...card, ...after });
      await saveSrsState(cardId, after);
    }
    const logId = await logReview({ cardId, ts: now, quality: grade.quality, reactionMs: grade.reactionMs, signal: grade.signal, sameDayRepeat: repeat });
    if (this.last?.cardId === cardId && this.last.logId === -1) this.last = { ...this.last, logId };
  }

  private cleanup() {
    this.stopListening?.();
    this.stopListening = null;
    stopSpeaking();
    this.jsTimers.forEach(clearTimeout);
    this.jsTimers.clear();
    PodcastControls?.stop();
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }

  private makeSnapshot(): RunnerSnapshot {
    return { session: this.session, last: this.last, results: [...this.results], practice: this.practice, title: this.title };
  }

  private emit() {
    this.snapshot = this.makeSnapshot();
    this.listeners.forEach((fn) => fn());
  }
}

export { currentItem };

// The one active session, so the session screen and Home can find it.
let active: PodcastRunner | null = null;
export const getActiveRunner = () => active;
export function setActiveRunner(r: PodcastRunner | null) {
  active = r;
}
