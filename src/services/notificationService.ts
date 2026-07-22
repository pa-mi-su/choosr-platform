import notifee from '@notifee/react-native';
import {
  AppState,
  DeviceEventEmitter,
  type EmitterSubscription,
} from 'react-native';

import { supabase } from '../lib/supabase';
import { ensureAnonymousSession } from './anonymousAuth';

const NOTIFICATION_STATE_CHANGED = 'choosr.notification-state-changed';

export function notifyNotificationStateChanged(): void {
  DeviceEventEmitter.emit(NOTIFICATION_STATE_CHANGED);
}

export function subscribeToNotificationState(
  listener: () => void,
): EmitterSubscription {
  return DeviceEventEmitter.addListener(NOTIFICATION_STATE_CHANGED, listener);
}

export type ChoosrNotification = {
  id: number;
  kind: 'connection_request' | 'room_invitation';
  title: string;
  body: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

export async function loadNotifications(): Promise<ChoosrNotification[]> {
  await ensureAnonymousSession();
  const { data, error } = await supabase
    .from('user_notifications')
    .select('id, kind, title, body, payload, created_at, read_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data.map(item => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    payload: item.payload as Record<string, unknown>,
    createdAt: item.created_at,
    readAt: item.read_at,
  }));
}

export async function loadUnreadNotificationCount(): Promise<number> {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc('unread_notification_count');
  if (error) throw error;
  await notifee.setBadgeCount(data).catch(() => undefined);
  return data;
}

export async function refreshNotificationState(): Promise<number> {
  const count = await loadUnreadNotificationCount();
  notifyNotificationStateChanged();
  return count;
}

export function registerNotificationSynchronization(): () => void {
  let active = true;
  let removeChannel: (() => void) | undefined;
  const refresh = () => {
    refreshNotificationState().catch(() => undefined);
  };

  ensureAnonymousSession()
    .then(session => {
      if (!active) return;
      const channel = supabase
        .channel(`notification-inbox:${session.user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_notifications',
            filter: `recipient_user_id=eq.${session.user.id}`,
          },
          refresh,
        )
        .subscribe();
      removeChannel = () => {
        supabase.removeChannel(channel).catch(() => undefined);
      };
      refresh();
    })
    .catch(() => undefined);

  const appState = AppState.addEventListener('change', state => {
    if (state === 'active') refresh();
  });
  refresh();

  return () => {
    active = false;
    appState.remove();
    removeChannel?.();
  };
}

export async function markNotificationsRead(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await ensureAnonymousSession();
  const { error } = await supabase.rpc('mark_notifications_read', {
    p_notification_ids: ids,
  });
  if (error) throw error;
  await loadUnreadNotificationCount();
  notifyNotificationStateChanged();
}

export async function deleteNotifications(ids?: number[]): Promise<void> {
  await ensureAnonymousSession();
  const { error } = await supabase.rpc('delete_notifications', {
    p_notification_ids: ids ?? null,
  });
  if (error) throw error;
  await loadUnreadNotificationCount();
  notifyNotificationStateChanged();
}

export async function markAllNotificationsRead(): Promise<void> {
  await ensureAnonymousSession();
  const { error } = await supabase.rpc('mark_notifications_read', {
    p_notification_ids: null,
  });
  if (error) throw error;
  await loadUnreadNotificationCount();
  notifyNotificationStateChanged();
}
