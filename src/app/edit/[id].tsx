import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { speak, stopSpeaking } from '@/adapters/speech';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipRow, EmptyState, Field, Screen, Section, Stat, Surface } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { QUALITY_LABEL } from '@/core/grading';
import { isNew } from '@/core/queue';
import type { Card, Deck } from '@/core/types';
import { deleteCard, getCard, listDecks, resetCard, updateCard } from '@/data/db';
import { useSettings } from '@/state/settings';

export default function EditCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useSettings();
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [deckId, setDeckId] = useState('');

  useEffect(() => {
    void Promise.all([getCard(id), listDecks()]).then(([c, d]) => {
      setCard(c);
      setDecks(d);
      if (c) {
        setQuestion(c.question);
        setAnswer(c.answer);
        setDeckId(c.deckId);
      }
    });
    return () => stopSpeaking();
  }, [id]);

  if (card === undefined) return <Screen>{null}</Screen>;
  if (card === null) {
    return (
      <Screen>
        <EmptyState icon="alert-circle" title="Card not found" body="It may have been deleted." action={<Button title="Back" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  const dirty = question !== card.question || answer !== card.answer || deckId !== card.deckId;

  return (
    <Screen>
      <View style={{ gap: Spacing.three }}>
        <Field label="Question" value={question} onChangeText={setQuestion} multiline />
        <Field label="Answer" value={answer} onChangeText={setAnswer} multiline />
      </View>

      <Section title="Deck">
        <ChipRow>
          {decks.map((d) => (
            <Chip key={d.id} label={d.name} selected={d.id === deckId} onPress={() => setDeckId(d.id)} />
          ))}
        </ChipRow>
      </Section>

      <View style={{ gap: Spacing.two }}>
        <Button
          variant="primary"
          icon="check"
          title="Save changes"
          disabled={!dirty || !question.trim() || !answer.trim()}
          onPress={() => void updateCard(card.id, { question, answer, deckId }).then(() => router.back())}
        />
        <Button icon="volume-2" title="Listen to this card" onPress={() => void speak(`${question} ... ${answer}`, settings)} />
      </View>

      <Section title="Progress">
        <Surface style={{ gap: Spacing.three }}>
          {isNew(card) ? (
            <ThemedText color="textSecondary">Not reviewed yet. It will appear in your next session.</ThemedText>
          ) : (
            <>
              <View style={{ flexDirection: 'row' }}>
                <Stat value={`${card.interval}d`} label="interval" />
                <Stat value={card.ef.toFixed(2)} label="ease" />
                <Stat value={`${card.lapses}`} label={card.lapses === 1 ? 'lapse' : 'lapses'} />
              </View>
              <ThemedText variant="small" color="textSecondary">
                Next review {new Date(card.due).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                {card.lastQuality != null ? ` · last answer: ${QUALITY_LABEL[card.lastQuality].toLowerCase()}` : ''}
              </ThemedText>
            </>
          )}
        </Surface>
      </Section>

      <View style={{ gap: Spacing.two }}>
        {!isNew(card) ? (
          <Button
            icon="refresh-ccw"
            title="Reset progress"
            onPress={() =>
              Alert.alert('Reset progress?', 'The card will be treated as new again.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: () => void resetCard(card.id).then(() => getCard(card.id)).then(setCard) },
              ])
            }
          />
        ) : null}
        <Button
          variant="danger"
          icon="trash-2"
          title="Delete card"
          onPress={() =>
            Alert.alert('Delete this card?', 'Its review history is deleted too.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => void deleteCard(card.id).then(() => router.back()) },
            ])
          }
        />
      </View>
    </Screen>
  );
}
