import { go } from '../lib/nav';
import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import * as api from '../api';
import type { ChatSummary } from '../api/types';
import { AvatarIcon } from '../avatar/AvatarView';
import { LockIcon, shortWhen } from '../components/chat';
import { GameTile } from '../components/pixel';
import { Empty, LoadState, Screen, SectionHeader, T, Title, TopBar } from '../components/ui';
import { useNow, useRemote } from '../lib/hooks';
import { whenLine, squadText } from '../lib/status';
import { colors, font, FONT_SCALE_MAX } from '../theme';

const TABS = ['TODOS', 'SQUADS', 'AMIGOS'] as const;

/** Central de chat: squads das partidas ativas + conversas com amigos. */
export default function Chats() {
  const now = useNow(30000);
  const remote = useRemote(api.myChats, [], { live: true });
  const [tab, setTab] = useState<(typeof TABS)[number]>('TODOS');
  const [q, setQ] = useState('');
  const d = remote.data;
  const query = q.trim().toUpperCase();
  const squads = (d?.squads ?? []).filter((s) => !query || s.match.name.includes(query) || s.match.game.name.includes(query));
  const direct = (d?.direct ?? []).filter((c) => !query || c.friend.nickname.includes(query));
  const unread = [...(d?.squads ?? []), ...(d?.direct ?? [])].reduce((a, c) => a + c.unread, 0);
  const showSquads = tab !== 'AMIGOS' && squads.length > 0;
  const showDirect = tab !== 'SQUADS' && direct.length > 0;

  return (
    <Screen gap={16} refreshing={remote.refreshing} onRefresh={remote.refresh}>
      <TopBar right={d ? `${unread} NOVAS` : undefined} />
      <Title>CHAT</Title>
      <TextInput
        maxFontSizeMultiplier={FONT_SCALE_MAX}
        value={q}
        onChangeText={setQ}
        placeholder="PARTIDA OU AMIGO"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="characters"
        accessibilityLabel="Buscar conversa"
        style={{ height: 46, paddingHorizontal: 14, borderWidth: 3, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontFamily: font, fontSize: 10 }}
      />
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderWidth: 3, borderColor: colors.border }}>
        {TABS.map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            style={{ flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === t ? colors.accent : colors.bg }}
          >
            <T size={7} color={tab === t ? colors.bg : colors.muted}>{t}</T>
          </Pressable>
        ))}
      </View>

      <LoadState loading={remote.loading && !d} error={!d ? remote.error : null} onRetry={remote.reload} />

      {showSquads ? (
        <View style={{ gap: 10 }}>
          <SectionHeader title={`SQUADS DAS SUAS PARTIDAS (${squads.length})`} />
          {squads.map((s) => {
            const w = whenLine(s.match, now);
            return (
              <ChatRow
                key={s.key}
                c={s}
                left={<GameTile tag={s.match.game.tag} color={s.match.game.color} size={44} />}
                title={s.match.name}
                sub={`${w.text} · ${squadText(s.match.filled, s.match.max_players)}`}
                subColor={w.color}
                live={w.color === colors.green}
                onPress={() => go(`/chat/match/${s.match.id}`)}
              />
            );
          })}
        </View>
      ) : null}

      {showDirect ? (
        <View style={{ gap: 10 }}>
          <SectionHeader title={`AMIGOS (${direct.length})`} />
          {direct.map((c) => (
            <ChatRow
              key={c.key}
              c={c}
              left={
                <View>
                  <AvatarIcon avatar={c.friend.avatar} size={44} border={3} />
                  <View style={{ position: 'absolute', right: -3, bottom: -3, width: 12, height: 12, backgroundColor: c.friend.online ? colors.green : colors.border, borderWidth: 2, borderColor: colors.bg }} />
                </View>
              }
              title={c.friend.nickname}
              sub={c.is_friend ? (c.friend.online ? 'ONLINE' : 'OFFLINE') : 'NÃO É MAIS SEU AMIGO · SÓ LEITURA'}
              subColor={c.is_friend && c.friend.online ? colors.green : colors.dim}
              onPress={() => go(`/chat/friend/${c.friend.id}`)}
            />
          ))}
        </View>
      ) : null}

      {d && !showSquads && !showDirect ? (
        <Empty
          text={
            query
              ? 'NENHUMA CONVERSA ENCONTRADA.'
              : tab === 'AMIGOS'
                ? 'NENHUMA CONVERSA COM AMIGOS AINDA. ABRA O PERFIL DE UM AMIGO E TOQUE EM CONVERSAR.'
                : 'VOCÊ NÃO ESTÁ EM NENHUMA PARTIDA ATIVA. CADA PARTIDA TEM UM CHAT DO SQUAD.'
          }
        />
      ) : null}

      <Pressable
        onPress={() => go('/history')}
        accessibilityRole="link"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 3, borderStyle: 'dashed', borderColor: pressed ? colors.text : colors.line })}
      >
        <LockIcon />
        <T size={6} color={colors.dim} style={{ flex: 1 }}>
          CHATS DE PARTIDAS FINALIZADAS FICAM NO <T size={6} color={colors.cyan}>HISTÓRICO ›</T>
        </T>
      </Pressable>
    </Screen>
  );
}

function ChatRow({
  c,
  left,
  title,
  sub,
  subColor,
  live,
  onPress,
}: {
  c: ChatSummary;
  left: ReactNode;
  title: string;
  sub: string;
  subColor: string;
  live?: boolean;
  onPress: () => void;
}) {
  const last = c.last ? `${c.last.mine ? 'VOCÊ' : c.last.sender.nickname}: ${c.last.body}` : 'NENHUMA MENSAGEM AINDA. DIGA OI!';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir conversa ${title}${c.unread ? `, ${c.unread} novas` : ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        backgroundColor: colors.card,
        borderWidth: 3,
        borderColor: pressed ? colors.text : c.unread ? colors.accent : live ? colors.green : colors.line,
      })}
    >
      {left}
      <View style={{ flex: 1, gap: 7, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
          <T size={8} numberOfLines={1} style={{ flexShrink: 1 }}>{title}</T>
          {c.last ? <T size={6} color={colors.dim}>{shortWhen(c.last.created_at)}</T> : null}
        </View>
        <T size={6} color={subColor} numberOfLines={1}>{sub}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T size={6} color={c.last ? colors.muted : colors.placeholder} numberOfLines={1} style={{ flex: 1 }}>{last}</T>
          {c.unread ? (
            <View style={{ minWidth: 20, height: 20, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.text }}>
              <T size={7} color={colors.bg}>{c.unread > 99 ? '99+' : String(c.unread)}</T>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
