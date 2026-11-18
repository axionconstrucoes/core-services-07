// Data de REFERÊNCIA do relatório semanal — puro, sem I/O.
//
// Regra: a referência é a data do PRÓPRIO relatório quando identificável;
// a data de envio do e-mail é só fallback (com aviso). Um relatório antigo
// encaminhado depois nunca ganha corte mais recente: entre fontes de data
// coerentes vale a MAIS ANTIGA; conflito sem data própria => não mensurável.
//
// WNN é a SEMANA DA OBRA (contagem do projeto) e NUNCA é convertida em data
// civil/ISO: os rótulos servem só para detectar conflito (arquivo × assunto
// × conteúdo), não para inventar uma data.

export type ReportReferenceSource = "DOCUMENT_LAST_SAVED" | "EMAIL_SENT_FALLBACK" | "NONE";

export interface ReportReferenceInput {
  /** Data civil (Brasília) do envio do e-mail, AAAA-MM-DD. */
  emailSentDate: string | null;
  emailSubject?: string | null;
  /** Semana da obra no assunto do e-mail (WNN). */
  subjectWeekLabel?: string | null;
  fileName?: string | null;
  /** Última semana com realizado na Curva S do próprio arquivo (WNN). */
  contentWeekLabel?: string | null;
  /** Último salvamento do arquivo (docProps/core.xml), data civil Brasília. */
  documentModifiedDate?: string | null;
}

export interface ReportReference {
  referenceDate: string | null;
  source: ReportReferenceSource;
  /** Semana do PRÓPRIO relatório (arquivo/conteúdo); assunto só sem evidência interna. */
  reportWeekLabel: string | null;
  weekLabels: { file: string | null; content: string | null; subject: string | null };
  forwarded: boolean;
  /** Motivos que impedem a referência (=> indicador não mensurável). */
  blockers: string[];
  warnings: Array<{ code: string; detail: string }>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORWARD_RE = /^\s*(?:(?:fwd?|enc|encaminhad[ao]|tr)\s*:\s*)+/i;
/** Diferença (dias) entre último salvamento e envio a partir da qual o envio é tratado como tardio/encaminhamento. */
export const LATE_DELIVERY_DAYS = 14;

export function weekLabelOf(text: string | null | undefined): string | null {
  const match = text ? /(?:^|[^A-Za-z0-9])[([]?\s*W\s?(\d{1,3})\s*[)\]]?(?=$|[^0-9])/i.exec(text) : null;
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 260 ? `W${n}` : null;
}

function weekNumber(label: string | null): number | null {
  const match = label ? /^W(\d{1,3})$/i.exec(label) : null;
  return match ? Number(match[1]) : null;
}

function daysBetween(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86400000);
}

export function isForwardedSubject(subject: string | null | undefined): boolean {
  return Boolean(subject && FORWARD_RE.test(subject));
}

export function resolveReportReference(input: ReportReferenceInput): ReportReference {
  const warnings: ReportReference["warnings"] = [];
  const blockers: string[] = [];
  const email = input.emailSentDate && ISO_DATE.test(input.emailSentDate) ? input.emailSentDate : null;
  let saved = input.documentModifiedDate && ISO_DATE.test(input.documentModifiedDate) ? input.documentModifiedDate : null;
  const forwarded = isForwardedSubject(input.emailSubject);

  const file = weekLabelOf(input.fileName);
  const content = input.contentWeekLabel ? weekLabelOf(input.contentWeekLabel) : null;
  const subject = input.subjectWeekLabel ? weekLabelOf(input.subjectWeekLabel) : weekLabelOf(input.emailSubject);
  const inPackage = [file, content].filter((label): label is string => Boolean(label));
  const inPackageNumbers = inPackage.map((label) => weekNumber(label) as number);
  const reportWeekLabel = inPackage.length ? `W${Math.min(...inPackageNumbers)}` : subject;

  // Coerência entre rótulos do próprio pacote.
  if (inPackage.length === 2 && inPackageNumbers[0] !== inPackageNumbers[1]) {
    const spread = Math.abs(inPackageNumbers[0] - inPackageNumbers[1]);
    const detail = `Semana no nome do arquivo (${file}) difere da última semana com realizado na Curva S (${content}).`;
    if (spread > 1) blockers.push(`${detail} Rótulos internos incoerentes — referência indefinida`);
    else warnings.push({ code: "REPORT_WEEK_LABELS_DIFFER", detail: `${detail} Usada a mais antiga (${reportWeekLabel}).` });
  }
  // Pacote com semana ANTERIOR à do assunto: relatório mais antigo enviado depois.
  const subjectNumber = weekNumber(subject);
  const reportNumber = weekNumber(reportWeekLabel);
  const olderThanSubject = subjectNumber !== null && reportNumber !== null && inPackage.length > 0 && reportNumber < subjectNumber;
  if (olderThanSubject) {
    warnings.push({ code: "REPORT_OLDER_THAN_SUBJECT", detail: `Relatório da semana ${reportWeekLabel} enviado no pacote ${subject} — o envio não pode adiantar o corte.` });
  }
  if (subjectNumber !== null && reportNumber !== null && inPackage.length > 0 && reportNumber > subjectNumber) {
    warnings.push({ code: "REPORT_NEWER_THAN_SUBJECT", detail: `Arquivo da semana ${reportWeekLabel} em pacote rotulado ${subject}.` });
  }

  // Data do próprio arquivo: só vale se não for posterior ao envio (salvamento depois do envio é incoerente).
  if (saved && email && saved > email) {
    warnings.push({ code: "DOCUMENT_DATE_AFTER_EMAIL", detail: `Último salvamento do arquivo (${saved}) posterior ao envio (${email}) — metadado ignorado.` });
    saved = null;
  }

  let referenceDate: string | null = null;
  let source: ReportReferenceSource = "NONE";
  if (saved) {
    referenceDate = saved; // nunca depois do envio (garantido acima)
    source = "DOCUMENT_LAST_SAVED";
    if (email && daysBetween(email, saved) > LATE_DELIVERY_DAYS) {
      warnings.push({ code: "LATE_DELIVERY_OR_FORWARD", detail: `Envio (${email}) ${daysBetween(email, saved)} dia(s) após o último salvamento do arquivo (${saved}) — corte pela data do arquivo.` });
    }
  } else if (email) {
    if (forwarded) {
      blockers.push("e-mail encaminhado sem data própria do relatório — a data do encaminhamento não pode definir o corte");
    } else if (olderThanSubject) {
      blockers.push(`relatório da semana ${reportWeekLabel} em pacote ${subject} sem data própria — a data do envio poderia adiantar o corte`);
    } else {
      referenceDate = email;
      source = "EMAIL_SENT_FALLBACK";
      warnings.push({ code: "REFERENCE_FROM_EMAIL_DATE", detail: `Sem data própria no arquivo: referência = envio do e-mail (${email}), apenas como fallback.` });
    }
  } else {
    blockers.push("sem data do relatório nem do envio");
  }
  if (blockers.length) {
    referenceDate = null;
    source = "NONE";
  }

  return { referenceDate, source, reportWeekLabel, weekLabels: { file, content, subject }, forwarded, blockers, warnings };
}
