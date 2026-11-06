# Gmail corporativo por delegação em todo o domínio

Estado: **código pronto e testado; configuração Google PENDENTE; nenhuma delegação autorizada; nenhuma coleta ativa; nada aplicado no banco; coletor atual (refresh token) intacto.**

## Identificadores confirmados (não secretos)
Confirmados nas telas do Google Cloud. Fonte única no código: `scripts/lib/gmail-delegation-config.mjs`.

| Item | Valor |
|---|---|
| Projeto Google Cloud (nome) | Axion-Contract-Intelligence |
| **ID do projeto** | `axion-contract-intelligence` |
| Conta de serviço (nome) | ACC Gmail Reader |
| **E-mail da conta de serviço** | `acc-gmail-reader@axion-contract-intelligence.iam.gserviceaccount.com` |
| **ID OAuth 2 do cliente da conta de serviço** (Advanced settings → Domain-wide Delegation) | `101242849785015243815` |
| **Escopo único** | `https://www.googleapis.com/auth/gmail.readonly` |

Não confundir: o ID numérico acima é da **conta de serviço**. Não é o ID do projeto, nem o e-mail, nem o cliente OAuth do login web do ACC (`…apps.googleusercontent.com`), que **não é alterado**. A conta Firebase existente **não é alterada** e a conta de serviço **não deve ser recriada**.

## Estado atual
| Frente | Estado |
|---|---|
| Código do modo de delegação (opt-in), gate por caixa, migration em revisão, testes | **Pronto** |
| Conta de serviço criada no Google Cloud | Feita (confirmada) |
| **Autorização da delegação no Google Admin** | **PENDENTE** — o Google Admin negou acesso ao gerenciamento de Delegação em todo o domínio. Exige conta **Superadministrador** do Workspace (ou a TI). Delegação **não** autorizada. |
| Federação de identidade GitHub → Google (executor sem chave) | **PENDENTE** — pool/provedor ainda não criados; exige o **número** do projeto |
| Teste técnico remoto no executor | **PENDENTE** (depende das duas linhas acima e da migration aprovada) |
| Migration `20261107090000` | Em revisão; **NÃO aplicada** |
| Chave privada da conta de serviço | **Não gerada** (e não deve ser, salvo decisão expressa) |

## Autorização explícita por caixa, obra e período
A delegação do Google **não** limita o acesso a uma obra nem a uma caixa: quem limita é o ACC. **Pré-cadastro, papel ADMINISTRADOR, cadastro na lista da obra ou a própria delegação do Google não autorizam coleta.** Uma caixa só é lida quando existe um registro em `email_mailbox_collection_controls` para **(obra, caixa)** com, ao mesmo tempo:
1. a caixa na **lista explícita da obra** (`project_email_ingestion_mailboxes`, habilitada);
2. **autorização corporativa** registrada por um Administrador da obra, com referência da decisão;
3. **permissão técnica confirmada** (o teste real de delegação funcionou; só o coletor registra);
4. **coleta habilitada** explicitamente, caixa a caixa;
5. **período explícito** (início **e** fim), e o instante atual dentro dele. A leitura nunca passa do fim do período.
O **aceite individual** é um estado à parte (NAO_REGISTRADO / NAO_APLICAVEL / ACEITE_REGISTRADO / RECUSADO / REVOGADO): nunca é preenchido por padrão nem fictício; RECUSADO/REVOGADO bloqueia. Revogar desliga na hora e preserva o histórico (também em auditoria). Consultas jurídicas privadas **não** são tocadas.

## Autenticação no executor remoto (funciona com o PC do escritório desligado)
O executor é o **GitHub Actions** (`ubuntu-latest`), workflow **manual** `Gmail Delegated Sync (manual)` (`.github/workflows/gmail-delegated-sync.yml`, sem `schedule`). Nada depende do PC do escritório: não há runner `self-hosted`, nem arquivo ou processo local.

Credenciais necessárias **no executor** (nada no chat, no Git nem no frontend):
- **Google, sem chave privada (recomendado):** GitHub OIDC → **Workload Identity Federation** → a conta `ACC Gmail Reader` (via ação `google-github-actions/auth`). A conta assina o JWT de delegação pela API IAM Credentials (`signJwt`). Variáveis do repositório (**não são segredos**): `GOOGLE_WIF_PROVIDER` (**pendente**: criar pool/provedor) e, opcionalmente, `GOOGLE_GMAIL_DWD_SERVICE_ACCOUNT` (padrão: a conta confirmada).
- **Supabase (segredos do repositório, já existentes):** `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY`.
- **Chave JSON** (`GOOGLE_GMAIL_DWD_KEY_JSON`) só como **último recurso**, se a federação não for possível, guardada apenas como segredo do GitHub. **Não foi gerada nesta etapa.**

