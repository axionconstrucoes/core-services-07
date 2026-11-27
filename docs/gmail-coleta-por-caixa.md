# Coleta Gmail por caixa (piloto WEG)

Data: 27/11/2026. Branch `feat/gmail-por-caixa`. Migration `20261214100000_gmail_per_mailbox_collection` (**não aplicada**;
precisa de aprovação do Dono).

Antes desta mudança, a coleta agendada (`acc-gmail-sync` → `.github/workflows/gmail-inbound-sync.yml`) lia **uma caixa
fixa** (`GOOGLE_GMAIL_INBOUND_MAILBOX: reynaldo@axion.com.br`). O cursor era único para a obra:
`project_email_ingestion_configs.last_sync_at`. Agora a execução agendada lê no **banco** quais caixas estão
autorizadas. Cada caixa é coletada em um processo próprio, com cursor, estado, erros, revogação e auditoria próprios.

## 1. Arquitetura

```
pg_cron acc-gmail-sync ──► gmail-inbound-sync.yml (mode=coleta)
                              │
                              ▼
               scripts/gmail-multi-mailbox-sync.mjs   (orquestrador)
                 1. sonda a migration 20261214100000 ──ausente──► modo histórico de UMA caixa (igual a antes) + aviso no log
                 2. lê lista da obra + email_mailbox_collection_controls + email_access_authorizations
                 3. planMailboxCollection(): COLETAR | PULADA(motivos) | LEGADA   (scripts/lib/gmail-per-mailbox.mjs)
                 4. audita o plano (audit_log_entries, GMAIL_PER_MAILBOX_PLAN)
                 5. caixa legada sem coleta por caixa ligada ──► gmail-inbound-sync.mjs (caminho histórico, inalterado)
                 6. para cada caixa COLETAR ──► processo isolado: gmail-inbound-sync.mjs com ACC_GMAIL_PER_MAILBOX=true
                                                 (+ gmail-ata-ingestion-worker.mjs para anexos/atas da caixa)
```

O que foi **reaproveitado** (já em produção):

| Peça | Onde | Papel |
|---|---|---|
| Controle por caixa | `email_mailbox_collection_controls` (migrations 20261107090000 + 20261121110000, aplicadas; tabela vazia) | autorização corporativa, aceite individual, permissão técnica, coleta ligada, período, **cursor `last_sync_at` por caixa**, `consecutive_errors` (5 erros suspendem a caixa), revogação |
| Gatilho de aceite | `email_access_authorization_sync_mailbox_control` | recusa ou revogação do aceite **desliga a coleta na hora** |
| Porta por caixa | `scripts/lib/gmail-mailbox-gate.mjs`, `scripts/lib/gmail-mailbox-run.mjs` | decisão, releitura antes de gravar (revogação efetiva), retentativa limitada, erro sem segredo |
| RPCs do coletor | `record_mailbox_technical_check`, `record_mailbox_sync_result` | teste técnico e resultado por caixa (auditados) |
| Telas | `/<obra>/autorizacoes`, `/autorizacao-email/<id>`, `/<obra>/integracoes/caixas` | pedido e decisão do aceite; autorização corporativa, habilitar, desligar, revogar |
| Dedupe por caixa | índice único `emails (project_id, provider, mailbox_address, provider_message_id)` | o mesmo id Gmail nunca entra duas vezes na mesma caixa |
| Origem entre caixas | `email_message_sources` (20261201100000) | a mesma mensagem (Message-ID) vista por outra caixa não cria nova linha em `emails`; só registra a origem |

O que a migration `20261214100000` **acrescenta** (só aditiva):

- colunas de estado visível no controle: `last_imported_message_id`/`_at` (última importada, só avança),
  `credential_source` (`OAUTH_CAIXA` | `OAUTH_SLOT_TITULAR` | `DOMAIN_DELEGATION`), `granted_scopes` (nomes curtos,
  nunca tokens) e `oauth_checked_at`;
- `project_email_ingestion_configs.include_internal_only_messages` (padrão **false**);
- RPCs `record_mailbox_collection_progress` e `record_mailbox_oauth_state` (só `service_role`) e
  `add_project_ingestion_mailbox` (Administrador da obra pela sessão, ou o Dono no SQL Editor; auditada; não autoriza
  nem liga nada).

Rollback: `supabase/rollbacks/20261214100000_gmail_per_mailbox_collection.rollback.sql`. Ele recusa
(`ROLLBACK_BLOCKED`) quando já há estado gravado ou a opção de e-mail interno está ligada. Sem a migration, o
orquestrador volta sozinho ao modo de uma caixa.

