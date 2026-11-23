# 34 - Preparação do go-live em `acc.axion.com.br` (PREPARAÇÃO; nada foi alterado na Vercel, no GitHub, no Supabase nem em produção)

Status: apurado em 22/11/2026 (Agente H). Foram usadas **somente leituras**: metadados de projeto, domínio, deployment e **nomes/alvo/tipo** de variáveis da Vercel (valores **não** foram lidos nem decifrados; os que a API devolveu em claro por serem tipo `plain` e não secretos não são repetidos aqui), consulta DNS pública e `curl -I`. Nenhum acesso ao Supabase, a credenciais ou a e-mails. Complementa `19`, `20`, `22`, `23`, `24` e `26`, e a trava de módulos (`trava-modulos/README.md`).

Convenção: **[FATO]** = observado nesta apuração; **[CÓDIGO]** = lido no repositório (integração `c1b57f4`); **[INFERÊNCIA]** = dedução que precisa ser conferida por pessoa; **[AÇÃO HUMANA]** = painel ou decisão que só o responsável pode fazer.

## 0. Resumo executivo
1. **O domínio `acc.axion.com.br` já está no ar** [FATO]: vinculado ao projeto Vercel `axion-contract-intelligence-5d3g` (alvo produção, verificado, sem redirecionamento), DNS por CNAME correto, HTTPS válido, serve hoje o commit `27da839` (Fase 1 do piloto). **Não é um domínio novo a configurar**: o merge da integração na `main` troca, em segundos, o app que os usuários já usam nesse endereço. O risco de go-live não é "o domínio não resolve", e sim "o app novo precisa encontrar variáveis e Auth já corretos no instante do deploy".
2. **Projeto que serve produção: `axion-contract-intelligence-5d3g`** (`prj_n9RS...`). O projeto `axion-contract-intelligence` (`prj_BZjt...`) é o antigo: só tem o domínio `.vercel.app` dele, último deploy de 14/08/2026; **não** recebe o domínio de produção. Não mexer nele.
3. **Variáveis**: das exigidas pelo código, **faltam em production** apenas as que, ausentes, têm padrão seguro, **exceto uma**: `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED` está **ausente e o padrão do código é LIGADO**. Precisa ser criada com o valor exato `false` **antes do merge** (decisão D5). Detalhes na seção 2.
4. **Autenticação**: o login usa Supabase Auth com Google e o callback `/auth/callback`; confirmar no painel do Supabase de produção a Site URL e a lista de Redirect URLs com `https://acc.axion.com.br` (seção 3). Não consegui ver o painel; é conferência humana obrigatória.
5. **Nada de automação nova de e-mail em massa no dia**: ordem e critérios de liberação progressiva na seção 7; painel mínimo de monitoramento com SQL somente leitura na seção 5.

## 1. Domínio e Vercel
### 1.1 O que foi apurado
| Pergunta | Resposta | Fonte |
|---|---|---|
| A qual projeto/ambiente está vinculado? | Projeto `axion-contract-intelligence-5d3g` (`prj_n9RSTJFgakynjoBOUMCfi19uV24N`), time `axionconstrucoes-projects`. Sem `gitBranch` nem ambiente customizado: é o domínio do alvo **production**. | [FATO] `list_project_domains` |
| Verificado? | **Sim** (`verified: true`); sem redirecionamento. Também ligado a esse projeto: `axion-contract-intelligence-5d3g.vercel.app` e os domínios automáticos do projeto. | [FATO] |
| Que deployment serve hoje? | `dpl_6ERyTgkFMK6oCjZqpQGbeCb4zx6L`, `READY`, alvo production, ramo `main`, commit `27da8394` (merge da Fase 1: regra do piloto WEG por qualquer participante), marcado `isRollbackCandidate`. Anteriores também candidatos a rollback (`09fda9b`, `e940699`, `c8ff55b`, `91a987a`). | [FATO] `list_deployments` |
| DNS público | `acc.axion.com.br` é **CNAME** para o alvo `...vercel-dns-017.com` do próprio projeto (resolve para endereços IPv4 da Vercel). A configuração da Vercel indica `configuredBy: CNAME`, `misconfigured: false`, sem conflitos. A zona é externa à Vercel (servidores `*.sec.dns.br`, Registro.br): o registro foi criado **manualmente** no DNS do domínio. | [FATO] `nslookup`, `get_domain_config` |
| Certificado | HTTPS responde; `curl` valida a cadeia (`ssl_verify_result = 0`), com `Strict-Transport-Security` de 2 anos. Emissor e validade não foram extraídos (cliente Schannel); a Vercel renova automaticamente por HTTP-01. | [FATO] `curl -I` |
| Resposta atual | `GET /` devolve **307 para `/login`**; `/login` devolve 200; as rotas `/api/cron/system-health` e `/api/cron/ssma-notifications` sem Bearer devolvem **401** (alcançam o handler, que exige o segredo). Um caminho `/api/cron/...` fora da lista pública devolve 307 para o login (ver 4.3). | [FATO] |
| Proteção da Vercel | SSO da Vercel está ativo para deployments, **exceto domínios customizados** (`all_except_custom_domains`): o acesso público a `acc.axion.com.br` depende só do login do próprio app. Os deployments por URL `.vercel.app` ficam atrás do SSO da Vercel. | [FATO] `get_project` |

### 1.2 O que falta
- **Registro DNS: nada.** Verificação do domínio: nada. Certificado: nada.
- [AÇÃO HUMANA] (Eng. TI) **Guardar** o dado do registro CNAME atual (alvo informado na Vercel) no dossiê da janela, para o caso de ser preciso recriá-lo. Não alterar o DNS.
- [AÇÃO HUMANA] (Dono/Eng. TI) **Decidir se a manutenção de 60 min exige página de "em manutenção"**: como o domínio está no ar para usuários reais, entre T e T+33 o app **antigo** continua respondendo no endereço (o congelamento é no banco, não no front). Os usuários verão erro de gravação, não indisponibilidade. O comunicado P5 do doc 23 cobre isso; não há "modo manutenção" no app [INFERÊNCIA: não localizei esse recurso no código].
- [AÇÃO HUMANA] Conferir no painel da Vercel que **não existe** outro projeto/time reivindicando o mesmo domínio e que que o **Production Branch** do projeto `-5d3g` é `main` [FATO parcial: o deploy de produção vem de `main`].

## 2. Matriz de variáveis de ambiente (apenas nomes, alvo e tipo)
### 2.1 Vercel, projeto `axion-contract-intelligence-5d3g`, alvo `production`
Legenda: **S** = sensível (valor oculto, não conferível pela API); **C** = "config" (cifrada, visível só no painel); **P** = texto simples; **-** = ausente. "Exigida" = lida por `apps/web` ou pelos workers que usam as mesmas variáveis. Valores **nunca** foram lidos.

