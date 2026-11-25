# Monitoramento universal de e-mail (Fase 5 / Frente A)

Estado em 21/11/2026. Este documento separa, sem ambiguidade, o que é **REAL**, o que é **FIXTURE/transporte falso** e o que está **BLOQUEADO**.

## 1. O que a Frente A entrega

| Item | Onde | Estado |
|---|---|---|
| Regra WEG: qualquer participante `@weg.net` (From, To, Cc, Bcc) entra na amostra; sem palavra-chave | `scripts/lib/gmail-weg-pilot-sender.mjs`, aplicada em `scripts/gmail-inbound-sync.mjs` e `scripts/gmail-inbound-ingest.mjs` | Código pronto e testado com fixtures. **Nenhuma coleta real foi executada.** |
| Motor de sincronização + reconciliação (universo × elegível × processado × excluído × falho) | `scripts/lib/mail-universal/engine.mjs` | Código pronto; testado com transporte falso e em PostgreSQL 17 local |
| Leitor Gmail (`MailReader`) | `scripts/lib/mail-universal/gmail-reader.mjs` | Testado só com transporte **falso**. O leitor real do Gmail em produção continua sendo `gmail-inbound-sync.mjs` |
| Leitor Outlook/Microsoft Graph (delta por pasta) | `scripts/lib/mail-universal/graph-reader.mjs` | Testado só com transporte **falso**. **Sem transporte real, sem credencial, sem consentimento** (ver seção 5) |
| Tabelas de reconciliação, exclusões, cursores e origens | migration `20261201100000_email_universal_monitoring` | Arquivo; **não aplicada** em nenhum banco operacional |
| Backfill controlado | `runMailboxSync({ mode })` | **DRY_RUN é o padrão**; `APPLY` precisa ser pedido explicitamente |

A Frente A **não classifica risco**. Cada mensagem ingerida fica disponível à Frente B em `public.emails` (colunas `cc_addresses`, `bcc_addresses`, `involved_domains`, `canonical_message_key`, `attachments_meta`) e as não processadas em `public.email_ingestion_exclusions`.

## 2. Regra WEG

Todo e-mail acessível nas caixas **autorizadas** (gate por caixa já existente: lista da obra + autorização corporativa + permissão técnica + coleta habilitada + período) cujo participante (`From`, `To`, `Cc` ou `Bcc`) tenha o domínio **exato** `weg.net` entra na amostra: recebidos, enviados, cópias, cópias ocultas e threads.

- **Fase 6/H3 (decisão do responsável):** casam `weg.net` **e subdomínios legítimos** (regra de sufixo `.weg.net` com fronteira de domínio: `obras.weg.net` sim). **Não** casam `evilweg.net`, `xweg.net`, `weg.net.evil.com`, `weg.net.exemplo`, `weg.network` nem `weg.net.` (`domainMatchesOrSubdomain` em `participants.mjs`; testes em `test-gmail-weg-pilot-sender.mjs`, `test-f5-a-monitoramento.mjs` e `test-f6-h3-graph-transporte.mjs`). A variante estrita (`hasParticipantInExactDomain`) continua disponível. O prefiltro de termo do Gmail (`from:weg.net ...`) é só redução; para varrer subdomínios com certeza use o modo universo (sem prefiltro).
- Sem filtro por palavra-chave nem por assunto aprovado (`pilotScopeBypass`).
- A consulta do Gmail passa a ser `{from:weg.net to:weg.net cc:weg.net bcc:weg.net}`; a conferência real dos cabeçalhos é `pilotMessageEligible`.
- As travas de **envio** (`only-recipient-guard`, `pilot-outbound-guard`) **não foram tocadas**.
- Limitação: o Gmail só expõe o `Bcc` em mensagens **enviadas pela própria caixa**; uma cópia oculta recebida por terceiros não é visível na caixa de quem recebe.

## 3. Reconciliação

Por execução (`email_sync_reconciliation_runs`, append-only):

`universo = processadas + excluídas + falhas` (também garantido por `CHECK` no banco) e `processadas ≤ elegíveis ≤ universo`.

| Destino | Motivo registrado em `email_ingestion_exclusions` |
|---|---|
| Excluída | `RULE_NOT_MATCHED`, `NO_PARTICIPANTS`, `OUT_OF_PERIOD`, `REMOVED_AT_PROVIDER`, `DUPLICATE_CROSS_MAILBOX` |
| Falha | `FETCH_FAILED`, `INSERT_FAILED` |
| Processada com lacuna | `ATTACHMENT_UNAVAILABLE` (`message_ingested = true`: a mensagem entra; só o anexo está indisponível) |

- **Idempotência / dedupe**: chave por `provider + caixa + id` (índice único existente do Gmail e novo do Outlook). A **mesma mensagem em duas caixas** (mesmo `Message-ID` RFC 5322, normalizado em `canonical_message_key`) gera **uma** linha em `emails` e uma origem por caixa em `email_message_sources`; a segunda leitura conta como exclusão `DUPLICATE_CROSS_MAILBOX`. Assim a Frente B não duplica risco.
- **Cursor**: `email_sync_cursors` por projeto+provedor+caixa. O cursor só avança em execução `APPLY` **sem falhas**. Gmail: janela com sobreposição de 10 minutos que nunca recua antes do início do período autorizado. Graph: `deltaLink` por pasta (Inbox e SentItems).
- **Recuperação após falha**: status `PARTIAL`, cursor mantido, lacunas em `gaps`; a execução seguinte relê a janela sem duplicar.
- **Falha na listagem**: status `FAILED`, cursor mantido.
- **Anexo indisponível**: a mensagem é preservada com `attachments_meta[].status = UNAVAILABLE`.