### Regras por caixa

Uma caixa é **coletada** somente quando todas as condições abaixo valem:

1. está na lista da obra (`project_email_ingestion_mailboxes.enabled`);
2. tem autorização corporativa `AUTORIZADA` e não está revogada;
3. o aceite individual é **AUTORIZADO** (`ACEITE_REGISTRADO`). A decisão mais recente vale, e o estado mais restritivo
   entre o controle e `email_access_authorizations` prevalece. **PENDENTE não é autorização**;
4. a permissão técnica está `CONFIRMADA` (teste técnico);
5. a coleta está ligada (`collection_enabled`), dentro do período (`period_start`..`period_end`), com menos de 5 erros seguidos;
6. existe credencial da própria caixa: OAuth `GOOGLE_GMAIL_<LOCAL>_*`, slot `GOOGLE_GMAIL_TITULAR_<N>_*` com
   `_MAILBOX` igual à caixa, ou delegação quando `auth_mode = DOMAIN_DELEGATION` e o executor tem a conta de serviço.
   A credencial genérica `GOOGLE_GMAIL_INBOUND_*` **nunca** é usada para outra caixa. O `getProfile` confere a conta.

Caixas que falham em alguma regra são **puladas**. O log do Actions mostra só um identificador opaco
`caixa#<hash>` e os motivos. A auditoria (`GMAIL_PER_MAILBOX_PLAN`) mostra o endereço e os motivos. Os motivos
possíveis são:

- `SEM_REGISTRO_DE_CONTROLE`
- `FORA_DA_LISTA_DA_OBRA`
- `SEM_AUTORIZACAO_CORPORATIVA`
- `ACEITE_INDIVIDUAL_PENDENTE_OU_AUSENTE`
- `ACEITE_INDIVIDUAL_RECUSADO_OU_REVOGADO`
- `PERMISSAO_TECNICA_NAO_CONFIRMADA`
- `COLETA_NAO_HABILITADA`
- `FORA_DO_PERIODO_AUTORIZADO`
- `RETENTATIVAS_ESGOTADAS`
- `REVOGADA`
- `SEM_CREDENCIAL`

**Caixa legada (Reynaldo).** Enquanto a caixa `GOOGLE_GMAIL_INBOUND_MAILBOX` não tem coleta por caixa ligada, ela
continua no caminho histórico, com o cursor da configuração da obra. Isso evita lacuna durante a transição. Quando a
coleta por caixa é ligada, ela sai do caminho histórico. Se for revogada ou recusada, não roda em nenhum dos dois.

**Cursor e retomada.**
- Cada caixa usa o próprio `last_sync_at`. Na primeira execução, a leitura começa em `period_start`.
- A janela tem sobreposição de 10 minutos, mas nunca começa antes do período nem termina depois dele.
- A leitura anda em fatias de no máximo 7 dias (`ACC_GMAIL_MAX_WINDOW_DAYS`). A carga desde 23/11 se completa em poucas
  execuções e retoma de onde parou.
- O cursor só avança em SUCESSO, e até o fim da fatia lida.
- Um erro não avança o cursor e soma 1 ao contador; no 5º erro seguido a caixa é suspensa (auditado).
- A revogação é relida imediatamente antes de gravar. Se a caixa foi revogada durante a execução, nada é gravado.

**Perímetro.**
- Entram mensagens **recebidas e enviadas** em que algum participante (From/To/Cc/Bcc) é de um domínio **externo**
  cadastrado em `project_email_ingestion_domains`. Esses domínios cobrem cliente, gerenciadora, fornecedores,
  subcontratadas, seguradoras, corretoras etc. Subdomínios contam com fronteira de ponto: `x.weg.net` sim,
  `evilweg.net` não.
- Hoje a WEG tem `weg.net` (CLIENT) como domínio externo e `axion.com.br` (AXION) como interno.
- Spam e lixeira ficam fora.
- **E-mail somente interno fica fora.** Para incluí-lo, é preciso
  `include_internal_only_messages = true`, que exige autorização do Dono e não é ligado por esta mudança.
- Anexos:
  - os metadados vêm com a mensagem;
  - os binários e as atas são ingeridos pelo mesmo worker do caminho histórico (`gmail-ata-ingestion-worker.mjs`),
    rodado por caixa com a credencial dela.

## 2. Estado em 27/11/2026 (fatos, consulta somente leitura em produção)

