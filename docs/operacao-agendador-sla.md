# Agendador do ACC e SLA — proposta para decisão (revisão de 18/11/2026)

> **Status: CÓDIGO PREPARADO no PR draft #203. NADA INSTALADO.**
>
> - A migration `20261118093000_scheduler_pg_cron_dispatch.sql` **não** foi aplicada; o pg_cron **não** está autorizado.
> - Nenhum token foi criado e nenhum segredo foi gravado no Vault.
> - A variável `ACC_SCHEDULER_PG_CRON_ENABLED` não existe no GitHub.
> - Nenhum plano foi contratado.
> - Nenhuma latência abaixo foi medida com o agendador em operação.

## 1. Situação medida (fato)

Período: 14/11 00:00Z → 18/11 ~01:46Z. Fonte: API do GitHub Actions.

| Workflow | Cron | Esperadas | Observadas | % | Maior intervalo |
|---|---|---|---|---|---|
| gmail-inbound-sync | `*/15` | ~391 | 16 | 4,1% | 10,5 h |
| document-processing-worker | `*/5` | ~1.170 | 15 | 1,3% | 10,4 h |
| mpp-document-worker | `*/5` | ~1.170 | 16 | 1,4% | 9,7 h |
| ssma-drive-photo-sync | `0 */2` | ~49 | 14 | 29% | 9,9 h |
| construmanager-content-ingestion | `17 */6` | ~16 | 9 | 56% | 15,5 h |
| diario-de-obra-sync | `43 0` | 4 | 4 | 100% | 25,2 h |

A documentação do GitHub diz que o `schedule` "can be delayed during periods of
high loads" e que "some queued jobs may be dropped". Os dados são compatíveis com
isso, mas a causa não está comprovada.

Medidas de `workflow_dispatch` (66 jobs):

| Medida | Mediana | p90 | Máximo |
|---|---|---|---|
| Fila: criação do run → início do 1º job | 4 s | 5 s | 13 s |
| weekly (job ingest, phase=all) | 126 s | — | — |
| mpp-document-worker | 74 s | 79 s | 80 s |
| document-processing-worker | 68 s | 86 s | 90 s |
| gmail-inbound-sync | 203 s | 237 s | 275 s |
| **Rota `/api/cron/risk-alerts?dryRun=1` (WEG)**: passo do workflow, 3 execuções de 18/11 | **7–8 s** | — | 8 s |

O dry-run lê e planeja tudo, mas não envia. Com envios reais, somam-se as chamadas
ao Gmail; essa duração ainda **não foi medida**.

## 2. Arquitetura: Supabase pg_cron + pg_net

