# Migration `20261106100000_ssma_esg_acoes_perfis_notificacoes.sql` — SQL, pré-condições e plano de aplicação

**SQL exato:** arquivo `supabase/migrations/20261106100000_ssma_esg_acoes_perfis_notificacoes.sql` no commit citado na entrega (SHA-256 do conteúdo com quebras LF registrado abaixo e na mensagem de entrega). Aplicar **exatamente** esse arquivo.

**Estado: NÃO APLICADA em produção.** Aplicar só com autorização expressa de Reynaldo, na ordem do item 4. Arquivo: `supabase/migrations/20261106100000_ssma_esg_acoes_perfis_notificacoes.sql` (revisar o SQL completo no repositório; resumo abaixo). Aditiva: não apaga nem altera dados, só `ADD COLUMN/INDEX/TABLE`, troca de constraint/policy e `CREATE OR REPLACE` de funções.

## 1. O que o SQL faz

| Bloco | Mudança |
|---|---|
| Vínculo SSMA ↔ Ações/SLA | `sla_actions.origin` aceita `SSMA_CORRECTIVE_ACTION`; colunas `ssma_corrective_actions.sla_action_id` e `sla_actions.related_ssma_corrective_action_id` (FK `on delete set null`) com **índices únicos parciais** nas duas pontas (1:1); `ssma_corrective_action_events.kind` aceita `REATRIBUIDA` e `PRAZO_ALTERADO` |
| Funções novas | `ssma_risk_to_sla_risk`, `ssma_due_date_to_timestamptz` (fim do dia em `America/Sao_Paulo`), `ssma_link_sla_action` (interna, idempotente; sem `execute` para `authenticated`) |
| Funções substituídas | `ssma_field_record_submit` (cria a ação SLA na mesma transação; reenvio **concorrente** do mesmo `id` devolve o registro já gravado em vez de `unique_violation`); `ssma_corrective_action_update` (espelha andamento/conclusão no SLA na mesma transação; ordem de bloqueio **SLA → SSMA**) |
| Trigger | `sla_actions_ssma_guard` (BEFORE UPDATE): reatribuição, novo prazo e início feitos em Ações/SLA chegam ao SSMA (com evento no histórico); **concluir ou reabrir** ação de origem SSMA pelo módulo de Ações é recusado (`SSMA_ACTION_COMPLETE_VIA_SSMA`/`SSMA_ACTION_REOPEN_NOT_ALLOWED`) |
| Backfill | `DO $$` que chama `ssma_link_sla_action` para toda `ssma_corrective_actions` sem vínculo (idempotente; `RAISE NOTICE` com totais) |
| ESG | `can_register_esg_compliance` (membro **ATIVO** com `ADMINISTRADOR/GERENTE/GESTOR/COLABORADOR`); policies de INSERT de `esg_obligation_submissions` e `esg_obligation_evidence` trocadas (autoria = `auth.uid()`; **colaborador só anexa evidência na própria comprovação**); `can_upload_esg_evidence_object` + policy de Storage `esg_evidence_storage_insert` para `<obra>/esg-evidence/…`. **Não altera** configuração de obrigações (`esg_obligations`, só Administrador) nem a RPC de revisão (só Administrador) |
| Duplicidade de acidente | `ssma_incident_links` (decisão **humana** `SAME_FACT`/`DISTINCT_FACTS`, 1:1 por índices únicos parciais, RLS de leitura para membros, sem escrita direta) e RPC `ssma_incident_link_set` (**somente Administrador**, valida formulário de acidente enviado × ocorrência da mesma obra, auditada em `audit_log_entries`) |
| Classificação estruturada | trigger `ssma_field_records_category_guard` (lista fechada de categorias, validada só em registros novos ou quando a categoria muda; o erro mantém o nome `ssma_field_records_category_structured_check`). Os registros anteriores não são reescritos, revalidados nem impedidos de receber UPDATE — uma `CHECK ... NOT VALID` os impediria, porque o PostgreSQL a reavalia em qualquer UPDATE da linha — base do indicador de quase-acidentes |
| Notificações | tabela `ssma_field_notification_deliveries` (RLS; leitura só de Administrador; escrita só `service_role`) com `unique(record_id,event,event_date,recipient_email)`; função `ssma_notification_summary` (resumo **sem e-mails** para membros da obra) |

### Fonte oficial de cada campo (ação corretiva)

| Campo | Fonte oficial | Como se mantém igual |
|---|---|---|
| Descrição do registro, fotos, **evidência**, histórico (`_events`) | SSMA | nunca é copiado nem alterado pelo SLA |
| **Conclusão** (e a exigência de evidência/justificativa) | SSMA | RPC do SSMA grava os dois lados na mesma transação; o módulo de Ações **não** conclui nem reabre |
| Responsável, prazo, assumir/iniciar, escalonamento | Ações/SLA | trigger propaga reatribuição, prazo e início ao SSMA, com evento no histórico |
| Status | SSMA decide a conclusão; SLA decide o andamento | espelhado na mesma transação/trigger |

