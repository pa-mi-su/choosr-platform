import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import {
  subscribeToRoom,
  touchRoomPresence,
  unsubscribeFromRoom,
  type RoomSubscriptionTable,
} from '../services/sessionService';

const ROOM_POLL_INTERVAL_MS = 15_000;
const PRESENCE_INTERVAL_MS = 60_000;

type RoomSyncOptions = {
  sessionId?: string;
  tables: readonly RoomSubscriptionTable[];
  refresh: () => Promise<void>;
  maintainPresence?: boolean;
};

/**
 * Keeps one room screen synchronized without spending network traffic while the
 * app is backgrounded. Realtime is primary; polling is a slow recovery path for
 * missed socket events.
 */
export function useRoomSync({
  sessionId,
  tables,
  refresh,
  maintainPresence = false,
}: RoomSyncOptions): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const tableKey = [...tables].sort().join(',');

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let active = AppState.currentState === 'active';
    const refreshWhenActive = () => {
      if (active) {
        refreshRef.current().catch(() => undefined);
      }
    };
    const touchWhenActive = () => {
      if (active && maintainPresence) {
        touchRoomPresence(sessionId).catch(() => undefined);
      }
    };

    const channel = subscribeToRoom(sessionId, tables, refreshWhenActive);
    refreshWhenActive();
    touchWhenActive();

    const pollTimer = setInterval(refreshWhenActive, ROOM_POLL_INTERVAL_MS);
    const presenceTimer = maintainPresence
      ? setInterval(touchWhenActive, PRESENCE_INTERVAL_MS)
      : undefined;
    const appStateSubscription = AppState.addEventListener('change', state => {
      const wasActive = active;
      active = state === 'active';
      if (active && !wasActive) {
        refreshWhenActive();
        touchWhenActive();
      }
    });

    return () => {
      clearInterval(pollTimer);
      if (presenceTimer) {
        clearInterval(presenceTimer);
      }
      appStateSubscription.remove();
      unsubscribeFromRoom(channel).catch(() => undefined);
    };
    // A stable table signature prevents caller array identity from reconnecting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maintainPresence, sessionId, tableKey]);
}
