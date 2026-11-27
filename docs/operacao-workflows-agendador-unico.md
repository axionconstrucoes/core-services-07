# Operação — agendador único dos workflows (pg_cron)

Arquitetura aprovada pelo responsável:

> PostgreSQL **pg_cron = agendador principal**; **GitHub Actions = executor** dos workflows e acionamento manual;
> **watchdog = supervisão**; **dashboard = apresentação**.

Problema corrigido: vários workflows tinham `on: schedule` próprio **e** eram disparados pelo pg_cron
(`public.acc_scheduler_dispatch_workflow`). Com o workflow habilitado, os dois disparavam: o grupo de
`concurrency` só impede execuções **simultâneas**, não **redundantes**. Evidência: `ssma-drive-photo-sync`
rodou por `schedule` às 00:23 UTC de 25/11/2026 além do disparo do pg_cron às 00:00. Alguns workflows tinham
um `if:` de job que pula o evento `schedule` com `ACC_SCHEDULER_PG_CRON_ENABLED=true` (construmanager, diário,
gmail-inbound), mas isso ainda gerava execuções `skipped` e não cobria os workers de documento, MPP, SSMA
Drive e o semanal.

Depois desta mudança, **nenhum workflow despachado pelo pg_cron tem `schedule`**; todos mantêm
`workflow_dispatch` (e seus inputs) para o pg_cron e para o acionamento manual. Os `if:` de job que pulavam
`schedule` foram mantidos (ficam inertes) para que um rollback que readicione o `schedule` continue seguro.

Guarda automatizada: `scripts/test-workflows-agendador-unico.mjs` (registrado em `scripts/test-scripts.list`).
Ela lê a migration do agendador (`supabase/migrations/20261119034721_scheduler_pg_cron_dispatch.sql`), o
`apps/web/vercel.json` e os YAML, e falha se: um workflow despachado pelo pg_cron ganhar `schedule` ou perder
`workflow_dispatch`; um input enviado pelo pg_cron não existir no workflow (o GitHub responderia 422); um
workflow que chama rota já agendada (pg_cron/Vercel) tiver `schedule`; surgir `schedule` fora da lista de
decisão pendente; os gatilhos de CI mudarem; um watchdog `workflow_run` observar workflow inexistente.

## Estado de produção levantado em 27/11/2026 (somente leitura)

GitHub (API REST, GET): `ACC_SCHEDULER_PG_CRON_ENABLED=true`. Desabilitados (`disabled_manually`):
alert-reminders, contract-alert-batches, document-processing-worker, gmail-owner-mailbox-sync,
mpp-document-worker, ssma-drive-photo-sync, ssma-notifications, weekly-schedule-email-ingestion. Os demais 22: `active`.

pg_cron (`cron.job`, SELECT):

| Job pg_cron | Agenda (UTC) | Alvo | `active` |
|---|---|---|---|
| acc-gmail-sync | 1-59/15 * * * * | gmail-inbound-sync.yml | **true** |
| acc-construmanager | 17 */6 * * * | construmanager-content-ingestion.yml | **true** |
| acc-diario | 43 0 * * * | diario-de-obra-sync.yml (`{"mode":"incremental"}`) | **true** |
| acc-watchdog | */5 * * * * | `acc_scheduler_watchdog()` | **true** |
| acc-document-worker | 2-59/10 * * * * | document-processing-worker.yml | false |
| acc-mpp-worker | 5-59/10 * * * * | mpp-document-worker.yml | false |
| acc-ssma-drive | 0 */2 * * * | ssma-drive-photo-sync.yml | false |
| acc-weekly-all | */10 * * * * | weekly-schedule-email-ingestion.yml (`{"phase":"all"}`) | false |
| acc-risk-alerts | */2 * * * * | rota `/api/cron/risk-alerts` | false |
| acc-ssma-notifications | 3-59/5 * * * * | rota `/api/cron/ssma-notifications` | false |
| acc-cron-history-cleanup | 30 3 * * * | limpeza de `cron.job_run_details` | false |

Observação: `acc-document-worker` registrou o último disparo em 27/11 21:12 UTC com HTTP **422** (workflow
desabilitado no GitHub) — por isso reativar um worker exige **as duas pontas**: habilitar o workflow no GitHub
**e** ativar o job no pg_cron (ver "Passos do responsável").

