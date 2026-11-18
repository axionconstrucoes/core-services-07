# Agendador do ACC e SLA crítico — proposta para decisão (18/11/2026)

> **Status: CÓDIGO PREPARADO (PR draft #203). NADA INSTALADO.**
> - A migration `20261118093000_scheduler_pg_cron_dispatch.sql` **não** foi aplicada.
> - O pg_cron **não** está autorizado.
> - Nenhum token foi criado e nenhum segredo foi gravado no Vault.
> - Nenhum plano foi contratado.
> - Nenhum job está agendado e nenhuma latência abaixo foi medida com o agendador em operação.

## 1. Situação medida (fato)

Período: 14/11 00:00Z → 18/11 ~01:46Z (≈ 97,8 h). Fonte: API do GitHub Actions do
repositório público (`/actions/workflows/<wf>/runs` e `/actions/runs/<id>/jobs`).

| Workflow | Cron | Esperadas | Observadas | % | Maior intervalo |
|---|---|---|---|---|---|
| gmail-inbound-sync | `*/15` | ~391 | 16 | 4,1% | 10,5 h |
| document-processing-worker | `*/5` | ~1.170 | 15 | 1,3% | 10,4 h |
| mpp-document-worker | `*/5` | ~1.170 | 16 | 1,4% | 9,7 h |
| ssma-drive-photo-sync | `0 */2` | ~49 | 14 | 29% | 9,9 h |
| construmanager-content-ingestion | `17 */6` | ~16 | 9 | 56% | 15,5 h |
| diario-de-obra-sync | `43 0` | 4 | 4 | 100% | 25,2 h |
| weekly-schedule-email-ingestion | `20 *` | ~3 (desde 17/11 22:48Z) | 0 | 0% | — |

Execuções agendadas de workflows diferentes aparecem agrupadas nos mesmos instantes.
A documentação do GitHub diz que o `schedule` "can be delayed during periods of high
loads" e que "some queued jobs may be dropped". Os dados são compatíveis com isso,
mas a causa não está comprovada.

**`workflow_dispatch` medido** (66 jobs):

| Medida | Mediana | p90 | Máximo |
|---|---|---|---|
| Fila: criação do run → início do 1º job | 4 s | 5 s | 13 s |
| weekly-schedule-email-ingestion, job ingest (phase=all) | 126 s | — | — |
| weekly-schedule-email-ingestion, job risk-alerts (WEG desligada) | 4 s | — | — |
| mpp-document-worker | 74 s | 79 s | 80 s |
| document-processing-worker | 68 s | 86 s | 90 s |
| gmail-inbound-sync | 203 s | 237 s | 275 s |

A **duração do ciclo de alertas com envios reais não foi medida**, porque a WEG
está com `risk_alerts_enabled=false`. Esse número precisa ser medido depois da
ativação.

## 2. Arquitetura proposta: duas camadas no Supabase (pg_cron + pg_net)

| Camada | Frequência | Destino exato | Por quê |
|---|---|---|---|
| **A. Alertas e escalonamento** | **a cada 2 min** | `GET https://<acc_app_base_url>/api/cron/risk-alerts` com `Authorization: Bearer <segredo>` | Ciclo leve (rota existente, `maxDuration` 300 s). Não depende do GitHub. Garante a precisão de T+61 e T+121. |
| B. Coleta e processamento | 10–15 min | `POST https://api.github.com/repos/axionconstrucoes/core-services-07/actions/workflows/<arquivo>/dispatches` com `{"ref":"main","inputs":{…}}` | Precisa de Python, Java (MPXJ) e heap de 6 GB: não cabe em função Vercel. |

### Agenda (UTC)

| Job pg_cron | Cron | Chamada |
|---|---|---|
| acc-risk-alerts | `*/2` | rota Vercel `/api/cron/risk-alerts` |
| acc-weekly-all | `*/10` | weekly-schedule-email-ingestion.yml (phase=all; inclui o job risk-alerts ao final) |
| acc-document-worker | `2-59/10` | document-processing-worker.yml |
| acc-mpp-worker | `5-59/10` | mpp-document-worker.yml |
| acc-gmail-sync | `1-59/15` | gmail-inbound-sync.yml |
| acc-ssma-drive | `0 */2` | ssma-drive-photo-sync.yml |
| acc-construmanager | `17 */6` | construmanager-content-ingestion.yml |
| acc-diario | `43 0` | diario-de-obra-sync.yml (mode=incremental) |
| acc-watchdog | `*/5` | SQL (reconciliação + incidentes) |

O `schedule` do GitHub permanece como reserva.

### A rota aceita a chamada do pg_net? (verificado no código)

- **Autenticação:** `app/api/cron/risk-alerts/route.ts` aceita `GET` e exige
  `Authorization: Bearer` igual a `ACC_RISK_ALERTS_CRON_SECRET`. A comparação é
  em tempo constante (`lib/cron/cron-request-auth.ts`), só pelo header, sem
  fallback para o `CRON_SECRET`.
- **Requisição do pg_net:** `net.http_get(url, headers, timeout_milliseconds)`
  envia exatamente esse header. O mesmo valor fica no Vault como
  `acc_risk_alerts_cron_secret`.
- **Trava da rota:** é só **por instância** (`inFlight` → HTTP 409). Na Vercel
  com Fluid Compute, duas chamadas podem cair em instâncias diferentes, então a
  trava da rota sozinha **não** impede sobreposição. Por isso a proposta tem três
  proteções adicionais:
  1. **Trava no pg_cron:** `acc_scheduler_call_risk_alerts` não chama a rota de
     novo enquanto a chamada anterior não tiver resposta em `net._http_response`
     (até 5 min).
  2. **Envio:** reivindicação atômica por linha da outbox (`claimed_at`, lease
     de 10 min, migration 20261029100000) mais chave de idempotência única.
     Ciclos simultâneos não enviam o mesmo e-mail duas vezes.
  3. **Escalonamento:** `escalate_sla_action_system` com o nível atual esperado
     (compare-and-set). Ciclos simultâneos não escalonam duas vezes.
- **Ponto de atenção:** enquanto existir bloqueio de prontidão, cada ciclo grava
  uma linha `RISK_ALERT_NOT_READY_FOR_REAL_SEND` em `audit_log_entries`. A cada
  2 min, isso dá ~720 linhas por dia. **Recomendação:** instalar o job
  `acc-risk-alerts` só depois de resolvidos os bloqueios de prontidão, ou
  deduplicar essa auditoria antes.

## 3. SQL proposto (trechos-chave; arquivo completo na migration)

```sql
-- Extensões só onde existem (o replay PGlite da CI não tem pg_cron/pg_net)
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Segredo: só funções SECURITY DEFINER do agendador leem o Vault
create function public.acc_scheduler_secret(p_name text) returns text ... security definer set search_path = ''
  ... (select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1);
revoke all on function public.acc_scheduler_secret(text) from public, anon, authenticated, service_role;

-- Camada B (GitHub)
select net.http_post(
  url := 'https://api.github.com/repos/axionconstrucoes/core-services-07/actions/workflows/' || v_target || '/dispatches',
  body := jsonb_build_object('ref','main','inputs', p_inputs),
  headers := jsonb_build_object('Authorization','Bearer '||v_token,'Accept','application/vnd.github+json',
                                'X-GitHub-Api-Version','2022-11-28','User-Agent','acc-scheduler'),
  timeout_milliseconds := 15000);

-- Camada A (rota Vercel)
select net.http_get(
  url := rtrim(v_base,'/') || '/api/cron/risk-alerts',
  headers := jsonb_build_object('Authorization','Bearer '||v_secret,'User-Agent','acc-scheduler'),
  timeout_milliseconds := 290000);   -- rota tem maxDuration 300 s

select cron.schedule('acc-risk-alerts', '*/2 * * * *', $$select public.acc_scheduler_call_risk_alerts()$$);
```

Teste: `scripts/test-scheduler-sql.mjs` (PGlite, com stubs de Vault e pg_net) prova:
- sem segredo, nada é chamado;
- endpoint, corpo e cabeçalhos corretos;
- reconciliação de 204, 200, 207, 401, 409, 422, 500, timeout e erro de rede;
- a trava de sobreposição;
- o watchdog abrindo e resolvendo incidente;
- que anon, authenticated e service_role não disparam e não leem segredo.

## 4. Permissões e segredos

| Item | Proposta |
|---|---|
| Quem executa os jobs | `postgres` (dono dos jobs do pg_cron). Nenhum grant em `cron.*` ou `net.*` para anon, authenticated ou service_role. |
| Quem lê o Vault | Só as funções `SECURITY DEFINER` do agendador (`search_path` vazio). `acc_scheduler_secret`, disparo, chamada da rota e watchdog têm `EXECUTE` revogado de public, anon, authenticated e service_role. |
| `acc_scheduler_record_heartbeat` | `EXECUTE` só para `service_role` (os workflows já usam `SUPABASE_SECRET_KEY`). |
| Tabela `acc_scheduler_heartbeats` | RLS ligada, sem policies, sem acesso para anon e authenticated. |
| Segredo `acc_github_actions_dispatch_token` | **Escopo mínimo:** fine-grained PAT ou GitHub App com acesso **somente** ao repositório `axionconstrucoes/core-services-07` e **somente** "Actions: Read and write" (a permissão de metadados "read" vem obrigatória). Nada de Contents, Secrets ou Variables. **Onde fica:** só no Supabase Vault, gravado pelo responsável no SQL Editor. Nunca em migration, chat, log ou GitHub. **Rotação:** PAT com validade de 90 dias, trocado via `vault.update_secret`. Com GitHub App, o token de instalação é renovado automaticamente, mas isso exige um passo intermediário para gerar o token; nesta proposta fica o PAT. |
| Segredo `acc_risk_alerts_cron_secret` | Cópia do `ACC_RISK_ALERTS_CRON_SECRET` que já existe na Vercel e no GitHub. Ao rotacionar, atualizar os três lugares no mesmo momento; uma divergência aparece como `ROUTE_HTTP_401`. |
| `acc_app_base_url` | `https://acc.axion.com.br`. Não é segredo; fica no Vault só para não fixar no código. Valor fora de `https://` é recusado. |

## 5. Recuperação de falhas

| Situação | O que acontece | Como o watchdog detecta |
|---|---|---|
| GitHub responde 4xx (401/403 token inválido ou sem permissão; 404 workflow; 422 input inválido) | Nada roda. Na rodada seguinte, `acc_scheduler_reconcile` grava `DISPATCH_HTTP_<código>`. O próximo tick tenta de novo. | Sem heartbeat de sucesso há mais de 3× o intervalo → incidente `scheduler:<job>` com o último código. |
| GitHub responde 5xx ou demora mais de 15 s | `DISPATCH_HTTP_5xx` ou `TIMEOUT`; o próximo tick tenta de novo. | Idem. |
| Disparo aceito (204), mas o job falha, é cancelado ou não roda | O heartbeat do workflow grava `failure`/`cancelled`. Se o job nem começar, não há heartbeat. | Sem sucesso há mais de 3× o intervalo → incidente. |
| Job travado | O `timeout-minutes` do workflow (10–20 min) encerra e registra `cancelled`/`failure`. O grupo de concorrência segura a próxima execução como pendente; não roda em paralelo. | Sem sucesso há mais de 3× o intervalo. |
| Rota: 401 (segredo divergente), 204 (relatórios semanais desligados), 207 (falha parcial de envio), 409 (em execução), 5xx | Código `ROUTE_*` registrado. O próximo tick chama de novo; envios pendentes são retomados pela outbox. | Sem 200 há mais de 6 min → incidente. |
| Rota sem resposta (lentidão) | A trava do pg_cron não chama de novo por até 5 min. Depois disso chama mesmo assim; a outbox e o compare-and-set impedem duplicidade. | `TIMEOUT` após 290 s. |
| pg_net falha (erro de rede, worker parado) | `NET_ERROR`. Resposta perdida (tabela unlogged ou retenção de 6 h esgotada) vira `RESPONSE_EXPIRED`. | Incidente pelo intervalo. |
| pg_cron parado (banco reiniciado, extensão desligada) | Nada roda, **e o watchdog também não**. | **Lacuna:** o watchdog depende do próprio pg_cron. Cobertura externa existente: o cron diário `system-health` da Vercel. Recomendação: incluir nele a checagem de `acc_scheduler_heartbeats` (não implementado). |

O watchdog **registra** incidentes em `acc_system_health_incidents`. Ele **não
envia e-mail**; avisar alguém imediatamente é uma decisão separada.

## 6. Latência (estimativa a partir das medidas; não é garantia)

Componentes:
- espera até o tick: 0–10 min (coleta) ou 0–2 min (alertas);
- fila do GitHub: 4–13 s;
- duração dos jobs, conforme a tabela da seção 1;
- ciclo de alertas: segundos com a WEG desligada; com envios reais, **não medido**.

| Caminho | Típico | Pior caso sem falha | Por falha de uma etapa |
|---|---|---|---|
| Cronograma .mpp por e-mail → alerta | ~15–20 min | ~25–35 min | +10 min |
| Planilha semanal por e-mail → alerta | ~20–25 min | ~35–45 min | +10–15 min |
| Prazo SLA vencido → e-mail de escalonamento (camada A, 2 min) | ≤ 2 min + duração do ciclo | ~2 min + duração do ciclo | +2 min |
| Mesmo caso só com a camada B (rota chamada ao fim do weekly a cada 10 min) | ~5 min + ~2,3 min | ~10 min + ~2,3 min | +10 min |
| Situação atual (`schedule` do GitHub) | horas | 10–25 h observados | — |

### Precisão dos escalonamentos CRÍTICOS (decisão: responsável 1 h corrida, Gestor em T+61, Diretoria em T+121)

| Cadência do ciclo | Gestor (T+61) | Diretoria (T+121) |
|---|---|---|
| **2 min (camada A, recomendada)** | entre T+61 e ~T+63, mais a duração do ciclo e o envio pelo Gmail | entre T+121 e ~T+123, mais a duração do ciclo e o envio |
| 10 min (só GitHub) | entre T+61 e ~T+73 (10 min de espera + ~2,3 min do job ingest + 4–13 s de fila) | entre T+121 e ~T+133 |
| 15 min | até ~T+78 | até ~T+138 |

Pré-requisito: a Matriz da WEG tem **duas regras gerais ativas** para CRITICAL:
- regra A: escalonamento 2 em 1 h, Diretoria em 2 h;
- regra B: escalonamento 2 em 2 h, Diretoria em 3 h.

O mesmo vale para HIGH: escalonamento e Diretoria em 4/4 h, ou em 6/8 h.

`resolveMatrixRule` usa a primeira regra devolvida pelo banco, sem ORDER BY. A
decisão (Gestor em T+61, Diretoria em T+121) corresponde à regra A, mas **a regra
B continua ativa**. Enquanto ela não for desativada, a precisão acima não vale
para todos os casos.

## 7. Custo e dependências (verificados)

- **Supabase:** a organização já está no plano **Pro**; `pg_cron` 1.6.4 e
  `pg_net` 0.20.4 estão disponíveis e não instalados. Não há cobrança separada
  documentada pelas extensões.
  - Recomendação da Supabase: até 8 jobs simultâneos, cada um com até 10 min.
    Aqui cada job só enfileira um HTTP (milissegundos).
  - Fontes: https://supabase.com/docs/guides/cron e
    https://supabase.com/docs/guides/database/extensions/pg_net (assíncrono,
    envia após o commit, respostas guardadas por 6 h, tabelas unlogged, API beta).
