// Analista IA de Qualidade — Expert oficial do ACC
// (quality-analyst). Só consulta conversacional nesta fase (mesmo
// padrão de experts/esg-director e experts/planning-director). Nenhuma
// lógica de negócio de outro domínio (RLS, revisão humana, Event Ledger,
// cronograma, SLA) é duplicada aqui.

import {
  QUALITY_ANALYST_EXPERT_ID,
  QUALITY_ANALYST_INSTRUCTIONS,
  QUALITY_ANALYST_NAME,
  QUALITY_ANALYST_VERSION,
} from "./identity";
import { answerQualityAnalystQuery } from "./query";

export {
  QUALITY_ANALYST_EXPERT_ID,
  QUALITY_ANALYST_INSTRUCTIONS,
  QUALITY_ANALYST_NAME,
  QUALITY_ANALYST_VERSION,
  answerQualityAnalystQuery,
};
export type { QualityAnalystQueryResult } from "./query";