| Caixa | Lista da obra | Aceite individual (`email_access_authorizations`) | Controle por caixa | Registro em `email_accounts` |
|---|---|---|---|---|
| reynaldo@axion.com.br | sim (enabled) | **AUTORIZADO** (decidido 11/11/2026 13:50 UTC) | nenhum | sem linha |
| corazza@axion.com.br | sim (enabled) | **nenhum registro** | nenhum | CONNECTED desde 23/08/2026, `last_sync_at` nulo (nunca lida) |
| carlos.evandro@axion.com.br | **não** | **PENDENTE** (solicitado 27/11/2026 17:13 UTC) | nenhum | CONNECTED desde 20/11/2026, `last_sync_at` nulo |
| jaime.ramos@axion.com.br | **não** | **PENDENTE** (solicitado 27/11/2026 17:13 UTC) | nenhum | CONNECTED desde 20/11/2026, `last_sync_at` nulo |

- `email_mailbox_collection_controls`: 0 linhas.
- Domínios da obra: `weg.net` (CLIENT) e `axion.com.br` (AXION).
- Cursor da obra: `last_sync_at` = 27/11/2026 22:32 UTC.
- `emails` da obra desde 23/11: **1** mensagem (caixa reynaldo@, 23/11 17:53 UTC).
- Não existe tabela de tokens OAuth no banco. Os refresh tokens ficam **só** em segredos do GitHub e da Vercel, que
  esta consulta não lê. Por isso a validade e os escopos das credenciais de cada caixa só podem ser comprovados pelo
  teste técnico (seção 4.3).

Com o plano calculado sobre esses dados (teste `S1`), nenhuma caixa nova é coletada. Reynaldo continua no caminho
histórico. Carlos e Jaime são pulados com `SEM_REGISTRO_DE_CONTROLE`, `FORA_DA_LISTA_DA_OBRA` e
`ACEITE_INDIVIDUAL_PENDENTE_OU_AUSENTE`. Corazza é pulada com `SEM_REGISTRO_DE_CONTROLE` e
`ACEITE_INDIVIDUAL_PENDENTE_OU_AUSENTE`.

## 3. Como autorizar Carlos Evandro e Jaime Ramos

Pré-requisito: o Dono aprova e aplica a migration `20261214100000` (onda O). Sem ela, tudo continua como antes, com uma
caixa só. Faça os passos abaixo uma vez para cada pessoa. Use o **slot 1 para Carlos** e o **slot 2 para Jaime**.

### 3.1 Dono: incluir a caixa na lista da obra

No Supabase, abra **SQL Editor** no projeto `plbcvwostmdmdmrziwmd` e rode:

```sql
select public.add_project_ingestion_mailbox('00000000-0000-4000-8000-000000000001', 'carlos.evandro@axion.com.br', 'Decisão do Dono em DD/MM/2026 — piloto WEG');
select public.add_project_ingestion_mailbox('00000000-0000-4000-8000-000000000001', 'jaime.ramos@axion.com.br',   'Decisão do Dono em DD/MM/2026 — piloto WEG');
```

O resultado é um uuid por linha, e a inclusão fica auditada como `PROJECT_INGESTION_MAILBOX_ADDED`. Isso **não**
autoriza nem liga a coleta.

### 3.2 Titular: aceite individual no ACC

As solicitações já existem: estão PENDENTES desde 27/11. Se precisar reenviar, o Administrador abre
**`/<obra>/autorizacoes`** ("Autorizações de acesso aos e-mails"), escolhe o colaborador e clica em **Solicitar**. O
titular recebe um e-mail com o link `/autorizacao-email/<id>`. O link também aparece na aba Autorizações.

O que o titular vê ao abrir o link, já logado com a própria conta:

1. O título "Autorização de acesso aos e-mails da obra" e o texto versionado, com as seções:
   - Para que serve;
   - Que permissão o ACC usa (`gmail.readonly`; o texto avisa que o Google permite ler a caixa inteira e que quem limita
     à obra são os filtros do ACC);
   - Quais filtros o ACC aplica;
   - Se você não autorizar;
   - Como revogar no ACC;
   - Como revogar a permissão concedida ao Google.
2. Os botões **AUTORIZAR ACESSO PARA ESTA OBRA** e **NÃO AUTORIZAR**. Abrir a página não registra nada.
3. Depois de escolher, uma caixa de confirmação ("Li as informações acima e autorizo o ACC a usar a conta … na obra …")
   e o botão **CONFIRMAR AUTORIZAÇÃO** (ou **CONFIRMAR RECUSA**).
