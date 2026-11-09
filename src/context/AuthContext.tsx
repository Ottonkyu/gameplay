import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Linking from 'expo-linking';
import { AppState, Platform } from 'react-native';
import * as api from '../api';
import type { MyProfile } from '../api/types';
import { listenToNotificationTaps, registerForPush, unregisterPush } from '../lib/push';
import { parseRecoveryLink } from '../lib/recovery';
import { supabase } from '../lib/supabase';

type AuthValue = {
  session: Session | null;
  /** Perfil do usuário logado (null enquanto carrega ou sem login). */
  profile: MyProfile | null;
  ready: boolean;
  signUp: typeof api.signUp;
  signIn: typeof api.signIn;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
  /** Atualiza o perfil no banco e na memória. */
  saveProfile: (patch: Parameters<typeof api.updateMyProfile>[1]) => Promise<void>;
  /** Veio pelo link de "esqueci a senha": 'active' = pode criar a senha; 'expired' = link vencido. */
  recovery: Recovery;
  updatePassword: (password: string) => Promise<void>;
  endRecovery: () => void;
};

export type Recovery = null | 'checking' | 'active' | 'expired';

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState<Recovery>(null);
  const userId = session?.user.id ?? null;

  // Sessão salva no aparelho + avisos de login/logout.
  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setSession(data.session);
      })
      .catch((e) => console.warn('Falha ao restaurar a sessão', e))
      .finally(() => {
        if (alive) setReady(true);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Link de "esqueci a senha": abre a sessão de recuperação e leva para a tela de nova senha.
  useEffect(() => {
    const seen = new Set<string>();
    async function handle(url: string | null) {
      const link = parseRecoveryLink(url);
      if (!link || !url || seen.has(url)) return;
      seen.add(url);
      // No navegador, tira o token da barra de endereço.
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
      if (link.kind === 'error') return setRecovery('expired');
      setRecovery('checking');
      const { error } = await supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
      setRecovery(error ? 'expired' : 'active');
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    }
    Linking.getInitialURL().then(handle).catch(() => undefined);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw api.toAppError(error);
  }, []);

  const endRecovery = useCallback(() => setRecovery(null), []);

  const reloadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await api.getMyProfile(userId));
    } catch (e) {
      console.warn('Falha ao carregar o perfil', e);
    }
  }, [userId]);

  useEffect(() => {
    reloadProfile();
  }, [reloadProfile]);

  // Push: registra este celular para a conta logada.
  useEffect(() => {
    if (!userId) return;
    listenToNotificationTaps();
    registerForPush();
  }, [userId]);

  // "Online": avisa o servidor a cada minuto enquanto o app está aberto.
  useEffect(() => {
    if (!userId) return undefined;
    api.touch();
    const t = setInterval(() => {
      if (AppState.currentState === 'active') api.touch();
    }, 60000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') api.touch();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [userId]);

  const saveProfile = useCallback<AuthValue['saveProfile']>(
    async (patch) => {
      if (!userId) throw new api.AppError('FAÇA LOGIN DE NOVO.');
      await api.updateMyProfile(userId, patch);
      setProfile((p) => (p ? { ...p, ...patch } : p));
    },
    [userId],
  );

  const signOut = useCallback(async () => {
    await unregisterPush();
    await api.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ session, profile, ready, signUp: api.signUp, signIn: api.signIn, signOut, reloadProfile, saveProfile, recovery, updatePassword, endRecovery }),
    [session, profile, ready, signOut, reloadProfile, saveProfile, recovery, updatePassword, endRecovery],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
