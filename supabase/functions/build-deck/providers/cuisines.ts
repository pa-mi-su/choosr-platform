export const cuisineGoogleTypes = {
  all: ['restaurant'],
  american: [
    'american_restaurant',
    'cajun_restaurant',
    'californian_restaurant',
    'soul_food_restaurant',
    'southwestern_us_restaurant',
    'steak_house',
  ],
  mexican: [
    'mexican_restaurant',
    'taco_restaurant',
    'burrito_restaurant',
    'tex_mex_restaurant',
  ],
  italian: ['italian_restaurant'],
  chinese: [
    'chinese_restaurant',
    'cantonese_restaurant',
    'dim_sum_restaurant',
    'chinese_noodle_restaurant',
    'dumpling_restaurant',
    'hot_pot_restaurant',
    'taiwanese_restaurant',
  ],
  japanese: [
    'japanese_restaurant',
    'japanese_izakaya_restaurant',
    'japanese_curry_restaurant',
    'ramen_restaurant',
    'sushi_restaurant',
    'tonkatsu_restaurant',
    'yakiniku_restaurant',
    'yakitori_restaurant',
  ],
  indian: [
    'indian_restaurant',
    'north_indian_restaurant',
    'south_indian_restaurant',
  ],
  thai: ['thai_restaurant'],
  mediterranean: [
    'mediterranean_restaurant',
    'greek_restaurant',
    'gyro_restaurant',
    'israeli_restaurant',
    'lebanese_restaurant',
    'middle_eastern_restaurant',
    'moroccan_restaurant',
    'turkish_restaurant',
  ],
  seafood: [
    'seafood_restaurant',
    'fish_and_chips_restaurant',
    'oyster_bar_restaurant',
  ],
  pizza: ['pizza_restaurant'],
  burgers: ['hamburger_restaurant'],
  breakfast: [
    'breakfast_restaurant',
    'brunch_restaurant',
    'diner',
    'bagel_shop',
  ],
  sushi: ['sushi_restaurant'],
  barbecue: [
    'barbecue_restaurant',
    'korean_barbecue_restaurant',
    'mongolian_barbecue_restaurant',
  ],
  vegetarian: ['vegetarian_restaurant', 'vegan_restaurant'],
} as const;

export type CuisineFilter = keyof typeof cuisineGoogleTypes;

export function isCuisineFilter(value: unknown): value is CuisineFilter {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(cuisineGoogleTypes, value)
  );
}

export function googleTypesForCuisine(
  cuisine: CuisineFilter | undefined,
): readonly string[] {
  return cuisineGoogleTypes[cuisine ?? 'all'];
}
