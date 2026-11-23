// Fase 5/C — relatório de COBERTURA por caixa (puro, sem rede e sem banco). Recebe CONTAGENS AGREGADAS (nunca conteúdo) e devolve,
// por caixa: totais por mês na janela, meses sem nada, lacuna inicial/final e um status que NUNCA é OPERACIONAL sem prova.
//
// Regra de status (a mesma da matriz de cobertura):
//   NAO_CONECTADA - a caixa não tem nenhuma mensagem importada nem sincronização registrada;
//   OPERACIONAL   - há mensagens importadas E há PROVA de cobertura da janela inteira (coveredFrom <= início da janela) E a última
//                   sincronização bem-sucedida é recente (<= maxStalenessHours) E não há falhas abertas;
//   PARCIAL       - qualquer outro caso (há dados, mas falta prova de início, ou está defasada, ou há falha).
// Um mês com 0 mensagens não é, por si, erro (pode não ter havido e-mail do projeto): ele é LISTADO; quem prova que a leitura
// cobriu o mês é o checkpoint (coveredFrom/coveredTo), não a contagem.
import { monthKeyBrt, planBackfillChunks } from "./backfill-chunks.mjs";

export const REPORT_STATUS = Object.freeze({ OPERACIONAL: "OPERACIONAL", PARCIAL: "PARCIAL", NAO_CONECTADA: "NAO_CONECTADA" });

/**
 * @param {{
 *   window: { start: string, end: string },
 *   now?: Date, maxStalenessHours?: number,
 *   mailboxes: { label: string, rows: { month: string, inbound?: number, outbound?: number, indeterminate?: number }[],
 *     coveredFrom?: string|null, coveredTo?: string|null, lastSuccessAt?: string|null, openFailures?: number,
 *     attachments?: { total?: number, stored?: number, pending?: number, error?: number }, threads?: number }[],
 * }} input   label = rótulo (CAIXA-n); NUNCA o endereço.
 */
export function buildMailboxCoverageReport({ window, now = new Date(), maxStalenessHours = 48, mailboxes }) {
  const months = planBackfillChunks(window).map((c) => c.label);
  const first = months[0];
  const last = months[months.length - 1];
  const out = mailboxes.map((m) => {
    const byMonth = new Map(months.map((k) => [k, { inbound: 0, outbound: 0, indeterminate: 0 }]));
    let outsideWindow = 0;
    for (const r of m.rows ?? []) {
      const slot = byMonth.get(r.month);
      const n = (r.inbound ?? 0) + (r.outbound ?? 0) + (r.indeterminate ?? 0);
      if (!slot) { outsideWindow += n; continue; }
      slot.inbound += r.inbound ?? 0; slot.outbound += r.outbound ?? 0; slot.indeterminate += r.indeterminate ?? 0;
    }
    const perMonth = months.map((k) => ({ month: k, ...byMonth.get(k), total: byMonth.get(k).inbound + byMonth.get(k).outbound + byMonth.get(k).indeterminate }));
    const total = perMonth.reduce((s, x) => s + x.total, 0);
    const withData = perMonth.filter((x) => x.total > 0);
    const emptyMonths = perMonth.filter((x) => x.total === 0).map((x) => x.month);
    const firstMonth = withData[0]?.month ?? null;
    const lastMonth = withData[withData.length - 1]?.month ?? null;
    const leadingEmptyMonths = firstMonth ? months.indexOf(firstMonth) : months.length;
    const trailingEmptyMonths = lastMonth ? months.length - 1 - months.indexOf(lastMonth) : months.length;

    const coverageProven = Boolean(m.coveredFrom) && Date.parse(m.coveredFrom) <= Date.parse(window.start);
    const ageHours = m.lastSuccessAt ? (now.getTime() - Date.parse(m.lastSuccessAt)) / 3600000 : null;
    const fresh = ageHours !== null && ageHours <= maxStalenessHours;
    const failures = m.openFailures ?? 0;

    const gaps = [];
    if (total === 0 && !m.lastSuccessAt) gaps.push("SEM_MENSAGENS_E_SEM_SINCRONIZACAO");
    if (total > 0 && !coverageProven) gaps.push(`SEM_PROVA_DE_COBERTURA_DESDE_${window.start.slice(0, 10)}`);
    if (leadingEmptyMonths > 0 && total > 0) gaps.push(`${leadingEmptyMonths}_MES(ES)_INICIAIS_SEM_MENSAGENS(${first}..${months[leadingEmptyMonths - 1]})`);
    if (total > 0 && trailingEmptyMonths > 0) gaps.push(`${trailingEmptyMonths}_MES(ES)_FINAIS_SEM_MENSAGENS`);
    if (total > 0 && !fresh) gaps.push(m.lastSuccessAt ? `SINCRONIZACAO_DEFASADA_${Math.floor(ageHours)}H` : "SEM_REGISTRO_DE_ULTIMA_SINCRONIZACAO_BEM_SUCEDIDA");
    if (failures > 0) gaps.push(`${failures}_FALHA(S)_ABERTA(S)`);
    if (outsideWindow > 0) gaps.push(`${outsideWindow}_MENSAGEM(NS)_FORA_DA_JANELA`);

    let status = REPORT_STATUS.PARCIAL;
    if (total === 0 && !m.lastSuccessAt) status = REPORT_STATUS.NAO_CONECTADA;
    else if (total > 0 && coverageProven && fresh && failures === 0) status = REPORT_STATUS.OPERACIONAL;

    return {
      label: m.label, status, total, inbound: perMonth.reduce((s, x) => s + x.inbound, 0), outbound: perMonth.reduce((s, x) => s + x.outbound, 0),
      indeterminate: perMonth.reduce((s, x) => s + x.indeterminate, 0), firstMonth, lastMonth, emptyMonths, perMonth, gaps,
      coverageProven, lastSuccessAt: m.lastSuccessAt ?? null, openFailures: failures, attachments: m.attachments ?? null, threads: m.threads ?? null,
    };
  });
  return { window, months: months.length, generatedAt: now.toISOString(), mailboxes: out };
}

/** Markdown SEM endereços (só rótulos) para colar em documentos do repositório. */
export function renderCoverageMarkdown(report) {
  const head = "| Caixa | Status | Mensagens | Recebidas | Enviadas | Primeiro mês | Último mês | Meses sem mensagens | Lacunas |\n|---|---|---|---|---|---|---|---|---|";
  const rows = report.mailboxes.map((m) => `| ${m.label} | ${m.status} | ${m.total} | ${m.inbound} | ${m.outbound} | ${m.firstMonth ?? "-"} | ${m.lastMonth ?? "-"} | ${m.emptyMonths.length}/${report.months} | ${m.gaps.join("; ") || "nenhuma"} |`);
  return [head, ...rows].join("\n") + "\n";
}
