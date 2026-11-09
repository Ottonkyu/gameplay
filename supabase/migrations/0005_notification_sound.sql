-- Som das notificações: escolhido no Perfil e usado pela Edge Function send-push.
-- Valores: 'levelup' (padrão), 'bip', 'power' ou 'mudo'.
alter table public.profiles
  alter column notif_prefs set default
    '{"partidas": true, "squad": true, "amigos": true, "amigos_partidas": false, "som": "levelup"}';

update public.profiles
   set notif_prefs = notif_prefs || '{"som": "levelup"}'
 where not (notif_prefs ? 'som');

alter table public.profiles add constraint profiles_notif_sound_check
  check (coalesce(notif_prefs ->> 'som', 'levelup') in ('levelup', 'bip', 'power', 'mudo'));

-- A Edge Function lê só esta coluna do perfil.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select (id, notif_prefs) on public.profiles to service_role;
  end if;
end $$;
