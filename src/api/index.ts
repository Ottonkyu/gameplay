import { normalizeAvatar, type Avatar } from '../avatar/avatar';
import { resetRedirectUrl } from '../lib/recovery';
import { supabase } from '../lib/supabase';
import type {
  CancelReason,
  Category,
  CodePreview,
  FriendEntry,
  Game,
  HistoryItem,
  InviteTarget,
  MatchCard,
  MatchDetail,
  MatchVisibility,
  Member,
  MyProfile,
  AppNotification,
  ChatMessage,
  DirectChat,
  MatchChat,
  MyChats,
  NotifPrefs,
  Platform,
  PlayerProfile,
  ProfileVisibility,
  PublicMatch,
  ReceivedInvite,
} from './types';

/**
 * Camada de acesso ao Supabase. As telas só falam com estas funções,
 * nunca com o cliente direto — assim, trocar o backend mexe só aqui.
 */

/** Erro com mensagem pronta para mostrar na tela. */
export class AppError extends Error {}

const AUTH_MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-MAIL OU SENHA INCORRETOS.'],
  [/email not confirmed/i, 'CONFIRME SEU E-MAIL ANTES DE ENTRAR (VEJA SUA CAIXA DE ENTRADA).'],
  [/already registered|already been registered/i, 'ESSE E-MAIL JÁ TEM CONTA. TENTE ENTRAR.'],
  [/password should be at least|weak password/i, 'SENHA FRACA: USE PELO MENOS 8 CARACTERES.'],
  [/unable to validate email|invalid email/i, 'E-MAIL INVÁLIDO.'],
  [/rate limit|too many/i, 'MUITAS TENTATIVAS. ESPERE UM POUCO E TENTE DE NOVO.'],
  [/database error saving new user/i, 'NÃO FOI POSSÍVEL CRIAR A CONTA. CONFIRA O NICK.'],
  [/network request failed|fetch failed|failed to fetch/i, 'SEM CONEXÃO COM O SERVIDOR. CONFIRA SUA INTERNET.'],
  [/jwt|not authenticated|faça login/i, 'SUA SESSÃO EXPIROU. ENTRE DE NOVO.'],
];

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  for (const [re, nice] of AUTH_MESSAGES) if (re.test(msg)) return new AppError(nice);
  // Mensagens das funções do banco já vêm em maiúsculas e prontas.
  if (msg && msg === msg.toUpperCase()) return new AppError(msg);
  return new AppError('ALGO DEU ERRADO. TENTE DE NOVO.');
}

export const errorMessage = (e: unknown) => toAppError(e).message;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toAppError(error);
  return data as T;
}

const withAvatar = <T extends { avatar: unknown }>(x: T): T & { avatar: Avatar } => ({ ...x, avatar: normalizeAvatar(x.avatar) });

/* ---------------- Conta ---------------- */

export const NICK_RE = /^[A-Z0-9_]{3,16}$/;

export async function nicknameAvailable(nick: string): Promise<boolean> {
  return rpc<boolean>('nickname_available', { p_nick: nick });
}

export async function signUp(input: { email: string; password: string; nickname: string; genres: string[] }) {
  const nickname = input.nickname.trim().toUpperCase();
  if (!NICK_RE.test(nickname)) throw new AppError('NICK: 3 A 16 LETRAS, NÚMEROS OU _');
  if (!(await nicknameAvailable(nickname))) throw new AppError('ESSE NICK JÁ ESTÁ EM USO.');
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: { nickname, genres: input.genres } },
  });
  if (error) throw toAppError(error);
  // Com "Confirm email" ligado no Supabase, não volta sessão até confirmar.
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw toAppError(error);
}

export async function sendPasswordReset(email: string) {
  // O link do e-mail abre a tela de nova senha no próprio app (src/app/reset-password.tsx).
  // Se esse endereço não estiver nas Redirect URLs do Supabase, ele usa o Site URL
  // (a página docs/redefinir-senha.html do GitHub Pages).
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: resetRedirectUrl() });
  if (error) throw toAppError(error);
}

export async function signOut() {
  await supabase.auth.signOut();
}

/* ---------------- Meu perfil ---------------- */

export async function getMyProfile(userId: string): Promise<MyProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar, bio, visibility, genres, fav_games, notif_prefs')
    .eq('id', userId)
    .single();
  if (error) throw toAppError(error);
  return withAvatar(data as MyProfile);
}

export async function updateMyProfile(
  userId: string,
  patch: Partial<{ avatar: Avatar; bio: string; visibility: ProfileVisibility; genres: string[]; fav_games: string[]; notif_prefs: NotifPrefs }>,
) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw toAppError(error);
}

/** "Estou online" + fuso do aparelho (para o texto das notificações) + roda os lembretes. */
export async function touch() {
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = undefined;
  }
  await supabase.rpc('touch', tz ? { p_tz: tz } : {});
}

/* ---------------- Notificações ---------------- */

export async function myNotifications(): Promise<AppNotification[]> {
  const list = await rpc<AppNotification[]>('my_notifications');
  return list.map((n) => (n.actor ? { ...n, actor: withAvatar(n.actor) } : n));
}
export const unreadNotifications = () => rpc<number>('unread_notifications');
export const markNotificationsRead = (ids?: number[]) => rpc('mark_notifications_read', ids ? { p_ids: ids } : {});

/* ---------------- Chat ---------------- */

const fixMsg = (m: ChatMessage): ChatMessage => ({ ...m, sender: withAvatar(m.sender) });

