import { go } from '../lib/nav';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as api from '../api';
import { AvatarIcon } from '../avatar/AvatarView';
import { DEFAULT_AVATAR } from '../avatar/avatar';
import { ChatIcon } from '../components/chat';
import { MatchRow } from '../components/match';
import { EmptyCalendarArt, PixelArt, PlusIcon } from '../components/pixel';
import { ErrorText, LoadState, Screen, SectionHeader, SmallButton, T } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useDraft } from '../context/DraftContext';
import { CLOCK_WARN_MS, describeOffset, useClockOffset } from '../lib/clock';
import { useAction, useNow, useRemote } from '../lib/hooks';
import { liveStatus } from '../lib/status';
import { colors, pixelShadow } from '../theme';

export default function Home() {
  const { profile } = useAuth();
  const { reset } = useDraft();
  const now = useNow(30000);
  const invite = useAction();
  const clockOffset = useClockOffset();
  const clockOff = clockOffset !== null && Math.abs(clockOffset) > CLOCK_WARN_MS;

  const remote = useRemote(
    async () => {
      const [matches, invites, friends, unread, chats] = await Promise.all([
        api.myMatches(),
        api.myInvites(),
        api.myFriends(),
        api.unreadNotifications().catch(() => 0),
        api.unreadChats().catch(() => 0),
      ]);
      return { matches, invites, requests: friends.filter((f) => f.kind === 'received').length, unread, chats };
    },
    [],
    { live: true },
  );
  const d = remote.data;
  // Reordena pelo relógio: em andamento → em breve → agendadas.
  const order = { em_andamento: 0, em_breve: 1, agendada: 2, finalizada: 3, cancelada: 3 } as const;
  const matches = (d?.matches ?? [])
    .slice()
    .sort((a, b) => order[liveStatus(a, now)] - order[liveStatus(b, now)] || a.starts_at.localeCompare(b.starts_at));
  const live = matches.filter((m) => liveStatus(m, now) === 'em_andamento').length;

  function newMatch() {
    reset();
    go('/schedule');
  }

  async function answer(inviteId: number, accept: boolean) {
    const id = await invite.run(() => api.respondInvite(inviteId, accept));
    await remote.reload();
    if (accept && id) go(`/match/${id}`);
  }

  return (
    <Screen
      gap={26}
      refreshing={remote.refreshing}
      onRefresh={remote.refresh}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => go('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Abrir seu perfil"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }, pressed && { transform: [{ translateX: 3 }, { translateY: 3 }] }]}
        >
          <AvatarIcon avatar={profile?.avatar ?? DEFAULT_AVATAR} size={60} border={4} shadow={colors.pink} />
          <View style={{ gap: 10, flex: 1 }}>
            <T size={12} numberOfLines={1}>
              OLÁ, <T size={12} color={colors.accent}>{profile?.nickname ?? '...'}</T>
            </T>
            <T size={8} color={colors.muted}>BORA MONTAR O SQUAD?</T>
          </View>
        </Pressable>
        <Pressable
          onPress={newMatch}
          accessibilityRole="button"
          accessibilityLabel="Marcar partida"
          style={({ pressed }) => [
            styles.plus,
            { boxShadow: pressed ? undefined : pixelShadow(colors.pink, 4), transform: pressed ? [{ translateX: 4 }, { translateY: 4 }] : [] },
          ]}
        >
          <PlusIcon />
        </Pressable>
      </View>

      {clockOff ? (
        <View style={styles.clockWarn} accessibilityRole="alert">
          <T size={8} color={colors.accent}>{`⏰ O RELÓGIO DO SEU CELULAR ESTÁ ${describeOffset(clockOffset!)}.`}</T>
          <T size={7} color={colors.muted}>
            O GAMEPLAY JÁ CORRIGE OS HORÁRIOS PELO SERVIDOR. PARA EVITAR CONFUSÃO EM OUTROS APPS, ATIVE "DATA E HORA AUTOMÁTICAS" NOS AJUSTES.
          </T>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Tile label="AMIGOS" badge={d?.requests} onPress={() => go('/friends')} icon={<FriendsIcon />} />
        <Tile label={'PROCURAR\nSQUADS'} onPress={() => go('/search')} icon={<SearchIcon />} />
        <Tile label="CHAT" badge={d?.chats} onPress={() => go('/chats')} icon={<ChatIcon />} />
        <Tile label="AVISOS" badge={d?.unread} onPress={() => go('/notifications')} icon={<BellIcon />} />
      </View>

      {d && d.invites.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionHeader title={`CONVITES (${d.invites.length})`} />
          {d.invites.map((i) => (
            <MatchRow
              key={i.invite_id}
              m={i}
              now={now}
              subtitle={`${i.game.name} · DE ${i.from}`}
              rightTop={<T size={7} color={colors.accent}>CONVITE</T>}
              footer={
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <SmallButton label="✓ ACEITAR" color={colors.green} filled disabled={invite.busy} onPress={() => answer(i.invite_id, true)} style={{ flex: 1 }} />
                  <SmallButton label="RECUSAR" color={colors.host} disabled={invite.busy} onPress={() => answer(i.invite_id, false)} style={{ flex: 1 }} />
                </View>
              }
            />
          ))}
          <ErrorText>{invite.error}</ErrorText>
        </View>
      ) : null}

      <View style={{ gap: 16 }}>
        <SectionHeader
          title="PARTIDAS MARCADAS"
          right={d ? <T size={7} color={colors.dim}>{`${live} AO VIVO · TOTAL ${matches.length}`}</T> : undefined}
        />
        <LoadState loading={remote.loading && !d} error={!d ? remote.error : null} onRetry={remote.reload} />
        {d && matches.length === 0 ? (
          <View style={styles.empty}>
            <EmptyCalendarArt />
            <T size={10} style={{ textAlign: 'center' }}>NENHUMA PARTIDA MARCADA</T>
            <T size={8} color={colors.dim} style={{ textAlign: 'center' }}>
              TOQUE NO + PARA AGENDAR, PROCURE UM SQUAD OU ENTRE POR CÓDIGO.
            </T>
          </View>
        ) : null}
        {matches.map((m) => (
          <MatchRow key={m.id} m={m} now={now} onPress={() => go(`/match/${m.id}`)} />
        ))}
      </View>
    </Screen>
  );
}

function Tile({ label, icon, badge, onPress }: { label: string; icon: ReactNode; badge?: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label.replace('\n', ' ') + (badge ? `, ${badge} novos` : '')}
      style={({ pressed }) => [styles.tile, pressed && { transform: [{ translateX: 3 }, { translateY: 3 }], borderColor: colors.text }]}
    >
      {icon}
      <T size={7} style={{ textAlign: 'center' }}>{label}</T>
      {badge ? (
        <View style={styles.badge}>
          <T size={8} color={colors.bg}>{badge > 99 ? '99+' : String(badge)}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

const BellIcon = () => (
  <PixelArt
    grid={10}
    size={20}
    rects={[[4, 0, 2, 1, colors.accent], [3, 1, 4, 1, colors.accent], [2, 2, 6, 4, colors.accent], [1, 6, 8, 2, colors.accent], [0, 8, 10, 1, colors.accent], [4, 9, 2, 1, colors.text]]}
  />
);
const FriendsIcon = () => (
  <PixelArt grid={11} size={28} rects={[[1, 0, 3, 3, colors.accent], [0, 4, 5, 4, colors.accent], [7, 0, 3, 3, colors.cyan], [6, 4, 5, 4, colors.cyan]]} />
);
const SearchIcon = () => (
  <PixelArt
    grid={8}
    size={20}
    rects={[[1, 0, 4, 1, colors.cyan], [0, 1, 1, 4, colors.cyan], [5, 1, 1, 4, colors.cyan], [1, 5, 4, 1, colors.cyan], [5, 5, 1, 1, colors.accent], [6, 6, 1, 1, colors.accent], [7, 7, 1, 1, colors.accent]]}
  />
);

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 16 },
  plus: {
    width: 56,
    height: 56,
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    flex: 1,
    height: 76,
    backgroundColor: colors.card,
    borderWidth: 3,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -6,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockWarn: { padding: 12, gap: 8, borderWidth: 3, borderColor: colors.accent, backgroundColor: '#2A2410' },
  empty: { alignItems: 'center', gap: 16, paddingVertical: 24, borderWidth: 3, borderStyle: 'dashed', borderColor: colors.line },
});
