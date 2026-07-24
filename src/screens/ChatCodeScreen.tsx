import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { formatChatInvitationCodeInput } from '../chat/domain/invitation';
import { chatSession } from '../chat/runtime';
import { BackToChoosrButton, Button, Screen } from '../components/UI';
import { ensureAnonymousSession } from '../services/anonymousAuth';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatCode'>;

export function ChatCodeScreen({ navigation }: Props): React.JSX.Element {
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string>();

  const join = async () => {
    if (joining) return;
    setJoining(true);
    setError(undefined);
    try {
      const session = await ensureAnonymousSession();
      await chatSession.joinCode(session.user.id, code);
      navigation.replace('ChatRoom');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'That private-chat code could not be joined.',
      );
      setJoining(false);
    }
  };

  return (
    <Screen testID="chat-code-screen" style={styles.screen}>
      <BackToChoosrButton onPress={() => navigation.replace('ChatHome')} />
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.eyebrow}>MANUAL FALLBACK</Text>
        <Text style={styles.title}>Enter the private code.</Text>
        <Text style={styles.copy}>
          Ask the creator for the live 16-character code. It works once and
          expires in about two minutes.
        </Text>
        <TextInput
          testID="chat-code-input"
          accessibilityLabel="Private chat invitation code"
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={value => setCode(formatChatInvitationCodeInput(value))}
          placeholder="0000-0000-0000-0000"
          placeholderTextColor={colors.faint}
          maxLength={19}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Join Private Chat"
          loading={joining}
          disabled={code.length !== 19}
          onPress={join}
        />
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Compare before messaging</Text>
          <Text style={styles.noticeCopy}>
            Manual entry cannot carry the creator’s full key proof. Both people
            must compare the safety number shown after joining.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 22 },
  content: { flex: 1, justifyContent: 'center', gap: 16 },
  eyebrow: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1,
  },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  input: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  error: { color: colors.danger, textAlign: 'center', lineHeight: 19 },
  notice: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 15,
    gap: 5,
  },
  noticeTitle: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  noticeCopy: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});
