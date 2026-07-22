const mockUpload = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockRemove = jest.fn();
const mockEnsureAnonymousSession = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
        remove: mockRemove,
      })),
    },
  },
}));
jest.mock('../src/services/anonymousAuth', () => ({
  ensureAnonymousSession: () => mockEnsureAnonymousSession(),
}));

import { buildCustomDecisionDeck } from '../src/services/customDecisionService';

const photo = (label: string, uri: string) => ({
  uri,
  width: 100,
  height: 100,
  type: 'image/jpeg',
  fileSize: 4,
  base64: '/9j/2Q==',
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
  contentType: 'image/jpeg' as const,
  extension: 'jpg' as const,
  label,
});

describe('buildCustomDecisionDeck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAnonymousSession.mockResolvedValue({
      user: { id: '10000000-0000-0000-0000-000000000001' },
    });
    mockUpload.mockResolvedValue({ error: null });
    mockCreateSignedUrl
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://example.com/one.jpg' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://example.com/two.jpg' },
        error: null,
      });
  });

  it('requires at least two labeled photos', async () => {
    await expect(
      buildCustomDecisionDeck({
        prompt: 'Pick my guitar',
        photos: [photo('', 'file://one.jpg'), photo('Blue', 'file://two.jpg')],
      }),
    ).rejects.toThrow('custom_decision_invalid');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('uploads every photo and uses its label as the card title', async () => {
    const deck = await buildCustomDecisionDeck({
      prompt: ' Pick my guitar ',
      photos: [
        photo(' Acoustic ', 'file://one.jpg'),
        photo('Electric', 'file://two.jpg'),
      ],
    });

    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(deck).toHaveLength(2);
    expect(deck.map(item => item.title)).toEqual(['Acoustic', 'Electric']);
    expect(deck.map(item => item.description)).toEqual([
      'Pick my guitar',
      'Pick my guitar',
    ]);
    expect(deck.map(item => item.imageUrl)).toEqual([
      'https://example.com/one.jpg',
      'https://example.com/two.jpg',
    ]);
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
