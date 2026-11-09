import { go } from '../lib/nav';
import { StyleSheet, View } from 'react-native';
import { Cursor, Logo } from '../components/pixel';
import { PixelButton, Screen, T } from '../components/ui';
import { colors } from '../theme';

export default function Welcome() {
  return (
    <Screen contentStyle={{ justifyContent: 'space-between', paddingTop: 48 }} gap={32}>
      <View style={{ alignItems: 'center', gap: 28 }}>
        <Logo size={36} />
        <View style={styles.slots}>
          {['1P', '2P', '3P', '4P'].map((p, i) => (
            <View key={p} style={[styles.slot, i === 0 ? styles.slotOn : styles.slotOff]}>
              <T size={12} color={i === 0 ? colors.bg : colors.dim}>{p}</T>
            </View>
          ))}
        </View>
        <T size={11} color={colors.muted} style={{ textAlign: 'center' }}>
          {'SEU SQUAD ESTÁ\nESPERANDO'}
          <Cursor />
        </T>
      </View>

      <View style={{ gap: 20 }}>
        <PixelButton label="ENTRAR" onPress={() => go('/login')} />
        <PixelButton label="CRIAR CONTA" variant="secondary" onPress={() => go('/signup')} />
      </View>

      <View style={{ alignItems: 'center', gap: 12 }}>
        <T size={8} color={colors.dim} style={{ textAlign: 'center' }}>
          {'AO CONTINUAR, VOCÊ ACEITA OS\nTERMOS DE USO E A PRIVACIDADE'}
        </T>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  slots: { flexDirection: 'row', gap: 12, width: '100%' },
  slot: { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 4 },
  slotOn: { backgroundColor: colors.accent, borderColor: colors.text },
  slotOff: { borderColor: colors.border, borderStyle: 'dashed' },
});
