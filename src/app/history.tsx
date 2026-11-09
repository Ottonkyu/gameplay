import { go } from '../lib/nav';
import { ChatIcon } from '../components/chat';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as api from '../api';
import type { HistoryItem } from '../api/types';
import { GameTile } from '../components/pixel';
import { Box, Chip, Empty, LoadState, Screen, T, Title, TopBar } from '../components/ui';
import { formatDate, formatDuration, formatTime, monthLabel } from '../lib/dates';
import { useRemote } from '../lib/hooks';
import { colors, PLATFORM_NAME } from '../theme';

const RESULT = {
  concluida: { label: 'CONCLUÍDA', color: colors.green },
  cancelada: { label: 'CANCELADA', color: colors.error },
  saiu: { label: 'VOCÊ SAIU', color: colors.host },
  removido: { label: 'VOCÊ FOI REMOVIDO', color: colors.error },
} as const;

const whenOf = (h: HistoryItem) => h.ended_at ?? h.canceled_at ?? h.left_at ?? h.starts_at;

export default function History() {
  const remote = useRemote(api.myHistory, [], { live: true });
  const [filter, setFilter] = useState<'TODAS' | 'ANFITRIÃO' | 'VISITANTE'>('TODAS');
  const [open, setOpen] = useState<number | null>(null);

  const all = remote.data ?? [];
  const list = all.filter((h) => filter === 'TODAS' || (filter === 'ANFITRIÃO' ? h.is_host : !h.is_host));
  const stats = [
    { v: all.length, l: 'PARTIDAS', c: colors.accent },
    { v: all.filter((h) => h.result === 'concluida').length, l: 'CONCLUÍDAS', c: colors.green },
    { v: all.filter((h) => h.is_host).length, l: 'COMO ANFITRIÃO', c: colors.host },
  ];

  let month = '';
  return (
    <Screen gap={14} refreshing={remote.refreshing} onRefresh={remote.refresh}>
      <TopBar right="PERFIL" />
      <Title size={15}>HISTÓRICO DE PARTIDAS</Title>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stats.map((s) => (
          <View key={s.l} style={styles.stat}>
            <T size={14} color={s.c}>{String(s.v)}</T>
            <T size={5} color={colors.dim} style={{ textAlign: 'center' }}>{s.l}</T>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['TODAS', 'ANFITRIÃO', 'VISITANTE'] as const).map((f) => (
          <Chip key={f} compact label={f} selected={filter === f} onPress={() => setFilter(f)} style={{ flex: 1 }} />
        ))}
      </View>
      <LoadState loading={remote.loading} error={remote.error} onRetry={remote.reload} />
      {remote.data && list.length === 0 ? <Empty text="NENHUMA PARTIDA NESSE FILTRO." /> : null}

      {list.map((h) => {
        const ml = monthLabel(whenOf(h));
        const header = ml !== month;
        month = ml;
        const r = RESULT[h.result];
        const isOpen = open === h.id;
        return (
          <Fragment key={h.id}>
            {header ? <T size={8} color={colors.cyan} style={{ marginTop: 6 }}>{ml}</T> : null}
            <View style={[styles.card, { borderColor: isOpen ? colors.accent : colors.line, opacity: h.result === 'concluida' ? 1 : 0.8 }]}>
              <Pressable
                onPress={() => setOpen(isOpen ? null : h.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${isOpen ? 'Fechar' : 'Ver'} detalhes de ${h.name}`}
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 10 }}
              >
                <GameTile tag={h.game.tag} color={h.game.color} size={40} />
                <View style={{ flex: 1, gap: 7 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                    <T size={8} style={{ flex: 1 }}>{h.name}</T>
                    <T size={6} color={r.color}>{r.label}</T>
                  </View>
                  <T size={6} color={colors.dim}>{`${h.game.name} · ${h.category}`}</T>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <T size={6} color={colors.accent}>{`${formatDate(h.starts_at)} ÀS ${formatTime(h.starts_at)}`}</T>
                    <T size={6} color={h.is_host ? colors.host : colors.green}>{h.is_host ? 'ANFITRIÃO' : 'VISITANTE'}</T>
                  </View>
                </View>
                <T size={10} color={colors.cyan}>{isOpen ? '▲' : '▼'}</T>
              </Pressable>
              {isOpen ? (
                <View style={{ paddingHorizontal: 10, paddingBottom: 12, gap: 10 }}>
                  <Detail h={h} />
                  {h.description ? (
                    <Box dashed style={{ backgroundColor: colors.bg }}>
                      <T size={7} color={colors.muted}>{h.description}</T>
                    </Box>
                  ) : null}
                  <T size={6} color={colors.cyan}>{`PLATAFORMA: ${h.platforms.map((p) => PLATFORM_NAME[p]).join(' · ')}`}</T>
                  <T size={6} color={colors.muted}>{`SQUAD (${h.players.length}/${h.max_players}): ${h.players.join(', ') || '—'}`}</T>
                  {h.result === 'removido' ? (
                    <T size={6} color={colors.placeholder}>VOCÊ FOI REMOVIDO DESTE SQUAD, ENTÃO NÃO VÊ O CHAT.</T>
                  ) : (
                    <Pressable
                      onPress={() => go(`/chat/match/${h.id}`)}
                      accessibilityRole="link"
                      style={({ pressed }) => ({ minHeight: 38, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderWidth: 3, borderColor: pressed ? colors.text : colors.border })}
                    >
                      <ChatIcon size={14} />
                      <T size={7} color={colors.cyan}>VER CHAT DA PARTIDA ›</T>
                    </Pressable>
                  )}
                  <Pressable onPress={() => go(`/match/${h.id}`)} accessibilityRole="link">
                    <T size={7} color={colors.cyan}>VER PARTIDA ›</T>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </Fragment>
        );
      })}
    </Screen>
  );
}

function Detail({ h }: { h: HistoryItem }) {
  const line = (text: string, color: string, bg: string) => (
    <View style={{ padding: 8, borderWidth: 3, borderColor: color, backgroundColor: bg }}>
      <T size={6} color={color}>{text}</T>
    </View>
  );
  if (h.result === 'concluida' && h.ended_at) {
    return line(`ENCERRADA POR ${h.is_host ? 'VOCÊ' : h.host.nickname} · DUROU ${formatDuration(new Date(h.ended_at).getTime() - new Date(h.starts_at).getTime())}`, colors.green, '#1B2A2A');
  }
  if (h.result === 'cancelada') {
    return line(`CANCELADA POR ${h.is_host ? 'VOCÊ' : h.host.nickname} · MOTIVO: ${h.cancel_reason ?? '—'}`, colors.error, '#2A1420');
  }
  if (h.result === 'saiu' && h.left_at) {
    const before = new Date(h.left_at) < new Date(h.starts_at);
    return line(`VOCÊ SAIU EM ${formatDate(h.left_at)} ÀS ${formatTime(h.left_at)} · ${before ? 'ANTES DO INÍCIO' : 'DURANTE A PARTIDA'} · ANFITRIÃO: ${h.host.nickname}`, colors.host, '#2A1420');
  }
  if (h.result === 'removido') return line(`${h.host.nickname} (ANFITRIÃO) TE REMOVEU DO SQUAD.`, colors.error, '#2A1420');
  return null;
}

const styles = StyleSheet.create({
  stat: { flex: 1, height: 70, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 3, borderColor: colors.line },
  card: { backgroundColor: colors.card, borderWidth: 3 },
});
