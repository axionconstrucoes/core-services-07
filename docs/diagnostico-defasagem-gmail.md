# Diagnóstico da defasagem do Gmail (Fase 7 / H6b)

Data: 21/11/2026. Natureza: **somente leitura** (Gmail: `gmail.readonly`, só metadados; GitHub: só páginas de Actions; Supabase operacional: só `SELECT`). Nada foi gravado, nenhum cursor alterado, nenhum workflow disparado, nenhum segredo lido. Não há conteúdo de mensagem, endereço de terceiros nem credencial neste documento (só IDs opacos do Gmail, datas, contagens e nomes de variáveis).

Legenda: **COMPROVADO** = observado diretamente (código em `main` 09fda9b, consulta ao banco ou ao Gmail); **INFERIDO** = consistente com as provas, não observado diretamente; **BLOQUEADO** = não foi possível verificar.

## 1. Resposta curta

1. **Causa-raiz da mensagem WEG ausente (18/11): COMPROVADA.** Em `main` (09fda9b) a regra do piloto WEG (`scripts/lib/gmail-weg-pilot-sender.mjs`) só aceita mensagem cujo **único remetente** é `@weg.net` exato, e o prefiltro enviado ao Gmail é só `from:weg.net`. A mensagem ausente é uma **recebida de terceiro com `weg.net` apenas em `To`**. Ela nunca virou candidata, em nenhuma execução. A regra nova (qualquer participante From/To/Cc/Bcc, inclusive subdomínios) já existe no commit a99d623 (Fase 5/A), **que não está em `main`** (`git merge-base --is-ancestor a99d623 main` = falso) e, portanto, **nunca rodou nos workflows**.
2. **"Enviadas só até 28/10": não é perda de dados da WEG.** No Gmail não há **nenhuma** mensagem enviada com participante WEG depois de 17/09 (4 enviadas WEG no total desde 20/08, as 4 estão no banco). As 19 enviadas gravadas depois de 18/09 (até 28/10) têm 0 com `weg.net`: são mensagens internas/outras, aceitas pela regra antiga (todos os participantes em `axion.com.br`/`weg.net` + palavra-chave). Depois de 11/11 a regra de `main` (único remetente `@weg.net`) **exclui por construção toda mensagem enviada** — defeito latente, sem perda observada porque não houve enviada WEG no período.
3. **"Recebidas só até 11/11": era a data de gravação (`created_at`), não de envio.** A última recebida gravada tem `sent_at` = 05/11/2026 12:39 UTC (gravada às 15:42 de 05/11); 11/11 é o dia do backfill manual. Corrige o relatório da H3.
4. **Reconciliação Gmail × banco desde 20/08/2026 (caixa do titular, prefiltro WEG): 58 mensagens no Gmail, 57 no banco, 1 ausente** (a de 18/11). COMPROVADO.
5. **`corazza@`: COMPROVADO que nenhum workflow lê essa caixa.** O sincronizador agendado tem a caixa fixa no YAML (`GOOGLE_GMAIL_INBOUND_MAILBOX` = caixa do titular, com as credenciais `GOOGLE_GMAIL_REYNALDO_*`); o workflow de caixas de titulares (slots 1 e 2) conclui em 12–15 s (INFERIDO: saída antecipada por falta dos segredos `GOOGLE_GMAIL_TITULAR_<N>_MAILBOX/_REFRESH_TOKEN`; o log em si exige login). Não há linha de autorização individual para `corazza@` em `email_access_authorizations` (só a do titular: `AUTORIZADO`) e há 0 mensagens dela no banco.
6. **O gate `email_mailbox_collection_controls` (ausente no operacional) NÃO causa a defasagem.** Só é consultado no modo `DOMAIN_DELEGATION` (workflow manual `gmail-delegated-sync`), onde **falha fechado com mensagem explícita e `exit 1`** (`prepareDelegatedRun` → `CONTROLS_MISSING_MESSAGE`), nunca em silêncio. O caminho OAuth agendado só lê `email_access_authorizations` (existe) e as tabelas legadas `project_email_ingestion_*` (existem).

## 2. Evidências por fonte

### 2.1 Código e workflows (COMPROVADO, `main` 09fda9b)

