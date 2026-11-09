-- 0006 · Chat do squad (por partida) e conversa entre amigos.
--
-- Regras:
--   * Chat do squad nasce com a partida. Só quem está no squad lê e escreve.
--   * Fecha (só leitura) quando o anfitrião finaliza ou cancela a partida.
--   * Quem saiu continua lendo; quem foi removido pelo anfitrião perde o acesso.
--   * Conversa direta só entre amigos. Se a amizade acabar, a conversa fica só leitura.
--   * Leitura pelas tabelas (RLS); escrita só pelas funções abaixo.

create table if not exists public.messages (
  id           bigint generated always as identity primary key,
  match_id     bigint references public.matches (id) on delete cascade,
  recipient_id uuid   references public.profiles (id) on delete cascade,
  sender_id    uuid   not null references public.profiles (id) on delete cascade,
  body         text   not null check (char_length(btrim(body)) between 1 and 300),
  created_at   timestamptz not null default now(),
  -- ou é do squad (match_id) ou é direta (recipient_id), nunca as duas
  constraint messages_target_check check ((match_id is null) <> (recipient_id is null)),
  constraint messages_not_self check (recipient_id is null or recipient_id <> sender_id)
);
create index if not exists messages_match_idx on public.messages (match_id, created_at) where match_id is not null;
create index if not exists messages_dm_idx on public.messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at) where recipient_id is not null;

-- Até onde cada jogador já leu cada conversa ('m:<id da partida>' ou 'd:<id do amigo>').
create table if not exists public.chat_reads (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  chat_key text not null check (chat_key ~ '^(m:[0-9]+|d:[0-9a-f-]{36})$'),
  read_at  timestamptz not null default now(),
  primary key (user_id, chat_key)
);

alter table public.messages enable row level security;
alter table public.chat_reads enable row level security;

-- Pode ler o chat do squad: estava no squad e não foi removido.
create or replace function public.can_read_match_chat(p_match bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from match_players
                 where match_id = p_match and user_id = auth.uid() and not kicked)
$$;

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated using (
  (match_id is not null and public.can_read_match_chat(match_id))
  or (recipient_id is not null and auth.uid() in (sender_id, recipient_id))
);
drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads for select to authenticated using (user_id = auth.uid());

grant select on public.messages, public.chat_reads to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- escrita

create or replace function public.clean_body(p_body text)
returns text language plpgsql immutable as $$
declare b text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
begin
  if b = '' then perform fail('ESCREVA UMA MENSAGEM.'); end if;
  if char_length(b) > 300 then perform fail('A MENSAGEM PODE TER ATÉ 300 CARACTERES.'); end if;
  return b;
end $$;

-- Freio simples contra spam: no máximo 10 mensagens em 10 segundos.
create or replace function public.chat_rate_limit(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from messages where sender_id = p_user and created_at > now() - interval '10 seconds') >= 10 then
    perform fail('CALMA! ESPERE UNS SEGUNDOS PARA MANDAR MAIS.');
  end if;
end $$;

