// Estados condicionais por chave de configuração (feature flag) × Hover Text — escopo SSMA e Integrações.
// Para cada recurso condicionado, prova (a) o comportamento REAL do código nos estados desligado/ligado/escopo e (b) que o texto de ajuda
// publicado descreve esses estados sem contradizer o código. Sem rede, sem banco, sem e-mail, sem data fixa.
//   1. Avisos SSMA por e-mail: ACC_SSMA_NOTIFICATIONS_ENABLED + ACC_SSMA_NOTIFICATIONS_SCOPE (WEG_CORRECTIVE_ACTIONS: respostas por e-mail).
//   2. Coleta de caixa: só com autorização corporativa AUTORIZADA + teste técnico CONFIRMADO (+ não revogada, + sem recusa individual).
//   3. Envio de reemissão: só com ACC_RISK_ALERT_REISSUE_SEND_ENABLED = "true" (dry-run sempre enxerga as aprovações).
//   4. Pontos de renderização que as ajudas dependem (casca offline, evidência das etapas sem atributo title, campos dos formulários).
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-help-flag-states.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const { resolveSsmaNotificationScope, ssmaNotificationsEnabled, SSMA_NOTIFICATIONS_SCOPE_ENV, WEG_CORRECTIVE_ACTIONS_SCOPE } = await import("../apps/web/lib/ssma/field-notifications/enabled.ts");
const { buildMailboxDiagnostics, MAX_CONSECUTIVE_SYNC_ERRORS, CONTROLS_MISSING_TEXT } = await import("../apps/web/lib/email/ingestion/mailbox-diagnostics.ts");
const { applyReissueSendGate, isReissueSendEnabled, REISSUE_SEND_FLAG_ENV } = await import("../apps/web/lib/risk-alerts/reissue-send-gate.ts");
const { SSMA_CHECKLISTS } = await import("../apps/web/lib/ssma/checklist-definitions.ts");

