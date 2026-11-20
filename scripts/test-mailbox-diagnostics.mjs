// Diagnóstico por caixa (7 etapas) e ações administrativas da página Integrações → Caixas (sem rede, sem banco).
// Simula o estado de produção levantado em 20/11/2026 (reynaldo, corazza, Carlos, Jaime) e a ausência da tabela de controles.
// Uso: node scripts/test-mailbox-diagnostics.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const {
  buildMailboxDiagnostics, authorizeMailboxAdminAction, friendlyMailboxRpcError, CONTROLS_MISSING_TEXT, MAILBOX_STAGE_KEYS,
} = await import("../apps/web/lib/email/ingestion/mailbox-diagnostics");

let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log("OK   " + n); passed++; } catch (e) { console.log("FAIL " + n + "\n     " + e.message); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const NOW = new Date("2026-11-20T12:00:00Z");
const members = [
  { userId: "rey", name: "Reynaldo", email: "reynaldo@axion.com.br", permission: "ADMINISTRADOR", status: "ACTIVE" },
  { userId: "car", name: "Carlos Evandro", email: "carlos.evandro@axion.com.br", permission: "ADMINISTRADOR", status: "ACTIVE" },
  { userId: "jai", name: "Jaime Ramos", email: "jaime.ramos@axion.com.br", permission: "GERENTE", status: "ACTIVE" },
];
const counts = { emails: 678, bodies: 676, lastMessageAt: "2026-11-11T14:20:00Z", attachments: 4, attachmentsStored: 4, attachmentsProcessed: 3, attachmentsPending: 1, attachmentsFailed: 0 };
// Estado de PRODUÇÃO (fatos do coordenador): tabela de controles ausente; 1 aceite (reynaldo); lista com reynaldo e corazza.
const production = (over = {}) => ({
  measuredAt: NOW.toISOString(), members,
  allowlist: [{ mailbox: "reynaldo@axion.com.br", enabled: true }, { mailbox: "corazza@axion.com.br", enabled: true }],
  projectIngestionEnabled: true, oauthProjectLastSyncAt: "2026-11-11T14:24:00Z",
  controlsAvailability: "MISSING", controls: [],
  authorizations: [{ id: "a1", user_id: "rey", account_email: "reynaldo@axion.com.br", status: "AUTORIZADO", requested_at: "2026-11-11T13:00:00Z", decided_at: "2026-11-11T13:30:00Z" }],
  counts: { "reynaldo@axion.com.br": counts }, unassignedEmails: 32, ...over,
});
const control = (over = {}) => ({
  mailbox_address: "carlos.evandro@axion.com.br", corporate_authorization_status: "AUTORIZADA", corporate_authorized_at: "2026-11-21T10:00:00Z", corporate_authorization_ref: "Ata diretoria (SIM)",
  individual_consent_status: "NAO_REGISTRADO", technical_permission_status: "NAO_VERIFICADA", technical_checked_at: null, technical_check_detail: null,
  collection_enabled: false, period_start: null, period_end: null, last_sync_at: null, last_sync_status: null, last_sync_detail: null, last_sync_imported: null,
  revoked_at: null, revoked_reason: null, consecutive_errors: 0, ...over,
});
const rowsOf = (ev) => Object.fromEntries(buildMailboxDiagnostics(ev, NOW).map((r) => [r.mailbox, r]));
const st = (row, key) => row.stages.find((s) => s.key === key);
const action = (row, a) => row.actions.find((x) => x.action === a);

check("D1 sete etapas, sempre na mesma ordem, cada uma com evidência própria", () => {
  const r = rowsOf(production())["reynaldo@axion.com.br"];
  ok(r.stages.map((s) => s.key).join() === MAILBOX_STAGE_KEYS.join(), r.stages.map((s) => s.key).join());
  ok(r.stages.every((s) => s.evidence.length > 10), "evidência vazia");
});
check("D2 produção — reynaldo: cadastrado, aceite individual comprovado; técnica/habilitação/sync só INDÍCIO (OAuth histórico); 678 mensagens; corpos parciais (676)", () => {
  const r = rowsOf(production())["reynaldo@axion.com.br"];
  ok(st(r, "usuario").status === "COMPROVADO" && st(r, "autorizacao").status === "COMPROVADO", "1/2");
  for (const k of ["tecnica", "habilitada", "sincronizacao"]) ok(st(r, k).status === "INDICIO", `${k}: ${st(r, k).status}`);
  ok(st(r, "mensagens").status === "COMPROVADO" && /678/.test(st(r, "mensagens").label), "6");
  ok(st(r, "conteudo").status === "PARCIAL" && /676 de 678/.test(st(r, "conteudo").evidence), st(r, "conteudo").evidence);
});
check("D3 produção — corazza: na lista da obra mas SEM usuário, SEM autorização, sem técnica; a lista NÃO conta como habilitação; nada importado", () => {
  const r = rowsOf(production())["corazza@axion.com.br"];
  ok(st(r, "usuario").status === "PENDENTE" && st(r, "autorizacao").status === "PENDENTE", "1/2");
  ok(st(r, "tecnica").status === "INDISPONIVEL" && st(r, "habilitada").status === "PENDENTE" && /NÃO autoriza/.test(st(r, "habilitada").evidence), "3/4");
  ok(st(r, "sincronizacao").status === "PENDENTE" && /outra caixa/.test(st(r, "sincronizacao").evidence), "a execução do coletor da obra não vale para corazza");
  ok(st(r, "mensagens").status === "PENDENTE", "6");
});
check("D4 produção — Carlos e Jaime: cadastrados (etapa 1 comprovada) mas TODAS as demais pendentes; nada coletado; 'Aguardando autorização de <pessoa>'", () => {
  const rows = rowsOf(production());
  for (const [mb, name] of [["carlos.evandro@axion.com.br", "Carlos Evandro"], ["jaime.ramos@axion.com.br", "Jaime Ramos"]]) {
    const r = rows[mb];
    ok(st(r, "usuario").status === "COMPROVADO", `${mb} 1`);
    ok(r.stages.slice(1).every((s) => s.status !== "COMPROVADO" && s.status !== "INDICIO"), `${mb}: ${r.stages.map((s) => s.status).join()}`);
    ok(st(r, "autorizacao").label === `Aguardando autorização de ${name}`, st(r, "autorizacao").label);
    ok(r.pendencies.some((p) => p.includes(`Aguardando autorização de ${name}`)) && r.pendencies.some((p) => p.includes("Aguardando delegação no Google Workspace")), r.pendencies.join(" | "));
  }
});
check("D5 tabela de controles AUSENTE: todas as ações DESLIGADAS com explicação (falha fechada); servidor recusa mesmo administrador", () => {
  for (const r of buildMailboxDiagnostics(production(), NOW)) {
    ok(r.actions.every((a) => !a.enabled && a.reason === CONTROLS_MISSING_TEXT), r.mailbox);
    ok(!authorizeMailboxAdminAction({ isAdmin: true, row: r, action: "HABILITAR_COLETA" }).ok, "servidor deveria recusar");
  }
  ok(/20261107090000/.test(CONTROLS_MISSING_TEXT));
});
check("D6 com controles: sem aceite e sem corporativa => habilitar DESLIGADO 'Aguardando autorização de <pessoa>'; caixa fora da lista => registrar desligado", () => {
  const r = rowsOf(production({ controlsAvailability: "OK" }))["carlos.evandro@axion.com.br"];
  ok(!action(r, "HABILITAR_COLETA").enabled && action(r, "HABILITAR_COLETA").reason.includes("Aguardando autorização de Carlos Evandro"), action(r, "HABILITAR_COLETA").reason);
  ok(!action(r, "REGISTRAR_AUTORIZACAO").enabled && /fora da lista/.test(action(r, "REGISTRAR_AUTORIZACAO").reason), "registrar");
  ok(!action(r, "REVOGAR").enabled && !action(r, "DESABILITAR_COLETA").enabled, "nada a revogar/desligar");
});
check("D7 corporativa registrada, sem teste técnico => habilitar DESLIGADO 'Aguardando delegação no Google Workspace'; etapa 2 comprovada, 3 pendente", () => {
  const ev = production({ controlsAvailability: "OK", controls: [control()], allowlist: [...production().allowlist, { mailbox: "carlos.evandro@axion.com.br", enabled: true }] });
  const r = rowsOf(ev)["carlos.evandro@axion.com.br"];
  ok(st(r, "autorizacao").status === "COMPROVADO" && st(r, "tecnica").status === "PENDENTE", r.stages.map((s) => s.status).join());
  ok(/Aguardando delegação no Google Workspace/.test(action(r, "HABILITAR_COLETA").reason), action(r, "HABILITAR_COLETA").reason);
  ok(!action(r, "REGISTRAR_AUTORIZACAO").enabled && action(r, "REVOGAR").enabled, "registrar já feito; revogar disponível");
});
check("D8 técnica confirmada => habilitar LIBERADO só para administrador; não administrador recusado no servidor", () => {
  const ev = production({ controlsAvailability: "OK", controls: [control({ technical_permission_status: "CONFIRMADA", technical_checked_at: "2026-11-21T11:00:00Z" })] });
  const r = rowsOf(ev)["carlos.evandro@axion.com.br"];
  ok(action(r, "HABILITAR_COLETA").enabled, action(r, "HABILITAR_COLETA").reason);
  ok(authorizeMailboxAdminAction({ isAdmin: true, row: r, action: "HABILITAR_COLETA" }).ok, "admin");
  ok(!authorizeMailboxAdminAction({ isAdmin: false, row: r, action: "HABILITAR_COLETA" }).ok, "não admin");
  ok(!authorizeMailboxAdminAction({ isAdmin: true, row: null, action: "REVOGAR" }).ok, "caixa inexistente");
});
check("D9 aceite individual REVOGADO bloqueia etapa 2 e as ações de ativação, mesmo com corporativa e técnica confirmadas", () => {
  const ev = production({ controlsAvailability: "OK", controls: [control({ technical_permission_status: "CONFIRMADA" })],
    authorizations: [{ id: "c1", user_id: "car", account_email: "carlos.evandro@axion.com.br", status: "REVOGADO", requested_at: "2026-11-21T09:00:00Z", decided_at: "2026-11-21T12:00:00Z" }] });
  const r = rowsOf(ev)["carlos.evandro@axion.com.br"];
  ok(st(r, "autorizacao").status === "BLOQUEADO", st(r, "autorizacao").status);
  ok(!action(r, "HABILITAR_COLETA").enabled && /recusado ou revogado/.test(action(r, "HABILITAR_COLETA").reason), action(r, "HABILITAR_COLETA").reason);
});
check("D10 coleta comprovada só com controle ligado + período vigente; sync de OUTRA caixa nunca prova esta; suspensão por erros aparece", () => {
  const live = control({ technical_permission_status: "CONFIRMADA", collection_enabled: true, period_start: "2026-11-01T00:00:00Z", period_end: "2026-12-31T00:00:00Z", last_sync_status: "SUCESSO", last_sync_at: "2026-11-20T11:45:00Z" });
  const ev = production({ controlsAvailability: "OK", controls: [live, control({ mailbox_address: "jaime.ramos@axion.com.br" })] });
  const rows = rowsOf(ev);
  ok(st(rows["carlos.evandro@axion.com.br"], "habilitada").status === "COMPROVADO" && st(rows["carlos.evandro@axion.com.br"], "sincronizacao").status === "COMPROVADO", "carlos");
  ok(st(rows["carlos.evandro@axion.com.br"], "mensagens").status === "PENDENTE", "sincronizar não prova importação (etapa 6 independente)");
  ok(st(rows["jaime.ramos@axion.com.br"], "sincronizacao").status === "PENDENTE", "jaime não herda a sync do carlos");
  const expired = rowsOf(production({ controlsAvailability: "OK", controls: [{ ...live, period_end: "2026-11-10T00:00:00Z" }] }))["carlos.evandro@axion.com.br"];
  ok(st(expired, "habilitada").status === "BLOQUEADO", "período vencido");
  const suspended = rowsOf(production({ controlsAvailability: "OK", controls: [{ ...live, consecutive_errors: 5, collection_enabled: false, last_sync_status: "ERRO", last_sync_detail: "HTTP 503" }] }))["carlos.evandro@axion.com.br"];
  ok(st(suspended, "habilitada").label === "Suspensa por erros" && suspended.errors.some((e) => /503/.test(e)), suspended.errors.join());
});
check("D11 erros de RPC viram mensagens claras; nada de mensagem crua do banco", () => {
  ok(/Google Workspace/.test(friendlyMailboxRpcError("TECHNICAL_PERMISSION_REQUIRED")));
  ok(/recusou ou revogou/.test(friendlyMailboxRpcError("INDIVIDUAL_CONSENT_DENIED")));
  ok(friendlyMailboxRpcError('relation "public.email_mailbox_collection_controls" does not exist') === CONTROLS_MISSING_TEXT);
  ok(friendlyMailboxRpcError("algo interno xyz") === "Não foi possível concluir. Nada foi alterado.");
});
check("U1 página e ações: guarda de administrador no servidor, revalidação do estado, sucesso só após releitura do banco", () => {
  const actions = readFileSync(new URL("../apps/web/app/[projectId]/integracoes/caixas/actions.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../apps/web/app/[projectId]/integracoes/caixas/page.tsx", import.meta.url), "utf8");
  ok(actions.startsWith('"use server"') && actions.includes("isProjectAdmin(projectId)") && actions.includes("authorizeMailboxAdminAction("), "guarda");
  for (const fn of ["registerCorporateAuthorizationAction", "enableCollectionAction", "disableCollectionAction", "revokeCollectionAction"]) {
    const body = actions.slice(actions.indexOf(`export async function ${fn}`)).split("export async function")[1];
    ok(body.includes("await guard(formData") && body.includes("readControl(ctx)") && body.indexOf("supabase.rpc(") < body.indexOf("readControl(ctx)"), `${fn}: guarda + rpc + confirmação`);
  }
  ok(!/service_role|SUPABASE_SECRET_KEY|createSupabaseAdminClient/.test(actions + page), "nada de credencial privilegiada na interface");
  ok(page.includes("notFound()") && page.includes("isProjectAdmin(projectId)"), "página só para administrador");
  ok(!/record_mailbox_technical_check|record_mailbox_sync_result/.test(actions), "a interface não forja teste técnico nem sincronização");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
