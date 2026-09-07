import { useState } from 'react';
import type { EndMode, Stop } from '../types';
import { formatCoords } from '../lib/format';

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
  onLoadDemo?: () => void;
};

function Label({ stop, onRename }: { stop: Stop; onRename: (label: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stop.label ?? '');
  if (editing) {
    return (
      <input
        className="input input-sm"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onRename(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
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
    <button
      type="button"
      className="stop-label"
      title="Clic para renombrar"
      onClick={() => {
        setDraft(stop.label ?? '');
        setEditing(true);
      }}
    >
      {stop.label ?? <span className="muted">Sin nombre</span>}
    </button>
  );
}

export function StopList(props: Props) {
  const {
    origin,
    stops,
    orderMap,
    endMode,
    selectedId,
    onSelect,
    onRemove,
    onMakeOrigin,
    onToggleFinal,
    onRename,
    onLoadDemo,
  } = props;

  const finalId = endMode.kind === 'stop' ? endMode.stopId : null;

  const renderRow = (s: Stop, badge: string, kind: 'origin' | 'stop' | 'final') => (
    <li key={s.id} className={`stop stop-${kind}${selectedId === s.id ? ' stop-selected' : ''}`}>
      <button type="button" className={`badge badge-${kind}`} onClick={() => onSelect(s.id)} title="Ver en el mapa">
        {badge}
      </button>
      <div className="stop-body">
        <Label stop={s} onRename={(l) => onRename(s.id, l)} />
        <div className="stop-coords">{formatCoords(s.lat, s.lng)}</div>
      </div>
      <div className="stop-actions">
        {kind !== 'origin' && (
          <>
            <button
              type="button"
              className={`icon${finalId === s.id ? ' icon-active' : ''}`}
              title={finalId === s.id ? 'Quitar como parada final' : 'Terminar la ruta aquí'}
              onClick={() => onToggleFinal(s.id)}
            >
              ⚑
            </button>
            <button type="button" className="icon" title="Usar como origen" onClick={() => onMakeOrigin(s.id)}>
              ⇱
            </button>
          </>
        )}
        <button type="button" className="icon icon-danger" title="Eliminar" onClick={() => onRemove(s.id)}>
          ✕
        </button>
      </div>
    </li>
  );

  return (
    <ul className="stoplist">
      {origin ? (
        renderRow(origin, 'A', 'origin')
      ) : (
        <li className="stop stop-empty">
          <span className="badge badge-origin">A</span>
          <div className="stop-body muted">
            Sin origen. Toca el mapa, busca una dirección o usa <b>Mi ubicación</b>.
            {onLoadDemo && (
              <div className="empty-actions">
                <button type="button" className="btn btn-sm" onClick={onLoadDemo}>
                  Cargar ruta de ejemplo
                </button>
              </div>
            )}
          </div>
        </li>
      )}
      {stops.map((s) => renderRow(s, String(orderMap[s.id] ?? '•'), finalId === s.id ? 'final' : 'stop'))}
      {origin && stops.length === 0 && (
        <li className="stop stop-empty">
          <span className="badge badge-stop">1</span>
          <div className="stop-body muted">Agrega las paradas de entrega.</div>
        </li>
      )}
    </ul>
  );
}
