// Restrição de EXECUTE para `anon` (migration 20261101100000) contra PostgreSQL REAL descartável com os privilégios padrão do Supabase.
//
// Prova, para as 21 funções revogadas: anon/PUBLIC sem EXECUTE e recusado com "permission denied"; authenticated e service_role mantêm o acesso.
// Para as 4 exceções (helpers de RLS): anon continua executando, recebe só false e nenhuma linha das tabelas (não erro).
// Fluxos autenticados: administrador da obra 1 age na obra 1 e é recusado na obra 2; membro comum e quem está fora são recusados;
// isolamento de linhas entre obras via políticas RLS que usam os helpers. Tudo em UMA transação com ROLLBACK.
//
// SEGURANÇA DE AMBIENTE: só aceita container Docker local "supabase_db_acc-disposable-*" e exige confirmação explícita.
//
// Uso:
//   ACC_ANONREV_TEST_DB_CONTAINER="supabase_db_acc-disposable-rehearsal" ACC_ANONREV_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true \
//   node scripts/sql/run-anon-execute-restriction-test.mjs
import { spawnSync } from "node:child_process";
import { requireDisposableContainer } from "./lib/disposable-target.mjs";

const container = requireDisposableContainer("ACC_ANONREV_TEST_DB_CONTAINER");
if (process.env.ACC_ANONREV_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE !== "true") {
  console.error("Defina ACC_ANONREV_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true (banco descartável, tudo termina em ROLLBACK).");
  process.exit(2);
}

const U = {
  adm1: "a1000000-0000-4000-8000-000000000001", // ADMINISTRADOR da obra 1
  mem1: "a1000000-0000-4000-8000-000000000002", // COLABORADOR da obra 1
  adm2: "a1000000-0000-4000-8000-000000000003", // ADMINISTRADOR da obra 2 (fora da obra 1)
  alvo: "a1000000-0000-4000-8000-000000000004", // COLABORADOR da obra 1 (alvo das ações do administrador)
};
const P1 = "b1000000-0000-4000-8000-000000000001";
const P2 = "b1000000-0000-4000-8000-000000000002";
const ZERO = "00000000-0000-4000-8000-0000000000ff";

const REVOKED = [
  "add_project_member(uuid,uuid,text,text)",
  "approve_policy_acknowledgement(uuid,inet,text)",
  "can_upload_ssma_photo_object(text)",
  "create_precontract_workspace(text,text)",
  "create_ssma_accident_submission(uuid,timestamptz,jsonb,jsonb)",
  "create_ssma_form_submission(uuid,text,integer,text,text,timestamptz,jsonb,jsonb,text)",
  "delete_project_document(uuid)",
  "ensure_current_policy_acknowledgement(uuid,uuid)",
  "finalize_ssma_form_submission(uuid)",
  "find_profile_by_email(uuid,text)",
  "get_policy_acknowledgement_send_context(uuid,uuid)",
  "mark_policy_acknowledgement_viewed(uuid)",
  "register_policy_acknowledgement_email_sent(uuid,uuid,text,text,text,text,timestamptz)",
  "register_ssma_submission_photo(uuid,uuid,text,text,text,text,bigint,text)",
  "remove_project_member(uuid,uuid)",
  "set_profile_job_title(uuid,uuid,text)",
  "set_project_member_status(uuid,uuid,text)",
  "submit_construmanager_budget_response(uuid,uuid,text)",
  "submit_construmanager_version_impact_review(uuid,uuid,text,text,text,boolean,uuid)",
  "submit_weekly_alert_digest(uuid,jsonb)",
  "update_project_member_role(uuid,uuid,text)",
];
const EXCEPTIONS = ["has_project_permission(uuid,text)", "is_project_member(uuid)", "is_shared_project_admin(uuid)", "is_any_project_admin()"];

const as = (uid) =>
  `reset role;\nselect set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true), set_config('request.jwt.claim.sub', '${uid}', true);\nset local role authenticated;\n`;
const anonSession = `reset role;\nselect set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true);\nset local role anon;\n`;

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
do $t$ declare v uuid; n int; b boolean; t text; begin
${body}
  raise notice 'OK   %', '${label}';
