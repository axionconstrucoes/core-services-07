# AI Experts do ACC — Arquitetura e Experts Oficiais

Este documento descreve a fundação técnica dos **AI Experts** do AXION
Acompanhamento de Contratos (ACC): a arquitetura de código em
`apps/web/lib/ai/`, distinta das skills interativas do Claude Code
descritas em `docs/ai/specialist-framework.md` (aquelas guiam análises
feitas *com* Claude Code por um humano; estas são um subsistema do
próprio produto ACC, pensado para eventualmente rodar de forma
autônoma/assistida dentro da aplicação).

Todas as regras comuns de `docs/ai/specialist-framework.md` (decisão
final humana, cadeia de análise, anti-alucinação, farol, controle de
ruído) valem integralmente para os AI Experts também — este documento
não as repete, apenas descreve como elas são aplicadas em código.

## 1. Experts oficiais do ACC

| # | Expert | ID técnico | Status |
| - | ------ | ----------- | ------ |
| 1 | CEO IA | `ceo` | **Implementado** — consolidação executiva (`experts/ceo/consolidate.ts`) e consulta conversacional (`experts/ceo/query.ts`) |
| 2 | **Diretor Comercial IA** | `commercial-director` | **Implementado (v2)** |
| 3 | Consultor Jurídico IA | `legal-consultant` | **Implementado** — `answerLegalConsultantQuery` (`experts/legal-consultant/query.ts`) |
| 4 | Diretor de Planejamento IA | `planning-director` | **Implementado (v6)** — painel `experts-ia/diretor-planejamento` e `answerPlanningDirectorQuery` (`experts/planning-director/query.ts`) |
| 4-A | Diretor de Engenharia e Construção IA | `engineering-director` | **Implementado (v1)** — painel `experts-ia/diretor-engenharia` e `answerEngineeringDirectorQuery` (`experts/engineering-director/query.ts`) |
| 5 | **Diretor de ESG IA** | `esg-director` | **Implementado (v1)** — ver `docs/esg-obligations.md` |

Os cinco Experts oficiais (seis com o CEO; ver "Lote 4" no fim deste documento) estão todos em `ExpertId`
(`apps/web/lib/ai/types.ts`, a união operacional) e têm
`identity.ts`/`query.ts`/`index.ts` reais — nenhum é mais "sugerido"
apenas no catálogo formal (introduzidos no commit "feat: add Claude
multi-expert curation", junto com a fundação de curadoria multiagente da
seção 20). O que ainda não existe para os quatro além do Diretor
Comercial IA é uma tela dedicada de consulta em lote na UI — a consulta
conversacional (seção 13) e a curadoria multiagente (seção 20) já os
alcançam de fato.

> Um Expert chamado "Advogado Especialista em Contratos"
> (`contract-lawyer`) chegou a ser implementado e foi **removido por
> decisão de produto** antes de qualquer publicação — não faz parte da
> lista oficial acima e não deve ser recriado sob esse nome.

> **Frente P3 (2026-11-20).** Até a v5, `planning-director` se apresentava como "Diretor de
> Engenharia IA" e acumulava engenharia. Agora há seis Experts oficiais: Planejamento
> (`planning-director`: cronograma, CPM, folgas, curva S, atrasos, recuperação, 4D) e Engenharia e
> Construção (`engineering-director`: fundações, estruturas, pisos, coberturas, métodos construtivos,
> construtibilidade, engenharia de valor, compatibilização, análise técnico-econômica) são
> independentes; nenhum responde pelo outro. Provider próprio: `AXION_AI_PROVIDER_ENGINEERING_DIRECTOR`.
>
> - **Framework comum no runtime:** o conteúdo essencial de `specialist-framework.md` está em
>   `apps/web/lib/ai/specialist-framework.ts` e entra no prompt de todos os Experts técnicos (nos
>   `identity.ts`; para prompts mantidos por outra frente, o `anthropic-provider` garante a inclusão
>   única pelo marcador). A AXIA não recebe este framework.
> - **Conhecimento técnico das skills:** `apps/web/lib/ai/expert-knowledge/planning.ts` e
>   `engineering.ts` são RESUMOS PRÓPRIOS (paráfrase), versionados, com procedência (nome da skill,
>   sha256 do SKILL.md lido, data). O texto original das skills não está no repositório; a skill
>   original só existe no ambiente Claude Code local. Estado em `requested-skills.ts`:
>   `RUNTIME_SUMMARY_INTEGRATED` (nunca "instalada no ACC").
> - **Roteamento área/assunto** (fonte única `apps/web/lib/ai/routing/expert-topics.ts`):
>   Planejamento→`planning-director`; Engenharia→`engineering-director`; Jurídico→`legal-consultant`;
>   Comercial/Financeiro/Orçamento→`commercial-director`; SSMA/ESG→`esg-director`; multidisciplinar→
>   curadoria multi-Expert (um parecer por Expert + consolidação CEO IA com autoria, divergências e
>   incertezas). Vale para CONSULTAR IA (especialidade "Geral (pelo assunto)"), ESPECIALISTA do caso de
>   risco (inclusive no ciclo do worker) e curadoria. A AXIA nunca participa; o ESPECIALISTA não altera
>   estado, responsável, SLA nem escalonamento.
> - **Limite de IA em todos os caminhos** (migration `20261120170000`): painéis (`EXPERT_PANEL`),
>   curadoria (`CURATION`, 1 unidade por Expert chamado — cada especialista e a consolidação CEO) e
>   ESPECIALISTA do ciclo (`RISK_CYCLE`, variante `ai_consult_reserve_for_actor` só para service_role,
>   com o usuário que perguntou). Mesma contagem por usuário (todas as obras) e por obra; reserva sempre
>   ANTES do provedor; sem reserva, nenhuma chamada. `ai_consult_usage.expert_id` registra o Expert.
> - **Governança N6** (migration `20261121150000`, ver `docs/ai/governanca-consumo-ia.md`): a unidade passou a
>   ser reservada na **fronteira do provedor** (`lib/ai/governance/quota-gated-provider.ts`), depois dos guards
>   determinísticos — recusa antes do provedor (MPP ausente, contrato ilegível, validação) não consome, sem
>   estorno. Curadoria de adicional (`CURATION`) e curadoria automática (`AUTOMATIC_CURATION`, service_role com
>   solicitante explícito) passaram a reservar. Orçamento monetário preparado e **desligado**
>   (`docs/ai/orcamento-monetario-ia.md`).

