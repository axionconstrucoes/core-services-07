# 12 - Plano de publicação e rollback EXECUTÁVEL por ondas (PLANO; nenhum comando foi executado)

Status: proposta para decisão do dono. Todos os comandos abaixo são DOCUMENTADOS, não executados. Nada foi aplicado, registrado ou alterado no Supabase operacional (`plbcvwostmdmdmrziwmd`); o hotfix P0 não foi reaplicado; nenhum e-mail foi enviado. Complementa `02` (premissas e registro), `03` (rollback por migration), `06` (GO/NO-GO), `10` (inventário e ensaio) e `11` (opções de registro no histórico).

Convenções: `CONN` = conexão de manutenção do banco, fornecida pelo responsável na hora e NUNCA gravada no repositório, em histórico de shell compartilhado ou em documento. Rodar a partir da raiz do repositório no commit que foi ensaiado. `psql` 17 recomendado. Os caminhos `scripts/sql/verificacao-onda-<id>.sql` são somente leitura (transação `READ ONLY` com `ROLLBACK`).

## 1. Porta de entrada (antes de qualquer onda) - todos obrigatórios

Quem aprova: Dono (diretoria AXION) por escrito, por onda. Quem executa: Eng. TI acompanha DNS/Workspace (nada aqui altera DNS).

1. **Commit e ensaio do dia**: `node scripts/gen-verificacao-onda.mjs --check` (sem diferenças) e `node scripts/ensaio-implantacao-ondas-realpg.mjs` com 0 falhas, em Postgres 17 local; idealmente sobre cópia restaurada (`10`, seção 5). Testes: `node scripts/test-implantacao-plano.mjs`, `test-implantacao-sequencia.mjs`, `test-implantacao-verificacao.mjs`, `test-implantacao-publicacao.mjs`.
2. **Conferências somente leitura no remoto** (registrar a saída FORA do repositório):
   ```sql
   select count(*) as registros, max(version) as ultima, md5(string_agg(version||'_'||name, ',' order by version)) as hash from supabase_migrations.schema_migrations;
   -- esperado antes da janela: 134 | 20261119034721 | 70a176da74c9f88ac06b04d80bc55891
   ```
   `psql "$CONN" -X -f scripts/sql/p0-verificar-record-risk-alert-action.sql` (esperado `ok = t`; corpo `930f6d75898793479b418950b0053bd9`).
   ```sql
   select count(*) from public.risk_alert_outbox where status = 'PENDING' or claimed_at > now() - interval '10 minutes';   -- 0 (em 21/11 havia 1 PENDING: tratar antes)
   select count(*) from pg_stat_activity where state <> 'idle' and pid <> pg_backend_pid();                            -- baixo
   select count(*) from (select project_id, risk_level, coalesce(area,'~') from public.sla_matrix_rules where active group by 1,2,3 having count(*) > 1) d;  -- 0 (condição da onda A-bis)
   select md5(string_agg(id::text||'|'||assume_due_at::text, ',' order by id)), count(*) from public.sla_actions where risk_level in ('LOW','MEDIUM') and status in ('PENDING','IN_PROGRESS');  -- guardar: as 9 abertas (valor e hash) devem ser IGUAIS ao fim
   ```
   (a consulta da `sla_actions` usa os valores de enum do banco; ajustar `status` se o remoto usar outros rótulos abertos: em 21/11 as 9 abertas eram PENDING/MEDIUM 6, PENDING/LOW 2, ESCALATED/LOW 1.)
3. **Backup** (decisão do Dono; confirmar PITR/plano no painel Database > Backups, que esta leitura não informa):
   ```
   npx supabase db dump --db-url "$CONN" -f backup-schema.sql            # confirmar flags com: npx supabase db dump --help
   npx supabase db dump --db-url "$CONN" --data-only -f backup-dados.sql
   node scripts/backup/capture-acl-snapshot.mjs                          # conforme docs/backup-restore-procedure.md
   psql "$CONN" -X -At -c "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = any(array['record_risk_alert_action','has_project_permission','is_project_member','submit_weekly_alert_digest','sla_ssma_assume_due_at','finalize_ssma_form_submission','insurance_claim_advance','insurance_access','quality_can_read','quality_can_register','quality_can_manage'])" > defs-pre-janela.sql
   psql "$CONN" -X -c "\copy (select * from supabase_migrations.schema_migrations order by version) to 'historico-pre.csv' csv header"
   ```
   Guardar os arquivos fora do repositório, com acesso restrito (contêm dados e definições). Anotar a hora UTC do ponto de restauração.
