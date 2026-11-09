import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';

/**
 * Relógio corrigido pelo servidor.
 *
 * O app pergunta a hora ao banco (`server_now()`, sincronizado por NTP) e guarda
 * a diferença para o relógio do celular. Assim contagens ("COMEÇA EM 20 MIN") e
 * o status ao vivo ficam certos mesmo se o celular estiver com a hora errada.
 * As regras (horário passado, editar/cancelar/encerrar) já são checadas no banco.
 */

/** Diferença em ms: hora do servidor − hora do celular. */
let offsetMs = 0;
let synced = false;
const listeners = new Set<() => void>();

/** Diferença acima disso vira aviso na Home. */
export const CLOCK_WARN_MS = 2 * 60 * 1000;

export const serverNowMs = () => Date.now() + offsetMs;
export const serverNow = () => new Date(serverNowMs());

function emit() {
  listeners.forEach((l) => l());
}

/**
 * Mede a diferença compensando o tempo da requisição (estilo NTP):
 * hora do servidor ≈ resposta + metade da ida e volta.
 * Faz 3 medições e fica com a de menor ida e volta (a mais precisa).
 */
export async function syncClock(): Promise<void> {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc('server_now');
    const t1 = Date.now();
    if (error || !data) continue;
    const server = new Date(data as string).getTime();
    if (!Number.isFinite(server)) continue;
    const rtt = t1 - t0;
    const offset = server + rtt / 2 - t1;
    if (!best || rtt < best.rtt) best = { rtt, offset };
  }
  if (!best) return; // sem internet: segue com o relógio do celular
  offsetMs = Math.round(best.offset);
  synced = true;
  emit();
}

let started = false;

/** Sincroniza agora, a cada 10 min e sempre que o app volta para a frente. */
export function startClockSync() {
  if (started) return;
  started = true;
  syncClock();
  setInterval(syncClock, 10 * 60 * 1000);
  AppState.addEventListener('change', (s) => {
    if (s === 'active') syncClock();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Diferença atual (para mostrar aviso). `null` enquanto não sincronizou. */
export function useClockOffset(): number | null {
  return useSyncExternalStore(subscribe, () => (synced ? offsetMs : null));
}

/* ---------------- Fuso horário ---------------- */

/** Ex.: { name: 'America/Sao_Paulo', label: 'UTC−3' } — o fuso configurado no celular. */
export function deviceTimeZone(at: Date = new Date()): { name: string; label: string } {
  let name = '';
  try {
    name = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    name = '';
  }
  const minutes = -at.getTimezoneOffset(); // getTimezoneOffset é invertido (UTC − local)
  const sign = minutes >= 0 ? '+' : '-'; // hífen comum: a fonte pixelada não tem o sinal de menos
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const label = `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
  return { name: name.toUpperCase(), label };
}

/** Texto curto: "BRASÍLIA (UTC−3)" quando for o fuso de Brasília. */
export function timeZoneText(at?: Date): string {
  const tz = deviceTimeZone(at);
  if (tz.name === 'AMERICA/SAO_PAULO') return `BRASÍLIA (${tz.label})`;
  return tz.name ? `${tz.name.replace(/_/g, ' ')} (${tz.label})` : tz.label;
}

/** "3 MIN ADIANTADO" / "5 MIN ATRASADO" (do ponto de vista do celular). */
export function describeOffset(offset: number): string {
  const min = Math.round(Math.abs(offset) / 60000);
  const amount = min >= 60 ? `${Math.floor(min / 60)}H ${String(min % 60).padStart(2, '0')}MIN` : `${min} MIN`;
  // offset = servidor − celular: positivo = celular está atrás
  return `${amount} ${offset > 0 ? 'ATRASADO' : 'ADIANTADO'}`;
}
