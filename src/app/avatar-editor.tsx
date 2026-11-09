import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AvatarStage } from '../avatar/AvatarView';
import {
  background,
  DEFAULT_AVATAR,
  N_BG,
  N_COLORS,
  N_SETS,
  outfitName,
  randomAvatar,
  setName,
  SLOT_LABEL,
  SLOTS,
  type Avatar,
  type Slot,
} from '../avatar/avatar';
import { BG_COLORS, SKINS } from '../avatar/data';
import { ErrorText, PixelButton, Screen, SmallButton, T, Title, TopBar } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useAction } from '../lib/hooks';
import { colors, pixelShadow } from '../theme';

const SCENES_PER_PAGE = 4;

export default function AvatarEditor() {
  const { profile, saveProfile } = useAuth();
  const [a, setA] = useState<Avatar>(profile?.avatar ?? DEFAULT_AVATAR);
  const [tab, setTab] = useState<'roupa' | 'fundo'>('roupa');
  const firstScenePage = a.bg >= N_COLORS ? Math.floor((a.bg - N_COLORS) / SCENES_PER_PAGE) : 0;
  const [page, setPage] = useState(firstScenePage);
  const { busy, error, run } = useAction();

  const nScenes = N_BG - N_COLORS;
  const pages = Math.ceil(nScenes / SCENES_PER_PAGE);
  const step = (slot: Slot, d: number) => setA((v) => ({ ...v, [slot]: (v[slot] + d + N_SETS) % N_SETS }));

  async function save() {
    const ok = await run(async () => {
      await saveProfile({ avatar: a });
      return true;
    });
    if (ok) router.back();
  }

  return (
    <Screen
      gap={16}
      footer={
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <PixelButton label="ALEATÓRIO" variant="secondary" size="md" onPress={() => setA(randomAvatar())} style={{ flex: 1 }} />
          <PixelButton label="SALVAR ›" size="md" loading={busy} onPress={save} style={{ flex: 1 }} />
        </View>
      }
    >
      <TopBar right="AVATAR" />
      <Title size={15}>MONTE SEU AVATAR</Title>

      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <AvatarStage avatar={a} width={120} border={6} shadow={colors.pink} />
        <View style={{ flex: 1, gap: 10 }}>
          <T size={9} color={colors.accent}>{outfitName(a)}</T>
          <T size={6} color={colors.dim}>{background(a.bg).label}</T>
          <T size={7}>PELE</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {SKINS.map((c, i) => (
              <Pressable
                key={c}
                onPress={() => setA((v) => ({ ...v, skin: i }))}
                accessibilityRole="button"
                accessibilityLabel={`Tom de pele ${i + 1}`}
                accessibilityState={{ selected: a.skin === i }}
                style={[styles.swatch, { backgroundColor: c, borderColor: a.skin === i ? colors.text : colors.line, borderWidth: a.skin === i ? 4 : 2 }]}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['roupa', 'fundo'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            style={[styles.tab, { backgroundColor: tab === t ? colors.accent : colors.bg, borderColor: tab === t ? colors.text : colors.border }]}
          >
            <T size={8} color={tab === t ? colors.bg : colors.muted}>{t === 'roupa' ? 'ROUPA' : 'FUNDO'}</T>
          </Pressable>
        ))}
      </View>

      {tab === 'roupa' ? (
        <View style={{ gap: 8 }}>
          {SLOTS.map((slot) => (
            <View key={slot} style={styles.slotRow}>
              <SmallButton label="‹" onPress={() => step(slot, -1)} accessibilityLabel={`${SLOT_LABEL[slot]} anterior`} style={{ width: 40, height: 40 }} />
              <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <T size={6} color={colors.dim}>{SLOT_LABEL[slot]}</T>
                <T size={8}>{`${setName(a[slot]).toUpperCase()} · ${a[slot] + 1}/${N_SETS}`}</T>
              </View>
              <SmallButton label="›" onPress={() => step(slot, 1)} accessibilityLabel={`Próximo ${SLOT_LABEL[slot]}`} style={{ width: 40, height: 40 }} />
            </View>
          ))}
          <SmallButton
            label="VESTIR O SET COMPLETO DA CABEÇA"
            onPress={() => setA((v) => ({ ...v, torso: v.head, pants: v.head, shoes: v.head }))}
            style={{ height: 40 }}
          />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <T size={8}>CORES</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {BG_COLORS.map((c, i) => (
              <Pressable
                key={c.name}
                onPress={() => setA((v) => ({ ...v, bg: i }))}
                accessibilityRole="button"
                accessibilityLabel={`Fundo ${c.name}`}
                accessibilityState={{ selected: a.bg === i }}
                style={[styles.color, { backgroundColor: c.color, borderColor: a.bg === i ? colors.text : colors.line, borderWidth: a.bg === i ? 4 : 2 }]}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T size={8}>CENÁRIOS</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <SmallButton label="‹" disabled={page === 0} onPress={() => setPage((p) => p - 1)} accessibilityLabel="Cenários anteriores" style={{ width: 36 }} />
              <T size={7} color={colors.dim}>{`${page + 1}/${pages}`}</T>
              <SmallButton label="›" disabled={page >= pages - 1} onPress={() => setPage((p) => p + 1)} accessibilityLabel="Próximos cenários" style={{ width: 36 }} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {Array.from({ length: SCENES_PER_PAGE }, (_, k) => N_COLORS + page * SCENES_PER_PAGE + k)
              .filter((i) => i < N_BG)
              .map((i) => {
                const on = a.bg === i;
                return (
                  <Pressable
                    key={i}
                    onPress={() => setA((v) => ({ ...v, bg: i }))}
                    accessibilityRole="button"
                    accessibilityLabel={background(i).label}
                    accessibilityState={{ selected: on }}
                    style={{ flex: 1, alignItems: 'center', gap: 6, boxShadow: on ? pixelShadow(colors.accent, 3) : undefined }}
                  >
                    <AvatarStage avatar={{ ...a, bg: i }} width={72} border={on ? 4 : 2} shadow={null} />
                    <T size={5} color={on ? colors.accent : colors.dim} style={{ textAlign: 'center' }} numberOfLines={2}>
                      {background(i).label.replace('CENÁRIO · ', '')}
                    </T>
                  </Pressable>
                );
              })}
          </View>
        </View>
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 30, height: 30 },
  tab: { flex: 1, height: 42, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: colors.card, borderWidth: 3, borderColor: colors.line },
  color: { width: 44, height: 44 },
});