4. **Congelar o que escreve** (ordem: `docs/operacao-agendador-sla.md` seção 12 para parar sem perder definições):
   ```
   psql "$CONN" -X -At -c "select jobid, jobname from cron.job where jobname like 'acc-%' and active" > cron-ativos.txt   # guardar a lista
   psql "$CONN" -X -c "select cron.alter_job(jobid, active := false) from cron.job where jobname like 'acc-%' and active"   # pausa (conferir antes: \df cron.alter_job)
   gh workflow disable gmail-inbound-sync.yml; gh workflow disable gmail-delegated-sync.yml; gh workflow disable gmail-owner-mailbox-sync.yml
   gh workflow disable weekly-schedule-email-ingestion.yml; gh workflow disable ssma-notifications.yml; gh workflow disable gmail-historical-backfill.yml; gh workflow disable gmail-recover-existing.yml
   ```
   Esperar as chamadas em andamento terminarem (itens da seção 12 do doc do agendador: `net.http_request_queue`, `gh run list --status in_progress`, outbox sem `claimed_at` recente). Variáveis de envio: `ACC_OUTBOUND_MODE` diferente de `production`; `ACC_RISK_ALERT_REISSUE_SEND_ENABLED`, `ACC_INSURANCE_REAL_SEND_ENABLED`, `ACC_EMAIL_REPLY_CONFIRMATIONS_ENABLED`, `ACC_EMAIL_SPECIALIST_ENABLED` desligadas (somente nomes; conferir no painel, não imprimir valores).
5. **Janela**: fora do horário de uso; sem mudança de schema por terceiros; tempo estimado total 90 a 120 min (migrações somam segundos; o resto são conferências e pausas). Parar na primeira falha.

## 2. Procedimento padrão por migration (aplica-se a todas as ondas)

`lock_timeout` 5 s e `statement_timeout` 120 s por transação; um arquivo por transação; P0 conferido DEPOIS de cada arquivo; falha = PARAR.

```bash
# Verificação P0 (esperado: última coluna = t)
p0() { test "$(psql "$CONN" -X -At -f scripts/sql/p0-verificar-record-risk-alert-action.sql | awk -F'|' '{print $NF}')" = "t"; }

# Aplica uma onda do JSON, um arquivo por transação, na ordem. Pré-condição: verificacao antes OK e P0 OK.
aplicar_onda() {
  local id="$1"
  for m in $(node -p "require('./scripts/data/implantacao-sequencia.json').ondas.find(o=>o.id==='$id').migrations.join(' ')"); do
    local v="${m%%_*}" n="${m#*_}"
    # Opção (b) de docs/implantacao/11 (registro com a versão do arquivo, na MESMA transação). Para a opção (a), remova o último -c.
    psql "$CONN" -X -v ON_ERROR_STOP=1 -1 \
      -c "set local lock_timeout = '5s'; set local statement_timeout = '120s'" \
      -f "supabase/migrations/$m.sql" \
      -c "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$n')" \
      || { echo "PARAR: falhou $m"; return 1; }
    p0 || { echo "PARAR: P0 divergiu apos $m"; return 1; }
    echo "OK $m"
  done
}

# Por onda: antes -> aplicar -> depois
verificar() { psql "$CONN" -X -v fase="$2" -f "scripts/sql/verificacao-onda-$1.sql"; }   # 1 = id da onda em minúsculas; 2 = antes|depois
```

Cada onda: `verificar <id> antes` (esperado `falhas = 0`, `ok = t`: objetos novos ausentes) -> `aplicar_onda <ID>` -> `verificar <id> depois` (esperado `falhas = 0`, `ok = t`: objetos presentes) -> `p0`. Registrar o horário e a saída fora do repositório. As funções em `psql -c` não imprimem dados de negócio. `-1` com vários `-c/-f` roda tudo numa transação; um erro desfaz o arquivo E o insert do registro.

Hotfix `20261121090000`: NÃO reaplicar. Se a opção (b) for escolhida, inserir somente a linha: `insert into supabase_migrations.schema_migrations (version, name) values ('20261121090000', 'hotfix_risk_alert_action_authorization')` depois de `p0` OK.

Verificação do histórico depois de cada onda (opção b): o hash deve bater com o esperado calculado do inventário (`01`; `test-implantacao-plano.mjs` calcula o conjunto registrado): `select count(*), md5(string_agg(version||'_'||name, ',' order by version)) from supabase_migrations.schema_migrations`.

## 3. Ondas