## 2. Por que esta arquitetura existe

O objetivo é permitir adicionar os próximos Experts oficiais (tabela
acima) sem duplicar código de contexto, validação, provider ou
auditoria. Nenhum prompt grande fica solto dentro de componentes React —
toda instrução versionada vive em
`apps/web/lib/ai/experts/<expert>/identity.ts`.

## 3. Estrutura de diretórios

```
apps/web/lib/ai/
├── types.ts                      # ExpertAssessment e tipos genéricos da saída estruturada
├── index.ts                      # ponto único de import (barrel)
├── expert-query-action.ts        # Server Action "use server" da consulta conversacional (askCommercialDirectorAction)
├── context/
│   ├── types.ts                  # EventAnalysisContext, ProjectAnalysisContext e tipos relacionados
│   ├── build-event-context.ts    # context builder somente-leitura, escopo EVENT (genérico, reutilizável)
│   └── build-project-context.ts  # context builder somente-leitura, escopo PROJECT (genérico, reutilizável)
├── providers/
│   ├── types.ts                  # interface AiProvider (genérica) — generateAssessment + answerQuery
│   ├── fake-provider.ts          # provider determinístico genérico (default desta fase)
│   └── get-ai-provider.ts        # seleção fail-closed via AXION_AI_PROVIDER
├── schemas/
│   ├── primitives.ts             # primitivas de validação reutilizadas por todo validador
│   └── validate-expert-assessment.ts  # validação/normalização da parte genérica da saída (análise em lote)
├── query/
│   ├── types.ts                  # ExpertQueryScope/Request/Response (consulta conversacional)
│   └── validate-expert-query-response.ts  # validação da resposta de consulta
├── legal/
│   └── types.ts                  # LegalSource/LegalCitation — preparação, sem corpus real (ver seção 16)
└── experts/
    └── commercial-director/
        ├── identity.ts                    # nome, id, versão, instruções versionadas
        ├── types.ts                       # CommercialDirectorAssessment (schema específico da análise em lote)
        ├── schema.ts                      # validação da parte específica (negotiation)
        ├── fake-negotiation-analysis.ts   # derivação determinística de `negotiation` p/ o fake provider
        ├── fake-query-enrichment.ts       # derivação determinística de draft/práticas p/ resposta de consulta
        ├── query.ts                       # answerCommercialDirectorQuery() — consulta conversacional
        └── index.ts                       # runCommercialDirectorExpert() — análise em lote

apps/web/lib/event-notes.ts         # data layer de "Anotações do Evento" (getEventNotes)
apps/web/components/ai/expert-query-panel.tsx      # UI "Perguntar ao Diretor Comercial IA"
apps/web/components/ledger/event-notes-section.tsx # UI "Anotações do Evento"
apps/web/components/ledger/event-note-form.tsx     # formulário de nova anotação
apps/web/app/[projectId]/ledger/[eventId]/event-notes-actions.ts  # Server Action de criação de anotação
```

Harnesses de linha de comando (somente leitura):
`scripts/analyze-event-with-commercial-director.mjs` (análise em lote) e
`scripts/query-commercial-director.mjs` (consulta conversacional, escopo
PROJECT ou EVENT).

Testes: `scripts/test-ai-foundation.mjs` (fundação genérica),
`scripts/test-commercial-director-expert.mjs` (análise em lote),
`scripts/test-expert-query.mjs` (consulta conversacional) e
`scripts/test-event-notes.mjs` (Anotações do Evento) — ver seção 15.

### Genérico vs específico — onde cada coisa vive

A fundação genérica (`types.ts`, `context/`, `providers/`, `schemas/`)
**nunca** conhece um Expert específico. Isso já foi corrigido uma vez
nesta fase: a primeira versão do `fake-provider.ts` tinha o nome/id do
Expert então em desenvolvimento hardcoded dentro do provider "genérico"
— um provider genérico de verdade nunca deve saber qual Expert o está
chamando; ele só usa o que vem em `AiProviderRequest` (`expertId`,
`expertName`, `analysisType`, etc.). Qualquer novo Expert reutiliza a
fundação sem precisar alterá-la.

Lógica de derivação determinística *específica* de um Expert (como
`fake-negotiation-analysis.ts` do Diretor Comercial IA) vive dentro da
pasta do próprio Expert, nunca dentro de `providers/fake-provider.ts`.

### Como o harness Node importa TypeScript sem mudar tsconfig.json

