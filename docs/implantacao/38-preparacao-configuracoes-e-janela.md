# 38 - Preparação: Vercel, Auth, Google, fontes, 90 mensagens e roteiro da janela (23/11/2026)

Somente preparação. **Nada foi alterado** na Vercel, no Supabase, no Google nem em dados. Complementa os docs 23, 34, 35 e 37. Etapas já homologadas (executor, doc 25) não se repetem.

## 1. Token de ensaio
Aguardando a confirmação da revogação do token `ACC-HOMOLOG-EXECUTOR-02`. Depois: apagar `supabase-pat.dpapi` (pasta `vibe\homolog\secret` do disco do sistema) e verificar que não restam cópias (`.bak-*`; a varredura dos logs do ensaio deu 0 achados). `sk.dpapi` é o arquivo antigo e inválido; pode ser apagado junto, mediante autorização.

## 2. Vercel (projeto `axion-contract-intelligence-5d3g`, equipe `team_lln56Ux7qWfeXcISoYExQn2k`)
| Variável | Valor | Ambiente | Efeito imediato | Efeito após o merge |
|---|---|---|---|---|
| `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED` | `false` | **Production** | **nenhum**: o código da `main` atual **não lê** essa variável (verificado em `27da839`) | desliga as ações extras de e-mail do SSMA (hoje o padrão do código é ligado) |
| `AXION_APP_BASE_URL` | `https://acc.axion.com.br` | Production (já existe, `encrypted`) | só conferir/ajustar | base dos links dos e-mails |
| `ACC_OUTBOUND_MODE` | **qualquer valor diferente de `production`** (já existe, `encrypted`) | Production | só conferir | mantém tudo na trava do piloto |
| `ACC_ALERT_*` (doc 35, seção 4.1) | valores de F0 | Production | nenhum até o merge (o código atual não as lê) | governador ativo, só WEG |

**Impacto:** criar ou editar uma variável **não dispara redeploy**; o valor só vale no **próximo deploy**. Ela **não** altera os crons: a Vercel tem 2 (`weekly-alert-digest`, quartas 10:00 UTC; `system-health`, diário 10:30 UTC = 07:30 BRT), iguais na `main` e na integração.

**Procedimento:** (1) painel, projeto, Settings, Environment Variables; (2) conferir o projeto e marcar **apenas Production**; (3) criar `false` e ajustar as outras; (4) **não** clicar em Redeploy; (5) anotar a hora; (6) para reverter, remover a variável. Os valores de `ACC_OUTBOUND_MODE` e `AXION_APP_BASE_URL` não foram lidos (a ferramenta decifraria todas as variáveis): leia no painel e confirme só "não é `production`" e "é o domínio correto".

Aguardando autorização para criar `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=false` e as `ACC_ALERT_*`.

## 3. Supabase Auth: desativar o cadastro público
**Achados (cópia do backup de produção, só agregados):** 7 usuários Google `@axion.com.br` (todos já entraram), **78 usuários do provedor e-mail com domínio `example.com`** e 1 `axion-test.local`. O app só tem login por **Google** (não há formulário de senha nem de cadastro) e confere o domínio em `/auth/callback`. **Risco real:** o provedor **Email** está habilitado e o cadastro está aberto; a chave pública fica no navegador, então **qualquer pessoa pode criar uma conta Auth direto pela API**. Ela não teria acesso a obras (RLS por membro), mas teria um usuário `authenticated`.

**Procedimento proposto (nesta ordem):**
1. Você me passa a **lista dos usuários corporativos autorizados** (aceitação, D9). Quem ainda não tem linha em `auth.users` precisa ser **pré-criado** (Auth, Users, Invite), porque com o cadastro desligado o **primeiro** login Google de alguém novo seria recusado.
2. Desligar **Allow new users to sign up** (Auth, Sign In / Providers, User Signups).
3. Avaliar desabilitar o provedor **Email** (os 78 usuários de teste deixariam de entrar por senha; o app não usa senha).
4. Testar: login de um usuário existente (deve funcionar) e tentativa anônima de cadastro pela API (deve falhar).
5. Reverter: religar o interruptor.

Os 78 usuários `example.com` em produção são contas de teste; **não foram alterados**. Decisão do Dono sobre desativá-los.