| Variável | Tipo / alvo | Exigida pela integração | Situação | Conferir antes do merge |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | C, production | sim (app) | existe | aponta para o projeto de **produção** (`plbc...`), não homologação |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | C, production | sim | existe | idem (chave do mesmo projeto) |
| `SUPABASE_SECRET_KEY` | S, production | sim (server) | existe | idem; nunca em `NEXT_PUBLIC_*` |
| `AXION_APP_BASE_URL` | C, production | sim: base dos links em e-mails (`getAppBaseUrl` falha fechado em produção sem ela) | existe (atualizada em 23/09/2026) | **conferir no painel se vale `https://acc.axion.com.br`** (sem barra final); nenhum e-mail sai com link `.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | - | **não** lida por `apps/web` (só por scripts de teste) | ausente | nada a fazer |
| `CRON_SECRET` | S, production | sim: Bearer das rotas `/api/cron/*` da Vercel | existe | rotacionar só se houver suspeita |
| `ACC_RISK_ALERTS_CRON_SECRET` | S, production | sim: Bearer da rota `risk-alerts` chamada pelo GitHub | existe | **igual** ao segredo de mesmo nome no GitHub |
| `ACC_SCHEDULER_RISK_CRON_SECRET`, `ACC_SCHEDULER_SSMA_CRON_SECRET` | S, production | sim: credenciais do pg_cron (rotas `risk-alerts` e `ssma-notifications`) | existem | iguais aos segredos do **Vault** do Supabase `acc_risk_alerts_cron_secret` e `acc_cron_secret` (doc `operacao-agendador-sla.md`, seção 8) |
| `GOOGLE_GMAIL_CLIENT_ID`, `..._CLIENT_SECRET`, `..._REFRESH_TOKEN`, `..._SENDER_EMAIL`, `GOOGLE_GMAIL_INBOUND_MAILBOX` | S, production | sim: envio padrão e caixa inbound (`crm@axion.com.br` conforme o comentário do cadastro) | existem | - |
| `GOOGLE_GMAIL_PILOT_CLIENT_ID`, `..._CLIENT_SECRET`, `..._REFRESH_TOKEN`, `..._SENDER_EMAIL` | S, production | sim: perfil de envio do piloto WEG | existem | - |
| `ACC_RISK_ALERTS_INBOUND_CLIENT_ID`, `..._CLIENT_SECRET`, `..._REFRESH_TOKEN`, `..._MAILBOX` | S, production | sim: leitura das respostas aos alertas | existem | - |
| `GOOGLE_DRIVE_CLIENT_ID`, `..._CLIENT_SECRET`, `..._REFRESH_TOKEN` | S, production | sim (SSMA fotos / anexos no Drive) | existem | - |
| `AXION_EMAIL_PROVIDER`, `AXION_AI_PROVIDER` | S, production | sim | existem | conferir que o provedor de e-mail é o real do Gmail e o de IA é o aprovado |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS` | S / C / S, production | sim (experts) | existem | - |
| `ANTHROPIC_TIMEOUT_MS` | - | opcional | ausente | padrão do código |
| `ACC_OUTBOUND_MODE` | C, production | sim: trava de saída (`pilot-outbound-guard`) | existe | **só o valor exato `production` libera envio a destinatários reais; qualquer outro, inclusive vazio, mantém o piloto.** Conferir que **não** é `production` |
| `ACC_PILOT_RECIPIENT` | C, production | sim: destino único do piloto | existe | caixa única do piloto, sem terceiros |
| `ACC_PILOT_ADDITIONAL_RECIPIENTS` | - | opcional | ausente | manter ausente até decisão |
| `ACC_PROJECT_PILOT_PROJECT_ID`, `ACC_PROJECT_PILOT_DESTINATION`, `ACC_PROJECT_PILOT_SENDER` | C, production | sim (piloto por obra) | existem | UUID da obra do piloto confere com a WEG de produção |
| `ACC_PROJECT_PILOT_TEST_GROUP` | P, production | sim | existe, **vazio** (por decisão de 13/11) | manter vazio |
| `ACC_PILOT_SINGLE_ALERT_CASE_ID`, `ACC_PILOT_SINGLE_ALERT_RECIPIENT_ID` | P, production | sim (envio único) | existem, **desarmados** (doc 19, seção 6) | manter desarmados |
| `ACC_SSMA_NOTIFICATIONS_ENABLED`, `ACC_SSMA_NOTIFICATIONS_SCOPE` | P, production | sim: rota `ssma-notifications` (fail-closed) | existem; escopo restrito a ações corretivas WEG (doc 19) | **manter**; escopo inválido fecha tudo |
| **`ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED`** | - | sim: botões ENVIAR PARA / ESPECIALISTA nos e-mails SSMA | **AUSENTE; padrão do código = LIGADO** (só o valor exato `false` desliga) | **[AÇÃO HUMANA] criar `false` (production) antes do merge** (D5). Ver 2.3 sobre a divergência com o README da trava |
| `ACC_WEEKLY_REPORTS_ENABLED` | S, production | sim: trava dos relatórios semanais **e** do ciclo de alertas de risco (rota `risk-alerts` devolve 204 sem ela) | existe (valor oculto) | **não consigo ler**: Eng. confere no painel qual é o valor e registra "ligada/desligada" no dossiê; o valor vigente define se o ciclo de alertas roda assim que o app novo subir (ver 7) |
| `ACC_EMAIL_CLASSIFY_ENABLED`, `ACC_EMAIL_CLASSIFY_APPLY` | - | só o runner de classificação (`scripts/email-classify-run.mjs`) e o pipeline; padrão desligado e `apply` exige `--apply` **e** `ACC_EMAIL_CLASSIFY_APPLY=1` | ausentes | **manter ausentes** |
| `ACC_QUALITY_TRIAGE_PROVIDER` | - | só `simulated` ativa; ausente = sem triagem | ausente | **manter ausente** (nunca definir `simulated` em produção) |
| `ACC_EMAIL_SPECIALIST_ENABLED` | - | resposta de ESPECIALISTA por e-mail de risco; padrão desligado | ausente | manter ausente |
| `ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR` | - | limite de respostas processadas por remetente/hora; padrão **10** (1 a 200) | ausente | padrão serve; ver 7 |
| `AXIA_CHAT_PROVIDER` | P, production | sim | existe; **deve ser `off`** (doc 19) | confirmar visualmente; mudar só com autorização específica |
| `AXIA_CHAT_MODEL`, `AXIA_CHAT_DAILY_BUDGET_USD`, `AXIA_CHAT_USER_DAILY_CALLS`, `AXIA_CHAT_ACCESS` | P, production | sim | existem (acesso restrito a administradores e teto diário) | manter |
| `NEXT_PUBLIC_ACC_TEST_MODE` | C, production | sim | existe | **conferir que está desligado em produção**; ligada, a interface exibe o aviso "SISTEMA EM TESTE" |
| `CONSTRUMANAGER_BASE_URL`, `..._LOGIN`, `..._PASSWORD` | S, production (e preview, separadas) | sim (Construmanager, só para ler) | existem | preview usa variáveis **próprias** de preview |
| `GOOGLE_*`/Supabase em `preview` | - | - | **não existem** em preview (apenas as do Construmanager) | G7 do doc 22 confirmado: preview sem credenciais de produção |

Lidas pelo código mas **sem relevância para o go-live** (testes, scripts ou opcionais): `ACC_ALLOW_LIVE_AI_TESTS`, `ACC_RISK_ALERT_REISSUE_SEND_ENABLED` (reemissão de alerta: ausente = sem reemissão), `ACC_WHATSAPP_ENABLED` (ausente), `ELEVENLABS_API_KEY`, `SSMA_SYNC_CRITICAL_PROJECT_IDS`, `ACC_GMAIL_*` dos workers e as variáveis `HOMOLOG_*` e `ACC_*_I_UNDERSTAND_THIS_IS_DISPOSABLE` de testes. Metodologia: busca textual por `process.env` e por constantes de nome em `apps/web`, `packages` e `scripts` (variáveis lidas por indireção de nome podem escapar; o teste `scripts/test-email-worker-env-wiring.mjs` cobre os workers).

Mudança de variável na Vercel só vale para **novos deployments**: criar `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=false` antes do merge é seguro (o app antigo ignora; o deploy do merge a recebe). Não editar `ACC_WEEKLY_REPORTS_ENABLED`, `ACC_OUTBOUND_MODE` nem as de piloto sem autorização.

### 2.2 GitHub (repositório `core-services-07`), apenas nomes referenciados nos workflows
- **Variáveis (`vars.*`)**: `ACC_APP_BASE_URL` (base HTTPS usada pelos workflows ao chamar as rotas; **tem de ser `https://acc.axion.com.br`**), `ACC_SCHEDULER_PG_CRON_ENABLED`, `ACC_WEEKLY_REPORTS_ENABLED`, `ACC_EMAIL_SPECIALIST_ENABLED`, `ACC_EMAIL_TOKEN_OWNER_STRICT`, `ACC_EMAIL_TRUSTED_AUTHSERV_IDS`, `ACC_EMAIL_WORKSPACE_TENANT_DOMAINS`, `ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR`, `ACC_PROJECT_PILOT_PROJECT_ID`, `ACC_PROJECT_PILOT_SENDER`, `ACC_PROJECT_PILOT_AUTHORIZED_SENDERS`, `CONSTRUMANAGER_METADATA_SYNC_ENABLED`, `CONSTRUMANAGER_VERSION_MONITORING_ENABLED`, `CONSTRUMANAGER_AUTO_KILL_SWITCH`, `DIARIO_DE_OBRA_SYNC_ENABLED`, `DIARIO_DE_OBRA_PROJECT_ID`, `DIARIO_DE_OBRA_OBRA_ID`, `GOOGLE_WIF_PROVIDER`, `GOOGLE_GMAIL_DWD_SERVICE_ACCOUNT` (tem padrão no YAML) e **`ACC_DELEGATED_ATTACHMENTS_ENABLED`** (**NÃO definir**: o passo novo "Anexos da caixa por delegação" do `gmail-delegated-sync` só roda quando vale exatamente `true`; travado por `scripts/test-workflow-gates.mjs`).
- **Segredos (`secrets.*`)**: `CRON_SECRET`, `ACC_RISK_ALERTS_CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GOOGLE_GMAIL_INBOUND_CLIENT_ID`, `GOOGLE_GMAIL_INBOUND_CLIENT_SECRET`, `GOOGLE_GMAIL_INBOUND_REFRESH_TOKEN`, `GOOGLE_GMAIL_INBOUND_MAILBOX`, `ACC_RISK_ALERTS_INBOUND_CLIENT_ID`, `ACC_RISK_ALERTS_INBOUND_CLIENT_SECRET`, `ACC_RISK_ALERTS_INBOUND_REFRESH_TOKEN`, `ACC_RISK_ALERTS_INBOUND_MAILBOX`, `GOOGLE_GMAIL_REYNALDO_CLIENT_ID`, `GOOGLE_GMAIL_REYNALDO_CLIENT_SECRET`, `GOOGLE_GMAIL_REYNALDO_REFRESH_TOKEN`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, `CONSTRUMANAGER_BASE_URL`, `CONSTRUMANAGER_LOGIN`, `CONSTRUMANAGER_PASSWORD`, `DIARIO_DE_OBRA_API_TOKEN`.
- Não consultei o repositório do GitHub (sem credencial para isso nesta tarefa): **[AÇÃO HUMANA]** Eng. confere que cada nome acima existe e que `ACC_DELEGATED_ATTACHMENTS_ENABLED` **não** existe (ou não é `true`); que `ACC_APP_BASE_URL` aponta para o domínio novo (se ainda apontar para `.vercel.app`, os workflows chamarão uma URL atrás do SSO da Vercel e falharão com redirecionamento); e que `ACC_WEEKLY_REPORTS_ENABLED` do GitHub está coerente com o da Vercel.

### 2.3 Pontos que exigem decisão ou cuidado
1. **`ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED`**: o README da trava recomenda "manter ligada (padrão)" porque os botões não usam as 35 RPCs travadas; os docs 19 (seção 6) e 22 (D5, aprovada) decidiram **`false` no go-live**. Vale a decisão do Dono (D5): criar `false` e ligar depois da aceitação do bloco SSMA. Não há conflito técnico: a flag e a trava são independentes.
2. **`ACC_OUTBOUND_MODE`**: confirmar que não é `production`. Com o valor atual do cadastro desconhecido (cifrado), é a conferência mais importante para não haver e-mail real a terceiros.
3. Variáveis `plain` aparecem em claro na API; mesmo assim não foram transcritas aqui. O comentário de cada cadastro (por exemplo, "DESARMADO ... rearmar só com nova autorização") confirma o que os docs 19/22 já afirmam.

## 3. Autenticação no domínio `acc.axion.com.br`
### 3.1 O que o código faz [CÓDIGO]
- Login: botão Google em `/login` chama `supabase.auth.signInWithOAuth({ provider: "google", redirectTo: <origem atual>/auth/callback })`. A **origem é a do navegador**: em `acc.axion.com.br` o redirecionamento pedido é `https://acc.axion.com.br/auth/callback`.
- `/auth/callback` troca o `code` por sessão (PKCE; cookies da origem), **exige e-mail do domínio `axion.com.br`** (revoga a sessão caso contrário) e redireciona para um caminho interno sanitizado (`sanitizeInternalRedirect`; não aceita URL externa).
- O link absoluto dos e-mails usa `AXION_APP_BASE_URL` (seção 2.1).
- **Não há** fluxo de OAuth de Gmail no app web: o envio e a leitura usam **refresh tokens** guardados em variáveis, trocados direto em `oauth2.googleapis.com/token`, sem `redirect_uri` em tempo de execução. Só os scripts de consentimento (`scripts/gmail-inbound-oauth.mjs`, `gmail-outbound-oauth.mjs`, `gmail-pilot-sender-oauth.mjs`) usam `redirect_uri`, e são executados localmente quando se gera **novo** refresh token.

### 3.2 O que PRECISA existir (conferência no painel; nada foi alterado)
**Supabase de produção (`plbcvwostmdmdmrziwmd`) → Authentication → URL Configuration** [AÇÃO HUMANA: Eng. TI, com Dono presente]:
| Campo | Valor esperado | Se estiver errado |
|---|---|---|
| Site URL | `https://acc.axion.com.br` | Supabase usa a Site URL como destino quando o `redirectTo` não está permitido: o usuário volta ao endereço errado, sem sessão |
| Redirect URLs | `https://acc.axion.com.br/auth/callback` (mínimo). Se o painel usar curinga: `https://acc.axion.com.br/**` | `redirectTo` não permitido: login falha ou cai na Site URL |
| Redirect URLs a **remover/avaliar** | `localhost` e `.vercel.app` só se não forem mais usados | superfície desnecessária; **não remover antes** de confirmar que ninguém depende |

**Supabase → Authentication → Providers → Google**: habilitado, com o Client ID/Secret do cliente OAuth do ACC. Conferir somente se está ativo; **não** copiar valores.

**Google Cloud (projeto do cliente OAuth usado pelo Supabase)** [AÇÃO HUMANA: quem administra o Google Cloud]:
| Item | Esperado |
|---|---|
| URIs de redirecionamento autorizados | `https://plbcvwostmdmdmrziwmd.supabase.co/auth/v1/callback` (o callback do **Supabase**, não o do app). **Não depende do domínio do app**; já deve existir porque o login funciona hoje no mesmo endereço |
| Origens JavaScript autorizadas | **Não necessárias** para este fluxo (código no servidor, via Supabase); adicionar `https://acc.axion.com.br` só se o painel exigir ou houver uso de Google Identity no navegador (não há no código) |
| Tela de consentimento | tipo **Interno** do Workspace `axion.com.br` (a trava no callback é a segunda camada) |
| Domínio autorizado | `axion.com.br` já cobre o subdomínio |

### 3.3 Risco e como conferir
- **Risco**: login quebrado para todos (Site URL/Redirect URLs divergentes) na hora do deploy do app novo. Como o domínio já funciona hoje com o app antigo, **o mais provável é que a configuração já esteja correta**: o app novo **não altera** o fluxo (`auth/callback` e botão Google são iguais; confirmar com `git diff` contra a `main` nessas pastas). Mesmo assim, é pré-condição P8 do doc 23 e item G7 do doc 22.
- **Teste ponta a ponta antes do merge** [AÇÃO HUMANA]: em janela anônima, abrir `https://acc.axion.com.br`, entrar com uma conta `@axion.com.br` e chegar a `/projetos`; repetir com uma conta de **outro domínio** e esperar `domain_not_allowed`. Repetir **após** o deploy (parte da fumaça T+55).
- Efeitos do domínio no navegador: sessões são por origem; quem usava `.vercel.app` precisará entrar de novo em `acc.axion.com.br`.
- **Limitação conhecida** [CÓDIGO]: o callback só admite e-mails `@axion.com.br`; usuários externos (por exemplo, da WEG) **não conseguem entrar**; o piloto é com a equipe AXION. Mudar isso é decisão de produto e de código, fora desta preparação.
- Callbacks de e-mail (Gmail inbound/pilot) **não dependem** do domínio do app (3.1). O que depende do domínio são os **links** nos e-mails (`AXION_APP_BASE_URL`) e as chamadas dos workflows (`vars.ACC_APP_BASE_URL`).

## 4. Rotinas agendadas e jobs
### 4.1 Inventário
Horários em UTC. "Escreve" = o que grava; "Efeito" = efeito operacional visível; "Janela" = o que acontece sob a janela de 60 min (doc 23).

**A. pg_cron do Supabase** (migration `20261119034721`; já registrada em produção; os docs 19/22 tratam os 11 jobs como ativos [INFERÊNCIA a confirmar com `9-saude-jobs.sql`]):
| Job | Frequência | Faz | Escreve | Efeito operacional | Janela |
|---|---|---|---|---|---|
| `acc-risk-alerts` | */2 min | GET `/api/cron/risk-alerts` (Bearer do agendador) | casos de risco, `risk_alert_outbox`, auditoria | **pode gerar e-mails de alerta** (sob `ACC_OUTBOUND_MODE` piloto e `ACC_WEEKLY_REPORTS_ENABLED`) | **pausado** (`6-pg-cron-pausar.sql`) |
| `acc-ssma-notifications` | 3-59/5 min | GET `/api/cron/ssma-notifications` | entregas SSMA | e-mail de ação corretiva SSMA em atraso (escopo WEG) | pausado |
| `acc-weekly-all` | */10 min | dispara workflow `weekly-schedule-email-ingestion.yml` | ingestão do cronograma semanal | cronograma/relatórios semanais | pausado |
| `acc-document-worker` / `acc-mpp-worker` | 2-59/10 e 5-59/10 | dispara os workers de documentos e MPP | `document_versions`, tarefas | processamento de documentos | pausado |
| `acc-gmail-sync` | 1-59/15 | dispara `gmail-inbound-sync.yml` | `emails`, `email_attachments` | ingestão da caixa inbound | pausado |
| `acc-ssma-drive` | de 2 em 2 h | dispara `ssma-drive-photo-sync.yml` | fotos SSMA | sincronização Drive | pausado |
| `acc-construmanager` | 17 */6 | dispara o monitoramento do Construmanager | metadados | só leitura do Construmanager | pausado |
| `acc-diario` | 43 0 diário | dispara `diario-de-obra-sync.yml` | diário de obra | incremental | pausado |
| `acc-watchdog` | */5 | `acc_scheduler_watchdog()` | `acc_system_health_incidents` | abre/resolve incidentes; **não envia e-mail** | pausado |
| `acc-cron-history-cleanup` | 03:30 diário | apaga histórico do pg_cron > 7 dias | `cron.job_run_details` | higiene | pausado |

