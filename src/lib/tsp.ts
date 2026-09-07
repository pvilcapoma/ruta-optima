/**
 * Orden de visita de paradas (problema del viajante) sobre una matriz de costos,
 * normalmente tiempos de viaje en segundos con tráfico. El nodo 0 es siempre el inicio.
 *
 *  - Hasta 13 paradas intermedias: solución exacta (programación dinámica de Held-Karp).
 *  - Más paradas: vecino más cercano + búsqueda local (2-opt y or-opt) con reinicios.
 *
 * La matriz puede ser asimétrica (ir ≠ volver), como ocurre con el tráfico real.
 */

export type TspMode =
  | { kind: 'closed' } // termina volviendo al nodo 0
  | { kind: 'end'; node: number } // termina en un nodo fijo
  | { kind: 'open' }; // termina en cualquier nodo

const BIG = 1e9;
const EXACT_LIMIT = 13;

function c(cost: number[][], i: number, j: number): number {
  const v = cost[i]?.[j];
  return typeof v === 'number' && Number.isFinite(v) ? v : BIG;
}

function terminal(cost: number[][], last: number, mode: TspMode): number {
  if (mode.kind === 'closed') return c(cost, last, 0);
  if (mode.kind === 'end') return c(cost, last, mode.node);
  return 0;
}

/** Costo de una secuencia que empieza en 0 y NO incluye el nodo terminal. */
export function pathCost(cost: number[][], seq: number[], mode: TspMode): number {
  let total = 0;
  for (let i = 0; i + 1 < seq.length; i++) total += c(cost, seq[i], seq[i + 1]);
  return total + terminal(cost, seq[seq.length - 1], mode);
}

/**
 * Devuelve la secuencia completa de nodos: empieza en 0, visita todos los demás una vez
 * y termina según el modo (incluye el 0 final si es cerrado, o el nodo fijo si es 'end').
 */
export function solveOrder(cost: number[][], mode: TspMode): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const endNode = mode.kind === 'end' ? mode.node : null;
  const mids: number[] = [];
  for (let i = 1; i < n; i++) if (i !== endNode) mids.push(i);

  let seq: number[];
  if (mids.length === 0) seq = [0];
  else if (mids.length <= EXACT_LIMIT) seq = exact(cost, mids, mode);
  else seq = heuristic(cost, mids, mode);

  if (pathCost(cost, seq, mode) >= BIG) {
    throw new Error('No existe ruta en auto entre algunas de las paradas.');
  }
  if (mode.kind === 'closed') return [...seq, 0];
  if (mode.kind === 'end') return [...seq, mode.node];
  return seq;
}

/* ---------------- Exacto: Held-Karp ---------------- */

function exact(cost: number[][], mids: number[], mode: TspMode): number[] {
  const m = mids.length;
  const size = 1 << m;
  const full = size - 1;
  const dp = new Float64Array(size * m).fill(Infinity);
  const parent = new Int16Array(size * m).fill(-1);

  for (let j = 0; j < m; j++) dp[(1 << j) * m + j] = c(cost, 0, mids[j]);

  for (let mask = 1; mask <= full; mask++) {
    for (let j = 0; j < m; j++) {
      if (!(mask & (1 << j))) continue;
      const cur = dp[mask * m + j];
      if (!Number.isFinite(cur)) continue;
      for (let k = 0; k < m; k++) {
        if (mask & (1 << k)) continue;
        const nm = mask | (1 << k);
        const val = cur + c(cost, mids[j], mids[k]);
        if (val < dp[nm * m + k]) {
          dp[nm * m + k] = val;
          parent[nm * m + k] = j;
        }
      }
    }
  }

  let best = Infinity;
  let bj = 0;
  for (let j = 0; j < m; j++) {
    const v = dp[full * m + j] + terminal(cost, mids[j], mode);
    if (v < best) {
      best = v;
      bj = j;
    }
  }

  const order: number[] = [];
  let mask = full;
  let j = bj;
  while (j >= 0) {
    order.push(mids[j]);
    const pj = parent[mask * m + j];
    mask &= ~(1 << j);
    j = pj;
  }
  order.reverse();
  return [0, ...order];
}

/* ---------------- Heurístico: NN + búsqueda local ---------------- */

function nearestNeighbor(cost: number[][], mids: number[]): number[] {
  const remaining = new Set(mids);
  const seq = [0];
  let cur = 0;
  while (remaining.size) {
    let bestNode = -1;
    let bestCost = Infinity;
    for (const k of remaining) {
      const v = c(cost, cur, k);
      if (v < bestCost) {
        bestCost = v;
        bestNode = k;
      }
    }
    seq.push(bestNode);
    remaining.delete(bestNode);
    cur = bestNode;
  }
  return seq;
}

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function localSearch(cost: number[][], start: number[], mode: TspMode): number[] {
  let seq = start.slice();
  let bestCost = pathCost(cost, seq, mode);
  let improved = true;
  while (improved) {
    improved = false;
    const n = seq.length;

    // 2-opt: invertir el segmento [i..j]
    for (let i = 1; i < n - 1 && !improved; i++) {
      for (let j = i + 1; j < n && !improved; j++) {
        const cand = seq.slice(0, i).concat(seq.slice(i, j + 1).reverse(), seq.slice(j + 1));
        const cc = pathCost(cost, cand, mode);
        if (cc + 1e-9 < bestCost) {
          seq = cand;
          bestCost = cc;
          improved = true;
        }
      }
    }

    // or-opt: mover un segmento de 1 a 3 nodos a otra posición
    for (let len = 1; len <= 3 && !improved; len++) {
      for (let i = 1; i + len <= n && !improved; i++) {
        const seg = seq.slice(i, i + len);
        const rest = seq.slice(0, i).concat(seq.slice(i + len));
        for (let p = 1; p <= rest.length && !improved; p++) {
          if (p === i) continue;
          const cand = rest.slice(0, p).concat(seg, rest.slice(p));
          const cc = pathCost(cost, cand, mode);
          if (cc + 1e-9 < bestCost) {
            seq = cand;
            bestCost = cc;
            improved = true;
          }
        }
      }
    }
  }
  return seq;
}

function heuristic(cost: number[][], mids: number[], mode: TspMode): number[] {
  const starts: number[][] = [nearestNeighbor(cost, mids)];
  for (let r = 0; r < 12; r++) starts.push([0, ...shuffled(mids)]);
  let best: number[] = starts[0];
  let bestCost = Infinity;
  for (const s of starts) {
    const improved = localSearch(cost, s, mode);
    const cc = pathCost(cost, improved, mode);
    if (cc < bestCost) {
      bestCost = cc;
      best = improved;
    }
  }
  return best;
}
