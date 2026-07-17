import React, { useEffect, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Brand, Button, Screen } from '../components/UI';
import { colors } from '../theme';
import { modeById } from '../data/decisions';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Waiting'>;
const code = 'DATE42AB';
export function WaitingScreen({ navigation, route }: Props): React.JSX.Element {
  const mode = modeById[route.params.mode];
  const searchArea = route.params.searchArea;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1400);
    return () => clearTimeout(timer);
  }, []);
  const share = () =>
    Share.share({
      message: `Help me decide ${mode.title.toLowerCase()} on Choosr. Join with code ${code}.`,
    });
  return (
    <Screen testID="waiting-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button
          label="Cancel"
          variant="quiet"
          onPress={() => navigation.popToTop()}
        />
      </View>
      <View style={styles.content}>
        <View style={styles.people}>
          <View style={[styles.person, styles.you]}>
            <Text style={styles.personText}>Y</Text>
          </View>
          <View style={[styles.person, styles.partner, ready && styles.ready]}>
            <Text style={styles.personText}>{ready ? '♥' : '?'}</Text>
          </View>
        </View>
        <Text style={styles.eyebrow}>
          {ready ? 'YOUR PARTNER IS HERE' : 'ROOM CREATED'}
        </Text>
        <Text style={styles.title}>
          {ready ? 'Ready when you are.' : 'Invite your person.'}
        </Text>
        <Text style={styles.subtitle}>
          Your choices remain private until you both like the same option.
        </Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>ROOM CODE</Text>
          <Text selectable style={styles.code}>
            {code}
          </Text>
          <Text style={styles.expires}>Expires in 24 hours</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label={ready ? 'Start swiping' : 'Waiting for your partner…'}
          disabled={!ready}
          onPress={() =>
            navigation.replace('Swipe', { mode: mode.id, searchArea })
          }
        />
        <Button label="Share invite" variant="secondary" onPress={share} />
        <Text style={styles.preview}>{mode.eyebrow} · Private choices</Text>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: { alignItems: 'center' },
  people: { width: 190, height: 105, marginBottom: 24 },
  person: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.background,
  },
  you: { left: 26, backgroundColor: colors.primary },
  partner: {
    right: 26,
    backgroundColor: colors.raised,
    borderColor: colors.faint,
    borderStyle: 'dashed',
  },
  ready: {
    backgroundColor: colors.success,
    borderColor: colors.background,
    borderStyle: 'solid',
  },
  personText: { color: colors.white, fontSize: 24, fontWeight: '900' },
  eyebrow: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 35,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginTop: 9,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
  },
  codeBox: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    alignItems: 'center',
    padding: 18,
    marginTop: 30,
  },
  codeLabel: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  code: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 7,
    marginLeft: 7,
    marginTop: 5,
  },
  expires: { color: colors.faint, fontSize: 10, marginTop: 4 },
  actions: { gap: 9 },
  preview: { color: colors.faint, fontSize: 10, textAlign: 'center' },
});
