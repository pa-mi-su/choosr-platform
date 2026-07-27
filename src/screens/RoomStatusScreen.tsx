import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { modeById } from '../data/decisions';
import { useRoomSync } from '../hooks/useRoomSync';
import { prepareSharedLocationDeck } from '../services/deckService';
import { roomErrorMessage } from '../services/roomFlow';
import {
  cancelDecisionRoom,
  loadDecisionRoom,
  type DecisionRoom,
} from '../services/sessionService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'RoomStatus'>;

const expires = (value: string): string =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export function RoomStatusScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const [room, setRoom] = useState<DecisionRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const current = await loadDecisionRoom(route.params.sessionId);
      setRoom(current);
      setError(null);
    } catch (cause) {
      setError(roomErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [route.params.sessionId]);

  useRoomSync({
    sessionId: route.params.sessionId,
    tables: ['sessions', 'participants'],
    refresh,
    maintainPresence: true,
  });

  const cancel = () => {
    if (!room || cancelling) return;
    Alert.alert(
      'Cancel this room?',
      'This ends the room for both people. Nobody will be left waiting.',
      [
        { text: 'Keep room', style: 'cancel' },
        {
          text: 'Cancel room',
          style: 'destructive',
          onPress: () => {
            setCancelling(true);
            setError(null);
            cancelDecisionRoom(room.sessionId)
              .then(() => navigation.goBack())
              .catch(cause => {
                setError(roomErrorMessage(cause));
                setCancelling(false);
              });
          },
        },
      ],
    );
  };

  const prepareChoices = async () => {
    if (!room || preparing || (room.mode !== 'eat' && room.mode !== 'do')) {
      return;
    }
    setPreparing(true);
    setError(null);
    try {
      const status = await prepareSharedLocationDeck({
        sessionId: room.sessionId,
        mode: room.mode,
      });
      if (status !== 'ready') throw new Error('room_not_active');
      navigation.replace('Swipe', {
        sessionId: room.sessionId,
        roundNumber: room.roundNumber,
        mode: room.mode,
      });
    } catch (cause) {
      setError(roomErrorMessage(cause));
      setPreparing(false);
    }
  };

  const active = room?.status === 'active';
  const waiting = room?.status === 'waiting';
  const partnerJoined = waiting && room.participantCount === 2;
  const ended =
    room?.status === 'cancelled' ||
    room?.status === 'expired' ||
    room?.status === 'completed';

  return (
    <Screen testID="room-status-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Back" variant="quiet" onPress={navigation.goBack} />
      </View>

      {loading && !room ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : room ? (
        <>
          <View style={styles.content}>
            <View
              style={[
                styles.statusPill,
                active && styles.activePill,
                ended && styles.endedPill,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  active && styles.activeDot,
                  ended && styles.endedDot,
                ]}
              />
              <Text
                style={[
                  styles.statusPillText,
                  active && styles.activePillText,
                  ended && styles.endedPillText,
                ]}
              >
                {active
                  ? 'READY TO CHOOSE'
                  : partnerJoined
                  ? 'PARTNER JOINED'
                  : waiting
                  ? 'WAITING FOR PARTNER'
                  : room.status.toUpperCase()}
              </Text>
            </View>

            <Text style={styles.eyebrow}>ROOM STATUS</Text>
            <Text style={styles.title}>{modeById[room.mode].title}</Text>
            <Text style={styles.subtitle}>
              {active
                ? 'Both people are here. Continue whenever you’re ready.'
                : partnerJoined
                ? 'Your partner joined. Choosr is building choices from your selected area.'
                : waiting
                ? 'Your room is open. You can come back here or cancel it at any time.'
                : 'This room is no longer active.'}
            </Text>

            <View style={styles.people}>
              <View style={[styles.person, styles.you]}>
                <Text style={styles.personText}>YOU</Text>
                <Text style={styles.personState}>READY</Text>
              </View>
              <View style={styles.connectionLine} />
              <View
                style={[
                  styles.person,
                  room.participantCount === 2
                    ? styles.partnerReady
                    : styles.partnerWaiting,
                ]}
              >
                <Text style={styles.personText}>
                  {room.participantCount === 2 ? '✓' : '?'}
                </Text>
                <Text style={styles.personState}>
                  {room.participantCount === 2 ? 'JOINED' : 'WAITING'}
                </Text>
              </View>
            </View>

            <View style={styles.details}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>ROOM CODE</Text>
                <Text selectable style={styles.code}>
                  {room.accessCode}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>AVAILABLE UNTIL</Text>
                <Text style={styles.detailValue}>
                  {expires(room.expiresAt)}
                </Text>
              </View>
            </View>

            {error ? (
              <Pressable accessibilityRole="button" onPress={refresh}>
                <Text style={styles.error}>{error} Tap to retry.</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.actions}>
            {active ? (
              <Button
                label="Continue choosing"
                onPress={() =>
                  navigation.replace('Swipe', {
                    sessionId: room.sessionId,
                    roundNumber: room.roundNumber,
                    mode: room.mode,
                  })
                }
              />
            ) : partnerJoined && (room.mode === 'eat' || room.mode === 'do') ? (
              <Button
                label="Prepare choices"
                loading={preparing}
                onPress={() => {
                  prepareChoices().catch(() => undefined);
                }}
              />
            ) : waiting && room.accessCode ? (
              <Button
                label="Share room code"
                variant="secondary"
                onPress={() =>
                  Share.share({
                    title: 'Join my Choosr room',
                    message: `Join my Choosr room with code ${room.accessCode}.`,
                  }).catch(() => undefined)
                }
              />
            ) : null}
            {waiting || active ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel room"
                disabled={cancelling}
                onPress={cancel}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.pressed,
                  cancelling && styles.disabled,
                ]}
              >
                {cancelling ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <Text style={styles.cancelText}>Cancel room</Text>
                )}
              </Pressable>
            ) : (
              <Button label="Back to rooms" onPress={navigation.goBack} />
            )}
          </View>
        </>
      ) : (
        <View style={styles.center}>
          <Text style={styles.error}>
            {error ?? 'This room could not be loaded.'}
          </Text>
          <Button label="Try again" variant="secondary" onPress={refresh} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  content: { alignItems: 'center', paddingTop: 22 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: '#382919',
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  activePill: { backgroundColor: '#123524' },
  endedPill: { backgroundColor: colors.surface },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  activeDot: { backgroundColor: colors.success },
  endedDot: { backgroundColor: colors.faint },
  statusPillText: {
    color: colors.accent,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  activePillText: { color: colors.success },
  endedPillText: { color: colors.faint },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 28,
  },
  title: {
    color: colors.text,
    fontSize: 38,
    lineHeight: 43,
    fontWeight: '900',
    letterSpacing: -1.5,
    marginTop: 5,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
    paddingHorizontal: 12,
  },
  people: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 30,
    paddingHorizontal: 14,
  },
  person: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  you: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  partnerReady: {
    backgroundColor: '#123524',
    borderColor: colors.success,
  },
  partnerWaiting: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  connectionLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 8,
    backgroundColor: colors.border,
  },
  personText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
  },
  personState: {
    color: colors.text,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginTop: 4,
  },
  details: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    marginTop: 27,
    paddingHorizontal: 18,
  },
  detailRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailLabel: {
    color: colors.faint,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  code: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
    letterSpacing: 2,
  },
  detailValue: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  divider: { height: 1, backgroundColor: colors.border },
  actions: { gap: 10 },
  cancelButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#251824',
    borderWidth: 1,
    borderColor: '#663344',
  },
  cancelText: { color: colors.danger, fontSize: 15, fontWeight: '900' },
  error: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 14,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
});
