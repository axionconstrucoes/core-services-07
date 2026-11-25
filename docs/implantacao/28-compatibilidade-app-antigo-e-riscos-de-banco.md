# 28 - Compatibilidade do app antigo com o schema novo e riscos de banco (agente B, 23/11)

Fonte dos números: restauração do backup de PRODUÇÃO de 22/11 04:46 UTC (estado atual de produção, antes das ondas; "ANTES") e a mesma cópia depois de aplicadas as ondas A-N ("DEPOIS"), ambas em PostgreSQL 17 local, somente leitura, só metadados e contagens agregadas. Nenhum conteúdo de mensagem, documento ou pessoa foi lido. Evidência detalhada fica fora do repositório (pacote da fase 2, pasta `cobertura-dados-20261123`). Nada aqui toca Supabase, APIs ou credenciais.

## 1. Resultado em uma tela

| Pergunta | Resposta |
|---|---|
| O app da `main` quebra com o schema pós-ondas? | **Não foi achada incompatibilidade bloqueante.** 0 BLOQUEANTE, 40 ATENCAO, 6 INFO (seção 2). |
| Alguma onda executável é irreversível? | **Não.** Os dois itens irreversíveis/dependentes estão em `adiadas` (SLA `20261121177000` e H2 `20261123302000`) e não estão na cópia pós-ondas (seção 4). |
| Há risco de lock/tempo? | **Baixo por tamanho**: o maior objeto tocado tem 713 linhas e 5,2 MB; soma estimada de tempo com lock < 3 s por onda. O risco real é fila de lock atrás de transações longas (seção 3). |
| Sequência confere? | 14 ondas, 69 migrations + hotfix só-registro = 70 itens do executor; 2 adiadas; onda N (watchdog) é a última. O hash do histórico confere em cada onda e no final (seção 5). |
| Rollback? | 71 arquivos em `supabase/rollbacks`; o ensaio em PG local passou 413/0 falhas (seção 6). |
| Backup/recuperação? | Scripts conferidos e backup de 22/11 íntegro (SHA-256) em duas mídias; procedimento na seção 7. |
| Ensaio do transporte pela API do Supabase? | Pronto e testado offline; falta só o token guardado pelo responsável (seção 8). |

## 2. Compatibilidade do app antigo (código da `main`) com o schema novo

Ferramenta reprodutível (sem dados pessoais): `scripts/implantacao/compat-app-antigo.mjs` (+ `compat-app-antigo-lib.mjs`, `sql/catalogo-compat.sql`), testada com fakes em `scripts/test-compat-app-antigo.mjs`.

```
node scripts/implantacao/compat-app-antigo.mjs catalogo --psql <psql> --banco <antes> --out antes.json   # PGHOST local obrigatório, read-only
node scripts/implantacao/compat-app-antigo.mjs catalogo --psql <psql> --banco <depois> --out depois.json
node scripts/implantacao/compat-app-antigo.mjs extrair --ref main --out uso.json --catalogo antes.json --catalogo depois.json
node scripts/implantacao/compat-app-antigo.mjs comparar --antes antes.json --depois depois.json --uso uso.json --md resultado.md
```

O que extrai do `git show <ref>` (somente código de produção: `apps/web`, `scripts` de workers, `packages`; exclui testes, ensaios e `scripts/homolog|implantacao`): 830 arquivos; 88 RPCs por `.rpc("nome")` (resolve constantes; argumentos nomeados enviados); 118 relações por `.from("x")` (exclui `storage.from`, `Array.from`, `Buffer.from`), com colunas de `select` (inclui embeds), chaves de `insert/update/upsert` e colunas de filtro. Wrappers dinâmicos (3 `.rpc(fn)` e 7 `.from(var)`) são cobertos por varredura de citações literais dos nomes do catálogo (252 nomes citados), marcadas "indireta".

