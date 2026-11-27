-- Rollback de 20261213100000_scheduler_status_for_project.sql.
-- Remove apenas a função de leitura public.acc_scheduler_status_for_project(uuid).
-- Não há dados a guardar: a função é somente leitura e não possui estado. Depois do rollback a tela de
-- Integrações e o Dashboard mostram "estado do agendador indisponível" (nunca OPERACIONAL). Idempotente.
begin;
drop function if exists public.acc_scheduler_status_for_project(uuid);
commit;
