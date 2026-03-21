import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CrimePoint {
  lat: number;
  lng: number;
  category: string;
}

export interface CrimeHotspot {
  lat: number;
  lng: number;
  count: number; // number of crimes in this cluster cell
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const GRID_SIZE = 0.002; // ~200m grid cells for clustering

// Categories considered high-risk for routing avoidance
const HIGH_RISK = new Set([
  'violent-crime',
  'robbery',
  'theft-from-the-person',
  'public-order',
  'possession-of-weapons',
]);

function cacheKey(lat: number, lng: number) {
  // Round to ~1km grid for cache key
  return `crime_${(lat * 10).toFixed(0)}_${(lng * 10).toFixed(0)}`;
}

export async function fetchCrimes(lat: number, lng: number): Promise<CrimePoint[]> {
  const key = cacheKey(lat, lng);
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL_MS) return data;
    }
  } catch {}

  // Build a ~1.5km bounding box polygon for the API
  const d = 0.015;
  const poly = [
    [lat - d, lng - d],
    [lat - d, lng + d],
    [lat + d, lng + d],
    [lat + d, lng - d],
  ]
    .map(([la, ln]) => `${la},${ln}`)
    .join(':');

  // Get last available month (API is ~2 months behind)
  const now = new Date();
  now.setMonth(now.getMonth() - 2);
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const url = `https://data.police.uk/api/crimes-street/all-crime?poly=${poly}&date=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Police API error: ${res.status}`);

  const raw: any[] = await res.json();
  const data: CrimePoint[] = raw.map((c) => ({
    lat: parseFloat(c.location.latitude),
    lng: parseFloat(c.location.longitude),
    category: c.category,
  }));

  await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  return data;
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
