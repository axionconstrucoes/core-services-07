# 16 - Congelamento integral de escrita para a janela de producao da Fase 2

Frente B da Fase 2 (piloto WEG). **Nada aqui foi aplicado em producao, homologacao ou DEV compartilhado.** Implementacao e testes foram feitos localmente; a prova automatizada roda em PostgreSQL 17 local descartavel (`127.0.0.1:55434`, base propria criada e apagada) por `scripts/test-congelamento-realpg.mjs`. Scripts SQL: `docs/implantacao/congelamento/`.

## 1. Por que pausar a Vercel nao basta

O navegador grava **direto no Supabase** (cliente `@axion/db/browser`, chave publicavel + sessao do usuario): upload/remocao no Storage, RPCs e um `insert`. Isso nao passa pelo servidor do app. Pausar a Vercel/Server Actions/crons nao impede essas escritas; e preciso congelar **no banco**. Alem disso, o `pg_cron` do Supabase continua disparando os jobs.

## 2. Inventario exato dos caminhos de escrita (conferido no codigo em 22/11/2026)

### 2.1 Navegador (cliente Supabase do usuario) - **numero real: 10 arquivos escrevem** (nao 9)

O teste estatico (E1-E8) varre `apps/web` e confirma: **15 arquivos importam `@axion/db/browser`**; destes, **10 escrevem** (os 9 componentes + a fila offline do SSMA, que recebe o cliente pelo hook `use-field-queue.ts` e grava via `lib/ssma/field-records/supabase-transport.ts`), 1 e so Auth (OAuth Google) e 4 so leem.

| # | Arquivo | Operacao | Tabela / bucket / RPC | Como o congelamento bloqueia |
|---|---|---|---|---|
| 1 | `components/documents/contract-attachments/use-contract-attachments.ts` | upload e remocao Storage; RPC | `project-documents`; `register_document_version_file`, `delete_contract_attachment` | politicas restritivas de Storage; gatilho-guarda (RPC definer) |
| 2 | `components/documents/document-upload-form.tsx` | upload/remocao Storage; RPC | `project-documents`; `register_project_document_upload` | idem |
| 3 | `components/documents/multi-upload/use-document-upload-queue.ts` | upload/remocao Storage; RPC (+ `find_document_by_sha256`, so leitura) | `project-documents`; `register_project_document_upload` | idem |
| 4 | `components/documents/permanent-delete-document-control.tsx` | RPC; remocao Storage | `delete_project_document`; `project-documents` | idem |
| 5 | `components/esg/esg-submission-form.tsx` | upload/remocao Storage; **INSERT direto** | `project-documents`; tabela `esg_obligation_evidence` | Storage + `REVOKE INSERT` + gatilho-guarda na tabela |
| 6 | `components/legal/use-precontract-upload.ts` | RPC; remocao Storage; **upload por XHR** direto ao endpoint do Storage (`lib/legal/precontract-upload-transport.ts`) | `register_project_document_upload`; `project-documents` | idem (Storage valida o INSERT em `storage.objects`; ver risco R3) |
| 7 | `components/ssma/field-records/esg-evidence-link.tsx` | RPC | `esg_link_ssma_record`, `esg_unlink_ssma_record` | gatilho-guarda |
| 8 | `components/ssma/field-records/record-detail.tsx` | RPC; upload Storage (`uploadActionEvidencePhoto`) | `ssma_corrective_action_forward`, `ssma_corrective_action_update`, `ssma_field_record_register_photo`; `project-documents` | idem |
| 9 | `components/ssma/ssma-field-app.tsx` | RPC; upload Storage | `create_ssma_form_submission`, `create_ssma_accident_submission`, `register_ssma_submission_photo`, `finalize_ssma_form_submission`; `project-documents` | idem |
| 10 | `lib/ssma/field-records/use-field-queue.ts` (+ `supabase-transport.ts`) | RPC; upload Storage | `ssma_field_record_submit`, `ssma_field_record_register_photo`; `project-documents` | idem; **a fila offline mantem o item e reenvia** |

Nao escrevem: `app/login/google-signin-button.tsx` (Auth OAuth), `contract-attachments-panel.tsx`, `document-download-button.tsx`, `lib/timeline-export/resolve-evidence-files.ts` (URL assinada, leitura), `field-records-app.tsx` (SELECT e `ssma_notification_summary`, leitura).

