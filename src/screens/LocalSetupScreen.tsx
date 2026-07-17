import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { modeById } from '../data/decisions';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'LocalSetup'>;

export function LocalSetupScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const [searchArea, setSearchArea] = useState('');
  const mode = modeById[route.params.mode];
  const continueToRoom = () =>
    navigation.navigate('Waiting', {
      mode: mode.id,
      ...(searchArea.trim() ? { searchArea: searchArea.trim() } : {}),
    });

  return (
    <Screen testID="local-setup-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Back" variant="quiet" onPress={navigation.goBack} />
      </View>
      <View style={styles.content}>
        <View style={styles.pin}>
          <Text style={styles.pinText}>⌖</Text>
        </View>
        <Text style={styles.eyebrow}>{mode.eyebrow}</Text>
        <Text style={styles.title}>Where should we look?</Text>
        <Text style={styles.subtitle}>
          Add a city, neighborhood, or postal code. Leave it blank to let Maps
          use your location after you match.
        </Text>
        <TextInput
          testID="search-area-input"
          accessibilityLabel="Search city, neighborhood, or postal code"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={80}
          placeholder="Downtown Toronto or M5V"
          placeholderTextColor={colors.faint}
          selectionColor={colors.primary}
          value={searchArea}
          onChangeText={setSearchArea}
          onSubmitEditing={continueToRoom}
          style={styles.input}
        />
        <View style={styles.privacyBox}>
          <Text style={styles.privacyTitle}>LOCATION STAYS OPTIONAL</Text>
          <Text style={styles.privacyText}>
            Choosr does not need your contacts or a permanent location profile.
          </Text>
        </View>
      </View>
      <Button label="Continue" onPress={continueToRoom} />
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
  pin: {
    width: 82,
    height: 82,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.raised,
    marginBottom: 25,
  },
  pinText: { color: colors.accent, fontSize: 42 },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 35,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginTop: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 11,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 64,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    marginTop: 28,
    paddingHorizontal: 18,
    fontSize: 16,
  },
  privacyBox: {
    width: '100%',
    backgroundColor: colors.raised,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  privacyTitle: {
    color: colors.success,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  privacyText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
});
