import React, { useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from './src/navigation/AppNavigator';
import { appLinking } from './src/navigation/linking';
import { registerAuthAutoRefresh } from './src/lib/supabase';
import { colors } from './src/theme';
import {
  flushPendingNotificationNavigation,
  navigationRef,
  openFromNotification,
} from './src/navigation/navigationRef';
import { registerPushListeners } from './src/services/pushNotifications';
import {
  refreshNotificationState,
  registerNotificationSynchronization,
} from './src/services/notificationService';

export default function App(): React.JSX.Element {
  useEffect(() => registerAuthAutoRefresh(), []);
  useEffect(() => registerNotificationSynchronization(), []);
  useEffect(
    () =>
      registerPushListeners({
        onOpen: openFromNotification,
        onForeground: () => {
          refreshNotificationState().catch(() => undefined);
        },
      }),
    [],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar
          barStyle="light-content"
          backgroundColor={colors.background}
        />
        <NavigationContainer
          ref={navigationRef}
          linking={appLinking}
          onReady={flushPendingNotificationNavigation}
        >
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
