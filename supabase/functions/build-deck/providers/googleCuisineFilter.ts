import { googleTypesForCuisine, type CuisineFilter } from './cuisines.ts';

type GoogleTypedPlace = {
  primaryType?: string;
  types?: string[];
};

export function googleFoodTypeRestriction(cuisine: CuisineFilter | undefined): {
  includedTypes: string[];
} {
  return { includedTypes: [...googleTypesForCuisine(cuisine)] };
}

export function matchesGoogleCuisine(
  place: GoogleTypedPlace,
  cuisine: CuisineFilter | undefined,
): boolean {
  const acceptedTypes = new Set(googleTypesForCuisine(cuisine));
  return (
    (typeof place.primaryType === 'string' &&
      acceptedTypes.has(place.primaryType)) ||
    (place.types?.some(type => acceptedTypes.has(type)) ?? false)
  );
}
