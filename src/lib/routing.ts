import { CrimePoint } from './crime';

// Local OSRM server — make sure Docker is running with the SafeStep profile
const OSRM_BASE = 'http://10.230.112.117:5000';

// How close a crime point must be to the route to trigger a detour (degrees, ~80m)
const CRIME_PROXIMITY_DEG = 0.0008;
// Max detour waypoints to inject (too many slows OSRM)
const MAX_DETOUR_WAYPOINTS = 3;

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coordinates: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
}

function osrmCoord(c: Coordinate) {
  return `${c.longitude},${c.latitude}`;
}

/** Check if a crime point is within proximity of any segment of the route */
function crimeNearRoute(crime: CrimePoint, route: Coordinate[]): boolean {
  for (const pt of route) {
    const dlat = pt.latitude - crime.lat;
    const dlng = pt.longitude - crime.lng;
    if (Math.sqrt(dlat * dlat + dlng * dlng) < CRIME_PROXIMITY_DEG) return true;
  }
  return false;
}

/** Generate a perpendicular offset waypoint to steer around a crime cluster */
function detourWaypoint(crime: CrimePoint, origin: Coordinate, dest: Coordinate): Coordinate {
  // Perpendicular offset: push 0.001 deg (~100m) away from the direct line
  const dx = dest.latitude - origin.latitude;
  const dy = dest.longitude - origin.longitude;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector
  const px = -dy / len;
  const py = dx / len;
  return {
    latitude: crime.lat + px * 0.001,
    longitude: crime.lng + py * 0.001,
  };
}

async function osrmRoute(waypoints: Coordinate[]): Promise<RouteResult> {
  const coords = waypoints.map(osrmCoord).join(';');
  const url = `${OSRM_BASE}/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM error: ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(`OSRM: ${data.message ?? data.code}`);
  const route = data.routes[0];
  return {
    coordinates: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ latitude: lat, longitude: lng })),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}

export async function fetchSafeRoute(
  origin: Coordinate,
  destination: Coordinate,
  crimePoints: CrimePoint[] = []
): Promise<RouteResult> {
  // Step 1: get initial route
  const initial = await osrmRoute([origin, destination]);

  if (crimePoints.length === 0) return initial;

  // Step 2: find crime points near the route
  const nearby = crimePoints.filter((c) => crimeNearRoute(c, initial.coordinates));
  if (nearby.length === 0) return initial;

  // Step 3: pick the worst hotspots and inject detour waypoints
  const detours = nearby
    .slice(0, MAX_DETOUR_WAYPOINTS)
    .map((c) => detourWaypoint(c, origin, destination));

  // Step 4: re-route with detour waypoints inserted between origin and dest
  try {
    return await osrmRoute([origin, ...detours, destination]);
  } catch {
    // Fall back to original route if detour fails
    return initial;
  }
}
