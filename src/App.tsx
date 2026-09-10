import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AddressKind, Customer, LatLng, OptimizedRoute, Stop, StopSource } from './types';
import { usePlanner } from './hooks/usePlanner';
import { useReverseGeocode } from './hooks/useGeocoder';
import { useCustomers } from './hooks/useCustomers';
import { MAX_STOPS, planRoute } from './lib/routes';
import { TomTomError } from './lib/tomtom';
import { encodeShare } from './lib/storage';
import { buildDemoState } from './lib/demo';
import { customerToStop, exportCustomersJson, parseCustomersJson, type CustomerDraft } from './lib/customers';
import { buildDeliverySummary, deliveryPoints } from './lib/clipboard';
import { newId } from './lib/id';
import { formatClock } from './lib/format';
import { MapView, type CameraRequest, type CameraTarget, type CustomerPin } from './components/MapView';
import { SearchBox } from './components/SearchBox';
import { CoordInput } from './components/CoordInput';
import { StopList } from './components/StopList';
import { RouteSummary } from './components/RouteSummary';
import { SetupScreen } from './components/SetupScreen';
import { CustomerForm, type PickedPoint } from './components/CustomerForm';
import { CustomerList } from './components/CustomerList';

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
type Tab = 'ruta' | 'clientes';
type Editing = { kind: 'new' } | { kind: 'edit'; customer: Customer } | null;

export default function App() {
  if (!API_KEY || API_KEY === 'TU_CLAVE_AQUI') return <SetupScreen />;
  return <Planner apiKey={API_KEY} />;
}

