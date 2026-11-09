import { router } from 'expo-router';
import { go } from '../lib/nav';
import { useState } from 'react';
import { Alert, useWindowDimensions, View } from 'react-native';
import * as api from '../api';
import type { Platform } from '../api/types';
import { GameTile } from '../components/pixel';
import { Box, Chip, ErrorText, FieldLink, Note, PixelButton, PixelInput, Screen, T, Title, TopBar, capsInput } from '../components/ui';
import { useDraft } from '../context/DraftContext';
import { formatDayMonth, fromParts } from '../lib/dates';
import { serverNowMs, timeZoneText } from '../lib/clock';
import { useAction } from '../lib/hooks';
import { CATEGORIES, colors, DESCRIPTION_MAX, NAME_MAX, PLATFORMS, PLATFORM_NAME } from '../theme';

/** Agendar partida nova ou editar uma existente (draft.matchId). */
export default function Schedule() {
  const narrow = useWindowDimensions().width < 360; // celulares de 320px: categorias em 2x2
  const { draft, update, reset } = useDraft();
  const editing = draft.matchId !== null;
  const { busy, error, setError, run } = useAction();
  const [tried, setTried] = useState(false);

  const available = draft.game?.platforms ?? [];
  const togglePlatform = (p: Platform) =>
    update({ platforms: draft.platforms.includes(p) ? draft.platforms.filter((x) => x !== p) : [...draft.platforms, p] });

  const problems = {
    name: draft.name.trim().length < 3 ? 'O NOME PRECISA TER PELO MENOS 3 LETRAS' : null,
    game: !draft.game ? 'ESCOLHA O JOGO' : null,
    platforms: draft.game && draft.platforms.length === 0 ? 'ESCOLHA PELO MENOS UMA PLATAFORMA' : null,
    date: !draft.date ? 'ESCOLHA A DATA' : null,
    time: !draft.time ? 'ESCOLHA A HORA' : null,
  };

  async function submit() {
    setTried(true);
    const first = Object.values(problems).find(Boolean);
    if (first) {
      setError(first);
      return;
    }
    const startsAt = fromParts(draft.date!, draft.time!);
    if (startsAt.getTime() <= serverNowMs()) {
      setError('ESSE HORÁRIO JÁ PASSOU. ESCOLHA OUTRO.');
      return;
    }
    const input = {
      name: draft.name,
      category: draft.category,
      platforms: draft.platforms,
      visibility: draft.visibility,
      startsAt,
      description: draft.description,
    };
    const id = await run(async () => {
      if (editing) {
        await api.updateMatch(draft.matchId!, input);
        return draft.matchId!;
      }
      return api.createMatch(draft.game!.id, input);
    });
    if (!id) return;
    reset();
    if (editing) {
      router.back();
      return;
    }
    if (draft.visibility === 'publica') {
      Alert.alert('Partida agendada', 'Ela já aparece em PROCURAR SQUADS para outros jogadores.');
    }
    router.replace(`/match/${id}`);
  }

  return (
    <Screen
      gap={18}
      footer={<PixelButton label={editing ? 'SALVAR ALTERAÇÕES' : 'AGENDAR PARTIDA ›'} onPress={submit} loading={busy} />}
    >
      <TopBar right={editing ? 'EDITANDO' : 'NOVA PARTIDA'} />
      <Title>{editing ? 'EDITAR PARTIDA' : 'AGENDAR PARTIDA'}</Title>

      <PixelInput
        label="NOME DA PARTIDA"
        counter={`${draft.name.length}/${NAME_MAX}`}
        value={draft.name}
        onChangeText={(v) => update({ name: v })}
        placeholder="EX: RUMO AO TOPO"
        {...capsInput}
        maxLength={NAME_MAX}
        error={tried ? problems.name : null}
      />

      <View style={{ gap: 10 }}>
        <T>CATEGORIA</T>
        <View style={{ flexDirection: 'row', flexWrap: narrow ? 'wrap' : 'nowrap', gap: 6 }}>
          {CATEGORIES.map((c) => (
            <Chip key={c} compact label={c === 'CAMPEONATO' && !narrow ? 'CAMPEON.' : c} selected={draft.category === c} onPress={() => update({ category: c })} style={narrow ? { flexBasis: '47%', flexGrow: 1 } : { flex: 1, paddingHorizontal: 2 }} />
          ))}
        </View>
      </View>

      {editing && draft.game ? (
        <View style={{ gap: 8 }}>
          <T>JOGO</T>
          <Box style={{ flexDirection: 'row', alignItems: 'center' }}>
            <GameTile tag={draft.game.tag} color={draft.game.color} size={30} />
            <T size={8} style={{ flex: 1 }}>{draft.game.name}</T>
          </Box>
          <Note text="O JOGO NÃO MUDA DEPOIS DE CRIAR. PARA OUTRO JOGO, CANCELE E AGENDE UMA NOVA." />
        </View>
      ) : (
        <FieldLink
          label="JOGO"
          value={draft.game?.name ?? null}
          placeholder="SELECIONAR JOGO"
          onPress={() => go('/pick-game')}
          leading={draft.game ? <GameTile tag={draft.game.tag} color={draft.game.color} size={30} /> : undefined}
        />
      )}
      {tried && problems.game ? <ErrorText>{problems.game}</ErrorText> : null}

      <View style={{ gap: 10 }}>
        <T>PLATAFORMA</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {PLATFORMS.map((p) => (
            <Chip
              key={p}
              compact
              label={PLATFORM_NAME[p]}
              color={colors.cyan}
              selected={draft.platforms.includes(p)}
              disabled={!available.includes(p)}
              onPress={() => togglePlatform(p)}
            />
          ))}
        </View>
        <Note text={draft.game ? `${draft.game.name} SAI PARA: ${available.map((p) => PLATFORM_NAME[p]).join(', ')}` : 'ESCOLHA O JOGO PARA VER AS PLATAFORMAS.'} />
        {tried && problems.platforms ? <ErrorText>{problems.platforms}</ErrorText> : null}
      </View>

      <View style={{ gap: 10 }}>
        <T>VISIBILIDADE</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="PÚBLICA" color={colors.green} selected={draft.visibility === 'publica'} onPress={() => update({ visibility: 'publica' })} style={{ flex: 1 }} />
          <Chip label="PRIVADA" selected={draft.visibility === 'privada'} onPress={() => update({ visibility: 'privada' })} style={{ flex: 1 }} />
        </View>
        <Note
          text={
            draft.visibility === 'publica'
              ? 'APARECE EM PROCURAR SQUADS. SEUS AMIGOS VEEM PRIMEIRO.'
              : 'SÓ ENTRA QUEM TIVER O CÓDIGO (GERADO AO SALVAR) OU FOR CONVIDADO.'
          }
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <FieldLink label="DATA" value={draft.date ? formatDayMonth(draft.date) : null} placeholder="DD/MM" onPress={() => go('/pick-date')} />
        <FieldLink label="HORA" value={draft.time} placeholder="--:--" onPress={() => go('/pick-time')} />
      </View>
      <Note text={`HORÁRIO NO SEU FUSO: ${timeZoneText()}. CADA JOGADOR VÊ NO FUSO DELE.`} />
      {tried && (problems.date || problems.time) ? <ErrorText>{problems.date ?? problems.time}</ErrorText> : null}

      <PixelInput
        label="DESCRIÇÃO"
        counter={`${draft.description.length}/${DESCRIPTION_MAX}`}
        value={draft.description}
        onChangeText={(v) => update({ description: v })}
        placeholder="CONTE O OBJETIVO, O NÍVEL DO SQUAD E O QUE PRECISA (EX: FALTA UM SUPORTE)"
        maxLength={DESCRIPTION_MAX}
        {...capsInput}
        multiline
        style={{ fontSize: 9, lineHeight: 17 }}
      />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
