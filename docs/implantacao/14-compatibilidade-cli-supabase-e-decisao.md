# 14 - Compatibilidade com a CLI oficial do Supabase e decisão entre (a), (b) e CLI (Fase 7 / H6d)

Data da leitura: 21/11/2026. Nada foi aplicado, reparado ou registrado no operacional (`plbcvwostmdmdmrziwmd`); só leituras de catálogo. Hotfix P0 não reaplicado. Complementa `11` (opções a/b) e `12` (plano por ondas). Rótulos: **[VERIFICADO]** lido no catálogo remoto, na documentação oficial ou ensaiado localmente; **[INFERIDO]** comportamento conhecido da CLI que as páginas lidas não descrevem; **[BLOQUEADO]** depende de ação do responsável.

## 1. Inventário reconfirmado (somente leitura, 21/11/2026)

| Item | Valor | Fonte |
|---|---|---|
| Registros em `supabase_migrations.schema_migrations` | **134**; última `20261119034721`; hash `md5(string_agg(version\|\|'_'\|\|name, ',' order by version))` = `70a176da74c9f88ac06b04d80bc55891` | SELECT via MCP **[VERIFICADO]** |
| Arquivos locais | **206** (134 registrados + **72** não registrados) | `supabase/migrations` **[VERIFICADO]** |
| Os 72 | 69 em 14 ondas (A, B, C, D, F, G, H1, I, P0, J, K, L, M, N) + 2 adiadas (`20261121177000` onda E, `20261123302000` onda H2) = **71 pendentes** + o hotfix `20261121090000` (efetivo fora do histórico) | `scripts/data/implantacao-sequencia.json`, `test-implantacao-cli` **[VERIFICADO]** |
| 134 remotas × nomes locais | versão e nome **idênticos** (hash do conjunto local equivalente = hash remoto; `test-implantacao-plano`) | **[VERIFICADO]** |
| P0 `record_risk_alert_action` | md5 do `prosrc` = `930f6d75898793479b418950b0053bd9` (igual com e sem CR) | SELECT **[VERIFICADO]** |
| Servidor | PostgreSQL 17.6, `pg_cron` 1.6.4 | SELECT **[VERIFICADO]** |

## 2. A tabela de histórico no catálogo remoto

`supabase_migrations.schema_migrations`, dono `postgres`, sem ACL explícita (só o dono):

| Coluna | Tipo | Nulo | Observação |
|---|---|---|---|
| `version` | text | não | **PRIMARY KEY** (única chave de comparação da CLI) |
| `statements` | text[] | sim | **5 das 134 linhas estão sem statements** (a CLI não depende disso) |
| `name` | text | sim | |
| `created_by` | text | sim | preenchido em 7 linhas, 1 valor distinto |
| `idempotency_key` | text | sim | UNIQUE; nulo em todas |
| `rollback` | text[] | sim | nulo em todas |

Permissões medidas com `has_table_privilege`: `postgres` e `supabase_admin` têm SELECT/INSERT/DELETE e USAGE/CREATE no schema; `supabase_read_only_user` só SELECT; **`anon`, `authenticated`, `authenticator`, `service_role`, `pgbouncer` e `dashboard_user` não têm nenhum acesso** **[VERIFICADO]**. Consequência: escrever no histórico (por `psql`, `migration repair` ou `db push`) exige a conexão do papel `postgres` (o mesmo que o MCP usa e dono de todos os jobs do `pg_cron`); a chave de serviço/PostgREST não serve. Qual papel a CLI usa ao conectar (senha do banco ou login temporário via `supabase link`) **[BLOQUEADO]**: confirmar na janela com `supabase migration list` (leitura) antes de qualquer escrita.

## 3. O que a documentação oficial diz (páginas lidas em 21/11/2026)

Fontes: `supabase.com/docs/reference/cli/supabase-db-push`, `-migration-repair`, `-migration-up`, `-migration-list`, `/introduction` e `/docs/guides/deployment/database-migrations`.

