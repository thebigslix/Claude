import { useEffect, useRef } from 'react';
import { Street, Completion } from '../../lib/storage';

type Props = {
  centerLat: number;
  centerLng: number;
  streets: Street[];
  completions: Completion[];
  userLat?: number;
  userLng?: number;
  onStreetPress: (street: Street) => void;
};

export default function StreetMap({
  centerLat, centerLng, streets, completions, userLat, userLng, onStreetPress,
}: Props) {
  const mapRef = useRef<any>(null);
  const polylineRefs = useRef<Map<string, any>>(new Map());
  const userMarkerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const completedIds = new Set(completions.map(c => c.streetId));

  useEffect(() => {
    let L: any;
    let map: any;

    async function init() {
      // Inject leaflet CSS via link tag (Metro can't bundle CSS files)
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      L = (await import('leaflet')).default;

      if (!containerRef.current || mapRef.current) return;

      map = L.map(containerRef.current, { zoomControl: true }).setView([centerLat, centerLng], 15);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      drawStreets(L, map);
    }

    init();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        polylineRefs.current.clear();
        userMarkerRef.current = null;
      }
    };
  }, [centerLat, centerLng]);

  function drawStreets(L: any, map: any) {
    polylineRefs.current.forEach(p => p.remove());
    polylineRefs.current.clear();

    streets.forEach(street => {
      if (!street.geometry || street.geometry.length < 2) return;
      const isDone = completedIds.has(street.id);

      const polyline = L.polyline(street.geometry, {
        color: isDone ? '#16A34A' : '#3B82F6',
        weight: isDone ? 5 : 4,
        opacity: isDone ? 0.9 : 0.65,
        dashArray: isDone ? undefined : undefined,
      });

      if (isDone) {
        polyline.setStyle({ color: '#16A34A', weight: 6, opacity: 1 });
      }

      polyline.bindTooltip(street.name, { sticky: true, className: 'street-tooltip' });
      polyline.on('click', () => onStreetPress(street));
      polyline.addTo(map);
      polylineRefs.current.set(street.id, polyline);
    });
  }

  // Update street colors when completions change
  useEffect(() => {
    if (!mapRef.current) return;
    polylineRefs.current.forEach((polyline, streetId) => {
      const isDone = completedIds.has(streetId);
      polyline.setStyle({
        color: isDone ? '#16A34A' : '#3B82F6',
        weight: isDone ? 6 : 4,
        opacity: isDone ? 1 : 0.65,
      });
    });
  }, [completions]);

  // Update user location marker
  useEffect(() => {
    if (!mapRef.current || userLat == null || userLng == null) return;
    const L = (window as any).L;
    if (!L) {
      import('leaflet').then(mod => {
        const Leaflet = mod.default;
        updateUserMarker(Leaflet);
      });
    } else {
      updateUserMarker(L);
    }
  }, [userLat, userLng]);

  function updateUserMarker(L: any) {
    if (!mapRef.current || userLat == null || userLng == null) return;

    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:18px;height:18px;
        background:#2563EB;
        border:3px solid #fff;
        border-radius:50%;
        box-shadow:0 0 0 3px rgba(37,99,235,0.35);
      "></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLat, userLng]);
    } else {
      userMarkerRef.current = L.marker([userLat, userLng], { icon, zIndexOffset: 1000 })
        .addTo(mapRef.current);
    }

    mapRef.current.panTo([userLat, userLng], { animate: true, duration: 1 });
  }

  return (
    <>
      <style>{`
        .street-tooltip {
          background: #1E293B;
          color: #fff;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          padding: 3px 7px;
          font-weight: 600;
        }
        .street-tooltip::before { display: none; }
      `}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </>
  );
}
