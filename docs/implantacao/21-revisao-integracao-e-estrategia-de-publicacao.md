# 21 - Revisão final da integração e estratégia de push, PR, CI e deploy

Status: proposta para aprovação do Dono. **Nada foi enviado ao GitHub**: nenhum push, PR, merge ou deploy foi executado. Base: `main` = `27da839` (igual a `origin/main`); integração: `integration/acc-noturna`.

## 1. O que a integração contém (diff contra a `main`)
| Medida | Valor |
|---|---|
| `main` é ancestral da integração (merge *fast-forward* possível) | sim |
| Commits à frente | 364 (84 merges, 280 sem merge) |
| Arquivos alterados | 1.203 (+142.187 / -4.008 linhas) |
| `apps/web` | 592 arquivos |
| `scripts` (testes e ferramentas) | 325 |
| `docs` | 133 |
| `supabase/migrations` | 76 (**69 novas**, 7 renomeações) |
| `supabase/rollbacks` | 71 |
| `.github/workflows` | 3 (ver seção 3) |
| `packages` | 0 |
| Binários novos (imagens de evidência) | 34 |

### 1.1 Migrations: o ponto mais sensível
- **Nenhum conteúdo de migration da `main` foi alterado**: 0 blobs da `main` ausentes na integração; só 69 arquivos novos.
- As 7 mudanças em arquivos existentes são **renomeações puras (R100)**, para alinhar a versão do arquivo com o histórico real do banco (`axia_chat_budget`, `sla_configuration_audit_system_actor`, três de SSMA/ESG, `copy_project_team`, `scheduler_pg_cron_dispatch`). O teste de invariantes (59 de `test-pilot-risk-alert-actions`) exige conteúdo idêntico e as aprova uma a uma.
- A migration nova `20261212100000_watchdog_project_resolution.sql` foi registrada no teste de invariantes como **exceção auditada** (autorizada em 22/11/2026), porque altera uma função protegida do agendador.

## 2. Mapa de revisão por área (para o PR)
O histórico está organizado em merges por frente, o que permite revisar por assunto. Ordem sugerida de revisão, do risco maior para o menor:
1. **`supabase/migrations` (69 novas) e `supabase/rollbacks`**: revisão por onda (A a N) usando `scripts/data/implantacao-sequencia.json` e `docs/implantacao/01` e `07`. Cada onda tem verificação (`scripts/sql/verificacao-onda-*.sql`) e rollback.
2. **Funções protegidas**: `record_risk_alert_action` (P0, corpo `930f6d75...`), permissões (`acc_project_tier`), agendador. Conferir que nenhuma onda redefine o P0 (o portão P0 da sequência o confere).
3. **`apps/web`**: Server Actions e RPCs de escrita (Qualidade, Seguros/Garantias, Competências: bloqueados pela trava), autorização, e-mail (guarda de saída do piloto), AXIA, sidebar, TopBar.
4. **Workflows** (seção 3).
5. **`scripts`/`docs`**: testes e documentação; revisar por amostragem, a CI cobre a execução.

## 3. Workflows do GitHub: efeito após o merge
Os três workflows alterados rodam na `main`; dois são agendados e usam segredos de produção:
- `ci-pr-checks.yml`: torna **obrigatórios** `test:alert-sim` e `test:alerts` (antes eram opcionais enquanto não existissem).
- `gmail-delegated-sync.yml`: **novo passo** "Anexos da caixa por delegação" (`scripts/gmail-ata-ingestion-worker.mjs`) com `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY`, e repasse das variáveis `ACC_EMAIL_*` das respostas por e-mail.
- `weekly-schedule-email-ingestion.yml`: repasse das mesmas variáveis `ACC_EMAIL_*`.
**Consequência:** ao reabilitar os workflows na fase 7 do doc 19, a sincronização agendada passa a executar o worker de anexos/atas e a fase de respostas por e-mail em produção. **Decisão do Dono (D5, aprovada em 22/11/2026):** o passo novo fica **desligado por padrão**, atrás da variável do repositório `ACC_DELEGATED_ATTACHMENTS_ENABLED == 'true'` (travado por `test-workflow-gates`); o restante do `gmail-delegated-sync` segue como estava. As variáveis `vars.ACC_EMAIL_*` repassadas ao worker devem ser definidas **idênticas** às da Vercel; sem definir, os padrões são seguros (desligado).

**Efeito colateral a conhecer:** o script `gmail-ata-ingestion-worker.mjs` (usado também pelo `gmail-inbound-sync`, que já roda em produção) mudou: o modo padrão continua o histórico `OAUTH_USUARIO`, mas as consultas ganharam o filtro `mailbox_address` (isolamento por caixa). Com uma única caixa o resultado é o mesmo; é uma mudança só mais restritiva, e o workflow antigo não passa a usar delegação.