end $t$;
`;

// Chamada fictícia de cada função revogada, só para provar a recusa por permissão (nunca chega ao corpo).
const CALLS = {
  "add_project_member(uuid,uuid,text,text)": `public.add_project_member('${P1}','${U.alvo}','LEITURA',null)`,
  "approve_policy_acknowledgement(uuid,inet,text)": `public.approve_policy_acknowledgement('${ZERO}','127.0.0.1'::inet,'x')`,
  "can_upload_ssma_photo_object(text)": `public.can_upload_ssma_photo_object('${P1}/ssma/${ZERO}/a.jpg')`,
  "create_precontract_workspace(text,text)": `public.create_precontract_workspace('x','y')`,
  "create_ssma_accident_submission(uuid,timestamptz,jsonb,jsonb)": `public.create_ssma_accident_submission('${P1}',now(),'{}'::jsonb,'{}'::jsonb)`,
  "create_ssma_form_submission(uuid,text,integer,text,text,timestamptz,jsonb,jsonb,text)": `public.create_ssma_form_submission('${P1}','x',1,'x','x',now(),'{}'::jsonb,'{}'::jsonb,'x')`,
  "delete_project_document(uuid)": `public.delete_project_document('${ZERO}')`,
  "ensure_current_policy_acknowledgement(uuid,uuid)": `(select count(*) from public.ensure_current_policy_acknowledgement('${P1}','${U.alvo}'))`,
  "finalize_ssma_form_submission(uuid)": `public.finalize_ssma_form_submission('${ZERO}')`,
  "find_profile_by_email(uuid,text)": `(select count(*) from public.find_profile_by_email('${P1}','a@axion.com.br'))`,
  "get_policy_acknowledgement_send_context(uuid,uuid)": `(select count(*) from public.get_policy_acknowledgement_send_context('${P1}','${ZERO}'))`,
  "mark_policy_acknowledgement_viewed(uuid)": `public.mark_policy_acknowledgement_viewed('${ZERO}')`,
  "register_policy_acknowledgement_email_sent(uuid,uuid,text,text,text,text,timestamptz)": `public.register_policy_acknowledgement_email_sent('${P1}','${ZERO}','p','m','a','b',now())`,
  "register_ssma_submission_photo(uuid,uuid,text,text,text,text,bigint,text)": `public.register_ssma_submission_photo('${ZERO}','${ZERO}','x','${P1}/ssma/${ZERO}/a.jpg','a.jpg','image/jpeg',10,'abc')`,
  "remove_project_member(uuid,uuid)": `public.remove_project_member('${P1}','${U.alvo}')`,
  "set_profile_job_title(uuid,uuid,text)": `public.set_profile_job_title('${P1}','${U.alvo}','x')`,
  "set_project_member_status(uuid,uuid,text)": `public.set_project_member_status('${P1}','${U.alvo}','ACTIVE')`,
  "submit_construmanager_budget_response(uuid,uuid,text)": `public.submit_construmanager_budget_response('${P1}','${ZERO}','resposta de teste')`,
  "submit_construmanager_version_impact_review(uuid,uuid,text,text,text,boolean,uuid)": `public.submit_construmanager_version_impact_review('${P1}','${ZERO}','NAO','NAO','resposta de teste',false,null)`,
  "submit_weekly_alert_digest(uuid,jsonb)": `public.submit_weekly_alert_digest('${ZERO}','[]'::jsonb)`,
  "update_project_member_role(uuid,uuid,text)": `public.update_project_member_role('${P1}','${U.alvo}','LEITURA')`,
};

const privilegeChecks = REVOKED.map(
  (sig) => `
