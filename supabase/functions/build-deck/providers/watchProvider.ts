import { colorsFor } from '../presentation.ts';
import { fetchWithTimeout } from '../http.ts';
import type { ProviderItem } from '../types.ts';

type TmdbMovie = {
  id?: number;
  title?: string;
  release_date?: string;
  vote_average?: number;
  overview?: string;
};

type TmdbResponse = { results?: TmdbMovie[] };

const hasIdentity = (
  movie: TmdbMovie,
): movie is TmdbMovie & { id: number; title: string } =>
  movie.id !== undefined && typeof movie.title === 'string' && !!movie.title;

export async function buildWatchDeck(region: string): Promise<ProviderItem[]> {
  const token = Deno.env.get('TMDB_API_READ_TOKEN');
  if (!token) {
    throw new Error('TMDB_API_READ_TOKEN is not configured.');
  }
  const url = new URL('https://api.themoviedb.org/3/discover/movie');
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('include_video', 'false');
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('region', region);
  url.searchParams.set('sort_by', 'popularity.desc');
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`TMDB request failed with ${response.status}.`);
  }
  const payload = (await response.json()) as TmdbResponse;
  return (payload.results ?? [])
    .filter(hasIdentity)
    .slice(0, 20)
    .map((movie, index) => {
      const [background, accent] = colorsFor(index);
      return {
        id: `tmdb:${movie.id}`,
        mode: 'watch',
        title: movie.title,
        kicker: 'A FILM TOGETHER',
        meta: `${movie.release_date?.slice(0, 4) || 'Movie'} · ★ ${Number(
          movie.vote_average ?? 0,
        ).toFixed(1)}`,
        description: movie.overview || 'Discover this movie together.',
        background,
        accent,
        tags: ['Movie', 'TMDB'],
      };
    });
}
