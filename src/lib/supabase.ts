import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * Cliente único do Supabase. A URL e a chave pública (publishable/anon key)
 * vêm do arquivo .env (veja .env.example). A chave pública pode ficar no app:
 * quem protege os dados são as regras de RLS e as funções do banco.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url ?? 'https://configure-o-env.supabase.co', key ?? 'configure-o-env', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// No celular, só renova o token com o app aberto (recomendação do Supabase).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
