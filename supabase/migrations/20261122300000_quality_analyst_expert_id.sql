-- ============================================================
-- 20261122300000_quality_analyst_expert_id.sql
--
-- Frente E1 (Experts IA — Qualidade/Seguros, fase 1): aceita o novo Expert oficial "quality-analyst"
-- (Analista IA de Qualidade) em TODOS os pontos do banco que hoje validam o id do Expert por lista fechada
-- (registro de consumo de IA, auditoria de consulta, caso de risco, e-mails de alerta, consultas por e-mail
-- e as funções de reserva/auditoria). Sem esta migration, uma consulta roteada ao novo Expert seria recusada
-- com INVALID_EXPERT (falha fechada) — o roteamento no código já o prevê.
--
-- Mecânica: reescreve, de forma IDEMPOTENTE e sem copiar corpos de função (evita deriva), as listas que contêm
-- 'engineering-director' acrescentando 'quality-analyst' logo depois:
--   (a) CHECK constraints de tabelas do schema public (drop + add com a definição reescrita);
--   (b) funções do schema public cujo corpo contém a lista (create or replace a partir de pg_get_functiondef —
--       preserva SECURITY DEFINER, search_path, owner e grants).
-- Nada é apagado; nenhuma regra de limite, permissão, SLA ou escalonamento muda. Hotfix P0
-- (record_risk_alert_action) e migrations existentes permanecem INTACTOS (não contêm a lista).
-- ============================================================

do $$
declare
  c record;
  f record;
  v_def text;
begin
  -- (a) CHECK constraints
  for c in
    select con.conrelid::regclass as tbl, con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_namespace n on n.oid = con.connamespace
    where n.nspname = 'public'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%''engineering-director''%'
      and pg_get_constraintdef(con.oid) not like '%quality-analyst%'
  loop
    v_def := replace(c.def, '''engineering-director''::text', '''engineering-director''::text, ''quality-analyst''::text');
    if v_def = c.def then
      v_def := replace(c.def, '''engineering-director''', '''engineering-director'', ''quality-analyst''');
    end if;
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    execute format('alter table %s add constraint %I %s', c.tbl, c.conname, v_def);
  end loop;

  -- (b) funções
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc like '%''engineering-director''%'
      and p.prosrc not like '%quality-analyst%'
  loop
    v_def := pg_get_functiondef(f.oid);
    v_def := replace(v_def, '''engineering-director''', '''engineering-director'', ''quality-analyst''');
    execute v_def;
  end loop;
end
$$;
