-- =====================================================================
-- GamePlay · esquema PostgreSQL para o Supabase
-- Tabelas, segurança por linha (RLS) e funções (RPC) usadas pelo app.
--
-- Regra geral: o app LÊ direto das tabelas/views (protegidas por RLS) e
-- ESCREVE só por funções `security definer`, que validam as regras do jogo
-- (anfitrião, vagas, horário, expulsão...). Assim a regra vale mesmo que
-- alguém tente chamar a API sem passar pelo app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------

create table public.games (
  id          text primary key,
  name        text not null unique,
  tag         text not null,
  genre       text not null,
  squad_size  int  not null check (squad_size between 2 and 10),
  color       text not null,
  platforms   text[] not null check (cardinality(platforms) > 0)
);

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  nickname     text not null unique check (nickname ~ '^[A-Z0-9_]{3,16}$'),
  -- índices das peças: head/torso/pants/shoes 0..19, skin 0..5, bg 0..33
  avatar       jsonb not null default '{"head":0,"torso":0,"pants":0,"shoes":0,"skin":0,"bg":12}',
  bio          text not null default '' check (char_length(bio) <= 150),
  visibility   text not null default 'amigos' check (visibility in ('publica', 'amigos', 'privada')),
  genres       text[] not null default '{}',
  fav_games    text[] not null default '{}',
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

create table public.friendships (
  requester   uuid not null references public.profiles (id) on delete cascade,
  addressee   uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- Um par só pode ter uma linha, não importa quem pediu.
create unique index friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

create table public.matches (
  id            bigint generated always as identity primary key,
  host_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null check (char_length(name) between 3 and 24),
  category      text not null check (category in ('RANQUEADA', 'CASUAL', 'TREINO', 'CAMPEONATO')),
  game_id       text not null references public.games (id),
  platforms     text[] not null check (cardinality(platforms) > 0),
  visibility    text not null check (visibility in ('publica', 'privada')),
  max_players   int  not null check (max_players between 2 and 10),
  starts_at     timestamptz not null,
  description   text not null default '' check (char_length(description) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  ended_at      timestamptz,
  canceled_at   timestamptz,
  cancel_reason text check (cancel_reason in ('FALTA DE JOGADORES', 'IMPREVISTO', 'PROBLEMA TÉCNICO', 'OUTRO MOTIVO')),
  check (not (ended_at is not null and canceled_at is not null))
);
create index matches_starts_idx on public.matches (starts_at) where ended_at is null and canceled_at is null;

-- O código da sala privada fica separado para só os membros conseguirem ler.
create table public.match_codes (
  match_id bigint primary key references public.matches (id) on delete cascade,
  code     text not null unique check (code ~ '^GP-[A-Z0-9]{4}$')
);

create table public.match_players (
  match_id  bigint not null references public.matches (id) on delete cascade,
  user_id   uuid   not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,           -- saiu ou foi removido
  kicked    boolean not null default false,
  primary key (match_id, user_id)
);
create index match_players_user_idx on public.match_players (user_id);

create table public.invites (
  id         bigint generated always as identity primary key,
  match_id   bigint not null references public.matches (id) on delete cascade,
  from_user  uuid   not null references public.profiles (id) on delete cascade,
  to_user    uuid   not null references public.profiles (id) on delete cascade,
  status     text   not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'canceled')),
  created_at timestamptz not null default now(),
  unique (match_id, to_user)
);

-- ---------------------------------------------------------------------
-- 2. Funções auxiliares (usadas nas políticas e nas RPCs)
-- ---------------------------------------------------------------------

create or replace function public.match_status(m public.matches)
returns text language sql stable set search_path = public as $$
  select case
    when m.canceled_at is not null then 'cancelada'
    when m.ended_at is not null then 'finalizada'
    when m.starts_at <= now() then 'em_andamento'
    when m.starts_at <= now() + interval '30 minutes' then 'em_breve'
    else 'agendada'
  end
$$;

create or replace function public.is_member(p_match bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from match_players
                 where match_id = p_match and user_id = auth.uid() and left_at is null)
$$;

create or replace function public.was_member(p_match bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from match_players where match_id = p_match and user_id = auth.uid())
$$;

create or replace function public.match_is_public(p_match bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches where id = p_match and visibility = 'publica')
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships
                 where status = 'accepted'
                   and ((requester = a and addressee = b) or (requester = b and addressee = a)))
$$;

create or replace function public.filled_seats(p_match bigint)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from match_players where match_id = p_match and left_at is null
$$;

-- Falha com uma mensagem que o app mostra direto para o usuário.
create or replace function public.fail(msg text)
returns void language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = msg;
end $$;

