export type LatLng = { lat: number; lng: number };

export type StopSource = 'map' | 'search' | 'coords' | 'gps' | 'share' | 'demo';

export type Stop = LatLng & {
  id: string;
  /** Dirección o nombre legible. Puede faltar si aún no se geocodificó. */
  label?: string;
  source: StopSource;
};

/** Cómo debe terminar la ruta. */
export type EndMode =
  | { kind: 'origin' } // volver al punto de partida
  | { kind: 'stop'; stopId: string } // terminar en una parada elegida
  | { kind: 'best' }; // el sistema elige la mejor parada final

/** Criterio para ordenar las paradas. */
export type OrderMode =
  | 'traffic' // matriz de tiempos con tráfico + orden resuelto en la app (varias consultas)
  | 'distance'; // computeBestOrder de TomTom (una consulta; tiempos igual con tráfico)

export type PlannerState = {
  origin: Stop | null;
  stops: Stop[];
  endMode: EndMode;
  orderMode: OrderMode;
  avoidTolls: boolean;
  /** ISO string; null = salir ahora */
  departureTime: string | null;
};

export type RouteLeg = {
  from: Stop;
  to: Stop;
  distanceMeters: number;
  /** segundos, considerando tráfico */
  durationSec: number;
  /** segundos, sin tráfico */
  staticDurationSec: number;
  path: LatLng[];
};

export type OptimizedRoute = {
  /** Paradas en el orden óptimo: [origen, ...paradas, destino] */
  ordered: Stop[];
  legs: RouteLeg[];
  distanceMeters: number;
  durationSec: number;
  staticDurationSec: number;
  path: LatLng[];
  computedAt: number;
  /** Número de llamadas a la API que costó este cálculo */
  requests: number;
  /** Cómo se decidió el orden */
  method: 'traffic' | 'distance' | 'fixed';
  warnings: string[];
};
