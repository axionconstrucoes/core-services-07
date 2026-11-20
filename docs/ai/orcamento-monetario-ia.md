# Orçamento monetário das consultas aos Experts IA — opções para decisão da Diretoria

Data: 20/11/2026 · Frente N6 · Estado: **preparado e DESLIGADO** (nada ativado)

## 1. Situação atual

| Controle | Valor | Status |
|---|---|---|
| Consultas por usuário/dia (todas as obras) | 20 | vigente, **operacional — não é política aprovada** |
| Consultas por obra/dia | 100 | vigente, **operacional — não é política aprovada** |
| Teto em US$ (usuário / obra / global; dia / mês) | — | **desligado** (`ai_consult_budget_settings.enabled = false`) |
| AXIA (assistente) | US$ 1,00/dia global (padrão), 100 chamadas/usuário/dia | separado (`axia_chat_budget`), não muda |

A frente N6 não altera nenhum desses valores.

## 2. O que foi preparado

Migration `20261121150000_ai_consult_governance`:

- tabela `ai_consult_budget_settings` (uma linha, `scope = 'DEFAULT'`), acessível só a service_role:
  - `enabled` — **chave de ativação** (padrão `false`);
  - `estimated_cost_per_call_usd` — estimativa por chamada (pior caso);
  - `per_user_day_usd`, `per_user_month_usd`, `per_project_day_usd`, `per_project_month_usd`, `global_day_usd`,
    `global_month_usd` — tetos (nulo = sem teto naquela dimensão);
  - `decision_reference` — referência da decisão (ata/e-mail). O banco **recusa** `enabled = true` sem
    `decision_reference` e sem `estimated_cost_per_call_usd`;
- coluna `ai_consult_usage.estimated_cost_micros` — estimativa gravada em cada unidade quando a estimativa estiver
  configurada (com o orçamento ainda desligado, serve para medir antes de decidir);
- o núcleo `ai_consult_reserve_core` aplica os tetos **no mesmo bloqueio atômico** da contagem (trava usuário →
  obra; com o orçamento ativo, também uma trava global por dia). Ultrapassar um teto recusa a consulta antes do
  provedor (`AI_CONSULT_BUDGET_USER_DAY`, `..._USER_MONTH`, `..._PROJECT_DAY`, `..._PROJECT_MONTH`,
  `..._GLOBAL_DAY`, `..._GLOBAL_MONTH`; mensagem única na tela).

Estimativa por chamada — mesmo princípio da AXIA (pior caso, arredondado para cima, nunca subestima):

```
custo_por_chamada_US$ = (tokens_entrada_max × preço_entrada_US$/MTok + tokens_saída_max × preço_saída_US$/MTok) / 1 000 000
```

`tokens_saída_max` = `ANTHROPIC_MAX_TOKENS` (padrão 4096). `tokens_entrada_max` deve cobrir instruções + framework +
contexto da obra (com documentos contratuais, o maior caso). Os preços **não** estão no código: o modelo é
configurado por ambiente (`ANTHROPIC_MODEL`) e o preço contratado deve ser informado por quem decide.
Funções de apoio (puras): `estimateExpertCallCostUsd` e `projectWorstCaseSpendUsd` em
`apps/web/lib/ai/governance/budget-options.ts`.

## 3. Opções para a Diretoria

| Opção | Como | Prós | Contras |
|---|---|---|---|
| A. Manter só limite de quantidade (atual) | nada | simples; já funciona em todos os caminhos | custo em US$ varia com modelo/contexto; sem teto global |
| B. Medir antes de decidir | configurar só `estimated_cost_per_call_usd` (com `enabled = false`) | gera histórico de custo estimado por usuário/obra sem bloquear ninguém | ainda sem teto |
| C. Teto global mensal | `enabled = true`, `global_month_usd` | protege o caixa contra pico | uma obra pode consumir o teto de todas |
| D. Tetos por obra + global | `per_project_month_usd` + `global_month_usd` | distribui o orçamento entre obras | exige definir o valor por obra |
| E. Tetos completos | usuário, obra e global, dia e mês | controle máximo | mais parâmetros para manter |

Projeção de pior caso (exemplo ilustrativo, **não é preço real**): com estimativa de US$ 0,05 por chamada e os
limites atuais, `projectWorstCaseSpendUsd` dá US$ 1,00/usuário/dia, US$ 5,00/obra/dia e, com 3 obras e 22 dias
úteis, US$ 330/mês global.

## 4. Como ativar (somente após decisão registrada)

Executar com service_role, no ambiente decidido (nunca pelo frontend):

```sql
update public.ai_consult_budget_settings
   set estimated_cost_per_call_usd = <estimativa>,
       global_month_usd = <teto>,            -- e/ou as demais dimensões
       decision_reference = '<ata/e-mail da Diretoria>',
       enabled = true,
       updated_at = now()
 where scope = 'DEFAULT';
```

Desativar: `update public.ai_consult_budget_settings set enabled = false where scope = 'DEFAULT';` (os tetos
ficam guardados). Testes: `scripts/test-ai-governance-n6-sql.mjs` (N6–N9) exercitam as opções numa base
descartável e confirmam que o padrão é desligado.
