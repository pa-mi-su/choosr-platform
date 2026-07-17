import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { SwipeCard } from '../components/SwipeCard';
import { modeById } from '../data/decisions';
import { useRoomSync } from '../hooks/useRoomSync';
import {
  findFirstUnswipedIndex,
  getRoomDestination,
  roomErrorMessage,
} from '../services/roomFlow';
import {
  loadDecisionDeck,
  loadOwnSwipeItemIds,
  loadRoomOutcome,
  submitDecision,
} from '../services/sessionService';
import { colors } from '../theme';
import type { DecisionItem, SwipeDirection } from '../types/domain';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Swipe'>;

export function SwipeScreen({ navigation, route }: Props): React.JSX.Element {
  const { sessionId, roundNumber, mode, searchArea } = route.params;
  const modeDefinition = modeById[mode];
  const [deck, setDeck] = useState<DecisionItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transitioning = useRef(false);
  const deckRef = useRef<DecisionItem[]>([]);

  const navigateForOutcome = useCallback(
    (
      status: Parameters<typeof getRoomDestination>[0],
      matchedItemId: string | null,
    ) => {
      if (transitioning.current) {
        return;
      }
      const destination = getRoomDestination(status, matchedItemId);
      if (destination === 'matched' && matchedItemId) {
        const matchedItem = deckRef.current.find(
          item => item.id === matchedItemId,
        );
        if (matchedItem) {
          transitioning.current = true;
          navigation.replace('Match', {
            sessionId,
            item: matchedItem,
            searchArea,
          });
        }
      } else if (destination === 'no-match') {
        transitioning.current = true;
        navigation.replace('NoMatch', { sessionId, mode, searchArea });
      }
    },
    [mode, navigation, searchArea, sessionId],
  );

  const refreshOutcome = useCallback(async () => {
    try {
      const outcome = await loadRoomOutcome(sessionId);
      navigateForOutcome(outcome.status, outcome.matchedItemId);
    } catch {
      // The next poll or Realtime event retries transient refresh failures.
    }
  }, [navigateForOutcome, sessionId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    transitioning.current = false;
    try {
      const [items, swipedItemIds, outcome] = await Promise.all([
        loadDecisionDeck(sessionId, roundNumber),
        loadOwnSwipeItemIds(sessionId, roundNumber),
        loadRoomOutcome(sessionId),
      ]);
      deckRef.current = items;
      setDeck(items);
      navigateForOutcome(outcome.status, outcome.matchedItemId);
      if (
        getRoomDestination(outcome.status, outcome.matchedItemId) !== 'swiping'
      ) {
        return;
      }
      const nextIndex = findFirstUnswipedIndex(
        items.map(item => item.id),
        swipedItemIds,
      );
      if (nextIndex === -1) {
        setFinished(true);
      } else {
        setFinished(false);
        setIndex(nextIndex);
      }
    } catch (cause) {
      setError(roomErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [navigateForOutcome, roundNumber, sessionId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useRoomSync({
    sessionId,
    tables: ['sessions', 'matches'],
    refresh: refreshOutcome,
    maintainPresence: true,
  });

  const item = deck[index];
  const swipe = useCallback(
    async (direction: SwipeDirection) => {
      if (!item || submitting) {
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const outcome = await submitDecision({
          sessionId,
          round: roundNumber,
          itemId: item.id,
          direction,
        });
        if (!outcome) {
          throw new Error('Supabase did not return a swipe outcome.');
        }
        if (outcome.outcome === 'match' && outcome.matched_item_id) {
          navigateForOutcome('matched', outcome.matched_item_id);
        } else if (outcome.outcome === 'no-match') {
          navigateForOutcome('completed', null);
        } else if (outcome.outcome === 'waiting' || index === deck.length - 1) {
          setFinished(true);
        } else {
          setIndex(current => current + 1);
        }
      } catch (cause) {
        setError(roomErrorMessage(cause));
      } finally {
        setSubmitting(false);
      }
    },
    [
      deck.length,
      index,
      item,
      navigateForOutcome,
      roundNumber,
      sessionId,
      submitting,
    ],
  );

  if (loading) {
    return (
      <Screen testID="swipe-loading-screen" style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading your private deck…</Text>
      </Screen>
    );
  }

  if (error && !item) {
    return (
      <Screen testID="swipe-error-screen" style={styles.centered}>
        <Brand compact />
        <Text style={styles.errorTitle}>We couldn’t load this room.</Text>
        <Text style={styles.error}>{error}</Text>
        <Button label="Retry" onPress={load} />
      </Screen>
    );
  }

  if (finished || !item) {
    return (
      <Screen testID="swipe-finished-screen" style={styles.waitingScreen}>
        <Brand compact />
        <View style={styles.finishedContent}>
          <View style={styles.waitingIcon}>
            <Text style={styles.waitingIconText}>✓</Text>
          </View>
          <Text style={styles.eyebrow}>YOUR PICKS ARE IN</Text>
          <Text style={styles.finishedTitle}>Waiting for your partner.</Text>
          <Text style={styles.finishedCopy}>
            We’ll reveal the first option you both accepted. Their choices
            remain private.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <Text style={styles.private}>This screen updates automatically</Text>
      </Screen>
    );
  }

  return (
    <Screen testID="swipe-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <View style={styles.online}>
          <View style={styles.dot} />
          <Text style={styles.onlineText}>PARTNER JOINED</Text>
        </View>
      </View>
      <View style={styles.progress}>
        <Text style={styles.prompt}>{modeDefinition.prompt}</Text>
        <Text style={styles.count}>
          {index + 1} / {deck.length}
        </Text>
      </View>
      <View style={styles.deck}>
        <View style={styles.behind} />
        <SwipeCard key={item.id} item={item} onSwipe={swipe} />
      </View>
      {error ? <Text style={styles.inlineError}>{error}</Text> : null}
      <View style={styles.controls}>
        <Pressable
          testID="pass-button"
          accessibilityRole="button"
          accessibilityLabel={`Pass on ${item.title}`}
          disabled={submitting}
          onPress={() => swipe('left')}
          style={({ pressed }) => [
            styles.control,
            pressed && styles.pressed,
            submitting && styles.disabled,
          ]}
        >
          <Text style={styles.pass}>×</Text>
        </Pressable>
        <View style={styles.hints}>
          {submitting ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.hint}>SWIPE OR TAP</Text>
          )}
          <Text style={styles.private}>Your choice stays private</Text>
        </View>
        <Pressable
          testID="like-button"
          accessibilityRole="button"
          accessibilityLabel={`Like ${item.title}`}
          disabled={submitting}
          onPress={() => swipe('right')}
          style={({ pressed }) => [
            styles.control,
            styles.like,
            pressed && styles.pressed,
            submitting && styles.disabled,
          ]}
        >
          <Text style={styles.approve}>✓</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18 },
  centered: { justifyContent: 'center', gap: 18 },
  loadingText: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  errorTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  inlineError: {
    color: colors.danger,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 4,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  online: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 99,
    padding: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  onlineText: { color: colors.muted, fontSize: 9, fontWeight: '900' },
  progress: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 9,
  },
  prompt: { color: colors.muted, fontSize: 13 },
  count: { color: colors.faint, fontSize: 12 },
  deck: { flex: 1, marginHorizontal: 3, marginBottom: 12 },
  behind: {
    position: 'absolute',
    top: 8,
    left: 9,
    right: 9,
    bottom: -6,
    borderRadius: 28,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  controls: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  control: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  like: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.75, transform: [{ scale: 0.92 }] },
  disabled: { opacity: 0.45 },
  pass: { color: colors.muted, fontSize: 38, fontWeight: '300' },
  approve: { color: colors.white, fontSize: 25, fontWeight: '900' },
  hints: { alignItems: 'center' },
  hint: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  private: {
    color: colors.faint,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  waitingScreen: { justifyContent: 'space-between' },
  finishedContent: { alignItems: 'center' },
  waitingIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  waitingIconText: { color: colors.primary, fontSize: 42, fontWeight: '900' },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  finishedTitle: {
    color: colors.text,
    fontSize: 35,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1.4,
    textAlign: 'center',
    marginTop: 10,
  },
  finishedCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
  },
});
