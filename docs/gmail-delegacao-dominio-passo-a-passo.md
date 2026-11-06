# Gmail corporativo por delegação em todo o domínio — passo a passo

Estado: **PREPARADO. Nada criado no Google Cloud/Admin, nada aplicado no banco, coletor existente intacto.**
Quem executa os passos 1 e 2 é um humano com acesso ao Google Cloud e Superadministrador do Workspace.

## Arquitetura atual (conferida)
- Coletor: `scripts/gmail-inbound-sync.mjs`, no GitHub Actions (`ubuntu-latest`), a cada 15 min, **uma caixa** (`reynaldo@axion.com.br`) por **OAuth de usuário com refresh token** (segredos `GOOGLE_GMAIL_REYNALDO_*`). Não depende do PC do escritório.
- Já existem: lista explícita de caixas por obra (`project_email_ingestion_mailboxes`), filtros (`scope_keywords`, `scope_exact_subjects`, domínios), janela por obra, isolamento por `project_id`, dedupe por `provider_message_id`, auditoria (`audit_log_entries`).
- **Lacunas que a delegação exige tratar** (a delegação do Google não limita obra nem caixa): autorização corporativa por caixa, permissão técnica comprovada, coleta habilitada caixa a caixa, estado por caixa. Resolvido pela migration em revisão `20261107090000_email_mailbox_collection_controls.sql`.
- Atenção: `project_email_ingestion_configs.last_sync_at` é **único por obra**, não por caixa. Com várias caixas, uma sincronização adiantaria o ponteiro das outras. No modo delegação o ponteiro passa a ser **por caixa** e o compartilhado não é tocado.
- Não existe conta de serviço do ACC no Google Cloud que eu pudesse confirmar (sem acesso ao Google Cloud nesta sessão). O OAuth do login web do ACC **não é alterado** e não é reaproveitado.

## 1. Google Cloud (quem tem acesso ao projeto)
Use o **mesmo projeto Google Cloud** que já abriga o OAuth do Gmail/Drive do ACC (para não duplicar integração), ou um projeto dedicado `acc-gmail-leitura` se preferir isolar.

1. **APIs e serviços → Biblioteca**: ative **Gmail API** e **IAM Service Account Credentials API**.
2. **IAM e administrador → Contas de serviço → Criar conta de serviço**
   - Nome: `acc-gmail-reader`; ID: `acc-gmail-reader`; descrição: "Leitura corporativa do Gmail pelo ACC (somente leitura, delegação em todo o domínio)".
   - **Não conceda nenhum papel de projeto** (nada de Owner/Editor) na etapa "Conceder acesso". Concluir.
3. Abra a conta de serviço → **Detalhes** → anote:
   - **E-mail:** `acc-gmail-reader@<ID_DO_PROJETO>.iam.gserviceaccount.com`
   - **ID exclusivo (ID numérico do cliente OAuth):** número de ~21 dígitos. **É este** que vai no Admin do Google (passo 2). Não é o ID do projeto, nem o e-mail, nem o ID do cliente OAuth do login web (`…apps.googleusercontent.com`).
4. **Sem chave privada (recomendado) — Workload Identity Federation com o GitHub:**
   - **IAM e administrador → Federação de identidade da carga de trabalho → Criar pool** (`acc-github`), **Adicionar provedor → OIDC**, emissor `https://token.actions.githubusercontent.com`, mapeamento `google.subject = assertion.sub`, `attribute.repository = assertion.repository`, **condição de atributo** `assertion.repository == "axionconstrucoes/core-services-07"`.
   - Conta de serviço `acc-gmail-reader` → **Permissões → Conceder acesso**: principal `principalSet://iam.googleapis.com/projects/<NÚMERO_DO_PROJETO>/locations/global/workloadIdentityPools/acc-github/attribute.repository/axionconstrucoes/core-services-07` com o papel **Usuário de identidade de carga de trabalho** (`roles/iam.workloadIdentityUser`).
   - Na **mesma** conta de serviço, conceda a ela mesma (principal = o e-mail da conta) o papel **Criador de token da conta de serviço** (`roles/iam.serviceAccountTokenCreator`) — necessário para ela assinar o JWT de delegação via API IAM.
   - No GitHub (Settings → Secrets and variables → Actions → **Variables**, não são segredos): `GOOGLE_WIF_PROVIDER` = `projects/<NÚMERO_DO_PROJETO>/locations/global/workloadIdentityPools/acc-github/providers/<ID_DO_PROVEDOR>` e `GOOGLE_GMAIL_DWD_SERVICE_ACCOUNT` = e-mail da conta de serviço.
5. **Só se o passo 4 não for possível:** criar uma chave JSON da conta de serviço e guardá-la **apenas** como segredo do GitHub `GOOGLE_GMAIL_DWD_KEY_JSON` (nunca no chat, Git ou frontend). Chave de longa duração é pior: prefira o passo 4.

## 2. Google Admin (Superadministrador)
Entre em **admin.google.com** com a conta de **Superadministrador**:
**Segurança → Acesso e controle de dados → Controles de API → Gerenciar delegação em todo o domínio → Adicionar novo**
- **ID do cliente:** o **ID exclusivo numérico** da conta de serviço (passo 1.3).
- **Escopos OAuth (separados por vírgula):** exatamente `https://www.googleapis.com/auth/gmail.readonly` — **nenhum outro**.
- **Autorizar**.
Não altere papéis de administrador do Workspace. (O Carlos permanece ADMINISTRADOR **somente** na DEV WEG dentro do ACC.)

## 3. Habilitar UMA caixa no ACC (depois de a migration ser aprovada e aplicada)
Em cada etapa o ACC registra e audita; **nada é habilitado em massa** e as caixas já listadas na obra **não** passam a ser lidas sozinhas.
1. Administrador da obra registra a **autorização corporativa** da caixa (RPC `register_mailbox_corporate_authorization`, com a referência da decisão). A caixa precisa já estar na lista explícita da obra.
2. **Teste técnico** — Actions → **Gmail Delegated Sync (manual)** → `mailbox` = a caixa, `mode` = `technical_check` (só prova a delegação; não lê mensagens).
3. Administrador **habilita a coleta** da caixa com o **período autorizado** (RPC `set_mailbox_collection`).
4. `mode` = `sample` (ex.: 20 mensagens; o ponteiro de leitura **não** avança) → conferir corpo, anexos, origem e datas → repetir e conferir **0 duplicadas**.
5. `mode` = `sync` para ampliar dentro do período.
6. Só depois de validado o novo caminho, avaliar desativar o coletor por refresh token (**não** antes).

## Estados mostrados por caixa (separados)
autorização corporativa (NAO_REGISTRADA/AUTORIZADA/REVOGADA) · aceite individual (NAO_REGISTRADO/NAO_APLICAVEL/ACEITE_REGISTRADO/RECUSADO/REVOGADO — nunca fictício) · permissão técnica (NAO_VERIFICADA/CONFIRMADA/FALHA) · coleta ativa (+período) · última sincronização (status, quantidade, horário). Revogar desliga na hora e preserva o histórico.

## Pendências desta entrega
- Tela do Administrador para ver/alterar esses estados (hoje só RPC + leitura por RLS).
- Aprovação do conteúdo da migration; decisão sobre o predicado de Administrador (hoje: Administrador **da obra**).
- Privacidade das consultas jurídicas por autor: **não tocada**.
