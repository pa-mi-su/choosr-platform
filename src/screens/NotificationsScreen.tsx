import React, { useCallback, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Brand, Button, Screen } from '../components/UI';
import {
  loadNotifications,
  deleteNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  subscribeToNotificationState,
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
      'This removes every notification from your inbox. Pending room invitations will remain under Active rooms & invites.',
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
    navigation.navigate(item.kind === 'chat_message' ? 'ChatHome' : 'Circle');
  };

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
      const subscription = subscribeToNotificationState(() => {
        load().catch(() => undefined);
      });
      return () => subscription.remove();
    }, [load]),
  );

  return (
    <Screen testID="notifications-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Close" variant="quiet" onPress={navigation.goBack} />
      </View>
      <Text style={styles.eyebrow}>YOUR UPDATES</Text>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Notifications</Text>
      </View>
      {items.length ? (
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as seen"
            disabled={!items.some(item => !item.readAt)}
            onPress={markAllRead}
            style={({ pressed }) => [
              styles.headerAction,
              !items.some(item => !item.readAt) && styles.headerActionDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.headerActionIcon}>✓✓</Text>
            <Text style={styles.headerActionText}>Mark all seen</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear notification inbox"
            onPress={confirmClear}
            style={({ pressed }) => [
              styles.headerAction,
              styles.clearAction,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.clearActionIcon}>×</Text>
            <Text style={[styles.headerActionText, styles.clearActionText]}>
              Clear inbox
            </Text>
          </Pressable>
        </View>
      ) : null}
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
                Private chat updates, room invitations, and Circle requests will
                appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const unread = !item.readAt;
            return (
              <Swipeable
                friction={2}
                rightThreshold={42}
                containerStyle={styles.swipeContainer}
                childrenContainerStyle={styles.swipeChildren}
                renderRightActions={() => (
                  <View style={styles.swipeActions}>
                    {unread ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Mark ${item.title} as seen`}
                        onPress={() => markRead(item)}
                        style={[styles.swipeAction, styles.readAction]}
                      >
                        <Text style={styles.swipeActionIcon}>✓</Text>
                        <Text style={styles.swipeActionText}>Seen</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${item.title}`}
                      onPress={() => remove(item.id)}
                      style={[styles.swipeAction, styles.deleteAction]}
                    >
                      <Text style={styles.swipeActionIcon}>×</Text>
                      <Text style={styles.swipeActionText}>Delete</Text>
                    </Pressable>
                  </View>
                )}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${unread ? 'New' : 'Seen'}. ${
                    item.title
                  }. ${item.body}`}
                  accessibilityState={{ selected: unread }}
                  onPress={() => {
                    openNotification(item).catch(() =>
                      setError('That notification could not be opened.'),
                    );
                  }}
                  style={({ pressed }) => [
                    styles.card,
                    unread ? styles.unreadCard : styles.openedCard,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.icon, unread && styles.unreadIcon]}>
                    <Text style={styles.iconText}>
                      {item.kind === 'room_invitation'
                        ? '✓'
                        : item.kind === 'chat_message'
                        ? '◈'
                        : '●●'}
                    </Text>
                  </View>
                  <View style={styles.copy}>
                    <View style={styles.cardHeading}>
                      <View
                        style={[
                          styles.statePill,
                          unread ? styles.newPill : styles.openedPill,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statePillText,
                            !unread && styles.openedPillText,
                          ]}
                        >
                          {unread ? 'NEW' : 'SEEN'}
                        </Text>
                      </View>
                      <Text style={styles.date}>{when(item.createdAt)}</Text>
                    </View>
                    <Text
                      style={[
                        styles.cardTitle,
                        !unread && styles.openedCardTitle,
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.cardBody}>{item.body}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              </Swipeable>
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
  headerActions: { flexDirection: 'row', gap: 9, marginTop: 17 },
  headerAction: {
    minHeight: 42,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  headerActionDisabled: { opacity: 0.42 },
  headerActionIcon: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '900',
  },
  headerActionText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  clearAction: { backgroundColor: colors.surface },
  clearActionIcon: {
    color: colors.danger,
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '500',
  },
  clearActionText: { color: colors.danger },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingTop: 17, paddingBottom: 24, gap: 11 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  swipeContainer: {
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  swipeChildren: { backgroundColor: colors.background },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 15,
  },
  unreadCard: {
    borderColor: colors.primary,
    backgroundColor: colors.raised,
  },
  openedCard: { borderColor: colors.border, backgroundColor: colors.surface },
  swipeActions: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 20,
  },
  swipeAction: {
    minWidth: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 10,
  },
  readAction: { backgroundColor: '#187A54' },
  deleteAction: { backgroundColor: colors.danger },
  swipeActionIcon: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '900',
  },
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
  unreadIcon: { backgroundColor: '#263B5B' },
  iconText: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  copy: { flex: 1, marginLeft: 13 },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  statePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newPill: { backgroundColor: colors.primary },
  openedPill: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statePillText: {
    color: colors.background,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  openedPillText: { color: colors.faint },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  openedCardTitle: { color: colors.muted },
  cardBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  date: { color: colors.faint, fontSize: 10 },
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
