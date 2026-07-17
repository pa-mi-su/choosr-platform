import type { DecisionItem, DecisionMode } from './domain';

export type RootStackParamList = {
  Home: undefined;
  ModeSelect: undefined;
  LocalSetup: { mode: DecisionMode };
  Waiting: { mode: DecisionMode; searchArea?: string };
  Join: undefined;
  Swipe: {
    sessionId: string;
    roundNumber: number;
    mode: DecisionMode;
    searchArea?: string;
  };
  Match: { sessionId: string; item: DecisionItem; searchArea?: string };
  NoMatch: { sessionId: string; mode: DecisionMode; searchArea?: string };
};
