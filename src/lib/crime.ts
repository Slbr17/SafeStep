import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CrimePoint {
  lat: number;
  lng: number;
  category: string;
}

export interface CrimeHotspot {
  lat: number;
  lng: number;
  count: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const GRID_SIZE = 0.002; // ~200m grid cells for clustering

// Max safe tile size for the police API (~0.5 deg side = 0.25 deg²)
const TILE_SIZE = 0.05; // ~5km per tile side

// Categories considered high-risk for routing avoidance
const HIGH_RISK = new Set([
  'violent-crime',
  'robbery',
  'theft-from-the-person',
  'public-order',
  'possession-of-weapons',
]);

function tileKey(latTile: number, lngTile: number) {
  return `crime_tile_${latTile}_${lngTile}`;
}

/** Fetch crimes for a single tile (TILE_SIZE x TILE_SIZE bounding box) */
async function fetchTile(
  minLat: number, minLng: number,
  maxLat: number, maxLng: number,
  date: string
): Promise<CrimePoint[]> {
  const latTile = Math.floor(minLat / TILE_SIZE);
  const lngTile = Math.floor(minLng / TILE_SIZE);
  const key = tileKey(latTile, lngTile);

  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL_MS) return data;
    }
  } catch {}

  const poly = [
    [minLat, minLng],
    [minLat, maxLng],
    [maxLat, maxLng],
    [maxLat, minLng],
  ]
    .map(([la, ln]) => `${la},${ln}`)
    .join(':');

  const url = `https://data.police.uk/api/crimes-street/all-crime?poly=${poly}&date=${date}`;
  const res = await fetch(url);
  if (!res.ok) {
    // 503 means too many crimes in area — skip this tile silently
    if (res.status === 503) return [];
    throw new Error(`Police API error: ${res.status}`);
  }

  const raw: any[] = await res.json();
  const data: CrimePoint[] = raw.map((c) => ({
    lat: parseFloat(c.location.latitude),
    lng: parseFloat(c.location.longitude),
    category: c.category,
  }));

  await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  return data;
}

/** Get the last available month string (API is ~2 months behind) */
function getApiDate(): string {
  const now = new Date();
  now.setMonth(now.getMonth() - 2);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Fetch crimes covering a bounding box, tiled into TILE_SIZE chunks.
 * Handles routes of any length across London.
 */
export async function fetchCrimesForArea(
  minLat: number, minLng: number,
  maxLat: number, maxLng: number
): Promise<CrimePoint[]> {
  const date = getApiDate();

  // Build list of tiles covering the bounding box
  const tiles: Array<[number, number, number, number]> = [];
  for (let la = Math.floor(minLat / TILE_SIZE) * TILE_SIZE; la < maxLat; la += TILE_SIZE) {
    for (let ln = Math.floor(minLng / TILE_SIZE) * TILE_SIZE; ln < maxLng; ln += TILE_SIZE) {
      tiles.push([la, ln, Math.min(la + TILE_SIZE, maxLat), Math.min(ln + TILE_SIZE, maxLng)]);
    }
  }

  // Fetch all tiles in parallel (they're individually cached)
  const results = await Promise.all(
    tiles.map(([la1, ln1, la2, ln2]) => fetchTile(la1, ln1, la2, ln2, date).catch(() => [] as CrimePoint[]))
  );

  // Merge and deduplicate by lat/lng
  const seen = new Set<string>();
  const merged: CrimePoint[] = [];
  for (const batch of results) {
    for (const c of batch) {
      const k = `${c.lat.toFixed(4)}_${c.lng.toFixed(4)}`;
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(c);
      }
    }
  }
  return merged;
}

/**
 * Fetch crimes around a single point (used on app load before a route is set).
 * Covers a ~3km radius.
 */
export async function fetchCrimes(lat: number, lng: number): Promise<CrimePoint[]> {
  const d = 0.03; // ~3km
  return fetchCrimesForArea(lat - d, lng - d, lat + d, lng + d);
}

/** Cluster crime points into grid cells, return hotspots sorted by density */
export function clusterCrimes(crimes: CrimePoint[]): CrimeHotspot[] {
  const grid: Record<string, CrimeHotspot> = {};
  for (const c of crimes) {
    const gx = Math.round(c.lat / GRID_SIZE);
    const gy = Math.round(c.lng / GRID_SIZE);
    const k = `${gx}_${gy}`;
    if (!grid[k]) grid[k] = { lat: gx * GRID_SIZE, lng: gy * GRID_SIZE, count: 0 };
    grid[k].count++;
  }
  return Object.values(grid).sort((a, b) => b.count - a.count);
}

/** Return only high-risk crime points for routing avoidance */
export function highRiskCrimes(crimes: CrimePoint[]): CrimePoint[] {
  return crimes.filter((c) => HIGH_RISK.has(c.category));
}

/** Convert hotspots to [lat, lng, intensity] tuples for Leaflet.heat */
export function toHeatmapData(hotspots: CrimeHotspot[]): [number, number, number][] {
  const max = hotspots[0]?.count ?? 1;
  return hotspots.map((h) => [h.lat, h.lng, h.count / max]);
}
