import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng, OptimizedRoute, Stop, StopSource } from './types';
import { usePlanner } from './hooks/usePlanner';
import { useReverseGeocode } from './hooks/useGeocoder';
import { MAX_STOPS, planRoute } from './lib/routes';
import { TomTomError } from './lib/tomtom';
import { encodeShare } from './lib/storage';
import { buildDemoState } from './lib/demo';
import { newId } from './lib/id';
import { formatClock } from './lib/format';
import { MapView, type CameraRequest, type CameraTarget } from './components/MapView';
import { SearchBox } from './components/SearchBox';
import { CoordInput } from './components/CoordInput';
import { StopList } from './components/StopList';
import { RouteSummary } from './components/RouteSummary';
import { SetupScreen } from './components/SetupScreen';

const env = import.meta.env;
const API_KEY: string = String(env.VITE_TOMTOM_API_KEY ?? '').trim();
const DEFAULT_CENTER: LatLng = {
  lat: Number.parseFloat(env.VITE_DEFAULT_LAT) || -12.0464,
  lng: Number.parseFloat(env.VITE_DEFAULT_LNG) || -77.0428,
};
const REGION_CODES: string[] = String(env.VITE_REGION_CODES ?? '')
  .split(',')
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean);

type Notice = { kind: 'error' | 'info'; text: string; hint?: string };

export default function App() {
  if (!API_KEY || API_KEY === 'TU_CLAVE_AQUI') return <SetupScreen />;
  return <Planner apiKey={API_KEY} />;
}

