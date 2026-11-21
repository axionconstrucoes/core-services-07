# 15 - Runbook de pausa e retomada coordenada dos jobs (Fase 7 / H6d) - DOCUMENTADO, NÃO EXECUTADO

Objetivo: congelar tudo que escreve no banco ou envia e-mail durante a janela de migrations e retomar depois com verificação. Leituras de 21/11/2026 no operacional (`plbcvwostmdmdmrziwmd`), sem escrita: nada foi pausado. Substitui a lista de workflows de `12`, seção 1.4, que estava **incompleta** (ver 3).

## 1. Os 11 jobs `pg_cron` ativos (SELECT em `cron.job`, 21/11/2026)

Todos `active = true`, usuário `postgres` (não superusuário; **pode executar `cron.alter_job`**, medido com `has_function_privilege`; `pg_cron` 1.6.4). Comandos resumidos (nenhum contém segredo; as credenciais ficam em Vault/funções).

| jobid | jobname | schedule | comando (resumo) | pausar na janela? |
|---|---|---|---|---|
| 1 | acc-risk-alerts | `*/2 * * * *` | `acc_scheduler_call_route('risk-alerts')` (rota do app: alertas e e-mail) | **sim** |
| 2 | acc-ssma-notifications | `3-59/5 * * * *` | `acc_scheduler_call_route('ssma-notifications')` | **sim** |
| 3 | acc-weekly-all | `*/10 * * * *` | dispatch de `weekly-schedule-email-ingestion.yml` (fase `all`) | **sim** |
| 4 | acc-document-worker | `2-59/10 * * * *` | dispatch de `document-processing-worker.yml` | **sim** |
| 5 | acc-mpp-worker | `5-59/10 * * * *` | dispatch de `mpp-document-worker.yml` | **sim** |
| 6 | acc-gmail-sync | `1-59/15 * * * *` | dispatch de `gmail-inbound-sync.yml` | **sim** |
| 7 | acc-ssma-drive | `0 */2 * * *` | dispatch de `ssma-drive-photo-sync.yml` | **sim** |
| 8 | acc-construmanager | `17 */6 * * *` | dispatch de `construmanager-content-ingestion.yml` | **sim** |
| 9 | acc-diario | `43 0 * * *` | dispatch de `diario-de-obra-sync.yml` (modo incremental) | **sim** |
| 10 | acc-watchdog | `*/5 * * * *` | `acc_scheduler_watchdog()` | **sim** (senão alerta falso de atraso; ver 5) |
| 11 | acc-cron-history-cleanup | `30 3 * * *` | apaga `cron.job_run_details` com mais de 7 dias | não (só limpeza; pode ficar ativo) |

## 2. Antes: registrar o estado e conferir (somente leitura)

```sql
-- guardar a saída FORA do repositório (cron-ativos.txt)
select jobid, jobname, schedule, active from cron.job order by jobid;                       -- esperado: 11 linhas, 11 ativas
select count(*) as em_andamento from cron.job_run_details where status = 'running';         -- esperado 0 (esperar terminar)
select count(*) as outbox_pendente from public.risk_alert_outbox where status = 'PENDING' or claimed_at > now() - interval '10 minutes'; -- 0
select count(*) from net.http_request_queue;                                                -- esperado 0 (acessível ao papel postgres; 0 em 21/11)
```

Variáveis de envio (apenas NOMES, conferir no painel da Vercel sem imprimir valores): `ACC_OUTBOUND_MODE` diferente de `production`; `ACC_RISK_ALERT_REISSUE_SEND_ENABLED`, `ACC_INSURANCE_REAL_SEND_ENABLED`, `ACC_EMAIL_REPLY_CONFIRMATIONS_ENABLED`, `ACC_EMAIL_SPECIALIST_ENABLED` desligadas.

## 3. Workflows do GitHub a pausar

Os workflows são disparados pelo `pg_cron` **e** têm `schedule` próprio como reserva; pausar só o `pg_cron` não basta. Workflows com `schedule` (lidos em `.github/workflows/*.yml`, 21/11/2026) = **11**:

| Arquivo | Nome | `schedule` | Disparado também pelo pg_cron |
|---|---|---|---|
| gmail-inbound-sync.yml | Gmail Inbound Sync | `*/15 * * * *` | sim (jobid 6) |
| gmail-owner-mailbox-sync.yml | Gmail Owner Mailbox Sync | `7,37 * * * *` | não |
| weekly-schedule-email-ingestion.yml | Weekly Schedule Email Ingestion | `20 * * * *` | sim (jobid 3) |
| ssma-notifications.yml | SSMA Notifications | `15 * * * *` | rota (jobid 2) |
| document-processing-worker.yml | Document Processing Worker | `*/5 * * * *` | sim (jobid 4) |
| mpp-document-worker.yml | (sem nome) | `*/5 * * * *` | sim (jobid 5) |
| ssma-drive-photo-sync.yml | SSMA Drive Photo Sync | `0 */2 * * *` | sim (jobid 7) |
| construmanager-content-ingestion.yml | Construmanager Metadata Monitoring | `17 */6 * * *` | sim (jobid 8) |
| diario-de-obra-sync.yml | Diario de Obra Sync | `43 0 * * *` | sim (jobid 9) |
| alert-reminders.yml | Alert Reminders | `*/30 * * * *` | não |
| contract-alert-batches.yml | Contract Alert Batches | `10 10 * * 3` | não |

