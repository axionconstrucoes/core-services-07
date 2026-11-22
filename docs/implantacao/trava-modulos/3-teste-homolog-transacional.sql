-- TESTE DA TRAVA AMPLIADA — SOMENTE no acc-homolog (gtadbeaevxglrqkhcwfz). NUNCA no operacional.
-- Um único bloco DO que SEMPRE termina em erro proposital (TRAVA-TESTE-RESULTADO): tudo é desfeito (REVOKE, membros e
-- usuários temporários, qualquer escrita das RPCs liberadas). O resultado vem na mensagem do erro.
-- Cada chamada roda num sub-bloco (savepoint) com papel `authenticated` + request.jwt.claims (sub do perfil), como a API;
-- chamada bem-sucedida também é desfeita na hora (erro P0099), para que um perfil não altere o estado visto pelo seguinte.
-- Perfis: ADM (real, ADMINISTRADOR da obra TESTE) e TEMPORÁRIOS criados aqui: GES (GESTOR), GER (GERENTE), COL (COLABORADOR),
-- LEI (LEITURA), INA (COLABORADOR INATIVO), ADM2 (ADMINISTRADOR só da obra TESTE 2), SEM (sem vínculo).
do $$
declare
  c_teste  constant uuid := '723b7467-24e9-4401-80d3-3dbc6ee4d57e';  -- obra TESTE (homologação)
  c_teste2 constant uuid := '57463482-85bc-4474-8186-c4de5540f931';  -- obra TESTE 2 (homologação)
  c_adm    constant uuid := '02f1dc6d-1962-41f7-b910-1c1d1e1366c5';  -- ADMINISTRADOR real da obra TESTE
  c_ncr    constant uuid := 'f1996d9d-dc1f-495e-bcf0-756efc978eca';  -- RNC-0001 (INVESTIGACAO, v3)
  c_gar    constant uuid := 'c43809d8-a6b9-47c2-8b6a-38aaaa00646b';  -- GAR-0001 (EM_ANALISE, v3)
  c_ev_ncr constant uuid := '8f030e1c-e1e1-409d-83f0-7f454ff4f552';
  c_ev_gar constant uuid := 'b84402dd-ac0e-4746-9370-4e4631ec1f67';
  bloquear text[] := array[
    'quality_cost_register','quality_test_register','quality_inspection_register','quality_complaint_register','quality_recurrence_register','quality_requirement_register',
    'insurance_dossier_item_set','insurance_dossier_sync','bank_guarantee_register','bank_guarantee_update','other_guarantee_register','other_guarantee_update',
    'insurance_expected_subject_save','insurance_rcc_checklist_save',
    'project_competence_grant','project_competence_request_cancel','project_competence_request_create','project_competence_request_decide','project_competence_revalidate',
    'project_competence_revoke','project_competence_validator_accept','project_competence_validator_designate','project_competence_validator_revoke',
    'quality_ncr_update_fields','quality_evidence_revise','quality_capa_update_status','quality_verification_register','quality_consequence_register',
    'quality_warranty_survey_register','quality_warranty_maintenance_register','quality_warranty_repair_register','quality_warranty_case_update',
    'quality_warranty_acceptance_register','quality_warranty_acceptance_prove','quality_warranty_opinion_save'];
  perfis text[] := array['ADM','GES','GER','COL','LEI','INA','ADM2','SEM'];
  uids uuid[];
  liberadas text[] := array[
    'ncr_create|select public.quality_ncr_create(%L::uuid, ''[TRAVA-TESTE] RNC'', ''descricao de teste da trava'', ''MANUAL'', ''TRAVA-TESTE-%s'')',
    'warranty_create|select public.quality_warranty_create(%L::uuid, ''[TRAVA-TESTE] sistema'', ''defeito de teste da trava'', jsonb_build_object(''origin_type'',''MANUAL'',''origin_ref'',''TRAVA-TESTE-%s''))',
    'evidence_register|select public.quality_evidence_register(%L::uuid, ''DOCUMENTO'', ''TRAVA-TESTE-%s'', ''INDICIO'', ''FATO'', p_ncr_id => ''f1996d9d-dc1f-495e-bcf0-756efc978eca''::uuid)',
    'capa_register|select public.quality_capa_register(''f1996d9d-dc1f-495e-bcf0-756efc978eca''::uuid, null, ''CORRETIVA'', ''[TRAVA-TESTE] acao %2$s'') /* %1$s */',
    'ncr_CANCELADA|select public.quality_ncr_transition(''f1996d9d-dc1f-495e-bcf0-756efc978eca''::uuid, ''CANCELADA'', 3, ''justificativa de teste da trava %2$s'') /* %1$s */',
    'ncr_CONFIRMADA|select public.quality_ncr_transition(''f1996d9d-dc1f-495e-bcf0-756efc978eca''::uuid, ''CONFIRMADA'', 3, ''justificativa de teste da trava %2$s'', array[''8f030e1c-e1e1-409d-83f0-7f454ff4f552''::uuid]) /* %1$s */',
    'gar_COBERTA|select public.quality_warranty_transition(''c43809d8-a6b9-47c2-8b6a-38aaaa00646b''::uuid, ''COBERTA'', 3, ''justificativa de teste da trava %2$s'', array[''b84402dd-ac0e-4746-9370-4e4631ec1f67''::uuid]) /* %1$s */',
    'gar_CANCELADA|select public.quality_warranty_transition(''c43809d8-a6b9-47c2-8b6a-38aaaa00646b''::uuid, ''CANCELADA'', 3, ''justificativa de teste da trava %2$s'') /* %1$s */'];
  r record; i int; j int; uid uuid; tier text; call text; st text; msg text;
  n_trav int := 0; n_trav_42501 int := 0; trav_fora text := '';
  saida text := ''; linha text; nome text;
  grants_antes text; grants_depois text; matriz_antes text; matriz_depois text;