Todas aprovadas pelo Dono; executadas por Eng. Colunas: Pré-requisitos | Verificações | Parada (além de "qualquer erro" e "P0 divergente") | Rollback | Janela/locks.

| Onda | Pré-requisitos | Comandos (depois da porta de entrada) | Critérios de parada específicos | Rollback (ordem inversa) | Janela e locks |
|---|---|---|---|---|---|
| **A** (3: 20261107090000, 20261116090000, 20261118140000) | porta de entrada; 0 grupos duplicados de SLA | `verificar a antes; aplicar_onda A; verificar a depois` | aviso de duplicidade na A-bis ou índice `sla_matrix_rules_active_key_unique` ausente depois (a migration não falha: só avisa) | A-bis: `drop index sla_matrix_rules_active_key_unique`; demais: `drop function`/tabelas novas ainda vazias (`03`); sem arquivo de rollback: usar `03` | 1 a 3 s por arquivo; índice parcial em tabela pequena |
| **B** (12: 20261120*) | A concluída | `verificar b antes; aplicar_onda B; verificar b depois` | `record_risk_alert_action` intermediário: as 130000/151000 já têm guarda por md5 (ignoradas com o hotfix efetivo); se o P0 divergir depois delas: PARAR, reaplicar a `20261121101000` (restaura o corpo) e repetir o P0 | `03` (restaurar definições de `defs-pre-janela.sql`); NUNCA deixar corpo pré-hotfix | segundos; funções e 3 a 4 tabelas |
| **C** (2: 20261121100000, 20261121101000) | B concluída | `verificar c antes; aplicar_onda C; verificar c depois` | P0 divergente (é a onda que o reafirma) | restaurar definições capturadas (`has_project_permission`, `is_project_member`) | segundos |
| **D** (12: 20261121110000..176000) | C concluída; agendador e envio pausados (`outbound_delivery_states` altera `risk_alert_outbox`, tabelas de entrega e backfill de 7 linhas SENT) | `verificar d antes; aplicar_onda D; verificar d depois` | timeout de lock em `risk_alert_outbox`: repetir fora de ciclo, não aumentar o timeout | `03` por arquivo; colunas aditivas permanecem | ACCESS EXCLUSIVE breve em tabelas de entrega (pequenas) |
| **F** (1: 20261121178000) | D concluída | `verificar f antes; aplicar_onda F; verificar f depois` | - | `drop function` das novas (`03`) | segundos |
| **G** (5: 20261122100000..300000) | D concluída | `verificar g antes; aplicar_onda G; verificar g depois` | `20261122300000` falha-segura se a lista de Experts não for encontrada: conferir contagens | antes do uso: drop das tabelas novas na ordem inversa; depois: backup | `quality_foundation` ~0,2 s; SHARE ROW EXCLUSIVE em `profiles`/`projects` |
| **H1** (10: 20261123*) | G concluída | `verificar h1 antes; aplicar_onda H1; verificar h1 depois` | `20261123303000` imprime relatório do backfill (RAISE NOTICE): conferir ambíguos/inexistentes | arquivos em `supabase/rollbacks/` onde existem; demais por `03`; `303000` apaga vínculos (conferir contagem antes) | segundos |
| **I** (8: 20261124100000..20261125203000) | H1; ADMINISTRADOR disponível para conceder competências | `verificar i antes; aplicar_onda I; verificar i depois` | `20261124101000` falha fechada `COMPETENCE_REQUIRED`: planejar a concessão de competências logo após (seção 5) | `supabase/rollbacks/*` existem para as 8; a `20261124102000` bloqueia se houver conferência do solicitante | segundos |
| **P0** (1: 20261126100000) | I concluída | `verificar p0 antes; aplicar_onda P0; verificar p0 depois` | falha `P0_GATE`: o corpo/ACL divergiu: PARAR, não reaplicar o hotfix às cegas (reaplicar a `20261121101000`) | no-op (`rollback` é vazio) | instantâneo |
| **J** (1: 20261127100000) | P0 concluída | `verificar j antes; aplicar_onda J; verificar j depois` | P0 divergente (não deve tocar a função) | `supabase/rollbacks/` (trilha de confirmações append-only: preservar se houver uso) | segundos |
| **K** (8: 20261201100000..20261205102000) | J; app da Fase 5 pronto para publicação (seção 4); workflows Gmail desabilitados | `verificar k antes; aplicar_onda K; verificar k depois` | `20261201100000`: 5 colunas com default constante em `emails`, `CHECK` novo (varre ~710 linhas) e 3 índices não concorrentes (bloqueiam ESCRITA em `emails` por dezenas de ms; 37 a 49 ms no ensaio mesmo a 10x): se `lock_timeout` estourar, repetir com o sync Gmail confirmadamente parado | `supabase/rollbacks/*` para as 8 (reversíveis antes do uso; depois, evidência de auditoria: preservar) | `emails` e `risk_alert_cases` (troca de CHECK, 43 linhas) |
| **L** (H2a/H2b/H2c: `20261208*`, `20261209*`, `20261210*`) | K; **ainda não existem nesta base** | acrescentar ao JSON (seção 7), regenerar verificações, reensaiar | H2c: as 9 ações MÉDIO/BAIXO abertas mantêm valor e hash; H2b: redefine RPCs de C e adiciona coluna/CHECK de pilar: conferir `email_risk_signals` | `supabase/rollbacks/*` das novas (exigido pelo teste) | a medir no ensaio |
| **H2** (adiada: 20261123302000) | app que chama as RPCs de `301000` JÁ publicado | `verificar adiada-h2-20261123302000 antes; aplicar uma: ver abaixo; ... depois` | telas de Qualidade deixam de gravar se o app for o antigo | `psql -1 -f supabase/rollbacks/20261123302000_quality_revoke_direct_writes.rollback.sql` (instantâneo) | REVOKE em 15 tabelas |
| **E** (adiada: 20261121177000) | decisão ESCRITA do Dono (aplicar sim/não, data, sem extensão retroativa das 9 abertas, comunicação); A-bis aplicada | idem H2 | `SLA_MATRIX_DUPLICATE_ACTIVE` (falha limpa, sem efeito); as 9 abertas devem manter valor e hash | reativar as 2 regras antigas por `update` auditado (`03`) | segundos |