### O que ainda precisa ser criado no Google Cloud (projeto `axion-contract-intelligence`)
1. APIs: **Gmail API** e **IAM Service Account Credentials API** habilitadas.
2. **IAM e administrador → Federação de identidade da carga de trabalho → Criar pool** (`acc-github`) → **Adicionar provedor → OIDC**: emissor `https://token.actions.githubusercontent.com`; mapeamento `google.subject = assertion.sub` e `attribute.repository = assertion.repository`; **condição** `assertion.repository == "axionconstrucoes/core-services-07"`.
3. Na conta `ACC Gmail Reader` → **Permissões → Conceder acesso**:
   - principal `principalSet://iam.googleapis.com/projects/<NÚMERO_DO_PROJETO>/locations/global/workloadIdentityPools/acc-github/attribute.repository/axionconstrucoes/core-services-07` com **Usuário de identidade de carga de trabalho** (`roles/iam.workloadIdentityUser`);
   - a própria conta de serviço com **Criador de token da conta de serviço** (`roles/iam.serviceAccountTokenCreator`), para assinar o JWT de delegação. **Nenhum papel de projeto** (nada de Owner/Editor).
4. No GitHub (Settings → Secrets and variables → Actions → **Variables**): `GOOGLE_WIF_PROVIDER` = `projects/<NÚMERO_DO_PROJETO>/locations/global/workloadIdentityPools/acc-github/providers/<ID_DO_PROVEDOR>`.

## Google Admin — autorização da delegação (Superadministrador ou TI)
**admin.google.com** com **Superadministrador**: **Segurança → Acesso e controle de dados → Controles de API → Gerenciar delegação em todo o domínio → Adicionar novo**
- **ID do cliente:** `101242849785015243815`
- **Escopos OAuth:** `https://www.googleapis.com/auth/gmail.readonly` (somente este)
- **Autorizar**.
Não altere papéis de administrador do Workspace. (O Carlos permanece ADMINISTRADOR **somente** na DEV WEG dentro do ACC.) Se a TI executar, entregue a ela exatamente estes dois valores.

## Sequência de habilitação de UMA caixa (depois da migration aprovada e aplicada)
1. Administrador da obra registra a **autorização corporativa** da caixa (`register_mailbox_corporate_authorization`).
2. Actions → **Gmail Delegated Sync (manual)** → `mailbox` = a caixa, `mode` = `technical_check` (só prova a delegação; **não lê mensagens**).
3. Administrador **habilita a coleta** com **período** início+fim (`set_mailbox_collection`).
4. `mode` = `sample` (ex.: 20; o ponteiro **não** avança) → conferir corpo, anexos, origem e datas → repetir e conferir **0 duplicadas** (índice único de `provider_message_id`).
5. `mode` = `sync` para ampliar, dentro do período autorizado.
6. Só depois de validado o novo caminho, avaliar desativar o coletor por refresh token (**não** antes).

## Arquitetura atual (conferida)
- Coletor: `scripts/gmail-inbound-sync.mjs`, no GitHub Actions a cada 15 min, **uma caixa** (`reynaldo@axion.com.br`) por OAuth de usuário (refresh token). Já existem lista de caixas por obra, filtros, janela, isolamento por `project_id`, dedupe por `provider_message_id` e auditoria.
- No modo delegação o ponteiro de leitura é **por caixa** (o `last_sync_at` da configuração é único por obra e **não** é tocado), evitando que uma caixa adiante a outra.
- Achado: a obra DEV WEG tem `corazza@axion.com.br` na lista de caixas, sem credencial e sem e-mails; `email_accounts` mostra `corazza@` e `marcio.felix@` como "CONNECTED" sem autorização registrada. Com o gate, **continuam bloqueadas** até haver autorização explícita.

## Pendências desta entrega
- Autorização no Google Admin (Superadministrador/TI); federação GitHub → Google; teste técnico remoto.
- Tela do Administrador para ver/alterar os estados por caixa (hoje: RPC + leitura por RLS).
- Aprovação do conteúdo da migration e decisão sobre o predicado de Administrador (hoje: Administrador **da obra**).
