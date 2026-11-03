// Testes da autorização de acesso aos e-mails por obra e do cabeçalho "Fale com a AXIA" nos e-mails.
// Lógica pura + checagens estruturais + inventário dos remetentes. Nenhum e-mail real, nenhuma rede.
// (As regras de banco — quem solicita/decide/revoga, isolamento, histórico imutável — têm o seu teste real em
// scripts/sql/run-email-authorization-test.mjs.)
//
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-email-authorization.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const notice = await import("../apps/web/lib/email-authorization/notice");
const requestEmail = await import("../apps/web/lib/email-authorization/request-email");
const vera = await import("../apps/web/lib/email/branding/vera-email-header");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (rel) => readFileSync(path.join(root, rel), "utf8");
let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
};

const ID = "99999999-9999-4999-8999-999999999999";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const BASE = "https://acc.axion.com.br";

// ---------- Texto e escopo (fatos verificáveis) ----------
await check("o escopo OAuth do texto é o mesmo dos scripts de autorização do Gmail (gmail.readonly)", () => {
  eq(notice.GMAIL_OAUTH_SCOPE, "https://www.googleapis.com/auth/gmail.readonly", "constante");
  // Somente arquivos VERSIONADOS: o script de autorização que pede o escopo e o módulo que o declara para a leitura da caixa.
  // (Scripts pessoais/locais de autorização, ignorados pelo Git, não podem ser pré-condição do teste.)
  for (const f of ["scripts/gmail-inbound-oauth.mjs", "apps/web/lib/risk-alerts/replies/inbound-credentials.ts"]) ok(rd(f).includes(notice.GMAIL_OAUTH_SCOPE), `${f} não usa o escopo declarado`);
  const requested = rd("scripts/gmail-inbound-oauth.mjs").match(/https:\/\/www\.googleapis\.com\/auth\/[a-z._]+/g) ?? [];
  ok(requested.includes(notice.GMAIL_OAUTH_SCOPE) && requested.every((scope) => !/gmail\.(send|modify|compose|insert|labels|settings)/.test(scope)), "o script de autorização pede escopo de escrita no Gmail");
  const syncScripts = rd("scripts/gmail-inbound-sync.mjs");
  ok(!/gmail\.send|gmail\.modify|messages\.(send|delete|trash|modify)/.test(syncScripts), "a sincronização usa método que escreve na caixa");
});

await check("o texto NÃO afirma que o Google restringe à obra e diz que a limitação é dos filtros do ACC", () => {
  const snap = notice.buildEmailAuthScopeSnapshot();
  eq(snap.googleRestrictsToProject, false, "googleRestrictsToProject");
  eq(snap.readOnly, true, "readOnly");
  const all = notice.getNoticeSections(notice.EMAIL_AUTH_NOTICE_VERSION).flatMap((s) => s.paragraphs).join(" ");
  ok(/não é limitada a uma obra/.test(all) && /caixa inteira/.test(all) && /filtros do próprio ACC/.test(all), "falta a ressalva do escopo amplo");
  ok(!/o Google (limita|restringe) (o acesso )?(à|a esta) obra/i.test(all), "afirma restrição do Google");
});

await check("o texto cobre finalidade, permissões, filtros, recusa, revogação no ACC e no Google, e separa aceite de conexão", () => {
  const sections = notice.getNoticeSections(notice.EMAIL_AUTH_NOTICE_VERSION);
  eq(sections.map((s) => s.id).join(","), "finalidade,permissoes,filtros,recusa,revogacao-acc,revogacao-google", "seções");
  const all = sections.flatMap((s) => s.paragraphs).join(" ");
  ok(all.includes(notice.GOOGLE_PERMISSIONS_URL), "sem o endereço de revogação no Google");
  ok(/não conecta nem desconecta a conta/.test(all), "não separa aceite de conexão");
  eq(notice.getNoticeSections("versao-inexistente"), null, "versão desconhecida");
});

await check("situação do aceite e da conexão têm rótulos distintos", () => {
  eq(notice.authorizationStatusLabel("AUTORIZADO"), "Autorizado", "aceite");
  eq(notice.connectionStatusLabel("CONNECTED"), "Conta conectada", "conexão");
  eq(notice.connectionStatusLabel("NOT_CONNECTED"), "Conta não conectada", "não conectada");
  eq(notice.connectionStatusLabel(null), "Conta não registrada no ACC", "sem registro");
});

