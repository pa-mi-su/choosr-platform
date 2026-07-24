import { createNavigationContainerRef } from '@react-navigation/native';
import type { RemoteMessage } from '@react-native-firebase/messaging';

import type { RootStackParamList } from '../types/navigation';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let notificationNavigationPending: 'Notifications' | 'ChatHome' | undefined;

export function openFromNotification(message: RemoteMessage): void {
  const route =
    message.data?.route === 'Chat'
      ? ('ChatHome' as const)
      : ('Notifications' as const);
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
