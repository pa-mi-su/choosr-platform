import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import {
  loadNotifications,
  markAllNotificationsRead,
  type ChoosrNotification,
} from '../services/notificationService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const when = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export function NotificationsScreen({ navigation }: Props): React.JSX.Element {
  const [items, setItems] = useState<ChoosrNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const notifications = await loadNotifications();
      setItems(notifications);
      await markAllNotificationsRead();
      setItems(current =>
        current.map(item => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
    } catch {
      setError('Notifications could not be loaded. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <Screen testID="notifications-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Close" variant="quiet" onPress={navigation.goBack} />
      </View>
      <Text style={styles.eyebrow}>YOUR UPDATES</Text>
      <Text style={styles.title}>Notifications</Text>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={items.length ? styles.list : styles.emptyList}
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
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.bell}>🔔</Text>
              <Text style={styles.emptyTitle}>You’re all caught up.</Text>
              <Text style={styles.emptyCopy}>
                Room invitations and Circle requests will appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.body}`}
              onPress={() => navigation.navigate('Circle')}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.icon}>
                <Text style={styles.iconText}>
                  {item.kind === 'room_invitation' ? '✓' : '●●'}
                </Text>
              </View>
              <View style={styles.copy}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>
                <Text style={styles.date}>{when(item.createdAt)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
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
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginTop: 7,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingTop: 24, paddingBottom: 24, gap: 10 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 15,
  },
  pressed: { opacity: 0.72 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  copy: { flex: 1, marginLeft: 13 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  cardBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  date: { color: colors.faint, fontSize: 10, marginTop: 7 },
  chevron: { color: colors.faint, fontSize: 28 },
  empty: { alignItems: 'center', paddingHorizontal: 30 },
  bell: { color: colors.primary, fontSize: 50 },
  emptyTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 14,
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
});
