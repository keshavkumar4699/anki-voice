import Constants from 'expo-constants';
import { useEffect, useState } from 'react';

import { listVoices, speak } from '@/adapters/speech';
import { ThemedText } from '@/components/themed-text';
import { Button, Field, RadioList, Screen, ScreenTitle, Section, Stepper, Surface, Toggle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { DontKnowSignal } from '@/core/types';
import { useSettings } from '@/state/settings';

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const SIGNALS: { value: DontKnowSignal; label: string; description: string }[] = [
  { value: 'timeout', label: 'Stay silent', description: 'When the think timer runs out, the card counts as not known.' },
  { value: 'double', label: 'Double-press', description: 'Press play/pause twice quickly. Many earbuds send a double tap as next-track, which also works.' },
  { value: 'next', label: 'Next-track button', description: 'Press next-track, or swipe forward on some earbuds.' },
  { value: 'voice', label: 'Say it (experimental)', description: 'Say “don’t know” or “pass”; “yes” counts as knowing it. Uses the microphone and may not work with the screen off.' },
];

const MAX_VOICES = 12;

export default function SettingsScreen() {
  const { settings: s, update } = useSettings();
  const [voices, setVoices] = useState<{ identifier: string; name: string }[]>([]);
  const [showAllVoices, setShowAllVoices] = useState(false);

  useEffect(() => {
    void listVoices(s.language)
      .then(setVoices)
      .catch(() => setVoices([]));
  }, [s.language]);

  const shownVoices = showAllVoices ? voices : voices.slice(0, MAX_VOICES);

  return (
    <Screen topInset>
      <ScreenTitle title="Settings" />

      <Section title="Saying “I don’t know”">
        <Surface style={{ paddingVertical: Spacing.one }}>
          <RadioList value={s.dontKnowSignal} options={SIGNALS} onChange={(dontKnowSignal) => update({ dontKnowSignal })} />
        </Surface>
      </Section>

      <Section title="Recall timing">
        <Surface style={{ paddingVertical: Spacing.one, gap: 0 }}>
          <Stepper first label="Easy within" value={s.fastMs} step={500} min={500} max={s.mediumMs - 500} format={secs} onChange={(fastMs) => update({ fastMs })} />
          <Stepper label="Good within" value={s.mediumMs} step={500} min={s.fastMs + 500} max={s.thinkMs - 500} format={secs} onChange={(mediumMs) => update({ mediumMs })} />
          <Stepper
            label="Hard within"
            hint="After this, the card counts as forgotten"
            value={s.thinkMs}
            step={1000}
            min={s.mediumMs + 1000}
            max={60000}
            format={secs}
            onChange={(thinkMs) => update({ thinkMs })}
          />
          <Stepper
            label="“Wrong after all” window"
            hint="Press after hearing the answer. 0 turns it off"
            value={s.correctionMs}
            step={500}
            min={0}
            max={10000}
            format={secs}
            onChange={(correctionMs) => update({ correctionMs })}
          />
          <Stepper label="Double-press window" value={s.doublePressMs} step={50} min={250} max={1000} format={(v) => `${v}ms`} onChange={(doublePressMs) => update({ doublePressMs })} />
          <Stepper label="Pause between cards" value={s.gapMs} step={200} min={0} max={5000} format={secs} onChange={(gapMs) => update({ gapMs })} />
          <Toggle label="Beep when the timer starts" value={s.beep} onChange={(beep) => update({ beep })} />
        </Surface>
        <ThemedText variant="small" color="textTertiary">
          Timing starts when the question finishes. Pressing while it&apos;s still being read counts as instant.
        </ThemedText>
      </Section>

      <Section title="Sessions">
        <Surface style={{ paddingVertical: Spacing.one, gap: 0 }}>
          <Stepper first label="New cards per session" value={s.maxNewPerSession} step={5} min={0} max={100} onChange={(maxNewPerSession) => update({ maxNewPerSession })} />
          <Stepper label="Cards per session" value={s.maxPerSession} step={5} min={5} max={300} onChange={(maxPerSession) => update({ maxPerSession })} />
          <Stepper
            label="Same-day repeats"
            hint="Cards graded below Good come back later in the session"
            value={s.maxSameDayRepeats}
            step={1}
            min={0}
            max={5}
            onChange={(maxSameDayRepeats) => update({ maxSameDayRepeats })}
          />
        </Surface>
      </Section>

      <Section title="Voice">
        <Field
          label="Language"
          value={s.language}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="e.g. en-US, en-IN, hi-IN"
          onChangeText={(language) => update({ language: language.trim(), voice: null })}
        />
        <Surface style={{ paddingVertical: Spacing.one, gap: 0 }}>
          <Stepper first label="Speaking speed" value={s.rate} step={0.1} min={0.5} max={2} format={(v) => `${v.toFixed(1)}×`} onChange={(rate) => update({ rate })} />
        </Surface>
        <Surface style={{ paddingVertical: Spacing.one }}>
          <RadioList
            value={s.voice ?? '__default'}
            options={[{ value: '__default', label: 'System default' }, ...shownVoices.map((v) => ({ value: v.identifier, label: v.name }))]}
            onChange={(v) => update({ voice: v === '__default' ? null : v })}
          />
        </Surface>
        {voices.length > MAX_VOICES ? (
          <Button variant="ghost" title={showAllVoices ? 'Show fewer voices' : `Show all ${voices.length} voices`} onPress={() => setShowAllVoices((v) => !v)} />
        ) : null}
        <Button icon="volume-2" title="Test voice" onPress={() => void speak('What is the powerhouse of the cell? ... The mitochondria.', s)} />
      </Section>

      <Section title="About">
        <Surface muted>
          <ThemedText variant="small" color="textSecondary">
            Anki Voice {Constants.expoConfig?.version ?? ''} schedules reviews with the SM-2 algorithm, the same family Anki uses. Your cards stay on this
            device. Use Cards → Export backup to keep a copy.
          </ThemedText>
        </Surface>
      </Section>
    </Screen>
  );
}
