import { createSession, reduce, type SessionEffect, type SessionEvent, type SessionState } from '../session';
import { DEFAULT_SETTINGS, type Settings } from '../types';

const ITEMS = [
  { cardId: 'a', question: 'Q a', answer: 'A a' },
  { cardId: 'b', question: 'Q b', answer: 'A b' },
];

/** Drives the reducer and records effects, answering speech/timers on demand. */
function harness(settings: Partial<Settings> = {}, items = ITEMS) {
  let state: SessionState = createSession(items, { ...DEFAULT_SETTINGS, ...settings });
  const effects: SessionEffect[] = [];
  const send = (e: SessionEvent) => {
    const step = reduce(state, e);
    state = step.state;
    effects.push(...step.effects);
    return step.effects;
  };
  return {
    get state() {
      return state;
    },
    effects,
    send,
    ttsDone: (at: number) => send({ type: 'TTS_DONE', token: state.token, at }),
    timeout: (at: number) => send({ type: 'TIMEOUT', token: state.token, at }),
    grades: () => effects.filter((e): e is Extract<SessionEffect, { type: 'grade' }> => e.type === 'grade'),
  };
}

test('fast press after the question -> quality 5, answer read, no repeat', () => {
  const h = harness({ correctionMs: 0 });
  h.send({ type: 'START' });
  expect(h.state.phase).toBe('question');
  h.ttsDone(1000);
  expect(h.state.phase).toBe('thinking');
  h.send({ type: 'PRESS', at: 2000 }); // 1 s reaction
  expect(h.state.phase).toBe('answer');
  expect(h.effects).toContainEqual(expect.objectContaining({ type: 'speak', text: 'A a' }));
  h.ttsDone(3000);
  expect(h.grades()).toHaveLength(1);
  expect(h.grades()[0].grade).toEqual({ quality: 5, reactionMs: 1000, signal: 'press' });
  expect(h.state.items).toHaveLength(2);
  h.timeout(4000);
  expect(h.state.phase).toBe('question');
  expect(h.state.pos).toBe(1);
});

test('press while the question is still playing counts as instant', () => {
  const h = harness({ correctionMs: 0 });
  h.send({ type: 'START' });
  h.send({ type: 'PRESS', at: 500 });
  h.ttsDone(900);
  expect(h.grades()[0].grade.quality).toBe(5);
});

test('slow press -> quality 3 and the card is repeated later today', () => {
  const h = harness({ correctionMs: 0 });
  h.send({ type: 'START' });
  h.ttsDone(0);
  h.send({ type: 'PRESS', at: 8000 });
  h.ttsDone(9000);
  expect(h.grades()[0].grade.quality).toBe(3);
  expect(h.state.items.map((i) => [i.cardId, i.repeat])).toEqual([
    ['a', 0],
    ['b', 0],
    ['a', 1],
  ]);
});

test('think window timeout -> don\'t know', () => {
  const h = harness({ correctionMs: 0 });
  h.send({ type: 'START' });
  h.ttsDone(0);
  h.timeout(10000);
  expect(h.state.phase).toBe('answer');
  h.ttsDone(11000);
  expect(h.grades()[0].grade).toEqual({ quality: 1, reactionMs: null, signal: 'timeout' });
});

test('stale timer tokens are ignored', () => {
  const h = harness();
  h.send({ type: 'START' });
  h.ttsDone(0);
  const staleToken = h.state.token;
  h.send({ type: 'PRESS', at: 1000 });
  h.send({ type: 'TIMEOUT', token: staleToken, at: 10000 });
  expect(h.state.phase).toBe('answer');
  expect(h.state.pending?.quality).toBe(5);
});

test('double press -> don\'t know; single press confirmed after the window', () => {
  const h = harness({ dontKnowSignal: 'double', correctionMs: 0 });
  h.send({ type: 'START' });
  h.ttsDone(0);
  h.send({ type: 'PRESS', at: 3000 });
  expect(h.state.phase).toBe('awaitDouble');
  h.send({ type: 'PRESS', at: 3300 });
  expect(h.state.pending?.signal).toBe('double');
  expect(h.state.pending?.quality).toBe(1);
  h.ttsDone(4000);
  h.timeout(5000); // gap
  h.ttsDone(6000); // question b done
  h.send({ type: 'PRESS', at: 7000 });
  h.timeout(7500); // double window expires
  expect(h.state.pending).toEqual({ quality: 5, reactionMs: 1000, signal: 'press' });
});

test('next-track is a don\'t-know signal only when chosen', () => {
  const off = harness({ dontKnowSignal: 'timeout' });
  off.send({ type: 'START' });
  off.ttsDone(0);
  off.send({ type: 'NEXT', at: 100 });
  expect(off.state.phase).toBe('thinking');

  const on = harness({ dontKnowSignal: 'next' });
  on.send({ type: 'START' });
  on.ttsDone(0);
  on.send({ type: 'NEXT', at: 100 });
  expect(on.state.pending?.signal).toBe('next');
});

test('press in the correction window -> quality 2', () => {
  const h = harness({ correctionMs: 3000 });
  h.send({ type: 'START' });
  h.ttsDone(0);
  h.send({ type: 'PRESS', at: 500 });
  h.ttsDone(2000);
  expect(h.state.phase).toBe('correction');
  h.send({ type: 'PRESS', at: 2500 });
  expect(h.grades()[0].grade).toEqual({ quality: 2, reactionMs: 500, signal: 'correction' });
});

test('no correction window after a don\'t-know', () => {
  const h = harness({ correctionMs: 3000 });
  h.send({ type: 'START' });
  h.send({ type: 'DONT_KNOW', at: 0 });
  h.ttsDone(1000);
  expect(h.state.phase).toBe('gap');
});

test('same-day repeats are capped', () => {
  const h = harness({ correctionMs: 0, maxSameDayRepeats: 2 }, [ITEMS[0]]);
  h.send({ type: 'START' });
  for (let i = 0; i < 3; i++) {
    h.ttsDone(0);
    h.timeout(0); // don't know
    h.ttsDone(0); // answer read
    h.timeout(0); // gap
  }
  expect(h.state.phase).toBe('done');
  expect(h.grades().map((g) => g.item.repeat)).toEqual([0, 1, 2]);
});

test('pause re-asks the current card; resume by press', () => {
  const h = harness();
  h.send({ type: 'START' });
  h.ttsDone(0);
  h.send({ type: 'PAUSE' });
  expect(h.state.phase).toBe('paused');
  h.send({ type: 'PRESS', at: 100 });
  expect(h.state.phase).toBe('question');
  expect(h.state.pos).toBe(0);
});

test('stop during the answer still saves the grade', () => {
  const h = harness();
  h.send({ type: 'START' });
  h.ttsDone(0);
  h.send({ type: 'PRESS', at: 100 });
  h.send({ type: 'STOP' });
  expect(h.state.phase).toBe('done');
  expect(h.grades()).toHaveLength(1);
});

test('voice signal', () => {
  const h = harness({ dontKnowSignal: 'voice', correctionMs: 0 });
  h.send({ type: 'START' });
  const fx = h.ttsDone(0);
  expect(fx).toContainEqual({ type: 'listen', on: true });
  h.send({ type: 'VOICE', kind: 'dontknow', at: 2000 });
  expect(h.state.pending?.signal).toBe('voice');
  expect(h.effects).toContainEqual({ type: 'listen', on: false });
});
