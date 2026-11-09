import { router } from 'expo-router';
import { go } from '../lib/nav';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import * as api from '../api';
import { JoinByCode } from '../components/JoinByCode';
import { MatchRow } from '../components/match';
import { PixelArt } from '../components/pixel';
import { Chip, Empty, ErrorText, LoadState, Screen, SectionHeader, SmallButton, T, Title, TopBar } from '../components/ui';
import { useAction, useNow, useRemote } from '../lib/hooks';
import { CATEGORIES, colors, font, FONT_SCALE_MAX } from '../theme';

export default function Search() {
  const now = useNow();
  const remote = useRemote(api.publicMatches, [], { live: true });
  const join = useAction();
  const [cat, setCat] = useState('TODAS');
  const [q, setQ] = useState('');
  const [joining, setJoining] = useState<number | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);

  const query = q.trim().toUpperCase();
  const list = (remote.data ?? []).filter(
    (m) => (cat === 'TODAS' || m.category === cat) && (!query || m.name.includes(query) || m.game.name.includes(query)),
  );
  const friends = list.filter((m) => m.from_friend);
  const others = list.filter((m) => !m.from_friend);

  async function enter(id: number) {
    setJoining(id);
    const ok = await join.run(async () => {
      await api.joinMatch(id);
      return true;
    });
    setJoining(null);
    if (ok) router.replace(`/match/${id}`);
    else remote.reload();
  }

  const section = (title: string, items: typeof list) =>
    items.length ? (
      <View style={{ gap: 12 }}>
        <SectionHeader title={title} right={<T size={7} color={colors.dim}>{String(items.length)}</T>} />
        {items.map((m) => (
          <MatchRow
            key={m.id}
            m={m}
            now={now}
            subtitle={`${m.game.name} · DE ${m.host.nickname}`}
            onPress={() => go(`/match/${m.id}`)}
            footer={
              <SmallButton
                label={joining === m.id ? 'ENTRANDO...' : 'ENTRAR NO SQUAD ›'}
                color={colors.accent}
                filled
                disabled={joining !== null}
                onPress={() => enter(m.id)}
              />
            }
          />
        ))}
      </View>
    ) : null;

  return (
    <Screen
      gap={16}
      refreshing={remote.refreshing}
      onRefresh={remote.refresh}
      overlay={<JoinByCode visible={codeOpen} onClose={() => setCodeOpen(false)} onJoined={remote.reload} />}
    >
      <TopBar right="PÚBLICAS" />
      <Title>PROCURAR SQUADS</Title>
      <Pressable
        onPress={() => setCodeOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Entrar por código numa sala privada"
        style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderWidth: 3, borderStyle: 'dashed', borderColor: pressed ? colors.text : colors.border })}
      >
        <PixelArt grid={8} size={18} rects={[[2, 0, 4, 1, colors.accent], [1, 1, 1, 3, colors.accent], [6, 1, 1, 3, colors.accent], [0, 3, 8, 5, colors.accent], [3, 5, 2, 2, colors.bg]]} />
        <View style={{ flex: 1, gap: 6 }}>
          <T size={8}>ENTRAR POR CÓDIGO</T>
          <T size={6} color={colors.dim}>TEM O CÓDIGO DE UMA SALA PRIVADA?</T>
        </View>
        <T color={colors.cyan}>›</T>
      </Pressable>
      <TextInput
        maxFontSizeMultiplier={FONT_SCALE_MAX}
        value={q}
        onChangeText={setQ}
        placeholder="NOME DA PARTIDA OU JOGO"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="characters"
        accessibilityLabel="Buscar partidas"
        style={{ height: 46, paddingHorizontal: 14, borderWidth: 3, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontFamily: font, fontSize: 10 }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
        {['TODAS', ...CATEGORIES].map((c) => (
          <Chip key={c} compact label={c} selected={cat === c} onPress={() => setCat(c)} />
        ))}
      </ScrollView>
      <ErrorText>{join.error}</ErrorText>
      <LoadState loading={remote.loading} error={remote.error} onRetry={remote.reload} />
      {section('DE AMIGOS', friends)}
      {section('OUTROS JOGADORES', others)}
      {remote.data && list.length === 0 ? (
        <Empty text="NENHUMA PARTIDA PÚBLICA COM VAGA AGORA. QUE TAL AGENDAR A SUA?" />
      ) : null}
    </Screen>
  );
}
