import { serverNow } from './clock';

export const WEEK_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
export const WEEK_LONG = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
export const MONTHS = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

export const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** 'YYYY-MM-DD' no fuso local do aparelho. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'HH:MM' */
export function toTimeKey(h: number, m: number): string {
  return `${pad2(h)}:${pad2(m)}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Momento local no formato armazenado no banco: 'YYYY-MM-DDTHH:MM' (ordenável como texto). */
export function toStartsAt(dateKey: string, timeKey: string): string {
  return `${dateKey}T${timeKey}`;
}

export function nowStartsAt(): string {
  const d = serverNow();
  return toStartsAt(toDateKey(d), toTimeKey(d.getHours(), d.getMinutes()));
}

export function splitStartsAt(startsAt: string): { date: string; time: string } {
  const [date, time] = startsAt.split('T');
  return { date, time };
}

/** '26/09' */
export function formatDayMonth(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/** 'SÁB, 26/09' */
export function formatShort(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return `${WEEK_SHORT[d.getDay()]}, ${formatDayMonth(dateKey)}`;
}

/** 'SÁBADO, 26/09' */
export function formatLong(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return `${WEEK_LONG[d.getDay()]}, ${formatDayMonth(dateKey)}`;
}

/** Junta 'YYYY-MM-DD' + 'HH:MM' (horário local) num Date. */
export function fromParts(dateKey: string, timeKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, mi] = timeKey.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
}

/** Separa um ISO do banco em data e hora locais. */
export function toParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: toDateKey(d), time: toTimeKey(d.getHours(), d.getMinutes()) };
}

export const formatTime = (iso: string) => toParts(iso).time;
export const formatDate = (iso: string) => formatShort(toParts(iso).date);

/** 'HOJE ÀS 21:00', 'AMANHÃ ÀS 14:15' ou 'SEX, 06/11 ÀS 19:00'. */
export function formatWhen(iso: string, now = serverNow()): string {
  const { date, time } = toParts(iso);
  const today = toDateKey(now);
  const tomorrow = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const day = date === today ? 'HOJE' : date === tomorrow ? 'AMANHÃ' : formatShort(date);
  return `${day} ÀS ${time}`;
}

/** '25 MIN', '1H 05MIN' */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}H ${pad2(m)}MIN` : `${m} MIN`;
}

/** 'NOVEMBRO 2026' */
export function monthLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
