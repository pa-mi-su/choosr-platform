import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { LocalChatMessage } from '../chat/domain/types';
import { chatSession } from '../chat/runtime';
import { BackToChoosrButton, Button, Screen } from '../components/UI';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatRoom'>;

function remainingLifetime(expiresAt: string | undefined): string {
  if (!expiresAt) return 'Ending';
  const milliseconds = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.ceil((milliseconds % 3_600_000) / 60_000);
  return hours ? `${hours}h ${minutes}m remaining` : `${minutes}m remaining`;
}

export function ChatRoomScreen({ navigation }: Props): React.JSX.Element {
  const [messages, setMessages] = useState<readonly LocalChatMessage[]>(
    chatSession.messages,
  );
  const [draft, setDraft] = useState('');
  const [connection, setConnection] = useState(
    chatSession.active?.status === 'inviting'
      ? 'Encrypted · Waiting to connect'
      : 'End-to-end encrypted',
  );
  const [chatStatus, setChatStatus] = useState(
    chatSession.active?.status ?? 'inviting',
  );
  const [lifetime, setLifetime] = useState(
    remainingLifetime(chatSession.active?.expiresAt),
  );
  const [sending, setSending] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState(chatSession.safetyNumber);
  const [showEncryptionDetails, setShowEncryptionDetails] = useState(false);

  const returnHome = useCallback(
    (remote = false) => {
      if (remote) {
        Alert.alert(
          'Chat destroyed',
          'This chat was ended and destroyed. Local messages and temporary keys were purged.',
        );
      }
      navigation.replace('ChatHome');
    },
    [navigation],
  );

  const synchronize = useCallback(async () => {
    try {
      const status = await chatSession.refreshStatus();
      if (status === 'destroyed') {
        returnHome(true);
        return;
      }
      setChatStatus(status);
      setConnection(
        status === 'active'
          ? 'End-to-end encrypted'
          : 'Encrypted · Waiting to connect',
      );
      setMessages([...(await chatSession.refreshMessages())]);
      setSafetyNumber(chatSession.safetyNumber);
      setLifetime(remainingLifetime(chatSession.active?.expiresAt));
    } catch {
      setConnection('Encrypted · Reconnecting');
    }
  }, [returnHome]);

  useEffect(() => {
    if (!chatSession.active) {
      returnHome();
      return;
    }
    synchronize().catch(() => undefined);
    const subscription = chatSession.subscribe(() => {
      synchronize().catch(() => undefined);
    });
    const poll = setInterval(() => {
      synchronize().catch(() => undefined);
    }, 3000);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') synchronize().catch(() => undefined);
    });
    return () => {
      clearInterval(poll);
      appState.remove();
      subscription.unsubscribe();
    };
  }, [returnHome, synchronize]);

  const send = async () => {
    const text = draft.trim();
    if (!text || text.length > 2000 || sending) return;
    setSending(true);
    try {
      await chatSession.send(text);
      setDraft('');
      setMessages([...chatSession.messages]);
    } catch (cause) {
      Alert.alert(
        'Message not sent',
        cause instanceof Error ? cause.message : 'Try again when connected.',
      );
    } finally {
      setSending(false);
    }
  };

  const destroy = () => {
    Alert.alert(
      'End & Destroy for both people?',
      'This cannot be undone. Live ciphertext, participant access, local messages, and temporary keys will be destroyed.',
      [
        { text: 'Keep chat', style: 'cancel' },
        {
          text: 'End & Destroy',
          style: 'destructive',
          onPress: () => {
            chatSession
              .destroy()
              .catch(() => {
                Alert.alert(
                  'Destroyed on this device',
                  'Server destruction is queued and will retry after reconnecting.',
                );
              })
              .finally(() => returnHome());
          },
        },
      ],
    );
  };

  return (
    <Screen testID="chat-room-screen" style={styles.screen}>
      <View style={styles.top}>
        <BackToChoosrButton
          label="PRIVATE CHAT"
          accessibilityLabel="Back to Private Chat"
          testID="back-to-private-chat"
          onPress={() => navigation.popTo('ChatHome')}
        />
        <Button label="End & Destroy" variant="quiet" onPress={destroy} />
      </View>
      <View style={styles.statusRow}>
        <Text style={styles.connection}>{connection}</Text>
        <Text style={styles.lifetime}>{lifetime}</Text>
      </View>
      {chatStatus === 'inviting' ? (
        <View style={styles.waiting}>
          <View style={styles.waitingMark}>
            <Text style={styles.waitingMarkText}>···</Text>
          </View>
          <Text style={styles.waitingEyebrow}>INVITATION SENT</Text>
          <Text style={styles.waitingTitle}>
            Waiting for{' '}
            {chatSession.active?.peerDisplayName ?? 'the other person'} to join.
          </Text>
          <Text style={styles.waitingBody}>
            Messaging unlocks after they accept and both devices complete the
            private encryption handshake.
          </Text>
          <Text style={styles.waitingPrivacy}>
            No message can be written or stored before the chat is encrypted.
          </Text>
        </View>
      ) : showEncryptionDetails ? (
        <View style={styles.safetyCard}>
          <View style={styles.safetyCopy}>
            <Text style={styles.safetyTitle}>Compare encryption number</Text>
            <Text style={styles.safetyBody}>
              Optional: compare this number by phone, video, in person, or
              another trusted way for extra assurance.
            </Text>
          </View>
          <Text
            selectable
            accessibilityLabel={`Chat safety number ${
              safetyNumber ?? 'pending'
            }`}
            style={styles.safetyNumber}
          >
            {safetyNumber ?? 'Creating…'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close encryption details"
            onPress={() => setShowEncryptionDetails(false)}
            style={({ pressed }) => [
              styles.confirmSafety,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.confirmSafetyText}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Encryption details"
          onPress={() => setShowEncryptionDetails(true)}
          style={({ pressed }) => [
            styles.encryptionDetails,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.encryptionDetailsText}>Encryption details</Text>
        </Pressable>
      )}
      {chatStatus === 'active' ? (
        <KeyboardAvoidingView
          style={styles.chat}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FlatList
            data={[...messages]}
            keyExtractor={message => message.id}
            contentContainerStyle={styles.messages}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Messages are readable only on these two devices.
              </Text>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  styles.bubble,
                  item.sentByMe ? styles.mine : styles.theirs,
                ]}
              >
                <Text style={styles.message}>{item.text}</Text>
              </View>
            )}
          />
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel="Private message"
              value={draft}
              onChangeText={setDraft}
              placeholder="Private message"
              placeholderTextColor={colors.faint}
              maxLength={2000}
              multiline
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send encrypted message"
              disabled={!draft.trim() || sending}
              onPress={send}
              style={({ pressed }) => [
                styles.send,
                (pressed || sending) && styles.pressed,
              ]}
            >
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : null}
      <Text style={styles.warning}>
        Screenshots and external photographs cannot be prevented.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 16 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  connection: { color: colors.success, fontSize: 11, fontWeight: '800' },
  lifetime: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  chat: { flex: 1 },
  encryptionDetails: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  encryptionDetailsText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  safetyCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.surface,
    gap: 10,
  },
  waiting: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  waitingMark: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.surface,
  },
  waitingMarkText: {
    color: colors.success,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 3,
    marginTop: -8,
  },
  waitingEyebrow: {
    color: colors.success,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginTop: 20,
  },
  waitingTitle: {
    color: colors.text,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 9,
  },
  waitingBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 13,
  },
  waitingPrivacy: {
    color: colors.faint,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 16,
  },
  safetyCopy: { gap: 3 },
  safetyTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  safetyBody: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  safetyNumber: {
    color: colors.blue,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  confirmSafety: {
    minHeight: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.raised,
  },
  confirmSafetyText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  messages: { flexGrow: 1, justifyContent: 'flex-end', paddingVertical: 16 },
  empty: {
    color: colors.faint,
    textAlign: 'center',
    marginVertical: 40,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 17,
    marginVertical: 4,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.blue },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.raised },
  message: { color: colors.white, fontSize: 16, lineHeight: 21 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  send: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 17,
  },
  pressed: { opacity: 0.55 },
  disabled: { opacity: 0.45 },
  sendText: { color: colors.white, fontWeight: '900' },
  warning: {
    color: colors.faint,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 8,
  },
});