## 4. Google Cloud (OAuth)
Ao abrir a página de credenciais, a conta carregou o projeto padrão "My First Project", **vazio** (sem cliente OAuth). O cliente do ACC está em outro projeto ou outra conta. **Preciso que você indique o projeto** (ou o abra na aba) para conferir: tipo de usuário **Interno**, URIs de redirecionamento autorizados (o callback do Supabase), origens JavaScript e domínio autorizado. Nada foi alterado.

## 5. Seis colaboradores sem caixa e Outlook
Pacote de autorização a conferir (o doc 29 tem o detalhe técnico).
- **Gmail:** (a) lista nominal dos 6 colaboradores e do dono de cada caixa; (b) consentimento individual **ou** delegação de domínio no Workspace, restrita ao escopo `gmail.readonly` e **somente às caixas listadas**; (c) confirmação de que a leitura se limita ao perímetro `weg.net`.
- **Outlook/Microsoft 365:** (a) registro de aplicativo no Entra ID; (b) permissão `Mail.Read` de aplicativo, **restrita por política de acesso** às caixas listadas; (c) consentimento do administrador do tenant.

Nada disso foi iniciado; nenhuma caixa foi acessada. O backfill e o monitoramento existem (doc 29) e rodam primeiro em dry-run.

## 6. As 90 mensagens dentro do escopo sem participante `weg.net`
**Preservadas, sem nenhuma alteração.** Classificação **proposta** (aplicável só com autorização, como correção de dados auditada):

| Grupo | Mensagens | Evidência de vínculo com a obra |
|---|---|---|
| A | 17 | **mesma thread** de uma mensagem com participante `weg.net` (vínculo estrutural) |
| B | 61 | já classificadas por auditoria anterior ("vínculo confirmado por evidência"); manter o motivo gravado |
| C | 12 (4 recebidas, 8 enviadas) | **sem motivo gravado e sem thread `weg.net`**: revisão humana |

Todas têm a contraparte `axion.com.br` (67 recebidas, 23 enviadas): são e-mails internos da Axion sobre a obra. O grupo C exige ler assunto e corpo (não fiz, por ser leitura de conteúdo); até a decisão, **permanecem IN_SCOPE** como estão.

## 7. Roteiro da janela de publicação (60 min; comandos no doc 23)
**Datas sugeridas (fora de quarta-feira):** (1) sábado **28/11**, início às **09:00 BRT**, ou (2) sábado **05/12**. Critérios: depois do cron diário da Vercel (07:30 BRT); sem quarta-feira (resumo semanal 10:00 UTC); poucos usuários. A data só vale se as pré-condições fecharem antes.

| Hora | Passo | Responsável |
|---|---|---|
| T-24 h | Comunicado; conferir variáveis (seção 2); PR #245 com CI verde no commit final; backup lógico e de Storage; restauração local validada (13/13) | Eng-1, Dono |
| T-60 | Backup do dia e `restaurar-validar` | Eng-1 |
| T-30 | Conferências: histórico 134 / `70a176da...`; P0 `930f6d75...`; outbox sem PENDING; 11 jobs ativos | Eng-2 |
| T | Pausar jobs (pg_cron) e workflows de escrita; **congelar** | Eng-1 |
| T+8 | **Ondas** pelo executor (token novo, criado na hora; digitar a frase de confirmação) | Eng-1, Dono confirma |
| T+22 | Trava dos módulos RNC/Garantias; **descongelar**; conferir integridade e P0 | Eng-1, Eng-2 |
| T+33 | **Merge** do PR (deploy automático) só com P0 conferido | **Dono** |
| T+40 | Retomar jobs; **nenhuma flag nova**; governador F0 | Eng-1 |
| T+45 a T+60 | Observação, fumaça, decisão GO/NO-GO | Dono |
| Rollback | Qualquer critério de aborto do doc 23: reverter por etapa; app via `request_rollback` para `27da839` | Dono decide |

**Responsáveis a nomear:** Dono (decide), Eng-1 (executa), Eng-2 (confere e anota), Área (aceitação). Hoje só o **Dono** está definido.

