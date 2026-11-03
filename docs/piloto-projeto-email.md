# Piloto por projeto — e-mails com remetente e destino fixos (Fase 1)

> Implementado e testado **sem envio real**. Nada disto está ativo enquanto `ACC_PROJECT_PILOT_PROJECT_ID` não for definido no ambiente do servidor. Nenhum valor real de configuração (UUID, contas) é versionado.

## O que faz
Para **um** projeto (escolhido pelo UUID), toda mensagem do ACC sobre ele — alertas, escalonamentos (T0, N1, Diretoria, topo), repetições, reenvios, lembretes/filas, resumos, revisão de versão, falha operacional, autorização de e-mail — passa por um único transporte restrito, no último ponto antes da rede (`GmailEmailProvider.send`, espelhado no `FakeEmailProvider`):
- **Remetente:** `crm@axion.com.br` (lista fixa no código). Se a conta autenticada do envio padrão já é essa, é ela que envia; senão exige identidade OAuth própria (`GOOGLE_GMAIL_PILOT_*`). **Nunca** só troca o cabeçalho `From` e **nunca** cai em outro remetente.
- **Destino:** `axion@axion.com.br` (lista fixa). Todos os participantes simulados recebem ali; nenhum Para/CC/CCO real. A conferência final é sobre o MIME já montado (Para único, `From` do piloto, nenhum `Cc`/`Bcc`/`Resent-*`).
- **Identificação:** assunto `[PILOTO] [<nível>]`; faixa no topo (texto e HTML) com "PILOTO — TESTE CONTROLADO", **participante simulado** e **nível de escalonamento**. O endereço do destinatário lógico nunca aparece.
- **Rastreabilidade:** o destinatário lógico continua decidido e gravado pelos fluxos de origem (outbox, `emails`, auditoria, conversa/Reply-To). Cada participante gera sua própria mensagem. O **override de entrega legado** do projeto (`pilot_delivery_override_email`) é ignorado enquanto o perfil estiver ativo, para não fundir participantes por endereço de entrega.
- **Outros projetos:** voltam intocados (testado), em modo piloto global ou produção.
- **Falha fechada:** perfil inválido ou sem identidade de envio ⇒ recusa antes de MIME e rede; a prontidão do ciclo de alertas bloqueia com `PROJECT_PILOT_PROFILE_INVALID`.

## `ACC_EMAIL_ONLY_RECIPIENT` (global)
Não precisa ser esvaziada nem alterada. A trava continua valendo para todos os projetos; para mensagens que passaram pelo perfil (destino fixo e já conferido), ela é satisfeita quando o destino efetivo é exatamente o destino do piloto. Testado: com o valor global `crm@…`, o projeto piloto chega a `axion@…` e outro projeto continua sujeito ao valor global (e é bloqueado se o destino efetivo divergir).

## Respostas: vínculo ao alerta e ao participante simulado
- O `Reply-To` de cada mensagem é `<caixa>+alerta-<token>@dominio`, com **token opaco por mensagem** (só o hash é gravado) ligado ao alerta e ao participante daquela mensagem (via `risk_alert_outbox.recipient_user_id`).
- Resposta **escrita pela caixa do piloto** (`axion@…`) é atribuída ao **participante da mensagem respondida**: token do `Reply-To` e/ou `In-Reply-To` (se ambos existirem, têm de concordar). Código visível e `References` nunca identificam participante.
- **Sem elevar permissões:** o ator é exatamente o participante (mesmas regras de sempre: destinatário do alerta, allowlist, vínculo ativo, SPF/DKIM/DMARC sem falha) e as transições passam pela mesma máquina de estados/política desse participante. Vale só para o projeto piloto e só para remetente = caixa do piloto. Qualquer outra situação segue como antes (recusada/revisão humana). Cada uso grava `RISK_ALERT_PILOT_MAILBOX_REPLY` na auditoria.
- Efeito colateral aceito do piloto: quem controla a caixa `axion@` pode responder "como" qualquer participante daquele alerta. É o propósito do participante simulado e fica restrito à allowlist do projeto.
- Testes (transporte simulado): `scripts/test-pilot-mailbox-reply.mjs` (9 verificações, incl. 3 níveis, fora da allowlist/destinatários/vínculo, conflito token×In-Reply-To, código visível, SPF/DKIM falho, outros projetos, auto-resposta/bounce, `ACC_EMAIL_ONLY_RECIPIENT`).

## Variáveis (servidor / worker)
`ACC_PROJECT_PILOT_PROJECT_ID`, `ACC_PROJECT_PILOT_DESTINATION`, `ACC_PROJECT_PILOT_SENDER` — no app (Vercel) **e** no worker de respostas (variáveis do GitHub Actions `vars.*`, já referenciadas em `weekly-schedule-email-ingestion.yml`). `GOOGLE_GMAIL_PILOT_*` só se a conta de envio padrão não for o remetente do piloto.

## Identificar o projeto certo
O nome não identifica o piloto: `node --env-file=apps/web/.env.local scripts/resolve-pilot-project.mjs --search <trecho>` lista candidatos e `--project-id <uuid>` confirma (somente leitura). Registre a conferência no PR/ata, **não** o UUID em arquivos do repositório.

## Dependências externas
1. **Fase de respostas:** exige `ACC_RISK_ALERTS_INBOUND_{CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN,MAILBOX}` (GitHub Actions, escopo `gmail.readonly`) — sem elas a fase é pulada. A caixa configurada ali tem de ser a mesma de `GOOGLE_GMAIL_INBOUND_MAILBOX` do app (é o endereço do `Reply-To`). Veja as duas opções no relatório da etapa.
2. UUID do projeto conferido pelo responsável; allowlist do projeto com os participantes que receberão cada nível.
3. Eventual consentimento OAuth interativo (só se escolher caixa que ainda não tenha credencial de leitura dedicada).

## Testes
`test-project-pilot-profile.mjs` (12) e `test-pilot-mailbox-reply.mjs` (9), no `npm run test:email` (etapa do CI).
