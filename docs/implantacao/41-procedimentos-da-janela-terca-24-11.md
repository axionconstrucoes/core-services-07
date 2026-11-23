# 41 - Procedimentos exatos da janela de terça-feira 24/11/2026, 08h BRT (PREPARADO; NÃO EXECUTADO) [antes: sábado 28/11, 09h; arquivo renomeado em 23/11]

Status em 23/11/2026. A janela NÃO inicia sozinha: exige autorização final específica da Diretoria. Aceite do risco residual (sem segundo operador técnico independente) registrado em 23/11. Complementa os docs 23 (runbook com tempos), 28 (compatibilidade), 38 e 39.
Papéis reais: Dono/Eng-1 = Reynaldo (decide GO/abort e supervisiona); execução técnica = Claude Code; registro = log automático fora do repositório. Carlos e Jaime: só aceitação funcional em 02/12 (não participam da janela técnica).

## A. Hoje à noite (23/11) e terça antes das 07h30 (antes: véspera de sábado)
1. CI verde no HEAD final do PR #245 (sem re-run desnecessário); `main` ainda em 27da839; árvore limpa; `git ls-remote` confere o commit.
2. Backup do dia: `backup-banco.ps1 -Alvo producao` e conferência do Storage (`backup-storage.ps1`; reconciliar a versão do script, doc 28 seção 7). Credencial de backup: papel temporário `acc_backup_<UTC>` criado pelo Dono (SQL do pacote fase2), senha só em DPAPI.
3. Restauração em banco descartável: `restaurar-validar.ps1 -Pasta <backup>` (PG17 local 127.0.0.1:55434) -> esperado `TUDO_IGUAL`, SHA-256 íntegro, contagens iguais. Sem isso, NO-GO.
4. Re-medir tamanhos e locks: `node scripts/implantacao/locks-ondas.mjs` com tamanhos novos (doc 28 seção 3); se `emails` > 10 MB ou > 10 mil linhas, risco passa a MÉDIO: reavaliar com o Dono.
5. Token temporário (PAT) do Supabase criado pelo Dono na hora, guardado em DPAPI (`salvar-token-supabase`), validade mínima, revogado e apagado no fim. Nunca em chat.
6. Conferir variáveis Vercel (doc 38): `ACC_ALERT_*` com EMAIL, `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=false`, `ACC_OUTBOUND_MODE=pilot`, kill switch pronto. Cadastro público continua ABERTO.
7. Comunicado de indisponibilidade enviado; ninguém usando o ACC.

## B. Pré-voo somente leitura (T-30)
- Histórico: 134 linhas / máx 20261119034721 / md5 70a176da74c9f88ac06b04d80bc55891.
- P0: `scripts/sql/p0-verificar-record-risk-alert-action.sql` -> `ok = t`, corpo 930f6d75898793479b418950b0053bd9.
- `risk_alert_outbox` sem PENDING; 11 jobs pg_cron ativos; nenhuma sessão `idle in transaction` nas tabelas quentes (`sla_actions`, `risk_alert_outbox`, `emails`, `risk_alert_action_events`).
- Qualquer divergência = NO-GO e nada é aplicado.

## C. Execução (T a T+60; comandos exatos no doc 23)
Ordem obrigatória: CI verde -> backup validado -> congelamento -> migrations (14 ondas, 70 itens) -> validações P0 -> descongelar -> merge na main -> deploy Vercel -> testes operacionais -> liberação controlada.
Cada fase só avança com o critério do doc 23 e a confirmação do Dono. Merge e deploy exigem autorização específica no momento.

## D. Compatibilidade do app antigo com o banco (entre as ondas e o merge)
- Comprovado (análise estática, doc 28): 0 BLOQUEANTE, 40 ATENÇÃO, 6 INFO; nenhuma função removida ou com assinatura alterada, nenhuma coluna removida, nenhum NOT NULL novo sem default, RLS equivalente em 1080 combinações; ondas A-N sem operação irreversível; rollback 413/0.
- NÃO comprovado (lacuna): o teste de RUNTIME do app da `main` contra a homologação pós-ondas (doc 28, seção 9, item 2) não foi feito. Antes da janela, executar (com autorização) o app antigo contra acc-homolog pós-ondas nos fluxos de e-mail/SSMA/revisão de versão e na tela de SLA. Se não for feito, tratar como risco aceito pelo Dono.
- Exposição real: o app antigo coexiste com o schema novo só entre o fim das ondas e o merge (~25 min), com o banco descongelado e jobs ainda PAUSADOS.

