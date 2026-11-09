import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Push no celular (expo-notifications).
 *
 * - Expo Go no Android NÃO recebe push remoto (desde o SDK 53): para testar,
 *   use um development build ou o APK da EAS. A central de notificações
 *   dentro do app funciona em qualquer lugar.
 * - O token só existe depois do `eas init` (precisa do projectId).
 */

// Com o app aberto, mostra o aviso no topo também.
// Conversa aberta na tela agora (ex.: '/chat/match/12'): mensagem dela não vira aviso.
let activeChatUrl: string | null = null;

// Com o app aberto, mostra o aviso no topo também (menos do chat que está aberto).
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const here = !!activeChatUrl && n.request.content.data?.url === activeChatUrl;
    return { shouldShowBanner: !here, shouldShowList: !here, shouldPlaySound: !here, shouldSetBadge: true };
  },
});

/** A tela de chat avisa quando abre/fecha; ao abrir, limpa os avisos dela da barra do celular. */
export function setActiveChat(url: string | null) {
  activeChatUrl = url;
  if (!url || Platform.OS === 'web') return;
  Notifications.getPresentedNotificationsAsync()
    .then((list) =>
      Promise.all(list.filter((x) => x.request.content.data?.url === url).map((x) => Notifications.dismissNotificationAsync(x.request.identifier))),
    )
    .catch(() => undefined);
}

const CHANNEL_NAMES = { levelup: 'Level up', bip: 'Bip bip', power: 'Power-up' } as const;

let currentToken: string | null = null;

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function pushPermission(): Promise<PushStatus> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Pede permissão, pega o token da Expo e salva no banco. Falhas não travam o app. */
export async function registerForPush(): Promise<PushStatus> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    if (Platform.OS === 'android') {
      // Precisa existir antes de pedir o token (Android 13+).
      // Um canal por som: no Android o som pertence ao canal e não muda depois
      // de criado, então o servidor escolhe o canal (gp_levelup, gp_bip...).
      const base = {
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFD23F',
      };
      await Promise.all([
        ...(['levelup', 'bip', 'power'] as const).map((s) =>
          Notifications.setNotificationChannelAsync(`gp_${s}`, { ...base, name: `GamePlay · ${CHANNEL_NAMES[s]}`, sound: `gp_${s}.wav` }),
        ),
        Notifications.setNotificationChannelAsync('gp_mudo', { ...base, name: 'GamePlay · Sem som', sound: null }),
      ]);
      await Notifications.deleteNotificationChannelAsync('default').catch(() => undefined);
    }
    let { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    if (!granted && canAskAgain) ({ granted, canAskAgain } = await Notifications.requestPermissionsAsync());
    if (!granted) return canAskAgain ? 'undetermined' : 'denied';

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) {
      console.warn('Push: sem projectId (rode "npx eas-cli init"). A central de notificações continua funcionando.');
      return 'granted';
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    currentToken = token;
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    return 'granted';
  } catch (e) {
    // Ex.: Expo Go no Android, sem Google Play Services, emulador...
    console.warn('Push indisponível neste aparelho', e);
    return 'unsupported';
  }
}

/** Ao sair da conta: este celular para de receber os avisos dela. */
export async function unregisterPush() {
  if (!currentToken) return;
  try {
    await supabase.rpc('unregister_push_token', { p_token: currentToken });
  } catch {
    // sem internet: o token é limpo quando a Expo avisar que não vale mais
  }
  currentToken = null;
}

export async function setAppBadge(n: number) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setBadgeCountAsync(n);
  } catch {
    // nem todo launcher do Android tem badge
  }
}

export const openSystemSettings = () => Linking.openSettings();

function openFromNotification(response: Notifications.NotificationResponse | null, tries = 0) {
  const url = response?.notification.request.content.data?.url;
  if (typeof url !== 'string' || !url.startsWith('/')) return;
  try {
    router.push(url as never);
  } catch {
    // App abrindo pelo toque (antes do PRESS START): tenta de novo quando as telas existirem.
    if (tries < 40) setTimeout(() => openFromNotification(response, tries + 1), 500);
  }
}

let listening = false;

/** Tocar na notificação abre a tela certa (partida, amigos, perfil). */
export function listenToNotificationTaps() {
  if (listening || Platform.OS === 'web') return;
  listening = true;
  try {
    Notifications.getLastNotificationResponseAsync().then((r) => openFromNotification(r)).catch(() => undefined);
    Notifications.addNotificationResponseReceivedListener((r) => openFromNotification(r));
  } catch {
    // ignore
  }
}
