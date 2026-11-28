// Formatos de dinero y números (pesos colombianos, sin decimales).
import { getLang } from './i18n.js';

const loc = () => (getLang() === 'en' ? 'en-US' : 'es-CO');
export const money = (n) => new Intl.NumberFormat(loc(), { style: 'currency', currency: 'COP', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(Math.round(n || 0));
export const compact = (n) => new Intl.NumberFormat(loc(), { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
export const moneyShort = (n) => `$${compact(n)}`;
export const qty = (n) => new Intl.NumberFormat(loc(), { maximumFractionDigits: 2 }).format(Number(n) || 0);
export const int = (n) => new Intl.NumberFormat(loc(), { maximumFractionDigits: 0 }).format(Math.round(n || 0));
// Cambio porcentual; null si no hay base de comparación.
export const pctChange = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
