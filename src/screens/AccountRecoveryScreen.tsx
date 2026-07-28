import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import {
  accountRecoveryErrorMessage,
  loadAccountIdentity,
  requestAccountRecovery,
  requestPhoneProtection,
  verifyAccountRecovery,
  verifyPhoneProtection,
  type AccountIdentity,
} from '../services/accountRecovery';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'AccountRecovery'>;
type Flow = 'protect' | 'recover';

export function AccountRecoveryScreen({
  navigation,
}: Props): React.JSX.Element {
  const [identity, setIdentity] = useState<AccountIdentity>();
  const [flow, setFlow] = useState<Flow>('protect');
  const [phone, setPhone] = useState('');
  const [requestedPhone, setRequestedPhone] = useState<string>();
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadAccountIdentity()
      .then(setIdentity)
      .catch(cause => setError(accountRecoveryErrorMessage(cause)));
  }, []);

  const chooseFlow = (next: Flow) => {
    setFlow(next);
    setRequestedPhone(undefined);
    setCode('');
    setError(undefined);
  };

  const requestCode = async () => {
    if (working) return;
    setWorking(true);
    setError(undefined);
    try {
      const normalized =
        flow === 'protect'
          ? await requestPhoneProtection(phone)
          : await requestAccountRecovery(phone);
      setRequestedPhone(normalized);
    } catch (cause) {
      setError(accountRecoveryErrorMessage(cause));
    } finally {
      setWorking(false);
    }
  };

  const verifyCode = async () => {
    if (working || !requestedPhone) return;
    setWorking(true);
    setError(undefined);
    try {
      const verified =
        flow === 'protect'
          ? await verifyPhoneProtection(requestedPhone, code)
          : await verifyAccountRecovery(requestedPhone, code);
      setIdentity(verified);
      setRequestedPhone(undefined);
      setCode('');
    } catch (cause) {
      setError(accountRecoveryErrorMessage(cause));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Screen testID="account-recovery-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Close" variant="quiet" onPress={navigation.goBack} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.eyebrow}>YOUR CHOOSR</Text>
          <Text style={styles.title}>
            Keep your name.{`\n`}Keep your people.
          </Text>
          <Text style={styles.copy}>
            Protect this Choosr with a phone code so you can recover your name,
            Circle, rooms, and history on a new phone.
          </Text>

          {!identity ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : !identity.isAnonymous ? (
            <View style={styles.successCard}>
              <Text style={styles.successMark}>✓</Text>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Your Choosr is protected</Text>
                <Text style={styles.cardCopy}>
                  Recovery is connected to{' '}
                  {identity.maskedPhone ?? 'your verified identity'}.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.tabs}>
                <Button
                  label="Protect this Choosr"
                  variant={flow === 'protect' ? 'primary' : 'secondary'}
                  onPress={() => chooseFlow('protect')}
                  style={styles.tab}
                />
                <Button
                  label="Recover my Choosr"
                  variant={flow === 'recover' ? 'primary' : 'secondary'}
                  onPress={() => chooseFlow('recover')}
                  style={styles.tab}
                />
              </View>

              <Text style={styles.cardTitle}>
                {flow === 'protect'
                  ? 'Add a recovery number'
                  : 'Sign back in with your number'}
              </Text>
              <Text style={styles.cardCopy}>
                {flow === 'protect'
                  ? 'We send one verification code. Your number is never shown to other people.'
                  : 'Use the number you previously verified. This replaces the temporary Choosr on this device.'}
              </Text>

              {!requestedPhone ? (
                <>
                  <TextInput
                    accessibilityLabel="Phone number with country code"
                    autoComplete="tel"
                    keyboardType="phone-pad"
                    placeholder="+1 555 123 4567"
                    placeholderTextColor={colors.faint}
                    value={phone}
                    onChangeText={setPhone}
                    style={styles.input}
                  />
                  <Button
                    label="Send verification code"
                    loading={working}
                    disabled={phone.trim().length < 8}
                    onPress={requestCode}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.sentCopy}>
                    Code sent to {requestedPhone}
                  </Text>
                  <TextInput
                    accessibilityLabel="Six digit verification code"
                    autoComplete="one-time-code"
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="123456"
                    placeholderTextColor={colors.faint}
                    value={code}
                    onChangeText={value => setCode(value.replace(/\D/g, ''))}
                    style={[styles.input, styles.codeInput]}
                  />
                  <Button
                    label={
                      flow === 'protect'
                        ? 'Protect my Choosr'
                        : 'Recover my Choosr'
                    }
                    loading={working}
                    disabled={code.length !== 6}
                    onPress={verifyCode}
                  />
                  <Button
                    label="Use a different number"
                    variant="quiet"
                    onPress={() => setRequestedPhone(undefined)}
                  />
                </>
              )}
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.privacy}>
            Standard SMS rates may apply. Choosr uses the number only for
            authentication and account recovery.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20 },
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: { paddingTop: 34, paddingBottom: 30 },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
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
  copy: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 14 },
  loader: { marginTop: 50 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 18,
    gap: 13,
    marginTop: 26,
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 22,
    padding: 20,
    marginTop: 26,
  },
  successMark: { color: colors.primary, fontSize: 30, fontWeight: '900' },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, minHeight: 46, paddingHorizontal: 8 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  cardCopy: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  input: {
    height: 56,
    color: colors.text,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  codeInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8 },
  sentCopy: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  privacy: {
    color: colors.faint,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 12,
  },
});
