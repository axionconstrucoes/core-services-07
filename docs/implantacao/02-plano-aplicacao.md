# 02 - Plano de aplicação das migrations (PLANO; nada foi executado)

Status: PROPOSTA para decisão do dono. Nenhuma migration foi aplicada, nenhum registro de histórico foi alterado. Base: `01-inventario-migrations.md` (36 migrations pendentes, 1 aplicada fora do histórico).

> Fase 6/H4 (21/11/2026): a contagem confirmada é 200 arquivos locais e 65 pendentes (ver `10`); **atualização H5: 204 arquivos e 69 pendentes** (onda L = as 4 migrations da Fase 6, cauda após K); a comparação das opções (a)/(b) da seção 5 está em `11` (sem escolha; recomendação fundamentada) e o plano executável por ondas com verificações SQL somente leitura e rollback está em `12`. Ensaio com perfil de volume sintético: `10`, seção 4. DNS: `13`.

## 0-bis. Atualização Fase 5/F (21/11/2026)

Contagem definitiva: 192 arquivos locais, 57 pendentes (não 36 nem 47), remoto inalterado (134 registros, hash `70a176da74c9f88ac06b04d80bc55891`, P0 protegido). Ensaio parametrizável (onda F5 para as migrations das frentes A-E), compatibilidade banco x app das `20261124`..`20261127`, locks, backup/PITR e rollback em `09-fase5-reinventario-e-preparacao.md`.

## 0. Atualização da Fase 4/C (prevalece sobre o texto abaixo onde divergir)

A sequência foi ENSAIADA em PostgreSQL 17 local com dados representativos: ver `07-sequencia-ensaiada.md` (sequência, decisões, dependências banco x app, SLA) e `08-relatorio-ensaio-ondas.md` (tempo, locks e verificação P0 por migration). Mudanças em relação às seções 3 e 4 abaixo: (1) a 20261121090000 NÃO é reaplicada (só registro no histórico); (2) 130000 e 151000 já se ignoram quando o corpo protegido existe; a proteção é conferida após CADA migration; (3) a 20261118140000 não falha com duplicata, apenas não cria o índice (conferir a existência dele); (4) nova `20261126100000` (portão P0) ao final; (5) `20261123302000` só com o app. O total pendente passa a 48 (47 + o portão).

## 1. Premissas e medidas

- Banco pequeno (maiores tabelas: `document_text_segments` ~9 MB, `emails` ~6 MB, `audit_log_entries` ~2,6 MB; leitura de `pg_class`). Nenhuma migration pendente reescreve tabela grande: as alterações de tabela são `add column`, `add constraint`, criação de tabelas e índices novos, e `create or replace function`/gatilho/política. Nenhuma pendente contém `drop table`, `truncate` nem `delete` de dados (varredura dos arquivos: só `drop trigger/policy/constraint if exists` seguido de recriação).
- Nenhum arquivo tem `begin/commit` próprio. Cada arquivo roda como UMA transação implícita quando aplicado como um único comando (psql `-1`/`--single-transaction`, ou uma chamada de aplicação por arquivo): ou entra inteiro ou não entra.
- Tempo estimado por migration (banco pequeno, sem contenção): 1 a 3 s para as de função/política; 3 a 10 s para `20261121120000` (24 funções), `20261121130000`, `20261122100000`, `20261122200000`, `20261122201000`. Execução total estimada: 3 a 6 minutos; com conferências entre ondas, janela de 60 a 90 minutos.
- Janela recomendada: fora do horário de ciclos críticos; o cron de risco roda a cada 2 min (`acc-risk-alerts`, ver `docs/operacao-agendador-sla.md`). Preferir início logo após um ciclo e terminar antes do próximo ciclo manual; ou pausar o agendador (procedimento do runbook do agendador).
- Segurança de envio durante a janela: `ACC_OUTBOUND_MODE` deve estar diferente de `production` (modo piloto, allowlist) e `ACC_RISK_ALERT_REISSUE_SEND_ENABLED` desligada. Verificar ANTES de começar (ver `04-requisitos-email.md`).

## 2. Pré-requisitos (porta de entrada; todos obrigatórios)

