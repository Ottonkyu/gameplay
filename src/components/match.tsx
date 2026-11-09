import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MatchCard } from '../api/types';
import { liveStatus, squadText, whenLine } from '../lib/status';
import { colors, pixelShadow } from '../theme';
import { CalendarIcon, GameTile, SquadSlots, useBlink } from './pixel';
import { T } from './ui';

/** Ponto verde piscando de "ao vivo". */
export function LiveDot() {
  const on = useBlink(500);
  return <View style={{ width: 8, height: 8, backgroundColor: colors.green, opacity: on ? 1 : 0.15 }} />;
}

/**
 * Cartão de partida usado na Home, em Procurar squads, em Convidar e no Histórico.
 * `footer` recebe botões extras (ENTRAR, CONVIDAR, ACEITAR...).
 */
export function MatchRow({
  m,
  now,
  onPress,
  footer,
  rightTop,
  subtitle,
  dim,
}: {
  m: MatchCard;
  now: Date;
  onPress?: () => void;
  footer?: ReactNode;
  rightTop?: ReactNode;
  subtitle?: string;
  dim?: boolean;
}) {
  const st = liveStatus(m, now);
  const when = whenLine(m, now);
  const border = st === 'em_andamento' ? colors.green : st === 'em_breve' ? colors.accent : colors.line;
  const glow = st === 'em_andamento' ? pixelShadow('#2E7D3A', 4) : st === 'em_breve' ? pixelShadow('#8A6A12', 4) : undefined;
  const role = m.is_host ? { t: 'ANFITRIÃO', c: colors.host } : { t: 'VISITANTE', c: colors.green };

  const body = (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <GameTile tag={m.game.tag} color={m.game.color} size={52} />
      <View style={{ flex: 1, gap: 9, minWidth: 0 }}>
        <View style={styles.between}>
          <T size={10} style={{ flex: 1 }} numberOfLines={2}>{m.name}</T>
          {rightTop ?? <T size={7} color={colors.muted}>{m.category}</T>}
        </View>
        <T size={7} color={colors.dim} numberOfLines={1}>{subtitle ?? m.game.name}</T>
        <View style={styles.between}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            {st === 'em_andamento' ? <LiveDot /> : <CalendarIcon color={when.color} />}
            <T size={7} color={when.color} numberOfLines={1} style={{ flexShrink: 1 }}>{when.text}</T>
          </View>
          <T size={7} color={role.c}>{role.t}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SquadSlots filled={m.filled} total={m.max_players} />
          <T size={7} color={colors.dim} numberOfLines={m.max_players > 6 ? 1 : 2} style={{ flex: 1, minWidth: 0 }}>{m.max_players > 6 ? `${m.filled}/${m.max_players}` : squadText(m.filled, m.max_players)}</T>
          {onPress ? <T size={7} color={colors.cyan} style={{ flexShrink: 0 }}>VER ›</T> : null}
        </View>
        {footer}
      </View>
    </View>
  );

  const box = [
    styles.card,
    { borderColor: border, boxShadow: glow, backgroundColor: st === 'em_andamento' ? '#1B2A2A' : colors.card, opacity: dim ? 0.75 : 1 },
  ];
  if (!onPress) return <View style={box}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalhes da partida ${m.name}, ${when.text}`}
      style={({ pressed }) => [box, pressed && { borderColor: colors.text }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, borderWidth: 3 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
});
