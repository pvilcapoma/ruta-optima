import { useEffect, useMemo, useRef, useState } from 'react';
import type { OptimizedRoute } from '../types';
import { buildNavigationLinks } from '../lib/mapsLinks';
import { wrapCodeBlock } from '../lib/clipboard';
import { formatClock, formatCoords, formatDistance, formatDuration } from '../lib/format';

type Props = {
  route: OptimizedRoute;
  stale: boolean;
  originId: string;
  departureLabel: string;
  /** Texto del resumen para el chofer (formato obligatorio), ya generado en App. */
  clipboardText: string;
  onShare: () => void;
  selectedLeg: number | null;
  onSelectLeg: (index: number) => void;
};

const METHOD_LABEL: Record<OptimizedRoute['method'], string> = {
  traffic: 'orden por tiempo con tráfico',
  distance: 'orden por distancia',
  fixed: 'orden directo',
};

function name(s: { label?: string; lat: number; lng: number }): string {
  return s.label ?? formatCoords(s.lat, s.lng, 4);
}

export function RouteSummary({ route, stale, originId, departureLabel, clipboardText, onShare, selectedLeg, onSelectLeg }: Props) {
  const [copied, setCopied] = useState(false);
  const [fenced, setFenced] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const links = useMemo(() => buildNavigationLinks(route.ordered), [route]);

  // Cada ruta nueva se desplaza a la vista para no tener que buscarla al final del panel.
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [route.computedAt]);
  const delaySec = Math.max(0, route.durationSec - route.staticDurationSec);
  const last = route.ordered[route.ordered.length - 1];
  const returnsToOrigin = last.id === originId;

  const copySummary = async () => {
    const text = fenced ? wrapCodeBlock(clipboardText) : clipboardText;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copia el texto:', text);
    }
  };

  return (
    <section ref={sectionRef} className={`summary${stale ? ' summary-stale' : ''}`}>
      <header className="summary-head">
        <h2>Ruta optimizada</h2>
        <span className="muted small">
          {departureLabel} · calc. {formatClock(new Date(route.computedAt))}
        </span>
      </header>
      {stale && <p className="banner warn">Las paradas cambiaron. Vuelve a optimizar para actualizar la ruta.</p>}
      {route.warnings.map((w) => (
        <p key={w} className="banner warn">
          {w}
        </p>
      ))}

      <div className="totals">
        <div>
          <div className="total-big">{formatDuration(route.durationSec)}</div>
          <div className="muted small">con tráfico</div>
        </div>
        <div>
          <div className="total-mid">{formatDistance(route.distanceMeters)}</div>
          <div className="muted small">{route.legs.length} tramos</div>
        </div>
        <div>
          <div className="total-mid">{delaySec >= 60 ? `+${formatDuration(delaySec)}` : '—'}</div>
          <div className="muted small">por tráfico</div>
        </div>
      </div>

      <p className="hint">Toca un tramo para verlo resaltado en el mapa.</p>
      <ol className="legs">
        {route.legs.map((leg, i) => (
          <li
            key={`${leg.from.id}-${leg.to.id}-${i}`}
            className={i === selectedLeg ? 'active' : ''}
            role="button"
            tabIndex={0}
            aria-pressed={i === selectedLeg}
            onClick={() => onSelectLeg(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectLeg(i);
              }
            }}
          >
            <span className="leg-idx">{i + 1}</span>
            <div className="leg-body">
              <div className="leg-to">
                {i === route.legs.length - 1 && returnsToOrigin ? 'Regreso a ' : ''}
                {name(leg.to)}
              </div>
              <div className="muted small">
                {formatDuration(leg.durationSec)} · {formatDistance(leg.distanceMeters)}
                {leg.durationSec - leg.staticDurationSec >= 120 &&
                  ` · +${formatDuration(leg.durationSec - leg.staticDurationSec)} tráfico`}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {clipboardText && (
        <div className="clip">
          <div className="clip-head">
            <h3>Resumen para el chofer</h3>
            <label className="check small" title="Envuelve el texto en ``` para que WhatsApp lo muestre monoespaciado">
              <input type="checkbox" checked={fenced} onChange={(e) => setFenced(e.target.checked)} />
              Monoespaciado en WhatsApp
            </label>
          </div>
          <pre className="clip-pre">{clipboardText}</pre>
          <button type="button" className="btn btn-primary" onClick={copySummary}>
            {copied ? 'Copiado ✓' : 'Copiar resumen'}
          </button>
        </div>
      )}

      <div className="actions">
        {links.map((l) => (
          <a key={l.url} className="btn" href={l.url} target="_blank" rel="noreferrer">
            {links.length > 1 ? `Navegar · ${l.label} (${l.stops} paradas)` : 'Navegar con Google Maps'}
          </a>
        ))}
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={onShare}>
            Compartir enlace
          </button>
        </div>
        {links.length > 1 && (
          <p className="hint">Google Maps acepta 9 paradas por enlace; la ruta se dividió en tramos consecutivos.</p>
        )}
        <p className="hint">
          {METHOD_LABEL[route.method]} · {route.requests} {route.requests === 1 ? 'consulta' : 'consultas'} a TomTom
        </p>
      </div>
    </section>
  );
}