Nenhum outro arquivo de `apps/web` cria cliente de navegador nem usa chave de servico em componente client (E5). Nao ha uso de Realtime (`.channel(`) no app.

### 2.2 Servidor, em nome do usuario (cliente `createSupabaseServerClient`, papel `authenticated`)

148 arquivos usam o cliente de servidor; **88 arquivos com `"use server"`** (Server Actions) e Server Actions/handlers de pagina gravam como o usuario. Inclui a resposta a alerta (`record_risk_alert_action`, `confirm_email_alert_action` pela pagina `/email-actions/[token]`). **Sao bloqueadas pelo congelamento** (gatilho-guarda por claim `role`), mesmo com a Vercel no ar.

### 2.3 Servidor com `service_role` (cliente admin, ignora RLS)

34 arquivos importam `createSupabaseAdminClient` (lib/email 11, lib/alerts 3, ssma notificacoes, risk-alerts, email-actions, whatsapp, construmanager, rotas abaixo). **Nao sao bloqueados** pelo congelamento (decisao: ver 4). Sao contidos **pausando a Vercel** e os crons. Rotas (`route.ts`, 17): `api/cron/{alert-reminders, contract-alert-batches, risk-alerts, ssma-notifications, system-health, weekly-alert-digest}`, `api/ssma/{accident-notifications, checklists/.../photos, field-records/notifications, photos/discard, records/photos}`, `api/contract-alert-batches/[batchId]/respond`, `auth/callback`, assistente (3) e tutorial. `vercel.json` declara 2 crons (`weekly-alert-digest`, `system-health`).

### 2.4 pg_cron (11 jobs, migration `acc_scheduler`)

`acc-risk-alerts`, `acc-ssma-notifications`, `acc-weekly-all`, `acc-document-worker`, `acc-mpp-worker`, `acc-gmail-sync`, `acc-ssma-drive`, `acc-construmanager`, `acc-diario`, `acc-watchdog`, `acc-cron-history-cleanup`. Chamam rotas do app / disparam workflows e gravam com privilegio proprio. Pausa: `6-pg-cron-pausar.sql` (comprovada em homologacao: 0 execucoes em 4 min 27 s). Execucoes perdidas nao sao recuperadas (sao varreduras idempotentes).

### 2.5 SQL direto, Storage, Realtime, Auth

- **SQL direto** (SQL Editor, `psql`, executor de ondas): papel `postgres`; **nao e afetado** pelo congelamento (por desenho: e o operador da janela). Quem tem acesso ao banco precisa respeitar a janela.
- **Storage**: o repositorio so cria 2 buckets (`project-documents`, `construmanager-content`); os 11 buckets SSMA/ESG + documentos citados no inventario de producao vem do ambiente. As politicas restritivas sao **por tabela `storage.objects`, nao por bucket**: cobrem todos. Politicas do app em `storage.objects`: 6 (insert editores, ESG, SSMA campo, SSMA submissao; select membros; delete nao registrado).
- **Realtime**: nao usado pelo app; sem acao.
- **Auth**: login/refresh/logout gravam no schema `auth` (GoTrue, papel proprio) - **nao sao afetados**. Cadastro novo cria `profiles` por gatilho definer sem claim de usuario (passa). Qualquer escrita em `public` feita *no meio* de uma sessao autenticada (ex.: "ultimo acesso") seria bloqueada: validar o login em homologacao.

## 3. Mecanismo recomendado, em camadas

