import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
} from 'react-native-vision-camera';

import { chatSession } from '../chat/runtime';
import { Brand, Button, Screen } from '../components/UI';
import { ensureAnonymousSession } from '../services/anonymousAuth';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatScan'>;

export function ChatScanScreen({ navigation }: Props): React.JSX.Element {
  const device = useCameraDevice('back');
  const [permission, setPermission] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    Camera.requestCameraPermission()
      .then(status => setPermission(status === 'granted'))
      .catch(() => setPermission(false));
  }, []);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      const value = codes[0]?.value;
      if (!value || processing) return;
      setProcessing(true);
      setError(undefined);
      ensureAnonymousSession()
        .then(session => chatSession.join(session.user.id, value))
        .then(() => navigation.replace('ChatRoom'))
        .catch(cause => {
          setError(
            cause instanceof Error
              ? cause.message
              : 'That private chat QR could not be joined.',
          );
          setProcessing(false);
        });
    },
  });

  return (
    <Screen testID="chat-scan-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button
          label="Cancel scan"
          variant="quiet"
          onPress={navigation.goBack}
        />
      </View>
      <Text style={styles.title}>Scan a Choosr Chat QR</Text>
      <Text style={styles.copy}>
        The creator must show the live code on their device. Screenshots may be
        expired or already consumed.
      </Text>
      <View style={styles.cameraFrame}>
        {permission && device ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={!processing}
            codeScanner={codeScanner}
          />
        ) : (
          <Text style={styles.cameraMessage}>
            {permission
              ? 'No camera is available.'
              : 'Camera access is required to scan a QR invitation.'}
          </Text>
        )}
        <View pointerEvents="none" style={styles.target} />
      </View>
      {processing ? <Text style={styles.status}>Joining securely…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 28,
  },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 9 },
  cameraFrame: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: colors.surface,
    marginVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraMessage: {
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 35,
  },
  target: {
    width: 230,
    height: 230,
    borderWidth: 3,
    borderColor: colors.primary,
    borderRadius: 22,
  },
  status: { color: colors.success, textAlign: 'center', fontWeight: '800' },
  error: { color: colors.danger, textAlign: 'center', marginTop: 8 },
});