create or replace function public.send_match_message(p_match bigint, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  m matches;
  new_id bigint;
begin
  select * into m from matches where id = p_match;
  if not found then perform fail('PARTIDA NÃO ENCONTRADA.'); end if;
  if not exists (select 1 from match_players where match_id = p_match and user_id = uid and left_at is null) then
    perform fail('SÓ QUEM ESTÁ NO SQUAD PODE MANDAR MENSAGEM.');
  end if;
  if match_status(m) in ('finalizada', 'cancelada') then
    perform fail('O CHAT DESTA PARTIDA FOI ENCERRADO.');
  end if;
  perform chat_rate_limit(uid);
  insert into messages (match_id, sender_id, body) values (p_match, uid, clean_body(p_body)) returning id into new_id;
  insert into chat_reads (user_id, chat_key, read_at) values (uid, 'm:' || p_match, now())
    on conflict (user_id, chat_key) do update set read_at = excluded.read_at;
  return new_id;
end $$;

create or replace function public.send_direct_message(p_to uuid, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  new_id bigint;
begin
  if p_to = uid then perform fail('VOCÊ NÃO PODE MANDAR MENSAGEM PARA SI MESMO.'); end if;
  if not are_friends(uid, p_to) then perform fail('SÓ DÁ PARA CONVERSAR COM AMIGOS.'); end if;
  perform chat_rate_limit(uid);
  insert into messages (recipient_id, sender_id, body) values (p_to, uid, clean_body(p_body)) returning id into new_id;
  insert into chat_reads (user_id, chat_key, read_at) values (uid, 'd:' || p_to, now())
    on conflict (user_id, chat_key) do update set read_at = excluded.read_at;
  return new_id;
end $$;

create or replace function public.mark_chat_read(p_key text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := require_user();
begin
  insert into chat_reads (user_id, chat_key, read_at) values (uid, p_key, now())
    on conflict (user_id, chat_key) do update set read_at = excluded.read_at;
end $$;

-- ---------------------------------------------------------------- leitura

create or replace function public.chat_message_json(x public.messages)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', x.id, 'body', x.body, 'created_at', x.created_at, 'mine', x.sender_id = auth.uid(),
    'sender', (select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar', p.avatar) from profiles p where p.id = x.sender_id))
$$;

-- Chat do squad: dados da partida, quem está, se ainda dá para escrever e as mensagens.
create or replace function public.match_chat(p_match bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := require_user();
  m matches;
  me match_players;
  st text;
begin
  select * into m from matches where id = p_match;
  if not found then perform fail('PARTIDA NÃO ENCONTRADA.'); end if;
  select * into me from match_players where match_id = p_match and user_id = uid;
  if not found or me.kicked then perform fail('VOCÊ NÃO TEM ACESSO A ESTE CHAT.'); end if;
  st := match_status(m);
  return jsonb_build_object(
    'match', match_card(m),
    'created_at', m.created_at, 'ended_at', m.ended_at, 'canceled_at', m.canceled_at,
    'my_role', case when m.host_id = uid then 'host' when me.left_at is not null then 'left' else 'member' end,
    'closed', st in ('finalizada', 'cancelada'),
    'can_send', me.left_at is null and st not in ('finalizada', 'cancelada'),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'is_host', p.id = m.host_id) order by mp.joined_at)
                         from match_players mp join profiles p on p.id = mp.user_id
                         where mp.match_id = p_match and mp.left_at is null), '[]'),
    'messages', coalesce((select jsonb_agg(chat_message_json(x) order by x.created_at, x.id)
                          from (select * from messages where match_id = p_match order by created_at desc, id desc limit 300) x), '[]'));
end $$;

-- Conversa com um amigo.
create or replace function public.direct_chat(p_friend uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := require_user();
begin
  if not exists (select 1 from profiles where id = p_friend) then perform fail('JOGADOR NÃO ENCONTRADO.'); end if;
  return jsonb_build_object(
    'friend', (select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar', p.avatar,
                 'online', coalesce(p.last_seen_at > now() - interval '2 minutes', false)) from profiles p where p.id = p_friend),
    'can_send', are_friends(uid, p_friend),
    'messages', coalesce((select jsonb_agg(chat_message_json(x) order by x.created_at, x.id)
                          from (select * from messages
                                where recipient_id is not null
                                  and ((sender_id = uid and recipient_id = p_friend) or (sender_id = p_friend and recipient_id = uid))
                                order by created_at desc, id desc limit 300) x), '[]'));
end $$;

-- Central de chat: squads das partidas ativas + conversas com amigos.
create or replace function public.my_chats()
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  squads as (
    select m.id
    from matches m join match_players mp on mp.match_id = m.id, me
    where mp.user_id = me.uid and mp.left_at is null and match_status(m) not in ('finalizada', 'cancelada')
  ),
  squad_rows as (
    select jsonb_build_object(
      'kind', 'match', 'key', 'm:' || m.id, 'match', match_card(m),
      'last', (select chat_message_json(x) from messages x where x.match_id = m.id order by x.created_at desc, x.id desc limit 1),
      'unread', (select count(*) from messages x
                 where x.match_id = m.id and x.sender_id <> me.uid
                   and x.created_at > coalesce((select read_at from chat_reads r where r.user_id = me.uid and r.chat_key = 'm:' || m.id), '-infinity'))
    ) as j,
    coalesce((select max(x.created_at) from messages x where x.match_id = m.id), m.created_at) as sort_at
    from squads s join matches m on m.id = s.id, me
  ),
  partners as (
    select distinct case when x.sender_id = me.uid then x.recipient_id else x.sender_id end as other
    from messages x, me where x.recipient_id is not null and me.uid in (x.sender_id, x.recipient_id)
  ),
  dm_rows as (
    select jsonb_build_object(
      'kind', 'direct', 'key', 'd:' || p.id,
      'friend', jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'online', coalesce(p.last_seen_at > now() - interval '2 minutes', false)),
      'is_friend', are_friends(me.uid, p.id),
      'last', (select chat_message_json(x) from messages x
               where x.recipient_id is not null and ((x.sender_id = me.uid and x.recipient_id = p.id) or (x.sender_id = p.id and x.recipient_id = me.uid))
               order by x.created_at desc, x.id desc limit 1),
      'unread', (select count(*) from messages x
                 where x.sender_id = p.id and x.recipient_id = me.uid
                   and x.created_at > coalesce((select read_at from chat_reads r where r.user_id = me.uid and r.chat_key = 'd:' || p.id), '-infinity'))
    ) as j,
    (select max(x.created_at) from messages x where x.recipient_id is not null and ((x.sender_id = me.uid and x.recipient_id = p.id) or (x.sender_id = p.id and x.recipient_id = me.uid))) as sort_at
    from partners pa join profiles p on p.id = pa.other, me
  )
  select jsonb_build_object(
    'squads', coalesce((select jsonb_agg(j order by sort_at desc) from squad_rows), '[]'),
    'direct', coalesce((select jsonb_agg(j order by sort_at desc) from dm_rows), '[]'))
