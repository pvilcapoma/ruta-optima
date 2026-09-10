import { useMemo, useState } from 'react';
import type { AddressKind, Customer } from '../types';
import { parseBultos, searchCustomers } from '../lib/customers';
import { formatCoords } from '../lib/format';

type Props = {
  customers: Customer[];
  /** pick: agregar a la ruta (compacto). manage: además editar y eliminar. */
  mode: 'pick' | 'manage';
  /** customerId → veces que ya está en la ruta */
  inRoute: Map<string, number>;
  onAddToRoute: (c: Customer, kind: AddressKind, gr: string, bultos: number | null) => void;
  onLocate?: (c: Customer) => void;
  onEdit?: (c: Customer) => void;
  onDelete?: (c: Customer) => void;
  onNew?: () => void;
};

type AddForm = { kind: AddressKind; gr: string; bultos: string };

export function CustomerList({ customers, mode, inRoute, onAddToRoute, onLocate, onEdit, onDelete, onNew }: Props) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<AddForm>({ kind: 'principal', gr: '', bultos: '' });

  const filtered = useMemo(() => searchCustomers(customers, query), [customers, query]);

  const toggle = (c: Customer) => {
    if (openId === c.id) {
      setOpenId(null);
      return;
    }
    setOpenId(c.id);
    setForm({ kind: 'principal', gr: '', bultos: '' });
  };

  const submit = (c: Customer) => {
    onAddToRoute(c, form.kind, form.gr, parseBultos(form.bultos));
    setOpenId(null);
    setForm({ kind: 'principal', gr: '', bultos: '' });
  };

  if (customers.length === 0) {
    return (
      <div className="stop stop-empty cust-empty">
        <div className="stop-body muted">
          Aún no hay clientes registrados.
          {onNew && (
            <div className="empty-actions">
              <button type="button" className="btn btn-sm" onClick={onNew}>
                Registrar el primer cliente
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="custlist">
      <input
        className="input input-sm"
        type="search"
        placeholder="Buscar por razón social, teléfono o dirección…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 && <p className="hint">Ningún cliente coincide con “{query}”.</p>}
      <ul className="custs">
        {filtered.map((c) => {
          const count = inRoute.get(c.id) ?? 0;
          const open = openId === c.id;
          return (
            <li key={c.id} className={`cust${open ? ' cust-open' : ''}`}>
              <div className="cust-row">
                <div className="cust-main">
                  <div className="cust-name">
                    {c.razonSocial}
                    {count > 0 && <span className="tag">en ruta{count > 1 ? ` ×${count}` : ''}</span>}
                  </div>
                  <div className="cust-sub">{c.direccion.texto || formatCoords(c.direccion.lat, c.direccion.lng)}</div>
                  <div className="cust-sub muted">
                    {c.telefono}
                    {c.telefonoAdicional && ` / ${c.telefonoAdicional}`}
                    {c.direccionSecundaria && ' · 2 direcciones'}
                  </div>
                </div>
                <div className="cust-actions">
                  <button type="button" className={`btn btn-sm${open ? '' : ' btn-primary'}`} onClick={() => toggle(c)}>
                    {open ? 'Cerrar' : 'Agregar'}
                  </button>
                  {onLocate && (
                    <button type="button" className="icon" title="Ver en el mapa" onClick={() => onLocate(c)}>
                      ⌖
                    </button>
                  )}
                  {mode === 'manage' && onEdit && (
                    <button type="button" className="icon" title="Editar" onClick={() => onEdit(c)}>
                      ✎
                    </button>
                  )}
                  {mode === 'manage' && onDelete && (
                    <button type="button" className="icon icon-danger" title="Eliminar" onClick={() => onDelete(c)}>
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {open && (
                <form
                  className="cust-add"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit(c);
                  }}
                >
                  {c.direccionSecundaria && (
                    <div className="seg seg-2">
                      <button type="button" className={form.kind === 'principal' ? 'on' : ''} onClick={() => setForm({ ...form, kind: 'principal' })}>
                        Dirección principal
                      </button>
                      <button type="button" className={form.kind === 'secundaria' ? 'on' : ''} onClick={() => setForm({ ...form, kind: 'secundaria' })}>
                        Dirección secundaria
                      </button>
                    </div>
                  )}
                  <div className="row">
                    <input
                      className="input input-sm"
                      placeholder="G/R (guía de remisión)"
                      value={form.gr}
                      autoFocus
                      onChange={(e) => setForm({ ...form, gr: e.target.value })}
                    />
                    <input
                      className="input input-sm w-bultos"
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      placeholder="Bultos"
                      value={form.bultos}
                      onChange={(e) => setForm({ ...form, bultos: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm">
                    Agregar a la ruta
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