## 2. Pré-condições (conferir ANTES, somente leitura)

```sql
-- 1) trilha B existe e as migrations anteriores estão aplicadas
select to_regclass('public.ssma_corrective_actions') is not null as ssma_ok,
       to_regclass('public.sla_actions') is not null            as sla_ok,
       to_regclass('public.esg_obligation_submissions') is not null as esg_ok;
-- 2) o vínculo ainda não existe (re-execução segura, mas confirme o estado). Filtra schema, TABELA e coluna:
--    `sla_action_id` existe também em risk_alert_cases e risk_alert_outbox (outro assunto); sem filtrar a tabela a contagem nunca dá 0.
select count(*) from information_schema.columns
 where table_schema='public'
   and ((table_name='ssma_corrective_actions' and column_name='sla_action_id')
     or (table_name='sla_actions'             and column_name='related_ssma_corrective_action_id'));      -- esperado 0 ANTES; 2 DEPOIS da migration
-- 3) volume do backfill e casos que ficarão só no SSMA (concluída por quem saiu da obra)
select status, count(*) from public.ssma_corrective_actions group by 1;                                       -- produção em 05/11/2026: 0 linhas
select count(*) from public.ssma_corrective_actions a
 where a.status='CONCLUIDA' and not exists (select 1 from public.project_memberships m
   where m.project_id=a.project_id and m.user_id in (a.concluded_by_user_id, a.responsible_user_id));        -- esperado 0
-- 4) definição vigente de permissões (a migration NÃO a altera; só a usa)
select prosrc like '%''ADMINISTRADOR'' then 3%' as has_project_permission_ok from pg_proc where proname='has_project_permission';
-- 5a) categorias anteriores fora da lista fechada (informativo: o guard só valida registros novos ou troca de categoria, então
--     esses registros continuam atualizáveis — ex.: reatribuição propagada pelo SLA; podem existir sem bloquear nada)
select count(*) from public.ssma_field_records
 where category not in ('Condição insegura','Ato inseguro','Quase-acidente','EPI','Sinalização','Organização e limpeza','Meio ambiente','Inspeção de rotina','Outra');   -- esperado 0
-- 5b) tabelas de que a migration depende
select to_regclass('public.ssma_form_submissions') is not null as forms_ok, to_regclass('public.audit_log_entries') is not null as audit_ok;
-- 5) nenhuma ação SLA de origem SSMA pré-existente
select count(*) from public.sla_actions where origin='SSMA_CORRECTIVE_ACTION';                              -- esperado 0 (a constraint nem aceita antes)
```

Também: **backup/ponto de recuperação** do projeto Supabase confirmado antes (procedimento em `docs/backup-restore-procedure.md`); janela sem envio de registros SSMA em andamento é desejável, mas não obrigatória (o envio é idempotente).

## 3. Testes executados (resultado)

**3.1 PGlite com dados anteriores** — `scripts/test-ssma-esg-migration-sql.mjs` (**29 casos**, em `test:sql` e no CI): reaplica as migrations anteriores, cria dados antigos (ações abertas, em andamento, concluídas com evidência/justificativa, concluída por quem saiu da obra, ação SLA alheia, comprovação ESG, formulários de acidente), aplica a migration e confere: backfill 1:1 e status mapeados; **registros, eventos, fotos e ações do SSMA idênticos** (só `sla_action_id` preenchido); backfill idempotente; auditoria; envio novo, reenvio sem duplicar; andamento/conclusão espelhados; conclusão/reabertura pelo módulo de Ações recusadas; reatribuição e prazo propagados com histórico; isolamento entre obras; perfis ESG (registra/não registra, colaborador só na própria evidência, Storage); vínculo de duplicidade (só Administrador, validações, 1:1, revisão sem duplicar, auditoria, leitura por membros, sem escrita direta); categoria estruturada; notificações (dedupe, minúsculas, só `service_role` grava, só Administrador lê linhas).

