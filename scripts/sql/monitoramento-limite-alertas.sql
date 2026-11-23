-- Monitoramento do governador de alertas (doc 35). SOMENTE LEITURA: nenhuma instrução altera dados ou schema.
-- Fonte: audit_log_entries (ações ALERT_GOVERNOR_ADMITTED / ALERT_GOVERNOR_RELEASED / ALERT_GOVERNOR_SUPPRESSED).
-- Admissão LÍQUIDA = ADMITTED sem RELEASED de mesmo entity_id (cota devolvida quando o e-mail comprovadamente não saiu).
-- Cada consulta começa com a linha "-- @query <id>" (usada pelo teste scripts/test-alert-send-governor-sql.mjs).

-- @query G1 envios admitidos por hora, projeto, fonte e tipo (48 h)
select date_trunc('hour', a.occurred_at) as hora,
       a.project_id,
       a.detail::jsonb ->> 'source' as fonte,
       a.detail::jsonb ->> 'type' as tipo,
       count(*) as admitidos
  from public.audit_log_entries a
 where a.action = 'ALERT_GOVERNOR_ADMITTED'
   and a.entity_type = 'ALERT_SEND'
   and a.occurred_at > now() - interval '48 hours'
   and not exists (
     select 1 from public.audit_log_entries r
      where r.action = 'ALERT_GOVERNOR_RELEASED' and r.entity_type = 'ALERT_SEND' and r.entity_id = a.entity_id)
 group by 1, 2, 3, 4
 order by 1 desc, admitidos desc;

-- @query G2 envios suprimidos por motivo, fonte e tipo (24 h)
select s.detail::jsonb ->> 'reason' as motivo,
       s.detail::jsonb ->> 'source' as fonte,
       s.detail::jsonb ->> 'type' as tipo,
       count(*) as suprimidos,
       max(s.occurred_at) as ultimo
  from public.audit_log_entries s
 where s.action = 'ALERT_GOVERNOR_SUPPRESSED'
   and s.entity_type = 'ALERT_SEND_SUPPRESSED'
   and s.occurred_at > now() - interval '24 hours'
 group by 1, 2, 3
 order by suprimidos desc;

-- @query G3 cota devolvida (falha certa de envio ou limite excedido) por hora e motivo (24 h)
select date_trunc('hour', r.occurred_at) as hora,
       r.detail::jsonb ->> 'reason' as motivo,
       count(*) as devolvidos
  from public.audit_log_entries r
 where r.action = 'ALERT_GOVERNOR_RELEASED'
   and r.entity_type = 'ALERT_SEND'
   and r.occurred_at > now() - interval '24 hours'
 group by 1, 2
 order by 1 desc;

-- @query G4 duplicidade: mesma chave de evento admitida mais de uma vez de forma líquida (24 h) - esperado: nenhuma linha
select split_part(a.entity_id, '.', 1) as chave_hash,
       a.project_id,
       count(*) as admissoes
  from public.audit_log_entries a
 where a.action = 'ALERT_GOVERNOR_ADMITTED'
   and a.entity_type = 'ALERT_SEND'
   and a.occurred_at > now() - interval '24 hours'
   and not exists (
     select 1 from public.audit_log_entries r
      where r.action = 'ALERT_GOVERNOR_RELEASED' and r.entity_type = 'ALERT_SEND' and r.entity_id = a.entity_id)
 group by 1, 2
having count(*) > 1;

-- @query G5 uso corrente das janelas (compare com ACC_ALERT_MAX_PER_HOUR / ACC_ALERT_MAX_PER_DAY)
select count(*) filter (where a.occurred_at > now() - interval '60 minutes') as ultima_hora,
       count(*) filter (where a.occurred_at > now() - interval '24 hours') as ultimas_24h
  from public.audit_log_entries a
 where a.action = 'ALERT_GOVERNOR_ADMITTED'
   and a.entity_type = 'ALERT_SEND'
   and a.occurred_at > now() - interval '24 hours'
   and not exists (
     select 1 from public.audit_log_entries r
      where r.action = 'ALERT_GOVERNOR_RELEASED' and r.entity_type = 'ALERT_SEND' and r.entity_id = a.entity_id);
