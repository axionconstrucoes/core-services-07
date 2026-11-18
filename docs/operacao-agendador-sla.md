# Agendador do ACC e SLA crítico — proposta para decisão (18/11/2026)

> **Status: PROPOSTA.** Nada aqui foi aplicado. A migration
> `supabase/migrations/20261118093000_scheduler_pg_cron_dispatch.sql` NÃO deve
> ser aplicada sem aprovação explícita. Nenhum plano foi contratado.

## 1. Situação medida (fato)

Período: 14/11 00:00Z → 18/11 ~01:46Z (≈ 97,8 h). Fonte: API do GitHub Actions
(`/actions/workflows/<wf>/runs` e `/actions/runs/<id>/jobs`) do repositório público.

| Workflow | Cron | Execuções agendadas esperadas | Observadas | % | Maior intervalo |
|---|---|---|---|---|---|
| gmail-inbound-sync | `*/15` | ~391 | 16 | 4,1% | 10,5 h |
| document-processing-worker | `*/5` | ~1.170 | 15 | 1,3% | 10,4 h |
| mpp-document-worker | `*/5` | ~1.170 | 16 | 1,4% | 9,7 h |
| ssma-drive-photo-sync | `0 */2` | ~49 | 14 | 29% | 9,9 h |
| construmanager-content-ingestion | `17 */6` | ~16 | 9 | 56% | 15,5 h |
| diario-de-obra-sync | `43 0` diário | 4 | 4 | 100% | 25,2 h |
| weekly-schedule-email-ingestion | `20 *` | ~3 desde a reativação (17/11 22:48Z) | 0 | 0% | — |

As execuções agendadas de workflows diferentes aparecem **agrupadas nos mesmos
instantes** (ex.: 17/11 ~01:58Z, ~10:24–10:33Z, ~19:15–19:22Z). A documentação do
GitHub diz que o evento `schedule` "can be delayed during periods of high loads" e
que "some queued jobs may be dropped". Os dados são **compatíveis** com isso, mas
a causa não está comprovada. A conclusão operacional não depende da causa: com
intervalos de 10–25 h, o `schedule` do GitHub não atende o SLA crítico.

**Disparo manual (`workflow_dispatch`)**, 66 jobs no mesmo período:

| Medida | Mediana | p90 | Máximo |
|---|---|---|---|
| Criação do run → início do 1º job (fila) | 4 s | 5 s | 13 s |
| Duração: weekly-schedule-email-ingestion (ingest, phase=all) | 126 s | — | — |
| Duração: mpp-document-worker | 74 s | 79 s | 80 s |
| Duração: document-processing-worker | 68 s | 86 s | 90 s |
| Duração: gmail-inbound-sync | 203 s | 237 s | 275 s |

A aceitação do disparo (HTTP 204) **não comprova execução**. Só o término
registrado (heartbeat, abaixo) comprova.

## 2. Regras aprovadas da WEG (banco, `sla_matrix_rules`)

| Risco | Unidade | Assumir | Escalonamento 2 | Diretoria |
|---|---|---|---|---|
| CRITICAL (regra A) | horas corridas | 1 h | 1 h | 2 h |
| CRITICAL (regra B) | horas corridas | 1 h | 2 h | 3 h |
| HIGH (regra A) | horas úteis | 4 h | 4 h | 4 h |
| HIGH (regra B) | horas úteis | 4 h | 6 h | 8 h |
| MEDIUM | dias úteis | 1 | 1 | 1 |
| LOW | dias úteis | 3 | 3 | 2 |

**Achado:** existem **duas regras gerais ativas** para CRITICAL e para HIGH.
`resolveMatrixRule` (`apps/web/lib/sla/resolve-matrix-rule.ts`) usa `find()`
sobre a lista do banco **sem ORDER BY**. Por isso, a regra efetiva pode ser
qualquer uma das duas. Esta é a origem das faixas "1–2 h / 2–3 h". É preciso
decidir qual regra vale e desativar a outra (decisão de configuração; nada foi
alterado).

