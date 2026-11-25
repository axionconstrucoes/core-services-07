-- ============================================================
-- 20261126100000_p0_gate_record_risk_alert_action.sql
--
-- PORTÃO P0 (compatibilidade, Fase 4/C). NÃO redefine nenhuma função: apenas CONFERE e REAFIRMA a proteção de
-- public.record_risk_alert_action(uuid,text,jsonb) ao final das ondas de implantação.
--
-- Por que existe: as migrations 20261120130000 e 20261120151000 redefinem a função com corpos ANTERIORES ao hotfix
-- 20261121090000 (protegem-se com uma guarda por md5, mas a guarda compara o corpo BRUTO e uma aplicação com finais de linha
-- diferentes mudaria o md5 bruto). Em vez de confiar na sequência, esta migration FALHA (e a transação inteira é desfeita)
-- se, ao final de uma onda, o corpo não for o protegido, e reafirma a ACL (revoke de PUBLIC/anon; grant authenticated e
-- service_role). Não altera o corpo da função, prazos, SLAs, dados nem outras funções.
--
-- Corpo protegido de referência: md5 SEM caracteres CR = 930f6d75898793479b418950b0053bd9 (hotfix 20261121090000 =
-- 20261121101000). Idempotente: reexecutar apenas reconfere.
-- ============================================================

do $p0gate$
declare
  v_oid oid := to_regprocedure('public.record_risk_alert_action(uuid,text,jsonb)');
  v_md5 text;
begin
  if v_oid is null then
    raise exception 'P0_GATE: public.record_risk_alert_action(uuid,text,jsonb) não existe';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_md5 from pg_proc p where p.oid = v_oid;
  if v_md5 is distinct from '930f6d75898793479b418950b0053bd9' then
    raise exception 'P0_GATE: corpo de record_risk_alert_action NÃO é o protegido (md5 sem CR = %, esperado 930f6d75898793479b418950b0053bd9). Nada foi alterado; investigue antes de prosseguir.', v_md5;
  end if;
  if not (select p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""'] from pg_proc p where p.oid = v_oid) then
    raise exception 'P0_GATE: record_risk_alert_action sem SECURITY DEFINER ou sem search_path vazio';
  end if;

  revoke all on function public.record_risk_alert_action(uuid, text, jsonb) from public, anon;
  grant execute on function public.record_risk_alert_action(uuid, text, jsonb) to authenticated, service_role;

  if has_function_privilege('anon', v_oid, 'execute')
     or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where p.oid = v_oid and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'P0_GATE: anon/PUBLIC ainda executam record_risk_alert_action';
  end if;
end
$p0gate$;
