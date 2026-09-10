import type { AddressKind, Customer, CustomerAddress, Stop, StopOrder } from '../types';
import { newId } from './id';

const STORAGE_KEY = 'ruta-optima:clientes:v1';

export type CustomerDraft = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;

/* ---------------- Persistencia ---------------- */

function isAddress(v: unknown): v is CustomerAddress {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.lat === 'number' &&
    typeof a.lng === 'number' &&
    Number.isFinite(a.lat) &&
    Number.isFinite(a.lng) &&
    Math.abs(a.lat) <= 90 &&
    Math.abs(a.lng) <= 180
  );
}

function sanitizeCustomer(raw: unknown): Customer | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.razonSocial !== 'string' || !r.razonSocial.trim()) return null;
  if (!isAddress(r.direccion)) return null;
  const now = Date.now();
  const c: Customer = {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    razonSocial: r.razonSocial.trim(),
    direccion: { texto: String((r.direccion as CustomerAddress).texto ?? '').trim(), lat: r.direccion.lat, lng: r.direccion.lng },
    telefono: typeof r.telefono === 'string' ? r.telefono.trim() : '',
    referencias: typeof r.referencias === 'string' ? r.referencias.trim() : '',
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
  if (isAddress(r.direccionSecundaria)) {
    c.direccionSecundaria = {
      texto: String((r.direccionSecundaria as CustomerAddress).texto ?? '').trim(),
      lat: r.direccionSecundaria.lat,
      lng: r.direccionSecundaria.lng,
    };
  }
  if (typeof r.telefonoAdicional === 'string' && r.telefonoAdicional.trim()) {
    c.telefonoAdicional = r.telefonoAdicional.trim();
  }
  return c;
}

export function sortCustomers(list: Customer[]): Customer[] {
  return [...list].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es'));
}

export function loadCustomers(): Customer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortCustomers(parsed.map(sanitizeCustomer).filter((c): c is Customer => c !== null));
  } catch {
    return [];
  }
}

export function saveCustomers(list: Customer[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* almacenamiento no disponible */
  }
}

/* ---------------- Exportar / importar (respaldo JSON) ---------------- */

export function exportCustomersJson(list: Customer[]): string {
  return JSON.stringify({ app: 'ruta-optima', tipo: 'clientes', version: 1, exportado: new Date().toISOString(), clientes: list }, null, 2);
}

export function parseCustomersJson(text: string): Customer[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const list = Array.isArray(data) ? data : (data as { clientes?: unknown })?.clientes;
  if (!Array.isArray(list)) throw new Error('El archivo no contiene una lista de clientes.');
  const parsed = list.map(sanitizeCustomer).filter((c): c is Customer => c !== null);
  if (parsed.length === 0) throw new Error('Ningún cliente del archivo tiene razón social y dirección con coordenadas.');
  return parsed;
}

/* ---------------- Validación ---------------- */

export function validateCustomer(d: CustomerDraft): string[] {
  const errors: string[] = [];
  if (!d.razonSocial.trim()) errors.push('La razón social es obligatoria.');
  if (!isAddress(d.direccion)) errors.push('La dirección principal necesita una ubicación (búscala, pégala o elígela en el mapa).');
  if (!d.telefono.trim()) errors.push('El teléfono de contacto es obligatorio.');
  if (d.direccionSecundaria && !isAddress(d.direccionSecundaria)) {
    errors.push('La dirección secundaria necesita una ubicación o debe quitarse.');
  }
  return errors;
}

/* ---------------- Búsqueda ---------------- */

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function searchCustomers(list: Customer[], query: string): Customer[] {
  const q = norm(query.trim());
  if (!q) return list;
  const terms = q.split(/\s+/);
  return list.filter((c) => {
    const hay = norm(
      [c.razonSocial, c.telefono, c.telefonoAdicional ?? '', c.direccion.texto, c.direccionSecundaria?.texto ?? '', c.referencias].join(' '),
    );
    return terms.every((t) => hay.includes(t));
  });
}

/* ---------------- Cliente → parada de la ruta ---------------- */

export function customerAddress(c: Customer, kind: AddressKind): CustomerAddress {
  return kind === 'secundaria' && c.direccionSecundaria ? c.direccionSecundaria : c.direccion;
}

export function orderFromCustomer(c: Customer, kind: AddressKind, gr: string, bultos: number | null): StopOrder {
  const addr = customerAddress(c, kind);
  return {
    customerId: c.id,
    addressKind: c.direccionSecundaria ? kind : 'principal',
    gr: gr.trim(),
    bultos,
    razonSocial: c.razonSocial,
    telefono: c.telefono,
    telefonoAdicional: c.telefonoAdicional,
    direccionTexto: addr.texto,
    referencias: c.referencias,
  };
}

export function customerToStop(c: Customer, kind: AddressKind, gr: string, bultos: number | null): Stop {
  const addr = customerAddress(c, kind);
  return {
    id: newId(),
    lat: addr.lat,
    lng: addr.lng,
    label: c.razonSocial,
    source: 'customer',
    order: orderFromCustomer(c, kind, gr, bultos),
  };
}

/** Actualiza una parada con los datos actuales de su cliente, conservando G/R y bultos. */
export function refreshStopFromCustomer(stop: Stop, c: Customer): Stop {
  if (!stop.order || stop.order.customerId !== c.id) return stop;
  const kind: AddressKind = stop.order.addressKind === 'secundaria' && c.direccionSecundaria ? 'secundaria' : 'principal';
  const addr = customerAddress(c, kind);
  return {
    ...stop,
    lat: addr.lat,
    lng: addr.lng,
    label: c.razonSocial,
    order: orderFromCustomer(c, kind, stop.order.gr, stop.order.bultos),
  };
}

/** Convierte lo que escribe el usuario en el campo Bultos a número entero o null. */
export function parseBultos(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
