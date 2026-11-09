import { go } from '../lib/nav';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as api from '../api';
import type { AppNotification } from '../api/types';
import { AvatarIcon } from '../avatar/AvatarView';
import { GameTile, PixelArt } from '../components/pixel';
import { Empty, LoadState, Screen, SmallButton, T, Title, TopBar } from '../components/ui';
import { formatDate, formatTime } from '../lib/dates';
import { useNow, useRemote } from '../lib/hooks';
import { setAppBadge } from '../lib/push';
import { colors } from '../theme';

/** Cor de destaque por tipo de aviso. */
const TONE: Record<string, string> = {
  invite: colors.accent,
  match_soon: colors.accent,
  match_started: colors.green,
  match_edited: colors.cyan,
  match_canceled: colors.error,
  kicked: colors.error,
  player_joined: colors.green,
  player_left: colors.host,
  squad_full: colors.green,
  invite_accepted: colors.green,
  invite_declined: colors.host,
  friend_request: colors.accent,
  friend_accepted: colors.green,
  friend_public_match: colors.cyan,
};

function ago(iso: string, now: Date): string {
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'AGORA';
  if (min < 60) return `HÁ ${min} MIN`;
  if (min < 24 * 60) return `HÁ ${Math.floor(min / 60)}H`;
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

export default function Notifications() {
  const now = useNow(60000);
  const remote = useRemote(api.myNotifications, [], { live: true });
  const list = remote.data ?? [];
  const unread = list.filter((n) => !n.read).length;

  useEffect(() => {
    setAppBadge(unread);
  }, [unread]);

  async function open(n: AppNotification) {
    if (!n.read) {
      remote.setData(list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      api.markNotificationsRead([n.id]).catch(() => undefined);
    }
    go(n.url as never);
  }

  async function readAll() {
    remote.setData(list.map((x) => ({ ...x, read: true })));
    await api.markNotificationsRead().catch(() => undefined);
  }

  return (
    <Screen gap={14} refreshing={remote.refreshing} onRefresh={remote.refresh}>
      <TopBar right={unread ? `${unread} NOVAS` : 'TUDO LIDO'} />
      <Title size={15}>NOTIFICAÇÕES</Title>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SmallButton label="✓ MARCAR TODAS COMO LIDAS" disabled={!unread} onPress={readAll} style={{ flex: 1 }} />
        <SmallButton label="AJUSTES ›" color={colors.muted} onPress={() => go('/profile?secao=notificacoes')} />
      </View>

      <LoadState loading={remote.loading} error={remote.error} onRetry={remote.reload} />
      {remote.data && list.length === 0 ? (
        <Empty text="NADA POR AQUI AINDA. CONVITES, MUDANÇAS NAS PARTIDAS E PEDIDOS DE AMIZADE APARECEM AQUI." />
      ) : null}

      {list.map((n) => {
        const tone = TONE[n.kind] ?? colors.cyan;
        return (
          <Pressable
            key={n.id}
            onPress={() => open(n)}
            accessibilityRole="button"
            accessibilityLabel={`${n.read ? '' : 'Nova: '}${n.title}. ${n.body}`}
            style={({ pressed }) => [
              styles.row,
              { borderColor: n.read ? colors.line : tone, backgroundColor: n.read ? colors.bg : colors.card },
              pressed && { borderColor: colors.text },
            ]}
          >
            {n.game ? (
              <GameTile tag={n.game.tag} color={n.game.color} size={40} />
            ) : n.actor ? (
              <AvatarIcon avatar={n.actor.avatar} size={40} />
            ) : (
              <View style={[styles.icon, { borderColor: tone }]}>
                <PixelArt grid={8} size={20} rects={[[3, 0, 2, 1, tone], [1, 1, 6, 5, tone], [0, 6, 8, 1, tone], [3, 7, 2, 1, tone]]} />
              </View>
            )}
            <View style={{ flex: 1, gap: 7 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <T size={7} color={tone} style={{ flex: 1 }}>{n.count > 1 ? `${n.title} · ${n.count}` : n.title}</T>
                <T size={6} color={colors.dim}>{ago(n.updated_at, now)}</T>
              </View>
              <T size={7} color={n.read ? colors.dim : colors.text}>{n.body}</T>
            </View>
            {!n.read ? <View style={[styles.dot, { backgroundColor: tone }]} accessibilityLabel="Não lida" /> : null}
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 3 },
  icon: { width: 40, height: 40, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10 },
});
