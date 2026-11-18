// Promove conteudo JA ARMAZENADO do Construmanager para o pipeline
// documental existente (documents/document_versions). Nao baixa nada,
// nao re-envia bytes: a versao documental aponta para o MESMO objeto
// content-addressed do bucket construmanager-content.
//
// A extracao de texto e feita depois pelo Document Processing Worker
// (processing_status = AWAITING_PROCESSING). Nada aqui cria evento,
// risco, alerta ou e-mail.
//
// Uso:
//   node scripts/construmanager-promote-documents.mjs [projectId] [--apply] [--limit=N]
// Sem --apply = DRY-RUN (somente leitura). --limit maximo 10.
//
// Repositorio PUBLICO: o log so traz contagens e referencias opacas.

import { register } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { opaqueRef } from "./lib/construmanager-log-safety.mjs";

register("./ts-module-resolver.mjs", import.meta.url);

const {
  planPromotions,
  nextVersionSlot,
  buildPromotionNotes,
  parsePromotionNotes,
  summarizeDecisions,
  MAX_PROMOTIONS_PER_RUN,
} = await import("../apps/web/lib/integrations/construmanager/promote-to-documents.ts");

const args = process.argv.slice(2);
const PROJECT_ID = args.find((a) => !a.startsWith("--")) || "00000000-0000-4000-8000-000000000001";
const APPLY = args.includes("--apply");
const limitArg = Number((args.find((a) => a.startsWith("--limit=")) ?? "--limit=10").split("=")[1]);
const LIMIT = Math.max(1, Math.min(MAX_PROMOTIONS_PER_RUN, Number.isFinite(limitArg) ? limitArg : 10));

