import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Animated, Easing, PermissionsAndroid, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, EmptyState, Icon, IconButton, ProgressBar, Screen, Surface, type IconName } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { currentItem, type Phase, type SessionState } from '@/core/session';
import { buildPracticeQueue, buildQueue } from '@/core/queue';
import { summarize } from '@/core/stats';
import type { Quality } from '@/core/types';
import { listCards, listDecks } from '@/data/db';
import { useTheme } from '@/hooks/use-theme';
import { getActiveRunner, PodcastRunner, setActiveRunner } from '@/session/runner';
import { useSettings } from '@/state/settings';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Starting',
  question: 'Listen',
  thinking: 'Recall the answer',
  awaitDouble: 'Press again if you don’t know',
  answer: 'Answer',
  correction: 'Wrong after all? Press now',
  gap: 'Next card',
  paused: 'Paused',
  done: 'Session complete',
};

const GRADES: { q: Quality; label: string }[] = [
  { q: 1, label: 'Forgot' },
  { q: 2, label: 'Wrong' },
  { q: 3, label: 'Hard' },
  { q: 4, label: 'Good' },
  { q: 5, label: 'Easy' },
];

const gradeLabel = (q: Quality) => GRADES.find((g) => g.q === q)?.label ?? 'Blackout';
const gradeColor = (q: Quality): ThemeColor => (q >= 4 ? 'success' : q === 3 ? 'warning' : 'danger');

type Status = { kind: 'loading' } | { kind: 'empty' } | { kind: 'running'; runner: PodcastRunner };

export default function SessionScreen() {
  const { settings } = useSettings();
  const { deck, practice } = useLocalSearchParams<{ deck?: string; practice?: string }>();
  const [status, setStatus] = useState<Status>(() => {
    const r = getActiveRunner();
    return r && r.getSnapshot().session.phase !== 'done' ? { kind: 'running', runner: r } : { kind: 'loading' };
  });

  useEffect(() => {
    if (status.kind !== 'loading') return;
    let cancelled = false;
    void (async () => {
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        // Needed for the lock-screen and notification controls.
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      const [cards, decks] = await Promise.all([listCards(deck ?? null), listDecks()]);
      const now = Date.now();
      const isPractice = practice === '1';
      const queue = isPractice ? buildPracticeQueue(cards, settings.maxPerSession) : buildQueue(cards, settings, now);
      if (cancelled) return;
      if (!queue.length) return setStatus({ kind: 'empty' });
      const deckName = decks.find((d) => d.id === deck)?.name;
      const r = new PodcastRunner(queue, settings, { practice: isPractice, title: deckName ?? 'All decks' });
      setActiveRunner(r);
      setStatus({ kind: 'running', runner: r });
      r.start();
    })();
    return () => {
      cancelled = true;
    };
  }, [status.kind, deck, practice, settings]);

  if (status.kind === 'loading') {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: Spacing.six }} />
      </Screen>
    );
  }
  if (status.kind === 'empty') {
    return (
      <Screen>
        <EmptyState icon="check-circle" title="Nothing to review" body="There are no cards due here right now." action={<Button title="Back" onPress={() => router.back()} />} />
      </Screen>
    );
  }
  return <NowPlaying runner={status.runner} />;
}

function NowPlaying({ runner }: { runner: PodcastRunner }) {
  const snap = useSyncExternalStore(runner.subscribe, runner.getSnapshot);
  const { session, last, practice, title } = snap;

  return (
    <Screen>
      <Stack.Screen options={{ title: practice ? `${title} · practice` : title }} />
      {session.phase === 'done' ? <Summary results={snap.results} practice={practice} /> : <Player runner={runner} session={session} />}

      {last && session.phase !== 'done' ? (
        <Surface muted style={{ gap: Spacing.three }}>
          <View style={{ gap: 2 }}>
            <ThemedText variant="caption" color="textTertiary">
              Previous card
            </ThemedText>
            <ThemedText variant="small" numberOfLines={1}>
              {last.question}
            </ThemedText>
            <ThemedText variant="small" color="textSecondary">
              <ThemedText variant="smallStrong" color={gradeColor(last.grade.quality)}>
                {gradeLabel(last.grade.quality)}
              </ThemedText>
              {last.grade.reactionMs != null ? ` · ${(last.grade.reactionMs / 1000).toFixed(1)}s` : ''}
              {practice ? ' · practice' : last.repeat ? ' · repeat' : ` · next in ${last.after.interval} day${last.after.interval === 1 ? '' : 's'}`}
            </ThemedText>
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.one }}>
            {GRADES.map((g) => (
              <GradePill key={g.q} label={g.label} selected={g.q === last.grade.quality} onPress={() => void runner.overrideLast(g.q)} />
            ))}
          </View>
        </Surface>
      ) : null}
    </Screen>
  );
}

