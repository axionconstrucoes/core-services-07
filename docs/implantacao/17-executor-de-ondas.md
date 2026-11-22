# 17 - Executor de ondas de migrations (Fase 2, frente A) - VALIDADO SOMENTE OFFLINE E EM POSTGRESQL LOCAL

Implementa a opção (b) de `11` e a seção 2 de `12`: cada arquivo de `supabase/migrations` e o `insert` em `supabase_migrations.schema_migrations` seguem em UMA chamada (uma transação implícita). Código: `scripts/implantacao/executor-ondas-lib.mjs` (lógica, sem I/O próprio) e `scripts/implantacao/executor-ondas.mjs` (CLI).

**Status de validação**: testes unitários (`scripts/test-executor-ondas.mjs`) e ensaio em PostgreSQL 17 local descartável (`scripts/test-executor-ondas-realpg.mjs`) aprovados. **Não foi executado contra a API de gerenciamento do Supabase**: o endpoint `POST /v1/projects/{ref}/database/query` e o comportamento transacional da chamada foram comprovados na homologação em 21-22/11 (ver `RETOMADA-FASE2`), mas este código ainda NÃO foi exercitado lá. Falta a validação em homologação (depende de autorização e do token em DPAPI).

## 1. O que cada chamada envia

```
set local lock_timeout = '5s';
set local statement_timeout = '120s';
<arquivo literal do disco>
;
insert into supabase_migrations.schema_migrations (version, name) values ('<versão>', '<nome>');
```

- Depois de CADA arquivo: chamada somente leitura confere P0 (`scripts/sql/p0-verificar-record-risk-alert-action.sql`) e a presença da linha. Depois de CADA onda: hash `md5(string_agg(version||'_'||name, ',' order by version))` do histórico contra o esperado.
- Para na primeira falha. Nunca usa a CLI nem a ferramenta de migration do conector.
- O hotfix `20261121090000` não é reaplicado: após a onda B só se registra a linha, com portão P0 (`P0_GATE`) na mesma transação.
- Arquivos recusados antes de enviar: `BEGIN/COMMIT/ROLLBACK`, `CONCURRENTLY`, `VACUUM`, `set/reset [local] lock_timeout|statement_timeout`, `set_config` desses parâmetros e qualquer escrita em `supabase_migrations`. Corpo > 1 MB também é recusado.
- Falha de SQL (SQLSTATE) = transação desfeita. Falha incerta (rede, 401, 5xx, tempo do cliente) = o executor confere o estado real e relata "registrado apesar do erro" ou "não registrado".

## 2. Alvos e guardas

| `--alvo` | Transporte | Guardas |
|---|---|---|
| `homolog` | API de gerenciamento (token PAT em arquivo DPAPI **fora do repositório**, `--segredo`) | ref fixo `gtadbeaevxglrqkhcwfz`; ambiente limpo |
| `operacional` | idem | exige `--producao` e a frase digitada `APLICAR <ref> <ondas>` em terminal interativo; nunca automatizar |
| `local` | `pg` direto | `HOMOLOG_DATABASE_URL`, ambiente limpo, `evaluateTarget`, só 127.0.0.1:55434 banco `acc_homolog_*`, marcador `acc_homolog_marker` |
| `pg` | `pg` direto (projeto de homologação isolado) | as mesmas, mais `HOMOLOG_TARGET_REF` e `HOMOLOG_I_UNDERSTAND_ISOLATED=true` (ver `scripts/homolog/guard.mjs`) |

Ambiente limpo = nenhuma variável de `forbiddenEnvNames` (service role, `NEXT_PUBLIC_SUPABASE_*`, Gmail, Anthropic, OpenAI, CRON_SECRET...). Mensagens, logs e erros passam por `redigir` (token, Bearer, JWT, senha de URL). O log (`--log`) deve ficar fora do repositório.

## 3. Uso

```
# offline: plano e sha256, sem token nem rede
node scripts/implantacao/executor-ondas.mjs --dry-run --todas
node scripts/implantacao/executor-ondas.mjs --dry-run --ondas A,B

# PostgreSQL local descartável (shell com HOMOLOG_DATABASE_URL e ACC_REALPG_PKG_DIR)
node scripts/implantacao/executor-ondas.mjs --alvo local --verificar
node scripts/implantacao/executor-ondas.mjs --alvo local --ondas A --log D:\logs\exec.log

# homologação (depende de autorização; token DPAPI criado pelo responsável com salvar-segredo.ps1)
node scripts/implantacao/executor-ondas.mjs --alvo homolog --verificar --segredo <arquivo.dpapi>
node scripts/implantacao/executor-ondas.mjs --alvo homolog --ensaio-homolog --segredo <arquivo.dpapi>
node scripts/implantacao/executor-ondas.mjs --alvo homolog --ondas A,B --segredo <arquivo.dpapi> --log <fora do repo>
```

Seleção: `--ondas A,B` (contígua na ordem de `scripts/data/implantacao-sequencia.json`; as anteriores precisam estar registradas), `--todas` ou `--adiada E|H2`. `--retomar` só continua um PREFIXO já registrado de uma execução interrompida. Saída: 0 sucesso, 1 parou por falha/P0 divergente, 2 recusado por guarda ou argumento.

## 4. Testes

- `node scripts/test-executor-ondas.mjs` (offline; roda no `npm run test:scripts`).
- `node scripts/test-executor-ondas-realpg.mjs` (precisa de `ACC_REALPG_URL`/`ACC_REALPG_PKG_DIR` do `postgres17-local-setup.ps1 -Action Env`; sem eles é PULADO; cria e apaga um banco `acc_homolog_exec_*`). Cobre atomicidade, falha no meio, `lock_timeout` real (55P03), PK duplicada, portão P0 do hotfix, retomada, ensaio de atomicidade e a CLI.

## 5. Limites conhecidos

- O portão P0 completo (corpo `930f6d75...`) só é exercitado de ponta a ponta com o espelho do `scripts/ensaio-implantacao-ondas-realpg.mjs`; no teste do executor o P0 é um stub e o portão do hotfix é testado só no caso de recusa.
- A API de gerenciamento não publica limite de corpo; adotou-se 1 MB (maior migration: ~65 KB).
