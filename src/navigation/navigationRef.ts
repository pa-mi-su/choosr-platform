import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from '../types/navigation';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let circleNavigationPending = false;

export function openCircleFromNotification(): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Circle');
  } else {
    circleNavigationPending = true;
  }
}

export function flushPendingNotificationNavigation(): void {
  if (circleNavigationPending && navigationRef.isReady()) {
    circleNavigationPending = false;
    navigationRef.navigate('Circle');
  }
}
