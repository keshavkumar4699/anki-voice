import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipRow, EmptyState, IconButton, ScreenTitle, SearchField, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { isNew } from '@/core/queue';
import { DAY_MS } from '@/core/sm2';
import type { Card } from '@/core/types';
import { exportJson, listCards, listDecks } from '@/data/db';
import { useData } from '@/hooks/use-data';
import { useTheme } from '@/hooks/use-theme';

type Filter = 'all' | 'due' | 'new';

function dueLabel(c: Card, now: number): string {
  if (isNew(c)) return 'New';
  const days = Math.ceil((c.due - now) / DAY_MS);
  if (days <= 0) return 'Due';
  return days < 31 ? `${days}d` : `${Math.round(days / 30)}mo`;
}

export default function CardsScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [deckId, setDeckId] = useState<string | null>(null);

  const [data] = useData(async () => {
    const [cards, decks] = await Promise.all([listCards(), listDecks()]);
    return { cards, decks, now: Date.now() };
  }, []);

  const shown = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.cards.filter(
      (c) =>
        (!deckId || c.deckId === deckId) &&
        (filter === 'all' || (filter === 'new' ? isNew(c) : !isNew(c) && c.due <= data.now)) &&
        (!q || c.question.toLowerCase().includes(q) || c.answer.toLowerCase().includes(q)),
    );
  }, [data, query, filter, deckId]);

  const deckName = (id: string) => data?.decks.find((d) => d.id === id)?.name ?? '';
  const total = data?.cards.length ?? 0;

  const header = (
    <View style={{ gap: Spacing.three, paddingBottom: Spacing.three }}>
      <ScreenTitle
        title="Cards"
        subtitle={`${total} card${total === 1 ? '' : 's'}`}
        right={<IconButton icon="plus" label="Add card" active onPress={() => router.push({ pathname: '/add', params: deckId ? { deck: deckId } : {} })} />}
      />
      {total ? (
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search questions and answers" />
          <ChipRow>
            <Chip label="All decks" selected={deckId == null} onPress={() => setDeckId(null)} />
            {data?.decks.map((d) => <Chip key={d.id} label={d.name} selected={deckId === d.id} onPress={() => setDeckId(d.id)} />)}
            <Chip label="Manage" icon="sliders" onPress={() => router.push('/decks')} />
          </ChipRow>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'due', label: 'Due' },
              { value: 'new', label: 'New' },
            ]}
          />
        </>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
      <FlatList
        data={shown}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />}
        renderItem={({ item: c }) => (
          <Pressable onPress={() => router.push({ pathname: '/edit/[id]', params: { id: c.id } })} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText numberOfLines={2}>{c.question}</ThemedText>
              <ThemedText variant="small" color="textSecondary" numberOfLines={1}>
                {c.answer}
              </ThemedText>
              {!deckId && data && data.decks.length > 1 ? (
                <ThemedText variant="small" color="textTertiary">
                  {deckName(c.deckId)}
                </ThemedText>
              ) : null}
            </View>
            <ThemedText variant="smallStrong" color={data && !isNew(c) && c.due <= data.now ? 'accent' : 'textTertiary'}>
              {data ? dueLabel(c, data.now) : ''}
            </ThemedText>
          </Pressable>
        )}
        ListEmptyComponent={
          data ? (
            total ? (
              <EmptyState icon="search" title="No matching cards" body="Try another search, deck or filter." />
            ) : (
              <EmptyState
                icon="layers"
                title="No cards yet"
                body="Add cards by voice or typing, or import a deck exported from Anki."
                action={<Button variant="primary" icon="plus" title="Add cards" onPress={() => router.push('/add')} style={{ marginTop: Spacing.three }} />}
              />
            )
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Button variant="ghost" icon="upload" title="Import" onPress={() => router.push({ pathname: '/import', params: deckId ? { deck: deckId } : {} })} />
            {total ? <Button variant="ghost" icon="share" title="Export backup" onPress={() => void exportJson().then((message) => Share.share({ message, title: 'Anki Voice backup' }))} /> : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingTop: Spacing.three, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 14 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two, paddingTop: Spacing.four },
});
