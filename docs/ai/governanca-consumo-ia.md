# Governança do consumo de IA dos Experts — frente N6

Data: 20/11/2026 · Branch: `feat/n6-governanca-ia` · Migration: `20261121150000_ai_consult_governance`
· Testes: `scripts/test-ai-governance-n6.mjs`, `scripts/test-ai-governance-n6-sql.mjs`

> Nada publicado. Migration só local (replay em PGlite). Limites vigentes (20 por usuário/dia, 100 por obra/dia)
> **inalterados** — continuam sendo valores operacionais, não política aprovada pela Diretoria.

## 1. Regra

Toda chamada a um provedor de IA feita por um Expert (Comercial, Planejamento, Engenharia, Jurídico, ESG/SSMA e a
consolidação do CEO IA) consome **uma unidade** de `ai_consult_usage`, reservada no banco **imediatamente antes**
da chamada, pelo núcleo único `ai_consult_reserve_core` (trava usuário → obra, contagem por usuário somando todas
as obras e por obra, dia civil America/Sao_Paulo). Reserva recusada ou indisponível = o provedor **não** é chamado
(falha fechada). A AXIA não usa este limite (tem orçamento próprio, `axia_chat_budget`) e não chama Experts.

## 2. Política para recusas antes do provedor (estorno × mover a reserva)

**Decisão: mover a reserva para a fronteira do provedor; nenhum estorno.**

Antes, cada caminho reservava a unidade e só depois chamava `answerXQuery`; os guards determinísticos que vivem
dentro do Expert recusavam *depois* da reserva:

| Guard | Onde | Efeito antes da N6 |
|---|---|---|
| MPP ausente / não extraído (pergunta formal de prazo) | `planning-director/query.ts` | 1 unidade perdida; no ciclo de risco, **1 unidade por ciclo** até esgotar o limite do usuário |
| Contrato/minuta ilegível (`requireContractualDocuments`) | `legal-consultant/query.ts` | 1 unidade perdida |
| Pergunta vazia, escopo não implementado, `eventId` ausente | todos os `answerXQuery` | 1 unidade perdida |
| Pergunta SSMA longa demais | `ssma-consult.ts` | 1 unidade perdida |

Implementação: `withQuotaGate(provider, reserve)` / `gatedProviderForExpert(expertId, reserve, base?)`
(`apps/web/lib/ai/governance/quota-gated-provider.ts`) embrulham o provedor do Expert; cada `answerQuery`,
`generateAssessment` ou `consolidateExecutiveCuration` reserva antes de delegar. Os guards rodam antes do provedor,
portanto antes da reserva. Para SSMA (reserva feita por `lib/ssma`, fora desta frente) a validação de tamanho foi
antecipada em `app/ssma/consult-actions.ts`.

Por que não "reserva provisória + estorno":

- um estorno exige provar que o provedor não foi chamado; com a reserva na fronteira essa prova é estrutural (a
  reserva só existe se a chamada vai acontecer) — não há o que estornar;
- uma função de estorno executável pela sessão permitiria ao usuário devolver unidades já usadas (abuso); mesmo
  restrita a service_role e com teto diário, seria mais uma superfície a auditar;
- erro **depois** da chamada (rede, saída inválida, timeout) mantém a unidade — a chamada pode ter sido cobrada.

Custo do "mover": os guards e a montagem de contexto (leituras no banco, sem efeito colateral) passam a rodar antes
da reserva. Para que quem já esgotou o limite não force essas leituras em repetição, as telas fazem antes a
**pré-verificação somente leitura** `ai_consult_precheck(p_project_id)` (sessão; não grava; não substitui a reserva).

Tentativas de abuso testadas (`test-ai-governance-n6.mjs`):

| Tentativa | Resultado |
|---|---|
| repetir 30× pergunta formal de prazo sem MPP no ciclo de risco | 0 unidades, 0 chamadas |
| provocar erro do provedor depois da chamada para "recuperar" a unidade | unidade permanece; não existe API/RPC de estorno (verificado no TS e no banco) |
| insistir depois da recusa do limite | nenhuma tentativa chega ao provedor |
| reserva indisponível (exceção) | falha fechada, provedor não chamado |
| sessão tentando tipos do worker (`RISK_CYCLE`, `AUTOMATIC_CURATION`) | `INVALID_KIND` |
| `authenticated` apagar/editar `ai_consult_usage` ou ler/editar o orçamento | sem privilégio |

## 3. Tabela caminho × reserva × unidade × teste

O teste estático "cobertura" de `test-ai-governance-n6.mjs` varre `apps/web/lib` e `apps/web/app`: todo arquivo de
produção que chama um ponto de entrada de Expert precisa estar nesta tabela, com a marca do mecanismo; caminho novo
sem reserva quebra o teste.

