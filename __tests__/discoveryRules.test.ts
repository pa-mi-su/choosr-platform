import {
  distanceMiles,
  participantLocationsAreCloseEnough,
} from '../supabase/functions/build-deck/geo';
import { isEligibleActivityPlace } from '../supabase/functions/build-deck/providers/activityTypes';

describe('shared discovery rules', () => {
  it('accepts concrete activities and rejects hotels or broad businesses', () => {
    expect(
      isEligibleActivityPlace({
        primaryType: 'bowling_alley',
        types: ['bowling_alley', 'point_of_interest'],
      }),
    ).toBe(true);
    expect(
      isEligibleActivityPlace({
        primaryType: 'hotel',
        types: ['hotel', 'lodging'],
      }),
    ).toBe(false);
    expect(
      isEligibleActivityPlace({
        primaryType: 'bowling_alley',
        types: ['bowling_alley', 'resort_hotel'],
      }),
    ).toBe(false);
    expect(
      isEligibleActivityPlace({
        primaryType: 'sports_activity_location',
        types: ['sports_activity_location'],
      }),
    ).toBe(false);
  });

  it('permits nearby participants and rejects impractical distances', () => {
    const orlando = { latitude: 28.5383, longitude: -81.3792 };
    const kissimmee = { latitude: 28.2919, longitude: -81.4076 };
    const tampa = { latitude: 27.9506, longitude: -82.4572 };

    expect(distanceMiles(orlando, kissimmee)).toBeLessThan(60);
    expect(participantLocationsAreCloseEnough([orlando, kissimmee])).toBe(true);
    expect(distanceMiles(orlando, tampa)).toBeGreaterThan(60);
    expect(participantLocationsAreCloseEnough([orlando, tampa])).toBe(false);
  });
});
