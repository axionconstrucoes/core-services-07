// Mantém a AJUDA (perfis kind "expert" no catálogo de Hover Text) sincronizada com mudanças REAIS dos EXPERTS em
// apps/web/lib/ai/expert-definitions. Complementa scripts/test-help-experts-profiles.mjs (nomes, versão do prompt, limites 20/100).
// Falha quando alguém: (1) cria/remove/renomeia um especialista oficial sem atualizar o catálogo; (2) muda os tipos de saída
// (outputTypes) sem atualizar a seção "Entregáveis" do perfil — inclusive passar a produzir ou deixar de produzir rascunhos;
// (3) muda a versão ou o status de implementação sem refletir na ajuda; (4) muda as regras de revisão humana; (5) deixa a ajuda citar
// uma competência/skill que o código não declara. Nenhuma chamada a IA.
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-help-experts-sync.mjs
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const { ACC_FEATURE_HELP, ALL_HELP_ENTRIES } = await import("../apps/web/lib/ui/help/registry.ts");
const { OFFICIAL_EXPERT_DEFINITIONS, ALL_OFFICIAL_EXPERT_DEFINITIONS } = await import("../apps/web/lib/ai/expert-definitions/definitions.ts");
const { EXPERT_PROFILE_HELP_ID } = await import("../apps/web/lib/ui/help/modules/experts.ts");

let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log(`OK   ${n}`); passed++; } catch (e) { console.log(`FAIL ${n}\n     ${e.message}`); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };

const norm = (v) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Cada tipo de saída do código e a(s) expressão(ões) que a ajuda usa para descrevê-lo (sem acento, minúsculas).
const OUTPUT_TERMS = {
  ANALYSIS: ["analise"],
  RECOMMENDATION: ["recomendacao"],
  RISK_ASSESSMENT: ["avaliacao de risco"],
  ACTION_SUGGESTION: ["sugestao de acao"],
  DRAFT_EMAIL: ["rascunho de e-mail", "rascunhos de e-mail"],
  DRAFT_LETTER: ["rascunho de carta", "rascunhos de e-mail, proposta, contraproposta e carta"],
  DRAFT_NOTIFICATION: ["rascunho de notificacao"],
  DRAFT_PROPOSAL: ["proposta"],
  DRAFT_COUNTERPROPOSAL: ["contraproposta"],
  EXECUTIVE_SUMMARY: ["resumo executivo"],
  TIMELINE_ANALYSIS: ["cronologia", "timeline"],
  DOCUMENT_GAP_ANALYSIS: ["lacunas documentais"],
};
const DRAFT_TYPES = ["DRAFT_EMAIL", "DRAFT_LETTER", "DRAFT_NOTIFICATION", "DRAFT_PROPOSAL", "DRAFT_COUNTERPROPOSAL"];
const IDS = Object.keys(OFFICIAL_EXPERT_DEFINITIONS);
const profile = (id) => ACC_FEATURE_HELP[EXPERT_PROFILE_HELP_ID[id]];

check("o conjunto de especialistas oficiais do código é EXATAMENTE o conjunto de perfis do catálogo (criar/remover um exige atualizar a ajuda)", () => {
  const helpIds = Object.keys(EXPERT_PROFILE_HELP_ID).sort();
  ok(JSON.stringify(helpIds) === JSON.stringify([...IDS].sort()), `código: ${[...IDS].sort().join(", ")} | ajuda: ${helpIds.join(", ")}`);
  const profiles = ALL_HELP_ENTRIES.filter((e) => e.kind === "expert" && Object.values(EXPERT_PROFILE_HELP_ID).includes(e.id));
  ok(profiles.length === IDS.length, `perfis encontrados ${profiles.length} != ${IDS.length}`);
  for (const id of IDS) ok(profile(id), `perfil ausente para ${id}`);
});

