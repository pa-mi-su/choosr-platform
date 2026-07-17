import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Brand, Button, Screen } from '../components/UI';
import { colors } from '../theme';
import { modeById } from '../data/decisions';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'NoMatch'>;
export function NoMatchScreen({ navigation, route }: Props): React.JSX.Element {
  const mode = modeById[route.params.mode];
  const searchArea = route.params.searchArea;
  return (
    <Screen testID="no-match-screen" style={styles.screen}>
      <Brand compact />
      <View style={styles.content}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>↻</Text>
        </View>
        <Text style={styles.eyebrow}>NO MATCH YET</Text>
        <Text style={styles.title}>Good taste takes another round.</Text>
        <Text style={styles.subtitle}>
          You made it through this deck without a match. Try a fresh set of
          options together.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          label="Try another deck"
          onPress={() =>
            navigation.replace('Swipe', { mode: mode.id, searchArea })
          }
        />
        <Button
          label="End room"
          variant="quiet"
          onPress={() => navigation.popToTop()}
        />
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between' },
  content: { alignItems: 'center' },
  icon: {
    width: 106,
    height: 106,
    borderRadius: 53,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconText: { color: colors.accent, fontSize: 54 },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1.3,
    textAlign: 'center',
    marginTop: 10,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
  },
  actions: { gap: 8 },
});
