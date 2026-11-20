#!/usr/bin/env node
// Executor da lista de testes (scripts/test-scripts.list): um script de teste por linha (caminho relativo à raiz do repositório).
// Motivo: a cadeia "a && b && ..." no package.json passou de 8.191 caracteres e estourou o limite de linha de comando do Windows
// ("The command line is too long"). A semântica é a mesma da cadeia: executa na ordem e PARA na primeira falha.
// Linhas em branco e começando por "#" são ignoradas. Cada teste roda com --import ./scripts/lib/block-live-ai.mjs (nenhuma IA real).
// Uso: node scripts/run-test-list.mjs [lista] [--keep-going]
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const keepGoing = args.includes("--keep-going");
const listArg = args.find((a) => !a.startsWith("--"));
const listFile = path.resolve(root, listArg ?? "scripts/test-scripts.list");

const entries = readFileSync(listFile, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const seen = new Set();
for (const e of entries) {
  if (seen.has(e)) { console.error(`ERRO: entrada duplicada na lista: ${e}`); process.exit(2); }
  seen.add(e);
}

let ok = 0;
const failed = [];
for (const rel of entries) {
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./scripts/lib/block-live-ai.mjs", rel], { cwd: root, stdio: "inherit" });
  if (r.status === 0) { ok += 1; continue; }
  failed.push(rel);
  console.error(`\nFALHOU: ${rel} (saída ${r.status})`);
  if (!keepGoing) break;
}
console.log(`\n== run-test-list: ${ok}/${entries.length} scripts OK${failed.length ? `, falhas: ${failed.join(", ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
