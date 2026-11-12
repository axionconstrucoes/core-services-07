# Caso de TESTE do piloto (WEG) — identificação, exclusão e permissões

Convenção (sem coluna nova, sem migration): `title` começa com `[TESTE PILOTO]` e/ou `reference` começa com `TESTE-PILOTO`
(`apps/web/lib/risk-alerts/pilot-test-case.ts`, `isPilotTestCase`). Este PR **não cria** nenhum caso e não envia nada.

## Onde o caso de teste é rotulado ou excluído
| Ponto | Efeito |
|---|---|
| `supabase-store.ts` `loadProjectSnapshot` | caso de teste fora de `existingCases`: o ciclo recorrente não o fecha, escala, conta nem inclui em consolidado |
| `pilot-risk-alerts-view-data.ts` | fora de "Casos em aberto" (`openCases`) e de `suppressedCount`; contado à parte em `testCasesOpen`; linhas da outbox do caso marcadas `isTest` |
| `pilot-risk-alerts-panel.tsx` | texto "N caso(s) de TESTE não contado(s)" e badge `TESTE` nas linhas da outbox |
| `alert-detail-data.ts` + `alertas/[caseId]/page.tsx` | `isTestCase` e badge "TESTE — caso isolado do piloto, não é risco real" |
| `acoes/actions.ts` (escalonamento manual) | caso de teste nunca entra em `riskCaseByActionId` |
| `loadCorrelationIndex` | **não** filtra (respostas ao caso de teste precisam correlacionar) |
| `run-risk-alert-cycle.ts` (`sendPlanned` e `sendPendingRow`) | **bloqueio fail-closed contra ENVIO TARDIO**: linha de caso de TESTE não é enviada pelo ciclo (nem marcada: permanece PENDING, sem perder histórico) e é contada em `pilotTestCaseBlocked`; só as chaves `PILOT_SINGLE` do envio único armado (`pilotSingleArmedKeys`) saem, pelas guardas do provider (To = 4 caixas). Casos de teste ficam em `snapshot.testCases` (visíveis só ao envio único) |

**Pendência resolvida:** desligar a geração recorrente não impedia que FORWARD/ESCALATION PENDING de um caso de teste saíssem depois, se o ciclo fosse ligado. Com o bloqueio, essas linhas nunca saem pelo ciclo; ficam PENDING até decisão humana (o histórico se mantém).

## Quem pode agir (TS × banco `record_risk_alert_action`)
- Banco: ADMINISTRADOR (web), responsável atual/anterior, encaminhado ativo, destinatário na outbox do caso, responsáveis da Matriz da área.
- TS (`applyAlertAction`) não checa quem é o ator (a RPC e o `actions.ts`/`authorizeReply` fazem); valida estado, texto e confirmações.
- **Encaminhar** — TS: alvo ∈ `eligibleForwardUserIds` (ACTIVE, e-mail corporativo, ≠ autor), sem encaminhamento ativo, ação permitida no estado. Banco: alvo ACTIVE ≠ autor, um encaminhamento ativo, prazo futuro. *Divergência:* o banco não exige e-mail corporativo verificado (o TS sim).
- **Resolver** — TS: `RESOLVED` exige `confirmed`, justificativa (se a Matriz exige) e evidência (HIGH/CRITICAL); em HIGH/CRITICAL com confirmação exigida vira `RESOLUTION_PROPOSED` e só `RESOLUTION_CONFIRMED` (com `confirmed`) encerra. Banco: apenas a máquina de estados (`risk_alert_action_allowed`) e "só RESOLVED/CONFIRMAR encerram". *Divergências:* o banco não repete confirmação/justificativa/evidência; **não há segregação**: quem propõe pode confirmar a própria resolução.
- `sla_action_id` nulo: todos os blocos de SLA da RPC são protegidos por `v_case.sla_action_id is not null`; colunas nuláveis em `risk_alert_cases` e `risk_alert_outbox`. Teste: `scripts/test-pilot-test-case.mjs`.

## Efeito de HIGH/CRITICAL (importante para o roteiro)
Ação humana em caso HIGH/CRITICAL (TAKING_ACTION, FORWARD, EXPERT_CONSULTATION, OTHER) dispara **escalonamento imediato** ao próximo nível da Matriz da ÁREA do caso. Em PLANEJAMENTO (N1 = responsável da Matriz, sem N2, Diretoria = Reynaldo) o destino é a Diretoria (Reynaldo): a linha ESCALATION fica PENDING e o nível do caso de teste muda. Para o caso de teste não envolver nenhum responsável real da Matriz, escolher uma área sem responsáveis reais configurados, ou aceitar a linha PENDING (não enviada sem o ciclo; o envio é sempre restrito às quatro caixas).
