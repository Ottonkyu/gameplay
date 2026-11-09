import { useLocalSearchParams } from 'expo-router';
import { go } from '../../lib/nav';
import { useState } from 'react';
import { View } from 'react-native';
import * as api from '../../api';
import { MatchRow } from '../../components/match';
import { Empty, LoadState, Note, PixelButton, Screen, SmallButton, T, Title, TopBar } from '../../components/ui';
import { useDraft } from '../../context/DraftContext';
import { useNow, useRemote } from '../../lib/hooks';
import { colors } from '../../theme';

/** "Partidas disponíveis": minhas partidas com vaga para convidar um jogador. */
export default function InviteTo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reset } = useDraft();
  const now = useNow();
  const player = useRemote(() => api.getPlayerProfile(id), [id]);
  const remote = useRemote(() => api.matchesForInvite(id), [id], { live: true });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const nick = player.data?.nickname ?? '...';

  async function toggle(matchId: number, name: string, invited: boolean) {
    setBusy(matchId);
    setMsg(null);
    try {
      if (invited) {
        await api.cancelInvite(matchId, id);
        setMsg({ text: `CONVITE PARA ${name} DESFEITO.`, ok: false });
      } else {
        await api.invitePlayer(matchId, id);
        setMsg({ text: `CONVITE ENVIADO! ${nick} VAI VER O CONVITE DE ${name} NA HOME.`, ok: true });
      }
      await remote.reload();
    } catch (e) {
      setMsg({ text: api.errorMessage(e), ok: false });
    } finally {
      setBusy(null);
    }
  }

  // Link de jogador que não existe (ou foi apagado): não mostra a lista de partidas.
  if (player.error && !player.data) {
    return (
      <Screen gap={14}>
        <TopBar right="CONVITE" />
        <LoadState error={player.error} onRetry={player.reload} />
      </Screen>
    );
  }

  return (
    <Screen
      gap={14}
      refreshing={remote.refreshing}
      onRefresh={remote.refresh}
      footer={
        <PixelButton
          label="+ CRIAR PARTIDA NOVA"
          size="md"
          onPress={() => {
            reset();
            go('/schedule');
          }}
        />
      }
    >
      <TopBar right="CONVITE" />
      <Title size={15}>PARTIDAS DISPONÍVEIS</Title>
      <T size={7} color={colors.muted}>
        CONVIDAR <T size={7} color={colors.cyan}>{nick}</T> PARA UMA PARTIDA SUA COM VAGA LIVRE:
      </T>
      <Note tone={msg ? (msg.ok ? 'ok' : 'warn') : 'hint'} text={msg?.text ?? 'PARTIDAS LOTADAS OU QUE JÁ ACABARAM NÃO APARECEM AQUI.'} />
      <LoadState loading={remote.loading} error={remote.error} onRetry={remote.reload} />
      {remote.data && remote.data.length === 0 ? (
        <Empty text={`VOCÊ NÃO ESTÁ EM NENHUMA PARTIDA COM VAGA LIVRE. CRIE UMA NOVA E CHAME ${nick}.`} />
      ) : null}
      <View style={{ gap: 10 }}>
        {(remote.data ?? []).map((m) => {
          const free = m.max_players - m.filled;
          return (
            <MatchRow
              key={m.id}
              m={m}
              now={now}
              subtitle={`${m.game.name} · ${free === 1 ? '1 VAGA' : `${free} VAGAS`}`}
              footer={
                <SmallButton
                  label={m.target_in_squad ? `${nick} JÁ ESTÁ NO SQUAD` : m.target_invited ? 'CONVIDADO ✓ (TOQUE P/ DESFAZER)' : `CONVIDAR ${nick}`}
                  color={m.target_invited ? colors.green : colors.accent}
                  filled={!m.target_in_squad}
                  disabled={m.target_in_squad || busy === m.id}
                  onPress={() => toggle(m.id, m.name, m.target_invited)}
                />
              }
            />
          );
        })}
      </View>
    </Screen>
  );
}
