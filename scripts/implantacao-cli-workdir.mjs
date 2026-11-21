// Monta, FORA do repositorio, o diretorio de trabalho "supabase/migrations" CUMULATIVO de uma onda para a CLI oficial do Supabase
// (`supabase db push --workdir <dir>`): historico remoto esperado (134 registradas + ondas anteriores [+ hotfix depois do repair]) + a onda.
// Por que cumulativo: a CLI compara os arquivos locais com supabase_migrations.schema_migrations; versao remota sem arquivo local e erro,
// e `db push` aplica TODOS os arquivos locais que nao estao no historico (nao ha --target nem exclusao). Ver docs/implantacao/14.
// SOMENTE copia arquivos locais; nao abre rede, nao chama a CLI, nao toca no banco. Uso:
//   node scripts/implantacao-cli-workdir.mjs --listar
//   node scripts/implantacao-cli-workdir.mjs --onda B --out C:\temp\wd-B      (--out deve ficar FORA do repositorio)
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const HOTFIX = "20261121090000_hotfix_risk_alert_action_authorization";
// O hotfix so entra no historico DEPOIS da onda B: registrado antes, deixaria a maior versao remota (20261121090000)
// acima das versoes 20261120* da onda B, que viraria "fora de ordem" (exigiria --include-all).
export const HOTFIX_APOS_ONDA = "B";

export function plano() {
  const seq = JSON.parse(readFileSync(path.join(root, "scripts", "data", "implantacao-sequencia.json"), "utf8"));
  const local = readdirSync(path.join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, "")).sort();
  const pendentes = new Set([...seq.ondas.flatMap((o) => o.migrations), ...seq.adiadas.map((a) => a.migration), HOTFIX]);
  const historicoBase = local.filter((s) => !pendentes.has(s) && s.slice(0, 14) <= seq.ultimaVersaoRemota);
  // passos na ordem de execucao: ondas do JSON; repair do hotfix depois de B; adiadas por ultimo (H2 depois do app; E por decisao)
  const passos = [];
  for (const o of seq.ondas) {
    passos.push({ id: o.id, tipo: "onda", migrations: o.migrations });
    if (o.id === HOTFIX_APOS_ONDA) passos.push({ id: "REPAIR-HOTFIX", tipo: "repair", migrations: [], versao: HOTFIX.slice(0, 14) });
  }
  for (const a of seq.adiadas) passos.push({ id: a.onda, tipo: "adiada", migrations: [a.migration] });
  return { seq, local, historicoBase, passos };
}

// Para cada passo: arquivos do diretorio, historico remoto esperado ANTES, pendentes (= o que a CLI aplicaria) e se exigiria --include-all.
export function composicoes() {
  const { passos, historicoBase } = plano();
  const hist = new Set(historicoBase);
  const out = [];
  for (const p of passos) {
    const antes = [...hist];
    const arquivos = [...new Set([...antes, ...p.migrations, ...(p.tipo === "repair" ? [HOTFIX] : [])])].sort();
    const pendentes = arquivos.filter((s) => !hist.has(s));
    const maxHist = antes.map((s) => s.slice(0, 14)).sort().pop();
    const foraDeOrdem = pendentes.filter((s) => s.slice(0, 14) < maxHist && s !== HOTFIX);
    out.push({ id: p.id, tipo: p.tipo, arquivos, historicoAntes: antes.length, pendentes, foraDeOrdem });
    for (const m of p.migrations) hist.add(m);
    if (p.tipo === "repair") hist.add(HOTFIX);
  }
  return out;
}

function main() {
  const a = process.argv.slice(2);
  if (a.includes("--listar")) {
    for (const c of composicoes()) console.log(`${c.id.padEnd(14)} ${c.tipo.padEnd(7)} historico ${String(c.historicoAntes).padStart(3)} + pendentes ${String(c.pendentes.length).padStart(2)} | fora de ordem (exige --include-all): ${c.foraDeOrdem.length}`);
    return;
  }
  const id = a[a.indexOf("--onda") + 1];
  const out = a[a.indexOf("--out") + 1];
  if (!id || !out || id.startsWith("--") || out.startsWith("--")) { console.error("uso: --listar | --onda <id> --out <dir fora do repositorio>"); process.exit(2); }
  const dest = path.resolve(out);
  if (dest === root || dest.startsWith(root + path.sep)) { console.error("RECUSADO: --out deve ficar fora do repositorio."); process.exit(2); }
  const c = composicoes().find((x) => x.id === id);
  if (!c) { console.error(`onda desconhecida: ${id}`); process.exit(2); }
  const mig = path.join(dest, "supabase", "migrations");
  if (existsSync(mig)) rmSync(mig, { recursive: true, force: true });
  mkdirSync(mig, { recursive: true });
  for (const s of c.arquivos) cpSync(path.join(root, "supabase", "migrations", `${s}.sql`), path.join(mig, `${s}.sql`));
  console.log(`${c.arquivos.length} arquivos em ${mig}; a CLI aplicaria ${c.pendentes.length}: ${c.pendentes.join(", ")}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
