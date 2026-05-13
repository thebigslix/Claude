import { useEffect, useRef } from 'react';
import { Street, Completion, YardSign } from '../../lib/storage';
import { loadMapLibre } from '../../lib/loadMapLibre';

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

const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© Esri',
    },
  },
  layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
};

function buildStreetsGeoJSON(streets: Street[], completedIds: Set<string>) {
  return {
    type: 'FeatureCollection',
    features: streets
      .filter(s => s.geometry?.length >= 2)
      .map(s => ({
        type: 'Feature',
        id: s.id,
        properties: { id: s.id, name: s.name, done: completedIds.has(s.id) },
        geometry: {
          type: 'LineString',
          coordinates: s.geometry.map(([lat, lng]) => [lng, lat]),
        },
      })),
  };
}

export default function StreetMap({
  centerLat, centerLng, streets, completions, yardSigns,
  userLat, userLng, mapType, placingSign,
  onStreetPress, onMapPress, onYardSignPress,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mlRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const signMarkersRef = useRef<Map<string, any>>(new Map());

  // Refs so event handlers always see current values without re-registering
  const streetsRef = useRef(streets);
  streetsRef.current = streets;
  const completionsRef = useRef(completions);
  completionsRef.current = completions;
  const onStreetPressRef = useRef(onStreetPress);
  onStreetPressRef.current = onStreetPress;
  const onMapPressRef = useRef(onMapPress);
  onMapPressRef.current = onMapPress;
  const onYardSignPressRef = useRef(onYardSignPress);
  onYardSignPressRef.current = onYardSignPress;
  const placingSignRef = useRef(placingSign);
  placingSignRef.current = placingSign;

  function addDataLayers(map: any, ml: any) {
    const completedIds = new Set(completionsRef.current.map(c => c.streetId));
    const data = buildStreetsGeoJSON(streetsRef.current, completedIds);

    map.addSource('streets', { type: 'geojson', data });

    // Wide invisible hit area for easy tapping on mobile
    map.addLayer({
      id: 'streets-hit',
      type: 'line',
      source: 'streets',
      paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': 20 },
    });
    // Pending streets — blue glow
    map.addLayer({
      id: 'streets-pending-glow',
      type: 'line',
      source: 'streets',
      filter: ['==', ['get', 'done'], false],
      paint: { 'line-color': '#3B82F6', 'line-width': 8, 'line-opacity': 0.2, 'line-blur': 4 },
    });
    map.addLayer({
      id: 'streets-pending',
      type: 'line',
      source: 'streets',
      filter: ['==', ['get', 'done'], false],
      paint: { 'line-color': '#60A5FA', 'line-width': 3.5, 'line-opacity': 0.95 },
    });
    // Done streets — green
    map.addLayer({
      id: 'streets-done',
      type: 'line',
      source: 'streets',
      filter: ['==', ['get', 'done'], true],
      paint: { 'line-color': '#4ADE80', 'line-width': 5, 'line-opacity': 1 },
    });

    // Street name popup on hover (desktop)
    const popup = new ml.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'ml-street-popup',
      offset: 8,
    });

    map.on('mousemove', 'streets-hit', (e: any) => {
      map.getCanvas().style.cursor = 'pointer';
      if (e.features?.[0]) {
        popup.setLngLat(e.lngLat).setHTML(e.features[0].properties.name).addTo(map);
      }
    });
    map.on('mouseleave', 'streets-hit', () => {
      map.getCanvas().style.cursor = placingSignRef.current ? 'crosshair' : '';
      popup.remove();
    });
  }

  // Init map
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadMapLibre().then(ml => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      mlRef.current = ml;

      const map = new ml.Map({
        container: containerRef.current,
        style: mapType === 'satellite' ? SATELLITE_STYLE : DARK_STYLE,
        center: [centerLng, centerLat],
        zoom: 15,
        attributionControl: true,
        // Smoother zoom on mobile
        touchZoomRotate: true,
        cooperativeGestures: false,
      });
      mapRef.current = map;

      map.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');

      // Re-add layers after every style load (style switches wipe them)
      map.on('style.load', () => addDataLayers(map, ml));

      // Unified tap/click: street or map press
      map.on('click', (e: any) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['streets-hit'] });
        if (features.length) {
          const street = streetsRef.current.find(s => s.id === features[0].properties.id);
          if (street) onStreetPressRef.current(street);
        } else {
          onMapPressRef.current(e.lngLat.lat, e.lngLat.lng);
        }
      });
    });

    return () => {
      cancelled = true;
      signMarkersRef.current.forEach(m => m.remove());
      signMarkersRef.current.clear();
      if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [centerLat, centerLng]);

  // Style switching
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(mapType === 'satellite' ? SATELLITE_STYLE : DARK_STYLE);
  }, [mapType]);

  // Update street colors when completions change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('streets');
    if (!src) return;
    const completedIds = new Set(completions.map(c => c.streetId));
    src.setData(buildStreetsGeoJSON(streets, completedIds));
  }, [streets, completions]);

  // Crosshair when placing a sign
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.getCanvas().style.cursor = placingSign ? 'crosshair' : '';
  }, [placingSign]);

  // Yard sign markers
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml) return;

    const currentIds = new Set(yardSigns.map(s => s.id));
    signMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) { marker.remove(); signMarkersRef.current.delete(id); }
    });

    yardSigns.forEach(sign => {
      if (signMarkersRef.current.has(sign.id)) return;
      const el = document.createElement('div');
      el.style.cssText = 'font-size:24px;cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6));line-height:1;user-select:none;';
      el.textContent = '🪧';
      el.addEventListener('click', (e) => { e.stopPropagation(); onYardSignPressRef.current(sign); });
      const marker = new ml.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([sign.lng, sign.lat])
        .addTo(map);
      signMarkersRef.current.set(sign.id, marker);
    });
  }, [yardSigns]);

  // User location dot with pulsing ring
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || userLat == null || userLng == null) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLng, userLat]);
    } else {
      const el = document.createElement('div');
      el.style.cssText = [
        'width:18px', 'height:18px', 'background:#3B82F6',
        'border:2.5px solid #fff', 'border-radius:50%',
        'box-shadow:0 0 0 5px rgba(59,130,246,0.25),0 2px 8px rgba(0,0,0,0.4)',
      ].join(';');
      userMarkerRef.current = new ml.Marker({ element: el, anchor: 'center' })
        .setLngLat([userLng, userLat])
        .addTo(map);
      map.easeTo({ center: [userLng, userLat], duration: 800 });
    }
  }, [userLat, userLng]);

  return (
    <>
      <style>{`
        .ml-street-popup .maplibregl-popup-content {
          background: rgba(15,23,42,0.92) !important;
          color: #F1F5F9 !important;
          border: 1px solid #334155;
          border-radius: 6px;
          font-size: 12px;
          padding: 4px 10px;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .ml-street-popup .maplibregl-popup-tip { display: none; }
        .maplibregl-ctrl button { background-color: #1E293B !important; border-color: #334155 !important; }
        .maplibregl-ctrl button .maplibregl-ctrl-icon { filter: invert(0.7); }
        .maplibregl-ctrl-attrib { background: rgba(15,23,42,0.6) !important; }
        .maplibregl-ctrl-attrib a { color: #64748B !important; }
        /* Smooth pinch-zoom on iOS */
        .maplibregl-canvas { touch-action: none; }
      `}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </>
  );
}