function log(message) {
  console.log(`[construmanager-promote] ${message}`);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variavel de ambiente ausente: ${name}`);
  return value;
}

const supabase = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

function dateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function loadStoredLinks() {
  const rows = await must(
    supabase
      .from("construmanager_content_links")
      .select(
        "id, document_id, version_id, source_name, construmanager_content_blobs (sha256, size_bytes, mime_type, detected_extension, storage_bucket, storage_path), " +
          "construmanager_documents (id, name, extension_normalized, folder_path, revision, status_label, author_name, source_created_at, source_approved_at, first_seen_at), " +
          "construmanager_document_versions (id, document_id, name, extension_normalized, folder_path, revision, status_label, author_name, source_created_at, source_approved_at, first_seen_at)"
      )
      .eq("project_id", PROJECT_ID)
      .eq("download_status", "ARMAZENADO")
      .limit(5000),
    "carregar vinculos armazenados"
  );

  return (rows ?? []).map((r) => {
    const meta = r.construmanager_document_versions ?? r.construmanager_documents ?? {};
    const blob = r.construmanager_content_blobs ?? {};
    return {
      linkId: r.id,
      cmDocumentId: r.document_id ?? r.construmanager_document_versions?.document_id,
      cmVersionId: r.version_id ?? null,
      sha256: blob.sha256,
      sizeBytes: Number(blob.size_bytes ?? 0),
      mimeType: blob.mime_type ?? null,
      detectedExtension: blob.detected_extension ?? null,
      metadataExtension: meta.extension_normalized ?? null,
      name: meta.name ?? r.source_name ?? "",
      folderPath: meta.folder_path ?? null,
      revision: meta.revision ?? null,
      statusLabel: meta.status_label ?? null,
      authorName: meta.author_name ?? null,
      sourceCreatedAt: meta.source_created_at ?? null,
      sourceApprovedAt: meta.source_approved_at ?? null,
      firstSeenAt: meta.first_seen_at ?? null,
      storageBucket: blob.storage_bucket,
      storagePath: blob.storage_path,
    };
  });
}

async function loadProjectState() {
  const versions = await must(
    supabase
      .from("document_versions")
      .select("id, document_id, version_index, version_label, sha256_hash, source_type, notes")
      .eq("project_id", PROJECT_ID)
      .limit(20000),
    "carregar versoes documentais do projeto"
  );

  const hashes = new Set();
  const promotions = [];
  const versionsByDocument = new Map();

  for (const v of versions ?? []) {
    if (v.sha256_hash) hashes.add(v.sha256_hash);
    const list = versionsByDocument.get(v.document_id) ?? [];
    list.push({ versionIndex: v.version_index, versionLabel: v.version_label });
    versionsByDocument.set(v.document_id, list);
    if (v.source_type === "CONSTRUMANAGER") {
      const parsed = parsePromotionNotes(v.notes);
      if (parsed) {
        promotions.push({
          linkId: parsed.linkId,
          cmDocumentId: parsed.cmDocumentId,
          accDocumentId: v.document_id,
          versionIndex: v.version_index,
          versionLabel: v.version_label,
        });
      }
    }
  }

  return { hashes, promotions, versionsByDocument };
}

async function audit(action, entityType, entityId, detail) {
  const { error } = await supabase.from("audit_log_entries").insert({
    project_id: PROJECT_ID,
    actor_type: "SYSTEM",
    actor_user_id: null,
    actor_label: null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail,
  });
  if (error) throw new Error(`auditoria: ${error.message}`);
}

async function promote(decision, link, state) {
  // Documento do ACC deste documento do Construmanager: reaproveita o ja criado.
  let accDocumentId =
    state.promotions.find((p) => p.cmDocumentId === link.cmDocumentId)?.accDocumentId ?? null;
  let createdDocument = false;

  if (!accDocumentId) {
    const doc = await must(
      supabase
        .from("documents")
        .insert({ project_id: PROJECT_ID, kind: decision.kind, title: String(link.name || "Documento Construmanager").slice(0, 300) })
        .select("id")
        .single(),
      "criar documento"
    );
    accDocumentId = doc.id;
    createdDocument = true;
  }

  try {
    const slot = nextVersionSlot(state.versionsByDocument.get(accDocumentId) ?? [], link.revision);
    const summaryParts = [
      "Importado do Construmanager",
      link.folderPath ? `pasta: ${link.folderPath}` : null,
      link.revision ? `revisao: ${link.revision}` : null,
      link.statusLabel ? `status: ${link.statusLabel}` : null,
      link.cmVersionId ? "revisao historica" : "versao vigente na sincronizacao",
    ].filter(Boolean);

    const version = await must(
      supabase
        .from("document_versions")
        .insert({
          document_id: accDocumentId,
          version_label: slot.versionLabel,
          version_index: slot.versionIndex,
          document_date: dateOnly(link.sourceApprovedAt) ?? dateOnly(link.sourceCreatedAt) ?? dateOnly(link.firstSeenAt) ?? new Date().toISOString().slice(0, 10),
          source_type: "CONSTRUMANAGER",
          author: String(link.authorName || "Construmanager").slice(0, 200),
          summary: summaryParts.join(" | ").slice(0, 2000),
          file_path: link.storagePath,
          storage_bucket: link.storageBucket,
          original_file_name: String(link.name || `arquivo.${decision.extension}`),
          mime_type: decision.mimeType,
          file_size_bytes: link.sizeBytes,
          sha256_hash: link.sha256,
          processing_status: "AWAITING_PROCESSING",
          requires_human_review: false,
          notes: buildPromotionNotes(link),
        })
        .select("id")
        .single(),
      "criar versao documental"
    );

    await audit(
      "CONSTRUMANAGER_DOCUMENT_PROMOTED",
      "DOCUMENT_VERSION",
      version.id,
      `Conteudo do Construmanager (vinculo ${link.linkId}, sha256 ${link.sha256.slice(0, 12)}) promovido ao pipeline documental ` +
        `(kind=${decision.kind}, versao ${slot.versionLabel}). Sem evento, risco ou alerta gerado.`
    );

    state.hashes.add(link.sha256);
    state.promotions.push({ linkId: link.linkId, cmDocumentId: link.cmDocumentId, accDocumentId, ...slot });
    const list = state.versionsByDocument.get(accDocumentId) ?? [];
    list.push(slot);
    state.versionsByDocument.set(accDocumentId, list);
    return { accDocumentId, versionId: version.id };
  } catch (error) {
    // Compensacao: documento criado AGORA por esta rodada e sem nenhuma versao.
    if (createdDocument) {
      await supabase.from("documents").delete().eq("id", accDocumentId).then(() => undefined, () => undefined);
    }
    throw error;
  }
}

try {
  log(`modo=${APPLY ? "APLICAR" : "DRY-RUN"} | limite=${LIMIT}`);
  const links = await loadStoredLinks();
  const state = await loadProjectState();
  const decisions = planPromotions({
    links,
    existingProjectHashes: state.hashes,
    existingPromotions: state.promotions,
  });
  const s = summarizeDecisions(decisions);

  log(`armazenados .................. ${links.length}`);
  log(`ja promovidos ................ ${s.jaPromovidos}`);
  log(`elegiveis aguardando ......... ${s.promover}`);
  for (const [reason, n] of Object.entries(s.excluidos)) log(`excluidos ${reason.padEnd(24, ".")} ${n}`);

  const toPromote = decisions.filter((d) => d.action === "PROMOVER").slice(0, LIMIT);
  const byLink = new Map(links.map((l) => [l.linkId, l]));

  if (!APPLY) {
    for (const d of toPromote) log(`  promoveria ${opaqueRef(d.linkId)} kind=${d.kind} .${d.extension}`);
    log("DRY-RUN concluido. Zero escritas.");
    process.exit(0);
  }

  let ok = 0;
  let failed = 0;
  for (const d of toPromote) {
    const link = byLink.get(d.linkId);
    try {
      await promote(d, link, state);
      ok += 1;
      log(`  PROMOVIDO ${opaqueRef(d.linkId)} kind=${d.kind} .${d.extension}`);
    } catch (error) {
      failed += 1;
      log(`  ERRO ${opaqueRef(d.linkId)} — promocao nao concluida (detalhe na auditoria)`);
      await audit(
        "CONSTRUMANAGER_DOCUMENT_PROMOTION_FAILED",
        "CONSTRUMANAGER_CONTENT_LINK",
        d.linkId,
        String(error instanceof Error ? error.message : error).slice(0, 500)
      ).catch(() => undefined);
    }
  }

  log(`rodada concluida | promovidos=${ok} erros=${failed} | restantes=${Math.max(0, s.promover - ok)}`);
  process.exit(failed > 0 ? 1 : 0);
} catch (error) {
  log(`FALHA: ${String(error instanceof Error ? error.message : error).replace(/[A-Za-z]:\\[^\s]+/g, "[caminho]").slice(0, 300)}`);
  process.exit(1);
}
