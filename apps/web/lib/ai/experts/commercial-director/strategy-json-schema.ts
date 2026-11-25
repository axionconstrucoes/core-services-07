// JSON Schema da resposta estratégica (CommercialStrategyBrief) enviado
// como outputSchema ao provider. Espelha ./strategy-types.ts. Sem
// oneOf/anyOf/allOf/$ref (compatível com `strict`, ver
// scripts/test-anthropic-schema-compatibility.mjs). A garantia real
// continua sendo validateCommercialStrategyBrief (./strategy-schema.ts).

import { NULLABLE_STRING_SCHEMA, STRING_ARRAY_SCHEMA } from "../../schemas/json-schema-fragments";
import {
  COMMERCIAL_STRATEGY_MODES,
  CONCESSION_ACCEPTABILITY,
  MATURITY_LEVELS,
  OPPORTUNITY_STAGES,
  STATEMENT_KINDS,
  STRATEGY_DRAFT_TYPES,
  TIMING_MOVES,
} from "./strategy-schema";

const statementSchema = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: [...STATEMENT_KINDS] },
    texto: { type: "string" },
    fonte: NULLABLE_STRING_SCHEMA,
  },
  required: ["tipo", "texto", "fonte"],
  additionalProperties: false,
} as const;

const statementArray = { type: "array", items: statementSchema } as const;
const maturity = { type: "string", enum: [...MATURITY_LEVELS] } as const;

export const COMMERCIAL_STRATEGY_BRIEF_JSON_SCHEMA = {
  type: "object",
  properties: {
    mode: { type: "string", enum: [...COMMERCIAL_STRATEGY_MODES] },
    diagnostico: {
      type: "object",
      properties: {
        estagioOportunidade: { type: "string", enum: [...OPPORTUNITY_STAGES] },
        interessesCliente: statementArray,
        restricoesCliente: statementArray,
        posicaoCompetitiva: statementArray,
        decisoresEInterlocutores: statementArray,
        maturidade: {
          type: "object",
          properties: { tecnica: maturity, comercial: maturity, contratual: maturity },
          required: ["tecnica", "comercial", "contratual"],
          additionalProperties: false,
        },
      },
      required: [
        "estagioOportunidade",
        "interessesCliente",
        "restricoesCliente",
        "posicaoCompetitiva",
        "decisoresEInterlocutores",
        "maturidade",
      ],
      additionalProperties: false,
    },
    estrategiaRecomendada: statementArray,
    momentoEAbordagem: {
      type: "object",
      properties: {
        movimentoRecomendado: { type: "string", enum: [...TIMING_MOVES] },
        agoraOuAguardar: { type: "string", enum: ["AGORA", "AGUARDAR"] },
        justificativa: statementArray,
        condicoesParaAvancar: STRING_ARRAY_SCHEMA,
        interlocutor: NULLABLE_STRING_SCHEMA,
        canal: NULLABLE_STRING_SCHEMA,
        tomEPosicionamento: NULLABLE_STRING_SCHEMA,
        argumentacaoTecnica: STRING_ARRAY_SCHEMA,
        argumentacaoComercial: STRING_ARRAY_SCHEMA,
        documentosDeSuporte: STRING_ARRAY_SCHEMA,
      },
      required: [
        "movimentoRecomendado",
        "agoraOuAguardar",
        "justificativa",
        "condicoesParaAvancar",
        "interlocutor",
        "canal",
        "tomEPosicionamento",
        "argumentacaoTecnica",
        "argumentacaoComercial",
        "documentosDeSuporte",
      ],
      additionalProperties: false,
    },
    cenariosConcessao: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          contrapartidaExigida: NULLABLE_STRING_SCHEMA,
          aceitabilidadeEconomica: { type: "string", enum: [...CONCESSION_ACCEPTABILITY] },
          fontesEconomicas: STRING_ARRAY_SCHEMA,
          riscos: STRING_ARRAY_SCHEMA,
        },
        required: ["descricao", "contrapartidaExigida", "aceitabilidadeEconomica", "fontesEconomicas", "riscos"],
        additionalProperties: false,
      },
    },
    impactos: {
      type: "object",
      properties: { economicos: statementArray, contratuais: statementArray, prazo: statementArray },
      required: ["economicos", "contratuais", "prazo"],
      additionalProperties: false,
    },
    objecoesERespostas: {
      type: "array",
      items: {
        type: "object",
        properties: { objecao: { type: "string" }, resposta: { type: "string" }, fundamento: NULLABLE_STRING_SCHEMA },
        required: ["objecao", "resposta", "fundamento"],
        additionalProperties: false,
      },
    },
    roteiroReunioes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ordem: { type: "integer" },
          objetivo: { type: "string" },
          participantesSugeridos: STRING_ARRAY_SCHEMA,
          pauta: STRING_ARRAY_SCHEMA,
        },
        required: ["ordem", "objetivo", "participantesSugeridos", "pauta"],
        additionalProperties: false,
      },
    },
    minuta: {
      type: ["object", "null"],
      properties: {
        type: { type: "string", enum: [...STRATEGY_DRAFT_TYPES] },
        subject: NULLABLE_STRING_SCHEMA,
        body: { type: "string" },
        status: { type: "string", enum: ["DRAFT_PENDING_REVIEW"] },
      },
      required: ["type", "subject", "body", "status"],
      additionalProperties: false,
    },
    condicoesRecomendadasFechamento: statementArray,
    decisoesAprovacaoHumana: {
      type: "array",
      items: {
        type: "object",
        properties: { decisao: { type: "string" }, responsavelSugerido: { type: "string" }, motivo: { type: "string" } },
        required: ["decisao", "responsavelSugerido", "motivo"],
        additionalProperties: false,
      },
    },
    solicitacoesOrcamentos: STRING_ARRAY_SCHEMA,
    numerosCitados: {
      type: "array",
      items: {
        type: "object",
        properties: { valor: { type: "number" }, descricao: { type: "string" }, fonte: { type: "string" } },
        required: ["valor", "descricao", "fonte"],
        additionalProperties: false,
      },
    },
    informacoesFaltantes: STRING_ARRAY_SCHEMA,
    requiresHumanReview: { type: "boolean", enum: [true] },
  },
  required: [
    "mode",
    "diagnostico",
    "estrategiaRecomendada",
    "momentoEAbordagem",
    "cenariosConcessao",
    "impactos",
    "objecoesERespostas",
    "roteiroReunioes",
    "minuta",
    "condicoesRecomendadasFechamento",
    "decisoesAprovacaoHumana",
    "solicitacoesOrcamentos",
    "numerosCitados",
    "informacoesFaltantes",
    "requiresHumanReview",
  ],
  additionalProperties: false,
} as const;