begin
  -- 0) Assinatura das funções da matriz (não podem mudar)
  select string_agg(p.proname || ':' || md5(p.prosrc) || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE'), ',' order by p.proname)
    into matriz_antes from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('acc_project_tier','quality_can_read','quality_can_register','quality_can_manage','insurance_access','has_project_permission','acc_int_require_competence','quality_state_event_competence_guard');

  -- 1) Perfis temporários (desfeitos no fim)
  uids := array[c_adm, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  for i in 2..8 loop
    insert into auth.users (id, email, aud, role, raw_user_meta_data)
    values (uids[i], 'trava-teste-' || lower(perfis[i]) || '-' || left(uids[i]::text, 8) || '@homolog.invalid', 'authenticated', 'authenticated',
            jsonb_build_object('name', '[TRAVA-TESTE] ' || perfis[i]));
  end loop;
  insert into public.project_memberships (project_id, user_id, permission, status) values
    (c_teste, uids[2], 'GESTOR', 'ACTIVE'), (c_teste, uids[3], 'GERENTE', 'ACTIVE'), (c_teste, uids[4], 'COLABORADOR', 'ACTIVE'),
    (c_teste, uids[5], 'LEITURA', 'ACTIVE'), (c_teste, uids[6], 'COLABORADOR', 'INACTIVE'), (c_teste2, uids[7], 'ADMINISTRADOR', 'ACTIVE');

  -- 2) Aplicar a trava ampliada (mesma lógica do 1-aplicar-trava.sql)
  for r in select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname = any(bloquear) loop
    execute format('revoke execute on function public.%I(%s) from authenticated, anon, public', r.proname, r.args);
    n_trav := n_trav + 1;
  end loop;
  if n_trav <> 35 then raise exception 'TESTE: esperadas 35 travadas, encontradas %', n_trav; end if;

  -- 3) Por perfil: nível, 35 travadas (args nulos) e 8 liberadas (args reais)
  for i in 1..8 loop
    uid := uids[i];
    -- nível na obra TESTE visto pela própria pessoa
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', uid::text, true);
      execute 'set local role authenticated';
      execute format('select public.acc_project_tier(%L::uuid)', c_teste) into tier;
      raise exception using errcode = 'P0099', message = tier;
    exception when others then
      tier := case when sqlstate = 'P0099' then sqlerrm else 'ERRO ' || sqlstate end;
    end;
    linha := perfis[i] || '[' || tier || ']';
    -- travadas
    for r in select p.proname, (select string_agg('null::' || format_type(t, null), ',' order by o) from unnest(p.proargtypes::oid[]) with ordinality u(t, o)) nulos
               from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = any(bloquear) loop
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', uid::text, true);
        execute 'set local role authenticated';
        execute format('select public.%I(%s)', r.proname, coalesce(r.nulos, ''));
        raise exception using errcode = 'P0099', message = 'EXECUTOU';
      exception when others then st := sqlstate;
      end;
      if st = '42501' then n_trav_42501 := n_trav_42501 + 1; else trav_fora := trav_fora || perfis[i] || ':' || r.proname || '=' || st || ' '; end if;
    end loop;
    -- liberadas
    for j in 1..array_length(liberadas, 1) loop
      nome := split_part(liberadas[j], '|', 1);
      call := format(substr(liberadas[j], length(nome) + 2), c_teste, lower(perfis[i]));
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', uid::text, true);
        execute 'set local role authenticated';
        execute call;
        raise exception using errcode = 'P0099', message = 'OK';
      exception when others then st := sqlstate; msg := sqlerrm;
      end;
      linha := linha || ' ' || nome || '=' || case when st = 'P0099' then 'OK' else st || ':' || left(split_part(msg, ':', 1), 28) end;
    end loop;
    saida := saida || linha || E'\n';
  end loop;

  -- 4) A matriz não mudou e as liberadas seguem com EXECUTE
  select string_agg(p.proname || ':' || md5(p.prosrc) || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE'), ',' order by p.proname)
    into matriz_depois from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('acc_project_tier','quality_can_read','quality_can_register','quality_can_manage','insurance_access','has_project_permission','acc_int_require_competence','quality_state_event_competence_guard');
  select count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text into grants_depois
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('quality_ncr_create','quality_ncr_transition','quality_evidence_register','quality_capa_register','quality_warranty_create','quality_warranty_transition');

  raise exception 'TRAVA-TESTE-RESULTADO (desfeito): travadas 42501 = %/% | fora do esperado: [%] | matriz inalterada = % | liberadas com EXECUTE = %/6%',
    n_trav_42501, n_trav * 8, trav_fora, (matriz_antes = matriz_depois), grants_depois, E'\n' || saida;
end $$;