Observação 2 (fato, sem alteração aqui): com `ACC_SCHEDULER_PG_CRON_ENABLED=true` e `acc-risk-alerts`
inativo, o ciclo de alertas de risco (`/api/cron/risk-alerts`) não tem chamador automático hoje: o job
`risk-alerts` do workflow semanal só chama a rota quando a variável é diferente de `true`.

Vercel (`apps/web/vercel.json`): `/api/cron/weekly-alert-digest` (`0 10 * * 3`) e `/api/cron/system-health`
(`30 10 * * *`). O `weekly-alert-digest` executa `runWeeklyAlertDigests()` **e** `runContractAlertBatches()`.

## Inventário ANTES × DEPOIS

Legenda — Tipo: **OP** operacional agendado; **MAN** manual/diagnóstico; **CI** CI/CD; **WD** watchdog.
Secrets: só os **nomes**. Recurso: estimativa por execução em runner `ubuntu-latest`.

| Workflow | Tipo | Gatilhos ANTES | Gatilhos DEPOIS | Agendador principal | Concurrency | Secrets (nomes) | Efeitos externos | Recurso | GitHub 27/11 |
|---|---|---|---|---|---|---|---|---|---|
| alert-reminders.yml | OP | schedule `*/30 * * * *` + dispatch | **inalterado** (decisão pendente) | nenhum (nem pg_cron nem Vercel) | alert-reminders | CRON_SECRET | chama `/api/cron/alert-reminders`: abre acompanhamentos e **envia e-mail de lembrete ao responsável** do alerta | 1 curl, < 1 min; até 48/dia | disabled_manually |
| ci-pr-checks.yml | CI | pull_request (main) + dispatch | **inalterado** | — | ci-pr-${PR} | — | nenhum (provedor de e-mail `fake`) | lint/tsc/testes, ≤ 5 min | active |
| construmanager-content-ingestion.yml | OP | schedule `17 */6 * * *` + dispatch (job pulava `schedule` com pg_cron) | dispatch (input project_id) | pg_cron acc-construmanager | construmanager-metadata-monitoring | CONSTRUMANAGER_BASE_URL, CONSTRUMANAGER_LOGIN, CONSTRUMANAGER_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | lê API Construmanager (metadados), grava no banco; sem e-mail | ≤ 20 min; 4/dia | active |
| construmanager-content-recovery.yml | MAN | dispatch | inalterado | — | construmanager-content-recovery | idem construmanager | dry-run/apply: baixa arquivos para o storage | ≤ 120 min | active |
| construmanager-credential-validation.yml | MAN | dispatch | inalterado | — | construmanager-credential-validation | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | só validação | ≤ 5 min | active |
| construmanager-document-promotion.yml | MAN | dispatch | inalterado | — | construmanager-document-promotion | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | apply cria versões documentais | ≤ 20 min | active |
| construmanager-file-list-validation.yml | MAN | dispatch | inalterado | — | construmanager-file-list-validation | idem construmanager | leitura | ≤ 10 min | active |
| construmanager-monitoring-watchdog.yml | WD | workflow_run (Construmanager Metadata Monitoring) | inalterado (vale para runs do dispatch) | — | construmanager-monitoring-watchdog | GITHUB_TOKEN (issues: write) | abre/fecha issue no repositório | ≤ 5 min | active |
| contract-alert-batches.yml | OP | schedule `10 10 * * 3` + dispatch | **dispatch** | cron Vercel `weekly-alert-digest` (`0 10 * * 3`) já roda `runContractAlertBatches()` | contract-alert-batches | CRON_SECRET | chama `/api/cron/contract-alert-batches`: **envia lotes de alertas contratuais por e-mail** | 1 curl; 1/semana | disabled_manually |
| crm-sent-copy-check.yml | MAN | dispatch | inalterado | — | crm-sent-copy-check | ACC_RISK_ALERTS_INBOUND_* (4) | leitura da caixa crm@ | ≤ 5 min | active |
| diario-de-obra-api-validation.yml | MAN | dispatch | inalterado | — | diario-de-obra-api-validation | DIARIO_DE_OBRA_API_TOKEN | leitura | ≤ 10 min | active |
| diario-de-obra-monitoring-watchdog.yml | WD | workflow_run (Diario de Obra Sync) | inalterado | — | (sem grupo) | GITHUB_TOKEN (issues: write) | abre/fecha issue | < 1 min | active |
| diario-de-obra-sync.yml | OP | schedule `43 0 * * *` + dispatch (job pulava `schedule` com pg_cron) | dispatch (inputs project_id, obra_id, mode) | pg_cron acc-diario (`mode=incremental`) | diario-de-obra-sync | DIARIO_DE_OBRA_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | lê API Diário de Obra, grava RDOs; sem e-mail | ≤ 20 min; 1/dia | active |
| document-processing-worker.yml | OP | schedule `*/5 * * * *` + dispatch | **dispatch** | pg_cron acc-document-worker (10 min) | document-processing-worker | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | extrai versões documentais pendentes; sem e-mail | ≤ 20 min; até 144/dia (antes: 288 do GitHub + 144 do pg_cron) | disabled_manually |
| financial-display-reprocess.yml | MAN | dispatch | inalterado | — | financial-display-reprocess | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | apply reprocessa exibição | ≤ 20 min | active |
| gmail-delegated-sync.yml | MAN | dispatch | inalterado | — | gmail-delegated-sync-${mailbox} | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (+ OIDC) | lê caixa delegada | ≤ 15 min | active |
| gmail-historical-backfill.yml | MAN | dispatch | inalterado | — | gmail-historical-backfill | GOOGLE_GMAIL_REYNALDO_* (3), NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | apply grava mensagens | ≤ 340 min | active |
| gmail-inbound-sync.yml | OP | schedule `*/15 * * * *` + dispatch (job pulava `schedule` com pg_cron) | **dispatch** | pg_cron acc-gmail-sync | gmail-inbound-sync | GOOGLE_GMAIL_REYNALDO_* (3), NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | lê Gmail (somente leitura), grava `emails`; sem envio | ≤ 10 min; 96/dia | active |
| gmail-owner-mailbox-sync.yml | OP | schedule `7,37 * * * *` + dispatch | **inalterado** (decisão pendente) | nenhum | gmail-owner-mailbox-sync | GOOGLE_GMAIL_INBOUND_CLIENT_ID/_SECRET, GOOGLE_GMAIL_TITULAR_<N>_* , NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | lê caixas **pessoais** de titulares (agendado = apply) | ≤ 120 min; 48/dia × 2 slots | disabled_manually |
| gmail-recover-existing.yml | MAN | dispatch | inalterado | — | gmail-recover-existing-weg | GOOGLE_GMAIL_REYNALDO_* (3), NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | apply grava corpos/anexos | ≤ 120 min | active |
| mpp-document-worker.yml | OP | schedule `*/5 * * * *` + dispatch | **dispatch** | pg_cron acc-mpp-worker (10 min) | mpp-document-worker | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | extrai cronogramas .mpp; sem e-mail | ≤ 20 min; até 144/dia (antes 288 + 144) | disabled_manually |
| pilot-gmail-auth-check.yml | MAN | dispatch | inalterado | — | pilot-gmail-auth-check | ACC_RISK_ALERTS_CRON_SECRET | verificação de autenticação | ≤ 5 min | active |
| pilot-replies-mailbox-check.yml | MAN | dispatch | inalterado | — | pilot-replies-mailbox-check | ACC_RISK_ALERTS_INBOUND_* (4) | leitura | ≤ 5 min | active |
| pilot-single-alert.yml | MAN | dispatch | inalterado | — | pilot-single-alert | ACC_RISK_ALERTS_CRON_SECRET | `send` envia **um** alerta a um destinatário da allowlist | ≤ 10 min | active |
| risk-alerts-weg-dry-run.yml | MAN | dispatch | inalterado | — | risk-alerts-weg-dry-run | ACC_RISK_ALERTS_CRON_SECRET | prévia sem envio | ≤ 10 min | active |
| ssma-drive-photo-sync.yml | OP | schedule `0 */2 * * *` + dispatch | **dispatch** | pg_cron acc-ssma-drive | ssma-drive-photo-sync | GOOGLE_DRIVE_CLIENT_ID/_SECRET/_REFRESH_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | lê Google Drive, grava fotos SSMA; sem e-mail | ≤ 15 min; 12/dia (antes até 24) | disabled_manually |
| ssma-notifications.yml | OP | schedule `15 * * * *` + dispatch(dry_run) (job só rodava em prévia com pg_cron) | **dispatch** (dry_run) | pg_cron acc-ssma-notifications chama a rota direto | ssma-notifications | CRON_SECRET | rota `/api/cron/ssma-notifications`: **e-mail de ação corretiva SSMA em atraso ao responsável** + confirmações (escopo WEG_CORRECTIVE_ACTIONS) | 1 curl | disabled_manually |
| weekly-samples-diagnostic.yml | MAN | dispatch | inalterado | — | (sem grupo) | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | leitura | ≤ 15 min | active |
| weekly-schedule-email-ingestion.yml | OP | schedule `20 * * * *` + dispatch | **dispatch** (inputs project_id, phase) | pg_cron acc-weekly-all (`phase=all`) | weekly-schedule-email-ingestion | GOOGLE_GMAIL_INBOUND_* (4), ACC_RISK_ALERTS_INBOUND_* (4), ACC_RISK_ALERTS_CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | lê Gmail, grava cronogramas/comparações/alertas; fase replies **enfileira confirmações na outbox** (envio pela rota de riscos) | ≤ 15 min; 144/dia (antes 24 do GitHub + 144) | disabled_manually |
| xlsx-extractor-diagnostic.yml | MAN | dispatch | inalterado | — | (sem grupo) | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY | leitura | ≤ 30 min | active |