await check("a ação por query string só ABRE a confirmação e só quando faz sentido para o estado", () => {
  eq(notice.parseAuthorizationAction("autorizar", "PENDENTE"), "autorizar", "autorizar/pendente");
  eq(notice.parseAuthorizationAction("recusar", "PENDENTE"), "recusar", "recusar/pendente");
  eq(notice.parseAuthorizationAction("revogar", "AUTORIZADO"), "revogar", "revogar/autorizado");
  for (const [a, s] of [["autorizar", "AUTORIZADO"], ["autorizar", "RECUSADO"], ["revogar", "PENDENTE"], ["revogar", "REVOGADO"], ["apagar", "PENDENTE"], [undefined, "PENDENTE"], ["", "PENDENTE"]])
    eq(notice.parseAuthorizationAction(a, s), null, `${a}/${s}`);
});

// ---------- E-mail individual ----------
const email = requestEmail.buildAuthorizationRequestEmail({
  collaboratorName: "Maria <b>da</b> Silva",
  accountEmail: "maria.silva@axion.com.br",
  projectName: "Obra Exemplo & Cia",
  authorizationId: ID,
  baseUrl: `${BASE}/`,
});

await check("e-mail individual: nome, conta, obra, finalidade, permissões, filtros e as duas opções", () => {
  for (const part of ["Maria", "maria.silva@axion.com.br", "Obra Exemplo", "Finalidade", "Permissões efetivas", "Filtros aplicados pelo ACC", "gmail.readonly", "AUTORIZAR ACESSO PARA ESTA OBRA", "NÃO AUTORIZAR"])
    ok(email.html.includes(part) || email.text.includes(part), `falta: ${part}`);
  ok(email.subject.includes("Obra Exemplo & Cia") && email.subject.startsWith("Autorização de acesso aos e-mails da obra"), email.subject);
  ok(/não se limita a uma obra|não é limitada a uma obra/.test(email.html), "e-mail sem a ressalva do escopo amplo");
});

await check("e-mail: HTML escapa o nome/obra e os botões são links para a página autenticada (sem tokens nem dados pessoais)", () => {
  ok(!email.html.includes("<b>da</b>") && email.html.includes("&lt;b&gt;da&lt;/b&gt;"), "nome não escapado");
  const links = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  eq(links.length, 2, "quantidade de links");
  eq(links[0], `${BASE}/autorizacao-email/${ID}?acao=autorizar`, "link autorizar");
  eq(links[1], `${BASE}/autorizacao-email/${ID}?acao=recusar`, "link recusar");
  for (const link of links) ok(!/token|senha|@|maria|silva/i.test(link), `dado pessoal na URL: ${link}`);
});

await check("e-mail: avisa que abrir o link não registra resposta e tem alternativa em texto com os mesmos links", () => {
  ok(/não registra nenhuma resposta/.test(email.html) && /não registra nenhuma resposta/.test(email.text), "sem o aviso de GET");
  ok(email.text.includes(`AUTORIZAR ACESSO PARA ESTA OBRA: ${BASE}/autorizacao-email/${ID}?acao=autorizar`), "texto sem link autorizar");
  ok(email.text.includes(`NÃO AUTORIZAR: ${BASE}/autorizacao-email/${ID}?acao=recusar`), "texto sem link recusar");
});

// ---------- Cabeçalho "Fale com a AXIA" ----------
await check("URL da AXIA: contexto da autorização, da obra ou ajuda geral; só ids (UUID) e tipo fixo", () => {
  eq(vera.buildVeraUrl(BASE, { authorizationId: ID, projectId: PROJECT, context: "autorizacao" }), `${BASE}/autorizacao-email/${ID}?vera=abrir`, "autorização");
  eq(vera.buildVeraUrl(BASE, { projectId: PROJECT, context: "alerta" }), `${BASE}/${PROJECT}/ajuda?vera=abrir&contexto=alerta`, "alerta");
  eq(vera.buildVeraUrl(BASE, { projectId: PROJECT, context: "providencia" }), `${BASE}/${PROJECT}/ajuda?vera=abrir&contexto=providencia`, "providência");
  eq(vera.buildVeraUrl(BASE), `${BASE}/vera`, "sem contexto");
  eq(vera.buildVeraUrl(BASE, {}), `${BASE}/vera`, "vazio");
  eq(vera.buildVeraUrl(BASE, { projectId: "joao@axion.com.br" }), `${BASE}/vera`, "dado pessoal no lugar do id é ignorado");
  eq(vera.buildVeraUrl(BASE, { projectId: PROJECT, context: "x&y=<script>" }), `${BASE}/${PROJECT}/ajuda?vera=abrir&contexto=geral`, "contexto inválido vira geral");
  eq(vera.buildVeraUrl(`${BASE}///`, {}), `${BASE}/vera`, "barras finais");
});

