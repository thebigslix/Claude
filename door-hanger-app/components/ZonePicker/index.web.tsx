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

export default function ZonePicker({ lat, lng, radiusMeters, onMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Refs so handlers always see current values
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
        style: 'https://tiles.openfreemap.org/styles/dark',
        center: [lng, lat],
        zoom: 14,
      });
      mapRef.current = map;

      map.on('style.load', () => {
        map.addSource('zone-circle', { type: 'geojson', data: circleGeoJSON(latRef.current, lngRef.current, radiusRef.current) });
        map.addLayer({ id: 'zone-fill', type: 'fill', source: 'zone-circle', paint: { 'fill-color': '#3B82F6', 'fill-opacity': 0.12 } });
        map.addLayer({ id: 'zone-outline', type: 'line', source: 'zone-circle', paint: { 'line-color': '#3B82F6', 'line-width': 2 } });
      });

      // Draggable center marker
      const el = document.createElement('div');
      el.style.cssText = 'width:22px;height:22px;background:#3B82F6;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:grab;';
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

  // Sync marker + circle when lat/lng pushed from outside (e.g. "My Location")
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

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
