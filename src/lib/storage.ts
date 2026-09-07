import type { PlannerState, Stop } from '../types';
import { newId } from './id';

const STORAGE_KEY = 'ruta-optima:v2';

export const defaultState: PlannerState = {
  origin: null,
  stops: [],
  endMode: { kind: 'origin' },
  orderMode: 'traffic',
  avoidTolls: false,
  departureTime: null,
};

function isStop(v: unknown): v is Stop {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return typeof s.id === 'string' && typeof s.lat === 'number' && typeof s.lng === 'number';
}

function sanitize(raw: unknown): PlannerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<PlannerState>;
  const stops = Array.isArray(r.stops) ? r.stops.filter(isStop) : [];
  const origin = isStop(r.origin) ? r.origin : null;
  let endMode: PlannerState['endMode'] = { kind: 'origin' };
  const em = r.endMode;
  if (em && typeof em === 'object') {
    if (em.kind === 'best') endMode = { kind: 'best' };
    else if (em.kind === 'stop' && stops.some((s) => s.id === em.stopId)) endMode = em;
  }
  return {
    origin,
    stops,
    endMode,
    orderMode: r.orderMode === 'distance' ? 'distance' : 'traffic',
    avoidTolls: Boolean(r.avoidTolls),
    departureTime: typeof r.departureTime === 'string' ? r.departureTime : null,
  };
}

export function loadState(): PlannerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveState(state: PlannerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* almacenamiento no disponible */
  }
}

/* ---------- Compartir por URL (#d=...) ---------- */

type Packed = [number, number, string?];

type Compact = {
  o?: Packed;
  s: Packed[];
  e?: 'o' | 'b' | number; // origen | mejor | índice de parada final
  m?: 'd'; // orden por distancia
  t?: 1; // evitar peajes
};

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): string {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function pack(s: Stop): Packed {
  return s.label ? [round(s.lat), round(s.lng), s.label] : [round(s.lat), round(s.lng)];
}

export function encodeShare(state: PlannerState): string {
  const c: Compact = { s: state.stops.map(pack) };
  if (state.origin) c.o = pack(state.origin);
  if (state.endMode.kind === 'best') c.e = 'b';
  else if (state.endMode.kind === 'stop') {
    const target = state.endMode.stopId;
    const i = state.stops.findIndex((s) => s.id === target);
    if (i >= 0) c.e = i;
  }
  if (state.orderMode === 'distance') c.m = 'd';
  if (state.avoidTolls) c.t = 1;
  return `${location.origin}${location.pathname}#d=${toBase64Url(JSON.stringify(c))}`;
}

export function decodeShare(hash: string): PlannerState | null {
  const m = hash.match(/[#&]d=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const c = JSON.parse(fromBase64Url(m[1])) as Compact;
    const unpack = (t: Packed): Stop => ({ id: newId(), lat: t[0], lng: t[1], label: t[2], source: 'share' });
    const stops = (c.s ?? []).map(unpack);
    const origin = c.o ? unpack(c.o) : null;
    let endMode: PlannerState['endMode'] = { kind: 'origin' };
    if (c.e === 'b') endMode = { kind: 'best' };
    else if (typeof c.e === 'number' && stops[c.e]) endMode = { kind: 'stop', stopId: stops[c.e].id };
    return {
      origin,
      stops,
      endMode,
      orderMode: c.m === 'd' ? 'distance' : 'traffic',
      avoidTolls: c.t === 1,
      departureTime: null,
    };
  } catch {
    return null;
  }
}