## E. Pontos de interrupção seguros (parar e decidir)
| Ponto | Estado do sistema | Ação de retorno |
|---|---|---|
| Antes do congelamento (T-30 a T+4) | nada alterado | encerrar; sem ação |
| Congelado, antes das ondas | só gatilhos de congelamento | `2-reverter-congelamento` + `5-storage-descongelar`, retomar jobs |
| Dentro das ondas | executor para na 1ª falha; cada arquivo é transação própria (falha reverte o arquivo) | rollback das ondas aplicadas em ordem inversa (`supabase/rollbacks/`, com guardas) |
| Ondas prontas, antes do merge | schema novo + app antigo (compatível, doc 28) | manter e investigar, ou rollback das ondas |
| Após merge/deploy | app novo no ar | `request_rollback` Vercel para dpl_6ERyTgkFMK6oCjZqpQGbeCb4zx6L (main @ 27da839); estrutura por rollback SQL; dados só por restauração do backup do dia, decisão do Dono |
Abortar imediatamente: P0 divergente, falha de SQL, contagem divergente, dado de outra obra visível, e-mail real fora da trava, deploy com erro, falha de job repetida 2x.

## F. Controles de recuperação: comprovado x não comprovado (23/11/2026)
| Controle | Situação |
|---|---|
| Backup de produção de 22/11 íntegro (SHA-256, duas mídias) e restaurado em PG local (13 de 13) | COMPROVADO (22-23/11) |
| Backup do DIA e restauração do dia | NÃO feito (acontece na véspera/manhã) |
| Rollback SQL das ondas (413/0 em PG local) | COMPROVADO |
| Executor via Management API (homolog; token revogado) | COMPROVADO |
| P0 em homologação (md5 930f6d75…) | COMPROVADO |
| Rollback Vercel: alvo identificado (dpl_6ERyTgkFMK6oCjZqpQGbeCb4zx6L, isRollbackCandidate=true) | alvo comprovado; execução NÃO ensaiada |
| Teste de runtime do app antigo contra o schema novo | NÃO feito |
| Segundo operador técnico | AUSENTE (risco residual aceito) |
| PITR no Supabase | NÃO verificado (plano Pro: backups diários, 7 dias) |

> Atenção da nova data: o cron system-health (07:30 BRT) roda ANTES da janela; o resumo semanal da quarta 25/11 (07:00 BRT) rodará já no app novo e fica adiado em F0 pelo governador (conferir no pós-deploy). Terça não é quarta, mas a observação de 24h cobre a quarta.

## G. Recálculo de locks, tempo e jobs (23/11/2026, leituras agregadas em produção, sem alteração)
- Tamanhos atuais (22/11 -> 23/11): banco 54 MB -> 68 MB (pg_database_size); `emails` 713 -> 714 linhas, 5,2 -> 5,8 MB (limiar de risco MÉDIO: 10 MB / 10 mil linhas -> segue BAIXO); `document_text_segments` 19168 linhas / 8,8 MB; `audit_log_entries` 4639; `sla_actions` 25; `risk_alert_outbox` 36; `risk_alert_action_events` 2. Nenhuma tabela tocada cruzou limiar. Tempo estimado das 14 ondas com lock: ~7 s no total (doc 28, seção 3); no remoto a latência domina (runbook: T+8 a T+18).
- Histórico de migrations em produção: 134 / 20261119034721 / md5 70a176da74c9f88ac06b04d80bc55891 (igual ao esperado). Sem sessões `idle in transaction`. 11 jobs pg_cron ativos.
- ATENÇÃO (divergência do pré-voo): `risk_alert_outbox` tem 1 linha PENDING (criada em 12/11, 2 tentativas). O pré-voo do doc 23 exige "sem PENDING". Decisão do Dono: aceitar (jobs pausados impedem o envio durante a janela; verificar o que é antes de retomar os jobs) ou tratar antes. Nada foi alterado.
- Controle de jobs: pausar com `congelamento/6-pg-cron-pausar.sql` (T), retomar com `7-pg-cron-retomar.sql` (T+40); workflows do GitHub que escrevem desabilitados na lista do doc 12 (seção 1.4). Crons da Vercel: `system-health` 07:30 BRT (antes da janela); `weekly-alert-digest` quarta 07:00 BRT (já no app novo; adiado em F0).
- Pontos seguros de interrupção: ver seção E.

## H. Recuperação e compatibilidade com o deployment anterior da Vercel
- Deployment anterior (produção atual): dpl_6ERyTgkFMK6oCjZqpQGbeCb4zx6L, main @ 27da839, isRollbackCandidate=true. Rollback: `request_rollback` (MCP/CLI `vercel rollback <id>`) ou painel; efeito em segundos, no roteamento, sem rebuild. Plano Pro: pode voltar a qualquer deployment de produção anterior.
- Compatibilidade do app anterior com o banco novo (rollback da aplicação sem rollback do banco): é o mesmo caso da seção D (app da `main` x schema pós-ondas): análise estática sem bloqueante (doc 28) e teste de runtime desta data (seção I). Por isso a ordem recomendada em caso de falha PÓS-deploy é: 1) rollback da aplicação (rápido, seguro); 2) manter o schema novo (aditivo); 3) rollback de estrutura só se a causa estiver no banco; 4) restauração de dados do backup do dia só por decisão do Dono.
- Dados gravados pelo app novo (e-mails Outlook, provider OUTLOOK, source_type EMAIL) não são desfeitos pelo rollback de estrutura (guardas ROLLBACK_BLOCKED).

