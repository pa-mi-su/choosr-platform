export const ACTIVITY_PRIMARY_TYPES = [
  'adventure_sports_center',
  'amusement_center',
  'amusement_park',
  'aquarium',
  'art_gallery',
  'botanical_garden',
  'bowling_alley',
  'comedy_club',
  'concert_hall',
  'go_karting_venue',
  'hiking_area',
  'ice_skating_rink',
  'indoor_playground',
  'live_music_venue',
  'miniature_golf_course',
  'movie_theater',
  'museum',
  'observation_deck',
  'paintball_center',
  'performing_arts_theater',
  'planetarium',
  'video_arcade',
  'water_park',
  'wildlife_park',
  'zoo',
] as const;

export const EXCLUDED_ACTIVITY_TYPES = [
  'association_or_organization',
  'bed_and_breakfast',
  'campground',
  'camping_cabin',
  'corporate_office',
  'cottage',
  'extended_stay_hotel',
  'guest_house',
  'hotel',
  'lodging',
  'motel',
  'private_guest_room',
  'resort_hotel',
  'rv_park',
] as const;

const allowedActivityTypes = new Set<string>(ACTIVITY_PRIMARY_TYPES);
const excludedActivityTypes = new Set<string>(EXCLUDED_ACTIVITY_TYPES);

export function isEligibleActivityPlace(place: {
  primaryType?: string;
  types?: string[];
}): boolean {
  return (
    typeof place.primaryType === 'string' &&
    allowedActivityTypes.has(place.primaryType) &&
    !(place.types ?? []).some(type => excludedActivityTypes.has(type))
  );
}
