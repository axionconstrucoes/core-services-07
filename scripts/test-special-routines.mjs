import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Planejamento e Engenharia são Experts separados: a rotina de nova versão de projeto (cronograma/preço) é do
// Diretor de Planejamento IA; não conformidade de compras/execução é do Diretor de Engenharia e Construção IA.
const planning = read("apps/web/lib/ai/experts/planning-director/identity.ts");
const engineering = read("apps/web/lib/ai/experts/engineering-director/identity.ts");
const commercial = read("apps/web/lib/ai/experts/commercial-director/identity.ts");
const esg = read("apps/web/lib/ai/experts/esg-director/identity.ts");
const ceo = read("apps/web/lib/ai/experts/ceo/identity.ts");
const checklist = read("apps/web/lib/ssma/checklist-definitions.ts");
const migration = read("supabase/migrations/20260911100000_special_routines_accident.sql");
const healthRoute = read("apps/web/app/api/cron/system-health/route.ts");
const router = read("apps/web/lib/ai/curation/route-experts.ts");
const versionForm = read("apps/web/components/integrations/construmanager-version-impact-form.tsx");
const versionActions = read("apps/web/app/[projectId]/integracoes/version-impact-actions.ts");
const versionEmail = read("apps/web/lib/email/send-version-impact-review-email.ts");

assert.match(engineering, /Diretor de Engenharia e Construção IA/);
assert.match(planning, /Diretor de Planejamento IA/);
assert.doesNotMatch(planning, /PLANNING_DIRECTOR_NAME = "Diretor de Engenharia/);
assert.match(planning, /Esta nova versão gera impacto no cronograma e\/ou\s*no preço\?/);
assert.match(planning, /orçamentista/);
assert.match(engineering, /atraso, devolução, má qualidade, equipe\s*insuficiente ou problema de pagamento/);
assert.match(commercial, /desentendimento técnico/);
assert.match(commercial, /animosidade/);
assert.match(esg, /com ou sem\s*afastamento/i);
assert.match(esg, /foto do local/);
assert.match(esg, /foto da remoção/);
assert.match(ceo, /reynaldo@axion\.com\.br/);
assert.match(ceo, /reynaldo@axion\.com\.br \(Diretoria\)/);
assert.doesNotMatch(ceo, /carla@axion\.com\.br/);
assert.match(checklist, /ocorrencia-acidente/);
assert.match(checklist, /requiredPhotoActions: \["Foto do local", "Foto da remoção"\]/);
assert.match(migration, /unique \(submission_id, recipient_email\)/);
assert.match(migration, /ACCIDENT_REQUIRED_PHOTOS_MISSING/);
assert.match(migration, /submit_construmanager_version_impact_review/);
assert.match(migration, /submit_construmanager_budget_response/);
assert.match(migration, /unique \(review_id, recipient_email\)/);
assert.match(versionActions, /Responda todos os itens antes de enviar/);
assert.match(versionForm, /Encaminhar ao orçamentista/);
assert.match(versionEmail, /Aviso obrigatório à gestão, mesmo quando a análise não identifica impacto/);
assert.match(healthRoute, /fingerprint/);
assert.match(healthRoute, /ADMIN_RECIPIENTS/);
// Cadastro oficial do piloto WEG (27/11/2026): falha técnica vai à Diretoria; Carla (FINANCEIRO) e crm@ (cópia institucional) não são destinatários lógicos.
assert.match(healthRoute, /const ADMIN_RECIPIENTS = \["reynaldo@axion\.com\.br"\];/);
assert.doesNotMatch(healthRoute, /carla@axion\.com\.br/);
assert.match(router, /desentendimento/);
assert.match(router, /NÃO CONFORMIDADE DE COMPRAS/);

console.log("OK — rotinas especiais, guardrails e deduplicação verificados.");
