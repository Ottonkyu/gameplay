import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useBlink } from '../components/pixel';
import { Chip, PixelButton, Screen, T, Title, TopBar } from '../components/ui';
import { useDraft } from '../context/DraftContext';
import { timeZoneText } from '../lib/clock';
import { pad2, toTimeKey } from '../lib/dates';
import { colors, pixelShadow } from '../theme';

const QUICK: [number, number][] = [[19, 0], [20, 0], [21, 0], [22, 30]];
const STEP = 15;

export default function PickTime() {
  const { draft, update } = useDraft();
  const initial = draft.time ? draft.time.split(':').map(Number) : [21, 0];
  const [h, setH] = useState(initial[0]);
  const [m, setM] = useState(initial[1] - (initial[1] % STEP));
  const blink = useBlink();

  function confirm() {
    update({ time: toTimeKey(h, m) });
    router.back();
  }

  return (
    <Screen gap={26} footer={<PixelButton label="CONFIRMAR ›" onPress={confirm} />}>
      <TopBar right="HORA" />
      <Title>ESCOLHA A HORA</Title>

      <View style={styles.clock} accessible accessibilityLabel={`Horário escolhido ${pad2(h)} e ${pad2(m)}`}>
        <Stepper
          value={pad2(h)}
          caption="HORA"
          color={colors.accent}
          shadow={colors.pink}
          onUp={() => setH((v) => (v + 1) % 24)}
          onDown={() => setH((v) => (v + 23) % 24)}
          what="hora"
        />
        <T size={40} style={{ opacity: blink ? 1 : 0.2, marginBottom: 26 }}>:</T>
        <Stepper
          value={pad2(m)}
          caption="MIN"
          color={colors.text}
          shadow={colors.cyan}
          onUp={() => setM((v) => (v + STEP) % 60)}
          onDown={() => setM((v) => (v + 60 - STEP) % 60)}
          what="minutos"
        />
      </View>

      <View style={{ gap: 12 }}>
        <T>ATALHOS</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {QUICK.map(([qh, qm]) => (
            <Chip
              key={`${qh}:${qm}`}
              label={toTimeKey(qh, qm)}
              selected={qh === h && qm === m}
              onPress={() => {
                setH(qh);
                setM(qm);
              }}
              style={{ flex: 1, paddingHorizontal: 4 }}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <T size={8} color={colors.muted}>{`SEU FUSO: ${timeZoneText()}`}</T>
        <T size={7} color={colors.dim}>SEU SQUAD VÊ A PARTIDA NO FUSO DELE, NO MESMO MOMENTO.</T>
      </View>
    </Screen>
  );
}

function Stepper({
  value,
  caption,
  color,
  shadow,
  onUp,
  onDown,
  what,
}: {
  value: string;
  caption: string;
  color: string;
  shadow: string;
  onUp: () => void;
  onDown: () => void;
  what: string;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <PixelButton label="▲" size="md" variant="secondary" shadow={false} onPress={onUp} accessibilityLabel={`Aumentar ${what}`} style={styles.arrow} />
      <T size={44} color={color} style={{ textShadowColor: shadow, textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 }}>
        {value}
      </T>
      <PixelButton label="▼" size="md" variant="secondary" shadow={false} onPress={onDown} accessibilityLabel={`Diminuir ${what}`} style={styles.arrow} />
      <T size={8} color={colors.dim}>{caption}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  clock: {
    borderWidth: 4,
    borderColor: colors.text,
    boxShadow: pixelShadow(colors.cyan),
    paddingVertical: 20,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  arrow: { width: 96, borderWidth: 3, borderColor: colors.border, backgroundColor: colors.surface },
});