export async function myChats(): Promise<MyChats> {
  const c = await rpc<MyChats>('my_chats');
  return {
    squads: c.squads.map((s) => ({ ...s, last: s.last ? fixMsg(s.last) : null })),
    direct: c.direct.map((d) => ({ ...d, friend: withAvatar(d.friend), last: d.last ? fixMsg(d.last) : null })),
  };
}
export const unreadChats = () => rpc<number>('unread_chats');

export async function matchChat(matchId: number): Promise<MatchChat> {
  const c = await rpc<MatchChat>('match_chat', { p_match: matchId });
  return { ...c, members: c.members.map(withAvatar), messages: c.messages.map(fixMsg) };
}
export async function directChat(friendId: string): Promise<DirectChat> {
  const c = await rpc<DirectChat>('direct_chat', { p_friend: friendId });
  return { ...c, friend: withAvatar(c.friend), messages: c.messages.map(fixMsg) };
}
export const sendMatchMessage = (matchId: number, body: string) => rpc<number>('send_match_message', { p_match: matchId, p_body: body });
export const sendDirectMessage = (friendId: string, body: string) => rpc<number>('send_direct_message', { p_to: friendId, p_body: body });
export const markChatRead = (key: string) => rpc('mark_chat_read', { p_key: key });

/* ---------------- Jogos ---------------- */

let gamesCache: Game[] | null = null;

export async function listGames(): Promise<Game[]> {
  if (gamesCache) return gamesCache;
  const { data, error } = await supabase.from('games').select('*').order('name');
  if (error) throw toAppError(error);
  gamesCache = data as Game[];
  return gamesCache;
}

/* ---------------- Partidas ---------------- */

export type MatchInput = {
  name: string;
  category: Category;
  platforms: Platform[];
  visibility: MatchVisibility;
  startsAt: Date;
  description: string;
};

/** O app guarda textos em MAIÚSCULAS. A troca é feita ao salvar, não enquanto digita
 * (trocar o texto do campo a cada letra faz o teclado do Android repetir letras). */
export const caps = (v: string) => v.replace(/\s+/g, ' ').trim().toUpperCase();

export async function createMatch(gameId: string, m: MatchInput): Promise<number> {
  return rpc<number>('create_match', {
    p_name: caps(m.name),
    p_category: m.category,
    p_game: gameId,
    p_platforms: m.platforms,
    p_visibility: m.visibility,
    p_starts_at: m.startsAt.toISOString(),
    p_description: caps(m.description),
  });
}

export async function updateMatch(id: number, m: MatchInput) {
  await rpc('update_match', {
    p_match: id,
    p_name: caps(m.name),
    p_category: m.category,
    p_platforms: m.platforms,
    p_visibility: m.visibility,
    p_starts_at: m.startsAt.toISOString(),
    p_description: caps(m.description),
  });
}

export const myMatches = () => rpc<MatchCard[]>('my_matches');
export const publicMatches = () => rpc<PublicMatch[]>('public_matches');
export const myInvites = () => rpc<ReceivedInvite[]>('my_invites');
export const matchesForInvite = (userId: string) => rpc<InviteTarget[]>('matches_for_invite', { p_user: userId });
export const myHistory = () => rpc<HistoryItem[]>('my_history');

export async function getMatch(id: number): Promise<MatchDetail> {
  const m = await rpc<MatchDetail>('get_match', { p_match: id });
  return { ...m, members: m.members.map((x: Member) => withAvatar(x)) };
}

export const cancelMatch = (id: number, reason: CancelReason) => rpc('cancel_match', { p_match: id, p_reason: reason });
export const endMatch = (id: number) => rpc('end_match', { p_match: id });
export const joinMatch = (id: number) => rpc('join_match', { p_match: id });
export const leaveMatch = (id: number) => rpc('leave_match', { p_match: id });
export const kickPlayer = (id: number, userId: string) => rpc('kick_player', { p_match: id, p_user: userId });
export const previewCode = (code: string) => rpc<CodePreview>('preview_code', { p_code: code });
export const joinByCode = (code: string) => rpc<number>('join_by_code', { p_code: code });

export const invitePlayer = (matchId: number, userId: string) => rpc('invite_player', { p_match: matchId, p_user: userId });
export const inviteByNick = (matchId: number, nick: string) => rpc<string>('invite_by_nick', { p_match: matchId, p_nick: nick });
export const cancelInvite = (matchId: number, userId: string) => rpc('cancel_invite', { p_match: matchId, p_user: userId });
export const respondInvite = (inviteId: number, accept: boolean) =>
  rpc<number>('respond_invite', { p_invite: inviteId, p_accept: accept });

/* ---------------- Amigos e perfis ---------------- */

export async function myFriends(): Promise<FriendEntry[]> {
  const list = await rpc<FriendEntry[]>('my_friends');
  return list.map(withAvatar);
}

export async function getPlayerProfile(userId: string): Promise<PlayerProfile> {
  return withAvatar(await rpc<PlayerProfile>('get_profile', { p_user: userId }));
}

export const sendFriendRequest = (nick: string) => rpc<string>('send_friend_request', { p_nick: nick });
export const sendFriendRequestTo = (userId: string) => rpc<string>('send_friend_request_to', { p_user: userId });
export const respondFriendRequest = (fromId: string, accept: boolean) =>
  rpc('respond_friend_request', { p_from: fromId, p_accept: accept });
export const removeFriend = (otherId: string) => rpc('remove_friend', { p_other: otherId });

/* ---------------- Tempo real ---------------- */

/**
 * Chama `onChange` quando algo muda nas partidas, squads, convites ou amizades.
 * O RLS também vale no tempo real: só chegam eventos de linhas que o usuário pode ver.
 */
export function subscribeToChanges(onChange: () => void): () => void {
  const channel = supabase
    .channel(`gp-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_players' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invites' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
