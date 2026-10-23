/* Formatação em pt-BR e utilitários de data. */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlShort = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('pt-BR');
const dec1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (v) => brl.format(v || 0);
export const moneyShort = (v) => brlShort.format(v || 0);
export const num = (v) => int.format(v || 0);
export const pct = (v, casas = 1) => `${(casas === 2 ? dec2 : dec1).format(v || 0)}%`;
export const perc = (v) => `${dec2.format(v || 0)}%`;
export const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;

const pad = (n) => String(n).padStart(2, '0');

/** Data no formato do input date (aaaa-mm-dd), no fuso local. */
export function isoDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** Converte aaaa-mm-dd para Date à meia-noite local. */
export function fromIsoDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function date(d) {
  if (!d) return '';
  const x = typeof d === 'string' && d.length === 10 ? fromIsoDate(d) : new Date(d);
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`;
}

export function time(d) {
  const x = new Date(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function dateTime(d) {
  if (!d) return '';
  const x = new Date(d);
  return `${date(x)} ${time(x)}`;
}

export function dateTimeSec(d) {
  const x = new Date(d);
  return `${date(x)} ${time(x)}:${pad(x.getSeconds())}`;
}

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sameDay = (a, b) => isoDate(a) === isoDate(b);

/** "agora", "há 12 min", "há 3 h", "ontem 14:20", "12/10 08:10" */
export function relative(d) {
  const x = new Date(d);
  const diff = Date.now() - x.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (sameDay(x, new Date()) && hours < 24) return `há ${hours} h`;
  if (sameDay(x, addDays(new Date(), -1))) return `ontem, ${time(x)}`;
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}, ${time(x)}`;
}

export const weekday = (d) => new Date(d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
export const dayMonth = (d) => { const x = new Date(d); return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}`; };

/** Normaliza para busca sem acento e sem caixa. */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