O que compara (ANTES x DEPOIS): função removida / assinatura alterada / argumentos nomeados que nenhuma assinatura nova aceita (considera DEFAULT) / sobrecarga ambígua (PGRST203) / EXECUTE revogado de `anon|authenticated|service_role` / corpo alterado; tabela ou coluna removida; tipo alterado; coluna NOT NULL nova (ou endurecida) sem default que o app não envia no insert; grants de tabela revogados; RLS habilitada; política removida/alterada/RESTRICTIVE nova; gatilho e restrição novos ou alterados em tabela que o app escreve.

### Resultado (app da `main` x pós-ondas A-N)

- **Sem remoção ou mudança de assinatura**: 0 funções públicas removidas ou com assinatura alterada (234 funções ANTES, 501 DEPOIS; as 267 novas são aditivas); 0 colunas removidas, 0 tipos alterados, 0 colunas existentes que viraram NOT NULL, 0 NOT NULL novo sem default em tabela existente (então nenhum INSERT do app antigo falha por coluna nova); 0 grants de tabela revogados; 0 mudanças de RLS ligada/desligada; 0 políticas removidas ou alteradas (157 ANTES, 260 DEPOIS: só novas, nas tabelas novas).
- **EXECUTE revogado de `anon`** em 4 funções de gatilho (`handle_new_user`, `prevent_last_administrator_removal`, `project_delivery_items_log_risk_change`, `set_document_version_project_id`): não são RPCs do app; revogação intencional (ondas D).
- **RLS sem efeito colateral**: as políticas não mudaram, mas as funções que elas usam mudaram em 2 casos (`has_project_permission` e `is_project_member`, onda C: passam a delegar para `project_permission_for`/`project_member_active_for`). Equivalência medida em PG local: 1080 combinações (todos os usuários com vínculo x todos os projetos x 10 níveis, mais usuário/projeto inexistentes e nulos) deram o mesmo resultado nas duas versões (114 permissões verdadeiras, 210 vínculos ativos, nos dois lados).
- **6 INFO (corpo alterado, mesma assinatura)**: `finalize_ssma_form_submission`, `save_contract_alert_batch_item_response`, `ssma_corrective_action_update`, `ssma_field_record_register_photo`, `submit_weekly_alert_digest` e o gatilho `audit_sla_action_updated`. São endurecimentos null-safe/autorização; o app antigo continua chamando com os mesmos argumentos. Conferir na homologação com o app antigo (seção 9).
- **40 ATENCAO**, todos de dois tipos, nenhum bloqueante:
  - **Gatilhos e CHECKs novos em tabelas que o app escreve** (30 itens): `delivery_state`/`failure_class`/`attempt_count` e a guarda `acc_outbound_delivery_guard` em `risk_alert_outbox`, `construmanager_version_review_deliveries`, `ssma_accident_notification_deliveries`, `ssma_field_notification_deliveries`, `notification_email_deliveries`; auditoria de exclusão em `ai_findings` e `project_additional_proposals`; auditoria/guarda em `sla_actions` e `risk_alert_action_events`. Análise: a guarda preenche `delivery_state` quando o app grava `status='SENT'` (o gatilho roda antes do CHECK) e o app antigo grava `sent_at` junto de `SENT`; a única recusa nova é voltar uma linha SENT para PENDING/FAILED, o que o app antigo não faz. Os CHECKs novos são todos NULL-tolerantes (colunas novas anuláveis).
  - **8 CHECKs alterados, todos APENAS AMPLIADOS** (superconjuntos exatos, conferidos): `emails.provider` aceita também OUTLOOK; `area` passa a aceitar QUALIDADE (`risk_alert_cases`, `sla_actions`, `sla_area_responsibles`, `sla_matrix_rules`); `risk_alert_cases.source_type` aceita EMAIL; `expert_id` aceita `engineering-director` e `quality-analyst`. Nada que o app antigo grava deixa de ser aceito.
  - 2 `.from()` sem tabela correspondente (`construmanager-content`, `project-documents`): são nomes de bucket de Storage usados por variável, não tabelas.
- **Efeito em dados (contagens)**: das 167 tabelas existentes, só `sla_matrix_rules` (6 -> 10: 4 linhas novas da área QUALIDADE da onda L; as 6 originais têm o mesmo hash) e `audit_log_entries` (+4) mudaram de contagem. Nenhum UPDATE/DELETE em massa.

