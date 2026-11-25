// Manifesto de EXPORTACAO AUTORIZADA do Construmanager (alternativa a API).
//
// Modulo PURO (sem rede, sem banco, sem Storage). Valida um manifesto CSV
// entregue por quem tem permissao corporativa no Construmanager junto com
// os arquivos exportados, e decide, linha a linha, se o item pode seguir
// para a ingestao controlada. Nada aqui grava dados: o resultado e um
// plano auditavel para revisao humana.
//
// Principios (CLAUDE.md): rastreabilidade ate a fonte (id de origem, autor,
// data e SHA-256 obrigatorios), original preservado (o hash e conferido
// contra o arquivo, nunca recalculado para "corrigir"), fato x inferencia
// (o tipo mapeado e sugestao; o tipo declarado na origem e mantido).

export const EXPORT_MANIFEST_COLUMNS = [
  "origem_id",
  "tipo_origem",
  "numero",
  "titulo",
  "revisao",
  "data_documento",
  "autor",
  "status_origem",
  "arquivo",
  "sha256",
  "tamanho_bytes",
] as const;

export type ExportManifestColumn = (typeof EXPORT_MANIFEST_COLUMNS)[number];

export const WINDOW_START = "2025-05-22";
export const WINDOW_END = "2026-11-22";

/** Tipos de origem aceitos e a sugestao de documents.kind do ACC. */
export const SOURCE_TYPE_TO_KIND: Readonly<Record<string, string>> = {
  CORRESPONDENCIA: "OUTRO",
  PROTOCOLO: "OUTRO",
  DOCUMENTO_TECNICO: "OUTRO",
  REVISAO: "OUTRO",
  APROVACAO: "CLARIFICACAO_CLIENTE",
  PENDENCIA: "OUTRO",
  NOTIFICACAO: "NOTIFICACAO",
  ATA: "ATA_REUNIAO",
  CONTRATO: "CONTRATO_BASE",
  ADITIVO: "ADITIVO",
  MEDICAO: "PLANILHA_CONTRATUAL",
  QUALIDADE: "OUTRO",
  SSMA: "ESG_SSMA",
};

/** Tipos que, quando anteriores a janela, ainda podem estabelecer obrigacoes vigentes. */
export const OBLIGATION_BEARING_TYPES: ReadonlySet<string> = new Set([
  "CONTRATO",
  "ADITIVO",
]);

export interface ManifestRowResult {
  line: number;
  ok: boolean;
  errors: string[];
  warnings: string[];
  normalized: null | {
    originId: string;
    sourceType: string;
    suggestedKind: string;
    number: string;
    revision: string;
    documentDate: string;
    author: string;
    fileName: string;
    sha256: string;
    sizeBytes: number;
    /** anterior a janela de 18 meses */
    preWindow: boolean;
    /** posterior ao fim da janela */
    postWindow: boolean;
    /** anterior a janela mas contrato/aditivo: exige registro de vigencia */
    requiresVigencyReview: boolean;
  };
}

export interface ManifestSummary {
  rows: number;
  accepted: number;
  rejected: number;
  duplicatesBySha: number;
  preWindow: number;
  requiringVigencyReview: number;
  byType: Record<string, number>;
  byMonth: Record<string, number>;
}

export interface ManifestValidation {
  headerErrors: string[];
  rows: ManifestRowResult[];
  summary: ManifestSummary;
}

