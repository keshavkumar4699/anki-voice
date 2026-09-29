import { useState } from 'react';
import { Alert, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Field, IconButton, ListRow, Screen, Section, Surface } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { DEFAULT_DECK_ID } from '@/core/types';
import { createDeck, deleteDeck, listDecksWithCounts, renameDeck } from '@/data/db';
import { useData } from '@/hooks/use-data';

export default function DecksScreen() {
  const [decks] = useData(() => listDecksWithCounts(Date.now()), []);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  async function create() {
    if (!name.trim()) return;
    await createDeck(name);
    setName('');
  }

  function confirmDelete(id: string, deckName: string, total: number) {
    Alert.alert(
      `Delete “${deckName}”?`,
      total ? `Its ${total} card${total === 1 ? '' : 's'} will move to General.` : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteDeck(id) },
      ],
    );
  }

  return (
    <Screen>
      <Section title="New deck">
        <View style={{ gap: Spacing.two }}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Pharmacology, French verbs" onSubmitEditing={() => void create()} returnKeyType="done" />
          <Button variant="primary" icon="plus" title="Create deck" disabled={!name.trim()} onPress={() => void create()} />
        </View>
      </Section>

      <Section title="Your decks">
        <Surface style={{ paddingVertical: 0 }}>
          {(decks ?? []).map((d, i) =>
            editing?.id === d.id ? (
              <View key={d.id} style={{ gap: Spacing.two, paddingVertical: Spacing.three }}>
                <Field label="Rename" value={editing.name} onChangeText={(t) => setEditing({ id: d.id, name: t })} autoFocus />
                <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                  <Button title="Cancel" onPress={() => setEditing(null)} style={{ flex: 1 }} />
                  <Button
                    variant="primary"
                    title="Save"
                    disabled={!editing.name.trim()}
                    onPress={() => void renameDeck(d.id, editing.name).then(() => setEditing(null))}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : (
              <ListRow
                key={d.id}
                first={i === 0}
                title={d.name}
                subtitle={`${d.total} card${d.total === 1 ? '' : 's'}${d.due ? ` · ${d.due} due` : ''}`}
                right={
                  <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                    <IconButton icon="edit-2" label={`Rename ${d.name}`} size={36} onPress={() => setEditing({ id: d.id, name: d.name })} />
                    {d.id !== DEFAULT_DECK_ID ? (
                      <IconButton icon="trash-2" label={`Delete ${d.name}`} size={36} onPress={() => confirmDelete(d.id, d.name, d.total)} />
                    ) : null}
                  </View>
                }
              />
            ),
          )}
        </Surface>
        <ThemedText variant="small" color="textTertiary">
          General is the default deck and can&apos;t be deleted.
        </ThemedText>
      </Section>
    </Screen>
  );
}
