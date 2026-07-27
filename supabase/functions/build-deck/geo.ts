export type Coordinates = {
  latitude: number;
  longitude: number;
};

export const MAX_PARTICIPANT_DISTANCE_MILES = 60;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceMiles(from: Coordinates, to: Coordinates): number {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function midpoint(locations: Coordinates[]): Coordinates {
  if (locations.length < 2) return locations[0]!;
  const [left, right] = locations;
  const leftLatitude = radians(left.latitude);
  const leftLongitude = radians(left.longitude);
  const rightLatitude = radians(right.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const x = Math.cos(rightLatitude) * Math.cos(longitudeDelta);
  const y = Math.cos(rightLatitude) * Math.sin(longitudeDelta);
  const latitude = Math.atan2(
    Math.sin(leftLatitude) + Math.sin(rightLatitude),
    Math.sqrt((Math.cos(leftLatitude) + x) ** 2 + y ** 2),
  );
  const longitude = leftLongitude + Math.atan2(y, Math.cos(leftLatitude) + x);
  return {
    latitude: (latitude * 180) / Math.PI,
    longitude: (((longitude * 180) / Math.PI + 540) % 360) - 180,
  };
}

export function participantLocationsAreCloseEnough(
  locations: Coordinates[],
): boolean {
  return (
    locations.length < 2 ||
    distanceMiles(locations[0]!, locations[1]!) <=
      MAX_PARTICIPANT_DISTANCE_MILES
  );
}
