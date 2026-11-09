import * as Linking from 'expo-linking';

/**
 * "Esqueci a senha" dentro do app.
 *
 * O e-mail do Supabase leva para `gameplay://reset-password#access_token=...&type=recovery`
 * (no Expo Go `exp://.../--/reset-password`, no navegador `http://.../reset-password`).
 * Aqui lemos esses dados do link; o AuthContext abre a sessão e mostra a tela de nova senha.
 */

/** Endereço que vai no e-mail. Precisa estar em Authentication → URL Configuration → Redirect URLs. */
export const resetRedirectUrl = () => Linking.createURL('reset-password');

export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string };

export function parseRecoveryLink(url: string | null): RecoveryLink | null {
  if (!url || !/reset-password/.test(url)) return null;
  // Os dados vêm depois do "#" (fluxo implícito); por garantia, olha a query também.
  const params = new URLSearchParams();
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.split('?')[1] ?? '';
  for (const part of [query, hash]) new URLSearchParams(part).forEach((v, k) => params.set(k, v));

  const error = params.get('error_description') || params.get('error');
  if (error) return { kind: 'error', message: error };
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken && (params.get('type') ?? 'recovery') === 'recovery') {
    return { kind: 'tokens', accessToken, refreshToken };
  }
  return null;
}
