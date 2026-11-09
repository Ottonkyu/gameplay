-- Testes do chat (rodam depois dos outros, no mesmo banco).
\set ON_ERROR_STOP on
\o /dev/null
set client_min_messages = notice;
set role authenticated;

-- Partida pública do SEU_NICK com NEOGAMER, LUNA_K e KIKI no squad
select t.as_user('SEU_NICK');
select create_match('CHAT TESTE', 'CASUAL', 'valorant', '{PC}', 'publica', now() + interval '1 day', '') as mc \gset
select t.as_user('NEOGAMER');  select join_match(:mc);
select t.as_user('LUNA_K');    select join_match(:mc);
select t.as_user('KIKI');      select join_match(:mc);

-- Chat do squad --------------------------------------------------------------
select t.as_user('SEU_NICK');
select t.ok((match_chat(:mc) ->> 'can_send')::boolean, 'chat do squad já existe ao criar a partida');
select send_match_message(:mc, '  bora   squad  ');
select t.ok((select body from messages where match_id = :mc order by id desc limit 1) = 'bora squad', 'mensagem é limpa (espaços)');
select t.as_user('NEOGAMER');
select send_match_message(:mc, 'meu nick é NEO#BR1');
select t.ok(jsonb_array_length(match_chat(:mc) -> 'messages') = 2, 'membro lê o chat');
select t.as_user('SEU_NICK');
select t.ok(((my_chats() -> 'squads') -> 0 ->> 'unread')::int = 1, 'conta não lidas do squad');
select t.ok(unread_chats() >= 1, 'badge de não lidas');
select mark_chat_read('m:' || :mc);
select t.fails($$select send_match_message($$ || :mc || $$, '   ')$$, 'ESCREVA', 'mensagem vazia recusada');
select t.ok(((my_chats() -> 'squads') -> 0 ->> 'unread')::int = 0, 'marca como lido');

select t.as_user('PIXELMAGO');
select t.fails($$select send_match_message($$ || :mc || $$, 'oi')$$, 'SÓ QUEM ESTÁ NO SQUAD', 'quem não é do squad não escreve');
select t.fails($$select match_chat($$ || :mc || $$)$$, 'NÃO TEM ACESSO', 'quem não é do squad não abre o chat');
select t.ok((select count(*) from messages where match_id = :mc) = 0, 'RLS: quem não é do squad não lê a tabela');

-- Removido perde o acesso; quem saiu só lê
select t.as_user('SEU_NICK');
select kick_player(:mc, t.uid('LUNA_K'));
select t.as_user('LUNA_K');
select t.fails($$select match_chat($$ || :mc || $$)$$, 'NÃO TEM ACESSO', 'removido não abre mais o chat');
select t.ok((select count(*) from messages where match_id = :mc) = 0, 'RLS: removido não lê a tabela');
select t.as_user('KIKI');
select leave_match(:mc);
select t.ok(not (match_chat(:mc) ->> 'can_send')::boolean and jsonb_array_length(match_chat(:mc) -> 'messages') = 2, 'quem saiu lê, mas não escreve');
select t.fails($$select send_match_message($$ || :mc || $$, 'oi')$$, 'SÓ QUEM ESTÁ NO SQUAD', 'quem saiu não escreve');

-- Fecha quando o anfitrião encerra
reset role;
update matches set starts_at = now() - interval '5 minutes' where id = :mc;
set role authenticated;
select t.as_user('NEOGAMER');
select send_match_message(:mc, 'começou!');
select t.as_user('SEU_NICK');
select end_match(:mc);
select t.ok((match_chat(:mc) ->> 'closed')::boolean, 'chat fecha quando o anfitrião encerra');
select t.fails($$select send_match_message($$ || :mc || $$, 'oi')$$, 'ENCERRADO', 'chat encerrado não aceita mensagem');
select t.ok(jsonb_array_length(match_chat(:mc) -> 'messages') = 3, 'mensagens ficam salvas para o histórico');
select t.ok(not exists (select 1 from jsonb_array_elements(my_chats() -> 'squads') c where (c -> 'match' ->> 'id')::bigint = :mc), 'partida encerrada sai da central de chat');

