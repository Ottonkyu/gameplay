import { memo, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { colors, pixelShadow } from '../theme';
import { FIG_DX, FIG_DY, STAGE_H, STAGE_W, stageRuns, type Avatar } from './avatar';

/**
 * Desenha o avatar em pixel art com SVG: cada linha vira poucos retângulos
 * (pixels iguais vizinhos são unidos), então fica leve mesmo em listas.
 * `crop` recorta só a cabeça e os ombros (para ícones pequenos).
 */
const Pixels = memo(function Pixels({
  avatar,
  width,
  height,
  crop,
}: {
  avatar: Avatar;
  width: number;
  height: number;
  crop: boolean;
}) {
  const { bg, runs } = useMemo(() => stageRuns(avatar), [avatar]);
  const viewBox = crop ? `${FIG_DX} ${FIG_DY - 1} 20 20` : `0 0 ${STAGE_W} ${STAGE_H}`;
  return (
    <Svg width={width} height={height} viewBox={viewBox}>
      <Rect x={0} y={0} width={STAGE_W} height={STAGE_H} fill={bg} />
      {runs.map(([x, y, w, c], i) => (
        <Rect key={i} x={x} y={y} width={w + 0.02} height={1.02} fill={c} />
      ))}
    </Svg>
  );
});

/** Corpo inteiro no fundo escolhido (Perfil, editor, perfil de outro jogador). */
export function AvatarStage({
  avatar,
  width,
  border = 8,
  shadow = colors.pink,
  style,
  label,
}: {
  avatar: Avatar;
  width: number;
  border?: number;
  shadow?: string | null;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  const inner = width - border * 2;
  const innerH = Math.round((inner * STAGE_H) / STAGE_W);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label ?? 'Avatar de corpo inteiro'}
      style={[
        {
          width,
          height: innerH + border * 2,
          borderWidth: border,
          borderColor: colors.text,
          boxShadow: shadow ? pixelShadow(shadow, Math.max(4, border + 2)) : undefined,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Pixels avatar={avatar} width={inner} height={innerH} crop={false} />
    </View>
  );
}

/** Ícone quadrado com cabeça e ombros (Home, listas, convites). */
export function AvatarIcon({
  avatar,
  size = 48,
  border = 3,
  shadow = null,
  label,
}: {
  avatar: Avatar;
  size?: number;
  border?: number;
  shadow?: string | null;
  label?: string;
}) {
  const inner = size - border * 2;
  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderWidth: border,
        borderColor: colors.text,
        boxShadow: shadow ? pixelShadow(shadow, 4) : undefined,
        overflow: 'hidden',
      }}
    >
      <Pixels avatar={avatar} width={inner} height={inner} crop />
    </View>
  );
}
