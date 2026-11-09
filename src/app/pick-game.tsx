import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { listGames } from '../api';
import type { Game } from '../api/types';
import { GameTile } from '../components/pixel';
import { Chip, LoadState, PixelButton, Screen, T, Title, TopBar } from '../components/ui';
import { useDraft } from '../context/DraftContext';
import { useRemote } from '../lib/hooks';
import { colors, font, PLATFORM_NAME, FONT_SCALE_MAX } from '../theme';

export default function PickGame() {
  const { draft, update } = useDraft();
  const games = useRemote(listGames, []);
  const [picked, setPicked] = useState<Game | null>(draft.game);
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('TODOS');

  const genres = useMemo(() => ['TODOS', ...Array.from(new Set((games.data ?? []).map((g) => g.genre))).sort()], [games.data]);
  const list = (games.data ?? []).filter(
    (g) => (genre === 'TODOS' || g.genre === genre) && g.name.includes(q.trim().toUpperCase()),
  );

  function confirm() {
    if (!picked) return;
    // Mantém só as plataformas que o jogo novo tem.
    const kept = draft.platforms.filter((p) => picked.platforms.includes(p));
    update({ game: picked, platforms: kept.length ? kept : picked.platforms.length === 1 ? [...picked.platforms] : [] });
    router.back();
  }

  return (
    <Screen gap={16} footer={<PixelButton label="CONFIRMAR ›" onPress={confirm} disabled={!picked} />}>
      <TopBar right="JOGO" />
      <Title>ESCOLHA O JOGO</Title>
      <TextInput
        maxFontSizeMultiplier={FONT_SCALE_MAX}
        value={q}
        onChangeText={setQ}
        placeholder="BUSCAR PELO NOME"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="characters"
        accessibilityLabel="Buscar jogo"
        style={styles.search}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
        {genres.map((g) => (
          <Chip key={g} compact label={g} selected={genre === g} onPress={() => setGenre(g)} />
        ))}
      </ScrollView>
      <LoadState loading={games.loading} error={games.error} onRetry={games.reload} />
      <View style={{ gap: 8 }}>
        {list.map((g) => {
          const on = picked?.id === g.id;
          return (
            <Pressable
              key={g.id}
              onPress={() => setPicked(g)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.row, { backgroundColor: on ? colors.surface : colors.bg, borderColor: on ? colors.accent : colors.line }]}
            >
              <GameTile tag={g.tag} color={g.color} size={44} />
              <View style={{ flex: 1, gap: 7 }}>
                <T size={9}>{g.name}</T>
                <T size={6} color={colors.dim}>{`${g.genre} · SQUAD DE ${g.squad_size}`}</T>
                <T size={6} color={colors.cyan}>{g.platforms.map((p) => PLATFORM_NAME[p]).join(' · ')}</T>
              </View>
              <T size={12} color={colors.accent}>{on ? '✓' : ''}</T>
            </Pressable>
          );
        })}
        {games.data && list.length === 0 ? <T size={8} color={colors.dim}>NENHUM JOGO ENCONTRADO.</T> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    height: 46,
    paddingHorizontal: 14,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: font,
    fontSize: 10,
  },
  row: { minHeight: 72, padding: 10, borderWidth: 3, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