- **GitHub Actions:** gratuito com runners padrão em repositório público
  (https://docs.github.com/en/billing/concepts/product-billing/github-actions).
- **Vercel (plano atual indicado como Hobby).** A camada A gera ~21,6 mil
  invocações por mês; o limite incluído é de 1 milhão.
  - **Memória provisionada:** o limite incluído é de 360 GB-h por mês.
    - Ciclo de 10 s com 2 GB: ~120 GB-h por mês.
    - Ciclo de 30 s com 2 GB: ~360 GB-h por mês, **todo o limite do Hobby**.
  - **Riscos para o plano:**
    - a duração real do ciclo precisa ser medida antes de instalar;
    - se passar do limite, o Hobby suspende o recurso por 30 dias
      (https://vercel.com/docs/plans/hobby);
    - mitigação: reduzir para 3–5 min ou contratar o Pro (US$ 20/mês por membro).
- **Alternativas descartadas:**
  - Vercel Pro cron chamando as rotas não cobre a coleta (Python, Java, 6 GB de
    memória; o Pro tem 4 GB e 800 s).
  - Vercel Schedules no Hobby: a cada 15 min, com jitter de 15 min e até 5.000
    execuções por mês.
  - `schedule` do GitHub: 1–56% de execução observada.
  - Fontes: https://vercel.com/docs/cron-jobs/usage-and-pricing,
    https://vercel.com/docs/schedules/limits,
    https://vercel.com/docs/functions/limitations.

## 8. Decisões necessárias

1. Aprovar a aplicação da migration `20261118093000_scheduler_pg_cron_dispatch.sql`. Hoje não está autorizada.
2. Criar o token GitHub com o escopo mínimo da seção 4 e gravar os 3 segredos no Vault.
3. Desativar a regra CRITICAL B e a regra HIGH duplicada, conforme a decisão Gestor T+61 / Diretoria T+121.
4. Medir a duração do ciclo de alertas com envios reais e confirmar a cadência da camada A (2 min) frente ao limite de memória do Hobby.
5. Instalar o `acc-risk-alerts` só depois de resolvidos os bloqueios de prontidão (ou deduplicar a auditoria `RISK_ALERT_NOT_READY_FOR_REAL_SEND`).
6. Decidir se incidentes do agendador devem notificar alguém imediatamente, e incluir a checagem dos heartbeats no `system-health`.
7. Decidir quando remover o `schedule` do GitHub. Recomendação: depois de 7 dias de heartbeats estáveis.
