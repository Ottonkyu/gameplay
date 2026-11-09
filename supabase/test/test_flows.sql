-- Testes dos fluxos do GamePlay (rodar com: npm run db:test).
-- Cada bloco age como um usuário (auth.uid) e confere o resultado.
\set ON_ERROR_STOP on
\o /dev/null
set client_min_messages = warning;

-- Ajudantes de teste ----------------------------------------------------
create schema t;
grant usage on schema t to anon, authenticated;
create function t.as_user(nick text) returns void language plpgsql security definer as $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where raw_user_meta_data->>'nickname' = nick), false);
end $$;
create function t.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALHOU: %', what; end if;
  raise notice 'ok - %', what;
end $$;
create function t.fails(stmt text, pattern text, what text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then raise notice 'ok - % (%)', what, sqlerrm; return; end if;
    raise exception 'FALHOU: % -> erro inesperado: %', what, sqlerrm;
  end;
  raise exception 'FALHOU: % -> deveria ter dado erro', what;
end $$;
grant execute on all functions in schema t to anon, authenticated;
set client_min_messages = notice;

-- Cadastro (o trigger cria o perfil) -------------------------------------
insert into auth.users (email, raw_user_meta_data) values
  ('otton@x.com',  '{"nickname":"seu_nick","genres":["FPS","MOBA"]}'),
  ('neo@x.com',    '{"nickname":"NEOGAMER"}'),
  ('luna@x.com',   '{"nickname":"LUNA_K"}'),
  ('pixel@x.com',  '{"nickname":"PIXELMAGO"}'),
  ('kiki@x.com',   '{"nickname":"KIKI"}');
-- os testes usam o nick como no metadata original; normaliza o do primeiro
update auth.users set raw_user_meta_data = '{"nickname":"SEU_NICK"}' where email = 'otton@x.com';

select t.ok((select nickname from profiles p join auth.users u on u.id = p.id where u.email = 'otton@x.com') = 'SEU_NICK', 'nick salvo em maiúsculas');
select t.ok((select genres from profiles where nickname = 'SEU_NICK') = '{FPS,MOBA}', 'estilos do cadastro salvos');

set role anon;
select t.ok(abs(extract(epoch from server_now() - now())) < 1, 'server_now (anon) devolve a hora do servidor');
select t.ok(nickname_available('NOVO_NICK') and not nickname_available('neogamer') and not nickname_available('a'), 'nickname_available (anon)');
reset role;

set role authenticated;

-- RLS: perfil dos outros não aparece direto ------------------------------
select t.as_user('SEU_NICK');
select t.ok((select count(*) from profiles) = 1, 'RLS: só vejo meu próprio perfil');
select t.ok((select count(*) from profile_cards) = 5, 'profile_cards mostra nick/avatar de todos');
select t.fails($$insert into matches (host_id,name,category,game_id,platforms,visibility,max_players,starts_at) values (auth.uid(),'XXX','CASUAL','valorant','{PC}','publica',5,now()+interval '1 day')$$, 'permission denied', 'não dá para inserir partida direto na tabela');
select t.fails($$update profiles set nickname = 'HACK' where id = auth.uid()$$, 'permission denied', 'nick não pode ser alterado');
update profiles set bio = 'JOGO DE NOITE', visibility = 'amigos' where id = auth.uid();
select t.ok((select bio from profiles where id = auth.uid()) = 'JOGO DE NOITE', 'atualiza o próprio sobre');

-- Amigos ------------------------------------------------------------------
select t.ok(send_friend_request('neogamer') like 'PEDIDO ENVIADO%', 'envia pedido por nick');
select t.fails($$select send_friend_request('NEOGAMER')$$, 'JÁ ENVIOU', 'pedido duplicado');
select t.fails($$select send_friend_request('SEU_NICK')$$, 'É O SEU', 'pedido para si mesmo');
select t.fails($$select send_friend_request('NINGUEM')$$, 'NÃO ENCONTRADO', 'nick inexistente');
select t.as_user('NEOGAMER');
select t.fails($$select send_friend_request('SEU_NICK')$$, 'JÁ TE ENVIOU', 'pedido cruzado avisa para aceitar');
select respond_friend_request((select id from profile_cards where nickname = 'SEU_NICK'), true);
select t.as_user('SEU_NICK');
select t.ok(relation_with((select id from profile_cards where nickname = 'NEOGAMER')) = 'friend', 'amizade aceita');
select send_friend_request('KIKI');
select t.ok(jsonb_array_length(my_friends()) = 2, 'my_friends lista amigo + enviado');

-- Visibilidade do perfil --------------------------------------------------
select t.as_user('LUNA_K');
select t.ok((get_profile((select id from profile_cards where nickname = 'SEU_NICK')) ->> 'visible')::boolean = false, 'perfil SÓ AMIGOS escondido de quem não é amigo');
select t.ok(get_profile((select id from profile_cards where nickname = 'SEU_NICK')) -> 'bio' = 'null'::jsonb, 'sobre volta nulo quando escondido');
select t.as_user('NEOGAMER');
select t.ok((get_profile((select id from profile_cards where nickname = 'SEU_NICK')) ->> 'visible')::boolean, 'amigo vê o perfil SÓ AMIGOS');
select t.as_user('SEU_NICK');
update profiles set visibility = 'privada' where id = auth.uid();
select t.as_user('NEOGAMER');
select t.ok(not (get_profile((select id from profile_cards where nickname = 'SEU_NICK')) ->> 'visible')::boolean, 'perfil PRIVADO escondido até de amigo');

-- Criar partida -----------------------------------------------------------
select t.as_user('SEU_NICK');
select t.fails($$select create_match('LENDÁRIOS','RANQUEADA','league-of-legends','{PS}','privada', now()+interval '2 hours','')$$, 'NÃO ESTÁ DISPONÍVEL', 'plataforma que o jogo não tem');
select t.fails($$select create_match('LENDÁRIOS','RANQUEADA','league-of-legends','{PC}','privada', now()-interval '1 minute','')$$, 'JÁ PASSOU', 'horário no passado');
select create_match('lendários','RANQUEADA','league-of-legends','{PC}','privada', now()+interval '2 hours','subir de elo') as m1 \gset
select create_match('BORA QUEIMAR TUDO','CASUAL','apex-legends','{PC,PS}','publica', now()+interval '1 day','') as m2 \gset
select t.ok((get_match(:m1) ->> 'name') = 'LENDÁRIOS' and (get_match(:m1) ->> 'my_role') = 'host', 'cria partida e vira anfitrião');
select t.ok((get_match(:m1) ->> 'code') ~ '^GP-[A-Z0-9]{4}$', 'privada ganha código');
select t.ok((get_match(:m2) ->> 'code') is null, 'pública não tem código');
select t.ok((get_match(:m1) ->> 'max_players')::int = 5, 'vagas vêm do jogo (LoL = 5)');
select t.ok(jsonb_array_length(my_matches()) = 2, 'Home lista minhas 2 partidas');
select get_match(:m1) ->> 'code' as code1 \gset

-- Entrar por código / procurar squads -------------------------------------
select t.as_user('LUNA_K');
select t.fails($$select get_match($$ || :m1 || $$)$$, 'NÃO ENCONTRADA', 'não-membro não vê partida privada');
select t.ok((select count(*) from match_codes) = 0, 'RLS: não-membro não lê códigos');
select t.ok((preview_code(lower(:'code1')) ->> 'name') = 'LENDÁRIOS', 'preview do código (aceita minúsculas)');
select t.fails($$select preview_code('GP-ZZZZ')$$, 'NENHUMA SALA', 'código inexistente');
select t.fails($$select preview_code('XX')$$, 'INVÁLIDO', 'código mal formatado');
select join_by_code(:'code1');
select t.ok((get_match(:m1) ->> 'my_role') = 'member', 'entrou pelo código');
select t.fails($$select join_by_code('$$ || :'code1' || $$')$$, 'JÁ ESTÁ', 'entrar duas vezes');
select t.ok(jsonb_array_length(public_matches()) = 1, 'procurar squads mostra a pública');
select t.fails($$select join_match($$ || :m1 || $$)$$, 'PRIVADA', 'join_match em privada pede código');

-- Remover jogador (kick) --------------------------------------------------
select t.as_user('NEOGAMER');
select t.fails($$select kick_player($$ || :m1 || $$, auth.uid())$$, 'SÓ O ANFITRIÃO', 'visitante não remove');
select t.as_user('SEU_NICK');
select kick_player(:m1, (select id from profile_cards where nickname = 'LUNA_K'));
select t.ok((get_match(:m1) ->> 'filled')::int = 1, 'removido sai do squad');
select t.as_user('LUNA_K');
select t.fails($$select join_by_code('$$ || :'code1' || $$')$$, 'TE REMOVEU', 'removido não volta pelo código');
select t.ok(exists (select 1 from jsonb_array_elements(my_history()) h where h ->> 'result' = 'removido'), 'histórico mostra VOCÊ FOI REMOVIDO');

-- Convites ----------------------------------------------------------------
select t.as_user('SEU_NICK');
select t.ok(invite_by_nick(:m1, 'luna_k') like 'CONVITE ENVIADO%', 'anfitrião reconvida quem foi removido');
select t.ok(jsonb_array_length(matches_for_invite((select id from profile_cards where nickname = 'LUNA_K'))) = 2, 'partidas disponíveis para convidar');
select t.as_user('LUNA_K');
select t.ok(jsonb_array_length(my_invites()) = 1, 'convidado vê o convite');
select respond_invite((select (x ->> 'invite_id')::bigint from jsonb_array_elements(my_invites()) x limit 1), true);
select t.ok((get_match(:m1) ->> 'my_role') = 'member', 'aceitar convite entra mesmo depois de removido');

-- Sair da partida ---------------------------------------------------------
select leave_match(:m1);
select t.ok(exists (select 1 from jsonb_array_elements(my_history()) h where h ->> 'result' = 'saiu'), 'histórico mostra VOCÊ SAIU');
select t.ok(jsonb_array_length(my_matches()) = 0, 'partida saiu da Home de quem saiu');
select t.as_user('SEU_NICK');
select t.fails($$select leave_match($$ || :m1 || $$)$$, 'ANFITRIÃO NÃO SAI', 'anfitrião não pode sair');

-- Lotação -----------------------------------------------------------------
select create_match('DUELO','TREINO','street-fighter-6','{PS}','publica', now()+interval '3 hours','') as m3 \gset
select t.as_user('KIKI');
select join_match(:m3);
select t.as_user('PIXELMAGO');
select t.fails($$select join_match($$ || :m3 || $$)$$, 'LOTADA', 'sala lotada (SF6 = 2 vagas)');

-- Editar ------------------------------------------------------------------
select t.as_user('KIKI');
select t.fails($$select update_match($$ || :m3 || $$,'X1','TREINO','{PS}','publica', now()+interval '5 hours','')$$, 'SÓ O ANFITRIÃO', 'visitante não edita');
select t.as_user('SEU_NICK');
select update_match(:m2, 'NOVO NOME', 'CASUAL', '{PC}', 'privada', now()+interval '2 days', 'desc nova');
select t.ok((get_match(:m2) ->> 'name') = 'NOVO NOME' and (get_match(:m2) ->> 'code') is not null, 'edita e, ao virar privada, ganha código');

-- Cancelar / em andamento / encerrar --------------------------------------
select t.fails($$select cancel_match($$ || :m2 || $$, null)$$, 'MOTIVO', 'cancelar exige motivo');
select cancel_match(:m2, 'IMPREVISTO');
select t.ok(exists (select 1 from jsonb_array_elements(my_history()) h where h ->> 'result' = 'cancelada' and h ->> 'cancel_reason' = 'IMPREVISTO'), 'cancelada vai pro histórico com motivo');
reset role;
update matches set starts_at = now() - interval '25 minutes' where id = :m1;  -- simula o horário chegando
set role authenticated;
select t.as_user('SEU_NICK');
select t.ok((get_match(:m1) ->> 'status') = 'em_andamento', 'status vira EM ANDAMENTO no horário');
select t.ok((my_matches() -> 0 ->> 'status') = 'em_andamento', 'em andamento aparece primeiro na Home');
select t.fails($$select cancel_match($$ || :m1 || $$, 'IMPREVISTO')$$, 'ANTES DO INÍCIO', 'não cancela depois do início');
select t.fails($$select update_match($$ || :m1 || $$,'X1','TREINO','{PC}','publica', now()+interval '5 hours','')$$, 'NÃO DÁ MAIS PARA EDITAR', 'não edita depois do início');
select end_match(:m1);
select t.ok((get_match(:m1) ->> 'status') = 'finalizada', 'anfitrião encerra');
select t.ok(exists (select 1 from jsonb_array_elements(my_history()) h where h ->> 'result' = 'concluida'), 'finalizada vai pro histórico como concluída');
select t.ok(not exists (select 1 from jsonb_array_elements(my_matches()) x where (x ->> 'id')::bigint = :m1), 'finalizada some da Home');

reset role;
\o
\echo '=== TODOS OS TESTES PASSARAM ==='
