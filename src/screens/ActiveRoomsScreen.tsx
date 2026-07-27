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
import { prepareSharedLocationDeck } from '../services/deckService';
import {
  answerRoomInvitation,
  circleErrorMessage,
  loadPendingRoomInvitations,
  readCachedCircleSnapshot,
  type PendingRoomInvitation,
} from '../services/circleService';
import {
  loadDecisionDeck,
  loadRoomHistory,
  readCachedRoomHistory,
  type RoomHistoryItem,
} from '../services/sessionService';
import { serviceFailureMessage } from '../services/serviceError';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveRooms'>;
type ActiveRoomRow =
  | { kind: 'section'; id: string; title: string }
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
  const [openingRoomId, setOpeningRoomId] = useState<string | null>(null);
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

  const open = async (room: RoomHistoryItem) => {
    if (openingRoomId) return;
    setOpeningRoomId(room.sessionId);
    setError(null);
    try {
      if (room.status === 'waiting') {
        if (
          room.participantCount === 2 &&
          (room.mode === 'eat' || room.mode === 'do')
        ) {
          const status = await prepareSharedLocationDeck({
            sessionId: room.sessionId,
            mode: room.mode,
          });
          if (status !== 'ready') throw new Error('room_not_active');
          navigation.navigate('Swipe', {
            sessionId: room.sessionId,
            roundNumber: room.roundNumber,
            mode: room.mode,
          });
          return;
        }
        navigation.navigate('RoomStatus', { sessionId: room.sessionId });
        return;
      }
      if (room.status === 'active') {
        navigation.navigate('Swipe', {
          sessionId: room.sessionId,
          roundNumber: room.roundNumber,
          mode: room.mode,
        });
        return;
      }
      if (room.status === 'matched' && room.matchedItemId) {
        const deck = await loadDecisionDeck(room.sessionId, room.roundNumber);
        const item = deck.find(choice => choice.id === room.matchedItemId);
        if (!item) throw new Error('match_result_unavailable');
        navigation.navigate('Match', { sessionId: room.sessionId, item });
        return;
      }
      if (room.status === 'completed') {
        navigation.navigate('NoMatch', {
          sessionId: room.sessionId,
          mode: room.mode,
        });
      }
    } catch {
      setError('That room result could not be loaded. Pull down to retry.');
    } finally {
      setOpeningRoomId(null);
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
        const status = await prepareSharedLocationDeck({
          sessionId: room.sessionId,
          mode: invitation.mode,
        });
        if (status !== 'ready') throw new Error('room_not_active');
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

  const activeRooms = rooms.filter(
    room => room.status === 'waiting' || room.status === 'active',
  );
  const completedRooms = rooms.filter(
    room => room.status === 'matched' || room.status === 'completed',
  );
  const rows: ActiveRoomRow[] = !hasSnapshot
    ? []
    : [
        { kind: 'section' as const, id: 'section:active', title: 'ACTIVE' },
        ...invitations.map(invitation => ({
          kind: 'invitation' as const,
          id: `invitation:${invitation.invitationId}`,
          invitation,
        })),
        ...activeRooms.map(room => ({
          kind: 'room' as const,
          id: `room:${room.sessionId}`,
          room,
        })),
        ...(activeRooms.length === 0 && invitations.length === 0
          ? [{ kind: 'empty-active' as const, id: 'empty:active' }]
          : []),
        ...(completedRooms.length
          ? [
              {
                kind: 'section' as const,
                id: 'section:completed',
                title: 'COMPLETED',
              },
              ...completedRooms.map(room => ({
                kind: 'room' as const,
                id: `room:${room.sessionId}`,
                room,
              })),
            ]
          : []),
      ];

  return (
    <Screen testID="active-rooms-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Close" variant="quiet" onPress={navigation.goBack} />
      </View>
      <Text style={styles.eyebrow}>YOUR ROOMS</Text>
      <Text style={styles.title}>Active rooms and completed picks.</Text>
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
            if (item.kind === 'section') {
              return <Text style={styles.sectionTitle}>{item.title}</Text>;
            }
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
            const completed =
              room.status === 'matched' || room.status === 'completed';
            const viewable =
              room.status === 'waiting' || resumable || completed;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${modeById[room.mode].title}. ${
                  room.status === 'waiting'
                    ? room.participantCount === 2 &&
                      (room.mode === 'eat' || room.mode === 'do')
                      ? 'Partner joined. Prepare choices.'
                      : 'Waiting for a partner. View room status.'
                    : resumable
                    ? 'Continue choosing.'
                    : room.status === 'matched'
                    ? 'Decision complete. View result.'
                    : room.status === 'completed'
                    ? 'Round complete. View result.'
                    : room.status
                }`}
                disabled={!viewable || openingRoomId !== null}
                onPress={() => {
                  open(room).catch(() => undefined);
                }}
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
                      ? room.participantCount === 2 &&
                        (room.mode === 'eat' || room.mode === 'do')
                        ? 'Partner joined · ready to build choices'
                        : room.accessCode
                        ? `Waiting for a partner · ${room.accessCode}`
                        : 'Waiting for a partner · reconnect to share'
                      : resumable
                      ? `${Math.min(
                          room.completedChoices,
                          room.totalChoices,
                        )} of ${room.totalChoices} choices finished`
                      : room.status === 'matched'
                      ? 'Your shared result is ready'
                      : room.status === 'completed'
                      ? 'No match this round'
                      : room.status.replace('-', ' ')}
                  </Text>
                </View>
                {viewable ? (
                  <View style={styles.roomAction}>
                    <Text style={styles.roomActionLabel}>
                      {resumable
                        ? 'Continue'
                        : completed
                        ? 'View result'
                        : room.participantCount === 2 &&
                          (room.mode === 'eat' || room.mode === 'do')
                        ? 'Prepare choices'
                        : 'View status'}
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
  sectionTitle: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginTop: 12,
    marginBottom: 2,
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