**B. Vercel Cron** (`apps/web/vercel.json`; roda **sozinho** em produção, não é pausado pelo `6-pg-cron-pausar.sql`):
| Rota | Frequência | Escreve | Efeito | Observação |
|---|---|---|---|---|
| `/api/cron/weekly-alert-digest` | quartas 10:00 | resumo semanal de alertas e lotes de alerta contratual | **e-mail** (sob a trava de saída do piloto) | executa `runWeeklyAlertDigests` e `runContractAlertBatches` |
| `/api/cron/system-health` | diário 10:30 | `acc_system_health_incidents`, auditoria, e-mail técnico informativo | aviso técnico por incidente de integração | uma entrega por falha e destinatário (outbox) |

**C. GitHub Actions com `schedule`** (rodam mesmo com o pg_cron; as concorrências em `operacao-agendador-sla.md`, seção 4.1, evitam ciclos duplos):
| Workflow | Frequência | Gate | Efeito |
|---|---|---|---|
| `alert-reminders` | */30 | `CRON_SECRET` | lembretes de alerta (e-mail sob trava) |
| `contract-alert-batches` | quartas 10:10 | `CRON_SECRET` | lotes de alerta contratual (**coincide com o Vercel Cron das quartas**; conferir idempotência na primeira quarta) |
| `document-processing-worker`, `mpp-document-worker` | */5 | - | processamento |
| `gmail-inbound-sync` | */15 | - | ingestão Gmail |
| `gmail-owner-mailbox-sync` | 7,37 de cada hora | `vars.ACC_WEEKLY_REPORTS_ENABLED == 'true'` no passo de relatórios | caixa do responsável |
| `weekly-schedule-email-ingestion` | :20 de cada hora | `vars.ACC_WEEKLY_REPORTS_ENABLED == 'true'`; fase de alertas só sem pg_cron (`ACC_SCHEDULER_PG_CRON_ENABLED != 'true'`) | cronograma e ciclo de risco |
| `ssma-notifications` | :15 de cada hora | só roda se `ACC_SCHEDULER_PG_CRON_ENABLED != 'true'` | SSMA (desliga quando o pg_cron assume) |
| `ssma-drive-photo-sync` | de 2 em 2 h | - | fotos SSMA |
| `construmanager-content-ingestion` ("Metadata Monitoring") | 17 */6 | `CONSTRUMANAGER_*_ENABLED`, `AUTO_KILL_SWITCH` | somente metadados |
| `diario-de-obra-sync` | 43 0 | `DIARIO_DE_OBRA_SYNC_ENABLED` | incremental |
Somente manuais (`workflow_dispatch`, sem `schedule`): `gmail-delegated-sync`, `gmail-historical-backfill`, `gmail-recover-existing`, `pilot-single-alert`, `pilot-gmail-auth-check`, `pilot-replies-mailbox-check`, `risk-alerts-weg-dry-run`, `crm-sent-copy-check`, os de Construmanager (credencial, lista de arquivos, recuperação, promoção), `diario-de-obra-api-validation`, `financial-display-reprocess`, `weekly-samples-diagnostic`, `xlsx-extractor-diagnostic`. `ci-pr-checks` roda em PR.

