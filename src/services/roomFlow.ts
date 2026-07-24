import type { SessionStatus } from '../types/database';

const ROOM_CODE_PATTERN = /[^A-HJ-NP-Z2-9]/g;

export type RoomDestination =
  | 'waiting'
  | 'swiping'
  | 'matched'
  | 'no-match'
  | 'closed';

export async function loadItemsWithFallback<T>(
  loadItems: () => Promise<T[]>,
  fallbackItems: readonly T[],
): Promise<T[]> {
  try {
    const items = await loadItems();
    return items.length ? items : [...fallbackItems];
  } catch {
    return [...fallbackItems];
  }
}

export function getRoomDestination(
  status: SessionStatus,
  matchedItemId: string | null,
): RoomDestination {
  if (status === 'matched' && matchedItemId) {
    return 'matched';
  }
  if (status === 'completed') {
    return 'no-match';
  }
  if (status === 'active') {
    return 'swiping';
  }
  if (status === 'cancelled' || status === 'expired') {
    return 'closed';
  }
  return 'waiting';
}

export function findFirstUnswipedIndex(
  itemIds: readonly string[],
  swipedItemIds: ReadonlySet<string>,
): number {
  return itemIds.findIndex(itemId => !swipedItemIds.has(itemId));
}

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(ROOM_CODE_PATTERN, '').slice(0, 8);
}

export function roomErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : '';

  if (message.includes('room_not_found')) {
    return 'That room code was not found. Check the code and try again.';
  }
  if (message.includes('room_expired')) {
    return 'That room has expired. Ask your partner to create a new one.';
  }
  if (message.includes('room_full') || message.includes('room_unavailable')) {
    return 'That room is no longer available to join.';
  }
  if (message.includes('room_not_active')) {
    return 'The room is not ready yet. Wait for your partner to join.';
  }
  if (
    message.includes('close enough to meet') ||
    message.includes('participant_locations_too_far')
  ) {
    return 'Choosr is designed for people close enough to meet. Choose locations within 60 miles of each other.';
  }
  if (message.includes('Failed to fetch') || message.includes('Network')) {
    return 'Choosr could not reach the server. Check your connection and retry.';
  }
  return 'Something went wrong. Please try again.';
}