function Planner({ apiKey }: { apiKey: string }) {
  const [state, dispatch] = usePlanner();
  const reverseGeocode = useReverseGeocode(apiKey);

  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [routeKey, setRouteKey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showTraffic, setShowTraffic] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLeg, setSelectedLeg] = useState<number | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [camera, setCamera] = useState<CameraRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nonce = useRef(0);

  const { origin, stops, endMode, orderMode, avoidTolls, departureTime } = state;

  /** Identifica la geometría/opciones actuales; si cambia, la ruta mostrada queda desactualizada. */
  const geometryKey = useMemo(
    () =>
      JSON.stringify({
        o: origin && [origin.id, origin.lat, origin.lng],
        s: stops.map((s) => [s.id, s.lat, s.lng]),
        e: endMode,
        m: orderMode,
        t: avoidTolls,
        d: departureTime,
      }),
    [origin, stops, endMode, orderMode, avoidTolls, departureTime],
  );
  const routeStale = route !== null && routeKey !== geometryKey;

  const orderMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (route && !routeStale) {
      route.ordered.forEach((s, i) => {
        if (i > 0 && s.id !== origin?.id) map[s.id] = i;
      });
    } else {
      stops.forEach((s, i) => (map[s.id] = i + 1));
    }
    return map;
  }, [route, routeStale, stops, origin]);

  const finalStopId = endMode.kind === 'stop' ? endMode.stopId : null;

  const highlightPath = useMemo(
    () => (route && !routeStale && selectedLeg !== null ? (route.legs[selectedLeg]?.path ?? null) : null),
    [route, routeStale, selectedLeg],
  );

  const moveCamera = useCallback((target: CameraTarget) => {
    nonce.current += 1;
    setCamera({ ...target, nonce: nonce.current });
  }, []);

  useEffect(() => {
    if (!notice || notice.kind !== 'info') return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  /* ---------- Agregar paradas ---------- */

  const fillLabel = useCallback(
    async (stop: Stop) => {
      if (stop.label) return;
      const label = await reverseGeocode(stop.lat, stop.lng);
      if (label) dispatch({ type: 'rename', id: stop.id, label });
    },
    [reverseGeocode, dispatch],
  );

  const addPoints = useCallback(
    (points: Array<LatLng & { label?: string }>, source: StopSource, focus: boolean) => {
      if (points.length === 0) return;
      const made: Stop[] = points.map((p) => ({ id: newId(), lat: p.lat, lng: p.lng, label: p.label, source }));
      let rest = made;
      if (!origin) {
        dispatch({ type: 'setOrigin', stop: made[0] });
        rest = made.slice(1);
      }
      const room = MAX_STOPS - stops.length;
      if (rest.length > room) {
        setNotice({ kind: 'error', text: `Máximo ${MAX_STOPS} paradas. Se agregaron ${Math.max(room, 0)}.` });
        rest = rest.slice(0, Math.max(room, 0));
      }
      if (rest.length) dispatch({ type: 'addStops', stops: rest });
      made.forEach((s) => void fillLabel(s));
      if (focus) moveCamera({ kind: 'fit', points: [...(origin ? [origin] : []), ...stops, ...made] });
    },
    [origin, stops, dispatch, fillLabel, moveCamera],
  );

  const onMapClick = useCallback((ll: LatLng) => addPoints([ll], 'map', false), [addPoints]);

  const onSearchPick = useCallback(
    (p: LatLng & { label?: string }) => {
      addPoints([p], 'search', false);
      moveCamera({ kind: 'point', lat: p.lat, lng: p.lng, zoom: 15 });
    },
    [addPoints, moveCamera],
  );

  const onCoordsAdd = useCallback(
    (items: Array<LatLng & { label?: string }>) => addPoints(items, 'coords', true),
    [addPoints],
  );

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setNotice({ kind: 'error', text: 'Este navegador no soporta geolocalización.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const stop: Stop = {
          id: origin?.id ?? newId(),
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: 'Mi ubicación',
          source: 'gps',
        };
        dispatch({ type: 'setOrigin', stop });
        moveCamera({ kind: 'point', lat: stop.lat, lng: stop.lng, zoom: 15 });
      },
      (err) => setNotice({ kind: 'error', text: `No se pudo obtener tu ubicación (${err.message}).` }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /* ---------- Optimizar ---------- */

  const canOptimize = Boolean(origin) && stops.length > 0 && !loading;

  const optimize = async () => {
    if (!origin || stops.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setNotice(null);
    try {
      const result = await planRoute({
        apiKey,
        origin,
        stops,
        endMode,
        orderMode,
        avoidTolls,
        departureTime,
        signal: controller.signal,
      });
      setRoute(result);
      setRouteKey(geometryKey);
      setSelectedLeg(null);
      moveCamera({ kind: 'fit', points: result.path });
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof TomTomError) setNotice({ kind: 'error', text: e.message, hint: e.hint });
      else setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Error desconocido.' });
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  // Tras cargar la ruta de ejemplo, optimiza en cuanto el estado tenga origen y paradas.
  useEffect(() => {
    if (!autoRun || !origin || stops.length === 0 || loading) return;
    setAutoRun(false);
    void optimize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, origin, stops, loading]);

  /* ---------- Otras acciones ---------- */

  const loadDemo = () => {
    if ((origin || stops.length > 0) && !window.confirm('Se reemplazarán las paradas actuales por la ruta de ejemplo. ¿Continuar?')) {
      return;
    }
    abortRef.current?.abort();
    const demo = buildDemoState();
    dispatch({ type: 'load', state: demo });
    setRoute(null);
    setRouteKey('');
    setSelectedId(null);
    setSelectedLeg(null);
    setNotice(null);
    moveCamera({ kind: 'fit', points: [demo.origin!, ...demo.stops] });
    setAutoRun(true);
  };

  const selectLeg = (i: number) => {
    if (i === selectedLeg) {
      setSelectedLeg(null);
      if (route) moveCamera({ kind: 'fit', points: route.path });
      return;
    }
    setSelectedLeg(i);
    const leg = route?.legs[i];
    if (leg && leg.path.length > 1) moveCamera({ kind: 'fit', points: leg.path });
  };

  const share = async () => {
    const url = encodeShare(state);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Ruta de entrega', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice({ kind: 'info', text: 'Enlace copiado al portapapeles.' });
    } catch {
      window.prompt('Copia este enlace:', url);
    }
  };

  const clearAll = () => {
    if (stops.length + (origin ? 1 : 0) > 0 && !window.confirm('¿Borrar origen, paradas y ruta?')) return;
    abortRef.current?.abort();
    dispatch({ type: 'clear' });
    setRoute(null);
    setRouteKey('');
    setSelectedId(null);
    setSelectedLeg(null);
  };

  const focusStop = (id: string) => {
    setSelectedId(id);
    const s = id === origin?.id ? origin : stops.find((x) => x.id === id);
    if (s) moveCamera({ kind: 'point', lat: s.lat, lng: s.lng });
  };

  const departureLabel = useMemo(() => {
    if (!departureTime) return 'salida ahora';
    const d = new Date(departureTime);
    if (!Number.isFinite(d.getTime()) || d.getTime() < Date.now()) return 'salida ahora';
    return `salida ${d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} ${formatClock(d)}`;
  }, [departureTime]);

  const departureInputValue = useMemo(() => {
    if (!departureTime) return '';
    const d = new Date(departureTime);
    if (!Number.isFinite(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [departureTime]);

  return (
    <div className="app">
      <main className="map">
        <MapView
          apiKey={apiKey}
          center={origin ?? stops[0] ?? DEFAULT_CENTER}
          origin={origin}
          stops={stops}
          orderMap={orderMap}
          finalStopId={finalStopId}
          route={route}
          routeStale={routeStale}
          highlightPath={highlightPath}
          showTraffic={showTraffic}
          selectedId={selectedId}
          camera={camera}
          onMapClick={onMapClick}
          onMarkerClick={setSelectedId}
          onMarkerDragEnd={(id, ll) => {
            dispatch({ type: 'move', id, lat: ll.lat, lng: ll.lng });
            const s = id === origin?.id ? origin : stops.find((x) => x.id === id);
            if (s) void fillLabel({ ...s, lat: ll.lat, lng: ll.lng, label: undefined });
          }}
        />
        <div className="map-overlay">
          <label className="chip">
            <input type="checkbox" checked={showTraffic} onChange={(e) => setShowTraffic(e.target.checked)} />
            Tráfico
          </label>
          <button type="button" className="chip" onClick={useMyLocation} title="Usar mi ubicación como origen">
            ◎ Mi ubicación
          </button>
        </div>
      </main>

      <aside className="panel">
        <header className="panel-head">
          <h1>Ruta Óptima</h1>
          <div className="row">
            <button type="button" className="link" onClick={loadDemo} title="Cargar un reparto de ejemplo por Lima">
              Ejemplo
            </button>
            <button type="button" className="link" onClick={clearAll} disabled={!origin && stops.length === 0}>
              Limpiar
            </button>
          </div>
        </header>

        {notice && (
          <div className={`banner ${notice.kind === 'error' ? 'error' : 'info'}`} role="alert">
            <div>{notice.text}</div>
            {notice.hint && <div className="small">{notice.hint}</div>}
            <button type="button" className="banner-close" onClick={() => setNotice(null)} aria-label="Cerrar">
              ✕
            </button>
          </div>
        )}

        <section className="block">
          <h2>Agregar paradas</h2>
          <SearchBox apiKey={apiKey} onPick={onSearchPick} regionCodes={REGION_CODES} near={origin ?? DEFAULT_CENTER} />
          <CoordInput onAdd={onCoordsAdd} />
          <p className="hint">
            También puedes <b>tocar el mapa</b> para poner un pin. El primer punto es el origen; arrastra los pines para
            ajustarlos.
          </p>
        </section>

        <section className="block">
          <div className="block-head">
            <h2>
              Paradas <span className="muted">({stops.length}/{MAX_STOPS})</span>
            </h2>
          </div>
          <StopList
            origin={origin}
            stops={stops}
            orderMap={orderMap}
            endMode={endMode}
            selectedId={selectedId}
            onSelect={focusStop}
            onRemove={(id) => dispatch({ type: 'remove', id })}
            onMakeOrigin={(id) => dispatch({ type: 'makeOrigin', id })}
            onToggleFinal={(id) =>
              dispatch({
                type: 'setEndMode',
                endMode: finalStopId === id ? { kind: 'origin' } : { kind: 'stop', stopId: id },
              })
            }
            onRename={(id, label) => dispatch({ type: 'rename', id, label })}
            onLoadDemo={loadDemo}
          />
        </section>

        <section className="block">
          <h2>Opciones</h2>

          <div className="field">
            <span className="field-label">La ruta termina</span>
            <div className="seg">
              <button
                type="button"
                className={endMode.kind === 'origin' ? 'on' : ''}
                onClick={() => dispatch({ type: 'setEndMode', endMode: { kind: 'origin' } })}
              >
                En el origen
              </button>
              <button
                type="button"
                className={endMode.kind === 'stop' ? 'on' : ''}
                disabled={endMode.kind !== 'stop'}
                title="Marca una parada con ⚑ en la lista"
              >
                En parada ⚑
              </button>
              <button
                type="button"
                className={endMode.kind === 'best' ? 'on' : ''}
                onClick={() => dispatch({ type: 'setEndMode', endMode: { kind: 'best' } })}
                title="La app elige la mejor parada final"
              >
                Donde sea mejor
              </button>
            </div>
            <p className="hint">
              {endMode.kind === 'origin' && 'Ida y vuelta: sale del origen, visita todas las paradas y regresa al origen.'}
              {endMode.kind === 'stop' && 'La ruta termina en la parada marcada con ⚑; las demás se ordenan antes.'}
              {endMode.kind === 'best' &&
                'La app prueba cada parada como posible final y elige la que da el menor tiempo total.'}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Ordenar paradas por</span>
            <div className="seg seg-2">
              <button
                type="button"
                className={orderMode === 'traffic' ? 'on' : ''}
                onClick={() => dispatch({ type: 'setOrderMode', value: 'traffic' })}
                title="Matriz de tiempos con tráfico en vivo (varias consultas)"
              >
                Tiempo con tráfico
              </button>
              <button
                type="button"
                className={orderMode === 'distance' ? 'on' : ''}
                onClick={() => dispatch({ type: 'setOrderMode', value: 'distance' })}
                title="Reordenamiento de TomTom por distancia (una consulta)"
              >
                Distancia
              </button>
            </div>
            <p className="hint">
              {orderMode === 'traffic'
                ? 'Pide a TomTom cuánto se demora ir de cada parada a cada otra con el tráfico actual y elige el orden de menor tiempo total. Es el más preciso; usa 2 consultas hasta 9 paradas.'
                : 'TomTom reordena las paradas para recorrer menos kilómetros, en 1 sola consulta. Los tiempos que se muestran sí consideran tráfico, pero el orden no lo tiene en cuenta.'}
            </p>
          </div>

          <div className="field row">
            <label className="field-label" htmlFor="departure">
              Hora de salida
            </label>
            <input
              id="departure"
              type="datetime-local"
              className="input input-sm"
              value={departureInputValue}
              onChange={(e) =>
                dispatch({
                  type: 'setDeparture',
                  value: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
            />
            {departureTime && (
              <button type="button" className="link" onClick={() => dispatch({ type: 'setDeparture', value: null })}>
                Ahora
              </button>
            )}
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={avoidTolls}
              onChange={(e) => dispatch({ type: 'setAvoidTolls', value: e.target.checked })}
            />
            Evitar peajes
          </label>
        </section>

        <div className="cta">
          <button type="button" className="btn btn-primary btn-lg" disabled={!canOptimize} onClick={optimize}>
            {loading ? 'Calculando con tráfico…' : routeStale ? 'Volver a optimizar' : 'Optimizar ruta'}
          </button>
          {!origin && <p className="hint">Primero define el origen.</p>}
          {origin && stops.length === 0 && <p className="hint">Agrega al menos una parada.</p>}
        </div>

        {route && (
          <RouteSummary
            route={route}
            stale={routeStale}
            originId={origin?.id ?? ''}
            departureLabel={departureLabel}
            onShare={share}
            selectedLeg={selectedLeg}
            onSelectLeg={selectLeg}
          />
        )}
      </aside>
    </div>
  );
}
