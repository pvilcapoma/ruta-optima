export function formatDuration(totalSec: number): string {
  const sec = Math.round(totalSec);
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatCoords(lat: number, lng: number, digits = 5): string {
  return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`;
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