1. Decisão formal do dono autorizando a aplicação (por onda). Registro escrito.
2. Backup: backup lógico completo do schema e dados (`supabase db dump`, procedimento de `docs/backup-restore-procedure.md`), mais snapshot de ACL (`scripts/backup/capture-acl-snapshot.mjs`) e `pg_get_functiondef` das funções que serão redefinidas (lista na seção 6). Confirmar se o plano do projeto oferece PITR/backup gerenciado e anotar o ponto de restauração (hora) imediatamente antes da primeira migration. Se for criar branch do Supabase para ensaio, é recurso pago: decisão do dono.
3. Ensaio prévio em banco descartável com os dados atuais restaurados (stack local descartável: `docs/stack-local-completa-descartavel.md`) aplicando a MESMA sequência; mais `npm run test:sql` verde.
4. Pré-verificações de dados no remoto (SELECT): (a) nenhuma duplicidade ativa em `sla_matrix_rules` (condição da `20261118140000`; se houver, a migration falha e nada muda); (b) `select count(*) from pg_stat_activity where state <> 'idle'` baixo; (c) nenhum job do agendador em execução.
5. Método de aplicação: preferencialmente `psql --single-transaction -v ON_ERROR_STOP=1 -f arquivo` com `set lock_timeout = '5s'` e `set statement_timeout = '120s'` na sessão (conexão fornecida pelo responsável; segredos nunca no repositório). Se o MCP `apply_migration` for usado, ele não permite prefixar `lock_timeout` sem alterar o texto registrado: nesse caso não alterar configuração de papel do banco (efeito persistente); preferir psql, e só aceitar a ausência de `lock_timeout` se o dono decidir, porque as tabelas tocadas são pequenas e o agendador estará pausado.
6. Congelar mudanças de schema por outras pessoas durante a janela.

## 3. Ordem de aplicação (por ondas, na numeração; parada em qualquer falha)

Regra de ouro: aplicar UM arquivo por vez, na ordem; após cada onda rodar as consultas da seção correspondente de `03-rollback-validacao.md`; falhou, PARAR, não prosseguir, avaliar rollback.

| Onda | Migrations | Dependências | Tipo | Observação |
|---|---|---|---|---|
| A (fora de ordem) | 20261107090000 email_mailbox_collection_controls; 20261116090000 list_addable_profiles_for_project | A1 é pré-requisito de 20261121110000; A2 de 20261121160000 | tabelas/funções novas | Versões menores que a última remota (tratar registro: seção 5). |
| A-bis | 20261118140000 sla_matrix_rules_unique_active_key | pré-condição da 20261121177000 | índice único parcial | Só após a checagem de duplicidade (2.4a). Falha segura se houver duplicidade. Mantida em ordem própria pelo risco de bloquear gravação de regra de SLA por segundos. |
| B (segurança/permissão, 20/11) | 20261120100000, 110000, 120000, 130000, 140000, 150000, 151000, 152000, 153000, 160000, 170000, 190000 | 153000 depende de funções da 100000/120000; 160000 cria `project_permission_for` | funções, tabelas de limites de IA, tokens de resposta | Ver "Atenção" abaixo (130000/151000 x hotfix). |
| C (hotfix e centralização) | 20261121090000 (já efetivo; reaplicar é idempotente), 100000, 101000 | 100000 depende de `project_permission_for` (160000) | funções | A 090000 está aplicada fora do histórico: reaplicar o arquivo é idempotente e ao mesmo tempo restaura o corpo final após as intermediárias 130000/151000. |
| D (e-mail, envio, IA, SLA L2) | 20261121110000, 120000, 130000, 150000, 160000, 170000, 171000, 172000, 173000, 174000, 175000, 176000 | 110000 depende da 107090000; 160000 depende da A2; 173000/174000 dependem de 170000/150000 | tabelas, gatilhos, funções, colunas de estado de envio | `130000 outbound_delivery_states` adiciona colunas em tabelas de envio (tabelas pequenas). |
| E (decisão obrigatória) | 20261121177000 sla_medio_baixo_prazos_aprovados | depende da A-bis | dados (regras de SLA) | NÃO APLICAR sem decisão expressa. Ver seção 4. |
| F | 20261121178000 reissue_approval_flow | independente | funções | Só grava decisão; envio depende de flag desligada. |
| G (Qualidade/Seguros) | 20261122100000, 101000, 200000, 201000, 300000 | 300000 depende de 170000, 150000 e 174000 (onda D) | 34+ tabelas e dezenas de funções, RLS | Só aplicar após D. Módulos entram sem dados; UI já está no código (fase 2). |
| H (fase 3: permissões, integridade, RPCs e vínculos) | 20261123100000, 101000, 102000, 300000, 301000, 302000, 303000 | Depois de G (e de 20260921090000 para 303000). 302000 SÓ junto com a versão do app que chama as RPCs de 301000 | funções, triggers, REVOKE e 2 tabelas | 302000 fecha a escrita direta (reversível); 303000 imprime o relatório do backfill (RAISE NOTICE): conferir ambíguos e inexistentes. Cada arquivo é idempotente |
| I (fase 4/B: garantias e seguros) | 20261125100000, 200000, 201000, 202000, 203000 | Depois da onda H e de 20261123400000/402000 (fase 3/E). 100000 antes das demais (cria f4b_block_mutation). As RPCs redefinidas (aceite informado, aprovação de minuta, atualização de fiança/caução, avanço de sinistro, cláusula) passam a EXIGIR os novos campos: aplicar SOMENTE junto com a versão do app que os envia | tabelas append-only, gatilhos, funções | Não aplicadas em nenhum ambiente operacional. Dados legados continuam válidos (aceite legado só vale para o que já está encerrado). Validado no Postgres 17 local (scripts/test-f4b-garantias-seguros-realpg.mjs). |
| H (frente B, ainda não integrada) | 20261123* (permissões unificadas) | depende de G | funções | Não existe nesta base; incluir após integração e após o inventário ganhar as linhas. |

