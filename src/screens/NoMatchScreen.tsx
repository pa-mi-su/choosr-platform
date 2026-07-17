import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { modeById } from '../data/decisions';
import { roomErrorMessage } from '../services/roomFlow';
import {
  loadDecisionRoom,
  loadDecisionDeck,
  startDecisionRound,
  subscribeToRoom,
  unsubscribeFromRoom,
} from '../services/sessionService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'NoMatch'>;

export function NoMatchScreen({ navigation, route }: Props): React.JSX.Element {
  const { sessionId, searchArea } = route.params;
  const mode = modeById[route.params.mode];
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const followRestart = useCallback(async () => {
    try {
      const room = await loadDecisionRoom(sessionId);
      if (room.status === 'active') {
        navigation.replace('Swipe', {
          sessionId,
          roundNumber: room.roundNumber,
          mode: room.mode,
          searchArea,
        });
      }
    } catch {
      // A later Realtime event or poll will retry.
    }
  }, [navigation, searchArea, sessionId]);

  useEffect(() => {
    const channel = subscribeToRoom(sessionId, () => {
      followRestart().catch(() => undefined);
    });
    const poll = setInterval(() => {
      followRestart().catch(() => undefined);
    }, 3000);
    return () => {
      clearInterval(poll);
      unsubscribeFromRoom(channel).catch(() => undefined);
    };
  }, [followRestart, sessionId]);

  const restart = async () => {
    setRestarting(true);
    setError(null);
    try {
      const room = await loadDecisionRoom(sessionId);
      const previousDeck = await loadDecisionDeck(sessionId, room.roundNumber);
      const roundNumber = await startDecisionRound({
        sessionId,
        items: previousDeck,
      });
      navigation.replace('Swipe', {
        sessionId,
        roundNumber,
        mode: mode.id,
        searchArea,
      });
    } catch (cause) {
      // The partner may have restarted first; follow their new round if so.
      await followRestart();
      setError(roomErrorMessage(cause));
    } finally {
      setRestarting(false);
    }
  };

  return (
    <Screen testID="no-match-screen" style={styles.screen}>
      <Brand compact />
      <View style={styles.content}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>↻</Text>
        </View>
        <Text style={styles.eyebrow}>NO MATCH YET</Text>
        <Text style={styles.title}>Good taste takes another round.</Text>
        <Text style={styles.subtitle}>
          Start a fresh shared deck. Your partner will move to it automatically.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.actions}>
        <Button
          label="Try another deck"
          loading={restarting}
          onPress={restart}
        />
        <Button
          label="End room"
          variant="quiet"
          onPress={navigation.popToTop}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between' },
  content: { alignItems: 'center' },
  icon: {
    width: 106,
    height: 106,
    borderRadius: 53,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconText: { color: colors.accent, fontSize: 54 },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1.3,
    textAlign: 'center',
    marginTop: 10,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 14,
  },
  actions: { gap: 8 },
});
