# Piloto WEG — entrega direta com cópia institucional em crm@

> **Conta institucional do piloto: `crm@axion.com.br`.** `acc@axion.com.br` **não existe** no Google Workspace e `axion@axion.com.br` foi aposentado:
> ambos são **proibidos** em qualquer roteamento do piloto (To, Cc, Reply-To, caixa de resposta).

Substitui o modelo anterior de **destino único** (`axion@axion.com.br`) e o grupo `WEG_INTERNAL_FOUR`. Os registros históricos (outbox, auditoria,
`risk_alert_outbox`, `emails`, migrations) **não são alterados**: eles continuam descrevendo o que foi feito na época.

## Regra

| Item | Regra |
|---|---|
| Participantes | Reynaldo, Jaime Ramos e Carlos Evandro. Lista fixa no código (`PILOT_PARTICIPANT_ADDRESSES`, em `apps/web/lib/email/project-pilot-profile.ts`); os endereços foram conferidos em `profiles.email` (ACTIVE na WEG e na allowlist do piloto). |
| Destinatário principal (To) | O **próprio colaborador** a quem o alerta se destina. Usuário lógico = destinatário físico. Qualquer outro endereço **bloqueia** o envio (nunca é substituído). |
| Cópia (Cc) | `crm@axion.com.br` em **toda** mensagem do piloto, inclusive quando o remetente é o próprio `crm@`. Nunca Bcc. |
| Remetente | `crm@axion.com.br` (institucional, credencial OAuth **já homologada**) **ou** um participante *autorizado* (`ACC_PROJECT_PILOT_AUTHORIZED_SENDERS`) e *autenticado* (refresh token próprio por OAuth individual). Sem credencial do remetente solicitado, **não envia** — nunca usa outra identidade. |
| Proibido | `axion@axion.com.br` e `acc@axion.com.br` em To, Cc, Reply-To, caixa de resposta ou qualquer cabeçalho de destinatário (`PILOT_FORBIDDEN_ADDRESSES`). |
| Projeto | Exclusivamente a WEG (`00000000-0000-4000-8000-000000000001`). Outro id torna o perfil inválido (fail closed). |
| Respostas | Reply-To `crm+alerta-<token>@axion.com.br` (cai na caixa do `crm@`). Cada colaborador responde com a **própria** identidade (From real); a ação é do **remetente real** — perfil, vínculo ativo, destinatário lógico e allowlist — e fica vinculada ao caso pela correlação (token do Reply-To / In-Reply-To / código visível). Resposta do `crm@` e a cópia Cc (`X-ACC-Outbound`) são ignoradas; remetente desconhecido é `UNAUTHORIZED_REPLY`. Não existe atribuição por "caixa do piloto". |
| Botões | Link `/{projectId}/alertas/{caseId}?acao=…&t=…` (token de uso único por caso + destinatário, 72 h). GET não altera estado; a ação é POST revalidado no servidor pelo usuário **logado** (que agora é o próprio destinatário). |

## Matriz real de remetentes × destinatários

| Remetente (From) | To | Cc | Condição |
|---|---|---|---|
| `crm@axion.com.br` | Reynaldo / Jaime / Carlos | `crm@axion.com.br` | Padrão. Usa a identidade OAuth **já homologada** (`GOOGLE_GMAIL_PILOT_*`). |
| Reynaldo | Jaime / Carlos | `crm@axion.com.br` | Reynaldo em `ACC_PROJECT_PILOT_AUTHORIZED_SENDERS` **e** `GOOGLE_GMAIL_PILOT_USER_REYNALDO_REFRESH_TOKEN`. |
| Jaime | Reynaldo / Carlos | `crm@axion.com.br` | Idem, `…_JAIME_RAMOS_…`. |
| Carlos Evandro | Reynaldo / Jaime | `crm@axion.com.br` | Idem, `…_CARLOS_EVANDRO_…`. |
| qualquer outro (inclui `acc@`, `axion@`) | — | — | Bloqueado. |

## Variáveis — o que realmente muda

O ambiente de produção **já está** no estado-alvo para a identidade: `ACC_PROJECT_PILOT_SENDER=crm@axion.com.br`, `GOOGLE_GMAIL_PILOT_SENDER_EMAIL=crm@axion.com.br`
(homologada: `Pilot Gmail Auth Check` com `accountMatchesSender:true`) e `GOOGLE_GMAIL_INBOUND_MAILBOX=crm@axion.com.br`. **Nenhum token novo é necessário para enviar.**

