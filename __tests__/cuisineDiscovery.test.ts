import { cuisineOptions } from '../src/data/cuisines';
import {
  cuisineGoogleTypes,
  googleTypesForCuisine,
} from '../supabase/functions/build-deck/providers/cuisines';
import {
  googleFoodTypeRestriction,
  matchesGoogleCuisine,
} from '../supabase/functions/build-deck/providers/googleCuisineFilter';
import { variedQualitySelection } from '../supabase/functions/build-deck/providers/variedSelection';

describe('food cuisine discovery', () => {
  test('keeps the mobile menu and server taxonomy aligned', () => {
    expect(cuisineOptions.map(option => option.id)).toEqual(
      Object.keys(cuisineGoogleTypes),
    );
    expect(googleTypesForCuisine('mexican')).toEqual(
      expect.arrayContaining([
        'mexican_restaurant',
        'taco_restaurant',
        'tex_mex_restaurant',
      ]),
    );
  });

  test.each(cuisineOptions)(
    '$label sends its exact Google type restriction and rejects unrelated results',
    option => {
      const types = googleTypesForCuisine(option.id);
      expect(types.length).toBeGreaterThan(0);
      expect(new Set(types).size).toBe(types.length);
      expect(googleFoodTypeRestriction(option.id)).toEqual({
        includedTypes: [...types],
      });
      expect(
        matchesGoogleCuisine(
          { primaryType: types[0], types: [types[0]] },
          option.id,
        ),
      ).toBe(true);
      expect(
        matchesGoogleCuisine(
          {
            primaryType: 'library',
            types: ['library', 'point_of_interest'],
          },
          option.id,
        ),
      ).toBe(false);
    },
  );

  test('accepts a cuisine match from secondary Google types', () => {
    expect(
      matchesGoogleCuisine(
        {
          primaryType: 'restaurant',
          types: ['restaurant', 'thai_restaurant'],
        },
        'thai',
      ),
    ).toBe(true);
  });

  test('rotates the actual quality candidates, not only their card order', () => {
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      id: `place-${index + 1}`,
      primaryType: `type-${index + 1}`,
    }));

    const firstSelection = variedQualitySelection(candidates, 5, () => 0);
    const alternateSelection = variedQualitySelection(
      candidates,
      5,
      () => 0.999999,
    );

    expect(firstSelection.map(place => place.id)).not.toEqual(
      alternateSelection.map(place => place.id),
    );
    expect(new Set(alternateSelection.map(place => place.id)).size).toBe(5);
    expect(
      alternateSelection.every(place => Number(place.id.split('-')[1]) <= 15),
    ).toBe(true);
  });
});
