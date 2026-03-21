<<<<<<< HEAD
import { CrimePoint } from './crime';

// Local OSRM server — make sure Docker is running with the SafeStep profile
const OSRM_BASE = 'http://10.230.112.117:5000';

// How close a crime point must be to the route to trigger a detour (degrees, ~80m)
const CRIME_PROXIMITY_DEG = 0.0008;
// Max detour waypoints to inject (too many slows OSRM)
const MAX_DETOUR_WAYPOINTS = 3;
=======
const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de/route';
>>>>>>> a74c0b5d9cdc6da358fa73bcb44874fafea5f001

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coordinates: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
}

<<<<<<< HEAD
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
=======
// Crime avoidance stub — replace with real data.police.uk polygons later
async function getCrimeAvoidPolygons(): Promise<{ type: string; coordinates: number[][][] }[]> {
  // TODO: fetch from data.police.uk, cluster incidents, buffer into polygons
  return [];
>>>>>>> a74c0b5d9cdc6da358fa73bcb44874fafea5f001
}

export async function fetchSafeRoute(
  origin: Coordinate,
<<<<<<< HEAD
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
=======
  destination: Coordinate
): Promise<RouteResult> {
  const avoidPolygons = await getCrimeAvoidPolygons();

  const body: any = {
    locations: [
      { lon: origin.longitude, lat: origin.latitude },
      { lon: destination.longitude, lat: destination.latitude },
    ],
    costing: 'pedestrian',
    costing_options: {
      pedestrian: {
        use_roads: 1.0,
        alley_factor: 50.0,
        walkway_factor: 1.0,
        sidewalk_factor: 0.5,
        step_penalty: 30,
        max_hiking_difficulty: 1,
        use_ferry: 0.0,
        ferry_cost: 9999,
        use_living_streets: 0.1,
        service_penalty: 50,
        service_factor: 0.1,
      },
    },
    ...(avoidPolygons.length > 0 && {
      avoid_polygons: avoidPolygons,
    }),
    directions_options: {
      units: 'km',
    },
    shape_match: 'map_snap',
  };

  const res = await fetch(VALHALLA_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Valhalla error: ${res.status}`);
  }

  const data = await res.json();

  // Valhalla returns encoded polyline — decode it
  const encoded: string = data.trip.legs[0].shape;
  const coords = decodePolyline(encoded);

  const summary = data.trip.summary;
  return {
    coordinates: coords,
    distanceMeters: summary.length * 1000,
    durationSeconds: summary.time,
  };
}

// Valhalla uses Google's polyline encoding with precision 6
function decodePolyline(encoded: string): Coordinate[] {
  const coords: Coordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push({ latitude: lat / 1e6, longitude: lng / 1e6 });
  }

  return coords;
>>>>>>> a74c0b5d9cdc6da358fa73bcb44874fafea5f001
}
