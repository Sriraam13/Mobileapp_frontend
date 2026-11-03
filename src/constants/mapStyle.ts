/**
 * High-Visibility, crisp Light Theme map style for Google Maps.
 * Ensures roads, street names, landmarks, highways, and water bodies
 * are sharply visible and contrasted with distinct borders.
 */
export const LIGHT_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f8f9fa" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#1f2937" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 3 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f1f5f9" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dcfce7" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#15803d" }] },
  // Local & Arterial Roads with distinct outlines and bright fills
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }, { weight: 1 }] },
  { featureType: "road.local", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.local", elementType: "geometry.stroke", stylers: [{ color: "#e2e8f0" }, { weight: 1 }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#334155" }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ color: "#94a3b8" }, { weight: 1.5 }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#1e293b" }] },
  // Highways with prominent warm yellow/orange styling
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#fde047" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#eab308" }, { weight: 2 }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#0f172a" }] },
  // Transit & Water
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "transit.station", elementType: "geometry", stylers: [{ color: "#94a3b8" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#bae6fd" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#0284c7" }] }
];