## 4. CI: o que a CI verifica e o que já foi medido localmente
A CI (`ci-pr-checks.yml`, em `pull_request` para a `main`, Ubuntu, sem segredos) roda: guardas (segredos, `.env`, migrations duplicadas), typecheck, lint, unitários, `test:scripts`, `test:email`, `test:sql`, `test:ssma` (Chrome real; qualquer PULADO reprova), `test:alert-sim`, `test:alerts` e o build. Timeouts: 30 min (checks) e 20 min (build).
Equivalente local medido na integração (Windows; **a CI nunca rodou sobre esta integração**):
| Etapa | Resultado local |
|---|---|
| typecheck / lint / build / unitários | 0 erros / 0 erros (14 avisos antigos) / ok / 21 de 21 |
| `test:scripts` | 172 de 172 (cerca de 9 min). Uma falha de **relógio** foi corrigida no teste `test-f5-e-governanca-realpg` (usava "ontem" em UTC; o PostgreSQL local usa BRT e, entre 00:00 e 03:00 UTC, "ontem" ainda era "hoje" no banco). O banco do Supabase usa UTC, então produção não era afetada |
| `test:sql` (replay completo das migrations) | 712 OK, 0 falhas, cerca de 170 s |
| `test:ssma` (Chrome) | 186 OK, 0 falhas, 0 PULADO |
| `test:alert-sim` | 62 OK, 0 falhas |
| `test:alerts` | 519 OK, 0 falhas (depois de registrar a exceção auditada do watchdog; antes, 1 falha na invariante 59, **que a CI teria acusado**) |
| `test:email` | **753 OK, 0 falhas** quando o `bash` é o do Git (como em Linux). Pelo PowerShell, `test-pilot-single-alert` ("propagação REAL workflow -> rota -> motor") falha com saída vazia; a causa dessa diferença **não foi provada**, e a CI roda em Linux |
| Ensaio de ondas em PostgreSQL 17 local (P0 em cada migration) | 413 OK, 0 falhas |
**Resultado da CI real (GitHub Actions, Linux), PR #245:**
| Execução | Commit | Resultado |
|---|---|---|
| #210 | `e701379` | **falhou** em 3m32s: `test-aceitacao-roteiro` exigia CRLF na lista de testes; os passos seguintes não chegaram a rodar |
| #212 | `b452a25` | **sucesso** (todos os jobs e passos; checks 5m33s, SQL 1m55s, SSMA com Chrome real 23s): commit com as sete frentes do go-live acelerado integradas, 401 commits |
| #211 | `c1b57f4` | **sucesso** em 7m43s: Guards, Typecheck/lint/testes e Build verdes; typecheck 24 s, lint 26 s, `test:scripts` 1m31s, e-mail 15 s, SQL (replay completo) 1m43s, SSMA com Chrome real 23 s, simulação WEG 3 s, alertas 10 s |
Correções feitas entre as duas execuções, sem remover nem enfraquecer testes: (1) a lista de testes aceita LF ou CRLF e rejeita fim de linha misto; (2) `test-n1-no-regression-after-hotfix-sql` compara os hashes do corpo do P0 **sem CRs** (equivalência provada: 90bc6965.../c2f015a9... com CRLF <=> 283621c1.../930f6d75... sem CR; o 930f6d75 é o hash P0 de produção); (3) o guard de segredos deixou de ter falso positivo nas fixtures. Além disso, uma execução equivalente à CI em checkout LF local antecipou a falha de hash (2) antes de uma segunda rodada na CI real.

**Risco restante da CI (anterior à execução #211, mantido por histórico):** somados, os tempos locais (cerca de 9 + 3 + 1 + testes unitários e build) ficam dentro dos 30 minutos, mas a CI nunca foi exercida em Linux sobre 1.203 arquivos. O primeiro PR é o teste. Plano: abrir o PR **sem pedir merge**, corrigir o que a CI acusar na própria branch, e só então marcar como pronto.

## 5. Estratégia de push, PR e deploy (proposta)
1. **Push da branch de integração** (autorização D6): gera um **preview** na Vercel. Os previews **não têm credenciais do Supabase** (as variáveis estão só no alvo `production`), então não alcançam a produção; o preview servirá de teste de build.
2. **PR para a `main`, com `merge commit` ou *fast-forward*** (não *squash*: 364 commits em merges por frente preservam a rastreabilidade, e o revert por frente continua possível). Revisão por área (seção 2). Proteção de branch: **não foi possível verificar** (sem acesso à API do GitHub nesta sessão); o Dono deve confirmar se há revisão obrigatória.
3. **CI verde no PR e aceitação em homologação aprovada (doc 20)** antes da janela.
4. **O merge só acontece dentro da janela, depois do banco** (doc 19, seção 5): o merge na `main` dispara deploy de produção automático.
5. **Rollback do app**: `request_rollback` para o deployment anterior (commit `27da839`).
6. **Sem push forçado, sem reescrever histórico.** Backups da branch antes do merge: tag/branch de segurança local (`backup/noturna-pre-fase2-integracao`) e o bundle de 22/11.

## 6. Pendências de higiene antes do PR
- Resolver o `test-pilot-single-alert` na CI Linux (confirmar que passa).
- Reconferir `git status` limpo e que `.claude/settings.json` (não versionado, na `main`) não entra no PR.
- Os agentes de AXIA, TopBar e aceitação ainda entregam commits em branches próprias (`feat/f4-*`); integrar após revisão.
- Rótulos `[DEV]` do projeto WEG em produção (nome "[DEV] WEG - Fábrica de Fios - Linhares", cliente "Cliente Fictício DEV"): correção de dado é decisão do Dono, não é migration.
