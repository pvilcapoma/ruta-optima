import { useState } from 'react';
import type { EndMode, Stop, StopOrder } from '../types';
import { formatCoords } from '../lib/format';
import { parseBultos } from '../lib/customers';

type Props = {
  origin: Stop | null;
  stops: Stop[];
  orderMap: Record<string, number>;
  endMode: EndMode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onMakeOrigin: (id: string) => void;
  onToggleFinal: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onOrderChange: (id: string, patch: Partial<StopOrder>) => void;
  onLoadDemo?: () => void;
};

function Label({ stop, onRename }: { stop: Stop; onRename: (label: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stop.label ?? '');
  if (stop.order?.customerId) return <div className="stop-label static">{stop.order.razonSocial || stop.label}</div>;
  const commit = () => {
    if (!editing) return;
    setEditing(false);
    if (draft.trim() !== (stop.label ?? '')) onRename(draft);
  };
  if (editing) {
    return (
      <input
        className="input input-sm"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setDraft(stop.label ?? '');
            setEditing(false);
          }
        }}
        placeholder="Nombre de la parada"
      />
    );
  }
  return (
    <button type="button" className="stop-label" title="Clic para renombrar" onClick={() => { setDraft(stop.label ?? ''); setEditing(true); }}>
      {stop.label ?? <span className="muted">Sin nombre</span>}
    </button>
  );
}

export function StopList(props: Props) {
  const { origin, stops, orderMap, endMode, selectedId, onSelect, onRemove, onMakeOrigin, onToggleFinal, onRename, onOrderChange, onLoadDemo } = props;
  const finalId = endMode.kind === 'stop' ? endMode.stopId : null;

  const renderRow = (s: Stop, badge: string, kind: 'origin' | 'stop' | 'final') => {
    const o = s.order;
    const line = o?.direccionTexto?.trim() || (o?.razonSocial && s.label && o.razonSocial !== s.label ? s.label : '') || formatCoords(s.lat, s.lng);
    return (
      <li key={s.id} className={`stop stop-${kind}${selectedId === s.id ? ' stop-selected' : ''}`}>
        <button type="button" className={`badge badge-${kind}`} onClick={() => onSelect(s.id)} title="Ver en el mapa">
          {badge}
        </button>
        <div className="stop-body">
          <Label stop={s} onRename={(l) => onRename(s.id, l)} />
          <div className="stop-coords">
            {line}
            {o?.telefono && <span className="muted"> · {o.telefono}</span>}
          </div>
          {kind !== 'origin' && (
            <div className="stop-order">
              <input className="input input-xs" placeholder="G/R" title="Guía de remisión" value={o?.gr ?? ''} onChange={(e) => onOrderChange(s.id, { gr: e.target.value })} />
              <input className="input input-xs w-bultos" type="number" min={0} step={1} inputMode="numeric" placeholder="Bultos" title="Bultos" value={o?.bultos ?? ''} onChange={(e) => onOrderChange(s.id, { bultos: parseBultos(e.target.value) })} />
            </div>
          )}
        </div>
        <div className="stop-actions">
          {kind !== 'origin' && (
            <>
              <button type="button" className={`icon${finalId === s.id ? ' icon-active' : ''}`} title={finalId === s.id ? 'Quitar como parada final' : 'Terminar la ruta aquí'} onClick={() => onToggleFinal(s.id)}>
                ⚑
              </button>
              <button type="button" className="icon" title="Usar como origen" onClick={() => onMakeOrigin(s.id)}>
                ⇱
              </button>
            </>
          )}
          <button type="button" className="icon icon-danger" title="Quitar de la ruta" onClick={() => onRemove(s.id)}>
            ✕
          </button>
        </div>
      </li>
    );
  };

  return (
    <ul className="stoplist">
      {origin ? (
        renderRow(origin, 'A', 'origin')
      ) : (
        <li className="stop stop-empty">
          <span className="badge badge-origin">A</span>
          <div className="stop-body muted">
            Sin origen (almacén). Defínelo con el buscador de "Otros puntos", tocando el mapa o con <b>Mi ubicación</b>.
            {onLoadDemo && (
              <div className="empty-actions">
                <button type="button" className="btn btn-sm" onClick={onLoadDemo}>Cargar ruta de ejemplo</button>
              </div>
            )}
          </div>
        </li>
      )}
      {stops.map((s) => renderRow(s, String(orderMap[s.id] ?? '•'), finalId === s.id ? 'final' : 'stop'))}
      {origin && stops.length === 0 && (
        <li className="stop stop-empty">
          <span className="badge badge-stop">1</span>
          <div className="stop-body muted">Agrega clientes desde la lista de arriba.</div>
        </li>
      )}
    </ul>
  );
}
