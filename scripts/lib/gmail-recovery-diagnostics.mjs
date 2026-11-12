// Diagnóstico sanitizado de falhas da recuperação manual. Nunca inclui assunto, corpo, endereços, nomes de anexo,
// resposta bruta do provedor nem credenciais: apenas a etapa, o id técnico (uuid interno do e-mail) e um código fechado.
export class RecoveryStageError extends Error {
  constructor(code) { super(code); this.name = "RecoveryStageError"; this.recoveryCode = code; }
}

const OWN_MESSAGES = new Map([
  ["Mensagem fora da obra, caixa ou período congelado.", "FORA_DO_ESCOPO_CONGELADO"],
  ["Remetente diferente do piloto.", "REMETENTE_FORA_DO_PILOTO"],
  ["Corpo vazio no provedor.", "CORPO_VAZIO_NO_PROVEDOR"],
  ["Coleta da obra desabilitada.", "COLETA_DESABILITADA"],
  ["Caixa fora da lista habilitada.", "CAIXA_NAO_HABILITADA"],
  ["Aceite vigente do titular não confirmado.", "ACEITE_NAO_CONFIRMADO"],
]);

/** Código fechado e seguro. Só repassa valores de formato conhecido; o restante vira ERRO_NAO_CLASSIFICADO. */
export function safeFailureCode(error) {
  if (error instanceof RecoveryStageError) return error.recoveryCode;
  const own = OWN_MESSAGES.get(String(error?.message ?? ""));
  if (own) return own;
  if (error?.recoveryDb === true && /^DB_[A-Za-z0-9_.-]{1,16}$/.test(String(error.code))) return error.code;
  const status = Number(error?.response?.status ?? error?.status);
  if (Number.isInteger(status) && status >= 100 && status < 600) return `HTTP_${status}`;
  const code = typeof error?.code === "string" ? error.code : typeof error?.code === "number" ? String(error.code) : "";
  if (/^[A-Za-z0-9_.-]{1,40}$/.test(code)) return `CODIGO_${code}`.toUpperCase();
  const name = String(error?.name ?? "");
  return /^[A-Za-z0-9_]{1,40}$/.test(name) ? `ERRO_${name}`.toUpperCase() : "ERRO_NAO_CLASSIFICADO";
}

export function failureRecord(stage, emailId, error) {
  return { etapa: stage, email_id: String(emailId), codigo: safeFailureCode(error) };
}

/**
 * HTTP 404 exclusivamente na leitura da mensagem (etapa gmail_get) significa "mensagem indisponível no provedor".
 * Não indica a causa (exclusão, movimentação ou identificador inválido não são distinguíveis aqui).
 * Qualquer outra etapa ou status (401, 403, 5xx, banco, autorização) continua sendo falha.
 */
export function isProviderMessageUnavailable(stage, error) {
  if (stage !== "gmail_get" || error instanceof RecoveryStageError || error?.recoveryDb === true) return false;
  const status = Number(error?.response?.status ?? error?.status ?? error?.code);
  return status === 404;
}

/**
 * Classifica o texto de erro devolvido pelo ingest de anexos em um código FECHADO.
 * O texto bruto (pode conter nomes de arquivo, caminhos ou respostas do provedor) nunca é repassado.
 */
