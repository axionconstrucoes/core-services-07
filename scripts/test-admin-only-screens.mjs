// Telas exclusivas de administrador: Start-up ACC, Eventos, Integrações, Usuários e Autorizações.
// Estrutural (sem rede/banco): menu, páginas e Server Actions conferem o vínculo ADMINISTRADOR ativo no servidor,
// e os caminhos compartilhados com quem não é administrador (resposta a alertas por link, bibliotecas de leitura) ficam livres.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let failed = 0;
const rd = (p) => readFileSync(resolve(p), "utf8");
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const A = "apps/web/app/[projectId]/";

const { NAV_ITEMS } = await import("../apps/web/lib/ui/nav-items.ts");
const item = (href) => NAV_ITEMS.find((i) => i.href === href);

await check("menu: rótulo 'Eventos' (não 'EVENTOS')", () => {
  ok(item("ledger")?.label === "Eventos", `rótulo atual: ${item("ledger")?.label}`);
  ok(!NAV_ITEMS.some((i) => i.label === "EVENTOS"), "ainda há EVENTOS no menu");
});

await check("menu: Start-up, Eventos, Integrações, Usuários e Autorizações só para administrador", () => {
  for (const h of ["startup", "ledger", "integracoes", "usuarios", "autorizacoes"]) ok(item(h)?.restrictedTo === "admin", `${h} sem restrictedTo admin`);
});

await check("menu: demais itens não ficaram restritos por engano", () => {
  const restricted = NAV_ITEMS.filter((i) => i.restrictedTo === "admin").map((i) => i.href).sort();
  ok(restricted.join() === ["autorizacoes", "integracoes", "ledger", "startup", "usuarios"].join(), `restritos: ${restricted}`);
});

await check("servidor: páginas de Eventos (lista e detalhe), Integrações e Usuários chamam requireProjectAdminPage", () => {
  for (const p of ["ledger/page.tsx", "ledger/[eventId]/page.tsx", "integracoes/page.tsx", "usuarios/page.tsx"]) {
    const s = rd(A + p);
    ok(s.includes("await requireProjectAdminPage(projectId)"), `${p} sem guarda`);
  }
  ok(rd(A + "startup/page.tsx").includes("notFound()") && rd(A + "autorizacoes/page.tsx").includes("isProjectAdmin(projectId)"), "Start-up/Autorizações perderam a guarda");
});

await check("servidor: Server Actions de Integrações, Usuários e Eventos conferem administrador", () => {
  const integr = rd(A + "integracoes/actions.ts");
  const calls = (integr.match(/await requireAdminUser\(supabase, formData\)/g) ?? []).length;
  const exported = (integr.match(/^export async function /gm) ?? []).length;
  ok(calls === exported && (integr.match(/await requireUser\(supabase\)/g) ?? []).length === 1, `integracoes: ${calls} guardas para ${exported} ações`);
  const us = rd(A + "usuarios/actions.ts");
  const usExp = (us.match(/^export async function /gm) ?? []).length;
  const usGuards = (us.match(/await assertProjectAdmin\(projectId\)|isProjectAdminForAction\(projectId\)/g) ?? []).length;
  ok(usGuards === usExp, `usuarios: ${usGuards} guardas para ${usExp} ações`);
  for (const f of ["actions", "event-notes-actions", "assess-schedule-delay-actions", "run-multi-expert-curation-actions", "send-alert-actions"]) {
    const s = rd(A + `ledger/[eventId]/${f}.ts`);
    const exp = (s.match(/^export async function /gm) ?? []).length;
    const g = (s.match(/isProjectAdminForAction\(projectId\)/g) ?? []).length;
    ok(g === exp, `${f}: ${g} guardas para ${exp} ações`);
  }
});

await check("compartilhado: resposta a alertas por link (lote-alertas) e leituras compartilhadas continuam sem exigir administrador", () => {
  for (const p of ["ledger/lote-alertas/[batchId]/page.tsx", "ledger/lote-alertas/[batchId]/actions.ts"]) {
    ok(!rd(A + p).includes("project-admin-guard"), `${p} não pode exigir administrador (usado por destinatários de e-mail)`);
  }
  ok(!rd("apps/web/app/alertas/lote/[projectId]/[batchId]/page.tsx").includes("project-admin-guard"), "página /alertas/lote exige administrador");
  ok(!rd("apps/web/lib/data.ts").includes("project-admin-guard"), "lib/data.ts (Timeline, Dashboard, etc.) não pode depender da guarda");
  ok(!rd(A + "integracoes/version-impact-actions.ts").includes("project-admin-guard"), "revisão de impacto de versão tem regra própria (Planejamento/Gerente)");
});

await check("guarda reaproveita o critério do layout (vínculo ATIVO + ADMINISTRADOR)", () => {
  const g = rd("apps/web/lib/auth/project-admin-guard.ts");
  ok(g.includes('import "server-only"') && g.includes("isProjectAdmin"), "guarda");
  const e = rd("apps/web/lib/email-authorization/guard.ts");
  ok(e.includes('status === "ACTIVE"') && e.includes('"ADMINISTRADOR"'), "critério");
});

if (failed) { console.log(`\n${failed} falha(s)`); process.exit(1); }
console.log("\nTodos os testes passaram.");