| Camada | O que | Script | Comprovado |
|---|---|---|---|
| 0 | Pausar a Vercel (Server Actions, rotas, crons Vercel) | operacao | - |
| 1 | Pausar os 11 jobs `pg_cron` guardando o estado | `6-pg-cron-pausar.sql` | homologacao 22/11 + teste local |
| 2 | **Gatilho-guarda** em todas as 218 tabelas de `public` (statement-level INSERT/UPDATE/DELETE/TRUNCATE): recusa `42501` se o papel ou o claim `role` do JWT for `anon`/`authenticated`. Cobre tambem as ~180 RPCs `SECURITY DEFINER` (que rodam como dono e escapam de GRANT/RLS) | `1-aplicar-congelamento.sql` | teste local |
| 3 | `REVOKE INSERT/UPDATE/DELETE/TRUNCATE` (tabela e coluna) de `anon`/`authenticated`/PUBLIC em tabelas e views, com os privilegios guardados em `acc_congelamento_estado` para devolucao exata | idem | teste local (identidade de ACL, inclusive coluna e grant option) |
| 4 | **Politicas RESTRITIVAS** de Storage (INSERT/UPDATE/DELETE) para `authenticated`/`anon` | `4-storage-congelar.sql` | homologacao 22/11 + teste local |
| 5 (opcional/final) | Desligar a **Data API** (PostgREST) no painel | manual, **exige autorizacao** | nao testado |

**Por que gatilho-guarda e nao `REVOKE EXECUTE` das RPCs:** revogar EXECUTE exige classificar cada RPC como leitura ou escrita. Ha 159 funcoes `SECURITY DEFINER` volateis com escrita aparente, 19 sem, 79 sem acesso e varias de leitura usadas por RLS (`is_project_member`, `has_project_permission`) e pelo navegador (`ssma_notification_summary`); errar uma derruba leitura ou deixa um furo. O gatilho cobre **por construcao** qualquer escrita em tabela de `public`, inclusive as que uma migration futura crie (o teste falha se houver tabela sem guarda). A trava por modulo (frente C, `trava-modulos/`) continua independente e complementar: ela e permanente por modulo; este e da janela. As duas coexistem (ACL de funcoes nao e tocada pelo congelamento: provado).

**Desligar a Data API (camada 5) - impactos:** derruba tambem **leitura** por API (o app inteiro le por PostgREST/supabase-js), **o login e o Auth via cliente** (`supabase.auth` usa o GoTrue, que fica no ar, mas `getUser` em server components e a RLS dependem do banco; o app nao carrega paginas sem leitura), o upload/URLs assinadas e as chamadas `service_role` do servidor. E um "desligamento total", nao um congelamento seletivo; so faz sentido se a regra for "ninguem acessa nada". Nao foi testada (exige autorizacao). As camadas 0-4 ja atingem "nada grava, tudo le".

## 4. Resposta de alerta por e-mail durante a janela (decisao explicita)

- A pagina `/email-actions/[token]` (Server Action `confirmEmailAlertAction` -> RPC `confirm_email_alert_action`) e a acao do alerta (`record_risk_alert_action`) rodam **com a sessao do usuario** (`authenticated`), nao com `service_role`.
- **Durante a janela ficam congeladas**, e e a decisao correta: a RPC e `SECURITY DEFINER` e tentaria gravar evento/caso/token; o guarda recusa `42501` **antes de qualquer efeito** (teste C4: 0 eventos, caso intacto em `OPEN`). Como a transacao desfaz tudo, o **token nao e consumido** e continua valido apos a janela (ate expirar). Orientar os responsaveis: respostas por link durante a janela devem ser repetidas depois.
- O **worker** (`service_role` com `actorUserId`), que processa respostas recebidas por e-mail, **continua funcional** no banco (teste C5: mesma RPC, sucesso). Com a Vercel e os crons pausados ele nao roda; se for necessario deixar o worker ativo, basta nao pausa-lo - ele nao e bloqueado. Isso e uma escolha operacional (ver secao 7).
- Apos reverter, a mesma chamada de `authenticated` volta a funcionar (teste R3).

## 5. Procedimento reversivel

Aplicar (inicio da janela, na ordem): (0) pausar Vercel; (1) `6-pg-cron-pausar.sql`; (2/3) `1-aplicar-congelamento.sql`; (4) `4-storage-congelar.sql`; conferir com `3-verificar-congelamento.sql` (0 tabelas sem guarda, 0 com escrita, 3 politicas).

Reativar (fim, na ordem inversa): `5-storage-descongelar.sql`; `2-reverter-congelamento.sql`; `7-pg-cron-retomar.sql` (aborta se nao houver estado: nunca ativa tudo as cegas); retomar a Vercel; `3-verificar-congelamento.sql`.