- **Arquivo**: `supabase/migrations/<timestamp>_nome.sql`; a **versão registrada é o timestamp do nome** (14 dígitos) e a comparação com o remoto usa **somente o timestamp** **[VERIFICADO]**.
- **`db push`**: aplica os arquivos locais que **não estão** na tabela de histórico, em ordem de timestamp; **após cada migration aplicada com sucesso grava a linha**; flags: `--dry-run` (imprime o que seria aplicado), `--include-all` (inclui todas as não encontradas no histórico), `--include-roles`, `--include-seed`, `--skip-vault`, `--yes`. **Não existe `--target`, versão-alvo nem exclusão de arquivo** **[VERIFICADO]**. O help da CLI instalada (2.114.0) mostra `--db-url/--linked/--local`; a documentação atual (v3) usa `--remote[=ref|url]` e marca os antigos como obsoletos (removidos na v4): **conferir a versão da CLI na janela** **[VERIFICADO]**.
- **`migration up`**: `--include-all` e nenhuma versão-alvo **[VERIFICADO]**.
- **`migration repair`**: `--status applied` **insere** uma linha por versão; `--status reverted` **apaga** a linha; **não executa nem desfaz SQL**; no remoto pede confirmação (padrão Não; `--yes` para script). É a forma oficial de escrever no histórico **[VERIFICADO]**.
- **`migration list`**: colunas Local e Remote; só timestamps comparados; versão num lado só = divergência **[VERIFICADO]**.
- **`--workdir <dir>`** (global): diretório que contém `supabase/`, usado exatamente como dado **[VERIFICADO]**. É o mecanismo para limitar uma execução a uma pasta por onda.
- **Erro de fora de ordem** ("Found local migration files to be inserted before the last migration on remote database", com a instrução de usar `--include-all`) e **erro de versão remota sem arquivo local** ("Remote migration versions not found in local migrations directory", orientando `migration repair`): **[INFERIDO]** do comportamento conhecido da CLI; as páginas lidas não reproduzem as mensagens. Validar com `supabase db push --dry-run` (somente leitura) na janela.
- Se a CLI envolve cada arquivo e o registro numa só transação: **[INFERIDO]**; as páginas não afirmam. Com `psql -1` (opção b) a atomicidade é garantida por nós.

## 4. Resposta por etapa

**(i) Hotfix `20261121090000` fora do histórico.** `db push` direto o trataria como pendente e o **reaplicaria** (já está efetivo; corpo protegido md5 `930f6d75...`): no ensaio, os pendentes da CLI-like são 71 e incluem o hotfix. Comando oficial: `supabase migration repair --status applied 20261121090000` (com o alvo remoto): **só insere** a linha; o ensaio local confirma que o corpo (P0) permanece idêntico. Reversível: `--status reverted` apaga exatamente essa linha (ensaiado). **Quando**: depois da onda B. `test-implantacao-cli` prova que registrar o hotfix **antes** de B tornaria as 12 migrations `20261120*` "fora de ordem" (versão menor que `20261121090000`).

**(ii) Três fora de ordem (`20261107090000`, `20261116090000`, `20261118140000`).** Versão menor que `20261119034721`: a CLI recusa sem `--include-all` **[INFERIDO]**; com `--include-all` aplica **todos** os arquivos ausentes do histórico que estiverem na pasta, o que, com a pasta inteira, seriam os 71 (inclui hotfix e adiadas). Mitigação: pasta cumulativa por onda (item iii); então `--include-all` só alcança a onda A (3 arquivos). Risco de schema: baixo (A-bis só avisa se houver duplicidade de regra de SLA ativa). `test-implantacao-cli` prova: A exige `--include-all` (3); B a L nenhuma.

**(iii) Demais ondas.** `db push` **não permite limitar** (sem alvo/exclusão). Alternativas que funcionam: (1) **pasta `supabase/migrations` cumulativa por onda** (`--workdir`): 134 registradas + ondas já aplicadas (+ hotfix depois de B) + a onda; os pendentes são exatamente a onda e não há versão remota sem arquivo local. Montagem: `node scripts/implantacao-cli-workdir.mjs --listar` e `--onda B --out <pasta fora do repositório>` (só copia arquivos locais). (2) `psql -1` por arquivo com o insert na mesma transação (plano `12`, seção 2). Limitações da CLI frente ao plano `12`: **sem `lock_timeout`/`statement_timeout` por arquivo e sem verificação P0 entre os arquivos de uma onda**; uma falha no meio deixa os anteriores já aplicados e registrados. Para ondas de 1 arquivo é irrelevante; para B, D, H1, K (8 a 12 arquivos) é perda de controle relevante.

**(iv) Não podem ir pela CLI no caminho normal.** `20261121177000` (decisão do Dono, SLA) e `20261123302000` (só com o app que chama as RPCs de `301000`): ficam entre versões já registradas, logo seriam **fora de ordem** (exigem `--include-all`) e, se a pasta as contiver, seriam aplicadas junto das demais. Como segurar: a pasta cumulativa as exclui até o seu próprio passo; `--dry-run` antes de cada push confere que a lista é exatamente a onda. Quando liberadas: pasta com o histórico + só aquele arquivo e `--include-all` (prova em `test-implantacao-cli`: E:1, H2:1).