Para as ondas adiadas (que não estão em `ondas` do JSON) o comando é o mesmo padrão com o arquivo explícito:

```bash
m=20261123302000_quality_revoke_direct_writes   # ou 20261121177000_sla_medio_baixo_prazos_aprovados
v="${m%%_*}"; n="${m#*_}"
psql "$CONN" -X -v ON_ERROR_STOP=1 -1 -c "set local lock_timeout='5s'; set local statement_timeout='120s'" -f "supabase/migrations/$m.sql" -c "insert into supabase_migrations.schema_migrations (version, name) values ('$v','$n')"
```

Rollback padrão de uma migration (quando o arquivo existe): `psql "$CONN" -X -v ON_ERROR_STOP=1 -1 -c "set local lock_timeout='5s'" -f supabase/rollbacks/<nome>.rollback.sql -c "delete from supabase_migrations.schema_migrations where version = '<v>' and name = '<nome>'"` (remover o `-c delete` se o registro não foi inserido). Sempre na ordem INVERSA da aplicação, só com o Dono informado, e P0 conferido depois.

## 4. Publicação do app (depois do banco; ordem: banco -> app -> H2 -> competências -> pipeline)

1. Pré-condição: ondas A a K concluídas e verificadas, P0 `ok`, hash do histórico conferido.
2. Publicar o commit ensaiado pelo fluxo normal do Vercel (PR aprovado para `main`; este plano e as frentes NÃO fazem push). Conferir `get_deployment` READY e variáveis de envio inalteradas.
3. Smoke (somente leitura, modo piloto): login (Google); abrir um projeto; Qualidade e Seguros abrem sem erro de permissão; Painel de Alertas lista; Contatos externos e Sinais de e-mail abrem; nenhuma chamada de envio.
4. Rollback do app: promover o deployment anterior no Vercel (`vercel rollback <url-do-deployment-anterior>` ou painel). O banco permanece (colunas aditivas e RPCs novas são compatíveis com o app antigo, exceto as falhas fechadas descritas em `09`, seção 3); o app antigo fica mais restritivo, sem perda de segurança.
5. Só então aplicar a onda adiada H2 (`20261123302000`).

## 5. Competências e revalidação (depois do app)

1. ADMINISTRADOR concede as competências necessárias aos atos críticos (`project_competence_grant`): sem concessão, os gatilhos da `20261124101000` recusam (falha fechada). Com a Fase 5, a concessão vira SOLICITAÇÃO com validação independente de habilitação (segundo ADMIN ou validador designado, prazo <= 180 dias; H2a entrega a UI): concessões anteriores devem ser REVALIDADAS antes de atos críticos.
2. Conferir (somente leitura): `select status, count(*) from public.project_competence_requests group by 1` e eventos de governança; nenhum ato crítico executado sem validação.
3. Parada: qualquer ato crítico executado sem competência validada; mensagem `COMPETENCE_REQUIRED` crua para usuário (registrar para a UI de H2a).

