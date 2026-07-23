import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { DecisionArtwork } from '../components/DecisionArtwork';
import { Brand, Button, Screen } from '../components/UI';
import { useRoomSync } from '../hooks/useRoomSync';
import { rankForChoice, toggleRankedChoice } from '../services/choiceRanking';
import { getRoomDestination, roomErrorMessage } from '../services/roomFlow';
import {
  cancelDecisionRoom,
  loadDecisionDeck,
  loadOwnAcceptedItemIds,
  loadOwnRankingSubmission,
  loadRoomOutcome,
  submitDecisionRankings,
} from '../services/sessionService';
import { colors } from '../theme';
import type { DecisionItem } from '../types/domain';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'RankChoices'>;

export function RankChoicesScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const { sessionId, roundNumber, mode, searchArea } = route.params;
  const [accepted, setAccepted] = useState<DecisionItem[]>([]);
  const [rankedIds, setRankedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deckRef = useRef<DecisionItem[]>([]);
  const transitioning = useRef(false);
  const autoSubmitting = useRef(false);

  const navigateForOutcome = useCallback(
    (
      status: Parameters<typeof getRoomDestination>[0],
      itemId: string | null,
    ) => {
      if (transitioning.current) return;
      const destination = getRoomDestination(status, itemId);
      if (destination === 'matched' && itemId) {
        const item = deckRef.current.find(value => value.id === itemId);
        if (item) {
          transitioning.current = true;
          navigation.replace('Match', { sessionId, item, searchArea });
        }
      } else if (destination === 'no-match') {
        transitioning.current = true;
        navigation.replace('NoMatch', { sessionId, mode, searchArea });
      } else if (destination === 'closed') {
        transitioning.current = true;
        navigation.popToTop();
      }
    },
    [mode, navigation, searchArea, sessionId],
  );

  const refreshOutcome = useCallback(async () => {
    try {
      const outcome = await loadRoomOutcome(sessionId);
      navigateForOutcome(outcome.status, outcome.matchedItemId);
    } catch {
      // Realtime and the recovery poll will retry transient failures.
    }
  }, [navigateForOutcome, sessionId]);

  const submitRanks = useCallback(
    async (itemIds: string[]) => {
      setSubmitting(true);
      setError(null);
      try {
        const result = await submitDecisionRankings({
          sessionId,
          round: roundNumber,
          itemIds,
        });
        if (!result) {
          throw new Error('Supabase did not return a ranking outcome.');
        }
        setSubmitted(true);
        if (result.outcome === 'match' && result.matched_item_id) {
          navigateForOutcome('matched', result.matched_item_id);
        } else if (result.outcome === 'no-match') {
          navigateForOutcome('completed', null);
        }
      } catch (cause) {
        setError(roomErrorMessage(cause));
      } finally {
        setSubmitting(false);
      }
    },
    [navigateForOutcome, roundNumber, sessionId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    transitioning.current = false;
    try {
      const [deck, acceptedIds, ranking, outcome] = await Promise.all([
        loadDecisionDeck(sessionId, roundNumber),
        loadOwnAcceptedItemIds(sessionId, roundNumber),
        loadOwnRankingSubmission(sessionId, roundNumber),
        loadRoomOutcome(sessionId),
      ]);
      deckRef.current = deck;
      const acceptedItems = deck.filter(item => acceptedIds.has(item.id));
      setAccepted(acceptedItems);
      setRankedIds(
        ranking.itemIds.length > 0
          ? ranking.itemIds
          : acceptedItems.length === 1
          ? [acceptedItems[0].id]
          : [],
      );
      setSubmitted(ranking.submitted);
      navigateForOutcome(outcome.status, outcome.matchedItemId);

      if (
        !ranking.submitted &&
        acceptedItems.length <= 1 &&
        !autoSubmitting.current
      ) {
        autoSubmitting.current = true;
        await submitRanks(acceptedItems.map(item => item.id));
      }
    } catch (cause) {
      setError(roomErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [navigateForOutcome, roundNumber, sessionId, submitRanks]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useRoomSync({
    sessionId,
    tables: ['sessions', 'matches'],
    refresh: refreshOutcome,
    maintainPresence: true,
  });

  const leave = useCallback(() => {
    if (cancelling) return;
    transitioning.current = true;
    navigation.popToTop();
  }, [cancelling, navigation]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          leave();
          return true;
        },
      );
      return () => subscription.remove();
    }, [leave]),
  );

  const confirmCancel = useCallback(() => {
    Alert.alert('Cancel this room?', 'This ends the room for both people.', [
      { text: 'Keep room', style: 'cancel' },
      {
        text: 'Cancel room',
        style: 'destructive',
        onPress: () => {
          setCancelling(true);
          cancelDecisionRoom(sessionId)
            .then(() => navigation.popToTop())
            .catch(cause =>
              Alert.alert('Couldn’t cancel this room', roomErrorMessage(cause)),
            )
            .finally(() => setCancelling(false));
        },
      },
    ]);
  }, [navigation, sessionId]);

  const header = (
    <View style={styles.header}>
      <Brand compact />
      <View style={styles.headerActions}>
        <Pressable
          accessibilityRole="button"
          onPress={leave}
          style={styles.headerButton}
        >
          <Text style={styles.headerText}>Save & leave</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={confirmCancel}
          style={[styles.headerButton, styles.cancelButton]}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );

  if (loading) {
    return (
      <Screen style={styles.screen}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.copy}>Preparing your Yes choices…</Text>
        </View>
      </Screen>
    );
  }

  if (submitted) {
    return (
      <Screen testID="ranking-waiting-screen" style={styles.screen}>
        {header}
        <View style={styles.center}>
          <View style={styles.checkCircle}>
            <Text style={styles.check}>✓</Text>
          </View>
          <Text style={styles.eyebrow}>YOUR FINAL PICKS ARE IN</Text>
          <Text style={styles.title}>Waiting for your partner.</Text>
          <Text style={styles.copy}>
            Your ranking stays private. Choosr will reveal the strongest choice
            you both ranked after your partner finishes.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen testID="rank-choices-screen" style={styles.screen}>
      {header}
      <Text style={styles.eyebrow}>ONE LAST PRIVATE STEP</Text>
      <Text style={styles.title}>Rank your top choices.</Text>
      <Text style={styles.copy}>
        Pick up to three from the cards you said Yes to. #1 is worth 3 points,
        #2 is worth 2, and #3 is worth 1.
      </Text>
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {accepted.map(item => {
          const rank = rankForChoice(rankedIds, item.id);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${
                rank ? ` ranked number ${rank}` : ''
              }`}
              onPress={() =>
                setRankedIds(current => toggleRankedChoice(current, item.id))
              }
              style={({ pressed }) => [
                styles.card,
                rank !== undefined && styles.cardSelected,
                pressed && styles.pressed,
              ]}
            >
              <DecisionArtwork item={item} style={styles.artwork} />
              <View style={styles.cardFooter}>
                <Text numberOfLines={1} style={styles.cardTitle}>
                  {item.title}
                </Text>
                <View
                  style={[
                    styles.rank,
                    rank !== undefined && styles.rankSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.rankText,
                      rank !== undefined && styles.rankTextSelected,
                    ]}
                  >
                    {rank ? `#${rank}` : '+'}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={`Lock my top ${rankedIds.length}`}
        disabled={rankedIds.length === 0}
        loading={submitting}
        onPress={() => submitRanks(rankedIds)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, gap: 10 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: { flexDirection: 'row', gap: 6 },
  headerButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 9,
    paddingVertical: 10,
  },
  cancelButton: { borderColor: colors.danger },
  headerText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  cancelText: { color: colors.danger, fontSize: 10, fontWeight: '900' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 },
  checkCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { color: colors.white, fontSize: 48, fontWeight: '900' },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 8,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  list: { gap: 12, paddingVertical: 4 },
  card: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cardSelected: { borderColor: colors.primary },
  pressed: { opacity: 0.82 },
  artwork: { minHeight: 180, borderRadius: 18 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  rank: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  rankText: { color: colors.muted, fontWeight: '900', fontSize: 16 },
  rankTextSelected: { color: colors.white },
  error: { color: colors.danger, fontSize: 12, textAlign: 'center' },
});
