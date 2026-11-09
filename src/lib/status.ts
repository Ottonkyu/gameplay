import type { MatchCard, MatchStatus } from '../api/types';
import { colors, SOON_MINUTES } from '../theme';
import { formatDuration, formatWhen } from './dates';

/**
 * O banco já manda o status, mas o app recalcula pelo relógio para a Home
 * "virar" sozinha (agendada → em breve → em andamento) sem recarregar.
 * Finalizada e cancelada só mudam no banco (o anfitrião encerra/cancela).
 */
export function liveStatus(m: Pick<MatchCard, 'status' | 'starts_at'>, now: Date): MatchStatus {
  if (m.status === 'finalizada' || m.status === 'cancelada') return m.status;
  const start = new Date(m.starts_at).getTime();
  if (start <= now.getTime()) return 'em_andamento';
  if (start - now.getTime() <= SOON_MINUTES * 60000) return 'em_breve';
  return 'agendada';
}

export const isActive = (s: MatchStatus) => s === 'agendada' || s === 'em_breve' || s === 'em_andamento';
export const canEditOrCancel = (s: MatchStatus) => s === 'agendada' || s === 'em_breve';

/** Texto e cor da linha de horário do cartão. */
export function whenLine(m: Pick<MatchCard, 'status' | 'starts_at'>, now: Date): { text: string; color: string } {
  const s = liveStatus(m, now);
  const start = new Date(m.starts_at).getTime();
  switch (s) {
    case 'em_andamento':
      return { text: `EM ANDAMENTO · ${formatDuration(now.getTime() - start)}`, color: colors.green };
    case 'em_breve':
      return { text: `COMEÇA EM ${Math.max(1, Math.ceil((start - now.getTime()) / 60000))} MIN`, color: colors.accent };
    case 'cancelada':
      return { text: 'CANCELADA', color: colors.error };
    case 'finalizada':
      return { text: 'FINALIZADA', color: colors.green };
    default:
      return { text: formatWhen(m.starts_at, now), color: colors.muted };
  }
}

export function statusTag(s: MatchStatus, inMin?: number): { label: string; bg: string } | null {
  switch (s) {
    case 'em_andamento':
      return { label: '● EM ANDAMENTO', bg: colors.green };
    case 'em_breve':
      return { label: inMin ? `COMEÇA EM ${inMin} MIN` : 'COMEÇA EM BREVE', bg: colors.accent };
    case 'cancelada':
      return { label: 'CANCELADA', bg: colors.error };
    case 'finalizada':
      return { label: 'FINALIZADA', bg: colors.green };
    default:
      return null;
  }
}

export const squadText = (filled: number, total: number) =>
  filled >= total ? 'SQUAD COMPLETO' : `${filled}/${total} NO SQUAD`;
