# 29 - Cobertura de e-mail (Gmail e Outlook) dos colaboradores do projeto WEG

Data da apuração: 23/11/2026. Natureza: **diagnóstico SOMENTE LEITURA** sobre a cópia local do backup lógico de produção de 22/11/2026 (04:46 UTC), restaurada em PostgreSQL local descartável. Nada foi consultado nem alterado em produção, nenhuma caixa foi acessada, nenhuma mensagem foi lida ou enviada. Este documento traz **só agregados** e rótulos (CAIXA-n, RESP-n); endereços, nomes e conteúdo ficam fora do repositório. Meta: histórico de 18 meses (22/05/2025 a 22/11/2026) das comunicações corporativas dos colaboradores autorizados, não só da caixa institucional.

## 1. Resposta curta

- Produção tem **uma única caixa com mensagens** (CAIXA-1): 681 mensagens (513 recebidas, 168 enviadas), 466 threads, de 30/09/2025 a 18/11/2026.
- Dos 19 meses da janela, **4 estão vazios** (maio a agosto/2025: de 22/05 a 29/09/2025) e set-dez/2025 tem só 29 mensagens (média 7/mês contra ~70/mês em jan-set/2026): cobertura **parcial**.
- Dos 7 colaboradores com participação ativa na WEG, **6 não têm nenhuma caixa lida**. A CAIXA-2 (configurada) tem 0 mensagens. Delegação de domínio e Microsoft Graph **não estão ativos** (dependem de terceiros, seção 6).
- Nenhuma fonte de e-mail pode ser declarada OPERACIONAL: falta prova de cobertura desde 22/05/2025 em qualquer caixa.

## 2. Inventário agregado (produção copiada, 22/11/2026)

| Item | Valor |
|---|---|
| Tabelas de e-mail em uso | `emails` 713, `email_attachments` 573, `email_inline_images` 546, `email_triage_results` 480, `email_accounts` 8, configuração de ingestão (1 config, 2 caixas, 3 participantes, 2 domínios), `email_access_authorizations` 1 |
| Tabelas **ausentes** em produção | controles por caixa (`email_mailbox_collection_controls`), cursores, reconciliação, origens por caixa e exclusões (migrations pendentes); colunas Cc/Bcc, domínios envolvidos e chave canônica em `emails` |
| Config de ingestão | habilitada; janela `FROM_NOW` com monitoramento desde 20/08/2026; última sincronização 22/11/2026 01:32 (Brasília); anexos habilitados; escopo por palavras-chave exigido |
| Execuções registradas da config | 2, ambas `PREPARING` de 23/08/2026, nunca finalizadas |
| Mensagens na janela | 713 (681 da CAIXA-1 + 32 sem origem comprovada); 0 antes de 22/05/2025; 0 depois de 22/11/2026 |
| Escopo do projeto | 324 `IN_SCOPE`, 389 `OUT_OF_SCOPE` |
| Contas conectadas (`email_accounts`) | 8, todas `CONNECTED`, **nenhuma jamais sincronizada**, nenhuma mensagem atribuível |
| Colaboradores ativos na WEG | 7; 1 com caixa lida; 4 com conta em `email_accounts` (nunca sincronizada); 1 com autorização individual registrada (somente leitura); 1 com aceite de política aprovado; 0 caixas com controle por caixa (tabela ausente) |
| Auditoria | 1.844 linhas de auditoria de e-mail entre 20/08/2026 e 22/11/2026 |

### Mensagens por mês da CAIXA-1 (recebidas / enviadas)

