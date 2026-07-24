import { getStateFromPath } from '@react-navigation/native';

import { encodePrivateChatLink } from '../src/chat/domain/invitation';
import { appLinkingConfig } from '../src/navigation/linking';

describe('native private-chat deep links', () => {
  const token = 'a'.repeat(64);
  const creatorPublicKey = `${'A'.repeat(43)}=`;
  const url = encodePrivateChatLink({ token, creatorPublicKey });

  test('React Navigation routes the shared invitation to ChatLinkJoin with intact proof', () => {
    const path = url.replace(/^choosr:\/\//, '');
    const state = getStateFromPath(path, appLinkingConfig);
    const route = state?.routes[0];

    expect(route?.name).toBe('ChatLinkJoin');
    expect(route?.params).toEqual({
      v: '1',
      t: token,
      k: creatorPublicKey,
    });
  });
});
