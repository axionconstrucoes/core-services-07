# SLA MÉDIO e BAIXO — prazos definitivos aprovados (FRENTE A)

| Risco | Prazo para assumir (aprovado) | Antes | Escalonamento (inalterado: Nível 2 / Diretoria) |
|---|---|---|---|
| CRÍTICO | 1 hora corrida | 1 hora corrida | +1 / +2 |
| ALTO | 4 horas úteis | 4 horas úteis | +4 / +4 |
| MÉDIO | **2 dias úteis** | 1 dia útil | +1 / +1 |
| BAIXO | **5 dias úteis** | 3 dias úteis | +3 / +2 |

Só `assume_deadline_value` muda; `respond`/`complete`, intervalos de escalonamento, notificações, confirmações, expediente e feriados ficam como estavam.

## Onde o valor vive
- Código: `apps/web/lib/sla/default-matrix.ts` (padrão quando a obra não tem regra).
- Banco: `sla_matrix_rules` (regra ativa por obra/risco/área) e o padrão da função `sla_ssma_assume_due_at` (SSMA).
- Migration `supabase/migrations/20261121177000_sla_medio_baixo_prazos_aprovados.sql` (idempotente): regra geral ativa com o valor antigo (1/3) é desativada e uma nova é criada com 2/5 (histórico mantido); regra por área é atualizada no lugar (unique `project_id, risk_level, area`); regra personalizada (outro valor/unidade) não é tocada; falha com `SLA_MATRIX_DUPLICATE_ACTIVE` se houver mais de uma ativa por chave.
- Ações já criadas **não** são recalculadas (prazos são gravados na criação; nenhum gatilho de `sla_matrix_rules` toca `sla_actions`). A auditoria sai pelo gatilho existente (`SLA_CONFIGURATION_UPDATED`, ator SYSTEM).
- Testes: `scripts/test-sla-medio-baixo-aprovados-sql.mjs`, `test-sla-escalation.mjs`, `test-ssma-sla-deadline-sql.mjs`, `test-l2-followup-forecast-sql.mjs` (M1).
