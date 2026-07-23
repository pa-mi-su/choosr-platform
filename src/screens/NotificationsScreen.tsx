import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Brand, Button, Screen } from '../components/UI';
import {
  loadNotifications,
  deleteNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  type ChoosrNotification,
} from '../services/notificationService';
import { loadPendingRoomInvitations } from '../services/circleService';
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
    } catch {
      setError('Notifications could not be loaded. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const markRead = async (item: ChoosrNotification) => {
    if (item.readAt) return;
    try {
      await markNotificationsRead([item.id]);
      setItems(current =>
        current.map(value =>
          value.id === item.id
            ? { ...value, readAt: new Date().toISOString() }
            : value,
        ),
      );
    } catch {
      setError('That notification could not be updated.');
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteNotifications([id]);
      setItems(current => current.filter(item => item.id !== id));
    } catch {
      setError('That notification could not be deleted.');
    }
  };

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems(current =>
        current.map(item => ({ ...item, readAt: item.readAt ?? now })),
      );
    } catch {
      setError('Notifications could not be updated.');
    }
  };

  const confirmClear = () =>
    Alert.alert(
      'Clear all notifications?',
      'This removes every notification from your inbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: () => {
            deleteNotifications()
              .then(() => setItems([]))
              .catch(() => setError('Notifications could not be cleared.'));
          },
        },
      ],
    );

  const openNotification = async (item: ChoosrNotification) => {
    if (item.kind === 'room_invitation') {
      const invitationId =
        typeof item.payload.invitation_id === 'string'
          ? item.payload.invitation_id
          : null;
      try {
        const pendingInvitations = await loadPendingRoomInvitations();
        const invitationIsPending =
          invitationId !== null &&
          pendingInvitations.some(
            invitation => invitation.invitationId === invitationId,
          );
        if (!invitationIsPending) {
          await remove(item.id);
          Alert.alert(
            'Room no longer active',
            'This invitation expired or the room was cancelled.',
          );
          return;
        }
      } catch {
        setError('That room could not be checked. Pull down and try again.');
        return;
      }
    }

    await markRead(item);
    navigation.navigate('Circle');
  };

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
      <View style={styles.titleRow}>
        <Text style={styles.title}>Notifications</Text>
        {items.length ? (
          <View style={styles.headerActions}>
            <Pressable onPress={markAllRead}>
              <Text style={styles.headerAction}>Read all</Text>
            </Pressable>
            <Pressable onPress={confirmClear}>
              <Text style={[styles.headerAction, styles.clearAction]}>
                Clear
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
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
            <Swipeable
              friction={2}
              rightThreshold={42}
              renderRightActions={() => (
                <View style={styles.swipeActions}>
                  {!item.readAt ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${item.title} as read`}
                      onPress={() => markRead(item)}
                      style={[styles.swipeAction, styles.readAction]}
                    >
                      <Text style={styles.swipeActionText}>Read</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${item.title}`}
                    onPress={() => remove(item.id)}
                    style={[styles.swipeAction, styles.deleteAction]}
                  >
                    <Text style={styles.swipeActionText}>Delete</Text>
                  </Pressable>
                </View>
              )}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.body}`}
                onPress={() => {
                  openNotification(item).catch(() =>
                    setError('That notification could not be opened.'),
                  );
                }}
                style={({ pressed }) => [
                  styles.card,
                  !item.readAt && styles.unreadCard,
                  pressed && styles.pressed,
                ]}
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
                {!item.readAt ? <View style={styles.unreadDot} /> : null}
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </Swipeable>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerActions: { flexDirection: 'row', gap: 14, paddingBottom: 5 },
  headerAction: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  clearAction: { color: colors.danger },
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
  unreadCard: { borderColor: colors.primary },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.danger,
    marginHorizontal: 8,
  },
  swipeActions: { flexDirection: 'row' },
  swipeAction: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readAction: { backgroundColor: colors.accent },
  deleteAction: { backgroundColor: colors.danger },
  swipeActionText: { color: colors.white, fontSize: 12, fontWeight: '900' },
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
