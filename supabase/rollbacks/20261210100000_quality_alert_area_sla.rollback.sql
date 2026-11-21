-- ROLLBACK (manual, NÃO é migration) de 20261210100000_quality_alert_area_sla.sql.
-- Recusa-se a voltar se já existir QUALIDADE em sla_area_responsibles, sla_matrix_rules, sla_actions ou risk_alert_cases
-- (evidência/rastreabilidade: nada é apagado aqui). Para reverter com dados QUALIDADE, exporte-os e decida com o responsável
-- (por exemplo reclassificar para ENGENHARIA, como era antes da Fase 6) antes de reexecutar.
begin;
do $$
declare
  t text;
  v_name text;
  v_def text;
begin
  if exists (select 1 from public.sla_area_responsibles where area = 'QUALIDADE')
     or exists (select 1 from public.sla_matrix_rules where area = 'QUALIDADE' and updated_at <> created_at) -- regra QUALIDADE editada depois do seed = decisao humana
     or exists (select 1 from public.sla_actions where area = 'QUALIDADE')
     or exists (select 1 from public.risk_alert_cases where area = 'QUALIDADE') then
    raise exception 'ROLLBACK_BLOCKED: existem registros com área QUALIDADE; nada foi alterado';
  end if;

  -- regras QUALIDADE semeadas pela migration e nunca editadas (updated_at = created_at): configuracao reproduzivel, saem para o CHECK voltar
  delete from public.sla_matrix_rules where area = 'QUALIDADE' and updated_at = created_at;

  foreach t in array array['sla_area_responsibles', 'sla_matrix_rules', 'sla_actions', 'risk_alert_cases'] loop
    v_name := null;
    select c.conname, pg_get_constraintdef(c.oid)
      into v_name, v_def
      from pg_constraint c
     where c.conrelid = format('public.%I', t)::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%''QUALIDADE''%'
       and pg_get_constraintdef(c.oid) like '%area%'
     limit 1;
    if v_name is null then
      continue;
    end if;
    execute format('alter table public.%I drop constraint %I', t, v_name);
    execute format(
      'alter table public.%I add constraint %I %s',
      t, v_name, replace(v_def, '''ESG_SSMA''::text, ''QUALIDADE''::text', '''ESG_SSMA''::text')
    );
  end loop;
end
$$;
commit;
