import type { PlannerState, Stop, StopOrder } from '../types';
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

function sanitizeOrder(v: unknown): StopOrder | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  return {
    customerId: typeof o.customerId === 'string' ? o.customerId : undefined,
    addressKind: o.addressKind === 'secundaria' ? 'secundaria' : 'principal',
    gr: str(o.gr),
    bultos: typeof o.bultos === 'number' && Number.isFinite(o.bultos) ? o.bultos : null,
    razonSocial: str(o.razonSocial),
    telefono: str(o.telefono),
    telefonoAdicional: typeof o.telefonoAdicional === 'string' && o.telefonoAdicional ? o.telefonoAdicional : undefined,
    direccionTexto: str(o.direccionTexto),
    referencias: str(o.referencias),
  };
}

function sanitizeStop(s: Stop): Stop {
  const order = sanitizeOrder((s as Stop).order);
  return order ? { ...s, order } : { ...s, order: undefined };
}

function sanitize(raw: unknown): PlannerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<PlannerState>;
  const stops = Array.isArray(r.stops) ? r.stops.filter(isStop).map(sanitizeStop) : [];
  const origin = isStop(r.origin) ? sanitizeStop(r.origin) : null;
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

/** Orden compactada: claves cortas para que la URL no crezca tanto. */
type PackedOrder = {
  c?: string; // customerId
  k?: 's'; // dirección secundaria
  g?: string; // G/R
  b?: number; // bultos
  n?: string; // razón social
  t?: string; // teléfono
  u?: string; // teléfono adicional
  d?: string; // dirección texto
  r?: string; // referencias
};

type Packed = [number, number, (string | null)?, PackedOrder?];

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

function packOrder(o: StopOrder): PackedOrder {
  const p: PackedOrder = {};
  if (o.customerId) p.c = o.customerId;
  if (o.addressKind === 'secundaria') p.k = 's';
  if (o.gr) p.g = o.gr;
  if (o.bultos !== null) p.b = o.bultos;
  if (o.razonSocial) p.n = o.razonSocial;
  if (o.telefono) p.t = o.telefono;
  if (o.telefonoAdicional) p.u = o.telefonoAdicional;
  if (o.direccionTexto) p.d = o.direccionTexto;
  if (o.referencias) p.r = o.referencias;
  return p;
}

function unpackOrder(p: PackedOrder | undefined): StopOrder | undefined {
  if (!p) return undefined;
  return {
    customerId: p.c,
    addressKind: p.k === 's' ? 'secundaria' : 'principal',
    gr: p.g ?? '',
    bultos: typeof p.b === 'number' ? p.b : null,
    razonSocial: p.n ?? '',
    telefono: p.t ?? '',
    telefonoAdicional: p.u,
    direccionTexto: p.d ?? '',
    referencias: p.r ?? '',
  };
}

function pack(s: Stop): Packed {
  const base: Packed = [round(s.lat), round(s.lng)];
  if (s.label || s.order) base.push(s.label ?? null);
  if (s.order) base.push(packOrder(s.order));
  return base;
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
    const unpack = (t: Packed): Stop => ({
      id: newId(),
      lat: t[0],
      lng: t[1],
      label: t[2] ?? undefined,
      source: 'share',
      order: unpackOrder(t[3]),
    });
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
