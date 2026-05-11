import { Street } from './storage';

type OverpassElement = {
  type: string;
  id: number;
  tags?: { name?: string; highway?: string };
  geometry?: { lat: number; lon: number }[];
};

// All road types workers would cover
const INCLUDE_HIGHWAY = new Set([
  'residential', 'secondary', 'tertiary', 'unclassified',
  'primary', 'living_street', 'service', 'road',
  'secondary_link', 'tertiary_link', 'primary_link',
  'trunk', 'trunk_link',
]);

export async function fetchStreetsInRadius(
  lat: number,
  lng: number,
  radiusMeters: number,
  zoneId: string
): Promise<Street[]> {
  const query = `
    [out:json][timeout:30];
    way(around:${radiusMeters},${lat},${lng})["highway"];
    out geom;
  `;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) throw new Error('Failed to fetch streets from OpenStreetMap');

  const json = await res.json();
  const elements: OverpassElement[] = json.elements ?? [];

  // Group segments by name (or OSM ID for unnamed roads)
  const streetMap = new Map<string, { geometry: [number, number][]; osmId: string }>();

  for (const el of elements) {
    if (el.type !== 'way') continue;
    const highway = el.tags?.highway;
    if (!highway || !INCLUDE_HIGHWAY.has(highway)) continue;

    const geometry: [number, number][] = (el.geometry ?? []).map(
      p => [p.lat, p.lon] as [number, number]
    );
    if (geometry.length < 2) continue;

    // Use name if available, otherwise use highway type + id
    const name = el.tags?.name ?? `${capitalize(highway)} (${el.id})`;
    const key = el.tags?.name ?? `osm-${el.id}`;

    if (streetMap.has(key)) {
      // Append geometry segments for same-named streets
      streetMap.get(key)!.geometry.push(...geometry);
    } else {
      streetMap.set(key, { geometry, osmId: String(el.id) });
    }
  }

  const streets: Street[] = [];
  let idx = 0;
  for (const [name, data] of streetMap) {
    streets.push({
      id: `${zoneId}-${idx++}`,
      zoneId,
      name,
      osmId: data.osmId,
      geometry: data.geometry,
    });
  }

  return streets;
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

export async function reverseGeocodeStreet(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'FieldTrackApp/1.0' } }
    );
    const json = await res.json();
    return json.address?.road ?? null;
  } catch {
    return null;
  }
}