const image = { cid: vera.VERA_EMAIL_IMAGE_CID, filename: "ajuda-acc-email.png", mimeType: "image/png", contentBase64: "AAAA" };
const baseInput = { to: "a@axion.com.br", subject: "S", text: "Corpo", html: "<html><body style=\"x\"><p>Conteúdo</p></body></html>", correlationId: "c1" };

await check("cabeçalho: foto circular + 'Fale com a AXIA' à direita, link, alt legível; conteúdo preservado", () => {
  const out = vera.applyVeraEmailHeader({ ...baseInput, vera: { projectId: PROJECT, context: "alerta" } }, { baseUrl: BASE, loadImage: () => image });
  ok(out.html.includes('align="right"') && out.html.includes("Fale com a AXIA") && out.html.includes(`cid:${image.cid}`), "cabeçalho incompleto");
  ok(out.html.includes("border-radius:20px") && out.html.includes('alt="AXIA — Assistente ACC"'), "foto circular/alt");
  ok(out.html.includes(`href="${BASE}/${PROJECT}/ajuda?vera=abrir&amp;contexto=alerta"`), "link");
  ok(out.html.includes("<p>Conteúdo</p>") && out.html.indexOf("data-vera-header") < out.html.indexOf("<p>Conteúdo</p>"), "conteúdo preservado e cabeçalho antes");
  ok(out.html.startsWith("<html><body"), "estrutura do documento");
  eq(out.subject, baseInput.subject, "assunto");
  eq(out.inlineImages.length, 1, "imagem anexada");
  ok(out.text.startsWith("Fale com a AXIA (assistente do ACC): ") && out.text.endsWith("Corpo"), "texto alternativo");
});

await check("cabeçalho: sem imagem disponível, o texto-link continua (alternativa legível)", () => {
  const out = vera.applyVeraEmailHeader(baseInput, { baseUrl: BASE, loadImage: () => null });
  ok(out.html.includes("Fale com a AXIA") && !out.html.includes("cid:"), "sem imagem: texto deve permanecer");
  eq(out.inlineImages, undefined, "sem anexo");
});

await check("cabeçalho: idempotente, não duplica a imagem e não age sem URL base", () => {
  const once = vera.applyVeraEmailHeader(baseInput, { baseUrl: BASE, loadImage: () => image });
  const twice = vera.applyVeraEmailHeader(once, { baseUrl: BASE, loadImage: () => image });
  eq(twice.html, once.html, "idempotência");
  const withLogo = vera.applyVeraEmailHeader({ ...baseInput, inlineImages: [image] }, { baseUrl: BASE, loadImage: () => image });
  eq(withLogo.inlineImages.length, 1, "imagem duplicada");
  eq(vera.applyVeraEmailHeader(baseInput, { baseUrl: "" }), baseInput, "sem base: igual");
  eq(vera.applyVeraEmailHeader(baseInput, { baseUrl: "javascript:alert(1)" }), baseInput, "base inválida");
});

await check("e-mail só em texto e HTML sem <body> também recebem a AXIA", () => {
  const textOnly = vera.applyVeraEmailHeader({ to: "a@axion.com.br", subject: "S", text: "Corpo", correlationId: "c" }, { baseUrl: BASE, loadImage: () => image });
  ok(textOnly.text.startsWith("Fale com a AXIA") && textOnly.html === undefined, "texto simples");
  const noBody = vera.applyVeraEmailHeader({ ...baseInput, html: "<table><tr><td>X</td></tr></table>" }, { baseUrl: BASE, loadImage: () => image });
  ok(noBody.html.startsWith("<table role=\"presentation\"") && noBody.html.endsWith("</table>"), "sem body");
});

