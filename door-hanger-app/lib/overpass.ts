import { Street } from './storage';

type OverpassElement = {
  type: string;
  id: number;
  tags?: { name?: string; highway?: string };
  geometry?: { lat: number; lon: number }[];
};

const DRIVEABLE = new Set([
  'residential', 'secondary', 'tertiary', 'unclassified',
  'primary', 'living_street', 'service',
]);

export async function fetchStreetsInRadius(
  lat: number,
  lng: number,
  radiusMeters: number,
  zoneId: string
): Promise<Street[]> {
  const query = `
    [out:json][timeout:25];
    way(around:${radiusMeters},${lat},${lng})["highway"]["name"];
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

  const seen = new Set<string>();
  const streets: Street[] = [];

  for (const el of elements) {
    if (el.type !== 'way') continue;
    if (!el.tags?.name) continue;
    if (el.tags.highway && !DRIVEABLE.has(el.tags.highway)) continue;

    const name = el.tags.name;
    if (seen.has(name)) continue;
    seen.add(name);

    const geometry: [number, number][] = (el.geometry ?? []).map(
      (p) => [p.lat, p.lon] as [number, number]
    );

    streets.push({
      id: `${zoneId}-osm-${el.id}`,
      zoneId,
      name,
      osmId: String(el.id),
      geometry,
    });
  }

  return streets;
}

export async function reverseGeocodeStreet(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'StreetTrackerApp/1.0' } }
    );
    const json = await res.json();
    return json.address?.road ?? null;
  } catch {
    return null;
  }
}
