-- =====================================================================
-- GamePlay · notificações
--  * tabela `notifications` (central no app) + `push_tokens` (celulares)
--  * preferências por grupo no perfil (partidas, squad, amigos, amigos_partidas)
--  * agrupamento: "3 JOGADORES ENTRARAM EM LENDÁRIOS" numa notificação só
--  * lembretes "começa em breve" e "começou" (run_match_reminders)
--  * o push é enviado pela Edge Function `send-push` (supabase/functions),
--    chamada por um Database Webhook em INSERT/UPDATE de `notifications`
-- Rode DEPOIS de 0001, 0002 e 0003.
-- =====================================================================

alter table public.profiles
  add column if not exists timezone text not null default 'America/Sao_Paulo',
  add column if not exists notif_prefs jsonb not null
    default '{"partidas": true, "squad": true, "amigos": true, "amigos_partidas": false}';

alter table public.matches
  add column if not exists soon_notified_at timestamptz,
  add column if not exists started_notified_at timestamptz;

create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in (
               'invite', 'match_soon', 'match_started', 'match_edited', 'match_canceled', 'kicked',
               'player_joined', 'player_left', 'squad_full', 'invite_accepted', 'invite_declined',
               'friend_request', 'friend_accepted', 'friend_public_match')),
  match_id   bigint references public.matches (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  count      int not null default 1,
  title      text not null,
  body       text not null,
  url        text not null default '/home',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx on public.notifications (user_id, updated_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null,
  updated_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
alter table public.push_tokens   enable row level security;
create policy notifications_read on public.notifications for select using (user_id = auth.uid());
-- push_tokens: sem política para o app; só as funções abaixo e a Edge Function (service_role) mexem.

grant select on public.notifications to authenticated;
grant update (notif_prefs) on public.profiles to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, delete on public.push_tokens to service_role;
    grant select on public.notifications to service_role;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Texto e grupo de cada tipo
-- ---------------------------------------------------------------------

create or replace function public.notif_group(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind in ('invite', 'match_soon', 'match_started', 'match_edited', 'match_canceled', 'kicked') then 'partidas'
    when p_kind in ('player_joined', 'player_left', 'squad_full', 'invite_accepted', 'invite_declined') then 'squad'
    when p_kind in ('friend_request', 'friend_accepted') then 'amigos'
    else 'amigos_partidas'
  end
$$;

-- "SEX, 06/11 ÀS 21:00" no fuso de quem recebe.
create or replace function public.notif_when(p_at timestamptz, p_tz text)
returns text language sql stable as $$
  select (array['DOM','SEG','TER','QUA','QUI','SEX','SÁB'])[extract(dow from p_at at time zone p_tz)::int + 1]
         || ', ' || to_char(p_at at time zone p_tz, 'DD/MM') || ' ÀS ' || to_char(p_at at time zone p_tz, 'HH24:MI')
$$;

/**
 * Cria (ou agrupa) uma notificação para p_user, respeitando as preferências.
 * Entrou/saiu do squad na mesma partida e ainda não lido vira uma só, com contador.
 */
create or replace function public.notify(p_user uuid, p_kind text, p_match bigint, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  u profiles;
  m matches;
  g games;
  actor text;
  n int := 1;
  existing notifications;
  t text;
  b text;
  link text := '/home';
  mins int;
begin
  if p_user is null or p_user = p_actor then return; end if;
  select * into u from profiles where id = p_user;
  if not found then return; end if;
  if not coalesce((u.notif_prefs ->> notif_group(p_kind))::boolean, true) then return; end if;

  if p_match is not null then
    select * into m from matches where id = p_match;
    select * into g from games where id = m.game_id;
    link := '/match/' || p_match;
  end if;
  select nickname into actor from profiles where id = p_actor;

  if p_kind in ('player_joined', 'player_left') then
    select * into existing from notifications
     where user_id = p_user and kind = p_kind and match_id = p_match and read_at is null
     order by id desc limit 1 for update;
    if found then n := existing.count + 1; end if;
  end if;

  case p_kind
    when 'invite' then
      t := 'CONVITE PARA PARTIDA';
      b := actor || ' TE CONVIDOU PARA ' || m.name || ' (' || g.name || ') · ' || notif_when(m.starts_at, u.timezone);
    when 'match_soon' then
      mins := greatest(1, ceil(extract(epoch from m.starts_at - now()) / 60)::int);
      t := 'COMEÇA EM BREVE';
      b := m.name || ' COMEÇA EM ' || mins || ' MIN. BORA AQUECER!';
    when 'match_started' then
      t := 'PARTIDA COMEÇOU';
      b := m.name || ' (' || g.name || ') ESTÁ EM ANDAMENTO.';
    when 'match_edited' then
      t := 'PARTIDA ALTERADA';
      b := m.name || ' MUDOU PARA ' || notif_when(m.starts_at, u.timezone) || '.';
    when 'match_canceled' then
      t := 'PARTIDA CANCELADA';
      b := m.name || ' FOI CANCELADA · MOTIVO: ' || coalesce(m.cancel_reason, '—');
    when 'kicked' then
      t := 'VOCÊ FOI REMOVIDO';
      b := 'VOCÊ FOI REMOVIDO DE ' || m.name || '.';
    when 'player_joined' then
      t := 'NOVO NO SQUAD';
      b := case when n = 1 then actor || ' ENTROU EM ' || m.name || '.'
                else n || ' JOGADORES ENTRARAM EM ' || m.name || '.' end;
    when 'player_left' then
      t := 'SAÍDA DO SQUAD';
      b := case when n = 1 then actor || ' SAIU DE ' || m.name || '.'
                else n || ' JOGADORES SAÍRAM DE ' || m.name || '.' end;
    when 'squad_full' then
      t := 'SQUAD COMPLETO';
      b := m.name || ' ESTÁ COM O SQUAD COMPLETO (' || m.max_players || '/' || m.max_players || ').';
    when 'invite_accepted' then
      t := 'CONVITE ACEITO';
      b := actor || ' ACEITOU O CONVITE PARA ' || m.name || '.';
    when 'invite_declined' then
      t := 'CONVITE RECUSADO';
      b := actor || ' RECUSOU O CONVITE PARA ' || m.name || '.';
    when 'friend_request' then
      t := 'PEDIDO DE AMIZADE';
      b := actor || ' QUER SER SEU AMIGO.';
      link := '/friends';
    when 'friend_accepted' then
      t := 'NOVO AMIGO';
      b := actor || ' ACEITOU SEU PEDIDO DE AMIZADE.';
      link := '/player/' || p_actor;
    when 'friend_public_match' then
      t := 'PARTIDA DE AMIGO';
      b := actor || ' CRIOU ' || m.name || ' (' || g.name || ') · ' || notif_when(m.starts_at, u.timezone) || '. TEM VAGA!';
  end case;

  if existing.id is not null then
    update notifications set count = n, body = b, actor_id = p_actor, updated_at = now() where id = existing.id;
  else
    insert into notifications (user_id, kind, match_id, actor_id, title, body, url)
    values (p_user, p_kind, p_match, p_actor, t, b, link);
  end if;
end $$;

-- Avisa todos do squad (menos quem fez a ação).
create or replace function public.notify_squad(p_match bigint, p_kind text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id from match_players where match_id = p_match and left_at is null loop
    perform notify(r.user_id, p_kind, p_match, p_actor);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Lembretes "começa em breve" (30 min antes) e "começou"
-- Rodados a cada minuto pelo pg_cron (se ativado) e também a cada
-- touch() dos apps abertos — então funcionam mesmo sem o cron.
-- ---------------------------------------------------------------------

create or replace function public.run_match_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  total int := 0;
begin
  for r in
    update matches set soon_notified_at = now()
     where soon_notified_at is null and canceled_at is null and ended_at is null
       and starts_at > now() and starts_at <= now() + interval '30 minutes'
    returning id
  loop
    perform notify_squad(r.id, 'match_soon', null);
    total := total + 1;
  end loop;
  for r in
    update matches set started_notified_at = now()
     where started_notified_at is null and canceled_at is null and ended_at is null
       and starts_at <= now() and starts_at > now() - interval '2 hours'
    returning id
  loop
    perform notify_squad(r.id, 'match_started', null);
    total := total + 1;
  end loop;
  return total;
end $$;

drop function if exists public.touch();
create or replace function public.touch(p_tz text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set last_seen_at = now(),
         timezone = case when p_tz is not null and exists (select 1 from pg_timezone_names where name = p_tz)
                         then p_tz else timezone end
   where id = auth.uid();
  perform run_match_reminders();
end $$;

-- Tenta agendar no pg_cron (Supabase: Integrations → Cron). Se não houver, segue sem.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('gameplay-reminders', '* * * * *', 'select public.run_match_reminders()');
exception when others then
  raise notice 'pg_cron indisponível (%). Os lembretes rodam pelo touch() dos apps abertos.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- Funções usadas pelo app
-- ---------------------------------------------------------------------

create or replace function public.my_notifications(p_limit int default 60)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x ->> 'updated_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', n.id, 'kind', n.kind, 'match_id', n.match_id, 'count', n.count,
      'title', n.title, 'body', n.body, 'url', n.url,
      'created_at', n.created_at, 'updated_at', n.updated_at, 'read', n.read_at is not null,
      'actor', (select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar', p.avatar) from profiles p where p.id = n.actor_id),
      'game', (select jsonb_build_object('tag', g.tag, 'color', g.color) from matches m join games g on g.id = m.game_id where m.id = n.match_id)
    ) as x
    from notifications n
    where n.user_id = auth.uid()
    order by n.updated_at desc
    limit p_limit
  ) t
$$;

create or replace function public.unread_notifications()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from notifications where user_id = auth.uid() and read_at is null
$$;

-- Sem ids = marca todas como lidas.
create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
$$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := require_user();
begin
  if p_token !~ '^Expo(nent)?PushToken\[.+\]$' then perform fail('TOKEN DE NOTIFICAÇÃO INVÁLIDO.'); end if;
  insert into push_tokens (token, user_id, platform) values (p_token, me, p_platform)
  on conflict (token) do update set user_id = me, platform = p_platform, updated_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Funções do jogo, agora avisando quem precisa saber
-- ---------------------------------------------------------------------
create or replace function public.seat_user(m public.matches, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if public.match_status(m) in ('cancelada', 'finalizada') then perform fail('ESSA PARTIDA JÁ ACABOU.'); end if;
  if exists (select 1 from match_players where match_id = m.id and user_id = p_user and left_at is null) then
    perform fail('VOCÊ JÁ ESTÁ NESSA PARTIDA.');
  end if;
  if filled_seats(m.id) >= m.max_players then perform fail('ESSA SALA ESTÁ LOTADA.'); end if;
  insert into match_players (match_id, user_id) values (m.id, p_user)
  on conflict (match_id, user_id) do update set left_at = null, kicked = false, joined_at = now();
  for r in update invites set status = 'accepted'
            where match_id = m.id and to_user = p_user and status = 'pending'
          returning from_user loop
    -- o anfitrião já recebe "entrou no squad"; avisa só quem convidou, se for outra pessoa
    if r.from_user <> m.host_id then perform notify(r.from_user, 'invite_accepted', m.id, p_user); end if;
  end loop;
  perform notify(m.host_id, 'player_joined', m.id, p_user);
  if filled_seats(m.id) >= m.max_players then perform notify(m.host_id, 'squad_full', m.id, p_user); end if;
end $$;

create or replace function public.update_match(
  p_match bigint, p_name text, p_category text, p_platforms text[],
  p_visibility text, p_starts_at timestamptz, p_description text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  m matches := lock_match(p_match);
begin
  if m.host_id <> me then perform fail('SÓ O ANFITRIÃO PODE EDITAR A PARTIDA.'); end if;
  if match_status(m) not in ('agendada', 'em_breve') then perform fail('DEPOIS DO INÍCIO NÃO DÁ MAIS PARA EDITAR.'); end if;
  if char_length(trim(p_name)) < 3 then perform fail('O NOME PRECISA TER PELO MENOS 3 LETRAS.'); end if;
  if p_starts_at <= now() then perform fail('ESSE HORÁRIO JÁ PASSOU.'); end if;
  perform validate_platforms(m.game_id, p_platforms);
  update matches set name = upper(trim(p_name)), category = p_category, platforms = p_platforms,
                     visibility = p_visibility, starts_at = p_starts_at,
                     description = upper(trim(coalesce(p_description, ''))), updated_at = now(),
                     soon_notified_at = case when p_starts_at <> m.starts_at then null else soon_notified_at end,
                     started_notified_at = case when p_starts_at <> m.starts_at then null else started_notified_at end
   where id = p_match;
  if p_starts_at <> m.starts_at then perform notify_squad(p_match, 'match_edited', me); end if;
  if p_visibility = 'privada' then
    insert into match_codes (match_id, code) values (p_match, new_room_code()) on conflict (match_id) do nothing;
  else
    delete from match_codes where match_id = p_match;
  end if;
end $$;

create or replace function public.cancel_match(p_match bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  m matches := lock_match(p_match);
begin
  if m.host_id <> me then perform fail('SÓ O ANFITRIÃO PODE CANCELAR A PARTIDA.'); end if;
  if match_status(m) not in ('agendada', 'em_breve') then perform fail('SÓ DÁ PARA CANCELAR ANTES DO INÍCIO.'); end if;
  if p_reason is null then perform fail('ESCOLHA UM MOTIVO PARA CANCELAR.'); end if;
  update matches set canceled_at = now(), cancel_reason = p_reason where id = p_match;
  perform notify_squad(p_match, 'match_canceled', me);
  update invites set status = 'canceled' where match_id = p_match and status = 'pending';
end $$;

create or replace function public.leave_match(p_match bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  m matches := lock_match(p_match);
begin
  if m.host_id = me then perform fail('O ANFITRIÃO NÃO SAI: CANCELE OU ENCERRE A PARTIDA.'); end if;
  if match_status(m) in ('cancelada', 'finalizada') then perform fail('ESSA PARTIDA JÁ ACABOU.'); end if;
  update match_players set left_at = now() where match_id = p_match and user_id = me and left_at is null;
  if not found then perform fail('VOCÊ NÃO ESTÁ NESSA PARTIDA.'); end if;
  perform notify(m.host_id, 'player_left', p_match, me);
end $$;

create or replace function public.kick_player(p_match bigint, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  m matches := lock_match(p_match);
begin
  if m.host_id <> me then perform fail('SÓ O ANFITRIÃO PODE REMOVER JOGADORES.'); end if;
  if p_user = me then perform fail('VOCÊ NÃO PODE REMOVER A SI MESMO.'); end if;
  if match_status(m) in ('cancelada', 'finalizada') then perform fail('ESSA PARTIDA JÁ ACABOU.'); end if;
  update match_players set left_at = now(), kicked = true
   where match_id = p_match and user_id = p_user and left_at is null;
  if not found then perform fail('ESSE JOGADOR NÃO ESTÁ NO SQUAD.'); end if;
  update invites set status = 'canceled' where match_id = p_match and to_user = p_user and status = 'pending';
  perform notify(p_user, 'kicked', p_match, me);
end $$;

create or replace function public.invite_player(p_match bigint, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  m matches := lock_match(p_match);
begin
  if not is_member(p_match) then perform fail('VOCÊ NÃO ESTÁ NESSA PARTIDA.'); end if;
  if match_status(m) in ('cancelada', 'finalizada') then perform fail('ESSA PARTIDA JÁ ACABOU.'); end if;
  if p_user = me then perform fail('ESSE NICK É O SEU'); end if;
  if exists (select 1 from match_players where match_id = p_match and user_id = p_user and left_at is null) then
    perform fail('ESSE JOGADOR JÁ ESTÁ NO SQUAD.');
  end if;
  if filled_seats(p_match) >= m.max_players then perform fail('O SQUAD JÁ ESTÁ COMPLETO.'); end if;
  insert into invites (match_id, from_user, to_user) values (p_match, me, p_user)
  on conflict (match_id, to_user) do update set status = 'pending', from_user = me, created_at = now();
  perform notify(p_user, 'invite', p_match, me);
end $$;

create or replace function public.respond_invite(p_invite bigint, p_accept boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  i invites;
  m matches;
begin
  select * into i from invites where id = p_invite and to_user = me and status = 'pending';
  if not found then perform fail('ESSE CONVITE NÃO EXISTE MAIS.'); end if;
  if not p_accept then
    update invites set status = 'declined' where id = p_invite;
    perform notify(i.from_user, 'invite_declined', i.match_id, me);
    return i.match_id;
  end if;
  m := lock_match(i.match_id);
  perform seat_user(m, me);
  return i.match_id;
end $$;

create or replace function public.send_friend_request(p_nick text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  other uuid;
  nick text := upper(trim(p_nick));
begin
  if nick !~ '^[A-Z0-9_]{3,16}$' then perform fail('NICK: 3 A 16 LETRAS, NÚMEROS OU _'); end if;
  select id into other from profiles where nickname = nick;
  if other is null then perform fail('JOGADOR "' || nick || '" NÃO ENCONTRADO'); end if;
  if other = me then perform fail('ESSE NICK É O SEU'); end if;
  case relation_with(other)
    when 'friend' then perform fail(nick || ' JÁ É SEU AMIGO');
    when 'sent' then perform fail('VOCÊ JÁ ENVIOU UM PEDIDO PARA ' || nick);
    when 'received' then perform fail(nick || ' JÁ TE ENVIOU UM PEDIDO. ACEITE EM PEDIDOS');
    else null;
  end case;
  insert into friendships (requester, addressee) values (me, other);
  perform notify(other, 'friend_request', null, me);
  return 'PEDIDO ENVIADO PARA ' || nick || '!';
end $$;

create or replace function public.respond_friend_request(p_from uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := require_user();
begin
  if p_accept then
    update friendships set status = 'accepted', accepted_at = now()
     where requester = p_from and addressee = me and status = 'pending';
  else
    delete from friendships where requester = p_from and addressee = me and status = 'pending';
  end if;
  if not found then perform fail('ESSE PEDIDO NÃO EXISTE MAIS.'); end if;
  if p_accept then perform notify(p_from, 'friend_accepted', null, me); end if;
end $$;

create or replace function public.create_match(
  p_name text, p_category text, p_game text, p_platforms text[],
  p_visibility text, p_starts_at timestamptz, p_description text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  g games;
  new_id bigint;
  r record;
begin
  if char_length(trim(p_name)) < 3 then perform fail('O NOME PRECISA TER PELO MENOS 3 LETRAS.'); end if;
  if p_starts_at <= now() then perform fail('ESSE HORÁRIO JÁ PASSOU.'); end if;
  perform validate_platforms(p_game, p_platforms);
  select * into g from games where id = p_game;
  insert into matches (host_id, name, category, game_id, platforms, visibility, max_players, starts_at, description)
  values (me, upper(trim(p_name)), p_category, p_game, p_platforms, p_visibility, g.squad_size, p_starts_at,
          upper(trim(coalesce(p_description, ''))))
  returning id into new_id;
  insert into match_players (match_id, user_id) values (new_id, me);
  if p_visibility = 'privada' then
    insert into match_codes (match_id, code) values (new_id, new_room_code());
  else
    -- amigos que ligaram "partidas de amigos" ficam sabendo
    for r in select case when requester = me then addressee else requester end as friend
               from friendships where status = 'accepted' and me in (requester, addressee) loop
      perform notify(r.friend, 'friend_public_match', new_id, me);
    end loop;
  end if;
  return new_id;
end $$;

-- Permissões das funções novas
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.nickname_available(text) to anon;
grant execute on function public.server_now() to anon;
-- funções internas: só o banco chama
revoke execute on function public.notify(uuid, text, bigint, uuid) from authenticated;
revoke execute on function public.notify_squad(bigint, text, uuid) from authenticated;
revoke execute on function public.run_match_reminders() from authenticated;
-- (correção de segurança) auxiliares internas que não devem ser chamadas pela API
revoke execute on function public.seat_user(public.matches, uuid) from authenticated;
revoke execute on function public.lock_match(bigint) from authenticated;
revoke execute on function public.match_card(public.matches) from authenticated;
revoke execute on function public.new_room_code() from authenticated;
revoke execute on function public.validate_platforms(text, text[]) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
