import { useCallback } from 'react';
import { reverseGeocode } from '../lib/tomtom';

/**
 * Devuelve una función que convierte lat/lng en una dirección corta ("Av. X 123, Distrito").
 * Si la API falla, devuelve undefined y la parada se muestra con sus coordenadas.
 */
export function useReverseGeocode(apiKey: string): (lat: number, lng: number) => Promise<string | undefined> {
  return useCallback(
    async (lat: number, lng: number) => {
      try {
        return await reverseGeocode({ apiKey, lat, lng });
      } catch {
        return undefined;
      }
    },
    [apiKey],
  );
}
