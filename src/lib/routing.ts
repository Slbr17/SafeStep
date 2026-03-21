const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de/route';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coordinates: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
}

// Crime avoidance stub — replace with real data.police.uk polygons later
async function getCrimeAvoidPolygons(): Promise<{ type: string; coordinates: number[][][] }[]> {
  // TODO: fetch from data.police.uk, cluster incidents, buffer into polygons
  return [];
}

export async function fetchSafeRoute(
  origin: Coordinate,
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
}