| Mês | Rec. | Env. | Mês | Rec. | Env. |
|---|---|---|---|---|---|
| 2025-05 a 2025-08 | 0 | 0 | 2026-05 | 40 | 17 |
| 2025-09 | 2 | 0 | 2026-06 | 56 | 18 |
| 2025-10 | 11 | 0 | 2026-07 | 50 | 8 |
| 2025-11 | 6 | 0 | 2026-08 | 58 | 20 |
| 2025-12 | 10 | 0 | 2026-09 | 66 | 25 |
| 2026-01 | 30 | 24 | 2026-10 | 29 | 10 |
| 2026-02 | 51 | 16 | 2026-11 (até 18/11) | 3 | 0 |
| 2026-03 | 54 | 17 | | | |
| 2026-04 | 47 | 13 | | | |

Observações: nenhuma mensagem **enviada** antes de 05/01/2026 e a última é de 28/10/2026; as 32 mensagens sem provedor, caixa nem direção (28/08 a 19/11/2026) têm origem **não comprovada** e não contam como cobertura.

### Anexos (CAIXA-1)

573 registros, todos com arquivo armazenado, 0 com erro, 159 conteúdos distintos em 88 e-mails: **153 processados e 420 pendentes (73%)**; sincronização com o Drive pendente em 100%. Concentração em abril/2026 (212).

## 3. Revisão de código contra os 15 requisitos

| # | Requisito | Situação | Evidência / lacuna |
|---|---|---|---|
| 1 | 18 meses | **Parcial** | O workflow `gmail-historical-backfill` aceita janela explícita e fim congelado (`scripts/lib/gmail-backfill-window.mjs`), mas ela é lida numa única passada; não há prova de execução desde 22/05/2025 (dados começam em 30/09/2025). **Novo**: janela de 18 meses em 19 blocos mensais (`backfill-chunks.mjs`) |
| 2 | Recebidas e enviadas | Atende no código; dado parcial | Direção gravada (INBOUND/OUTBOUND); Gmail pela caixa remetente, Graph pela pasta `sentitems`. Dados: sem enviadas até 12/2025 |
| 3 | Threads completas | **Lacuna** | O identificador de thread é gravado (466 threads, 94 com mais de uma mensagem), mas só entram mensagens com participante WEG: respostas internas da mesma thread sem WEG não são completadas. Decisão de regra pendente |
| 4 | Anexos | **Parcial** | Legado grava arquivo (573), mas 73% pendentes. Motor universal e Graph só guardam metadados (`attachments_meta`), sem bytes. Falta o ciclo de processamento do que está pendente |
| 5 | Remetente/destinatário/cópia | Parcial em produção | Produção guarda só De/Para; Cc/Bcc e domínios dependem da migration `20261201100000` (aplicada só na homologação). O motor universal já considera os quatro campos |
| 6 | Identificação de colaboradores | **Lacuna** | Caixa é texto livre (`mailbox_address`); não há ligação por chave entre caixa e usuário; autorização individual existe para 1 de 7; controles por caixa não existem em produção |
| 7 | Classificação por projeto/contrato | Parcial | Escopo por projeto (`project_scope_status`) e triagem (480 resultados) existem; só há um projeto com e-mail. Vínculo por contrato não foi verificado além da triagem |
| 8 | Paginação/lotes | Atende | Gmail `maxResults` 500 com `pageToken`, `--limit`; motor com `maxPages` e erro explícito de truncamento; Graph segue `nextLink` com teto. **Novo**: blocos mensais e `maxChunks` por execução |
| 9 | Checkpoints | **Parcial, melhorado** | Legado: `last_sync_at` por config (janela explícita não o move). Motor: cursor por caixa, só avança se a execução completa. **Novo**: checkpoint por bloco mensal em chave própria |
| 10 | Retomada | **Parcial, melhorado** | Antes: falha relia a janela inteira. Agora: para no bloco com falha e retoma dele, sem reler os completos (testado) |
| 11 | Deduplicação | Atende | Índice único (projeto, provedor, caixa, id) + inserção idempotente; motor tem chave canônica entre caixas (uma linha, N origens). Tabelas do motor ainda ausentes em produção |
| 12 | Limites de API | Parcial | Legado: retry com 429/5xx. Graph: `Retry-After` (teto 120 s), 5 tentativas, renovação de token. Gmail do motor: 3 tentativas com backoff curto; sem orçamento de cota (mitigado por `maxChunks`) |
| 13 | Incremental | Parcial | Gmail por refresh token a cada 15 min (CAIXA-1); delegação de domínio só manual; Graph sem workflow. O motor universal **não tem executável nem workflow** (só testes e documentos) |
| 14 | Auditoria de origem | Parcial | Legado: auditoria + execuções; motor: origens por caixa, reconciliação (universo = processadas + excluídas + falhas) e exclusões com motivo, mas nunca executado (tabelas vazias na homologação) |
| 15 | Isolamento multi-tenant e permissões por projeto | Atende no desenho; não provado por dados | Portão por caixa exige lista da obra + autorização corporativa + permissão técnica + coleta habilitada + período; RLS e service role só no servidor; há teste de simetria de workspace. Não há registro por caixa em produção |