## 8. Checklist GO/NO-GO (itens abertos; o homologado não se repete)
| # | Item | Quem |
|---|---|---|
| 1 | Revogar o token e apagar o arquivo cifrado | Dono, depois Claude |
| 2 | Variáveis da Vercel (seção 2) | Dono autoriza; Claude/Dono aplica |
| 3 | Cadastro público e lista de usuários (seção 3) | Dono |
| 4 | Google Cloud: indicar o projeto (seção 4) | Dono |
| 5 | Fontes validadas do governador, incluindo `SSMA` (doc 35, 4.1) | Dono |
| 6 | Autorizações das 6 caixas e do Outlook (seção 5) | Dono, TI |
| 7 | Grupo C das 90 mensagens (seção 6) | Dono, Planejamento |
| 8 | Data, responsáveis e pessoas da aceitação (seção 7) | Dono |
| 9 | Backup do dia e CI verde no commit final (na véspera) | Eng-1 |

## 9. Execução na Vercel (23/11/2026, autorizada pela Diretoria)
- **Projeto confirmado:** `axion-contract-intelligence-5d3g` (`prj_n9RSTJFgakynjoBOUMCfi19uV24N`), equipe `team_lln56Ux7qWfeXcISoYExQn2k`, com `acc.axion.com.br` entre os domínios.
- **Criada:** `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=false`, tipo `plain`, **somente Production** (id `nQp8Q6SmiWxf4FP4`). **Sem redeploy**: o deploy mais recente (`7a967b0`, preview da branch) é anterior à criação e nenhum deploy novo apareceu. A `main` atual não lê a variável; ela só vale depois do merge. Reverter: remover a variável.
- **Conferidas, sem alterar:** `AXION_APP_BASE_URL` = `https://acc.axion.com.br` (correto); `ACC_OUTBOUND_MODE` = `pilot` (diferente de `production`, correto).
- **Governador F0: preparado, NÃO criado.** Nomes exatos no código (`alert-send-governor.ts`): `ACC_ALERT_MAX_PER_HOUR=10`, `ACC_ALERT_MAX_PER_DAY=30`, `ACC_ALERT_BATCH_SIZE=5`, `ACC_ALERT_CRITICAL_RESERVE_PER_HOUR=2`, `ACC_ALERT_CRITICAL_RESERVE_PER_DAY=5`, `ACC_ALERT_ENABLED_PROJECTS=00000000-0000-4000-8000-000000000001` (obra WEG), `ACC_ALERT_ENABLED_SOURCES=SISTEMA,SLA,ACOES,AUTORIZACAO,SSMA`. Sem efeito antes do merge (a `main` atual não as lê).

### 9.1 Impacto das fontes de F0 (verificado no código)
| Fonte | Tipos | Em F0 |
|---|---|---|
| `SISTEMA` | `SYSTEM_HEALTH` | **liberada** |
| `SLA` | `SLA_ESCALATION` | **liberada** |
| `ACOES` | `ACTION_REQUEST` | **liberada** |
| `AUTORIZACAO` | `EMAIL_AUTHORIZATION` | **liberada** |
| `SSMA` | `SSMA_ACCIDENT`, `SSMA_FIELD_NOTIFICATION` | **liberada** (preserva o aviso de ação corretiva já ativo) |
| `RISCO` | 8 tipos (imediato, escalonamento, resumo, encaminhamento, devolução, resposta do especialista, **confirmação de ação**, piloto único) | **adiada** (fica PENDING, sem gastar tentativa) |
| `EMAIL` | `EMAIL_REPLY_CONFIRMATION`, `EMAIL_SPECIALIST` | **adiada**: **a confirmação de resposta por e-mail não sai em F0** |
| `RELATORIO_SEMANAL`, `CONTRATO`, `CONSTRUMANAGER`, `ENTREGAVEIS` | resumo semanal, lotes de contrato etc. | **adiadas**: o resumo semanal das quartas **não sai em F0** |
Adiar não perde nada: a linha fica na fila e sai quando a fonte for habilitada (F3/F4, doc 35, seção 6).

