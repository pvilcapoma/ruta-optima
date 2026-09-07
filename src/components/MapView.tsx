import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng, OptimizedRoute, Stop } from '../types';
import { baseTileUrl, TILE_ATTRIBUTION, trafficTileUrl } from '../lib/tomtom';

export type CameraTarget =
  | { kind: 'point'; lat: number; lng: number; zoom?: number }
  | { kind: 'fit'; points: LatLng[] };

export type CameraRequest = CameraTarget & { nonce: number };

type PinKind = 'origin' | 'stop' | 'final';

type Props = {
  apiKey: string;
  center: LatLng;
  origin: Stop | null;
  stops: Stop[];
  /** id → número a mostrar en el pin */
  orderMap: Record<string, number>;
  finalStopId: string | null;
  route: OptimizedRoute | null;
  routeStale: boolean;
  /** Tramo seleccionado en el resumen; se dibuja resaltado encima de la ruta. */
  highlightPath: LatLng[] | null;
  showTraffic: boolean;
  selectedId: string | null;
  camera: CameraRequest | null;
  onMapClick: (latlng: LatLng) => void;
  onMarkerClick: (id: string) => void;
  onMarkerDragEnd: (id: string, latlng: LatLng) => void;
};

/* ---------- Pines SVG (cacheados por apariencia) ---------- */

const PIN_COLORS: Record<PinKind, string> = { origin: '#16a34a', stop: '#2563eb', final: '#ea580c' };
const iconCache = new Map<string, L.DivIcon>();

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function pinIcon(kind: PinKind, text: string, selected: boolean): L.DivIcon {
  const key = `${kind}|${text}|${selected ? 1 : 0}`;
  let icon = iconCache.get(key);
  if (icon) return icon;
  const color = PIN_COLORS[kind];
  const halo = selected ? `<circle cx="17" cy="15" r="16" fill="${color}" fill-opacity="0.28"/>` : '';
  const fontSize = text.length > 2 ? 10 : 12;
  const html =
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">${halo}` +
    `<path d="M17 42C17 42 4 25 4 15a13 13 0 0 1 26 0c0 10-13 27-13 27z" fill="${color}" stroke="#fff" stroke-width="2"/>` +
    `<text x="17" y="19.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${escapeXml(text)}</text>` +
    `</svg>`;
  icon = L.divIcon({ className: 'pin-icon', html, iconSize: [34, 44], iconAnchor: [17, 42] });
  iconCache.set(key, icon);
  return icon;
}

/* ---------- Ayudantes que necesitan la instancia del mapa ---------- */

function ClickCatcher({ onClick }: { onClick: (ll: LatLng) => void }) {
  useMapEvents({
    click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

function CameraController({ request }: { request: CameraRequest | null }) {
  const map = useMap();
  useEffect(() => {
    if (!request) return;
    if (request.kind === 'point') {
      map.flyTo([request.lat, request.lng], request.zoom ?? map.getZoom(), { duration: 0.6 });
      return;
    }
    if (request.points.length === 0) return;
    if (request.points.length === 1) {
      map.flyTo([request.points[0].lat, request.points[0].lng], 15, { duration: 0.6 });
      return;
    }
    const bounds = L.latLngBounds(request.points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
  }, [map, request]);
  return null;
}

/** Leaflet necesita saber cuándo cambia el tamaño del contenedor (rotar el celular, etc.). */
function ResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/* ---------- Componente principal ---------- */

export function MapView(props: Props) {
  const {
    apiKey,
    center,
    origin,
    stops,
    orderMap,
    finalStopId,
    route,
    routeStale,
    highlightPath,
    showTraffic,
    selectedId,
    camera,
    onMapClick,
    onMarkerClick,
    onMarkerDragEnd,
  } = props;

  const path = useMemo(() => route?.path ?? [], [route]);
  const tiles = useMemo(() => baseTileUrl(apiKey), [apiKey]);
  const trafficTiles = useMemo(() => trafficTileUrl(apiKey), [apiKey]);

  const handlers = (id: string) => ({
    click: () => onMarkerClick(id),
    dragend: (e: L.DragEndEvent) => {
      const ll = (e.target as L.Marker).getLatLng();
      onMarkerDragEnd(id, { lat: ll.lat, lng: ll.lng });
    },
  });

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={12}
      zoomControl={false}
      className="map-canvas"
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer url={tiles} subdomains="abcd" attribution={TILE_ATTRIBUTION} maxZoom={22} />
      {showTraffic && <TileLayer url={trafficTiles} subdomains="abcd" maxZoom={22} opacity={0.85} zIndex={5} />}
      <ZoomControl position="bottomright" />
      <ClickCatcher onClick={onMapClick} />
      <CameraController request={camera} />
      <ResizeWatcher />

      {path.length > 1 && (
        <>
          <Polyline positions={path} pathOptions={{ color: '#0b3d91', weight: 9, opacity: routeStale ? 0.2 : 0.5 }} />
          <Polyline
            positions={path}
            pathOptions={{ color: routeStale ? '#94a3b8' : '#2563eb', weight: 5, opacity: 1 }}
          />
        </>
      )}
      {highlightPath && highlightPath.length > 1 && (
        <Polyline positions={highlightPath} pathOptions={{ color: '#ea580c', weight: 7, opacity: 0.95 }} />
      )}

      {origin && (
        <Marker
          position={[origin.lat, origin.lng]}
          icon={pinIcon('origin', 'A', selectedId === origin.id)}
          title={origin.label ?? 'Origen'}
          draggable
          bubblingMouseEvents={false}
          zIndexOffset={1000}
          eventHandlers={handlers(origin.id)}
        />
      )}

      {stops.map((s) => {
        const n = orderMap[s.id];
        const kind: PinKind = finalStopId === s.id ? 'final' : 'stop';
        return (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={pinIcon(kind, n !== undefined ? String(n) : '•', selectedId === s.id)}
            title={s.label ?? `Parada ${n ?? ''}`}
            draggable
            bubblingMouseEvents={false}
            zIndexOffset={selectedId === s.id ? 900 : 0}
            eventHandlers={handlers(s.id)}
          />
        );
      })}
    </MapContainer>
  );
}
