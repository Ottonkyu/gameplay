-- Hora oficial do servidor (sincronizada por NTP). O app usa para corrigir
-- a diferença do relógio do celular na tela (contagens e status ao vivo).
-- As regras do jogo já usam now() no próprio banco.
create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now() $$;

grant execute on function public.server_now() to anon, authenticated;