Resumo: 30 workflows — 1 CI (inalterado), 2 watchdogs (inalterados), 16 manuais (inalterados),
11 operacionais. Destes, **9 perderam o `schedule`** (7 despachados pelo pg_cron + ssma-notifications cuja
rota o pg_cron chama + contract-alert-batches coberto pelo cron Vercel) e **2 mantêm** por decisão pendente
(alert-reminders, gmail-owner-mailbox-sync — ambos continuam desabilitados).

## Por workflow: condição de reativação e rollback

Regra geral de rollback de um workflow despachado pelo pg_cron (escolher **uma** fonte, nunca as duas):

- **Voltar ao GitHub schedule:** 1) `select cron.alter_job(jobid, active := false) from cron.job where jobname = '<job>';`
  2) readicionar no YAML o bloco abaixo, em commit próprio e revisado. Os `if:` de job que pulam `schedule`
  com `ACC_SCHEDULER_PG_CRON_ENABLED=true` continuam no YAML dos que os tinham: nesses, o rollback também exige
  a variável ≠ `true` (que afeta todos) — por isso prefira o rollback por job do pg_cron abaixo.
- **Parar de vez:** desabilitar o workflow no GitHub (Actions → workflow → "…" → *Disable workflow*) **e**
  desativar o job do pg_cron (senão o watchdog acusa `DISPATCH_FAILED` com HTTP 422).