### 4.2 O que permanece DESABILITADO até a aceitação
| Item | Como fica desligado | Quem liga e quando |
|---|---|---|
| Passo novo de **anexos por delegação** (`gmail-delegated-sync`) | `vars.ACC_DELEGATED_ATTACHMENTS_ENABLED` **não definida** (o passo exige `true` exato) | Eng., só após aceitação funcional do bloco de e-mail (doc 20) e decisão do Dono |
| **Trava de módulos** (35 RPCs de RNC, Garantias G-04 a G-10, Seguros, Competências) | `1-aplicar-trava.sql` na janela (T+22) | reversão por módulo só depois da homologação autenticada de cada tela |
| **Botões SSMA** ENVIAR PARA / ESPECIALISTA nos e-mails | `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=false` (a flag ausente liga) | Dono, após aceitação do bloco SSMA |
| Pipeline de classificação de e-mail | `ACC_EMAIL_CLASSIFY_*` ausentes | decisão do Dono |
| Triagem de Qualidade | `ACC_QUALITY_TRIAGE_PROVIDER` ausente | idem |
| AXIA conversacional | `AXIA_CHAT_PROVIDER=off` | autorização específica |
| Resposta de ESPECIALISTA por e-mail de risco | `ACC_EMAIL_SPECIALIST_ENABLED` ausente | decisão do Dono |
| E-mail real a terceiros | `ACC_OUTBOUND_MODE` != `production` | decisão do Dono, com dry-run aprovado (seção 7) |
| Reemissão de alertas | `ACC_RISK_ALERT_REISSUE_SEND_ENABLED` ausente | decisão do Dono |
| Envio único do piloto | `ACC_PILOT_SINGLE_ALERT_*` desarmados | nova autorização |

