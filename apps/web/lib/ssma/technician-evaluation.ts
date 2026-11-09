// PRÉVIA da avaliação do técnico de SSMA (ficha mensal e acumulada). Módulo PURO (sem rede/React), testável.
//
// STATUS: PRÉVIA. As regras abaixo são PROPOSTAS (versão "previa-1") e só passam a valer depois de aprovadas.
// Nada aqui grava nota, altera registro ou penaliza alguém; é um cálculo de leitura com memória de cálculo e evidências.
//
// Princípios:
//  - SEM DADO ≠ NOTA ZERO. Dimensão sem base de cálculo fica "sem dados" e seu peso é redistribuído entre as demais;
//    a cobertura (peso com dados) é mostrada e abaixo do mínimo a nota é só "indicativa".
//  - Near Miss e acidente NÃO reduzem a nota por quantidade. Avalia-se comunicação, tratamento, eficácia e reincidência.
//  - Responsabilidade do técnico ≠ dependência da gerência: ações cujo responsável é outra pessoa, e itens que dependem de
//    decisão/recurso da gerência, aparecem à parte e não entram na nota do técnico.

export const EVALUATION_RULES_VERSION = "previa-1";

export const EVALUATION_WEIGHTS = {
  prevencao: 0.2,
  acoes: 0.25,
  capacitacao: 0.15,
  ambiental: 0.2,
  qualidade: 0.1,
  resultados: 0.1,
} as const;
export type DimensionKey = keyof typeof EVALUATION_WEIGHTS;

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  prevencao: "Prevenção e inspeções",
  acoes: "Ações corretivas",
  capacitacao: "Capacitação / DDS / DSS",
  ambiental: "Gestão ambiental",
  qualidade: "Qualidade e transparência dos registros",
  resultados: "Resultados e melhoria contínua",
};

/** Parâmetros propostos (ainda não aprovados). */
export const EVALUATION_PARAMS = {
  /** Meta de inspeções/verificações preventivas por semana, por técnico. */
  preventivePerWeek: 3,
  /** Mínimo de peso com dados para a nota deixar de ser apenas indicativa. */
  minCoverage: 0.6,
  /** Janela para considerar reincidência após o tratamento (dias). */
  recurrenceDays: 30,
  /** Registro enviado em até N horas do fato é considerado tempestivo. */
  timelyHours: 24,
  /** Descrição mínima (caracteres) para registro considerado completo. */
  minDescription: 20,
  /** Crédito de ação concluída com atraso. */
  lateCredit: 0.5,
} as const;

export const PREVENTIVE_FORM_SLUGS: readonly string[] = ["fotos-diarias", "apr", "pt", "integracao", "almoxarifado", "riscos-apontados"];
export const DAILY_DIALOG_SLUG = "dda"; // exibido como DDS (Diálogo Diário)
export const WEEKLY_DIALOG_SLUG = "dds"; // exibido como DSS (Diálogo Semanal)

export interface EvalForm {
  id: string;
  checklist_slug: string;
  occurred_at: string;
  created_at?: string | null;
  technician_user_id: string;
  field_values: Record<string, unknown> | null;
  photoCount?: number;
}
export interface EvalAction {
  id: string;
  status: "ABERTA" | "EM_ANDAMENTO" | "CONCLUIDA";
  due_date: string;
  concluded_at: string | null;
  responsible_user_id: string;
}
export interface EvalRecord {
  id: string;
  kind: "OCORRENCIA" | "INSPECAO";
  category: string;
  location: string;
  description: string;
  occurred_at: string;
  received_at: string;
  reported_by_user_id: string;
  photoCount: number;
  action: EvalAction | null;
}

export interface EvidenceRef {
  type: "FORMULARIO" | "REGISTRO_DE_CAMPO" | "ACAO_CORRETIVA";
  id: string;
  date: string;
  label: string;
}

export interface DimensionResult {
  key: DimensionKey;
  label: string;
  weight: number;
  /** 0–100; null = SEM DADOS (não é zero). */
  score: number | null;
  /** Peso efetivo depois de redistribuir as dimensões sem dados (0 quando sem dados). */
  effectiveWeight: number;
  memory: string[];
  evidence: EvidenceRef[];
  /** Itens que dependem da gerência: aparecem, mas não entram na nota do técnico. */
  managementDependencies: string[];
}