| Job pg_cron | Cron (UTC) | Destino | Papel |
|---|---|---|---|
| acc-risk-alerts | `*/2` | `GET <base>/api/cron/risk-alerts`, `Bearer ACC_RISK_ALERTS_CRON_SECRET` | riscos: planejamento, escalonamento (Gestor/Diretoria), envio pela outbox |
| acc-ssma-notifications | `3-59/5` | `GET <base>/api/cron/ssma-notifications`, `Bearer CRON_SECRET` (rota pública desde #225) | SSMA: ação corretiva em atraso, rede de segurança de registros críticos, confirmações de resposta |
| acc-weekly-all | `*/10` | `POST …/actions/workflows/weekly-schedule-email-ingestion.yml/dispatches` `{"ref":"main","inputs":{"phase":"all"}}` | intake, promote, compare, classify, workbook, alerts e **replies** (respostas de riscos e de SSMA na crm@) |
| acc-document-worker | `2-59/10` | `…/document-processing-worker.yml/dispatches` | planilhas e relatórios |
| acc-mpp-worker | `5-59/10` | `…/mpp-document-worker.yml/dispatches` | cronograma .mpp |
| acc-gmail-sync | `1-59/15` | `…/gmail-inbound-sync.yml/dispatches` | e-mails e anexos |
| acc-ssma-drive | `0 */2` | `…/ssma-drive-photo-sync.yml/dispatches` | fotos SSMA no Drive |
| acc-construmanager | `17 */6` | `…/construmanager-content-ingestion.yml/dispatches` | Construmanager |
| acc-diario | `43 0` | `…/diario-de-obra-sync.yml/dispatches` `{"mode":"incremental"}` | Diário de Obra |
| acc-watchdog | `*/5` | SQL | reconciliação e incidentes |
| acc-cron-history-cleanup | `30 3` | SQL | mantém 7 dias de `cron.job_run_details` |

O `schedule` do GitHub nos workflows de coleta fica como **reserva**. As
duplicatas são absorvidas pelos grupos de concorrência
(`cancel-in-progress: false`) e pela idempotência dos fluxos.

## 3. Prazo × frequência × atraso máximo

| Canal / prazo (regras da Matriz) | Frequência | Atraso adicional máximo, sem falha | Resultado |
|---|---|---|---|
| Riscos CRÍTICO, Gestor em **T+61** | 2 min | ≤ 2 min + duração do ciclo (dry-run 7–8 s; envio real a medir) | e-mail entre T+61 e ~T+63 |
| Riscos CRÍTICO, Diretoria em **T+121** | 2 min | idem | entre T+121 e ~T+123 |
| Riscos ALTO (4 h úteis) e MÉDIO/BAIXO (dias úteis) | 2 min | ≤ 2 min | folga ampla |
| SSMA CRÍTICA (→ CRITICAL, 1 h corrida) | 5 min | ≤ 5 min + duração da rota (não medida) | compatível com 1 h; ±5 min de precisão |
| SSMA ALTA (→ HIGH, **4 h úteis**) | 5 min | ≤ 5 min | folga ampla |
| SSMA ação corretiva em atraso (aviso diário por ação e prazo) | 5 min | ≤ 5 min | folga ampla |
| **Respostas por e-mail** (riscos e SSMA, fase replies) | 10 min | ≤ 10 min de espera + 4–13 s de fila + ~2,1 min (replies é a última fase do job) ≈ **≤ 12,5 min** | ver atenção abaixo |
| Comparação: só GitHub a cada 10 min | 10 min | até ~T+73 / ~T+133 | — |
| Situação atual (`schedule` do GitHub) | — | 10–25 h observados | incompatível |

**Respostas × escalonamento (PR #227, mesclado em main, commit 6b33462, em produção no deployment `dpl_FjuniCLazYFKFXqkSUrJEVBFEuhY`).**
A leitura periódica (≤ ~12,5 min) não pode transformar resposta recebida em ausência de resposta:
- **(a) Recebimento confiável:** a hora usada é o `internalDate` do Gmail, separada da hora de processamento. `RISK_ALERT_REPLY_RECEIVED` registra as duas.
- **(b) Verificação antes de escalonar:** o ciclo consulta a caixa monitorada pontualmente, só leitura, pelo Reply-To opaco (comparando o hash do token) e pela thread do alerta.
  - Se há resposta do caso recebida até o prazo e ainda não processada, o escalonamento **fica retido** nesta rodada: sem e-mail, com `RISK_ALERT_ESCALATION_HELD_PENDING_REPLY`.
  - A retenção dura no máximo 30 min após o prazo. Passado isso, segue com `RISK_ALERT_ESCALATION_REPLY_PENDING_PROCESSING`.
- **Credencial: a rota Vercel hoje NÃO tem a leitura da caixa monitorada.** As variáveis `ACC_RISK_ALERTS_INBOUND_*` (gmail.readonly da crm@) existem só nos segredos do GitHub. Enquanto não forem gravadas na Vercel, toda verificação resulta em "não verificado" (item e). Gravá-las é uma decisão.
- **(c) Correção:** se o escalonamento já ocorreu e a resposta tinha sido recebida antes dele, grava-se `RISK_ALERT_ESCALATION_REPLY_CORRECTION` ("não houve ausência de resposta"), sem apagar histórico.
- **(d) Resposta incompleta:** o recebimento é registrado, e a falta de previsão vira `RISK_ALERT_REPLY_FORECAST_PENDING`, em registro separado.
- **(e) Caixa indisponível** (sem credencial, conta errada, erro do Gmail): o escalonamento segue com `RISK_ALERT_REPLIES_NOT_VERIFIED` ("NÃO significa que o responsável não respondeu").
- **Cenário testado** (`scripts/test-reply-before-escalation.mjs`): resposta recebida em T+59, ciclo em T+61 e processamento em T+65.
  - Em T+61, com verificação disponível, o escalonamento fica retido.
  - Em T+61, sem verificação, segue marcado como "não verificado".
  - Em T+65, o processamento registra o recebimento em T+59 e a correção do escalonamento de T+61.
- **SSMA:** o escalonamento SSMA (#226) ainda **não** chama a verificação. A função `checkRepliesBeforeEscalation` está pronta para isso, mas falta a correlação própria das respostas SSMA. Pendência registrada.
- Os botões de ação do e-mail gravam na hora e não dependem da leitura.

**Pré-requisito da Matriz.** Há duas regras CRITICAL ativas:
- regra A: Gestor em 1 h, Diretoria em 2 h;
- regra B: Gestor em 2 h, Diretoria em 3 h.

Há também duas regras HIGH: 4/4 h e 6/8 h. `resolveMatrixRule` usa a primeira
regra devolvida pelo banco, sem ORDER BY. A decisão "Gestor T+61 / Diretoria
T+121" é a regra A; enquanto a regra B estiver ativa, a precisão acima não vale
para todos os casos. A frente de escalonamento SSMA, em andamento, deve usar
essas mesmas regras.

## 4. Origem única das rotas e travas contra ciclos concorrentes

**Origem única.** Com `ACC_SCHEDULER_PG_CRON_ENABLED=true` (variável de
repositório no GitHub):
- **o job `risk-alerts` do workflow semanal não roda**, por condição explícita no
  `if:` do job;
- **o workflow `ssma-notifications` não chama a rota**; só roda como prévia
  manual (`dry_run=true`).

Com isso, `/api/cron/risk-alerts` e `/api/cron/ssma-notifications` passam a ter
um único chamador agendado, o pg_cron. Sem a variável, tudo continua como hoje.

**Travas, verificadas no código.**

| Trava | Onde | Protege contra |
|---|---|---|
| Não chamar de novo enquanto a chamada anterior não tiver resposta (até 5 min) | `acc_scheduler_call_route` (pg_cron) | sobreposição de ciclos disparados pelo agendador |
| `inFlight` → HTTP 409 | `route.ts` de riscos e de SSMA | concorrência **na mesma instância** (não entre instâncias) |
| Reivindicação atômica da outbox (`claimed_at`, lease de 10 min, UPDATE condicional por `status=PENDING`) | `supabase-store.claimOutbox`, migration 20261029100000 | dois ciclos enviando o mesmo e-mail |
| Chave de idempotência única por caso, nível e janela (`risk_alert_outbox.idempotency_key`) | `enqueue` (upsert) | o mesmo alerta enfileirado duas vezes |
| `escalate_sla_action_system(p_expected_current_level, …)` (compare-and-set) | `applyEscalations` | escalonamento aplicado duas vezes |
| Aviso SSMA único por ação, prazo e destinatário | `sweepFieldNotifications` (comentário do workflow) | aviso SSMA repetido |

## 5. Auditoria repetitiva: implementada neste PR

- **Antes:** cada ciclo gravava `RISK_ALERT_NOT_READY_FOR_REAL_SEND` com os mesmos
  bloqueios. A cada 2 min seriam ~720 linhas por dia.
- **Agora** (`apps/web/lib/risk-alerts/readiness-audit.ts` e
  `run-risk-alert-cycle.ts`):
  - grava `NOT_READY` só quando o **conjunto de bloqueios muda** (ordenado e sem
    repetição);
  - grava `RISK_ALERT_READY_FOR_REAL_SEND` uma vez quando os bloqueios se
    resolvem, citando o estado anterior;
  - rodadas sem mudança não gravam auditoria;
  - o resultado do ciclo expõe `readinessAudit` (`RECORDED_NOT_READY`,
    `RECORDED_READY`, `UNCHANGED_NOT_READY` ou `NONE`).
- **Contador e última ocorrência:** `acc_repeated_conditions` (`first_seen_at`,
  `last_seen_at`, `occurrences`) via RPC `acc_bump_repeated_condition`.
  - É best-effort: sem a migration, não há contador e nada falha.
- **Segurança da mudança:**
  - se a leitura da última linha falhar, grava como antes (rastreabilidade
    primeiro);
  - a primeira rodada após o deploy pode gravar **uma** linha nova, porque a
    linha legada não tinha a lista ordenada.
- **Testes:** `scripts/test-readiness-audit-dedupe.mjs`.
- **Outras auditorias por rodada observadas** (não alteradas; candidatas ao mesmo
  tratamento):
  - "Sincronização incremental Gmail executada": 27 em 7 dias hoje; com 15 min
    seriam ~96 por dia;
  - `WEEKLY_ABSENCE_ALERT_DETECTED_LATE`.

## 6. Disparo aceito × início × conclusão (heartbeats)

| Estado | Quem grava | Coluna |
|---|---|---|
| Disparo aceito (HTTP 204) | o agendador, lendo `net._http_response` na rodada seguinte | `last_dispatch_at`, `last_dispatch_http_status` |
| **Início real** | passo `Heartbeat do agendador (início)` logo após o checkout: `started` + `GITHUB_RUN_ID` | `last_started_at`, `last_started_run_id` |
| **Conclusão efetiva** | passo final `if: always()`: `finished` + `job.status` + run_id | `last_finished_at`, `last_finished_run_id`, `last_conclusion` |
| Rota concluída | HTTP 200 da rota | `last_success_at` |

**O que o watchdog acusa (a cada 5 min).** Abre um incidente por job e motivo
(`scheduler:<job>:<motivo>`) e o resolve quando o motivo deixa de valer:
- `DISPATCH_FAILED`: 4xx, 5xx, timeout ou erro de rede no disparo;
- `DISPATCH_WITHOUT_START`: 204, mas sem início em 15 min;
- `STARTED_WITHOUT_FINISH`: início sem conclusão após 20–30 min, acima do
  `timeout-minutes`;
- `JOB_FAILED`: conclusão `failure` ou `cancelled`;
- `ROUTE_FAILURE`: rota com 207, 401, 409, 204, 5xx, timeout ou erro de rede
  depois do último 200;
- `NO_RECENT_SUCCESS`: mais de 3× o intervalo sem sucesso.

O watchdog **não envia e-mail**.

Workflows com passos de início e conclusão: weekly, mpp, document, gmail-sync,
ssma-drive, construmanager e diario. Os passos usam `continue-on-error` e nunca
falham o job; sem a migration, não têm efeito.

## 7. SQL (trechos-chave; arquivo completo na migration)

```sql
-- Vault só pelas funções do agendador
create function public.acc_scheduler_secret(p_name text) returns text language plpgsql stable security definer set search_path = '' …
revoke all on function public.acc_scheduler_secret(text) from public, anon, authenticated, service_role;

-- Workflow GitHub
net.http_post(url := 'https://api.github.com/repos/axionconstrucoes/core-services-07/actions/workflows/'||v_target||'/dispatches',
  body := jsonb_build_object('ref','main','inputs',p_inputs),
  headers := {Authorization: Bearer <token>, Accept: application/vnd.github+json, X-GitHub-Api-Version: 2022-11-28}, timeout_milliseconds := 15000)

-- Rotas Vercel (riscos/SSMA), com trava de sobreposição por start_grace
net.http_get(url := rtrim(<acc_app_base_url>,'/') || hb.target, headers := {Authorization: Bearer <segredo da rota>}, timeout_milliseconds := 290000)

-- Heartbeat (service_role): started/finished com run_id e conclusão
public.acc_scheduler_record_heartbeat(p_job, p_event, p_run_id, p_run_attempt, p_conclusion)

select cron.schedule('acc-risk-alerts','*/2 * * * *',$$select public.acc_scheduler_call_route('risk-alerts')$$);
select cron.schedule('acc-ssma-notifications','3-59/5 * * * *',$$select public.acc_scheduler_call_route('ssma-notifications')$$);
```

**Permissões**
- Os jobs rodam como `postgres`. Nenhum grant em `cron.*` ou `net.*`.
- As funções de disparo, rota, segredo, reconciliação e watchdog não podem ser
  executadas por public, anon, authenticated nem service_role.
- `acc_scheduler_record_heartbeat` e `acc_bump_repeated_condition` aceitam somente
  service_role.
- As tabelas têm RLS ligada, sem policies e sem acesso para anon e authenticated.

**Testes:** `scripts/test-scheduler-sql.mjs` (PGlite com stubs de Vault e pg_net).

## 8. Segredos

| Nome no Vault | Valor | Escopo mínimo | Onde gravar | Rotação |
|---|---|---|---|---|
| `acc_github_actions_dispatch_token` | PAT fine-grained | só `axionconstrucoes/core-services-07`; "Actions: Read and write" (+ "Metadata: Read", obrigatória); nada de Contents, Secrets ou Variables | SQL Editor do Supabase: `select vault.create_secret('<valor>','acc_github_actions_dispatch_token');` | validade de 90 dias; trocar com `vault.update_secret` antes de vencer. Token inválido aparece como `DISPATCH_FAILED` (`DISPATCH_HTTP_401`/`403`) |
| `acc_risk_alerts_cron_secret` | = `ACC_RISK_ALERTS_CRON_SECRET` | só a rota de riscos | Vault (mesmo comando) | trocar na Vercel, no GitHub e no Vault ao mesmo tempo; divergência gera `ROUTE_HTTP_401` |
| `acc_cron_secret` | = `CRON_SECRET` | rotas cron da Vercel (SSMA) | Vault | idem |
| `acc_app_base_url` | `https://acc.axion.com.br` | não é segredo | Vault | só se o domínio mudar (só `https` é aceito) |

## 9. Consumo estimado

- **GitHub Actions** (repositório público, runners padrão: **gratuito**):
  - weekly: 144 por dia × 3 min faturáveis;
  - mpp: 144 × 2;
  - document: 144 × 2;
  - gmail: 96 × 4–5;
  - ssma-drive, construmanager e diario: ~34 min por dia somados;
  - total ≈ **1.470 min/dia ≈ 44 mil min/mês**, custo US$ 0;
  - chamadas à API de disparo: ~545 por dia (~23 por hora), contra o limite de
    5.000 por hora por token;
  - simultaneidade: ≤ 3 jobs, contra o limite de 20.
- **Vercel** (plano atual indicado como Hobby: 1 milhão de invocações, 4 h de
  Active CPU e 360 GB-h por mês):
  - **Medição real** (18/11, produção `dpl_FjuniCLazYFKFXqkSUrJEVBFEuhY`; campo `metrics` da resposta, `process.cpuUsage`):

    | Rota | Execuções | CPU (ms) | Tempo de parede (ms) |
    |---|---|---|---|
    | `/api/cron/risk-alerts?dryRun=1` (WEG) | 3 (runs 44301308932, 44301498170, 44301661778) | 147 / 366 / 482 | 4.896 / 4.920 / 6.684 |
    | `/api/cron/ssma-notifications?dryRun=1` | 2 (runs 44301330405, 44301681716) | 53 / 50 | 2.380 / 3.909 |

    - O Hobby não dá acesso às métricas de CPU da Vercel (Observability Plus: HTTP 402) e guarda só 1 h de logs. Por isso a medição foi feita pela própria rota.
    - `process.cpuUsage` mede o processo inteiro, então o valor é um **teto** por chamada.
    - O dry-run planeja tudo, mas **não envia**. O ciclo real com envios ainda não foi medido, porque a WEG está desligada.
  - **Projeção mensal com a cadência proposta:**
    - riscos a cada 2 min (21.600 chamadas): **0,9–2,9 h de CPU** (147–482 ms) e **~59–80 GB-h**;
    - SSMA a cada 5 min (8.640 chamadas): **~0,12 h de CPU** e **~11–19 GB-h**;
    - **total do agendador: ~1,0–3,0 h de CPU, contra 4 h incluídas no Hobby**, sem contar o uso normal da aplicação (não mensurável no Hobby) nem o envio real.
  - **Conclusão.** Pela medição, a cadência de 2 min **cabe** no Hobby, mas com folga de apenas ~1–3 h para todo o resto da aplicação. Se o limite for excedido, o Hobby suspende o recurso por 30 dias (https://vercel.com/docs/plans/hobby), o que derrubaria a aplicação.
  - **Decisão, sem alterar intervalos nem SLA:**
    - (A) manter o Hobby e monitorar a CPU pela resposta das rotas, aceitando o risco de suspensão;
    - (B) Pro a US$ 20/mês por membro, que troca o limite fixo por cobrança por uso (Active CPU a partir de US$ 0,128/h) e libera as métricas da Vercel e 1 dia de logs.
  - **Recomendação: (B)**, porque o pior caso medido (2,9 h) já consome ~73% do Hobby só com o agendador.
- **Supabase (Pro atual):**
  - pg_cron + pg_net sem cobrança separada documentada;
  - ~2.700 execuções de job por dia, mantidas por 7 dias pela limpeza;
  - `net._http_response` tem retenção de 6 h;
  - a recomendação da Supabase (≤ 8 jobs simultâneos, ≤ 10 min cada) é atendida,
    porque cada job só enfileira um HTTP.

## 10. Latência total (estimativa; não é garantia)

| Caminho | Típico | Pior caso sem falha | Por falha de uma etapa |
|---|---|---|---|
| Cronograma .mpp por e-mail → alerta | ~15–20 min | ~25–35 min | +10 min |
| Planilha semanal por e-mail → alerta | ~20–25 min | ~35–45 min | +10–15 min |
| Prazo vencido → e-mail de escalonamento (riscos) | ≤ 2 min + ciclo | ~2 min + ciclo | +2 min |
| Prazo vencido → aviso SSMA | ≤ 5 min + rota | ~5 min + rota | +5 min |
| Resposta por e-mail → registrada | ~6 min | ~12,5 min | +10 min |

A fila do GitHub (4–13 s) já está incluída. Para alertas e SSMA, a camada de rota
não passa pelo GitHub.

## 11. Instalação, se aprovada (ordem)

1. Criar o PAT com o escopo da §8 e gravar os 4 valores no Vault.
2. Aplicar a migration. Os jobs começam imediatamente.
3. Definir `ACC_SCHEDULER_PG_CRON_ENABLED=true` (variável de repositório no GitHub) logo em seguida. Entre os passos 2 e 3 há duas origens por alguns minutos; as travas da §4 evitam duplicidade.
4. Acompanhar `acc_scheduler_heartbeats` e `acc_system_health_incidents` por 24 h.

## 12. Reversão passo a passo

**Ordem obrigatória: parar o pg_cron → esperar terminarem as chamadas e os workflows já disparados → só então
reabilitar os chamadores do GitHub → conferir o retorno.** Inverter isso (flag `false` antes de parar o pg_cron) abre
uma janela com duas origens chamando as mesmas rotas, e um `weekly-all` já disparado pelo pg_cron (evento
`workflow_dispatch`, fase `all`) executaria também o job `risk-alerts`.

1. **Parar o agendador do banco (SQL Editor):**
   `select cron.unschedule(jobname) from cron.job where jobname like 'acc-%';`
   (inclui `acc-watchdog` e `acc-cron-history-cleanup`). Conferir: `select count(*) from cron.job where jobname like 'acc-%';` deve retornar 0.
2. **Confirmar que nada ficou em andamento** (só avançar quando TODOS os itens estiverem limpos; repetir a conferência
   a cada minuto até limpar, no máximo ~15 min — o timeout das rotas é de 290 s e o lease da outbox é de 10 min):
   - **Chamadas às rotas (pg_net):** `select count(*) from net.http_request_queue;` deve ser 0 e
     `select job, last_dispatch_request_id, last_reconciled_request_id from public.acc_scheduler_heartbeats where last_dispatch_request_id is distinct from last_reconciled_request_id;`
     não deve retornar linhas com `last_dispatch_at` dentro de `start_grace`; `last_dispatch_at` deixou de avançar.
   - **Workflows já disparados (GitHub):** `gh run list --status in_progress --limit 50` e `gh run list --status queued --limit 50`
     sem nenhum run de `weekly-schedule-email-ingestion.yml`, `ssma-notifications.yml`, `mpp-document-worker.yml`,
     `document-processing-worker.yml`, `gmail-inbound-sync.yml`, `ssma-drive-photo-sync.yml`,
     `construmanager-content-ingestion.yml` ou `diario-de-obra-sync.yml`.
   - **Outbox:** `select count(*) from public.risk_alert_outbox where claimed_at > now() - interval '10 minutes';` deve ser 0
     (nenhum envio reivindicado e possivelmente em curso).
   - Se algum item não limpar, NÃO reabilitar o GitHub: investigar primeiro (run travado, chamada sem resposta).
3. **Reabilitar os chamadores do GitHub:** `ACC_SCHEDULER_PG_CRON_ENABLED=false` (ou apagar a variável). O job
   `risk-alerts` do weekly e o workflow `ssma-notifications` voltam a chamar as rotas; o `schedule` do GitHub volta a ser
   a origem única.
4. **Conferir o retorno:**
   - `select count(*) from cron.job where jobname like 'acc-%';` continua 0;
   - na próxima janela horária, `gh run list --workflow weekly-schedule-email-ingestion.yml --limit 3` mostra o run
     `schedule` e o job `risk-alerts` executado (não `skipped`); idem `ssma-notifications.yml` no minuto 15;
   - nenhum envio fora do escopo do piloto na auditoria e na `risk_alert_outbox`;
   - lembrar que o `schedule` do GitHub é irregular (ver §1): a conferência pode levar mais de uma hora.
5. **Opcional (segredos), somente depois do passo 4:**
   - `delete from vault.secrets where name in ('acc_github_actions_dispatch_token','acc_risk_alerts_cron_secret','acc_cron_secret','acc_app_base_url');`
   - revogar o PAT no GitHub (Settings → Developer settings → Fine-grained tokens).
6. **Opcional (objetos):** manter as tabelas e funções como histórico (recomendado), ou removê-las:
   - `drop function public.acc_scheduler_*`;
   - `drop table public.acc_scheduler_heartbeats, public.acc_repeated_conditions`.

   A extensão pg_net/pg_cron só deve ser removida se nada mais a usar.
7. A deduplicação de auditoria (§5) independe do agendador e pode permanecer.

**Critérios para acionar a reversão** (qualquer um): resposta HTTP diferente de 200 em 2 ciclos seguidos de uma rota;
`ROUTE_HTTP_401`; heartbeat sem `started` ou sem `finished` por mais de 30 min; qualquer e-mail fora do escopo do piloto;
escalonamento de caso retido ou de reemissão.

## 13. Decisões necessárias

0. Gravar na Vercel as variáveis de leitura da caixa monitorada (`ACC_RISK_ALERTS_INBOUND_*`, gmail.readonly da crm@), para a verificação de respostas antes de escalonar funcionar. Sem elas, a verificação fica "não verificado".
0. Escolher o plano da Vercel: (A) Hobby com monitoramento ou (B) Pro, recomendado (§9).

1. Aprovar a migration e a instalação. Hoje não estão autorizadas.
2. Criar o PAT e gravar os segredos.
3. Desativar as regras CRITICAL e HIGH duplicadas (regra A = T+61/T+121).
4. Medir o Active CPU e a duração da rota de riscos com envio real, e confirmar a cadência de 2 min (ou 5 min) frente ao Hobby.
5. Decidir se a leitura de respostas vai para uma rota Vercel mais frequente (§3, atenção às respostas).
6. Definir quem recebe aviso imediato de incidentes do agendador.
7. Decidir quando remover o `schedule` do GitHub (sugestão: após 7 dias de heartbeats estáveis).