O escalonamento é calculado pelo ciclo `/api/cron/risk-alerts` (`computeEscalation`)
a cada execução. Portanto, o atraso de detecção de um prazo vencido é de no máximo
um intervalo do ciclo, mais a duração dele.

## 3. Opções avaliadas

| Opção | Atende a cadência? | Cobre a coleta? | Custo verificado | Observações |
|---|---|---|---|---|
| (1) Vercel Pro cron chamando rotas | Sim (1/min, precisão de minuto) | **Não**: MPP usa Python+Java (MPXJ); workbook usa heap de 6 GB; os scripts rodam com `npm ci` no runner. Função Vercel Pro: 4 GB e 800 s. Só o ciclo de alertas (rota já existente, 300 s) cabe. | US$ 20/mês por membro | Exigiria reescrever a coleta. |
| (2) Vercel cron disparando `workflow_dispatch` | Sim no Pro; no Hobby, só Schedules beta (cada 15 min, **jitter de 15 min**, 5.000 execuções/mês) | Sim (roda no GitHub) | Pro US$ 20/mês por membro; Hobby sem custo, mas limitado | Fila medida de 4–13 s. Disparar não comprova execução. |
| (3) **Supabase pg_cron + pg_net disparando `workflow_dispatch`** | Sim (até 1/s) | Sim (roda no GitHub) | **Sem custo adicional**: organização Supabase já no plano Pro; `pg_cron` 1.6.4 e `pg_net` 0.20.4 disponíveis e não instalados; GitHub Actions gratuito em repositório público | Precisa de token GitHub no Vault. Respostas do pg_net ficam 6 h. Recomendação Supabase: até 8 jobs simultâneos, cada um com até 10 min (aqui cada job só enfileira um HTTP). |
| (4) Manter `schedule` do GitHub | **Não** (1–56% observado) | Sim | Grátis | Incompatível com o SLA crítico. |

Fontes:
- https://vercel.com/docs/cron-jobs/usage-and-pricing (Hobby: 1/dia, ±59 min; Pro: 1/min, precisão de minuto)
- https://vercel.com/docs/schedules/limits (Schedules beta: Hobby a cada 15 min com jitter de 15 min, 5.000 execuções por período)
- https://vercel.com/docs/functions/limitations (300 s Hobby; 800 s Pro; memória de 2/4 GB)
- https://vercel.com/pricing
- https://supabase.com/docs/guides/cron (de 1 s a 1 ano; até 8 jobs simultâneos; ≤ 10 min por job)
- https://supabase.com/docs/guides/database/extensions/pg_net (assíncrono, envia após o commit, respostas por 6 h, tabelas unlogged)
- https://docs.github.com/en/billing/concepts/product-billing/github-actions (runners padrão gratuitos em repositório público)
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows (atrasos e descartes do `schedule`; desativação após 60 dias sem atividade em repositório público)

Plano Vercel atual: a API do time não retornou o plano. O código
(`app/api/cron/risk-alerts/route.ts`) e o `vercel.json` (somente crons diários)
indicam Hobby.

## 4. Recomendação: opção (3), pg_cron + pg_net + heartbeat

### Agenda proposta (UTC; escalonada para encadear as etapas)

| Job | Cron | Workflow | Papel |
|---|---|---|---|
| acc-weekly-all | `*/10` | weekly-schedule-email-ingestion (phase=all) | intake, promote, compare, classify, workbook, alerts, replies e **ciclo de alertas/escalonamentos** |
| acc-document-worker | `2-59/10` | document-processing-worker | planilhas e relatórios |
| acc-mpp-worker | `5-59/10` | mpp-document-worker | cronograma .mpp |
| acc-gmail-sync | `1-59/15` | gmail-inbound-sync | e-mails e anexos |
| acc-ssma-drive | `0 */2` | ssma-drive-photo-sync | sem mudança de cadência |
| acc-construmanager | `17 */6` | construmanager-content-ingestion | sem mudança de cadência |
| acc-diario | `43 0` diário (mode=incremental) | diario-de-obra-sync | sem mudança de cadência |
| acc-watchdog | `*/15` | — (SQL) | incidente quando um job passa de 3× o intervalo sem sucesso |