## I. Evidências desta rodada (23/11/2026, noite; nada alterado em produção)
**CI #216 (commit 6e187955):** NÃO concluída na última leitura; Guards verde, Typecheck/lint/testes na etapa dos testes SSMA em Chrome real, Build ainda não iniciado. Não declarada verde. Runs #211 a #215 verdes. O commit 56b2bc0c e as edições desta rodada (docs 23, 38, 39, 40, 41) estão SÓ locais; push após a CI #216 fechar (cada push reinicia a CI do PR; o workflow `ci-pr-checks.yml` só roda em pull_request e não dispara nada operacional).
**Ensaio de restauração (banco descartável local PG17, backup de produção de 22/11 04:46 UTC):** SHA-256 íntegro e restauração em 5 s. 12 de 13 categorias IGUAIS (usuários 86, funções 234, gatilhos 70, histórico 134, índices 468, linhas 30383, P0, permissões 133, políticas RLS 157, restrições 1123, RLS 130, colunas 1852). `storage_objetos`: contagem igual (1345), hash DIFERENTE (origem 07c27609..., restaurado b2ae9c5b...). `TUDO_IGUAL=False`. Causa provável: ordenação (collation) da impressão digital deste backup, como já ocorreu em 22/11 (o SQL corrigido usa collate "C"), mas NÃO foi provada nesta rodada. Os erros do pg_restore são só COMMENT de extensões do Supabase (pg_cron, pg_net, vault), esperados. Conclusão: o backup é restaurável; a igualdade de Storage fica a reprovar com o backup do dia (gerado com o SQL corrigido).
**Backup do dia (incl. Storage):** NÃO realizado. Exige a credencial de backup de PRODUÇÃO (papel temporário `acc_backup_<UTC>` criado pelo Dono + segredo em DPAPI); os segredos locais existentes (db/service-role/sk) são de HOMOLOGAÇÃO. Último backup válido: 22/11 04:46 UTC (banco, 8,3 MB) e Storage de 22/11 05:08 (1345 arquivos, 1,08 GB). Defasagem em 24/11 08h: ~27 h; dados gravados depois dele (e-mails, auditoria) só existiriam em backup novo.
**Runtime do app antigo (main @ 27da839, worktree isolado sem .env.local) contra acc-homolog (schema pós-ondas; envio real bloqueado, modo piloto):** o app sobe (Next 16, ready em ~1 s), `/login` responde 200, rotas protegidas redirecionam (307), `/api/cron/system-health` sem segredo responde 401 (fail-closed), sem erros de schema no log do servidor. LIMITE: sem sessão autenticada (não há credencial de teste para login), os fluxos autenticados (e-mail/SSMA/revisão de versão, tela de SLA) NÃO foram exercitados em runtime. Nenhuma incompatibilidade encontrada; cobertura parcial. Servidor encerrado e porta liberada. Obs.: Turbopack recusa `node_modules` como junção; foi usada cópia real.
**P0 em homologação:** md5 930f6d75898793479b418950b0053bd9 (23/11).

## J. GO/NO-GO definitivo para terça 24/11/2026, 08h BRT (Reynaldo decide; Claude Code executa)
| # | Condição | Situação | Bloqueia? |
|---|---|---|---|
| 1 | CI do PR #245 verde no HEAD (6e187955 ou posterior) | #216 EM ANDAMENTO | **Sim** |
| 2 | Backup do dia (banco + Storage) e restauração do dia em banco descartável | NÃO feito; exige credencial de backup de produção criada por Reynaldo | **Sim** |
| 3 | Igualdade do Storage no backup do dia (`TUDO_IGUAL=True`) | hash divergiu no ensaio de 22/11; a reprovar | **Sim** (parte do 2) |
| 4 | Token temporário do Supabase para o executor | criar na hora (Reynaldo) | **Sim** |
| 5 | Pré-voo de produção: histórico 134/…/md5 70a176da…, P0, sem sessões ociosas, 11 jobs | histórico OK, sem `idle in transaction`, 11 jobs ativos; P0 a reconferir no T-30 | **Sim** (no T-30) |
| 6 | `risk_alert_outbox` sem PENDING | 1 linha PENDING de 12/11 (2 tentativas) | Decisão de Reynaldo (aceitar com jobs pausados ou tratar antes) |
| 7 | Compatibilidade do app antigo com o schema novo | estática OK; runtime parcial (sem login) | Risco aceito por Reynaldo ou testar autenticado antes |
| 8 | Recuperação: rollback Vercel (alvo dpl_6ERyTgkFMK6oCjZqpQGbeCb4zx6L) e rollback SQL | alvo e scripts comprovados; execução Vercel não ensaiada | Não |
| 9 | Segundo operador técnico | AUSENTE; risco residual aceito em 23/11 | Aceito |
| 10 | Autorização final específica para modificar produção | PENDENTE | **Sim** |
Resumo: NO-GO até os itens 1, 2, 3, 4, 5 e 10 fecharem. A janela de 08h só é viável se a credencial de backup de produção for criada e o backup/restauração do dia concluídos antes de 07h; caso contrário, adiar. Nenhum passo de produção é executado sem autorização específica.