### Backfill controlado (procedimento)
1. Rodar `runMailboxSync` com `mode: "DRY_RUN"` (padrão) e a janela desejada; ler `counts`, `exclusions` e `gaps`.
2. Conferir a identidade da reconciliação e os motivos de exclusão com o dono.
3. Só então executar com `mode: "APPLY"`, por caixa, com janela limitada. Nada disso foi executado nesta fase.

Ligação com os workers atuais: as colunas novas de `emails` só são enviadas por `gmail-inbound-sync.mjs`/`gmail-inbound-ingest.mjs` quando `ACC_EMAILS_PARTICIPANT_COLUMNS=1` (definir **depois** de aplicar a migration; antes disso os workers gravam exatamente como hoje).

## 4. Gmail — escopos e mecanismo (evidência por leitura de código/config/CI)

Provado por `scripts/test-f5-a-gmail-escopos.mjs` (sem chamada real):

| Caminho | Mecanismo | Escopo |
|---|---|---|
| Leitura por delegação em todo o domínio | Conta de serviço `ACC Gmail Reader`, JWT de delegação (sem chave: WIF + `signJwt`), workflow **manual** `gmail-delegated-sync.yml` | `gmail.readonly` (único) |
| Leitura incremental atual | OAuth de leitura (`gmail-inbound-oauth.mjs`), workflow `gmail-inbound-sync.yml` | `gmail.readonly` |
| Leitura das respostas de alerta | `apps/web/lib/risk-alerts/replies/inbound-credentials.ts` | `gmail.readonly` |
| Envio pelo ACC | `gmail-outbound-oauth.mjs`, `gmail-email-provider.ts` | `gmail.send` (credencial **separada**; não é usada na leitura) |

Estado declarado no código: delegação **`PENDENTE_AUTORIZACAO_NO_GOOGLE_ADMIN`** (ver `docs/gmail-delegacao-dominio-passo-a-passo.md`). **Não se alega monitoramento de nenhuma caixa que não esteja conectada e autorizada.** O que está configurado no Google Admin/Workspace e nas variáveis do GitHub **não pode ser comprovado a partir do repositório**; só o teste técnico real (`technical_check`), com a decisão do dono, comprova.

## 5. Outlook / Microsoft Graph — BLOQUEIO exato para uso real

**Atualização Fase 6/H3:** o **transporte real do Graph está implementado** (`graph-transport.mjs`, client credentials, delta por pasta, paginação, `Retry-After`, somente leitura, anexos só metadados), testado **apenas contra servidor HTTP falso local**; configuração por variáveis `ACC_GRAPH_*`, manifesto do Entra e script de política de acesso estão em `scripts/outlook/` e `docs/outlook-configuracao-graph.md`. Continua **sem** registro no Entra, credencial, consentimento ou workflow, e **nenhuma chamada real foi feita**. **Achado:** `crm@axion.com.br` é caixa Google (MX do Google), não Exchange: ver `docs/outlook-achado-crm-axion-mx-google.md` (opções A/B/C). Diagnóstico de cobertura do Gmail: `docs/relatorio-cobertura-gmail.md`.

**Estado anterior (Fase 5): não existia integração real com Outlook/Graph no repositório** (nenhuma URL `graph.microsoft.com`/`login.microsoftonline.com` fora do módulo do leitor, nenhuma dependência MSAL/Graph, nenhum workflow, nenhuma variável). O monitoramento de caixas Outlook **NÃO está comprovado**. O que existe é a **camada de leitura** (`MailReader`) exercitada com transporte falso.

Para uso real faltam, nesta ordem (decisões e ações fora do código):

1. **App registration** no Microsoft Entra ID (locatário da Axion) e, para a WEG, definir se as caixas monitoradas são da Axion (único cenário possível sem a WEG consentir) — caixas da WEG **não** podem ser lidas pela Axion.
2. **Permissão de aplicativo `Mail.Read`** (somente leitura; **não** `Mail.ReadWrite`, **não** `Mail.Send`) com **consentimento de administrador** do locatário.
3. **Restrição por caixa** (Application Access Policy / RBAC for Applications do Exchange Online) limitando o aplicativo às caixas autorizadas — sem isso o consentimento daria acesso a todas as caixas.
4. **Credencial segura no servidor**: certificado ou segredo do cliente no repositório de segredos do executor (nunca no frontend nem no Git); preferir federação de identidade (WIF/OIDC).
5. ~~Transporte real~~ (feito na Fase 6/H3, só testado contra servidor falso) (`delta`, `getMessage`, `listAttachments`) implementando a interface somente-leitura de `scripts/lib/mail-universal/read-only.mjs`, e um workflow manual equivalente ao Gmail.
6. Reaproveitar o **mesmo gate por caixa** (lista da obra + autorização corporativa + aceite individual + período) — hoje só existe para o Gmail.
7. Quotas: Graph limita por aplicação/caixa (HTTP 429 com `Retry-After`); o transporte da Fase 6/H3 já respeita `Retry-After` (testado contra servidor falso).

SPF, DKIM e DMARC **não** afetam a leitura de caixas; só o envio.

## 6. Fixture × real

| Verificado com | O quê |
|---|---|
| Transporte **falso** (nenhuma rede) | Leitores Gmail e Graph, regra WEG, dedupe entre caixas, falha/recuperação, anexo indisponível, somente-leitura (proxy recusa envio/alteração) |
| PostgreSQL 17 **local** (base descartável, dados sintéticos) | Migration (2 reaplicações, compatibilidade, rollback), CHECKs, append-only, RLS por perfil, motor gravando no banco |
| **Nada real** | Nenhuma chamada ao Gmail, ao Graph, ao Supabase operacional; nenhum e-mail enviado |
