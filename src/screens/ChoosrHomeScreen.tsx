import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { chatSession } from '../chat/runtime';
import {
  loadUnreadNotificationCount,
  subscribeToNotificationState,
} from '../services/notificationService';
import { loadRoomHistory } from '../services/sessionService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function ChoosrHomeScreen({ navigation }: Props): React.JSX.Element {
  const [chooseActive, setChooseActive] = useState(false);
  const [chatActive, setChatActive] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        loadRoomHistory().then(rooms =>
          setChooseActive(
            rooms.some(
              room => room.status === 'active' || room.status === 'waiting',
            ),
          ),
        ),
        chatSession.hasRemoteChat().then(setChatActive),
        loadUnreadNotificationCount().then(setUnreadCount),
      ]).catch(() => undefined);
      const subscription = subscribeToNotificationState(() => {
        loadUnreadNotificationCount()
          .then(setUnreadCount)
          .catch(() => undefined);
      });
      return () => subscription.remove();
    }, []),
  );

  return (
    <Screen testID="choosr-home-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand />
        <View style={styles.topActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${unreadCount} unread notifications`}
            onPress={() => navigation.navigate('Notifications')}
            style={styles.iconButton}
          >
            <Text style={styles.icon}>🔔</Text>
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {Math.min(unreadCount, 99)}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Button
            label="About"
            variant="quiet"
            onPress={() => navigation.navigate('About')}
          />
        </View>
      </View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>ONE CHOOSR. TWO PRIVATE EXPERIENCES.</Text>
        <Text style={styles.title}>What do you want to do?</Text>
        <Text style={styles.subtitle}>
          Make a decision together, or start a temporary encrypted conversation
          by scanning a QR code in person.
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          testID="choose-together-entry"
          accessibilityRole="button"
          accessibilityLabel="Choose Together"
          onPress={() => navigation.navigate('ChooseHome')}
          style={({ pressed }) => [
            styles.gatewayCard,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.cardIcon}>✓</Text>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>Choose Together</Text>
            <Text style={styles.cardText}>
              Food, activities, custom choices, Circle, and rankings.
            </Text>
            {chooseActive ? (
              <Text style={styles.active}>ACTIVE CHOOSE ROOM</Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          testID="chat-privately-entry"
          accessibilityRole="button"
          accessibilityLabel="Chat Privately"
          onPress={() => navigation.navigate('ChatHome')}
          style={({ pressed }) => [
            styles.gatewayCard,
            styles.chatCard,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.cardIcon}>◈</Text>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>Chat Privately</Text>
            <Text style={styles.cardText}>
              Two people. QR only. Encrypted and gone within 24 hours.
            </Text>
            {chatActive ? (
              <Text style={styles.active}>ACTIVE PRIVATE CHAT</Text>
            ) : null}
          </View>
        </Pressable>
        <Text style={styles.privacy}>
          No searchable chat profiles · No message previews
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 22 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: colors.surface,
  },
  icon: { fontSize: 20 },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 9, fontWeight: '900' },
  hero: { flex: 1, justifyContent: 'center' },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  title: {
    color: colors.text,
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '900',
    letterSpacing: -1.8,
    marginTop: 12,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 14,
  },
  actions: { gap: 14 },
  gatewayCard: {
    minHeight: 126,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  chatCard: { borderColor: colors.blue },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  cardIcon: {
    color: colors.primary,
    fontSize: 31,
    width: 42,
    textAlign: 'center',
  },
  cardCopy: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  cardText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  active: {
    color: colors.success,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginTop: 8,
  },
  privacy: { color: colors.faint, fontSize: 10, textAlign: 'center' },
});
