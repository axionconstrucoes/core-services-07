---
title: ACC — ordem mestre noturna de conclusão operacional
date: 2026-11-21
status: implementado localmente, pendente de homologação e publicação
branch: integration/acc-noturna
base: 77c646b (integration/acc-consolidacao)
tags:
  - acc
  - seguranca
  - email
  - dashboard
  - experts-ia
---

# ACC — ordem mestre noturna (20–21/11/2026)

> [!warning] Nada publicado
> Todo o trabalho está em branches **locais**. Nenhuma migration aplicada em ambiente remoto, nenhum e-mail real,
> nenhuma caixa de terceiro acessada, nenhum push/merge/deploy. Consolidação anterior: [[acc-consolidacao-20261120]].

## Branches

| Branch | Commits | Base | Conteúdo |
|---|---|---|---|
| `hotfix/risk-alert-action-authorization` | `33b666f`, `f165783` | **main `09fda9b`** | hotfix isolado da falha de autorização em produção |
| `feat/n1-seguranca-permissoes` | `ee410b4`, `b5b2e73` | `77c646b` | permissão em fonte única, NULL residual, auditoria de sobrescrita, trava #59 por invariantes |
| `feat/n2-ingestao-caixas` | `ba22e95`, `19897f8` | `77c646b` | coleta por caixa endurecida, tela Integrações → Caixas (7 etapas) |
| `feat/n3-respostas-por-email` | `50c4651`, `50d0cdd` | `77c646b` | SLA, resumo semanal por item e contrato por resposta de e-mail |
| `feat/n4-envio-alertas` | `82ef183`, `1a964f9`, `c516e92` | `77c646b` | aceite × entrega, falhas classificadas, alertas informativos |
| `feat/n5-dashboard-indicadores` | `e5eab5f`, `27ee41a` | `77c646b` | indicadores com fonte e critério; dado ausente ≠ zero |
| `feat/n6-governanca-ia` | `e2e25c2`, `d9d4678` | `77c646b` | limite de IA sem lacunas, sem estorno, orçamento US$ desligado |
| `integration/acc-noturna` | merges + `927ec92` | `77c646b` | integração de tudo acima |

## Migrations novas (ordem de aplicação)

| Migration | Frente | Efeito | Observação |
|---|---|---|---|
| `20261121090000_hotfix_risk_alert_action_authorization` | hotfix | `record_risk_alert_action` falha fechada + transição revalidada + responsável NULL recusado | **aplicável sozinha sobre a produção atual** |
| `20261121100000_centralize_project_permission_rule` | N1 | `has_project_permission`/`is_project_member` delegam à fonte única | equivalência provada em 1.008 combinações |
| `20261121101000_null_safe_authorization_residual` | N1 | NULL residual em risco, guarda do ledger e SSMA | definição final de `record_risk_alert_action` |
| `20261121110000_email_mailbox_controls_hardening` | N2 | aceite individual reflete na coleta, suspensão após 5 erros, cursor por caixa | **exige `20261107090000` (não aplicada em produção)** |
| `20261121120000_email_replies_sla_digest_contract_by_email` | N3 | núcleos com ator explícito, variantes `*_by_email`, recibos e confirmações | originais delegam, comportamento igual |
| `20261121130000_outbound_delivery_states` | N4 | `delivery_state`/evidência/falha; trava SENT → nunca volta | **aplicar antes do código N4**; backfill |
| `20261121150000_ai_consult_governance` | N6 | `AUTOMATIC_CURATION`, precheck, orçamento US$ desligado | sem função de estorno |

## Resultado da integração

| Suíte | Resultado |
|---|---|
| typecheck · lint · build | OK (lint 0 erros, 14 avisos preexistentes) |
| `npm test` | 21/21 |
| `test:scripts` | 1275 OK |
| `test:email` | 667 OK |
| `test:sql` | 547 OK |
| `test:ssma` | 186 OK |
| `test:alert-sim` | 62/62 |
| `test:alerts` (25 scripts, um a um) | **491 OK, 0 falhas** — trava #59 passa (agora por invariantes) |

> [!info] Sem PostgreSQL real
> Não há Postgres nem Docker na máquina; produção **não** foi usada como substituto. Sem prova: concorrência entre
> conexões (`for update`, advisory locks sob corrida, transições simultâneas), JWT/PostgREST reais e pg_cron.

## Fatos de produção levantados (somente leitura, 20/11)

- `record_risk_alert_action` em produção = corpo de `20260921090000` (hash do `prosrc` idêntico ao replay) → **vulnerável**;
  nenhum evento humano registrado (sem exploração).
- DEV WEG: 43 casos de risco (status OPEN 21 / CLOSED 22; `state` todos OPEN); 25 ações SLA abertas e vencidas
  (ESCALATED 16, PENDING 9); 18 registros de escalonamento; SSMA 2 ações; outbox SUPPRESSED 28, PENDING 1, SENT 7.
- Caixas: só reynaldo com aceite individual; corazza habilitada sem aceite; Carlos e Jaime cadastrados, **nada coletado**.

## Decisões pendentes (não presumidas)

- [ ] Publicar o hotfix `20261121090000` (homologação → produção).
- [ ] Delegação de domínio (Google Admin), WIF GitHub → Google, `GOOGLE_WIF_PROVIDER`; aplicar `20261107090000` + `20261121110000`.
- [ ] Aceite individual de Carlos Evandro e Jaime Ramos (ou autorização corporativa formal).
- [ ] Situação da caixa corazza (habilitada sem aceite).
- [ ] DKIM próprio + DMARC para axion.com.br (ou ligar `ACC_EMAIL_WORKSPACE_TENANT_DOMAINS` após homologação).
- [ ] Ligar `ACC_EMAIL_REPLY_CONFIRMATIONS_ENABLED` após homologação das respostas por e-mail.
- [ ] Orçamento monetário de IA (ver `docs/ai/orcamento-monetario-ia.md`); fonte de Orçamentos para o Comercial.
- [ ] Cadência/limite dos lembretes de acompanhamento; outbox para contrato individual, SLA e autorização de e-mail.
- [ ] Fluxo de investigação de acidente (hoje o alerta é informativo).
- [ ] Valor do contrato estruturado (dashboard usa R$ 33.450.000 fixo da WEG em "Aditivos").
- [ ] Casos de risco encerrados na origem (`status` CLOSED) com `state` OPEN — intencional?

## Documentos das frentes

- Coleta por caixa: `docs/gmail-delegacao-dominio-passo-a-passo.md` (seção N2)
- Envio: [[acc-envio-n4-20261121]]
- IA: `docs/ai/governanca-consumo-ia.md`, `docs/ai/orcamento-monetario-ia.md`, `docs/ai/experts.md`
- Repositório privado: [[../seguranca/plano-repositorio-privado]]