await check("pelo provider (guarda do piloto + AXIA): o destino continua redirecionado e o cabeçalho entra", async () => {
  const previous = process.env.AXION_APP_BASE_URL;
  const previousRecipient = process.env.ACC_PILOT_RECIPIENT;
  process.env.AXION_APP_BASE_URL = BASE;
  process.env.ACC_PILOT_RECIPIENT = "crm@axion.com.br";
  try {
    let seen = null;
    const provider = new FakeEmailProvider({ onGuardedInput: (input) => (seen = input) });
    await provider.send({ ...baseInput, to: "cliente.externo@exemplo.com", vera: { projectId: PROJECT, context: "alerta" } });
    ok(seen && seen.html.includes("Fale com a AXIA"), "provider não aplicou a AXIA");
    eq(seen.to, "crm@axion.com.br", "destino redirecionado à caixa de teste");
    ok(seen.subject.startsWith("[TESTE CONTROLADO]") || process.env.ACC_OUTBOUND_MODE === "production", "guarda do piloto alterada");
  } finally {
    if (previous === undefined) delete process.env.AXION_APP_BASE_URL;
    else process.env.AXION_APP_BASE_URL = previous;
    if (previousRecipient === undefined) delete process.env.ACC_PILOT_RECIPIENT;
    else process.env.ACC_PILOT_RECIPIENT = previousRecipient;
  }
});

// ---------- Inventário de remetentes ----------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next"].includes(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

