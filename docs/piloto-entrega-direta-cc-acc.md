# Piloto WEG — entrega direta com cópia institucional (acc@)

Substitui o modelo anterior de **destino único** (`axion@axion.com.br`) e o grupo `WEG_INTERNAL_FOUR`. Os registros históricos (outbox, auditoria,
`risk_alert_outbox`, `emails`, migrations) **não são alterados**: eles continuam descrevendo o que foi feito na época.

## Regra

| Item | Regra |
|---|---|
| Participantes | Reynaldo (`reynaldo@axion.com.br`), Jaime (`jaime.ramos@axion.com.br`), Carlos Evandro (`carlos.evandro@axion.com.br`). Lista fixa no código (`PILOT_PARTICIPANT_ADDRESSES`); endereços conferidos em `profiles.email` (ACTIVE na WEG e na allowlist do piloto). |
| Destinatário principal (To) | O **próprio colaborador** a quem o alerta se destina. Usuário lógico = destinatário físico. Qualquer outro endereço **bloqueia** o envio (nunca é substituído). |
| Cópia (Cc) | `acc@axion.com.br` em **toda** mensagem do piloto, inclusive quando o remetente é o próprio ACC. Nunca Bcc. |
| Remetente | `acc@axion.com.br` (institucional) **ou** um participante *autorizado* (`ACC_PROJECT_PILOT_AUTHORIZED_SENDERS`) e *autenticado* (refresh token próprio). Sem credencial do remetente solicitado, **não envia** — nunca usa outra identidade. |
| Proibido | `axion@axion.com.br` em To, Cc, Reply-To, caixa de resposta ou qualquer cabeçalho de destinatário (`PILOT_FORBIDDEN_ADDRESSES`). |
| Projeto | Exclusivamente a WEG (`00000000-0000-4000-8000-000000000001`). Outro id torna o perfil inválido (fail closed). |
| Respostas | Cada colaborador responde com a **própria** identidade (From real). A ação é sempre do remetente (perfil, vínculo ativo, destinatário lógico, allowlist). Resposta do ACC ou da cópia Cc (`X-ACC-Outbound`) é ignorada; remetente desconhecido é `UNAUTHORIZED_REPLY`. Não existe mais atribuição por "caixa do piloto". |
| Botões | Link `/{projectId}/alertas/{caseId}?acao=…&t=…` (token de uso único por caso + destinatário, 72 h). GET não altera estado; a ação é POST revalidado no servidor pelo usuário **logado** (que agora é o próprio destinatário). |

## Matriz real de remetentes × destinatários

| Remetente (From) | To | Cc | Condição |
|---|---|---|---|
| acc@axion.com.br | Reynaldo / Jaime / Carlos | acc@axion.com.br | Padrão. Exige OAuth do acc@ (`GOOGLE_GMAIL_PILOT_*`). |
| Reynaldo | Jaime / Carlos | acc@axion.com.br | Reynaldo em `ACC_PROJECT_PILOT_AUTHORIZED_SENDERS` **e** `GOOGLE_GMAIL_PILOT_USER_REYNALDO_REFRESH_TOKEN`. |
| Jaime | Reynaldo / Carlos | acc@axion.com.br | Idem, `…_JAIME_RAMOS_…`. |
| Carlos Evandro | Reynaldo / Jaime | acc@axion.com.br | Idem, `…_CARLOS_EVANDRO_…`. |
| qualquer outro | — | — | Bloqueado. |

## Variáveis

| Variável | Antes | Depois |
|---|---|---|
| `ACC_PROJECT_PILOT_PROJECT_ID` | UUID | UUID — **precisa ser a WEG** |
| `ACC_PROJECT_PILOT_SENDER` | `crm@axion.com.br` | `acc@axion.com.br` |
| `ACC_PROJECT_PILOT_DESTINATION` | `axion@axion.com.br` | **remover** (não é mais lida) |
| `ACC_PROJECT_PILOT_TEST_GROUP` | vazio | **remover** (não é mais lida) |
| `ACC_PROJECT_PILOT_AUTHORIZED_SENDERS` | — | opcional: participantes que podem enviar com a própria identidade |
| `GOOGLE_GMAIL_PILOT_SENDER_EMAIL` | `crm@…` | `acc@axion.com.br` |
| `GOOGLE_GMAIL_PILOT_REFRESH_TOKEN` | token do `crm@` | token do **acc@** (consentimento novo) |
| `GOOGLE_GMAIL_PILOT_USER_<CHAVE>_REFRESH_TOKEN` | — | opcional, por participante autorizado a enviar |
| `GOOGLE_GMAIL_INBOUND_MAILBOX` | `crm@axion.com.br` | `acc@axion.com.br` (base do Reply-To `acc+alerta-<token>@`) |
| `ACC_RISK_ALERTS_INBOUND_*` | caixa de respostas atual | OAuth **readonly do acc@** (a fase `replies` só aceita a caixa configurada) |
| `project_weekly_schedule_ingestion_configs.pilot_delivery_override_email` | `crm@…` | ignorado enquanto o perfil do piloto estiver ativo (não precisa mudar) |

