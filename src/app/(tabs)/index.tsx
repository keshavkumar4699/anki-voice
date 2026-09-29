import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, EmptyState, Icon, IconButton, ListRow, Screen, ScreenTitle, Section, Stat, Surface, type IconName } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { buildQueue, countDue } from '@/core/queue';
import { DAY_MS } from '@/core/sm2';
import { estimateMinutes, forecast, retention, startOfDay, streak } from '@/core/stats';
import type { DontKnowSignal } from '@/core/types';
import { listCards, listDecksWithCounts, listReviewsSince } from '@/data/db';
import { useData } from '@/hooks/use-data';
import { useTheme } from '@/hooks/use-theme';
import { getActiveRunner } from '@/session/runner';
import { useSettings } from '@/state/settings';

const DONT_KNOW_HINT: Record<DontKnowSignal, string> = {
  timeout: 'stay silent until the timer ends',
  double: 'double-press',
  next: 'press next-track',
  voice: 'say “don’t know”',
};

export default function Home() {
  const { settings } = useSettings();
  const [showHelp, setShowHelp] = useState(false);

  const [data] = useData(async () => {
    const now = Date.now();
    const [cards, decks, reviews] = await Promise.all([listCards(), listDecksWithCounts(now), listReviewsSince(startOfDay(now) - 60 * DAY_MS)]);
    const runner = getActiveRunner();
    return {
      now,
      total: cards.length,
      counts: countDue(cards, now),
      queue: buildQueue(cards, settings, now).length,
      decks,
      forecast: forecast(cards, now, 7),
      streak: streak(reviews, now),
      today: reviews.filter((r) => r.ts >= startOfDay(now)).length,
      retention: retention(reviews, now - 30 * DAY_MS),
      activeSession: !!runner && runner.getSnapshot().session.phase !== 'done',
    };
  }, settings);

  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  if (!data) return <Screen topInset>{null}</Screen>;

  const start = (params: { deck?: string; practice?: '1' } = {}) => router.push({ pathname: '/session', params });

  return (
    <Screen topInset>
      <ScreenTitle subtitle={date} title="Today" />

      {data.activeSession ? (
        <Surface style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
          <Icon name="headphones" color="accent" />
          <ThemedText style={{ flex: 1 }}>A session is in progress</ThemedText>
          <Button title="Return" variant="primary" onPress={() => router.push('/session')} />
        </Surface>
      ) : null}

      {data.total === 0 ? (
        <EmptyState
          icon="mic"
          title="Start with a few cards"
          body="Speak a question and its answer, or import from Anki. Then listen to them on the go and answer with your headphone button."
          action={<Button variant="primary" icon="plus" title="Add cards" onPress={() => router.push('/add')} style={{ marginTop: Spacing.three }} />}
        />
      ) : data.queue > 0 ? (
        <Surface style={{ padding: Spacing.four, gap: Spacing.three }}>
          <View style={{ gap: 2 }}>
            <ThemedText variant="display">{data.queue}</ThemedText>
            <ThemedText color="textSecondary">
              cards ready · about {estimateMinutes(data.queue, settings.thinkMs)} min
              {data.counts.fresh ? ` · ${Math.min(data.counts.fresh, settings.maxNewPerSession)} new` : ''}
            </ThemedText>
          </View>
          <Button variant="primary" size="lg" icon="headphones" title="Start listening" onPress={() => start()} disabled={data.activeSession} />
        </Surface>
      ) : (
        <Surface style={{ padding: Spacing.four, gap: Spacing.three }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <Icon name="check-circle" color="success" />
            <ThemedText variant="heading">All caught up</ThemedText>
          </View>
          <ThemedText color="textSecondary">{nextDueText(data.forecast)}</ThemedText>
          <Button icon="repeat" title="Practice anyway" onPress={() => start({ practice: '1' })} disabled={data.activeSession} />
        </Surface>
      )}

      {data.total > 0 ? (
        <>
          <Section
            title="Decks"
            action={<Button variant="ghost" title="Manage" onPress={() => router.push('/decks')} style={{ minHeight: 0, paddingVertical: 0 }} />}>
            <Surface style={{ paddingVertical: 0 }}>
              {data.decks.map((d, i) => {
                const ready = d.due + Math.min(d.fresh, settings.maxNewPerSession);
                return (
                  <ListRow
                    key={d.id}
                    first={i === 0}
                    title={d.name}
                    subtitle={d.total ? `${d.due} due · ${d.fresh} new · ${d.total} cards` : 'Empty'}
                    onPress={d.total ? () => start(ready ? { deck: d.id } : { deck: d.id, practice: '1' }) : () => router.push({ pathname: '/add', params: { deck: d.id } })}
                    right={
                      d.total ? (
                        <IconButton icon={ready ? 'play' : 'repeat'} label={ready ? `Review ${d.name}` : `Practice ${d.name}`} size={36} active={ready > 0} onPress={() => start(ready ? { deck: d.id } : { deck: d.id, practice: '1' })} disabled={data.activeSession} />
                      ) : (
                        <Icon name="plus" size={18} color="textTertiary" />
                      )
                    }
                  />
                );
              })}
            </Surface>
          </Section>

          <Section title="Progress">
            <Surface style={{ gap: Spacing.four }}>
              <View style={{ flexDirection: 'row' }}>
                <Stat value={`${data.streak}`} label={data.streak === 1 ? 'day in a row' : 'days in a row'} />
                <Stat value={`${data.today}`} label="reviewed today" />
                <Stat value={data.retention == null ? '–' : `${Math.round(data.retention * 100)}%`} label="recall, 30 days" />
              </View>
              <Forecast values={data.forecast} now={data.now} />
            </Surface>
          </Section>
        </>
      ) : null}

      <Section
        title="How answering works"
        action={<Button variant="ghost" title={showHelp ? 'Hide' : 'Show'} onPress={() => setShowHelp((v) => !v)} style={{ minHeight: 0, paddingVertical: 0 }} />}>
        {showHelp ? (
          <Surface muted style={{ gap: Spacing.three }}>
            <HelpLine icon="volume-2" text="Each question is read aloud. A soft beep starts the think timer." />
            <HelpLine icon="check" text={`Press play/pause on your headphones as soon as you know it. Within ${settings.fastMs / 1000}s is Easy, within ${settings.mediumMs / 1000}s is Good, and later is Hard.`} />
            <HelpLine icon="help-circle" text={`Don't know? ${capitalize(DONT_KNOW_HINT[settings.dontKnowSignal])}. You can change this in Settings.`} />
            {settings.correctionMs > 0 ? <HelpLine icon="x" text={`Got it wrong after all? Press again while the answer plays, or within ${settings.correctionMs / 1000}s after.`} /> : null}
            <HelpLine icon="rotate-ccw" text="Previous-track repeats the question." />
          </Surface>
        ) : null}
      </Section>
    </Screen>
  );
}

function nextDueText(fc: number[]): string {
  const idx = fc.findIndex((n, i) => i > 0 && n > 0);
  if (idx === -1) return 'Nothing due this week. New cards you add will show up here.';
  return idx === 1 ? `${fc[1]} card${fc[1] === 1 ? '' : 's'} due tomorrow.` : `Next reviews in ${idx} days.`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function HelpLine({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.three }}>
      <View style={{ paddingTop: 2 }}>
        <Icon name={icon} size={17} color="textSecondary" />
      </View>
      <ThemedText variant="small" color="textSecondary" style={{ flex: 1 }}>
        {text}
      </ThemedText>
    </View>
  );
}

function Forecast({ values, now }: { values: number[]; now: number }) {
  const theme = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText variant="caption" color="textTertiary">
        Next 7 days
      </ThemedText>
      <View style={styles.bars}>
        {values.map((v, i) => {
          const label = i === 0 ? 'Today' : new Date(now + i * DAY_MS).toLocaleDateString(undefined, { weekday: 'narrow' });
          return (
            <View key={i} style={styles.barCol} accessibilityLabel={`${label}: ${v} due`}>
              <ThemedText variant="small" color={v ? 'textSecondary' : 'textTertiary'}>
                {v}
              </ThemedText>
              <View style={styles.barTrack}>
                <View style={{ height: `${Math.max(v ? 8 : 0, (v / max) * 100)}%`, backgroundColor: i === 0 ? theme.accent : theme.accentSoft, borderRadius: Radius.sm / 2 }} />
              </View>
              <ThemedText variant="small" color="textTertiary">
                {i === 0 ? '•' : label}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', gap: Spacing.two },
  barCol: { flex: 1, alignItems: 'center', gap: Spacing.one },
  barTrack: { height: 56, width: '100%', justifyContent: 'flex-end' },
});