4. Só o próprio titular decide, e uma única vez: o banco recusa decisões de terceiros e decisões repetidas. O histórico
   aparece no fim da página.

Recusar faz a caixa ficar fora da coleta para sempre, até um novo pedido.

### 3.3 Titular + Dono: consentimento Google (OAuth, somente leitura)

Siga o procedimento reservado de `docs/gmail-caixa-titular-autorizacao.md`. O código de autorização nunca sai da máquina
do Dono.

1. Em `apps/web/.env.local` da máquina do Dono, defina `GOOGLE_GMAIL_TITULAR_1_MAILBOX=carlos.evandro@axion.com.br`
   (para Jaime: `GOOGLE_GMAIL_TITULAR_2_MAILBOX=jaime.ramos@axion.com.br`).
2. Rode o comando abaixo (para Jaime, use `TITULAR_2`):

   ```bash
   node --env-file=apps/web/.env.local scripts/gmail-inbound-oauth.mjs --prefix=GOOGLE_GMAIL_TITULAR_1 --client-prefix=GOOGLE_GMAIL_INBOUND --no-open
   ```
3. Abra uma **janela anônima** nessa máquina e cole a URL mostrada no terminal. O titular opera a janela, pessoalmente
   ou por controle remoto:
   - entra com a própria senha e o 2FA;
   - o Google mostra o nome do app do ACC pedindo para "Ver suas mensagens e configurações de e-mail" (`gmail.readonly`);
   - o titular clica em **Continuar/Permitir**;
   - o navegador volta para `localhost:53682`, e o terminal informa que o refresh token foi gravado **só** em
     `apps/web/.env.local`, sem exibi-lo.
4. Feche a janela anônima. Grave no GitHub (Settings → Secrets and variables → Actions) os segredos
   `GOOGLE_GMAIL_TITULAR_1_MAILBOX`, `GOOGLE_GMAIL_TITULAR_1_REFRESH_TOKEN`, `GOOGLE_GMAIL_TITULAR_1_CLIENT_ID` e
   `GOOGLE_GMAIL_TITULAR_1_CLIENT_SECRET`. Os dois últimos têm os mesmos valores do cliente `GOOGLE_GMAIL_INBOUND` local.
   Copie os valores do `.env.local` sem exibi-los em chat, PR ou log.
5. O workflow `gmail-owner-mailbox-sync.yml` usa os mesmos slots e deve **continuar desabilitado**. Se for reativado, a
   deduplicação por (caixa, id) impede linhas repetidas, mas a leitura seria duplicada.

### 3.4 Administrador: autorização corporativa, teste técnico e coleta

Use a tela **`/<obra>/integracoes/caixas?caixa=carlos.evandro@axion.com.br`** (Integrações › Caixas):

1. Em **Registrar autorização corporativa**, informe a referência da decisão e clique em **Registrar**. O controle da
   caixa é criado e herda o aceite individual vigente.
