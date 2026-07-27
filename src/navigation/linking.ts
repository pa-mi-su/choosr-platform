import type { LinkingOptions } from '@react-navigation/native';

import { roomLinkingPrefixes } from '../services/roomInvite';
import type { RootStackParamList } from '../types/navigation';

export const appLinkingConfig: NonNullable<
  LinkingOptions<RootStackParamList>['config']
> = {
  screens: {
    Join: 'join/:inviteToken',
    Circle: 'connect/:connectionToken',
    ChatLinkJoin: 'chat',
  },
};

export const appLinking: LinkingOptions<RootStackParamList> = {
  prefixes: roomLinkingPrefixes,
  config: appLinkingConfig,
};