create or replace function public.require_user()
returns uuid language plpgsql stable as $$
declare uid uuid := auth.uid();
begin
  if uid is null then perform fail('FAÇA LOGIN DE NOVO.'); end if;
  return uid;
end $$;

-- Busca a partida travando a linha (evita duas pessoas pegarem a última vaga).
create or replace function public.lock_match(p_match bigint)
returns public.matches language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match for update;
  if not found then perform fail('PARTIDA NÃO ENCONTRADA.'); end if;
  return m;
end $$;

create or replace function public.new_room_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := 'GP-' || (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
                   from generate_series(1, 4));
    exit when not exists (select 1 from match_codes where code = c);
  end loop;
  return c;
end $$;

create or replace function public.validate_platforms(p_game text, p_platforms text[])
returns void language plpgsql stable set search_path = public as $$
declare g games;
begin
  select * into g from games where id = p_game;
  if not found then perform fail('JOGO NÃO ENCONTRADO.'); end if;
  if p_platforms is null or cardinality(p_platforms) = 0 then perform fail('ESCOLHA PELO MENOS UMA PLATAFORMA.'); end if;
  if not (p_platforms <@ g.platforms) then perform fail('ESSE JOGO NÃO ESTÁ DISPONÍVEL EM TODAS ESSAS PLATAFORMAS.'); end if;
end $$;

