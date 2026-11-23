// Consistência do roteiro de aceitação operacional (docs/implantacao/20-aceitacao-operacional-piloto-weg.md) com o repositório.
// Só lê arquivos; sem rede, sem banco. Confere: (1) toda rota citada existe em apps/web/app; (2) o apêndice A lista exatamente as
// páginas existentes; (3) os itens citados no apêndice estão definidos; (4) perfis/níveis citados existem na matriz; (5) flags e
// constantes citadas existem no código; (6) SLA da WEG e trava de piloto conforme o código; (7) sem caminho local, e-mail real ou segredo.
// Uso: node scripts/test-aceitacao-roteiro.mjs
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const DOC = "docs/implantacao/20-aceitacao-operacional-piloto-weg.md";

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`);
  }
}
const assert = (c, m = "asserção falhou") => {
  if (!c) throw new Error(m);
};

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (/node_modules|[\\/]\.next[\\/]/.test(full)) continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

// Rotas reais: apps/web/app/**/page.tsx -> "/seg/[param]/..."
const appDir = path.join(root, "apps", "web", "app");
const realRoutes = [...walk(appDir)]
  .filter((f) => path.basename(f) === "page.tsx")
  .map((f) => {
    const rel = path.relative(appDir, path.dirname(f)).split(path.sep).join("/");
    return rel === "" ? "/" : `/${rel}`;
  })
  .sort();
const routeShape = (r) => r.replace(/\[[^\]]+\]/g, "[]");
const realShapes = new Map(realRoutes.map((r) => [routeShape(r), r]));

const doc = read(DOC);
const appendixStart = doc.indexOf("## 6. Mapa de cobertura das 66 rotas");
const appendixEnd = doc.indexOf("## 7. Critérios de parada");
assert(appendixStart > 0 && appendixEnd > appendixStart, "apêndice A não encontrado");
const appendix = doc.slice(appendixStart, appendixEnd);

// Todas as rotas citadas entre crases no documento (inclusive as de tabelas).
const ROUTE_ROOTS = /^\/(\[projectId\]|login|projetos|ssma|alertas|email-actions|juridico|vera|autorizacao-email)(\/|$|\?)/;
const cited = new Set();
for (const m of doc.matchAll(/`(\/[^`\s]*)`/g)) {
  let r = m[1].split("?")[0].replace(/\/$/, "") || "/";
  if (/\.\.\.$/.test(r)) continue; // prefixo ilustrativo (ex.: /email-actions/...), não é rota completa
  r = r.replace(/<[^>]+>/g, "[x]"); // marcador de exemplo (ex.: <token>)
  if (r === "/" || ROUTE_ROOTS.test(r)) cited.add(r);
}

check("o documento existe e cita rotas", () => {
  assert(existsSync(path.join(root, DOC)));
  assert(cited.size >= 40, `poucas rotas citadas: ${cited.size}`);
});

check("existem 66 páginas em apps/web/app (premissa do documento)", () => {
  assert(realRoutes.length === 66, `encontradas ${realRoutes.length}`);
});

check("toda rota citada existe em apps/web/app (comparação por forma, parâmetros dinâmicos coringa)", () => {
  const missing = [];
  for (const r of cited) {
    // Rotas com id de obra do tipo /[idTESTE-2]/... ou parâmetros com outro nome são normalizadas.
    const shape = routeShape(r.replace(/^\/\[id[^\]]*\]/, "/[projectId]"));
    if (!realShapes.has(shape)) missing.push(r);
  }
  assert(missing.length === 0, `rotas inexistentes: ${missing.join(", ")}`);
});

check("apêndice A lista exatamente as 66 páginas reais, sem duplicata", () => {
  const rows = [...appendix.matchAll(/^\| `(\/[^`]*)` \|/gm)].map((m) => m[1]);
  assert(new Set(rows).size === rows.length, "rota repetida no apêndice");
  const got = new Set(rows.map(routeShape));
  const want = new Set(realRoutes.map(routeShape));
  const absent = [...want].filter((x) => !got.has(x));
  const extra = [...got].filter((x) => !want.has(x));
  assert(absent.length === 0, `páginas reais fora do apêndice: ${absent.join(", ")}`);
  assert(extra.length === 0, `rotas do apêndice sem página: ${extra.join(", ")}`);
  assert(rows.length === realRoutes.length, `linhas ${rows.length} x páginas ${realRoutes.length}`);
});

check("cada rota do apêndice tem item de teste ou 'N/T' com motivo; os itens citados estão definidos", () => {
  const defined = new Set([...doc.matchAll(/^\| ([A-K]\.\d{2}) \|/gm)].map((m) => m[1]));
  assert(defined.size >= 80, `poucos itens definidos: ${defined.size}`);
  const problems = [];
  for (const m of appendix.matchAll(/^\| `(\/[^`]*)` \| (.+) \|$/gm)) {
    const cell = m[2];
    if (/^N\/T: .{8,}/.test(cell)) continue;
    const ids = cell.match(/[A-K]\.\d{2}/g);
    if (!ids) problems.push(`${m[1]} sem item`);
    else for (const id of ids) if (!defined.has(id)) problems.push(`${m[1]} cita ${id} indefinido`);
  }
  assert(problems.length === 0, problems.join("; "));
});

