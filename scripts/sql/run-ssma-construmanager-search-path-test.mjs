// Fluxos SSMA e Construmanager (funções SECURITY DEFINER com search_path = '') contra PostgreSQL REAL descartável.
//
// Cobre as 12 funções corrigidas por 20261030120000_close_ssma_construmanager_search_path_gaps.sql: cada uma é
// executada de verdade (papel `authenticated`, auth.uid() simulado), então qualquer referência não qualificada
// que sobrasse no corpo falharia aqui. Tudo roda em UMA transação que termina em ROLLBACK: nada permanece.
//
// SEGURANÇA DE AMBIENTE: só aceita container Docker local cujo nome começa com "supabase_db_acc-disposable-"
// e exige confirmação explícita. Nunca usa rede, DATABASE_URL, supabase link nem banco remoto.
//
// Uso:
//   ACC_SSMA_CM_TEST_DB_CONTAINER="supabase_db_acc-disposable-test-e2" \
//   ACC_SSMA_CM_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true \
//   node scripts/sql/run-ssma-construmanager-search-path-test.mjs
import { spawnSync } from "node:child_process";

const container = process.env.ACC_SSMA_CM_TEST_DB_CONTAINER;
if (!container || !/^supabase_db_acc-disposable-[a-z0-9-]{2,40}$/.test(container)) {
  console.error('Defina ACC_SSMA_CM_TEST_DB_CONTAINER com um container "supabase_db_acc-disposable-*".');
  process.exit(2);
}
if (process.env.ACC_SSMA_CM_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE !== "true") {
  console.error("Defina ACC_SSMA_CM_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true (banco descartável, tudo termina em ROLLBACK).");
  process.exit(2);
}

const U = {
  ana: "a0000000-0000-4000-8000-000000000001", // COLABORADOR, reporta
  bruno: "a0000000-0000-4000-8000-000000000002", // COLABORADOR, responsável pela ação corretiva
  plan: "a0000000-0000-4000-8000-000000000003", // área PLANEJAMENTO
  orc: "a0000000-0000-4000-8000-000000000004", // área ORÇAMENTO
  fora: "a0000000-0000-4000-8000-000000000005", // outra obra
  adm: "a0000000-0000-4000-8000-000000000006", // ADMINISTRADOR da obra 1
};
const P1 = "b0000000-0000-4000-8000-000000000001";
const P2 = "b0000000-0000-4000-8000-000000000002";
const REC = "c0000000-0000-4000-8000-000000000001";
const FOTO = "d0000000-0000-4000-8000-000000000001";
const FORM_FOTO = "d0000000-0000-4000-8000-000000000002";
const SHA = "a".repeat(64);

const as = (uid) =>
  `reset role;\nselect set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true), set_config('request.jwt.claim.sub', '${uid}', true);\nset local role authenticated;\n`;
const anon = `reset role;\nselect set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true);\nset local role authenticated;\n`;

// Bloco que deve FALHAR com a mensagem esperada (qualquer outra falha derruba a execução).
const mustFail = (label, stmt, expected) => `
do $t$ begin
  begin
    perform ${stmt};
    raise exception 'NAO_FALHOU: ${label}';
  exception when others then
    if sqlerrm like 'NAO_FALHOU:%' or sqlerrm not like '%${expected}%' then raise exception 'ERRO_INESPERADO em ${label}: %', sqlerrm; end if;
  end;
  raise notice 'OK   % (recusado com ${expected})', '${label}';
end $t$;
`;
const ok = (label, body) => `
do $t$ declare v uuid; n int; b boolean; begin
${body}
  raise notice 'OK   %', '${label}';
end $t$;
`;

