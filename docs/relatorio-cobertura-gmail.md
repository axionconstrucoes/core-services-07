# Relatório de cobertura de leitura do Gmail (Fase 6 / H3)

Data da apuração: 21/11/2026. Natureza: **diagnóstico SOMENTE LEITURA**. Nada foi gravado no Supabase operacional, nenhum workflow foi disparado, nenhum segredo do GitHub foi usado, nenhuma mensagem foi modificada ou enviada, e **nenhum conteúdo de mensagem ou valor de credencial** consta aqui (só contagens, IDs opacos, nomes de variáveis e endereços de caixa corporativos).

## 1. Fontes usadas e o que cada uma prova

| Fonte | Como foi usada | Estado |
|---|---|---|
| (i) Supabase operacional (`plbcvwostmdmdmrziwmd`) | Somente `SELECT` agregado via MCP (contagens, datas, nomes de caixa) | Feito |
| (ii) Logs de workflows do GitHub | `gh` **não está instalado** neste computador e a API pública responde redirecionamento (repositório privado). Não foi usado segredo do GitHub. | **BLOQUEADO** (ver comando exato na seção 6) |
| (iii) Credencial já presente no ambiente local | Existe `apps/web/.env.local` do repositório principal com as variáveis do slot do titular (`GOOGLE_GMAIL_REYNALDO_CLIENT_ID`, `_CLIENT_SECRET`, `_REFRESH_TOKEN`; todas preenchidas — só os nomes foram lidos). Foi feito **um teste mínimo de leitura** com a sonda `scripts/lib/mail-universal/gmail-coverage-probe.mjs` | Feito, só na caixa do titular (`reynaldo@axion.com.br`) |

Teste de leitura (iii): 84 chamadas HTTP no total — 1 troca de token, 1 `users.getProfile`, páginas de `users.messages.list` (somente IDs) e 69 `users.messages.get?format=metadata` (cabeçalhos From/To/Cc/Bcc apenas, para contar domínios). O token retornou o escopo **`gmail.readonly`** (nenhum escopo de escrita). A sonda recusa por construção qualquer método diferente de GET, `format=full/raw`, e caminhos fora da lista (testada em `scripts/test-f6-h3-gmail-sonda.mjs`).

## 2. Caixas autorizadas × sync recente × mensagens WEG × lacunas

Configuração vigente no operacional (tabela legada `project_email_ingestion_*`, projeto piloto `00000000-0000-4000-8000-000000000001`, `enabled = true`, janela `FROM_NOW`, monitoramento desde 20/08/2026, `last_sync_at` = 21/11/2026 03:47 UTC). Domínios da config: `axion.com.br` (AXION) e `weg.net` (CLIENT).

| Caixa | Autorizada (config legada) | Credencial local testável | Mensagens no banco (Gmail) | Última ingestão | Mensagens WEG no banco | Situação |
|---|---|---|---|---|---|---|
| `reynaldo@axion.com.br` | Sim | Sim (slot do titular) | 678 (510 recebidas, 168 enviadas) | recebidas 11/11/2026; enviadas 28/10/2026 | 199 (176 + 23) | Lida, mas **defasada** (ver seção 3) |
| `corazza@axion.com.br` | Sim | **Não** (sem slot de credencial local) | **0** | nunca | 0 | **Lacuna**: autorizada na config, sem nenhuma mensagem ingerida; leitura não comprovada |
| Caixa do slot `INBOUND` (`GOOGLE_GMAIL_INBOUND_MAILBOX`, só o nome da variável foi lido) | Não aparece na config legada | Credencial presente, **não testada** | Nenhuma linha com esse `mailbox_address` | — | — | Workflow `gmail-inbound-sync` executa a cada 15 min e termina com sucesso, mas **não há linhas atribuídas a essa caixa**; destino das mensagens não comprovado |
| `crm@axion.com.br` | Não | Não | 0 | — | — | Fora da config; caixa **Google** (MX do domínio = Google). Ver `docs/outlook-achado-crm-axion-mx-google.md` |

Outros fatos apurados:

- Tabelas de gate por caixa (`email_mailbox_collection_controls`, `email_sync_runs`) **não existem no operacional**: as migrations `20261107090000` e `20261121110000` estão entre as pendentes. Logo "caixas autorizadas / períodos / last_sync" por controle individual **ainda não podem ser lidos do banco**; vale a configuração legada acima. Isso é, por si só, uma lacuna de governança (aceite individual por caixa não registrado no operacional).
- As 32 linhas com `provider` nulo (mais recente em 19/11/2026, todas `IN_SCOPE`, sem corpo) **não vêm do Gmail**; origem não comprovada por esta apuração (compatível com e-mails de teste/pilotos gerados pelo próprio ACC).
- Das 678 mensagens Gmail: 289 `IN_SCOPE` (279 com corpo) e 389 `OUT_OF_SCOPE`. Todas têm classificação.
- Execuções do sincronizador incremental registradas em auditoria: 827; a última em 21/11/2026 04:02 UTC. Heartbeat do agendador `gmail-sync`: último sucesso 21/11/2026 04:03 UTC; última falha 20/11/2026 23:47 UTC (`JOB_FAILURE`). O workflow `gmail-owner-mailbox-sync` (caixa do titular) **não tem linha de heartbeat** — não há prova de que esteja rodando.
- Execuções da tabela `project_email_ingestion_sync_runs`: apenas 2, ambas `PREPARING` de 23/08/2026 (legado, sem finalização).

