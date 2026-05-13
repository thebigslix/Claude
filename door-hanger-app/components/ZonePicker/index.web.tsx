import { useEffect, useRef } from 'react';
import { loadMapLibre } from '../../lib/loadMapLibre';

type Props = {
  lat: number;
  lng: number;
  radiusMeters: number;
  onMove: (lat: number, lng: number) => void;
};

function circleGeoJSON(lat: number, lng: number, radiusMeters: number) {
  const steps = 64;
  const R = 6371000;
  const coords: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (radiusMeters / R) * (180 / Math.PI) * Math.cos(angle);
    const dLng = (radiusMeters / R) * (180 / Math.PI) * Math.sin(angle) / Math.cos((lat * Math.PI) / 180);
    coords.push([lng + dLng, lat + dLat]);
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } }],
  };
}

// Liberty style: clean light vector map closest to Apple Maps look
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export default function ZonePicker({ lat, lng, radiusMeters, onMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const radiusRef = useRef(radiusMeters);
  radiusRef.current = radiusMeters;
  const latRef = useRef(lat);
  latRef.current = lat;
  const lngRef = useRef(lng);
  lngRef.current = lng;

  function updateCircle(map: any, markerLat: number, markerLng: number) {
    const src = map.getSource('zone-circle');
    if (src) src.setData(circleGeoJSON(markerLat, markerLng, radiusRef.current));
  }

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadMapLibre().then(ml => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = new ml.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [lng, lat],
        zoom: 14,
        attributionControl: true,
      });
      mapRef.current = map;

      map.on('style.load', () => {
        map.addSource('zone-circle', { type: 'geojson', data: circleGeoJSON(latRef.current, lngRef.current, radiusRef.current) });
        map.addLayer({ id: 'zone-fill', type: 'fill', source: 'zone-circle', paint: { 'fill-color': '#2563EB', 'fill-opacity': 0.12 } });
        map.addLayer({ id: 'zone-outline', type: 'line', source: 'zone-circle', paint: { 'line-color': '#2563EB', 'line-width': 2.5, 'line-dasharray': [3, 2] } });
      });

      // Draggable center marker
      const el = document.createElement('div');
      el.style.cssText = [
        'width:24px', 'height:24px', 'background:#2563EB',
        'border:3px solid #fff', 'border-radius:50%',
        'box-shadow:0 2px 12px rgba(37,99,235,0.5),0 1px 4px rgba(0,0,0,0.3)',
        'cursor:grab', 'transition:transform 0.1s',
      ].join(';');
      el.addEventListener('mousedown', () => { el.style.cursor = 'grabbing'; el.style.transform = 'scale(1.15)'; });
      el.addEventListener('mouseup', () => { el.style.cursor = 'grab'; el.style.transform = ''; });

      const marker = new ml.Marker({ element: el, anchor: 'center', draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      markerRef.current = marker;

      marker.on('drag', () => {
        const pos = marker.getLngLat();
        updateCircle(map, pos.lat, pos.lng);
      });
      marker.on('dragend', () => {
        const pos = marker.getLngLat();
        onMoveRef.current(pos.lat, pos.lng);
      });

      map.on('click', (e: any) => {
        marker.setLngLat(e.lngLat);
        updateCircle(map, e.lngLat.lat, e.lngLat.lng);
        onMoveRef.current(e.lngLat.lat, e.lngLat.lng);
      });
    });

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
    };
  }, []);

  // Sync when lat/lng pushed from outside (e.g. "My Location")
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLngLat([lng, lat]);
    updateCircle(mapRef.current, lat, lng);
    mapRef.current.easeTo({ center: [lng, lat], duration: 500 });
  }, [lat, lng]);

  // Sync circle when radius changes
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const pos = markerRef.current.getLngLat();
    updateCircle(mapRef.current, pos.lat, pos.lng);
  }, [radiusMeters]);

  return (
    <>
      <style>{`
        .maplibregl-ctrl-attrib { background: rgba(255,255,255,0.8) !important; }
        .maplibregl-ctrl-attrib a { color: #94A3B8 !important; }
      `}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </>
  );
}
