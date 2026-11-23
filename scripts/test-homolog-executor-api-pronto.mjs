// Prontidao OFFLINE do ensaio do transporte do executor (etapa `executor-api` e salvar-token-supabase.ps1). Docs: docs/implantacao/25 e 28.
// So le arquivos e roda o executor em --dry-run/recusas locais: nenhuma rede, nenhum token, nenhum banco.
// Uso: node scripts/test-homolog-executor-api-pronto.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { forbiddenEnvNames } from "./homolog/guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.message}`); }
}
const assert = (c, m = "assercao falhou") => { if (!c) throw new Error(m); };

const salvar = read("scripts/homolog/salvar-token-supabase.ps1");
const executar = read("scripts/homolog/executar-homolog.ps1");
const HOMOLOG_REF = "gtadbeaevxglrqkhcwfz";
const OPERACIONAIS = ["plbcvwostmdmdmrziwmd", "jawaqwtcukrexnisogzo", "asaraykwyhmdiyrlaupq"];

check("salvar-token-supabase.ps1: ref fixo do homolog, recusa refs operacionais, valida so o homolog e grava criptografado (DPAPI)", () => {
  assert(salvar.includes(`$ref = '${HOMOLOG_REF}'`));
  for (const r of OPERACIONAIS) assert(salvar.includes(r), `falta a recusa de ${r}`);
  assert(/-AsSecureString/.test(salvar), "o token deve ser lido sem eco");
  assert(/ConvertFrom-SecureString/.test(salvar), "o token deve ser gravado criptografado (DPAPI)");
  assert(/StartsWith\('sbp_'\)/.test(salvar), "confere o formato do token");
  assert(/-K -/.test(salvar), "o token vai ao curl por stdin, nunca na linha de comando");
  assert(!/Write-Host[^\n]*\$t\b/.test(salvar) && !/Write-Host[^\n]*\$sec\b/.test(salvar), "o token nao pode ser impresso");
  const alvosHttp = [...salvar.matchAll(/https:\/\/[^\s"`']+/g)].map((m) => m[0]);
  assert(alvosHttp.every((u) => u.startsWith("https://api.supabase.com/v1/projects/$ref")), `chamada fora do projeto de homologacao: ${alvosHttp.join()}`);
  assert(/Move-Item[^\n]*\.bak-/.test(salvar), "arquivo anterior deve virar backup, nao ser sobrescrito");
});

check("executar-homolog.ps1 -Etapa executor-api: usa o executor com --alvo homolog e o arquivo DPAPI do token, sem --producao", () => {
  assert(/ValidateSet\([^)]*'executor-api'/.test(executar));
  const linha = executar.split("\n").find((l) => l.includes("'executor-api' ="));
  assert(linha, "mapeamento da etapa ausente");
  assert(linha.includes("scripts/implantacao/executor-ondas.mjs") && linha.includes("'--alvo', 'homolog'") && linha.includes("supabase-pat.dpapi"));
  assert(!/producao/i.test(linha), "a etapa nunca passa --producao");
  assert(executar.includes(`$ref = '${HOMOLOG_REF}'`));
  for (const r of OPERACIONAIS) assert(executar.includes(r));
});

check("as variaveis que executar-homolog.ps1 exporta nao disparam a guarda de ambiente limpo do executor", () => {
  const exportadas = [...executar.matchAll(/\$env:([A-Z0-9_]+)\s*=/g)].map((m) => m[1]);
  assert(exportadas.length > 3);
  const falso = Object.fromEntries(exportadas.map((n) => [n, "x"]));
  const ruins = forbiddenEnvNames(falso);
  assert(ruins.length === 0, `variaveis proibidas exportadas: ${ruins.join()}`);
});

check("o executor recusa, sem rede: segredo ausente (homolog) e producao sem a bandeira explicita", () => {
  const exec = (a, env = {}) => spawnSync(process.execPath, ["--no-warnings", "scripts/implantacao/executor-ondas.mjs", ...a], { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env } });
  const a = exec(["--alvo", "homolog", "--verificar", "--segredo", path.join(root, "nao-existe", "x.dpapi")]);
  assert(a.status === 2 && /SEGREDO/.test(a.stdout + a.stderr), `status ${a.status}: ${(a.stdout + a.stderr).slice(0, 200)}`);
  const b = exec(["--alvo", "operacional", "--ondas", "A", "--segredo", path.join(root, "nao-existe", "x.dpapi")]);
  assert(b.status === 2 && /PRODUCAO_SEM_FLAG/.test(b.stdout + b.stderr), `status ${b.status}: ${(b.stdout + b.stderr).slice(0, 200)}`);
});

check("o executor --dry-run --todas lista 70 itens e 14 ondas, incluindo a onda N (watchdog), sem rede", () => {
  const r = spawnSync(process.execPath, ["--no-warnings", "scripts/implantacao/executor-ondas.mjs", "--dry-run", "--todas"], { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  assert(r.status === 0, `status ${r.status}`);
  const out = r.stdout;
  assert(/Itens: 70\b/.test(out), "esperado 70 itens");
  assert((out.match(/^== onda /gm) ?? []).length === 14, "esperado 14 ondas");
  assert(/^== onda N \(1\)/m.test(out) && out.includes("20261212100000_watchdog_project_resolution"));
  assert(!out.includes("20261121177000") && !out.includes("20261123302000"), "as adiadas nao entram no plano --todas");
});

check("sintaxe PowerShell valida (quando ha powershell no ambiente)", () => {
  const ps = spawnSync("powershell", ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" });
  if (ps.error || ps.status !== 0) { console.log("     (powershell indisponivel: verificacao de sintaxe pulada)"); return; }
  for (const f of ["scripts/homolog/salvar-token-supabase.ps1", "scripts/homolog/executar-homolog.ps1"]) {
    const cmd = `$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${path.join(root, f).replace(/'/g, "''")}',[ref]$null,[ref]$e);exit $e.Count`;
    const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
    assert(r.status === 0, `${f}: ${r.status} erro(s) de sintaxe`);
  }
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
