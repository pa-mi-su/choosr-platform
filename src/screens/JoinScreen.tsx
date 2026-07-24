import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { normalizeRoomCode, roomErrorMessage } from '../services/roomFlow';
import {
  joinDecisionRoom,
  loadDecisionRoom,
  touchRoomPresence,
} from '../services/sessionService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Join'>;
const ROOM_CODE_LENGTH = 8;

export function JoinScreen({ navigation, route }: Props): React.JSX.Element {
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inviteToken = route.params?.inviteToken;
  const automaticJoinStarted = useRef(false);

  const join = useCallback(
    async (token?: string) => {
      if ((!token && code.length !== ROOM_CODE_LENGTH) || joining) {
        return;
      }
      setJoining(true);
      setError(null);
      try {
        const joined = await joinDecisionRoom(
          token ? { inviteToken: token } : { accessCode: code },
        );
        const room = await loadDecisionRoom(joined.sessionId);
        if (room.participantCount !== 2) {
          setError(
            'This device created that room. Open the invite on your partner’s device.',
          );
          return;
        }
        if (room.mode === 'eat' || room.mode === 'do') {
          navigation.replace('LocalSetup', {
            mode: room.mode,
            sessionId: room.sessionId,
            roundNumber: room.roundNumber,
          });
          return;
        }
        if (room.status !== 'active') {
          setError('This room is not ready yet. Please try again.');
          return;
        }
        await touchRoomPresence(room.sessionId);
        navigation.replace('Swipe', {
          sessionId: room.sessionId,
          roundNumber: room.roundNumber,
          mode: room.mode,
        });
      } catch (cause) {
        setError(roomErrorMessage(cause));
      } finally {
        setJoining(false);
      }
    },
    [code, joining, navigation],
  );

  useEffect(() => {
    if (!inviteToken || automaticJoinStarted.current) {
      return;
    }
    automaticJoinStarted.current = true;
    join(inviteToken).catch(() => undefined);
  }, [inviteToken, join]);

  const close = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Home');
    }
  };

  return (
    <Screen testID="join-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Close" variant="quiet" onPress={close} />
      </View>
      <View style={styles.content}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>↗</Text>
        </View>
        <Text style={styles.eyebrow}>
          {inviteToken ? 'INVITE RECEIVED' : 'JOIN YOUR PARTNER'}
        </Text>
        <Text style={styles.title}>
          {inviteToken ? 'Joining your room…' : 'Enter the room code.'}
        </Text>
        <Text style={styles.subtitle}>
          You’ll both see the same options. Your individual choices stay
          private.
        </Text>
        {!inviteToken ? (
          <TextInput
            testID="room-code-input"
            accessibilityLabel="Room code"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!joining}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="ABCD2345"
            placeholderTextColor={colors.faint}
            selectionColor={colors.primary}
            value={code}
            onChangeText={value => {
              setCode(normalizeRoomCode(value));
              setError(null);
            }}
            onSubmitEditing={() => join()}
            style={styles.input}
          />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View>
        <Button
          label={inviteToken && error ? 'Try invite again' : 'Join room'}
          disabled={!inviteToken && code.length !== ROOM_CODE_LENGTH}
          loading={joining}
          onPress={() => join(inviteToken)}
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
  error: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 14,
  },
  note: {
    color: colors.faint,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 10,
  },
});