| Item | Achado |
|---|---|
| `gmail-inbound-sync.yml` | `cron */15 * * * *` + `workflow_dispatch`; `concurrency: gmail-inbound-sync` (sem cancelar); `permissions: contents: read`; `timeout-minutes: 10`; sem condição `if` no passo de sync; segredos por NOME: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GOOGLE_GMAIL_REYNALDO_CLIENT_ID/_CLIENT_SECRET/_REFRESH_TOKEN`; caixa fixa no YAML; segundo passo `gmail-ata-ingestion-worker.mjs` (anexos/atas); heartbeat `gmail-sync` início/fim (`continue-on-error`). |
| Cursor | `project_email_ingestion_configs.last_sync_at` (hoje `window_mode = FROM_NOW`, `enabled = true`, sem `custom_start/end`). Janela `after = last_sync_at − 10 min`, `before = início da execução`; ao final `last_sync_at = fim da execução`. O cursor **sempre avança** mesmo sem candidatas: o que não for candidata na sua janela nunca é reavaliado. |
| Caixa lida | Uma só: a do titular, no incremental, no backfill histórico e no recover. `corazza@` está na tabela `project_email_ingestion_mailboxes` (`enabled`), mas **nenhum workflow a seleciona**. |
| Pastas/labels | Sem filtro de label: a consulta é por tempo + participantes, `includeSpamTrash: false`; recebidas e enviadas entram pelo mesmo critério. |
| Regra do piloto em `main` | `pilotSenderMatches`: `from.length === 1` e `@weg.net` exato; `pilotSenderQuery` = `from:weg.net`. Recebida de terceiro com WEG em To/Cc e **qualquer enviada** são recusadas/nem listadas. Os commits 6091c0e/f4d1f4c (11/11) criaram essa regra. |
| Regra na base H6b (a99d623 + de10e7c) | Qualquer participante From/To/Cc/Bcc em `weg.net` ou `*.weg.net` (fronteira de domínio); prefiltro `{from to cc bcc}:weg.net`. |
| `gmail-owner-mailbox-sync.yml` | `cron 7,37 * * * *`, matriz de slots 1 e 2, passo inicial verifica a existência dos segredos do slot e, sem eles, encerra com `::notice::` (sem ler nada). |
| `gmail-delegated-sync.yml` | Só manual; exige `GOOGLE_WIF_PROVIDER` (declarado pendente); falha fechada sem a tabela de controles. |

### 2.2 Banco operacional (COMPROVADO; só contagens/datas/IDs opacos)

- `emails` Gmail da caixa do titular: 510 recebidas (última `sent_at` 05/11 12:39 UTC; última gravação 11/11 14:24 UTC, backfill) e 168 enviadas (última `sent_at` 28/10 10:11; última gravação 28/10 12:49). 32 linhas sem provider (último 19/11), não Gmail. 0 linhas de `corazza@`.
- Depois de 18/09: enviadas 19 (0 com `weg.net`); recebidas 56 (26 com `weg.net`, última 05/11).
- Config: domínios `axion.com.br` (AXION) e `weg.net` (CLIENT); caixas habilitadas: titular e `corazza@`; `last_sync_at` = 21/11 11:02 UTC (avança a cada 15 min).
- Cadência de execuções (auditoria `EmailIngestionRun`): até 18/11 apenas 3–6 execuções/dia (o cron do GitHub é "melhor esforço"); **a partir de 19/11, 82–96/dia** (execuções "Manually run" por `axionconstrucoes` a cada ~15 min; o heartbeat `gmail-sync` do agendador registrou isso). Em todas as execuções de 12/11 a 21/11: 0 novas, 0 duplicadas, **0 rejeitadas** — isto é, o Gmail devolvia **zero candidatas**, coerente com a consulta `from:weg.net` e com a mensagem de 18/11 não ter remetente WEG. (A mensagem de 05/11 tinha remetente WEG e foi gravada em 3 h, por causa da cadência de 4–8 h do cron daquela data.)
- Cursor: as execuções de 18/11 18:04 e 19/11 00:20 UTC têm cursor contínuo (`entity_id` = fim da execução); a janela de 19/11 00:20 cobria 19:57 de 18/11 e devolveu 0 — o cursor **não** pulou a mensagem; a consulta é que não a listava.
- Tabelas `email_mailbox_collection_controls` e `email_sync_runs`: inexistentes (migrations pendentes). `email_access_authorizations`: existe.

### 2.3 Gmail (COMPROVADO; credencial local já usada pela H3; só `gmail.readonly`, só metadados)

- Mensagem ausente: id opaco `1a1f03c6ab8ae858`, 18/11/2026 19:57:28 UTC, INBOX/IMPORTANT, **recebida**, `weg.net` só em **To** (From e Cc sem WEG). Recebida e indexada em 6 s (Date = internalDate; cabeçalhos Received em +3 a +6 s): **sem atraso de entrega/indexação**.
- Reprodução da consulta exata do sincronizador legado **com a regra nova** para a janela real da execução de 19/11 00:20 (17:54 → 00:20): devolve 1 candidata e contém o id (com e sem `includeSpamTrash`). Com a regra antiga (`from:weg.net`) a mensagem não casa: não há remetente WEG.
- Reconciliação (`scripts/diagnostico-gmail/identificar-ausentes.mjs`, 20/08 → hoje): 58 no Gmail (recebidas 54, enviadas 4); 57 no banco; ausente: apenas `1a1f03c6ab8ae858`. Desde 25/10 só existem 2 mensagens WEG na caixa (05/11 e 18/11).
- Subdomínios: nenhuma das 58 tem só subdomínio; **se o operador `from:weg.net` do Gmail casa subdomínios continua NÃO VERIFICADO**. A regra de elegibilidade aceita `*.weg.net`; o prefiltro do Gmail pode não listá-los (ver 5, plano de cobertura).

### 2.4 Logs do GitHub Actions (parcialmente BLOQUEADO)

- Repositório hoje em `github.com/axionconstrucoes/core-services-07` (o remoto `axion-contract-intelligence` redireciona). Aba nova no navegador do responsável, apenas leitura.
- **Visível sem login (COMPROVADO):** lista, evento, duração, conclusão, commit, passos de cada job. `Gmail Inbound Sync`: 922 execuções, a mais recente em andamento, as anteriores `success` em ~3 min; agendadas: últimas em 21/11 09:05, 01:55, 20/11 20:52, 12:50, 04:07, 19/11 23:22... (intervalo de 4–8 h = throttling do cron). `Gmail Owner Mailbox Sync`: 10 execuções, todas `success`, 12–15 s, última 21/11 04:13 UTC, intervalo ~8 h (e não 30 min).
- **BLOQUEADO:** o **texto dos logs** ("Sign in to view logs": o navegador do responsável não está autenticado no GitHub). Comando alternativo (máquina do responsável, `gh` autenticado): `gh run view 44895904934 --repo axionconstrucoes/core-services-07 --log` e `gh run list --repo axionconstrucoes/core-services-07 --workflow gmail-owner-mailbox-sync.yml --limit 20`. Os logs só mostram contagens (`candidatas`, `inseridas`) e nomes de segredos mascarados.

## 3. Causa-raiz e nível de evidência

| Sintoma | Causa | Nível |
|---|---|---|
| 1 mensagem WEG de novembro ausente | Regra/prefiltro de `main` exigem remetente `@weg.net`; mensagem tem WEG só em To | **Comprovada** (código em main + metadados do Gmail + consulta reproduzida + auditoria com 0 candidatas) |
| Enviadas só até 28/10 | Antes de 11/11: regra de domínios permitidos (internas); depois: regra `from` único WEG exclui toda enviada. Não há enviada WEG no Gmail após 17/09 | **Comprovada** (contagens), com defeito latente comprovado em código |
| Recebidas "até 11/11" | Confusão entre `created_at` (backfill) e `sent_at` (05/11) | **Comprovada** |
| `corazza@` sem mensagens | Nenhum workflow lê a caixa; slots de titular sem segredos; sem autorização individual | Comprovada (código/banco); falta de segredos nos slots **inferida** (duração 12–15 s; log bloqueado) |
| Gate ausente | Só afeta o modo manual de delegação, com falha fechada ruidosa | **Comprovada** (código) |
| Cadência real do agendador | cron do GitHub dispara a cada 4–8 h; a partir de 19/11 há execuções manuais a cada 15 min | **Comprovada** (lista de Actions + auditoria) |

Descartado (COMPROVADO): atraso de entrega, mensagem em spam, cursor que "pula" a janela, falha do job (todas `success`), segredo ausente no sincronizador agendado, gate de controles.

## 4. Correção segura proposta (nada aplicado fora do repositório)

1. **Levar a regra da Fase 5/A para `main`** (commit a99d623 + de10e7c, via o fluxo de integração já planejado): é a correção do código (qualquer participante, inclusive Cc/Bcc e subdomínios, e enviadas). Já está nesta base, com 32 verificações em `scripts/test-gmail-weg-pilot-sender.mjs` e 6 novas em `scripts/diagnostico-gmail/test-diagnostico-gmail.mjs` (provam: regra de `main` recusa a recebida com WEG em To e a enviada; a regra nova aceita; prefiltro cobre from/to/cc/bcc).
2. **Só depois do deploy da regra**, recuperar a mensagem ausente por backfill com janela explícita (ver 5). Rodar o backfill com o código antigo **não** a recuperaria (a regra antiga a recusaria).
3. Passo do responsável (nada a fazer no Google Admin para esta causa).
4. Endurecimento opcional (não implementado, aguarda decisão): rotina de **reconciliação periódica** (por exemplo diária) que reexecuta `identificar-ausentes.mjs` e alerta se houver diferença Gmail × banco; hoje o cursor só avança e nunca reavalia.

## 5. Plano de recuperação (sem alterar cursores sem autorização)

1. Merge/deploy da regra nova em `main` (autorização do responsável).
2. Workflow manual `Gmail Historical Backfill (manual)` em **dry-run**: `start = 2026-11-18T19:00:00Z`, `end = 2026-11-18T21:00:00Z` (ou `2026-11-05T00:00:00Z` → agora para cobrir o mês). Esperado no dry-run: 1 candidata nova, demais "já existentes". O workflow não altera `last_sync_at` e é idempotente (índice único por caixa+mensagem).
3. Conferido o dry-run (a contagem aparece em `audit_log_entries`, tipo `EmailIngestionRun`), repetir em `mode = apply` com a mesma janela e o mesmo `end`.
4. Reconferir com `node scripts/diagnostico-gmail/identificar-ausentes.mjs --env <arquivo .env> --since 2026-08-20` e a consulta de comparação de IDs: esperado 58 × 58.
5. Subdomínios `*.weg.net`: executar, em ambiente de homologação, uma leitura "universo" (sem prefiltro de termo) por mês com a sonda `gmail-coverage-probe.mjs` e comparar com o prefiltro; só então decidir se o prefiltro precisa trocar `from:weg.net` por busca sem termo + filtro local.
6. `corazza@`: depende do responsável — fornecer os segredos do slot de titular (`GOOGLE_GMAIL_TITULAR_<N>_MAILBOX` e `_REFRESH_TOKEN`, cliente próprio opcional) e o aceite individual, **ou** habilitar delegação (`docs/gmail-delegacao-dominio-passo-a-passo.md`, exige as migrations do gate). Até lá a caixa continua sem leitura, **por desenho do workflow**.

## 6. Relatório de cobertura atualizado (substitui os pontos desatualizados de `docs/relatorio-cobertura-gmail.md`)

| Tema | Estado | Nível |
|---|---|---|
| Caixa do titular | Lida a cada 15 min; 57 de 58 mensagens WEG (20/08→hoje) no banco; 1 ausente por regra de `main` | Comprovado |
| `corazza@` | 0 mensagens; nenhuma rotina a lê; sem aceite individual | Comprovado (slots sem segredo: inferido) |
| "Slot INBOUND sem linhas" (H3, lacuna 2) | **Descartada**: a caixa fixa no YAML do sincronizador **é** a do titular | Comprovado |
| `weg.net` exato | Coberto (aceita From/To/Cc/Bcc **na base H6b**; em `main` só remetente) | Comprovado |
| Subdomínios `*.weg.net` | Elegibilidade aceita; listagem pelo prefiltro `from:weg.net` do Gmail não verificada; 0 casos só-subdomínio nas 58 | Não verificado |
| Deduplicação | Índice único `(project_id, provider, mailbox_address, provider_message_id)` + checagem prévia + inserção idempotente; 0 duplicadas observadas | Comprovado |
| Reconciliação | Manual, por esta ferramenta; não há rotina periódica | Comprovado |
| Cc/Bcc persistidos | Não (colunas da migration 20261201100000 pendentes); a elegibilidade os usa, o banco não os guarda | Comprovado |
| Gate por caixa | Ausente; só barra o modo de delegação | Comprovado |
| Logs de Actions | Lista/duração/passos lidos; texto dos logs bloqueado por login | Bloqueado (comando `gh` na seção 2.4) |

## 7. Arquivos desta frente

- `scripts/diagnostico-gmail/identificar-ausentes.mjs` — lista metadados mínimos do prefiltro WEG desde uma data (id opaco, data, rótulos, direção, campo onde WEG aparece). Só GET pelo `guardedFetch` da sonda.
- `scripts/diagnostico-gmail/reproduzir-janela.mjs` — reproduz a consulta do sincronizador para uma janela e informa quantas candidatas e se um id conhecido está nelas.
- `scripts/diagnostico-gmail/test-diagnostico-gmail.mjs` — 6 testes puros (rodar com `node scripts/diagnostico-gmail/test-diagnostico-gmail.mjs`). Não foi incluído em `scripts/test-scripts.list` (arquivo de outra frente): a integração deve acrescentar a linha.
