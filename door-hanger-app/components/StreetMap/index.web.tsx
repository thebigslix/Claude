import { useEffect, useRef } from 'react';
import { Street, Completion, YardSign } from '../../lib/storage';

type Props = {
  centerLat: number;
  centerLng: number;
  streets: Street[];
  completions: Completion[];
  yardSigns: YardSign[];
  userLat?: number;
  userLng?: number;
  mapType: 'dark' | 'satellite';
  placingSign: boolean;
  onStreetPress: (street: Street) => void;
  onMapPress: (lat: number, lng: number) => void;
  onYardSignPress: (sign: YardSign) => void;
};

const TILES = {
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '© CartoDB' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri' },
};

export default function StreetMap({
  centerLat, centerLng, streets, completions, yardSigns,
  userLat, userLng, mapType, placingSign,
  onStreetPress, onMapPress, onYardSignPress,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const polylineRefs = useRef<Map<string, any>>(new Map());
  const userMarkerRef = useRef<any>(null);
  const signMarkersRef = useRef<Map<string, any>>(new Map());
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
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const tile = TILES[mapType];
      tileLayerRef.current = L.tileLayer(tile.url, { attribution: tile.attribution, maxZoom: 19 }).addTo(map);

      map.on('click', (e: any) => onMapPress(e.latlng.lat, e.latlng.lng));

      drawStreets(L, map);
    }
    init();
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      polylineRefs.current.clear();
      signMarkersRef.current.clear();
      userMarkerRef.current = null;
    };
  }, [centerLat, centerLng]);

  // Tile layer switch
  useEffect(() => {
    const L = LeafletRef.current; const map = mapRef.current;
    if (!L || !map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const tile = TILES[mapType];
    tileLayerRef.current = L.tileLayer(tile.url, { attribution: tile.attribution, maxZoom: 19 }).addTo(map);
    polylineRefs.current.forEach(p => p.bringToFront());
    signMarkersRef.current.forEach(m => m.bringToFront());
  }, [mapType]);

  // Cursor style when placing sign
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.getContainer().style.cursor = placingSign ? 'crosshair' : '';
  }, [placingSign]);

  function drawStreets(L: any, map: any) {
    polylineRefs.current.forEach(p => p.remove());
    polylineRefs.current.clear();
    streets.forEach(street => {
      if (!street.geometry || street.geometry.length === 0) return;
      const isDone = completedIds.has(street.id);
      // Normalize old flat [number,number][] format to [[number,number][]] segments
      const segments: [number, number][][] =
        typeof street.geometry[0][0] === 'number'
          ? [street.geometry as unknown as [number, number][]]
          : (street.geometry as unknown as [number, number][][]);
      const polyline = L.polyline(segments, {
        color: isDone ? '#4ADE80' : '#60A5FA',
        weight: isDone ? 5 : 3,
        opacity: isDone ? 1 : 0.75,
      });
      polyline.bindTooltip(street.name, { sticky: true, className: 'street-tooltip' });
      polyline.on('click', (e: any) => { L.DomEvent.stopPropagation(e); onStreetPress(street); });
      polyline.addTo(map);
      polylineRefs.current.set(street.id, polyline);
    });
  }

  // Update street colors
  useEffect(() => {
    if (!mapRef.current) return;
    polylineRefs.current.forEach((polyline, streetId) => {
      const isDone = completedIds.has(streetId);
      polyline.setStyle({ color: isDone ? '#4ADE80' : '#60A5FA', weight: isDone ? 6 : 4, opacity: isDone ? 1 : 0.8 });
    });
  }, [completions]);

  // Yard sign markers
  useEffect(() => {
    const L = LeafletRef.current; const map = mapRef.current;
    if (!L || !map) return;

    // Remove old markers not in current signs
    const currentIds = new Set(yardSigns.map(s => s.id));
    signMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) { marker.remove(); signMarkersRef.current.delete(id); }
    });

    // Add new markers
    yardSigns.forEach(sign => {
      if (signMarkersRef.current.has(sign.id)) return;
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          font-size:22px;
          filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));
          cursor:pointer;
        ">🪧</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      const marker = L.marker([sign.lat, sign.lng], { icon }).addTo(map);
      marker.on('click', (e: any) => { L.DomEvent.stopPropagation(e); onYardSignPress(sign); });
      signMarkersRef.current.set(sign.id, marker);
    });
  }, [yardSigns]);

  // User location
  useEffect(() => {
    const L = LeafletRef.current; const map = mapRef.current;
    if (!L || !map || userLat == null || userLng == null) return;
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:16px;height:16px;background:#3B82F6;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(59,130,246,0.3),0 2px 6px rgba(0,0,0,0.4);"></div>`,
      iconSize: [16, 16], iconAnchor: [8, 8],
    });
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLat, userLng]);
    } else {
      userMarkerRef.current = L.marker([userLat, userLng], { icon, zIndexOffset: 1000 }).addTo(map);
      map.panTo([userLat, userLng], { animate: true, duration: 1 });
    }
  }, [userLat, userLng]);

  return (
    <>
      <style>{`
        .street-tooltip { background:rgba(15,23,42,0.92);color:#F1F5F9;border:1px solid #334155;border-radius:6px;font-size:12px;padding:4px 8px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.3); }
        .street-tooltip::before { display:none; }
        .leaflet-control-zoom a { background:#1E293B !important;color:#94A3B8 !important;border-color:#334155 !important; }
        .leaflet-control-zoom a:hover { background:#334155 !important;color:#F1F5F9 !important; }
      `}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </>
  );
}
