import type { Movie } from './domain';

export type RootStackParamList = {
  Home: undefined;
  Waiting: undefined;
  Join: undefined;
  Swipe: undefined;
  Match: { movie: Movie };
  NoMatch: undefined;
};