## 3. Universo consultado × processado (caixa do titular, leitura real de metadados)

Mensagens WEG = prefiltro do Gmail `{from:weg.net to:weg.net cc:weg.net bcc:weg.net}` por mês de envio. "Universo" = todas as mensagens da caixa no mês (exceto spam/lixeira).

| Mês | Universo na caixa (Gmail) | WEG no Gmail (prefiltro) | WEG no banco (from/to) | Observação |
|---|---|---|---|---|
| 2026-08 | 692 | 23 | 23 | Confere |
| 2026-09 | 858 | 34 | 36 | Banco +2 (ver nota 1) |
| 2026-10 | 741 | 10 | 12 | Banco +2 (ver nota 1) |
| 2026-11 | 1.393 | 2 | 1 | **1 mensagem WEG da caixa não está no banco** (nota 2) |

- Das **69** mensagens WEG listadas (IDs opacos), **68 estão no banco e 1 ausente** — a mais recente do mês de novembro. A leitura de metadados das 69 confirmou participante no domínio `weg.net` em **69/69** (100% do prefiltro; 0 falso positivo).
- **Subdomínios**: nas 69 mensagens só apareceu o domínio exato `weg.net` (0 mensagens apenas com subdomínio). Isso **não prova que não existam** mensagens de `*.weg.net`: não se sabe se o operador `from:weg.net` do Gmail casa subdomínios. Com a nova regra de sufixo (`.weg.net`) o prefiltro por termo deve ser complementado por uma leitura sem prefiltro (modo universo) para varrer subdomínios. A sonda já aceita subdomínios na contagem de domínios.
- Nota 1: a contagem do banco usa `LIKE '%weg.net%'` em remetente/destinatário (inclui, por exemplo, endereços parecidos) e o banco guarda mensagens enviadas **e** recebidas de períodos em que o Gmail pode ter movido/removido mensagens depois; a diferença de +2 por mês não foi detalhada (exigiria listar conteúdo, o que não foi feito).
- Nota 2: a defasagem da caixa do titular (recebidas até 11/11, enviadas até 28/10) é compatível com o workflow do titular sem execução recente — **inferência**, não comprovada sem os logs do GitHub.
- A coluna de cópia/cópia oculta (`cc_addresses`, `bcc_addresses`) **não existe** no operacional (migration `20261201100000` pendente): o banco só enxerga From/To; mensagens em que `weg.net` aparece apenas em Cc/Bcc só são contadas pelo Gmail.
- O universo por mês na caixa (692–1.393) é muito maior que o do banco (2–91) **por desenho**: só entram mensagens com participante da WEG (e escopo do projeto), conforme a regra do piloto.

## 4. Lacunas (resumo executivo)

1. `corazza@axion.com.br`: autorizada, **zero mensagens** ingeridas e sem credencial local para testar — leitura não comprovada.
2. Caixa do slot `INBOUND`: sincroniza com sucesso, mas nenhuma linha do banco é atribuída a ela — verificar qual caixa é e para onde grava.
3. Caixa do titular defasada (recebidas após 11/11 e a mensagem WEG mais recente ausentes).
4. Gate por caixa (`email_mailbox_collection_controls`) **não aplicado** no operacional: sem registro de autorização individual/período por caixa no banco.
5. Cc/Bcc e domínios envolvidos não são persistidos no operacional (migration pendente).
6. Subdomínios `*.weg.net`: não varridos (o prefiltro por termo pode não alcançá-los).
7. `crm@axion.com.br` não está em nenhuma configuração e é caixa Google (não Exchange).
8. Logs de GitHub Actions não inspecionados (BLOQUEADO).

## 5. O que NÃO está comprovado

- Que o Google Admin tenha delegação de domínio concedida (estado declarado no código: `PENDENTE_AUTORIZACAO_NO_GOOGLE_ADMIN`). A única leitura real feita foi pelo OAuth do titular, **uma caixa**.
- Qualquer monitoramento de caixa que não seja a do titular.
- O motivo da defasagem (falta dos logs).

## 6. Ações que dependem do responsável / comandos exatos

1. Logs dos workflows (somente leitura, na máquina do responsável com `gh` autenticado):
   - `gh run list --repo axionconstrucoes/axion-contract-intelligence --workflow gmail-inbound-sync.yml --limit 20`
   - `gh run list --repo axionconstrucoes/axion-contract-intelligence --workflow gmail-owner-mailbox-sync.yml --limit 20`
   - `gh run view <id> --log` (os logs só mostram nomes de segredos mascarados).
2. Decidir sobre `corazza@axion.com.br`: fornecer autorização/credencial do titular (slot OAuth) **ou** habilitar a delegação de domínio (`docs/gmail-delegacao-dominio-passo-a-passo.md`).
3. Aplicar, na onda correspondente do plano de implantação (H4), as migrations do gate por caixa e das colunas Cc/Bcc; só depois ligar `ACC_EMAILS_PARTICIPANT_COLUMNS=1`.
4. Reexecutar a sonda após a próxima rodada do workflow do titular para confirmar que a lacuna fechou:
   `node scripts/lib/mail-universal/gmail-coverage-probe.mjs --env <arquivo .env> --prefix GOOGLE_GMAIL_REYNALDO --max-metadata 150`.