export interface EvaluationSheet {
  rulesVersion: string;
  preview: true;
  technicianUserId: string;
  period: { from: string; to: string };
  dimensions: DimensionResult[];
  /** Nota final (0–100) das dimensões com dados; null quando nenhuma tem dados. */
  total: number | null;
  /** Soma dos pesos com dados (0–1). */
  coverage: number;
  /** true quando a cobertura é menor que o mínimo: nota apenas indicativa. */
  indicative: boolean;
  /** Memória de cálculo da nota final. */
  totalMemory: string;
}

const ms = (iso: string) => new Date(iso).getTime();
const round = (value: number) => Math.round(value * 10) / 10;
const pct = (value: number) => `${round(value * 100)}%`;
const day = (iso: string) => new Date(ms(iso) - 3 * 3600_000).toISOString().slice(0, 10); // dia em Brasília (UTC-3)

/** Dias úteis (seg–sex) entre duas datas YYYY-MM-DD, inclusive. */
export function workingDays(from: string, to: string): number {
  let count = 0;
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400_000) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}
/** Semanas (segunda a domingo) que tocam o período com pelo menos um dia útil. */
export function weeksInPeriod(from: string, to: string): string[] {
  const weeks = new Set<string>();
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400_000) {
    const d = new Date(t);
    const weekday = d.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const monday = new Date(t - ((weekday + 6) % 7) * 86400_000).toISOString().slice(0, 10);
    weeks.add(monday);
  }
  return [...weeks];
}
const weekOf = (isoDay: string): string => {
  const t = Date.parse(`${isoDay}T00:00:00Z`);
  const weekday = new Date(t).getUTCDay();
  return new Date(t - ((weekday + 6) % 7) * 86400_000).toISOString().slice(0, 10);
};

/** Primeiro e último dia (YYYY-MM-DD) do mês "YYYY-MM". */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function empty(key: DimensionKey, why: string): DimensionResult {
  return { key, label: DIMENSION_LABELS[key], weight: EVALUATION_WEIGHTS[key], score: null, effectiveWeight: 0, memory: [`SEM DADOS: ${why}. Não é nota zero; o peso é redistribuído.`], evidence: [], managementDependencies: [] };
}
function make(key: DimensionKey, score: number, memory: string[], evidence: EvidenceRef[], dependencies: string[] = []): DimensionResult {
  return { key, label: DIMENSION_LABELS[key], weight: EVALUATION_WEIGHTS[key], score: round(Math.max(0, Math.min(100, score))), effectiveWeight: 0, memory, evidence, managementDependencies: dependencies };
}
const formEvidence = (f: EvalForm): EvidenceRef => ({ type: "FORMULARIO", id: f.id, date: f.occurred_at, label: `Formulário ${f.checklist_slug}` });
const recordEvidence = (r: EvalRecord): EvidenceRef => ({ type: "REGISTRO_DE_CAMPO", id: r.id, date: r.occurred_at, label: `${r.kind === "INSPECAO" ? "Inspeção" : "Ocorrência"} · ${r.category}` });