### 9.2 Achado sobre a reserva para críticos
O governador só trata como **crítico** o envio cujo contexto traz `priority: "CRITICAL"`, e **apenas o ciclo de risco** (fonte `RISCO`) preenche isso. **Escalonamento de SLA com severidade crítica** e **alerta de acidente do SSMA com severidade crítica** **não** informam a prioridade: usam o limite sem reserva (8 por hora e 25 por dia). Como `RISCO` está adiada em F0, **a reserva de 2/h e 5/dia não protege nada em F0**. **Correção proposta** (pequena, com teste; não aplicada): marcar como `CRITICAL` o `SLA_ESCALATION` com severidade crítica e o `SSMA_ACCIDENT` com severidade crítica. Depende de autorização, porque altera código que irá a produção.

## 10. Inventário do Supabase Auth e projeto OAuth do Google (23/11/2026, somente leitura)
**Usuários em produção (consulta agregada ao vivo, sem alterar nada):**
| Provedor | Domínio | Usuários | Já entraram | Último login | Observação |
|---|---|---|---|---|---|
| google | `axion.com.br` | 7 | 7 | 23/11/2026 | os únicos usuários reais; todos confirmados |
| email | `example.com` | 78 | 78 | 26/08/2026 | contas de teste (criadas 23/08) |
| email | `axion-test.local` | 1 | 1 | 19/08/2026 | conta de teste |
Nenhum usuário anônimo, banido ou sem confirmar. Total: 86.

**Projeto OAuth do Google:** o Client ID configurado no Supabase (valor público, não secreto) começa com **`1033164664091`**, que é o **número do projeto** no Google Cloud. Ao abrir `console.cloud.google.com/apis/credentials?project=1033164664091`, a conta logada neste navegador recebeu "você precisa de acesso adicional" (permissão ausente: `resourcemanager.projects.get`). Ou seja, **a conta usada aqui não é a dona do projeto**. Para conferir tipo de usuário (Interno), URIs de redirecionamento e domínio autorizado, alguém com acesso ao projeto `1033164664091` precisa abri-lo; **não foi alterado nem acessado por outra credencial**.

## 11. Variáveis do governador criadas e correção dos críticos (23/11/2026, autorizadas pela Diretoria)
**Criadas na Vercel, somente Production, sem redeploy** (nenhum deploy novo depois da criação; o código da `main` atual não as lê): `ACC_ALERT_MAX_PER_HOUR=10`, `ACC_ALERT_MAX_PER_DAY=30`, `ACC_ALERT_BATCH_SIZE=5`, `ACC_ALERT_CRITICAL_RESERVE_PER_HOUR=2`, `ACC_ALERT_CRITICAL_RESERVE_PER_DAY=5`, `ACC_ALERT_ENABLED_PROJECTS=00000000-0000-4000-8000-000000000001` (obra WEG), `ACC_ALERT_ENABLED_SOURCES=SISTEMA,SLA,ACOES,AUTORIZACAO,SSMA`. Reverter: remover as variáveis (volta ao comportamento atual).
**Correção de código (local, ainda não enviada):** `send-sla-escalation-email.ts` e `send-ssma-accident-alert-email.ts` passam a informar `priority: "CRITICAL"` quando a severidade é crítica; assim, com o limite de 10/h e 30/dia e a reserva de 2/h e 5/dia, o crítico usa o limite cheio e o comum, 8/h e 25/dia. Teste novo em `test-alert-send-governor.mjs`. Regressão: 183/183 scripts, e-mail, SQL, SSMA, simulação e alertas sem falhas; `tsc` 0; lint 0 erros.
**Efeito após o merge:** o governador passa a valer com essas variáveis. Fontes fora da lista (risco, e-mail/confirmações, resumo semanal, contrato, ConstruManager, entregáveis) ficam **adiadas na fila**, sem perda.

