import type { DecisionItem, DecisionMode } from './domain';

export type RootStackParamList = {
  Home: undefined;
  ModeSelect: undefined;
  LocalSetup: { mode: DecisionMode };
  Waiting: { mode: DecisionMode; searchArea?: string };
  Join: undefined;
  Swipe: { mode: DecisionMode; searchArea?: string };
  Match: { item: DecisionItem; searchArea?: string };
  NoMatch: { mode: DecisionMode; searchArea?: string };
};
