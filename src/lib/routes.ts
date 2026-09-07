import type { EndMode, OptimizedRoute, OrderMode, RouteLeg, Stop } from '../types';
import { calculateRoute, TomTomError, travelTimeMatrix, type OptimizedWaypoint, type RouteResult } from './tomtom';
import { solveOrder, type TspMode } from './tsp';

/** Límite práctico de paradas (mantiene la matriz de tiempos en ≤ 9 llamadas). */
export const MAX_STOPS = 25;

export type PlanInput = {
  apiKey: string;
  origin: Stop;
  stops: Stop[];
  endMode: EndMode;
  orderMode: OrderMode;
  avoidTolls: boolean;
  /** ISO string o null (= ahora) */
  departureTime: string | null;
  signal?: AbortSignal;
};

/** 'now' o fecha futura en RFC 3339; la API rechaza fechas pasadas. */
export function normalizeDepartAt(departureTime: string | null): string {
  if (!departureTime) return 'now';
  const d = new Date(departureTime);
  if (!Number.isFinite(d.getTime()) || d.getTime() < Date.now() + 60_000) return 'now';
  return d.toISOString();
}

/** Reordena las intermedias según optimizedWaypoints (providedIndex → optimizedIndex). */
function applyOptimizedOrder(locations: Stop[], optimized?: OptimizedWaypoint[]): Stop[] {
  const mids = locations.slice(1, -1);
  if (!optimized || optimized.length !== mids.length) return locations;
  const ordered = new Array<Stop | undefined>(mids.length);
  for (const { providedIndex, optimizedIndex } of optimized) ordered[optimizedIndex] = mids[providedIndex];
  if (ordered.some((s) => !s)) return locations;
  return [locations[0], ...(ordered as Stop[]), locations[locations.length - 1]];
}

function build(
  sequence: Stop[],
  result: RouteResult,
  method: OptimizedRoute['method'],
  requests: number,
  warnings: string[],
): OptimizedRoute {
  if (result.legs.length !== sequence.length - 1) {
    throw new TomTomError('La respuesta de TomTom no coincide con las paradas enviadas.', 500);
  }
  const legs: RouteLeg[] = result.legs.map((leg, i) => ({
    from: sequence[i],
    to: sequence[i + 1],
    distanceMeters: leg.lengthInMeters,
    durationSec: leg.travelTimeInSeconds,
    staticDurationSec:
      leg.noTrafficTravelTimeInSeconds ?? Math.max(0, leg.travelTimeInSeconds - leg.trafficDelayInSeconds),
    path: leg.points,
  }));
  const s = result.summary;
  return {
    ordered: sequence,
    legs,
    distanceMeters: s.lengthInMeters,
    durationSec: s.travelTimeInSeconds,
    staticDurationSec: s.noTrafficTravelTimeInSeconds ?? Math.max(0, s.travelTimeInSeconds - s.trafficDelayInSeconds),
    path: legs.flatMap((l) => l.path),
    computedAt: Date.now(),
    requests,
    method,
    warnings,
  };
}

/**
 * Calcula la ruta óptima:
 *  1. Modo "tiempo con tráfico" (o fin "donde sea mejor"): matriz de tiempos con tráfico
 *     (Matrix Routing) + orden resuelto localmente + una llamada a Calculate Route con ese orden.
 *  2. Modo "distancia" (o si la matriz falla por cuota/permisos): una sola llamada a
 *     Calculate Route con computeBestOrder=true; los tiempos igual consideran tráfico.
 */
export async function planRoute(input: PlanInput): Promise<OptimizedRoute> {
  const { apiKey, origin, stops, endMode, orderMode, avoidTolls, departureTime, signal } = input;
  if (stops.length === 0) throw new TomTomError('Agrega al menos una parada.', 400);
  if (stops.length > MAX_STOPS) throw new TomTomError(`Máximo ${MAX_STOPS} paradas por ruta.`, 400);

  const departAt = normalizeDepartAt(departureTime);
  const common = { apiKey, avoidTolls, departAt, signal };
  const warnings: string[] = [];
  let requests = 0;

  const fixedEnd = endMode.kind === 'stop' ? stops.find((s) => s.id === endMode.stopId) : undefined;
  if (endMode.kind === 'stop' && !fixedEnd) throw new TomTomError('La parada final elegida ya no existe.', 400);

  /* 1) Orden por tiempo con tráfico */
  if (stops.length >= 2 && (orderMode === 'traffic' || endMode.kind === 'best')) {
    try {
      const nodes = [origin, ...stops];
      const { matrix, requests: r } = await travelTimeMatrix({ ...common, points: nodes });
      requests += r;
      const mode: TspMode =
        endMode.kind === 'origin'
          ? { kind: 'closed' }
          : endMode.kind === 'best'
            ? { kind: 'open' }
            : { kind: 'end', node: nodes.indexOf(fixedEnd!) };
      const order = solveOrder(matrix, mode);
      const sequence = order.map((i) => nodes[i]);
      const result = await calculateRoute({ ...common, locations: sequence, computeBestOrder: false });
      requests += 1;
      return build(sequence, result, 'traffic', requests, warnings);
    } catch (e) {
      if (signal?.aborted) throw e;
      if (e instanceof TomTomError && (e.status === 403 || e.status === 429)) {
        warnings.push(
          e.status === 429
            ? 'Se agotó la cuota de Matrix Routing; el orden se optimizó por distancia.'
            : 'Matrix Routing no está habilitado en la clave; el orden se optimizó por distancia.',
        );
      } else {
        throw e;
      }
    }
  }

  /* 2) Orden por distancia (computeBestOrder) */
  if (endMode.kind === 'best' && stops.length >= 2) {
    // Sin matriz no hay forma directa de "terminar donde sea": probamos cada parada como final.
    const candidates = await Promise.all(
      stops.map(async (dest) => {
        const locations = [origin, ...stops.filter((s) => s.id !== dest.id), dest];
        const result = await calculateRoute({ ...common, locations, computeBestOrder: locations.length > 3 });
        return { sequence: applyOptimizedOrder(locations, result.optimizedWaypoints), result };
      }),
    );
    requests += candidates.length;
    const best = candidates.reduce((a, b) =>
      b.result.summary.travelTimeInSeconds < a.result.summary.travelTimeInSeconds ? b : a,
    );
    return build(best.sequence, best.result, 'distance', requests, warnings);
  }

  let dest: Stop;
  let mids: Stop[];
  if (fixedEnd) {
    dest = fixedEnd;
    mids = stops.filter((s) => s.id !== fixedEnd.id);
  } else if (endMode.kind === 'best') {
    // Solo se llega aquí con una parada: termina en ella.
    dest = stops[stops.length - 1];
    mids = stops.slice(0, -1);
  } else {
    dest = origin;
    mids = stops;
  }
  const locations = [origin, ...mids, dest];
  const result = await calculateRoute({ ...common, locations, computeBestOrder: mids.length > 1 });
  requests += 1;
  const sequence = applyOptimizedOrder(locations, result.optimizedWaypoints);
  return build(sequence, result, mids.length > 1 ? 'distance' : 'fixed', requests, warnings);
}
