import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';
import { HomeScreen } from '../screens/HomeScreen';
import { ChoosrHomeScreen } from '../screens/ChoosrHomeScreen';
import { ChatHomeScreen } from '../screens/ChatHomeScreen';
import { ChatInviteScreen } from '../screens/ChatInviteScreen';
import { ChatScanScreen } from '../screens/ChatScanScreen';
import { ChatLinkJoinScreen } from '../screens/ChatLinkJoinScreen';
import { ChatRoomScreen } from '../screens/ChatRoomScreen';
import { ModeSelectScreen } from '../screens/ModeSelectScreen';
import { LocalSetupScreen } from '../screens/LocalSetupScreen';
import { WaitingScreen } from '../screens/WaitingScreen';
import { JoinScreen } from '../screens/JoinScreen';
import { SwipeScreen } from '../screens/SwipeScreen';
import { RankChoicesScreen } from '../screens/RankChoicesScreen';
import { MatchScreen } from '../screens/MatchScreen';
import { NoMatchScreen } from '../screens/NoMatchScreen';
import { CircleScreen } from '../screens/CircleScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { CustomSetupScreen } from '../screens/CustomSetupScreen';
import { ActiveRoomsScreen } from '../screens/ActiveRoomsScreen';
import { AboutScreen } from '../screens/AboutScreen';

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
      <Stack.Screen name="Home" component={ChoosrHomeScreen} />
      <Stack.Screen name="ChooseHome" component={HomeScreen} />
      <Stack.Screen name="ChatHome" component={ChatHomeScreen} />
      <Stack.Screen
        name="ChatInvite"
        component={ChatInviteScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="ChatScan" component={ChatScanScreen} />
      <Stack.Screen
        name="ChatLinkJoin"
        component={ChatLinkJoinScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="ChatRoom"
        component={ChatRoomScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ActiveRooms" component={ActiveRoomsScreen} />
      <Stack.Screen name="Circle" component={CircleScreen} />
      <Stack.Screen name="ModeSelect" component={ModeSelectScreen} />
      <Stack.Screen
        name="LocalSetup"
        component={LocalSetupScreen}
        options={({ route }) => ({
          gestureEnabled: !route.params.sessionId,
        })}
      />
      <Stack.Screen name="CustomSetup" component={CustomSetupScreen} />
      <Stack.Screen name="Waiting" component={WaitingScreen} />
      <Stack.Screen name="Join" component={JoinScreen} />
      <Stack.Screen
        name="Swipe"
        component={SwipeScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="RankChoices"
        component={RankChoicesScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="Match" component={MatchScreen} />
      <Stack.Screen name="NoMatch" component={NoMatchScreen} />
    </Stack.Navigator>
  );
}
