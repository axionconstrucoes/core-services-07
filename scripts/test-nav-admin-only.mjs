// Verifica (estático) que Eventos, Integrações, Usuários, Autorizações e Start-up ACC são só de administrador:
// menu (restrictedTo) E guarda de página no servidor. O banco continua sendo a barreira das escritas.
import { readFileSync } from "node:fs";
let ok = 0, bad = 0;
const t = (n, c) => (c ? (ok++, console.log("OK  ", n)) : (bad++, console.log("FAIL", n)));
const nav = readFileSync("apps/web/lib/ui/nav-items.ts", "utf8");
for (const [href, label] of [["ledger", "Eventos"], ["integracoes", "Integrações"], ["usuarios", "Usuários"], ["autorizacoes", "Autorizações"], ["startup", "Start-up ACC"]]) {
  const line = nav.split("\n").find((l) => l.includes(`href: "${href}"`)) ?? "";
  t(`menu: ${label} restrito a admin`, line.includes('restrictedTo: "admin"') && line.includes(`label: "${label}"`));
}
const pages = {
  "ledger/page.tsx": "requireProjectAdminPage", "ledger/[eventId]/page.tsx": "requireProjectAdminPage",
  "ledger/lote-alertas/[batchId]/page.tsx": "requireProjectAdminPage", "integracoes/page.tsx": "requireProjectAdminPage",
  "usuarios/page.tsx": "requireProjectAdminPage", "autorizacoes/page.tsx": "isProjectAdmin", "startup/page.tsx": 'permission !== "ADMINISTRADOR"',
};
for (const [p, needle] of Object.entries(pages)) t(`rota ${p}: guarda de admin no servidor`, readFileSync(`apps/web/app/[projectId]/${p}`, "utf8").includes(needle));
for (const f of ["actions", "assess-schedule-delay-actions", "event-notes-actions", "run-multi-expert-curation-actions", "send-alert-actions"]) {
  const src = readFileSync(`apps/web/app/[projectId]/ledger/[eventId]/${f}.ts`, "utf8");
  const fns = (src.match(/^export async function /gm) ?? []).length;
  const guards = (src.match(/isProjectAdmin\(projectId\)/g) ?? []).length;
  t(`ação ${f}.ts: ${fns} função(ões) exportada(s), ${guards} guarda(s) de admin`, fns > 0 && guards === fns);
}
console.log(`\nRESULTADO: ${ok} passaram, ${bad} falharam`);
process.exit(bad ? 1 : 0);
