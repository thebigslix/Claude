import { useEffect, useRef } from 'react';
import { Street, Completion } from '../../lib/storage';

type Props = {
  centerLat: number;
  centerLng: number;
  streets: Street[];
  completions: Completion[];
  userLat?: number;
  userLng?: number;
  mapType: 'dark' | 'satellite';
  onStreetPress: (street: Street) => void;
};

const TILES = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© CartoDB',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
  },
};

export default function StreetMap({
  centerLat, centerLng, streets, completions, userLat, userLng, mapType, onStreetPress,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const polylineRefs = useRef<Map<string, any>>(new Map());
  const userMarkerRef = useRef<any>(null);
  const LeafletRef = useRef<any>(null);

  const completedIds = new Set(completions.map(c => c.streetId));

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
      LeafletRef.current = L;
      if (!containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: false }).setView([centerLat, centerLng], 15);
      mapRef.current = map;

      // Add zoom control to bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const tile = TILES[mapType];
      tileLayerRef.current = L.tileLayer(tile.url, { attribution: tile.attribution, maxZoom: 19 }).addTo(map);

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

  // Switch tile layer when mapType changes
  useEffect(() => {
    const L = LeafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const tile = TILES[mapType];
    tileLayerRef.current = L.tileLayer(tile.url, { attribution: tile.attribution, maxZoom: 19 }).addTo(map);
    // Re-raise polylines so they're above the new tile layer
    polylineRefs.current.forEach(p => p.bringToFront());
  }, [mapType]);

  function drawStreets(L: any, map: any) {
    polylineRefs.current.forEach(p => p.remove());
    polylineRefs.current.clear();
    streets.forEach(street => {
      if (!street.geometry || street.geometry.length < 2) return;
      const isDone = completedIds.has(street.id);
      const polyline = L.polyline(street.geometry, {
        color: isDone ? '#4ADE80' : '#60A5FA',
        weight: isDone ? 6 : 4,
        opacity: isDone ? 1 : 0.8,
      });
      polyline.bindTooltip(street.name, { sticky: true, className: 'street-tooltip' });
      polyline.on('click', () => onStreetPress(street));
      polyline.addTo(map);
      polylineRefs.current.set(street.id, polyline);
    });
  }

  useEffect(() => {
    if (!mapRef.current) return;
    polylineRefs.current.forEach((polyline, streetId) => {
      const isDone = completedIds.has(streetId);
      polyline.setStyle({
        color: isDone ? '#4ADE80' : '#60A5FA',
        weight: isDone ? 6 : 4,
        opacity: isDone ? 1 : 0.8,
      });
    });
  }, [completions]);

  useEffect(() => {
    if (!mapRef.current || userLat == null || userLng == null) return;
    const L = LeafletRef.current;
    if (!L) return;
    updateUserMarker(L);
  }, [userLat, userLng]);

  function updateUserMarker(L: any) {
    if (!mapRef.current || userLat == null || userLng == null) return;
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:16px;height:16px;
        background:#3B82F6;
        border:2.5px solid #fff;
        border-radius:50%;
        box-shadow:0 0 0 4px rgba(59,130,246,0.3),0 2px 6px rgba(0,0,0,0.4);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLat, userLng]);
    } else {
      userMarkerRef.current = L.marker([userLat, userLng], { icon, zIndexOffset: 1000 }).addTo(mapRef.current);
      mapRef.current.panTo([userLat, userLng], { animate: true, duration: 1 });
    }
  }

  return (
    <>
      <style>{`
        .street-tooltip {
          background: rgba(15,23,42,0.92);
          color: #F1F5F9;
          border: 1px solid #334155;
          border-radius: 6px;
          font-size: 12px;
          padding: 4px 8px;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .street-tooltip::before { display: none; }
        .leaflet-control-zoom a {
          background: #1E293B !important;
          color: #94A3B8 !important;
          border-color: #334155 !important;
        }
        .leaflet-control-zoom a:hover {
          background: #334155 !important;
          color: #F1F5F9 !important;
        }
      `}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </>
  );
}
