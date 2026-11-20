// Checklist de Responsabilidade Civil Cruzada (RCC) — as 10 perguntas do Bloco 10.
// Não decide cobertura. Não presume que RCC cubra defeito de execução nem danos à própria obra.
import type { SourceRef } from "./types";

export const RCC_QUESTIONS = [
  { key: "CAUSADOR", label: "Quem é o causador do dano?" },
  { key: "VITIMA", label: "Quem é a vítima / quem sofreu o dano?" },
  { key: "ABRANGENCIA_SEGURADOS", label: "A apólice abrange ambos (causador e vítima) como segurados / terceiros entre si?" },
  { key: "OBJETO", label: "Qual o objeto do dano (pessoa, bem, serviço) e o que a apólice define como objeto coberto?" },
  { key: "BENS_TERCEIROS_X_PROPRIA_OBRA", label: "O dano atinge bens de terceiros ou a própria obra/serviço do segurado?" },
  { key: "EXCLUSOES", label: "Quais exclusões da apólice podem se aplicar?" },
  { key: "SUBLIMITES", label: "Há sublimites aplicáveis?" },
  { key: "FRANQUIAS", label: "Há franquias/participação obrigatória aplicáveis?" },
  { key: "ENDOSSOS", label: "Há endossos (emitidos e conferidos) que alterem o quadro?" },
  { key: "AVISO", label: "O aviso de sinistro foi/pode ser feito no prazo e pelo canal exigidos?" },
] as const;
export type RccKey = (typeof RCC_QUESTIONS)[number]["key"];

export interface RccAnswer {
  answer?: string | null;
  source?: SourceRef | null;
  /** Só para BENS_TERCEIROS_X_PROPRIA_OBRA */
  propertyScope?: "BENS_TERCEIROS" | "PROPRIA_OBRA" | "AMBOS" | "INDEFINIDO" | null;
}
export type RccItemStatus = "RESPONDIDA_COM_FONTE" | "RESPONDIDA_SEM_FONTE" | "SEM_DADOS";

export interface RccChecklistResult {
  items: { key: RccKey; label: string; status: RccItemStatus; answer: string | null }[];
  answeredWithSource: number;
  total: 10;
  readyForCoverageAssessment: boolean;
  warnings: string[];
  neverPresumed: string[];
  requiresHumanReview: true;
}

const hasSrc = (s?: SourceRef | null) => Boolean(s && (s.documentId || (s.ref && s.ref.trim())));

export function evaluateRccChecklist(answers: Partial<Record<RccKey, RccAnswer>>): RccChecklistResult {
  const warnings: string[] = [];
  const items = RCC_QUESTIONS.map((q) => {
    const a = answers[q.key];
    const text = a?.answer?.trim() || null;
    const status: RccItemStatus = !text ? "SEM_DADOS" : hasSrc(a?.source) ? "RESPONDIDA_COM_FONTE" : "RESPONDIDA_SEM_FONTE";
    if (status === "RESPONDIDA_SEM_FONTE") warnings.push(`${q.key}: resposta sem fonte documental — não conta como evidência.`);
    return { key: q.key, label: q.label, status, answer: text };
  });
  const scope = answers.BENS_TERCEIROS_X_PROPRIA_OBRA?.propertyScope ?? null;
  if (scope === "PROPRIA_OBRA" || scope === "AMBOS") {
    warnings.push("Dano à própria obra envolvido: NÃO presumir cobertura pela RC; exigir cláusula expressa e tratar por modalidade adequada (ex.: riscos de engenharia).");
  }
  if (scope === "INDEFINIDO" || scope === null) warnings.push("Natureza do bem atingido indefinida: não concluir cobertura.");
  const answeredWithSource = items.filter((i) => i.status === "RESPONDIDA_COM_FONTE").length;
  return {
    items,
    answeredWithSource,
    total: 10,
    readyForCoverageAssessment: answeredWithSource === 10,
    warnings,
    neverPresumed: [
      "RCC cobre defeito de execução / retrabalho do próprio segurado",
      "RCC cobre danos à própria obra",
      "Subcontratadas são terceiros entre si para a apólice (depende da abrangência de segurados e do texto)",
    ],
    requiresHumanReview: true,
  };
}
