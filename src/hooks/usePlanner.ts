import { useEffect, useReducer, type Dispatch } from 'react';
import type { EndMode, OrderMode, PlannerState, Stop } from '../types';
import { decodeShare, defaultState, loadState, saveState } from '../lib/storage';

export const MAX_STOPS = 25;

export type PlannerAction =
  | { type: 'load'; state: PlannerState }
  | { type: 'setOrigin'; stop: Stop }
  | { type: 'addStops'; stops: Stop[] }
  | { type: 'remove'; id: string }
  | { type: 'rename'; id: string; label: string }
  | { type: 'move'; id: string; lat: number; lng: number }
  | { type: 'makeOrigin'; id: string }
  | { type: 'setEndMode'; endMode: EndMode }
  | { type: 'setOrderMode'; value: OrderMode }
  | { type: 'setAvoidTolls'; value: boolean }
  | { type: 'setDeparture'; value: string | null }
  | { type: 'clear' };

function fixEndMode(state: PlannerState): PlannerState {
  const em = state.endMode;
  if (em.kind === 'stop' && !state.stops.some((s) => s.id === em.stopId)) {
    return { ...state, endMode: { kind: 'origin' } };
  }
  return state;
}

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case 'load':
      return fixEndMode(action.state);
    case 'setOrigin':
      return { ...state, origin: action.stop };
    case 'addStops': {
      const room = Math.max(0, MAX_STOPS - state.stops.length);
      return { ...state, stops: [...state.stops, ...action.stops.slice(0, room)] };
    }
    case 'remove': {
      if (state.origin?.id === action.id) return { ...state, origin: null };
      return fixEndMode({ ...state, stops: state.stops.filter((s) => s.id !== action.id) });
    }
    case 'rename': {
      const label = action.label.trim() || undefined;
      if (state.origin?.id === action.id) return { ...state, origin: { ...state.origin, label } };
      return { ...state, stops: state.stops.map((s) => (s.id === action.id ? { ...s, label } : s)) };
    }
    case 'move': {
      const patch = { lat: action.lat, lng: action.lng, label: undefined };
      if (state.origin?.id === action.id) return { ...state, origin: { ...state.origin, ...patch } };
      return { ...state, stops: state.stops.map((s) => (s.id === action.id ? { ...s, ...patch } : s)) };
    }
    case 'makeOrigin': {
      const next = state.stops.find((s) => s.id === action.id);
      if (!next) return state;
      const rest = state.stops.filter((s) => s.id !== action.id);
      const stops = state.origin ? [state.origin, ...rest] : rest;
      return fixEndMode({ ...state, origin: next, stops });
    }
    case 'setEndMode':
      return fixEndMode({ ...state, endMode: action.endMode });
    case 'setOrderMode':
      return { ...state, orderMode: action.value };
    case 'setAvoidTolls':
      return { ...state, avoidTolls: action.value };
    case 'setDeparture':
      return { ...state, departureTime: action.value };
    case 'clear':
      return { ...defaultState };
    default:
      return state;
  }
}

function initialState(): PlannerState {
  // 1) Enlace compartido (#d=...) tiene prioridad; 2) lo guardado en el dispositivo.
  const shared = typeof location !== 'undefined' ? decodeShare(location.hash) : null;
  return shared ?? loadState() ?? defaultState;
}

export function usePlanner(): [PlannerState, Dispatch<PlannerAction>] {
  const [state, dispatch] = useReducer(plannerReducer, undefined, initialState);

  // Una vez importado el enlace compartido, limpiamos el hash para no re-importarlo al recargar.
  useEffect(() => {
    if (/[#&]d=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);
  return [state, dispatch];
}