### Compatibilidade de dados NOVOS lidos pelo app ANTIGO (risco de UI, não de banco)

Com a janela em que o app antigo convive com o schema novo, valores novos só aparecem quando algo os produz: nenhuma migration agenda job (`cron.schedule` em 0 migrations) e a onda L é a única que insere dados (4 regras de SLA da área QUALIDADE). O app antigo lê `sla_matrix_rules` com `select("*")`: as 4 linhas novas têm `area='QUALIDADE'`, valor que a UI antiga não lista; a resolução da matriz consulta por área/nível, então tende a ignorá-las. **Verificar na homologação** a tela de configuração de SLA com o app antigo. O mesmo vale para `provider='OUTLOOK'`, `source_type='EMAIL'` e `expert_id` novos, que só surgirão com o app novo.

### Limites da análise (honestidade)

Análise estática de strings: não resolve `.from()`/`.rpc()` montados em tempo de execução (cobertos só por citação literal), nem colunas de `select` passadas por variável de outro módulo. Não substitui o teste do app antigo contra a homologação (seção 9). O catálogo usa hash para corpos de função, políticas e restrições: diferença de hash é "mudou", não "piorou".

## 3. Locks e tempo por onda (tamanhos reais da cópia de produção)

Ferramenta: `scripts/implantacao/locks-ondas.mjs` (+ lib e `sql/tamanhos-tabelas.sql`; teste em `test-compat-app-antigo.mjs`). Entrada: contagens exatas e `pg_total_relation_size` por tabela. Banco de produção em 22/11: **54 MB no total; 167 tabelas, 104 com dados; só 3 com mais de 1000 linhas** (`document_text_segments` 19168 linhas/7,5 MB, `storage.objects` 1345, `audit_log_entries` 4474); a maior tabela de e-mail, `emails`, tem 713 linhas/5,2 MB.

Critério de risco (sobre tamanho real): BAIXO = só catálogo, objeto novo ou tabela <= 10 MB e <= 10 mil linhas; MEDIO <= 200 MB; ALTO acima. Tempo = ordem de grandeza (varredura ~50 MB/s, índice/reescrita ~20 MB/s), não medição; a medição está no ensaio (no ensaio, as migrations da amostra levaram de 4 a 24 ms cada e a onda A inteira 100 ms).

| Onda | Migrations | Pior risco | Tempo estimado com lock |
|---|---|---|---|
| A | 3 | BAIXO | 0,09 s |
| B | 12 (+ registro do hotfix) | BAIXO | 0,4 s |
| C | 2 | BAIXO | ~0 |
| D | 12 | BAIXO | 1,2 s |
| F | 1 | BAIXO | ~0 |
| G | 5 | BAIXO | 0,7 s |
| H1 | 10 | BAIXO | 0,7 s |
| I | 8 | BAIXO | 0,7 s |
| P0 | 1 | BAIXO | ~0 |
| J | 1 | BAIXO | 0,25 s |
| K | 8 | BAIXO | 2,3 s |
| L | 4 | BAIXO | 0,7 s |
| M | 1 | BAIXO | 0,1 s |
| N | 1 | BAIXO | ~0 |

DDL/DML em tabela existente com dados (todas pequenas): `20261120170000` troca 2 CHECKs com validação em `risk_alert_action_events` (2 linhas) e `alert_email_messages` (6); `20261121130000` adiciona colunas (sem reescrita: defaults constantes ou sem default) e faz 9 UPDATEs com WHERE em tabelas de entrega (0 a 36 linhas); `20261123303000` cria índice único em `risk_alert_cases` (43 linhas); `20261201100000` adiciona 5 colunas em `emails` (sem reescrita), cria 2 índices e 1 índice único (**o maior item: 713 linhas, 5,2 MB, dezenas de ms**) e troca o CHECK de provider. Há 46 blocos `DO` com SQL dinâmico (troca de CHECK, criação de gatilho, GRANT/REVOKE de função); o alvo é dinâmico, então foi usado como limite superior o maior objeto existente citado no bloco: 5,2 MB.