O `schedule` atual do GitHub fica como reserva. Execuções duplicadas são
absorvidas pelos grupos de concorrência e pela idempotência.

### Tempo esperado entrada → comunicação (estimativa, sem falhas)

Premissa: a cadência e as durações medidas acima. **Não é garantia.**

| Caminho | Típico | Pior caso sem falha | Por falha de uma etapa |
|---|---|---|---|
| Cronograma .mpp por e-mail → alerta | ~15–20 min | ~40 min | +10 min (próximo tick) |
| Planilha semanal por e-mail → alerta | ~20–25 min | ~45 min | +10–15 min |
| Prazo SLA vencido → escalonamento enviado | ≤ 13 min após o vencimento | ~13 min | +10 min |

Com CRITICAL (assumir em 1 h), o escalonamento sai entre 1h00 e cerca de 1h13
após o início da ação. Isso fica dentro da faixa de 1–2 h somente se a regra B
for a vigente. Com a regra A (escalonamento 2 em 1 h, diretoria em 2 h), o
atraso de até ~13 min é aceitável para a decisão? Essa é uma das decisões
pedidas abaixo.

### Concorrência, idempotência, monitoramento e recuperação

- **Concorrência:** cada workflow tem `concurrency.group` com `cancel-in-progress: false`.
  O GitHub mantém 1 execução em andamento e 1 pendente por grupo; uma pendente
  mais nova substitui a anterior. A rota de alertas tem trava por instância
  (HTTP 409). Entre instâncias, as chaves únicas da outbox impedem envio
  duplicado.
- **Idempotência:**
  - intake: deduplicação por mensagem e cursor com sobreposição de 3 dias;
  - outbox: chaves únicas por caso, nível e janela;
  - Diário: checkpoint;
  - Construmanager: hash.
- **Monitoramento:** `acc_scheduler_heartbeats` grava o último disparo
  (`last_dispatch_at`) e o último término informado pelo workflow
  (`last_success_at` / `last_failure_at`). O passo novo dos workflows chama
  `scripts/scheduler-heartbeat.mjs`, que nunca falha o job. O
  `acc_scheduler_watchdog` abre ou resolve um incidente em
  `acc_system_health_incidents` (`fingerprint scheduler:<job>`).
  **Não envia e-mail.** Notificação imediata desses incidentes é uma decisão
  separada.
- **Recuperação:** o tick seguinte refaz a etapa (fluxos idempotentes). Sem
  token no Vault, o disparo é nulo e o watchdog acusa. Rollback:
  `select cron.unschedule(jobname) from cron.job where jobname like 'acc-%';`.

### Dependências e riscos

- **Token GitHub.** Fine-grained PAT (ou GitHub App) restrito a
  `axionconstrucoes/core-services-07`, só com "Actions: Read and write", gravado
  pelo responsável no SQL Editor (`vault.create_secret`). Nunca em migration,
  chat ou log. Um PAT pessoal expira e depende da conta do titular; o GitHub App
  evita essas duas dependências.
- **Disponibilidade da API do GitHub e dos runners.** A fila medida foi de 4–13 s,
  mas sob incidente do GitHub não há garantia.
- **pg_net.** Tabelas unlogged; respostas por 6 h; a API ainda é beta.
- Repositórios públicos têm `schedule` desativado após 60 dias sem atividade.
  Isso não afeta `workflow_dispatch`.

## 5. Decisões necessárias

1. Aprovar (ou não) a aplicação da migration `20261118093000_scheduler_pg_cron_dispatch.sql`.
2. Criar o token GitHub (PAT fine-grained ou GitHub App) e gravá-lo no Vault com o nome `acc_github_actions_dispatch_token`.
3. Definir qual regra CRITICAL e qual regra HIGH valem, e desativar as duplicadas.
4. Decidir se incidentes do agendador devem notificar alguém imediatamente (hoje só ficam registrados).
5. Decidir quando remover o `schedule` do GitHub (recomendação: manter até 7 dias de heartbeats estáveis).
