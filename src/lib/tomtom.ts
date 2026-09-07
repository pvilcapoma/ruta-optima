import type { LatLng } from '../types';

/**
 * Cliente mínimo de las APIs de TomTom usadas por la app.
 * Todas aceptan CORS desde el navegador y se autentican con ?key=.
 */

const BASE = 'https://api.tomtom.com';
export const LANGUAGE = 'es-ES';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.tomtom.com" target="_blank" rel="noreferrer">TomTom</a>';

export function baseTileUrl(apiKey: string): string {
  return `https://{s}.api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}&language=${LANGUAGE}`;
}

export function trafficTileUrl(apiKey: string): string {
  return `https://{s}.api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}`;
}

export class TomTomError extends Error {
  status: number;
  code?: string;
  hint?: string;
  constructor(message: string, status: number, code?: string, hint?: string) {
    super(message);
    this.name = 'TomTomError';
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

function hintFor(status: number, code: string | undefined, message: string): string | undefined {
  const m = `${code ?? ''} ${message}`.toUpperCase();
  if (status === 403) {
    return 'Clave inválida o sin permiso para este servicio. Revísala en developer.tomtom.com → My Dashboard → Keys (debe incluir Map Display, Routing, Search y Traffic).';
  }
  if (status === 429) {
    return 'Se agotó la cuota gratuita de TomTom para este servicio. Espera un momento o revisa el consumo en tu dashboard.';
  }
  if (m.includes('NO_ROUTE_FOUND')) {
    return 'No hay ruta en auto entre algunos puntos. Revisa que los pines estén cerca de una vía.';
  }
  if (m.includes('MAP_MATCHING_FAILURE')) {
    return 'Algún pin está lejos de una calle transitable. Arrástralo más cerca de la vía.';
  }
  if (status === 400) return 'Solicitud inválida. Revisa las coordenadas de las paradas.';
  if (status === 408 || status === 504) return 'TomTom tardó demasiado en responder. Intenta de nuevo.';
  return undefined;
}

type ErrorBody = {
  detailedError?: { code?: string; message?: string };
  errorText?: string;
  error?: { description?: string };
  message?: string;
};

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new TomTomError('Sin conexión con TomTom. Revisa tu internet.', 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = (body ?? {}) as ErrorBody;
    const code = b.detailedError?.code;
    const message =
      b.detailedError?.message ??
      b.errorText ??
      b.error?.description ??
      b.message ??
      (text && text.length < 200 ? text : `HTTP ${res.status}`);
    throw new TomTomError(message, res.status, code, hintFor(res.status, code, message));
  }
  return body as T;
}

function fmt(p: LatLng): string {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

/* ------------------------------------------------------------------ */
/* Routing API: Calculate Route                                        */
/* ------------------------------------------------------------------ */

export type RouteSummary = {
  lengthInMeters: number;
  travelTimeInSeconds: number;
  trafficDelayInSeconds: number;
  noTrafficTravelTimeInSeconds?: number;
};

export type RouteLegResult = RouteSummary & { points: LatLng[] };

export type OptimizedWaypoint = { providedIndex: number; optimizedIndex: number };

export type RouteResult = {
  summary: RouteSummary;
  legs: RouteLegResult[];
  optimizedWaypoints?: OptimizedWaypoint[];
};

type ApiSummary = Partial<RouteSummary>;

type ApiRouteResponse = {
  routes?: Array<{
    summary?: ApiSummary;
    legs?: Array<{ summary?: ApiSummary; points?: Array<{ latitude: number; longitude: number }> }>;
  }>;
  optimizedWaypoints?: OptimizedWaypoint[];
};

export type CalculateRouteInput = {
  apiKey: string;
  /** [origen, ...intermedias, destino] */
  locations: LatLng[];
  /** true → TomTom reordena las intermedias (heurística por distancia) */
  computeBestOrder: boolean;
  avoidTolls: boolean;
  /** 'now' o fecha RFC 3339 futura */
  departAt: string;
  signal?: AbortSignal;
};

export async function calculateRoute(input: CalculateRouteInput): Promise<RouteResult> {
  const { apiKey, locations, computeBestOrder, avoidTolls, departAt, signal } = input;
  if (locations.length < 2) throw new TomTomError('Se necesitan al menos origen y destino.', 400);

  const params = new URLSearchParams({
    key: apiKey,
    traffic: 'true',
    travelMode: 'car',
    routeType: 'fastest',
    computeBestOrder: String(computeBestOrder),
    computeTravelTimeFor: 'all',
    routeRepresentation: 'polyline',
    language: LANGUAGE,
    departAt,
  });
  if (avoidTolls) params.set('avoid', 'tollRoads');

  const url = `${BASE}/routing/1/calculateRoute/${locations.map(fmt).join(':')}/json?${params.toString()}`;
  const json = await request<ApiRouteResponse>(url, { signal });

  const route = json.routes?.[0];
  if (!route?.legs?.length) {
    throw new TomTomError('TomTom no devolvió ninguna ruta.', 404, 'NO_ROUTE_FOUND', hintFor(404, 'NO_ROUTE_FOUND', ''));
  }

  const norm = (s?: ApiSummary): RouteSummary => ({
    lengthInMeters: s?.lengthInMeters ?? 0,
    travelTimeInSeconds: s?.travelTimeInSeconds ?? 0,
    trafficDelayInSeconds: s?.trafficDelayInSeconds ?? 0,
    noTrafficTravelTimeInSeconds: s?.noTrafficTravelTimeInSeconds,
  });

  return {
    summary: norm(route.summary),
    legs: route.legs.map((l) => ({
      ...norm(l.summary),
      points: (l.points ?? []).map((p) => ({ lat: p.latitude, lng: p.longitude })),
    })),
    optimizedWaypoints: json.optimizedWaypoints,
  };
}

/* ------------------------------------------------------------------ */
/* Routing API: Matrix Routing v2 (síncrono, máx. 100 celdas/llamada)  */
/* ------------------------------------------------------------------ */

const MATRIX_MAX_CELLS = 100;

type MatrixResponse = {
  data?: Array<{
    originIndex: number;
    destinationIndex: number;
    routeSummary?: { travelTimeInSeconds?: number; lengthInMeters?: number; trafficDelayInSeconds?: number };
    detailedError?: { code?: string };
  }>;
};

export type MatrixInput = {
  apiKey: string;
  points: LatLng[];
  avoidTolls: boolean;
  departAt: string;
  signal?: AbortSignal;
};

/**
 * Matriz NxN de tiempos de viaje (segundos) con tráfico en vivo.
 * Divide en varias llamadas si N*N supera el límite síncrono. Celdas sin ruta → Infinity.
 */
export async function travelTimeMatrix(input: MatrixInput): Promise<{ matrix: number[][]; requests: number }> {
  const { apiKey, points, avoidTolls, departAt, signal } = input;
  const n = points.length;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  if (n === 0) return { matrix, requests: 0 };

  const destinations = points.map((p) => ({ point: { latitude: p.lat, longitude: p.lng } }));
  const options: Record<string, unknown> = { departAt, routeType: 'fastest', traffic: 'live', travelMode: 'car' };
  if (avoidTolls) options.avoid = ['tollRoads'];

  const perCall = Math.max(1, Math.floor(MATRIX_MAX_CELLS / n));
  const batches: number[][] = [];
  for (let i = 0; i < n; i += perCall) {
    batches.push(Array.from({ length: Math.min(perCall, n - i) }, (_, k) => i + k));
  }

  await Promise.all(
    batches.map(async (originIdx) => {
      const body = { origins: originIdx.map((i) => destinations[i]), destinations, options };
      const json = await request<MatrixResponse>(`${BASE}/routing/matrix/2?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      for (const cell of json.data ?? []) {
        const i = originIdx[cell.originIndex];
        const j = cell.destinationIndex;
        if (i === undefined || j === undefined || j >= n) continue;
        matrix[i][j] = cell.routeSummary?.travelTimeInSeconds ?? Infinity;
      }
    }),
  );

  for (let i = 0; i < n; i++) matrix[i][i] = 0;
  return { matrix, requests: batches.length };
}

/* ------------------------------------------------------------------ */
/* Search API: búsqueda difusa (autocompletado) y geocodificación inversa */
/* ------------------------------------------------------------------ */

export type SearchResult = {
  id: string;
  name?: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
};

type SearchResponse = {
  results?: Array<{
    id?: string;
    type?: string;
    poi?: { name?: string };
    address?: { freeformAddress?: string };
    position?: { lat: number; lon: number };
  }>;
};

export type SearchInput = {
  apiKey: string;
  query: string;
  near?: LatLng | null;
  countryCodes?: string[];
  limit?: number;
  signal?: AbortSignal;
};

export async function fuzzySearch(input: SearchInput): Promise<SearchResult[]> {
  const { apiKey, query, near, countryCodes, limit = 6, signal } = input;
  const params = new URLSearchParams({
    key: apiKey,
    typeahead: 'true',
    limit: String(limit),
    language: LANGUAGE,
    idxSet: 'POI,PAD,Str,Addr,Xstr',
  });
  if (countryCodes?.length) params.set('countrySet', countryCodes.map((c) => c.toUpperCase()).join(','));
  if (near) {
    params.set('lat', near.lat.toFixed(5));
    params.set('lon', near.lng.toFixed(5));
  }
  const url = `${BASE}/search/2/search/${encodeURIComponent(query)}.json?${params.toString()}`;
  const json = await request<SearchResponse>(url, { signal });
  return (json.results ?? [])
    .filter((r) => r.position)
    .map((r) => ({
      id: r.id ?? `${r.position!.lat},${r.position!.lon}`,
      name: r.poi?.name,
      address: r.address?.freeformAddress ?? '',
      lat: r.position!.lat,
      lng: r.position!.lon,
      type: r.type ?? '',
    }));
}

type ReverseResponse = {
  addresses?: Array<{
    address?: {
      streetName?: string;
      streetNumber?: string;
      municipalitySubdivision?: string;
      municipality?: string;
      freeformAddress?: string;
    };
  }>;
};

export async function reverseGeocode(input: { apiKey: string; lat: number; lng: number; signal?: AbortSignal }) {
  const { apiKey, lat, lng, signal } = input;
  const params = new URLSearchParams({ key: apiKey, language: LANGUAGE, radius: '150' });
  const url = `${BASE}/search/2/reverseGeocode/${lat.toFixed(6)},${lng.toFixed(6)}.json?${params.toString()}`;
  const json = await request<ReverseResponse>(url, { signal });
  const a = json.addresses?.[0]?.address;
  if (!a) return undefined;
  const street = [a.streetName, a.streetNumber].filter(Boolean).join(' ');
  const area = a.municipalitySubdivision || a.municipality;
  const label = [street, area].filter(Boolean).join(', ');
  return label || a.freeformAddress || undefined;
}
