// Camada de aplicação do histórico privado de consultas jurídicas (análise estática do código).
// A prova de isolamento no banco está em test-legal-consultations-privacy-sql.mjs (PGlite, duas contas do mesmo projeto).

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let ok = 0;
let bad = 0;
const t = (n, c) => (c ? (ok++, console.log("OK  ", n)) : (bad++, console.log("FAIL", n)));
const rd = (p) => readFileSync(p, "utf8");

const lib = rd("apps/web/lib/legal/consultations.ts");
t("autoria vem da sessão (auth.getUser) e nunca do cliente", lib.includes("auth.getUser()") && !/formData|searchParams/.test(lib));
t("toda leitura e exclusão filtra por author_user_id da sessão", (lib.match(/\.eq\("author_user_id", userId\)/g) ?? []).length >= 3);
t("usa o cliente da sessão (RLS), nunca o cliente administrativo/service role", !/client-admin|service_role|createSupabaseAdmin|createSupabaseServiceRole/i.test(lib));
t("exclusão exige a linha ser do autor (retorna true só com 1 linha afetada)", /data\.length === 1/.test(lib));

const detail = rd("apps/web/app/[projectId]/juridico/consulta/[consultationId]/page.tsx");
t("acesso direto por ID: quem não é o autor recebe 404 (igual a 'não existe')", detail.includes("getOwnLegalConsultation") && detail.includes("notFound()"));

const del = rd("apps/web/app/[projectId]/juridico/consultas-actions.ts");
t("excluir exige confirmação explícita (confirmed=true) e usa a exclusão do autor", del.includes('=== "true"') && del.includes("deleteOwnLegalConsultation"));

const btn = rd("apps/web/components/legal/delete-legal-consultation-button.tsx");
t("interface: exclusão em duas etapas (Confirmar exclusão / Cancelar)", btn.includes("Confirmar exclusão") && btn.includes("Cancelar"));

const hist = rd("apps/web/components/legal/legal-consultation-history.tsx");
t("interface descreve o alcance real da exclusão (backups e provedor de IA)", hist.includes("LEGAL_CONSULTATION_DELETE_SCOPE_NOTICE") && lib.includes("backups do banco") && lib.includes("provedor de IA"));
t("interface declara que nem administradores têm acesso", /inclusive administradores/.test(hist));

const action = rd("apps/web/lib/ai/legal-query-action.ts");
t("a consulta bem-sucedida é gravada no histórico do autor; falha ao gravar não derruba a resposta", action.includes("saveLegalConsultation") && /catch \{\s*return \{ saved: false/.test(lib));

// Nenhum outro arquivo do app toca a tabela (listagens, buscas, exportações): só o módulo único.
function walk(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next") continue;
    const full = path.join(dir, f);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|mjs)$/.test(f)) acc.push(full);
  }
  return acc;
}
const users = walk("apps/web").filter((f) => rd(f).includes("legal_consultations")).map((f) => f.replaceAll("\\", "/"));
t(`só um módulo acessa a tabela (sem busca/exportação paralela): ${users.join(", ")}`, users.length === 1 && users[0].endsWith("lib/legal/consultations.ts"));

// service_role/cliente administrativo ignoram RLS: nenhum arquivo que os use pode importar o módulo do histórico nem citar a tabela.
const adminFiles = walk("apps/web").filter((f) => /createSupabaseAdminClient|SUPABASE_SECRET_KEY|service_role/.test(rd(f)));
const adminTouching = adminFiles.filter((f) => /lib\/legal\/consultations|legal_consultations/.test(rd(f))).map((f) => f.replaceAll("\\", "/"));
t(`rotas/jobs com service_role (${adminFiles.length} arquivos) NÃO importam nem consultam o histórico jurídico: ${adminTouching.join(", ") || "nenhum"}`, adminTouching.length === 0);
const importers = walk("apps/web").filter((f) => /from "@\/lib\/legal\/consultations"/.test(rd(f))).map((f) => f.replaceAll("\\", "/"));
t(`só estes arquivos importam o módulo do histórico (todos com sessão de usuário): ${importers.length}`, importers.length > 0 && importers.every((f) => !adminFiles.map((x) => x.replaceAll("\\", "/")).includes(f)));
const cycle = rd("apps/web/lib/risk-alerts/run-risk-alert-cycle.ts");
t("ciclo automático de alertas (service_role) chama o especialista direto e NÃO grava histórico de consulta", cycle.includes("answerLegalConsultantQuery") && !cycle.includes("saveLegalConsultation"));

const mig = rd("supabase/migrations/20261104120000_legal_consultations_private.sql");
t("migration: RLS forçada, sem policy de administrador, sem UPDATE, anon sem acesso", /force row level security/.test(mig) && !/for update/.test(mig) && !/ADMINISTRADOR/.test(mig.replace(/--.*$/gm, "")) && /revoke all on public\.legal_consultations from anon/.test(mig));

console.log(`\nRESULTADO: ${ok} passaram, ${bad} falharam`);
process.exit(bad ? 1 : 0);
