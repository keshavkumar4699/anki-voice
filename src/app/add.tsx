import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ensureMicPermission, listenOnce, recognitionAvailable, speak, stopSpeaking } from '@/adapters/speech';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipRow, Field, Icon, IconButton, Screen, Section, Surface } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { DEFAULT_DECK_ID } from '@/core/types';
import { addCards, listDecks } from '@/data/db';
import { useData } from '@/hooks/use-data';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/state/settings';

type Target = 'question' | 'answer';

const isStop = (t: string) => /^(stop|done|exit|finish|quit)\b/i.test(t.trim());
const isSave = (t: string) => /\b(save|yes|yeah|ok|okay|correct|keep)\b/i.test(t);

export default function AddScreen() {
  const theme = useTheme();
  const { settings } = useSettings();
  const params = useLocalSearchParams<{ deck?: string }>();
  const [decks] = useData(listDecks, []);
  const [deckId, setDeckId] = useState(params.deck ?? DEFAULT_DECK_ID);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [listening, setListening] = useState<Target | null>(null);
  const [handsFree, setHandsFree] = useState(false);
  const [status, setStatus] = useState('');
  const [saved, setSaved] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);
  const cancelled = useRef(false);
  const deckRef = useRef(deckId);
  useEffect(() => {
    deckRef.current = deckId; // read by the hands-free loop, which outlives renders
  }, [deckId]);

  useEffect(
    () => () => {
      cancelled.current = true;
      stopRef.current?.();
      stopSpeaking();
    },
    [],
  );

  const micAvailable = recognitionAvailable();

  async function dictate(target: Target) {
    if (listening) {
      stopRef.current?.();
      return;
    }
    if (!(await ensureMicPermission())) return Alert.alert('Microphone needed', 'Allow microphone access to add cards by voice.');
    const set = target === 'question' ? setQuestion : setAnswer;
    const before = (target === 'question' ? question : answer).trim();
    const join = (t: string) => (before ? `${before} ${t}` : t);
    setListening(target);
    const l = listenOnce(settings.language, (t) => set(join(t)));
    stopRef.current = l.stop;
    try {
      const text = await l.result;
      if (text) set(join(text));
    } catch (e) {
      Alert.alert('Voice input failed', (e as Error).message);
    } finally {
      setListening(null);
      stopRef.current = null;
    }
  }

  async function save() {
    if (!question.trim() || !answer.trim()) return;
    await addCards([{ question, answer }], deckId);
    setSaved((n) => n + 1);
    setQuestion('');
    setAnswer('');
  }

  // Hands-free: the app asks for the question and answer, reads the card back,
  // and saves it when you say "save". Say "stop" at any prompt to finish.
  async function runHandsFree() {
    if (!(await ensureMicPermission())) return Alert.alert('Microphone needed', 'Allow microphone access to add cards by voice.');
    setHandsFree(true);
    cancelled.current = false;
    const say = (t: string) => speak(t, settings);
    const hear = async (label: string) => {
      setStatus(label);
      const l = listenOnce(settings.language);
      stopRef.current = l.stop;
      const t = await l.result.catch(() => '');
      stopRef.current = null;
      return t;
    };

    try {
      while (!cancelled.current) {
        await say('Question?');
        if (cancelled.current) break;
        const q = await hear('Listening for the question…');
        if (cancelled.current || isStop(q)) break;
        if (!q) {
          await say("I didn't catch that.");
          continue;
        }
        setQuestion(q);
        setAnswer('');
        await say('Answer?');
        if (cancelled.current) break;
        const a = await hear('Listening for the answer…');
        if (cancelled.current || isStop(a)) break;
        if (!a) {
          await say("I didn't catch the answer. Let's try that card again.");
          continue;
        }
        setAnswer(a);
        await say(`${q}. ${a}. Say save, or redo.`);
        if (cancelled.current) break;
        const confirm = await hear('Say “save” or “redo”…');
        if (cancelled.current || isStop(confirm)) break;
        if (isSave(confirm)) {
          await addCards([{ question: q, answer: a }], deckRef.current);
          setSaved((n) => n + 1);
          await say('Saved.');
        } else {
          await say('Discarded.');
        }
        setQuestion('');
        setAnswer('');
      }
      if (!cancelled.current) await say('Done.');
    } finally {
      setHandsFree(false);
      setStatus('');
    }
  }

  function stopHandsFree() {
    cancelled.current = true;
    stopRef.current?.();
    stopSpeaking();
  }

  const mic = (target: Target) =>
    micAvailable ? (
      <IconButton
        icon={listening === target ? 'square' : 'mic'}
        label={listening === target ? 'Stop dictation' : `Dictate ${target}`}
        active={listening === target}
        size={36}
        disabled={handsFree || (listening !== null && listening !== target)}
        onPress={() => void dictate(target)}
      />
    ) : null;

  return (
    <Screen>
      <Section title="Deck">
        <ChipRow>
          {(decks ?? []).map((d) => (
            <Chip key={d.id} label={d.name} selected={d.id === deckId} onPress={() => setDeckId(d.id)} />
          ))}
          <Chip label="New deck" icon="plus" onPress={() => router.push('/decks')} />
        </ChipRow>
      </Section>

      {!micAvailable ? (
        <Surface muted style={{ flexDirection: 'row', gap: Spacing.three }}>
          <Icon name="mic-off" size={18} color="textSecondary" />
          <ThemedText variant="small" color="textSecondary" style={{ flex: 1 }}>
            Speech recognition isn&apos;t available on this device. Enable Google speech services to dictate cards.
          </ThemedText>
        </Surface>
      ) : null}

      <View style={{ gap: Spacing.three }}>
        <Field label="Question" value={question} onChangeText={setQuestion} multiline placeholder="What do you want to remember?" right={mic('question')} />
        <Field label="Answer" value={answer} onChangeText={setAnswer} multiline placeholder="The answer, as you'd like to hear it" right={mic('answer')} />
        {listening ? (
          <ThemedText variant="small" color="accent">
            Listening… tap the square when you&apos;re done.
          </ThemedText>
        ) : null}
        <Button variant="primary" title="Save card" icon="check" onPress={() => void save()} disabled={!question.trim() || !answer.trim() || handsFree} />
        {saved ? (
          <ThemedText variant="small" color="textSecondary" style={{ textAlign: 'center' }}>
            {saved} card{saved === 1 ? '' : 's'} added
          </ThemedText>
        ) : null}
      </View>

      <Section title="Hands-free">
        <Surface style={{ gap: Spacing.three }}>
          <View style={{ flexDirection: 'row', gap: Spacing.three }}>
            <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
              <Icon name="headphones" size={18} color="accent" />
            </View>
            <ThemedText variant="small" color="textSecondary" style={{ flex: 1 }}>
              The app asks for a question, then its answer, and reads the card back. Say “save” to keep it, “redo” to discard it, or “stop” to finish.
            </ThemedText>
          </View>
          {status ? (
            <ThemedText variant="smallStrong" color="accent">
              {status}
            </ThemedText>
          ) : null}
          {handsFree ? (
            <Button variant="danger" icon="square" title="Stop hands-free" onPress={stopHandsFree} />
          ) : (
            <Button icon="play" title="Start hands-free" onPress={() => void runHandsFree()} disabled={!micAvailable || listening !== null} />
          )}
        </Surface>
      </Section>

      <Button variant="ghost" icon="upload" title="Import many cards at once" onPress={() => router.push({ pathname: '/import', params: { deck: deckId } })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
