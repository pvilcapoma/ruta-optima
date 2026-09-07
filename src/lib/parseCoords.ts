import type { LatLng } from '../types';

const COORD_PAIR = /(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/;

function valid(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function pair(a: string, b: string): LatLng | null {
  const lat = Number.parseFloat(a);
  const lng = Number.parseFloat(b);
  return valid(lat, lng) ? { lat, lng } : null;
}

/**
 * Extrae coordenadas de un texto. Acepta:
 *  - "-12.0464, -77.0428"  /  "-12.0464 -77.0428"
 *  - geo:-12.0464,-77.0428
 *  - Enlaces de Google Maps:
 *      https://maps.google.com/?q=-12.04,-77.03            (ubicación compartida por WhatsApp)
 *      https://www.google.com/maps/search/?api=1&query=-12.04,-77.03
 *      https://www.google.com/maps/place/.../@-12.04,-77.03,17z
 *      https://www.google.com/maps/@-12.04,-77.03,15z
 *      https://www.google.com/maps/dir/.../!3d-12.04!4d-77.03
 *      https://www.google.com/maps?ll=-12.04,-77.03
 *  Devuelve null si no encuentra nada (p. ej. enlaces cortos maps.app.goo.gl,
 *  que requieren resolverse en servidor).
 */
export function parseCoordinates(input: string): LatLng | null {
  const text = input.trim();
  if (!text) return null;

  // geo: URI
  const geo = text.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (geo) return pair(geo[1], geo[2]);

  if (/^https?:\/\//i.test(text)) {
    let url: URL | null = null;
    try {
      url = new URL(text);
    } catch {
      url = null;
    }
    if (url) {
      // Parámetros de consulta comunes: q, query, ll, destination, center
      for (const key of ['q', 'query', 'll', 'destination', 'center', 'daddr', 'saddr']) {
        const v = url.searchParams.get(key);
        if (v) {
          const m = v.match(COORD_PAIR);
          if (m) {
            const p = pair(m[1], m[2]);
            if (p) return p;
          }
        }
      }
      // Marcador de lugar exacto en la ruta: !3d<lat>!4d<lng>
      const bang = url.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
      if (bang) {
        const p = pair(bang[1], bang[2]);
        if (p) return p;
      }
      // Centro del mapa: /@<lat>,<lng>,<zoom>
      const at = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      if (at) {
        const p = pair(at[1], at[2]);
        if (p) return p;
      }
    }
  }

  // Texto plano "lat, lng"
  const m = text.match(COORD_PAIR);
  if (m) return pair(m[1], m[2]);
  return null;
}

export type ParsedLine = { raw: string; coords: LatLng | null; label?: string };

/**
 * Procesa varias líneas a la vez. Cada línea puede terminar con una etiqueta
 * separada por "|" o tabulación, p. ej. "-12.04,-77.03 | Cliente Pérez".
 */
export function parseBulk(input: string): ParsedLine[] {
  return input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((raw) => {
      const [main, ...rest] = raw.split(/\s*[|\t]\s*/);
      const label = rest.join(' ').trim() || undefined;
      return { raw, coords: parseCoordinates(main), label };
    });
}

export function isShortMapsLink(input: string): boolean {
  return /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(input.trim());
}
