import { AVATAR_DATA, BG_COLORS, FIXED, SCENES, SKINS } from './data';

/** Avatar salvo no perfil: índice de cada peça (0..19), da pele (0..5) e do fundo (0..33). */
export type Avatar = { head: number; torso: number; pants: number; shoes: number; skin: number; bg: number };

export const SLOTS = ['head', 'torso', 'pants', 'shoes'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = { head: 'CABEÇA', torso: 'TORSO', pants: 'CALÇA', shoes: 'SAPATO' };

export const N_SETS = AVATAR_DATA.sets.length; // 20
export const N_SKINS = SKINS.length; // 6
export const N_COLORS = BG_COLORS.length; // 12 cores lisas
export const N_BG = BG_COLORS.length + SCENES.length; // 34 (12 cores + 22 cenários)

export const DEFAULT_AVATAR: Avatar = { head: 0, torso: 0, pants: 0, shoes: 0, skin: 0, bg: N_COLORS };

const clamp = (v: unknown, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max - 1, Math.max(0, n)) : 0;
};

/** Aceita o JSON que vem do banco e corrige valores fora da faixa. */
export function normalizeAvatar(raw: unknown): Avatar {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    head: clamp(a.head, N_SETS),
    torso: clamp(a.torso, N_SETS),
    pants: clamp(a.pants, N_SETS),
    shoes: clamp(a.shoes, N_SETS),
    skin: clamp(a.skin, N_SKINS),
    bg: a.bg === undefined ? DEFAULT_AVATAR.bg : clamp(a.bg, N_BG),
  };
}

export const setName = (i: number) => AVATAR_DATA.sets[i]?.name ?? '';

export type Background = { isScene: boolean; color: string; floor: string; label: string; sceneIndex: number };

export function background(i: number): Background {
  if (i < N_COLORS) {
    const c = BG_COLORS[i];
    return { isScene: false, color: c.color, floor: c.color, label: `COR · ${c.name.toUpperCase()}`, sceneIndex: -1 };
  }
  const s = SCENES[i - N_COLORS];
  return { isScene: true, color: s.pal[s.rows[0][0]], floor: s.ground, label: `CENÁRIO · ${s.name.toUpperCase()}`, sceneIndex: i - N_COLORS };
}

function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}

/** Grade 20×34 com a cor de cada pixel do boneco (null = transparente). */
export function composeFigure(a: Avatar, floor: string): (string | null)[][] {
  const W = 20;
  const H = 34;
  const skin = SKINS[a.skin];
  const skinMap: Record<string, string> = { S: skin, s: darken(skin, 0.85), D: darken(floor, 0.7) };
  const out: (string | null)[][] = Array.from({ length: H }, () => new Array<string | null>(W).fill(null));
  AVATAR_DATA.base.forEach((row, y) => {
    for (let x = 0; x < W; x++) {
      const ch = row[x];
      if (ch !== '.') out[y][x] = skinMap[ch] ?? FIXED[ch] ?? null;
    }
  });
  for (const slot of ['shoes', 'pants', 'torso', 'head'] as const) {
    const piece = AVATAR_DATA[slot][a[slot]];
    for (const key of Object.keys(piece.rows)) {
      const y = Number(key);
      const row = piece.rows[key];
      for (let x = 0; x < W; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        out[y][x] = piece.pal[ch] ?? skinMap[ch] ?? FIXED[ch] ?? out[y][x];
      }
    }
  }
  return out;
}

/** Retângulos [x, y, largura, cor] juntando pixels iguais vizinhos na mesma linha. */
export type Run = [number, number, number, string];

export function toRuns(grid: (string | null)[][], dx = 0, dy = 0): Run[] {
  const runs: Run[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (!c) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < row.length && row[x + w] === c) w++;
      runs.push([x + dx, y + dy, w, c]);
      x += w;
    }
  });
  return runs;
}

export function sceneGrid(sceneIndex: number): string[][] {
  const s = SCENES[sceneIndex];
  return s.rows.map((row) => Array.from(row, (ch) => s.pal[ch]));
}

/** Palco: 24×38 pixels, boneco deslocado (2, 3) — igual ao protótipo. */
export const STAGE_W = 24;
export const STAGE_H = 38;
export const FIG_DX = 2;
export const FIG_DY = 3;

export function stageRuns(a: Avatar): { bg: string; runs: Run[] } {
  const b = background(a.bg);
  const runs: Run[] = b.isScene ? toRuns(sceneGrid(b.sceneIndex)) : [];
  runs.push(...toRuns(composeFigure(a, b.floor), FIG_DX, FIG_DY));
  return { bg: b.color, runs };
}

export function randomAvatar(): Avatar {
  const r = (n: number) => Math.floor(Math.random() * n);
  return { head: r(N_SETS), torso: r(N_SETS), pants: r(N_SETS), shoes: r(N_SETS), skin: r(N_SKINS), bg: r(N_BG) };
}

/** Quando todas as peças são do mesmo set, mostra o nome dele. */
export function outfitName(a: Avatar): string {
  return a.head === a.torso && a.torso === a.pants && a.pants === a.shoes ? setName(a.head).toUpperCase() : 'COMBINAÇÃO';
}
