import { useEffect, useState, type FormEvent } from 'react';
import type { AddressKind, Customer, CustomerAddress, LatLng } from '../types';
import { validateCustomer, type CustomerDraft } from '../lib/customers';
import { formatCoords } from '../lib/format';
import { SearchBox } from './SearchBox';

export type PickedPoint = { target: AddressKind; lat: number; lng: number; nonce: number };

type AddressDraft = { texto: string; lat: number | null; lng: number | null };

type Props = {
  apiKey: string;
  regionCodes: string[];
  near: LatLng | null;
  /** Cliente a editar; null = nuevo */
  initial: Customer | null;
  /** Punto elegido en el mapa (llega desde App cuando el usuario toca el mapa en modo elegir) */
  picked: PickedPoint | null;
  pickTarget: AddressKind | null;
  onPickTarget: (target: AddressKind | null) => void;
  onLocate: (p: LatLng) => void;
  reverseGeocode: (lat: number, lng: number) => Promise<string | undefined>;
  onSave: (draft: CustomerDraft, id?: string) => void;
  onCancel: () => void;
};

const emptyAddress = (): AddressDraft => ({ texto: '', lat: null, lng: null });
const toDraft = (a?: CustomerAddress): AddressDraft => (a ? { texto: a.texto, lat: a.lat, lng: a.lng } : emptyAddress());
const toAddress = (d: AddressDraft): CustomerAddress | undefined =>
  d.lat !== null && d.lng !== null ? { texto: d.texto.trim(), lat: d.lat, lng: d.lng } : undefined;

type AddressFieldProps = {
  kind: AddressKind;
  title: string;
  value: AddressDraft;
  onChange: (updater: (prev: AddressDraft) => AddressDraft) => void;
  picking: boolean;
  onTogglePick: () => void;
  onLocate: (p: LatLng) => void;
  onRemove?: () => void;
  apiKey: string;
  regionCodes: string[];
  near: LatLng | null;
  reverseGeocode: (lat: number, lng: number) => Promise<string | undefined>;
};

function AddressField(p: AddressFieldProps) {
  const { value, onChange, picking, onTogglePick, onLocate, onRemove, reverseGeocode } = p;

  const setPoint = async (lat: number, lng: number, texto?: string) => {
    onChange((prev) => ({ texto: texto ?? prev.texto, lat, lng }));
    if (!texto) {
      const found = await reverseGeocode(lat, lng);
      if (found) onChange((prev) => (prev.texto.trim() ? prev : { ...prev, texto: found }));
    }
  };

  return (
    <div className="field addr">
      <div className="addr-head">
        <span className="field-label">{p.title}</span>
        {onRemove && (
          <button type="button" className="link" onClick={onRemove}>
            Quitar
          </button>
        )}
      </div>
      <SearchBox
        apiKey={p.apiKey}
        regionCodes={p.regionCodes}
        near={p.near}
        placeholder="Buscar dirección o pegar coordenadas…"
        onPick={(pl) => void setPoint(pl.lat, pl.lng, pl.label)}
      />
      <input
        className="input input-sm"
        placeholder="Dirección tal como se le indica al chofer"
        value={value.texto}
        onChange={(e) => {
          const texto = e.target.value;
          onChange((prev) => ({ ...prev, texto }));
        }}
      />
      <div className="addr-coords">
        {value.lat !== null && value.lng !== null ? (
          <>
            <span className="ok">📍 {formatCoords(value.lat, value.lng)}</span>
            <button type="button" className="link" onClick={() => onLocate({ lat: value.lat!, lng: value.lng! })}>
              Ver
            </button>
          </>
        ) : (
          <span className="muted">Sin ubicación todavía</span>
        )}
        <button type="button" className={`link${picking ? ' on' : ''}`} onClick={onTogglePick}>
          {picking ? 'Toca el mapa… (cancelar)' : 'Elegir en el mapa'}
        </button>
      </div>
    </div>
  );
}

