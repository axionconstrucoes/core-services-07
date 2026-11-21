-- VERIFICAÇÃO P0 (SOMENTE LEITURA): proteção de public.record_risk_alert_action(uuid,text,jsonb).
-- Pode ser executada no ensaio local e (por quem tem autorização) no banco operacional, entre ondas de aplicação.
-- Esperado: ok = true. Nada é alterado. O corpo é comparado SEM caracteres CR (o mesmo texto aplicado de arquivo CRLF ou LF).
select
  p.oid is not null as existe,
  md5(replace(p.prosrc, chr(13), '')) as corpo_md5_sem_cr,
  md5(p.prosrc) as corpo_md5_bruto,
  md5(replace(p.prosrc, chr(13), '')) = '930f6d75898793479b418950b0053bd9' as corpo_protegido,
  p.prosecdef as security_definer,
  coalesce(p.proconfig, '{}') @> array['search_path=""'] as search_path_vazio,
  not has_function_privilege('anon', p.oid, 'execute') as anon_sem_execute,
  not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_sem_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_executa,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_executa,
  (md5(replace(p.prosrc, chr(13), '')) = '930f6d75898793479b418950b0053bd9'
    and p.prosecdef
    and coalesce(p.proconfig, '{}') @> array['search_path=""']
    and not has_function_privilege('anon', p.oid, 'execute')
    and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    and has_function_privilege('authenticated', p.oid, 'execute')
    and has_function_privilege('service_role', p.oid, 'execute')) as ok
from (select to_regprocedure('public.record_risk_alert_action(uuid,text,jsonb)') as oid) f
left join pg_proc p on p.oid = f.oid;
