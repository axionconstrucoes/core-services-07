# 09 - Fase 5/F: reinventário definitivo, ensaio parametrizável e preparação de produção (PLANO; nada foi aplicado)

Data da leitura: 21/11/2026. Base: `7085834` (integration/acc-noturna). Supabase operacional (`plbcvwostmdmdmrziwmd`): somente `list_migrations`, `get_project` e SELECT. Nada foi aplicado, registrado ou alterado; o hotfix P0 NÃO foi reaplicado.

> Atualizado pela Fase 6/H4 (`10` a `13`): 200 arquivos e 65 pendentes (a onda K, Fase 5, já está na sequência).

## 1. Reinventário definitivo local x remoto (por NOME e versão)

Leitura do remoto em 21/11/2026 (recomprovada do zero):

| Item | Valor |
|---|---|
| Registros em `supabase_migrations.schema_migrations` | 134 (inalterado desde 20/11) |
| Última versão remota | `20261119034721 scheduler_pg_cron_dispatch` |
| `md5(string_agg(version||'_'||name order by version))` | `70a176da74c9f88ac06b04d80bc55891` (igual ao do conjunto local registrado; prova de igualdade nome a nome) |
| Corpo de `record_risk_alert_action` (md5 sem CR) | `930f6d75898793479b418950b0053bd9` (protegido; igual ao hotfix) |
| Projeto | Postgres 17.6, sa-east-1, ACTIVE_HEALTHY |

Local: **192 arquivos** em `supabase/migrations` (inclui `20261124*` a `20261127*`; não há arquivo posterior a `20261127100000` neste commit; os blocos `20261201*` a `20261206*` das frentes A-E desta Fase 5 ainda não estão integrados).

| Estado | Qtde |
|---|--:|
| aplicada-registrada | 134 |
| aplicada-fora-do-historico (hotfix `20261121090000`) | 1 |
| pendente (sem efeito no remoto, sem registro) | 52 |
| pendente-fora-de-ordem | 3 |
| pendente-parcial (`20261121101000`) | 1 |
| pendente-decisao (`20261121177000`) | 1 |
| **Total de pendentes (todos os `pendente*`)** | **57** |
| **Total de arquivos** | **192** |

Conferência aritmética: 134 + 1 + 57 = 192. A contagem anterior ("36" no 02/05; "47" no 07) está superada: entraram a Fase 3 (`20261123*`, 10 arquivos incl. a 302000), a Fase 4 (`20261124*` a `20261127*`, 10 arquivos) e o bloco `20261122*`. Os 57 se distribuem na sequência ensaiada: 55 em ondas executáveis (A 3, B 12, C 2, D 12, F 1, G 5, H1 10, I 8, P0 1, J 1) + 2 adiadas (`20261121177000` por decisão do dono; `20261123302000` só junto com o app).

O teste `scripts/test-implantacao-plano.mjs` recalcula o hash do conjunto registrado a partir do inventário e exige uma linha por arquivo local; `scripts/test-implantacao-sequencia.mjs` exige que cada pendente esteja exatamente uma vez na sequência (migrations `>= 20261201` são tratadas pelo ensaio, seção 2).

## 2. Ensaio por ondas: parametrizável e com dados representativos

`scripts/ensaio-implantacao-ondas-realpg.mjs` (local-only; recusa qualquer host diferente de `127.0.0.1:55434`; cria e apaga bases `acc_f4c_*`).

O que mudou na Fase 5/F:
- `ACC_ENSAIO_MIGRATIONS_DIR=<pasta>` aponta outro diretório de migrations (ex.: a árvore de integração com as frentes A-E). Sem a variável usa `supabase/migrations`.
- Toda migration do diretório com versão posterior a `ultimaVersaoRemota` que NÃO conste em `scripts/data/implantacao-sequencia.json` entra automaticamente na onda **F5** (ordem numérica, depois da onda J). Para cada uma: aplicação em uma transação (`lock_timeout 5s`, `statement_timeout 120s`), verificação P0 depois dela, e uma checagem final de **idempotência** (reaplicar todas as da onda F5 sem erro, P0 intacto, dados representativos com o mesmo hash). Rodado com uma migration de teste `20261201000000` (arquivo temporário fora do repositório): onda F5 aplicada, P0 protegido, idempotência OK (127 verificações, 0 falhas, em LF e CRLF).
- Dados representativos (já existentes): 2 obras, 8 perfis, membros de vários papéis (inclui INATIVO e outra obra), regras de SLA como no remoto (6 linhas), 9 ações MÉDIO/BAIXO abertas com prazo atribuído + 3 concluídas + ALTO/CRÍTICO, 1 caso de alerta. Depois de TODAS as ondas, os hashes de ações, prazos das 9 abertas, casos, membros e regras são idênticos.
- Resultado atual sobre `supabase/migrations` (192 arquivos): **123 verificações, 0 falhas** em PostgreSQL 17.12 (relatório `08`). Tempo somado das migrations: 866 ms (LF) e 1003 ms (CRLF) em banco pequeno e vazio de contenção (ordem de grandeza; ver `08`).

