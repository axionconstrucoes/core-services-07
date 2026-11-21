-- ROLLBACK (manual, NAO e migration) de 20261122300000_quality_analyst_expert_id.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare
  c record;
  f record;
  v_def text;
begin
  -- (a) CHECKs que ganharam 'quality-analyst': remove o valor; se existir linha que o use, o ALTER falha e a transacao inteira e desfeita (recusa)
  for c in
    select con.conrelid::regclass as tbl, con.conname, pg_get_constraintdef(con.oid) as def
      from pg_constraint con join pg_namespace n on n.oid = con.connamespace
     where n.nspname = 'public' and con.contype = 'c'
       and (pg_get_constraintdef(con.oid) like '%''engineering-director''::text, ''quality-analyst''::text%' or pg_get_constraintdef(con.oid) like '%''engineering-director'', ''quality-analyst''%')
  loop
    v_def := replace(replace(c.def, '''engineering-director''::text, ''quality-analyst''::text', '''engineering-director''::text'), '''engineering-director'', ''quality-analyst''', '''engineering-director''');
    begin
      execute format('alter table %s drop constraint %I', c.tbl, c.conname);
      execute format('alter table %s add constraint %I %s', c.tbl, c.conname, v_def);
    exception when check_violation then
      raise exception 'ROLLBACK_BLOCKED: % contem registros com expert quality-analyst (evidencia); nada foi alterado', c.tbl;
    end;
  end loop;
  -- (b) corpos de funcao que ganharam 'quality-analyst' junto de 'engineering-director'
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc like '%''engineering-director'', ''quality-analyst''%'
       and p.proname <> 'record_risk_alert_action'
  loop
    v_def := pg_get_functiondef(f.oid);
    v_def := replace(v_def, '''engineering-director'', ''quality-analyst''', '''engineering-director''');
    execute v_def;
  end loop;
end $$;
commit;
