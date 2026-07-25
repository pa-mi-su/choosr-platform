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
  | { kind: 'room'; id: string; room: RoomHistoryItem };

export function ActiveRoomsScreen({ navigation }: Props): React.JSX.Element {
  const [rooms, setRooms] = useState<RoomHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSnapshotRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    if (!hasSnapshotRef.current) {
      setLoading(true);
      const cached = await readCachedRoomHistory();
      if (cached) {
        setRooms(cached);
        hasSnapshotRef.current = true;
        setHasSnapshot(true);
        setLoading(false);
      }
    }
    try {
      const freshRooms = await loadRoomHistory();
      setRooms(freshRooms);
      hasSnapshotRef.current = true;
      setHasSnapshot(true);
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
    if (room.status !== 'active') return;
    navigation.navigate('Swipe', {
      sessionId: room.sessionId,
      roundNumber: room.roundNumber,
      mode: room.mode,
    });
  };

  const rows: ActiveRoomRow[] = !hasSnapshot
    ? []
    : rooms.length === 0
    ? [{ kind: 'empty-active' as const, id: 'empty:active' }]
    : rooms.map(room => ({
        kind: 'room' as const,
        id: room.sessionId,
        room,
      }));

  return (
    <Screen testID="active-rooms-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Close" variant="quiet" onPress={navigation.goBack} />
      </View>
      <Text style={styles.eyebrow}>YOUR ROOMS</Text>
      <Text style={styles.title}>Pick up where you left off.</Text>
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
                  <Text style={styles.emptyTitle}>No active rooms</Text>
                  <Text style={styles.emptyText}>
                    Rooms you start or join will appear here, and unfinished
                    rooms can be resumed later.
                  </Text>
                </View>
              );
            }
            const room = item.room;
            const resumable = room.status === 'active';
            return (
              <Pressable
                accessibilityRole="button"
                disabled={!resumable}
                onPress={() => open(room)}
                style={({ pressed }) => [
                  styles.card,
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
                {resumable ? (
                  <Text style={styles.continue}>Continue ›</Text>
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
  pressed: { opacity: 0.72 },
  icon: { fontSize: 25, marginRight: 12 },
  copy: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  continue: { color: colors.primary, fontSize: 12, fontWeight: '900' },
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
