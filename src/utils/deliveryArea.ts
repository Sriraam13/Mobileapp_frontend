export const MUGALIVAKKAM_LOCATION = {
  latitude: 13.0210,
  longitude: 80.1614,
};

export const MGR_NAGAR_LOCATION = {
  latitude: 13.0350,
  longitude: 80.1970,
};

export const BANGLORE_LOCATION = {
  latitude: 12.8399,
  longitude: 77.6770,
};

export interface OutletLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export const KNOWN_OUTLET_LOCATIONS: Record<string | number, OutletLocation> = {
  1: { name: 'Data Udipi — Mugalivakkam', latitude: 13.0210, longitude: 80.1614 },
  2: { name: 'Data Udipi — MGR Nagar', latitude: 13.0350, longitude: 80.1970 },
  3: { name: 'Data Udipi - Banglore', latitude: 12.8399, longitude: 77.6770 },
  25: { name: 'Data Udipi - Banglore', latitude: 12.8399, longitude: 77.6770 },
  mugalivakkam: { name: 'Data Udipi — Mugalivakkam', latitude: 13.0210, longitude: 80.1614 },
  mgrnagar: { name: 'Data Udipi — MGR Nagar', latitude: 13.0350, longitude: 80.1970 },
  banglore: { name: 'Data Udipi - Banglore', latitude: 12.8399, longitude: 77.6770 },
};

export function resolveOutletLocation(outlet?: any): OutletLocation {
  if (outlet) {
    const lat = Number(outlet.lat ?? outlet.latitude);
    const lng = Number(outlet.lng ?? outlet.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return {
        name: outlet.name || 'Data Udipi',
        latitude: lat,
        longitude: lng,
      };
    }

    const restId = outlet.restaurant_id ?? outlet.id;
    if (restId != null && KNOWN_OUTLET_LOCATIONS[restId]) {
      return KNOWN_OUTLET_LOCATIONS[restId];
    }

    const nameLower = (outlet.name || '').toLowerCase();
    if (nameLower.includes('mgr')) return KNOWN_OUTLET_LOCATIONS['mgrnagar'];
    if (nameLower.includes('bang') || nameLower.includes('beng')) return KNOWN_OUTLET_LOCATIONS['banglore'];
    if (nameLower.includes('muga')) return KNOWN_OUTLET_LOCATIONS['mugalivakkam'];
  }
  return KNOWN_OUTLET_LOCATIONS[1];
}

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