const sql = `
\\set ON_ERROR_STOP on
\\set VERBOSITY terse
begin;
reset role;
insert into auth.users (id, email, aud, role) values
  ('${U.ana}','ana@exemplo.invalid','authenticated','authenticated'),
  ('${U.bruno}','bruno@exemplo.invalid','authenticated','authenticated'),
  ('${U.plan}','plan@exemplo.invalid','authenticated','authenticated'),
  ('${U.orc}','orc@exemplo.invalid','authenticated','authenticated'),
  ('${U.fora}','fora@exemplo.invalid','authenticated','authenticated'),
  ('${U.adm}','adm@exemplo.invalid','authenticated','authenticated');
insert into public.profiles (id, name, email) select id, split_part(email,'@',1), email from auth.users where id in ('${Object.values(U).join("','")}')
  on conflict (id) do update set name = excluded.name;
insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
  ('${P1}','TST-SSMA-1','Obra descartável 1','Cliente teste','Local','2026-01-01','2026-12-31'),
  ('${P2}','TST-SSMA-2','Obra descartável 2','Cliente teste','Local','2026-01-01','2026-12-31');
insert into public.project_memberships (project_id, user_id, permission, status, area) values
  ('${P1}','${U.ana}','COLABORADOR','ACTIVE',null),
  ('${P1}','${U.bruno}','COLABORADOR','ACTIVE',null),
  ('${P1}','${U.plan}','COLABORADOR','ACTIVE','PLANEJAMENTO'),
  ('${P1}','${U.orc}','COLABORADOR','ACTIVE','ORÇAMENTO'),
  ('${P1}','${U.adm}','ADMINISTRADOR','ACTIVE',null),
  ('${P2}','${U.fora}','ADMINISTRADOR','ACTIVE',null),
  ('${P2}','${U.bruno}','COLABORADOR','ACTIVE',null);
insert into storage.objects (bucket_id, name) values
  ('project-documents', '${P1}/ssma-registros/${REC}/${FOTO}-foto.jpg'),
  ('project-documents', '${P1}/ssma/e0000000-0000-4000-8000-000000000001/${FORM_FOTO}-foto.jpg');

select 'funções com search_path vazio: ' || count(*) from pg_proc
 where pronamespace = 'public'::regnamespace and prosecdef and proconfig @> array['search_path=""']
   and proname in ('create_ssma_form_submission','finalize_ssma_form_submission','register_ssma_submission_photo','authorize_discard_unregistered_ssma_photo','can_upload_ssma_photo_object','create_ssma_accident_submission','ssma_field_record_submit','ssma_field_record_register_photo','ssma_corrective_action_update','can_upload_ssma_field_photo_object','submit_construmanager_budget_response','submit_construmanager_version_impact_review');

-- ===== Registro de campo SSMA + ação corretiva =====
${as(U.ana)}
${ok("ssma_field_record_submit grava registro e abre ação corretiva", `
  v := public.ssma_field_record_submit('${U.ana}','${REC}','${P1}','OCORRENCIA','Condição de risco','Fio exposto no pavimento 2','Pavimento 2', now() - interval '1 hour', now() - interval '59 minutes','ALTA','${U.bruno}', current_date + 7);
  if v is distinct from '${REC}'::uuid then raise exception 'id inesperado %', v; end if;
  select count(*) into n from public.ssma_field_records where id = '${REC}' and reported_by_user_id = '${U.ana}';
  if n <> 1 then raise exception 'registro não gravado'; end if;
  select count(*) into n from public.ssma_corrective_actions where record_id = '${REC}' and status = 'ABERTA' and responsible_user_id = '${U.bruno}';
  if n <> 1 then raise exception 'ação corretiva não aberta'; end if;`)}
${ok("ssma_field_record_submit é idempotente no reenvio", `
  v := public.ssma_field_record_submit('${U.ana}','${REC}','${P1}','OCORRENCIA','Condição de risco','outro texto qualquer','Pavimento 2', now() - interval '1 hour', now() - interval '59 minutes','ALTA','${U.bruno}', current_date + 7);
  select count(*) into n from public.ssma_corrective_actions where record_id = '${REC}';
  if n <> 1 then raise exception 'duplicou ação'; end if;`)}
${ok("can_upload_ssma_field_photo_object: autor sim, caminho de outro registro não", `
  b := public.can_upload_ssma_field_photo_object('${P1}/ssma-registros/${REC}/${FOTO}-foto.jpg');
  if b is not true then raise exception 'autor deveria poder'; end if;
  b := public.can_upload_ssma_field_photo_object('${P1}/ssma-registros/c0000000-0000-4000-8000-0000000000ff/x-foto.jpg');
  if b is not false then raise exception 'registro inexistente deveria negar'; end if;`)}
${ok("ssma_field_record_register_photo registra a foto do registro", `
  v := public.ssma_field_record_register_photo('${U.ana}','${FOTO}','${REC}','REGISTRO','${P1}/ssma-registros/${REC}/${FOTO}-foto.jpg','foto.jpg','image/jpeg',1000,'${SHA}');
  select count(*) into n from public.ssma_field_record_photos where id = '${FOTO}';
  if n <> 1 then raise exception 'foto não registrada'; end if;`)}
${mustFail("troca de conta no registro (USER_MISMATCH)", `public.ssma_field_record_submit('${U.bruno}','c0000000-0000-4000-8000-0000000000aa','${P1}','OCORRENCIA','Condição de risco','Fio exposto no pavimento 2','Pavimento 2', now(), now(),'ALTA','${U.bruno}', current_date + 7)`, "USER_MISMATCH")}
${as(U.fora)}
${mustFail("membro de outra obra não registra (PROJECT_ACCESS_DENIED)", `public.ssma_field_record_submit('${U.fora}','c0000000-0000-4000-8000-0000000000ab','${P1}','OCORRENCIA','Condição de risco','Fio exposto no pavimento 2','Pavimento 2', now(), now(),'ALTA','${U.bruno}', current_date + 7)`, "PROJECT_ACCESS_DENIED")}
${anon}
${mustFail("sem sessão (AUTH_REQUIRED)", `public.ssma_field_record_submit('${U.ana}','c0000000-0000-4000-8000-0000000000ac','${P1}','OCORRENCIA','Condição de risco','Fio exposto no pavimento 2','Pavimento 2', now(), now(),'ALTA','${U.bruno}', current_date + 7)`, "AUTH_REQUIRED")}
${as(U.bruno)}
${ok("ssma_corrective_action_update: responsável move a ação para ANDAMENTO", `
  select id into v from public.ssma_corrective_actions where record_id = '${REC}';
  perform public.ssma_corrective_action_update(v, 'ANDAMENTO', 'Equipe isolou a área e abriu a ordem de serviço', null);
  select count(*) into n from public.ssma_corrective_actions where id = v and status = 'EM_ANDAMENTO';
  if n <> 1 then raise exception 'status não mudou'; end if;
  select count(*) into n from public.ssma_corrective_action_events where action_id = v and kind = 'ANDAMENTO';
  if n <> 1 then raise exception 'histórico ANDAMENTO ausente'; end if;`)}
`;

