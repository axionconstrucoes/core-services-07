// Integridade do catálogo universal de ajuda contextual (Hover Text) e dos manifestos por módulo.
// Verifica: ids únicos e bem formados, campos obrigatórios por tipo, ausência de texto genérico/vazio, regras de conteúdo (SLAs aprovados,
// AXIA ≠ especialista), referências íntegras entre manifestos e catálogo, e que cada helpId declarado nos manifestos REALMENTE é renderizado
// no código (`helpId="..."`). NÃO mede cobertura percentual (ver scripts/test-help-coverage.mjs) e NÃO declara 100% sem inventário.
// Uso: node scripts/test-help-catalog.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { ALL_HELP_ENTRIES, ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const { ALL_HELP_MANIFESTS } = await import("../apps/web/lib/ui/help/manifests/index.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log(`OK   ${n}`); passed++; } catch (e) { console.log(`FAIL ${n}\n     ${e.message}`); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}
const sources = walk(path.join(root, "apps/web/app")).concat(walk(path.join(root, "apps/web/components")), walk(path.join(root, "apps/web/lib")));
const SOURCE_TEXT = sources.map((f) => readFileSync(f, "utf8")).join("\n");
const isRendered = (id) => new RegExp(`helpId=(?:"|\\{["'\`])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:"|["'\`]\\})`).test(SOURCE_TEXT) || SOURCE_TEXT.includes(`"${id}"`);

const LEGACY_IDS = new Set(ALL_HELP_ENTRIES.slice(0, 91).map((e) => e.id)); // as 91 entradas legadas mantêm seus ids
const NEW_ENTRIES = ALL_HELP_ENTRIES.filter((e) => !LEGACY_IDS.has(e.id));

const GENERIC = [/^clique aqui/i, /lorem ipsum/i, /^campo de (texto|preenchimento)\.?$/i, /^esta (tela|página|aba)\.?$/i, /^mais informações\.?$/i, /^todo\b/i, /^tbd\b/i, /^a definir/i, /^em breve/i];
const IMPERFECT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*){2,}$/; // modulo.tela.elemento