**O risco real não é o tamanho, é a fila de lock**: ALTER/DROP/CREATE TRIGGER e troca de CHECK pedem ACCESS EXCLUSIVE ou SHARE ROW EXCLUSIVE em tabelas quentes (`sla_actions`, `risk_alert_outbox`, `emails`, `risk_alert_action_events`) e ficam atrás de qualquer transação aberta dos workers/jobs. O executor usa `lock_timeout 5s` e `statement_timeout 120s` por arquivo e para na primeira falha (55P03 foi ensaiado), então o pior caso é a onda parar sem aplicar nada do arquivo corrente. Mitigação do runbook (doc 15/23): pausar jobs antes e confirmar ausência de `pg_stat_activity` em estado `idle in transaction` nas tabelas citadas. **Reexecutar `locks-ondas.mjs` com tamanhos novos imediatamente antes da janela**: o histórico de 18 meses vai crescer `emails`, `document_text_segments` e afins; os limiares acima passam de BAIXO para MEDIO se `emails` passar de 10 MB ou 10 mil linhas.

## 4. Itens irreversíveis e adiados (inventário exato)

- **Adiada E, `20261121177000_sla_medio_baixo_prazos_aprovados`**: decisão do dono (SLA MÉDIO 2 e BAIXO 5 dias úteis, prospectivo). Faz `UPDATE`/`INSERT` em `sla_matrix_rules`; o rollback por script a RECUSA (irreversível por script; ensaiado). Depende de `20261118140000` (onda A). Fora das ondas, fora do `--todas` do executor, ausente do histórico da cópia pós-ondas. Esta frente não alterou política nem matriz de SLA.
- **Adiada H2, `20261123302000_quality_revoke_direct_writes`**: só com a versão do app que chama as RPCs de `20261123301000`; revoga escrita direta de `authenticated` nas tabelas de Qualidade (reversível: rollback existe e foi ensaiado). Também ausente do histórico pós-ondas.
- **Ondas executáveis (A-N): nenhum item irreversível.** Varredura estática de todas as 69 migrations: 0 `DROP TABLE`, 0 `DROP COLUMN`, 0 `TRUNCATE`, 0 `DELETE`, 0 `DROP SCHEMA`; o `UPDATE` só ocorre em tabelas de entrega (backfill de `delivery_state`, com WHERE); o único `INSERT` em tabela existente é o da onda L (4 regras de SLA da área QUALIDADE, aditivo). A palavra `truncate` que aparece em várias migrations é o privilégio `TRUNCATE` em REVOKE/GRANT, não o comando. Há teste automático (`test-compat-app-antigo.mjs`) que falha se uma onda executável ganhar operação irreversível.
- **Hotfix `20261121090000`**: já efetivo em produção; o executor só registra a linha (com portão P0 na mesma transação), nunca reaplica.
- Observação sobre os rollbacks: rollback é de ESTRUTURA. Dados gravados pelo app novo depois da onda (por exemplo e-mails Outlook) não são desfeitos; os rollbacks têm guardas que RECUSAM quando há evidência/consumo gravado (`ROLLBACK_BLOCKED`, ensaiado para organização externa e `ai_consult_usage`).

## 5. Sequência, dependências e hash do histórico

Conferido por `executor-ondas.mjs --dry-run --todas` e por teste: **14 ondas** (A, B, C, D, F, G, H1, I, P0, J, K, L, M, N); **69 migrations nas ondas + 1 registro do hotfix = 70 itens**; **2 adiadas** (E e H2); 72 versões pendentes no total (71 ondas/adiadas + hotfix) contra a última remota `20261119034721`. Ordem numérica estrita (as 3 de menor versão, onda A, vêm primeiro e exigem `--include-all` na CLI do Supabase, por isso o executor próprio). **O watchdog `20261212100000` é a última migration (onda N)**. Dependências das adiadas (`20261118140000`; `20261123300000` e `20261123301000`) estão antes na sequência.

