# 39 — Checklist final da janela de 24/11/2026 (08h BRT) [antes: 28/11 09h]

Status: PREPARADO. A janela NÃO começa sem autorização final específica da Diretoria. Condicionada à confirmação de Eng-1 e Eng-2.
Referência: PR #245 (draft, sem merge), integration/acc-noturna @ 5b6ebb4a (ou HEAD posterior com CI verde), main @ 27da839.
Aceitação funcional: 02/12/2026 (quarta). Responsável proposto: Carlos Evandro; participam Jaime e Reynaldo.

## 0. Pré-requisitos (até 27/11)
- [ ] Diretoria confirma data/hora e nomeia Eng-1, Eng-2 e a pessoa da Área.
- [ ] CI verde no commit final do PR #245 (conferir; não reiniciar sem necessidade).
- [ ] Decisões de 23/11 registradas: `EMAIL` incluído em `ACC_ALERT_ENABLED_SOURCES` (feito, sem redeploy).
- [ ] Nenhum novo disparo real ativo; `ACC_OUTBOUND_MODE=pilot`.

## 1. Eng-1 (banco/ondas)
1. Backup do dia (pg_dump completo de produção) e registro de hash/tamanho.
2. Restauração do backup em banco local descartável; validar contagens-chave e a função P0 (md5 930f6d75898793479b418950b0053bd9).
3. Criar token temporário do Supabase NA HORA (validade curta, DPAPI, nunca em chat/arquivo versionado); revogar e apagar ao final.
4. Congelamento: avisar usuários; sem deploys/merges paralelos; conferir `main` @ 27da839.
5. Executor (`scripts/implantacao/executor-ondas.mjs`, `--producao` + frase digitada) ondas A,B,C,D,F,G,H1,I,P0,J,K,L,M,N (70 itens); H2 e migration SLA 20261121177000 ficam adiadas. Uma onda por vez; parar no primeiro erro.
6. Validações P0 após as ondas (função, RLS, auditoria, RNC e Garantias G-04..G-10 bloqueadas).

## 2. Eng-2 (aplicação)
1. Antes do merge: pausar/controlar crons (ver seção 3).
2. Merge do PR #245 na main (só após validações P0 e autorização final) -> deploy automático Vercel.
3. Conferir deployment READY no commit esperado, rotas principais, login Google (@axion.com.br), obra WEG.
4. Testes operacionais com e-mail em modo `pilot` (sem envio real a terceiros).

## 3. Controle dos crons (apps/web/vercel.json)
- `/api/cron/weekly-alert-digest` (quarta 10:00 UTC): adiado em F0 pelo governador; manter sem envio.
- `/api/cron/system-health` (diário 10:30 UTC): fonte SISTEMA habilitada; acompanhar a primeira execução.
- Freio imediato: `ACC_ALERT_KILL_SWITCH` (kill switch do governador) ou remover o cron e redeploy.

## 4. Governador F0 (Production, conferido)
Limites 10/h, 30/dia, lote 5; reserva de críticos 2/h e 5/dia (dentro dos totais); fontes SISTEMA,SLA,ACOES,AUTORIZACAO,SSMA,EMAIL; projeto WEG apenas; deduplicação por chave e kill switch ativos no código; adiado não gasta tentativa.

## 5. Rollback
- Aplicação: Vercel -> promover/rollback para o deployment anterior da main (27da839).
- Banco: ondas são aditivas; falha de onda => transação reverte (Management API, uma transação por chamada). Restauração do backup do dia só por decisão da Diretoria.
- Alertas: kill switch ou limpar `ACC_ALERT_ENABLED_PROJECTS`.

## 6. Encerramento
- [ ] Revogar/apagar token temporário. [ ] Registrar evidências (docs 23/38). [ ] Comunicar Diretoria; manter cadastro público aberto até ativar os 10 convites pendentes.

> Atualização 23/11/2026: equipe e acessos de Carlos -> docs 38 (seção 15) e 40. Janela de 28/11 segue proposta, NO-GO condicionado aos acessos e ao ensaio.

> Correção 23/11/2026: Eng-2 técnico cancelado; Carlos/Jaime = aceitação funcional; risco residual (sem segundo operador técnico) registrado nos docs 38 (seção 16) e 40 (seção J). Execuções por Eng-1 (Reynaldo) com Claude Code.

> MUDANÇA DE DATA (23/11/2026, Diretoria): a janela técnica passa a terça-feira 24/11/2026 às 08h BRT (antes: sábado 28/11 09h). Aceitação funcional mantida em 02/12/2026. Procedimentos: doc 41-procedimentos-da-janela-terca-24-11.md. Menções a 28/11 acima são histórico.
