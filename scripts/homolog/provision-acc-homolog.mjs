#!/usr/bin/env node
// PROCEDIMENTO ÚNICO de provisionamento do acc-homolog (Fase 7 / H6a). DRY-RUN POR PADRÃO: não chama rede nem cria nada.
// Só cria recurso (custo!) com TODAS as condições: --execute  +  --confirm-cost "<valor>"  +  HOMOLOG_AUTHORIZED=SIM  +  HOMOLOG_DB_PASSWORD (ambiente)
//   +  --ref-file=<arquivo FORA do repositório>. Se o projeto JÁ EXISTE (criado pelo responsável), use --adopt-ref=<ref>: não cria nada nem exige custo.
// Uso:
//   node scripts/homolog/provision-acc-homolog.mjs                      (dry-run: confere pré-requisitos e imprime o plano)
//   HOMOLOG_AUTHORIZED=SIM node scripts/homolog/provision-acc-homolog.mjs --adopt-ref=<ref> --ref-file=<fora> --execute   (adota projeto existente; roda guarda + migrations)
//   HOMOLOG_AUTHORIZED=SIM HOMOLOG_DB_PASSWORD=... node ... --execute --confirm-cost "US$ 10/mes" --ref-file=<fora>   (CRIA o projeto)
// Nunca imprime senha/chaves. A string de conexão do kit (HOMOLOG_DATABASE_URL) é montada pelo OPERADOR a partir do painel (Connect).
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ORG_ID, PROJECT_NAME, REGION, SIZE, REF_RE, buildCreateCommand, buildCreateArgs, evaluateProvision, redact } from "./provision-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const opt = (n) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`));
  if (a) return a.slice(n.length + 3);
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const args = { execute: argv.includes("--execute"), confirmCost: opt("confirm-cost"), adoptRef: opt("adopt-ref"), refFile: opt("ref-file") };
const secrets = [process.env.HOMOLOG_DB_PASSWORD, process.env.HOMOLOG_DATABASE_URL];
const say = (m) => console.log(redact(m, secrets));
const die = (m, code = 2) => { console.error(redact(`RECUSADO/ERRO: ${m}`, secrets)); process.exit(code); };

const linkFile = path.join(root, "supabase", ".temp", "project-ref");
const linkedRefText = existsSync(linkFile) ? readFileSync(linkFile, "utf8") : "";
const verdict = evaluateProvision(args, process.env, { repoRoot: root, linkedRefText });
if (!verdict.ok) { verdict.problems.forEach((p) => console.error(`RECUSADO: ${p}`)); process.exit(2); }

say(`== Provisionamento ${PROJECT_NAME} (${verdict.mode.toUpperCase()}) ==`);
say(`Organização ${ORG_ID} | região ${REGION} | compute ${SIZE} (~US$ 10/mês; ver docs/homologacao-acc-homolog-passo-a-passo.md seção 1)`);
[
  args.adoptRef ? `1. (adoção) projeto existente ${args.adoptRef}: nada será criado` : `1. CRIAR: ${buildCreateCommand()}`,
  "2. Gravar o ref em arquivo FORA do repositório (--ref-file)",
  "3. Conferir variáveis: node scripts/homolog/check-env.mjs --file=<dotenv-homolog fora do repo>",
  "4. Migrations pelo kit: apply-migrations.mjs (dry-run) -> --init-marker -> --apply -> --verify (guarda: ref != operacional, HOMOLOG_TARGET_REF, HOMOLOG_I_UNDERSTAND_ISOLATED=true)",
  "5. Login Google do P-ADM (uma vez) e depois seed-e-perfis.mjs (dry-run) -> --apply",
].forEach((s) => say(s));

if (verdict.mode === "dry-run") {
  say("DRY-RUN: nenhuma rede acessada, nenhum recurso criado. Para executar: ver cabeçalho do script e a seção 9 do passo a passo.");
  process.exit(0);
}

// ------------------------- EXECUÇÃO (só após autorização explícita) -------------------------
let ref = args.adoptRef;
if (!ref) {
  say(`Criando o projeto (custo recorrente confirmado: ${args.confirmCost})...`);
  const r = spawnSync("npx", buildCreateArgs(process.env.HOMOLOG_DB_PASSWORD), { encoding: "utf8", shell: process.platform === "win32" });
  say(`${r.stdout ?? ""}${r.stderr ?? ""}`);
  if (r.status !== 0) die("a CLI não concluiu a criação (nada foi gravado)", 1);
  const m = /\b([a-z]{20})\b/.exec(`${r.stdout}\n${r.stderr}`);
  if (!m) die("não foi possível identificar o ref na saída da CLI; informe-o com --adopt-ref e rode de novo", 1);
  ref = m[1];
}
if (!REF_RE.test(ref)) die("ref inválido");
mkdirSync(path.dirname(path.resolve(args.refFile)), { recursive: true });
writeFileSync(args.refFile, `${ref}\n`, { mode: 0o600 });
say(`Ref gravado em ${path.resolve(args.refFile)} (fora do repositório).`);

const env = { ...process.env, HOMOLOG_TARGET_REF: ref, HOMOLOG_I_UNDERSTAND_ISOLATED: "true" };
const run = (script, extra = []) => {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "homolog", script), ...extra], { env, encoding: "utf8" });
  say(`${r.stdout ?? ""}${r.stderr ?? ""}`);
  return r.status === 0;
};
const envFile = process.env.HOMOLOG_ENV_FILE;
if (envFile) { if (!run("check-env.mjs", [`--file=${envFile}`])) die("check-env reprovou o dotenv de homologação", 1); }
else say("HOMOLOG_ENV_FILE não definido: check-env será feito depois que o dotenv existir (passo 3).");
if (!process.env.HOMOLOG_DATABASE_URL) {
  say("HOMOLOG_DATABASE_URL ausente: defina-a (painel -> Connect; nunca em arquivo do repositório) e rode de novo para aplicar as migrations. Parando aqui, com segurança.");
  process.exit(0);
}
for (const step of [[], ["--init-marker"], ["--apply"], ["--verify"]]) {
  if (!run("apply-migrations.mjs", step)) die(`apply-migrations ${step.join(" ") || "(dry-run)"} falhou; o kit para na primeira falha`, 1);
}
say("Migrations aplicadas e verificadas. Próximo: P-ADM entra com o Google uma vez; depois node scripts/homolog/seed-e-perfis.mjs --apply (HOMOLOG_TEST_ACCOUNTS).");