-- Conversa entre amigos ----------------------------------------------------------
select t.as_user('SEU_NICK');
select send_direct_message(t.uid('NEOGAMER'), 'bora sexta?');
select t.as_user('NEOGAMER');
select t.ok(((my_chats() -> 'direct') -> 0 ->> 'unread')::int = 1, 'amigo recebe e conta não lida');
select send_direct_message(t.uid('SEU_NICK'), 'bora!');
select t.ok(jsonb_array_length(direct_chat(t.uid('SEU_NICK')) -> 'messages') = 2, 'conversa direta nos dois sentidos');
select t.as_user('PIXELMAGO');
select t.fails($$select send_direct_message(t.uid('SEU_NICK'), 'oi')$$, 'SÓ DÁ PARA CONVERSAR COM AMIGOS', 'não amigo não manda mensagem');
select t.ok((select count(*) from messages where recipient_id is not null) = 0, 'RLS: terceiro não lê conversa dos outros');
select t.ok(jsonb_array_length(direct_chat(t.uid('SEU_NICK')) -> 'messages') = 0, 'terceiro não vê a conversa');

-- Segurança ----------------------------------------------------------------------------
select t.fails($$insert into messages (match_id, sender_id, body) values (1, auth.uid(), 'hack')$$, 'permission denied', 'não dá para inserir direto na tabela');
select t.fails($$select chat_rate_limit(auth.uid())$$, 'permission denied', 'auxiliar do chat bloqueada');
select t.as_user('SEU_NICK');
select t.fails($$select send_direct_message(t.uid('NEOGAMER'), repeat('a', 301))$$, '300 CARACTERES', 'mensagem longa recusada');

-- Push das mensagens (0007) ----------------------------------------------------------
reset role;
create function t.chatn(nick text) returns setof public.notifications language sql security definer as $$
  select * from public.notifications where user_id = t.uid(nick) and kind = 'chat_message' order by id
$$;
grant execute on function t.chatn(text) to authenticated;
set role authenticated;
select t.as_user('SEU_NICK');
select create_match('PUSH TESTE', 'CASUAL', 'valorant', '{PC}', 'publica', now() + interval '2 days', '') as mp \gset
select t.as_user('NEOGAMER');  select join_match(:mp);
select t.as_user('KIKI');      select join_match(:mp);
select t.as_user('NEOGAMER');
select send_match_message(:mp, 'meu nick é NEO#BR1');
select t.ok((select count(*) from t.chatn('SEU_NICK') where match_id = :mp) = 1 and (select count(*) from t.chatn('KIKI') where match_id = :mp) = 1, 'mensagem do squad avisa os outros membros');
select t.ok(not exists (select 1 from t.chatn('NEOGAMER') where match_id = :mp), 'quem mandou não recebe aviso');
select t.ok((select body from t.chatn('SEU_NICK') where match_id = :mp) = 'NEOGAMER: meu nick é NEO#BR1', 'texto do aviso do squad');
select t.ok((select url from t.chatn('SEU_NICK') where match_id = :mp) = '/chat/match/' || :mp, 'tocar no aviso abre o chat do squad');
select send_match_message(:mp, 'bora?');
select t.ok((select count || '|' || body from t.chatn('SEU_NICK') where match_id = :mp) = '2|2 MENSAGENS NOVAS · NEOGAMER: bora?', 'mensagens seguidas se juntam num aviso só');
select t.as_user('KIKI');
update profiles set notif_prefs = notif_prefs || '{"mensagens": false}' where id = auth.uid();
select mark_chat_read('m:' || :mp);
select t.ok(not exists (select 1 from t.chatn('KIKI') where match_id = :mp), 'abrir o chat apaga o aviso');
select t.as_user('NEOGAMER');
select send_match_message(:mp, 'alguém?');
select t.ok(not exists (select 1 from t.chatn('KIKI') where match_id = :mp), 'opção MENSAGENS desligada não avisa');
select t.as_user('SEU_NICK');
select t.ok(not exists (select 1 from jsonb_array_elements(my_notifications()) n where n ->> 'kind' = 'chat_message'), 'mensagens não entram no sininho');
select t.ok(unread_notifications() = (select count(*)::int from notifications where user_id = auth.uid() and read_at is null and kind <> 'chat_message'), 'contador do sininho ignora mensagens');
select send_direct_message(t.uid('NEOGAMER'), 'tá on?');
select t.ok((select title || '|' || body || '|' || url from t.chatn('NEOGAMER') where match_id is null order by id desc limit 1) = 'SEU_NICK|2 MENSAGENS NOVAS · SEU_NICK: tá on?|/chat/friend/' || t.uid('SEU_NICK'), 'conversa direta avisa o amigo (e junta com a anterior não lida)');
select t.as_user('NEOGAMER');
select mark_chat_read('d:' || t.uid('SEU_NICK'));
select t.ok(not exists (select 1 from t.chatn('NEOGAMER') where match_id is null), 'abrir a conversa apaga o aviso do amigo');
select t.fails($$select notify_chat(auth.uid(), null::messages)$$, 'permission denied', 'notify_chat não pode ser chamada pela API');

reset role;
\o
\echo '=== TESTES DO CHAT PASSARAM ==='