| Workflow | Bloco removido (para rollback) | Reativar quando | Rollback |
|---|---|---|---|
| document-processing-worker.yml | `schedule: - cron: "*/5 * * * *"` | fila de versões documentais pendentes conferida; secrets presentes | desativar `acc-document-worker` e/ou *Disable workflow* |
| mpp-document-worker.yml | `schedule: - cron: "*/5 * * * *"` | document-processing-worker estável (o MPP processa as versões criadas pelo semanal) | desativar `acc-mpp-worker` e/ou *Disable workflow* |
| ssma-drive-photo-sync.yml | `schedule: - cron: "0 */2 * * *"` | pasta do Drive do piloto confirmada; somente fotos, sem e-mail | desativar `acc-ssma-drive` e/ou *Disable workflow* |
| weekly-schedule-email-ingestion.yml | `schedule: - cron: "20 * * * *"` | MPP worker estável; `ACC_WEEKLY_REPORTS_ENABLED=true`; decisão sobre a fase replies (enfileira confirmações) | desativar `acc-weekly-all` e/ou *Disable workflow* |
| gmail-inbound-sync.yml | `schedule: - cron: "*/15 * * * *"` | já ativo (pg_cron `acc-gmail-sync` ativo) | desativar `acc-gmail-sync`; readicionar schedule só com ele desligado |
| construmanager-content-ingestion.yml | `schedule: - cron: "17 */6 * * *"` | já ativo | idem com `acc-construmanager` |
| diario-de-obra-sync.yml | `schedule: - cron: "43 0 * * *"` (o pg_cron envia sempre `mode=incremental`) | já ativo | idem com `acc-diario`; o passo "Garantir incremental" volta a valer no `schedule` |
| ssma-notifications.yml | `schedule: - cron: "15 * * * *"` | **somente depois** de proteger os casos SSMA históricos (abaixo) | desativar `acc-ssma-notifications`; ou `ACC_SSMA_NOTIFICATIONS_ENABLED≠true` na Vercel (rota responde 204) |
| contract-alert-batches.yml | `schedule: - cron: "10 10 * * 3"` | não precisa de schedule: o cron Vercel `weekly-alert-digest` já roda os lotes | readicionar schedule só se o cron Vercel deixar de chamar `runContractAlertBatches()` |
| alert-reminders.yml | (nada removido) | decisão do responsável | já desabilitado |
| gmail-owner-mailbox-sync.yml | (nada removido) | decisão do responsável | já desabilitado |