Nota: o pedido enumera 14 itens e cita 15; checkpoints e retomada foram tratados em linhas separadas.

## 4. O que foi implementado nesta frente (código, com provedores FALSOS)

- `scripts/lib/mail-universal/backfill-chunks.mjs`: `PILOT_HISTORY_WINDOW` (22/05/2025 a 22/11/2026, Brasília), `planBackfillChunks` (19 blocos mensais contíguos), `runChunkedBackfill` (checkpoint por bloco em chave própria `backfill.<caixa>`, retomada do bloco que falhou, `maxChunks` por execução, DRY_RUN sem gravar, recusa Outlook). Um cursor incremental já em "agora" **não** faz o histórico ser pulado.
- `scripts/lib/mail-universal/coverage-report.mjs`: relatório por caixa a partir de **contagens agregadas** (meses sem mensagens, lacunas inicial/final, defasagem, falhas); só devolve OPERACIONAL com prova de cobertura desde o início da janela, sincronização recente e zero falhas; Markdown só com rótulos.
- `scripts/test-f5-c-backfill-cobertura.mjs` (10 verificações; na lista de testes).
- **Não** foi criado workflow nem executável do motor: ligar escrita em produção exige autorização e as migrations.

## 5. MATRIZ DE COBERTURA (fonte e-mail)

Período alvo: 22/05/2025 a 22/11/2026. "Volume esperado" só é verificável lendo a caixa (não feito).

