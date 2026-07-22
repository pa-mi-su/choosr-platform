import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';
import { HomeScreen } from '../screens/HomeScreen';
import { ModeSelectScreen } from '../screens/ModeSelectScreen';
import { LocalSetupScreen } from '../screens/LocalSetupScreen';
import { WaitingScreen } from '../screens/WaitingScreen';
import { JoinScreen } from '../screens/JoinScreen';
import { SwipeScreen } from '../screens/SwipeScreen';
import { MatchScreen } from '../screens/MatchScreen';
import { NoMatchScreen } from '../screens/NoMatchScreen';
import { CircleScreen } from '../screens/CircleScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { CustomSetupScreen } from '../screens/CustomSetupScreen';
import { ActiveRoomsScreen } from '../screens/ActiveRoomsScreen';

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
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ActiveRooms" component={ActiveRoomsScreen} />
      <Stack.Screen name="Circle" component={CircleScreen} />
      <Stack.Screen name="ModeSelect" component={ModeSelectScreen} />
      <Stack.Screen name="LocalSetup" component={LocalSetupScreen} />
      <Stack.Screen name="CustomSetup" component={CustomSetupScreen} />
      <Stack.Screen name="Waiting" component={WaitingScreen} />
      <Stack.Screen name="Join" component={JoinScreen} />
      <Stack.Screen name="Swipe" component={SwipeScreen} />
      <Stack.Screen name="Match" component={MatchScreen} />
      <Stack.Screen name="NoMatch" component={NoMatchScreen} />
    </Stack.Navigator>
  );
}
