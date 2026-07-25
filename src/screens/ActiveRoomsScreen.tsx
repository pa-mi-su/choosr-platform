import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { modeById } from '../data/decisions';
import {
  answerRoomInvitation,
  circleErrorMessage,
  loadPendingRoomInvitations,
  readCachedCircleSnapshot,
  type PendingRoomInvitation,
} from '../services/circleService';
import {
  loadRoomHistory,
  readCachedRoomHistory,
  type RoomHistoryItem,
} from '../services/sessionService';
import { serviceFailureMessage } from '../services/serviceError';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveRooms'>;
type ActiveRoomRow =
  | { kind: 'empty-active'; id: string }
  | { kind: 'invitation'; id: string; invitation: PendingRoomInvitation }
  | { kind: 'room'; id: string; room: RoomHistoryItem };

export function ActiveRoomsScreen({ navigation }: Props): React.JSX.Element {
  const [rooms, setRooms] = useState<RoomHistoryItem[]>([]);
  const [invitations, setInvitations] = useState<PendingRoomInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningInvitationId, setJoiningInvitationId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const hasSnapshotRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    if (!hasSnapshotRef.current) {
      setLoading(true);
      await Promise.all([readCachedRoomHistory(), readCachedCircleSnapshot()])
        .then(([cachedRooms, cachedCircle]) => {
          if (!cachedRooms && !cachedCircle) return;
          setRooms(cachedRooms ?? []);
          setInvitations(cachedCircle?.invitations ?? []);
          hasSnapshotRef.current = true;
          setHasSnapshot(true);
          setLoading(false);
        })
        .catch(() => undefined);
    }
    const [roomResult, invitationResult] = await Promise.allSettled([
      loadRoomHistory(),
      loadPendingRoomInvitations(),
    ]);
    try {
      if (
        roomResult.status === 'rejected' &&
        invitationResult.status === 'rejected'
      ) {
        throw roomResult.reason;
      }
      if (roomResult.status === 'fulfilled') setRooms(roomResult.value);
      if (invitationResult.status === 'fulfilled') {
        setInvitations(invitationResult.value);
      }
      hasSnapshotRef.current = true;
      setHasSnapshot(true);
      if (
        roomResult.status === 'rejected' ||
        invitationResult.status === 'rejected'
      ) {
        setError('Connection is weak. Some room updates may be delayed.');
      }
    } catch (cause) {
      setError(
        hasSnapshotRef.current
          ? 'Connection is weak. Showing your saved rooms.'
          : serviceFailureMessage(
              cause,
              'Your rooms could not be loaded. Pull down to retry.',
            ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const open = (room: RoomHistoryItem) => {
    if (room.status === 'waiting') {
      navigation.navigate('RoomStatus', { sessionId: room.sessionId });
      return;
    }
    if (room.status === 'active') {
      navigation.navigate('Swipe', {
        sessionId: room.sessionId,
        roundNumber: room.roundNumber,
        mode: room.mode,
      });
    }
  };

  const openInvitation = async (invitation: PendingRoomInvitation) => {
    if (joiningInvitationId) return;
    setJoiningInvitationId(invitation.invitationId);
    setError(null);
    try {
      const room = await answerRoomInvitation(invitation.invitationId, true);
      if (!room) throw new Error('invitation_unavailable');
      setInvitations(current =>
        current.filter(
          pending => pending.invitationId !== invitation.invitationId,
        ),
      );
      if (invitation.mode === 'eat' || invitation.mode === 'do') {
        navigation.replace('LocalSetup', {
          mode: invitation.mode,
          sessionId: room.sessionId,
          roundNumber: room.roundNumber,
        });
        return;
      }
      navigation.replace('Swipe', {
        sessionId: room.sessionId,
        roundNumber: room.roundNumber,
        mode: invitation.mode,
      });
    } catch (cause) {
      setError(circleErrorMessage(cause));
      setJoiningInvitationId(null);
    }
  };

  const rows: ActiveRoomRow[] = !hasSnapshot
    ? []
    : rooms.length === 0 && invitations.length === 0
    ? [{ kind: 'empty-active' as const, id: 'empty:active' }]
    : [
        ...invitations.map(invitation => ({
          kind: 'invitation' as const,
          id: `invitation:${invitation.invitationId}`,
          invitation,
        })),
        ...rooms.map(room => ({
          kind: 'room' as const,
          id: `room:${room.sessionId}`,
          room,
        })),
      ];

  return (
    <Screen testID="active-rooms-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Close" variant="quiet" onPress={navigation.goBack} />
      </View>
      <Text style={styles.eyebrow}>YOUR ROOMS</Text>
      <Text style={styles.title}>Invites and rooms, all in one place.</Text>
      {loading && !hasSnapshot ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              onRefresh={() => {
                setRefreshing(true);
                load().catch(() => undefined);
              }}
            />
          }
          ListHeaderComponent={
            error ? (
              <Pressable accessibilityRole="button" onPress={load}>
                <Text style={styles.error}>{error} Tap to retry.</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            if (item.kind === 'empty-active') {
              return (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No rooms or invites</Text>
                  <Text style={styles.emptyText}>
                    Invitations and rooms you start or join will appear here.
                    Unfinished rooms can be resumed later.
                  </Text>
                </View>
              );
            }
            if (item.kind === 'invitation') {
              const invitation = item.invitation;
              return (
                <View style={[styles.card, styles.invitationCard]}>
                  <Text style={styles.icon}>
                    {modeById[invitation.mode].icon}
                  </Text>
                  <View style={styles.copy}>
                    <Text style={styles.invitationLabel}>ROOM INVITE</Text>
                    <Text style={styles.cardTitle}>
                      {invitation.senderDisplayName} wants to choose
                    </Text>
                    <Text style={styles.cardMeta}>
                      {modeById[invitation.mode].title}
                    </Text>
                  </View>
                  <View style={styles.joinButton}>
                    <Button
                      label="Join"
                      loading={joiningInvitationId === invitation.invitationId}
                      disabled={joiningInvitationId !== null}
                      onPress={() => openInvitation(invitation)}
                    />
                  </View>
                </View>
              );
            }
            const room = item.room;
            const resumable = room.status === 'active';
            const viewable = room.status === 'waiting' || resumable;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${modeById[room.mode].title}. ${
                  room.status === 'waiting'
                    ? 'Waiting for a partner. View room status.'
                    : resumable
                    ? 'Continue choosing.'
                    : room.status
                }`}
                disabled={!viewable}
                onPress={() => open(room)}
                style={({ pressed }) => [
                  styles.card,
                  room.status === 'waiting' && styles.waitingCard,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.icon}>{modeById[room.mode].icon}</Text>
                <View style={styles.copy}>
                  <Text style={styles.cardTitle}>
                    {modeById[room.mode].title}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {room.status === 'waiting'
                      ? room.accessCode
                        ? `Waiting for a partner · ${room.accessCode}`
                        : 'Waiting for a partner · reconnect to share'
                      : resumable
                      ? `${Math.min(
                          room.completedChoices,
                          room.totalChoices,
                        )} of ${room.totalChoices} choices finished`
                      : room.status.replace('-', ' ')}
                  </Text>
                </View>
                {viewable ? (
                  <View style={styles.roomAction}>
                    <Text style={styles.roomActionLabel}>
                      {resumable ? 'Continue' : 'View status'}
                    </Text>
                    <Text style={styles.roomActionArrow}>›</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 28,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: -1.3,
    marginTop: 7,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingTop: 20, paddingBottom: 30, gap: 9 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 15,
  },
  invitationCard: {
    borderColor: colors.primary,
    backgroundColor: colors.raised,
  },
  waitingCard: {
    borderColor: '#765421',
    backgroundColor: '#171F2E',
  },
  invitationLabel: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  joinButton: {
    width: 82,
  },
  pressed: { opacity: 0.72 },
  icon: { fontSize: 25, marginRight: 12 },
  copy: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  roomAction: { alignItems: 'flex-end', marginLeft: 8 },
  roomActionLabel: {
    color: colors.primary,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
  },
  roomActionArrow: {
    color: colors.primary,
    fontSize: 23,
    lineHeight: 23,
    fontWeight: '600',
  },
  error: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 18,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
});
