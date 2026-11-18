# Indicador FINANCIAL_DEVIATION_PERCENT — comparação na mesma data de corte

Método: `CUTOFF_CLOSED_MONTHS_V2` (`apps/web/lib/schedule/weekly-report/analyze-sheets.ts`).
Este documento descreve o método. Valores reais de projeto não constam aqui (repositório público).
Eles ficam no ACC, na auditoria do caso.

## O que estava errado (método antigo, preservado como `legacyFullHorizon`)

O método antigo calculava `(Σ realizado de todas as linhas − Σ previsto de todas as linhas) / Σ previsto`.
O realizado é parcial, porque vai só até o mês do relatório, enquanto o previsto cobria todo o horizonte, com os meses futuros incluídos.
Por isso o desvio era sempre fortemente negativo, sem representar atraso real.

O valor antigo continua gravado em `metrics.legacyFullHorizon`, para rastreabilidade.
Ele não é usado para classificar.

## Fórmula corrigida

```
desvio% = (Realizado até o corte − Previsto até o MESMO corte) / |Previsto até o corte| × 100
```

**Corte:** fim do último mês calendário encerrado antes da data de referência do relatório.
- A data de referência é a data de envio do e-mail semanal, no fuso de Brasília.
- O corte não é o último mês com valor diferente de zero, porque zero é um dado válido.

**Meses fora do cálculo:**
- O mês corrente fica fora. É parcial e não se compara com o previsto do mês inteiro.
- Os meses futuros ficam fora. Se um mês futuro tiver realizado diferente de zero, gera alerta.

**Fontes dos valores:**
- Quando há colunas acumuladas, usa-se o valor acumulado na linha do mês de corte.
- Quando não há, usa-se a soma dos meses encerrados.
- Cada mês encerrado registra a célula de origem do previsto e do realizado (`metrics.sources`).

## Sinal e natureza

A natureza dos valores é inferida dos cabeçalhos:

| Natureza | Quando | O que é adverso |
|---|---|---|
| `BILLING_PRODUCTION` | O realizado é faturamento, medição ou produção | Desvio negativo, ou seja, execução financeira abaixo do previsto. Isso não é estouro de custo. |
| `COST` | O realizado é custo ou desembolso | Desvio positivo |
| `UNKNOWN` | Nenhum dos dois casos | Não mensurável |

## Quando o indicador fica não mensurável (REVIEW_REQUIRED, com o motivo)

- Não há data de referência do relatório.
- A série não é mensal com datas inequívocas. Não existe distribuição aprovada para obter o previsto na data, e não se usa rateio linear.
- Não há nenhum mês encerrado antes da referência.
- Falta um valor (célula vazia) num mês encerrado.
- Há fórmula sem valor armazenado num mês encerrado. Isso é tratado à parte do valor ausente.
- O previsto até o corte é zero.
- A natureza dos valores é indefinida.

Sem limite aprovado para `FINANCIAL_DEVIATION_PERCENT`, o resultado mensurável também fica REVIEW_REQUIRED, informando o limite ausente.

## Alertas informativos

| Alerta | Significado |
|---|---|
| `PARTIAL_PERIOD_EXCLUDED` | O mês corrente foi excluído do cálculo. |
| `ZERO_VALUE_IN_CLOSED_PERIOD` | Há zero em mês encerrado. Ele é aceito, mas sinalizado para confirmação. |
| `FUTURE_PERIOD_HAS_ACTUAL` | Há realizado em mês futuro. |
| `PLAN_EQUALS_ACTUAL_IN_CLOSED_PERIODS` | O previsto é idêntico ao realizado em meses encerrados. É indício de reprevisão: o previsto da planilha pode não ser a linha de base aprovada. |
| `FILE_WEEK_LABEL_DIFFERS` | A semana no nome do arquivo difere da semana do pacote. |

## Duplicatas e revisões de planilhas da mesma semana

| Situação | Critério | Tratamento |
|---|---|---|
| Duplicata | Mesmo SHA-256 de uma leitura válida anterior do projeto | A leitura é registrada, com alerta `DUPLICATE_FILE` e `summary.lineage.duplicateOfWorkbookId`. As abas não recebem classificação de risco, e o caso pertence à primeira leitura. |
| Revisão | Mesma semana, conteúdo diferente | Processada normalmente, com alerta `REVISION_OF_WEEK`. No ciclo de alertas prevalece a mais recente por data de envio. |

Leituras e casos já existentes não são alterados nem excluídos.
As duplicatas históricas foram registradas na auditoria.

## Definições necessárias antes de aprovar limites

1. **Base de comparação aprovada.** Hoje o "PREVISTO MENSAL" da planilha é reprevisto a cada semana: em meses já encerrados, o previsto passa a ser igual ao realizado. É preciso definir qual previsto vale como base, por exemplo a curva financeira contratual aprovada e sua versão.
2. **Data de fechamento do realizado.** O realizado de um mês encerrado continua mudando nas semanas seguintes, porque o faturamento direto do cliente é lançado depois. É preciso definir a partir de quando o mês é considerado fechado: dia de corte da medição ou número de dias após o fim do mês.
3. **Natureza do indicador.** Confirmar que o realizado é faturamento ou medição (FATURAMENTO AXION + FATURAMENTO DIRETO), e não custo. Confirmar também que o adverso é ficar abaixo do previsto.
4. **Limites** médio, alto e crítico em pontos percentuais. Devem ser aprovados pelo responsável e não são gravados por este método.