function Planner({ apiKey }: { apiKey: string }) {
  const [state, dispatch] = usePlanner();
  const reverseGeocode = useReverseGeocode(apiKey);
  const { customers, upsert, remove: removeCustomer, importMany } = useCustomers();

  const [tab, setTab] = useState<Tab>('ruta');
  const [editing, setEditing] = useState<Editing>(null);
  const [pickTarget, setPickTarget] = useState<AddressKind | null>(null);
  const [picked, setPicked] = useState<PickedPoint | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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

  /** Resumen para el chofer con los datos actuales de cada parada, en el orden optimizado. */
  const clipboardText = useMemo(() => {
    if (!route) return '';
    const current = new Map(stops.map((s) => [s.id, s]));
    const ordered = route.ordered.map((s) => current.get(s.id) ?? s);
    return buildDeliverySummary(deliveryPoints(ordered, origin?.id));
  }, [route, stops, origin]);

  const inRoute = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stops) {
      const id = s.order?.customerId;
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [stops]);

  const customerPins = useMemo<CustomerPin[]>(
    () =>
      tab === 'clientes'
        ? customers.flatMap((c) => [
            { id: c.id, lat: c.direccion.lat, lng: c.direccion.lng, label: c.razonSocial },
            ...(c.direccionSecundaria
              ? [{ id: `${c.id}|2`, lat: c.direccionSecundaria.lat, lng: c.direccionSecundaria.lng, label: `${c.razonSocial} (secundaria)` }]
              : []),
          ])
        : [],
    [tab, customers],
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

  useEffect(() => {
    if (!origin) setOthersOpen(true);
  }, [origin]);

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

  const onMapClick = useCallback(
    (ll: LatLng) => {
      if (pickTarget) {
        setPicked({ target: pickTarget, lat: ll.lat, lng: ll.lng, nonce: Date.now() });
        setPickTarget(null);
        return;
      }
      if (tab !== 'ruta') return;
      addPoints([ll], 'map', false);
    },
    [pickTarget, tab, addPoints],
  );

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

  /* ---------- Clientes ---------- */

  const addCustomerToRoute = (c: Customer, kind: AddressKind, gr: string, bultos: number | null) => {
    if (stops.length >= MAX_STOPS) {
      setNotice({ kind: 'error', text: `Máximo ${MAX_STOPS} paradas por ruta.` });
      return;
    }
    const stop = customerToStop(c, kind, gr, bultos);
    dispatch({ type: 'addStops', stops: [stop] });
    moveCamera({ kind: 'point', lat: stop.lat, lng: stop.lng });
    setNotice({
      kind: 'info',
      text: origin
        ? `${c.razonSocial} agregado a la ruta (${stops.length + 1} ${stops.length + 1 === 1 ? 'parada' : 'paradas'}).`
        : `${c.razonSocial} agregado. Falta el origen (almacén): defínelo en "Otros puntos" o con Mi ubicación.`,
    });
  };

  const saveCustomer = (draft: CustomerDraft, id?: string) => {
    const saved = upsert(draft, id);
    dispatch({ type: 'applyCustomer', customer: saved });
    setEditing(null);
    setPickTarget(null);
    setNotice({ kind: 'info', text: id ? 'Cliente actualizado.' : `Cliente "${saved.razonSocial}" registrado.` });
  };

  const deleteCustomer = (c: Customer) => {
    if (!window.confirm(`¿Eliminar a "${c.razonSocial}"? Las paradas ya agregadas a la ruta de hoy se mantienen.`)) return;
    removeCustomer(c.id);
    if (editing?.kind === 'edit' && editing.customer.id === c.id) setEditing(null);
  };

  const locateCustomer = (c: Customer) => moveCamera({ kind: 'point', lat: c.direccion.lat, lng: c.direccion.lng, zoom: 16 });

  const onCustomerPinClick = (pinId: string) => {
    const id = pinId.split('|')[0];
    const c = customers.find((x) => x.id === id);
    if (c) setEditing({ kind: 'edit', customer: c });
  };

  const exportCustomers = () => {
    const blob = new Blob([exportCustomersJson(customers)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-ruta-optima-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importCustomers = async (file: File) => {
    try {
      const list = parseCustomersJson(await file.text());
      const replace =
        customers.length > 0 &&
        window.confirm(
          `El archivo tiene ${list.length} clientes. ¿Reemplazar la lista actual (${customers.length})?\n\nAceptar = reemplazar · Cancelar = combinar sin borrar.`,
        );
      importMany(list, replace ? 'replace' : 'merge');
      setNotice({ kind: 'info', text: `${list.length} clientes importados.` });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo importar el archivo.' });
    }
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
    setTab('ruta');
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
    if (stops.length + (origin ? 1 : 0) > 0 && !window.confirm('¿Borrar origen, paradas y ruta? Los clientes registrados no se borran.')) return;
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

  const near = origin ?? DEFAULT_CENTER;

  return (
    <div className="app">
      <main className="map">
        <MapView
          apiKey={apiKey}
          center={origin ?? stops[0] ?? DEFAULT_CENTER}
          origin={origin}
          stops={tab === 'ruta' ? stops : []}
          orderMap={orderMap}
          finalStopId={finalStopId}
          route={tab === 'ruta' ? route : null}
          routeStale={routeStale}
          highlightPath={tab === 'ruta' ? highlightPath : null}
          showTraffic={showTraffic}
          selectedId={selectedId}
          camera={camera}
          onMapClick={onMapClick}
          onMarkerClick={setSelectedId}
          onMarkerDragEnd={(id, ll) => {
            dispatch({ type: 'move', id, lat: ll.lat, lng: ll.lng });
            const s = id === origin?.id ? origin : stops.find((x) => x.id === id);
            if (s && !s.order?.customerId) void fillLabel({ ...s, lat: ll.lat, lng: ll.lng, label: undefined });
          }}
          customerPins={customerPins}
          onCustomerClick={onCustomerPinClick}
          pickMode={pickTarget !== null}
        />
        <div className="map-overlay">
          {pickTarget ? (
            <button type="button" className="chip chip-pick" onClick={() => setPickTarget(null)}>
              Toca el mapa para fijar la dirección {pickTarget} · cancelar
            </button>
          ) : (
            <>
              <label className="chip">
                <input type="checkbox" checked={showTraffic} onChange={(e) => setShowTraffic(e.target.checked)} />
                Tráfico
              </label>
              <button type="button" className="chip" onClick={useMyLocation} title="Usar mi ubicación como origen">
                ◎ Mi ubicación
              </button>
            </>
          )}
        </div>
      </main>

      <aside className="panel">
        <header className="panel-head">
          <h1>Ruta Óptima</h1>
          <nav className="tabs" aria-label="Secciones">
            <button type="button" className={tab === 'ruta' ? 'on' : ''} onClick={() => setTab('ruta')}>
              Ruta{stops.length > 0 && <span className="count">{stops.length}</span>}
            </button>
            <button type="button" className={tab === 'clientes' ? 'on' : ''} onClick={() => setTab('clientes')}>
              Clientes<span className="count">{customers.length}</span>
            </button>
          </nav>
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

        {tab === 'clientes' && (
          <>
            <section className="block">
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={() => setEditing({ kind: 'new' })}>
                  + Nuevo cliente
                </button>
                <button type="button" className="btn btn-ghost" onClick={exportCustomers} disabled={customers.length === 0}>
                  Exportar
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
                  Importar
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importCustomers(f);
                    e.target.value = '';
                  }}
                />
              </div>
              <p className="hint">
                Los clientes se guardan en este dispositivo (navegador). Exporta un respaldo de vez en cuando y úsalo para
                pasar la lista a otro equipo.
              </p>
            </section>

            {editing && (
              <CustomerForm
                key={editing.kind === 'edit' ? editing.customer.id : 'new'}
                apiKey={apiKey}
                regionCodes={REGION_CODES}
                near={near}
                initial={editing.kind === 'edit' ? editing.customer : null}
                picked={picked}
                pickTarget={pickTarget}
                onPickTarget={setPickTarget}
                onLocate={(p) => moveCamera({ kind: 'point', lat: p.lat, lng: p.lng, zoom: 16 })}
                reverseGeocode={reverseGeocode}
                onSave={saveCustomer}
                onCancel={() => {
                  setEditing(null);
                  setPickTarget(null);
                }}
              />
            )}

            <section className="block">
              <h2>
                Clientes <span className="muted">({customers.length})</span>
              </h2>
              <CustomerList
                customers={customers}
                mode="manage"
                inRoute={inRoute}
                onAddToRoute={addCustomerToRoute}
                onLocate={locateCustomer}
                onEdit={(c) => setEditing({ kind: 'edit', customer: c })}
                onDelete={deleteCustomer}
                onNew={() => setEditing({ kind: 'new' })}
              />
            </section>
          </>
        )}

        {tab === 'ruta' && (
          <>
            <div className="toolbar">
              <button type="button" className="link" onClick={loadDemo} title="Cargar un reparto de ejemplo por Lima">
                Ejemplo
              </button>
              <button type="button" className="link" onClick={clearAll} disabled={!origin && stops.length === 0}>
                Limpiar
              </button>
            </div>

            <section className="block">
              <div className="block-head">
                <h2>Agregar clientes a la ruta</h2>
                <button type="button" className="link" onClick={() => setTab('clientes')}>
                  Gestionar →
                </button>
              </div>
              <CustomerList
                customers={customers}
                mode="pick"
                inRoute={inRoute}
                onAddToRoute={addCustomerToRoute}
                onLocate={locateCustomer}
                onNew={() => {
                  setTab('clientes');
                  setEditing({ kind: 'new' });
                }}
              />
            </section>

            <details className="block" open={othersOpen} onToggle={(e) => setOthersOpen((e.target as HTMLDetailsElement).open)}>
              <summary>Otros puntos: origen, direcciones o coordenadas</summary>
              <SearchBox apiKey={apiKey} onPick={onSearchPick} regionCodes={REGION_CODES} near={near} />
              <CoordInput onAdd={onCoordsAdd} />
              <p className="hint">
                El primer punto que agregues aquí (o tocando el mapa) es el <b>origen</b>, normalmente el almacén. Los
                siguientes son paradas sueltas sin cliente. Arrastra los pines para ajustarlos.
              </p>
            </details>

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
                onOrderChange={(id, patch) => dispatch({ type: 'setOrder', id, patch })}
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
                  >
                    Tiempo con tráfico
                  </button>
                  <button
                    type="button"
                    className={orderMode === 'distance' ? 'on' : ''}
                    onClick={() => dispatch({ type: 'setOrderMode', value: 'distance' })}
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
              {!origin && <p className="hint">Primero define el origen (almacén).</p>}
              {origin && stops.length === 0 && <p className="hint">Agrega al menos una parada.</p>}
            </div>

            {route && (
              <RouteSummary
                route={route}
                stale={routeStale}
                originId={origin?.id ?? ''}
                departureLabel={departureLabel}
                clipboardText={clipboardText}
                onShare={share}
                selectedLeg={selectedLeg}
                onSelectLeg={selectLeg}
              />
            )}
          </>
        )}
      </aside>
    </div>
  );
}