### 4.3 Como se relacionam as rotas `/api/cron` e os segredos
- **Três credenciais distintas**, nunca intercambiáveis [CÓDIGO]: `CRON_SECRET` (Vercel Cron, rotas `weekly-alert-digest`, `system-health`, `alert-reminders`, `contract-alert-batches`; a rota `ssma-notifications` aceita o legado `CRON_SECRET` ou o do agendador), `ACC_RISK_ALERTS_CRON_SECRET` (workflows do GitHub chamando `risk-alerts`) e `ACC_SCHEDULER_RISK_CRON_SECRET` / `ACC_SCHEDULER_SSMA_CRON_SECRET` (pg_cron via Vault). A Vercel envia `Authorization: Bearer <CRON_SECRET>` automaticamente nos seus crons.
- O `proxy.ts` redireciona para `/login` (307) qualquer pedido **sem sessão**, exceto uma allowlist **exata** de seis rotas técnicas (`lib/cron/public-cron-routes.ts`: `weekly-alert-digest`, `system-health`, `risk-alerts`, `contract-alert-batches`, `alert-reminders`, `ssma-notifications`); nelas, cada handler exige o Bearer e responde 401 sem ele [FATO: 401 observado em duas delas em produção]. Uma chamada **autenticada** não foi feita (sem credencial); a fumaça pós-deploy deve provar uma, por exemplo pelo dry-run da rota `risk-alerts`.
- As chamadas dos workflows e do pg_cron usam `vars.ACC_APP_BASE_URL` e o segredo `acc_app_base_url` (Vault do Supabase, https obrigatório): **ambos devem apontar para `https://acc.axion.com.br`**. Se ainda apontarem para `.vercel.app`, as chamadas caem no SSO da Vercel e falham (`ROUTE_HTTP_*` no heartbeat).
- Rotas protegidas por flag devolvem **204** sem tocar o banco (`risk-alerts` sem `ACC_WEEKLY_REPORTS_ENABLED=true`; `ssma-notifications` sem `ACC_SSMA_NOTIFICATIONS_ENABLED=true` ou escopo válido). O watchdog classifica 204 como `ROUTE_DISABLED`: **durante o rollout isso é esperado**, não é falha de produto.

