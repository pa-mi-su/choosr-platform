export const cuisineOptions = [
  { id: 'all', label: 'All' },
  { id: 'american', label: 'American' },
  { id: 'mexican', label: 'Mexican' },
  { id: 'italian', label: 'Italian' },
  { id: 'chinese', label: 'Chinese' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'indian', label: 'Indian' },
  { id: 'thai', label: 'Thai' },
  { id: 'mediterranean', label: 'Mediterranean' },
  { id: 'seafood', label: 'Seafood' },
  { id: 'pizza', label: 'Pizza' },
  { id: 'burgers', label: 'Burgers' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'sushi', label: 'Sushi' },
  { id: 'barbecue', label: 'Barbecue' },
  { id: 'vegetarian', label: 'Vegetarian' },
] as const;

export type CuisineFilter = (typeof cuisineOptions)[number]['id'];
