# 11 - Registro no histórico de migrations: opções (a) e (b) comparadas (DECISÃO DO DONO; nada foi escolhido nem executado)

Origem: `02-plano-aplicacao.md`, seção 5, item 3: "(a) manter as versões do conector e usar `01-inventario-migrations.md` como tabela de correspondência; (b) alinhar com `update ... set version = '<versão do arquivo>' where name = '<nome>'`, migration a migration, em transação, com conferência antes e depois". Esta análise não escolhe: compara e recomenda.

## 1. Fatos medidos em 21/11/2026 que mudam o enunciado

1. Os 134 registros remotos têm versão e nome IDÊNTICOS aos 134 arquivos locais (hash `70a176da74c9f88ac06b04d80bc55891`). As divergências históricas (`axia_chat_budget`, `sla_configuration_audit_system_actor`) já foram resolvidas RENOMEANDO o arquivo local para a versão registrada pelo conector (`20261105173838_...`, `20261106195625_...`). Portanto, hoje não há nenhuma linha a "alinhar com `update`" entre as 134.
2. A decisão real passa a ser sobre as 65 pendentes + o hotfix `20261121090000` (aplicado fora do histórico) = 66 registros a produzir DEPOIS de aplicar: com que versão cada um entra em `supabase_migrations.schema_migrations`.
3. O plano de aplicação usa `psql` (um arquivo por transação). O `psql` NÃO escreve em `schema_migrations`; quem aplica pelo conector (`apply_migration`) tem a versão atribuída pela hora da aplicação (mesmo nome). O teste `test-implantacao-plano` proíbe `db push`, `apply_migration` e `migration up` em scripts versionados.
4. Três pendentes (`20261107090000`, `20261116090000`, `20261118140000`) têm versão MENOR que a última remota (`20261119034721`).

## 2. As duas opções, na forma atual

(a) VERSÃO DO REGISTRO = o que o conector/instante da aplicação atribuir; o repositório é conciliado depois, por tabela de correspondência (inventário `01`) e, se desejado, renomeando os arquivos (precedente: as duas renomeações já feitas).
(b) VERSÃO DO REGISTRO = a versão do ARQUIVO: após cada migration, `insert into supabase_migrations.schema_migrations (version, name) values ('<versão do arquivo>', '<nome>')` na MESMA transação do arquivo (`psql -1 -f arquivo -c "insert ..."`), e a linha do hotfix só inserida (sem reaplicar).

## 3. Comparação objetiva

| Critério | (a) manter versões do conector | (b) registrar com a versão do arquivo |
|---|---|---|
| Efeito no schema | nenhum | nenhum (só a tabela de histórico) |
| Como o registro é produzido | `apply_migration` (versão = hora) ou `psql` + insert com versão livre | `psql -1` + `insert` com a versão do arquivo, atômico com a migration |
| Coerência com o repositório | versões divergem dos nomes de arquivo até renomear 65 arquivos (churn em inventário, sequência JSON, rollbacks, `03`, 07/08/09, testes que usam stem) | versão do arquivo = registro, como já ocorre nas 134 (convenção vigente) |
| Hash de histórico do teste `test-implantacao-plano` | passa a divergir do conjunto local até renomear; o teste precisa de nova tabela de equivalência | continua válido (basta recalcular o hash esperado após cada onda) |
| `supabase migration list` / `db push --include-all` / `db pull` | enxerga arquivos locais "sem par remoto" e registros remotos "sem par local" enquanto houver divergência; um `db push` desavisado reaplicaria migrations (já proibido neste projeto, mas o risco de acidente permanece) | enxerga tudo sincronizado; as 3 fora de ordem ficam registradas, logo o CLI não exige `--include-all` |
| Detecção de deriva | por nome + inspeção de objetos (manual) | por versão e nome (automática no hash) |
| Risco de erro humano | baixo por registro, mas alto no conjunto: 65 mapeamentos manuais e renomeações | médio por registro (digitar versão/nome): mitigado por inserir na mesma transação e conferir `md5(string_agg(version\|\|'_'\|\|name))` contra o inventário |
| Reversibilidade | renomear de volta; registro pode ser apagado | `delete from supabase_migrations.schema_migrations where version = ...` por linha (backup da tabela antes); rollback da migration continua separado |
| Permissão necessária | conector (padrão) | escrita em `supabase_migrations.schema_migrations` com a conexão de manutenção (papel do banco; confirmar na janela) |
| Efeito nas 3 fora de ordem | nenhum problema se o conector atribuir versão nova; mas elas deixam de ter correspondência por versão | registradas com versão menor que a máxima: inofensivo para o schema; o CLI aceita quando já estão registradas |
| Hotfix `20261121090000` | linha com versão nova ou nenhuma, mantendo "efetivo fora do histórico" | linha `20261121090000 / hotfix_risk_alert_action_authorization` (sem reaplicar) |
| Esforço | menor no dia, maior depois (reconciliar) | maior no dia (66 inserts conferidos), zero depois |

## 4. Riscos principais

(a): deriva permanente entre repositório e histórico; um operador que rode `supabase db push` ou `migration repair` pela CLI pode tentar reaplicar ou "reparar" na direção errada; o teste de hash precisa de exceção; renomeação posterior dos arquivos mexe em nomes citados por vários documentos e testes (risco de quebrar `test-implantacao-*`, N1 e o ensaio silenciosamente).

(b): erro de digitação em versão/nome cria registro órfão que faz a CLI achar que falta uma migration; inserir uma linha ANTES de a migration realmente concluir mascararia falha (mitigado por inserir na mesma transação); o ensaio local não exercita a tabela de histórico do projeto hospedado (precisa de conferência na janela); escrita direta em tabela interna do Supabase exige a conexão de manutenção.

## 5. Recomendação (a decidir pelo dono)

Recomendação técnica: **(b), na forma atômica** (insert dentro da transação do `psql -1`), porque (1) preserva a convenção já em vigor nas 134 (versão do arquivo = versão registrada), (2) mantém verificável por hash o histórico e o teste de plano, (3) evita renomear 65 arquivos e as referências cruzadas, (4) deixa a CLI do Supabase coerente, (5) não depende do conector. Condição: backup da tabela de histórico antes da janela (`select * from supabase_migrations.schema_migrations` para arquivo fora do repositório) e conferência do hash após cada onda.

Quando (a) seria preferível: se o dono não quiser nenhuma escrita direta em `supabase_migrations` (política de "só o conector escreve"), ou se a aplicação for feita pelo conector por decisão operacional. Nesse caso, registrar a política de correspondência no inventário e renomear os arquivos APÓS a janela, em commit próprio com o ensaio e o `test-implantacao-plano` repetidos.

Não está decidido, não foi executado, e os comandos exatos de (b) estão no plano `12`, seção 3 (somente documentados).
