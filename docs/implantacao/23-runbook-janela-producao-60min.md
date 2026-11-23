# 23 - Runbook da janela de produção de 60 minutos com congelamento de escrita (PREPARADO; NÃO EXECUTADO)

Status: preparado em 22/11/2026 (decisão D3: preparar, sem executar). **Nenhum comando abaixo foi executado em produção** (`plbcvwostmdmdmrziwmd`). Complementa o doc 19 (plano) e o doc 22 (checklist). Tempos em minutos desde T (início da janela); são estimativas (o ensaio local das 14 ondas levou 2 s; no remoto a latência domina).

Convenções: `CONN` = conexão de manutenção do banco, **fornecida pelo responsável na hora**, nunca gravada. `PAT` = token pessoal criado **para esta janela** e revogado no fim (doc 25). Executar a partir da raiz do repositório, no commit ensaiado. Registrar toda saída **fora do repositório**. Papéis: **Dono** (decide GO/NO-GO e abort), **Eng-1** (executa), **Eng-2** (confere e anota evidências), **Área** (aceitação).

## Pré-condições (D-1; sem elas a janela não começa)
| # | Item | Evidência |
|---|---|---|
| P1 | PR #245 com CI verde, revisado | link e execução do Actions |
| P2 | Ensaio do transporte do executor aprovado no homolog (doc 25) | log fora do repositório |
| P3 | Backup lógico e de Storage de produção feitos na véspera e **restauração local validada** (13 de 13) | `SHA256SUMS` e saída do `restaurar-validar` |
| P4 | Variáveis da Vercel conferidas (doc 19, seção 6): `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=false` (**criada em 23/11**) e as 7 `ACC_ALERT_*` (**criadas em 23/11**, doc 38, seção 11; sem redeploy); `ACC_DELEGATED_ATTACHMENTS_ENABLED` **não definida** no GitHub | captura da tela |
| P5 | Comunicado de indisponibilidade enviado e nenhuma pessoa usando o ACC | confirmação do Dono |
| P6 | Aceitação em homologação aprovada (doc 20) e pessoas de plantão (doc 24) | formulário |
| P7 | Dono presente; critério de aborto (abaixo) conhecido por todos | assinatura |
| P8 | Domínio e Auth: `acc.axion.com.br` no projeto Vercel de produção (já verificado), Site URL e Redirect URLs do Supabase conferidos, login `@axion.com.br` testado e outro domínio recusado (doc 34, seções 1 e 3) | captura do painel e teste anônimo |
| P9 | Matriz completa de variáveis conferida, sem ler valores em chat (doc 34, seção 2): `AXION_APP_BASE_URL`, `ACC_OUTBOUND_MODE` != `production` (**conferido em 23/11: `pilot`**), `AXION_APP_BASE_URL` (**conferido: `https://acc.axion.com.br`**), `ACC_WEEKLY_REPORTS_ENABLED` registrado, `vars.ACC_APP_BASE_URL` e Vault com o domínio | lista conferida, sem valores |

