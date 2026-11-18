// Promocao do conteudo JA ARMAZENADO do Construmanager para o pipeline
// documental existente do ACC (documents/document_versions ->
// processing_status AWAITING_PROCESSING -> Document Processing Worker).
//
// Modulo PURO: decide elegibilidade, tipo documental, ordem de versoes
// e deduplicacao. Nao toca banco nem rede — quem grava e o script
// scripts/construmanager-promote-documents.mjs.
//
// Regras (deliberadamente conservadoras):
// - So formatos que o processador existente sabe ler (PDF, XLS, XLSX,
//   TXT, DOCX, CSV, XML). DWG/RVT/IFC/NWD/BAK/ZIP/imagens ficam fora:
//   nao ha extrator, promover seria criar fila que nunca conclui.
// - Limite de 50 MB (mesmo da tabela document_versions). Acima disso
//   o arquivo ja e REFERENCIA_EXTERNA e nem chega aqui.
// - Tipo documental pelo formato e pela pasta de origem, nunca um tipo
//   contratual (CONTRATO_BASE, ADITIVO...) nem cronograma ou relatorio
//   semanal: documento de projeto nao vira fonte de risco por existir.
//   A extracao de texto nao cria evento, risco nem alerta.
// - Deduplicacao por SHA-256 contra QUALQUER versao documental do
//   projeto (mesma regra do upload multiplo: arquivo identico ja existe
//   => DUPLICADO) e dentro do proprio lote.
// - Versoes: um documento do ACC por documento do Construmanager; as
//   revisoes historicas entram em ordem cronologica e a vigente por
//   ultimo.

export type PromotionKind = "DESENHO" | "PLANILHA" | "OUTRO";

export const PROCESSABLE_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "xml",
]);

export const MAX_DOCUMENT_BYTES = 52_428_800;
export const MAX_PROMOTIONS_PER_RUN = 10;

export const CONSTRUMANAGER_LINK_MARKER = "[construmanager] link=";
export const CONSTRUMANAGER_DOCUMENT_MARKER = "cm_document=";

export interface StoredContentLink {
  linkId: string;
  /** id interno (construmanager_documents.id) do documento ao qual o vinculo pertence. */
  cmDocumentId: string;
  /** preenchido quando o vinculo aponta para uma revisao historica. */
  cmVersionId: string | null;
  sha256: string;
  sizeBytes: number;
  mimeType: string | null;
  detectedExtension: string | null;
  metadataExtension: string | null;
  name: string;
  folderPath: string | null;
  revision: string | null;
  statusLabel: string | null;
  authorName: string | null;
  sourceCreatedAt: string | null;
  sourceApprovedAt: string | null;
  firstSeenAt: string | null;
}

export interface ExistingPromotion {
  linkId: string;
  cmDocumentId: string | null;
  accDocumentId: string;
  versionIndex: number;
  versionLabel: string;
}

export type ExclusionReason =
  | "FORMATO_SEM_PROCESSADOR"
  | "ACIMA_DO_LIMITE"
  | "ARQUIVO_VAZIO"
  | "DUPLICADO_NO_PROJETO"
  | "DUPLICADO_NO_LOTE";

export type PromotionDecision =
  | { linkId: string; action: "JA_PROMOVIDO"; accDocumentId: string }
  | { linkId: string; action: "EXCLUIDO"; reason: ExclusionReason; detail: string }
  | {
      linkId: string;
      action: "PROMOVER";
      cmDocumentId: string;
      kind: PromotionKind;
      extension: string;
      mimeType: string;
      orderKey: string;
    };

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  xml: "application/xml",
};

export function effectiveExtension(link: Pick<StoredContentLink, "detectedExtension" | "metadataExtension" | "name">): string {
  const fromName = String(link.name ?? "").includes(".")
    ? String(link.name).split(".").pop()!.toLowerCase()
    : "";
  // O conteudo real (detectado no download) prevalece sobre o metadado.
  return (link.detectedExtension || link.metadataExtension || fromName || "").toLowerCase().replace(/^\./, "");
}

export function isProjectDesignFolder(folderPath: string | null): boolean {
  return /PROJETOS?\b/i.test(String(folderPath ?? ""));
}

export function kindFor(extension: string, folderPath: string | null): PromotionKind {
  if (["xls", "xlsx", "csv"].includes(extension)) return "PLANILHA";
  if (extension === "pdf" && isProjectDesignFolder(folderPath)) return "DESENHO";
  return "OUTRO";
}

export function mimeFor(extension: string, blobMime: string | null): string {
  const known = MIME_BY_EXTENSION[extension];
  if (blobMime && blobMime !== "application/octet-stream") return blobMime;
  return known ?? "application/octet-stream";
}

function chronoKey(link: StoredContentLink): string {
  const when = link.sourceCreatedAt ?? link.sourceApprovedAt ?? link.firstSeenAt ?? "";
  // Revisao historica antes da vigente; a vigente (cmVersionId null) por ultimo.
  return `${link.cmVersionId ? "0" : "1"}|${when}|${link.linkId}`;
}