Os módulos de `apps/web/lib/ai/**` usam imports relativos **sem
extensão** (`from "./fake-provider"`), exatamente como o resto do
projeto sob o bundler do Next.js. O Node puro, ao contrário do bundler,
exige o especificador de módulo completo — por isso os harnesses/testes
registram um pequeno loader ESM (`scripts/ts-module-resolver.mjs`, via
`node:module`'s `register()`) que tenta de novo com `.ts` quando a
resolução falha, e usam `import()` dinâmico *depois* do `register()`
para os módulos de `apps/web/lib/ai/**` (imports estáticos são
resolvidos antes do corpo do módulo executar, então `register()` teria
que já estar ativo antes disso).

Uma alternativa considerada foi adicionar `.ts` explícito nos imports
relativos do próprio código-fonte + `allowImportingTsExtensions: true`
no `tsconfig.json` de `apps/web`. Essa alternativa foi revertida nesta
correção: exigiria espalhar extensões `.ts` (uma convenção nova, só
usada nesses arquivos) por toda a fundação, além de uma mudança de
compilador que afeta o projeto inteiro para resolver um problema que só
existe nos harnesses standalone. O loader mantém o código-fonte
100% consistente com o resto do projeto e isola a peculiaridade do Node
puro nos dois pontos que realmente precisam dela.

## 4. Diretor Comercial IA (`commercial-director`)

- **Nome**: Diretor Comercial IA
- **ID técnico**: `commercial-director`
- **Versão atual**: `v1`
- **Status**: primeiro AI Expert oficial implementado do ACC.

### Missão

Apoiar decisões e negociações comerciais relacionadas aos contratos e
projetos: estratégia de negociação, posição atual/desejada, pontos
negociáveis/não negociáveis, concessões, contrapartidas, cenários,
prioridades, riscos comerciais, impactos financeiros/de prazo/
contratuais, preparação para reuniões, argumentos e sua ordem, objeções
prováveis do cliente e respostas sugeridas, propostas/contrapropostas,
condições comerciais, respostas a pleitos, aditivos, alterações de
escopo, preço, medição, retenção, reajuste, multas, garantias, prazo e
formas de pagamento (ver `identity.ts` para o texto completo das
instruções).

Nunca inventa limite econômico, margem, preço, autorização ou condição
que não exista nas fontes — quando ausente, declara explicitamente
"Necessária definição humana." (ver seção 6).

### Capacidade de redação

Pode produzir rascunhos completos (e-mails, propostas, contrapropostas,
respostas comerciais, cartas, pautas de reunião, roteiros de negociação,
memorandos, minutas comerciais, textos para aditivos, solicitações de
informação, respostas a pleitos) — sempre em
`negotiation.draftCommunication`, sempre com
`status: "DRAFT_PENDING_REVIEW"`. Nunca envia nada automaticamente.

## 5. Fontes autorizadas

O Expert só recebe o que o context builder (genérico, reutilizado sem
alteração) monta a partir das tabelas reais do projeto:
`contract_events`, `event_evidence`, `clauses` (via
`event_clause_confrontation_candidates` e `event_cross_references`),
`document_versions`/`documents` e `emails`. Nenhum outro conhecimento é
injetado no contexto.

Distinção obrigatória em toda saída:

- **FATO** → `finding.facts` (sempre com `evidenceRefs`/`contractualBasis`
  correspondente).
- **INTERPRETAÇÃO** → `finding.interpretation`.
- **SUGESTÃO** → `recommendedActions` e os campos de `negotiation`.

## 6. Saída estruturada

### Genérica (`ExpertAssessment`, `apps/web/lib/ai/types.ts`)

```
expertId, expertName, expertVersion, analysisType,
finding { facts[], interpretation },
severity (LOW|MEDIUM|HIGH|CRITICAL),
confidence (0..1),
executiveSummary, contractualBasis[], eventBasis[], evidenceRefs[],
possibleImpacts[], recommendedActions[], uncertainties[],
requiresHumanReview (sempre true nesta fase)
```

### Específica do Diretor Comercial IA (`CommercialDirectorAssessment`,
`experts/commercial-director/types.ts`) — estende a genérica com:

```
negotiation: {
  negotiationObjective, currentPosition, targetPosition,
  minimumAcceptablePosition: CommercialFieldValue<string>,
  nonNegotiableItems[], negotiableItems[], possibleConcessions[],
  requiredCounterparts[], counterpartyLikelyInterests[],
  recommendedStrategy, arguments[], anticipatedObjections[],
  suggestedResponses[], recommendedSequence[], commercialRisks[],
  financialImpact | scheduleImpact | contractualImpact: CommercialImpactAssessment,
  draftCommunication: CommercialDraftCommunication | null,
}
```

`CommercialFieldValue<T>` é um tipo com três estados explícitos —
`AVAILABLE` (com `value`+`basis` obrigatórios), `UNAVAILABLE` e
`REQUIRES_HUMAN_DEFINITION` (ambos com `value`/`basis` sempre `null`).
Usado em `minimumAcceptablePosition`: nunca um valor econômico solto.

`CommercialImpactAssessment` segue o mesmo princípio para impacto
financeiro/prazo/contratual — `estimatedValue` só pode ser não-nulo
quando `status` é `AVAILABLE` (validado, nunca só por convenção).

`CommercialDraftCommunication.status` é travado em
`"DRAFT_PENDING_REVIEW"` — o validador rejeita qualquer outro valor,
igual ao tratamento de `requiresHumanReview`. É a garantia em nível de
tipo/validação de que nenhuma comunicação é considerada enviada.

Nenhuma saída textual livre é aceita como resposta única.

## 7. Limites de autoridade

```
IA ANALISA → IA SUGERE → IA PODE REDIGIR A MINUTA →
HUMANO REVISA/EDITA → HUMANO APROVA OU REJEITA →
SISTEMA EXECUTA SOMENTE O QUE FOI AUTORIZADO
```

O Diretor Comercial IA PODE: sugerir decisão, sugerir aprovação, sugerir
rejeição, recomendar ação, criar estratégia, preparar textos.

NÃO PODE: aprovar sua própria recomendação, enviar e-mail autonomamente,
assumir compromisso pela AXION, alterar contrato, aceitar proposta,
conceder desconto, criar obrigação vinculante, ou alterar estado
definitivo sem decisão humana. `requiresHumanReview` é sempre `true`
nesta versão.

## 8. Provider abstraction

`apps/web/lib/ai/providers/types.ts` define a interface `AiProvider`.
Nenhum Expert conhece Anthropic/OpenAI/Gemini diretamente.

Seleção via `getAiProvider()` (`providers/get-ai-provider.ts`), controlada
pela variável de ambiente `AXION_AI_PROVIDER` (mesmo padrão de
`AXION_EMAIL_PROVIDER` já usado no projeto):

- Ausente ou `"fake"` → `FakeAiProvider` (determinístico, sem rede, sem
  custo, genérico — ver seção 3).
- `"anthropic"` → `AnthropicAiProvider` (primeiro provider real, ver
  `docs/ai/anthropic-provider.md`) — **restrito ao Diretor Comercial IA
  nesta fase**, mesmo que `AXION_AI_PROVIDER=anthropic` esteja
  configurado globalmente (qualquer outro Expert é rejeitado em
  runtime, fail closed).