export function CustomerForm(props: Props) {
  const { initial, picked, pickTarget, onPickTarget, onLocate, reverseGeocode, onSave, onCancel } = props;

  const [razonSocial, setRazonSocial] = useState(initial?.razonSocial ?? '');
  const [telefono, setTelefono] = useState(initial?.telefono ?? '');
  const [telefonoAdicional, setTelefonoAdicional] = useState(initial?.telefonoAdicional ?? '');
  const [referencias, setReferencias] = useState(initial?.referencias ?? '');
  const [dir1, setDir1] = useState<AddressDraft>(() => toDraft(initial?.direccion));
  const [dir2, setDir2] = useState<AddressDraft | null>(() =>
    initial?.direccionSecundaria ? toDraft(initial.direccionSecundaria) : null,
  );
  const [errors, setErrors] = useState<string[]>([]);

  // Punto elegido en el mapa → dirección correspondiente (+ texto por geocodificación inversa si está vacío)
  useEffect(() => {
    if (!picked) return;
    const apply = picked.target === 'principal' ? setDir1 : (u: (prev: AddressDraft) => AddressDraft) => setDir2((prev) => u(prev ?? emptyAddress()));
    apply((prev) => ({ ...prev, lat: picked.lat, lng: picked.lng }));
    void reverseGeocode(picked.lat, picked.lng).then((found) => {
      if (found) apply((prev) => (prev.texto.trim() ? prev : { ...prev, texto: found }));
    });
  }, [picked, reverseGeocode]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const draft: CustomerDraft = {
      razonSocial: razonSocial.trim(),
      telefono: telefono.trim(),
      referencias: referencias.trim(),
      direccion: toAddress(dir1) ?? { texto: dir1.texto, lat: NaN, lng: NaN },
      direccionSecundaria: dir2 ? (toAddress(dir2) ?? { texto: dir2.texto, lat: NaN, lng: NaN }) : undefined,
      telefonoAdicional: telefonoAdicional.trim() || undefined,
    };
    const errs = validateCustomer(draft);
    setErrors(errs);
    if (errs.length) return;
    onSave(draft, initial?.id);
  };

  const common = {
    apiKey: props.apiKey,
    regionCodes: props.regionCodes,
    near: props.near,
    reverseGeocode,
    onLocate,
  };

  return (
    <form className="cform" onSubmit={submit}>
      <div className="block-head">
        <h2>{initial ? 'Editar cliente' : 'Nuevo cliente'}</h2>
        <button type="button" className="link" onClick={onCancel}>
          Cancelar
        </button>
      </div>

      {errors.length > 0 && (
        <div className="banner error" role="alert">
          {errors.map((er) => (
            <div key={er}>{er}</div>
          ))}
        </div>
      )}

      <label className="field">
        <span className="field-label">Razón social *</span>
        <input className="input input-sm" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} placeholder="Nombre de la empresa o cliente" autoFocus />
      </label>

      <div className="row two">
        <label className="field">
          <span className="field-label">Teléfono de contacto *</span>
          <input className="input input-sm" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="9xx xxx xxx" />
        </label>
        <label className="field">
          <span className="field-label">Teléfono adicional</span>
          <input className="input input-sm" type="tel" value={telefonoAdicional} onChange={(e) => setTelefonoAdicional(e.target.value)} placeholder="Encargado de almacén" />
        </label>
      </div>

      <AddressField
        {...common}
        kind="principal"
        title="Dirección principal *"
        value={dir1}
        onChange={(u) => setDir1(u)}
        picking={pickTarget === 'principal'}
        onTogglePick={() => onPickTarget(pickTarget === 'principal' ? null : 'principal')}
      />

      <label className="field">
        <span className="field-label">Referencias del local</span>
        <textarea
          className="input input-sm"
          rows={2}
          value={referencias}
          onChange={(e) => setReferencias(e.target.value)}
          placeholder="Fachada, color de portón, letreros, piso, cómo llegar…"
        />
      </label>

      {dir2 ? (
        <AddressField
          {...common}
          kind="secundaria"
          title="Dirección secundaria"
          value={dir2}
          onChange={(u) => setDir2((prev) => u(prev ?? emptyAddress()))}
          picking={pickTarget === 'secundaria'}
          onTogglePick={() => onPickTarget(pickTarget === 'secundaria' ? null : 'secundaria')}
          onRemove={() => {
            setDir2(null);
            if (pickTarget === 'secundaria') onPickTarget(null);
          }}
        />
      ) : (
        <button type="button" className="link self-start" onClick={() => setDir2(emptyAddress())}>
          + Agregar dirección secundaria (segunda sede o almacén)
        </button>
      )}

      <div className="row">
        <button type="submit" className="btn btn-primary">
          {initial ? 'Guardar cambios' : 'Guardar cliente'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