await check("TODO ponto de envio passa por provider.send (que aplica a guarda e a AXIA); contexto informado onde há obra", () => {
  const web = path.join(root, "apps/web");
  const files = walk(web).filter((f) => /\.(getEmailProvider\(\)|provider|sender)?send\(\{/.test("") || /(getEmailProvider\(\)|provider|ctx\.provider|mailer)\.send\(\{/.test(readFileSync(f, "utf8")));
  const rel = files.map((f) => path.relative(root, f).replaceAll("\\", "/"));
  // Pontos de envio esperados (11) — um novo remetente precisa entrar aqui de propósito.
  const expected = [
    "apps/web/lib/alerts/delivery-item-reminder-mailer.ts",
    "apps/web/lib/alerts/followup-engine.ts",
    "apps/web/lib/email/action-request-notification-core.ts",
    "apps/web/lib/email/create-and-send-contract-alert-batch.ts",
    "apps/web/lib/email/send-contract-alert-email.ts",
    "apps/web/lib/email/send-sla-escalation-email.ts",
    "apps/web/lib/email/send-ssma-accident-alert-email.ts",
    "apps/web/lib/email/send-system-health-alert-email.ts",
    "apps/web/lib/email/send-version-impact-review-email.ts",
    "apps/web/lib/email/send-weekly-alert-digest-email.ts",
    "apps/web/lib/email-authorization/request.ts",
    "apps/web/lib/risk-alerts/run-risk-alert-cycle.ts",
  ].sort();
  eq(JSON.stringify(rel.sort()), JSON.stringify(expected), "remetentes encontrados");
  // Sem obra no contexto (a AXIA abre a ajuda geral): saúde do sistema e revisão de impacto de versão.
  // followup-engine só delega ao mailer (delivery-item-reminder-mailer), que já informa o contexto.
  const withoutProject = new Set(["apps/web/lib/email/send-system-health-alert-email.ts", "apps/web/lib/email/send-version-impact-review-email.ts", "apps/web/lib/alerts/followup-engine.ts"]);
  for (const f of rel) if (!withoutProject.has(f)) ok(/vera:\s*\{/.test(rd(f)), `${f}: sem contexto da AXIA`);
  // O contexto da AXIA precisa estar DENTRO da chamada de envio (provider.send({ ... })), nunca em um insert/upsert
  // do banco (uma coluna inexistente derrubaria lotes e lembretes). Procura o abridor mais próximo antes de cada `vera:`.
  for (const f of rel) {
    const src = rd(f);
    for (const match of src.matchAll(/vera:\s*\{/g)) {
      const before = src.slice(0, match.index);
      const lastSend = before.lastIndexOf(".send(");
      const lastWrite = Math.max(before.lastIndexOf(".insert("), before.lastIndexOf(".upsert("), before.lastIndexOf(".update("));
      ok(lastSend > lastWrite, `${f}: 'vera:' fora de uma chamada send({...}) (perto de insert/upsert/update)`);
    }
  }
  const provider = rd("apps/web/lib/email/gmail-email-provider.ts") + rd("apps/web/lib/email/fake-email-provider.ts");
  eq((provider.match(/applyVeraEmailHeader\(applyPilotOutboundGuard\(input\)\)/g) ?? []).length, 2, "providers aplicam guarda + AXIA");
});

// ---------- Páginas e controles ----------
const page = rd("apps/web/app/autorizacao-email/[authorizationId]/page.tsx");
const actions = rd("apps/web/app/autorizacao-email/[authorizationId]/actions.ts");
const adminPage = rd("apps/web/app/[projectId]/autorizacoes/page.tsx");
const adminActions = rd("apps/web/app/[projectId]/autorizacoes/actions.ts");

await check("página de autorização: leitura apenas (GET não grava); decisão só por formulário com confirmação", () => {
  ok(!/\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(page), "a página (GET) escreve no banco");
  ok(page.includes("action={decideAuthorizationAction}") && page.includes("action={revokeAuthorizationAction}"), "sem formulários");
  ok(/name="confirm"[^>]*required/.test(page), "caixa de confirmação não é obrigatória");
  ok(page.includes("parseAuthorizationAction") && page.includes("nada é registrado só por abrir esta página"), "GET deve só abrir a confirmação");
  ok(actions.includes('formData.get("confirm") === "sim"') && actions.includes("EMAIL_AUTH_NOTICE_VERSION"), "ação sem confirmação/versão");
  ok(actions.includes("decide_email_access_authorization") && actions.includes("revoke_email_access_authorization"), "ações sem as funções do banco");
});

await check("cabeçalho da página: logo ACC à esquerda, título centralizado, foto da AXIA clicável à direita, em uma linha", () => {
  ok(/grid-cols-\[auto_1fr_auto\]/.test(page), "grade de 3 colunas");
  const logo = page.indexOf('src="/branding/acc-logo.png"');
  const title = page.indexOf("Autorização de acesso aos e-mails da obra</h1>");
  const trigger = page.indexOf('<VeraTrigger context="autorizacao"');
  ok(logo > 0 && title > logo && trigger > title, "ordem logo → título → AXIA");
  ok(page.includes("text-center") && page.includes("<AssistantWidget projectId={authorization.projectId} />"), "título centralizado e caixa da AXIA");
  ok(!rd("apps/web/app/login/page.tsx").includes("ajuda-acc"), "a tela de login não deve ter a AXIA");
});

await check("aba Autorizações: só administrador (menu, servidor, ações e banco); a página não usa chave de serviço", () => {
  const nav = rd("apps/web/lib/ui/nav-items.ts");
  ok(/href: "autorizacoes"[^\n]*restrictedTo: "admin"/.test(nav), "item de menu sem restrição de administrador");
  ok(adminPage.includes("isProjectAdmin(projectId)") && adminPage.includes("notFound()"), "página sem controle no servidor");
  ok(adminActions.includes("isProjectAdmin(projectId)"), "ações sem controle no servidor");
  const lib = [rd("apps/web/lib/email-authorization/store.ts"), rd("apps/web/lib/email-authorization/guard.ts"), rd("apps/web/lib/email-authorization/request.ts"), page, adminPage].join("\n");
  ok(!/service_role|createSupabaseAdminClient|SUPABASE_SECRET_KEY/.test(lib), "usa chave de serviço");
  const mig = rd("supabase/migrations/20261029120000_email_access_authorizations.sql");
  ok(mig.includes("has_project_permission(project_id, 'ADMINISTRADOR')") && /enable row level security/.test(mig) && !/create policy[^;]*for (insert|update|delete)/.test(mig), "RLS/função do banco");
  ok((mig.match(/set search_path = ''/g) ?? []).length >= 4, "search_path vazio nas funções");
});

await check("a rota de autorização exige login (não é rota pública do proxy)", () => {
  const proxy = rd("apps/web/proxy.ts") + rd("apps/web/lib/cron/public-cron-routes.ts");
  ok(!/autorizacao-email|\/vera/.test(proxy), "rota listada como pública");
});

await check("sem font-black nas telas novas", () => {
  for (const f of ["apps/web/app/autorizacao-email/[authorizationId]/page.tsx", "apps/web/app/[projectId]/autorizacoes/page.tsx", "apps/web/app/vera/page.tsx", "apps/web/components/assistant/vera-trigger.tsx"])
    ok(!/font-(black|extrabold)/.test(rd(f)), `${f}: peso Black`);
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
