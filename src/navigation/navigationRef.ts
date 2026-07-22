import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from '../types/navigation';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let notificationNavigationPending = false;

export function openCircleFromNotification(): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Notifications');
  } else {
    notificationNavigationPending = true;
  }
}

export function flushPendingNotificationNavigation(): void {
  if (notificationNavigationPending && navigationRef.isReady()) {
    notificationNavigationPending = false;
    navigationRef.navigate('Notifications');
  }
}