2. Rode o teste técnico. No GitHub, abra
   **Actions → Gmail Inbound Sync → Run workflow** (https://github.com/axionconstrucoes/core-services-07/actions/workflows/gmail-inbound-sync.yml),
   escolha a branch `main` e `mode = teste_tecnico`. O job:
   - renova a credencial da caixa;
   - lê **só o perfil**;
   - registra a origem da credencial e os escopos (`record_mailbox_oauth_state`);
   - registra a permissão técnica `CONFIRMADA` ou `FALHA`.

   Nenhuma mensagem é lida. A caixa precisa ter aceite AUTORIZADO; com aceite pendente, o teste é recusado.
3. Volte à tela e use **Habilitar coleta (período obrigatório)**: início `2026-11-23`, fim da obra (ex.: `2027-06-30`).
   Clique em **Habilitar**.
4. Opcional: rode `mode = plano` e confira no log a linha `COLETAR caixa#… credencial=OAUTH_SLOT_TITULAR`.
5. A próxima execução agendada (a cada 15 min) lê de 23/11 em diante, em fatias de 7 dias. A partir daí a leitura é
   incremental.

### 3.5 Revogação individual (a qualquer momento)

- **Titular, no ACC:** em `/autorizacao-email/<id>`, use **Revogar autorização desta obra** → confirmar →
  **CONFIRMAR REVOGAÇÃO**. O gatilho desliga a coleta da caixa **na hora** (`MAILBOX_INDIVIDUAL_CONSENT_SYNCED`). Uma
  execução em andamento relê o estado antes de gravar e não grava nada.
- **Administrador:** na aba Autorizações, revogue o aceite; ou, em Integrações › Caixas, use **Desligar** (pausa) ou
  **Revogar** (registra o motivo; o histórico é preservado).
- **Google:** o titular acessa https://myaccount.google.com/permissions → app do ACC → **Remover acesso**. O Dono
  também apaga os segredos `GOOGLE_GMAIL_TITULAR_<N>_*`. Sem credencial, a caixa passa a ser pulada com `SEM_CREDENCIAL`.

## 4. Passos do Dono no GitHub (diagnóstico)

Os workflows abaixo são **manuais e somente leitura**. Para rodar qualquer um deles:

1. abra o link do workflow;
2. clique em **Run workflow**;
3. em **Use workflow from**, escolha **Branch: main** (os jobs só rodam em `main`; em outra branch o job é pulado);
4. preencha as entradas indicadas e clique no botão verde **Run workflow**;
5. abra a execução e o passo indicado para ler a saída.

O log é público, por isso só mostra campos normalizados: nenhum e-mail, token ou segredo.

### 4.1 Pilot Gmail Auth Check

Link: https://github.com/axionconstrucoes/core-services-07/actions/workflows/pilot-gmail-auth-check.yml

**Entrada `identity` (opcional):**
- vazio: verifica a identidade institucional de envio do piloto (`crm@`);
- ou um participante autorizado a enviar, como `carlos.evandro@axion.com.br`.

**O que faz:** chama a rota `/api/cron/risk-alerts?pilotAuthCheck=1` da Vercel Production, que renova o access token
da credencial de **ENVIO** e devolve só campos normalizados. Não envia e-mail e não lê mensagens.

**Saída esperada** (passo "Call auth check"), uma linha `HTTP 200` seguida de um JSON com:

| Campo | Valor esperado |
|---|---|
| `ok` | `true` |
| `stage` | `"IDENTITY"` |
| `reason` | `"NONE"` |
| `classification` | `"NONE"` |
| `refreshed` | `true` |
| `scopes` | contém `gmail.send` |
| `accountMatchesSender` | `true`, ou `null` quando o escopo `userinfo.email` não foi concedido |
| `gmailMessagesApiCalled` | `false` |

**Falhas:**
- `stage: "CONFIG"` com `reason: "CONFIG_MISSING"`: faltam credenciais na Vercel.
- `stage: "AUTH_REFRESH"` com `reason` de token inválido/revogado: refaça o consentimento de envio.

Este check é sobre **envio**, não sobre a coleta por caixa.

### 4.2 Pilot Replies Mailbox Check

Link: https://github.com/axionconstrucoes/core-services-07/actions/workflows/pilot-replies-mailbox-check.yml

**Entradas:** nenhuma.

**O que faz:** usando os segredos `ACC_RISK_ALERTS_INBOUND_*`, renova o token da caixa que lê as **respostas aos
alertas** e consulta só `users.getProfile`.

**Saída esperada** (passo "Verificar credencial de leitura das respostas"), um JSON com:

| Campo | Valor esperado |
|---|---|
| `ok` | `true` |
| `stage` | `"IDENTITY"` |
| `configured` | `true` |
| `refreshed` | `true` |
| `scopes` | contém `gmail.readonly` |
| `readonlyScopeGranted` | `true` |
| `profileMatchesConfiguredMailbox` | `true` |
| `configuredMailboxIsInstitutional` | `true` |
| `gmailMessagesApiCalled` | `false` |

O job termina com sucesso só se `ok=true`.

**Falhas:**
- `stage: "NOT_CONFIGURED"`: faltam segredos.
- `stage: "AUTH_REFRESH"` com `refreshed: false`: o token expirou ou foi revogado.
- `configuredMailboxIsInstitutional: false`: a caixa configurada não é a institucional.

Este check também **não** cobre a coleta por caixa.

### 4.3 Gmail Inbound Sync: modos manuais da coleta por caixa

Link: https://github.com/axionconstrucoes/core-services-07/actions/workflows/gmail-inbound-sync.yml

Use **Run workflow**, branch `main`, e escolha um modo em `mode`:

- **`plano`**: lista cada caixa como `COLETAR`, `PULADA motivos=…` ou `LEGADA executar=…`. Não lê o Gmail e não grava.
- **`teste_tecnico`**: para cada caixa com controle e credencial, renova a credencial e lê só o perfil. Registra
  `CONFIRMADA` ou `FALHA` e os escopos. O resultado esperado é `Teste técnico OK para caixa#…`.
- **`comparacao`**: comparação só de metadados, explicada na seção 5. Preencha `since` (padrão `2026-11-23`).
- **`coleta`**: é o padrão do agendador.

Os modos manuais não enviam batimento ao agendador e não rodam o passo de anexos.

## 5. Comparação só de metadados (desde 23/11)

**A) Gmail x banco, automática:** rode **Gmail Inbound Sync** com `mode = comparacao` e `since = 2026-11-23`. Para cada
caixa na lista da obra que tem aceite AUTORIZADO e credencial própria (hoje, só Reynaldo), o job:

