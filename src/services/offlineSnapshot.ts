import AsyncStorage from '@react-native-async-storage/async-storage';

type StoredSnapshot<T> = {
  version: 1;
  savedAt: string;
  value: T;
};

export async function readOfflineSnapshot<T>(
  key: string,
  maxAgeMilliseconds: number,
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as Partial<StoredSnapshot<T>>;
    const savedAt = Date.parse(snapshot.savedAt ?? '');
    if (
      snapshot.version !== 1 ||
      snapshot.value === undefined ||
      !Number.isFinite(savedAt) ||
      Date.now() - savedAt > maxAgeMilliseconds
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return snapshot.value;
  } catch {
    return null;
  }
}

export async function writeOfflineSnapshot<T>(
  key: string,
  value: T,
): Promise<void> {
  const snapshot: StoredSnapshot<T> = {
    version: 1,
    savedAt: new Date().toISOString(),
    value,
  };
  try {
    await AsyncStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // A cache write must never make the live request fail.
  }
}