## Plano de migração (nada disto foi executado)

Ordem obrigatória — o código novo **bloqueia** envios da WEG enquanto o ambiente antigo estiver ativo (fail closed):

1. Confirmar que `acc@axion.com.br` existe no Workspace e pode **enviar e receber**; consentir o OAuth com `scripts/gmail-pilot-sender-oauth.mjs --mailbox=acc@axion.com.br` (e `ACC_RISK_ALERTS_INBOUND_*` readonly para as respostas).
2. Vercel Production: definir `ACC_PROJECT_PILOT_SENDER=acc@…`, `GOOGLE_GMAIL_PILOT_SENDER_EMAIL=acc@…`, `GOOGLE_GMAIL_PILOT_REFRESH_TOKEN` (novo), `GOOGLE_GMAIL_INBOUND_MAILBOX=acc@…`. Remover `ACC_PROJECT_PILOT_DESTINATION` e `ACC_PROJECT_PILOT_TEST_GROUP`. Repetir `GOOGLE_GMAIL_INBOUND_MAILBOX` e `ACC_RISK_ALERTS_INBOUND_*` nos Secrets/Variables do GitHub usados pelos workflows.
3. Só então fazer o deploy do código novo (ou fazer os dois no mesmo passo).
4. Rodar `Pilot Gmail Auth Check` (somente leitura) — deve retornar `accountMatchesSender:true` para acc@.
5. Dry-run do `Pilot Single Alert` para cada colaborador (`WOULD_SEND`/`WOULD_RETRY`), sem envio.
6. Envio real único (com autorização específica), conferindo na caixa do colaborador **e** em `acc@` (Cc).

## Homologação (aceite)

- To = colaborador; Cc = `acc@`; From = `acc@`; sem `axion@` em nenhum cabeçalho (conferir "Mostrar original").
- Cópia chegou na **caixa de entrada** do `acc@` (o Gmail entrega a cópia do remetente também quando ele é Cc — validar uma vez com mensagem real).
- Botão do e-mail abre o alerta do **próprio** colaborador logado e a ação grava o ator correto.
- Resposta do colaborador (From real) vira ação dele; a cópia Cc **não** vira resposta.
- `risk_alerts_enabled` permanece `false` até autorização separada.

## Rollback

Reverter o commit do código **e** restaurar as variáveis anteriores (`ACC_PROJECT_PILOT_DESTINATION`, `…_SENDER=crm@…`, tokens do `crm@`). Não há migration nem dado a desfazer.
Enquanto o rollback não for feito, `ACC_PROJECT_PILOT_SENDER` ≠ `acc@` bloqueia (não envia pela identidade errada).

## Configuração do Google Workspace para `acc@axion.com.br` (procedimento — nada foi executado)

Quem executa: administrador do Workspace + uma pessoa com acesso ao Google Cloud do cliente OAuth do piloto. Nenhum passo altera contas ou dados dos colaboradores.

### 1. A conta precisa ser um USUÁRIO real com Gmail
- `acc@axion.com.br` deve ser um **usuário licenciado com caixa Gmail própria** (não um alias, não um Grupo/lista, não um "send as" de outra caixa). Só um usuário real autentica por OAuth, tem caixa de entrada e recebe a cópia (Cc).
- Se hoje `acc@` for alias ou grupo, criar o usuário (ou converter) antes de seguir. O endereço institucional antigo documentado em `docs/email-branding.md` é `acc_ia@axion.com.br`; **o modelo exige `acc@`** — confirmar qual existe de fato.
- Conferir (Admin console → Usuários → acc@): status Ativo; Gmail habilitado; sem regra de roteamento/encaminhamento que desvie o Cc; sem filtro que arquive/descarte mensagens que ele mesmo enviou.