- `openai|gemini` → falha fechado explicitamente ("ainda não
  implementado nesta fase").
- Qualquer outro valor → falha fechado.

Nenhuma chave de API existe no código. A configuração do
`AnthropicAiProvider` (chave, modelo) vem inteiramente de environment
variables server-side, nunca hardcoded, nunca no frontend — ver
`docs/ai/anthropic-provider.md`.

## 9. Context builder

`apps/web/lib/ai/context/build-event-context.ts` — somente leitura,
recebe `projectId`, `eventId` e opcionalmente `candidateId`. Genérico:
usado pelo Diretor Comercial IA sem nenhuma alteração, e reutilizável
por qualquer Expert futuro.

Ordem de prioridade: `Evento → Evidências → Cláusulas relacionadas →
Documentos fonte → E-mails`. Com `candidateId`, o contexto é restrito a
esse único candidato e sua cláusula (controle de token/custo).

## 10. Testes

- `scripts/test-ai-foundation.mjs` — genéricos: schema aceita saída
  válida; `confidence` fora de 0..1; `severity`/`analysisType`
  inválidos; `requiresHumanReview` não pode virar `false`/ficar ausente;
  `evidenceRefs` tipados; saída textual livre rejeitada; provider
  ausente/desconhecido falha fechado; fake provider é genérico (ecoa
  `expertId`/`expertName`/`analysisType` da requisição, nunca hardcoda);
  fake provider determinístico; context builder contra o evento de
  referência real não altera dados (completo e restrito a um candidato).
- `scripts/test-commercial-director-expert.mjs` — específicos: schema
  `negotiation` aceita saída válida; `minimumAcceptablePosition` nunca
  aceita valor sem `basis` nem valor quando não `AVAILABLE`;
  `financialImpact`/`scheduleImpact`/`contractualImpact` nunca aceitam
  `estimatedValue` fora de `AVAILABLE`; categoria de impacto não pode
  ser trocada; `draftCommunication` só aceita `DRAFT_PENDING_REVIEW`;
  execução real contra o evento de referência não altera candidatos nem
  envia nada.
- `scripts/test-expert-query.mjs` — consulta conversacional: schema de
  `ExpertQueryResponse`; `requiresHumanReview`/`confidence` inválidos
  falham; `contextoInternoDeclarado` só aceita `DECLARED_CONTEXT`;
  `praticasNegociais` só aceita os 4 `RequirementSourceKind`;
  `rascunhoSugerido` só aceita `DRAFT_PENDING_REVIEW`; `baseLegal` vazio
  é válido e origem legal desconhecida falha (nunca inventa fonte
  normativa); fake provider (`answerQuery`) determinístico; escopos
  DOCUMENT/EMAIL/MULTI_EXPERT falham fechado; pergunta vazia falha;
  consultas PROJECT e EVENT reais não alteram candidatos; pergunta
  "redija um e-mail" produz `rascunhoSugerido` `DRAFT_PENDING_REVIEW`.
- `scripts/test-event-notes.mjs` — Anotações do Evento: INSERT
  autenticado com EDITOR/autoria própria é aceito; tentativa de se
  passar por outro autor é bloqueada pela RLS; leitura retorna a
  anotação com autor correto; `EVENT_NOTE_CREATED` é registrado em
  `audit_log_entries`; anotação nunca aparece em `event_evidence`;
  context builder inclui a anotação como `USER_NOTE`/`DECLARED_CONTEXT`;
  candidatos de confrontação permanecem inalterados; a anotação de teste
  é removida ao final (limpeza via service role — o registro de
  auditoria permanece, correto e legítimo).

Nenhum teste executa write em dado produtivo além da única anotação de
teste (criada e removida dentro do próprio `test-event-notes.mjs`, sem
tocar nos 3 candidatos de confrontação do evento de referência).

## 11. Auditoria — desenho (não implementado nesta fase)

Nenhuma tabela nova foi criada e nenhum registro foi inserido em
`audit_log_entries` por esta fundação. Desenho para quando a auditoria de
execuções do Expert for implementada:

- `expert_id`, `expert_version` — rastreabilidade quando `identity.ts`
  mudar.
- `provider_id`, `model` — qual provider/modelo gerou a saída (`fake`
  por enquanto; `model` nulo até haver provider real).
- `timestamp`, `project_id`, `event_id`, `focus_candidate_id`.
- Evidências (`evidenceRefs`) usadas.
- `confidence`, `requires_human_review`.

Esse formato já existe como `CommercialDirectorRunResult.audit` (ver
`experts/commercial-director/index.ts`) — em memória, apenas impresso
pelo harness. Persistir isso exigirá uma migration nova e uma decisão de
produto sobre onde essa trilha aparece na UI — nenhuma das duas coisas
foi feita nesta fase.

## 12. O que falta para conectar um LLM real

1. ~~Implementar um provider real (ex.: `AnthropicAiProvider`)~~ — feito
   nesta fase, restrito ao Diretor Comercial IA. Ver
   `docs/ai/anthropic-provider.md` para configuração, saída estruturada,
   fail-closed, limites e o procedimento de live-test.
2. ~~Adicionar o(s) valor(es) do provider real a `getAiProvider()`~~ —
   feito (`AXION_AI_PROVIDER=anthropic`).
3. ~~Definir e documentar as environment variables necessárias~~ — feito
   (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS`,
   `ANTHROPIC_TIMEOUT_MS` — ver `docs/ai/anthropic-provider.md`).
4. Implementar a persistência de auditoria (seção 11) via migration
   nova — o metadata (`stopReason`, `usage`, `providerId`, `model`) já é
   capturado em memória (`CommercialDirectorRunResult.audit`/
   `CommercialDirectorQueryResult.audit`), só falta persistir.
5. ~~Expor a análise/consulta na UI~~ — feito: `ExpertQueryPanel`
   (`apps/web/components/ai/expert-query-panel.tsx`) está integrado à
   página do evento (escopo EVENT) e ao dashboard do projeto (escopo
   PROJECT), e agora mostra qual provider/modelo respondeu. Falta apenas
   expor a análise em lote (`runCommercialDirectorExpert`, distinta da
   consulta conversacional) na UI, se/quando fizer sentido.
6. Definir estratégia de custo/token para contextos maiores (ver seção
   14, "Seleção de contexto") — item 17 de `docs/ai/anthropic-provider.md`
   documenta a metadata de tokens já capturada, sem um sistema
   financeiro completo ainda.
7. ~~Conectar o `AnthropicAiProvider` aos próximos Experts oficiais~~ —
   feito: `ANTHROPIC_ALLOWED_EXPERT_IDS`
   (`apps/web/lib/ai/providers/anthropic-provider.ts`) já autoriza os
   cinco Experts oficiais (`commercial-director`, `esg-director`,
   `legal-consultant`, `planning-director`, `ceo`) — cada um só é
   efetivamente ativado quando sua própria variável de provider resolve
   para `"anthropic"` (nunca em bloco).
8. Implementar escopos DOCUMENT e EMAIL do `ExpertQueryScope`
   por-Expert (ver seção 13) — continuam falhando fechado
   explicitamente. `MULTI_EXPERT` como *valor de escopo passado a um
   único Expert* também continua não implementado — mas a síntese
   multiagente em si (vários Experts + CEO IA) já existe por outro
   caminho: a curadoria multiagente (`apps/web/lib/ai/curation/`, ver
   seção 20), que nunca passa `scope: "MULTI_EXPERT"` a nenhum Expert —
   ela chama cada um com `PROJECT`/`EVENT` normalmente e consolida as
   respostas ela mesma.
9. Ingerir um corpus normativo real (ver seção 16, "Base legal").
10. Conectar a curadoria multiagente (seção 20) a um gatilho automático
    (hoje só manual, a partir do Event Ledger) e a fontes além de EVENT
    (EMAIL/PROJECT já são aceitas por `CurationInput.sourceType`, mas só
    EVENT tem um gatilho de UI real).

## 13. Consulta conversacional aos Experts ("Perguntar ao Diretor Comercial IA")

Arquitetura em `apps/web/lib/ai/query/` — distinta da análise em lote
(`ExpertAssessment`, seção 6): a consulta responde a uma pergunta pontual
do usuário, com nomes de campo em português para exibição direta na UI
(`ExpertQueryResponse`, ver seção 14).

### Escopos (`ExpertQueryScope`)

| Escopo | Status nesta fase |
| --- | --- |
| `PROJECT` | **Implementado** — `buildProjectAnalysisContext` |
| `EVENT` | **Implementado** — `buildEventAnalysisContext` (reutilizado, sem alteração) |
| `DOCUMENT` | Tipado, **não implementado** — `answerCommercialDirectorQuery` falha fechado |
| `EMAIL` | Tipado, **não implementado** — falha fechado |
| `MULTI_EXPERT` | Tipado, **não implementado** — falha fechado (ver seção 17) |

`answerCommercialDirectorQuery` (`experts/commercial-director/query.ts`)
rejeita explicitamente qualquer escopo fora de `["PROJECT", "EVENT"]`
antes de tocar no banco — nunca simula suporte a um escopo inexistente.

### Fluxo

```
ExpertQueryRequest { scope, projectId, eventId?, question }
  → buildEventAnalysisContext / buildProjectAnalysisContext (reutilizados)
  → provider.answerQuery(...)                    (genérico — fake por default)
  → deriveFakeQueryEnrichment(...)                (específico do Expert — só quando provider="fake")
  → validateExpertQueryResponse(...)
  → ExpertQueryResponse
```

O enriquecimento específico (`fake-query-enrichment.ts`) decide, por uma
heurística simples de palavras-chave (verbo de redação + tipo de
documento citado na pergunta — ex.: "redija" + "e-mail"), se a resposta
deve incluir `rascunhoSugerido`. Não finge análise inteligente real: a
própria heurística e o conteúdo do rascunho deixam isso explícito no
texto gerado.

## 14. Estrutura da resposta de consulta (`ExpertQueryResponse`)

Definida em `apps/web/lib/ai/query/types.ts`, validada em
`query/validate-expert-query-response.ts` (reutiliza as primitivas de
`schemas/primitives.ts` — mesmas usadas por `validate-expert-assessment.ts`,
sem duplicar checagem de forma/tipo):

```
expertId, expertName, expertVersion, scope, question,
fatosDocumentados[],
contextoInternoDeclarado[]   (DeclaredContextItem — ver seção 15),
baseContratual[]             (ExpertContractualBasisRef, reaproveitado da fundação genérica),
baseLegal[]                  (LegalCitation — ver seção 16),
praticasNegociais[]          (ClassifiedStatement — ver seção 17),
interpretacao,
riscos[], severity,
recomendacoes[], acoesSugeridas[],
informacoesFaltantes[],
rascunhoSugerido: ExpertQueryDraft | null,
confidence, requiresHumanReview (sempre true)
```

`rascunhoSugerido.status` é travado em `"DRAFT_PENDING_REVIEW"` — o
validador rejeita qualquer outro valor (mesmo tratamento de
`requiresHumanReview` e de `CommercialDraftCommunication.status` na
análise em lote). Nenhum e-mail, proposta, contraproposta, carta,
notificação, resposta comercial, pauta, roteiro, memorando, solicitação
de esclarecimento ou texto de aditivo é considerado enviado — edição e
aprovação são sempre ações humanas futuras, fora deste módulo.

A UI (`ExpertQueryPanel`) exibe cada seção separadamente, em
português-BR, e traz um aviso fixo (`FlaskConical`, faixa vermelha)
deixando explícito que a resposta vem do provider de teste — nunca IA
real — enquanto `AXION_AI_PROVIDER` não apontar para um provider
implementado de fato.

## 15. Anotações do Evento (`event_notes`)

Migration: `supabase/migrations/20260822033339_event_notes_foundation.sql`
(nova tabela, RLS, trigger de auditoria — nenhuma migration antiga foi
alterada).

- **Tabela**: `id, event_id, author_user_id, category, text, created_at,
  updated_at`. `category` ∈ `CONTEXTO_OPERACIONAL | INFORMACAO_COMERCIAL |
  OBSERVACAO_JURIDICA | PLANEJAMENTO | FINANCEIRO | OUTROS`.
- **RLS**: SELECT para membros do projeto (`is_project_member`, via join
  em `contract_events`); INSERT exige `has_project_permission(...,
  'EDITOR')` **e** `author_user_id = auth.uid()` — impossível se passar
  por outro autor. Sem policy UPDATE/DELETE nesta fase (append-only;
  nenhum DELETE silencioso).
- **Auditoria**: trigger `AFTER INSERT` (`SECURITY DEFINER`, mesmo padrão
  de `audit_event_clause_confrontation_candidate_created`) grava
  `EVENT_NOTE_CREATED` em `audit_log_entries` automaticamente — nenhuma
  Server Action duplica essa lógica.
- **UI**: seção "Anotações do Evento" na página do evento
  (`EventNotesSection` + `EventNoteForm`), com aviso "Informação
  declarada internamente" e visual propositalmente distinto (âmbar,
  borda tracejada) de evidência/documento/e-mail/cláusula.

### Declared context x evidence

Uma anotação **nunca** é fato documental. No context builder
(`build-event-context.ts`), cada anotação vira um `ContextEventNote`
com `sourceType: "USER_NOTE"` e `evidentialStatus: "DECLARED_CONTEXT"` —
campos fixos, não inferidos, para que nenhum consumidor (Expert ou UI)
confunda anotação com evidência. Nunca é gravada em `event_evidence`.

Quando uma resposta (análise em lote ou consulta) usa uma anotação, ela
aparece em `contextoInternoDeclarado`/como fato "declarado" — nunca
misturada aos fatos confirmados documentalmente (`fatosDocumentados` cita
a anotação como tal, nunca como se fosse evidência). Exemplo (ver
`fake-provider.ts`):

```
Contexto informado internamente: [texto da anotação]
Status: informação declarada por usuário; não confirmada
documentalmente no contexto atualmente recuperado.
```

## 16. Base legal (preparação, sem corpus real)

`apps/web/lib/ai/legal/types.ts` — `LegalSource`, `LegalCitation`,
`LEGAL_SOURCE_UNAVAILABLE_NOTICE`. **Nenhum artigo de lei está hardcoded
em lugar nenhum do projeto.** Fonte inicial prevista (não ingerida):
Código Civil brasileiro.

Enquanto não houver corpus normativo versionado, `baseLegal` é sempre
`[]` e `informacoesFaltantes` sempre inclui a notice padrão — nunca
memória geral do LLM tratada como fonte legal oficial. A estratégia de
ingestão/versionamento/citação futura está documentada como comentário
no próprio `legal/types.ts` (tabela dedicada, dispositivo com vigência
explícita, retrieval com o mesmo controle de volume do context builder).

## 17. Práticas negociais x obrigação jurídica

`RequirementSourceKind` (`query/types.ts`): `LEGAL_REQUIREMENT |
CONTRACTUAL_REQUIREMENT | NEGOTIATION_PRACTICE | AI_RECOMMENDATION`.
Toda afirmação relevante do Diretor Comercial IA sobre "o que fazer" ou
"o que é exigido" deve vir classificada em `praticasNegociais` com um
destes quatro valores — o validador rejeita qualquer outro. Nunca
apresentar `NEGOTIATION_PRACTICE` como se fosse `LEGAL_REQUIREMENT` ou
`CONTRACTUAL_REQUIREMENT` (mesmo princípio da seção 3.3 de
`docs/ai/specialist-framework.md`, aplicado em tipo/validação aqui).

## 18. Contexto histórico do projeto — fontes já disponíveis vs futuras

Antes de qualquer trabalho nesta fase, mapeamos o que já existe
realmente no banco/aplicação (nunca presumido):

**Já disponíveis e usadas pelo context builder:**
`contract_events`, `event_evidence`, `event_categories`,
`event_cross_references`, `event_clause_confrontation_candidates`,
`clauses`, `document_versions`/`documents` (contrato, aditivo, edital,
RFI/RFP, proposta AXION, especificação, desenho, planilha, cronograma
baseline/revisão, relatório semanal — ver `DocumentKind` em
`packages/types`), `emails`, `event_notes` (novo nesta fase),
`schedule_activities`/`schedule_versions` (cronogramas — hoje só
consumidos fora do context builder, em `apps/web/lib/data.ts`).

**FUTURE_SOURCE — mencionadas no pedido, sem tabela/integração real
hoje** (não inventadas, não simuladas):

- Atas de reunião — não há tabela dedicada; hoje só existiriam como
  `Document`/e-mail genérico, sem estrutura própria.
- Diários de obra — `SourceType` inclui `DIARIO_OBRA`, mas não há
  ingestão/tabela própria implementada.
- Pedidos de adicionais / Change Orders — `ContractChange` existe
  (`contract_changes`) mas não está conectado ao context builder ainda.
- Notificações e respostas a notificações formais — não modeladas como
  entidade própria (distintas de `Email`/`ActionRequest`).
- Medições e pagamentos — não há tabela própria; mencionados em texto
  livre de cláusulas/eventos.
- Revisões de desenho/especificação — não modeladas além do
  `DocumentKind` genérico (`DESENHO`, `ESPECIFICACAO`), sem histórico de
  revisão estruturado.
- Alterações de preço/prazo como entidade correlata (ver seção 19) —
  hoje só inferíveis manualmente a partir de eventos/cláusulas.

Nenhuma dessas fontes foi simulada ou parcialmente implementada só para
"parecer completo" — onde não existe dado real, o context builder
simplesmente não inclui o campo, e este documento registra a lacuna.

## 19. Alterações de projeto — estrutura de correlação (preparação)

Pedido: preparar a arquitetura para identificar correlações
`ALTERAÇÃO → ORIGEM → DATA → DOCUMENTO/E-MAIL/ATA → ESCOPO → PREÇO →
PRAZO → CLÁUSULA → EVIDÊNCIA → AÇÃO RECOMENDADA`, com atenção especial a
adicional, redução de escopo, Change Order, perda de produtividade,
remobilização, mudança de método, aumento de custo, atraso, impacto no
caminho crítico, necessidade de aditivo/comunicação formal.

Nesta fase, essa correlação **não ganhou tipo/tabela dedicados** — seria
prematuro modelar em cima de fontes que ainda são `FUTURE_SOURCE` (seção
18). O que já existe e cobre parcialmente o conceito:

- `ContractChange` (`contract_changes`) já tem `scheduleImpactStatus`
  (`PENDING_ASSESSMENT|NO_IMPACT|ABSORBABLE_WITHIN_CONTRACT_TERM|EXTENSION_REQUIRED`)
  e `technicalAdditionalDays` — ver `packages/types`.
- `event_clause_confrontation_candidates` já correlaciona evento →
  cláusula → evidência (`event_basis`, `clause_basis`) com severidade e
  confiança.
- A separação `TECHNICAL SCHEDULE IMPACT` x `CONTRACTUAL ENTITLEMENT TO
  TIME EXTENSION` já está normatizada em
  `docs/ai/specialist-framework.md` seção 3.10 e se aplica também ao
  Diretor Comercial IA (campo `negotiation.scheduleImpact`/
  `negotiation.contractualImpact`, seção 6).

Conectar isso a `ContractChange` de fato (context builder incluir
alterações de projeto como uma nova categoria de contexto) fica para uma
fase futura, quando `ContractChange` estiver integrado ao Event Ledger
de forma mais rica.

## 20. Curadoria multiagente — implementada, com gatilho manual no Event Ledger

A síntese multi-Expert descrita nesta seção **já existe** —
`apps/web/lib/ai/curation/` (introduzida no commit "feat: add Claude
multi-expert curation", junto com os cinco Experts oficiais completos).
Não usa `scope: "MULTI_EXPERT"` (esse valor de `ExpertQueryScope`
continua não implementado por-Expert, ver seção 13) — em vez disso, o
orquestrador chama cada Expert roteado individualmente com escopo
`PROJECT`/`EVENT` normal e consolida as respostas ele mesmo:

```
SOURCE (evento/e-mail/projeto)
  ↓
ROUTER determinístico (route-experts.ts, nunca IA decidindo quem consultar)
  ↓
SPECIALIST(S) roteados (answerXQuery de cada Expert — reaproveitado,
nunca reimplementado; "ceo" nunca entra aqui como especialista)
  ↓
normalização das posições (AiProviderExpertPosition)
  ↓
CEO IA consolida (runExecutiveCuration → ExecutiveCuration)
  ↓
revisão humana (requiresHumanReview sempre true)
```

Máximo uma rodada de especialistas + uma consolidação CEO por execução
(`run-multi-expert-curation.ts`) — nunca uma conversa infinita
agente↔agente. `expertResults` reflete exatamente quem o roteador
selecionou, nunca inclui um Expert não consultado.

### Gatilho manual (Event Ledger)

A única forma de disparar isto em produção hoje é **manual e
controlada**: o botão "Executar análise multiagente" na página do
evento (`RunMultiExpertCurationButton` +
`runMultiExpertCurationAction`,
`apps/web/app/[projectId]/ledger/[eventId]/run-multi-expert-curation-actions.ts`),
visível e autorizado só para GERENTE/GESTOR/ADMINISTRADOR (revalidado no
servidor, nunca só escondido na UI). `CurationInput.description` é
sempre o título+descrição REAIS já registrados no evento — nunca um
texto inventado só para este gatilho. Nenhuma execução automática:
sem scheduler, sem gatilho por criação de evento, sem reexecução.

Cada execução grava **uma** linha em `audit_log_entries`
(`persistCurationAudit`, `action: "AI_MULTI_EXPERT_CURATION_CREATED"`,
`entity_type: "CONTRACT_EVENT"`) com projeto, evento, usuário que
iniciou (`actor_user_id`), data/hora (`occurred_at`), tema roteado,
Experts consultados, severidade consolidada, situação, divergências,
recomendação do CEO IA e as decisões humanas necessárias — tudo dentro
de `detail` (nenhuma tabela nova foi criada; `audit_log_entries.detail`
já suporta isso, mesmo padrão já usado por
`apps/web/lib/ai/experts/planning-director/apply-schedule-delay-assessment.ts`
para resultado de Expert sem coluna dedicada). O resultado nunca é
tratado como decisão — é sempre exibido como análise sujeita a revisão
humana, e nenhuma ação (SLA, evento, e-mail) é criada automaticamente a
partir dele.

### O que ainda não existe

- Gatilho automático (por criação de evento, por e-mail recebido, por
  agendamento) — continua deliberadamente fora de escopo.
- Fontes além de EVENT com UI real — `CurationInput.sourceType` aceita
  `EMAIL`/`PROJECT`, mas só EVENT tem um botão de disparo hoje.
- Conexão a qualquer execução automática de recomendação — o resultado
  nunca cria `sla_actions`/eventos/e-mails sozinho.

## Lote 4 — Especialistas de IA e governança (homologação local, 21/11/2026)

Estado: **TESTADO LOCALMENTE** (PostgreSQL 17 real em 127.0.0.1:55434 + testes de código). Nada foi aplicado ao
Supabase operacional; as tabelas de uso/orçamento/auditoria de IA **não existem** no banco operacional — tudo abaixo vale
só localmente até a publicação das migrations. Relatório com a matriz Expert × critério:
`axion-backups/homologacao/lote4-relatorio.md`.

### Os seis Experts (independentes)

| Expert | ID | Áreas (expertForArea) | Assuntos (expert-topics.ts) |
|---|---|---|---|
| Diretor de Planejamento IA | `planning-director` | PLANEJAMENTO | prazo, MPP, cronograma, caminho crítico, folga, curva S, atraso, recuperação, 4D |
| Diretor de Engenharia e Construção IA | `engineering-director` | ENGENHARIA | fundações, estruturas, pisos, coberturas, métodos construtivos, construtibilidade, compatibilização |
| Consultor Jurídico IA | `legal-consultant` | JURIDICO | contrato, cláusula, obrigação, multa, notificação, aditivo, pleito |
| Diretor Comercial IA | `commercial-director` | COMERCIAL, FINANCEIRO, ORCAMENTO | custo, preço, medição, pagamento, orçamento, BDI |
| Diretor de ESG IA (SSMA/ESG) | `esg-director` | ESG_SSMA | segurança, meio ambiente, acidente, EPI, licença ambiental |
| CEO IA (Gestão Executiva) | `ceo` | — (só por tema múltiplo ou escolha explícita) | síntese multi-Expert |

Cada um tem identidade/instruções próprias, provedor próprio (`AXION_AI_PROVIDER_<EXPERT>`), fontes autorizadas,
limitações e regras de escalonamento (`expert-definitions/`), o Framework Comum (fato × inferência × informação ausente
× recomendação; proibido inventar fonte) e `requiresHumanReview: true` literal na resposta validada. Roteamento:
Administrativo/Diretoria/Compras não pré-selecionam ninguém; sem tema e sem área → revisão humana
(`EXPERT_SELECTION_REVIEW_REQUIRED`), nunca "default Planejamento"; a AXIA nunca é destino.

### Correções do Lote 4

- **Grounding no Diretor de ESG IA.** O rascunho de comunicação de um provedor real passava sem o guardrail de grounding
  (os outros quatro Experts de consulta já o aplicavam). `experts/esg-director/query.ts` agora aplica o mesmo guardrail
  (`validateDraftGrounding` / correção segura / supressão) e expõe `audit.grounding`, `audit.usage` e `audit.stopReason`.
- **Trilha de auditoria de cada consulta** (migration `20261121174000_ai_consult_audit`, `lib/ai/governance/consult-audit.ts`):
  `ai_consult_usage` só dizia quem/obra/tipo/assunto/Expert/dia; faltavam pergunta, fontes, resultado e tokens.
  Nova tabela `ai_consult_audit` (somente acréscimo; sem INSERT/UPDATE/DELETE para `authenticated`; RLS: o autor vê a
  própria, ADMINISTRADOR da obra vê as da obra; `anon` sem acesso) gravada por `ai_consult_audit_record` (sessão) e
  `ai_consult_audit_record_for_actor` (service_role; só `RISK_CYCLE`/`AUTOMATIC_CURATION`), ambas `SECURITY DEFINER`,
  `search_path = ''`, vínculo ATIVO exigido. Registra: usuário, obra, Expert, tipo, pergunta (até 4.000 car.), fontes
  (**identificadores**, nunca o texto do documento), severidade, confiança, resumo do resultado (contagens), provedor,
  modelo, tokens (nulos quando o provedor não informa — nunca inventados) e custo estimado (nulo enquanto
  `estimated_cost_per_call_usd` não estiver configurado). Gravação **depois** da chamada ao provedor (resposta ou erro
  `PROVIDER_ERROR`); falha da auditoria nunca descarta a resposta já gerada. O sink é anexado à função de reserva
  (`withAuditSink`) em cada caminho: painéis (Comercial, Engenharia, ESG, Planejamento, Jurídico, Comercial estratégico),
  CONSULTAR IA de alerta/risco, curadorias (Event Ledger, Adicionais, pré-contratual) e ciclo de risco.
  Pendente: consulta SSMA do registro de campo (`ssma-consult.ts`) mantém só a trilha de uso (kind `SSMA`).
- **Curadoria automática de fonte do cliente** (`runAutomaticCurationForClientSource`): **não há chamador em produção**
  hoje; a função recusa chamar a IA sem solicitante e sem reserva (falha fechada).

### Gestão Executiva (CEO) e curadoria

A curadoria roda cada Expert uma vez (reserva própria), guarda **um parecer por Expert** (autoria, severidade,
incertezas) e a consolidação do CEO IA (divergências, recomendação, decisões humanas necessárias). Nada é executado:
os módulos `experts/ceo`, `curation`, `alert-consult`, `governance`, `routing` não têm escrita em tabela de
evidência/documento/e-mail (teste estático em `scripts/test-lote4-experts.mjs`); a única escrita é a linha de
`audit_log_entries` da curadoria (cliente admin explícito).

### Comercial × Orçamentos — pendências (nada foi inventado nem preenchido com zero)

| # | Pendência | Evidência | Efeito hoje |
|---|---|---|---|
| P-COM-01 | **Fonte de Orçamentos ausente** (custos diretos/indiretos, BDI, margem, contingências, premissas, produtividade, alternativas de engenharia: `presence: "NAO"`; orçamento-base e preço de venda: `PARCIAL` — só metadados do arquivo) | `lib/commercial/inventory.ts` | O Diretor Comercial IA devolve recomendação **condicionada**, com pedidos a Orçamentos; nenhuma concessão é declarada economicamente aceitável (`test-commercial-director-strategy`) |
| P-COM-02 | **Valor do contrato fixo R$ 33.450.000** (cláusula 5.1 do contrato WEG) no dashboard, usado para calcular "Aditivos" de **qualquer** obra | `app/[projectId]/dashboard/page.tsx` (`dashboardBaseContractValue`) | Painel Aditivos pode ficar incorreto fora da WEG. **Não** chega a nenhum Expert (teste: o literal só existe nesse arquivo). Correção exige campo estruturado de valor do contrato por obra |
| P-COM-03 | **Contexto comercial**: não há valor global estruturado do contrato (`CONTRATO_BASE`: "Não há valor global do contrato em campo estruturado") | `lib/commercial/inventory.ts` | O Expert declara a informação ausente; o loader não preenche valor |
| P-COM-04 | Integração com o Sistema de Orçamentos (arquitetura futura) | CLAUDE.md | Quando existir, ligar como fonte `AVAILABLE` em `ORCAMENTO_BASE_E_REVISOES`/`CUSTOS_*` |

### Orçamento monetário de IA

**Desligado** (`ai_consult_budget_settings.enabled = false`, sem tetos, sem estimativa, sem `decision_reference`; o banco
recusa ligar sem decisão registrada). Nenhum código de produção lê ou liga essa tabela. Limites vigentes: 20/usuário/dia
(somando obras) e 100/obra/dia — **operacionais, não política aprovada**. Provado em PostgreSQL real
(`scripts/test-lote4-isolation-realpg.mjs`, cenários E1–E3, A1–A5) e por código (`scripts/test-lote4-experts.mjs`, 3.5–3.6).
