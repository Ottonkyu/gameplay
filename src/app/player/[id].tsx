import { router, useLocalSearchParams } from 'expo-router';
import { go } from '../../lib/nav';
import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import * as api from '../../api';
import { AvatarStage } from '../../avatar/AvatarView';
import { GameTile, PixelArt } from '../../components/pixel';
import { Box, ErrorText, LoadState, PixelButton, Screen, SmallButton, T, Tag, TopBar } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useAction, useRemote } from '../../lib/hooks';
import { colors, nickSize } from '../../theme';

const VIS = {
  publica: { label: 'PERFIL PÚBLICO', bg: colors.green },
  amigos: { label: 'SÓ AMIGOS', bg: colors.accent },
  privada: { label: 'PERFIL PRIVADO', bg: colors.error },
} as const;

export default function PlayerScreen() {
  const narrow = useWindowDimensions().width < 360; // 320px: botões um embaixo do outro
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const remote = useRemote(() => api.getPlayerProfile(id), [id]);
  const games = useRemote(api.listGames, []);
  const action = useAction();
  const p = remote.data;

  // O próprio perfil abre na tela de Perfil (onde dá para editar).
  useEffect(() => {
    if (p?.relation === 'self' || id === session?.user.id) router.replace('/profile');
  }, [p?.relation, id, session?.user.id]);

  if (!p) {
    return (
      <Screen>
        <TopBar />
        <LoadState loading={remote.loading} error={remote.error} onRetry={remote.reload} />
      </Screen>
    );
  }

  const rel = {
    friend: { btn: 'AMIGOS ✓', text: 'VOCÊS SÃO AMIGOS.', on: false },
    none: { btn: '+ ADICIONAR AMIGO', text: 'VOCÊS AINDA NÃO SÃO AMIGOS.', on: true },
    sent: { btn: 'PEDIDO ENVIADO', text: `ESPERANDO ${p.nickname} ACEITAR.`, on: false },
    received: { btn: '✓ ACEITAR PEDIDO', text: `${p.nickname} QUER SER SEU AMIGO.`, on: true },
    self: { btn: '', text: '', on: false },
  }[p.relation];

  async function relAction() {
    await action.run(async () => {
      if (p!.relation === 'none') await api.sendFriendRequestTo(p!.id);
      else if (p!.relation === 'received') await api.respondFriendRequest(p!.id, true);
    });
    await remote.reload();
  }

  const favGames = (p.fav_games ?? []).map((n) => games.data?.find((g) => g.name === n)).filter(Boolean);
  const vis = VIS[p.visibility];
  const locked = !p.visible;

  return (
    <Screen gap={16} refreshing={remote.refreshing} onRefresh={remote.refresh}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TopBar />
        <Tag label={vis.label} bg={vis.bg} />
      </View>

      <View style={{ flexDirection: 'row', gap: 16 }}>
        <AvatarStage avatar={p.avatar} width={132} border={6} shadow={colors.pink} label={`Avatar de ${p.nickname}`} />
        <View style={{ flex: 1, gap: 12, paddingTop: 4 }}>
          <T size={nickSize(p.nickname, 12)} numberOfLines={1} color={colors.accent} style={{ textShadowColor: colors.pink, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 }}>
            {p.nickname}
          </T>
          {p.relation === 'friend' && p.online !== null ? (
            <T size={7} color={p.online ? colors.green : colors.dim}>{p.online ? '● ONLINE' : 'OFFLINE'}</T>
          ) : null}
          <T size={6} color={colors.dim}>{rel.text}</T>
          <View style={{ flex: 1 }} />
          <SmallButton
            label={rel.btn}
            color={p.relation === 'friend' ? colors.green : colors.accent}
            filled
            disabled={!rel.on || action.busy}
            onPress={relAction}
            style={{ height: 42 }}
          />
          {p.relation === 'friend' ? (
            <View style={{ flexDirection: narrow ? 'column' : 'row', gap: 8 }}>
              <SmallButton label="CONVERSAR" color={colors.cyan} filled onPress={() => go(`/chat/friend/${p.id}`)} accessibilityLabel={`Conversar com ${p.nickname}`} style={narrow ? { height: 38 } : { height: 38, flex: 1 }} />
              <SmallButton label="CONVIDAR" onPress={() => go(`/invite/${p.id}`)} style={narrow ? { height: 38 } : { height: 38, flex: 1 }} />
            </View>
          ) : null}
        </View>
      </View>
      <ErrorText>{action.error}</ErrorText>

      {locked ? (
        <Box dashed style={{ alignItems: 'center', paddingVertical: 22, borderWidth: 4 }}>
          <PixelArt
            grid={8}
            size={40}
            rects={[
              [2, 0, 4, 1, p.visibility === 'privada' ? colors.error : colors.accent],
              [1, 1, 1, 3, p.visibility === 'privada' ? colors.error : colors.accent],
              [6, 1, 1, 3, p.visibility === 'privada' ? colors.error : colors.accent],
              [0, 3, 8, 5, p.visibility === 'privada' ? colors.error : colors.accent],
              [3, 5, 2, 2, colors.card],
            ]}
          />
          <T size={10} color={p.visibility === 'privada' ? colors.error : colors.accent} style={{ textAlign: 'center' }}>
            {p.visibility === 'privada' ? 'PERFIL PRIVADO' : 'PERFIL SÓ PARA AMIGOS'}
          </T>
          <T size={7} color={colors.muted} style={{ textAlign: 'center' }}>
            {p.visibility === 'privada'
              ? `${p.nickname} ESCOLHEU ESCONDER O SOBRE, OS ESTILOS E OS JOGOS DE TODO MUNDO, ATÉ DOS AMIGOS.`
              : `ADICIONE ${p.nickname} COMO AMIGO PARA VER O SOBRE, OS ESTILOS E OS JOGOS PREFERIDOS.`}
          </T>
        </Box>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <T size={9}>SOBRE</T>
            <Box dashed>
              <T size={7} color={colors.muted}>{p.bio || 'ESSE JOGADOR AINDA NÃO ESCREVEU NADA.'}</T>
            </Box>
          </View>
          <View style={{ gap: 8 }}>
            <T size={9}>ESTILOS PREFERIDOS</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(p.genres ?? []).length ? (p.genres ?? []).map((g) => <Tag key={g} label={g} />) : <T size={7} color={colors.dim}>NENHUM ESTILO ESCOLHIDO</T>}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <T size={9}>JOGOS PREFERIDOS</T>
            {favGames.length ? (
              favGames.map((g) => (
                <Box key={g!.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 6 }}>
                  <GameTile tag={g!.tag} color={g!.color} size={28} />
                  <T size={7}>{g!.name}</T>
                </Box>
              ))
            ) : (
              <T size={7} color={colors.dim}>NENHUM JOGO ESCOLHIDO</T>
            )}
          </View>
          <T size={6} color={colors.dim}>
            {p.matches_together > 0
              ? `VOCÊS JÁ JOGARAM ${p.matches_together} ${p.matches_together === 1 ? 'PARTIDA' : 'PARTIDAS'} JUNTOS.`
              : 'VOCÊS AINDA NÃO JOGARAM JUNTOS.'}
          </T>
        </>
      )}
      {p.relation === 'friend' ? (
        <PixelButton
          label="DESFAZER AMIZADE"
          variant="danger"
          size="md"
          shadow={false}
          onPress={async () => {
            await action.run(() => api.removeFriend(p.id));
            await remote.reload();
          }}
          style={{ marginTop: 8 }}
        />
      ) : null}
    </Screen>
  );
}
