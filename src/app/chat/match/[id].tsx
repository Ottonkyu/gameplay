import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { go } from '../../../lib/nav';
import { useCallback, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import * as api from '../../../api';
import { AvatarIcon } from '../../../avatar/AvatarView';
import { ClosedBar, Composer, MessageList, type ChatMarker } from '../../../components/chat';
import { GameTile } from '../../../components/pixel';
import { LoadState, Screen, T, TopBar } from '../../../components/ui';
import { serverNow } from '../../../lib/clock';
import { useNow, useRemote } from '../../../lib/hooks';
import { liveStatus, squadText, statusTag, whenLine } from '../../../lib/status';
import { setActiveChat } from '../../../lib/push';
import { colors } from '../../../theme';

const QUICK: [string, string][] = [
  ['+ MEU NICK NO JOGO', 'MEU NICK NO JOGO É '],
  ['PRONTO!', 'PRONTO, PODE CHAMAR!'],
  ['5 MIN', 'CHEGO EM 5 MIN'],
  ['CALL?', 'ALGUÉM VAI NA CALL?'],
];

/** Chat do squad de uma partida. */
export default function MatchChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const matchId = Number(id);
  const now = useNow(30000);
  const remote = useRemote(() => api.matchChat(matchId), [matchId], { live: true });
  const c = remote.data;

  // Abriu ou chegou mensagem nova com a tela aberta: marca como lido.
  const lastId = c?.messages.at(-1)?.id ?? 0;
  useEffect(() => {
    if (c) api.markChatRead(`m:${matchId}`).catch(() => undefined);
  }, [c, lastId, matchId]);

  // Enquanto esta conversa está aberta, as mensagens dela não viram aviso no celular.
  useFocusEffect(
    useCallback(() => {
      setActiveChat(`/chat/match/${matchId}`);
      return () => setActiveChat(null);
    }, [matchId]),
  );

  if (!c) {
    return (
      <Screen>
        <TopBar />
        <LoadState loading={remote.loading} error={remote.error} onRetry={remote.reload} />
      </Screen>
    );
  }

  const m = c.match;
  const st = liveStatus(m, now);
  const tag = statusTag(st, Math.max(1, Math.ceil((new Date(m.starts_at).getTime() - now.getTime()) / 60000)));
  const w = whenLine(m, now);
  const hostId = c.members.find((x) => x.is_host)?.id ?? m.host.id;

  const markers: ChatMarker[] = [{ at: c.created_at, text: 'CHAT DO SQUAD CRIADO COM A PARTIDA. SÓ QUEM ESTÁ NO SQUAD VÊ ESTAS MENSAGENS.', color: colors.cyan }];
  if (!c.canceled_at && new Date(m.starts_at).getTime() <= serverNow().getTime()) markers.push({ at: m.starts_at > c.created_at ? m.starts_at : c.created_at, text: 'A PARTIDA COMEÇOU', color: colors.accent });
  if (c.ended_at) markers.push({ at: c.ended_at, text: 'O ANFITRIÃO ENCERROU A PARTIDA. O CHAT FOI FECHADO.', color: colors.host });
  if (c.canceled_at) markers.push({ at: c.canceled_at, text: 'A PARTIDA FOI CANCELADA. O CHAT FOI FECHADO.', color: colors.error });

  // Removido do squad com a tela aberta: o recarregamento é recusado, então troca o campo de mensagem pelo aviso.
  const lostAccess = !!remote.error && /ACESSO/.test(remote.error);
  const footer = lostAccess ? (
    <ClosedBar title="SEM ACESSO" text="VOCÊ FOI REMOVIDO DESTE SQUAD. O CHAT NÃO ESTÁ MAIS DISPONÍVEL PARA VOCÊ." />
  ) : c.can_send ? (
    <Composer
      placeholder="MENSAGEM PARA O SQUAD"
      quick={QUICK}
      onSend={async (text) => {
        try {
          await api.sendMatchMessage(matchId, text);
        } finally {
          // Se falhou (ex.: foi removido do squad), recarrega e mostra o estado novo.
          await remote.reload();
        }
      }}
    />
  ) : c.closed ? (
    <ClosedBar title="CHAT ENCERRADO" text={`A PARTIDA FOI ${c.canceled_at ? 'CANCELADA' : 'FINALIZADA PELO ANFITRIÃO'}. AS MENSAGENS FICAM SALVAS AQUI, SÓ PARA LEITURA.`} />
  ) : (
    <ClosedBar title="SÓ LEITURA" text="VOCÊ SAIU DESTE SQUAD. DÁ PARA LER O QUE JÁ FOI DITO, MAS NÃO MANDAR MENSAGEM." />
  );

  return (
    <Screen scroll={false} gap={12} footer={footer}>
      <TopBar
        right={tag?.label ?? m.category}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/chats'))}
      />
      <Pressable
        onPress={() => go(`/match/${matchId}`)}
        accessibilityRole="button"
        accessibilityLabel={`Ver detalhes da partida ${m.name}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, backgroundColor: colors.card, borderWidth: 3, borderColor: pressed ? colors.text : st === 'em_andamento' ? colors.green : colors.line })}
      >
        <GameTile tag={m.game.tag} color={m.game.color} size={46} />
        <View style={{ flex: 1, gap: 7, minWidth: 0 }}>
          <T size={10} color={colors.accent} numberOfLines={1}>{m.name}</T>
          <T size={6} color={w.color} numberOfLines={1}>{`${m.game.name} · ${w.text}`}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {c.members.slice(0, c.members.length > 5 ? 4 : 5).map((p) => (
              <AvatarIcon key={p.id} avatar={p.avatar} size={20} border={2} label={p.nickname} />
            ))}
            {c.members.length > 5 ? <T size={6} color={colors.muted}>{`+${c.members.length - 4}`}</T> : null}
            <T size={6} color={colors.muted} numberOfLines={1} style={{ marginLeft: 4, flexShrink: 1, minWidth: 0 }}>{squadText(m.filled, m.max_players)}</T>
          </View>
        </View>
        <T color={colors.cyan}>›</T>
      </Pressable>
      <MessageList messages={c.messages} markers={markers} hostId={hostId} empty="NINGUÉM FALOU AINDA. COMBINE O NICK DO JOGO E A CALL AQUI." />
    </Screen>
  );
}
