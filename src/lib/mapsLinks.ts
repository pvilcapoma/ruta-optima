import type { Stop } from '../types';

const MAX_WAYPOINTS_PER_LINK = 9; // límite de la Maps URLs API en móvil

function ll(s: Stop): string {
  return `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;
}

export type NavLink = { label: string; url: string; from: Stop; to: Stop; stops: number };

/**
 * Genera enlaces de navegación de Google Maps para una ruta ya ordenada.
 * Si hay más de 9 paradas intermedias, la divide en tramos consecutivos.
 */
export function buildNavigationLinks(ordered: Stop[]): NavLink[] {
  if (ordered.length < 2) return [];
  const links: NavLink[] = [];
  let start = 0;
  let tramo = 1;
  while (start < ordered.length - 1) {
    const end = Math.min(start + MAX_WAYPOINTS_PER_LINK + 1, ordered.length - 1);
    const from = ordered[start];
    const to = ordered[end];
    const middle = ordered.slice(start + 1, end);
    const params = new URLSearchParams({
      api: '1',
      origin: ll(from),
      destination: ll(to),
      travelmode: 'driving',
    });
    if (middle.length) params.set('waypoints', middle.map(ll).join('|'));
    links.push({
      label: `Tramo ${tramo}`,
      url: `https://www.google.com/maps/dir/?${params.toString()}`,
      from,
      to,
      stops: end - start,
    });
    start = end;
    tramo += 1;
  }
  return links;
}

export function singlePointLink(s: Stop): string {
  return `https://www.google.com/maps/search/?api=1&query=${ll(s)}`;
}