export function computeTechnicianEvaluation(input: {
  technicianUserId: string;
  period: { from: string; to: string };
  forms: EvalForm[];
  records: EvalRecord[];
  /** Todas as ações da obra no período (para separar as do técnico das dependências da gerência). */
  actions: Array<EvalAction & { record_id: string }>;
}): EvaluationSheet {
  const { technicianUserId: tech, period } = input;
  const inPeriod = (iso: string) => day(iso) >= period.from && day(iso) <= period.to;
  const forms = input.forms.filter((f) => f.technician_user_id === tech && inPeriod(f.occurred_at));
  const records = input.records.filter((r) => r.reported_by_user_id === tech && inPeriod(r.occurred_at));
  const P = EVALUATION_PARAMS;
  const weeks = weeksInPeriod(period.from, period.to);
  const days = workingDays(period.from, period.to);

  // Técnico sem NENHUM registro (nem formulário, nem registro de campo, nem ação sob sua responsabilidade) no período: não há
  // como distinguir ausência de trabalho de ausência de registro/alocação/afastamento. Fica SEM DADOS (nunca nota zero) e a
  // gerência confirma a situação antes de qualquer conclusão.
  const hasOwnAction = input.actions.some((a) => a.responsible_user_id === tech && a.due_date >= period.from && a.due_date <= period.to);
  if (forms.length === 0 && records.length === 0 && !hasOwnAction) {
    const dimensions = (Object.keys(EVALUATION_WEIGHTS) as DimensionKey[]).map((key) => empty(key, "o técnico não tem nenhum registro no período (confirmar alocação, férias ou afastamento)"));
    return { rulesVersion: EVALUATION_RULES_VERSION, preview: true, technicianUserId: tech, period, dimensions, total: null, coverage: 0, indicative: true, totalMemory: "Sem registros do técnico no período: nota não calculada (não é zero)." };
  }

  // 1) Prevenção e inspeções — meta proposta: N verificações preventivas por semana útil.
  const preventiveForms = forms.filter((f) => PREVENTIVE_FORM_SLUGS.includes(f.checklist_slug));
  const inspections = records.filter((r) => r.kind === "INSPECAO");
  let prevencao: DimensionResult;
  if (weeks.length === 0) prevencao = empty("prevencao", "o período não tem dias úteis");
  else {
    const done = preventiveForms.length + inspections.length;
    const goal = weeks.length * P.preventivePerWeek;
    prevencao = make(
      "prevencao",
      Math.min(1, done / goal) * 100,
      [`${preventiveForms.length} formulário(s) preventivo(s) + ${inspections.length} inspeção(ões) = ${done}.`, `Meta proposta: ${P.preventivePerWeek} por semana × ${weeks.length} semana(s) = ${goal}.`, `Nota = min(1, ${done}/${goal}) = ${pct(Math.min(1, done / goal))}.`],
      [...preventiveForms.map(formEvidence), ...inspections.map(recordEvidence)]
    );
  }

  // 2) Ações corretivas — só as do técnico entram; as de outros responsáveis são dependência da gerência.
  const mine = input.actions.filter((a) => a.responsible_user_id === tech && a.due_date >= period.from && a.due_date <= period.to);
  const others = input.actions.filter((a) => a.responsible_user_id !== tech && a.due_date >= period.from && a.due_date <= period.to);
  const today = day(new Date().toISOString());
  const decided = mine.filter((a) => a.status === "CONCLUIDA" || a.due_date < today);
  const dependencies: string[] = [];
  if (others.length > 0) dependencies.push(`${others.length} ação(ões) com outro responsável no período (dependência da gerência; fora da nota do técnico).`);
  let acoes: DimensionResult;
  if (decided.length === 0) {
    acoes = empty("acoes", mine.length === 0 ? "nenhuma ação sob responsabilidade do técnico vence no período" : "as ações do técnico ainda estão no prazo");
    acoes.managementDependencies = dependencies;
  } else {
    let credit = 0;
    const lines: string[] = [];
    let onTime = 0, late = 0, overdue = 0;
    for (const a of decided) {
      if (a.status === "CONCLUIDA" && a.concluded_at && day(a.concluded_at) <= a.due_date) { credit += 1; onTime += 1; }
      else if (a.status === "CONCLUIDA") { credit += P.lateCredit; late += 1; }
      else overdue += 1;
    }
    lines.push(`${decided.length} ação(ões) com desfecho: ${onTime} no prazo (1,0), ${late} concluída(s) com atraso (${P.lateCredit}), ${overdue} vencida(s) em aberto (0).`);
    lines.push(`Ações ainda no prazo (${mine.length - decided.length}) não entram até vencer ou concluir.`);
    lines.push(`Nota = ${credit}/${decided.length} = ${pct(credit / decided.length)}.`);
    acoes = make("acoes", (credit / decided.length) * 100, lines, decided.map((a) => ({ type: "ACAO_CORRETIVA", id: a.id, date: a.due_date, label: `Ação ${a.status} (prazo ${a.due_date})` })), dependencies);
  }

  // 3) Capacitação / DDS (diário) / DSS (semanal).
  const dds = forms.filter((f) => f.checklist_slug === DAILY_DIALOG_SLUG);
  const dss = forms.filter((f) => f.checklist_slug === WEEKLY_DIALOG_SLUG);
  let capacitacao: DimensionResult;
  if (days === 0) capacitacao = empty("capacitacao", "o período não tem dias úteis");
  else {
    const ddsDays = new Set(dds.map((f) => day(f.occurred_at)));
    const dssWeeks = new Set(dss.map((f) => weekOf(day(f.occurred_at))));
    const ddsRatio = Math.min(1, ddsDays.size / days);
    const dssRatio = Math.min(1, dssWeeks.size / weeks.length);
    capacitacao = make(
      "capacitacao",
      ((ddsRatio + dssRatio) / 2) * 100,
      [`DDS (diário): ${ddsDays.size} dia(s) com diálogo de ${days} dia(s) útil(eis) = ${pct(ddsRatio)}.`, `DSS (semanal): ${dssWeeks.size} semana(s) com diálogo de ${weeks.length} = ${pct(dssRatio)}.`, `Nota = média simples = ${pct((ddsRatio + dssRatio) / 2)}. Dias sem obra/feriado ainda não são descontados (regra a aprovar).`],
      [...dds, ...dss].map(formEvidence)
    );
  }

  // 4) Gestão ambiental — comprovante nas remessas de bota-fora + limpeza + registros de meio ambiente.
  const remessas = forms.filter((f) => f.checklist_slug === "remessa-bota-fora");
  const limpezas = forms.filter((f) => f.checklist_slug === "limpeza");
  const meioAmbiente = records.filter((r) => r.category === "Meio ambiente");
  let ambiental: DimensionResult;
  const envItems = remessas.length + limpezas.length + meioAmbiente.length;
  if (envItems === 0) ambiental = empty("ambiental", "nenhuma remessa, limpeza ou registro de meio ambiente no período");
  else {
    const withProof = remessas.filter((f) => String(f.field_values?.comprovante ?? "").trim() !== "").length;
    const parts: number[] = [];
    const lines: string[] = [];
    if (remessas.length > 0) { parts.push(withProof / remessas.length); lines.push(`Remessas com nº de MTR/comprovante: ${withProof} de ${remessas.length} = ${pct(withProof / remessas.length)}.`); }
    if (limpezas.length > 0) { const r = Math.min(1, limpezas.length / Math.max(1, weeks.length)); parts.push(r); lines.push(`Limpezas registradas: ${limpezas.length} para ${weeks.length} semana(s) (meta proposta: 1 por semana) = ${pct(r)}.`); }
    if (meioAmbiente.length > 0) { const ok = meioAmbiente.filter((r) => r.description.trim().length >= P.minDescription && r.photoCount > 0).length; parts.push(ok / meioAmbiente.length); lines.push(`Registros de meio ambiente completos (descrição e foto): ${ok} de ${meioAmbiente.length}.`); }
    const score = (parts.reduce((a, b) => a + b, 0) / parts.length) * 100;
    lines.push(`Nota = média dos componentes com dados = ${round(score)}%.`);
    ambiental = make("ambiental", score, lines, [...remessas.map(formEvidence), ...limpezas.map(formEvidence), ...meioAmbiente.map(recordEvidence)]);
  }

  // 5) Qualidade e transparência — completude, foto e tempestividade de tudo que o técnico registrou.
  const items: Array<{ ok: number; ref: EvidenceRef; why: string }> = [];
  for (const r of records) {
    const timely = ms(r.received_at) - ms(r.occurred_at) <= P.timelyHours * 3600_000;
    const complete = r.description.trim().length >= P.minDescription && r.location.trim() !== "";
    items.push({ ok: (timely ? 1 : 0) + (complete ? 1 : 0) + (r.photoCount > 0 ? 1 : 0), ref: recordEvidence(r), why: "" });
  }
  for (const f of forms) {
    const created = f.created_at ?? f.occurred_at;
    const timely = ms(created) - ms(f.occurred_at) <= P.timelyHours * 3600_000;
    items.push({ ok: (timely ? 1 : 0) + 1 + ((f.photoCount ?? 0) > 0 ? 1 : 0), ref: formEvidence(f), why: "" });
  }
  let qualidade: DimensionResult;
  if (items.length === 0) qualidade = empty("qualidade", "o técnico não registrou nada no período");
  else {
    const got = items.reduce((n, i) => n + i.ok, 0);
    const max = items.length * 3;
    qualidade = make(
      "qualidade",
      (got / max) * 100,
      [`${items.length} registro(s) avaliado(s), 3 critérios cada: enviado em até ${P.timelyHours} h, completo (descrição/local) e com foto.`, `Nota = ${got}/${max} = ${pct(got / max)}.`],
      items.map((i) => i.ref)
    );
  }

  // 6) Resultados e melhoria contínua — tratamento e reincidência dos relatos; quantidade NÃO penaliza.
  const reports = records.filter((r) => r.kind === "OCORRENCIA" || r.category === "Quase-acidente");
  let resultados: DimensionResult;
  if (reports.length === 0) {
    resultados = empty("resultados", "nenhuma ocorrência ou Near Miss relatado no período (ausência de relato não penaliza nem premia)");
    resultados.memory.push("A quantidade de Near Misses ou acidentes nunca reduz a nota. Eficácia das ações não é mensurável hoje (não há verificação de eficácia gravada).");
  } else {
    const treated = reports.filter((r) => r.action !== null).length;
    const recurrences = reports.filter((r) => {
      const prior = input.records.find((o) => o.id !== r.id && o.category === r.category && o.location === r.location && ms(o.occurred_at) < ms(r.occurred_at) && ms(r.occurred_at) - ms(o.occurred_at) <= P.recurrenceDays * 86400_000 && o.action?.status === "CONCLUIDA");
      return Boolean(prior);
    }).length;
    const treatedRatio = treated / reports.length;
    const recurrencePenalty = Math.min(0.3, (recurrences / reports.length) * 0.3);
    resultados = make(
      "resultados",
      (treatedRatio - recurrencePenalty) * 100,
      [
        `${reports.length} relato(s) de ocorrência/Near Miss; ${treated} com tratamento (ação corretiva criada) = ${pct(treatedRatio)}.`,
        `Reincidência (mesma categoria e local em até ${P.recurrenceDays} dias após ação concluída): ${recurrences} → desconto de até 30% proporcional = ${pct(recurrencePenalty)}.`,
        "A QUANTIDADE de relatos não entra no cálculo. Comunicação imediata do acidente e eficácia das ações: ainda sem dado gravado (sem nota).",
      ],
      reports.map(recordEvidence)
    );
  }

  const dimensions = [prevencao, acoes, capacitacao, ambiental, qualidade, resultados];
  const coverage = dimensions.reduce((n, d) => n + (d.score !== null ? d.weight : 0), 0);
  for (const d of dimensions) d.effectiveWeight = d.score !== null && coverage > 0 ? d.weight / coverage : 0;
  const total = coverage > 0 ? round(dimensions.reduce((n, d) => n + (d.score !== null ? d.score * d.effectiveWeight : 0), 0)) : null;
  const totalMemory =
    total === null
      ? "Sem dados em nenhuma dimensão: nota não calculada (não é zero)."
      : `Nota = soma(nota × peso efetivo) das ${dimensions.filter((d) => d.score !== null).length} dimensão(ões) com dados; cobertura ${pct(coverage)} do peso total${coverage < P.minCoverage ? ` (abaixo de ${pct(P.minCoverage)}: nota apenas INDICATIVA)` : ""}.`;
  return { rulesVersion: EVALUATION_RULES_VERSION, preview: true, technicianUserId: tech, period, dimensions, total, coverage: round(coverage * 1000) / 1000, indicative: coverage < P.minCoverage, totalMemory };
}

/** Estados do fluxo (a persistência depende da migration separada; na prévia o fluxo é só demonstrativo). */
export type EvaluationWorkflowStatus = "RASCUNHO" | "AGUARDANDO_MANIFESTACAO" | "MANIFESTADA" | "VALIDADA_PELO_GERENTE";
export function nextEvaluationStatus(current: EvaluationWorkflowStatus, action: "ENVIAR" | "MANIFESTAR" | "VALIDAR", actorIsTechnician: boolean, actorIsManager: boolean): EvaluationWorkflowStatus {
  if (action === "ENVIAR" && current === "RASCUNHO" && actorIsManager) return "AGUARDANDO_MANIFESTACAO";
  if (action === "MANIFESTAR" && current === "AGUARDANDO_MANIFESTACAO" && actorIsTechnician) return "MANIFESTADA";
  if (action === "VALIDAR" && current === "MANIFESTADA" && actorIsManager && !actorIsTechnician) return "VALIDADA_PELO_GERENTE";
  throw new Error("TRANSICAO_INVALIDA");
}
