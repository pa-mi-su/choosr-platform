import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { env } from '../config/generatedEnv';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'About'>;

export function AboutScreen({ navigation }: Props): React.JSX.Element {
  return (
    <Screen testID="about-screen">
      <View style={styles.top}>
        <Brand compact />
        <Button label="Close" variant="quiet" onPress={navigation.goBack} />
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>ABOUT CHOOSR</Text>
        <Text style={styles.title}>
          Decide together.{`\n`}Without the debate.
        </Text>
        <Text style={styles.summary}>
          Choosr helps two people make a private decision together. Create a
          room for activities, food, or your own labeled photos, swipe through
          the same choices separately, and reveal the option you both liked.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Private by design</Text>
          <Text style={styles.cardCopy}>
            Individual passes stay private. Choosr only reveals a shared match,
            and rooms expire automatically.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.version}>
          Version {env.appVersion} ({env.buildNumber})
        </Text>
        <Text style={styles.environment}>
          {env.environment.toUpperCase()} BUILD
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: { flex: 1, justifyContent: 'center' },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  title: {
    color: colors.text,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '900',
    letterSpacing: -1.8,
    marginTop: 12,
  },
  summary: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 20,
    marginTop: 28,
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  cardCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  footer: { alignItems: 'center', gap: 5 },
  version: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  environment: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
});