Faltavam na lista de `12` (1.4): `alert-reminders`, `contract-alert-batches`, `document-processing-worker`, `mpp-document-worker`, `ssma-drive-photo-sync`, `construmanager-content-ingestion`, `diario-de-obra-sync`. Os manuais (`gmail-delegated-sync`, `gmail-historical-backfill`, `gmail-recover-existing`, `pilot-*`, `risk-alerts-weg-dry-run`) não têm `schedule`: basta **não acionar** durante a janela (desabilitá-los é opcional).

## 4. Pausa (executar nesta ordem; cada comando é reversível)

1. Pausar o `pg_cron` (escreve só em `cron.job.active`; não apaga definições):
   ```sql
   select jobid, jobname, cron.alter_job(jobid, active := false) from cron.job where jobname like 'acc-%' and jobname <> 'acc-cron-history-cleanup' and active order by jobid;
   ```
2. Esperar as chamadas em andamento terminarem (itens da seção 2 chegam a 0; `docs/operacao-agendador-sla.md`, seção 12).
3. Desabilitar os workflows da seção 3 (`gh` **não está instalado** nesta máquina; alternativas equivalentes: painel Actions > workflow > "..." > Disable workflow, ou `gh workflow disable <arquivo>` em quem tiver a CLI):
   ```
   for w in gmail-inbound-sync gmail-owner-mailbox-sync weekly-schedule-email-ingestion ssma-notifications document-processing-worker mpp-document-worker ssma-drive-photo-sync construmanager-content-ingestion diario-de-obra-sync alert-reminders contract-alert-batches; do gh workflow disable $w.yml; done
   ```
4. Esperar `gh run list --status in_progress` e `--status queued` vazios.

## 5. Verificação depois da pausa (antes da primeira migration)

```sql
select count(*) filter (where active) as ativos, count(*) filter (where not active) as pausados from cron.job;   -- esperado: ativos = 1 (cleanup), pausados = 10
select count(*) from cron.job_run_details where status = 'running';                                        -- 0
select max(d.start_time) from cron.job_run_details d join cron.job j using (jobid) where j.jobname <> 'acc-cron-history-cleanup';   -- guardar e repetir 3 min depois: não pode avançar (job_run_details não tem coluna jobname)
select count(*) from public.risk_alert_outbox where status = 'PENDING' or claimed_at > now() - interval '10 minutes';   -- 0
```

Workflows: `gh workflow list --all` mostra os 11 como `disabled_manually`; nenhum run novo em 3 min. Observação: o `acc-watchdog` pausado evita falso alerta de atraso do agendador; ao retomar, aguardar 1 ciclo antes de interpretar o watchdog.

## 6. Retomada (somente depois das ondas, do P0 e das conferências de `12`, seções 2 a 6)

1. Pipeline de e-mail em simulação e dry-runs conforme `12`, seção 6 (nada real).
2. Reativar o `pg_cron` pelo arquivo guardado na seção 2 (**só os que estavam ativos**):
   ```sql
   select jobid, jobname, cron.alter_job(jobid, active := true) from cron.job where jobname like 'acc-%' and jobname <> 'acc-cron-history-cleanup' and not active order by jobid;
   ```
3. Reabilitar os workflows (`gh workflow enable <arquivo>` ou painel).
4. Verificar: `select jobid, jobname, active from cron.job order by jobid` = 11 ativos; 2 ciclos de `cron.job_run_details` (juntar com `cron.job` por `jobid`) com `status = 'succeeded'`; nenhum e-mail fora do piloto; HTTP 200 nas rotas; watchdog sem alerta.
5. Parada: qualquer envio real, qualquer erro em 2 ciclos: pausar de novo (seção 4) e acionar o rollback.

## 7. O que não foi verificado

Em 21/11, às leituras, `net.http_request_queue` = 0 e nenhuma execução `running` (medido, sem pausa); a fila real de runs do GitHub (sem `gh`; o log das execuções é objeto da frente H6b); que desabilitar um workflow não cancela um run em andamento (esperar terminar).

Nota Fase 7: a onda M (H6e) não altera jobs nem workflows; vale a mesma pausa das demais ondas (seções 4 a 6) e a retomada só depois do bootstrap do TENANT_ADMIN, se as telas de contatos externos forem usadas na validação.