function Player({ runner, session }: { runner: PodcastRunner; session: SessionState }) {
  const theme = useTheme();
  const item = currentItem(session);
  const paused = session.phase === 'paused';
  const total = session.items.length;
  const pos = Math.min(session.pos, total);

  const hearingAnswer = session.phase === 'answer' || session.phase === 'correction' || session.phase === 'gap';
  const recalled = (session.pending?.quality ?? 0) >= 3;
  const main: { icon: IconName; label: string; onPress: () => void } = paused
    ? { icon: 'play', label: 'Resume', onPress: runner.resume }
    : hearingAnswer
      ? recalled
        ? { icon: 'x', label: 'I was wrong', onPress: runner.press }
        : { icon: 'skip-forward', label: 'Next card', onPress: runner.next }
      : { icon: 'check', label: 'I know it', onPress: runner.press };

  return (
    <>
      <View style={{ gap: Spacing.two }}>
        <View style={styles.progressRow}>
          <ThemedText variant="small" color="textSecondary">
            {Math.min(pos + 1, total)} of {total}
            {item?.repeat ? ' · repeat' : ''}
          </ThemedText>
          <ThemedText variant="small" color="accent">
            {PHASE_LABEL[session.phase]}
          </ThemedText>
        </View>
        <ProgressBar value={total ? pos / total : 0} />
      </View>

      <Surface style={{ padding: Spacing.four, gap: Spacing.three, minHeight: 200 }}>
        <ThemedText variant="heading" style={{ fontWeight: 500, fontSize: 21, lineHeight: 30 }}>
          {item?.question ?? ''}
        </ThemedText>
        {hearingAnswer && item ? (
          <>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />
            <ThemedText color="textSecondary" style={{ fontSize: 17, lineHeight: 26 }}>
              {item.answer}
            </ThemedText>
          </>
        ) : null}
        <View style={{ flex: 1 }} />
        <ThinkTimer session={session} />
      </Surface>

      <View style={{ alignItems: 'center', gap: Spacing.two }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={main.label}
          onPress={main.onPress}
          style={({ pressed }) => [styles.bigButton, { backgroundColor: main.icon === 'x' ? theme.dangerSoft : theme.accent, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
          <Icon name={main.icon} size={36} color={main.icon === 'x' ? 'danger' : 'onAccent'} />
        </Pressable>
        <ThemedText variant="smallStrong">{main.label}</ThemedText>
        <ThemedText variant="small" color="textTertiary">
          or press play/pause on your headphones
        </ThemedText>
      </View>

      <View style={styles.controls}>
        <Control icon="rotate-ccw" label="Repeat" onPress={runner.repeat} />
        <Control icon="help-circle" label="Don't know" onPress={runner.dontKnow} disabled={!['question', 'thinking', 'awaitDouble'].includes(session.phase)} />
        <Control icon={paused ? 'play' : 'pause'} label={paused ? 'Resume' : 'Pause'} onPress={paused ? runner.resume : runner.pause} />
        <Control icon="square" label="End" onPress={runner.stop} />
      </View>
    </>
  );
}

function Control({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: Spacing.one, flex: 1 }}>
      <IconButton icon={icon} label={label} onPress={onPress} disabled={disabled} size={48} />
      <ThemedText variant="small" color="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

/** Thin bar that drains over the think window. Purely visual; timing lives in the runner. */
function ThinkTimer({ session }: { session: SessionState }) {
  const theme = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const active = session.phase === 'thinking' && session.thinkStartedAt != null;
  const { thinkMs } = session.settings;
  const startedAt = session.thinkStartedAt;

  useEffect(() => {
    progress.stopAnimation();
    if (!active || startedAt == null) {
      progress.setValue(0);
      return;
    }
    const elapsed = Math.min(thinkMs, Date.now() - startedAt);
    progress.setValue(1 - elapsed / thinkMs);
    Animated.timing(progress, { toValue: 0, duration: thinkMs - elapsed, easing: Easing.linear, useNativeDriver: false }).start();
  }, [active, startedAt, thinkMs, progress]);

  return (
    <View style={{ height: 3, borderRadius: 2, backgroundColor: active ? theme.surfaceMuted : 'transparent', overflow: 'hidden' }}>
      <Animated.View
        style={{ height: 3, backgroundColor: theme.accent, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}
      />
    </View>
  );
}

function GradePill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Change grade to ${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: selected ? theme.surface : 'transparent', borderColor: selected ? theme.border : 'transparent', opacity: pressed ? 0.6 : 1 },
      ]}>
      <ThemedText variant="small" color={selected ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Summary({ results, practice }: { results: { quality: Quality; reactionMs: number | null }[]; practice: boolean }) {
  const s = summarize(results);
  const pct = s.total ? Math.round((s.recalled / s.total) * 100) : 0;
  const finish = () => {
    setActiveRunner(null);
    router.back();
  };
  return (
    <>
      <View style={{ alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.four }}>
        <Icon name="check-circle" size={32} color="success" />
        <ThemedText variant="title">Session complete</ThemedText>
        <ThemedText color="textSecondary" style={{ textAlign: 'center' }}>
          {s.total ? `You recalled ${s.recalled} of ${s.total} answers.` : 'No cards were answered.'}
          {practice ? ' Practice mode: your schedule was not changed.' : ''}
        </ThemedText>
      </View>

      {s.total ? (
        <Surface style={{ gap: Spacing.three }}>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="heading">{pct}%</ThemedText>
              <ThemedText variant="small" color="textSecondary">
                recalled
              </ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText variant="heading">{s.avgReactionMs == null ? '–' : `${(s.avgReactionMs / 1000).toFixed(1)}s`}</ThemedText>
              <ThemedText variant="small" color="textSecondary">
                average recall time
              </ThemedText>
            </View>
          </View>
          {[...GRADES].reverse().map((g) => (
            <View key={g.q} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
              <ThemedText variant="small" color="textSecondary" style={{ width: 56 }}>
                {g.label}
              </ThemedText>
              <View style={{ flex: 1 }}>
                <ProgressBar value={s.byQuality[g.q] / s.total} color={gradeColor(g.q)} height={6} />
              </View>
              <ThemedText variant="small" color="textSecondary" style={{ width: 28, textAlign: 'right' }}>
                {s.byQuality[g.q]}
              </ThemedText>
            </View>
          ))}
        </Surface>
      ) : null}

      <Button variant="primary" size="lg" title="Done" onPress={finish} />
    </>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bigButton: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'space-between' },
  pill: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: Radius.sm, borderWidth: StyleSheet.hairlineWidth },
});
