import React, { useCallback, useState } from 'react';
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
  type RoomHistoryItem,
} from '../services/sessionService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveRooms'>;

const bucket = (room: RoomHistoryItem): 'active' | 'completed' | 'expired' => {
  if (
    room.status === 'expired' ||
    room.status === 'cancelled' ||
    new Date(room.expiresAt).getTime() <= Date.now()
  )
    return 'expired';
  if (room.status === 'matched' || room.status === 'completed')
    return 'completed';
  return 'active';
};

export function ActiveRoomsScreen({ navigation }: Props): React.JSX.Element {
  const [rooms, setRooms] = useState<RoomHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRooms(await loadRoomHistory());
    } catch {
      setError('Your rooms could not be loaded. Pull down to retry.');
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
    if (bucket(room) !== 'active' || room.status !== 'active') return;
    navigation.navigate('Swipe', {
      sessionId: room.sessionId,
      roundNumber: room.roundNumber,
      mode: room.mode,
    });
  };

  const sections = ['active', 'completed', 'expired'] as const;
  const rows = sections.flatMap(section => [
    { kind: 'heading' as const, id: `heading:${section}`, section },
    ...rooms
      .filter(room => bucket(room) === section)
      .map(room => ({ kind: 'room' as const, id: room.sessionId, room })),
  ]);

  return (
    <Screen testID="active-rooms-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Close" variant="quiet" onPress={navigation.goBack} />
      </View>
      <Text style={styles.eyebrow}>YOUR ROOMS</Text>
      <Text style={styles.title}>Pick up where you left off.</Text>
      {loading ? (
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
            error ? <Text style={styles.error}>{error}</Text> : null
          }
          renderItem={({ item }) => {
            if (item.kind === 'heading') {
              const count = rooms.filter(
                room => bucket(room) === item.section,
              ).length;
              return (
                <Text style={styles.sectionTitle}>
                  {item.section.toUpperCase()} · {count}
                </Text>
              );
            }
            const room = item.room;
            const resumable =
              bucket(room) === 'active' && room.status === 'active';
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
                      ? `Waiting for a partner · ${room.accessCode}`
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
  sectionTitle: {
    color: colors.faint,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 14,
  },
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
});