### 2. Cliente OAuth (Google Cloud)
- Projeto/cliente: o **cliente isolado do piloto** (`GOOGLE_GMAIL_PILOT_CLIENT_ID` / `…_SECRET`); API **Gmail API** habilitada no projeto.
- Tela de consentimento: tipo **Interno** (usuários do Workspace da Axion). Em modo "Externo/Teste" o refresh token **expira em 7 dias** e quebraria o piloto.
- URI de redirecionamento autorizado do cliente: `http://localhost:53684/oauth2callback` (usado só pelo script de consentimento, na máquina de quem consente).
- **Sem delegação de domínio (domain-wide delegation)**: não é necessária e não deve ser criada — o modelo exige que cada identidade se autentique com o próprio consentimento.

### 3. Permissões (escopos) OAuth exatas

| Finalidade | Conta que consente | Escopos | Observação |
|---|---|---|---|
| **Enviar como ACC** (remetente institucional) | `acc@axion.com.br` | `https://www.googleapis.com/auth/gmail.send` + `https://www.googleapis.com/auth/userinfo.email` (o Google acrescenta `openid`) | `userinfo.email` existe só para **provar** que a conta que consentiu é `acc@`; não lê mensagens. |
| **Receber respostas** (fase `replies`, leitura da caixa) | `acc@axion.com.br` | `https://www.googleapis.com/auth/gmail.readonly` | Escopo **restrito** do Gmail; sem `modify`/`labels`. Variáveis `ACC_RISK_ALERTS_INBOUND_*` (dedicadas; a fase não cai para `GOOGLE_GMAIL_INBOUND_*`). |
| Participante enviando com a própria conta (opcional) | cada colaborador, na própria conta | `gmail.send` + `userinfo.email` | Só se o colaborador for incluído em `ACC_PROJECT_PILOT_AUTHORIZED_SENDERS`. |

Nenhum outro escopo (`gmail.modify`, `gmail.compose`, `mail.google.com`) é necessário ou aceito pelo procedimento.

### 4. Admin console (Segurança → Controles de API)
- **Controle de acesso a apps**: marcar o cliente OAuth do piloto como **Confiável** (ou liberar `gmail.send` e `gmail.readonly` para ele), senão o consentimento de escopos restritos é bloqueado.
- Conferir políticas de **reautenticação/controle de sessão para aplicativos do Google Cloud**: se exigirem reautenticação periódica, o refresh token deixa de funcionar — isentar este cliente ou documentar a renovação.
- Conferir que a conta `acc@` não está sujeita a bloqueio por "apps menos seguros"/2SV de forma que impeça o consentimento (o consentimento é interativo, com 2SV normal).

### 5. Consentimento (feito por quem tem a senha/2SV do `acc@`, no próprio computador)
```
node --env-file=apps/web/.env.local scripts/gmail-pilot-sender-oauth.mjs --mailbox=acc@axion.com.br
node --env-file=apps/web/.env.local scripts/gmail-inbound-oauth.mjs --prefix=ACC_RISK_ALERTS_INBOUND   # respostas (gmail.readonly), logado como acc@
```
O script abre o login com `login_hint=acc@…`, exige a conta autenticada **igual** à informada (senão nada é salvo) e grava só no `apps/web/.env.local`; nenhum token aparece no console. Em seguida cadastrar os valores como variáveis **sensíveis** da Vercel (e, para as respostas, como Secrets do GitHub). Nunca em chat, e-mail ou repositório.

### 6. Verificação (somente leitura, sem enviar)
1. Workflow `Pilot Gmail Auth Check` (sem `identity`) → esperado `ok:true`, `accountMatchesSender:true`, escopos `gmail.send`/`userinfo.email`/`openid`.
2. Para cada colaborador autorizado a enviar: o mesmo workflow com `identity=<e-mail dele>` → `accountMatchesSender:true`.
3. Dry-run do `Pilot Single Alert` por colaborador.
4. Cópia institucional: no primeiro envio real autorizado, confirmar que a mensagem aparece na **Caixa de entrada** do `acc@` (além de "Enviados"). O Gmail entrega à caixa de entrada a mensagem em que o remetente também é destinatário (Cc), mas isso deve ser provado uma vez com mensagem real antes de qualquer uso contínuo.

### 7. Por que não há envio sem identidade autenticada
- O envio só ocorre pelo transporte Gmail com o refresh token **daquele remetente**; sem token do remetente resolvido (acc@ ou participante autorizado) o provider lança `EmailSendError` **antes** de MIME e rede.
- O remetente declarado precisa ser igual ao da credencial carregada, e o `Pilot Gmail Auth Check` prova (por `userinfo.email`) que o token pertence à conta declarada. Sem essa prova a homologação não avança.
- Um token de outra conta com o e-mail declarado "acc@" seria enviado pelo Gmail como a conta real do token; por isso o passo 6.1/6.2 (`accountMatchesSender:true`) é **obrigatório** antes do primeiro envio e após qualquer troca de token.