Atenção (130000, 151000 x hotfix 090000): essas duas migrations redefinem `record_risk_alert_action` com versões ANTERIORES ao hotfix. Aplicadas em ordem, o remoto passa por corpos intermediários (menos restritivos que o atual) até a 090000/101000 recolocarem o corpo final. Mitigação: (1) fazer a onda B e a onda C seguidas, na mesma janela, em minutos; (2) pausar o agendador e manter envio em modo piloto; (3) ao fim, comparar `md5(replace(prosrc, chr(13), ''))` de `record_risk_alert_action` com `930f6d75898793479b418950b0053bd9` (e rodar `test-hotfix-risk-alert-authorization-sql` no ensaio). Alternativa mais segura a decidir: aplicar, nesta ordem lógica, apenas a 090000 e a 101000 depois de B sem 130000/151000, o que exigiria registrar essas duas como "superadas" sem executá-las; só com autorização, pois altera a sequência testada (o teste `test-n1-function-override-audit-sql` valida a sequência completa).

Idempotência: os arquivos usam `if not exists`, `create or replace`, `drop ... if exists` e `on conflict` (contagem de marcadores por arquivo na leitura). Mesmo assim, NÃO reaplicar arquivo já aplicado sem necessidade; a exceção planejada é a 090000.

Exigem cuidado especial:
- 20261118140000: índice único; falha se houver regra ativa duplicada.
- 20261121177000: altera dados de SLA (seção 4).
- 20261121130000: novas colunas e gatilhos em tabelas de envio (`risk_alert_outbox` e outras): conferir que o agendador está pausado.
- 20261122300000: reescreve CHECKs e corpos de função por `pg_get_functiondef`; depende do estado das ondas D; falha-segura se a lista não for encontrada (verificar contagens depois).
- 20261121160000 e 170000: revogam EXECUTE de `anon`; conferir que nenhum fluxo legítimo anônimo existia (testes `test-n4-idempotence-and-anon-revoke-sql`).

## 4. Tratamento próprio da 20261121177000 (SLA MÉDIO/BAIXO) - NÃO APLICAR sem decisão

