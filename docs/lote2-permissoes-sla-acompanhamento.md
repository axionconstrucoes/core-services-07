# Lote 2 — permissões, SLAs, acompanhamento por eventos, previsão e auditoria por e-mail

Branch `feat/lote2-acompanhamento-sla` (base `integration/acc-noturna` 64c0889). Homologação **local** (PGlite e PostgreSQL 17 real em 127.0.0.1); nada foi aplicado no banco operacional (só `SELECT` leve). Migrations novas: `20261121170000`, `20261121171000`, `20261121172000`.

## 1. SLAs aprovados × código × banco — DIVERGÊNCIA (registro do Lote 2; CORRIGIDA localmente na FRENTE A: ver `docs/sla-medio-baixo-aprovados.md`)

| Risco | Aprovado | Código (`apps/web/lib/sla/default-matrix.ts`) | Banco operacional (`sla_matrix_rules`, regra ativa) |
|---|---|---|---|
| CRÍTICO | 1 hora corrida | 1 hora corrida | `CLOCK_HOURS` 1 (escalonamento +1 / +2) — confere |
| ALTO | 4 horas úteis | 4 horas úteis | `BUSINESS_HOURS` 4 (+4 / +4) — confere |
| MÉDIO | **2 dias úteis** | **1 dia útil** | `BUSINESS_DAYS` **1** (+1 / +1) — **diverge** |
| BAIXO | **5 dias úteis** | **3 dias úteis** | `BUSINESS_DAYS` **3** (+3 / +2) — **diverge** |

Evidência: `default-matrix.ts` (LOW=3, MEDIUM=1), `docs/sla-escalation.md` (tabela: BAIXO 3 / MÉDIO 1) e `SELECT` em `sla_matrix_rules` (uma regra ativa por nível; as inativas CRÍTICO/ALTO são histórico). A verificação anterior estava correta.
**Nada foi alterado**: nem o padrão do código, nem as regras do banco, nem os 25 SLAs existentes (15 `ESCALATED`/`DIRETORIA` — 6 CRÍTICO e 9 ALTO —, 1 `ESCALATED`/`ESCALAO_1` BAIXO e 9 `PENDING`). O teste `M1` fixa o estado atual para que qualquer mudança seja deliberada.
Para adotar a tabela aprovada seria necessário: (a) ajustar `DEFAULT_SLA_MATRIX` (MÉDIO 2, BAIXO 5; o escalonamento +N também precisa de decisão), (b) migration de dados atualizando a regra ativa por projeto, (c) decidir se as ações já criadas (prazos gravados no momento da criação — "nunca recalcular para trás") são recalculadas. Escalonamento existente preservado como está.

## 2. Permissões centralizadas (N1) e funções SECURITY DEFINER de autorização

`has_project_permission(p_project_id, p_min)` e `is_project_member(p_project_id)` delegam a `project_permission_for` / `project_member_active_for` (usuário explícito) — fonte única, migration `20261121100000` (equivalência exaustiva em `test-n1-permission-centralization-sql`). O hotfix P0 (`record_risk_alert_action`) **não foi tocado** (md5 inalterado; a nova auditoria de previsão é um gatilho, não altera a função).

Funções SECURITY DEFINER de autorização (retorno `boolean`) cobertas pelo teste `A1` (sessão sem usuário, usuário inexistente e argumentos NULL: nunca devolvem NULL; recusa por exceção também é falha-fechada):
`authorize_discard_unregistered_ssma_photo`, `can_add_contract_attachment`, `can_edit_project_financial_data`, `can_manage_project_documents`, `can_register_esg_compliance`, `can_upload_esg_evidence_object`, `can_upload_ssma_field_photo_object`, `can_upload_ssma_photo_object`, `can_view_project_financial_dashboard`, `has_project_permission`, `is_active_project_administrator`, `is_admin_of_person_project`, `is_any_project_admin`, `is_project_member`, `is_shared_project_admin`, `is_unregistered_project_document_object`, `project_member_active_for`, `project_permission_for`.
Funções de autorização que **por contrato** devolvem NULL: `email_reply_member_permission` (texto do perfil; NULL = não é membro ativo; todos os chamadores recusam em `is null`). Funções que devolvem linha/uuid autorizam por exceção (`sla_action_authorize_operation[_for]`, `decide/request/revoke_email_access_authorization`, etc.) — cobertas por `test-n1-null-fail-closed-sql`.

## 3. Consistência risco × SLA × escalonamento

Já existiam: view `risk_sla_consistency_issues` (CASE_RESOLVED_SLA_OPEN, SLA_CLOSED_CASE_OPEN, RESPONSIBLE_DIVERGENT, LEVEL_DIVERGENT; `20261120152000`), trava de e-mail no ledger e a guarda do escalonamento manual (`closedRiskCaseActionIds`) e do ciclo (só casos `OPEN`). Lacunas e o que foi feito (sem alterar dados):

