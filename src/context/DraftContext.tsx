import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Category, Game, MatchDetail, MatchVisibility, Platform } from '../api/types';
import { toParts } from '../lib/dates';

/**
 * Rascunho da partida sendo agendada ou editada. Fica num contexto para que
 * as telas de escolher jogo, data e hora preencham a tela de agendar.
 */
export type Draft = {
  matchId: number | null; // null = nova partida
  name: string;
  category: Category;
  game: Game | null;
  platforms: Platform[];
  visibility: MatchVisibility;
  date: string | null; // 'YYYY-MM-DD' (local)
  time: string | null; // 'HH:MM' (local)
  description: string;
};

const EMPTY: Draft = {
  matchId: null,
  name: '',
  category: 'RANQUEADA',
  game: null,
  platforms: [],
  visibility: 'publica',
  date: null,
  time: null,
  description: '',
};

type DraftValue = {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  reset: () => void;
  loadFromMatch: (m: MatchDetail) => void;
};

const DraftContext = createContext<DraftValue | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const reset = useCallback(() => setDraft(EMPTY), []);
  const loadFromMatch = useCallback((m: MatchDetail) => {
    const { date, time } = toParts(m.starts_at);
    setDraft({
      matchId: m.id,
      name: m.name,
      category: m.category,
      game: m.game,
      platforms: m.platforms,
      visibility: m.visibility,
      date,
      time,
      description: m.description,
    });
  }, []);

  const value = useMemo(() => ({ draft, update, reset, loadFromMatch }), [draft, update, reset, loadFromMatch]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useDraft precisa estar dentro de <DraftProvider>');
  return ctx;
}
