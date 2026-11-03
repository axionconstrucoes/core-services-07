# Stack local completa e descartável (Auth + PostgREST + Storage)

Serve para fechar os testes que o container só-Postgres (`supabase_db_acc-disposable-test-e2`) não alcança. **Nunca** copia dados nem
segredos de produção; usa chaves demo locais da própria stack, projeto `acc-disposable-*`, portas 57xxx e volumes próprios
(nada dos ambientes existentes é alterado).

## Subir e derrubar (preservando os volumes)
```
node scripts/sql/start-clean-local-stack.mjs up   --name acc-disposable-full --port 57320 --workdir <pasta nova e vazia>
node scripts/sql/start-clean-local-stack.mjs down --name acc-disposable-full --workdir <pasta>   # ATENÇÃO: usa --no-backup e APAGA os volumes
node_modules/.bin/supabase stop --workdir <pasta>                                                   # só para; preserva os volumes para retomar
```
API em `http://127.0.0.1:57321`, banco em `127.0.0.1:57322`, container `supabase_db_acc-disposable-full`. O Docker publica as portas em
todas as interfaces (limitação do `supabase start`); use só em máquina de desenvolvimento.

## Runners que dependem da stack
| Runner | Variáveis |
|---|---|
| `run-email-authorization-test`, `run-trash-admin-authorization-test`, `run-trash-proposal-link-and-dedup-test`, `run-schedule-delay-pipeline-e2e-test` | `ACC_<PREFIXO>_TEST_API_URL`, `…_DB_CONTAINER`, `…_I_UNDERSTAND_THIS_IS_DISPOSABLE=true` |
| `run-contractual-link-concurrency-test` | URL do banco + container; exige o usuário `auth-login-test@axion-test.local` criado pela **API Auth** (`POST /auth/v1/admin/users` com a chave de serviço local) |
| `run-clean-stack-auth-storage-check` | `ACC_CLEAN_STACK_WORKDIR`, `…_DB_CONTAINER`, `…_I_UNDERSTAND_THIS_IS_DISPOSABLE=true` |
| `run-ssma-photo-discard-storage-test` | `ACC_SSMA_DISCARD_TEST_{WORKDIR,API_URL,DB_CONTAINER,I_UNDERSTAND_THIS_IS_DISPOSABLE}`; `storage.protect_delete` permanece ativo |
| `run-ssma-photo-discard-http-test` | `ACC_SSMA_HTTP_TEST_{WORKDIR,API_URL,DB_CONTAINER,BASE_URL,FAIL_BASE_URL,I_UNDERSTAND_THIS_IS_DISPOSABLE}`; HTTP real na rota `/api/ssma/photos/discard` em dois `next start` isolados da mesma build (`BASE_URL` normal; `FAIL_BASE_URL` com `SUPABASE_SECRET_KEY` inválida para provar que falha do Storage vira 502) |
| `run-whatsapp-escalation-cycle-test` | `ACC_WA_CYCLE_TEST_{WORKDIR,API_URL,DB_CONTAINER,I_UNDERSTAND_THIS_IS_DISPOSABLE}`; ciclo real, e-mail falso, WhatsApp simulado |

Todos recusam container fora de `supabase_db_acc-disposable-*` e API fora de `127.0.0.1`/`localhost` (portas 54300–54399 também são recusadas).

## Observações
- `audit_log_entries` é imutável (gatilho) e referencia o projeto com FK RESTRICT: projetos/usuários fictícios que geraram auditoria
  (ex.: o ciclo de alertas) **não são removidos**; ficam na stack descartável e somem quando ela é derrubada.
- WhatsApp continua **desativado por padrão** em qualquer ambiente (`ACC_WHATSAPP_ENABLED` ausente/`false`); só o provedor simulado existe.
- Login no app é só Google OAuth; para teste no navegador usa-se um usuário local criado pela API Auth e o cookie de sessão
  `sb-127-auth-token` (formato `base64-` + JSON da sessão) injetado no `localhost` de um servidor `next start` isolado, construído de uma
  cópia **sem arquivos `.env`**.
- Proteção de origem da rota de descarte: o cookie de sessão é SameSite=Lax (padrão do @supabase/ssr), o proxy exige sessão e a rota recusa com 403 `Origin`/`Sec-Fetch-Site` de outro site (`apps/web/lib/http/same-origin.ts`). Server Actions já têm a checagem de origem do próprio Next; Route Handlers não.
