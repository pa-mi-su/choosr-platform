import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Button, Screen } from '../components/UI';
import { DecisionArtwork } from '../components/DecisionArtwork';
import { modeById } from '../data/decisions';
import { useRoomSync } from '../hooks/useRoomSync';
import { getMatchResultAction } from '../services/matchResult';
import { roomErrorMessage } from '../services/roomFlow';
import {
  acknowledgeDecisionRoom,
  loadDecisionRoom,
} from '../services/sessionService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Match'>;
export function MatchScreen({ navigation, route }: Props): React.JSX.Element {
  const { item, sessionId } = route.params;
  const mode = modeById[item.mode];
  const action = getMatchResultAction(item);
  const [actionError, setActionError] = useState<string | null>(null);
  const [endingAction, setEndingAction] = useState<
    'done' | 'choose-again' | null
  >(null);
  const scale = useSharedValue(0.82);
  const opacity = useSharedValue(0);
  useEffect(() => {
    scale.value = withSpring(1);
    opacity.value = withTiming(1, { duration: 400 });
  }, [opacity, scale]);

  const followClosure = useCallback(async () => {
    try {
      const room = await loadDecisionRoom(sessionId);
      if (room.status === 'cancelled' || room.status === 'expired') {
        navigation.popToTop();
      }
    } catch {
      // A later Realtime event or recovery poll will retry transient failures.
    }
  }, [navigation, sessionId]);

  useRoomSync({
    sessionId,
    tables: ['sessions'],
    refresh: followClosure,
  });

  const dismissResult = async (next: 'done' | 'choose-again') => {
    if (endingAction) return;
    setEndingAction(next);
    setActionError(null);
    try {
      await acknowledgeDecisionRoom(sessionId);
      navigation.popToTop();
      if (next === 'choose-again') {
        navigation.navigate('ModeSelect');
      }
    } catch (cause) {
      setActionError(roomErrorMessage(cause));
      setEndingAction(null);
    }
  };
  const reveal = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Screen testID="match-screen" style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>DECISION MADE</Text>
        <Text style={styles.title}>You found your match.</Text>
        <Text style={styles.subtitle}>{mode.matchSubtitle}</Text>
      </View>
      <Animated.View style={[styles.posterWrap, reveal]}>
        <DecisionArtwork item={item} style={styles.poster} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✓ MATCHED</Text>
        </View>
      </Animated.View>
      <View style={styles.details}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.meta}>{item.meta}</Text>
        <Text style={styles.description}>{item.description}</Text>
        <Text style={styles.available}>FINAL PICK</Text>
        <View style={styles.providers}>
          {item.tags.map(tag => (
            <View key={tag} style={styles.provider}>
              <Text style={styles.providerText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        {action ? (
          <Button
            label={action.label}
            onPress={async () => {
              setActionError(null);
              try {
                await Linking.openURL(action.url);
              } catch {
                setActionError('We couldn’t open that link. Please try again.');
              }
            }}
          />
        ) : null}
        {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
        <Button
          label="Choose again"
          variant="secondary"
          loading={endingAction === 'choose-again'}
          disabled={endingAction !== null}
          onPress={() => dismissResult('choose-again')}
        />
        <Button
          label="Done"
          variant="quiet"
          loading={endingAction === 'done'}
          disabled={endingAction !== null}
          onPress={() => dismissResult('done')}
        />
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  screen: { alignItems: 'center' },
  header: { alignItems: 'center' },
  eyebrow: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.7,
    marginTop: 4,
    textAlign: 'center',
  },
  subtitle: { color: colors.muted, marginTop: 3 },
  posterWrap: { width: 214, height: 294, marginTop: 20 },
  poster: { width: '100%', height: '100%', minHeight: 0 },
  badge: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: -14,
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 99,
  },
  badgeText: { color: '#123229', fontSize: 10, fontWeight: '900' },
  details: { alignItems: 'center', marginTop: 24 },
  itemTitle: { color: colors.text, fontSize: 23, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    maxWidth: 320,
    textAlign: 'center',
  },
  available: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 12,
  },
  providers: { flexDirection: 'row', gap: 7, marginTop: 6 },
  provider: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  providerText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  error: {
    color: colors.danger,
    fontSize: 12,
    textAlign: 'center',
  },
  actions: { width: '100%', gap: 8, marginTop: 'auto' },
});
