-- Testes das notificações (rodam depois de test_flows.sql, no mesmo banco).
\set ON_ERROR_STOP on
\o /dev/null
set client_min_messages = notice;

create function t.uid(nick text) returns uuid language sql security definer as $$
  select id from public.profiles where nickname = nick
$$;
-- quantas notificações de um tipo um jogador tem
create function t.n(nick text, k text) returns int language sql security definer as $$
  select count(*)::int from public.notifications where user_id = t.uid(nick) and kind = k
$$;
create function t.last_body(nick text, k text) returns text language sql security definer as $$
  select body from public.notifications where user_id = t.uid(nick) and kind = k order by id desc limit 1
$$;
create function t.nm(nick text, k text, m bigint) returns int language sql security definer as $$
  select count(*)::int from public.notifications where user_id = t.uid(nick) and kind = k and match_id = m
$$;
grant execute on all functions in schema t to authenticated;

set role authenticated;

-- Amizade ---------------------------------------------------------------
select t.as_user('LUNA_K');
select send_friend_request('PIXELMAGO');
select t.ok(t.n('PIXELMAGO', 'friend_request') = 1, 'pedido de amizade avisa o destinatário');
select t.ok(t.last_body('PIXELMAGO', 'friend_request') = 'LUNA_K QUER SER SEU AMIGO.', 'texto do pedido de amizade');
select t.as_user('PIXELMAGO');
select respond_friend_request(t.uid('LUNA_K'), true);
select t.ok(t.n('LUNA_K', 'friend_accepted') = 1, 'pedido aceito avisa quem pediu');

-- Partida pública de amigo (desligado por padrão) -------------------------
select t.as_user('SEU_NICK');
select create_match('NOTIF A', 'CASUAL', 'valorant', '{PC}', 'publica', now() + interval '2 days', '') as ma \gset
select t.ok(t.n('NEOGAMER', 'friend_public_match') = 0, '"partidas de amigos" vem desligado');
select t.as_user('NEOGAMER');
update profiles set notif_prefs = notif_prefs || '{"amigos_partidas": true}' where id = auth.uid();
select t.as_user('SEU_NICK');
select create_match('NOTIF B', 'CASUAL', 'valorant', '{PC}', 'publica', now() + interval '3 days', '') as mb \gset
select t.ok(t.n('NEOGAMER', 'friend_public_match') = 1, 'amigo com a opção ligada recebe partida pública');

-- Convite, fuso de quem recebe e recusa ------------------------------------
select t.as_user('KIKI');
select touch('America/Manaus');
select t.as_user('SEU_NICK');
select invite_player(:ma, t.uid('KIKI'));
select t.ok(t.nm('KIKI', 'invite', :ma) = 1, 'convite avisa o convidado');
reset role;
select t.ok(t.last_body('KIKI', 'invite') like '%' || notif_when((select starts_at from matches where id = :ma), 'America/Manaus'),
            'horário do convite no fuso de quem recebe (Manaus)');
set role authenticated;
select t.as_user('KIKI');
select respond_invite((select (x ->> 'invite_id')::bigint from jsonb_array_elements(my_invites()) x where (x ->> 'id')::bigint = :ma), false);
select t.ok(t.nm('SEU_NICK', 'invite_declined', :ma) = 1, 'recusar convite avisa quem convidou');

-- Entrou no squad: agrupamento ----------------------------------------------
select t.as_user('NEOGAMER');
select join_match(:ma);
select t.as_user('LUNA_K');
select join_match(:ma);
select t.ok(t.nm('SEU_NICK', 'player_joined', :ma) = 1, 'entradas na mesma partida viram 1 notificação');
select t.ok(t.last_body('SEU_NICK', 'player_joined') = '2 JOGADORES ENTRARAM EM NOTIF A.', 'texto agrupado com contador');

-- Preferência desligada ------------------------------------------------------
select t.as_user('SEU_NICK');
update profiles set notif_prefs = notif_prefs || '{"squad": false}' where id = auth.uid();
select t.as_user('PIXELMAGO');
select join_match(:ma);
select t.ok(t.last_body('SEU_NICK', 'player_joined') = '2 JOGADORES ENTRARAM EM NOTIF A.', 'grupo "squad" desligado não avisa');
select t.as_user('SEU_NICK');
update profiles set notif_prefs = notif_prefs || '{"squad": true}' where id = auth.uid();