export function planPromotions(params: {
  links: readonly StoredContentLink[];
  existingProjectHashes: ReadonlySet<string>;
  existingPromotions: readonly ExistingPromotion[];
}): PromotionDecision[] {
  const promotedByLink = new Map(params.existingPromotions.map((p) => [p.linkId, p]));
  const seenInBatch = new Set<string>();
  const decisions: PromotionDecision[] = [];

  const ordered = [...params.links].sort((a, b) => {
    if (a.cmDocumentId !== b.cmDocumentId) return a.cmDocumentId < b.cmDocumentId ? -1 : 1;
    return chronoKey(a) < chronoKey(b) ? -1 : 1;
  });

  for (const link of ordered) {
    const already = promotedByLink.get(link.linkId);
    if (already) {
      decisions.push({ linkId: link.linkId, action: "JA_PROMOVIDO", accDocumentId: already.accDocumentId });
      seenInBatch.add(link.sha256);
      continue;
    }

    const extension = effectiveExtension(link);

    if (!PROCESSABLE_EXTENSIONS.has(extension)) {
      decisions.push({
        linkId: link.linkId,
        action: "EXCLUIDO",
        reason: "FORMATO_SEM_PROCESSADOR",
        detail: `formato .${extension || "desconhecido"} sem extrator no pipeline documental`,
      });
      continue;
    }

    if (!(link.sizeBytes > 0)) {
      decisions.push({ linkId: link.linkId, action: "EXCLUIDO", reason: "ARQUIVO_VAZIO", detail: "arquivo sem bytes" });
      continue;
    }

    if (link.sizeBytes > MAX_DOCUMENT_BYTES) {
      decisions.push({
        linkId: link.linkId,
        action: "EXCLUIDO",
        reason: "ACIMA_DO_LIMITE",
        detail: `acima de ${MAX_DOCUMENT_BYTES} bytes`,
      });
      continue;
    }

    if (params.existingProjectHashes.has(link.sha256)) {
      decisions.push({
        linkId: link.linkId,
        action: "EXCLUIDO",
        reason: "DUPLICADO_NO_PROJETO",
        detail: "conteudo identico (SHA-256) ja existe em uma versao documental do projeto",
      });
      continue;
    }

    if (seenInBatch.has(link.sha256)) {
      decisions.push({
        linkId: link.linkId,
        action: "EXCLUIDO",
        reason: "DUPLICADO_NO_LOTE",
        detail: "conteudo identico (SHA-256) a outro arquivo do Construmanager ja selecionado",
      });
      continue;
    }

    seenInBatch.add(link.sha256);
    decisions.push({
      linkId: link.linkId,
      action: "PROMOVER",
      cmDocumentId: link.cmDocumentId,
      kind: kindFor(extension, link.folderPath),
      extension,
      mimeType: mimeFor(extension, link.mimeType),
      orderKey: chronoKey(link),
    });
  }

  return decisions;
}

/** Proximo indice/rotulo de versao dentro do documento do ACC, sem colidir com os existentes. */
export function nextVersionSlot(
  existing: readonly { versionIndex: number; versionLabel: string }[],
  revision: string | null
): { versionIndex: number; versionLabel: string } {
  const versionIndex = existing.reduce((max, v) => Math.max(max, v.versionIndex), 0) + 1;
  const labels = new Set(existing.map((v) => v.versionLabel.toLowerCase()));
  const rev = String(revision ?? "").trim().slice(0, 40);
  if (rev && !labels.has(rev.toLowerCase())) return { versionIndex, versionLabel: rev };
  let label = `v${versionIndex}`;
  while (labels.has(label.toLowerCase())) label = `${label}-cm`;
  return { versionIndex, versionLabel: label };
}

export function buildPromotionNotes(link: Pick<StoredContentLink, "linkId" | "cmDocumentId" | "sha256">): string {
  return (
    `${CONSTRUMANAGER_LINK_MARKER}${link.linkId}; ${CONSTRUMANAGER_DOCUMENT_MARKER}${link.cmDocumentId}; ` +
    `sha256=${link.sha256}. Importado do Construmanager (copia ja armazenada no ACC; original permanece no Construmanager).`
  );
}

export function parsePromotionNotes(notes: string | null): { linkId: string; cmDocumentId: string | null } | null {
  const text = String(notes ?? "");
  const link = text.match(/\[construmanager\] link=([0-9a-f-]{36})/i);
  if (!link) return null;
  const doc = text.match(/cm_document=([0-9a-f-]{36})/i);
  return { linkId: link[1].toLowerCase(), cmDocumentId: doc ? doc[1].toLowerCase() : null };
}

export function summarizeDecisions(decisions: readonly PromotionDecision[]) {
  const out = {
    promover: 0,
    jaPromovidos: 0,
    excluidos: {} as Record<ExclusionReason, number>,
  };
  for (const d of decisions) {
    if (d.action === "PROMOVER") out.promover += 1;
    else if (d.action === "JA_PROMOVIDO") out.jaPromovidos += 1;
    else out.excluidos[d.reason] = (out.excluidos[d.reason] ?? 0) + 1;
  }
  return out;
}
