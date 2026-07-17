import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { decisionModes } from '../data/decisions';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ModeSelect'>;
const modeColors = {
  watch: { background: '#2B241F', foreground: colors.primary },
  eat: { background: '#2B241F', foreground: colors.primary },
  do: { background: '#2B241F', foreground: colors.primary },
} as const;

export function ModeSelectScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const selectedPerson = route.params;
  return (
    <Screen testID="mode-select-screen">
      <View style={styles.top}>
        <Brand compact />
        <Button label="Close" variant="quiet" onPress={navigation.goBack} />
      </View>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>CHOOSE TOGETHER</Text>
        <Text style={styles.title}>What are we deciding?</Text>
        <Text style={styles.subtitle}>
          {selectedPerson?.connectionName
            ? `You’re inviting ${selectedPerson.connectionName}. Individual passes stay private.`
            : 'You both get the same options. Individual passes stay private.'}
        </Text>
      </View>
      <View style={styles.options}>
        {decisionModes.map(mode => {
          const palette = modeColors[mode.id];
          return (
            <Pressable
              key={mode.id}
              accessibilityRole="button"
              accessibilityLabel={mode.title}
              onPress={() =>
                navigation.navigate(
                  mode.id === 'watch' ? 'Waiting' : 'LocalSetup',
                  {
                    mode: mode.id,
                    ...selectedPerson,
                  },
                )
              }
              style={({ pressed }) => [
                styles.option,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[styles.icon, { backgroundColor: palette.background }]}
              >
                <Text style={[styles.iconText, { color: palette.foreground }]}>
                  {mode.icon}
                </Text>
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>{mode.title}</Text>
                <Text style={styles.optionDescription}>{mode.description}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>
        Exactly two people · Rooms expire in 24 hours
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: { marginTop: 44 },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 37,
    lineHeight: 41,
    fontWeight: '900',
    letterSpacing: -1.5,
    marginTop: 10,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  options: { flex: 1, justifyContent: 'center', gap: 12 },
  option: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 16,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  icon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.raised,
  },
  iconText: { fontSize: 24, fontWeight: '900' },
  optionCopy: { flex: 1, marginLeft: 14 },
  optionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  optionDescription: { color: colors.muted, fontSize: 12, marginTop: 5 },
  chevron: { color: colors.faint, fontSize: 31 },
  note: { color: colors.faint, fontSize: 10, textAlign: 'center' },
});