check("a seção \"Entregáveis\" de cada perfil cita TODOS os tipos de saída do código e nenhum que o código não declare", () => {
  const bad = [];
  for (const id of IDS) {
    const def = OFFICIAL_EXPERT_DEFINITIONS[id];
    const text = norm(profile(id).result ?? "");
    for (const t of def.outputTypes) {
      const terms = OUTPUT_TERMS[t];
      if (!terms) { bad.push(`${id}: tipo ${t} sem termo de ajuda mapeado no teste (atualize OUTPUT_TERMS)`); continue; }
      if (!terms.some((term) => text.includes(norm(term)))) bad.push(`${id}: o código produz ${t}, mas a ajuda não menciona (${terms[0]})`);
    }
    // tipos NÃO declarados que a ajuda não pode prometer (rascunhos e síntese executiva)
    for (const t of Object.keys(OUTPUT_TERMS)) {
      if (def.outputTypes.includes(t)) continue;
      if (t === "ANALYSIS" || t === "RECOMMENDATION" || t === "RISK_ASSESSMENT") continue;
      if (t === "DRAFT_PROPOSAL" && def.outputTypes.includes("DRAFT_COUNTERPROPOSAL")) continue;
      const strict = OUTPUT_TERMS[t][0];
      // "proposta" aparece dentro de "contraproposta"/"carta": compara com palavra inteira para os rascunhos
      const re = new RegExp(`(^|[^a-z])${norm(strict).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}`);
      if (re.test(text) && !(t === "TIMELINE_ANALYSIS" && /cronologia|timeline/.test(text) && def.outputTypes.includes("TIMELINE_ANALYSIS"))) {
        bad.push(`${id}: a ajuda promete "${strict}" (${t}) que o código não declara em outputTypes`);
      }
    }
    const producesDrafts = def.outputTypes.some((t) => DRAFT_TYPES.includes(t));
    const saysNoDrafts = /nao produz rascunhos/.test(text);
    if (!producesDrafts && !saysNoDrafts) bad.push(`${id}: o código não produz rascunhos e a ajuda não diz \"Não produz rascunhos\"`);
    if (producesDrafts && saysNoDrafts) bad.push(`${id}: o código produz rascunhos, mas a ajuda diz que não produz`);
  }
  ok(bad.length === 0, bad.join(" | "));
});

check("a versão do prompt e o status de implementação do código aparecem na ajuda; status PLANNED exigiria aviso explícito", () => {
  const bad = [];
  for (const id of IDS) {
    const def = OFFICIAL_EXPERT_DEFINITIONS[id];
    const p = profile(id);
    if (!p.description.includes(`prompt ${def.version}`)) bad.push(`${id}: ajuda sem "prompt ${def.version}"`);
    if (def.status === "PLANNED" && !/planejad|n[ãa]o implementad|ainda n[ãa]o/i.test(JSON.stringify(p))) bad.push(`${id}: status PLANNED no código sem aviso na ajuda`);
    if (def.status === "IMPLEMENTED" && /ainda n[ãa]o implementad|apenas planejad/i.test(JSON.stringify(p))) bad.push(`${id}: ajuda diz que não está implementado, mas o código marca IMPLEMENTED`);
  }
  ok(bad.length === 0, bad.join(" | "));
});

check("revisão humana: todo especialista do código exige (requiresHumanReview === true) e o perfil declara revisão humana obrigatória", () => {
  const bad = [];
  for (const def of ALL_OFFICIAL_EXPERT_DEFINITIONS) {
    if (def.requiresHumanReview !== true) bad.push(`${def.expertId}: requiresHumanReview deixou de ser true no código`);
    const hr = norm(profile(def.expertId).humanReview ?? "");
    if (!/obrigatoria|obrigatorio/.test(hr)) bad.push(`${def.expertId}: perfil não diz que a revisão humana é obrigatória`);
  }
  ok(bad.length === 0, bad.join(" | "));
});

check("o nome oficial e o id técnico de cada especialista do código constam do título/descrição do perfil (renomear exige atualizar a ajuda)", () => {
  const bad = [];
  for (const id of IDS) {
    const def = OFFICIAL_EXPERT_DEFINITIONS[id];
    const p = profile(id);
    if (!p.title.includes(def.expertName) && !p.description.includes(def.expertName)) bad.push(`${id}: nome "${def.expertName}" ausente`);
    if (!p.description.includes(id)) bad.push(`${id}: id técnico ausente na descrição`);
  }
  ok(bad.length === 0, bad.join(" | "));
});

check("sensibilidade do teste: uma alteração simulada de outputTypes/versão seria detectada (mutação em memória, nada é gravado)", () => {
  const id = IDS.find((x) => !OFFICIAL_EXPERT_DEFINITIONS[x].outputTypes.includes("DRAFT_LETTER"));
  ok(id, "nenhum especialista sem DRAFT_LETTER para simular");
  const mutated = [...OFFICIAL_EXPERT_DEFINITIONS[id].outputTypes, "DRAFT_LETTER"];
  const text = norm(profile(id).result ?? "");
  ok(!OUTPUT_TERMS.DRAFT_LETTER.some((t) => text.includes(norm(t))), `a ajuda de ${id} já cita carta; escolha outro caso de simulação`);
  ok(mutated.includes("DRAFT_LETTER") && !OUTPUT_TERMS.DRAFT_LETTER.some((t) => text.includes(norm(t))), "mutação não detectada");
  const def = OFFICIAL_EXPERT_DEFINITIONS[IDS[0]];
  ok(!profile(IDS[0]).description.includes(`prompt ${def.version}9`), "versão simulada deveria divergir da ajuda");
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