export function classifyIngestError(raw) {
  const text = String(raw ?? "");
  const lower = text.toLowerCase();
  if (lower.includes("falha ao verificar anexo existente por sha-256")) return "BUSCA_POR_HASH";
  if (lower.includes("falha ao verificar anexo existente")) return "BUSCA_POR_ID";
  if (lower.includes("falha ao registrar auditoria")) return "GRAVAR_AUDITORIA";
  if (lower.includes("falha ao salvar anexo no supabase storage")) {
    if (/mime|content.?type/.test(lower)) return "STORAGE_MIME_NAO_PERMITIDO";
    if (/exceed|too large|maximum allowed size|payload too large|size/.test(lower)) return "STORAGE_TAMANHO";
    if (/invalid key|invalid.*(name|path)|name.*too long/.test(lower)) return "STORAGE_NOME_INVALIDO";
    if (/row.level security|unauthori[sz]ed|forbidden|permission/.test(lower)) return "STORAGE_PERMISSAO";
    return "STORAGE_OUTRO";
  }
  if (lower.includes("falha ao gravar metadata do anexo")) {
    if (lower.includes("file_size_bytes_check")) return "BANCO_CHECK_TAMANHO";
    if (lower.includes("sha256_hash_check")) return "BANCO_CHECK_HASH";
    if (lower.includes("violates check constraint")) return "BANCO_CHECK_OUTRO";
    if (lower.includes("storage_bucket_storage_path_key")) return "BANCO_UNICO_CAMINHO";
    if (lower.includes("email_id_gmail_attachment_id_key")) return "BANCO_UNICO_ID_ANEXO";
    if (lower.includes("duplicate key")) return "BANCO_UNICO_OUTRO";
    if (lower.includes("foreign key")) return "BANCO_CHAVE_ESTRANGEIRA";
    return "BANCO_INSERT_OUTRO";
  }
  const http = text.match(/status code (\d{3})/i) ?? text.match(/\b(4\d\d|5\d\d)\b/);
  if (http) return `DOWNLOAD_HTTP_${http[1]}`;
  if (/not found|requested entity/.test(lower)) return "DOWNLOAD_HTTP_404";
  if (/rate limit|quota|too many/.test(lower)) return "DOWNLOAD_COTA";
  if (/econn|etimedout|socket|network|fetch failed|timeout/.test(lower)) return "DOWNLOAD_REDE";
  return "INGEST_NAO_CLASSIFICADO";
}

const MIME_SHAPE = /^[a-z0-9][a-z0-9.+-]{0,60}\/[a-z0-9][a-z0-9.+-]{0,100}$/i;
/** Tipo MIME é metadado de formato (não conteúdo); só repassa se tiver formato válido. */
export const safeMime = (mime) => (MIME_SHAPE.test(String(mime ?? "")) ? String(mime).toLowerCase() : "formato_invalido");

/**
 * Casa as partes de uma mensagem com as linhas já gravadas SEM baixar bytes e sem cruzar e-mails
 * (as linhas recebidas devem ser apenas as do mesmo e-mail/projeto).
 *  1) mesmo gmail_attachment_id;
 *  2) mesmo (nome, tipo, tamanho declarado>0), um-para-um, quando não ambíguo;
 * Ambíguo (mais partes do que linhas ou vice-versa com a mesma assinatura) => indeterminado.
 */
export function matchExistingAttachments(parts, rows) {
  const usedRows = new Set();
  const byId = [], byMeta = [], rest = [];
  const idIndex = new Map(rows.map((row) => [row.gmail_attachment_id, row]));
  for (const part of parts) {
    const row = idIndex.get(part.gmailAttachmentId);
    if (row && !usedRows.has(row)) { usedRows.add(row); byId.push(part); } else rest.push(part);
  }
  const signature = (name, mime, size) => `${name}\u0000${mime}\u0000${size}`;
  const groups = new Map();
  for (const part of rest) {
    const key = signature(part.originalFileName, part.mimeType, Number(part.declaredSizeBytes) || 0);
    if (!groups.has(key)) groups.set(key, { parts: [], rows: [] });
    groups.get(key).parts.push(part);
  }
  for (const row of rows) {
    if (usedRows.has(row)) continue;
    const key = signature(row.original_file_name, row.mime_type, Number(row.file_size_bytes) || 0);
    groups.get(key)?.rows.push(row);
  }
  const pending = [], indeterminate = [];
  for (const [key, group] of groups) {
    const sized = Number(key.split("\u0000")[2]) > 0;
    if (group.rows.length === 0) pending.push(...group.parts);
    else if (sized && group.parts.length === group.rows.length) byMeta.push(...group.parts);
    else indeterminate.push(...group.parts);
  }
  return { byId, byMeta, pending, indeterminate };
}

/** Verificações sem baixar bytes, espelhando as restrições do bucket e da tabela. */
export function precheckAttachment(part, bucket) {
  const size = Number(part.declaredSizeBytes) || 0;
  const limit = Number(bucket?.fileSizeLimit) || 52428800;
  if (Array.isArray(bucket?.allowedMimeTypes) && bucket.allowedMimeTypes.length && !bucket.allowedMimeTypes.includes(String(part.mimeType).toLowerCase())) return "MIME_NAO_PERMITIDO";
  if (size === 0) return "TAMANHO_DECLARADO_ZERO";
  if (size > limit) return "TAMANHO_EXCEDIDO";
  return null;
}