-- Editar horário -------------------------------------------------------------
select update_match(:ma, 'NOTIF A', 'CASUAL', '{PC}', 'publica', now() + interval '4 days', '');
select t.ok(t.nm('NEOGAMER', 'match_edited', :ma) = 1 and t.nm('LUNA_K', 'match_edited', :ma) = 1, 'mudar o horário avisa o squad');
select t.ok(t.nm('SEU_NICK', 'match_edited', :ma) = 0, 'anfitrião não recebe o próprio aviso');
select update_match(:ma, 'NOVO NOME', 'CASUAL', '{PC}', 'publica', (select starts_at from matches where id = :ma), '');
select t.ok(t.nm('NEOGAMER', 'match_edited', :ma) = 1, 'mudar só o nome não avisa');

-- Remover e sair -------------------------------------------------------------
select kick_player(:ma, t.uid('LUNA_K'));
select t.ok(t.nm('LUNA_K', 'kicked', :ma) = 1, 'removido é avisado');
select t.as_user('NEOGAMER');
select leave_match(:ma);
select t.ok(t.nm('SEU_NICK', 'player_left', :ma) = 1, 'saída avisa o anfitrião');

-- Squad completo e cancelamento -----------------------------------------------
select t.as_user('SEU_NICK');
select create_match('DUPLA', 'TREINO', 'street-fighter-6', '{PS}', 'publica', now() + interval '1 day', '') as mc \gset
select t.as_user('KIKI');
select join_match(:mc);
select t.ok(t.nm('SEU_NICK', 'squad_full', :mc) = 1, 'squad completo avisa o anfitrião');
select t.as_user('SEU_NICK');
select cancel_match(:mc, 'IMPREVISTO');
select t.ok(t.last_body('KIKI', 'match_canceled') = 'DUPLA FOI CANCELADA · MOTIVO: IMPREVISTO', 'cancelamento avisa o squad com motivo');

-- Lembretes -----------------------------------------------------------------
select create_match('LEMBRETE', 'CASUAL', 'fortnite', '{PC}', 'publica', now() + interval '20 minutes', '') as md \gset
select t.as_user('NEOGAMER');
select join_match(:md);
select touch();
select t.ok(t.nm('SEU_NICK', 'match_soon', :md) = 1 and t.nm('NEOGAMER', 'match_soon', :md) = 1, '"começa em breve" para todo o squad');
select touch();
select t.ok(t.nm('NEOGAMER', 'match_soon', :md) = 1, 'lembrete não repete');
reset role;
update matches set starts_at = now() - interval '1 minute' where id = :md;
set role authenticated;
select t.as_user('SEU_NICK');
select touch();
select t.ok(t.nm('SEU_NICK', 'match_started', :md) = 1 and t.nm('NEOGAMER', 'match_started', :md) = 1, '"começou" para todo o squad');

-- Central -------------------------------------------------------------------
select t.ok(unread_notifications() > 0, 'contador de não lidas');
select t.ok(jsonb_array_length(my_notifications()) = unread_notifications(), 'central lista as notificações');
select t.ok((my_notifications() -> 0 ->> 'title') is not null, 'item da central tem título');
select mark_notifications_read(array[(my_notifications() -> 0 ->> 'id')::bigint]);
select t.ok(jsonb_array_length(my_notifications()) - unread_notifications() = 1, 'marca uma como lida');
select mark_notifications_read();
select t.ok(unread_notifications() = 0, 'marca todas como lidas');
select t.ok((select count(*) from notifications) = (select count(*) from notifications where user_id = auth.uid()), 'RLS: só vejo as minhas');

-- Push token e segurança -------------------------------------------------------
select register_push_token('ExponentPushToken[abc123]', 'android');
select t.fails($$select register_push_token('qualquer-coisa', 'android')$$, 'INVÁLIDO', 'token inválido recusado');
select t.fails($$select notify(auth.uid(), 'kicked', null, null)$$, 'permission denied', 'notify não pode ser chamada pela API');
select t.fails($$select run_match_reminders()$$, 'permission denied', 'lembretes não podem ser chamados pela API');
select t.fails($$select lock_match(1)$$, 'permission denied', 'auxiliar interna bloqueada');

reset role;
-- Som das notificações (0005) ------------------------------------------------
select t.ok((select bool_and(notif_prefs ->> 'som' = 'levelup') from profiles), 'todo perfil tem som (padrão LEVEL UP)');
update profiles set notif_prefs = notif_prefs || '{"som": "bip"}' where nickname = 'SEU_NICK';
select t.ok((select notif_prefs ->> 'som' from profiles where nickname = 'SEU_NICK') = 'bip', 'troca o som');
select t.fails($$update profiles set notif_prefs = notif_prefs || '{"som": "buzina"}' where nickname = 'SEU_NICK'$$, 'profiles_notif_sound_check', 'som inexistente recusado');
\o
\echo '=== TESTES DE NOTIFICAÇÕES PASSARAM ==='
