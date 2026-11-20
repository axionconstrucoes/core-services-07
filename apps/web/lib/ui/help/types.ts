// Contratos do sistema universal de ajuda contextual (Hover Text) do ACC.
// Puro, sem I/O e sem JSX: testável pelo bundler do Next.js e por scripts Node (mesmo padrão de lib/ai/expert-definitions).
//
// REGRAS DE CONTEÚDO (valem para toda entrada nova — verificadas por scripts/test-help-catalog.mjs):
//  - o texto descreve o que o código REALMENTE faz; nunca inventar fórmula, fonte, frequência, prazo, permissão ou currículo;
//  - quando uma informação não existe ou não se aplica, o campo é OMITIDO (nunca preenchido com texto genérico);
//  - dado ausente é tratado como "sem fonte"/"não informado", nunca como zero;
//  - SLAs aprovados: CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis. Se a regra OPERACIONAL ainda
//    divergir (migration não publicada), a entrada declara a diferença em `validity`, sem apresentar como ativa a regra não publicada;
//  - AXIA é exclusivamente o assistente de dúvidas sobre o uso do ACC e nunca é descrita como especialista.

/** Tipo do elemento documentado (usado no inventário e na matriz de cobertura). */
export type HelpElementKind =
  | "module" // item de navegação / módulo
  | "page" // tela
  | "tab" // aba ou subaba
  | "button" // botão/ação funcional
  | "field" // campo de preenchimento
  | "filter" // filtro ou seletor
  | "kpi" // indicador / KPI
  | "status" // status, badge de criticidade
  | "table" // tabela ou coluna
  | "chart" // gráfico ou legenda
  | "setting" // configuração
  | "admin-action" // ação administrativa
  | "message" // mensagem operacional relevante
  | "expert"; // especialista de IA

export interface FeatureHelpDefinition {
  /** Identificador ESTÁVEL. Novas entradas: `modulo.tela.elemento` (minúsculas, hífens, pontos). Ids legados são preservados. */
  id: string;
  title: string;
  /** Texto curto do tooltip de hover (uma frase). */
  shortDescription: string;
  /** O que é (texto principal do popover). */
  description: string;
  // ---- campos legados ----
  uses?: string[];
  result?: string;
  humanReview?: string;

  // ---- campos do sistema universal (todos opcionais; omitir o que não se aplica) ----
  kind?: HelpElementKind;
  /** Módulo do ACC (ex.: "dashboard", "planejamento", "juridico", "ssma", "engenharia", "comercial", "experts-ia", "admin"). */
  module?: string;
  /** Para que serve. */
  purpose?: string;
  /** Como utilizar (passos). */
  howToUse?: string[];
  /** Como funciona internamente. */
  howItWorks?: string;
  /** Dados que utiliza. */
  data?: string[];
  /** Critérios que aplica (inclusão/exclusão, regras). */
  criteria?: string[];
  /** Fórmula REAL empregada (indicadores). */
  formula?: string;
  /** Fonte de dados consultada (tabela, serviço, arquivo). */
  source?: string;
  /** Unidade e período de referência (indicadores). */
  unit?: string;
  /** Frequência/forma de atualização. */
  refresh?: string;
  /** Tratamento de dado ausente. */
  missingData?: string;
  /** Consequências da ação / do dado. */
  consequences?: string[];
  /** Permissões exigidas. */
  permissions?: string;
  /** Limitações conhecidas. */
  limitations?: string[];
  /** Vigência/diferença entre a regra aprovada e a configuração publicada (obrigatório quando houver divergência). */
  validity?: string;
  /** Versão do texto (semver simples ou data AAAA-MM-DD) — alterar sempre que o conteúdo mudar de sentido. */
  version?: string;
}

/** Alias semântico: toda entrada do catálogo universal. */
export type HelpEntry = FeatureHelpDefinition;

/** Elemento inventariado de uma tela (manifesto por módulo). É a lista AUTORITATIVA usada na cobertura. */
export interface HelpManifestElement {
  /** Rota real do app (ex.: "/[projectId]/dashboard"). */
  route: string;
  /** Aba/subaba quando aplicável. */
  tab?: string;
  kind: HelpElementKind;
  /** Rótulo visível do elemento (como aparece na tela). */
  label: string;
  /** helpId que documenta o elemento; ausente => lacuna (precisa de `gap` ou `exempt`). */
  helpId?: string;
  /** Lacuna conhecida (motivo e providência). */
  gap?: string;
  /** Isenção justificada (ex.: puramente decorativo ou coberto por outro helpId da mesma tela). */
  exempt?: string;
}

export interface HelpManifest {
  module: string;
  /** Rotas do módulo inventariadas (todas as page.tsx pertencentes ao módulo). */
  routes: string[];
  elements: HelpManifestElement[];
}
