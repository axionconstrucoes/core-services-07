// Perfis dos sete especialistas de IA (os seis anteriores + Analista IA de Qualidade, quality-analyst) no catálogo de ajuda (Hover Text): conteúdo fiel ao código, sem currículo inventado.
// Verifica: (1) os sete especialistas oficiais têm perfil kind "expert" com limitações e revisão humana (ALTO/CRÍTICO);
// (2) nomes e versões batem com as definições oficiais; (3) nenhum perfil traz anos de experiência, certificação, instituição
// ou sigla que não exista no código dos especialistas; (4) a AXIA nunca é descrita como especialista e a entrada de diferença
// a declara exclusivamente assistente de dúvidas de uso; (5) os limites de uso (20/usuário/dia e 100/obra/dia) batem com a
// migration; (6) as telas leem o perfil do catálogo (HelpContent), sem texto de perfil digitado na página.
// Nenhuma chamada a IA. Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-help-experts-profiles.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { ALL_HELP_ENTRIES, ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const { OFFICIAL_EXPERT_DEFINITIONS, ALL_OFFICIAL_EXPERT_DEFINITIONS } = await import("../apps/web/lib/ai/expert-definitions/definitions.ts");
const { EXPERT_PROFILE_HELP_ID } = await import("../apps/web/lib/ui/help/modules/experts.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log(`OK   ${n}`); passed++; } catch (e) { console.log(`FAIL ${n}\n     ${e.message}`); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };

const EXPERT_IDS = Object.keys(OFFICIAL_EXPERT_DEFINITIONS);
const profileOf = (expertId) => ACC_FEATURE_HELP[EXPERT_PROFILE_HELP_ID[expertId]];
const textOf = (e) => [e.title, e.shortDescription, e.description, e.purpose, e.howItWorks, e.source, e.refresh, e.missingData, e.result, e.permissions, e.validity, e.humanReview, ...(e.howToUse ?? []), ...(e.data ?? []), ...(e.criteria ?? []), ...(e.consequences ?? []), ...(e.limitations ?? []), ...(e.uses ?? [])].filter(Boolean).join("\n");

// Corpus do que o CÓDIGO dos especialistas declara (definições, prompts, conhecimento técnico, skills, fontes e escopo de contexto).
const CORPUS_FILES = [
  "apps/web/lib/ai/expert-definitions/definitions.ts",
  "apps/web/lib/ai/expert-definitions/shared.ts",
  "apps/web/lib/ai/expert-definitions/requested-skills.ts",
  "apps/web/lib/ai/expert-knowledge/planning.ts",
  "apps/web/lib/ai/expert-knowledge/engineering.ts",
  "apps/web/lib/ai/experts/ceo/identity.ts",
  "apps/web/lib/ai/experts/commercial-director/identity.ts",
  "apps/web/lib/ai/experts/engineering-director/identity.ts",
  "apps/web/lib/ai/experts/esg-director/identity.ts",
  "apps/web/lib/ai/experts/legal-consultant/identity.ts",
  "apps/web/lib/ai/experts/planning-director/identity.ts",
  "apps/web/lib/ai/experts/quality-analyst/identity.ts",
  "apps/web/lib/ai/experts/quality-analyst/output-schema.ts",
  "apps/web/lib/ai/legal/references-insurance-warranty.ts",
  "apps/web/lib/ai/legal/insurance-warranty.ts",
  "apps/web/lib/ai/specialist-framework.ts",
  "apps/web/lib/ai/risk-criteria.ts",
  "apps/web/lib/ai/context/types.ts",
  "apps/web/lib/ai/routing/expert-topics.ts",
];
const CORPUS = CORPUS_FILES.map(read).join("\n");
const strip = (v) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const CORPUS_FLAT = strip(CORPUS); // comparação sem acento: o prompt pode grafar CENARIO onde o perfil usa CENÁRIO
// Termos de produto/declaração do próprio perfil que não são siglas de formação ou instituição.
const ALLOWED_TOKENS = new Set(["SIMULADO", "ACC", "AXIA", "AXION", "IA", "CEO", "SLA", "SINAPI", "SICRO", "COM"]);

check("os sete especialistas oficiais têm entrada de perfil kind \"expert\" no módulo experts-ia, com versão", () => {
  ok(EXPERT_IDS.length === 7, `esperado 7 especialistas oficiais (6 anteriores + quality-analyst), obtido ${EXPERT_IDS.length}`);
  const bad = [];
  for (const id of EXPERT_IDS) {
    const e = profileOf(id);
    if (!e) { bad.push(`${id}: sem entrada ${EXPERT_PROFILE_HELP_ID[id]}`); continue; }
    if (e.kind !== "expert") bad.push(`${e.id}: kind ${e.kind}`);
    if (e.module !== "experts-ia") bad.push(`${e.id}: module ${e.module}`);
    if (!e.version) bad.push(`${e.id}: sem version`);
    if (!/^experts\.[a-z-]+\.perfil$/.test(e.id)) bad.push(`${e.id}: id fora do padrão experts.<slug>.perfil`);
  }
  ok(bad.length === 0, bad.join(" | "));
});

check("cada perfil tem limitações (>= 3) e revisão humana citando ALTO e CRÍTICO, e declara que é perfil SIMULADO", () => {
  const bad = [];
  for (const id of EXPERT_IDS) {
    const e = profileOf(id);
    if (!(e.limitations?.length >= 3)) bad.push(`${e.id}: limitations insuficientes`);
    if (!e.humanReview || !/ALTO/.test(e.humanReview) || !/CR[ÍI]TICO/.test(e.humanReview)) bad.push(`${e.id}: humanReview sem ALTO/CRÍTICO`);
    if (!/SIMULADO/.test(e.description)) bad.push(`${e.id}: sem declaração de perfil SIMULADO`);
    if (!/n[ãa]o [ée] uma pessoa/i.test(e.description)) bad.push(`${e.id}: não declara que não é uma pessoa`);
  }
  ok(bad.length === 0, bad.join(" | "));
});

check("nomes e versões do prompt batem com as definições oficiais (nenhum nome inventado)", () => {
  const bad = [];
  for (const id of EXPERT_IDS) {
    const def = OFFICIAL_EXPERT_DEFINITIONS[id];
    const e = profileOf(id);
    if (!e.description.includes(def.expertName)) bad.push(`${e.id}: descrição não cita "${def.expertName}"`);
    if (!e.description.includes(`prompt ${def.version}`)) bad.push(`${e.id}: versão do prompt diferente de ${def.version}`);
    if (!e.description.includes(id)) bad.push(`${e.id}: não cita o id técnico ${id}`);
  }
  const names = ALL_OFFICIAL_EXPERT_DEFINITIONS.map((d) => d.expertName);
  ok(new Set(names).size === 7, "os nomes oficiais deveriam ser 7 e distintos");
  ok(bad.length === 0, bad.join(" | "));
});

check("cada perfil traz perguntas recomendadas, fontes efetivas e o que NÃO está disponível", () => {
  const bad = [];
  for (const id of EXPERT_IDS) {
    const e = profileOf(id);
    const questions = (e.howToUse ?? []).filter((q) => q.includes("?"));
    if (questions.length < 2) bad.push(`${e.id}: menos de 2 perguntas recomendadas`);
    if (!(e.data ?? []).some((d) => /^Dispon[ií]vel/.test(d))) bad.push(`${e.id}: sem fonte \"Disponível\"`);
    if (!(e.data ?? []).some((d) => /^N[ãa]o dispon[ií]vel/.test(d) || /^Autorizadas na defini/.test(d))) bad.push(`${e.id}: não diz o que NÃO tem`);
    if (!e.source || !e.missingData || !e.refresh || !e.result) bad.push(`${e.id}: falta source/missingData/refresh/result`);
    if (!(e.consequences ?? []).some((c) => /Nunca executa a[çc][õo]es/.test(c))) bad.push(`${e.id}: não declara que nunca executa ações`);
    if (!(e.consequences ?? []).some((c) => /evid[êe]ncias e documentos originais/.test(c))) bad.push(`${e.id}: não declara que não altera evidências`);
  }
  ok(bad.length === 0, bad.join(" | "));
});

check("limites de uso do perfil (20/usuário/dia e 100/obra/dia, auditada e isolada por projeto) batem com a migration", () => {
  const sql = read("supabase/migrations/20261120120000_ssma_forward_and_ai_consult_limits.sql");
  const m = sql.match(/insert into public\.ai_consult_limits \(scope, per_user_day, per_project_day\) values \('DEFAULT', (\d+), (\d+)\)/);
  ok(m, "linha de limites padrão não encontrada na migration");
  ok(m[1] === "20" && m[2] === "100", `migration declara ${m[1]}/${m[2]}, esperado 20/100`);
  const bad = [];
  for (const id of EXPERT_IDS) {
    const p = profileOf(id).permissions ?? "";
    if (!/20 consultas por usu[áa]rio por dia/.test(p) || !/100 por obra por dia/.test(p)) bad.push(`${id}: limites ausentes`);
    if (!/audit/i.test(p) || !/isolad/i.test(p)) bad.push(`${id}: sem auditoria/isolamento por projeto`);
  }
  ok(bad.length === 0, bad.join(" | "));
});

check("nenhum perfil contém ano de experiência, certificação ou instituição que não exista no código", () => {
  const bad = [];
  const FORBIDDEN = [
    [/\b\d+\s*(anos?|years?)\b/i, "anos"],
    [/experi[êe]ncia\s+(de|com mais de|superior a)\s+\d/i, "experiência numérica"],
    [/\bcertifica(do|ção|ções|[çc][ãa]o)\b/i, "certificação"],
    [/\b(PMP|PMI|CREA|CAU|MBA|PhD)\b/, "registro profissional/sigla de formação"],
    [/\b(mestrad[oa]|doutorad[oa]|gradua[çc][ãa]o|formad[oa] em|p[óo]s-gradua\w*)/i, "formação acadêmica"],
    [/\b(Universidade|Faculdade|Instituto|Funda[çc][ãa]o|Conselho)\b/, "instituição"],
    [/curr[íi]culo/i, "currículo"],
  ];
  const INSTITUTIONS = ["ABNT", "INMETRO", "CONFEA", "OAB", "IBAPE", "ISO", "NBR", "PMBOK"]; // só permitidas se existirem no código
  for (const id of EXPERT_IDS) {
    const e = profileOf(id);
    const t = textOf(e);
    for (const [re, label] of FORBIDDEN) { const m = t.match(re); if (m) bad.push(`${e.id}: ${label} ("${m[0]}")`); }
    for (const inst of INSTITUTIONS) if (new RegExp(`\\b${inst}\\b`).test(t) && !CORPUS.includes(inst)) bad.push(`${e.id}: cita ${inst}, ausente do código`);
    // toda sigla em maiúsculas (>= 3 letras) precisa existir no código dos especialistas (ou ser termo do próprio perfil)
    const tokens = new Set(t.match(/(?<![\p{L}\d])\p{Lu}[\p{Lu}\d]{2,}(?:-\d+)?(?![\p{L}\d])/gu) ?? []);
    for (const tok of tokens) if (!ALLOWED_TOKENS.has(tok) && !CORPUS_FLAT.includes(strip(tok))) bad.push(`${e.id}: termo \"${tok}\" não existe no código dos especialistas`);
  }
  ok(bad.length === 0, bad.slice(0, 12).join(" | "));
});

check("conhecimento normativo: perfis só citam normas que o código cita e dizem que skills pendentes não chegam ao prompt", () => {
  const legal = textOf(profileOf("legal-consultant"));
  ok(/Lei 14\.133/.test(legal) && CORPUS.includes("Lei 14.133"), "Lei 14.133 só pode aparecer se estiver no código (propósito da skill)");
  ok(/pendente de integra[çc][ãa]o/.test(legal) && /N[ãa]o chega|NÃO chega/i.test(legal), "jurídico deve declarar que a skill pendente não chega ao prompt");
  const esg = textOf(profileOf("esg-director"));
  ok(/NR-18/.test(esg) && CORPUS.includes("NR-18") && /pendente de integra[çc][ãa]o/.test(esg), "ESG: NR-18 só como propósito de skill pendente");
  for (const id of ["planning-director", "engineering-director"]) {
    const t = textOf(profileOf(id));
    ok(/resumo t[ée]cnico pr[óo]prio/.test(t), `${id}: deve citar o resumo técnico próprio integrado`);
    ok(/skill original|texto original da skill n[ãa]o est[áa] no reposit[óo]rio/.test(t), `${id}: deve declarar que o texto original da skill não está no repositório`);
  }
});

check("a AXIA nunca é descrita como especialista; a entrada de diferença a declara exclusivamente assistente de dúvidas de uso", () => {
  const bad = [];
  for (const e of ALL_HELP_ENTRIES) {
    const t = [e.title, e.description, e.purpose, e.howItWorks].join(" ");
    if (e.kind === "expert" && /\bAXIA\b/.test(e.title)) bad.push(`${e.id}: título de especialista com AXIA`);
    if (/\bAXIA\b[^.]{0,60}\b(especialista|expert)\b/i.test(t) && !/n[ãa]o [ée]\b[^.]{0,40}(especialista|expert)|exclusivamente|assistente de d[úu]vidas/i.test(t)) bad.push(`${e.id}: AXIA descrita como especialista`);
  }
  const axia = ACC_FEATURE_HELP["experts.hub.axia-diferenca"];
  ok(axia, "entrada experts.hub.axia-diferenca ausente");
  ok(/exclusivamente o assistente de d[úu]vidas sobre o uso do ACC/.test(axia.description), "descrição deve dizer que a AXIA é exclusivamente o assistente de dúvidas sobre o uso do ACC");
  ok(/n[ãa]o [ée] um dos sete especialistas/i.test(axia.description), "deve dizer que não é um dos sete especialistas");
  const btn = ACC_FEATURE_HELP["experts.alertas.botao-especialista"];
  ok(btn && /A AXIA n[ãa]o [ée] um especialista e nunca participa/.test(btn.description), "botão ESPECIALISTA deve declarar que a AXIA nunca participa");
  ok(/nunca altera|n[ãa]o altera o estado do alerta/i.test((btn.consequences ?? []).join(" ")), "botão ESPECIALISTA deve declarar que não altera o alerta");
  for (const id of EXPERT_IDS) ok(!/\bAXIA\b/.test(profileOf(id).title), `${id}: título cita AXIA`);
  ok(bad.length === 0, bad.join(" | "));
});

check("roteamento documentado no botão ESPECIALISTA bate com o código (expert-topics e specialties)", () => {
  const btn = ACC_FEATURE_HELP["experts.alertas.botao-especialista"];
  const spec = read("apps/web/lib/ai/alert-consult/specialties.ts");
  const topics = read("apps/web/lib/ai/routing/expert-topics.ts");
  const how = btn.howItWorks;
  ok(/"documentacao"[\s\S]*?expertId: "legal-consultant"/.test(spec) && /Documenta[çc][ãa]o e Entrega[^.]*Consultor Jur[íi]dico IA/.test(how), "Documentação e Entrega → Consultor Jurídico IA");
  ok(/engenharia[\s\S]*?"engineering-director"/.test(spec) && /Engenharia → Diretor de Engenharia e Constru[çc][ãa]o IA/.test(how), "Engenharia → engineering-director");
  ok(/case "ESG_SSMA"/.test(spec) && /SSMA\/ESG → Diretor de ESG IA/.test(how), "SSMA/ESG → esg-director");
  ok(/MULTI/.test(topics) && /curadoria multi-especialista/.test(how) && /CEO IA/.test(how), "multidisciplinar → curadoria + CEO IA");
  ok(/A AXIA \(assistente de ajuda\) nunca é um destino/.test(topics), "o código deve declarar que a AXIA nunca é destino do roteamento");
});

check("as telas exibem o perfil a partir do catálogo (HelpContent/FeatureInfo), sem texto de perfil digitado na página", () => {
  const desc = read("apps/web/app/[projectId]/experts-ia/descricao/page.tsx");
  const hub = read("apps/web/app/[projectId]/experts-ia/page.tsx");
  ok(/HelpContent/.test(desc) && /EXPERT_PROFILE_HELP_ID/.test(desc) && /getFeatureHelp/.test(desc), "descrição deve renderizar o perfil via HelpContent a partir do catálogo");
  ok(/EXPERT_PROFILE_HELP_ID/.test(hub) && /FeatureInfo/.test(hub), "hub deve usar o ícone com o perfil do catálogo");
  for (const phrase of ["Perfil profissional SIMULADO", "não é uma pessoa", "20 consultas por usuário", "Framework Comum"]) {
    ok(!desc.includes(phrase) && !hub.includes(phrase), `texto de perfil digitado na página: "${phrase}"`);
  }
});

check("o perfil do especialista aparece no manifesto experts (hub) e no manifesto engenharia (Engenharia)", () => {
  const manifest = read("apps/web/lib/ui/help/manifests/experts.ts");
  const eng = read("apps/web/lib/ui/help/manifests/engenharia.ts");
  for (const id of EXPERT_IDS) ok(manifest.includes(EXPERT_PROFILE_HELP_ID[id]), `manifesto experts sem ${EXPERT_PROFILE_HELP_ID[id]}`);
  ok(eng.includes("experts.engenharia.perfil"), "manifesto engenharia deve referenciar experts.engenharia.perfil");
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