| Variável | Hoje | Depois |
|---|---|---|
| `ACC_PROJECT_PILOT_PROJECT_ID` | WEG | igual |
| `ACC_PROJECT_PILOT_SENDER` | `crm@axion.com.br` | igual |
| `GOOGLE_GMAIL_PILOT_SENDER_EMAIL` / `…_REFRESH_TOKEN` / `…_CLIENT_ID` / `…_CLIENT_SECRET` | crm@ homologado | **iguais (reutilizados)** |
| `GOOGLE_GMAIL_INBOUND_MAILBOX` | `crm@axion.com.br` | igual (base do Reply-To) |
| `ACC_PROJECT_PILOT_DESTINATION` | `axion@axion.com.br` | **remover** (o código novo já a ignora — remover é higiene) |
| `ACC_PROJECT_PILOT_TEST_GROUP` | vazia | **remover** (ignorada) |
| `ACC_PROJECT_PILOT_AUTHORIZED_SENDERS` | — | opcional; **vazio** = só o `crm@` envia |
| `GOOGLE_GMAIL_PILOT_USER_<CHAVE>_REFRESH_TOKEN` | — | só para colaboradores autorizados a enviar (OAuth individual) |
| `ACC_RISK_ALERTS_INBOUND_*` (secrets do GitHub; fase de respostas) | **a verificar** — precisa ser a leitura (`gmail.readonly`) do `crm@` | ver "Leitura das respostas" |
| `project_weekly_schedule_ingestion_configs.pilot_delivery_override_email` | `crm@…` | ignorado enquanto o perfil estiver ativo (não muda) |

Variável de repositório do GitHub `ACC_PROJECT_PILOT_DESTINATION` (`axion@…`): remover. O workflow `weekly-schedule-email-ingestion.yml` deixa de repassá-la.

## Leitura das respostas (`gmail.readonly` do crm@)

O token de envio homologado tem **só** `gmail.send` + `userinfo.email`: ele não lê a caixa. A fase `replies` do worker usa credenciais **dedicadas** `ACC_RISK_ALERTS_INBOUND_*`
(`gmail.readonly`) e **bloqueia** (`BLOCKED_MAILBOX_MISMATCH`) se a conta autenticada não for exatamente a caixa configurada.

- Se `ACC_RISK_ALERTS_INBOUND_MAILBOX`/`…_REFRESH_TOKEN` **já** forem do `crm@` com `gmail.readonly`: reutilizar, nada a fazer.
- Se forem de outra caixa (ex.: a antiga `axion@`): é preciso **um** consentimento `gmail.readonly` do `crm@` (`scripts/gmail-inbound-oauth.mjs --prefix=ACC_RISK_ALERTS_INBOUND`), cadastrado só nos secrets do GitHub. É a única credencial nova possível, e só para leitura; **o envio não depende dela** (sem ela as respostas por e-mail ficam desligadas; botões e envio continuam).

## Cópia institucional quando o remetente é o próprio `crm@`

- **O que é garantido:** a cópia (`Cc: crm@`) é obrigatória e conferida no MIME final; a mensagem enviada pelo `crm@` fica **sempre** na pasta **Enviados / Todos os e-mails** da caixa `crm@` (o Gmail guarda toda mensagem enviada), e o ACC registra o envio na outbox, em `emails` e na auditoria (remetente, destinatário lógico, cópia, `provider_message_id`, `Message-ID`).
- **O que NÃO é garantido sem teste real:** que essa mensagem também apareça na **Caixa de entrada**. Para uma mensagem enviada a si mesmo o Gmail guarda **uma única cópia** (rótulos *Enviados* e, em geral, *Entrada*); a documentação pública não é conclusiva para "Cc ao próprio remetente" e relatos divergem. Quando o remetente é **um colaborador**, o `Cc: crm@` é uma entrega comum e cai na Caixa de entrada do `crm@`.
- **Verificação (uma vez, no primeiro envio real autorizado):** conferir na caixa `crm@` se a mensagem aparece em *Caixa de entrada* (além de *Enviados*).
- **Se NÃO aparecer na Caixa de entrada — mecanismo proposto (sem duplicar envio):**
  1. **Sem código novo (recomendado primeiro):** tratar *Todos os e-mails*/rótulo *Enviados* do `crm@` como o arquivo institucional (já completo) e a outbox/auditoria do ACC como livro-razão.
  2. **Se a Caixa de entrada for requisito duro:** após cada envio bem-sucedido, o ACC chama `users.messages.insert` **uma vez** no `crm@` com o **mesmo** `Message-ID` e rótulo `INBOX` (idempotente por `Message-ID`; **não envia** outro e-mail). Exige o escopo adicional `gmail.insert` (novo consentimento do `crm@`) e entra por PR separado, depois de provado que o 1 não basta.