check("blocos A a K presentes, com item obrigatório de cada tema pedido", () => {
  for (const b of "ABCDEFGHIJK") assert(new RegExp(`^### Bloco ${b} - `, "m").test(doc), `bloco ${b} ausente`);
  for (const id of ["A.04", "A.06", "B.14", "B.15", "B.16", "C.07", "D.08", "E.07", "E.08", "F.06", "F.07", "G.07", "G.08", "G.12", "H.05", "I.00", "I.07", "J.02", "K.01"])
    assert(new RegExp(`^\\| ${id.replace(".", "\\.")} \\|`, "m").test(doc), `${id} ausente`);
});

check("perfis e níveis citados existem em project-tier.ts e na matriz central", () => {
  const tier = read("apps/web/lib/permissions/project-tier.ts");
  const matrix = read("docs/permissoes-matriz-central.md");
  for (const role of ["ADMINISTRADOR", "GESTOR", "GERENTE", "COLABORADOR", "LEITURA"]) {
    assert(doc.includes(role), `${role} não citado no documento`);
    assert(tier.includes(role), `${role} ausente em project-tier.ts`);
    assert(matrix.includes(role), `${role} ausente na matriz central`);
  }
  for (const level of ["ADMIN", "MANAGE", "REGISTER", "READ", "NONE"]) {
    assert(doc.includes(level), `${level} não citado no documento`);
    assert(new RegExp(`\\b${level}\\b`).test(tier), `${level} ausente em project-tier.ts`);
  }
});

check("menu: itens restritos e níveis do quadro de visibilidade batem com nav-items.ts e nav-access.ts", () => {
  const nav = read("apps/web/lib/ui/nav-items.ts");
  const access = read("apps/web/lib/permissions/nav-access.ts");
  for (const href of ["ledger", "integracoes", "usuarios", "autorizacoes", "reemissao-alertas", "startup"])
    assert(new RegExp(`href: "${href}"[^\\n]*restrictedTo: "admin"`).test(nav), `${href} não é restrito a admin no menu`);
  assert(/href: "financeiro"[^\n]*restrictedTo: "financial"/.test(nav), "financeiro não é restrito por acesso financeiro");
  for (const seg of ["qualidade", "garantias", "seguros", "pilares", "competencias"])
    assert(new RegExp(`"?${seg}"?: "READ"`).test(access), `${seg} deveria ser READ`);
  assert(/"aprovacoes-externas": "REGISTER"/.test(access), "aprovacoes-externas deveria ser REGISTER");
});

check("flags e variáveis citadas existem no código ou nos docs de implantação", () => {
  const corpus = [
    ...[...walk(path.join(root, "apps", "web"))].filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => readFileSync(f, "utf8")),
    read("docs/implantacao/04-requisitos-email.md"),
    read("docs/email-respostas-lote3.md"),
    read("docs/weekly-schedule-email-ingestion.md"),
    read("docs/axia-conversa-natural.md"),
  ].join("\n");
  const names = new Set(doc.match(/\b(?:ACC|AXIA)_[A-Z0-9_]+\b/g) ?? []);
  assert(names.size >= 12, `poucas variáveis citadas: ${names.size}`);
  const absent = [...names].filter((n) => !corpus.includes(n));
  assert(absent.length === 0, `variáveis sem origem no repositório: ${absent.join(", ")}`);
});

