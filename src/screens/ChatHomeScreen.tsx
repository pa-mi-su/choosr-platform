import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BackToChoosrButton, Button, Screen } from '../components/UI';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { chatSession } from '../chat/runtime';
import type { PendingDecisionChatInvitation } from '../chat/domain/types';
import { ensureAnonymousSession } from '../services/anonymousAuth';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatHome'>;

export function ChatHomeScreen({ navigation }: Props): React.JSX.Element {
  const [active, setActive] = useState(Boolean(chatSession.active));
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState<PendingDecisionChatInvitation[]>([]);
  const [invitationAction, setInvitationAction] = useState<string | null>(null);
  const [invitationError, setInvitationError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setChecking(true);
      setInvitationError(null);
      chatSession
        .reconcileOrphanedRemoteChat()
        .then(async result => {
          if (chatSession.consumeOrphanedChatDestructionNotice()) {
            Alert.alert(
              'Previous chat destroyed',
              'Choosr was closed and its temporary encryption keys were erased, so the unreadable chat was destroyed for both people.',
            );
          }
          const invitations =
            await chatSession.listPendingDecisionInvitations();
          if (mounted) {
            setActive(result);
            setPending(invitations);
          }
        })
        .catch(() => {
          if (mounted) {
            setActive(Boolean(chatSession.active));
            setInvitationError(
              'Private chat invitations could not be refreshed.',
            );
          }
        })
        .finally(() => {
          if (mounted) setChecking(false);
        });
      return () => {
        mounted = false;
      };
    }, []),
  );

  const acceptInvitation = async (
    invitation: PendingDecisionChatInvitation,
  ) => {
    if (invitationAction) return;
    setInvitationAction(invitation.roomId);
    setInvitationError(null);
    try {
      if (chatSession.active) {
        throw new Error(
          'End your current private chat before accepting another invitation.',
        );
      }
      const authenticated = await ensureAnonymousSession();
      await chatSession.openDecision(
        authenticated.user.id,
        invitation.decisionSessionId,
        invitation.inviterDisplayName,
      );
      setPending(current =>
        current.filter(item => item.roomId !== invitation.roomId),
      );
      setActive(true);
      navigation.navigate('ChatRoom');
    } catch (cause) {
      setInvitationError(
        cause instanceof Error
          ? cause.message
          : 'That private chat invitation could not be accepted.',
      );
    } finally {
      setInvitationAction(null);
    }
  };

  const declineInvitation = (invitation: PendingDecisionChatInvitation) => {
    if (invitationAction) return;
    Alert.alert(
      'Decline private chat?',
      `${invitation.inviterDisplayName} will no longer be waiting for this chat.`,
      [
        { text: 'Keep invitation', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            setInvitationAction(invitation.roomId);
            setInvitationError(null);
            chatSession
              .declineDecisionInvitation(invitation.roomId)
              .then(() =>
                setPending(current =>
                  current.filter(item => item.roomId !== invitation.roomId),
                ),
              )
              .catch(() =>
                setInvitationError(
                  'That private chat invitation could not be declined.',
                ),
              )
              .finally(() => setInvitationAction(null));
          },
        },
      ],
    );
  };

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
      state.status === 'inviting' && !state.decisionSessionId
        ? 'ChatInvite'
        : 'ChatRoom',
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
          <View style={[styles.modeDot, checking && styles.modeDotChecking]} />
          <Text style={styles.modeLabel}>
            {checking ? 'CHECKING' : 'PRIVATE CHAT'}
          </Text>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>CHOOSR CHAT</Text>
          <Text style={styles.title}>
            Here for now.{`\n`}Gone when you say.
          </Text>
          <Text style={styles.body}>
            Start instantly with a one-time private link, or connect in person
            with a QR. No profile or membership required.
          </Text>
        </View>
        {pending.length ? (
          <View style={styles.invitationSection}>
            <Text style={styles.invitationEyebrow}>WAITING FOR YOU</Text>
            {pending.map(invitation => (
              <View key={invitation.roomId} style={styles.invitationCard}>
                <ProfileAvatar
                  displayName={invitation.inviterDisplayName}
                  photoUrl={invitation.inviterPhotoUrl}
                  size="small"
                />
                <View style={styles.invitationCopy}>
                  <Text style={styles.invitationTitle}>
                    {invitation.inviterDisplayName} wants to chat
                  </Text>
                  <Text style={styles.invitationBody} numberOfLines={2}>
                    About your match: {invitation.matchedItemTitle}
                  </Text>
                  <View style={styles.invitationActions}>
                    <Button
                      label="Accept"
                      loading={invitationAction === invitation.roomId}
                      disabled={Boolean(invitationAction) || active}
                      onPress={() => acceptInvitation(invitation)}
                    />
                    <Button
                      label="Decline"
                      variant="quiet"
                      disabled={Boolean(invitationAction)}
                      onPress={() => declineInvitation(invitation)}
                    />
                  </View>
                </View>
              </View>
            ))}
            {active ? (
              <Text style={styles.invitationHint}>
                End your active chat before accepting another.
              </Text>
            ) : null}
          </View>
        ) : null}
        {invitationError ? (
          <Text style={styles.invitationError}>{invitationError}</Text>
        ) : null}
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
                label="Continue active private chat"
                onPress={continueChat}
              />
              <Button
                label="End & Destroy"
                variant="secondary"
                onPress={destroy}
              />
            </>
          ) : (
            <>
              <Button
                label="Start a Quick Chat"
                onPress={() =>
                  navigation.navigate('ChatInvite', { focus: 'share' })
                }
              />
              <Button
                label="Scan a QR"
                variant="secondary"
                onPress={() => navigation.navigate('ChatScan')}
              />
            </>
          )}
          <Text style={styles.limit}>
            {active
              ? 'Active chat keys remain only on this device.'
              : 'Initially limited to one active chat.'}
          </Text>
        </View>
      </ScrollView>
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
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 4 },
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
  modeDotChecking: { backgroundColor: colors.faint },
  modeLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  hero: { minHeight: 260, justifyContent: 'center' },
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
  invitationSection: { gap: 9, marginBottom: 16 },
  invitationEyebrow: {
    color: colors.success,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  invitationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.surface,
  },
  invitationCopy: { flex: 1, gap: 4 },
  invitationTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  invitationBody: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  invitationActions: { flexDirection: 'row', gap: 8, marginTop: 7 },
  invitationHint: { color: colors.accent, fontSize: 10 },
  invitationError: {
    color: colors.danger,
    fontSize: 11,
    marginBottom: 10,
    textAlign: 'center',
  },
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