const sqlFull = sql + `
-- ===== Formulários SSMA (checklist, fotos, finalização, descarte) =====
${as(U.ana)}
${ok("create_ssma_form_submission cria submissão em UPLOADING", `
  v := public.create_ssma_form_submission('${P1}','dda',1,'DDA','01 - DIÁLOGO DIÁRIO DE SEGURANÇA - DDA (FOTOS)', now(), '{}'::jsonb, '{"DDA realizado":"FEITO","Registro dos participantes":"FEITO"}'::jsonb, null);
  select count(*) into n from public.ssma_form_submissions where id = v and status = 'UPLOADING' and technician_user_id = '${U.ana}';
  if n <> 1 then raise exception 'submissão não criada'; end if;
  perform set_config('acc.form_id', v::text, false);`)}
${mustFail("checklist adulterado (INVALID_CHECKLIST_DEFINITION)", `public.create_ssma_form_submission('${P1}','dda',1,'DDA','01 - DIÁLOGO DIÁRIO DE SEGURANÇA - DDA (FOTOS)', now(), '{}'::jsonb, '{"outro":"FEITO"}'::jsonb, null)`, "INVALID_CHECKLIST_DEFINITION")}
reset role;
insert into storage.objects (bucket_id, name)
  select 'project-documents', '${P1}/ssma/' || current_setting('acc.form_id') || '/${FORM_FOTO}-foto.jpg';
insert into storage.objects (bucket_id, name)
  select 'project-documents', '${P1}/ssma/' || current_setting('acc.form_id') || '/${FOTO}-descartar.jpg';
${as(U.ana)}
${ok("register_ssma_submission_photo registra a foto da submissão", `
  v := public.register_ssma_submission_photo('${FORM_FOTO}', current_setting('acc.form_id')::uuid, 'Foto antes', '${P1}/ssma/' || current_setting('acc.form_id') || '/${FORM_FOTO}-foto.jpg', 'foto.jpg', 'image/jpeg', 1000, '${SHA}');
  select count(*) into n from public.ssma_submission_photos where id = '${FORM_FOTO}';
  if n <> 1 then raise exception 'foto não registrada'; end if;`)}
${ok("authorize_discard_unregistered_ssma_photo autoriza só objeto não registrado do próprio envio (não apaga nada)", `
  b := public.authorize_discard_unregistered_ssma_photo(current_setting('acc.form_id')::uuid, '${P1}/ssma/' || current_setting('acc.form_id') || '/${FOTO}-descartar.jpg');
  if b is not true then raise exception 'deveria autorizar o objeto não registrado'; end if;
  b := public.authorize_discard_unregistered_ssma_photo(current_setting('acc.form_id')::uuid, '${P1}/ssma/' || current_setting('acc.form_id') || '/${FORM_FOTO}-foto.jpg');
  if b is not false then raise exception 'foto registrada não pode ser descartada'; end if;
  b := public.authorize_discard_unregistered_ssma_photo(current_setting('acc.form_id')::uuid, '${P1}/ssma/' || current_setting('acc.form_id') || '/inexistente.jpg');
  if b is not false then raise exception 'objeto inexistente não é autorizado'; end if;
  b := public.authorize_discard_unregistered_ssma_photo(current_setting('acc.form_id')::uuid, '${P2}/ssma/' || current_setting('acc.form_id') || '/${FOTO}-descartar.jpg');
  if b is not false then raise exception 'prefixo de outra obra não é autorizado'; end if;
  select count(*) into n from storage.objects where name = '${P1}/ssma/' || current_setting('acc.form_id') || '/${FOTO}-descartar.jpg';
  if n <> 1 then raise exception 'a função de autorização não pode apagar o objeto'; end if;`)}
${as(U.bruno)}
${ok("authorize_discard: outro membro não autoriza o envio alheio", `
  b := public.authorize_discard_unregistered_ssma_photo(current_setting('acc.form_id')::uuid, '${P1}/ssma/' || current_setting('acc.form_id') || '/${FOTO}-descartar.jpg');
  if b is not false then raise exception 'envio de outro técnico não pode ser descartado'; end if;`)}
${as(U.ana)}
${ok("can_upload_ssma_photo_object: técnico dono da submissão sim, outro membro não", `
  b := public.can_upload_ssma_photo_object('${P1}/ssma/' || current_setting('acc.form_id') || '/novo-foto.jpg');
  if b is not true then raise exception 'técnico deveria poder'; end if;`)}
${as(U.bruno)}
${ok("can_upload_ssma_photo_object nega para quem não é o técnico", `
  b := public.can_upload_ssma_photo_object('${P1}/ssma/' || current_setting('acc.form_id') || '/novo-foto.jpg');
  if b is not false then raise exception 'outro membro não deveria poder'; end if;`)}
${mustFail("finalize por outro usuário (SUBMISSION_ACCESS_DENIED)", `public.finalize_ssma_form_submission(current_setting('acc.form_id')::uuid)`, "SUBMISSION_ACCESS_DENIED")}
${as(U.ana)}
${ok("finalize_ssma_form_submission envia e registra auditoria", `
  v := public.finalize_ssma_form_submission(current_setting('acc.form_id')::uuid);
  select count(*) into n from public.ssma_form_submissions where id = v and status = 'SUBMITTED';
  if n <> 1 then raise exception 'não finalizou'; end if;
  select count(*) into n from public.audit_log_entries where entity_id = v::text and action = 'SSMA_FORM_SUBMITTED';
  if n <> 1 then raise exception 'auditoria ausente'; end if;`)}
${ok("create_ssma_accident_submission cria o formulário de acidente", `
  v := public.create_ssma_accident_submission('${P1}', now() - interval '2 hours',
    '{"afastamento":"Sem afastamento","funcionario":"Fulano de Tal","causa":"Queda de mesmo nível","remocaoEm":"Não houve remoção"}'::jsonb,
    '{"Atendimento inicial registrado":"FEITO","Comunicação interna conferida":"FEITO"}'::jsonb);
  select count(*) into n from public.ssma_form_submissions where id = v and technician_user_id = '${U.ana}';
  if n <> 1 then raise exception 'acidente não criado'; end if;`)}

-- ===== WhatsApp: telefone internacional + autorização do canal (cadastro de participantes) =====
${as(U.adm)}
${ok("set_person_whatsapp_contact: administrador cadastra telefone normalizado e autoriza o canal (autor e data registrados)", `
  perform public.set_person_whatsapp_contact('${P1}','${U.bruno}','+55 (27) 99999-0000', true);
  select count(*) into n from public.person_whatsapp_contacts where user_id='${U.bruno}' and phone_e164='+5527999990000' and channel_authorized and channel_authorized_by='${U.adm}' and channel_authorized_at is not null;
  if n <> 1 then raise exception 'contato não gravado como esperado'; end if;
  select count(*) into n from public.audit_log_entries where entity_id='${U.bruno}' and action in ('MEMBER_WHATSAPP_CONTACT_SET','MEMBER_WHATSAPP_CHANNEL_AUTHORIZED') and actor_user_id='${U.adm}';
  if n <> 2 then raise exception 'auditoria esperada (2), obtido %', n; end if;
  select count(*) into n from public.audit_log_entries where entity_id='${U.bruno}' and action like 'MEMBER_WHATSAPP%' and detail like '%5527999990000%';
  if n <> 0 then raise exception 'telefone completo vazou para a auditoria'; end if;`)}
${ok("prefixo 00 vira +, e reenviar o mesmo número já autorizado mantém quem/quando", `
  perform public.set_person_whatsapp_contact('${P1}','${U.bruno}','00 55 27 99999-0000', true);
  select count(*) into n from public.person_whatsapp_contacts where user_id='${U.bruno}' and phone_e164='+5527999990000' and channel_authorized_by='${U.adm}';
  if n <> 1 then raise exception 'normalização/preservação falhou'; end if;
  select count(*) into n from public.audit_log_entries where entity_id='${U.bruno}' and action='MEMBER_WHATSAPP_CHANNEL_AUTHORIZED';
  if n <> 1 then raise exception 'reenvio não pode gerar nova autorização'; end if;`)}
${ok("trocar o número sem reafirmar a autorização encerra a autorização (auditado como REVOGADA)", `
  perform public.set_person_whatsapp_contact('${P1}','${U.bruno}','+351 912 345 678', false);
  select count(*) into n from public.person_whatsapp_contacts where user_id='${U.bruno}' and phone_e164='+351912345678' and not channel_authorized and channel_authorized_at is null and channel_authorized_by is null;
  if n <> 1 then raise exception 'autorização deveria ter sido encerrada'; end if;
  select count(*) into n from public.audit_log_entries where entity_id='${U.bruno}' and action='MEMBER_WHATSAPP_CHANNEL_REVOKED';
  if n <> 1 then raise exception 'revogação não auditada'; end if;`)}
${mustFail("telefone sem formato internacional (INVALID_INTERNATIONAL_PHONE)", `public.set_person_whatsapp_contact('${P1}','${U.bruno}','27999990000', false)`, "INVALID_INTERNATIONAL_PHONE")}
${mustFail("autorizar sem telefone (PHONE_REQUIRED_FOR_AUTHORIZATION)", `public.set_person_whatsapp_contact('${P1}','${U.bruno}','', true)`, "PHONE_REQUIRED_FOR_AUTHORIZATION")}
${mustFail("membro de outra obra não recebe contato (MEMBER_NOT_ACTIVE)", `public.set_person_whatsapp_contact('${P1}','${U.fora}','+5527999990001', false)`, "MEMBER_NOT_ACTIVE")}
${as(U.ana)}
${mustFail("quem não é administrador não cadastra (ADMIN_REQUIRED)", `public.set_person_whatsapp_contact('${P1}','${U.ana}','+5527999990002', true)`, "ADMIN_REQUIRED")}
${ok("RLS: outro membro não lê o telefone alheio; escrita direta e log simulado são negados", `
  select count(*) into n from public.person_whatsapp_contacts;
  if n <> 0 then raise exception 'colega leu telefone alheio (%)', n; end if;
  begin
    insert into public.person_whatsapp_contacts (user_id,phone_e164,updated_by) values ('${U.ana}','+5527999990003','${U.ana}');
    raise exception 'NAO_FALHOU_insert';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.whatsapp_simulated_messages (project_id,source_type,source_id,escalation_level,risk_level,status,idempotency_key) values ('${P1}','SLA_ACTION','x','DIRETORIA','CRITICAL','SIMULATED','k-ana');
    raise exception 'NAO_FALHOU_insert_log';
  exception when insufficient_privilege then null; end;`)}
${as(U.bruno)}
${ok("o próprio participante lê o seu contato", `
  select count(*) into n from public.person_whatsapp_contacts where user_id='${U.bruno}';
  if n <> 1 then raise exception 'participante deveria ver o próprio contato'; end if;`)}
${as(U.adm)}
${ok("telefone vazio remove o contato e a autorização, com auditoria", `
  perform public.set_person_whatsapp_contact('${P1}','${U.bruno}','', false);
  select count(*) into n from public.person_whatsapp_contacts where user_id='${U.bruno}';
  if n <> 0 then raise exception 'contato não removido'; end if;
  select count(*) into n from public.audit_log_entries where entity_id='${U.bruno}' and action='MEMBER_WHATSAPP_CONTACT_REMOVED';
  if n <> 1 then raise exception 'remoção não auditada'; end if;`)}
reset role;
do $t$ begin
  if has_function_privilege('anon', 'public.set_person_whatsapp_contact(uuid,uuid,text,boolean)', 'execute') then raise exception 'anon executa set_person_whatsapp_contact'; end if;
  raise notice 'OK   anon não executa set_person_whatsapp_contact';
end $t$;

-- ===== WhatsApp: contato é da PESSOA (um só cadastro entre projetos); o vínculo só decide a elegibilidade =====
${as(U.adm)}
${ok("cadastro da pessoa: um único registro mesmo com vínculo em dois projetos", `
  perform public.set_person_whatsapp_contact('${P1}','${U.bruno}','+5527999990000', true);
  select count(*) into n from public.person_whatsapp_contacts where user_id='${U.bruno}';
  if n <> 1 then raise exception 'esperado 1 contato por pessoa, obtido %', n; end if;`)}
${as(U.fora)}
${ok("administrador de OUTRO projeto em que a pessoa também tem vínculo ativo lê e atualiza o MESMO cadastro (sem duplicar)", `
  select count(*) into n from public.person_whatsapp_contacts where user_id='${U.bruno}' and phone_e164='+5527999990000';
  if n <> 1 then raise exception 'admin do projeto 2 deveria ler o contato da pessoa'; end if;
  perform public.set_person_whatsapp_contact('${P2}','${U.bruno}','+5527999990000', true);
  select count(*) into n from public.person_whatsapp_contacts where user_id='${U.bruno}';
  if n <> 1 then raise exception 'duplicou o cadastro por projeto (%)', n; end if;
  select count(*) into n from public.audit_log_entries where project_id='${P2}' and entity_id='${U.bruno}' and action='MEMBER_WHATSAPP_CONTACT_SET';
  if n <> 1 then raise exception 'auditoria deve ficar no projeto 2'; end if;`)}
${mustFail("administrador do projeto 2 não cadastra quem não tem vínculo com ele (MEMBER_NOT_ACTIVE)", `public.set_person_whatsapp_contact('${P2}','${U.ana}','+5527999990009', false)`, "MEMBER_NOT_ACTIVE")}
${ok("pessoa sem vínculo com o projeto do administrador: contato invisível", `
  perform public.set_person_whatsapp_contact('${P2}','${U.fora}','+4930901820', false);`)}
${as(U.adm)}
${ok("administrador do projeto 1 não lê o contato de pessoa sem vínculo com a obra dele", `
  select count(*) into n from public.person_whatsapp_contacts where user_id='${U.fora}';
  if n <> 0 then raise exception 'vazamento entre projetos'; end if;`)}
reset role;
-- Elegibilidade resolvida no momento do envio (service_role): vínculo ativo + Diretoria + autorização.
set local role service_role;
do $t$ declare r record; begin
  select * into r from public.whatsapp_dispatch_target('${P1}','${U.bruno}');
  if r.phone_e164 <> '+5527999990000' or not r.channel_authorized or not r.active_member or r.diretoria_member then raise exception 'esperado ativo, autorizado e NÃO Diretoria: %', r; end if;
  raise notice 'OK   alvo: vínculo ativo e autorizado, mas ainda fora da Diretoria';
end $t$;
reset role;
insert into public.sla_area_responsibles (project_id, area, board_user_id, updated_by_user_id) values ('${P1}','ENGENHARIA','${U.bruno}','${U.adm}');
set local role service_role;
do $t$ declare r record; begin
  select * into r from public.whatsapp_dispatch_target('${P1}','${U.bruno}');
  if not (r.channel_authorized and r.active_member and r.diretoria_member) then raise exception 'esperado elegível: %', r; end if;
  raise notice 'OK   alvo: responsável de Diretoria pela matriz do projeto é elegível';
end $t$;
reset role;
update public.project_memberships set status='INACTIVE' where project_id='${P1}' and user_id='${U.bruno}';
set local role service_role;
do $t$ declare r record; begin
  select * into r from public.whatsapp_dispatch_target('${P1}','${U.bruno}');
  if r.active_member then raise exception 'vínculo desativado ainda aparece ativo'; end if;
  raise notice 'OK   alvo: desativar o vínculo remove a elegibilidade imediatamente (contato da pessoa permanece)';
end $t$;
reset role;
update public.project_memberships set status='ACTIVE' where project_id='${P1}' and user_id='${U.bruno}';
${as(U.adm)}
${ok("revogar a autorização da pessoa vale já para o próximo envio", `
  perform public.set_person_whatsapp_contact('${P1}','${U.bruno}','+5527999990000', false);`)}
reset role;
set local role service_role;
do $t$ declare r record; begin
  select * into r from public.whatsapp_dispatch_target('${P1}','${U.bruno}');
  if r.channel_authorized then raise exception 'autorização revogada ainda aparece ativa'; end if;
  raise notice 'OK   alvo: revogação reflete no envio seguinte';
end $t$;
reset role;
do $t$ begin
  if has_function_privilege('authenticated', 'public.whatsapp_dispatch_target(uuid,uuid)', 'execute') or has_function_privilege('anon', 'public.whatsapp_dispatch_target(uuid,uuid)', 'execute') then
    raise exception 'whatsapp_dispatch_target deve ser exclusiva do service_role';
  end if;
  raise notice 'OK   whatsapp_dispatch_target só para service_role';
end $t$;

-- ===== Construmanager: revisão de impacto de versão e resposta do orçamento =====
reset role;
insert into public.project_integrations (id, project_id, source_type, status) values ('f0000000-0000-4000-8000-000000000001','${P1}','CONSTRUMANAGER','CONECTADO');
insert into public.construmanager_sync_runs (id, project_id, integration_id, started_at, status) values ('f0000000-0000-4000-8000-000000000002','${P1}','f0000000-0000-4000-8000-000000000001', now(), 'SUCESSO');
insert into public.construmanager_version_transitions (id, project_id, integration_id, construmanager_object_id, new_revision, new_object_id, content_availability, sync_run_id)
  values ('f0000000-0000-4000-8000-000000000003','${P1}','f0000000-0000-4000-8000-000000000001', 1, 'R1', 2, 'ARMAZENADO_NO_ACC','f0000000-0000-4000-8000-000000000002');
${as(U.orc)}
${mustFail("quem não é do Planejamento não revisa (PLANNING_ROLE_REQUIRED)", `public.submit_construmanager_version_impact_review('${P1}','f0000000-0000-4000-8000-000000000003','SIM','NAO','Resposta com mais de dez caracteres',false,null)`, "PLANNING_ROLE_REQUIRED")}
${as(U.plan)}
${mustFail("destinatário do orçamento inválido (INVALID_BUDGET_RESPONSIBLE)", `public.submit_construmanager_version_impact_review('${P1}','f0000000-0000-4000-8000-000000000003','SIM','SIM','Resposta com mais de dez caracteres',true,'${U.bruno}')`, "INVALID_BUDGET_RESPONSIBLE")}
${ok("submit_construmanager_version_impact_review envia ao orçamento (PENDENTE_ORCAMENTO) e audita", `
  v := public.submit_construmanager_version_impact_review('${P1}','f0000000-0000-4000-8000-000000000003','SIM','SIM','Impacto em prazo e preço confirmado pelo planejamento',true,'${U.orc}');
  select count(*) into n from public.construmanager_version_impact_reviews where id = v and status = 'PENDENTE_ORCAMENTO' and budget_user_id = '${U.orc}' and planning_user_id = '${U.plan}';
  if n <> 1 then raise exception 'revisão não gravada'; end if;
  select count(*) into n from public.audit_log_entries where entity_id = v::text and action = 'CONSTRUMANAGER_VERSION_IMPACT_REVIEWED';
  if n <> 1 then raise exception 'auditoria ausente'; end if;
  perform set_config('acc.review_id', v::text, false);`)}
${as(U.ana)}
${mustFail("outro usuário não responde pelo orçamento (BUDGET_REVIEW_NOT_AVAILABLE)", `public.submit_construmanager_budget_response('${P1}', current_setting('acc.review_id')::uuid, 'Resposta com mais de dez caracteres')`, "BUDGET_REVIEW_NOT_AVAILABLE")}
${as(U.orc)}
${mustFail("resposta curta (RESPONSE_INCOMPLETE)", `public.submit_construmanager_budget_response('${P1}', current_setting('acc.review_id')::uuid, 'curta')`, "RESPONSE_INCOMPLETE")}
${ok("submit_construmanager_budget_response conclui a revisão enviada ao orçamento e audita", `
  perform public.submit_construmanager_budget_response('${P1}', current_setting('acc.review_id')::uuid, 'Orçamento reavaliado, sem impacto adicional');
  select count(*) into n from public.construmanager_version_impact_reviews where id = current_setting('acc.review_id')::uuid and status = 'CONCLUIDA' and budget_response is not null and budget_responded_at is not null and budget_user_id = '${U.orc}';
  if n <> 1 then raise exception 'revisão não ficou CONCLUIDA com a resposta'; end if;
  select count(*) into n from public.audit_log_entries where action = 'CONSTRUMANAGER_BUDGET_RESPONSE_RECORDED' and entity_id = current_setting('acc.review_id');
  if n <> 1 then raise exception 'auditoria ausente'; end if;`)}
${mustFail("segunda resposta é recusada (BUDGET_REVIEW_NOT_AVAILABLE)", `public.submit_construmanager_budget_response('${P1}', current_setting('acc.review_id')::uuid, 'Outra resposta com mais de dez caracteres')`, "BUDGET_REVIEW_NOT_AVAILABLE")}
reset role;
do $t$ begin
  begin
    update public.construmanager_version_impact_reviews set status = 'CONCLUIDA' where id = current_setting('acc.review_id')::uuid;
    update public.construmanager_version_impact_reviews set budget_response = null where id = current_setting('acc.review_id')::uuid;
    raise exception 'NAO_FALHOU: estado incoerente aceito';
  exception when check_violation then null; end;
  raise notice 'OK   CHECK de estado recusa CONCLUIDA enviada ao orçamento sem resposta';
end $t$;

reset role;
rollback;
`;
const result = spawnSync(
  "docker",
  ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "-q", "-t", "-A"],
  { input: sqlFull, encoding: "utf8" }
);
const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const lines = out.split(/\r?\n/).map((l) => l.replace(/^psql:<stdin>:\d+: /, "")).filter(Boolean);
for (const l of lines.filter((l) => !l.startsWith('{'))) console.log(l.replace(/^NOTICE:\s+/, ""));
const passed = lines.filter((l) => /^NOTICE:\s+OK /.test(l)).length;
const failed = result.status !== 0 || lines.some((l) => /^ERROR:|ERRO_INESPERADO|NAO_FALHOU/.test(l));
// Conferência em OUTRA sessão: nada do teste pode ter permanecido.
const check = spawnSync(
  "docker",
  ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "-q", "-t", "-A", "-c",
    `select 'remanescentes: ' || (select count(*) from public.projects where id in ('${P1}','${P2}')) || ',' || (select count(*) from auth.users where id in ('${Object.values(U).join("','")}'))`],
  { encoding: "utf8" }
);
const remainders = (check.stdout ?? "").trim();
console.log(remainders);
const clean = /remanescentes: 0,0$/.test(remainders);
console.log(`\nRESULTADO: ${passed} passos OK; ${failed ? "FALHOU" : "sem falhas"}; ${clean ? "rollback confirmado" : "ROLLBACK NÃO CONFIRMADO"}`);
process.exit(failed || !clean ? 1 : 0);
