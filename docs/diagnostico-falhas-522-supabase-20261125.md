# Diagnóstico e correção — falhas HTTP 522 do Supabase nos workflows (25/11/2026)

Branch: `fix/acc-resiliencia-522` (a partir de `origin/main` = `0a207a74`). **Sem push e sem deploy.**
Backup do estado anterior: `refs/backup/pre-resiliencia-2026-11-25-{head,origin-main,ssma-wip}` (o WIP de
`feat/ssma-esg-limpa` foi preservado intacto, inclusive o que estava em stage).

Legenda: **[FATO]** comprovado por log, banco ou teste · **[HIPÓTESE]** plausível, não comprovado · **[RECOMENDAÇÃO]**.

## 1. Falhas investigadas (últimas 72 h)

| Run | Workflow | Hora (UTC) | Requisição que falhou (edge log Supabase) | Erro visto no job |
|---|---|---|---|---|
| 45483507884 | Document Processing Worker | 24/11 20:43 | GET `document_versions` → 522 | HTML do Cloudflare |
| 45507578241 | Weekly Schedule Email Ingestion | 24/11 23:10 | GET `project_weekly_schedule_ingestion_configs` → 522 | HTML do Cloudflare |
| 45511881518 | Weekly Schedule Email Ingestion | 24/11 23:41 | GET `project_weekly_schedule_ingestion_configs` → 522 | HTML do Cloudflare |
| 45538773637 | Gmail Inbound Sync | 25/11 03:16 | **PATCH** `project_email_ingestion_configs` (checkpoint) → 522 | HTML do Cloudflare |
| 45552370563 | Gmail Inbound Sync | 25/11 05:16 | GET `project_email_ingestion_configs` → 522 | “Configuração de ingestão não encontrada.” (**mensagem enganosa**) |
| 45557522911 | Gmail Inbound Sync (worker de atas) | 25/11 06:01 | 3× GET `email_attachments` → 522 | 3 falhas `ingest.store_or_db` |
| 45588517558 | Gmail Inbound Sync | 25/11 09:46 | GET `project_email_ingestion_configs` → 522 | “Configuração de ingestão não encontrada.” (**mensagem enganosa**) |
| 45614499169 | Gmail Inbound Sync | 25/11 12:31 | GET `project_email_ingestion_mailboxes` → 522 | HTML do Cloudflare |
| 45634909882 | Gmail Inbound Sync | 25/11 14:32 | GET `project_email_ingestion_domains` → 522 | HTML do Cloudflare |
| **45660161019** (#1333) | Gmail Inbound Sync | 25/11 17:02 | GET `project_email_ingestion_mailboxes` → 522 | HTML do Cloudflare; heartbeat inicial “falha de rede” |
| 45662575871 | Construmanager Metadata Monitoring | 25/11 17:15 | GET `project_integrations` → 522 | `FALHA: <!DOCTYPE html>` |

## 2. Causa imediata e causa raiz

**Causa imediata [FATO]:** em todas as 11 falhas, uma única requisição ao Supabase recebeu **HTTP 522** do Cloudflare
e o script abortou. Os 19 eventos 522 das últimas 24 h têm o mesmo perfil: ponto Cloudflare **DFW**, origem
**runners do GitHub Actions** (IPs Azure EUA), `origin_time` entre **19,2 e 19,8 s**, que é o tempo-limite de conexão do
Cloudflare até a origem. Ou seja, a conexão TCP com o Supabase em `sa-east-1` não foi estabelecida. Nenhum 522 veio
do app web.

**Saúde do banco [FATO]:** sem FATAL/PANIC/reinício nos logs do Postgres das janelas; 16/60 conexões; nenhuma transação
`idle in transaction`; nenhuma consulta ativa longa; base de 72 MB; advisors de saúde sem alertas. As demais requisições do
mesmo minuto foram atendidas com 200/204. A queda do volume nas janelas de falha é o próprio job que abortou cedo,
não uma indisponibilidade do projeto.

**Causa raiz do lado do ACC [FATO]:** os workers não repetiam falhas transitórias. O `@supabase/postgrest-js` 2.111 só
repete **520 e 503** em GET (`RETRYABLE_STATUS_CODES = [520, 503]`), então **522 nunca era repetido**, e o corpo HTML do
Cloudflare virava `error.message`. O heartbeat abortava em 15 s, antes de o Cloudflare devolver o 522 (~19 s).

**Causa do 522 na infraestrutura [HIPÓTESE]:** instabilidade intermitente no caminho Cloudflare (DFW) → origem Supabase
`sa-east-1`. Não é verificável do nosso lado. Para confirmar, abrir chamado no suporte Supabase com os `cf-ray` dos logs
(ex.: `a60238eaab8d3eb7`, `a5fc178b1e763cdf`).

**“Configuração de ingestão não encontrada” [FATO + HIPÓTESE]:** o edge log mostra 522 no GET de configuração nos dois
runs (05:16:26 e 09:46:59). **[FATO]** O script tratava “erro sem mensagem” como “não encontrada”. **[HIPÓTESE]** O
mecanismo exato pelo qual o cliente ficou sem mensagem não foi reproduzido: um 522 com corpo HTML produz mensagem HTML,
e um 522 com corpo vazio produz mensagem vazia. A correção cobre os dois casos.

**Autenticação OAuth do Gmail [FATO]:** nenhuma falha de OAuth nos logs examinados.

**Aviso de depreciação do Node.js 20 [FATO]:** vem de `actions/checkout@v4`, `actions/setup-node@v4`,
`actions/setup-python@v5`, `actions/setup-java@v4` e `actions/github-script@v7`.

## 3. Sobreposição GitHub Actions × pg_cron

- **[FATO]** Com `ACC_SCHEDULER_PG_CRON_ENABLED=true`, o pg_cron de produção dispara `gmail-sync` (:01/:16/:31/:46),
  `construmanager` (17 */6) e `diario` (43 0). Os YAML **mantinham `schedule`** do GitHub, que ainda dispara de vez em
  quando. Em 72 h houve 2 runs `schedule` do Gmail e 2 do Construmanager, além dos disparos do pg_cron; o run
  45662575871 (falha das 17:15) é um deles. O grupo de `concurrency` serializa, mas não evita a execução em dobro.
- **[FATO]** O projeto **acc-homolog** tem os **11 jobs pg_cron ativos**, rodando sem efeito porque o Vault do homolog
  tem **0 segredos**: `acc_scheduler_dispatch_workflow` retorna sem token e nenhuma chamada HTTP é feita
  (`net._http_response` vazio). **Risco latente:** gravar o token de dispatch no Vault do homolog faria o homolog disparar os
  workflows de **produção** do mesmo repositório (`core-services-07`, ref `main`). **[RECOMENDAÇÃO]** Desativar os jobs no
  homolog ou apontar o homolog para outro alvo. Isso não foi alterado.

## 4. Recuperação e dados pendentes

- **[FATO]** Gmail: checkpoint `last_sync_at` = 25/11 19:47 UTC (em dia). Duplicidades: **0** em `emails`
  (`project_id, provider_message_id`) e **0** em `email_attachments` (`email_id, gmail_attachment_id`).
- **[FATO]** O worker de atas se recuperou sozinho: o run seguinte (45688422266) processou 32 de 34 com **0 falhas**. Os 2
  restantes são “pendente permanente por indisponibilidade já registrada” (estado anterior, não ligado ao incidente).
- **[FATO]** O Construmanager se recuperou no disparo seguinte do pg_cron (18:17, sucesso). Weekly, Document e MPP
  workers estão **desativados manualmente** no GitHub (pg_cron inativo), sem execução pendente.
- **[PONTO DE ATENÇÃO]** Último e-mail novo gravado em `emails`: **23/11 18:02 UTC**. As execuções bem-sucedidas
  registram “Mensagens candidatas: 0”. Pode ser apenas falta de mensagens no escopo do piloto, mas vale confirmar na
  caixa se houve e-mail do projeto desde então.
- **[FATO]** `email_attachments`: 420 em `PENDING` e 153 `PROCESSED`, com pendências desde 09/2026. É um passivo
  anterior ao incidente e está fora do escopo desta correção.

## 5. Correções implementadas

1. **`scripts/lib/resilient-fetch.mjs`**: retry centralizado.
   - Status transitórios 408, 429, 502, 503, 504 e 520–524.
   - Backoff exponencial com jitter e teto de 30 s; 5 tentativas.
   - **Retry-After** respeitado, em segundos ou como data HTTP.
   - Escrita não idempotente (POST/PATCH) só é repetida quando a requisição comprovadamente **não chegou** à origem
     (408/429/503/521/522/523 ou erro de conexão). 502, 504, 520, 524 e ECONNRESET são ambíguos e não são repetidos, o
     que evita duplicidade.
   - Upsert (`Prefer: resolution=…`) e métodos idempotentes repetem em qualquer status transitório.
   - Não empilha com o retry próprio do postgrest-js (GET 503/520).
   - Corpo HTML ou vazio de erro transitório vira JSON curto (`HTTP 522 (Cloudflare: Connection timed out) … após N
     tentativa(s)`, `code=HTTP_522`, `details=cf-ray=…`).
   - Log em uma linha por tentativa: `[acc-retry] service=… op="MÉTODO /caminho" attempt=n/N result=… action=…`, sem
     query string, chave ou corpo.
   - Atua **só no host do Supabase**: Gmail, Construmanager e Diário passam intactos.
2. **`scripts/lib/install-resilient-fetch.mjs`**: instala o mecanismo via `NODE_OPTIONS=--import=…`, no mesmo padrão
   de `block-live-ai.mjs`. Isso cobre os ~35 scripts e os processos filhos sem editar cada um. A válvula
   `ACC_RESILIENT_FETCH_DISABLED=1` desliga o mecanismo sem deploy.
3. **Heartbeat** (`scripts/scheduler-heartbeat.mjs`): 4 tentativas, timeout de 25 s por tentativa (era 15 s, menor que os
   19 s do Cloudflare). A RPC é idempotente: um UPDATE na linha do job com o mesmo `run_id`, comprovado no banco de testes.
   Continua sem falhar o workflow.
4. **`scripts/gmail-inbound-sync.mjs`**: uma falha de comunicação ao ler a configuração agora diz “Falha ao ler a
   configuração de ingestão (HTTP 522 …)”. “Não encontrada” só aparece quando o PostgREST confirma ausência
   (PGRST116/406). A regra de negócio foi preservada.
5. **`sanitize-error.ts` (Construmanager)**: uma página HTML de erro vira “Resposta HTML de erro HTTP 5xx; corpo
   omitido.” em vez de `<!DOCTYPE html>`.
6. **Workflows** (30 arquivos analisados, 24 alterados):
   - Actions em **Node 24**, fixadas por SHA: `checkout` v5.1.0, `setup-node` v5.0.0, `setup-python` v6.3.0,
     `setup-java` v5.7.0, `github-script` v8.0.0.
   - `NODE_OPTIONS` com o instalador em todos os steps de worker que usam o Supabase.
   - **Guarda de agendador único** em Gmail Sync, Construmanager e Diário: `schedule` só roda com o pg_cron desligado.
   - Os watchdogs do Construmanager e do Diário ignoram `skipped`, para não abrir issue falsa.
   - **Nenhum `continue-on-error` novo.** Os únicos que existem continuam nos heartbeats, como antes.

Não alterado: SLAs, destinatários, credenciais OAuth, regras de negócio, dados, envio real de alertas, pg_cron de
produção e de homolog, variáveis do GitHub.

## 6. Testes e resultados efetivos

- `scripts/test-resilient-fetch.mjs`: **25/25 OK**. Servidor HTTP real local imitando o PostgREST e `supabase-js` real,
  também em processo filho com o mesmo `NODE_OPTIONS` dos workflows. Cobre:
  - indisponibilidade temporária e recuperação após 522;
  - falhas consecutivas além do limite (erro curto, sem HTML);
  - Retry-After;
  - POST com 522 grava uma única vez;
  - 504 depois do commit não é repetido e não duplica;
  - checkpoint preservado na falha e retomada sem duplicidade;
  - duas execuções concorrentes (pg_cron × schedule) com falhas injetadas: 25 e-mails, 25 distintos;
  - importação de anexos com upsert idempotente;
  - heartbeat;
  - mensagem do Gmail Sync;
  - log do Construmanager;
  - ligação nos workflows.

  Inclui a **prova do defeito**: sem o instalador, o mesmo 522 chega ao script como `<!DOCTYPE html>`.
- **Banco de testes real (acc-homolog, Postgres 17), transação revertida:** todos os asserts passaram:
  - reinserção da mesma mensagem bloqueada com 23505;
  - lote com duplicada atômico, sem gravação parcial;
  - checkpoint preservado após falha no PATCH;
  - retomada com 4 e-mails e 4 distintos;
  - checkpoint avançou, e o PATCH repetido é idempotente;
  - anexo com 1 registro após 3 tentativas;
  - heartbeat chamado 3× sem linhas novas e com `run_id` correto.

  Depois do teste o homolog conferiu idêntico ao estado anterior: 0 e-mails, 0 anexos, 0 configurações.
- Regressão: suíte `test:scripts`, testes do app web (21/21), lint (0 erros), build e YAML dos 30 workflows. Os
  resultados estão no relatório da sessão.

## 7. Riscos remanescentes

- O 522 em si continua possível. O retry absorve janelas de até cerca de 1 min por requisição (5 tentativas, teto de 30 s).
  Uma indisponibilidade mais longa ainda falha o run, que é retomado no disparo seguinte pelo checkpoint.
- O custo de pior caso por requisição sobe: até cerca de 5 × 19 s mais as esperas, por volta de 2 min. Os
  `timeout-minutes` atuais (10 a 20) comportam isso, mas um run com muitas requisições degradadas pode esbarrar no
  timeout.
- Na primeira execução em produção, o `setup-node` v5 pode ter comportamento de cache ligeiramente diferente da v4.
  Validar com um `workflow_dispatch` manual.
- O risco latente do pg_cron do homolog descrito na seção 3.
