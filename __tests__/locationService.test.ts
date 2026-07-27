import {
  locationQueryHint,
  parseLocationSuggestions,
} from '../src/services/locationService';

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

  it('waits for a complete numeric ZIP before searching', () => {
    expect(locationQueryHint('328')).toBe(
      'Enter all 5 digits of the ZIP code.',
    );
    expect(locationQueryHint('32801')).toBeNull();
    expect(locationQueryHint('Or')).toBe('Enter at least 3 characters.');
    expect(locationQueryHint('Orlando')).toBeNull();
  });
});
