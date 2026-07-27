import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { modeById } from '../data/decisions';
import { prepareSharedLocationDeck } from '../services/deckService';
import {
  answerRoomInvitation,
  circleErrorMessage,
  dismissRoomInvitation,
  loadPendingRoomInvitations,
  readCachedCircleSnapshot,
  type PendingRoomInvitation,
} from '../services/circleService';
import {
  acknowledgeDecisionRoom,
  dismissAllCompletedRooms,
  dismissCompletedRoom,
  loadDecisionDeck,
  loadRoomHistory,
  readCachedRoomHistory,
  type RoomHistoryItem,
} from '../services/sessionService';
import { subscribeToNotificationState } from '../services/notificationService';
import { serviceFailureMessage } from '../services/serviceError';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveRooms'>;
type RoomsTab = 'active' | 'completed';
type RoomRow =
  | { kind: 'section'; id: string; title: string; count?: number }
  | { kind: 'tabs'; id: string }
  | { kind: 'empty'; id: string; tab: RoomsTab }
  | { kind: 'invitation'; id: string; invitation: PendingRoomInvitation }
  | { kind: 'room'; id: string; room: RoomHistoryItem; needsAction: boolean };

let preservedTab: RoomsTab = 'active';
const preservedOffsets: Record<RoomsTab, number> = {
  active: 0,
  completed: 0,
};

function completed(room: RoomHistoryItem): boolean {
  return room.status === 'matched' || room.status === 'completed';
}

function needsAction(room: RoomHistoryItem): boolean {
  if (completed(room)) return room.resultAcknowledged === false;
  if (
    room.status === 'waiting' &&
    room.participantCount === 2 &&
    (room.mode === 'eat' || room.mode === 'do')
  ) {
    return true;
  }
  return room.status === 'active' && room.selectionComplete === false;
}

function relativeTime(value: string): string {
  const milliseconds = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : 'Yesterday';
}

function partnerName(room: RoomHistoryItem): string {
  return room.partnerDisplayName ?? 'Your room';
}