check("ids únicos em todo o catálogo (legado + módulos)", () => {
  const seen = new Map(); const dup = [];
  for (const e of ALL_HELP_ENTRIES) { if (seen.has(e.id)) dup.push(e.id); seen.set(e.id, true); }
  ok(dup.length === 0, `ids duplicados: ${dup.join(", ")}`);
});
check("entradas legadas preservadas (91) com id/título/descrição não vazios", () => {
  ok(LEGACY_IDS.size === 91, `legado esperado 91, obtido ${LEGACY_IDS.size}`);
  for (const id of LEGACY_IDS) { const e = ACC_FEATURE_HELP[id]; ok(e.title?.trim() && e.shortDescription?.trim() && e.description?.trim(), `legado ${id} incompleto`); }
});
check("entradas novas: id no formato modulo.tela.elemento, versão e kind obrigatórios", () => {
  const bad = [];
  for (const e of NEW_ENTRIES) {
    if (!IMPERFECT_ID.test(e.id)) bad.push(`${e.id}: id fora do formato modulo.tela.elemento`);
    if (!e.version?.trim()) bad.push(`${e.id}: sem version`);
    if (!e.kind) bad.push(`${e.id}: sem kind`);
    if (!e.module) bad.push(`${e.id}: sem module`);
  }
  ok(bad.length === 0, bad.slice(0, 8).join(" | "));
});
check("entradas novas: sem texto genérico/vazio; descrição substantiva (>= 60 caracteres) e título/curto preenchidos", () => {
  const bad = [];
  for (const e of NEW_ENTRIES) {
    for (const f of ["title", "shortDescription", "description", "purpose", "howItWorks", "source", "refresh", "missingData", "result", "permissions", "validity"]) {
      const v = e[f]; if (typeof v === "string" && v.trim() === "") bad.push(`${e.id}.${f} vazio`);
      if (typeof v === "string" && GENERIC.some((g) => g.test(v.trim()))) bad.push(`${e.id}.${f} genérico`);
    }
    for (const f of ["howToUse", "data", "criteria", "consequences", "limitations", "uses"]) {
      if (e[f] && (!Array.isArray(e[f]) || e[f].some((x) => typeof x !== "string" || !x.trim()))) bad.push(`${e.id}.${f} inválido`);
    }
    if ((e.description ?? "").trim().length < 60) bad.push(`${e.id}: description curta demais (${(e.description ?? "").length})`);
    if ((e.shortDescription ?? "").length > 160) bad.push(`${e.id}: shortDescription > 160`);
  }
  ok(bad.length === 0, bad.slice(0, 8).join(" | "));
});
check("KPIs/indicadores: exigem fórmula real, fonte, unidade/período, atualização e tratamento de dado ausente", () => {
  const bad = [];
  for (const e of NEW_ENTRIES.filter((x) => x.kind === "kpi")) for (const f of ["formula", "source", "unit", "refresh", "missingData"]) if (!e[f]?.trim()) bad.push(`${e.id}: falta ${f}`);
  ok(bad.length === 0, bad.slice(0, 10).join(" | "));
});
check("especialistas de IA: limitações e revisão humana obrigatórias; AXIA nunca descrita como especialista", () => {
  const bad = [];
  for (const e of NEW_ENTRIES.filter((x) => x.kind === "expert")) { if (!(e.limitations?.length)) bad.push(`${e.id}: sem limitations`); if (!e.humanReview?.trim()) bad.push(`${e.id}: sem humanReview`); }
  for (const e of ALL_HELP_ENTRIES) {
    const t = [e.title, e.description, e.purpose, e.howItWorks].join(" ");
    if (/\bAXIA\b[^.]{0,60}\b(especialista|expert)\b/i.test(t) && !/n[ãa]o (é|e)\b[^.]{0,40}(especialista|expert)|n[ãa]o se confunde|exclusivamente|assistente de d[úu]vidas/i.test(t)) bad.push(`${e.id}: AXIA descrita como especialista`);
  }
  ok(bad.length === 0, bad.join(" | "));
});
check("SLAs: valores antigos (MÉDIO 1 dia útil / BAIXO 3 dias úteis) só aparecem declarados em `validity`; aprovados citados corretamente", () => {
  const bad = [];
  for (const e of NEW_ENTRIES) {
    const body = [e.description, e.purpose, e.howItWorks, ...(e.criteria ?? []), ...(e.data ?? []), e.formula, e.result, ...(e.consequences ?? [])].filter(Boolean).join(" ");
    if (/m[ée]dio[^.]{0,40}\b1 dia/i.test(body) || /baixo[^.]{0,40}\b3 dias/i.test(body)) bad.push(`${e.id}: cita prazo antigo como regra`);
    if (/m[ée]dio[^.]{0,40}\b(?!2\b)(\d+) dias? [úu]teis/i.test(body) && !/2 dias [úu]teis/i.test(body)) bad.push(`${e.id}: MÉDIO com prazo diferente do aprovado (2 dias úteis)`);
    if (/baixo[^.]{0,40}\b(?!5\b)(\d+) dias? [úu]teis/i.test(body) && !/5 dias [úu]teis/i.test(body)) bad.push(`${e.id}: BAIXO com prazo diferente do aprovado (5 dias úteis)`);
  }
  ok(bad.length === 0, bad.join(" | "));
});
check("manifestos: módulos distintos, elementos com kind/label/rota e (helpId OU gap OU exempt justificado)", () => {
  const bad = [];
  const mods = new Set();
  for (const m of ALL_HELP_MANIFESTS) {
    if (mods.has(m.module)) bad.push(`módulo duplicado ${m.module}`); mods.add(m.module);
    for (const el of m.elements) {
      if (!el.route?.trim() || !el.label?.trim() || !el.kind) bad.push(`${m.module}: elemento sem rota/label/kind (${JSON.stringify(el).slice(0, 60)})`);
      if (!el.helpId && !el.gap && !el.exempt) bad.push(`${m.module} ${el.route} "${el.label}": sem helpId, gap nem exempt`);
      if (el.gap && el.gap.trim().length < 15) bad.push(`${m.module} "${el.label}": gap sem motivo`);
      if (el.exempt && el.exempt.trim().length < 15) bad.push(`${m.module} "${el.label}": exempt sem justificativa`);
    }
  }
  ok(bad.length === 0, bad.slice(0, 8).join(" | "));
});
check("manifestos: todo helpId referenciado existe no catálogo e está realmente renderizado no código", () => {
  const bad = [];
  for (const m of ALL_HELP_MANIFESTS) for (const el of m.elements) {
    if (!el.helpId) continue;
    if (!ACC_FEATURE_HELP[el.helpId]) bad.push(`${m.module}: helpId inexistente "${el.helpId}"`);
    else if (!isRendered(el.helpId)) bad.push(`${m.module}: helpId "${el.helpId}" não é renderizado em nenhum arquivo`);
  }
  ok(bad.length === 0, bad.slice(0, 8).join(" | "));
});
check("catálogo: toda entrada nova de módulo é usada (referenciada em manifesto ou no código) — sem entradas órfãs", () => {
  const referenced = new Set(ALL_HELP_MANIFESTS.flatMap((m) => m.elements.map((e) => e.helpId).filter(Boolean)));
  const orphans = NEW_ENTRIES.filter((e) => !referenced.has(e.id) && !isRendered(e.id)).map((e) => e.id);
  ok(orphans.length === 0, `órfãs: ${orphans.slice(0, 10).join(", ")}`);
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