Hash do histórico (`md5(string_agg(version||'_'||name, ',' order by version))`), recalculado a partir das 134 linhas da produção + cada onda e conferido contra a cópia pós-ondas (204 linhas, mesmo hash final):

| Estado | Linhas | md5 |
|---|---|---|
| Produção 22/11 (ANTES) | 134 | `70a176da74c9f88ac06b04d80bc55891` |
| Após A | 137 | `9cd1bd94a14e1a471f660f7050e95502` |
| Após B (+hotfix) | 150 | `ef30fc51e0d3acbd8ef7ebae69d3f861` |
| Após C | 152 | `075e4b1700b9f24afcd5ffa80db0d1a6` |
| Após D | 164 | `7251862885cd9ba5eb93222a1d6f2d92` |
| Após F | 165 | `10479924d3f2e9482a64a34ee41cbba9` |
| Após G | 170 | `28a91e848cd8a2a957e677b1be6274d9` |
| Após H1 | 180 | `b318f345588396ee190a7ae76d106d88` |
| Após I | 188 | `bd881ed64b50fa7a8505389744dbb10e` |
| Após P0 | 189 | `c29719db466a207b36347273858f9e44` |
| Após J | 190 | `4e939017127c4bf37d633d9cd98034ff` |
| Após K | 198 | `9db5830c8ff36f674eef7187b3f3e41d` |
| Após L | 202 | `7203f478312259dfab477dd0552a64ef` |
| Após M | 203 | `8076ca8183cb80a38dd9b25ea8a0518b` |
| **Após N (final)** | **204** | **`7811c0f96c2a7aad7e6e828887e72274`** (= cópia pós-ondas) |

O executor recalcula esse mesmo hash depois de cada onda e para (`HASH_HISTORICO`) se divergir; o `--dry-run` não consulta banco, então a conferência por onda é a desta tabela contra a execução real.

## 6. Rollback e ensaios

- `supabase/rollbacks` tem 71 arquivos (um por migration pendente + adiadas); `test-implantacao-rollbacks.mjs` confere cobertura.
- `scripts/ensaio-implantacao-ondas-realpg.mjs` (PG local descartável, variantes LF e CRLF, sequência A-N, rollback por onda com 2ª execução idempotente e reaplicação com esquema idêntico, P0 conferido após cada arquivo, adiadas E e H2 ensaiadas à parte): **413 OK, 0 falhas**, 34 s, PostgreSQL 17.12. Cada rollback devolve o esquema IDÊNTICO ao anterior à onda.
- Testes rodados nesta frente: `test-implantacao-plano` 14/0, `-sequencia` 11/0, `-cli` 7/0, `-verificacao` 7/0, `-publicacao` 9/0, `-rollbacks` 12/0, `test-executor-ondas` 36/0, `test-no-local-absolute-paths` 3/0, e os novos `test-compat-app-antigo` 25/0 e `test-homolog-executor-api-pronto` 6/0.

## 7. Backup e recuperação (pacote fase 2; fora do repositório)

Nada foi executado contra produção nesta frente. Scripts conferidos (os do disco externo são idênticos aos da pasta de trabalho, exceto `backup-storage.ps1`, que difere: usar a versão mais recente e reconciliar antes da janela):

