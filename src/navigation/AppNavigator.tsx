import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';
import { HomeScreen } from '../screens/HomeScreen';
import { WaitingScreen } from '../screens/WaitingScreen';
import { JoinScreen } from '../screens/JoinScreen';
import { SwipeScreen } from '../screens/SwipeScreen';
import { MatchScreen } from '../screens/MatchScreen';
import { NoMatchScreen } from '../screens/NoMatchScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
export function AppNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade_from_bottom',
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Waiting" component={WaitingScreen} />
      <Stack.Screen name="Join" component={JoinScreen} />
      <Stack.Screen name="Swipe" component={SwipeScreen} />
      <Stack.Screen name="Match" component={MatchScreen} />
      <Stack.Screen name="NoMatch" component={NoMatchScreen} />
    </Stack.Navigator>
  );
}
