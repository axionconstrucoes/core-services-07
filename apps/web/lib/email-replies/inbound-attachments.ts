// Anexos de respostas por e-mail usados como EVIDÊNCIA — PURO, sem I/O (o download e o Storage ficam no worker).
//
// - Descoberta: partes do Gmail (format=full) com filename e attachmentId (ou dados inline); assinaturas/ícones
//   inline (Content-ID sem filename) são ignorados.
// - Limites: no máximo 5 anexos por mensagem e 25 MB cada (risco); foto de ação SSMA: JPEG/PNG até 15 MB — a MESMA
//   validação do app (tipo pelo conteúdo, não pelo nome; sha256 do arquivo).
// - Referência no evento: "anexo:<sha256>:<nome>" (rastreável até o arquivo guardado; o nome é saneado).

import { createHash } from "node:crypto";

export const MAX_EVIDENCE_ATTACHMENTS = 5;
export const MAX_EVIDENCE_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_SSMA_PHOTO_BYTES = 15 * 1024 * 1024; // = 15728640, igual a ssma_field_record_photos

export interface GmailAttachmentPart {
  filename?: string | null;
  mimeType?: string | null;
  body?: { attachmentId?: string | null; data?: string | null; size?: number | null } | null;
  parts?: GmailAttachmentPart[] | null;
  headers?: Array<{ name?: string | null; value?: string | null }> | null;
}

export interface InboundAttachmentRef {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  attachmentId: string | null;
  inlineData: string | null;
}

export interface StoredEvidenceAttachment {
  sha256: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
}

export function sanitizeAttachmentName(name: string): string {
  const base = name.normalize("NFC").replace(/[\\/]+/g, "_").replace(/[\u0000-\u001f\u007f:"<>|?*]+/g, "").replace(/\s+/g, " ").trim();
  return (base || "anexo").slice(0, 120);
}

export function listGmailAttachments(payload: GmailAttachmentPart | null | undefined): InboundAttachmentRef[] {
  const found: InboundAttachmentRef[] = [];
  const walk = (part: GmailAttachmentPart | null | undefined) => {
    if (!part) return;
    const filename = (part.filename ?? "").trim();
    if (filename && (part.body?.attachmentId || part.body?.data)) {
      found.push({
        fileName: sanitizeAttachmentName(filename),
        mimeType: (part.mimeType ?? "application/octet-stream").toLowerCase(),
        sizeBytes: Number(part.body?.size ?? 0),
        attachmentId: part.body?.attachmentId ?? null,
        inlineData: part.body?.attachmentId ? null : (part.body?.data ?? null),
      });
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  return found;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function decodeGmailData(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Tipo REAL da imagem pelo conteúdo (assinatura do arquivo). */
export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  return null;
}

export type SsmaPhotoValidation = { ok: true; mimeType: "image/jpeg" | "image/png"; sha256: string; sizeBytes: number } | { ok: false; reason: "PHOTO_TYPE_INVALID" | "PHOTO_TOO_LARGE" | "PHOTO_EMPTY" };

/** Mesma validação do upload do app (JPEG/PNG, 1 byte..15 MB, sha256). */
export function validateSsmaEvidencePhoto(bytes: Uint8Array): SsmaPhotoValidation {
  if (bytes.length === 0) return { ok: false, reason: "PHOTO_EMPTY" };
  if (bytes.length > MAX_SSMA_PHOTO_BYTES) return { ok: false, reason: "PHOTO_TOO_LARGE" };
  const mimeType = sniffImageType(bytes);
  if (!mimeType) return { ok: false, reason: "PHOTO_TYPE_INVALID" };
  return { ok: true, mimeType, sha256: sha256Hex(bytes), sizeBytes: bytes.length };
}

export function evidenceReference(attachment: Pick<StoredEvidenceAttachment, "sha256" | "fileName">): string {
  return `anexo:${attachment.sha256}:${sanitizeAttachmentName(attachment.fileName).replace(/:/g, "_")}`;
}

/** Texto do campo evidence do evento: uma referência por anexo + o texto do remetente. */
export function buildEvidenceText(attachments: readonly Pick<StoredEvidenceAttachment, "sha256" | "fileName">[], note: string | null): string | null {
  const lines = [...attachments.map(evidenceReference), ...(note && note.trim() ? [note.trim()] : [])];
  return lines.length > 0 ? lines.join("\n").slice(0, 4000) : null;
}

/** Caminho no Storage (bucket project-documents) da evidência de alerta de risco recebida por e-mail. */
export function riskEvidenceStoragePath(projectId: string, caseId: string, sha256: string, fileName: string): string {
  return `${projectId}/alertas-evidencias-email/${caseId}/${sha256}-${sanitizeAttachmentName(fileName).replace(/[^A-Za-z0-9._-]+/g, "_")}`;
}

/** Caminho no Storage da foto de evidência SSMA — o MESMO prefixo exigido por ssma_field_record_register_photo. */
export function ssmaPhotoStoragePath(projectId: string, recordId: string, photoId: string, fileName: string, mimeType: "image/jpeg" | "image/png"): string {
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const stem = sanitizeAttachmentName(fileName).replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "evidencia";
  return `${projectId}/ssma-registros/${recordId}/${photoId}-${stem}.${ext}`;
}

/** Caminho no Storage da evidência anexada a respostas por e-mail de ação SLA / resumo semanal / alerta de contrato. */
export function tokenReplyEvidenceStoragePath(projectId: string, kind: string, subjectId: string, sha256: string, fileName: string): string {
  const safeKind = kind.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const safeSubject = subjectId.replace(/[^A-Za-z0-9_-]+/g, "-");
  return `${projectId}/respostas-email-evidencias/${safeKind}/${safeSubject}/${sha256}-${sanitizeAttachmentName(fileName).replace(/[^A-Za-z0-9._-]+/g, "_")}`;
}
