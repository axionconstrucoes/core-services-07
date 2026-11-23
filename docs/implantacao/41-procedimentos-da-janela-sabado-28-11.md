# 41 - Procedimentos exatos da janela de sábado 28/11/2026, 09h BRT (PREPARADO; NÃO EXECUTADO)

Status em 23/11/2026. A janela NÃO inicia sozinha: exige autorização final específica da Diretoria. Aceite do risco residual (sem segundo operador técnico independente) registrado em 23/11. Complementa os docs 23 (runbook com tempos), 28 (compatibilidade), 38 e 39.
Papéis reais: Dono/Eng-1 = Reynaldo (decide GO/abort e supervisiona); execução técnica = Claude Code; registro = log automático fora do repositório. Carlos e Jaime: só aceitação funcional em 02/12 (não participam da janela técnica).

## A. Véspera e manhã (sexta 27/11 à noite e sábado antes das 08h)
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