1. lista **só os ids** no Gmail com `messages.list`, perímetro From/To/Cc/Bcc dos domínios externos, sem spam e sem
   lixeira. Nenhum corpo ou cabeçalho é lido;
2. compara esses ids com `emails.provider_message_id` da mesma caixa desde a data informada.

A saída tem uma linha por caixa:

```json
{"caixa":"caixa#…","gmail":N,"banco":M,"conferem":K,"faltam_no_banco":N-K,"so_no_banco":X,"exemplos_faltantes":["<id Gmail>", "..."]}
```

Os ids do Gmail são opacos. `so_no_banco` pode incluir mensagens apagadas da caixa depois da coleta.

A mesma comparação roda localmente, com a mesma garantia:

```bash
node --env-file=apps/web/.env.local scripts/gmail-multi-mailbox-sync.mjs --compare --since=2026-11-23
```

**B) Só banco** (Supabase SQL Editor; somente leitura):

```sql
-- contagem por caixa desde 23/11
select mailbox_address, count(*) as mensagens, count(distinct provider_message_id) as ids_distintos,
       min(sent_at) as primeira, max(sent_at) as ultima,
       count(*) filter (where direction = 'INBOUND') as recebidas, count(*) filter (where direction = 'OUTBOUND') as enviadas
  from public.emails
 where project_id = '00000000-0000-4000-8000-000000000001' and provider = 'GMAIL' and sent_at >= '2026-11-23'
 group by mailbox_address order by mailbox_address;

-- ids por caixa (para cruzar com a lista do Gmail)
select mailbox_address, provider_message_id, sent_at, direction
  from public.emails
 where project_id = '00000000-0000-4000-8000-000000000001' and provider = 'GMAIL' and sent_at >= '2026-11-23'
 order by mailbox_address, sent_at;

-- mesma mensagem vista por mais de uma caixa (origens)
select e.id, e.mailbox_address as gravada_por, s.mailbox as vista_tambem_por, s.provider_message_id, s.first_seen_at
  from public.email_message_sources s join public.emails e on e.id = s.email_id
 where s.project_id = '00000000-0000-4000-8000-000000000001' and s.first_seen_at >= '2026-11-23'
 order by s.first_seen_at;

-- estado por caixa (após a migration 20261214100000)
select mailbox_address, corporate_authorization_status, individual_consent_status, technical_permission_status,
       collection_enabled, period_start, period_end, last_sync_at, last_sync_status, last_sync_imported, consecutive_errors,
       last_imported_message_id, last_imported_message_at, credential_source, granted_scopes, oauth_checked_at, revoked_at
  from public.email_mailbox_collection_controls
 where project_id = '00000000-0000-4000-8000-000000000001' order by mailbox_address;
```

## 6. Testes

- `scripts/test-gmail-per-mailbox.mjs` (puro, 22 casos), que cobre:
  - seleção: autorizada, pendente, revogação individual e corporativa, sem credencial, período, retentativas, legada em
    transição, legada revogada;
  - log sem endereço;
  - fallback por migration ausente;
  - cursor por caixa, fatias e retomada;
  - deduplicação na mesma caixa e entre caixas;
  - perímetro (subdomínio; só interno desligado);
  - comparação só de ids.
- `scripts/test-gmail-per-mailbox-sql.mjs` (PGlite, replay de todas as migrations, 8 casos), que cobre:
  - inclusão na lista: só Administrador ou Dono; nunca `service_role` nem não-administrador;
  - Carlos pendente fica pulado; depois de autorizar, é coletado; revogado, sai do plano;
  - estado OAuth auditado, com recusa de "escopo" que pareça token;
  - última importada nunca recua;
  - cursor e erros por caixa;
  - rollback com guarda, idempotente e reaplicável.