## Cronograma
| Min | Passo | Comando / ação | Critério para seguir | Se falhar |
|---|---|---|---|---|
| T-60 | **Porta de entrada**: backup do dia | scripts de backup do pacote `fase2` (fora do repositório): banco e Storage de produção; `restaurar-validar` em banco local | SHA ok; restauração igual | NO-GO; não iniciar |
| T-30 | Conferências somente leitura | `select count(*), max(version), md5(string_agg(version\|\|'_'\|\|name, ',' order by version)) from supabase_migrations.schema_migrations;` esperado **134 / 20261119034721 / 70a176da74c9f88ac06b04d80bc55891**; `psql "$CONN" -X -f scripts/sql/p0-verificar-record-risk-alert-action.sql` (esperado `ok = t`, corpo `930f6d75898793479b418950b0053bd9`); `risk_alert_outbox` sem PENDING; 11 jobs ativos | todos conferem | NO-GO |
| T-5 | Salvar o estado de retorno | `\copy` do histórico para `historico-pre.csv`; foto das ACLs das funções (doc 12, seção 1.3) | arquivos gerados | NO-GO |
| **T** | **Início**: pausar os jobs | `psql "$CONN" -X -v ON_ERROR_STOP=1 -1 -f docs/implantacao/congelamento/6-pg-cron-pausar.sql` | 0 jobs ativos, 0 em execução | reverter com `7-...` |
| T+2 | Pausar os workflows do GitHub que escrevem | `gh workflow disable ...` (lista do doc 12, seção 1.4; **não** desabilitar `ci-pr-checks`) | lista confirmada | reverter |
| T+4 | **Congelar o banco** | `psql "$CONN" -X -v ON_ERROR_STOP=1 -1 -f docs/implantacao/congelamento/1-aplicar-congelamento.sql` e depois `4-storage-congelar.sql` e `3-verificar-congelamento.sql` | gatilhos = tabelas base (esperado 219), 0 escritas, 3 políticas de Storage | `2-reverter` e `5-storage`; ABORTAR |
| T+8 | **Ondas** (uma execução, mas com parada na primeira falha) | `node scripts/implantacao/executor-ondas.mjs --alvo operacional --producao --todas --segredo <arquivo do PAT> --log <fora do repositório>`; o executor pede digitar `APLICAR plbcvwostmdmdmrziwmd A,B,C,D,F,G,H1,I,P0,J,K,L,M,N` | `CONCLUÍDO: 70 aplicado(s)`; P0 ok após cada arquivo; histórico **204** linhas | parar; rollback das ondas aplicadas em ordem inversa (`supabase/rollbacks/`); decidir abort |
| T+18 | Conferir cada onda | `scripts/sql/verificacao-onda-<id>.sql` fase `depois` (somente leitura); contagens e hash do histórico por onda (doc 19) | tudo igual ao esperado | idem |
| T+22 | **Trava dos módulos** (RNC, Garantias G-04 a G-10, Seguros, Competências) | `1-aplicar-trava.sql` (docs/implantacao/trava-modulos) | **35 travadas, 0 executáveis, 6 liberadas** | `2-reverter-trava.sql`; decidir |
| T+26 | **Descongelar** | `5-storage-descongelar.sql`, `2-reverter-congelamento.sql`, depois `8-verificar-integridade.sql` | 0 resíduos; fingerprints = esperado da onda N; 11 jobs ainda **pausados** | NÃO retomar; investigar |
| T+30 | Conferir dados | contagem de linhas das tabelas pré-existentes igual à de T-30 (exceto `sla_matrix_rules` +4 e auditoria); as 9 ações de SLA com o mesmo hash; `auth.users` igual | iguais | ABORTAR e restaurar se houver divergência de dados |
| T+33 | **Aplicativo**: merge do PR #245 na `main` (deploy de produção automático da Vercel; o domínio `acc.axion.com.br` já está no ar e passa a servir o app novo). **Só com P0 final conferido em T+30, P8 e P9 prontos** | aprovação do Dono no PR; acompanhar o deployment | deployment `READY`, commit esperado | `request_rollback` para o deployment anterior (commit `27da839`) |
| T+40 | **Retomar os jobs** | `7-pg-cron-retomar.sql`; reabilitar os workflows (`gh workflow enable ...`); manter `gmail-delegated-sync` como está (o passo de anexos fica desligado pela variável) | 11 jobs ativos; primeira execução sem falha; **nenhuma flag nova ligada** (liberação progressiva: doc 34, seção 7) | pausar de novo |
| T+45 | **Observação inicial** (15 min) | `9-saude-jobs.sql` a cada 5 min; `acc_system_health_incidents`; erros de runtime da Vercel | 0 falhas, 0 duplicidade | pausar jobs; decidir |
| T+55 | **Fumaça e aceitação mínima** | login, abrir a obra WEG e a TESTE, um alerta simulado, resposta por e-mail **na TESTE** (doc 20, blocos A, B, F, G) com envio só sob a trava do piloto | blocos P0 aprovados | NO-GO; rollback |
| T+60 | **Decisão GO / NO-GO** do Dono | formulário do doc 22 | assinatura | rollback conforme gatilho |
| Depois | Revogar o PAT; guardar logs; iniciar observação de 24 h | painel do Supabase (Access Tokens) | token revogado | — |

## Critérios de ABORTO (qualquer um, decisão imediata do Dono)
P0 divergente após qualquer arquivo; falha de SQL em onda; fingerprint ou contagem de dados divergente depois da reversão do congelamento; usuário vendo dado de outra obra; e-mail real enviado fora da trava; deploy com erro; falha de job repetida em 2 execuções.
**Ação:** parar, não retomar os jobs, aplicar a reversão da etapa corrente e, se houver divergência de dados, restaurar o backup de T-60 (**sem PITR**: perda de tudo que foi gravado depois do backup; por isso o congelamento cobre toda a janela).

## Reversão por etapa (resumo)
Jobs: `7-pg-cron-retomar.sql`. Congelamento: `5-storage-descongelar.sql` + `2-reverter-congelamento.sql`. Trava: `2-reverter-trava.sql`. Ondas: `supabase/rollbacks/<versão>.rollback.sql` em ordem inversa (com guarda de dados). App: `request_rollback` na Vercel. A migration de SLA adiada (`20261121177000`) e a onda H2 adiada **não** fazem parte desta janela.

## Registro durante a janela
Eng-2 anota hora UTC, comando, saída resumida, quem decidiu. Tudo fora do repositório. Nenhum segredo em anotação.

## Equipe definida pela Diretoria (23/11/2026)
- Eng-1: Reynaldo, com execução automatizada pelo Claude Code (ondas, validações, merge e deploy só com autorização específica).
- Eng-2: Carlos Evandro, validação independente, acompanhamento da implantação e apoio à recuperação. Checklist: doc 40.
- Área de aceitação: Reynaldo, Carlos Evandro e Jaime (aceitação em 02/12/2026).
- Janela técnica: terça 24/11/2026 às 08h BRT (decisão da Diretoria em 23/11; antes: sábado 28/11 09h). Não inicia sem autorização final específica.
- ATENÇÃO: acessos de Carlos à Vercel, Supabase e GitHub e a capacidade de recuperação NÃO estão comprovados (doc 40, seção A). Em 23/11 a equipe Vercel tem só 1 membro (Reynaldo).

> Atualização 23/11/2026: acessos de Carlos (Vercel/Supabase/GitHub) e ensaio de recuperação ainda NÃO comprovados; ver docs 38 (seção 15) e 40.

> Correção 23/11/2026: Eng-2 técnico cancelado; Carlos/Jaime = aceitação funcional; risco residual (sem segundo operador técnico) registrado nos docs 38 (seção 16) e 40 (seção J). Execuções por Eng-1 (Reynaldo) com Claude Code.

> MUDANÇA DE DATA (23/11/2026, Diretoria): a janela técnica passa a terça-feira 24/11/2026 às 08h BRT (antes: sábado 28/11 09h). Aceitação funcional mantida em 02/12/2026. Procedimentos: doc 41-procedimentos-da-janela-terca-24-11.md. Menções a 28/11 acima são histórico.
