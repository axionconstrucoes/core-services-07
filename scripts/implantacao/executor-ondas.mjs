#!/usr/bin/env node
// EXECUTOR DE ONDAS de migrations (Fase 2, frente A). Opção (b): cada arquivo de supabase/migrations + o insert no histórico,
// numa ÚNICA chamada à API de gerenciamento do Supabase (POST /v1/projects/{ref}/database/query = transação implícita),
// com lock_timeout 5s e statement_timeout 120s; P0 e linha no histórico conferidos depois de CADA arquivo; hash do histórico
// depois de CADA onda; para na primeira falha. Lógica em ./executor-ondas-lib.mjs; documentação em docs/implantacao/17-executor-de-ondas.md.
//
// Uso:
//   node scripts/implantacao/executor-ondas.mjs --dry-run --todas                      (offline: plano + sha256; sem token)
//   node scripts/implantacao/executor-ondas.mjs --alvo homolog --verificar --segredo <arquivo.dpapi>         (só leitura)
//   node scripts/implantacao/executor-ondas.mjs --alvo homolog --ensaio-homolog --segredo <arquivo.dpapi>    (descartável)
//   node scripts/implantacao/executor-ondas.mjs --alvo homolog --ondas A,B --segredo <arquivo.dpapi> [--log <fora do repo>]
//   node scripts/implantacao/executor-ondas.mjs --alvo local --ondas A      (PostgreSQL local 127.0.0.1:55434; HOMOLOG_DATABASE_URL + marcador)
//   node scripts/implantacao/executor-ondas.mjs --alvo pg --ondas A         (conexão direta isolada; mesmas guardas do kit scripts/homolog)
//   Operacional: SÓ com --alvo operacional --producao e a frase de confirmação digitada no terminal (nunca automatizar).
// O token (PAT do Supabase) é lido de um arquivo DPAPI FORA do repositório (salvar-segredo.ps1 -Nome SUPABASE_PAT); nunca impresso.
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
  ALVOS,
  ExecutorErro,
  avaliarGuardasPg,
  confirmarProducao,
  exigirAmbienteLimpo,
  exigirMarcador,
  criarTransporteHttp,
  criarTransporteLocalPg,
  executarEnsaioAtomicidade,
  executarPlano,
  frasePrConfirmacao,
  lerP0Sql,
  montarCorpoConferencia,
  montarPlano,
  redigir,
  resolverAlvo,
} from "./executor-ondas-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.resolve(here, "..");
const root = path.resolve(scriptsDir, "..");
const MIGRATIONS_DIR = path.join(root, "supabase", "migrations"); // fixo: lê os arquivos do repositório, nunca cópias

export function parseArgs(argv) {
  const a = { ondas: [], flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new ExecutorErro("ARGUMENTO", `${k} exige valor`);
      return v;
    };
    if (k === "--alvo") a.alvo = val();
    else if (k === "--ondas") a.ondas = val().split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--adiada") a.adiada = val();
    else if (k === "--segredo") a.segredo = val();
    else if (k === "--log") a.log = val();
    else if (["--todas", "--dry-run", "--verificar", "--ensaio-homolog", "--producao", "--retomar"].includes(k)) a.flags.add(k.slice(2));
    else throw new ExecutorErro("ARGUMENTO", `argumento desconhecido: ${k}`);
  }
  if (a.flags.has("todas") && a.ondas.length) throw new ExecutorErro("ARGUMENTO", "use --todas OU --ondas, não os dois");
  const modos = ["dry-run", "verificar", "ensaio-homolog"].filter((m) => a.flags.has(m));
  if (modos.length > 1) throw new ExecutorErro("ARGUMENTO", `modos excludentes: ${modos.join(", ")}`);
  return a;
}

const dentroDoRepo = (p) => {
  const rel = path.relative(root, path.resolve(p));
  return !rel.startsWith("..") && !path.isAbsolute(rel);
};

// Lê o segredo DPAPI (ConvertFrom-SecureString do usuário atual) por PowerShell; o caminho vai por variável de ambiente
// (sem interpolar na linha de comando) e o valor volta só pela saída padrão capturada - nunca é impresso nem gravado.
export function lerSegredoDpapi(arquivo) {
  if (!arquivo) throw new ExecutorErro("SEGREDO", "informe --segredo <arquivo.dpapi>");
  if (dentroDoRepo(arquivo)) throw new ExecutorErro("SEGREDO", "o arquivo de segredo não pode ficar dentro do repositório");
  if (!existsSync(arquivo)) throw new ExecutorErro("SEGREDO", "arquivo de segredo não encontrado");
  if (process.platform !== "win32") throw new ExecutorErro("SEGREDO", "DPAPI só existe no Windows");
  const ps = "$ErrorActionPreference='Stop'; $s = (Get-Content -LiteralPath $env:ACC_EXEC_DPAPI_FILE -Raw).Trim() | ConvertTo-SecureString; " +
    "$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }";
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    env: { ...process.env, ACC_EXEC_DPAPI_FILE: path.resolve(arquivo) },
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) throw new ExecutorErro("SEGREDO", "não foi possível decifrar o segredo DPAPI (usuário/máquina diferentes?)");
  const v = (r.stdout ?? "").trim();
  if (v.length < 20) throw new ExecutorErro("SEGREDO", "segredo vazio ou curto demais");
  return v;
}

function criarLog(arquivo, segredos) {
  if (arquivo && dentroDoRepo(arquivo)) throw new ExecutorErro("LOG", "o log deve ficar FORA do repositório");
  return (linha) => {
    const t = `${new Date().toISOString()} ${redigir(linha, segredos)}`;
    console.log(t);
    if (arquivo) appendFileSync(arquivo, `${t}\n`, "utf8");
  };
}

