import { useCallback, useEffect, useRef, useState } from 'react';
import type { Customer } from '../types';
import { loadCustomers, saveCustomers, sortCustomers, type CustomerDraft } from '../lib/customers';
import { newId } from '../lib/id';

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>(() => loadCustomers());
  const current = useRef(customers);
  current.current = customers;

  useEffect(() => {
    saveCustomers(customers);
  }, [customers]);

  /** Crea o actualiza y devuelve el cliente guardado (sincrónicamente, para refrescar la ruta). */
  const upsert = useCallback((draft: CustomerDraft, id?: string): Customer => {
    const now = Date.now();
    const existing = id ? current.current.find((c) => c.id === id) : undefined;
    const saved: Customer = existing
      ? { ...existing, ...draft, updatedAt: now }
      : { ...draft, id: id ?? newId(), createdAt: now, updatedAt: now };
    setCustomers((prev) => sortCustomers([...prev.filter((c) => c.id !== saved.id), saved]));
    return saved;
  }, []);

  const remove = useCallback((id: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const importMany = useCallback((incoming: Customer[], mode: 'merge' | 'replace') => {
    setCustomers((prev) => {
      const byId = new Map((mode === 'replace' ? [] : prev).map((c) => [c.id, c]));
      for (const c of incoming) byId.set(c.id, c);
      return sortCustomers([...byId.values()]);
    });
  }, []);

  return { customers, upsert, remove, importMany };
}