-- Coloca (ou recoloca) o usuário no squad, respeitando as vagas.
create or replace function public.seat_user(m public.matches, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.match_status(m) in ('cancelada', 'finalizada') then perform fail('ESSA PARTIDA JÁ ACABOU.'); end if;
  if exists (select 1 from match_players where match_id = m.id and user_id = p_user and left_at is null) then
    perform fail('VOCÊ JÁ ESTÁ NESSA PARTIDA.');
  end if;
  if filled_seats(m.id) >= m.max_players then perform fail('ESSA SALA ESTÁ LOTADA.'); end if;
  insert into match_players (match_id, user_id) values (m.id, p_user)
  on conflict (match_id, user_id) do update set left_at = null, kicked = false, joined_at = now();
  update invites set status = 'accepted' where match_id = m.id and to_user = p_user and status = 'pending';
end $$;

-- ---------------------------------------------------------------------
-- 3. Cadastro: cria o perfil junto com o usuário do Supabase Auth
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nickname, genres)
  values (
    new.id,
    upper(trim(new.raw_user_meta_data ->> 'nickname')),
    coalesce(array(select jsonb_array_elements_text(new.raw_user_meta_data -> 'genres')), '{}')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.nickname_available(p_nick text)
returns boolean language sql stable security definer set search_path = public as $$
  select upper(trim(p_nick)) ~ '^[A-Z0-9_]{3,16}$'
     and not exists (select 1 from profiles where nickname = upper(trim(p_nick)))
$$;

-- ---------------------------------------------------------------------
-- 4. Segurança por linha (RLS)
-- ---------------------------------------------------------------------

alter table public.games         enable row level security;
alter table public.profiles      enable row level security;
alter table public.friendships   enable row level security;
alter table public.matches       enable row level security;
alter table public.match_codes   enable row level security;
alter table public.match_players enable row level security;
alter table public.invites       enable row level security;

create policy games_read on public.games for select using (true);

-- Perfil completo: só o próprio. Os outros veem pela view profile_cards
-- (nick + avatar) e pela função get_profile, que respeita a visibilidade.
create policy profiles_self_read   on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy friendships_read on public.friendships for select
  using (auth.uid() in (requester, addressee));

create policy matches_read on public.matches for select
  using (visibility = 'publica' or host_id = auth.uid() or public.was_member(id)
         or exists (select 1 from invites i where i.match_id = id and i.to_user = auth.uid()));

create policy match_codes_read on public.match_codes for select using (public.is_member(match_id));

create policy match_players_read on public.match_players for select
  using (public.was_member(match_id) or public.match_is_public(match_id));

create policy invites_read on public.invites for select
  using (auth.uid() in (from_user, to_user));

-- Ninguém escreve direto nas tabelas (só pelas funções abaixo),
-- exceto o próprio perfil, e só nestas colunas.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
-- Leitura liberada explicitamente (funciona mesmo com "Automatically expose
-- new tables" desligado no Supabase). O RLS acima decide QUAIS linhas cada um vê.
grant usage on schema public to anon, authenticated;
grant select on public.games, public.profiles, public.friendships, public.matches,
  public.match_codes, public.match_players, public.invites to authenticated;
grant update (avatar, bio, visibility, genres, fav_games) on public.profiles to authenticated;

-- Cartão público: nick e avatar de qualquer jogador.
create view public.profile_cards as
  select id, nickname, avatar from public.profiles;
grant select on public.profile_cards to authenticated;

-- ---------------------------------------------------------------------
-- 5. Perfil e amigos
-- ---------------------------------------------------------------------

create or replace function public.touch()
returns void language sql security definer set search_path = public as $$
  update profiles set last_seen_at = now() where id = auth.uid()
$$;

create or replace function public.relation_with(p_other uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_other = auth.uid() then 'self'
    when exists (select 1 from friendships where status = 'accepted'
                 and auth.uid() in (requester, addressee) and p_other in (requester, addressee)) then 'friend'
    when exists (select 1 from friendships where status = 'pending' and requester = auth.uid() and addressee = p_other) then 'sent'
    when exists (select 1 from friendships where status = 'pending' and requester = p_other and addressee = auth.uid()) then 'received'
    else 'none'
  end
$$;

create or replace function public.get_profile(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p profiles;
  rel text;
  can_see boolean;
begin
  perform require_user();
  select * into p from profiles where id = p_user;
  if not found then perform fail('JOGADOR NÃO ENCONTRADO.'); end if;
  rel := relation_with(p_user);
  can_see := rel = 'self' or p.visibility = 'publica' or (p.visibility = 'amigos' and rel = 'friend');
  return jsonb_build_object(
    'id', p.id,
    'nickname', p.nickname,
    'avatar', p.avatar,
    'visibility', p.visibility,
    'relation', rel,
    'visible', can_see,
    'bio', case when can_see then p.bio end,
    'genres', case when can_see then to_jsonb(p.genres) end,
    'fav_games', case when can_see then to_jsonb(p.fav_games) end,
    -- online só aparece para amigos
    'online', case when rel in ('friend', 'self') then coalesce(p.last_seen_at > now() - interval '2 minutes', false) end,
    'matches_together', (
      select count(distinct a.match_id) from match_players a
      join match_players b on b.match_id = a.match_id and b.user_id = p_user
      where a.user_id = auth.uid() and p_user <> auth.uid())
  );
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
  return 'PEDIDO ENVIADO PARA ' || nick || '!';
end $$;

create or replace function public.send_friend_request_to(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare nick text;
begin
  select nickname into nick from profiles where id = p_user;
  if nick is null then perform fail('JOGADOR NÃO ENCONTRADO.'); end if;
  return send_friend_request(nick);
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
end $$;

-- Cancela pedido enviado ou desfaz amizade.
create or replace function public.remove_friend(p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := require_user();
begin
  delete from friendships
   where (requester = me and addressee = p_other) or (requester = p_other and addressee = me);
end $$;

create or replace function public.my_friends()
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as other,
           case when f.status = 'accepted' then 'friend'
                when f.requester = auth.uid() then 'sent' else 'received' end as kind,
           f.created_at
    from friendships f
    where auth.uid() in (f.requester, f.addressee)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'kind', m.kind,
           'online', m.kind = 'friend' and coalesce(p.last_seen_at > now() - interval '2 minutes', false))
         order by (m.kind = 'friend' and p.last_seen_at > now() - interval '2 minutes') desc nulls last, p.nickname), '[]'::jsonb)
  from mine m join profiles p on p.id = m.other
$$;

-- ---------------------------------------------------------------------
-- 6. Partidas: criar, editar, cancelar, encerrar
-- ---------------------------------------------------------------------

create or replace function public.create_match(
  p_name text, p_category text, p_game text, p_platforms text[],
  p_visibility text, p_starts_at timestamptz, p_description text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  g games;
  new_id bigint;
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
  end if;
  return new_id;
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
                     description = upper(trim(coalesce(p_description, ''))), updated_at = now()
   where id = p_match;
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
  update invites set status = 'canceled' where match_id = p_match and status = 'pending';
end $$;

create or replace function public.end_match(p_match bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  m matches := lock_match(p_match);
begin
  if m.host_id <> me then perform fail('SÓ O ANFITRIÃO PODE ENCERRAR A PARTIDA.'); end if;
  if match_status(m) <> 'em_andamento' then perform fail('SÓ DÁ PARA ENCERRAR UMA PARTIDA EM ANDAMENTO.'); end if;
  update matches set ended_at = now() where id = p_match;
  update invites set status = 'canceled' where match_id = p_match and status = 'pending';
end $$;

-- ---------------------------------------------------------------------
-- 7. Entrar, sair, remover, convidar
-- ---------------------------------------------------------------------

create or replace function public.join_match(p_match bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  m matches := lock_match(p_match);
  invited boolean;
begin
  invited := exists (select 1 from invites where match_id = m.id and to_user = me and status = 'pending');
  if m.visibility <> 'publica' and not invited then perform fail('ESSA PARTIDA É PRIVADA. ENTRE PELO CÓDIGO.'); end if;
  if exists (select 1 from match_players where match_id = m.id and user_id = me and kicked) and not invited then
    perform fail('O ANFITRIÃO TE REMOVEU DESSA PARTIDA.');
  end if;
  perform seat_user(m, me);
end $$;

create or replace function public.preview_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := require_user();
  c text := upper(trim(p_code));
  m matches;
  mp match_players;
begin
  if c !~ '^GP-[A-Z0-9]{4}$' then perform fail('CÓDIGO INVÁLIDO. O FORMATO É GP-XXXX'); end if;
  select x.* into m from matches x join match_codes k on k.match_id = x.id where k.code = c;
  if not found or match_status(m) in ('cancelada', 'finalizada') then
    perform fail('NENHUMA SALA COM O CÓDIGO ' || c || '. CONFIRA COM O ANFITRIÃO.');
  end if;
  select * into mp from match_players where match_id = m.id and user_id = me;
  return jsonb_build_object(
    'match_id', m.id, 'code', c, 'name', m.name, 'category', m.category, 'starts_at', m.starts_at,
    'status', match_status(m),
    'game', (select to_jsonb(g) from games g where g.id = m.game_id),
    'host', (select nickname from profiles where id = m.host_id),
    'filled', filled_seats(m.id), 'max_players', m.max_players,
    'already_member', mp.user_id is not null and mp.left_at is null,
    'kicked', coalesce(mp.kicked, false)
  );
end $$;

create or replace function public.join_by_code(p_code text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_user();
  info jsonb := preview_code(p_code);
  m matches := lock_match((info ->> 'match_id')::bigint);
begin
  if (info ->> 'kicked')::boolean
     and not exists (select 1 from invites where match_id = m.id and to_user = me and status = 'pending') then
    perform fail('O ANFITRIÃO TE REMOVEU DESSA PARTIDA.');
  end if;
  perform seat_user(m, me);
  return m.id;
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
end $$;

create or replace function public.invite_by_nick(p_match bigint, p_nick text)
returns text language plpgsql security definer set search_path = public as $$
declare
  nick text := upper(trim(p_nick));
  other uuid;
begin
  if nick !~ '^[A-Z0-9_]{3,16}$' then perform fail('NICK: 3 A 16 LETRAS, NÚMEROS OU _'); end if;
  select id into other from profiles where nickname = nick;
  if other is null then perform fail('JOGADOR "' || nick || '" NÃO ENCONTRADO'); end if;
  perform invite_player(p_match, other);
  return 'CONVITE ENVIADO PARA ' || nick || '!';
end $$;

create or replace function public.cancel_invite(p_match bigint, p_user uuid)
returns void language sql security definer set search_path = public as $$
  update invites set status = 'canceled'
   where match_id = p_match and to_user = p_user and from_user = auth.uid() and status = 'pending'
$$;

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
    return i.match_id;
  end if;
  m := lock_match(i.match_id);
  perform seat_user(m, me);
  return i.match_id;
end $$;

-- ---------------------------------------------------------------------
-- 8. Consultas usadas pelas telas
-- ---------------------------------------------------------------------

-- Linha resumida de uma partida (Home, Procurar squads, Convidar).
create or replace function public.match_card(m public.matches)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'name', m.name, 'category', m.category, 'platforms', to_jsonb(m.platforms),
    'visibility', m.visibility, 'starts_at', m.starts_at, 'status', match_status(m),
    'max_players', m.max_players, 'filled', filled_seats(m.id),
    'is_host', m.host_id = auth.uid(),
    'host', (select jsonb_build_object('id', p.id, 'nickname', p.nickname) from profiles p where p.id = m.host_id),
    'game', (select to_jsonb(g) from games g where g.id = m.game_id))
$$;

-- Home: partidas em que eu estou e que ainda não acabaram.
create or replace function public.my_matches()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(match_card(m)
           order by (match_status(m) = 'em_andamento') desc, (match_status(m) = 'em_breve') desc, m.starts_at), '[]'::jsonb)
  from matches m
  join match_players mp on mp.match_id = m.id and mp.user_id = auth.uid() and mp.left_at is null
  where m.canceled_at is null and m.ended_at is null
$$;

-- Procurar squads: públicas, com vaga, em que eu não estou e não fui removido.
-- Partidas de amigos vêm primeiro.
create or replace function public.public_matches()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(match_card(m) || jsonb_build_object('from_friend', are_friends(auth.uid(), m.host_id))
           order by are_friends(auth.uid(), m.host_id) desc, m.starts_at), '[]'::jsonb)
  from matches m
  where m.visibility = 'publica'
    and m.canceled_at is null and m.ended_at is null
    and filled_seats(m.id) < m.max_players
    and not exists (select 1 from match_players mp where mp.match_id = m.id and mp.user_id = auth.uid()
                    and (mp.left_at is null or mp.kicked))
$$;

-- Partidas disponíveis para convidar um jogador.
create or replace function public.matches_for_invite(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(match_card(m) || jsonb_build_object(
           'target_in_squad', exists (select 1 from match_players x where x.match_id = m.id and x.user_id = p_user and x.left_at is null),
           'target_invited', exists (select 1 from invites i where i.match_id = m.id and i.to_user = p_user and i.status = 'pending'))
         order by m.starts_at), '[]'::jsonb)
  from matches m
  join match_players mp on mp.match_id = m.id and mp.user_id = auth.uid() and mp.left_at is null
  where m.canceled_at is null and m.ended_at is null
    and filled_seats(m.id) < m.max_players
$$;

-- Detalhes completos de uma partida.
create or replace function public.get_match(p_match bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := require_user();
  m matches;
  mp match_players;
  role text;
begin
  select * into m from matches where id = p_match;
  if not found then perform fail('PARTIDA NÃO ENCONTRADA.'); end if;
  select * into mp from match_players where match_id = p_match and user_id = me;
  role := case
    when m.host_id = me then 'host'
    when mp.user_id is not null and mp.left_at is null then 'member'
    when mp.kicked then 'kicked'
    when mp.user_id is not null then 'left'
    else 'none' end;
  if role = 'none' and m.visibility <> 'publica'
     and not exists (select 1 from invites where match_id = p_match and to_user = me) then
    perform fail('PARTIDA NÃO ENCONTRADA.');
  end if;
  return match_card(m) || jsonb_build_object(
    'description', m.description,
    'ended_at', m.ended_at, 'canceled_at', m.canceled_at, 'cancel_reason', m.cancel_reason,
    'my_role', role,
    'code', case when role in ('host', 'member') then (select code from match_codes where match_id = p_match) end,
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'is_host', p.id = m.host_id)
                  order by p.id <> m.host_id, x.joined_at), '[]'::jsonb)
                from match_players x join profiles p on p.id = x.user_id
                where x.match_id = p_match and x.left_at is null),
    'invited', (select coalesce(jsonb_agg(to_user), '[]'::jsonb) from invites
                where match_id = p_match and status = 'pending' and from_user = me),
    'my_invite', (select id from invites where match_id = p_match and to_user = me and status = 'pending')
  );
end $$;

-- Histórico: partidas que acabaram, foram canceladas, ou de que eu saí/fui removido.
create or replace function public.my_history()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(match_card(m) || jsonb_build_object(
           'result', case when mp.kicked then 'removido'
                          when mp.left_at is not null then 'saiu'
                          when m.canceled_at is not null then 'cancelada'
                          else 'concluida' end,
           'description', m.description,
           'ended_at', m.ended_at, 'canceled_at', m.canceled_at, 'cancel_reason', m.cancel_reason,
           'left_at', mp.left_at,
           'players', (select coalesce(jsonb_agg(p.nickname order by p.id <> m.host_id, x.joined_at), '[]'::jsonb)
                       from match_players x join profiles p on p.id = x.user_id
                       where x.match_id = m.id and x.left_at is null))
         order by coalesce(m.ended_at, m.canceled_at, mp.left_at, m.starts_at) desc), '[]'::jsonb)
  from match_players mp
  join matches m on m.id = mp.match_id
  where mp.user_id = auth.uid()
    and (m.ended_at is not null or m.canceled_at is not null or mp.left_at is not null)
$$;

-- Convites recebidos (aparecem na Home).
create or replace function public.my_invites()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(match_card(m) || jsonb_build_object(
           'invite_id', i.id,
           'from', (select nickname from profiles where id = i.from_user))
         order by i.created_at desc), '[]'::jsonb)
  from invites i join matches m on m.id = i.match_id
  where i.to_user = auth.uid() and i.status = 'pending'
    and m.canceled_at is null and m.ended_at is null
$$;

-- ---------------------------------------------------------------------
-- 9. Permissões das funções
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.nickname_available(text) to anon;

-- Tempo real: o app escuta mudanças nestas tabelas para atualizar a Home.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.match_players, public.matches, public.invites, public.friendships;
  end if;
end $$;
