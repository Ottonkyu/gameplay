-- 0007 · Mensagens do chat viram notificação no celular (push).
--
-- * Cada mensagem nova avisa quem está na conversa (menos quem mandou).
-- * Várias mensagens da mesma conversa se juntam num aviso só até a pessoa abrir o chat.
-- * Abriu a conversa (mark_chat_read), o aviso some.
-- * Fica fora do sininho: a central de avisos e o contador ignoram 'chat_message'.
-- * Liga/desliga no Perfil: notif_prefs.mensagens (padrão: ligado).

-- tipo novo de notificação
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.notifications'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.notifications drop constraint %I', c);
  end loop;
end $$;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'invite', 'match_soon', 'match_started', 'match_edited', 'match_canceled', 'kicked',
  'player_joined', 'player_left', 'squad_full', 'invite_accepted', 'invite_declined',
  'friend_request', 'friend_accepted', 'friend_public_match', 'chat_message'));

create or replace function public.notif_group(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind in ('invite', 'match_soon', 'match_started', 'match_edited', 'match_canceled', 'kicked') then 'partidas'
    when p_kind in ('player_joined', 'player_left', 'squad_full', 'invite_accepted', 'invite_declined') then 'squad'
    when p_kind in ('friend_request', 'friend_accepted') then 'amigos'
    when p_kind = 'chat_message' then 'mensagens'
    else 'amigos_partidas'
  end
$$;

-- preferência nova (ligada para todo mundo)
alter table public.profiles alter column notif_prefs set default
  '{"partidas": true, "squad": true, "amigos": true, "amigos_partidas": false, "mensagens": true, "som": "levelup"}';
update public.profiles set notif_prefs = notif_prefs || '{"mensagens": true}' where not (notif_prefs ? 'mensagens');

-- Cria ou atualiza o aviso de chat de um jogador (um por conversa enquanto não ler).
create or replace function public.notify_chat(p_user uuid, x public.messages)
returns void language plpgsql security definer set search_path = public as $$
declare
  u profiles;
  sender text;
  m matches;
  existing notifications;
  n int := 1;
  t text;
  b text;
  link text;
  preview text := case when char_length(x.body) > 120 then left(x.body, 117) || '...' else x.body end;
begin
  if p_user is null or p_user = x.sender_id then return; end if;
  select * into u from profiles where id = p_user;
  if not found or not coalesce((u.notif_prefs ->> 'mensagens')::boolean, true) then return; end if;
  select nickname into sender from profiles where id = x.sender_id;

  if x.match_id is not null then
    select * into m from matches where id = x.match_id;
    select * into existing from notifications
     where user_id = p_user and kind = 'chat_message' and match_id = x.match_id and read_at is null
     order by id desc limit 1 for update;
    t := m.name || ' · SQUAD';
    link := '/chat/match/' || x.match_id;
  else
    select * into existing from notifications
     where user_id = p_user and kind = 'chat_message' and match_id is null and actor_id = x.sender_id and read_at is null
     order by id desc limit 1 for update;
    t := sender;
    link := '/chat/friend/' || x.sender_id;
  end if;
  if existing.id is not null then n := existing.count + 1; end if;

  b := case when x.match_id is not null then sender || ': ' || preview else preview end;
  if n > 1 then b := n || ' MENSAGENS NOVAS · ' || case when x.match_id is not null then b else sender || ': ' || preview end; end if;

  if existing.id is not null then
    update notifications set count = n, body = b, title = t, updated_at = now() where id = existing.id;
  else
    insert into notifications (user_id, kind, match_id, actor_id, title, body, url)
    values (p_user, 'chat_message', x.match_id, x.sender_id, t, b, link);
  end if;
end $$;

-- Gatilho: toda mensagem nova avisa a conversa.
create or replace function public.on_message_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.match_id is not null then
    for r in select user_id from match_players
             where match_id = new.match_id and left_at is null and not kicked and user_id <> new.sender_id
    loop
      perform notify_chat(r.user_id, new);
    end loop;
  else
    perform notify_chat(new.recipient_id, new);
  end if;
  return new;
end $$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages for each row execute function public.on_message_created();

-- Abriu a conversa: marca como lida e apaga o aviso dela.
create or replace function public.mark_chat_read(p_key text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := require_user();
begin
  insert into chat_reads (user_id, chat_key, read_at) values (uid, p_key, now())
    on conflict (user_id, chat_key) do update set read_at = excluded.read_at;
  if p_key like 'm:%' then
    delete from notifications where user_id = uid and kind = 'chat_message' and match_id = substr(p_key, 3)::bigint;
  elsif p_key like 'd:%' then
    delete from notifications where user_id = uid and kind = 'chat_message' and match_id is null and actor_id = substr(p_key, 3)::uuid;
  end if;
end $$;

-- A central de avisos (sininho) não mostra mensagens de chat.
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
    where n.user_id = auth.uid() and n.kind <> 'chat_message'
    order by n.updated_at desc
    limit p_limit
  ) t
$$;

create or replace function public.unread_notifications()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from notifications where user_id = auth.uid() and read_at is null and kind <> 'chat_message'
$$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and kind <> 'chat_message' and (p_ids is null or id = any (p_ids))
$$;

-- Internas: só o banco chama.
revoke execute on function public.notify_chat(uuid, public.messages) from public, anon, authenticated;
revoke execute on function public.on_message_created() from public, anon, authenticated;
