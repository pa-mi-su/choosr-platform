import type { DecisionItem, DecisionMode } from './domain';

export type RootStackParamList = {
  Home: undefined;
  ChooseHome: undefined;
  ChatHome: undefined;
  ChatInvite: undefined;
  ChatScan: undefined;
  ChatRoom: undefined;
  About: undefined;
  Notifications: undefined;
  ActiveRooms: undefined;
  Circle: { connectionToken?: string } | undefined;
  ModeSelect: { connectionId?: string; connectionName?: string } | undefined;
  LocalSetup: {
    mode: DecisionMode;
    connectionId?: string;
    connectionName?: string;
    sessionId?: string;
    roundNumber?: number;
  };
  CustomSetup: {
    mode: 'custom';
    connectionId?: string;
    connectionName?: string;
  };
  Waiting: {
    mode: DecisionMode;
    searchArea?: string;
    searchLatitude?: number;
    searchLongitude?: number;
    connectionId?: string;
    connectionName?: string;
    customPrompt?: string;
    customItems?: DecisionItem[];
  };
  Join: { inviteToken?: string } | undefined;
  Swipe: {
    sessionId: string;
    roundNumber: number;
    mode: DecisionMode;
    searchArea?: string;
  };
  RankChoices: {
    sessionId: string;
    roundNumber: number;
    mode: DecisionMode;
    searchArea?: string;
  };
  Match: { sessionId: string; item: DecisionItem; searchArea?: string };
  NoMatch: { sessionId: string; mode: DecisionMode; searchArea?: string };
};
