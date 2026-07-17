import React, { useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import {
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from './src/navigation/AppNavigator';
import { registerAuthAutoRefresh } from './src/lib/supabase';
import { roomLinkingPrefixes } from './src/services/roomInvite';
import { colors } from './src/theme';
import type { RootStackParamList } from './src/types/navigation';

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: roomLinkingPrefixes,
  config: {
    screens: {
      Join: 'join/:inviteToken',
    },
  },
};

export default function App(): React.JSX.Element {
  useEffect(() => registerAuthAutoRefresh(), []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar
          barStyle="light-content"
          backgroundColor={colors.background}
        />
        <NavigationContainer linking={linking}>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