## 5. Monitoramento: painel mínimo (somente leitura)
Executar em SQL Editor do Supabase **de produção** com papel somente leitura, ou via cópia local; **nenhuma consulta altera dados**. Limiares propostos (a calibrar após a primeira semana). Os nomes de tabela e coluna foram lidos nas migrations, mas **as consultas não foram executadas** (sem acesso); conferir na primeira execução.

### 5.1 Jobs (pg_cron e heartbeats)
```sql
-- J1: execuções e falhas do pg_cron (mesma consulta de congelamento/9-saude-jobs.sql; janela de 25 min)
select j.jobname, j.active,
       count(d.*) filter (where d.start_time > now() - interval '25 minutes')::int as execs_25min,
       count(d.*) filter (where d.start_time > now() - interval '25 minutes' and d.status = 'failed')::int as falhas_25min,
       max(d.start_time) as ultima_execucao
  from cron.job j left join cron.job_run_details d on d.jobid = j.jobid
 group by j.jobname, j.active
 order by falhas_25min desc, j.jobname;

-- J2: disparo aceito x início x conclusão por job (comprovante do agendador)
select job, kind, last_dispatch_at, last_dispatch_http_status, last_started_at, last_finished_at, last_conclusion,
       last_success_at, last_failure_at, last_failure_code,
       now() - coalesce(last_success_at, last_finished_at, last_dispatch_at) as idade_sem_sucesso,
       expected_interval
  from public.acc_scheduler_heartbeats
 order by idade_sem_sucesso desc nulls first;
```
Limiares: **J1** `falhas_25min > 0` = atenção; `>= 2` na mesma rotina = **gatilho de rollback** (doc 22, G12); job com `active = false` fora da janela = alerta; **J2** `idade_sem_sucesso > 3 x expected_interval` = alerta; `last_failure_code` em `ROUTE_HTTP_*`, `DISPATCH_HTTP_*`, `TIMEOUT`, `NET_ERROR` = investigar; `ROUTE_DISABLED` é esperado enquanto a flag correspondente estiver desligada.

### 5.2 Incidentes de saúde do sistema
```sql
-- H1: incidentes abertos (inclui os do watchdog do agendador: fingerprint 'scheduler:<job>:<motivo>')
select i.status, p.code as obra, i.source_type, i.fingerprint, i.summary, i.first_detected_at, i.last_detected_at,
       i.notified_at, now() - i.first_detected_at as aberto_ha
  from public.acc_system_health_incidents i join public.projects p on p.id = i.project_id
 where i.status = 'OPEN'
 order by i.first_detected_at;
```
Limiar: **qualquer** incidente `OPEN` de `scheduler:*` ou de integração (`source_type`) = verificar na hora; aberto há mais de 30 min = escalar ao Eng.; mais de 2 abertos ao mesmo tempo = parar a liberação progressiva (seção 7).

### 5.3 Ingestão por fonte
```sql
-- I1: estado e frescor por fonte de integração e obra
select p.code as obra, i.source_type, i.status, i.last_sync_at, now() - i.last_sync_at as idade, left(i.detail, 80) as detalhe
  from public.project_integrations i join public.projects p on p.id = i.project_id
 order by (i.status = 'ERRO') desc, i.last_sync_at nulls first;

-- I2: volume de e-mails ingeridos por hora (picos indicam laço ou backfill)
select date_trunc('hour', created_at) as hora, count(*) as emails
  from public.emails where created_at > now() - interval '48 hours'
 group by 1 order by 1 desc;

-- I3: anexos por situação de processamento e de Drive
select processing_status, drive_sync_status, count(*) as qtd, min(created_at) as mais_antigo
  from public.email_attachments
 group by 1, 2 order by qtd desc;

-- I4: versões de documento fora do estado final
select processing_status, count(*) as qtd
  from public.document_versions
 where processing_status in ('AWAITING_PROCESSING', 'PROCESSING', 'FAILED')
 group by 1;

-- I5: execuções de sincronização de e-mail (últimas 24 h)
select status, count(*) as qtd, max(started_at) as ultima, sum(failures_count) as falhas
  from public.project_email_ingestion_sync_runs
 where started_at > now() - interval '24 hours'
 group by status;
```
Limiares: **I1** `status = 'ERRO'` ou `idade` do Gmail > 45 min (o ciclo é de 15 min), Drive/SSMA > 5 h, Construmanager > 13 h, diário > 30 h = atenção; **I2** mais de 3x a mediana das últimas 24 h = investigar laço/backfill; **I3** `FAILED` novo ou `PENDING` com mais de 1 h = atenção; `drive_sync_status = 'FAILED'` crescente = atenção; **I4** `PROCESSING` com mais de 30 min ou `FAILED` crescente = atenção; **I5** `FAILED > 0` = atenção.

### 5.4 Filas de e-mail e alertas (outbox)
```sql
-- O1: fila por situação, tipo e origem (24 h)
select status, notification_type, origin, count(*) as qtd,
       min(scheduled_for) filter (where status = 'PENDING') as pendente_mais_antigo,
       max(attempt_count) as max_tentativas
  from public.risk_alert_outbox
 where created_at > now() - interval '24 hours'
 group by 1, 2, 3 order by status, qtd desc;

-- O2: ritmo de envio por hora e destinatários distintos (detecta envio em massa)
select date_trunc('hour', sent_at) as hora, count(*) as enviados, count(distinct recipient_email) as destinatarios
  from public.risk_alert_outbox
 where status = 'SENT' and sent_at > now() - interval '48 hours'
 group by 1 order by 1 desc;

-- O3: duplicidade provável (mesmo caso, destinatário, tipo e nível) em 24 h
select case_id, recipient_user_id, notification_type, escalation_level, count(*) as qtd
  from public.risk_alert_outbox
 where created_at > now() - interval '24 hours' and status in ('PENDING', 'SENT') and case_id is not null
 group by 1, 2, 3, 4 having count(*) > 1;

-- O4: motivos de supressão (esperado: PILOT_*, DRY_RUN, FEATURE_DISABLED durante o rollout)
select suppression_reason, count(*) as qtd
  from public.risk_alert_outbox
 where status = 'SUPPRESSED' and created_at > now() - interval '24 hours'
 group by 1 order by qtd desc;

-- O5: destinatários reais que receberam (para conferir contra a allowlist do piloto)
select recipient_email, count(*) as enviados, min(sent_at) as primeiro, max(sent_at) as ultimo
  from public.risk_alert_outbox
 where status = 'SENT' and sent_at > now() - interval '24 hours'
 group by 1 order by enviados desc;
```
Limiares: **O1** `PENDING` com `pendente_mais_antigo` mais de 15 min no passado = fila travada; `FAILED > 0` na última hora ou `max_tentativas >= 3` = atenção; **O2** acima de **10 por hora** na fase 1 e **30 por hora** nas fases seguintes, ou mais destinatários distintos que a allowlist = **parar** (seção 7, freio); **O3** qualquer linha = **pausar** o ciclo e investigar a chave de idempotência; **O4** `PROVIDER_NOT_CONFIGURED`, `MATRIX_AMBIGUOUS`, `CONFIGURATION_REVIEW_REQUIRED` = corrigir configuração antes de seguir; **O5** qualquer endereço fora da allowlist aprovada = **gatilho de rollback** (e-mail real fora da trava, doc 22).