| Fonte | Sistema de origem | Projeto/obra | Colaborador ou responsável (rótulo) | Permissão de acesso | Data inicial disponível | Data final disponível | Volume esperado | Volume importado | Volume processado | Anexos e versões preservados | Última sincronização bem-sucedida | Frequência incremental | Falhas | Dados ausentes | Evidência de consulta e análise | Status | Bloqueio | Ação necessária |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E-mail CAIXA-1 | Gmail (OAuth do titular, `gmail.readonly`) | WEG (piloto) | RESP-1 (titular da caixa) | Autorização individual registrada (somente leitura) + lista da obra | 30/09/2025 | 18/11/2026 | Não verificável (medição de 21/11: 69 mensagens WEG em ago-nov/2026, 68 no banco) | 681 (513 rec., 168 env.), 466 threads | 681 classificadas; 636 com corpo | 573 arquivos armazenados (0 erro); 153 processados, 420 pendentes; sem versões | Config 22/11/2026 01:32; última ingestão 21/11/2026 22:14 | 15 min (workflow incremental) | 0 erros em anexos; 2 execuções antigas `PREPARING` sem fim | 22/05 a 29/09/2025 (0 msgs); set-dez/2025 só 29; 0 enviadas antes de 05/01/2026; Cc/Bcc; threads só com participante WEG | Consultas agregadas na cópia de produção; análise por escopo/triagem (480) | **PARCIAL** | Sem prova de backfill desde 22/05/2025; logs de Actions sem acesso | Dry-run do backfill em blocos de 22/05/2025 a 29/09/2025 (mede sem gravar); aplicar migrations de Cc/Bcc/controles; processar 420 anexos |
| E-mail CAIXA-2 | Gmail (lista da config) | WEG (piloto) | RESP-2 | Na lista da obra; sem autorização individual nem credencial local | Nenhuma | Nenhuma | Desconhecido | 0 | 0 | 0 | Nunca | Nenhuma | Leitura não comprovada | Janela inteira | Config + contagens | **NAO CONECTADA** | Credencial do titular ou delegação de domínio | Titular fornece autorização/credencial OU delegação no Google Admin |
| E-mail dos demais colaboradores WEG (6 de 7 membros) | Gmail por delegação de domínio | WEG (piloto) | RESP-3 a RESP-8 | **Nenhuma**: delegação pendente; sem controle por caixa em produção | Nenhuma | Nenhuma | Desconhecido | 0 | 0 | 0 | Nunca | Nenhuma | n/a | Todos os 6 colaboradores e a janela inteira | Membros x caixas (contagens) | **NAO CONECTADA** | Delegação no Google Admin e federação (WIF) pendentes; lista de autorizados; autorização e aceite por caixa | Ver seção 6 |
| E-mail Outlook / Microsoft Graph | Microsoft 365 (Exchange Online) | WEG (piloto) | A definir | Nenhuma (app não registrado) | Nenhuma | Nenhuma | Desconhecido | 0 | 0 | 0 | Nunca | Nenhuma | n/a | Tudo; a caixa institucional é Google (não serve ao Graph) | Código e transporte testados só contra servidor falso | **NAO CONECTADA** | Existe caixa Exchange? App registration + consentimento + política por caixa | Confirmar quais caixas são Exchange; só então registrar o app |
| 32 mensagens sem origem | Desconhecida (sem provedor/caixa/direção) | WEG | n/a | n/a | 28/08/2026 | 19/11/2026 | n/a | 32 | 32 classificadas | Não aplicável | n/a | n/a | n/a | Origem não comprovada | Contagem | **PARCIAL** (não conta como cobertura) | Origem a esclarecer com o responsável | Identificar a origem (teste/gerador do ACC?) antes de usar como evidência |

## 6. O que o responsável precisa fornecer

1. **Delegação de domínio por caixa** (superadministrador do Google Workspace): Client ID da conta de serviço + escopo único `gmail.readonly`; e federação de identidade do executor (administrador do GCP). Sem isso, só a caixa do titular é legível.
2. **Lista de colaboradores autorizados** e, por caixa, a autorização corporativa e o aceite individual (RH/Jurídico/Diretoria), mais o período permitido.
3. **Volumes esperados** por caixa e mês (contagem no Gmail) ou autorização para um dry-run, que mede sem gravar.
4. **Microsoft Graph** (somente se houver Exchange Online): registro do app (manifesto em `scripts/outlook/`), consentimento de administrador só para `Mail.Read` de aplicativo, política de acesso por caixa aplicada **antes** do segredo e segredo/certificado no repositório de segredos do executor. Sem elevar permissões além de leitura.
5. **Logs das execuções** dos workflows (acesso `gh`) para provar últimas execuções e falhas.
6. **Decisões**: completar threads com mensagens internas; backfill de enviadas; origem das 32 mensagens sem provedor.

## 7. Próximos passos técnicos (dependem de autorização)

1. Aplicar, na ordem do plano, as migrations de Cc/Bcc e do motor (`20261201100000`) e dos controles por caixa.
2. Dry-run do backfill em blocos mensais para 22/05/2025 a 29/09/2025 na CAIXA-1; se houver mensagens, `APPLY`.
3. Criar o executor (script + workflow manual) do motor universal reutilizando `runChunkedBackfill` e `buildMailboxCoverageReport` com leitura dos agregados; PR próprio, depois de autorizado.
4. Reprocessar os 420 anexos pendentes e a sincronização com o Drive.
