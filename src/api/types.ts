import type { Avatar } from '../avatar/avatar';

export type Platform = 'PC' | 'PS' | 'XBOX' | 'SWITCH' | 'MOBILE';
export type Category = 'RANQUEADA' | 'CASUAL' | 'TREINO' | 'CAMPEONATO';
export type MatchVisibility = 'publica' | 'privada';
export type ProfileVisibility = 'publica' | 'amigos' | 'privada';
export type MatchStatus = 'agendada' | 'em_breve' | 'em_andamento' | 'finalizada' | 'cancelada';
export type CancelReason = 'FALTA DE JOGADORES' | 'IMPREVISTO' | 'PROBLEMA TÉCNICO' | 'OUTRO MOTIVO';

export type Game = {
  id: string;
  name: string;
  tag: string;
  genre: string;
  squad_size: number;
  color: string;
  platforms: Platform[];
};

/** Linha resumida de partida (Home, Procurar squads, Convidar, Histórico). */
export type MatchCard = {
  id: number;
  name: string;
  category: Category;
  platforms: Platform[];
  visibility: MatchVisibility;
  starts_at: string;
  status: MatchStatus;
  max_players: number;
  filled: number;
  is_host: boolean;
  host: { id: string; nickname: string };
  game: Game;
};

export type PublicMatch = MatchCard & { from_friend: boolean };
export type InviteTarget = MatchCard & { target_in_squad: boolean; target_invited: boolean };
export type ReceivedInvite = MatchCard & { invite_id: number; from: string };

export type Member = { id: string; nickname: string; avatar: Avatar; is_host: boolean };

export type MatchDetail = MatchCard & {
  description: string;
  ended_at: string | null;
  canceled_at: string | null;
  cancel_reason: CancelReason | null;
  my_role: 'host' | 'member' | 'left' | 'kicked' | 'none';
  code: string | null;
  members: Member[];
  invited: string[];
  my_invite: number | null;
};

export type HistoryItem = MatchCard & {
  result: 'concluida' | 'cancelada' | 'saiu' | 'removido';
  description: string;
  ended_at: string | null;
  canceled_at: string | null;
  cancel_reason: CancelReason | null;
  left_at: string | null;
  players: string[];
};

export type CodePreview = {
  match_id: number;
  code: string;
  name: string;
  category: Category;
  starts_at: string;
  status: MatchStatus;
  game: Game;
  host: string;
  filled: number;
  max_players: number;
  already_member: boolean;
  kicked: boolean;
};

/** Meu perfil (linha completa da tabela profiles). */
export type MyProfile = {
  id: string;
  nickname: string;
  avatar: Avatar;
  bio: string;
  visibility: ProfileVisibility;
  genres: string[];
  fav_games: string[];
  notif_prefs: NotifPrefs;
};

export type NotifSound = 'levelup' | 'bip' | 'power' | 'mudo';
export type NotifPrefs = { partidas: boolean; squad: boolean; amigos: boolean; amigos_partidas: boolean; mensagens?: boolean; som?: NotifSound };

export type AppNotification = {
  id: number;
  kind: string;
  match_id: number | null;
  count: number;
  title: string;
  body: string;
  url: string;
  created_at: string;
  updated_at: string;
  read: boolean;
  actor: { id: string; nickname: string; avatar: Avatar } | null;
  game: { tag: string; color: string } | null;
};

export type Relation = 'self' | 'friend' | 'sent' | 'received' | 'none';

/** Perfil de outro jogador, já filtrado pela visibilidade no banco. */
export type PlayerProfile = {
  id: string;
  nickname: string;
  avatar: Avatar;
  visibility: ProfileVisibility;
  relation: Relation;
  visible: boolean;
  bio: string | null;
  genres: string[] | null;
  fav_games: string[] | null;
  online: boolean | null;
  matches_together: number;
};

export type FriendEntry = {
  id: string;
  nickname: string;
  avatar: Avatar;
  kind: 'friend' | 'sent' | 'received';
  online: boolean;
};

/* ---------- Chat ---------- */

export type ChatMessage = {
  id: number;
  body: string;
  created_at: string;
  mine: boolean;
  sender: { id: string; nickname: string; avatar: Avatar };
};

export type ChatMember = { id: string; nickname: string; avatar: Avatar; is_host: boolean };

/** Chat do squad de uma partida. `closed` = partida finalizada ou cancelada (só leitura). */
export type MatchChat = {
  match: MatchCard;
  created_at: string;
  ended_at: string | null;
  canceled_at: string | null;
  my_role: 'host' | 'member' | 'left';
  closed: boolean;
  can_send: boolean;
  members: ChatMember[];
  messages: ChatMessage[];
};

export type DirectChat = {
  friend: { id: string; nickname: string; avatar: Avatar; online: boolean };
  /** false quando a amizade acabou: a conversa fica só leitura. */
  can_send: boolean;
  messages: ChatMessage[];
};

export type ChatSummary =
  | { kind: 'match'; key: string; match: MatchCard; last: ChatMessage | null; unread: number }
  | { kind: 'direct'; key: string; friend: DirectChat['friend']; is_friend: boolean; last: ChatMessage | null; unread: number };

export type MyChats = {
  squads: Extract<ChatSummary, { kind: 'match' }>[];
  direct: Extract<ChatSummary, { kind: 'direct' }>[];
};
