import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Logo, useBlink } from './pixel';
import { Scanlines, T } from './ui';

const SEGMENTS = 10;

/** Tela de inicialização retrô: carrega o banco/sessão e espera o PRESS START. */
export function BootScreen({ ready, onStart }: { ready: boolean; onStart: () => void }) {
  const [filled, setFilled] = useState(0);
  const [slow, setSlow] = useState(false);
  const blink = useBlink();

  useEffect(() => {
    const t = setInterval(() => setFilled((f) => (f >= SEGMENTS ? f : f + 1)), 110);
    const s = setTimeout(() => setSlow(true), 10000);
    return () => {
      clearInterval(t);
      clearTimeout(s);
    };
  }, []);

  // A barra só chega em 100% quando o banco e a sessão estiverem prontos.
  const shown = ready ? filled : Math.min(filled, SEGMENTS - 1);
  const done = shown >= SEGMENTS;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <Pressable
          style={styles.content}
          onPress={done ? onStart : undefined}
          disabled={!done}
          accessibilityRole="button"
          accessibilityLabel={done ? 'Press start para começar' : 'Carregando'}
        >
          <T size={10} color={colors.cyan}>1P · 2P · 3P · 4P</T>

          <View style={{ alignItems: 'center', gap: 28 }}>
            <Logo size={44} />
            <T size={10} color={colors.muted} style={{ textAlign: 'center' }}>
              {'MONTE SEU SQUAD\nMARQUE A PARTIDA'}
            </T>
          </View>

          <View style={{ width: '100%', alignItems: 'center', gap: 36 }}>
            <T size={16} color={colors.accent} style={{ opacity: done && blink ? 1 : 0 }}>
              PRESS START
            </T>
            <View style={{ width: '100%', gap: 12 }}>
              <View style={styles.bar}>
                {Array.from({ length: SEGMENTS }, (_, i) => (
                  <View key={i} style={[styles.segment, { backgroundColor: i < shown ? colors.accent : colors.line }]} />
                ))}
              </View>
              <View style={styles.row}>
                <T size={9} color={slow && !done ? colors.error : colors.muted}>
                  {done ? 'PRONTO!' : slow ? 'DEMORANDO...' : 'LOADING'}
                </T>
                <T size={9} color={colors.muted}>{shown * 10}%</T>
              </View>
            </View>
            <T size={8} color={colors.dim}>© 2026 GAMEPLAY</T>
          </View>
        </Pressable>
      </SafeAreaView>
      <Scanlines />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 48, paddingBottom: 32, alignItems: 'center', justifyContent: 'space-between' },
  bar: { flexDirection: 'row', gap: 4, padding: 6, borderWidth: 4, borderColor: colors.text },
  segment: { flex: 1, height: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