check("trava de piloto: destinatário único crm@axion.com.br e modo production exato, conforme o código", () => {
  const guard = read("apps/web/lib/email/pilot-outbound-guard.ts");
  assert(guard.includes('ACC_EXPECTED_PILOT_RECIPIENT = "crm@axion.com.br"'), "constante do destinatário mudou");
  assert(/resolvePilotAllowedRecipients\(\): string\[\] \{\s*return \[ACC_EXPECTED_PILOT_RECIPIENT\];/.test(guard), "allowlist efetiva não é só a caixa institucional");
  assert(guard.includes('raw === "production"'), "valor exato production mudou");
  assert(guard.includes('PILOT_SUBJECT_PREFIX = "[TESTE CONTROLADO] "'), "prefixo de assunto mudou");
  assert(doc.includes("crm@axion.com.br") && doc.includes("[TESTE CONTROLADO]"));
});

check("flag SSMA: só o valor exato false desliga (padrão ligado), como o documento afirma", () => {
  const content = read("apps/web/lib/ssma/field-notifications/content.ts");
  assert(/ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED !== "false"/.test(content));
  assert(doc.includes("valor exato `false`"));
});

check("comandos de resposta e botões existem no código (RESOLVIDO, EM ANDAMENTO, ENVIAR PARA, ESPECIALISTA)", () => {
  const mailto = read("apps/web/lib/email-replies/reply-mailto.ts");
  assert(/"RESOLVIDO" \| "EM_ANDAMENTO" \| "ENVIAR_PARA" \| "ESPECIALISTA"/.test(mailto));
  for (const code of ["COMMAND_AMBIGUOUS", "TOKEN_ALREADY_USED", "TOKEN_NOT_OWNER", "ITEM_CLOSED", "RESOLVE_DESCRIPTION_REQUIRED", "COMMAND_NOT_RECOGNIZED"])
    assert(doc.includes(code), `${code} não citado`);
  const corpus = read("apps/web/lib/email-replies/token-reply-decision.ts") + read("docs/email-respostas-lote3.md");
  for (const code of ["COMMAND_AMBIGUOUS", "TOKEN_ALREADY_USED", "TOKEN_NOT_OWNER", "ITEM_CLOSED", "RESOLVE_DESCRIPTION_REQUIRED", "COMMAND_NOT_RECOGNIZED"])
    assert(corpus.includes(code), `${code} sem origem no código/doc`);
});

check("SLA da WEG no documento: 1 h corrida, 4 h úteis, 1 d.u., 3 d.u.; 2/5 só como padrão do código", () => {
  assert(/CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 1 dia útil; BAIXO 3 dias úteis/.test(doc));
  assert(/NÃO afirma 2 e 5 para a WEG/.test(doc));
  const weg = read("docs/sla-regras-duplicadas-weg.md");
  assert(/\| MEDIUM \| dias úteis \| 1 \|/.test(weg) && /\| LOW \| dias úteis \| 3 \|/.test(weg), "regras da WEG mudaram");
  const matrix = read("apps/web/lib/sla/default-matrix.ts");
  assert(/assumeDeadlineValue: 5/.test(matrix) && /assumeDeadlineValue: 2/.test(matrix), "padrão do código mudou");
});

check("auditoria: tabela append-only e ação RISK_ALERT_ACTION conforme migrations", () => {
  const audit = read("supabase/migrations/20260819195713_audit_foundation.sql");
  assert(/audit_log_entries is append-only/.test(audit));
  const hotfix = readdirSync(path.join(root, "supabase", "migrations")).find((f) => f.startsWith("20261121090000"));
  assert(hotfix, "migration do hotfix 20261121090000 ausente");
  const p0 = read(`supabase/migrations/${hotfix}`);
  assert(p0.includes("'RISK_ALERT_ACTION', 'RISK_ALERT_CASE'"), "linha de auditoria do alerta mudou");
  for (const a of ["RISK_ALERT_ACTION", "SLA_CONFIGURATION_UPDATED", "MODULE_LOCK_APPLIED", "EMAIL_SPECIALIST_CONSULT_REQUESTED"]) assert(doc.includes(a));
  assert(read("docs/implantacao/trava-modulos/1-aplicar-trava.sql").includes("MODULE_LOCK_APPLIED"));
});

check("trava de módulos: 35 RPCs e as 6 liberadas citadas existem no README da trava", () => {
  const readme = read("docs/implantacao/trava-modulos/README.md");
  assert(doc.includes("35 RPCs") && readme.includes("35 RPCs"));
  for (const rpc of ["quality_ncr_create", "quality_ncr_transition", "quality_evidence_register", "quality_warranty_create", "quality_capa_register", "quality_warranty_transition"])
    assert(doc.includes(rpc) && readme.includes(rpc), `${rpc}`);
});

check("papéis do documento incluem os de 05/06 (Dono, Eng, TI, SSMA, Jur) e os pedidos (Planejamento, Qualidade)", () => {
  const g = read("docs/implantacao/06-checklist-go-no-go.md");
  for (const r of ["Dono", "Eng", "TI", "SSMA", "Jur"]) assert(g.includes(r), `${r} ausente em 06`);
  for (const r of ["Dono", "Eng. TI", "SSMA", "Jurídico", "Planejamento", "Qualidade", "Auditor"]) assert(doc.includes(r), `${r} ausente no roteiro`);
});

check("higiene: sem caminho absoluto local, sem e-mail real além do institucional, sem segredo", () => {
  assert(!/[A-Za-z]:[\\/]+(VIBE|Users)[\\/]/i.test(doc) && !/AppData|Desktop|Downloads/.test(doc), "caminho local");
  const emails = (doc.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map((e) => e.toLowerCase());
  const bad = emails.filter((e) => e !== "crm@axion.com.br");
  assert(bad.length === 0, `e-mails: ${bad.join(", ")}`);
  for (const re of [/eyJ[A-Za-z0-9_-]{20,}/, /sk-[A-Za-z0-9]{20,}/, /\bsb_(secret|publishable)_/, /postgres(ql)?:\/\/[^\s]*:[^\s@]*@/, /BEGIN [A-Z ]*PRIVATE KEY/])
    assert(!re.test(doc), `padrão de segredo: ${re}`);
});

check("registrado em scripts/test-scripts.list uma única vez, com CRLF", () => {
  const raw = readFileSync(path.join(root, "scripts", "test-scripts.list"), "utf8");
  const hits = raw.split(/\r?\n/).filter((l) => l.trim() === "scripts/test-aceitacao-roteiro.mjs");
  assert(hits.length === 1, `ocorrências: ${hits.length}`);
  assert(!/[^\r]\n/.test(raw), "arquivo com LF solto (esperado CRLF)");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
