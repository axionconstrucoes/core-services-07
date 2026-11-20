// Diretor de Engenharia e Construção IA — Expert oficial do ACC
// (engineering-director). Só consulta conversacional nesta fase (mesmo
// padrão de experts/esg-director e experts/planning-director). Nenhuma
// lógica de negócio de outro domínio (RLS, revisão humana, Event Ledger,
// cronograma, SLA) é duplicada aqui.

import {
  ENGINEERING_DIRECTOR_EXPERT_ID,
  ENGINEERING_DIRECTOR_INSTRUCTIONS,
  ENGINEERING_DIRECTOR_NAME,
  ENGINEERING_DIRECTOR_VERSION,
} from "./identity";
import { answerEngineeringDirectorQuery } from "./query";

export {
  ENGINEERING_DIRECTOR_EXPERT_ID,
  ENGINEERING_DIRECTOR_INSTRUCTIONS,
  ENGINEERING_DIRECTOR_NAME,
  ENGINEERING_DIRECTOR_VERSION,
  answerEngineeringDirectorQuery,
};
export type { EngineeringDirectorQueryResult } from "./query";
