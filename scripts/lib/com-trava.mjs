// Modo "COM TRAVA" dos testes SQL em PGlite (descartavel, sem rede): quando ACC_TEST_COM_TRAVA=1, aplica
// docs/implantacao/trava-modulos/1-aplicar-trava.sql logo depois do replay das migrations. Sem a variavel, nao faz nada.
// Objetivo: provar que as 35 RPCs travadas (Qualidade/Seguros/Garantias/Competencias) nao afetam o tratamento de alertas e
// respostas por e-mail, SSMA por e-mail e especialistas por e-mail.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const COM_TRAVA = process.env.ACC_TEST_COM_TRAVA === "1";

export async function aplicarTravaSeSolicitado(db) {
  if (!COM_TRAVA) return;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(path.join(here, "..", "..", "docs", "implantacao", "trava-modulos", "1-aplicar-trava.sql"), "utf8").replace(/^﻿/, "");
  await db.exec(sql);
  const prova = async (nome) => (await db.query(
    `select has_function_privilege('authenticated', p.oid, 'EXECUTE') as ex from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname=$1`, [nome])).rows.map((x) => x.ex);
  const travadas = ["quality_ncr_update_fields", "quality_warranty_case_update", "insurance_dossier_sync", "bank_guarantee_register", "project_competence_grant"];
  const liberadas = ["quality_ncr_create", "quality_warranty_create", "quality_evidence_register"];
  for (const n of travadas) { const r = await prova(n); if (r.length !== 1 || r[0] !== false) throw new Error(`trava nao aplicada: ${n} ainda executavel por authenticated (${JSON.stringify(r)})`); }
  for (const n of liberadas) { const r = await prova(n); if (r.length !== 1 || r[0] !== true) throw new Error(`liberada indevidamente travada: ${n} (${JSON.stringify(r)})`); }
  console.log(`[COM TRAVA] trava de modulos aplicada: ${travadas.length} RPCs de amostra travadas e ${liberadas.length} liberadas conferidas`);
}
