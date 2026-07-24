import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { modeById } from '../data/decisions';
import {
  answerConnection,
  answerRoomInvitation,
  circleErrorMessage,
  createCircleInvite,
  loadCircle,
  loadOwnProfile,
  loadPendingRoomInvitations,
  normalizeHandle,
  requestConnection,
  removeCircleConnection,
  redeemCircleInvite,
  saveOwnProfile,
  type ChoosrProfile,
  type CirclePerson,
  type PendingRoomInvitation,
} from '../services/circleService';
import { buildCircleInvite } from '../services/roomInvite';
import { chooseAndUploadProfilePhoto } from '../services/profilePhotoService';
import { logPhotoFailure } from '../services/photoUploadService';
import {
  enablePushNotifications,
  isPushEnabled,
  refreshPushRegistration,
} from '../services/pushNotifications';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Circle'>;

export function CircleScreen({ navigation, route }: Props): React.JSX.Element {
  const [profile, setProfile] = useState<ChoosrProfile | null>(null);
  const [people, setPeople] = useState<CirclePerson[]>([]);
  const [invitations, setInvitations] = useState<PendingRoomInvitation[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [friendHandle, setFriendHandle] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const connectionToken = route.params?.connectionToken;
  const redemptionStarted = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ownProfile = await loadOwnProfile();
      setProfile(ownProfile);
      if (ownProfile) {
        if (connectionToken && !redemptionStarted.current) {
          redemptionStarted.current = true;
          await redeemCircleInvite(connectionToken);
        }
        setDisplayName(ownProfile.displayName);
        setHandle(ownProfile.handle);
        isPushEnabled()
          .then(notificationsEnabled => {
            setPushEnabled(notificationsEnabled);
            if (notificationsEnabled) {
              refreshPushRegistration().catch(() => undefined);
            }
          })
          .catch(() => undefined);
        const [circle, pending] = await Promise.all([
          loadCircle(),
          loadPendingRoomInvitations(),
        ]);
        setPeople(circle);
        setInvitations(pending);
      }
    } catch (cause) {
      setError(circleErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [connectionToken]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => undefined);
    }, [refresh]),
  );

  const run = async (action: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(circleErrorMessage(cause));
    } finally {
      setWorking(false);
    }
  };

  const saveProfile = () =>
    run(async () => {
      const saved = await saveOwnProfile({ displayName, handle });
      setProfile(saved);
      setPushEnabled(await enablePushNotifications());
    });

  const enableRoomAlerts = () =>
    run(async () => {
      setPushEnabled(await enablePushNotifications());
    });

  const addFriend = () =>
    run(async () => {
      await requestConnection(friendHandle);
      setFriendHandle('');
    });

  const inviteFromContacts = () =>
    run(async () => {
      if (!profile) return;
      const credentials = await createCircleInvite();
      const invite = buildCircleInvite({
        inviteToken: credentials.inviteToken,
        displayName: profile.displayName,
      });
      await Share.share({
        title: 'Connect on Choosr',
        message: invite.message,
        url: invite.url,
      });
    });

  const changeProfilePhoto = () =>
    run(async () => {
      if (!profile) return;
      let avatarPath: string | null;
      try {
        avatarPath = await chooseAndUploadProfilePhoto(profile.avatarPath);
      } catch (cause) {
        logPhotoFailure('profile-upload', cause);
        throw cause;
      }
      if (avatarPath) {
        // refresh() resolves the new public URL and updates the Circle list.
        setProfile({ ...profile, avatarPath });
      }
    });

  const openInvitation = async (invitation: PendingRoomInvitation) => {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const room = await answerRoomInvitation(invitation.invitationId, true);
      if (!room) throw new Error('invitation_unavailable');
      if (invitation.mode === 'eat' || invitation.mode === 'do') {
        navigation.replace('LocalSetup', {
          mode: invitation.mode,
          sessionId: room.sessionId,
          roundNumber: room.roundNumber,
        });
        return;
      }
      navigation.replace('Swipe', {
        sessionId: room.sessionId,
        roundNumber: room.roundNumber,
        mode: invitation.mode,
      });
    } catch (cause) {
      setError(circleErrorMessage(cause));
      setWorking(false);
    }
  };

  const confirmRemove = (person: CirclePerson) => {
    Alert.alert(
      `Remove ${person.displayName}?`,
      'They will leave your Circle. Their account and previous room history will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => run(() => removeCircleConnection(person.connectionId)),
        },
      ],
    );
  };

  const close = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Home');
    }
  };

  return (
    <Screen testID="circle-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Close" variant="quiet" onPress={close} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>YOUR CHOOSR CIRCLE</Text>
        <Text style={styles.title}>Your people, one tap away.</Text>
        <Text style={styles.subtitle}>
          Connect once. Next time, pick a person and send the room directly.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : !profile ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Create your Choosr identity</Text>
            <Text style={styles.panelText}>
              This lets friends find you without sharing your contacts.
            </Text>
            <TextInput
              accessibilityLabel="Display name"
              placeholder="Your name"
              placeholderTextColor={colors.faint}
              value={displayName}
              onChangeText={setDisplayName}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Choosr handle"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="your_handle"
              placeholderTextColor={colors.faint}
              value={handle}
              onChangeText={value => setHandle(normalizeHandle(value))}
              style={styles.input}
            />
            <Button
              label="Create my Circle"
              disabled={!displayName.trim() || handle.length < 3}
              loading={working}
              onPress={saveProfile}
            />
          </View>
        ) : (
          <>
            <View style={styles.identity}>
              <ProfileAvatar
                displayName={profile.displayName}
                photoUrl={profile.photoUrl}
              />
              <View style={styles.personCopy}>
                <Text style={styles.personName}>{profile.displayName}</Text>
                <Text style={styles.handle}>@{profile.handle}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change profile photo"
                disabled={working}
                onPress={changeProfilePhoto}
                style={({ pressed }) => [
                  styles.photoButton,
                  pressed && styles.photoButtonPressed,
                ]}
              >
                <Text style={styles.photoButtonText}>
                  {profile.photoUrl ? 'Change' : 'Add photo'}
                </Text>
              </Pressable>
            </View>

            {!pushEnabled ? (
              <View style={styles.alertPanel}>
                <View style={styles.alertCopy}>
                  <Text style={styles.alertTitle}>Don’t miss an invite</Text>
                  <Text style={styles.alertText}>
                    Enable alerts so Circle invitations reach you when Choosr is
                    closed.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={enableRoomAlerts}
                  style={styles.alertButton}
                >
                  <Text style={styles.alertButtonText}>Enable</Text>
                </Pressable>
              </View>
            ) : null}

            {invitations.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>ROOM INVITES</Text>
                {invitations.map(invitation => (
                  <View key={invitation.invitationId} style={styles.inviteCard}>
                    <Text style={styles.inviteTitle}>
                      {invitation.senderDisplayName} wants to choose
                    </Text>
                    <Text style={styles.inviteMode}>
                      {modeById[invitation.mode].icon}{' '}
                      {modeById[invitation.mode].title}
                    </Text>
                    <Button
                      label="Join room"
                      loading={working}
                      onPress={() => openInvitation(invitation)}
                    />
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ADD SOMEBODY</Text>
              <View style={styles.addRow}>
                <TextInput
                  accessibilityLabel="Friend handle"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="friend_handle"
                  placeholderTextColor={colors.faint}
                  value={friendHandle}
                  onChangeText={value =>
                    setFriendHandle(normalizeHandle(value))
                  }
                  onSubmitEditing={addFriend}
                  style={[styles.input, styles.friendInput]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send friend request"
                  disabled={friendHandle.length < 3 || working}
                  onPress={addFriend}
                  style={styles.addButton}
                >
                  <Text style={styles.addButtonText}>+</Text>
                </Pressable>
              </View>
              <Button
                label="Invite from contacts"
                variant="secondary"
                loading={working}
                onPress={inviteFromContacts}
              />
              <Text style={styles.contactNote}>
                Uses your phone’s share picker. Choosr never uploads your
                address book.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PEOPLE</Text>
              {people.length === 0 ? (
                <Text style={styles.empty}>
                  Add somebody by their handle. They must accept before you can
                  invite them.
                </Text>
              ) : (
                people.map(person => (
                  <View key={person.connectionId} style={styles.personCard}>
                    <ProfileAvatar
                      displayName={person.displayName}
                      photoUrl={person.photoUrl}
                      size="small"
                    />
                    <View style={styles.personCopy}>
                      <Text style={styles.personName}>
                        {person.displayName}
                      </Text>
                      <Text style={styles.handle}>@{person.handle}</Text>
                    </View>
                    {person.status === 'accepted' ? (
                      <View style={styles.personActions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${person.displayName} from your Circle`}
                          onPress={() => confirmRemove(person)}
                          style={styles.removePersonButton}
                        >
                          <Text style={styles.removePersonText}>Remove</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            navigation.navigate('ModeSelect', {
                              connectionId: person.connectionId,
                              connectionName: person.displayName,
                            })
                          }
                          style={styles.chooseButton}
                        >
                          <Text style={styles.chooseText}>Choose</Text>
                        </Pressable>
                      </View>
                    ) : person.direction === 'incoming' ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          run(() => answerConnection(person.connectionId, true))
                        }
                        style={styles.acceptButton}
                      >
                        <Text style={styles.chooseText}>Accept</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.pending}>PENDING</Text>
                    )}
                  </View>
                ))
              )}
            </View>
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: { paddingTop: 30, paddingBottom: 24 },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 35,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginTop: 9,
  },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 9 },
  loader: { marginTop: 60 },
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 18,
    gap: 12,
    marginTop: 28,
  },
  panelTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  panelText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  input: {
    height: 56,
    color: colors.text,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 15,
    marginTop: 24,
  },
  photoButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  photoButtonPressed: { opacity: 0.7 },
  photoButtonText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  section: { marginTop: 26, gap: 10 },
  sectionTitle: {
    color: colors.faint,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  inviteCard: {
    backgroundColor: '#1D2B1F',
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  inviteTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  inviteMode: { color: colors.success, fontSize: 13, fontWeight: '900' },
  addRow: { flexDirection: 'row', gap: 9 },
  friendInput: { flex: 1 },
  addButton: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: colors.white, fontSize: 28, fontWeight: '700' },
  personCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 12,
  },
  personCopy: { flex: 1, marginLeft: 12 },
  personName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  handle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  chooseButton: {
    backgroundColor: colors.primary,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  personActions: { alignItems: 'flex-end', gap: 7 },
  removePersonButton: { paddingHorizontal: 5, paddingVertical: 2 },
  removePersonText: { color: colors.danger, fontSize: 10, fontWeight: '800' },
  acceptButton: {
    backgroundColor: colors.success,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  chooseText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  pending: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  empty: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
  },
  error: { color: '#FF8A7A', fontSize: 12, textAlign: 'center', marginTop: 18 },
  contactNote: {
    color: colors.faint,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  alertPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.raised,
    borderRadius: 17,
    padding: 14,
    marginTop: 10,
  },
  alertCopy: { flex: 1 },
  alertTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  alertText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  alertButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginLeft: 10,
  },
  alertButtonText: { color: colors.white, fontSize: 11, fontWeight: '900' },
});