do $t$ declare p regprocedure := to_regprocedure('public.${sig}'); begin
  if p is null then raise exception 'ERRO_INESPERADO: função inexistente ${sig}'; end if;
  if has_function_privilege('anon', p, 'execute') then raise exception 'ERRO_INESPERADO: anon executa ${sig}'; end if;
  if not has_function_privilege('authenticated', p, 'execute') then raise exception 'ERRO_INESPERADO: authenticated perdeu ${sig}'; end if;
  if not has_function_privilege('service_role', p, 'execute') then raise exception 'ERRO_INESPERADO: service_role perdeu ${sig}'; end if;
  if exists (select 1 from pg_proc x, aclexplode(coalesce(x.proacl, acldefault('f', x.proowner))) a where x.oid = p and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'ERRO_INESPERADO: PUBLIC ainda executa ${sig}'; end if;
  raise notice 'OK   privilégios ${sig}: anon/PUBLIC não; authenticated e service_role sim';
end $t$;`
).join("\n");

const anonRefusals = REVOKED.map((sig) => anonSession + mustFail(`anon sem acesso a ${sig.split("(")[0]}`, CALLS[sig], "permission denied")).join("\n");

const sqlFull = `
\\set ON_ERROR_STOP on
\\set VERBOSITY terse
begin;
reset role;
insert into auth.users (id, email, aud, role) values
  ('${U.adm1}','adm1@exemplo.invalid','authenticated','authenticated'),
  ('${U.mem1}','mem1@exemplo.invalid','authenticated','authenticated'),
  ('${U.adm2}','adm2@exemplo.invalid','authenticated','authenticated'),
  ('${U.alvo}','alvo@exemplo.invalid','authenticated','authenticated');
insert into public.profiles (id, name, email) select id, split_part(email,'@',1), email from auth.users where id in ('${Object.values(U).join("','")}')
  on conflict (id) do update set name = excluded.name;
insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values
  ('${P1}','TST-ANON-1','Obra descartável 1','Cliente teste','Local','2026-01-01','2026-12-31'),
  ('${P2}','TST-ANON-2','Obra descartável 2','Cliente teste','Local','2026-01-01','2026-12-31');
insert into public.project_memberships (project_id, user_id, permission, status, area) values
  ('${P1}','${U.adm1}','ADMINISTRADOR','ACTIVE',null),
  ('${P1}','${U.mem1}','COLABORADOR','ACTIVE',null),
  ('${P1}','${U.alvo}','COLABORADOR','ACTIVE',null),
  ('${P2}','${U.adm2}','ADMINISTRADOR','ACTIVE',null);

reset role;
${privilegeChecks}

${ok("as 4 exceções documentadas continuam executáveis por anon",
  EXCEPTIONS.map((s) => `if not has_function_privilege('anon', to_regprocedure('public.${s}'), 'execute') then raise exception 'ERRO_INESPERADO: exceção perdida ${s}'; end if;`).join("\n"))}

${anonRefusals}

${anonSession}
${ok("exceções sem sessão: helpers devolvem false e nenhuma linha é visível (vazio, não erro)", `
  if public.has_project_permission('${P1}','LEITURA') or public.is_project_member('${P1}') or public.is_any_project_admin() or public.is_shared_project_admin('${U.alvo}') then
    raise exception 'ERRO_INESPERADO: helper devolveu true sem sessão'; end if;
  select count(*) into n from public.projects; if n <> 0 then raise exception 'ERRO_INESPERADO: anon vê % obras', n; end if;
  select count(*) into n from public.project_memberships; if n <> 0 then raise exception 'ERRO_INESPERADO: anon vê % vínculos', n; end if;`)}

${as(U.adm1)}
${ok("administrador da obra 1: helpers certos e vê só a própria obra (isolamento RLS)", `
  if not public.has_project_permission('${P1}','ADMINISTRADOR') then raise exception 'ERRO_INESPERADO: adm1 sem ADMINISTRADOR na obra 1'; end if;
  if public.has_project_permission('${P2}','LEITURA') or public.is_project_member('${P2}') then raise exception 'ERRO_INESPERADO: adm1 alcança a obra 2'; end if;
  if not public.is_any_project_admin() or not public.is_shared_project_admin('${U.alvo}') or public.is_shared_project_admin('${U.adm2}') then
    raise exception 'ERRO_INESPERADO: helpers de administração incorretos'; end if;
  select count(*) into n from public.projects where id in ('${P1}','${P2}'); if n <> 1 then raise exception 'ERRO_INESPERADO: adm1 vê % obras de teste', n; end if;
  select count(*) into n from public.projects where id = '${P2}'; if n <> 0 then raise exception 'ERRO_INESPERADO: adm1 vê a obra 2'; end if;`)}
${ok("administrador da obra 1 altera papel e status de membro da obra 1 (fluxo autenticado preservado)", `
  perform public.update_project_member_role('${P1}','${U.alvo}','LEITURA');
  select permission into t from public.project_memberships where project_id='${P1}' and user_id='${U.alvo}';
  if t <> 'LEITURA' then raise exception 'ERRO_INESPERADO: papel não mudou (%)', t; end if;
  perform public.set_project_member_status('${P1}','${U.alvo}','INACTIVE');
  select status into t from public.project_memberships where project_id='${P1}' and user_id='${U.alvo}';
  if t <> 'INACTIVE' then raise exception 'ERRO_INESPERADO: status não mudou (%)', t; end if;
  perform public.set_project_member_status('${P1}','${U.alvo}','ACTIVE');`)}
${ok("administrador da obra 1 consulta perfil por e-mail (domínio fora da empresa => vazio)", `
  select count(*) into n from public.find_profile_by_email('${P1}','alguem@exemplo.invalid'); if n <> 0 then raise exception 'ERRO_INESPERADO: retornou perfil'; end if;`)}
${mustFail("administrador da obra 1 NÃO altera papel na obra 2", `public.update_project_member_role('${P2}','${U.adm2}','LEITURA')`, "administradores")}
${mustFail("administrador da obra 1 NÃO consulta perfis na obra 2", `(select count(*) from public.find_profile_by_email('${P2}','a@axion.com.br'))`, "administradores")}
${mustFail("administrador da obra 1 NÃO remove membro da obra 2", `public.remove_project_member('${P2}','${U.adm2}')`, "administradores")}

${as(U.mem1)}
${ok("membro comum da obra 1: é membro, não é administrador, vê só a obra 1", `
  if not public.is_project_member('${P1}') or public.is_project_member('${P2}') then raise exception 'ERRO_INESPERADO: participação incorreta'; end if;
  if public.has_project_permission('${P1}','ADMINISTRADOR') or public.is_any_project_admin() then raise exception 'ERRO_INESPERADO: membro comum com poder de administrador'; end if;
  select count(*) into n from public.projects where id in ('${P1}','${P2}'); if n <> 1 then raise exception 'ERRO_INESPERADO: membro vê % obras', n; end if;`)}
${mustFail("membro comum NÃO altera papel", `public.update_project_member_role('${P1}','${U.alvo}','ADMINISTRADOR')`, "administradores")}
${mustFail("membro comum NÃO adiciona membro", `public.add_project_member('${P1}','${U.adm2}','LEITURA',null)`, "administradores")}
${mustFail("membro comum NÃO consulta perfil", `(select count(*) from public.find_profile_by_email('${P1}','a@axion.com.br'))`, "administradores")}

${as(U.adm2)}
${ok("administrador da obra 2 não enxerga a obra 1", `
  select count(*) into n from public.projects where id = '${P1}'; if n <> 0 then raise exception 'ERRO_INESPERADO: adm2 vê a obra 1'; end if;
  if public.is_project_member('${P1}') or public.has_project_permission('${P1}','LEITURA') then raise exception 'ERRO_INESPERADO: adm2 alcança a obra 1'; end if;`)}
${mustFail("administrador da obra 2 NÃO altera papel na obra 1", `public.update_project_member_role('${P1}','${U.alvo}','ADMINISTRADOR')`, "administradores")}

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
for (const l of lines.filter((l) => !l.startsWith("{"))) console.log(l.replace(/^NOTICE:\s+/, ""));
const passed = lines.filter((l) => /^NOTICE:\s+OK /.test(l)).length;
const failed = result.status !== 0 || lines.some((l) => /^ERROR:|ERRO_INESPERADO|NAO_FALHOU/.test(l));
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
