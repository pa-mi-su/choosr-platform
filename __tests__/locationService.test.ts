import { parseLocationSuggestions } from '../src/services/locationService';

describe('location suggestions', () => {
  it('accepts a canonical city and ZIP result', () => {
    expect(
      parseLocationSuggestions({
        locations: [
          {
            id: 'orlando-32801',
            label: 'Orlando, FL 32801',
            city: 'Orlando',
            region: 'FL',
            postalCode: '32801',
            countryCode: 'US',
            latitude: 28.54,
            longitude: -81.38,
          },
        ],
      }),
    ).toHaveLength(1);
  });

  it('drops malformed or unsupported results', () => {
    expect(
      parseLocationSuggestions({
        locations: [
          { id: 'bad', countryCode: 'GB', latitude: 1, longitude: 2 },
          null,
        ],
      }),
    ).toEqual([]);
  });
});