## 6. Pipeline de e-mail em SIMULAÇÃO (nada real)

Pré-condições: ondas A a K e o app publicados; competências ok. Todas as travas de envio desligadas.
1. Classificação em DRY_RUN: `ACC_EMAIL_CLASSIFY_ENABLED=1 ACC_EMAIL_PIPELINE_DATABASE_URL=<local ou serviço> node scripts/email-classify-run.mjs` (padrão DRY_RUN; ver `docs/pipeline-email-classificacao.md`). `--apply` e `ACC_EMAIL_CLASSIFY_APPLY=1` só por decisão do Dono, e `ACC_EMAIL_CLASSIFY_ALLOW_REMOTE=1` para host remoto.
2. Alertas: `gh workflow run risk-alerts-weg-dry-run.yml --ref main` e `gh workflow run ssma-notifications.yml --ref main -f dry_run=true`, com o aceite do doc do agendador (seção 11): `HTTP 200`, `readinessBlockers: []`, `planned: 0` ou itens conferidos, `novosAEnviar: 0`.
3. Reativar o agendador depois de 1 e 2: `select cron.alter_job(jobid, active := true) from cron.job where jobid in (<lista de cron-ativos.txt>)`; `gh workflow enable ...` dos workflows desabilitados; conferir 2 ciclos sem erro e nenhum e-mail fora do piloto.
4. Parada: qualquer envio real, qualquer alerta fora do escopo do piloto, HTTP diferente de 200 em 2 ciclos: pausar de novo (seção 1.4) e acionar o rollback.

## 7. Como atualizar o plano quando entrarem as migrations de H2a/H2b/H2c

1. Mesclar as migrations (`20261208*`, `20261209*`, `20261210*`), cada uma com `supabase/rollbacks/<nome>.rollback.sql`, linha `pendente` em `01` e linha em `03` (exigido por `test-implantacao-plano`; contagem de pendentes sobe).
2. Rodar `node scripts/ensaio-implantacao-ondas-realpg.mjs` (descobre as novas por versão: onda automática `F5`, com verificação `antes/depois` das novas, P0 por arquivo e idempotência). Variável opcional `ACC_ENSAIO_MIGRATIONS_DIR` para outro diretório e `ACC_ENSAIO_VOLUME_SCALE=1` para o perfil de volume.
3. Acrescentar a onda `L` em `scripts/data/implantacao-sequencia.json` (ordem numérica; subgrupos H2a, H2b, H2c; o JSON é lido pelo ensaio e por `test-implantacao-sequencia.mjs`), no mesmo formato das ondas existentes (`id`, `nome`, `migrations`).
4. `node scripts/gen-verificacao-onda.mjs` (gera `scripts/sql/verificacao-onda-l.sql`; antes da inclusão no JSON as novas saem em `verificacao-onda-novas.sql`).
5. Atualizar `07` (tabela de ondas), `10` (contagem) e o resumo de `01`; rodar os testes de implantação.
6. Checagens específicas: H2c prospectiva (as 9 ações abertas com valor e hash iguais); H2b troca CHECK de pilar (conferir que os valores existentes continuam aceitos; coletor de D lê `pillar`/`signal_kind`); H2a competências (conceder após a onda).

## 8. Riscos e o que NÃO está provado

1. 43 das 65 pendentes não têm arquivo `supabase/rollbacks/*.rollback.sql` (as das Fases 1 a 3 e parte da 4): o rollback delas depende da captura `defs-pre-janela.sql` e das descrições em `03`. Recomendação: gerar os arquivos de rollback faltantes (frente dona do diretório) ANTES da janela, ou aceitar o risco por escrito.
2. Os tempos são de banco local pequeno (`10`): ordem de grandeza. Sem cópia fiel dos dados (opções em `10`, seção 5), não há prova contra valores reais que violem um CHECK/UNIQUE novo (as contagens somente leitura de 21/11 não mostraram conflito).
3. O comportamento do `pg_cron`, do pooler e das extensões do projeto hospedado não foi ensaiado fora do Supabase.
4. `cron.alter_job` e as flags do `supabase db dump` precisam ser conferidos na versão instalada antes da janela.
5. Escrita em `supabase_migrations.schema_migrations` (opção b) exige confirmar o papel/permissão de `CONN`.
6. Nada neste plano foi executado contra o operacional; o ensaio local não substitui a homologação autenticada.
