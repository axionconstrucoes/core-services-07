// Fase 4 / D — menu e rotas por nível (tier), parte PURA (sem banco): matriz perfil x item do menu, fail-closed, guarda de rota nos
// quatro segmentos (Qualidade, Garantias, Seguros, Pilares) e coerência com os wrappers SQL (quality_can_read / insurance_access READ).
// A paridade com o Postgres real está em scripts/test-destinatarios-externos-realpg.mjs (seção do menu).
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-menu-permissoes.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const T = await import("../apps/web/lib/permissions/project-tier.ts");
const N = await import("../apps/web/lib/permissions/nav-access.ts");
const NAV = await import("../apps/web/lib/ui/nav-items.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message.split("\n")[0]}`);
    failed += 1;
  }
}

const GATED = ["pilares", "qualidade", "garantias", "seguros"]; // Fase 4/D: os quatro com nível mínimo READ
// Fase 6/H2a: dois segmentos acrescentados — competencias (READ) e aprovacoes-externas (REGISTER: preparar envio exige colaborador ou acima).
const H2A = { competencias: "READ", "aprovacoes-externas": "REGISTER" };
const ALL_GATED = [...GATED, ...Object.keys(H2A)];

check("segmentos restritos por nível: Quatro Pilares, Qualidade, Garantias, Seguros (+ Competências e Aprovações externas da Fase 6/H2a), todos existentes no menu", () => {
  assert.deepEqual(Object.keys(N.TIER_GATED_SEGMENTS).sort(), [...ALL_GATED].sort());
  const hrefs = NAV.NAV_ITEMS.map((i) => i.href);
  for (const s of ALL_GATED) assert.ok(hrefs.includes(s), s);
  for (const [s, min] of Object.entries(H2A)) assert.equal(N.TIER_GATED_SEGMENTS[s], min, s);
});

check("matriz perfil x item: LEITURA, COLABORADOR, GESTOR, GERENTE e ADMINISTRADOR ativos veem os quatro itens (e os da H2a conforme o nível mínimo)", () => {
  for (const role of ["LEITURA", "COLABORADOR", "GESTOR", "GERENTE", "ADMINISTRADOR", "VIEWER", "EDITOR", "ADMIN"]) {
    const tier = T.projectTierFor(role, "ACTIVE");
    for (const s of GATED) assert.equal(N.canAccessSegment(s, tier), true, `${role}/${s}`);
    for (const [s, min] of Object.entries(H2A)) assert.equal(N.canAccessSegment(s, tier), T.tierAtLeast(tier, min), `${role}/${s}`);
    const expectHidden = Object.entries(H2A).filter(([, min]) => !T.tierAtLeast(tier, min)).map(([s]) => s).sort();
    assert.deepEqual(N.hiddenSegmentsForTier(tier).sort(), expectHidden, role);
  }
  // LEITURA não vê Aprovações externas; COLABORADOR+ vê
  assert.equal(N.canAccessSegment("aprovacoes-externas", "READ"), false);
  assert.equal(N.canAccessSegment("aprovacoes-externas", "REGISTER"), true);
});

check("fail-closed: inativo, convite pendente, papel desconhecido, sem membership, nível inválido/nulo/objeto => todos os itens restritos ocultos e rotas negadas", () => {
  const cases = [T.projectTierFor("ADMINISTRADOR", "INACTIVE"), T.projectTierFor("ADMINISTRADOR", "PENDING"), T.projectTierFor("SUPERUSER", "ACTIVE"),
    T.projectTierFor(null), T.projectTierFor(undefined), "NONE", "admin", "ADMIN ", "", null, undefined, 4, {}, [], "READ\n", "__proto__", "constructor"];
  for (const tier of cases) {
    assert.deepEqual(N.hiddenSegmentsForTier(tier).sort(), [...ALL_GATED].sort(), JSON.stringify(tier));
    for (const s of ALL_GATED) assert.equal(N.canAccessSegment(s, tier), false, `${JSON.stringify(tier)}/${s}`);
  }
});

check("segmento sem regra de nível não é afetado (Dashboard, Timeline, ...); regras `restrictedTo` continuam separadas", () => {
  for (const s of ["dashboard", "timeline", "documentos", "juridico", "ledger", "usuarios"]) assert.equal(N.canAccessSegment(s, "NONE"), true, s);
  assert.equal(NAV.NAV_ITEMS.find((i) => i.href === "usuarios").restrictedTo, "admin");
});

check("o nível mínimo de cada segmento é o nível de LEITURA do módulo no banco (wrappers SQL: quality_can_read e insurance_access READ)", () => {
  const w = read("supabase/migrations/20261123101000_unified_permission_wrappers.sql");
  assert.match(w, /quality_can_read/);
  assert.match(w, /acc_project_tier/);
  assert.match(w, /'READ'/);
  for (const s of GATED) assert.equal(N.TIER_GATED_SEGMENTS[s], "READ", s);
  // READ == mais baixo nível com acesso: nenhum perfil ativo é bloqueado e NONE sempre é.
  assert.equal(T.PROJECT_TIER_RANK.READ, 1);
});

check("layout do projeto: oculta pelo nível usando a MESMA função da guarda de rota (sem lista paralela)", () => {
  const layout = read("apps/web/app/[projectId]/layout.tsx");
  assert.match(layout, /hiddenSegmentsForTier\(projectTier\)/);
  assert.match(layout, /getProjectTier\(projectId\)/);
  assert.match(layout, /if \(hiddenByTier\.has\(item\.href\)\) return true;/);
});

check("guarda de rota: layout.tsx em cada segmento restrito chama requireSegmentAccess com o segmento correto (acesso direto por URL negado)", () => {
  for (const s of ALL_GATED) {
    const p = `apps/web/app/[projectId]/${s}/layout.tsx`;
    assert.ok(existsSync(path.join(here, "..", p)), p);
    const src = read(p);
    assert.match(src, new RegExp(`requireSegmentAccess\\(projectId, "${s}"\\)`), p);
    assert.match(src, /await params/);
  }
});

check("guarda de rota: sem nível => notFound(); RPC acc_project_tier é a autoridade e o fallback usa a MESMA tabela sobre membership ACTIVE", () => {
  const src = read("apps/web/lib/permissions/project-tier-server.ts");
  assert.match(src, /if \(!canAccessSegment\(segment, await getProjectTier\(projectId\)\)\) notFound\(\)/);
  assert.match(src, /rpc\("acc_project_tier"/);
  assert.match(src, /projectTierFor\(membership\.permission, membership\.status\)/);
  assert.match(src, /if \(!authData\.user\) return "NONE"/);
  assert.match(src, /if \(membershipError \|\| !membership\) return "NONE"/);
});

check("a sidebar continua renderizando só os itens permitidos (mesma lista no desktop, celular e menu recolhido)", () => {
  const sb = read("apps/web/components/layout/app-sidebar.tsx");
  assert.match(sb, /NAV_ITEMS\.filter\(\(item\) => !hiddenHrefs\.includes\(item\.href\)\)/);
  assert.equal((sb.match(/NAV_ITEMS\.filter/g) ?? []).length, 1);
});

check("todo item do menu continua com helpId (Hover Text) — itens ocultos não perdem ajuda", () => {
  for (const i of NAV.NAV_ITEMS) assert.ok(i.helpId && i.helpId.length > 0, i.href);
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
