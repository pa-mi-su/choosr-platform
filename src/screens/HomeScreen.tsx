import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Brand, Button, Screen } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;
export function HomeScreen({ navigation }: Props): React.JSX.Element {
  return (
    <Screen testID="home-screen" style={styles.screen}>
      <View style={styles.orangeGlow} />
      <View style={styles.top}>
        <Brand compact />
        <View style={styles.pill}>
          <View style={styles.dot} />
          <Text style={styles.pillText}>NO ACCOUNT NEEDED</Text>
        </View>
      </View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>TONIGHT, SOLVED</Text>
        <Text style={styles.title}>Swipe separately.{`\n`}Match together.</Text>
        <Text style={styles.subtitle}>
          Decide what to watch, what to eat, or what to do—without debating
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
          label="Start a room"
          onPress={() => navigation.navigate('ModeSelect')}
        />
        <Button
          label="Join with a code"
          variant="secondary"
          onPress={() => navigation.navigate('Join')}
        />
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 99,
    padding: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
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
  privacy: { color: colors.faint, fontSize: 10, textAlign: 'center' },
});