## Passos do responsável (GitHub UI + pg_cron), na ordem segura

Cada passo: habilitar o workflow **e** ativar o job do pg_cron correspondente; aguardar 1–2 ciclos; conferir
no painel do agendador (heartbeats: disparo 204 → início → conclusão `success`) e só então seguir.
Não precisa mais desabilitar `schedule`: ele não existe nos workflows despachados.

1. **Enable workflow** em `document-processing-worker.yml`: GitHub → *Actions* → "Document Processing Worker"
   → botão **Enable workflow**. Depois, no SQL Editor:
   `select cron.alter_job(jobid, active := true) from cron.job where jobname = 'acc-document-worker';`
   Conferir 2 execuções `workflow_dispatch` com sucesso (nenhuma `schedule`).
2. **Enable workflow** em `mpp-document-worker.yml` ("MPP Document Worker") → ativar `acc-mpp-worker`.
3. **Enable workflow** em `ssma-drive-photo-sync.yml` ("SSMA Drive Photo Sync") → ativar `acc-ssma-drive`.
4. **Enable workflow** em `weekly-schedule-email-ingestion.yml` ("Weekly Schedule Email Ingestion") → ativar `acc-weekly-all`.
5. `ssma-notifications`: **só depois** de proteger os casos SSMA históricos (ações corretivas antigas não podem
   gerar avisos de atraso retroativos; conferir a prévia `dry_run=true` do workflow manual e a lista de
   destinatários). Com isso confirmado: ativar `acc-ssma-notifications` (o pg_cron chama a rota direto).
   Habilitar o workflow `ssma-notifications.yml` é opcional — ele serve apenas para a prévia manual.
6. **Permanecem desabilitados, aguardando decisão:**
   - `alert-reminders.yml` — envia e-mails de lembrete ao responsável de cada alerta a cada 30 min, fora do
     escopo controlado do piloto WEG, e **nenhum** agendador principal o cobre (não há job pg_cron nem cron
     Vercel). Decisão: migrar para um job `acc_scheduler_call_route` (nova migration) ou manter desligado.
     Enquanto isso, não habilitar: o `schedule` próprio voltaria a disparar fora do pg_cron.
   - `contract-alert-batches.yml` — envia lotes de alertas contratuais por e-mail; a mesma função já roda pelo
     cron Vercel `weekly-alert-digest` (quarta 10:00 UTC). Habilitar criaria envio duplicado/concorrente.
     Mantido só como acionamento manual; decidir se o workflow deve ser removido.
   - `gmail-owner-mailbox-sync.yml` — lê caixas **pessoais** de titulares (agendado = gravação, `apply=true`)
     e depende de consentimento por slot; o cadastro WEG REV.05 mudou os titulares. Decisão: titulares e
     consentimento confirmados, e se passa ao pg_cron (novo job) antes de qualquer reativação.
7. Pendência separada (fato observado): o ciclo `/api/cron/risk-alerts` está sem chamador automático
   (`acc-risk-alerts` inativo). Reativar `acc-risk-alerts` é decisão do piloto de alertas, fora deste PR.