### 5.5 Erros de runtime (Vercel) e logs
- Ferramenta: `get_runtime_errors` e `get_runtime_logs` do Vercel MCP (somente leitura), filtrando o projeto `-5d3g`, alvo production, e o painel da Vercel "Logs".
- Limiares: 5xx contínuos por mais de 5 min, ou qualquer 5xx em `/api/cron/*` = atenção; 5xx contínuo = **gatilho de rollback** (doc 22, G12). Falha de build/deploy = `request_rollback` para o deployment `dpl_6ERy...` (commit `27da839`).
- Cadência: T+45 a T+60 a cada 5 min; T+2 h a T+24 h a cada 30 min; depois diário. Quem: Eng-2.
- Incluir na leitura diária: `select count(*) from public.audit_log_entries where created_at > now() - interval '24 hours'` (crescimento anormal) e contagem de incidentes novos.

## 6. Ordem obrigatória e reconciliação dos documentos 19, 22 e 23
Ordem do prompt mestre: **CI verde, backup validado, congelamento, migrations, validações P0, merge na `main`, deploy Vercel, testes operacionais, liberação controlada.**

| # | Passo do prompt mestre | Onde está nos docs | Lacuna encontrada e tratamento |
|---|---|---|---|
| 1 | CI verde | doc 22, G1; doc 23, P1 | alinhado |
| 2 | Backup validado | doc 19 fase 1; doc 23, T-60 e P3 | alinhado |
| 3 | Congelamento | doc 19 fase 2; doc 23, T+4 | alinhado |
| 4 | Migrations | doc 19 fase 3; doc 23, T+8 a T+22 (inclui a trava de módulos) | alinhado |
| 5 | Validações P0 | doc 19, fase 3 e 5; doc 23, T+18, T+26 e T+30 | o P0 é conferido por arquivo e por onda; **acrescentado** explícito, na linha T+33 do doc 23, "P0 final conferido em T+30" como porta do merge (já era conferido, só não era nomeado) |
| 5b | **Domínio e Auth** | **não existiam** nos docs 19/22/23 | **acrescentados** (doc 22, G7; doc 23, P8/P9) com referência a este doc |
| 5c | **Variáveis conferidas** | doc 19, seção 6 e doc 23, P4 cobrem só 2 variáveis | **ampliado** (doc 23, P4 e T+33): matriz completa deste doc, seção 2 |
| 6 | Merge na `main` | doc 19 fase 6; doc 23, T+33 | alinhado; **acrescentado** que o merge só ocorre com 5b e 5c prontos |
| 7 | Deploy Vercel | idem | alinhado; verificação de que o deployment novo é `READY` e que o commit é o esperado |
| 8 | Testes operacionais | doc 19 fase 8; doc 23, T+45 a T+60 | alinhado; **acrescentado** login ponta a ponta no domínio e uma chamada autenticada de cron em dry-run |
| 9 | Liberação controlada | doc 19 fase 9; doc 22, G12 | **detalhada** na seção 7 deste doc; retomada dos jobs (T+40) **não** significa ativar tudo (ver 7) |

Sequência de referência (dia anterior e dia da janela):
- **D-1**: PR com CI verde e aprovado; matriz de variáveis conferida e `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=false` criada na Vercel; Auth (Site URL, Redirect URLs, login `@axion.com.br` e domínio externo recusado) conferido; `vars.ACC_APP_BASE_URL`, segredo do Vault `acc_app_base_url` e `AXION_APP_BASE_URL` apontando para `https://acc.axion.com.br`; `vars.ACC_DELEGATED_ATTACHMENTS_ENABLED` ausente; backup e restauração validados.
- **T-60 a T+30**: doc 23 (backup do dia, jobs pausados, congelamento, ondas, trava, descongelamento, P0 e dados).
- **T+33**: merge e deploy; **T+40**: retomar jobs conforme a fase 0 da seção 7 (e **não** ligar flags novas).
- **T+45 a T+60**: observação inicial e fumaça. **T+60**: GO/NO-GO. **T+2 h a T+24 h**: observação.

## 7. Liberação progressiva
Princípio: **retomar os jobs não é ligar a automação de alertas**. Um e-mail em massa só é possível se três condições estiverem verdadeiras ao mesmo tempo: o ciclo de risco está habilitado (`ACC_WEEKLY_REPORTS_ENABLED=true`), o modo de saída não é o do piloto (`ACC_OUTBOUND_MODE=production`) e há casos vencidos a notificar. O desenho abaixo mantém as duas primeiras condições sob controle até a validação de volume.

### 7.1 Fases
| Fase | Escopo | Estado das chaves | Entrada | Critério de saída (todos) |
|---|---|---|---|---|
| **F0 Deploy sem automação nova** | app novo no ar, jobs retomados (T+40), sem ativar flags novas | flags novas ausentes ou `false`; `ACC_OUTBOUND_MODE` != `production`; anexos por delegação desligado; trava de módulos aplicada | merge e deploy sem erro | 24 h sem incidente, sem `FAILED`, sem 5xx; consultas J1, J2, H1, I1 limpas |
| **F1 Usuários** | equipe AXION (administradores, depois gestores e colaboradores) na obra **TESTE** e depois na WEG, pelos perfis do doc 24 | idem | F0 ok | aceitação do doc 20 (blocos A, B, F, G) aprovada; 0 falhas P0; isolamento entre obras provado |
| **F2 Obras** | obra WEG (produção do piloto) com **uma** caixa de destino (`ACC_PILOT_RECIPIENT`); demais obras só leitura | idem; ciclo de risco **só em dry-run** | F1 ok | dry-run (7.2) aprovado pelo Dono; O3 sem duplicidade; supressões esperadas |
| **F3 Fontes** | uma fonte por vez, na ordem: Gmail inbound, depois documentos/MPP, depois Drive/SSMA, depois Construmanager/diário; **anexos por delegação por último** | cada fonte liga por gate próprio; anexos: `vars.ACC_DELEGATED_ATTACHMENTS_ENABLED=true` só com a aceitação do bloco e-mail | cada fonte com 24 h estável | I1 a I5 limpos por 24 h; volume dentro de 3x a mediana |
| **F4 Alertas reais, pilotados** | ciclo de risco ligado em modo **pilot**: tudo vai para a caixa única do piloto, nunca ao responsável real | `ACC_WEEKLY_REPORTS_ENABLED=true` (se ainda não estiver); `ACC_OUTBOUND_MODE` != `production` | dry-run aprovado; Dono autoriza por escrito | 48 h; O2 abaixo do limite; O3 vazio; O5 só a caixa do piloto |
| **F5 Destinatários reais, com allowlist** | um perfil de destinatário por vez (por exemplo, apenas escalão do responsável), depois os demais | `ACC_OUTBOUND_MODE=production` só aqui, **com allowlist/limite** (7.3); botões SSMA ligados só após aceitação do bloco SSMA | F4 ok e autorização do Dono por escrito | 7 dias sem O3, O5 limpo, sem reclamação de volume |