let passed = 0, failed = 0, warned = 0;
const check = (name, fn) => { try { fn(); console.log(`OK   ${name}`); passed++; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const warn = (name, msg) => { console.log(`AVISO ${name}\n     ${msg}`); warned++; };
const text = (id) => {
  const e = ACC_FEATURE_HELP[id];
  ok(e, `entrada ${id} inexistente`);
  return [e.title, e.shortDescription, e.description, e.purpose, e.howItWorks, e.validity, e.formula, ...(e.criteria ?? []), ...(e.consequences ?? []), ...(e.limitations ?? [])].filter(Boolean).join(" ");
};

// ----------------------------------------------------------------------------------------------------------------------------------
// 1) Avisos SSMA por e-mail e respostas por e-mail
// ----------------------------------------------------------------------------------------------------------------------------------
const ENABLED = "ACC_SSMA_NOTIFICATIONS_ENABLED";
const env = (enabled, scope) => ({ ...(enabled === undefined ? {} : { [ENABLED]: enabled }), ...(scope === undefined ? {} : { [SSMA_NOTIFICATIONS_SCOPE_ENV]: scope }) });

check("SSMA e-mail — chave desligada: só o valor exato 'true' liga; qualquer outro mantém nada saindo", () => {
  for (const value of [undefined, "", "false", "TRUE", "True", "1", "true ", " true", "yes"]) {
    const scope = resolveSsmaNotificationScope(env(value, WEG_CORRECTIVE_ACTIONS_SCOPE));
    ok(!ssmaNotificationsEnabled(env(value)), `valor ${JSON.stringify(value)} não deveria ligar`);
    ok(scope.mode === "DISABLED" && !scope.criticalRecords && !scope.overdueActions && !scope.replyEnabled, `valor ${JSON.stringify(value)}: algo ficou ligado`);
  }
});
check("SSMA e-mail — ligada sem escopo: modo legado (crítico + ação em atraso, todas as obras, sem resposta por e-mail)", () => {
  for (const scopeValue of [undefined, ""]) {
    const s = resolveSsmaNotificationScope(env("true", scopeValue));
    ok(s.mode === "LEGACY_ALL" && s.criticalRecords && s.overdueActions && s.projectIds === null && !s.responsibleOnly && !s.replyEnabled, JSON.stringify(s));
  }
});
check("SSMA e-mail — escopo WEG_CORRECTIVE_ACTIONS: só ação em atraso da WEG, só ao responsável, com resposta por e-mail; crítico desligado", () => {
  const s = resolveSsmaNotificationScope(env("true", WEG_CORRECTIVE_ACTIONS_SCOPE));
  ok(s.mode === "WEG_CORRECTIVE_ACTIONS" && !s.criticalRecords && s.overdueActions && s.responsibleOnly && s.replyEnabled && s.operational, JSON.stringify(s));
  ok(Array.isArray(s.projectIds) && s.projectIds.length === 1, "escopo deve restringir a exatamente um projeto");
});
check("SSMA e-mail — escopo com outro valor: nada sai (fail closed)", () => {
  for (const scopeValue of ["weg_corrective_actions", "WEG", "ALL", " WEG_CORRECTIVE_ACTIONS"]) {
    const s = resolveSsmaNotificationScope(env("true", scopeValue));
    ok(s.mode === "INVALID_SCOPE" && !s.criticalRecords && !s.overdueActions && !s.replyEnabled && s.projectIds.length === 0, `${scopeValue}: ${JSON.stringify(s)}`);
  }
});
check("SSMA e-mail — a ajuda ssma.registro.aviso-email descreve os 4 estados e as chaves reais", () => {
  const t = text("ssma.registro.aviso-email");
  for (const needle of [ENABLED, SSMA_NOTIFICATIONS_SCOPE_ENV, WEG_CORRECTIVE_ACTIONS_SCOPE, "desligada", "modo legado", "qualquer outro escopo = nada sai|com qualquer outro escopo|ligada com qualquer outro escopo = nada sai"]) {
    ok(new RegExp(needle).test(t), `texto não cita: ${needle}`);
  }
  ok(/resposta por e-mail/i.test(t) && /RESOLVIDO/.test(t) && /EM ANDAMENTO/.test(t) && /ENVIAR PARA/.test(t), "respostas por e-mail (RESOLVIDO, EM ANDAMENTO, ENVIAR PARA) não descritas");
  ok(/somente nesse escopo|só funcionam no escopo WEG_CORRECTIVE_ACTIONS/i.test(t), "texto deve dizer que a resposta por e-mail só existe no escopo WEG_CORRECTIVE_ACTIONS");
});

// ----------------------------------------------------------------------------------------------------------------------------------
// 2) Coleta de caixa
// ----------------------------------------------------------------------------------------------------------------------------------
const MAILBOX = "tecnico@axion.com.br";
const baseEvidence = (control, over = {}) => ({
  measuredAt: "2026-01-01T00:00:00Z",
  members: [{ userId: "u1", name: "Técnico", email: MAILBOX, permission: "COLABORADOR", status: "ACTIVE" }],
  allowlist: [{ mailbox: MAILBOX, enabled: true }],
  projectIngestionEnabled: true,
  oauthProjectLastSyncAt: null,
  controlsAvailability: "OK",
  controls: control ? [control] : [],
  authorizations: [],
  counts: { [MAILBOX]: { emails: 0, bodies: 0, lastMessageAt: null, attachments: 0, attachmentsStored: 0, attachmentsProcessed: 0, attachmentsPending: 0, attachmentsFailed: 0 } },
  unassignedEmails: 0,
  ...over,
});
const control = (over = {}) => ({
  mailbox_address: MAILBOX, corporate_authorization_status: "AUTORIZADA", corporate_authorized_at: "2026-01-01T00:00:00Z", corporate_authorization_ref: "ata 1",
  individual_consent_status: "NAO_SOLICITADO", technical_permission_status: "CONFIRMADA", technical_checked_at: "2026-01-02T00:00:00Z", technical_check_detail: null,
  collection_enabled: false, period_start: null, period_end: null, last_sync_at: null, last_sync_status: null, last_sync_detail: null, last_sync_imported: null,
  revoked_at: null, revoked_reason: null, consecutive_errors: 0, ...over,
});
const action = (evidence, name, now = new Date("2026-06-15T12:00:00Z")) => buildMailboxDiagnostics(evidence, now)[0].actions.find((a) => a.action === name);

check("Coleta de caixa — habilitar exige autorização corporativa AUTORIZADA e teste técnico CONFIRMADO", () => {
  ok(action(baseEvidence(control()), "HABILITAR_COLETA").enabled, "com os dois pré-requisitos deveria habilitar");
  ok(!action(baseEvidence(control({ corporate_authorization_status: "PENDENTE" })), "HABILITAR_COLETA").enabled, "sem autorização corporativa não pode habilitar");
  ok(!action(baseEvidence(control({ technical_permission_status: "PENDENTE" })), "HABILITAR_COLETA").enabled, "sem teste técnico confirmado não pode habilitar");
  ok(!action(baseEvidence(control({ technical_permission_status: "FALHA" })), "HABILITAR_COLETA").enabled, "teste técnico com falha não pode habilitar");
  ok(!action(baseEvidence(null), "HABILITAR_COLETA").enabled, "sem controle da caixa não pode habilitar");
});
check("Coleta de caixa — revogada, recusa individual e controles indisponíveis bloqueiam (falha fechada)", () => {
  ok(!action(baseEvidence(control({ revoked_at: "2026-02-01T00:00:00Z", corporate_authorization_status: "REVOGADA" })), "HABILITAR_COLETA").enabled, "revogada");
  ok(!action(baseEvidence(control({ individual_consent_status: "RECUSADO" })), "HABILITAR_COLETA").enabled, "recusa individual");
  for (const availability of ["MISSING", "ERROR"]) {
    const row = buildMailboxDiagnostics(baseEvidence(null, { controlsAvailability: availability }))[0];
    ok(row.actions.every((a) => !a.enabled), `controles ${availability}: nenhuma ação pode ficar ligada`);
  }
  ok(action(baseEvidence(null, { controlsAvailability: "MISSING" }), "HABILITAR_COLETA").reason === CONTROLS_MISSING_TEXT, "motivo deve ser o texto de controles indisponíveis");
});
check("Coleta de caixa — etapa 4: ligada só dentro do período e sem suspensão por erros", () => {
  const stage4 = (c, now) => buildMailboxDiagnostics(baseEvidence(c), now)[0].stages.find((s) => s.key === "habilitada");
  const inPeriod = { collection_enabled: true, period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-30T23:59:59Z" };
  ok(stage4(control(inPeriod), new Date("2026-06-15T12:00:00Z")).status === "COMPROVADO", "dentro do período deveria comprovar");
  ok(stage4(control(inPeriod), new Date("2026-07-15T12:00:00Z")).status === "BLOQUEADO", "fora do período deveria bloquear");
  ok(stage4(control({ ...inPeriod, consecutive_errors: MAX_CONSECUTIVE_SYNC_ERRORS }), new Date("2026-06-15T12:00:00Z")).status === "BLOQUEADO", "suspensa por erros deveria bloquear");
  ok(MAX_CONSECUTIVE_SYNC_ERRORS === 5, "teto de erros seguidos mudou: a ajuda diz 5");
});
check("Coleta de caixa — a ajuda descreve os pré-requisitos, o período e a suspensão por 5 erros", () => {
  const hab = text("integracoes.caixas.habilitar-coleta");
  ok(/autoriza[çc][ãa]o corporativa/i.test(hab) && /teste t[ée]cnico CONFIRMADO/i.test(hab), "habilitar-coleta deve citar autorização corporativa e teste técnico CONFIRMADO");
  ok(/recusado ou revogado/i.test(hab), "habilitar-coleta deve citar o bloqueio por recusa/revogação do titular");
  ok(/Fora do período/i.test(hab), "habilitar-coleta deve citar o bloqueio fora do período");
  const susp = text("integracoes.caixas.suspensao-erros");
  ok(/\b5\b/.test(susp) && /nova habilita|habilitar a coleta novamente|habilitar de novo/i.test(susp + " " + (ACC_FEATURE_HELP["integracoes.caixas.suspensao-erros"].howItWorks ?? "")), "suspensão deve citar 5 erros e a nova habilitação");
  ok(/n[ãa]o est[ãa]o dispon[íi]veis/i.test(text("integracoes.caixas.aviso-controles")) && /falha fechada/i.test(text("integracoes.caixas.aviso-controles")) && !/migration/i.test(text("integracoes.caixas.aviso-controles")), "aviso de controles indisponíveis deve dizer que não estão disponíveis, citar a falha fechada e não expor detalhe interno");
});
check("Caixas — a evidência das etapas não usa mais o atributo title (dica nativa); fica no detalhe da caixa", () => {
  const page = read("apps/web/app/[projectId]/integracoes/caixas/page.tsx");
  ok(!/title=\{stage\.evidence\}/.test(page), "a célula ainda usa title={stage.evidence}");
  ok(/Evidência: \{stage\.evidence\}/.test(page), "o detalhe da caixa deve continuar exibindo a evidência");
  ok(/helpId="integracoes\.caixas\.evidencia-etapa"/.test(page), "a ajuda evidencia-etapa precisa estar renderizada");
});

// ----------------------------------------------------------------------------------------------------------------------------------
// 3) Reemissão de alertas: envio só com a chave
// ----------------------------------------------------------------------------------------------------------------------------------
check("Reemissão — envio só com ACC_RISK_ALERT_REISSUE_SEND_ENABLED = true; dry-run sempre enxerga as aprovações", () => {
  const approvals = new Map([["a", {}], ["b", {}]]);
  for (const value of [undefined, "", "false", "0", "yes"]) {
    ok(!isReissueSendEnabled({ [REISSUE_SEND_FLAG_ENV]: value }), `${JSON.stringify(value)} não deveria ligar`);
    const gate = applyReissueSendGate(approvals, { dryRun: false, env: { [REISSUE_SEND_FLAG_ENV]: value } });
    ok(gate.approvals.size === 0 && gate.held === 2 && !gate.sendFlagEnabled, `${JSON.stringify(value)}: aprovações deveriam ficar retidas`);
  }
  const on = applyReissueSendGate(approvals, { dryRun: false, env: { [REISSUE_SEND_FLAG_ENV]: "true" } });
  ok(on.approvals.size === 2 && on.held === 0 && on.sendFlagEnabled, "ligada: aprovações passam");
  const dry = applyReissueSendGate(approvals, { dryRun: true, env: {} });
  ok(dry.approvals.size === 2 && dry.held === 0 && !dry.sendFlagEnabled, "dry-run: aprovações visíveis mesmo com a chave desligada");
  ok(applyReissueSendGate(undefined, { dryRun: false, env: {} }).held === 0, "sem aprovações: nada retido");
});
{
  // A ajuda da reemissão pertence ao módulo de Planejamento (outro agente). Aqui só se informa se o texto já cita a chave.
  const ids = Object.keys(ACC_FEATURE_HELP).filter((id) => id.startsWith("planejamento.reemissao.") || id === "reemissao-alertas");
  const cites = ids.some((id) => text(id).includes(REISSUE_SEND_FLAG_ENV));
  if (cites) { console.log(`OK   Reemissão — a ajuda de Planejamento cita ${REISSUE_SEND_FLAG_ENV}`); passed++; }
  else warn("Reemissão — a ajuda de Planejamento ainda NÃO cita a chave", `nenhuma de ${ids.length} entradas planejamento.reemissao.* menciona ${REISSUE_SEND_FLAG_ENV}; texto fora do escopo A2 (modules/planejamento.ts é do agente A1).`);
}

// ----------------------------------------------------------------------------------------------------------------------------------
// 4) Pontos de renderização dos elementos documentados
// ----------------------------------------------------------------------------------------------------------------------------------
check("Casca offline — reutiliza FieldRecordsApp (os helpIds das abas Registros, Sincronização e Perfil valem também sem conexão)", () => {
  const shell = read("apps/web/components/ssma/ssma-offline-shell.tsx");
  ok(/import \{ FieldRecordsApp/.test(shell) && /<FieldRecordsApp[^>]*offlineShell/.test(shell), "a casca offline deve renderizar FieldRecordsApp com offlineShell");
  const app = read("apps/web/components/ssma/field-records/field-records-app.tsx");
  for (const id of ["ssma.app.aba-registros", "ssma.app.aba-sincronizacao", "ssma.app.aba-perfil"]) ok(app.includes(`"${id}"`), `${id} não é renderizado por FieldRecordsApp`);
  ok(/helpId="ssma\.offline\.pagina"/.test(shell), "a página offline precisa do helpId ssma.offline.pagina");
});
check("Barra inferior do app de campo — as 4 abas (Início, Registros, Sincronização, Perfil) têm ajuda ao lado do botão, nunca dentro dele", () => {
  const chrome = read("apps/web/components/ssma/ssma-chrome.tsx");
  for (const id of ["ssma.app.aba-inicio", "ssma.app.aba-registros", "ssma.app.aba-sincronizacao", "ssma.app.aba-perfil"]) {
    ok(chrome.includes(`helpId: "${id}"`), `${id} ausente em TABS`);
    ok(ACC_FEATURE_HELP[id], `${id} ausente no catálogo`);
  }
  const nav = chrome.slice(chrome.indexOf("export function SsmaBottomNav"));
  const buttonBlock = nav.slice(nav.indexOf("<button"), nav.indexOf("</button>"));
  ok(!buttonBlock.includes("FeatureInfo"), "FeatureInfo não pode ficar dentro do <button> da aba");
});
check("Formulários 1 a 12 — todo campo declarado tem helpId existente no catálogo e o app renderiza o ícone ao lado do rótulo", () => {
  const missing = [];
  let total = 0;
  const visit = (where, fields) => { for (const f of fields) { total++; if (!f.helpId) missing.push(`${where}:${f.id}`); else if (!ACC_FEATURE_HELP[f.helpId]) missing.push(`${where}:${f.id} -> ${f.helpId} inexistente`); else if (ACC_FEATURE_HELP[f.helpId].kind !== "field") missing.push(`${where}:${f.id} -> kind ${ACC_FEATURE_HELP[f.helpId].kind}`); } };
  for (const def of SSMA_CHECKLISTS) { visit(def.slug, def.fields); if (def.nearMissVariant) visit(`${def.slug}/near-miss`, def.nearMissVariant.fields); }
  ok(missing.length === 0, missing.join(" | "));
  ok(total === 55, `esperados 55 campos nos 12 formulários (com a variante Near Miss), encontrados ${total}`);
  const app = read("apps/web/components/ssma/ssma-field-app.tsx");
  ok(/field\.helpId \? <FeatureInfo helpId=\{field\.helpId\} \/>/.test(app), "o laço de campos precisa renderizar FeatureInfo com field.helpId");
  ok(/<label htmlFor=\{`ssma-field-\$\{field\.id\}`\}>/.test(app), "o rótulo deve ficar associado ao campo por htmlFor (ícone fora do <label>)");
});
check("Formulário 12 — a ajuda dos campos obrigatórios bate com a validação real do banco (afastamento, funcionário, causa, remoção)", () => {
  const acc = SSMA_CHECKLISTS.find((d) => d.slug === "ocorrencia-acidente");
  const required = acc.fields.filter((f) => f.required).map((f) => f.id).sort();
  ok(JSON.stringify(required) === JSON.stringify(["afastamento", "causa", "funcionario", "remocaoEm"]), `obrigatórios mudaram: ${required}`);
  for (const f of acc.fields) ok(/obrigat[óo]ri/i.test(text(f.helpId) + " " + (ACC_FEATURE_HELP[f.helpId].missingData ?? "")), `${f.helpId} deve dizer que é obrigatório`);
  const migration = read("supabase/migrations/20260911100000_special_routines_accident.sql");
  ok(/ACCIDENT_REQUIRED_FIELDS_MISSING/.test(migration) && /'Sem afastamento', 'Com afastamento'/.test(migration), "a migration deixou de validar os campos do acidente");
  ok(/Com afastamento[^.]*CR[ÍI]TIC|CRÍTICO[^.]*Com afastamento|Com afastamento: o risco do registro é CRÍTICO/i.test(text("ssma.form.campo-acidente-afastamento")), "ajuda do afastamento deve citar risco CRÍTICO com afastamento");
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s), ${warned} aviso(s)`);
process.exit(failed ? 1 : 0);