| Lacuna | Tratamento |
|---|---|
| SLA `ESCALATED` de risco já fechado/resolvido não era relatado por status | view `sla_followup_consistency_issues` (`ESCALATED_RISK_CASE_CLOSED`) |
| Nada impedia, no banco, escalar a ação de um caso já resolvido (a guarda era só do app) | gatilho `sla_actions_closed_risk_case_escalation_guard`: recusa a transição para `ESCALATED`/nível mais alto (`ESCALATION_RISK_CASE_CLOSED`); concluir/cancelar continua permitido; dados existentes intocados |
| `ESCALATED` com nível `RESPONSAVEL` | `ESCALATED_LEVEL_NOT_RAISED` |
| Divergência de nível de risco caso × ação | `RISK_LEVEL_DIVERGENT` |
| Ação aberta no último nível sem previsão | `TOP_LEVEL_NO_FORECAST` |
| Previsão vencida ainda aberta | `FORECAST_OVERDUE_OPEN` |

Risco residual: o gatilho faz o `escalate_sla_action_system` falhar para essas ações; o ciclo já trata erro por item (`skipped`), sem interromper o lote. Antes de aplicar em produção, consultar a view para ver quantas das 15 ações `ESCALATED` têm caso fechado.

## 4. Acompanhamento após o último nível (DIRETORIA) — por EVENTOS

Estado: ação `ESCALATED`/`DIRETORIA` não recebia mais nada. Implementado (migration `20261121171000`), **sem novo escalonamento e sem e-mail**:

- `sla_action_followup_events` (RLS: membros leem; escrita só pelas funções): `FORECAST_RECORDED` (tela ou e-mail) e `FORECAST_OVERDUE` (sistema).
- `sla_followup_run(p_now)` (service_role): para cada ação aberta cuja **previsão vigente** (a mais recente) já venceu, grava **um** `FORECAST_OVERDUE` (único por previsão) e a auditoria `SLA_ACTION_FORECAST_OVERDUE`; reexecução idempotente; nova previsão reabre o ciclo; ação concluída/cancelada é ignorada. Testado: zero linhas novas em `sla_action_escalations`, `risk_alert_outbox` e nenhuma mudança em `sla_actions` (`E1`).
- Notificação: **desligada**. `sla_followup_policy.notify_enabled` (padrão `false`) e `sla_followup_notification_allowed(projeto)` (devolve `false` sem decisão). Não existe nenhum consumidor de envio. Se for ligada, deve passar pela outbox existente (`risk_alert_outbox`), respeitando allowlist/travas do piloto.
- **Periodicidade de lembretes: NÃO inventada.** Busca em `docs/` e na Matriz: a única periodicidade formal é a política de repetição dos alertas de contrato (`apps/web/lib/alerts/repeat-policy.ts`: CRÍTICA 1 dia, ALTA 2, MÉDIA 4, BAIXA 7 — dias corridos), que não está aprovada para ações em `DIRETORIA`. O acompanhamento é só por eventos (previsão vencida, atualização de status/previsão, resposta por e-mail).
- A função `sla_followup_run` **não está agendada** (nenhuma alteração de cron/rota nesta entrega); executar manualmente ou ligar ao agendador após decisão.

### Decisões pendentes
1. Periodicidade (se houver) de lembrete após `DIRETORIA` e quem recebe (Diretoria? responsável?).
2. Ligar `notify_enabled` por projeto e o texto do e-mail (outbox + travas do piloto).
3. Agendar `sla_followup_run` (rota/cron).
4. Interface da tela de ação SLA para registrar a previsão (a RPC `sla_action_record_forecast` existe e está testada; falta o formulário).

## 5. Previsão de término (EM ANDAMENTO + Previsão)

| Caminho | Antes | Agora |
|---|---|---|
| Alerta de risco, **tela** | `forecast_at` em `risk_alert_action_events` (ok); auditoria só `RISK_ALERT_ACTION` (sem a previsão) | gatilho grava `RISK_ALERT_FORECAST_RECORDED` (teste `R1`) |
| Alerta de risco, **e-mail** | `forecast_at` no evento (origem EMAIL) + `RISK_ALERT_FORECAST_RECORDED` pelo app | inalterado (o gatilho ignora origem EMAIL: sem duplicar, `R2`) |
| Ação SLA (sem caso de risco), **e-mail** | previsão só como texto da providência; nada estruturado | `sla_action_progress_with_forecast_by_email`: status + evento estruturado `FORECAST_RECORDED` (origem EMAIL) + auditoria `SLA_ACTION_FORECAST_RECORDED`, mesma transação e mesmo recibo por mensagem (`F3`, `F4`, `F5`) |
| Ação SLA, **tela** | inexistente | RPC `sla_action_record_forecast` (usuário autenticado; responsável/administrador; ação assumida; previsão futura) — sem formulário ainda |

A previsão nunca altera prazos SLA, nível ou status (`F1`).

## 6. Auditoria das decisões por e-mail — cobertura

