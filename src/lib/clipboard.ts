import type { Stop } from '../types';
import { formatCoords } from './format';

/** Paradas de entrega en orden de visita, sin el origen ni el regreso. */
export function deliveryPoints(ordered: Stop[], originId: string | undefined): Stop[] {
  return ordered.filter((s) => s.id !== originId);
}

/**
 * Resumen para portapapeles con el formato obligatorio, un bloque por punto:
 *
 *   Punto N: Razón Social
 *   Contacto: Teléfono (/ Teléfono adicional)
 *   Dirección: texto o coordenadas
 *   Referencia: descripción del local
 *   G/R: número de guía
 *   Bultos: cantidad
 *
 *   ---
 */
export function buildDeliverySummary(points: Stop[]): string {
  const blocks = points.map((s, i) => {
    const o = s.order;
    const nombre = (o?.razonSocial || s.label || `Parada ${i + 1}`).trim();
    const contacto = [o?.telefono, o?.telefonoAdicional]
      .map((t) => t?.trim())
      .filter(Boolean)
      .join(' / ');
    const direccion = o?.direccionTexto?.trim() || formatCoords(s.lat, s.lng, 6);
    const referencia = o?.referencias?.trim() || '';
    const gr = o?.gr?.trim() || '';
    const bultos = o?.bultos ?? null;
    return [
      `Punto ${i + 1}: ${nombre}`,
      `Contacto: ${contacto || '-'}`,
      `Dirección: ${direccion}`,
      `Referencia: ${referencia || '-'}`,
      `G/R: ${gr || '-'}`,
      `Bultos: ${bultos === null ? '-' : bultos}`,
    ].join('\n');
  });
  if (blocks.length === 0) return '';
  return blocks.map((b) => `${b}\n\n---`).join('\n\n') + '\n';
}

/** Envuelve el texto en un bloque de código (WhatsApp y otros lo muestran monoespaciado). */
export function wrapCodeBlock(text: string): string {
  return '```\n' + text.replace(/\n?$/, '\n') + '```';
}
