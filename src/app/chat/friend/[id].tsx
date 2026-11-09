import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { go } from '../../../lib/nav';
import { useCallback, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import * as api from '../../../api';
import { AvatarIcon } from '../../../avatar/AvatarView';
import { ClosedBar, Composer, MessageList } from '../../../components/chat';
import { LoadState, Screen, SmallButton, T, TopBar } from '../../../components/ui';
import { useRemote } from '../../../lib/hooks';
import { setActiveChat } from '../../../lib/push';
import { colors, nickSize } from '../../../theme';

const QUICK: [string, string][] = [
  ['BORA JOGAR?', 'BORA JOGAR?'],
  ['ME ADD', 'ME ADD NO JOGO: '],
  ['GG!', 'GG! VALEU PELA PARTIDA'],
];

/** Conversa direta com um amigo. */
export default function FriendChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const remote = useRemote(() => api.directChat(id), [id], { live: true });
  const c = remote.data;

  const lastId = c?.messages.at(-1)?.id ?? 0;
  useEffect(() => {
    if (c) api.markChatRead(`d:${id}`).catch(() => undefined);
  }, [c, lastId, id]);

  // Enquanto esta conversa está aberta, as mensagens dela não viram aviso no celular.
  useFocusEffect(
    useCallback(() => {
      setActiveChat(`/chat/friend/${id}`);
      return () => setActiveChat(null);
    }, [id]),
  );

  if (!c) {
    return (
      <Screen>
        <TopBar />
        <LoadState loading={remote.loading} error={remote.error} onRetry={remote.reload} />
      </Screen>
    );
  }
  const f = c.friend;

  const footer = c.can_send ? (
    <View style={{ gap: 8 }}>
      <SmallButton label={`+ CONVIDAR ${f.nickname} P/ PARTIDA`} onPress={() => go(`/invite/${f.id}`)} style={{ height: 36 }} />
      <Composer
        placeholder={`MENSAGEM PARA ${f.nickname}`}
        quick={QUICK}
        onSend={async (text) => {
          try {
            await api.sendDirectMessage(f.id, text);
          } finally {
            // Se falhou (ex.: a amizade foi desfeita), recarrega e mostra o estado novo.
            await remote.reload();
          }
        }}
      />
    </View>
  ) : (
    <ClosedBar
      title="SÓ LEITURA"
      text={
        c.messages.length
          ? `VOCÊ E ${f.nickname} NÃO SÃO MAIS AMIGOS. PARA CONVERSAR DE NOVO, MANDE UM PEDIDO DE AMIZADE.`
          : `VOCÊ E ${f.nickname} NÃO SÃO AMIGOS. PARA CONVERSAR, MANDE UM PEDIDO DE AMIZADE.`
      }
    />
  );

  return (
    <Screen scroll={false} gap={12} footer={footer}>
      <TopBar right="AMIGO" onBack={() => (router.canGoBack() ? router.back() : router.replace('/chats'))} />
      <Pressable
        onPress={() => go(`/player/${f.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Ver perfil de ${f.nickname}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, backgroundColor: colors.card, borderWidth: 3, borderColor: pressed ? colors.text : colors.line })}
      >
        <View>
          <AvatarIcon avatar={f.avatar} size={48} border={3} />
          <View style={{ position: 'absolute', right: -3, bottom: -3, width: 12, height: 12, backgroundColor: f.online ? colors.green : colors.border, borderWidth: 2, borderColor: colors.bg }} />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <T size={nickSize(f.nickname, 11)} numberOfLines={1} color={colors.accent}>{f.nickname}</T>
          <T size={6} color={f.online ? colors.green : colors.dim}>{f.online ? 'ONLINE' : 'OFFLINE'}</T>
        </View>
        <T size={6} color={colors.cyan}>VER PERFIL ›</T>
      </Pressable>
      <MessageList messages={c.messages} showNicks={false} empty={c.can_send ? `COMECE A CONVERSA COM ${f.nickname}.` : 'NENHUMA MENSAGEM.'} />
    </Screen>
  );
}
