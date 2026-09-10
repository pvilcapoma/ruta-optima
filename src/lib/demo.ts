import type { PlannerState, Stop, StopOrder } from '../types';
import { newId } from './id';

type DemoPlace = {
  razonSocial: string;
  direccion: string;
  lat: number;
  lng: number;
  telefono: string;
  telefonoAdicional?: string;
  referencias: string;
  gr: string;
  bultos: number;
};

/**
 * Reparto de ejemplo por Lima (negocios ficticios en lugares reales) para ver cómo queda
 * una ruta optimizada y el resumen para portapapeles. Coordenadas de TomTom Search.
 */
export const DEMO_ORIGIN = { label: 'Almacén Gamarra, La Victoria', lat: -12.0657, lng: -77.01227 };

export const DEMO_STOPS: DemoPlace[] = [
  { razonSocial: 'Ferretería El Tornillo SAC', direccion: 'Av. La Marina 2040, San Miguel', lat: -12.077134, lng: -77.082687, telefono: '987 654 321', referencias: 'Frente a Plaza San Miguel, portón azul con letrero rojo', gr: 'T001-000451', bultos: 5 },
  { razonSocial: 'Distribuidora Kennedy EIRL', direccion: 'Av. Benavides cdra. 4, Miraflores', lat: -12.121911, lng: -77.03054, telefono: '912 345 678', telefonoAdicional: '01 445 6677', referencias: 'A media cuadra del Parque Kennedy, local con toldo verde', gr: 'T001-000452', bultos: 2 },
  { razonSocial: 'Repuestos Gutiérrez SRL', direccion: 'Av. Emilio Cavenecia 170, San Isidro', lat: -12.109228, lng: -77.037823, telefono: '956 111 222', referencias: 'Óvalo Gutiérrez, junto a la farmacia, segundo piso', gr: 'T001-000453', bultos: 8 },
  { razonSocial: 'Comercial Salaverry SAC', direccion: 'Av. Salaverry 2370, Jesús María', lat: -12.089008, lng: -77.051857, telefono: '944 333 444', referencias: 'Real Plaza Salaverry, entrada de proveedores por el sótano', gr: 'T001-000454', bultos: 12 },
  { razonSocial: 'Taller Surco Motors', direccion: 'Av. Javier Prado Este 4200, Santiago de Surco', lat: -12.085727, lng: -76.975795, telefono: '933 555 666', referencias: 'Al costado del Jockey Plaza, taller con fachada gris y puerta metálica', gr: 'T001-000455', bultos: 1 },
  { razonSocial: 'Bodega Malecón', direccion: 'Malecón de la Reserva 610, Miraflores', lat: -12.132074, lng: -77.030385, telefono: '922 777 888', referencias: 'Larcomar, zona de carga nivel -2', gr: 'T001-000456', bultos: 3 },
  { razonSocial: 'Abarrotes Doña Rosa', direccion: 'Jr. Ayacucho 700, Cercado de Lima', lat: -12.04993, lng: -77.026447, telefono: '911 999 000', referencias: 'Mercado Central, puesto 45 del pasillo principal', gr: 'T001-000457', bultos: 6 },
];

function demoOrder(p: DemoPlace): StopOrder {
  return {
    addressKind: 'principal',
    gr: p.gr,
    bultos: p.bultos,
    razonSocial: p.razonSocial,
    telefono: p.telefono,
    telefonoAdicional: p.telefonoAdicional,
    direccionTexto: p.direccion,
    referencias: p.referencias,
  };
}

export function buildDemoState(): PlannerState {
  const stops: Stop[] = DEMO_STOPS.map((p) => ({
    id: newId(),
    lat: p.lat,
    lng: p.lng,
    label: p.razonSocial,
    source: 'demo',
    order: demoOrder(p),
  }));
  return {
    origin: { id: newId(), lat: DEMO_ORIGIN.lat, lng: DEMO_ORIGIN.lng, label: DEMO_ORIGIN.label, source: 'demo' },
    stops,
    endMode: { kind: 'origin' },
    orderMode: 'traffic',
    avoidTolls: false,
    departureTime: null,
  };
}
