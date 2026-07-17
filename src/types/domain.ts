export type SwipeDirection = 'left' | 'right';

export type Movie = {
  id: string;
  title: string;
  year: number;
  rating: number;
  runtime: string;
  genres: string[];
  overview: string;
  background: string;
  accent: string;
  providers: string[];
};
