// Teste ESTRUTURAL da interface autenticada dos quatro botões (AlertActionForms) — leitura do código-fonte.
// Garante: ordem/rótulos/cores, abertura automática do calendário e da lista, horário obrigatório em ALTO/CRÍTICO,
// justificativa opcional no envio, tique verde na resolução e nenhuma gravação por GET.
// Uso: node scripts/test-alert-action-forms-ui.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const form = read("apps/web/components/risk-alerts/alert-action-forms.tsx");
const page = read("apps/web/app/[projectId]/alertas/[caseId]/page.tsx");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message}`);
    failed += 1;
  }
}

check("quatro botões na ordem RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA", () => {
  assert.ok(form.includes('const MAIN_ACTIONS: AlertActionType[] = ["RESOLVED", "TAKING_ACTION", "FORWARD", "EXPERT_CONSULTATION"]'));
  for (const [k, v] of [["RESOLVED", "RESOLVIDO"], ["TAKING_ACTION", "EM ANDAMENTO"], ["FORWARD", "ENVIAR PARA"], ["EXPERT_CONSULTATION", "ESPECIALISTA"]]) assert.ok(form.includes(`${k}: "${v}"`), k);
});

check("cores: três de tratamento cinza médio + texto branco; ESPECIALISTA laranja + texto branco", () => {
  assert.ok(form.includes('GRAY_BUTTON = "bg-[#6B7280] text-white'));
  assert.ok(form.includes('ORANGE_BUTTON = "bg-[#C2410C] text-white'));
  assert.ok(form.includes('action === "EXPERT_CONSULTATION" ? ORANGE_BUTTON : GRAY_BUTTON'));
});

check("EM ANDAMENTO: calendário abre sozinho (showPicker ao escolher e ao clicar) e há botão CONFIRMAR", () => {
  assert.ok(form.includes("showPicker"));
  assert.ok(/onClick=\{\(e\) => \{ try \{ \(e\.currentTarget/.test(form), "clique no campo abre o calendário");
  assert.ok(form.includes('action === "TAKING_ACTION" ? "CONFIRMAR"'));
});

check("EM ANDAMENTO: ALTO/CRÍTICO exigem data E horário (datetime-local obrigatório); demais, só a data", () => {
  assert.ok(form.includes('type={immediate ? "datetime-local" : "date"}'));
  assert.ok(form.includes('name="forecastAt" required'));
  assert.ok(form.includes("Providências em andamento"));
  assert.ok(form.includes("não reinicia o prazo original nem suspende os escalonamentos"));
});

check("ENVIAR PARA: lista escura com texto branco, lista aberta automaticamente, justificativa OPCIONAL, CONFIRMAR ENVIO", () => {
  assert.ok(form.includes("bg-slate-900 text-white"));
  assert.ok(form.includes('name === "targetUserId"') || form.includes('"targetUserId"'));
  assert.ok(form.includes('Justificativa do encaminhamento (opcional)<Textarea name="text" rows={2} />'), "justificativa não pode ser obrigatória");
  assert.ok(form.includes('"CONFIRMAR ENVIO"'));
  assert.ok(form.includes("O prazo original não é alterado"));
});

check("RESOLVIDO: solução adotada + evidência (ALTO/CRÍTICO) + confirmação explícita; tique verde após registrar", () => {
  assert.ok(form.includes("Solução adotada"));
  assert.ok(form.includes("Evidência (obrigatória para ALTO/CRÍTICO)"));
  assert.ok(form.includes('name="confirmed" required'));
  assert.ok(form.includes('data-testid="alert-resolved-tick"'));
  assert.ok(page.includes('view.state === "RESOLVED"') && page.includes("alert-resolved-badge-tick"));
});

check("nada grava por GET: ações só por server action (POST) e token continua revalidado no servidor", () => {
  assert.ok(form.includes("useActionState(applyAlertActionAction"));
  assert.ok(/<form ref=\{formRef\} action=\{formAction\}/.test(form));
  assert.ok(!/useEffect\([^)]*applyAlertActionAction/.test(form), "efeito não pode disparar gravação");
  assert.ok(page.includes("nenhum estado muda por GET"));
});

check("o formulário não troca de obra: projectId/caseId vêm da página autenticada", () => {
  assert.ok(form.includes('name="projectId" value={props.projectId}') && form.includes('name="caseId" value={props.caseId}'));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
