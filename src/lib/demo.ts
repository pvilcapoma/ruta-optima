import type { PlannerState, Stop } from '../types';
import { newId } from './id';

type DemoPlace = { label: string; lat: number; lng: number };

/**
 * Reparto de ejemplo por Lima para ver cómo queda una ruta optimizada.
 * Coordenadas obtenidas con TomTom Search el 2026-09-07.
 */
export const DEMO_ORIGIN: DemoPlace = { label: 'Gamarra, La Victoria', lat: -12.0657, lng: -77.01227 };

export const DEMO_STOPS: DemoPlace[] = [
  { label: 'Parque Kennedy, Miraflores', lat: -12.121911, lng: -77.03054 },
  { label: 'Óvalo Gutiérrez, San Isidro', lat: -12.109228, lng: -77.037823 },
  { label: 'Plaza San Miguel, San Miguel', lat: -12.077134, lng: -77.082687 },
  { label: 'Real Plaza Salaverry, Jesús María', lat: -12.089008, lng: -77.051857 },
  { label: 'Jockey Plaza, Santiago de Surco', lat: -12.085727, lng: -76.975795 },
  { label: 'Larcomar, Miraflores', lat: -12.132074, lng: -77.030385 },
  { label: 'Mercado Central, Cercado de Lima', lat: -12.04993, lng: -77.026447 },
];

export function buildDemoState(): PlannerState {
  const mk = (p: DemoPlace): Stop => ({ id: newId(), lat: p.lat, lng: p.lng, label: p.label, source: 'demo' });
  return {
    origin: mk(DEMO_ORIGIN),
    stops: DEMO_STOPS.map(mk),
    endMode: { kind: 'origin' },
    orderMode: 'traffic',
    avoidTolls: false,
    departureTime: null,
  };
}
