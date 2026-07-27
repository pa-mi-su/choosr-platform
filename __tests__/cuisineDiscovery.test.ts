import { cuisineOptions } from '../src/data/cuisines';
import {
  cuisineGoogleTypes,
  googleTypesForCuisine,
} from '../supabase/functions/build-deck/providers/cuisines';
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
