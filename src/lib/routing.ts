// Local OSRM server — make sure Docker is running with the SafeStep profile
const OSRM_BASE = 'http://10.230.112.117:5000';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coordinates: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
}

// Crime avoidance stub — wire in data.police.uk polygons here later
// OSRM doesn't support avoid_polygons natively; implement via waypoint detours or switch to Valhalla for this feature
export async function fetchSafeRoute(
  origin: Coordinate,
  destination: Coordinate
): Promise<RouteResult> {
  const url =
    `${OSRM_BASE}/route/v1/foot/` +
    `${origin.longitude},${origin.latitude};` +
    `${destination.longitude},${destination.latitude}` +
    `?overview=full&geometries=geojson&steps=false`;

  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `OSRM error: ${res.status}`);
  }

  const data = await res.json();

  if (data.code !== 'Ok') {
    throw new Error(`OSRM: ${data.message ?? data.code}`);
  }

  const route = data.routes[0];
  const coords: Coordinate[] = route.geometry.coordinates.map(
    ([lng, lat]: [number, number]) => ({ latitude: lat, longitude: lng })
  );

  return {
    coordinates: coords,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}
