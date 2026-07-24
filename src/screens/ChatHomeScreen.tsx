import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BackToChoosrButton, Button, Screen } from '../components/UI';
import { chatSession } from '../chat/runtime';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatHome'>;

export function ChatHomeScreen({ navigation }: Props): React.JSX.Element {
  const [active, setActive] = useState(Boolean(chatSession.active));
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      chatSession
        .reconcileOrphanedRemoteChat()
        .then(setActive)
        .catch(() => setActive(Boolean(chatSession.active)))
        .finally(() => setLoading(false));
    }, []),
  );

  const continueChat = () => {
    const state = chatSession.active;
    if (!state) {
      Alert.alert(
        'Chat keys unavailable',
        'For privacy, temporary keys are never persisted. The unreadable room was destroyed.',
      );
      return;
    }
    navigation.navigate(
      state.status === 'inviting' ? 'ChatInvite' : 'ChatRoom',
    );
  };

  const destroy = () => {
    Alert.alert(
      'End & Destroy?',
      'This closes the private chat for both people and destroys local keys.',
      [
        { text: 'Keep chat', style: 'cancel' },
        {
          text: 'End & Destroy',
          style: 'destructive',
          onPress: () => {
            chatSession
              .destroy()
              .catch(() => undefined)
              .finally(() => {
                setActive(false);
                navigation.replace('Home');
              });
          },
        },
      ],
    );
  };

  return (
    <Screen testID="chat-home-screen" style={styles.screen}>
      <View style={styles.top}>
        <BackToChoosrButton onPress={() => navigation.navigate('Home')} />
        <View style={styles.modeBadge}>
          <View style={styles.modeDot} />
          <Text style={styles.modeLabel}>PRIVATE CHAT</Text>
        </View>
      </View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>CHOOSR CHAT</Text>
        <Text style={styles.title}>Here for now.{`\n`}Gone when you say.</Text>
        <Text style={styles.body}>
          Start instantly with a one-time private link, or connect in person
          with a QR. No profile or membership required.
        </Text>
      </View>
      <View style={styles.rules}>
        <Text style={styles.rule}>
          Invites work once · expire in 90 seconds
        </Text>
        <Text style={styles.rule}>Temporary per-chat encryption keys</Text>
        <Text style={styles.ruleStrong}>
          Gone in 24 hours—or destroy it in one tap.
        </Text>
      </View>
      <View style={styles.actions}>
        {active ? (
          <>
            <Button
              label="Continue private chat"
              loading={loading}
              onPress={continueChat}
            />
            <Button
              label="End & Destroy"
              variant="secondary"
              disabled={loading}
              onPress={destroy}
            />
          </>
        ) : (
          <>
            <Button
              label="Start a Quick Chat"
              loading={loading}
              onPress={() =>
                navigation.navigate('ChatInvite', { focus: 'share' })
              }
            />
            <Button
              label="Scan a QR"
              variant="secondary"
              disabled={loading}
              onPress={() => navigation.navigate('ChatScan')}
            />
          </>
        )}
        <Text style={styles.limit}>Initially limited to one active chat.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 22 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modeBadge: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  modeLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  hero: { flex: 1, justifyContent: 'center' },
  eyebrow: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 37,
    lineHeight: 41,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginTop: 12,
  },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 16 },
  rules: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.surface,
    gap: 9,
    marginBottom: 18,
  },
  rule: { color: colors.text, fontSize: 13 },
  ruleStrong: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  actions: { gap: 11 },
  limit: { color: colors.faint, fontSize: 10, textAlign: 'center' },
});
