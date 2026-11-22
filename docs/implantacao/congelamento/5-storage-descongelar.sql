-- DESCONGELAR o Storage ao final da janela (remove so as tres politicas restritivas da janela; as politicas do app nao sao tocadas).
drop policy if exists acc_janela_congelamento_insert on storage.objects;
drop policy if exists acc_janela_congelamento_update on storage.objects;
drop policy if exists acc_janela_congelamento_delete on storage.objects;
select count(*) as politicas_de_congelamento_esperado_0 from pg_policies where schemaname = 'storage' and policyname like 'acc_janela_congelamento_%';
