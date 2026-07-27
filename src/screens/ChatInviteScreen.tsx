import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';

import {
  buildPrivateChatShareMessage,
  encodeChatInvitation,
} from '../chat/domain/invitation';
import type { ChatInvitation } from '../chat/domain/types';
import { chatSession } from '../chat/runtime';
import { BackToChoosrButton, Button, Screen } from '../components/UI';
import { ensureAnonymousSession } from '../services/anonymousAuth';
import { buildNativeSharePayload } from '../services/roomInvite';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatInvite'>;

export function ChatInviteScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const [invitation, setInvitation] = useState<ChatInvitation>();
  const [remaining, setRemaining] = useState(90);
  const [error, setError] = useState<string>();
  const [ending, setEnding] = useState(false);
  const [sharing, setSharing] = useState(false);

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

  const share = async () => {
    if (!invitation || sharing) return;
    setSharing(true);
    try {
      const content = buildPrivateChatShareMessage(invitation);
      await Share.share(
        buildNativeSharePayload('Choosr · Private chat', content),
      );
    } catch {
      Alert.alert(
        'Invitation not shared',
        'Choose another app or show the live QR in person.',
      );
    } finally {
      setSharing(false);
    }
  };

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
        <BackToChoosrButton
          label="PRIVATE CHAT"
          accessibilityLabel="Back to Private Chat"
          testID="back-to-private-chat"
          onPress={() => navigation.popTo('ChatHome')}
        />
        <Button
          label="End & Destroy"
          variant="quiet"
          loading={ending}
          onPress={end}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SINGLE-USE INVITATION</Text>
        <Text style={styles.title}>
          {route.params?.focus === 'qr'
            ? 'Scan this QR in person.'
            : 'Invite one person.'}
        </Text>
        <Text style={styles.copy}>
          Link and QR carry the same one-time token and temporary public key.
          The first valid recipient claims it.
        </Text>
        <Button
          label="Share Private Link"
          loading={sharing}
          disabled={!invitation}
          onPress={share}
        />
        <View style={styles.qr}>
          {qrValue ? (
            <QRCode
              value={qrValue}
              size={176}
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
        Anyone with the live invitation can claim it. Never post it publicly.
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
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
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
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 2,
  },
  qr: {
    width: 202,
    height: 202,
    borderRadius: 22,
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
  },
  privacy: { color: colors.faint, fontSize: 11, textAlign: 'center' },
});
