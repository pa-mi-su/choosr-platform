import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { buildPreviewDeck, modeById } from '../data/decisions';
import { fetchLiveDecisionDeck } from '../services/deckService';
import { useRoomSync } from '../hooks/useRoomSync';
import { roomErrorMessage } from '../services/roomFlow';
import { buildRoomInvite } from '../services/roomInvite';
import {
  circleErrorMessage,
  inviteCirclePerson,
} from '../services/circleService';
import {
  cancelDecisionRoom,
  createDecisionRoom,
  loadDecisionRoom,
  type DecisionRoom,
} from '../services/sessionService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Waiting'>;

export function WaitingScreen({ navigation, route }: Props): React.JSX.Element {
  const mode = modeById[route.params.mode];
  const searchArea = route.params.searchArea;
  const connectionId = route.params.connectionId;
  const connectionName = route.params.connectionName;
  const customItems = route.params.customItems;
  const [room, setRoom] = useState<DecisionRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [circleInviteSent, setCircleInviteSent] = useState(false);
  const creationStarted = useRef(false);
  const sessionId = room?.sessionId;

  const createRoom = useCallback(async () => {
    if (creationStarted.current) {
      return;
    }
    creationStarted.current = true;
    setCreating(true);
    setError(null);
    try {
      const items =
        mode.id === 'custom'
          ? customItems ?? []
          : await fetchLiveDecisionDeck({
              mode: mode.id,
              postalCode: searchArea,
              maxResults: 10,
            });
      const credentials = await createDecisionRoom({
        mode: mode.id,
        items: items.length ? items : buildPreviewDeck(mode.id, searchArea),
      });
      setInviteToken(credentials.inviteToken);
      setRoom({
        ...credentials,
        mode: mode.id,
        status: 'waiting',
        roundNumber: 1,
        participantCount: 1,
      });
      if (connectionId) {
        try {
          await inviteCirclePerson(credentials.sessionId, connectionId);
          setCircleInviteSent(true);
        } catch (cause) {
          setError(circleErrorMessage(cause));
        }
      }
    } catch (cause) {
      creationStarted.current = false;
      setError(roomErrorMessage(cause));
    } finally {
      setCreating(false);
    }
  }, [connectionId, customItems, mode.id, searchArea]);

  useEffect(() => {
    createRoom().catch(() => undefined);
  }, [createRoom]);

  const refreshRoom = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    try {
      const currentRoom = await loadDecisionRoom(sessionId);
      if (
        currentRoom.status === 'cancelled' ||
        currentRoom.status === 'expired'
      ) {
        navigation.popToTop();
        return;
      }
      setRoom(currentRoom);
      setError(null);
    } catch (cause) {
      setError(roomErrorMessage(cause));
    }
  }, [navigation, sessionId]);

  useRoomSync({
    sessionId,
    tables: ['sessions', 'participants'],
    refresh: refreshRoom,
    maintainPresence: true,
  });

  const ready = room?.status === 'active' && room.participantCount === 2;
  const share = () => {
    if (!room || !inviteToken) {
      return;
    }
    const invite = buildRoomInvite({
      inviteToken,
      accessCode: room.accessCode,
      decisionPrompt: mode.title.toLowerCase(),
      ...(route.params.customPrompt
        ? { decisionPrompt: route.params.customPrompt }
        : {}),
    });
    Share.share({
      title: 'Join my Choosr room',
      message: invite.message,
      url: invite.url,
    }).catch(() => undefined);
  };
  const cancel = async () => {
    if (room) {
      await cancelDecisionRoom(room.sessionId).catch(() => undefined);
    }
    navigation.popToTop();
  };

  return (
    <Screen testID="waiting-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Cancel" variant="quiet" onPress={cancel} />
      </View>
      <View style={styles.content}>
        <View style={styles.people}>
          <View style={[styles.person, styles.you]}>
            <Text style={styles.personText}>Y</Text>
          </View>
          <View style={[styles.person, styles.partner, ready && styles.ready]}>
            <Text style={styles.personText}>{ready ? '✓' : '?'}</Text>
          </View>
        </View>
        <Text style={styles.eyebrow}>
          {creating
            ? 'CREATING PRIVATE ROOM'
            : ready
            ? 'PARTNER JOINED'
            : circleInviteSent
            ? 'INVITATION SENT'
            : 'ROOM CREATED'}
        </Text>
        <Text style={styles.title}>
          {creating
            ? 'One moment…'
            : ready
            ? 'Ready when you are.'
            : circleInviteSent && connectionName
            ? `${connectionName} is invited.`
            : 'Invite your person.'}
        </Text>
        <Text style={styles.subtitle}>
          Your choices remain private until you both like the same option.
        </Text>
        {room ? (
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>ROOM CODE</Text>
            <Text selectable style={styles.code}>
              {room.accessCode}
            </Text>
            <Text style={styles.expires}>Expires in 24 hours</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.actions}>
        {error && !room ? (
          <Button
            label="Retry room creation"
            loading={creating}
            onPress={createRoom}
          />
        ) : creating || !room ? (
          <Button label="Creating room…" loading disabled />
        ) : ready ? (
          <Button
            label="Start swiping"
            onPress={() =>
              navigation.replace('Swipe', {
                sessionId: room.sessionId,
                roundNumber: room.roundNumber,
                mode: mode.id,
                searchArea,
              })
            }
          />
        ) : (
          <Button
            label={circleInviteSent ? 'Share another way' : 'Send invite'}
            onPress={share}
          />
        )}
        {!creating && room && !ready ? (
          <Text style={styles.inviteHint}>
            {circleInviteSent && connectionName
              ? `${connectionName} can join from their Choosr Circle. The link is your fallback.`
              : 'Send it by text, WhatsApp, or any messaging app. We’ll wait here.'}
          </Text>
        ) : null}
        <Text style={styles.preview}>{mode.eyebrow} · Private choices</Text>
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
  people: { width: 190, height: 105, marginBottom: 24 },
  person: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.background,
  },
  you: { left: 26, backgroundColor: colors.primary },
  partner: {
    right: 26,
    backgroundColor: colors.raised,
    borderColor: colors.faint,
    borderStyle: 'dashed',
  },
  ready: {
    backgroundColor: colors.success,
    borderColor: colors.background,
    borderStyle: 'solid',
  },
  personText: { color: colors.white, fontSize: 24, fontWeight: '900' },
  eyebrow: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 35,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginTop: 9,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
  },
  codeBox: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    alignItems: 'center',
    padding: 18,
    marginTop: 30,
  },
  codeLabel: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  code: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 7,
    marginLeft: 7,
    marginTop: 5,
  },
  expires: { color: colors.faint, fontSize: 10, marginTop: 4 },
  error: {
    color: colors.danger,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
  },
  actions: { gap: 9 },
  inviteHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  preview: { color: colors.faint, fontSize: 10, textAlign: 'center' },
});
