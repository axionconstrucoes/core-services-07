// Espelha fotos SSMA já confirmadas no Supabase para a subpasta correta
// do Google Drive. Sem --apply apenas informa a fila. O processamento é
// idempotente e aceita PENDING/FAILED para permitir retomada segura.
//
// Isolamento por projeto: falha ou falta de configuração de um projeto nunca bloqueia nem mascara outro
// (ver scripts/lib/ssma-photo-sync-runner.mjs). Projetos sem pasta SSMA/ESG configurada têm as fotos
// preservadas (sem reprocessar nem gerar auditoria a cada ciclo) e aparecem como aviso por projeto.

import { createClient } from "@supabase/supabase-js";
import { appendFileSync } from "node:fs";
import { register } from "node:module";
import { runSsmaPhotoSync, summaryRows } from "./lib/ssma-photo-sync-runner.mjs";

register("./ts-module-resolver.mjs", import.meta.url);

const { syncSsmaPhotoToDrive } = await import("../apps/web/lib/drive/sync-ssma-photo-to-drive");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 50;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
  throw new Error("--limit deve ser um inteiro entre 1 e 500.");
}

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const criticalProjectIds = (process.env.SSMA_SYNC_CRITICAL_PROJECT_IDS ?? "")
  .split(",")
  .map((id) => id.trim().toLowerCase())
  .filter(Boolean);

const PHOTO_COLUMNS =
  "id,project_id,submission_id,original_file_name,mime_type,storage_bucket,storage_path,drive_sync_status,drive_file_id,ssma_form_submissions!inner(drive_folder_name,occurred_at,status)";

const deps = {
  async loadConfiguredProjectIds() {
    const { data, error } = await supabase
      .from("project_integrations")
      .select("project_id,folder_reference")
      .eq("source_type", "ESG_SSMA");
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((row) => row.folder_reference && String(row.folder_reference).trim())
      .map((row) => row.project_id);
  },
  async loadActionableRows(projectIds, max) {
    const { data, error } = await supabase
      .from("ssma_submission_photos")
      .select(PHOTO_COLUMNS)
      .in("project_id", projectIds)
      .in("drive_sync_status", ["PENDING", "FAILED"])
      .eq("ssma_form_submissions.status", "SUBMITTED")
      .order("uploaded_at", { ascending: true })
      .limit(max);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async loadBlockedRows(configuredProjectIds) {
    let query = supabase
      .from("ssma_submission_photos")
      .select("project_id,ssma_form_submissions!inner(status)")
      .in("drive_sync_status", ["PENDING", "FAILED"])
      .eq("ssma_form_submissions.status", "SUBMITTED")
      .limit(5000);
    if (configuredProjectIds.length) query = query.not("project_id", "in", `(${configuredProjectIds.join(",")})`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async syncRow(row) {
    const submission = Array.isArray(row.ssma_form_submissions) ? row.ssma_form_submissions[0] : row.ssma_form_submissions;
    if (!submission) return { status: "FAILED", error: "Submissão da foto não encontrada." };
    return syncSsmaPhotoToDrive(supabase, {
      id: row.id,
      projectId: row.project_id,
      submissionId: row.submission_id,
      driveFolderName: submission.drive_folder_name,
      occurredAt: submission.occurred_at,
      originalFileName: row.original_file_name,
      mimeType: row.mime_type,
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path,
      driveSyncStatus: row.drive_sync_status,
      driveFileId: row.drive_file_id,
    });
  },
};

const outcome = await runSsmaPhotoSync({ deps, limit, apply, criticalProjectIds });

console.table(summaryRows(outcome.summaries));
for (const line of outcome.annotations) console.log(line);

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "### SSMA Drive Photo Sync — resultado por projeto",
    "",
    "| Projeto | Piloto | Processadas | Sincronizadas | Falhas | Aguardando config |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of summaryRows(outcome.summaries)) {
    lines.push(`| ${r.projeto} | ${r.piloto} | ${r.processadas} | ${r.sincronizadas} | ${r.falhas} | ${r.aguardandoConfig} |`);
  }
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

if (outcome.exitCode !== 0) process.exitCode = outcome.exitCode;
