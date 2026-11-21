// Negocio activo de la petición actual (AsyncLocalStorage). Toda consulta de datos del negocio lo usa.
// Current business of this request (AsyncLocalStorage). Every business-data query uses it.
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

export const withNegocio = (negocioId, fn) => als.run({ negocioId }, fn);

export function nid() {
  const id = als.getStore()?.negocioId;
  if (!id) throw new Error('No hay negocio activo en esta petición');
  return id;
}
export const hasNegocio = () => !!als.getStore()?.negocioId;
