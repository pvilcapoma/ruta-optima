export type LatLng = { lat: number; lng: number };

export type StopSource = 'map' | 'search' | 'coords' | 'gps' | 'share' | 'demo' | 'customer';

export type AddressKind = 'principal' | 'secundaria';

/** Dirección de un cliente: texto legible + coordenadas para el ruteo. */
export type CustomerAddress = {
  texto: string;
  lat: number;
  lng: number;
};

/** Datos fijos de un cliente (base de datos local). */
export type Customer = {
  id: string;
  razonSocial: string;
  direccion: CustomerAddress;
  telefono: string;
  referencias: string;
  direccionSecundaria?: CustomerAddress;
  telefonoAdicional?: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * Datos variables de la orden de entrega asociada a una parada, más una copia de los
 * datos del cliente en ese momento (así el resumen funciona aunque se comparta la ruta
 * a otro dispositivo que no tenga la base de clientes).
 */
export type StopOrder = {
  customerId?: string;
  addressKind: AddressKind;
  /** Número de Guía de Remisión */
  gr: string;
  /** Cantidad de bultos; null = sin indicar */
  bultos: number | null;
  razonSocial: string;
  telefono: string;
  telefonoAdicional?: string;
  direccionTexto: string;
  referencias: string;
};

export type Stop = LatLng & {
  id: string;
  /** Nombre legible (razón social o dirección). */
  label?: string;
  source: StopSource;
  order?: StopOrder;
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
