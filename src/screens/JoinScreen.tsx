import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Brand, Button, Screen } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Join'>;
export function JoinScreen({ navigation }: Props): React.JSX.Element {
  const [code, setCode] = useState('');
  return (
    <Screen testID="join-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button
          label="Close"
          variant="quiet"
          onPress={() => navigation.goBack()}
        />
      </View>
      <View style={styles.content}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>↗</Text>
        </View>
        <Text style={styles.eyebrow}>JOIN YOUR PARTNER</Text>
        <Text style={styles.title}>Enter the room code.</Text>
        <Text style={styles.subtitle}>
          You’ll both see the same movies. Your individual choices stay private.
        </Text>
        <TextInput
          testID="room-code-input"
          accessibilityLabel="Room code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          placeholder="MOON42"
          placeholderTextColor={colors.faint}
          selectionColor={colors.primary}
          value={code}
          onChangeText={value =>
            setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
          }
          onSubmitEditing={() =>
            code.length >= 4 && navigation.replace('Swipe')
          }
          style={styles.input}
        />
      </View>
      <View>
        <Button
          label="Join room"
          disabled={code.length < 4}
          onPress={() => navigation.replace('Swipe')}
        />
        <Text style={styles.note}>
          Rooms support exactly two people and expire automatically.
        </Text>
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
  icon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconText: { color: colors.primary, fontSize: 40 },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.3,
    marginTop: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
  },
  input: {
    width: '100%',
    height: 74,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    marginTop: 30,
    paddingHorizontal: 20,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: 8,
    textAlign: 'center',
  },
  note: {
    color: colors.faint,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 10,
  },
});