`email_reply_inbound_log` registra **todas** as mensagens dos três fluxos (`RISK` em `risk-reply-dispatch.ts`, `SSMA` em `ssma-replies-phase.mjs`, `TOKEN` — SLA, resumo semanal, lote de contrato — em `token-replies-phase.mjs`), com resultado (`APPLIED`/`REJECTED`/`UNAUTHORIZED`/`IGNORED`/`REVIEW`/`RATE_LIMITED`), sem corpo.

| Domínio | Evento de origem EMAIL | `audit_log_entries` |
|---|---|---|
| Risco | `risk_alert_action_events.origin = 'EMAIL'` | `RISK_ALERT_ACTION`, `RISK_ALERT_FORECAST_RECORDED`, `RISK_ALERT_UNAUTHORIZED_REPLY`, `..._OUT_OF_ORDER` |
| SLA | recibo por mensagem (`email_reply_command_receipts`) | `SLA_ACTION_COMPLETED_BY_EMAIL`, `SLA_ACTION_PROGRESS_BY_EMAIL`, **`SLA_ACTION_FORWARDED_BY_EMAIL` (lacuna preenchida em `20261121172000`)**, `SLA_ACTION_FORECAST_RECORDED` |
| Resumo semanal | recibo | `submit_weekly_alert_digest_item_by_email` (auditoria na função) |
| Contrato | recibo | `save_contract_alert_batch_item_response_by_email` (auditoria na função) |
| SSMA | eventos `ssma_corrective_action_events` | `SSMA_REPLY_*` (app) + núcleos com ator explícito |

Teste `D2` garante que as cinco funções de decisão SLA/resumo/contrato gravam auditoria e recibo; `D1` cobre o ENVIAR PARA por e-mail.
Observação: o SSMA não tem recibo SQL por mensagem (a idempotência é o `email_reply_inbound_log` + auditoria do app) — registrado como risco baixo, sem alteração.

## 7. `anon` × funções SECURITY DEFINER

Varredura (replay completo, 233 funções): todas têm `search_path` vazio; **apenas as 8 herdadas** são executáveis por anon (confirmado também em produção por `SELECT`).

| Função | Natureza | Decisão |
|---|---|---|
| `handle_new_user`, `prevent_last_administrator_removal`, `project_delivery_items_log_risk_change`, `set_document_version_project_id` | funções de **gatilho** (`returns trigger`) | **revoke de anon/PUBLIC** (migration `20261121170000`). Seguro: o PostgreSQL só confere EXECUTE ao criar o gatilho, não ao disparar. Provado em `G3` (anon/authenticated inserem em tabela com gatilho sem EXECUTE) e `G4`. |
| `has_project_permission`, `is_project_member`, `is_any_project_admin`, `is_shared_project_admin` | predicados de **RLS** | **NÃO revogado — pendência.** 91 políticas do schema `public` são `TO public` e as chamam (mesmo número em produção); o papel `anon` as avalia na leitura anônima. Sem EXECUTE, a leitura deixaria de devolver 0 linhas e falharia com "permission denied for function" — mudança de comportamento sem ganho de segurança (o predicado devolve `false` sem sessão). Teste `G2` trava o estado atual. |

Caminho futuro (se desejado): recriar as 91 políticas com `TO authenticated` (migration grande, com teste de equivalência por tabela) e só então revogar anon dos 4 predicados.

## 8. Reconciliação das 7 versões divergentes de migrations

`node scripts/reconciliacao-rename-plan.mjs` (idempotente; **não renomeia**): lista os 7 `git mv`, as **71 referências em 34 arquivos** a atualizar (testes, comentários em `apps/web`, docs; inclui o arquivo `docs/ssma-esg-migration-20261106100000.md`, cujo nome também contém a versão), `--commands` (só os `git mv`), `--json`, `--check` (sai 1 enquanto houver pendência) e `--replay-realpg` (replay das duas ordens em PostgreSQL 17 real).
Resultado em PG real (160 arquivos): **ordem original 0 falhas; ordem renomeada 0 falhas; diff de schema 0×0 (7.024 linhas de impressão digital)**. O renomeio em si fica para o integrador (mesmo commit: `git mv` + substituição das referências + `--check` + `npm run test:sql`). Plano de origem e opção (a) `migration repair` como alternativa: `reconciliacao-historico-migrations.md` (fora do repositório).

## 9. Testes

- Novo `scripts/test-l2-followup-forecast-sql.mjs` (22 verificações: grants, gatilhos, NULL-safety, previsão tela/e-mail, acompanhamento, RLS, guardas, relatório, auditoria por e-mail, SLAs aprovados) — em `test:sql`.
- Novo `scripts/test-reconciliacao-rename-plan.mjs` (5) — em `test:sql`.
- `scripts/test-email-replies-n3-sql.mjs` (B1/B7) ajustado: o runner passa a chamar `sla_action_progress_with_forecast_by_email` quando há previsão válida.
- Sem data fixa (relativo a `Date.now()`/`now()`).
