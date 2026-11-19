# Emergência — e-mails do ACC (diagnóstico de 18/11/2026, 19:00Z)

Somente leitura: nada foi enviado, aplicado, reiniciado ou alterado. As consultas ao banco foram `select`; os workflows disparados foram os de diagnóstico já existentes (`Risk Alerts WEG Dry-Run`, `Pilot Gmail Auth Check`), que não gravam nem enviam.

## Conclusão em uma frase
**O motor de alertas e a credencial de envio estão saudáveis. A causa da interrupção é o agendador do GitHub Actions, que dispara numa fração da frequência declarada; além disso, os alertas que restariam estão retidos por trava de segurança aguardando decisão humana.**

## 1. Causa 1 — agendador do GitHub disparando muito abaixo do declarado
Todos os ciclos recorrentes dependem de `schedule` do GitHub Actions (a Vercel está no plano Hobby, só admite crons diários).

| Workflow | Cron declarado | Execuções `schedule` reais (últimas 24 h) | Observação |
|---|---|---|---|
| Weekly Schedule Email Ingestion (aciona `/api/cron/risk-alerts`) | `20 * * * *` (hora a hora) | **2**: 04:28Z e 14:09Z | Entre 03/11 e 17/11: **nenhuma** execução agendada. Desde 14:09Z faltam as de 15:20, 16:20, 17:20 e 18:20 |
| SSMA Notifications | `15 * * * *` | **1**: 14:04Z | — |
| Gmail Inbound Sync | `*/15 * * * *` | **3** (01:44Z, 09:12Z, 18:03Z) | intervalos de ~8 h |

Quando o job roda, funciona: a execução das 14:09Z concluiu o `risk-alerts` com sucesso (14:11Z).

## 2. Causa 2 — comunicações retidas por trava de segurança (não é falha)
- Casos de risco abertos: **9 ALTO, 6 CRÍTICO, 3 MÉDIO**.
- Os **6 CRÍTICO** têm somente saídas **suprimidas** (nenhuma entregue). Os 4 casos **detectados com atraso** (`B06958AD`, `F6574182`, `9DFF496B`, `9CA7442C`) e os 2 casos na Diretoria (`1F493F8C`, `DAC56702`) estão em `REISSUE_DECISION_REQUIRED`: "nenhum e-mail, ação SLA ou escalonamento automático sem decisão humana auditada de reemissão".
- Simulação do ciclo agora (`Risk Alerts WEG Dry-Run`, run 44376459140): HTTP 200 em 5,9 s, `featureEnabled: true`, `readinessBlockers: []`, `blockedReason: null`, **`planned: 0`**, `suppressed: 0`.

## 3. Separação pedida (0.2)
| Situação | Resultado | Evidência |
|---|---|---|
| Não existem alertas elegíveis | **Sim, hoje** para o que o ciclo pode enviar sozinho | dry-run `planned: 0` |
| Elegíveis, mas o job não executou | **Sim, para ciclos futuros**: 4 janelas horárias sem execução desde 14:09Z | histórico de runs |
| Job executou e bloqueou | **Sim**: 6 casos em `REISSUE_DECISION_REQUIRED` e 4 detectados com atraso retidos | auditoria 12:37Z e 14:11Z; dry-run |
| Gerado e não entrou na outbox | Nenhum indício | — |
| Entrou na outbox e não foi enviado | **1** linha `PENDING` (IMMEDIATE, agendada em 12/11; motivo da retenção não verificado) | `risk_alert_outbox` |
| Provedor recebeu, entrega não comprovada | Não avaliado nesta rodada (não há envio recente a conferir) | — |
| Suprimido por idempotência/pilot | 28 históricas `SUPPRESSED` (última em 02/11) | `risk_alert_outbox` |
| Enviado e não contabilizado | Nenhum indício | — |

## 4. Credenciais e integração (0.1 itens 9–13)
`Pilot Gmail Auth Check` (run 44376801407): `ok: true`, renovação do token OK, escopos `gmail.send, openid, userinfo.email`, `accountMatchesSender: true`, cliente isolado do piloto. O último envio real do ciclo (consolidados, provedor GMAIL, 12:37Z) confirma o remetente `crm@`. Falhas de envio registradas: 4, a última em 14/11.

## 5. Números pedidos (0.5)
- **Última execução agendada bem-sucedida do ciclo de riscos:** 18/11 14:09Z (job `risk-alerts` até 14:11Z).
- **Última mensagem efetivamente enviada pelo ciclo:** 18/11 12:37:56Z (consolidado semanal, Gmail). Último alerta individual: 17/11 22:21Z (envio único autorizado).
- **Últimas de SSMA:** 2 notificações de campo, 18/11 05:01Z.
- **Pendentes:** 1 (`PENDING`, desde 12/11). **Falhadas:** 0 na outbox. **Suprimidas (históricas):** 28.

## 6. Correção preparada (branch isolada, nada aplicado)
Branch `fix/agendador-pgcron-rebase`: o PR #203 (agendador `pg_cron` + `pg_net`: riscos a cada 2 min, SSMA a cada 5 min, coleta a cada 10–15 min) **rebaseado sobre a `main`** com um único conflito (lista de testes em `package.json`), resolvido mantendo as duas listas. Testes: `test-scheduler-sql` (25) e `test-cron-routes-proxy-auth` (24) passam; `test-scheduler-heartbeat` sai 0.
O PR #203 original não foi alterado.

## 7. O que precisa de autorização humana para o retorno operacional
1. **Agendador:** autorizar a instalação do `pg_cron`/`pg_net` no Supabase, gravar no Vault o segredo de disparo e a variável `ACC_SCHEDULER_PG_CRON_ENABLED=true`; depois aplicar a migration `20261118093000_scheduler_pg_cron_dispatch.sql` (revisada). **Não** exige deploy na Vercel (as rotas já existem). Alternativa sem instalar nada: disparos manuais periódicos de `Weekly Schedule Email Ingestion`, o que **envia e-mails reais** e exige autorização.
2. **Decisões de reemissão:** decidir caso a caso os 6 casos retidos (e os CRÍTICO suprimidos). Sem decisão auditada o sistema, de propósito, não envia.
3. **Layout novo:** o template universal (PR #231) só vale em Production após merge e deploy; os e-mails de hoje ainda saem no layout antigo.

## 8. Necessidade de deployment
- **Retorno do envio recorrente:** não requer deploy; requer a migration do agendador (autorização) ou disparo manual (autorização).
- **Novo layout:** requer deploy depois do merge do PR #231.

## 9. Limites desta investigação
Logs de runtime da Vercel: o plano Hobby só retém 1 hora, então não foi possível inspecionar as respostas do cron das 14:11Z. Não foi avaliada a entrega no destinatário (Gmail/Outlook).
