-- REVERSAO do congelamento de escrita no banco (fim da janela). Remove o gatilho-guarda e DEVOLVE exatamente os privilegios guardados
-- por 1-aplicar-congelamento.sql (identidade de ACL comprovada em scripts/test-congelamento-realpg.mjs). Nenhum dado e tocado.
-- Idempotente: sem o estado guardado, apenas garante a remocao dos gatilhos/funcao. Uma transacao.
do $$
declare
  r record;
  v_gatilhos int := 0;
  v_restaurados int := 0;
begin
  -- 1) remover gatilhos-guarda
  for r in select t.tgrelid::regclass::text as rel from pg_trigger t where t.tgname = 'acc_congelamento_guard' and not t.tgisinternal loop
    execute format('drop trigger acc_congelamento_guard on %s', r.rel);
    v_gatilhos := v_gatilhos + 1;
  end loop;
  drop function if exists public.acc_congelamento_guard();

  -- 2) devolver privilegios guardados
  if to_regclass('public.acc_congelamento_estado') is not null then
    for r in select * from public.acc_congelamento_estado order by kind, relname, attname loop
      if to_regclass(format('public.%I', r.relname)) is null then continue; end if;  -- objeto removido durante a janela
      if r.kind = 'TABLE_PRIV' then
        execute format('grant %s on table public.%I to %s%s', r.privilege, r.relname, case when r.grantee = 'public' then 'public' else quote_ident(r.grantee) end,
                       case when r.grantable then ' with grant option' else '' end);
      else
        execute format('grant %s (%I) on table public.%I to %s%s', r.privilege, r.attname, r.relname, case when r.grantee = 'public' then 'public' else quote_ident(r.grantee) end,
                       case when r.grantable then ' with grant option' else '' end);
      end if;
      v_restaurados := v_restaurados + 1;
    end loop;
    drop table public.acc_congelamento_estado;
  else
    raise notice 'REVERSAO: sem estado guardado (congelamento nao aplicado ou ja revertido); so a remocao de gatilhos foi garantida.';
  end if;

  -- 3) auditoria (1 linha por obra)
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  select pr.id, 'SYSTEM', null, null, 'WRITE_FREEZE_REVERTED', 'Database', 'congelamento-janela-fase2',
         'Congelamento de escrita revertido: ' || v_gatilhos || ' gatilhos removidos; ' || v_restaurados || ' privilegios devolvidos.'
    from public.projects pr;
end $$;

-- CONFERENCIA (esperado: gatilhos_restantes = 0, estado_guardado = false)
select (select count(*) from pg_trigger where tgname = 'acc_congelamento_guard' and not tgisinternal) as gatilhos_restantes_esperado_0,
       to_regclass('public.acc_congelamento_estado') is not null as estado_guardado_esperado_false;
