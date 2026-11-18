# Autorização da caixa de um titular (Gmail, somente leitura)

A coleta da caixa própria de um titular (`scripts/gmail-owner-mailbox-sync.mjs`, workflow
`gmail-owner-mailbox-sync.yml`) depende de um consentimento `https://www.googleapis.com/auth/gmail.readonly`
dado **pelo próprio titular**.

## Procedimento reservado

**O código de autorização nunca sai desta máquina.** A URL de retorno (`http://localhost:53682/oauth2callback?code=...`)
contém o código. Ela não deve ser copiada nem enviada por chat, e-mail, PR, issue ou log. O script não tem modo de
"colar a URL de retorno"; as flags antigas `--print-url` e `--callback-url` são recusadas.

Há dois caminhos aceitos:

**A) Presencial (preferível).** O titular usa esta máquina:
1. Defina `GOOGLE_GMAIL_TITULAR_<N>_MAILBOX` em `apps/web/.env.local`.
2. Rode `node --env-file=apps/web/.env.local scripts/gmail-inbound-oauth.mjs --prefix=GOOGLE_GMAIL_TITULAR_<N> --client-prefix=GOOGLE_GMAIL_INBOUND --no-open`.
3. Abra uma **janela anônima** do navegador desta máquina e cole a URL mostrada no terminal.
4. O titular entra com a própria senha e 2FA e aprova. O operador não digita a senha.
5. O Google devolve o código ao servidor local, que só aceita conexões de 127.0.0.1:53682 e expira em 15 minutos.
   O refresh token vai apenas para `apps/web/.env.local`, sem ser exibido.
6. Feche a janela anônima.

**B) Acesso remoto à tela desta máquina.** É o mesmo procedimento, com o titular operando a janela anônima por
compartilhamento de controle remoto (ferramenta corporativa). O código continua indo do navegador desta máquina para
o servidor local.

**Não recomendado: o titular troca o código na máquina dele.** Isso exigiria levar o client secret e um acesso de
gravação de segredos do repositório para a máquina do titular.

## Depois do consentimento
1. Grave os segredos no GitHub direto do `.env.local`, sem exibir valores:
   - `GOOGLE_GMAIL_TITULAR_<N>_MAILBOX` e `GOOGLE_GMAIL_TITULAR_<N>_REFRESH_TOKEN`;
   - `GOOGLE_GMAIL_TITULAR_<N>_CLIENT_ID` e `_CLIENT_SECRET`, com os mesmos valores do cliente `GOOGLE_GMAIL_INBOUND` local.
     Assim o token é usado com o cliente que o emitiu.
2. Cadastre a caixa na lista da obra (`project_email_ingestion_mailboxes`, `enabled=true`). Sem isso, nada é lido.
3. Faça uma simulação (`apply=false`), depois a carga, e confira os registros.
4. Só depois disso a caixa pode ser declarada integrada.

## Configuração do cliente OAuth (o que já foi verificado e o que só o Console mostra)
Verificado sem login, por requisição ao endpoint de autorização:
- `localhost:53682/oauth2callback` é aceito e segue para o login;
- outra porta, `127.0.0.1` e um https não registrado são recusados (`redirect_uri_mismatch` / `invalid_request`);
- um cliente inexistente gera `invalid_client`.

Conclusão: é um cliente do tipo **Aplicativo da Web** com esse redirect registrado exatamente. Um cliente "Desktop"
aceitaria qualquer porta de loopback.

Só o Console mostra o tipo de público. Confira em Google Cloud Console → projeto do cliente → **Google Auth Platform**
(antiga "Tela de consentimento OAuth"):
- **Público / User type:** "Interno" restringe ao Workspace da empresa e não mostra aviso de app não verificado.
  "Externo" com `gmail.readonly` (escopo restrito) mostra "Google não verificou este app" e tem limite de usuários.
- **Status de publicação:** "Em teste" faz o refresh token expirar em 7 dias e só aceita usuários de teste.
  Os tokens existentes deste cliente seguem válidos há mais de 7 dias, o que indica que não está "Externo em teste".
- **Clientes → este cliente:** o tipo e os URIs de redirecionamento autorizados devem incluir `http://localhost:53682/oauth2callback`.
- **Workspace Admin** (admin.google.com → Segurança → Controle de acesso e dados → Controles de API): verifique se o
  app não está bloqueado para usuários do domínio.
