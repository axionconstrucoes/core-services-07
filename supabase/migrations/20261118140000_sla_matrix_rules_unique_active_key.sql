-- NÃO APLICAR sem decisão explícita do responsável pelo projeto.
--
-- Prevenção de duplicidade na Matriz de SLA (sla_matrix_rules).
--
-- Problema: o índice único sla_matrix_rules_project_id_risk_level_area_key
-- (project_id, risk_level, area) NÃO impede duas regras GERAIS (area IS NULL)
-- para o mesmo projeto/risco, porque no Postgres NULLs são distintos em
-- índices únicos. Foi assim que a WEG ficou com duas regras gerais ativas para
-- CRITICAL e duas para HIGH (22/09/2026).
--
-- Esta migration cria um índice único PARCIAL só sobre as regras ATIVAS,
-- tratando area NULL como valor (NULLS NOT DISTINCT, Postgres 15+).
-- Linhas inativas (histórico) continuam permitidas em qualquer quantidade.
--
-- Segura para aplicar antes da limpeza: se ainda existirem duplicatas ativas
-- o índice NÃO é criado (só um aviso), nenhuma linha é alterada ou apagada.
-- A limpeza das duplicatas é decisão humana separada (desativar, nunca apagar).

do $$
begin
  if exists (
    select 1
    from public.sla_matrix_rules
    where active
    group by project_id, risk_level, area
    having count(*) > 1
  ) then
    raise notice 'sla_matrix_rules: há regras ativas duplicadas; índice único não criado. Resolva as duplicatas (desativando) e reaplique.';
  else
    create unique index if not exists sla_matrix_rules_active_key_unique
      on public.sla_matrix_rules (project_id, risk_level, area) nulls not distinct
      where active;
  end if;
end
$$;
