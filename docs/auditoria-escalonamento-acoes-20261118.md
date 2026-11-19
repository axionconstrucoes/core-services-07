# Auditoria — escalonamento por ação humana (ALTO/CRÍTICO)

Data: 18/11/2026 · Branch: `fix/escalonamento-sem-acao-extraordinaria` (base `a732eae`) · **Nada aplicado em Production.**

## Critério de negócio
EM ANDAMENTO e ENVIAR PARA não devem, isoladamente, provocar escalonamento extraordinário, nem reiniciar prazos, suspender o SLA, impedir escalonamentos normais vencidos ou apagar histórico. ESPECIALISTA é só consulta.

## Comportamento anterior (conflito)
`alert-state-machine.ts` → `IMMEDIATE_ESCALATION_ACTIONS = {TAKING_ACTION, FORWARD, EXPERT_CONSULTATION, OTHER}`: em casos ALTO/CRÍTICO, cada uma gerava um evento `IMMEDIATE_ESCALATION`, mudava `currentLevel` e enfileirava um e-mail `ESCALATION` ao próximo nível. Estava documentado (`docs/piloto-caso-de-teste.md`, manual §9.5, aviso âmbar na tela) e coberto pelos testes 27–32, 37, 42, O3–O5.

## Verificação antes de alterar
- **Histórico persistido:** no banco, `risk_alert_action_events` tem apenas 2 eventos de sistema (`TOP_LEVEL_REACHED`, 18/11/2026 12:37). Nenhuma ação humana e nenhum `IMMEDIATE_ESCALATION` foram gravados: a mudança não reinterpreta registros.
- **SQL:** a decisão está só no TypeScript; a RPC apenas persiste os eventos/saídas calculados. Não há migration.
- **Prazos:** `TAKING_ACTION` e `FORWARD` não escrevem `assume/respond/complete_due_at` (testes 27 e 9). O motor horário (`computeEscalation`) é independente e não foi tocado.

## Correção (isolada)
`IMMEDIATE_ESCALATION_ACTIONS = {OTHER}`; aviso de tela ajustado. `OTHER` não foi citado no critério e permanece como estava (decisão separada).

## Diferenças que permanecem e precisam de decisão
1. **ENVIAR PARA cria um prazo próprio do encaminhado** (`assumeDueAt` a partir de agora, com devolução ao remetente no vencimento) e marca a ação SLA como `ACKNOWLEDGED`. Não altera os prazos originais da ação SLA, mas é um temporizador novo. Se o critério "não reiniciar prazo" inclui isso, é outra mudança.
2. **EM ANDAMENTO marca a ação SLA como `IN_PROGRESS`**, o que satisfaz o prazo de "assumir"; os prazos seguintes seguem. É a semântica atual do SLA.
3. **`OTHER` continua escalonando imediatamente.**
4. Texto do manual (`docs/manual-referencia-acc.md`, linhas ~783, 799, 2455) ainda descreve o aviso antigo; atualizar junto com a decisão do item 3.

## Testes
Atualizados para o novo critério: `test-pilot-risk-alert-actions` (19, 26–32, 37, 42), `test-pilot-risk-alert-audit` (O3–O5), `test-risk-alert-forecast` (7, 8, 9, 21b), `test-pilot-test-case`. A mecânica de escalonamento imediato segue coberta pela ação `OTHER`. `test-pilot-test-case` ("envio tardio") já falhava na base.