/** Parser CSV minimo (RFC 4180: aspas duplas, virgula ou ponto e virgula). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = src.split("\n", 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

/** Aceita AAAA-MM-DD ou DD/MM/AAAA; devolve ISO ou null. Nao infere data ausente. */
export function normalizeManifestDate(raw: string): string | null {
  const value = raw.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (br) {
    d = Number(br[1]);
    m = Number(br[2]);
    y = Number(br[3]);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function validateExportManifest(text: string): ManifestValidation {
  const table = parseCsv(text);
  const emptySummary: ManifestSummary = {
    rows: 0,
    accepted: 0,
    rejected: 0,
    duplicatesBySha: 0,
    preWindow: 0,
    requiringVigencyReview: 0,
    byType: {},
    byMonth: {},
  };
  if (table.length === 0) {
    return {
      headerErrors: ["Manifesto vazio."],
      rows: [],
      summary: emptySummary,
    };
  }

  const header = table[0].map((h) => stripAccents(h.trim().toLowerCase()));
  const headerErrors: string[] = [];
  for (const col of EXPORT_MANIFEST_COLUMNS) {
    if (!header.includes(col)) headerErrors.push(`Coluna obrigatoria ausente: ${col}`);
  }
  if (headerErrors.length > 0) {
    return { headerErrors, rows: [], summary: emptySummary };
  }
  const idx = (col: ExportManifestColumn) => header.indexOf(col);

  const seenSha = new Map<string, number>();
  const seenOrigin = new Set<string>();
  const results: ManifestRowResult[] = [];
  const summary: ManifestSummary = { ...emptySummary, byType: {}, byMonth: {} };

  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r];
    const get = (col: ExportManifestColumn) => (cells[idx(col)] ?? "").trim();
    const errors: string[] = [];
    const warnings: string[] = [];
    const line = r + 1;

    const originId = get("origem_id");
    if (!originId) errors.push("origem_id ausente (rastreabilidade ate a fonte).");

    const sourceType = stripAccents(get("tipo_origem").toUpperCase()).replace(/\s+/g, "_");
    const suggestedKind = SOURCE_TYPE_TO_KIND[sourceType];
    if (!suggestedKind) errors.push(`tipo_origem desconhecido: ${get("tipo_origem") || "(vazio)"}.`);

    const author = get("autor");
    if (!author) errors.push("autor ausente (autoria deve ser preservada).");

    const documentDate = normalizeManifestDate(get("data_documento"));
    if (!documentDate) errors.push("data_documento ausente ou invalida (nao e inferida).");

    const fileName = get("arquivo");
    if (!fileName) errors.push("arquivo ausente.");
    if (/(^|[\\/])\.\.([\\/]|$)/.test(fileName) || /^[a-zA-Z]:|^[\\/]/.test(fileName)) {
      errors.push("arquivo deve ser caminho relativo sem '..'.");
    }

    const sha256 = get("sha256").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha256)) errors.push("sha256 invalido (64 hex).");

    const sizeRaw = get("tamanho_bytes");
    const sizeBytes = /^\d+$/.test(sizeRaw) ? Number(sizeRaw) : NaN;
    if (!Number.isSafeInteger(sizeBytes)) errors.push("tamanho_bytes invalido.");
    else if (sizeBytes === 0) errors.push("arquivo vazio (tamanho 0).");

    if (originId) {
      const key = `${originId}|${get("revisao")}`;
      if (seenOrigin.has(key)) errors.push("origem_id + revisao duplicados no manifesto.");
      seenOrigin.add(key);
    }
    if (/^[0-9a-f]{64}$/.test(sha256)) {
      if (seenSha.has(sha256)) {
        warnings.push(`conteudo identico a linha ${seenSha.get(sha256)} (mesmo SHA-256).`);
        summary.duplicatesBySha += 1;
      } else {
        seenSha.set(sha256, line);
      }
    }
    if (!get("revisao")) warnings.push("revisao ausente.");

    let normalized: ManifestRowResult["normalized"] = null;
    if (errors.length === 0 && documentDate && suggestedKind) {
      const preWindow = documentDate < WINDOW_START;
      const postWindow = documentDate > WINDOW_END;
      const requiresVigencyReview = preWindow && OBLIGATION_BEARING_TYPES.has(sourceType);
      if (preWindow && !requiresVigencyReview) {
        warnings.push("anterior a janela de 18 meses; incluir somente com justificativa.");
      }
      if (postWindow) warnings.push("posterior ao fim da janela.");
      if (requiresVigencyReview) {
        warnings.push("contrato/aditivo anterior a janela: registrar vigencia e vinculo de obrigacoes.");
      }
      normalized = {
        originId,
        sourceType,
        suggestedKind,
        number: get("numero"),
        revision: get("revisao"),
        documentDate,
        author,
        fileName,
        sha256,
        sizeBytes,
        preWindow,
        postWindow,
        requiresVigencyReview,
      };
      summary.byType[sourceType] = (summary.byType[sourceType] ?? 0) + 1;
      const month = documentDate.slice(0, 7);
      summary.byMonth[month] = (summary.byMonth[month] ?? 0) + 1;
      if (preWindow) summary.preWindow += 1;
      if (requiresVigencyReview) summary.requiringVigencyReview += 1;
    }

    results.push({ line, ok: errors.length === 0, errors, warnings, normalized });
  }

  summary.rows = results.length;
  summary.accepted = results.filter((x) => x.ok).length;
  summary.rejected = summary.rows - summary.accepted;
  return { headerErrors: [], rows: results, summary };
}
