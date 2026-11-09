import { memo, useEffect, useState } from 'react';
import { AccessibilityInfo, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, pixelShadow } from '../theme';
import { T } from './ui';

/** [x, y, largura, altura, cor] numa grade de `grid` × `grid` "pixels". */
type Rect = [number, number, number, number, string];

export const PixelArt = memo(function PixelArt({ grid, size, rects }: { grid: number; size: number; rects: Rect[] }) {
  const px = size / grid;
  return (
    <View style={{ width: size, height: size }} accessible={false}>
      {rects.map(([x, y, w, h, color], i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: x * px, top: y * px, width: w * px, height: h * px, backgroundColor: color }}
        />
      ))}
    </View>
  );
});

/** Pisca a cada `ms`. Fica fixo se o usuário pediu menos movimento. */
export function useBlink(ms = 500): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive || reduce) return;
      timer = setInterval(() => setOn((v) => !v), ms);
    });
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [ms]);
  return on;
}

export function Cursor() {
  const on = useBlink();
  return <T style={{ opacity: on ? 1 : 0 }}>_</T>;
}

export function Logo({ size = 36 }: { size?: number }) {
  const shadow = { textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 };
  return (
    <View style={{ alignItems: 'center', gap: 8 }} accessible accessibilityLabel="GamePlay">
      <T size={size} color={colors.accent} style={[shadow, { textShadowColor: colors.pink }]}>
        GAME
      </T>
      <T size={size} color={colors.text} style={[shadow, { textShadowColor: colors.cyan }]}>
        PLAY
      </T>
    </View>
  );
}

const HAIR = ['#E0457B', '#FF8A3D', '#7CFF6B', '#B18CFF', '#FFD23F'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Avatar em pixel art; a cor do cabelo vem do nick. */
export function PixelAvatar({ nickname, size = 60 }: { nickname: string; size?: number }) {
  const hair = HAIR[hash(nickname) % HAIR.length];
  const skin = '#F2C28B';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Foto de ${nickname}`}
      style={{
        width: size,
        height: size,
        borderWidth: 4,
        borderColor: colors.text,
        backgroundColor: colors.cyan,
        boxShadow: pixelShadow(colors.pink, 4),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PixelArt
        grid={8}
        size={size - 16}
        rects={[
          [1, 0, 6, 1, hair],
          [0, 1, 8, 1, hair],
          [1, 2, 6, 5, skin],
          [1, 2, 1, 1, hair],
          [6, 2, 1, 1, hair],
          [2, 3, 1, 1, colors.bg],
          [5, 3, 1, 1, colors.bg],
          [3, 5, 2, 1, '#B5485E'],
          [1, 7, 6, 1, colors.bg],
        ]}
      />
    </View>
  );
}

export function PlusIcon({ size = 24, color = colors.bg }: { size?: number; color?: string }) {
  return <PixelArt grid={7} size={size} rects={[[3, 0, 1, 7, color], [0, 3, 7, 1, color]]} />;
}

export function CalendarIcon({ size = 12, color = colors.accent }: { size?: number; color?: string }) {
  return (
    <PixelArt
      grid={8}
      size={size}
      rects={[[0, 1, 8, 2, color], [0, 3, 1, 5, color], [7, 3, 1, 5, color], [0, 7, 8, 1, color]]}
    />
  );
}

export function EmptyCalendarArt({ size = 88 }: { size?: number }) {
  return (
    <PixelArt
      grid={16}
      size={size}
      rects={[
        [4, 0, 1, 3, colors.text],
        [11, 0, 1, 3, colors.text],
        [1, 2, 14, 3, colors.accent],
        [1, 5, 1, 10, colors.border],
        [14, 5, 1, 10, colors.border],
        [1, 14, 14, 1, colors.border],
        [7, 7, 2, 6, colors.border],
        [5, 9, 6, 2, colors.border],
      ]}
    />
  );
}

/** Quadrado com as iniciais do jogo (no lugar do logo oficial). */
export function GameTile({ tag, color, size = 52, style }: { tag: string; color: string; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          backgroundColor: color,
          borderWidth: size > 60 ? 4 : 3,
          borderColor: colors.text,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <T size={Math.round(size / 4)} color={colors.bg}>
        {tag}
      </T>
    </View>
  );
}

export function SquadSlots({ filled, total, size: base = 12 }: { filled: number; total: number; size?: number }) {
  // Squads grandes (até 10) encolhem os quadrados para caber em telas de 360px.
  const size = total > 6 ? Math.round(base * (base > 16 ? 0.8 : 0.7)) : base;
  return (
    <View
      style={{ flexDirection: 'row', flexShrink: 0, gap: size > 16 ? 5 : total > 6 ? 3 : 4 }}
      accessible
      accessibilityLabel={`${filled} de ${total} jogadores no squad`}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderWidth: size > 16 ? 3 : 2,
            borderColor: i < filled ? colors.green : colors.border,
            backgroundColor: i < filled ? colors.green : colors.bg,
          }}
        />
      ))}
    </View>
  );
}

export const squadLabel = (filled: number, total: number) =>
  filled >= total ? 'SQUAD COMPLETO' : `${filled}/${total} NO SQUAD`;