async function perguntar(frase) {
  if (!process.stdin.isTTY) throw new ExecutorErro("PRODUCAO_SEM_CONFIRMACAO", "confirmação exige terminal interativo");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((res) => rl.question(`Para aplicar no OPERACIONAL digite exatamente:\n  ${frase}\n> `, res));
  } finally {
    rl.close();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  const seq = JSON.parse(readFileSync(path.join(scriptsDir, "data", "implantacao-sequencia.json"), "utf8"));
  const ondas = a.flags.has("todas") ? seq.ondas.map((o) => o.id) : a.ondas;
  const precisaPlano = !a.flags.has("verificar") && !a.flags.has("ensaio-homolog");
  const plano = precisaPlano ? montarPlano({ seq, dir: MIGRATIONS_DIR, ondas, adiada: a.adiada ?? null }) : null;

  if (a.flags.has("dry-run")) {
    console.log(`DRY-RUN (offline, nada é enviado). Diretório: supabase/migrations. Itens: ${plano.passos.length}`);
    for (const o of plano.ondas) {
      console.log(`== onda ${o.id} (${o.itens.length}): ${o.nome}`);
      for (const p of o.itens) {
        console.log(p.tipo === "arquivo"
          ? `  ${p.stem}  sha256=${p.sha256}  arquivo=${p.bytesArquivo}B corpo=${p.bytesCorpo}B`
          : `  ${p.stem}  (SÓ REGISTRO no histórico, com portão P0 na mesma transação; NÃO reaplica)`);
      }
    }
    if (plano.anteriores.length) console.log(`Pré-requisito: ${plano.anteriores.length} migration(s) anteriores registradas no histórico (conferido no pré-voo).`);
    return 0;
  }

  if (!a.alvo) throw new ExecutorErro("ARGUMENTO", "informe --alvo homolog|operacional|local (ou --dry-run)");
  const segredos = [];
  let transporte;
  let fechar = async () => {};
  let alvo;
  if (a.alvo === "local" || a.alvo === "pg") {
    if (a.flags.has("producao")) throw new ExecutorErro("FLAG_PRODUCAO_INDEVIDA", "--producao não se aplica a conexão direta (local/pg)");
    const linkFile = path.join(root, "supabase", ".temp", "project-ref");
    const g = avaliarGuardasPg({ env: process.env, linkedRefText: existsSync(linkFile) ? readFileSync(linkFile, "utf8") : "", exigirLocal: a.alvo === "local" });
    const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? root, "x.js"))("pg");
    const client = new pg.Client({ connectionString: g.url, ssl: g.info.kind === "remote" ? { rejectUnauthorized: false } : undefined });
    await client.connect();
    fechar = () => client.end();
    try {
      await exigirMarcador(client);
    } catch (e) {
      await fechar();
      throw e;
    }
    const senha = decodeURIComponent(new URL(g.url).password);
    if (senha) segredos.push(senha);
    transporte = criarTransporteLocalPg(client, `conexão direta ${g.descricao}`);
    alvo = { ref: g.info.ref ?? "local", nome: g.descricao, producao: false, direto: true };
  } else {
    exigirAmbienteLimpo(process.env);
    const ref = ALVOS[a.alvo]?.ref ?? a.alvo;
    alvo = resolverAlvo({ ref, producao: a.flags.has("producao") });
    if (a.flags.has("ensaio-homolog") && alvo.producao) throw new ExecutorErro("ALVO_NAO_PERMITIDO", "ensaio de atomicidade só na homologação");
    const token = lerSegredoDpapi(a.segredo);
    segredos.push(token);
    transporte = criarTransporteHttp({ ref: alvo.ref, token });
  }
  let log;
  let p0Sql;
  try {
    log = criarLog(a.log, segredos);
    p0Sql = lerP0Sql(scriptsDir);
    log(`alvo: ${alvo.nome} (${alvo.ref}) via ${transporte.descricao}`);
    if (a.flags.has("verificar")) {
      const r = (await transporte.executar(montarCorpoConferencia(p0Sql, null))).linhas[0];
      log(`VERIFICAR (só leitura): P0 ok=${r.p0_ok} corpo=${r.p0_md5}; histórico ${r.n} linhas, última ${r.ultima}, hash ${r.hash}`);
      return r.p0_ok === true || r.p0_ok === "t" ? 0 : 1;
    }
    if (a.flags.has("ensaio-homolog")) {
      if (alvo.ref !== ALVOS.homolog.ref && !alvo.direto) throw new ExecutorErro("ALVO_NAO_PERMITIDO", "ensaio só na homologação ou local");
      const r = await executarEnsaioAtomicidade({ transporte, p0Sql, log, segredos });
      log(r.ok ? "ENSAIO OK" : "ENSAIO COM FALHA");
      return r.ok ? 0 : 1;
    }
    await confirmarProducao(alvo, plano, perguntar);
    log(`plano: ondas ${plano.ondas.map((o) => o.id).join(",")} (${plano.passos.length} itens)${alvo.producao ? ` | confirmado: ${frasePrConfirmacao(alvo, plano)}` : ""}`);
    const r = await executarPlano({ plano, transporte, p0Sql, log, retomar: a.flags.has("retomar"), segredos });
    log(r.ok ? `CONCLUÍDO: ${r.aplicados.length} aplicado(s), ${r.pulados.length} pulado(s)` : `PAROU: ${r.falha.codigo} ${r.falha.stem ?? ""} ${r.falha.mensagem}`);
    return r.ok ? 0 : 1;
  } finally {
    await fechar();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`ERRO ${e?.codigo ?? ""}: ${redigir(e?.message ?? String(e))}`);
      process.exit(2);
    },
  );
}