**3.2 PostgreSQL REAL com conexões independentes** — `scripts/test-ssma-esg-concurrency-realpg.mjs` (`npm run test:realpg`; **não roda no CI**, exige servidor). Executado em **PostgreSQL 18.6 (Windows, x64)**, base nova com as **129 migrations aplicadas (inclui esta) em 2,4 s**, **10/10 OK**:
- A) o **mesmo registro enviado por 12 conexões simultâneas**: 1 registro, 1 ação SSMA, 1 ação SLA, 1 evento `CRIADA`; todas devolvem o mesmo id, nenhuma falha;
- B) **12 registros distintos** por 12 usuários em paralelo: 12 ações SSMA ↔ 12 ações SLA (1:1);
- C) **vínculo SSMA↔SLA criado por 10 conexões** para a mesma ação: exatamente 1 ação SLA;
- D) **andamento pelo SSMA × reatribuição/início pelo módulo de Ações**, 30 rodadas em paralelo: **sem deadlock**, estados e responsáveis iguais nos dois módulos;
- F) **decisão humana de duplicidade concorrente**: no máximo um `SAME_FACT` por formulário/registro;
- E1–E4) **reserva (claim) das notificações** com o mesmo núcleo `core.ts` e uma conexão por execução: 10 execuções simultâneas → **exatamente 3 e-mails para 3 destinatários**, 3 linhas `SENT` com 1 tentativa; repetir não envia; falha de um destinatário com 8 execuções simultâneas → os outros enviam uma vez e só o que falhou é reenviado na rodada seguinte; ausência de destinatário → 1 linha `SUPPRESSED`, nenhum e-mail;
- invariantes: nenhuma ação SLA de origem SSMA órfã ou duplicada; nenhuma entrega duplicada.
**Limites:** o store de notificações do teste usa o mesmo SQL condicional do store de produção (`server.ts`), mas via `pg` (o de produção usa o cliente Supabase/PostgREST); o servidor era PostgreSQL 18 (produção Supabase pode ter outra versão menor/maior) sem GoTrue/Storage reais (stub de plataforma).

## 4. Ordem de aplicação recomendada

1. Conferir as pré-condições (item 2) e o backup.
2. **Aplicar a migration** (Supabase SQL/CLI com autorização) e executar as consultas de verificação: colunas/índices criados; `select count(*) from ssma_corrective_actions where sla_action_id is null` (esperado 0 ou só os casos do aviso); policies listadas; RLS ligada em `ssma_field_notification_deliveries`.
3. Só então **mergear o PR** (o código usa `ssma_notification_summary`, as novas policies ESG e a trigger). Antes da migration o app continua funcionando (aviso de notificações some; ESG para Gerente/Gestor/Colaborador ainda seria recusado pelo banco).
4. Validar em produção no projeto TESTE (registro crítico → ação vinculada em `/acoes`; concluir pelo SSMA; recusa de concluir em `/acoes`; comprovação ESG por Colaborador e recusa para Leitura; acidente de formulário + ocorrência de campo próximos → aparece como **possível duplicidade** sem alterar o total, e só a decisão do Administrador desconta).
5. **Notificações:** manter `ACC_SSMA_NOTIFICATIONS_ENABLED` desligada até a validação em circuito fechado (modo piloto: `ACC_OUTBOUND_MODE=pilot`, destinatário único do piloto) e ligar só com autorização.

## 5. Reversão

Migração aditiva. Reversão controlada (se necessária): remover o trigger `sla_actions_ssma_guard`; restaurar as definições anteriores das duas RPCs (arquivo `20261028130000`); recriar as policies ESG antigas (`has_project_permission(project_id,'EDITOR')`); manter colunas/tabelas (inofensivas) ou removê-las. **Não** apagar `sla_actions` criadas pelo backfill sem decisão (carregam auditoria).

## Revisão de segurança (PR #149) — correções incorporadas antes de qualquer aplicação

Auditoria em PostgreSQL descartável (PGlite), com papéis reais e dados sintéticos, antes de aplicar em qualquer ambiente:

1. **Isolamento entre obras (trigger `sla_action_ssma_guard`)**: o vínculo SSMA↔SLA agora é imutável por `UPDATE` (`SSMA_LINK_IMMUTABLE`) e as duas pontas precisam ser da mesma obra (`SSMA_LINK_PROJECT_MISMATCH`). Sem isso, um Administrador de uma obra poderia apontar a ação SLA dele para uma ação SSMA ainda sem vínculo de outra obra e alterar responsável e prazo dela.
2. **Idempotência**: as policies novas passaram a ter `drop policy if exists` antes do `create policy`; as duas migrations podem ser reaplicadas sem erro e sem duplicar dados.
3. **Anti-oráculo de existência** (`esg_link_ssma_record`, `esg_unlink_ssma_record`, `ssma_incident_link_set`): quem não é membro da obra recebe o mesmo erro para um ID real e para um inexistente. Para membros do próprio projeto nada muda (`FORBIDDEN`, `ADMIN_REQUIRED`, `PROJECT_MISMATCH` para quem integra as duas obras).

Regressão: `scripts/test-ssma-esg-security-regression-sql.mjs` (roda em `npm run test:sql`; 14 verificações; falha 7 vezes contra a versão anterior das migrations).
Limite conhecido, fora deste PR: `ssma_field_record_submit` e `ssma_corrective_action_update` mantêm o comportamento anterior de códigos de erro (`RECORD_ID_CONFLICT`, `ACTION_NOT_FOUND`/`PROJECT_ACCESS_DENIED`).
