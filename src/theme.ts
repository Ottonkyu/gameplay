export const colors = {
  bg: '#1A0F2E',
  surface: '#2A1C47',
  card: '#221640',
  line: '#3A2A5C',
  border: '#6B5A94',
  text: '#FFF6E0',
  muted: '#CFC3E8',
  dim: '#A99BC7',
  placeholder: '#8C7DB0',
  disabled: '#5A4B7E',
  accent: '#FFD23F',
  pink: '#E0457B',
  cyan: '#3DDCFF',
  green: '#7CFF6B',
  host: '#FF7AA8',
  error: '#FF8A8A',
} as const;

export const font = 'PressStart2P_400Regular';

/**
 * Quanto o texto pode crescer com a "fonte grande" do celular (acessibilidade).
 * A fonte pixel já é grande e os botões têm altura fixa: acima disso o texto estoura.
 */
export const FONT_SCALE_MAX = 1.15;

/** Nicks têm até 16 letras: encolhe a fonte dos longos para caber em telas de 360 px. */
export const nickSize = (nick: string, base: number) => (nick.length > 12 ? base - 3 : nick.length > 9 ? base - 2 : base);

/** Sombra "pixel": deslocada, sem desfoque. */
export const pixelShadow = (color: string, offset = 6) => `${offset}px ${offset}px 0px ${color}`;

export const CATEGORIES = ['RANQUEADA', 'CASUAL', 'TREINO', 'CAMPEONATO'] as const;

export const GENRES = [
  'FPS', 'MOBA', 'BATTLE ROYALE', 'EXTRAÇÃO', 'MUNDO ABERTO', 'RPG',
  'ESPORTES', 'LUTA', 'PARTY', 'SANDBOX', 'ESTRATÉGIA',
] as const;
export type Genre = (typeof GENRES)[number];

export const PLATFORMS = ['PC', 'PS', 'XBOX', 'SWITCH', 'MOBILE'] as const;
export const PLATFORM_NAME: Record<string, string> = {
  PC: 'PC', PS: 'PLAYSTATION', XBOX: 'XBOX', SWITCH: 'SWITCH', MOBILE: 'MOBILE',
};

export const CANCEL_REASONS = ['FALTA DE JOGADORES', 'IMPREVISTO', 'PROBLEMA TÉCNICO', 'OUTRO MOTIVO'] as const;

export const NAME_MAX = 24;
export const BIO_MAX = 150;
/** Quanto antes do início a partida vira "COMEÇA EM BREVE". */
export const SOON_MINUTES = 30;

export const DESCRIPTION_MAX = 200;