Procedimento para a integração das frentes A-E (feito pelo dono da integração):
1. Copiar/mesclar as migrations `20261201*`..`20261206*` para `supabase/migrations`, cada uma com `supabase/rollbacks/<nome>.rollback.sql`, linha `pendente` em `01` e linha de validação/rollback em `03` (exigido por `test-implantacao-plano`).
2. Rodar `node scripts/ensaio-implantacao-ondas-realpg.mjs --report docs/implantacao/08-relatorio-ensaio-ondas.md` (com `ACC_REALPG_URL` do Postgres local de homologação e `ACC_REALPG_PKG_DIR`); os novos arquivos entram sozinhos na onda F5. Se alguma nova migration redefinir `record_risk_alert_action` ou depender de dados, o ensaio mostra a falha com a verificação P0 por migration.
3. Quando decidir a ordem definitiva, acrescentar a onda ao JSON (a onda F5 automática passa a ser vazia) e um `Onda` na tabela do `07`.

## 3. Compatibilidade banco x app (migrations 20261124-27 acrescentadas às regras do 07)

| Migration | Efeito | Regra de ordem | Com app antigo / sem app novo |
|---|---|---|---|
| `20261124100000` competências | tabelas + RPCs de concessão/revogação (só ADMINISTRADOR) | Banco ANTES do app novo (a UI de concessão é do app) | inofensiva isoladamente |
| `20261124101000` enforcement | gatilhos BEFORE: decisão/negativa/contestação/indenização de sinistro exigem JURIDICO; aprovação de minuta SEGUROS/JURIDICO; evento de qualidade exige competência | Aplicar JUNTO com o app novo e com concessões de competência já feitas | falha fechada: quem não tem competência recebe `COMPETENCE_REQUIRED` (mensagem crua no app antigo). Janela: conceder as competências ANTES de aplicar (ou imediatamente depois) |
| `20261124102000` endosso | substitui a regra de dupla conferência (rollback bloqueia se houver conferência do solicitante) | Banco ANTES do app novo | app antigo (regra da Fase 3, ≥4 pessoas) fica mais restritivo que o banco: sem perda de segurança |
| `20261125100000` aceite comprovado | encerramento de garantia exige aceite COMPROVADO (`CUSTOMER_ACCEPTANCE_NOT_PROVEN`) | Banco ANTES do app novo; app novo precisa enviar a prova | app antigo não consegue encerrar garantia por aceite informado: falha fechada |
| `20261125200000..203000` seguros | coerência, partes identificadas (CPF/CNPJ válido), fonte em fiança/caução, fundamentação de sinistro, consolidação de adiantamentos | Banco ANTES do app novo | app antigo: operações sem fonte/nota/documento válido passam a ser recusadas (falha fechada) |
| `20261126100000` portão P0 | confere/reafirma P0; falha com `P0_GATE` se corpo/ACL divergir | Última da sequência principal | n/a |
| `20261127100000` destinatários externos | gatilho no canal oficial de Seguros (e-mail de domínio externo exige confirmação recente) | Banco ANTES do app novo | app antigo não confirma: cadastro de canal externo recusado (falha fechada) |

Ordem de publicação (sem mudança): ondas A a J (banco) -> publicar o app -> `20261123302000` (H2) -> smoke -> E (SLA, se decidida). Concessões de competência (`project_competence_grant`) devem ser feitas por ADMINISTRADOR logo após a onda I.

## 4. Locks, tempo e janela

- Locks fortes em tabelas preexistentes aparecem por arquivo em `08`; todas as tabelas envolvidas são pequenas (maiores: `document_text_segments` ~9 MB, `emails` ~6 MB). Nenhuma migration reescreve tabela grande.
- Cada arquivo roda numa transação com `lock_timeout = '5s'`: se não obtiver o lock, falha limpa sem efeito (repetir fora de ciclo). O cron de risco roda a cada 2 min; iniciar logo após um ciclo e terminar antes do seguinte.
- Parar na primeira falha. Depois de CADA migration rodar `scripts/sql/p0-verificar-record-risk-alert-action.sql` (esperado `ok = true`).

## 5. Backup e PITR (guia; só leitura, nada executado)

- A leitura via MCP (`get_project`) não informa o plano nem se o PITR está habilitado: **confirmar no painel Supabase (Database > Backups)** antes da janela. Não afirmado aqui.
- Antes da janela, com autorização do dono: backup lógico completo (`docs/backup-restore-procedure.md`), snapshot de ACL (`scripts/backup/capture-acl-snapshot.mjs`) e `pg_get_functiondef` de `record_risk_alert_action` e das funções que as migrations redefinem. Registrar o horário (ponto de restauração PITR, se disponível).
- Restauração do ponto: preferir restaurar em projeto/branch descartável e comparar; só então decidir sobre o operacional (decisão do dono).

## 6. Rollback

Cada migration pendente tem `supabase/rollbacks/<nome>.rollback.sql` e linha de validação em `03`. Regras: reverter na ordem inversa; o rollback da `20261124102000` bloqueia se houver conferência do solicitante; o da `20261126100000` é no-op; reverter a 302000 devolve a escrita direta (instantâneo). Se o P0 falhar após qualquer arquivo: parar, NÃO reaplicar o hotfix às cegas; reaplicar a `20261121101000` (restaura o corpo protegido, ensaiado no controle negativo do `08`) e repetir a verificação.

## 7. Estado de nada aplicado

Nenhuma das 57 pendentes foi aplicada. A decisão de aplicar (por onda) é do dono. O ensaio local não substitui homologação autenticada.