$$;

-- Total de mensagens não lidas (badge do atalho CHAT na Home).
create or replace function public.unread_chats()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum((c ->> 'unread')::int), 0)::int
  from (select jsonb_array_elements(j -> 'squads') c from (select my_chats() j) a
        union all
        select jsonb_array_elements(j -> 'direct') from (select my_chats() j) b) t
$$;

-- Permissões: funções novas nascem com EXECUTE para PUBLIC; deixa só o que o app usa.
revoke execute on function public.can_read_match_chat(bigint) from public, anon;
revoke execute on function public.clean_body(text) from public, anon;
revoke execute on function public.chat_rate_limit(uuid) from public, anon;
revoke execute on function public.chat_message_json(public.messages) from public, anon;
revoke execute on function public.send_match_message(bigint, text) from public, anon;
revoke execute on function public.send_direct_message(uuid, text) from public, anon;
revoke execute on function public.mark_chat_read(text) from public, anon;
revoke execute on function public.match_chat(bigint) from public, anon;
revoke execute on function public.direct_chat(uuid) from public, anon;
revoke execute on function public.my_chats() from public, anon;
revoke execute on function public.unread_chats() from public, anon;
-- a política de leitura usa can_read_match_chat, então quem lê precisa poder executá-la
grant execute on function public.can_read_match_chat(bigint) to authenticated;
grant execute on function public.send_match_message(bigint, text), public.send_direct_message(uuid, text),
  public.mark_chat_read(text), public.match_chat(bigint), public.direct_chat(uuid),
  public.my_chats(), public.unread_chats() to authenticated;
