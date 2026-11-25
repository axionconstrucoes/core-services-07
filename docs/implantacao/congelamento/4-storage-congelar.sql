-- CONGELAR gravacoes de usuarios no Supabase Storage durante a janela (uploads, alteracoes e exclusoes pelo navegador).
-- Politicas RESTRITIVAS (somam-se as permissivas com AND), bucket-agnosticas (cobrem TODOS os buckets): authenticated/anon nao gravam;
-- leitura e service_role nao sao afetados. Comprovado no acc-homolog (22/11/2026): ADMINISTRADOR gravava antes; depois, 42501 "violates row-level security policy".
-- Idempotente (drop if exists + create).
drop policy if exists acc_janela_congelamento_insert on storage.objects;
drop policy if exists acc_janela_congelamento_update on storage.objects;
drop policy if exists acc_janela_congelamento_delete on storage.objects;
create policy acc_janela_congelamento_insert on storage.objects as restrictive for insert to authenticated, anon with check (false);
create policy acc_janela_congelamento_update on storage.objects as restrictive for update to authenticated, anon using (false);
create policy acc_janela_congelamento_delete on storage.objects as restrictive for delete to authenticated, anon using (false);
select count(*) as politicas_de_congelamento_esperado_3 from pg_policies where schemaname = 'storage' and policyname like 'acc_janela_congelamento_%';