**(v) Opção (b): `insert` direto.** Compatível: `version` (PK) e `name` bastam (demais colunas anuláveis; 5 linhas já existem sem `statements`); a CLI só compara `version`, então `migration list` e `db push --dry-run` futuros enxergam tudo sincronizado. Exige o papel `postgres` (seção 2). Risco: erro de digitação cria registro órfão (mitigado pelo insert na mesma transação e pela conferência de hash). Diferença para a CLI: a linha não traz `statements` (inofensivo).

## 5. Comparação objetiva

| Critério | (a) versões do conector | (b) insert com versão do arquivo (`psql -1`) | CLI oficial (`db push` + `repair`) |
|---|---|---|---|
| Escreve no histórico | sim (conector) | sim (insert) | sim (CLI) |
| Versão registrada | hora da aplicação (diverge do arquivo) | versão do arquivo | versão do arquivo |
| Atomicidade arquivo + registro | do conector | **garantida** (`-1`) | [INFERIDO] por migration |
| `lock_timeout` 5 s e `statement_timeout` por arquivo | não | **sim** | não definidos pela CLI (só via opções de conexão, a validar) |
| P0 e verificação entre arquivos da onda | só se o operador intercalar | **sim, por arquivo** | **não** dentro do `push` |
| Falha no meio da onda | para | para; anteriores íntegros e registrados | para; anteriores já registrados |
| Conter hotfix e adiadas | manual | manual | **só com pasta cumulativa** (`--workdir`) |
| Fora de ordem | n/a | irrelevante | `--include-all` na onda A |
| `migration list` e `db push --dry-run` depois | divergem | sincronizados | sincronizados |
| Reversibilidade do registro | renomear/apagar | `delete` por linha | `repair --status reverted` |
| Política atual (`test-implantacao-plano` proíbe `db push`, `migration up` e `apply_migration` em scripts versionados) | cumpre | cumpre | exigiria exceção |
| Esforço | menor no dia, maior depois | médio (comandos prontos em `12`) | médio + pasta por onda |

## 6. Recomendação

**Híbrido, com a aplicação por (b)**: cada arquivo por `psql -1` + `insert` atômico (plano `12`), pois é a única via com `lock_timeout` por arquivo, P0 após **cada** arquivo e parada limpa; a CLI oficial entra **somente para leitura de conferência**: `supabase migration list` (Local = Remote depois de cada onda) e `supabase db push --dry-run --skip-vault` na pasta cumulativa da onda seguinte (deve listar exatamente a onda; ao final, nada pendente). O hotfix entra por `supabase migration repair --status applied 20261121090000` (oficial, pede confirmação) **ou** pelo insert de `12`: equivalentes (só inserem a linha). Se o Dono preferir a CLI para escrever: pasta cumulativa por onda, `--include-all` só na A, P0 por onda (não por arquivo) e aceitar a perda de `lock_timeout` por arquivo. Em qualquer caso: backup do histórico antes da janela (`12`, 1.3) e hash conferido depois de cada onda.

Ensaio (Postgres 17 local descartável, `scripts/ensaio-implantacao-ondas-realpg.mjs`): histórico espelho com as mesmas colunas e 134 linhas com hash igual ao remoto; 71 pendentes por versão (3 fora de ordem); ondas aplicadas em ordem com registro na mesma transação e P0 após cada arquivo; `repair applied` do hotfix só insere (P0 idêntico) e `reverted` remove exatamente 1 linha; histórico final = os 205 arquivos (hash). Contagem de verificações: ver a última execução do ensaio (seção 9), 0 falhas (LF e CRLF).

## 7. Onda M (H6e, TENANT_ADMIN) - INCLUÍDA na sequência

`20261211100000_tenant_admin_global_external_data` está no JSON como onda **M**, cauda depois da L: depende de `acc_external_assert_global_admin`/`acc_external_org_visible` (criadas em `20261203100000`/`20261203110000`, redefinidas em `20261209101000`); não toca `record_risk_alert_action` (P0 conferido após o arquivo no ensaio). `verificacao-onda-m.sql` gerado; rollback em `supabase/rollbacks/`; linhas em `01` e `03`. O primeiro TENANT_ADMIN é concedido por SQL de manutenção (`docs/permissoes-matriz-central.md`), ato à parte, depois da onda e com aprovação do Dono: sem ele as alterações globais ficam bloqueadas (fail-closed). Passo na pasta cumulativa: `node scripts/implantacao-cli-workdir.mjs --onda M --out <pasta fora do repositório>`.

## 8. O que não está provado

Papel e conexão que a CLI usaria no hospedado; mensagens exatas de fora de ordem e de versão remota sem arquivo; se a CLI envolve arquivo e registro numa transação; `lock_timeout` via opções do pooler; PITR e backups (painel). Nada foi executado contra o operacional.
