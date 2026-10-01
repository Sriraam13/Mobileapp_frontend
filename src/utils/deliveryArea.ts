export const MUGALIVAKKAM_LOCATION = {
  latitude: 13.0223,
  longitude: 80.2229,
};

export const DELIVERY_RADIUS_KM = 15;

export function getDistanceInKm(
  latitude: number,
  longitude: number,
  origin = MUGALIVAKKAM_LOCATION,
): number {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(latitude - origin.latitude);
  const longitudeDelta = toRadians(longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const targetLatitude = toRadians(latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 * Math.cos(originLatitude) * Math.cos(targetLatitude);

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

export function isWithinDeliveryArea(latitude?: number, longitude?: number): boolean {
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false;
  }
  return getDistanceInKm(latitude, longitude) <= DELIVERY_RADIUS_KM;
}
