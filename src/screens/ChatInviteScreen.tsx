import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';

import { encodeChatInvitation } from '../chat/domain/invitation';
import type { ChatInvitation } from '../chat/domain/types';
import { chatSession } from '../chat/runtime';
import { Brand, Button, Screen } from '../components/UI';
import { ensureAnonymousSession } from '../services/anonymousAuth';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatInvite'>;

export function ChatInviteScreen({ navigation }: Props): React.JSX.Element {
  const [invitation, setInvitation] = useState<ChatInvitation>();
  const [remaining, setRemaining] = useState(90);
  const [error, setError] = useState<string>();
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (chatSession.active?.status === 'active') {
      navigation.replace('ChatRoom');
      return () => {
        mounted = false;
      };
    }
    if (chatSession.active?.status === 'inviting' && chatSession.invitation) {
      setInvitation(chatSession.invitation);
      return () => {
        mounted = false;
      };
    }
    ensureAnonymousSession()
      .then(session => chatSession.create(session.user.id))
      .then(value => {
        if (mounted) setInvitation(value);
      })
      .catch(cause => {
        if (mounted) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'The private chat QR could not be created.',
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, [navigation]);

  useEffect(() => {
    if (!invitation) return;
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil(
          (new Date(invitation.invitationExpiresAt).getTime() - Date.now()) /
            1000,
        ),
      );
      setRemaining(seconds);
      if (seconds === 0) {
        chatSession.destroy().catch(() => undefined);
        navigation.replace('ChatHome');
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [invitation, navigation]);

  useEffect(() => {
    if (!invitation) return;
    const poll = setInterval(() => {
      chatSession
        .refreshStatus()
        .then(status => {
          if (status === 'active') navigation.replace('ChatRoom');
          if (status === 'destroyed') navigation.replace('ChatHome');
        })
        .catch(() => undefined);
    }, 1500);
    return () => clearInterval(poll);
  }, [invitation, navigation]);

  const qrValue = useMemo(
    () => (invitation ? encodeChatInvitation(invitation) : undefined),
    [invitation],
  );

  const end = () => {
    Alert.alert(
      'End & Destroy?',
      'This invalidates the QR and destroys all temporary chat state.',
      [
        { text: 'Keep waiting', style: 'cancel' },
        {
          text: 'End & Destroy',
          style: 'destructive',
          onPress: () => {
            setEnding(true);
            chatSession
              .destroy()
              .catch(() => undefined)
              .finally(() => navigation.replace('Home'));
          },
        },
      ],
    );
  };

  return (
    <Screen testID="chat-invite-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button
          label="End & Destroy"
          variant="quiet"
          loading={ending}
          onPress={end}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SINGLE-USE INVITATION</Text>
        <Text style={styles.title}>Scan this QR in person.</Text>
        <Text style={styles.copy}>
          It contains only a random one-time token and a temporary public key.
        </Text>
        <View style={styles.qr}>
          {qrValue ? (
            <QRCode
              value={qrValue}
              size={230}
              color={colors.black}
              backgroundColor={colors.white}
            />
          ) : (
            <Text style={styles.loading}>{error ?? 'Creating secure QR…'}</Text>
          )}
        </View>
        {invitation ? (
          <Text style={styles.timer}>Expires in {remaining} seconds</Text>
        ) : null}
      </View>
      <Text style={styles.privacy}>
        Do not photograph or forward this invitation.
      </Text>
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
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '900',
    marginTop: 10,
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
  },
  qr: {
    width: 258,
    height: 258,
    borderRadius: 22,
    marginTop: 28,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  loading: { color: colors.background, textAlign: 'center' },
  timer: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 18,
  },
  privacy: { color: colors.faint, fontSize: 11, textAlign: 'center' },
});
