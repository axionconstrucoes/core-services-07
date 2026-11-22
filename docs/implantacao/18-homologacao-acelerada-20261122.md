# 18 - Homologação acelerada no acc-homolog (22/11/2026)

Escopo autorizado: somente o projeto `acc-homolog` (ref `gtadbeaevxglrqkhcwfz`). Nada em produção; sem push, merge, deploy, e-mail real ou desligamento da Data API. Toda operação passou pela guarda do kit (`scripts/homolog/guard.mjs`: ref fora da lista operacional, `HOMOLOG_TARGET_REF`, marcador `acc_homolog_marker`, ambiente limpo).

Evidências (logs e baseline): `C:\VIBE\PROJETOS\axion-backups\fase2\homolog-evidencias-20261122\` (fora do repositório).

## Ferramentas novas (scripts/homolog)
- `executar-sql-guardado.mjs`: executa UM `.sql` de `docs/implantacao/**` pela guarda, opcionalmente em transação, com `--esperar-erro` para testes que terminam em erro proposital.
- `validar-jwt-real.mjs`: Auth, RLS, JWT, gravações diretas, RPC e Storage pela API real (GoTrue + PostgREST + Storage), fases `antes`, `congelado` e `depois`. Usa só a chave **publicável** e JWTs de usuários temporários; chamadas HTTP via `curl.exe` (o `fetch` do Node desta máquina não alcança o host da API). Nunca imprime chave nem token.
- `executar-homolog.ps1`: novas etapas `sql`, `executor` (executor de ondas com `--alvo pg`) e `jwt`.

## Resultados
| # | Ensaio | Resultado |
|---|---|---|
| 1 | Teste transacional das 35 RPCs travadas (`3-teste-homolog-transacional.sql`) | 280/280 recusas 42501, fora do esperado `[]`, matriz inalterada, 6/6 liberadas. Reversão completa: fingerprints idênticos ao baseline. |
| 2 | Congelamento: pausar 11 jobs, aplicar, verificar, validar pela API, descongelar Storage, reverter, retomar | 11 jobs pausados (0 ativos, 0 em execução, 0 execuções na janela de 74 s); 219/219 tabelas com gatilho-guarda; 0 tabelas/views com escrita para anon/authenticated; 3 políticas de Storage. Reversão: 0 gatilhos, 0 políticas de janela, tabelas auxiliares removidas, 11 jobs ativos de novo. Todos os fingerprints iguais ao baseline. |
| 3 | Executor de ondas (`--alvo pg`): `--verificar` e `--ensaio-homolog` | P0 ok (`930f6d75...`), 205 linhas, hash `294f59dd...`; 4 ensaios OK (falha no último comando, falha em bloco DO, estouro de statement_timeout, sucesso compensado); histórico final igual ao inicial. |
| 4 | Watchdog | Causa: `acc_scheduler_watchdog()` grava incidentes no `project_id` fixo `00000000-0000-4000-8000-000000000001` (a obra WEG em produção), que não existe no homolog; 12 falhas por FK em 1 h. Correção só no homolog: linha sentinela sintética `HOMOLOG-SENTINELA` (status SUSPENSO). Reversão: `delete from public.projects where id='00000000-0000-4000-8000-000000000001'` (cascata nos incidentes). Resultado: 0 falhas; 9 incidentes `NO_RECENT_SUCCESS` abertos e sem notificação, esperados porque o homolog não tem segredos no Vault. |
| 5 | Auth/RLS/JWT/gravações reais (API do Supabase) | antes 21 OK/0 FAIL; congelado 21 OK/0 FAIL; depois 21 OK/0 FAIL. |

## Observações e achados
- **Defesa em profundidade:** com o congelamento ativo a gravação direta é recusada primeiro pelo `REVOKE` (42501 `permission denied for table`); a RPC `SECURITY DEFINER` (que escapa de GRANT/RLS) é recusada pelo gatilho com `ACC_JANELA_CONGELAMENTO`. As duas camadas foram observadas.
- **Código de projeto fixo no watchdog** é uma fragilidade de código (migration `20261119034721`): qualquer ambiente sem esse projeto falha. Não corrigido em produção nem no código (fora do escopo autorizado); registrado como pendência.
- **`Prefer: tx=rollback` não é honrado** pelo PostgREST do projeto: a primeira chamada de RPC de escrita gravou a `RNC-0002 [JWT-TESTE]`. As sondas seguintes passaram a usar payload inválido (título vazio, falha no CHECK 23514), que não grava.
- **Resíduos no homolog (trilha de auditoria imutável):** `RNC-0002 [JWT-TESTE] RNC`, 2 usuários `jwt-teste-membro@` e `jwt-teste-sem-vinculo@` (sem vínculo e sem senha conhecida) e linhas em `audit_log_entries`. Não puderam ser apagados porque `audit_log_entries.actor_user_id` referencia o perfil.
- **Não executado:** `service_role` pela API real (a chave secreta guardada tem formato que o Auth recusou; o valor não foi inspecionado); upload ao Storage com caminho válido por membro (o caminho de teste foi recusado por RLS antes e depois, então o efeito do congelamento no Storage foi observado, mas sem contraste); Data API desligada (proibido neste ciclo); modo `--alvo homolog` do executor (exige token PAT em DPAPI, que não existe).
- Rede: o `fetch` do Node falha para `*.supabase.co` nesta máquina (ECONNRESET/CONNECT_TIMEOUT) enquanto `curl` e a conexão direta ao banco funcionam.
