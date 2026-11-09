import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PixelButton, Screen, T, Title, TopBar } from '../components/ui';
import { useDraft } from '../context/DraftContext';
import { formatLong, MONTHS, parseDateKey, toDateKey } from '../lib/dates';
import { serverNow } from '../lib/clock';
import { colors, pixelShadow } from '../theme';

const WEEK_HEAD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function PickDate() {
  const { draft, update } = useDraft();
  const today = serverNow();
  const todayKey = toDateKey(today);
  const [picked, setPicked] = useState<string | null>(draft.date);

  // Mês exibido: o da data escolhida ou o atual.
  const start = picked ? parseDateKey(picked) : today;
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });

  const now = today;
  const isCurrentMonth = view.y === now.getFullYear() && view.m === now.getMonth();

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= days; d++) out.push(toDateKey(new Date(view.y, view.m, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  const move = (delta: number) =>
    setView(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  function confirm() {
    update({ date: picked });
    router.back();
  }

  return (
    <Screen gap={22} footer={<PixelButton label="CONFIRMAR ›" onPress={confirm} disabled={!picked} />}>
      <TopBar right="DATA" />
      <Title>ESCOLHA O DIA</Title>

      <View style={styles.calendar}>
        <View style={styles.monthRow}>
          <Pressable
            onPress={() => move(-1)}
            disabled={isCurrentMonth}
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
            style={styles.navBtn}
          >
            <T size={14} color={isCurrentMonth ? colors.disabled : colors.accent}>‹</T>
          </Pressable>
          <T size={11}>{`${MONTHS[view.m]} ${view.y}`}</T>
          <Pressable onPress={() => move(1)} accessibilityRole="button" accessibilityLabel="Próximo mês" style={styles.navBtn}>
            <T size={14} color={colors.accent}>›</T>
          </Pressable>
        </View>

        <View style={styles.grid}>
          {WEEK_HEAD.map((w, i) => (
            <View key={i} style={styles.cellWrap}>
              <T size={8} color={colors.dim} style={{ textAlign: 'center' }}>{w}</T>
            </View>
          ))}
          {cells.map((key, i) => {
            if (!key) return <View key={i} style={styles.cellWrap} />;
            const past = key < todayKey;
            const on = key === picked;
            const today = key === todayKey;
            return (
              <View key={i} style={styles.cellWrap}>
                <Pressable
                  onPress={() => setPicked(key)}
                  disabled={past}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: past }}
                  accessibilityLabel={formatLong(key)}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: on ? colors.accent : colors.bg,
                      borderColor: on ? colors.text : today ? colors.cyan : colors.bg,
                    },
                  ]}
                >
                  <T size={10} color={on ? colors.bg : past ? colors.disabled : colors.text}>
                    {String(parseDateKey(key).getDate())}
                  </T>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.legend}>
        <View style={[styles.swatch, { borderWidth: 2, borderColor: colors.cyan }]} />
        <T size={9} color={colors.muted}>HOJE</T>
        <View style={[styles.swatch, { backgroundColor: colors.accent, marginLeft: 12 }]} />
        <T size={9} color={colors.muted}>SELECIONADO</T>
      </View>

      <View style={styles.summary}>
        <T size={8} color={colors.dim}>PARTIDA EM</T>
        <T size={13} color={picked ? colors.accent : colors.placeholder}>{picked ? formatLong(picked) : 'ESCOLHA UM DIA'}</T>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  calendar: { borderWidth: 4, borderColor: colors.text, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 14, gap: 10, boxShadow: pixelShadow(colors.cyan) },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellWrap: { width: `${100 / 7}%`, padding: 2, alignItems: 'stretch', justifyContent: 'center', minHeight: 24 },
  cell: { height: 42, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 16, height: 16 },
  summary: { padding: 16, gap: 10, backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.border },
});