| Caminho | Arquivo | Reserva | Tipo / unidade | Testes |
|---|---|---|---|---|
| Painel Diretor Comercial (consulta) | `lib/ai/expert-query-action.ts` | sessão, fronteira do provedor + precheck | `EXPERT_PANEL`, 1 | n6 cobertura; `test-experts-engineering-routing` |
| Painel Diretor de Planejamento | `lib/ai/planning-query-action.ts` | idem | `EXPERT_PANEL`, 1 (0 se MPP ausente) | n6 "Planejamento: MPP ausente" |
| Painel Diretor de Engenharia | `lib/ai/engineering-query-action.ts` | idem | `EXPERT_PANEL`, 1 | n6 gate |
| Painel ESG | `lib/ai/esg-query-action.ts` | idem | `EXPERT_PANEL`, 1 | n6 cobertura |
| Jurídico pré-contratual | `lib/ai/legal-query-action.ts` | idem | `EXPERT_PANEL`, 1 (0 se contrato ilegível) | n6 "Jurídico: contrato ilegível" |
| Estratégia comercial | `lib/ai/commercial-strategy-action.ts` | idem | `EXPERT_PANEL`, 1 | `test-commercial-strategy-action` |
| Análise integrada pré-contratual | `lib/ai/precontract-curation-action.ts` → `run-multi-expert-curation.ts` | sessão, por Expert + precheck | `CURATION`, 1 por Expert + 1 CEO | n6 curadoria; `test-experts-engineering-routing` |
| Curadoria do Event Ledger | `app/[projectId]/ledger/[eventId]/run-multi-expert-curation-actions.ts` | idem | `CURATION`, idem | idem |
| CONSULTAR IA (links de alerta/risco) — Expert único | `app/alertas/consulta-ia/.../actions.ts` → `alert-consult-experts.ts` | sessão, fronteira + precheck | `ALERTA`/`RISCO`, 1 | n6 "CONSULTAR IA"; `test-ai-consult-quota` |
| CONSULTAR IA — multidisciplinar | idem → `runMultiExpertCuration` | idem | `ALERTA`/`RISCO`, 1 por Expert + CEO | `test-experts-engineering-routing` |
| SSMA (registro de campo) | `app/ssma/consult-actions.ts` → `lib/ssma/.../run-record-consult.ts` | sessão, antes da consulta (validação antecipada) | `SSMA`, 1 | `test-ai-consult-quota` |
| ESPECIALISTA do caso de risco (ciclo/worker) | `lib/risk-alerts/experts/cycle-expert-consultant.ts` | service_role com solicitante, fronteira | `RISK_CYCLE`, 1 (curadoria: por Expert + CEO) | n6 "ABUSO (ciclo)"; `test-experts-engineering-routing` |
| **Curadoria de proposta adicional** (lacuna fechada) | `app/[projectId]/adicionais/actions.ts` → `lib/additionals/curation.ts` | sessão, fronteira + precheck | `CURATION`, 4 (Planejamento, Comercial, Jurídico, CEO) | n6 "curadoria de adicional" |
| **Curadoria automática de fonte do cliente** (lacuna fechada) | `lib/additionals/findings/run-automatic-curation.ts` | service_role com solicitante (`actorExpertReserve`), fronteira; sem solicitante = não chama e registra `BLOCKED_NO_REQUESTER` | `AUTOMATIC_CURATION`, 1 por Expert (Jurídico do confronto, roteados, CEO se material) | n6 "curadoria automática"; n6-sql N2–N4 |
| Comercial `runCommercialDirectorExpert`, `answerCeoQuery` | só exportados (`lib/ai/index.ts`) e scripts locais | — | sem caminho de produção | n6 cobertura (falha se ganharem chamador) |
| AXIA | `lib/assistant/*` | orçamento próprio `axia_chat_budget` | — | n6 "AXIA" |

Observação: a curadoria automática **não tem chamador de produção** hoje (só testes). Quem a ligar deve passar
`reserve: actorExpertReserve(admin, createdByUserId, projectId, "AUTOMATIC_CURATION", ...)`.

## 4. Pendências

- `scripts/test-client-source-confrontation.mjs` e `scripts/test-additional-proposals.mjs` têm trechos de integração
  com Supabase real (pulados sem credenciais) que chamam as curadorias sem `reserve`; ao rodá-los contra um banco
  de homologação, passar a reserva (sem ela a curadoria é recusada por desenho).
- Orçamento monetário: decisão da Diretoria (`docs/ai/orcamento-monetario-ia.md`).
