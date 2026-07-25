const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockRemoveItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
  removeItem: (...args: unknown[]) => mockRemoveItem(...args),
}));

import {
  readOfflineSnapshot,
  writeOfflineSnapshot,
} from '../src/services/offlineSnapshot';

describe('offline snapshots', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a valid saved snapshot', async () => {
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        value: { rooms: 2 },
      }),
    );
    await expect(readOfflineSnapshot('rooms', 1_000)).resolves.toEqual({
      rooms: 2,
    });
  });

  it('drops expired snapshots', async () => {
    mockGetItem.mockResolvedValue(
      JSON.stringify({
        version: 1,
        savedAt: '2020-01-01T00:00:00.000Z',
        value: { rooms: 2 },
      }),
    );
    await expect(readOfflineSnapshot('rooms', 1_000)).resolves.toBeNull();
    expect(mockRemoveItem).toHaveBeenCalledWith('rooms');
  });

  it('does not fail the caller when storage is unavailable', async () => {
    mockSetItem.mockRejectedValue(new Error('storage unavailable'));
    await expect(writeOfflineSnapshot('rooms', [])).resolves.toBeUndefined();
  });
});
