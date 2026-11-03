# Piloto por projeto — e-mails com remetente e destino fixos (Fase 1)

> Implementado e testado **sem envio real**. Nada disto está ativo enquanto `ACC_PROJECT_PILOT_PROJECT_ID` não for definido no ambiente do servidor. Nenhum valor real de configuração (UUID, contas) é versionado.

## O que faz
Para **um** projeto (escolhido pelo UUID), toda mensagem do ACC sobre ele — alertas, escalonamentos (T0, N1, Diretoria, topo), repetições, reenvios, lembretes/filas, resumos, revisão de versão, falha operacional, autorização de e-mail — passa por um único transporte restrito, no último ponto antes da rede (`GmailEmailProvider.send`, espelhado no `FakeEmailProvider`):
- **Remetente:** `crm@axion.com.br` (lista fixa no código). Se a conta de envio padrão (`GOOGLE_GMAIL_SENDER_EMAIL`) já é essa, é ela que envia; senão exige identidade OAuth própria (`GOOGLE_GMAIL_PILOT_*`, gerada por `scripts/gmail-pilot-sender-oauth.mjs`, que só salva se a conta autenticada for exatamente `crm@`). **A identidade efetiva de envio em produção não está comprovada** (ver "Evidências"). **Nunca** só troca o cabeçalho `From` e **nunca** cai em outro remetente.
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

## Evidências do ambiente real (somente leitura, 2026-11-04)
- **Vercel (production), só nomes/metadados:** presentes `AXION_EMAIL_PROVIDER`, `GOOGLE_GMAIL_{CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN,SENDER_EMAIL}`, `GOOGLE_GMAIL_INBOUND_MAILBOX`, `ACC_OUTBOUND_MODE`, `ACC_PILOT_RECIPIENT`; **ausentes** `ACC_EMAIL_ONLY_RECIPIENT`, `ACC_PROJECT_PILOT_*`, `GOOGLE_GMAIL_PILOT_*`, `ELEVENLABS_*`, `ACC_WHATSAPP_ENABLED`. Os valores são "sensitive" (ilegíveis): **caixa de envio e caixa do Reply-To em produção não podem ser lidas**.
- **GitHub:** secrets `GOOGLE_GMAIL_INBOUND_*` e `GOOGLE_GMAIL_INBOUND_MAILBOX` existem; `ACC_RISK_ALERTS_INBOUND_*` **não existem**. Última execução (2026-11-03): fase de respostas `SKIPPED_NOT_CONFIGURED` (variáveis ausentes). Variáveis `ACC_PROJECT_PILOT_*` ausentes.
- **Identidade de envio:** a credencial de envio local tem só `gmail.send` (a conta não é consultável sem enviar). Mensagens do ACC recebidas na caixa `crm@` mostram `From: crm@` (17, 2026-09-21 a 10-27) e `From:` de uma caixa pessoal de usuário (8, 2026-09-24 a 10-28) — períodos sobrepostos e o último é dessa caixa pessoal: **inconclusivo**. Prova possível: um envio controlado (autorizado) após a configuração, ou o consentimento do passo S2.
- **Caixa de leitura:** a credencial de leitura local lê `crm@axion.com.br` (escopo `gmail.readonly`); que o secret do GitHub seja a mesma conta não pôde ser provado aqui — a própria fase de respostas confere o perfil Gmail autenticado contra `ACC_RISK_ALERTS_INBOUND_MAILBOX` e bloqueia se divergir.

## Mapeamento de configuração (Opção B decidida) — nada foi alterado
| Onde | Variável | Valor |
|---|---|---|
| GitHub secrets | `ACC_RISK_ALERTS_INBOUND_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN` | mesmos valores de `GOOGLE_GMAIL_INBOUND_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN` (credencial de leitura que lê `crm@`) |
| GitHub secrets | `ACC_RISK_ALERTS_INBOUND_MAILBOX` | `crm@axion.com.br` |
| Vercel (production) | `GOOGLE_GMAIL_INBOUND_MAILBOX` | `crm@axion.com.br` (base do Reply-To; global para todos os projetos com alertas) |
| Vercel + GitHub `vars` | `ACC_PROJECT_PILOT_PROJECT_ID` | UUID confirmado pelo responsável do projeto (nunca versionado) |
| Vercel + GitHub `vars` | `ACC_PROJECT_PILOT_DESTINATION` / `ACC_PROJECT_PILOT_SENDER` | `axion@axion.com.br` / `crm@axion.com.br` |
| Vercel | `GOOGLE_GMAIL_PILOT_SENDER_EMAIL`, `GOOGLE_GMAIL_PILOT_REFRESH_TOKEN` | **só se S2** (abaixo) |
| — | `ACC_EMAIL_ONLY_RECIPIENT` | continua ausente; não precisa mudar |

**Remetente (decidir após a evidência):** S1 — se `GOOGLE_GMAIL_SENDER_EMAIL` de produção for `crm@`, nenhuma variável de remetente é necessária. S2 — se for outra conta (ou não puder ser provado), rodar `node --env-file=apps/web/.env.local scripts/gmail-pilot-sender-oauth.mjs --mailbox=crm@axion.com.br` (ação interativa, logado como `crm@`; o script só salva se a conta autenticada for `crm@`) e cadastrar as duas variáveis `GOOGLE_GMAIL_PILOT_*` como sensíveis. Sem S1 nem S2 a mensagem do piloto é recusada (por desenho).

## Dependências externas pendentes
1. Confirmação explícita do projeto (UUID) pelo responsável do projeto — não ativado automaticamente.
2. Secrets `ACC_RISK_ALERTS_INBOUND_*`, `GOOGLE_GMAIL_INBOUND_MAILBOX` e variáveis do piloto (tabela acima).
3. Comprovação da identidade de envio (S1) ou consentimento OAuth do `crm@` (S2).
4. Vínculos dos níveis (ver relatório): Escalão 1 (Gestor) não definido nas áreas; allowlist do projeto cobre só 2 pessoas.

## Testes
`test-project-pilot-profile.mjs` (12) e `test-pilot-mailbox-reply.mjs` (9), no `npm run test:email` (etapa do CI).
