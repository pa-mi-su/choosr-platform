import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Brand, Button, Screen } from '../components/UI';
import {
  loadUnreadNotificationCount,
  subscribeToNotificationState,
} from '../services/notificationService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;
export function HomeScreen({ navigation }: Props): React.JSX.Element {
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadUnreadNotificationCount()
        .then(setUnreadCount)
        .catch(() => undefined);
    }, []),
  );
  useEffect(() => {
    const subscription = subscribeToNotificationState(() => {
      loadUnreadNotificationCount()
        .then(setUnreadCount)
        .catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  return (
    <Screen testID="home-screen" style={styles.screen}>
      <View style={styles.orangeGlow} />
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="About Choosr"
          onPress={() => navigation.navigate('About')}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Brand compact />
        </Pressable>
        <View style={styles.topActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${unreadCount} unread notifications`}
            onPress={() => navigation.navigate('Notifications')}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {Math.min(unreadCount, 99)}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open my Choosr Circle"
            onPress={() => navigation.navigate('Circle')}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          >
            <Text style={styles.peopleIcon}>●●</Text>
            <Text style={styles.pillText}>MY CIRCLE</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>TONIGHT, SOLVED</Text>
        <Text style={styles.title}>Swipe separately.{`\n`}Match together.</Text>
        <Text style={styles.subtitle}>
          Pick an activity, choose food, or create anything—without debating
          every option out loud.
        </Text>
        <View style={styles.cards}>
          <View style={[styles.card, styles.left]}>
            <Text style={styles.cardIcon}>×</Text>
          </View>
          <View style={[styles.card, styles.center]}>
            <View style={styles.moon} />
            <Text style={styles.tonight}>TONIGHT</Text>
          </View>
          <View style={[styles.card, styles.right]}>
            <Text style={styles.cardIcon}>✓</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>IT’S A MATCH</Text>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label="Continue active rooms"
          variant="secondary"
          onPress={() => navigation.navigate('ActiveRooms')}
        />
        <Button
          label="Choose from My Circle"
          onPress={() => navigation.navigate('Circle')}
        />
        <Text style={styles.guestLabel}>WITH SOMEONE NEW?</Text>
        <View style={styles.guestActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('ModeSelect')}
            style={({ pressed }) => [
              styles.guestAction,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.guestActionTitle}>Quick room</Text>
            <Text style={styles.guestActionCopy}>Send a private link</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Join')}
            style={({ pressed }) => [
              styles.guestAction,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.guestActionTitle}>Enter code</Text>
            <Text style={styles.guestActionCopy}>Join without a profile</Text>
          </Pressable>
        </View>
        <Text style={styles.privacy}>
          Private choices · Rooms expire automatically
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { overflow: 'hidden' },
  orangeGlow: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: colors.primary,
    opacity: 0.09,
    top: -180,
    right: -140,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bellIcon: { color: colors.text, fontSize: 22, fontWeight: '900' },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  unreadText: { color: colors.white, fontSize: 9, fontWeight: '900' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 99,
    padding: 8,
  },
  pressed: { opacity: 0.7 },
  peopleIcon: { color: colors.primary, fontSize: 8, letterSpacing: -2 },
  pillText: { color: colors.muted, fontSize: 9, fontWeight: '900' },
  hero: { flex: 1, justifyContent: 'center' },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  title: {
    color: colors.text,
    fontSize: 43,
    lineHeight: 46,
    fontWeight: '900',
    letterSpacing: -2,
    marginTop: 12,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 14,
  },
  cards: {
    height: 190,
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    width: 120,
    height: 166,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  left: {
    backgroundColor: '#17263A',
    transform: [{ translateX: -84 }, { rotate: '-12deg' }, { scale: 0.88 }],
  },
  center: { zIndex: 2, backgroundColor: '#20334B' },
  right: {
    backgroundColor: '#17263A',
    transform: [{ translateX: 84 }, { rotate: '12deg' }, { scale: 0.88 }],
  },
  cardIcon: { color: colors.text, fontSize: 31, opacity: 0.5 },
  moon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
  },
  tonight: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
    marginTop: 16,
  },
  badge: {
    position: 'absolute',
    zIndex: 3,
    bottom: 1,
    backgroundColor: colors.success,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 8,
    transform: [{ rotate: '-3deg' }],
  },
  badgeText: { color: '#123229', fontSize: 10, fontWeight: '900' },
  actions: { gap: 10 },
  guestLabel: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 3,
  },
  guestActions: { flexDirection: 'row', gap: 10 },
  guestAction: {
    flex: 1,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 17,
  },
  guestActionTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  guestActionCopy: { color: colors.faint, fontSize: 9, marginTop: 4 },
  privacy: { color: colors.faint, fontSize: 10, textAlign: 'center' },
});
