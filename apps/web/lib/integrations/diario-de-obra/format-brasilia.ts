// Formatacao de instante para o painel do Diario de Obra, em Brasilia.
//
// Historico: este formatador nasceu quando `formatDateTime` de
// `lib/labels` ainda usava `toLocaleString("pt-BR")` SEM `timeZone` (no
// servidor, UTC). Hoje `lib/labels` segue o padrao de Brasilia
// (`formatDateTimeBR`); este modulo continua puro e autocontido, mas
// produz exatamente o mesmo padrao de exibicao do ACC:
// "DD/MM/AAAA — HH:mm" em America/Sao_Paulo.
//
// Modulo puro: sem rede, sem banco, sem IA. So `Intl`, que ja sabe
// converter fuso — nenhuma soma ou subtracao manual de hora ou dia.

const FUSO_BRASILIA = "America/Sao_Paulo";

const FORMATADOR_DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_BRASILIA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Formata um instante ISO (UTC) como data e hora de Brasilia
 * ("DD/MM/AAAA — HH:mm").
 *
 * `null`/vazio devolve "—": ausencia de carimbo nao e' meia-noite de
 * 1970, e' ausencia.
 */
export function formatarDataHoraBrasilia(iso: string | null | undefined): string {
  if (!iso) return "—";

  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return "—";

  const partes: Record<string, string> = {};
  for (const parte of FORMATADOR_DATA_HORA.formatToParts(instante)) partes[parte.type] = parte.value;
  return `${partes.day}/${partes.month}/${partes.year} — ${partes.hour}:${partes.minute}`;
}
