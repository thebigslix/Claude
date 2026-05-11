import { useEffect, useRef } from 'react';

type Props = {
  lat: number;
  lng: number;
  radiusMeters: number;
  onMove: (lat: number, lng: number) => void;
};

export default function ZonePicker({ lat, lng, radiusMeters, onMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  useEffect(() => {
    async function init() {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const L = (await import('leaflet')).default;
      if (!containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current).setView([lat, lng], 14);
      mapRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB', maxZoom: 19,
      }).addTo(map);

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:22px;height:22px;
          background:#3B82F6;
          border:3px solid #fff;
          border-radius:50%;
          box-shadow:0 2px 8px rgba(0,0,0,0.5);
          cursor:grab;
        "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
      markerRef.current = marker;

      const circle = L.circle([lat, lng], {
        radius: radiusMeters,
        color: '#3B82F6',
        fillColor: '#3B82F6',
        fillOpacity: 0.1,
        weight: 2,
      }).addTo(map);
      circleRef.current = circle;

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        circle.setLatLng(pos);
        onMove(pos.lat, pos.lng);
      });

      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        circle.setLatLng(e.latlng);
        onMove(e.latlng.lat, e.latlng.lng);
      });
    }

    init();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, []);

  // Update marker + circle when lat/lng changes externally (e.g. "use my location")
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    circleRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], 14, { animate: true });
  }, [lat, lng]);

  // Update circle radius when radius changes
  useEffect(() => {
    if (!circleRef.current) return;
    circleRef.current.setRadius(radiusMeters);
  }, [radiusMeters]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
