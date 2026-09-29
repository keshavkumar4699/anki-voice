import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipRow, Field, Screen, Section, Surface } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { parseBulk } from '@/core/import';
import { DEFAULT_DECK_ID } from '@/core/types';
import { addCards, listDecks } from '@/data/db';
import { useData } from '@/hooks/use-data';

export default function ImportScreen() {
  const params = useLocalSearchParams<{ deck?: string }>();
  const [decks] = useData(listDecks, []);
  const [deckId, setDeckId] = useState(params.deck ?? DEFAULT_DECK_ID);
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseBulk(text), [text]);

  async function doImport() {
    await addCards(parsed, deckId);
    Alert.alert(`Imported ${parsed.length} card${parsed.length === 1 ? '' : 's'}`);
    router.back();
  }

  return (
    <Screen>
      <Surface muted style={{ gap: Spacing.two }}>
        <ThemedText variant="smallStrong">Supported formats</ThemedText>
        <ThemedText variant="small" color="textSecondary">
          One card per line, as <ThemedText variant="smallStrong">question ; answer</ThemedText>.{'\n'}
          From Anki: File → Export → “Notes in Plain Text”, then paste the file contents here. Tabs separate fields and formatting is removed.
        </ThemedText>
      </Surface>

      <Section title="Deck">
        <ChipRow>
          {(decks ?? []).map((d) => (
            <Chip key={d.id} label={d.name} selected={d.id === deckId} onPress={() => setDeckId(d.id)} />
          ))}
        </ChipRow>
      </Section>

      <Field
        label="Cards"
        value={text}
        onChangeText={setText}
        multiline
        autoCapitalize="none"
        style={{ minHeight: 200 }}
        placeholder={'Capital of Australia ; Canberra\nHalf-life of caffeine ; About 5 hours'}
      />

      {parsed.length ? (
        <Section title={`Preview · ${parsed.length} card${parsed.length === 1 ? '' : 's'}`}>
          <Surface style={{ gap: Spacing.three }}>
            {parsed.slice(0, 3).map((p, i) => (
              <View key={i} style={{ gap: 2 }}>
                <ThemedText numberOfLines={2}>{p.question}</ThemedText>
                <ThemedText variant="small" color="textSecondary" numberOfLines={2}>
                  {p.answer}
                </ThemedText>
              </View>
            ))}
            {parsed.length > 3 ? (
              <ThemedText variant="small" color="textTertiary">
                and {parsed.length - 3} more
              </ThemedText>
            ) : null}
          </Surface>
        </Section>
      ) : null}

      <Button variant="primary" icon="download" title={parsed.length ? `Import ${parsed.length} cards` : 'Import'} disabled={!parsed.length} onPress={() => void doImport()} />
    </Screen>
  );
}