function groupedByPerson(rooms: RoomHistoryItem[]): RoomHistoryItem[] {
  const newestByPerson = new Map<string, number>();
  rooms.forEach(room => {
    const person = partnerName(room);
    newestByPerson.set(
      person,
      Math.max(newestByPerson.get(person) ?? 0, Date.parse(room.createdAt)),
    );
  });
  return [...rooms].sort((left, right) => {
    const groupRecency =
      (newestByPerson.get(partnerName(right)) ?? 0) -
      (newestByPerson.get(partnerName(left)) ?? 0);
    if (groupRecency) return groupRecency;
    const personOrder = partnerName(left).localeCompare(partnerName(right));
    if (personOrder) return personOrder;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}

function statusCopy(room: RoomHistoryItem): string {
  if (room.status === 'matched') {
    return room.resultAcknowledged ? 'Matched' : 'Result ready';
  }
  if (room.status === 'completed') {
    return room.resultAcknowledged ? 'No match' : 'Result ready';
  }
  if (room.status === 'waiting') {
    return room.participantCount === 2
      ? 'Choices are ready'
      : 'Waiting for someone';
  }
  const remaining = Math.max(0, room.totalChoices - room.completedChoices);
  if (!remaining) {
    if (room.selectionComplete === false) return 'Finish ranking your picks';
    return room.partnerDisplayName
      ? `Waiting for ${room.partnerDisplayName}`
      : 'Waiting for partner';
  }
  return `${remaining} ${remaining === 1 ? 'choice' : 'choices'} remaining`;
}

function primaryAction(room: RoomHistoryItem): string {
  if (completed(room)) return 'View result';
  if (room.status === 'active') return 'Continue';
  return room.participantCount === 2 &&
    (room.mode === 'eat' || room.mode === 'do')
    ? 'Prepare choices'
    : 'View status';
}

export function ActiveRoomsScreen({ navigation }: Props): React.JSX.Element {
  const [tab, setTab] = useState<RoomsTab>(preservedTab);
  const [rooms, setRooms] = useState<RoomHistoryItem[]>([]);
  const [invitations, setInvitations] = useState<PendingRoomInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningInvitationId, setJoiningInvitationId] = useState<string | null>(
    null,
  );
  const [dismissingInvitationId, setDismissingInvitationId] = useState<
    string | null
  >(null);
  const [openingRoomId, setOpeningRoomId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [clearingCompleted, setClearingCompleted] = useState(false);
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
      const subscription = subscribeToNotificationState(() => {
        load().catch(() => undefined);
      });
      return () => subscription.remove();
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
      if (!room.resultAcknowledged) {
        await acknowledgeDecisionRoom(room.sessionId);
        setRooms(current =>
          current.map(history =>
            history.sessionId === room.sessionId
              ? { ...history, resultAcknowledged: true }
              : history,
          ),
        );
      }
      if (room.status === 'matched' && room.matchedItemId) {
        const deck = await loadDecisionDeck(room.sessionId, room.roundNumber);
        const item = deck.find(choice => choice.id === room.matchedItemId);
        if (!item) throw new Error('match_result_unavailable');
        navigation.navigate('Match', {
          sessionId: room.sessionId,
          item,
          openedFromHistory: true,
          partnerDisplayName: room.partnerDisplayName,
          partnerPhotoUrl: room.partnerPhotoUrl,
        });
        return;
      }
      navigation.navigate('NoMatch', {
        sessionId: room.sessionId,
        mode: room.mode,
        openedFromHistory: true,
        partnerDisplayName: room.partnerDisplayName,
        partnerPhotoUrl: room.partnerPhotoUrl,
      });
    } catch {
      setError('That room result could not be loaded. Pull down to retry.');
    } finally {
      setOpeningRoomId(null);
    }
  };

  const deleteCompletedRoom = (room: RoomHistoryItem) => {
    Alert.alert(
      'Manage completed pick',
      `${partnerName(room)} · ${modeById[room.mode].title}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (deletingRoomId || clearingCompleted) return;
            setDeletingRoomId(room.sessionId);
            dismissCompletedRoom(room.sessionId)
              .then(() =>
                setRooms(current =>
                  current.filter(
                    history => history.sessionId !== room.sessionId,
                  ),
                ),
              )
              .catch(cause =>
                setError(
                  serviceFailureMessage(
                    cause,
                    'That completed pick could not be deleted.',
                  ),
                ),
              )
              .finally(() => setDeletingRoomId(null));
          },
        },
      ],
    );
  };

  const deleteAllCompletedRooms = () => {
    Alert.alert(
      'Delete all completed picks?',
      'This clears your history only. The other people keep their results.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            if (deletingRoomId || clearingCompleted) return;
            setClearingCompleted(true);
            dismissAllCompletedRooms()
              .then(() =>
                setRooms(current => current.filter(room => !completed(room))),
              )
              .catch(cause =>
                setError(
                  serviceFailureMessage(
                    cause,
                    'Completed picks could not be deleted.',
                  ),
                ),
              )
              .finally(() => setClearingCompleted(false));
          },
        },
      ],
    );
  };

  const openInvitation = async (invitation: PendingRoomInvitation) => {
    if (joiningInvitationId || dismissingInvitationId) return;
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

  const dismissInvitation = async (invitation: PendingRoomInvitation) => {
    if (joiningInvitationId || dismissingInvitationId) return;
    setDismissingInvitationId(invitation.invitationId);
    setInvitations(current =>
      current.filter(
        pending => pending.invitationId !== invitation.invitationId,
      ),
    );
    try {
      await dismissRoomInvitation(invitation.invitationId);
    } catch (cause) {
      setError(circleErrorMessage(cause));
      await load();
    } finally {
      setDismissingInvitationId(null);
    }
  };

  const actionableRooms = rooms.filter(needsAction);
  const activeRooms = groupedByPerson(
    rooms.filter(
      room =>
        (room.status === 'waiting' || room.status === 'active') &&
        !needsAction(room),
    ),
  );
  const completedRooms = groupedByPerson(
    rooms.filter(room => completed(room) && !needsAction(room)),
  );
  const needsCount = invitations.length + actionableRooms.length;
  const tabRooms = tab === 'active' ? activeRooms : completedRooms;
  const rows: RoomRow[] = !hasSnapshot
    ? []
    : [
        ...(needsCount
          ? [
              {
                kind: 'section' as const,
                id: 'section:needs',
                title: 'NEEDS YOU',
                count: needsCount,
              },
              ...invitations.map(invitation => ({
                kind: 'invitation' as const,
                id: `invitation:${invitation.invitationId}`,
                invitation,
              })),
              ...actionableRooms.map(room => ({
                kind: 'room' as const,
                id: `needs:${room.sessionId}`,
                room,
                needsAction: true,
              })),
            ]
          : []),
        { kind: 'tabs' as const, id: 'tabs' },
        ...(tabRooms.length
          ? tabRooms.map(room => ({
              kind: 'room' as const,
              id: `${tab}:${room.sessionId}`,
              room,
              needsAction: false,
            }))
          : [{ kind: 'empty' as const, id: `empty:${tab}`, tab }]),
      ];

  const changeTab = (next: RoomsTab) => {
    preservedTab = next;
    setTab(next);
  };
  const rememberOffset = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    preservedOffsets[tab] = event.nativeEvent.contentOffset.y;
  };

  return (
    <Screen testID="active-rooms-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <View style={styles.headerCount}>
          <Text style={styles.headerCountText}>{needsCount} NEED YOU</Text>
        </View>
        <Button label="Close" variant="quiet" onPress={navigation.goBack} />
      </View>
      <Text style={styles.eyebrow}>ROOMS</Text>
      <Text style={styles.title}>What needs your attention.</Text>
      {loading && !hasSnapshot ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          key={`rooms:${tab}`}
          data={rows}
          keyExtractor={item => item.id}
          contentOffset={{ x: 0, y: preservedOffsets[tab] }}
          onScroll={rememberOffset}
          scrollEventThrottle={80}
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
              return (
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>{item.title}</Text>
                  {item.count ? (
                    <View style={styles.countBadge}>
                      <Text style={styles.countText}>{item.count}</Text>
                    </View>
                  ) : null}
                </View>
              );
            }
            if (item.kind === 'tabs') {
              return (
                <View style={styles.tabs}>
                  {(['active', 'completed'] as const).map(option => (
                    <Pressable
                      key={option}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: tab === option }}
                      accessibilityLabel={`${option} rooms`}
                      onPress={() => changeTab(option)}
                      style={[styles.tab, tab === option && styles.tabSelected]}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          tab === option && styles.tabTextSelected,
                        ]}
                      >
                        {option.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                  {tab === 'completed' && completedRooms.length ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Delete all completed picks"
                      onPress={deleteAllCompletedRooms}
                      style={styles.manage}
                    >
                      <Text style={styles.manageText}>
                        {clearingCompleted ? 'CLEARING…' : 'MANAGE'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            }
            if (item.kind === 'empty') {
              return (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>
                    {item.tab === 'active'
                      ? 'Nothing waiting in the background'
                      : 'No completed picks'}
                  </Text>
                  <Text style={styles.emptyText}>
                    {item.tab === 'active'
                      ? 'New invitations and rooms requiring action will appear above.'
                      : 'Completed results remain available here for 24 hours.'}
                  </Text>
                </View>
              );
            }
            if (item.kind === 'invitation') {
              const invitation = item.invitation;
              return (
                <View style={[styles.card, styles.needsCard]}>
                  <ProfileAvatar
                    displayName={invitation.senderDisplayName}
                    size="small"
                    style={styles.avatar}
                  />
                  <View style={styles.copy}>
                    <View style={styles.cardTopLine}>
                      <Text style={styles.person}>
                        {invitation.senderDisplayName}
                      </Text>
                      <Text style={styles.statusBadge}>INVITED</Text>
                    </View>
                    <Text style={styles.activity}>
                      {modeById[invitation.mode].title}
                    </Text>
                  </View>
                  <View style={styles.invitationActions}>
                    <Button
                      label="Join"
                      loading={joiningInvitationId === invitation.invitationId}
                      disabled={
                        joiningInvitationId !== null ||
                        dismissingInvitationId !== null
                      }
                      onPress={() => openInvitation(invitation)}
                    />
                    <Button
                      label="Dismiss"
                      variant="quiet"
                      disabled={
                        joiningInvitationId !== null ||
                        dismissingInvitationId !== null
                      }
                      onPress={() =>
                        dismissInvitation(invitation).catch(() => undefined)
                      }
                    />
                  </View>
                </View>
              );
            }
            const room = item.room;
            return (
              <View style={[styles.card, item.needsAction && styles.needsCard]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${modeById[room.mode].title}. ${
                    room.status === 'waiting'
                      ? room.participantCount === 2 &&
                        (room.mode === 'eat' || room.mode === 'do')
                        ? 'Partner joined. Prepare choices.'
                        : 'Waiting for a partner. View room status.'
                      : room.status === 'active'
                      ? 'Continue choosing.'
                      : room.status === 'matched'
                      ? 'Decision complete. View result.'
                      : 'Round complete. View result.'
                  }`}
                  disabled={openingRoomId !== null}
                  onPress={() => open(room).catch(() => undefined)}
                  style={({ pressed }) => [
                    styles.roomOpen,
                    pressed && styles.pressed,
                  ]}
                >
                  <ProfileAvatar
                    displayName={partnerName(room)}
                    photoUrl={room.partnerPhotoUrl}
                    size="small"
                    style={styles.avatar}
                  />
                  <View style={styles.copy}>
                    <View style={styles.cardTopLine}>
                      <Text style={styles.person}>{partnerName(room)}</Text>
                      <Text style={styles.statusBadge}>
                        {statusCopy(room).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.activity}>
                      {modeById[room.mode].title}
                      {completed(room)
                        ? ` · ${relativeTime(room.createdAt)}`
                        : ''}
                    </Text>
                    {!completed(room) ? (
                      <Text style={styles.roomStatus}>{statusCopy(room)}</Text>
                    ) : null}
                  </View>
                  <View style={styles.primaryAction}>
                    <Text style={styles.primaryActionText}>
                      {openingRoomId === room.sessionId
                        ? 'OPENING…'
                        : primaryAction(room)}
                    </Text>
                    <Text style={styles.arrow}>›</Text>
                  </View>
                </Pressable>
                {completed(room) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${
                      modeById[room.mode].title
                    } completed pick`}
                    disabled={deletingRoomId !== null || clearingCompleted}
                    onPress={() => deleteCompletedRoom(room)}
                    style={styles.more}
                  >
                    <Text style={styles.moreText}>•••</Text>
                  </Pressable>
                ) : null}
              </View>
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
  headerCount: {
    backgroundColor: colors.raised,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerCountText: {
    color: colors.primary,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 24,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '900',
    letterSpacing: -1.1,
    marginTop: 5,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingTop: 18, paddingBottom: 32, gap: 9 },
  sectionRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionTitle: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  countText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: '900',
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: 13,
  },
  tab: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelected: { borderBottomColor: colors.primary },
  tabText: {
    color: colors.faint,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  tabTextSelected: { color: colors.text },
  manage: { marginLeft: 'auto', padding: 10 },
  manageText: { color: colors.muted, fontSize: 9, fontWeight: '900' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 17,
    padding: 13,
  },
  needsCard: {
    borderColor: colors.primary,
    backgroundColor: colors.raised,
  },
  roomOpen: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: { marginRight: 11 },
  copy: { flex: 1 },
  cardTopLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  person: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    flexShrink: 1,
  },
  activity: { color: colors.muted, fontSize: 11, marginTop: 3 },
  roomStatus: { color: colors.faint, fontSize: 10, marginTop: 4 },
  statusBadge: {
    color: colors.primary,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  primaryAction: { alignItems: 'flex-end', marginLeft: 8 },
  primaryActionText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
  },
  arrow: { color: colors.primary, fontSize: 22, lineHeight: 23 },
  invitationActions: { width: 86, gap: 1 },
  more: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingLeft: 10,
  },
  moreText: { color: colors.muted, fontSize: 15, letterSpacing: 1 },
  pressed: { opacity: 0.72 },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 17,
    padding: 18,
  },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  emptyText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  error: {
    color: colors.danger,
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 8,
  },
});