1. **Papel de backup** (`papel-backup.ps1` só no acc-homolog; em produção o SQL é executado pelo responsável): papel temporário `acc_backup_<UTC>` sem `pg_read_all_data` (para não dar USAGE em `cron`/`net`); `verificar-papel-producao.ps1` confere somente leitura (identidade, privilégios por `has_*_privilege`). Senhas só em DPAPI.
2. **`backup-banco.ps1 -Alvo producao [-Pooler ...] [-Usuario ... -Segredo ...]`**: `pg_dump -Fc` 17.12 local com `default_transaction_read_only=on`, mais `esquema.sql` e `roles.sql` (sem senhas); calcula a impressão digital (`impressao-digital.sql`: colunas, corpos de função, políticas, RLS, grants, gatilhos, restrições, índices, linhas por tabela) ANTES e DEPOIS do dump e informa `ORIGEM_ESTAVEL_DURANTE_DUMP`; gera `SHA256SUMS.txt`, restringe ACL e copia para a mídia externa verificando SHA-256.
3. **`backup-storage.ps1`**: lista `storage.objects` (somente leitura), baixa cada arquivo pela API do Storage e confere tamanho e MD5/eTag; grava `MANIFESTO.tsv` e `MANIFESTO.sha256`.
4. **`restaurar-validar.ps1 -Pasta <backup>`**: confere SHA-256 e `pg_restore -l`, restaura num banco NOVO do PG17 local (host fixo 127.0.0.1:55434, recusa outro), filtra extensões do Supabase indisponíveis, restaura com `-j 4` e compara a impressão digital restaurada com a da origem (`TUDO_IGUAL`). Não derruba nada que não seja o banco que ele criou (a menos de `-ManterBanco`).
5. **Estado atual**: o backup de 22/11 04:46 UTC (`producao-20261122-044608`: dump 8,3 MB, esquema 1,6 MB) tem os 10 arquivos com SHA-256 íntegros nas duas mídias; o backup do Storage (`storage-producao-20261122-050829`) tem 1345 arquivos/1,08 GB, o mesmo número de objetos de `storage.objects`. Este backup é o que foi restaurado para esta análise. Como produção segue recebendo e-mails e eventos, **repetir `backup-banco.ps1` (e conferir o Storage) imediatamente antes da janela** e restaurar em PG local para provar a recuperação.
6. **Rollback de dados**: o rollback de migration não devolve dados; a recuperação de dados é por restauração do dump (tabelas inteiras via `pg_restore -t`), sempre num banco isolado primeiro. Restauração em produção é decisão do responsável e depende de credencial dele.

## 8. Transporte do executor pela API do Supabase (sem token)

`scripts/homolog/executar-homolog.ps1 -Etapa executor-api` e `scripts/homolog/salvar-token-supabase.ps1` estão prontos e foram testados OFFLINE (`scripts/test-homolog-executor-api-pronto.mjs`): ref fixo do acc-homolog e recusa dos três refs operacionais nos dois scripts; token lido sem eco, validado só contra o projeto de homologação (por stdin do `curl`, nunca em linha de comando) e gravado cifrado (DPAPI) como arquivo novo (o antigo vira `.bak`); a etapa chama `executor-ondas.mjs --alvo homolog --segredo <arquivo>` sem `--producao`; as variáveis que o script exporta não disparam a guarda de ambiente limpo; sem o arquivo de token o executor recusa (exit 2) e produção sem `--producao` e frase digitada também; sintaxe PowerShell sem erros; `--dry-run --todas` lista 70 itens/14 ondas. O arquivo de token do ensaio ainda não existe (esperado). **Depende do responsável**: criar um token novo e exclusivo, rodar `salvar-token-supabase.ps1` numa janela normal, avisar, e revogá-lo no painel depois do ensaio; para produção, outro token na hora.

## 9. Bloqueios e dependências de autorização/credencial

1. **Token Supabase do ensaio de transporte** (responsável): bloqueia a validação do executor contra a API de gerenciamento (comportamento já provado na homologação em 21-22/11, código ainda não exercitado lá).
2. **Teste do app antigo contra o schema novo na homologação** (autorização + credenciais da homologação): rodar o app da `main` contra a homologação pós-ondas e exercer os fluxos de envio de e-mail/SSMA/revisão de versão e a tela de SLA (seções 2). A análise local cobre o catálogo, não o runtime.
3. **Backup de produção imediatamente antes da janela** (responsável, credencial DPAPI de produção e papel de backup criado por ele).
4. **Decisões do dono** pendentes e fora desta frente: SLA da adiada E; versão do app para a adiada H2.
5. Tamanhos de produção devem ser re-medidos antes da janela (`locks-ondas.mjs`), pois a carga histórica cresce as tabelas de e-mail e documentos.