**Sem perda de dados:** nada e apagado. O congelamento so recusa gravacoes; os dados existentes e o Storage nao sao tocados. A **fila offline do SSMA reenvia**: o erro do guarda (`ACC_JANELA_CONGELAMENTO`, `42501`) nao contem nenhum codigo permanente (`PERMANENT_ERROR_CODES`) nem mensagem mapeada (teste E8), logo o item fica `FAILED` nao permanente e e reenviado automaticamente; rascunhos locais (IndexedDB) sao preservados. Uploads em andamento no navegador (documentos) falham e o usuario repete (a fila de upload de documentos nao e offline). Ha `audit_log_entries` `WRITE_FREEZE_APPLIED` / `WRITE_FREEZE_REVERTED` (1 linha por obra; `project_id` e NOT NULL - os scripts de referencia anteriores sem `project_id` abortavam e desfaziam o bloco).

## 6. Resultado dos testes (local, 22/11/2026)

`node scripts/test-congelamento-realpg.mjs`: **27 OK, 0 FAIL** (8 estaticos + 19 em PostgreSQL 17.12 com as 205 migrations). Destaques:

- 15 importadores do cliente de navegador, 10 escrevem (E1-E3); RPCs existem nas migrations (E7); texto do erro compativel com a fila offline (E8).
- Escrita direta recusada com `42501`: **218 tabelas x INSERT/UPDATE/DELETE/TRUNCATE x authenticated e anon = 1.744 tentativas, 0 falhas** (C2); gatilho-guarda recusa sozinho mesmo com GRANT vazado e com claim `authenticated` sob papel de dono (C3).
- `record_risk_alert_action` recusada a `authenticated` sem efeito parcial (C4); mesma RPC funcional para `service_role` e escrita direta de `service_role`/dono preservada (C5).
- Leitura: ACL de SELECT identica e leituras reais OK; `is_project_member` funciona (C6). Storage: INSERT/UPDATE/DELETE de `authenticated`/`anon` recusados, objeto original intacto, leitura e `service_role` OK (C7).
- Aplicar 2x idempotente (C9). Reverter: ACL de tabelas/views/sequencias **por tabela e por coluna**, ACL de 537 funcoes, politicas, gatilhos e lista de tabelas identicas a foto inicial (R2); ciclos repetidos e coluna com `grant option` (R5); reverter 2x (R4); pg_cron: 11 jobs voltam exatamente (10 ativos + 1 inativo), pausar 2x nao perde o estado, retomar sem estado aborta (P1).

## 7. Riscos e dependencias de autorizacao

- **R1 (a validar em homologacao, exige autorizacao):** o teste local usa claims JWT simulados e stubs de `pg_cron`/Storage. Falta provar no Supabase real: o claim `role` chegando ao gatilho via PostgREST (e o mecanismo padrao do Supabase), upload TUS/XHR do pre-contrato (R3) e a `storage.objects` com as politicas reais.
- **R2:** leituras que gravam como efeito colateral (ex.: contadores de acesso/limite de consulta de IA) falharao durante a janela. Nao ha indicio no codigo, mas o `Assistente`/consulta de IA tem cota (`consult-quota`); validar.
- **R3:** upload do pre-contrato envia bytes por XHR ao endpoint do Storage; a recusa vem do INSERT em `storage.objects`. Pode deixar bytes orfaos no S3 se o Storage gravar o blob antes de validar; nada em `objects`, sem impacto no app (limpeza posterior opcional).
- **R4:** criar/atualizar gatilhos adquire lock breve por tabela: aplicar com a Vercel pausada. Tabelas criadas **durante** a janela nao teriam guarda (nenhuma migration deve rodar; se rodar, reaplicar o script - idempotente - e conferir `3-verificar`).
- **R5:** `service_role` e `postgres` nao sao congelados por desenho; o controle e operacional (pausar Vercel, crons, e nao executar SQL/executor de ondas alem do plano).
- **Depende de autorizacao:** qualquer aplicacao em producao/homologacao; teste da Data API desligada; teste do mecanismo no Supabase real (acc-homolog); decisao de manter ou nao o worker de e-mail ativo na janela; merge na integracao.

Politicas preservadas: nenhuma regra de SLA, o icone (i) da barra lateral e o bloqueio de RNC/Garantias nao foram alterados por esta frente.
