import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Screen } from '../components/UI';
import { chatSession } from '../chat/runtime';
import {
  loadUnreadNotificationCount,
  subscribeToNotificationState,
} from '../services/notificationService';
import { loadRoomHistory } from '../services/sessionService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

function ChoiceDeckMark(): React.JSX.Element {
  return (
    <View pointerEvents="none" style={styles.deckMark}>
      <View style={[styles.miniCard, styles.miniCardLeft]} />
      <View style={[styles.miniCard, styles.miniCardRight]} />
      <View style={[styles.miniCard, styles.miniCardFront]}>
        <Text style={styles.miniCheck}>✓</Text>
      </View>
    </View>
  );
}

function PrivateMark(): React.JSX.Element {
  const activeBlocks = new Set([0, 1, 2, 3, 5, 6, 7, 8]);
  return (
    <View pointerEvents="none" style={styles.privateMark}>
      {Array.from({ length: 9 }, (_, index) => (
        <View
          key={index}
          style={[
            styles.qrBlock,
            activeBlocks.has(index) && styles.qrBlockActive,
          ]}
        />
      ))}
    </View>
  );
}

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
      <View pointerEvents="none" style={styles.orangeGlow} />
      <View pointerEvents="none" style={styles.blueGlow} />
      <View style={styles.top}>
        <Brand />
        <View style={styles.topActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${unreadCount} unread notifications`}
            onPress={() => navigation.navigate('Notifications')}
            style={({ pressed }) => [
              styles.utilityButton,
              pressed && styles.utilityPressed,
            ]}
          >
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {Math.min(unreadCount, 99)}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About Choosr"
            onPress={() => navigation.navigate('About')}
            style={({ pressed }) => [
              styles.utilityButton,
              pressed && styles.utilityPressed,
            ]}
          >
            <Text style={styles.infoIcon}>i</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>TWO WAYS TOGETHER</Text>
          </View>
          <Text style={styles.title}>Pick your kind{`\n`}of together.</Text>
          <Text style={styles.subtitle}>
            Make the call together—or open a private chat in person.
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
              styles.chooseCard,
              pressed && styles.cardPressed,
            ]}
          >
            <ChoiceDeckMark />
            <View style={styles.cardTopline}>
              <Text style={styles.chooseNumber}>01</Text>
              {chooseActive ? (
                <View style={styles.chooseActiveBadge}>
                  <Text style={styles.chooseActiveText}>ROOM IN PLAY</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.chooseTitle}>Choose Together</Text>
            <Text style={styles.chooseCopy}>
              Swipe separately. Reveal the thing you both want.
            </Text>
            <View style={styles.cardActionRow}>
              <Text style={styles.chooseAction}>START CHOOSING</Text>
              <Text style={styles.chooseArrow}>→</Text>
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
              pressed && styles.cardPressed,
            ]}
          >
            <PrivateMark />
            <View style={styles.cardTopline}>
              <Text style={styles.chatNumber}>02</Text>
              {chatActive ? (
                <View style={styles.chatActiveBadge}>
                  <Text style={styles.chatActiveText}>CHAT ACTIVE</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.chatTitle}>Chat Privately</Text>
            <Text style={styles.chatCopy}>
              QR-only. Encrypted. Exactly two people.
            </Text>
            <View style={styles.cardActionRow}>
              <Text style={styles.chatAction}>OPEN PRIVATE CHAT</Text>
              <Text style={styles.chatArrow}>→</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.promise}>
        <View style={styles.promiseDot} />
        <Text style={styles.promiseText}>
          Private chat: gone in 24 hours—or destroy it in one tap.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  orangeGlow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: 90,
    left: -190,
    backgroundColor: colors.primary,
    opacity: 0.09,
  },
  blueGlow: {
    position: 'absolute',
    width: 330,
    height: 330,
    borderRadius: 165,
    right: -220,
    bottom: 80,
    backgroundColor: colors.blue,
    opacity: 0.12,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  utilityButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  utilityPressed: { opacity: 0.65, transform: [{ scale: 0.94 }] },
  bellIcon: {
    fontSize: 19,
    lineHeight: 23,
  },
  infoIcon: {
    color: colors.text,
    fontSize: 19,
    lineHeight: 22,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 9, fontWeight: '900' },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 20,
  },
  hero: { paddingHorizontal: 4 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 40,
    lineHeight: 41,
    fontWeight: '900',
    letterSpacing: -1.8,
    marginTop: 11,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    maxWidth: 330,
  },
  actions: { gap: 13 },
  gatewayCard: {
    minHeight: 174,
    borderRadius: 27,
    padding: 19,
    paddingRight: 104,
    overflow: 'hidden',
  },
  chooseCard: {
    backgroundColor: '#FF6A2A',
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  chatCard: {
    backgroundColor: '#1F54E8',
    shadowColor: colors.blue,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  cardTopline: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  chooseNumber: {
    color: '#571800',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  chatNumber: {
    color: '#AFC5FF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  chooseActiveBadge: {
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#571800',
  },
  chooseActiveText: {
    color: colors.white,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  chatActiveBadge: {
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.white,
  },
  chatActiveText: {
    color: '#12328D',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  chooseTitle: {
    color: '#1B100C',
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 10,
  },
  chatTitle: {
    color: colors.white,
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 10,
  },
  chooseCopy: {
    color: '#642009',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: 4,
  },
  chatCopy: {
    color: '#D9E3FF',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: 4,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 13,
  },
  chooseAction: {
    color: '#24100A',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  chatAction: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  chooseArrow: { color: '#24100A', fontSize: 19, lineHeight: 20 },
  chatArrow: { color: colors.white, fontSize: 19, lineHeight: 20 },
  deckMark: {
    position: 'absolute',
    width: 88,
    height: 102,
    right: 11,
    top: 33,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCard: {
    position: 'absolute',
    width: 50,
    height: 70,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(36,16,10,0.32)',
  },
  miniCardLeft: {
    backgroundColor: '#FFB18F',
    transform: [{ translateX: -12 }, { rotate: '-13deg' }],
  },
  miniCardRight: {
    backgroundColor: '#FF8A58',
    transform: [{ translateX: 12 }, { rotate: '13deg' }],
  },
  miniCardFront: {
    backgroundColor: '#FFF3ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCheck: { color: colors.primary, fontSize: 28, fontWeight: '900' },
  privateMark: {
    position: 'absolute',
    width: 72,
    height: 72,
    right: 22,
    top: 45,
    padding: 8,
    borderRadius: 17,
    backgroundColor: colors.white,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    transform: [{ rotate: '4deg' }],
  },
  qrBlock: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#D8E3FF',
  },
  qrBlockActive: { backgroundColor: '#12328D' },
  promise: {
    minHeight: 35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  promiseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  promiseText: {
    color: colors.faint,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