## 12. Google OAuth do login, convites e checklist da aceitação de 02/12/2026 (23/11/2026)
**Como o ACC faz login (verificado no código):** somente **Supabase OAuth**: `supabase.auth.signInWithOAuth({ provider: "google" })` com retorno em `/auth/callback`. **Não há Google Identity Services direto** (nenhum `gsi/client`, `google.accounts.id` nem `signInWithIdToken`). Os demais clientes Google do projeto (`GOOGLE_GMAIL_*`, `GOOGLE_GMAIL_PILOT_*`, `GOOGLE_DRIVE_*`) são credenciais de **API de caixa/Drive** com refresh token, no servidor, e **não participam do login**.
**Cliente do login:** o provedor Google do Supabase de produção usa um Client ID cujo prefixo é `1033164664091-h91ujdolcc...` (número do projeto `1033164664091`). O cliente que você viu (`AXION Contract Intelligence Web`, aplicativo Web, redirecionamento `https://plbcvwostmdmdmrziwmd.supabase.co/auth/v1/callback`) **é coerente**: o redirecionamento aponta para o ref de **produção** (`plbcvwostmdmdmrziwmd`). **Para fechar a prova, compare o Client ID completo mostrado no Google com o do Supabase** (o prefixo acima); eu não consigo ver o Google. A origem JavaScript `http://localhost:3000` **não é necessária** no fluxo por redirecionamento do Supabase (só serviria para GIS no navegador); `https://acc.axion.com.br` não precisa ser acrescentada.
**Restrição ao domínio (camadas):** (1) **tela de consentimento do Google**: tipo de usuário **Interno** (a conferir por você, em "Tela de permissão OAuth"); (2) `/auth/callback` recusa e **revoga a sessão** de qualquer e-mail fora de `@axion.com.br`; (3) o proxy exige sessão em todas as rotas privadas. **Não há** parâmetro `hd` no login nem trava de domínio no banco (o gatilho `handle_new_user` só classifica a origem). **Risco:** com a tela **Externa**, uma conta Google de fora criaria usuário e perfil (origem `TERCEIRO`) antes de ser desconectada; com **Interno**, isso não ocorre.
**Correção da recomendação sobre o cadastro público (seção 3):** o **primeiro login ativa os convites** (`handle_new_user` cria o perfil e ativa os pré-cadastros pendentes do e-mail). Há **10 pré-cadastros pendentes** (nove pessoas e a conta `axion`) e 3 ativados. **Desligar o cadastro do Supabase impediria o primeiro login desses convidados.** Portanto: **não desligar o cadastro**; reduzir o risco assim: (a) confirmar a tela **Interno**; (b) **desabilitar o provedor Email** (o app não usa senha; os 79 usuários de teste deixariam de entrar por senha). Isso substitui o passo 2 da seção 3.
**Usuários existentes:** os quatro participantes da aceitação **já têm conta**: `reynaldo` (último login 20/11), `crm` (17/11), `carlos.evandro` (19/11) e `jaime.ramos` (23/11), todos origem `AXION_INTERNO`; também `ricardo.martins`, `marcio.galvao` e `victor.cerri`.

### Checklist GO/NO-GO para a aceitação de 02/12/2026 (quarta-feira)
| # | Item | Estado |
|---|---|---|
| 1 | CI do commit final verde | **pendente**: 5 commits locais sem push; CI exige novo push |
| 2 | Publicação (janela) **antes** de 02/12; sugestão sábado 28/11, 09:00 BRT (alternativa 30/11 ou 01/12 à noite) | **pendente**: data e responsáveis |
| 3 | Variáveis Vercel: SSMA=false e 7 `ACC_ALERT_*` | **feito** (Production, sem redeploy) |
| 4 | `ACC_OUTBOUND_MODE=pilot` e `AXION_APP_BASE_URL` correto | **verificado** |
| 5 | Participantes com conta: Reynaldo, CRM, Jaime, Carlos | **verificado** |
| 6 | Google OAuth: cliente e redirecionamento de produção coerentes | **coerente** (confirmar Client ID completo) |
| 7 | Tela de consentimento **Interno** | **pendente de conferência pelo Dono** |
| 8 | Provedor Email desabilitado no Supabase Auth | **decisão pendente** |
| 9 | Resumo semanal de quarta em 02/12 | **adiado por F0** (fonte `RELATORIO_SEMANAL` fora da lista): não sai |
| 10 | Confirmação de resposta por e-mail em F0 | **adiada** (fonte `EMAIL`): informar aos participantes |
| 11 | Backup do dia, congelamento, ondas, P0, rollback | roteiro pronto (seção 7 e doc 23); executa na janela |
| 12 | Fontes: 0 operacionais para 18 meses; Gmail CAIXA-1 completa para `weg.net`; 6 caixas e Outlook não conectados | **informar** na aceitação (doc 27) |
