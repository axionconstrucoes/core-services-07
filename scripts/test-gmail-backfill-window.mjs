// Janela histórica explícita do backfill de Gmail: regras de argumento, consulta, corte por instante e garantias estáticas
// do script (nunca atualiza o cursor incremental na janela explícita; somente leitura no Gmail; sem envio).
import { readFileSync } from "node:fs";
import { parseBackfillArgs, buildWindowQuery, withinWindow, monthKey, findFrozenEndConflict, emptyMonthStats } from "./lib/gmail-backfill-window.mjs";

let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log("OK   " + n); passed++; } catch (e) { console.log("FAIL " + n + "\n     " + e.message); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const throws = (fn, re) => { try { fn(); } catch (e) { ok(re.test(e.message), "mensagem inesperada: " + e.message); return; } throw new Error("deveria falhar"); };
const NOW = new Date("2026-11-11T15:00:00Z");

check("legado: sem --start exige --apply e preserva o comportamento", () => {
  throws(() => parseBackfillArgs([], NOW), /--apply/);
  const r = parseBackfillArgs(["--apply"], NOW); ok(r.mode === "LEGACY" && r.apply === true && r.startAt === null, "modo legado");
  throws(() => parseBackfillArgs(["--apply", "--limit=5"], NOW), /só valem com --start/);
});
check("explícita: exige --end, fuso no instante, início < fim e fim não futuro", () => {
  throws(() => parseBackfillArgs(["--start=2025-05-11T00:00:00-03:00", "--dry-run"], NOW), /--end/);
  throws(() => parseBackfillArgs(["--start=2025-05-11", "--end=2026-11-11T12:00:00Z", "--dry-run"], NOW), /fuso/);
  throws(() => parseBackfillArgs(["--start=2026-11-11T12:00:00Z", "--end=2025-05-11T00:00:00Z", "--dry-run"], NOW), /anterior/);
  throws(() => parseBackfillArgs(["--start=2025-05-11T00:00:00Z", "--end=2026-11-12T00:00:00Z", "--dry-run"], NOW), /futuro/);
});
check("explícita: exatamente um entre --apply e --dry-run; limite inteiro positivo", () => {
  const base = ["--start=2025-05-11T00:00:00-03:00", "--end=2026-11-11T12:00:00Z"];
  throws(() => parseBackfillArgs(base, NOW), /exatamente um/);
  throws(() => parseBackfillArgs([...base, "--apply", "--dry-run"], NOW), /exatamente um/);
  throws(() => parseBackfillArgs([...base, "--dry-run", "--limit=0"], NOW), /inteiro positivo/);
  const r = parseBackfillArgs([...base, "--dry-run", "--limit=25"], NOW);
  ok(r.mode === "EXPLICIT" && r.dryRun && !r.apply && r.limit === 25, "campos");
  ok(r.startAt.toISOString() === "2025-05-11T03:00:00.000Z" && r.endAt.toISOString() === "2026-11-11T12:00:00.000Z", "instantes");
});
check("consulta cobre os dois lados da janela e o corte final é por instante exato", () => {
  const s = new Date("2025-05-11T03:00:00Z"), e = new Date("2026-11-11T12:00:00Z");
  const q = buildWindowQuery({ startAt: s, endAt: e, senderQuery: "from:axion.com.br from:weg.net" });
  ok(q[0] === "after:2025/05/10" && q[1] === "before:2026/11/12" && q[2] === "{from:axion.com.br from:weg.net}", JSON.stringify(q));
  ok(withinWindow(e, s, e) && withinWindow(s, s, e), "bordas inclusivas");
  ok(!withinWindow(new Date(e.getTime() + 1), s, e), "depois do fim fica de fora");
  ok(!withinWindow(new Date(s.getTime() - 1), s, e), "antes do início fica de fora");
});
check("agrupamento por mês em UTC", () => {
  ok(monthKey(new Date("2025-05-31T23:59:59Z")) === "2025-05" && monthKey(new Date("2025-06-01T00:00:00Z")) === "2025-06", "meses");
});
const src = readFileSync(new URL("./gmail-inbound-ingest.mjs", import.meta.url), "utf8").split("\r\n").join("\n");
check("estático: o cursor incremental e o status da integração só são tocados fora da janela explícita", () => {
  const from = src.indexOf("if (EXPLICIT) {\n  // Janela explícita");
  const to = src.indexOf("process.exit(0);", from) + "process.exit(0);".length;
  ok(from > 0 && to > from, "bloco explícito não encontrado");
  const block = src.slice(from, to);
  ok(!/last_sync_at\s*:/.test(block), "o bloco explícito não pode gravar last_sync_at");
  ok(!/\.from\(\s*"project_integrations"/.test(block) && !/\.from\(\s*"project_email_ingestion_configs"/.test(block), "o bloco explícito não pode tocar configuração/integração");
  ok(/process\.exit\(0\)/.test(block), "deve encerrar antes das atualizações legadas");
});
check("estático: somente leitura no Gmail (sem send/modify/delete/trash/insert de mensagens) e paginação completa", () => {
  ok(!/gmail\.users\.messages\.(send|modify|delete|trash|insert|import|batchModify|batchDelete)/.test(src), "escrita no Gmail encontrada");
  ok(/users\.messages\.list/.test(src) && /nextPageToken/.test(src), "paginação completa ausente");
});
check("estático: workflow é manual, com caixa/obra fixas, sem schedule e no grupo de concorrência do coletor", () => {
  const wf = readFileSync(new URL("../.github/workflows/gmail-historical-backfill.yml", import.meta.url), "utf8");
  ok(/workflow_dispatch/.test(wf) && !/^\s*schedule:/m.test(wf), "deve ser somente manual");
  ok(/group: gmail-historical-backfill/.test(wf) && !/group: gmail-inbound-sync/.test(wf.replace(/#.*$/gm, "")), "grupo próprio: sem cancelamento cruzado com o incremental");
  ok(/cancel-in-progress: false/.test(wf), "não cancela execução em andamento");
  ok(/GOOGLE_GMAIL_INBOUND_MAILBOX: reynaldo@axion\.com\.br/.test(wf), "caixa fixa");
  ok(!/corazza|marcio\.felix|ricardo|jaime/i.test(wf.replace(/#.*$/gm, "")), "nenhuma outra caixa");
  ok(!/ghp_|AKIA|BEGIN PRIVATE/.test(wf), "sem segredo literal");
});
check("fim congelado: mesmo início com fim diferente é recusado; mesmo fim e início diferente passam", () => {
  const s = new Date("2025-05-11T03:00:00Z"), e = new Date("2026-11-11T12:00:00Z");
  const rows = [{ detail: "Executor. Caixa x. Janela 2025-05-11T03:00:00.000Z -> 2026-11-11T12:00:00.000Z. Modo DRY-RUN." }];
  ok(findFrozenEndConflict(rows, s, e) === null, "mesmo fim passa");
  ok(findFrozenEndConflict(rows, s, new Date(e.getTime() + 60000)) === "2026-11-11T12:00:00.000Z", "fim diferente deve ser recusado");
  ok(findFrozenEndConflict(rows, new Date("2025-06-01T00:00:00Z"), new Date(e.getTime() + 60000)) === null, "outro início é outra janela");
  ok(findFrozenEndConflict([{ detail: null }, {}], s, e) === null, "linhas sem janela são ignoradas");
});
check("relatório: execução incompleta com --limit, direção indeterminada e rejeições por domínio/escopo", () => {
  ok(/execucao_incompleta: messageIds\.length < totalCandidatesInGmail/.test(src), "relatório de execução incompleta");
  ok(/candidatas_nao_analisadas/.test(src) && /paginacao_concluida/.test(src), "campos de paginação");
  ok(/direcao_indeterminada/.test(src) && /rejeitadas_por_dominio/.test(src) && /rejeitadas_por_escopo/.test(src), "contagens do relatório");
  const st = emptyMonthStats(); ok("direcao_indeterminada" in st && "rejeitadas_por_dominio" in st, "estrutura do relatório por mês");
});
check("estático: modo legado preservado (cursor e integração gravados fora da janela explícita) e fim congelado em ambos os modos", () => {
  ok(/last_sync_at: completedAt/.test(src) && /status: "PENDENTE"/.test(src), "caminho legado intacto");
  ok(/dry-run com janela explícita/.test(src) && /findFrozenEndConflict/.test(src), "dry-run também é registrado e congela o fim");
});
check("estático: nenhuma chamada paga de IA nem envio de e-mail no script e no workflow", () => {
  const wf = readFileSync(new URL("../.github/workflows/gmail-historical-backfill.yml", import.meta.url), "utf8");
  ok(!/anthropic|openai|messages\.create|nodemailer|sendgrid|smtp|resend/i.test(src + wf), "IA paga ou envio encontrado");
});
check("reexecução sem duplicidade: checagem prévia dos já existentes + conflito 23505 tratado como duplicada + dry-run sem escrita", () => {
  ok(/existingIds\.has\(message\.id\)/.test(src), "checagem prévia");
  const lib = readFileSync(new URL("./lib/gmail-insert-idempotent.mjs", import.meta.url), "utf8");
  ok(src.includes("insertEmailsIdempotent(supabase, rowsToInsert)"), "o script usa a inserção idempotente");
  ok(lib.includes('result.error.code === "23505"') && lib.includes("else throw new Error"), "23505 = duplicada; outro erro aborta");
  ok(src.includes("if (!(EXPLICIT && RUN.dryRun)) {"), "dry-run não insere");
});
console.log(`\n${passed} OK, ${failed} falha(s)`); process.exit(failed ? 1 : 0);
