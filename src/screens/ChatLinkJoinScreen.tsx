import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { encodeChatInvitation } from '../chat/domain/invitation';
import { chatSession } from '../chat/runtime';
import { BackToChoosrButton, Button, Screen } from '../components/UI';
import { ensureAnonymousSession } from '../services/anonymousAuth';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatLinkJoin'>;

export function ChatLinkJoinScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const [error, setError] = useState<string>();
  const [joining, setJoining] = useState(true);
  const encodedInvitation = useMemo(() => {
    if (route.params?.v !== '1' || !route.params.t || !route.params.k) {
      return undefined;
    }
    return encodeChatInvitation({
      token: route.params.t,
      creatorPublicKey: route.params.k,
    });
  }, [route.params]);

  useEffect(() => {
    let mounted = true;
    if (!encodedInvitation) {
      setError('That private-chat link is incomplete or invalid.');
      setJoining(false);
      return () => {
        mounted = false;
      };
    }
    ensureAnonymousSession()
      .then(session => chatSession.join(session.user.id, encodedInvitation))
      .then(() => {
        if (mounted) navigation.replace('ChatRoom');
      })
      .catch(cause => {
        if (!mounted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'That private-chat link could not be joined.',
        );
        setJoining(false);
      });
    return () => {
      mounted = false;
    };
  }, [encodedInvitation, navigation]);

  return (
    <Screen testID="chat-link-join-screen" style={styles.screen}>
      <BackToChoosrButton onPress={() => navigation.replace('ChatHome')} />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>ONE-TIME PRIVATE LINK</Text>
        <Text style={styles.title}>
          {joining ? 'Joining securely…' : 'Invitation unavailable'}
        </Text>
        <Text style={styles.copy}>
          {joining
            ? 'Creating a temporary device key and claiming the invitation.'
            : error}
        </Text>
        {!joining ? (
          <Button
            label="Back to Private Chat"
            variant="secondary"
            onPress={() => navigation.replace('ChatHome')}
          />
        ) : null}
      </View>
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
    fontSize: 35,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 23 },
});
