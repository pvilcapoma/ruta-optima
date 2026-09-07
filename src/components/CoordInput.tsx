import { useState } from 'react';
import { isShortMapsLink, parseBulk } from '../lib/parseCoords';

export type CoordItem = { lat: number; lng: number; label?: string };

type Props = {
  onAdd: (items: CoordItem[]) => void;
  disabled?: boolean;
};

/**
 * Caja para pegar coordenadas o enlaces de Google Maps (uno por línea).
 * Ideal para ubicaciones que llegan por WhatsApp.
 */
export function CoordInput({ onAdd, disabled }: Props) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<{ ok?: string; bad?: string[] } | null>(null);

  const submit = () => {
    const lines = parseBulk(text);
    if (lines.length === 0) return;
    const good = lines.filter((l) => l.coords);
    const bad = lines.filter((l) => !l.coords);
    if (good.length) {
      onAdd(good.map((l) => ({ ...l.coords!, label: l.label })));
    }
    setFeedback({
      ok: good.length ? `${good.length} ${good.length === 1 ? 'parada agregada' : 'paradas agregadas'}` : undefined,
      bad: bad.map((l) =>
        isShortMapsLink(l.raw)
          ? `${l.raw} → enlace corto: ábrelo en el navegador y copia el enlace largo o las coordenadas`
          : `${l.raw} → no se reconocieron coordenadas`,
      ),
    });
    setText(bad.map((l) => l.raw).join('\n'));
  };

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setText((t) => (t ? `${t}\n${clip}` : clip));
    } catch {
      setFeedback({ bad: ['No se pudo leer el portapapeles. Pega con Ctrl+V / mantener presionado.'] });
    }
  };

  return (
    <div className="coordinput">
      <textarea
        className="input"
        rows={2}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          if (feedback) setFeedback(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
        }}
        placeholder={'-12.0464, -77.0428 | Cliente Pérez\nhttps://maps.google.com/?q=-12.09,-77.03'}
      />
      <div className="row">
        <button type="button" className="btn btn-ghost" onClick={pasteFromClipboard} disabled={disabled}>
          Pegar
        </button>
        <button type="button" className="btn" onClick={submit} disabled={disabled || !text.trim()}>
          Agregar
        </button>
      </div>
      {feedback?.ok && <p className="hint ok">{feedback.ok}</p>}
      {feedback?.bad?.map((b) => (
        <p key={b} className="hint bad">
          {b}
        </p>
      ))}
    </div>
  );
}