- Enquanto isso não for verificado, o piloto **não** depende da cópia na Caixa de entrada para funcionar: botões, ações, respostas dos colaboradores e auditoria independem dela.

## Plano de migração (nada disto foi executado)

O código novo é **fail closed** e o ambiente já está compatível, então a migração é curta:

1. (Opcional, higiene) Remover `ACC_PROJECT_PILOT_DESTINATION` e `ACC_PROJECT_PILOT_TEST_GROUP` da Vercel e a variável `ACC_PROJECT_PILOT_DESTINATION` do GitHub.
2. Verificar a situação de `ACC_RISK_ALERTS_INBOUND_*` (seção acima) — só afeta as respostas por e-mail.
3. Merge e deploy do PR. Nenhuma variável de identidade precisa mudar.
4. `Pilot Gmail Auth Check` (somente leitura): deve manter `ok:true`, `accountMatchesSender:true` para `crm@`.
5. Dry-run do `Pilot Single Alert` para cada colaborador, sem envio.
6. Envio real único, com autorização específica (armar `ACC_PILOT_SINGLE_ALERT_*`, executar, desarmar), conferindo To/Cc/From e a caixa do `crm@` (Enviados e Entrada).

Colaborador como remetente (opcional, depois): consentir `gmail.send`+`userinfo.email` na conta dele (`gmail-pilot-sender-oauth.mjs --mailbox=<e-mail do colaborador>`), cadastrar `GOOGLE_GMAIL_PILOT_USER_<CHAVE>_REFRESH_TOKEN`, incluí-lo em `ACC_PROJECT_PILOT_AUTHORIZED_SENDERS` e rodar `Pilot Gmail Auth Check` com `identity=<e-mail do colaborador>` (`accountMatchesSender:true`).

## Homologação (aceite)

- To = colaborador; Cc = `crm@`; From = `crm@` (ou o colaborador autorizado); **nenhum** `axion@` ou `acc@` em cabeçalho algum ("Mostrar original").
- Botão do e-mail abre o alerta do **próprio** colaborador logado e a ação grava o ator correto.
- Resposta do colaborador (From real) vira ação dele e fica vinculada ao caso; a cópia Cc **não** vira resposta.
- Cópia na caixa `crm@`: *Enviados* (garantido) e *Entrada* (verificar).
- `risk_alerts_enabled` permanece `false` até autorização separada.

## Rollback

Reverter o commit do código; as variáveis de identidade não mudaram. Se `ACC_PROJECT_PILOT_DESTINATION`/`…_TEST_GROUP` tiverem sido removidas e o código antigo voltar, restaurá-las
(`axion@axion.com.br` e vazio). Não há migration nem dado a desfazer. Atalhos imediatos: manter `risk_alerts_enabled=false`, deixar `ACC_PILOT_SINGLE_ALERT_*` em "DESARMADO" ou `AXION_EMAIL_PROVIDER=fake`.

## Configuração do Google para o `crm@axion.com.br` (conferência; nada foi executado)

A conta **já existe e já envia** (homologada). O que conferir/fazer, por finalidade:

| Finalidade | Conta | Escopos OAuth | Estado |
|---|---|---|---|
| Enviar como institucional | `crm@axion.com.br` | `gmail.send` + `userinfo.email` (+ `openid`) | **Pronto** — reutilizar `GOOGLE_GMAIL_PILOT_*` |
| Ler respostas (fase `replies`) | `crm@axion.com.br` | `gmail.readonly` | **Verificar** `ACC_RISK_ALERTS_INBOUND_*` |
| Colaborador enviando (opcional) | cada colaborador | `gmail.send` + `userinfo.email` | só se autorizado |
| Cópia na Caixa de entrada (só se o teste real falhar) | `crm@axion.com.br` | `gmail.insert` (adicional) | não necessário por padrão |

Cliente OAuth: o isolado do piloto (tela de consentimento **Interna**, senão o refresh token expira em 7 dias), Gmail API habilitada, sem delegação de domínio. Admin console → Controles de API: cliente **confiável** para os escopos acima e conferir a política de reautenticação.

### Por que não há envio sem identidade autenticada
- O envio só ocorre com o refresh token **daquele remetente**; sem token do remetente resolvido (`crm@` ou participante autorizado) o provider lança `EmailSendError` **antes** de MIME e rede.
- O remetente declarado precisa ser igual ao da credencial carregada, e o `Pilot Gmail Auth Check` prova (por `userinfo.email`) que o token pertence à conta declarada — para o `crm@` e, com `identity=`, para cada colaborador.
- Um token de outra conta rotulado como `crm@` seria enviado pelo Gmail como a conta real do token; por isso `accountMatchesSender:true` é **obrigatório** antes do primeiro envio e após qualquer troca de token.
