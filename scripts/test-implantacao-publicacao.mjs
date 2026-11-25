// Fase 6/H4: consistência dos documentos 10 a 13 (inventário/volume, opções de registro, plano de publicação, DNS) com a sequência e o
// inventário. So le arquivos. Uso: node scripts/test-implantacao-publicacao.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`OK   ${name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e instanceof Error ? e.message : e}`); }
}
const assert = (c, m = "asserção falhou") => { if (!c) throw new Error(m); };

const seq = JSON.parse(read("scripts/data/implantacao-sequencia.json"));
const d10 = read("docs/implantacao/10-fase6-h4-inventario-ensaio-volume.md");
const d11 = read("docs/implantacao/11-opcoes-registro-historico.md");
const d12 = read("docs/implantacao/12-plano-publicacao-rollback-por-ondas.md");
const d13 = read("docs/implantacao/13-dns-spf-dkim-dmarc-configuracao.md");
const inv = read("docs/implantacao/01-inventario-migrations.md");
const all = [d10, d11, d12, d13].join("\n");

const pend = new Set([...seq.ondas.flatMap((o) => o.migrations), ...seq.adiadas.map((a) => a.migration)]);
const invPend = [...inv.matchAll(/^\| (\d{14}_[a-z0-9_]+) \| (pendente[a-z-]*) \|/gm)].map((m) => m[1]);

check("a contagem de pendentes dos documentos 10/12 = inventário 01 = sequência JSON", () => {
  assert(invPend.length === pend.size, `inventário ${invPend.length} x sequência ${pend.size}`);
  assert(invPend.every((s) => pend.has(s)), "pendente do inventário fora da sequência");
  assert(new RegExp(`\\*\\*${pend.size}\\*\\*`).test(d10), `doc 10 deve afirmar ${pend.size} pendentes`);
  assert(d10.includes("134 + 1 + 65 = 200") || d10.includes(`134 + 1 + ${pend.size} =`), "conferência aritmética");
});

check("o plano 12 cobre TODAS as ondas e as adiadas, com os 4 elementos obrigatórios", () => {
  for (const o of seq.ondas) assert(d12.includes(`**${o.id}**`), `onda ${o.id} ausente no 12`);
  for (const a of seq.adiadas) assert(d12.includes(a.migration.slice(0, 14)), `adiada ${a.migration} ausente`);
  for (const k of ["lock_timeout", "statement_timeout", "P0", "Rollback", "Parada", "verificar", "Dono"]) assert(d12.includes(k), `falta ${k}`);
  assert(/930f6d75898793479b418950b0053bd9/.test(d12), "hash P0");
  assert(/banco -> app -> H2 -> competências -> pipeline/.test(d12), "ordem banco->app->competências->pipeline");
});

check("o plano 12 documenta H2a/H2b/H2c (20261208/09/10) e o procedimento de atualização do JSON", () => {
  assert(/20261208/.test(d12) && /20261209/.test(d12) && /20261210/.test(d12) && /gen-verificacao-onda/.test(d12) && /implantacao-sequencia\.json/.test(d12), "H2");
});

check("nenhum comando do plano 12 contém credencial; a conexão é sempre a variável CONN", () => {
  assert(!/postgres(ql)?:\/\/[^\s"$]*:[^\s"$@]+@/i.test(all), "string de conexão com senha");
  assert(!/(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|service_role_key\s*=)/.test(all), "token");
  assert(/"\$CONN"/.test(d12), "usa $CONN");
  assert(/NUNCA gravada no repositório/.test(d12), "aviso sobre a conexão");
});

check("os documentos declaram que nada foi executado/aplicado e não escolhem entre (a) e (b)", () => {
  assert(/nenhum comando foi executado/i.test(d12) && /nada foi aplicado/i.test(d10), "status");
  assert(/não escolhe|nada foi escolhido/i.test(d11) && /DECISÃO DO DONO/.test(d11), "não escolhe");
  assert(/Recomendação/i.test(d11) && /\(b\)/.test(d11) && /\(a\)/.test(d11), "recomendação");
  assert(!/hotfix[^.]*reaplic(ar|ado)\s+(agora|na onda)/i.test(d12), "hotfix não reaplicado");
});

check("o DNS (13) cobre SPF, DKIM e DMARC por provedor, usa exemplos e não altera nada", () => {
  for (const k of ["v=spf1 include:_spf.google.com", "google._domainkey", "_dmarc", "rua=mailto:", "spf.protection.outlook.com", "selector1._domainkey", "Nenhum DNS alterado"]) assert(d13.includes(k), `falta ${k}`);
  assert(/EXEMPLOS/.test(d13), "valores de exemplo");
});

check("o inventário/volume (10) cita as opções de cópia fiel com custo, ação humana e recomendação", () => {
  for (const k of ["pg_dump", "PITR", "branch", "RECOMENDAÇÃO", "Custo", "Ação humana"]) assert(new RegExp(k, "i").test(d10), `falta ${k}`);
});

check("os scripts da H4 estão na lista de testes", () => {
  const lst = read("scripts/test-scripts.list");
  assert(lst.includes("scripts/test-implantacao-verificacao.mjs") && lst.includes("scripts/test-implantacao-publicacao.mjs"), "lista");
});

check("nenhum script versionado da H4 contém comando de aplicação operacional", () => {
  for (const f of ["scripts/gen-verificacao-onda.mjs", "scripts/ensaio-implantacao-volume-lib.mjs"]) {
    const t = read(f);
    assert(!/(db push|apply_migration|migration up|plbcvwostmdmdmrziwmd)/.test(t), `${f}: comando operacional`);
  }
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