### 7.2 Dry-run obrigatório do ciclo de alertas
Antes de F2 para F4 e antes de F4 para F5: executar o **dry-run** da rota (`GET /api/cron/risk-alerts?dryRun=1`, já existe; pelo workflow manual `Risk Alerts WEG Dry-Run`, que lê a URL em `vars.ACC_APP_BASE_URL`). O dry-run **planeja sem gravar nem enviar** [CÓDIGO]. Aprovar somente se o plano mostrar:
1. **Volume**: número de casos e de e-mails planejados dentro do esperado (a WEG tem 9 ações de SLA MÉDIO/BAIXO abertas e o resto da carteira; o primeiro ciclo após a migração pode ver **casos históricos vencidos**, e esse é o risco de rajada).
2. **Destinatários**: lista conferida pessoa a pessoa contra a matriz de SLA e a allowlist; nenhum e-mail de terceiros; usuários inativos ou sem e-mail corporativo aparecem como suprimidos.
3. **Deduplicação**: chave de idempotência por evento, estado, nível, destinatário e janela (`risk_alert_outbox.idempotency_key` é única [CÓDIGO]); dois dry-runs seguidos devem planejar o mesmo conjunto.
4. **Critério de disparo**: cada caso planejado tem o prazo do SLA vencido conforme a matriz vigente (doc 26: WEG com MÉDIO 1 dia útil e BAIXO 3; não alterar a política).

### 7.3 Freios (recomendados; os que não existem no código são pendências de engenharia, não bloqueio do go-live)
- **Modo pilot** (existe): sem `ACC_OUTBOUND_MODE=production`, todo envio vai à caixa única; supressões registradas com motivo `PILOT_*`.
- **Allowlist** (existe): `ACC_PILOT_RECIPIENT` e, se houver decisão, `ACC_PILOT_ADDITIONAL_RECIPIENTS`; na F5, **dois controles juntos** (allowlist + lista de destinatários da F5 aprovada pelo Dono).
- **Kill switch por flag** (existe): desligar `ACC_WEEKLY_REPORTS_ENABLED` na Vercel **e** no GitHub faz a rota `risk-alerts` devolver 204; pausar `acc-risk-alerts` no pg_cron (`cron.unschedule` ou `6-pg-cron-pausar.sql`) para parar a origem.
- **Limite por hora de envio de alertas**: [INFERÊNCIA] não localizei limite global de saída por hora no código (existe limite de **respostas** processadas por remetente: 10/h, `ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR`). Enquanto não houver, o controle é **operacional**: consulta O2 a cada 15 min na F4 e F5, com parada manual acima do limiar. Recomendo registrar como item de engenharia para antes da F5.
- **Rajada inicial**: se o dry-run mostrar muitos casos históricos, o Dono decide entre (a) deixar o piloto absorver tudo na caixa única, (b) marcar os casos históricos como tratados por rotina operacional aprovada, ou (c) adiar F4. Não decidir no dia da janela.
- **Gatilhos de parada imediata**: O3 com qualquer linha; O5 com endereço fora da allowlist; O2 acima do limite; H1 com incidente de integração aberto; 5xx contínuo. Ação: desligar a flag, pausar o job e abrir incidente; reversão por etapa no doc 23.

## 8. Ações humanas (quem e onde)
| # | Ação | Quem | Onde | Quando |
|---|---|---|---|---|
| 1 | Criar `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=false` (production) | Eng. TI, com aprovação do Dono (D5) | painel da Vercel, projeto `axion-contract-intelligence-5d3g` | D-1, antes do merge |
| 2 | Conferir `AXION_APP_BASE_URL` = `https://acc.axion.com.br`; `ACC_OUTBOUND_MODE` != `production`; `ACC_WEEKLY_REPORTS_ENABLED` (registrar o valor); `AXIA_CHAT_PROVIDER=off`; `NEXT_PUBLIC_ACC_TEST_MODE` desligado | Eng. TI | painel da Vercel (valores só aparecem lá) | D-1 |
| 3 | Conferir Site URL, Redirect URLs e provedor Google do Supabase de produção | Eng. TI + Dono | painel Supabase, Authentication | D-1 |
| 4 | Conferir o cliente OAuth do Google (URI do Supabase, tela Interna) | quem administra o Google Cloud | Google Cloud Console | D-1 |
| 5 | Conferir `vars.ACC_APP_BASE_URL`, que `ACC_DELEGATED_ATTACHMENTS_ENABLED` não existe e a lista de segredos da seção 2.2 | Eng. TI | GitHub, Settings, Secrets and variables | D-1 |
| 6 | Conferir os segredos `acc_app_base_url` e `acc_*_cron_secret` do Vault do Supabase (nomes e que são os do domínio novo) | Eng. TI | painel Supabase, Vault | D-1 |
| 7 | Teste de login no domínio com conta `@axion.com.br` e com conta de outro domínio | Eng. TI + um usuário real | navegador anônimo | D-1 e T+55 |
| 8 | Decidir comunicado e eventual aviso de manutenção do front | Dono | - | D-1 |
| 9 | Aprovar o dry-run e autorizar cada fase da seção 7 | Dono | por escrito, no dossiê da janela | a cada fase |
| 10 | Decidir limite por hora de envio (item de engenharia) | Dono + Eng. | backlog | antes da F5 |

## 9. Bloqueios e limites desta apuração
- Não li valores de variáveis (por regra) nem o painel do Supabase/GitHub/Google: tudo que depende deles está marcado como conferência humana.
- Cadastros `plain` vieram em claro na API; não foram usados para decidir nada além do que já consta nos docs 19/22.
- As consultas SQL da seção 5 foram escritas a partir das migrations e **não foram executadas**.
- Nada foi criado, editado ou removido na Vercel, no GitHub, no Supabase ou no DNS.
