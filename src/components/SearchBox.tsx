import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '../types';
import { fuzzySearch, TomTomError, type SearchResult } from '../lib/tomtom';
import { parseCoordinates } from '../lib/parseCoords';
import { formatCoords } from '../lib/format';

export type PickedPlace = { lat: number; lng: number; label?: string };

type Props = {
  apiKey: string;
  regionCodes: string[];
  /** Punto para priorizar resultados cercanos (origen o centro del mapa). */
  near: LatLng | null;
  onPick: (place: PickedPlace) => void;
};

function buildLabel(r: SearchResult): string | undefined {
  const short = r.address.split(',').slice(0, 2).join(',').trim();
  if (r.name && short && !short.toLowerCase().startsWith(r.name.toLowerCase())) return `${r.name} · ${short}`;
  return short || r.name || undefined;
}

/** Buscador de direcciones y negocios (TomTom Search) con autocompletado. */
export function SearchBox({ apiKey, regionCodes, near, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const nearRef = useRef(near);
  nearRef.current = near;
  const regionRef = useRef(regionCodes);
  regionRef.current = regionCodes;

  const coords = parseCoordinates(query);

  useEffect(() => {
    const text = query.trim();
    abortRef.current?.abort();
    if (text.length < 3 || coords) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const found = await fuzzySearch({
          apiKey,
          query: text,
          near: nearRef.current,
          countryCodes: regionRef.current,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setResults(found);
        setOpen(true);
        setActive(-1);
      } catch (e) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(e instanceof TomTomError ? (e.hint ?? e.message) : 'No se pudo buscar.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `coords` deriva de `query`; no hace falta en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, apiKey]);

  const reset = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    setActive(-1);
    setError(null);
  };

  const pickResult = (r: SearchResult) => {
    onPick({ lat: r.lat, lng: r.lng, label: buildLabel(r) });
    reset();
  };

  const pickCoords = () => {
    if (!coords) return;
    onPick({ lat: coords.lat, lng: coords.lng });
    reset();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (coords && e.key === 'Enter') {
      e.preventDefault();
      pickCoords();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pickResult(results[active >= 0 ? active : 0]);
    }
  };

  const showList = open && (results.length > 0 || loading || error);

  return (
    <div className="searchbox">
      <input
        className="input"
        type="search"
        autoComplete="off"
        placeholder="Buscar dirección o negocio…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        aria-autocomplete="list"
        aria-expanded={showList ? true : false}
      />
      {coords && (
        <ul className="search-results">
          <li className="active" onMouseDown={(e) => e.preventDefault()} onClick={pickCoords}>
            <div className="search-name">Usar coordenadas</div>
            <div className="search-addr">{formatCoords(coords.lat, coords.lng)}</div>
          </li>
        </ul>
      )}
      {!coords && showList && (
        <ul className="search-results" role="listbox">
          {loading && results.length === 0 && <li className="search-muted">Buscando…</li>}
          {error && <li className="search-muted search-error">{error}</li>}
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pickResult(r)}
            >
              <div className="search-name">{r.name ?? r.address.split(',')[0]}</div>
              <div className="search-addr">{r.name ? r.address : r.address.split(',').slice(1).join(',').trim()}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
