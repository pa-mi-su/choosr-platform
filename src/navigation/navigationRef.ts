import { createNavigationContainerRef } from '@react-navigation/native';
import type { RemoteMessage } from '@react-native-firebase/messaging';

import type { RootStackParamList } from '../types/navigation';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type NotificationDestination = 'ActiveRooms' | 'Circle' | 'ChatHome';

let notificationNavigationPending: NotificationDestination | undefined;

export function openFromNotification(message: RemoteMessage): void {
  const route: NotificationDestination =
    message.data?.kind === 'room_invitation' ||
    message.data?.route === 'ActiveRooms'
      ? 'ActiveRooms'
      : message.data?.kind === 'chat_message' ||
        message.data?.route === 'ChatHome'
      ? 'ChatHome'
      : 'Circle';
  if (navigationRef.isReady()) {
    navigationRef.navigate(route);
  } else {
    notificationNavigationPending = route;
  }
}

export function flushPendingNotificationNavigation(): void {
  if (notificationNavigationPending && navigationRef.isReady()) {
    const route = notificationNavigationPending;
    notificationNavigationPending = undefined;
    navigationRef.navigate(route);
  }
}
