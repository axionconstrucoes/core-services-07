# Piloto por projeto — e-mails com remetente e destino fixos (Fase 1)

> Implementado e testado **sem envio real**. Nada disto está ativo enquanto `ACC_PROJECT_PILOT_PROJECT_ID` não for definido no ambiente do servidor. Nenhum valor real de configuração é versionado.

## O que faz
Para **um** projeto (escolhido pelo UUID), toda mensagem do ACC sobre ele — alertas, escalonamentos (T0, N1, Diretoria, topo), repetições, reenvios, lembretes/filas, resumos, revisão de versão, falha operacional, autorização de e-mail — passa por um único transporte restrito, no último ponto antes da rede (`GmailEmailProvider.send`, espelhado no `FakeEmailProvider`):
- **Remetente:** `crm@axion.com.br` (lista fixa no código). Usa uma identidade OAuth própria (`GOOGLE_GMAIL_PILOT_*`); **nunca** só troca o cabeçalho `From` e **nunca** cai no remetente padrão (sem a identidade, a mensagem é recusada).
- **Destino:** `axion@axion.com.br` (lista fixa). Todos os participantes simulados recebem ali; nenhum Para/CC/CCO real. A conferência final é feita sobre o MIME já montado (Para único, `From` do piloto, nenhum `Cc`/`Bcc`/`Resent-*`).
- **Identificação:** assunto `[PILOTO] [<nível>] …`; faixa no topo (texto e HTML) com "PILOTO — TESTE CONTROLADO", **participante simulado** e **nível de escalonamento**. O endereço do destinatário lógico nunca aparece.
- **Rastreabilidade:** o destinatário lógico continua sendo decidido e gravado pelos fluxos de origem (outbox, `emails`, auditoria, conversa/Reply-To de alerta); só a entrega muda. Cada participante gera sua própria mensagem (sem deduplicar por endereço de entrega).
- **Respostas:** o `Reply-To` de conversa de alerta (`<caixa>+alerta-<token>@dominio`) continua validado pelo guard global. A prontidão do piloto passa a exigir `GOOGLE_GMAIL_INBOUND_MAILBOX` = remetente do piloto (bloqueio `PROJECT_PILOT_REPLY_MAILBOX_MISMATCH`).
- **Outros projetos:** voltam intocados (testado), em modo piloto global ou produção.
- **Falha fechada:** projeto piloto definido com configuração inválida ou sem identidade de envio ⇒ envio recusado antes de MIME e rede.

## Variáveis (servidor)
`ACC_PROJECT_PILOT_PROJECT_ID`, `ACC_PROJECT_PILOT_DESTINATION`, `ACC_PROJECT_PILOT_SENDER`, `GOOGLE_GMAIL_PILOT_SENDER_EMAIL`, `GOOGLE_GMAIL_PILOT_REFRESH_TOKEN` (ver `apps/web/.env.example`). `ACC_EMAIL_ONLY_RECIPIENT` precisa estar vazio (é global).

## Identificar o projeto certo
O nome não identifica o piloto (existem outros projetos do mesmo cliente). Use o UUID: `node --env-file=apps/web/.env.local scripts/resolve-pilot-project.mjs --search <trecho>` lista candidatos e `--project-id <uuid>` confirma código/nome/cliente e a configuração de alertas (somente leitura; exige autorização para ler o banco do ambiente). Registre a conferência no PR/ata, **não** o UUID em arquivos do repositório.

## Dependências externas (não verificáveis a partir do código)
1. A caixa `crm@axion.com.br` (ou um alias "enviar como" verificado) precisa autorizar o cliente OAuth com escopo `gmail.send`, gerando o refresh token do piloto. Sem isso o piloto não envia (por desenho).
2. A ingestão de respostas precisa monitorar essa mesma caixa (`GOOGLE_GMAIL_INBOUND_MAILBOX=crm@axion.com.br`) com credencial de leitura própria.
3. UUID do projeto no ambiente de destino conferido pelo responsável.

## Testes
`scripts/test-project-pilot-profile.mjs` (12 verificações: configuração, outros projetos, escalonamentos/repetições/reenvios, cc/bcc, conferência do MIME, prontidão, e varredura estrutural de que todo `provider.send` carrega o projeto). Roda em `npm run test:email` (etapa do CI).
