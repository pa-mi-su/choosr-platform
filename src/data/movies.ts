import type { Movie } from '../types/domain';

export const movies: Movie[] = [
  {
    id: 'past-lives',
    title: 'Past Lives',
    year: 2023,
    rating: 7.8,
    runtime: '1h 46m',
    genres: ['Drama', 'Romance'],
    overview:
      'Two childhood friends reunite for one fateful week, confronting destiny, love, and the choices that shape a life.',
    background: '#20344A',
    accent: '#F0B7A4',
    providers: ['Paramount+', 'Showtime'],
  },
  {
    id: 'arrival',
    title: 'Arrival',
    year: 2016,
    rating: 7.9,
    runtime: '1h 56m',
    genres: ['Sci-Fi', 'Drama'],
    overview:
      'A linguist works to communicate with mysterious visitors and discovers language can transform our experience of time.',
    background: '#39464C',
    accent: '#E9D9BE',
    providers: ['Prime Video'],
  },
  {
    id: 'grand-budapest',
    title: 'The Grand Budapest Hotel',
    year: 2014,
    rating: 8.1,
    runtime: '1h 40m',
    genres: ['Comedy', 'Adventure'],
    overview:
      'A legendary concierge and his trusted lobby boy become swept into a caper involving a priceless painting.',
    background: '#A84963',
    accent: '#F4C9B8',
    providers: ['Hulu'],
  },
  {
    id: 'spiderverse',
    title: 'Into the Spider-Verse',
    year: 2018,
    rating: 8.4,
    runtime: '1h 57m',
    genres: ['Animation', 'Action'],
    overview:
      'A Brooklyn teenager meets heroes from other dimensions who teach him what it takes to wear the mask.',
    background: '#422B61',
    accent: '#EF4B65',
    providers: ['Netflix'],
  },
  {
    id: 'knives-out',
    title: 'Knives Out',
    year: 2019,
    rating: 7.9,
    runtime: '2h 11m',
    genres: ['Mystery', 'Comedy'],
    overview:
      'A detective investigates a novelist’s death, navigating a household full of secrets and suspicious relatives.',
    background: '#173F42',
    accent: '#D6A85F',
    providers: ['Prime Video'],
  },
];

export const simulatedPartnerLikes = new Set([
  'past-lives',
  'arrival',
  'spiderverse',
]);
