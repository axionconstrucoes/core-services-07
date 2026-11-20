#!/usr/bin/env node
// Aplica as correções MECÂNICAS de contraste em arquivos de MÓDULO (pós-integração). Padrão: DRY-RUN (só lista). `--write` grava.
// Correção coberta (segura, não depende do pai): `disabled:opacity-NN` com NN < 60 -> `disabled:opacity-60` nos literais cujo estado
// `disabled` o auditor reprovou (texto desabilitado deve continuar legível >= 3:1). Demais itens (anéis de foco, texto escuro em pai escuro)
// dependem do pai real e ficam no relatório contraste-violacoes-modulos.md para aplicação manual.
// NÃO executado na fase de auditoria (agentes de módulo editam esses arquivos em paralelo).
// Uso: node scripts/contrast-apply-module-fixes.mjs [--write]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditAll, FAILING } from "./contrast-audit.mjs";

const WRITE = process.argv.includes("--write");
const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "web");
const SHARED = /^(components\/(ui|shared|layout)\/|lib\/ui\/[^/]+\.tsx?$)/;
const { findings } = auditAll({ scope: "all" });
const targets = findings.filter((f) => FAILING.has(f.sev) && f.state === "disabled" && !SHARED.test(f.file) && /disabled:opacity-(?:[0-5]?\d)\b/.test(f.classes));
const byFile = new Map();
for (const f of targets) (byFile.get(f.file) ?? byFile.set(f.file, []).get(f.file)).push(f);
let changed = 0;
for (const [rel, list] of byFile) {
  const abs = path.join(WEB, rel);
  let src = readFileSync(abs, "utf8");
  for (const f of list) {
    // o literal original (com espaços normalizados) pode ter quebras de linha: substitui só o token dentro do literal localizado pelo prefixo estável
    const anchor = f.classes.slice(0, 60);
    const at = src.indexOf(anchor);
    if (at < 0) { console.log(`PULADO (literal não localizado): ${rel}:${f.line}`); continue; }
    const end = src.indexOf(f.classes.slice(-30), at) + 30;
    const seg = src.slice(at, end);
    const next = seg.replace(/disabled:opacity-(?:[0-5]?\d)\b/g, (m) => (parseInt(m.split("-").pop(), 10) < 60 ? "disabled:opacity-60" : m));
    if (next !== seg) { src = src.slice(0, at) + next + src.slice(end); changed++; console.log(`${WRITE ? "APLICADO" : "DRY-RUN"}: ${rel}:${f.line}  ${seg.match(/disabled:opacity-\d+/)?.[0]} -> disabled:opacity-60`); }
  }
  if (WRITE) writeFileSync(abs, src);
}
console.log(`\n${changed} literal(is) ${WRITE ? "alterado(s)" : "seriam alterados (rode com --write para gravar)"}.`);
