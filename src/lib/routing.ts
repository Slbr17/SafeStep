import { CrimePoint } from './crime';

// Local OSRM server — make sure Docker is running with the SafeStep profile
const OSRM_BASE = 'http://10.230.112.117:5000';

// How close a crime point must be to the route to trigger a detour (degrees, ~80m)
const CRIME_PROXIMITY_DEG = 0.0008;
// Offset distance for detour waypoints (~60m — small enough to stay on roads)
const DETOUR_OFFSET_DEG = 0.0006;

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

/** Project value of a point along the origin→destination axis (0=origin, 1=dest) */
function projectAlong(pt: { lat: number; lng: number }, origin: Coordinate, dest: Coordinate): number {
  const dx = dest.latitude - origin.latitude;
  const dy = dest.longitude - origin.longitude;
  const lenSq = dx * dx + dy * dy || 1;
  return ((pt.lat - origin.latitude) * dx + (pt.lng - origin.longitude) * dy) / lenSq;
}

/**
 * Cluster nearby crime points into a single centroid, then generate one
 * perpendicular offset waypoint per cluster. Fewer waypoints = fewer
 * opportunities for OSRM to snap to a bad road.
 */
function buildDetourWaypoints(
  crimes: CrimePoint[],
  origin: Coordinate,
  dest: Coordinate,
): Coordinate[] {
  if (crimes.length === 0) return [];

  const dx = dest.latitude - origin.latitude;
  const dy = dest.longitude - origin.longitude;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector
  const px = -dy / len;
  const py = dx / len;

  // Cluster: group crimes within 0.002 deg (~200m) of each other
  const CLUSTER_RADIUS = 0.002;
  const used = new Set<number>();
  const clusters: CrimePoint[][] = [];

  for (let i = 0; i < crimes.length; i++) {
    if (used.has(i)) continue;
    const cluster = [crimes[i]];
    used.add(i);
    for (let j = i + 1; j < crimes.length; j++) {
      if (used.has(j)) continue;
      const dlat = crimes[i].lat - crimes[j].lat;
      const dlng = crimes[i].lng - crimes[j].lng;
      if (Math.sqrt(dlat * dlat + dlng * dlng) < CLUSTER_RADIUS) {
        cluster.push(crimes[j]);
        used.add(j);
      }
    }
    clusters.push(cluster);
  }

  // Take up to 2 largest clusters, compute centroid, offset perpendicularly
  return clusters
    .sort((a, b) => b.length - a.length)
    .slice(0, 2)
    .map((cluster) => {
      const centLat = cluster.reduce((s, c) => s + c.lat, 0) / cluster.length;
      const centLng = cluster.reduce((s, c) => s + c.lng, 0) / cluster.length;
      return {
        latitude: centLat + px * DETOUR_OFFSET_DEG,
        longitude: centLng + py * DETOUR_OFFSET_DEG,
      };
    })
    .sort((a, b) => {
      // Sort by projection along route so waypoints are in travel order
      const projA = projectAlong({ lat: a.latitude, lng: a.longitude }, origin, dest);
      const projB = projectAlong({ lat: b.latitude, lng: b.longitude }, origin, dest);
      return projA - projB;
    })
    // Clamp: only keep waypoints that fall between origin and destination
    .filter((wp) => {
      const t = projectAlong({ lat: wp.latitude, lng: wp.longitude }, origin, dest);
      return t > 0.05 && t < 0.95;
    });
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
  // Route directly — crime data is used for heatmap display only.
  // Waypoint-based detours are unreliable in dense urban areas (offsets
  // frequently land off-road, causing OSRM 400 errors).
  return osrmRoute([origin, destination]);
}