- Efeito (análise de 20/11 em `docs/implantacao-prontidao-b3-20261120.md` seção 2): desativa a regra geral ativa MÉDIO (1 dia útil) e BAIXO (3), cria 2 e 5; redefine `sla_ssma_assume_due_at`. Não recalcula ações abertas: as 9 ações MÉDIO/BAIXO abertas mantêm o prazo antigo; só ações novas usam 2 e 5.
- SLAs aprovados em vigor: CRÍTICO 1h corrida, ALTO 4h úteis, MÉDIO 2 dias úteis, BAIXO 5 dias úteis; hoje o remoto ainda tem MÉDIO 1 e BAIXO 3 (divergência entre aprovado e operacional).
- Decisões necessárias do dono: (1) autorizar a aplicação; (2) data/hora; (3) se haverá extensão retroativa de prazo para as 9 abertas (decisão separada, NÃO implementada); (4) comunicação aos responsáveis.
- Pré-condições: A-bis aplicada; checagem de duplicidade; `test-sla-medio-baixo-aprovados-sql` verde no ensaio.
- Rollback: reversível por dado (reativar as regras antigas via `update` auditado), ver `03`.

## 5. Registro de histórico (`supabase_migrations.schema_migrations`) - procedimento, NÃO executado

Problema 1: o hotfix (090000) está efetivo sem linha no histórico. Problema 2: três migrations pendentes têm versão menor que a última remota (`20261119034721`); `supabase db push` as recusaria sem `--include-all`, e este plano NÃO usa `db push` (proibido pelo teste `test-implantacao-plano`).

Procedimento proposto (cada comando só toca o registro, nunca o schema; executar após conferência, com backup da tabela `schema_migrations` em arquivo):
1. Conferir antes: `select version, name from supabase_migrations.schema_migrations where name in ('hotfix_risk_alert_action_authorization');` (esperado: nenhuma linha).
2. Hotfix: inserir a linha com a MESMA versão do arquivo e o nome do arquivo (`insert into supabase_migrations.schema_migrations (version, name) values ('20261121090000', 'hotfix_risk_alert_action_authorization');`), somente depois de reaplicar/validar a 090000 na onda C (o campo `statements` pode ficar nulo). Como a reaplicação da 090000 pelo cliente já registraria a linha, não duplicar: conferir de novo antes do insert.
3. Migrations aplicadas via conector `apply_migration`: o conector registra a hora da aplicação como versão e mantém o nome (conforme `docs/migrations-conciliacao-historico-remoto.md`). Regra: correspondência é por NOME; não reaplicar só porque a versão difere. Duas opções, decisão do dono: (a) manter as versões do conector e usar `01-inventario-migrations.md` como tabela de correspondência (recomendada, menor risco); (b) alinhar com `update ... set version = '<versão do arquivo>' where name = '<nome>'` migration a migration, em transação, com conferência `select` antes e depois.
4. Para as 3 fora de ordem, com a opção (b) elas ficam com versão menor que a de outras já registradas: isso é inofensivo para o schema, e o inventário continua como fonte da ordem.
5. Depois de qualquer alteração de registro: rodar de novo o hash do conjunto (`md5(string_agg(version||'_'||name order by version))`) e atualizar o inventário.

## 6. Funções a capturar antes da janela (definição para rollback)

`record_risk_alert_action`, `has_project_permission`, `is_project_member`, `submit_weekly_alert_digest`, `sla_ssma_assume_due_at`, `finalize_ssma_form_submission` e as que forem redefinidas por qualquer migration pendente e que já existam (`list_addable_profiles_for_project` não existe ainda). Comando de leitura: `select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = any(array[...])`. Guardar em arquivo fora do repositório.

## 7. Depois da janela

Rodar `03-rollback-validacao.md` seção 3 (validação) e a seção 4 (testes de segurança); só então liberar o agendador. Atualizar o inventário e a matriz de prontidão (`05`).

## 8. Atualização Fase 7 / H6d (21/11/2026) - histórico e CLI

Reconfirmado somente leitura: 134 registradas (hash `70a176da74c9f88ac06b04d80bc55891`), **205** arquivos locais, **71 não registrados = 70 pendentes (68 em 13 ondas A..M + 2 adiadas) + o hotfix**; P0 md5 `930f6d75898793479b418950b0053bd9`. A seção 5 continua válida; a análise da CLI oficial (`db push`, `--include-all`, `migration repair`, `--workdir`), a tabela (a)/(b)/CLI e a recomendação (aplicar por (b) com `psql -1` e usar a CLI só para conferência `migration list` e `db push --dry-run`) estão em `14`. O hotfix só deve ser registrado DEPOIS da onda B (senão as 12 `20261120*` ficam fora de ordem para a CLI). Pausa e retomada de jobs: `15`.
