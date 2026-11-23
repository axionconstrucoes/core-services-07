# 35 - Limite global de envio de alertas, lotes, deduplicação e habilitação progressiva (decisão D8)

Estado: **implementado e testado localmente com provedores FAKE** (nenhum envio, nenhuma conexão remota, nenhuma migration nova). **Não ligar nada em produção** sem a aprovação específica da Diretoria (seção 9). Complementa o doc 34 (seção 7.3: "Limite por hora de envio de alertas" deixa de ser pendência de engenharia quando este módulo for publicado).

## 1. Resumo

- Um **único ponto de estrangulamento**: `getEmailProvider()` agora devolve um `GovernedEmailProvider` que envolve o provedor real (Gmail) ou FAKE. Todo e-mail automático do ACC passa por ele; nenhum emissor foi duplicado ou reescrito.
- O governador **só restringe**. Ele nunca altera destinatário, cópia, assunto ou corpo e **nunca afrouxa a trava de saída do piloto** (`pilot-outbound-guard.ts`, fail-closed, só o valor exato `production` em `ACC_OUTBOUND_MODE` libera destinatários originais): a mensagem permitida segue para o provedor interno, que continua aplicando a trava e o perfil do projeto piloto integralmente.
- **Padrão seguro e sem regressão**: com as variáveis `ACC_ALERT_*` ausentes, os fluxos que hoje enviam para a obra piloto continuam **iguais** (sem limite numérico, sem acesso ao banco). Fontes novas ou reservadas (CRONOGRAMA, DIARIO) ficam bloqueadas.
- O limite é **persistente** (sobrevive a reinício e a várias instâncias), contado sobre a tabela já existente `audit_log_entries` (append-only). **Nenhuma migration nova**: o plano de 70 itens não muda.

Arquivos: `apps/web/lib/email/alert-send-governor.ts` (puro), `alert-send-governor-ledger.ts` (ledger sobre `audit_log_entries`), `governed-email-provider.ts` (ponto de estrangulamento), `get-email-provider.ts` (ligação), `scripts/sql/monitoramento-limite-alertas.sql` (consultas G1 a G6), testes `scripts/test-alert-send-governor.mjs` e `scripts/test-alert-send-governor-sql.mjs`.

## 2. Mapa dos caminhos que enviam e-mail automático

Todos chamam `getEmailProvider().send(...)` (ou recebem o provedor de `getEmailProvider()`), exceto o dry-run do ciclo de risco, que usa `FakeEmailProvider` por construção. Cada chamada informa `governance: { type, projectId, dedupKey? }`; o teste estrutural falha se qualquer envio novo omitir a classificação.

| Fluxo | Origem (rota/arquivo) | Tipo (fonte) | Idempotência/claim existente |
|---|---|---|---|
| Ciclo de alertas de risco (imediato, escalonamento, consolidado, encaminhamento, devolução, resposta de Expert, confirmação de ação) | `/api/cron/risk-alerts` -> `run-risk-alert-cycle.ts` `deliver()`; planejamento em dry-run via `?dryRun=1` | `RISK_*` (RISCO) | `risk_alert_outbox.idempotency_key` única; `claimOutbox` com lease; falha `UNCERTAIN`/`PERMANENT` encerra a linha, só `RETRYABLE` volta à fila até `MAX_SEND_ATTEMPTS` |
| Envio único armado do piloto | `?pilotSingleCase=` -> `run-pilot-single-alert.ts` (reutiliza `deliver()`) | `RISK_PILOT_SINGLE` (RISCO) | mesma outbox; armamento por `ACC_PILOT_SINGLE_ALERT_CASE_ID` |
| Resumo semanal | `/api/cron/weekly-alert-digest` -> `run-weekly-alert-digests.ts` -> `send-weekly-alert-digest-email.ts` | `WEEKLY_DIGEST` (RELATORIO_SEMANAL) | `weekly_alert_digests` única por (projeto, destinatário, semana); estado `SENT` gravado antes dos registros auxiliares |
| Lotes de alertas de contrato | `/api/cron/contract-alert-batches` -> `run-contract-alert-batches.ts`; envio manual `send-contract-alert-email.ts` | `CONTRACT_ALERT_BATCH`, `CONTRACT_ALERT` (CONTRATO) | `contract_alert_batches` + `contract_alert_batch_dispatch_claims` |
| Notificações SSMA de campo | `/api/cron/ssma-notifications` e ações -> `ssma/field-notifications/server.ts` `createProviderMailer` | `SSMA_FIELD_NOTIFICATION` (SSMA) | `ssma_field_notification_deliveries` (reivindicação/entrega) |
| Aviso de acidente SSMA | `send-ssma-accident-alert-email.ts` | `SSMA_ACCIDENT` (SSMA) | `ssma_accident_notification_deliveries` |
| Escalonamento de SLA por e-mail | `send-sla-escalation-email.ts` (ação em `acoes/actions.ts`) | `SLA_ESCALATION` (SLA) | ação humana; `sla_actions` |
| Solicitação de ação | `action-request-notification-core.ts` | `ACTION_REQUEST` (ACOES) | `notification_email_deliveries` |
| Saúde do sistema | `/api/cron/system-health` -> `send-system-health-alert-email.ts` | `SYSTEM_HEALTH` (SISTEMA) | `acc_system_health_incidents` única (projeto, fingerprint) + `acc_system_health_alert_deliveries` |
| Revisão de impacto de versão (Construmanager) | `send-version-impact-review-email.ts` | `VERSION_IMPACT_REVIEW` (CONSTRUMANAGER) | `construmanager_version_review_deliveries` |
| Pedido de autorização por e-mail | `email-authorization/request.ts` | `EMAIL_AUTHORIZATION` (AUTORIZACAO) | ação humana |
| Confirmações de resposta por e-mail | `email-replies/token-reply-confirmations.ts` (chamada de `/api/cron/risk-alerts`, flag própria) | `EMAIL_REPLY_CONFIRMATION` (EMAIL) | `email_reply_confirmations`: claim por `attempt_count` (compare-and-set) e status |
| Consulta ao especialista por e-mail | `email-replies/specialist-consultations.ts` (idem, flag própria) | `EMAIL_SPECIALIST` (EMAIL) | `email_specialist_consultations`: claim por tentativa |
| Lembretes de entregáveis | `/api/cron/alert-reminders` -> `alerts/delivery-item-reminder-mailer.ts` | `DELIVERY_ITEM_REMINDER` (ENTREGAVEIS) | `idempotencyKey` por lembrete |

Fontes **reservadas** (sem emissor hoje; bloqueadas por padrão): `CRONOGRAMA` (`SCHEDULE_ALERT`) e `DIARIO` (`DAILY_LOG_ALERT`). Ao criar um emissor novo, ele deve declarar um tipo do catálogo (`ALERT_TYPE_CATALOG`); sem classificação o envio é bloqueado (`NO_GOVERNANCE_CONTEXT`).

### 2.1 Por que o provedor é o ponto de estrangulamento
Os 14 fluxos acima têm tabelas de entrega diferentes, mas todos terminam em `EmailProvider.send`. Limitar na camada de provedor evita duplicar lógica em cada emissor, vale para novos emissores e fica antes do transporte (o Gmail nunca é chamado quando bloqueado). O ledger usa `audit_log_entries` porque é a única tabela comum a todos os fluxos, já é append-only e já tem política/índices; contar a partir de cada `*_deliveries` exigiria 8 consultas heterogêneas e não cobriria os fluxos sem tabela de entrega.

## 3. Como o governador decide (ordem fixa; a primeira regra que bloqueia vence)

1. `INVALID_CONFIG`: qualquer variável `ACC_ALERT_*` inválida bloqueia **tudo**.
2. `KILL_SWITCH`: `ACC_ALERT_KILL_SWITCH=true`.
3. `NO_GOVERNANCE_CONTEXT` / `TYPE_UNKNOWN`: emissor sem classificação.
4. `SOURCE_NOT_ENABLED` / `TYPE_NOT_ENABLED` / `PROJECT_NOT_ENABLED`: habilitação progressiva.
5. `PRODUCTION_REQUIRES_ALLOWLIST_AND_LIMIT`: com `ACC_OUTBOUND_MODE=production`, exige allowlist de projetos **e** limite por hora ou por dia (regra do doc 34, 7.3: "dois controles juntos"). Só restringe: não depende de nem altera a trava do piloto.
6. Só quando há limite configurado (`ACC_ALERT_MAX_PER_HOUR` ou `_DAY`): `NO_PROJECT_CONTEXT`, `LEDGER_UNAVAILABLE` (fail-closed se o banco não responde), `DUPLICATE` (mesmo `dedupKey` já admitido nas últimas 24 h), `HOURLY_LIMIT`, `DAILY_LIMIT`.

Mecânica do limite: grava `ALERT_GOVERNOR_ADMITTED` **primeiro** e calcula a posição da admissão entre as admissões líquidas da janela móvel (60 min / 24 h), em ordem (`occurred_at`, `entity_id`). Posição acima do limite => grava `ALERT_GOVERNOR_RELEASED` (devolve a cota) e `ALERT_GOVERNOR_SUPPRESSED` (motivo) e **não chama o provedor**. Várias instâncias simultâneas no limite: exatamente as `limite` primeiras seguem (testado), as demais recuam. Depois do envio:
- sucesso: a admissão permanece (conta na janela e na deduplicação);
- falha **certa** (`RETRYABLE`/`PERMANENT`, a mensagem não saiu): `RELEASED`, e o mesmo evento pode ser tentado de novo;
- falha **incerta** (`UNCERTAIN`: o provedor pode ter aceitado): a admissão **permanece**, o evento fica barrado como `DUPLICATE` por 24 h e o fluxo existente já encerra a linha como incerta (nunca reenviar sem verificação humana em Enviados).

Lote por execução (`ACC_ALERT_BATCH_SIZE`): o ciclo de risco recebe um orçamento de envios por execução (todos os projetos). Esgotado, a linha **não é reivindicada nem tem tentativa gasta**: continua `PENDING` para a próxima execução. `capBatchSize` e `chunkIntoBatches` (puros) ficam disponíveis para os demais produtores de lote.

### 3.1 Portão ANTES da reivindicação: adiamento sem gastar tentativa (P1 resolvida)

Os fluxos com outbox/claim consultam `checkCapacity` (sem gravar admissão) **antes** de reivindicar a linha: ciclo de risco (`deliver()`), confirmações de resposta, consulta ao especialista, resumo semanal, lotes de contrato e notificações SSMA de campo. Sem capacidade (limite por hora/dia, ou habilitação/kill switch), a mensagem é **ADIADA**: a linha continua `PENDING`, **sem tentativa gasta, sem `FAILED`**, sem reivindicação; é retomada na janela seguinte. O adiamento é auditado (`ALERT_GOVERNOR_DEFERRED`, `outcome: ADIADO`, motivo, tipo, prioridade; uma vez por motivo/tipo/prioridade por execução). O lote (`ACC_ALERT_BATCH_SIZE`) continua contado por execução e também não gasta tentativa. O envio mantém a decisão final (`admitAlertSend`, fail-closed): se, entre o portão e o envio, outra instância ocupar a última vaga, o excedente cai como falha retentável (raro; gasta uma tentativa). **Falha real de envio** (provedor recusou) continua consumindo tentativa como antes e devolve a cota do ledger. Provado em PGlite: limite 2/h com 5 linhas `PENDING`, várias execuções por janela: 2 saem por janela, 0 tentativas gastas pelas excedentes, 0 `FAILED`, nenhuma reenviada, nenhuma perdida.

### 3.2 Alertas CRÍTICOS: política de preservação

- Crítico **nunca é descartado** pelo limite: fica `PENDING` (adiado e auditado) e sai na primeira janela com vaga. No ciclo de risco, críticos são processados **primeiro** (ordem estável entre os demais), para a cota da janela alcançá-los antes dos comuns.
- **Reserva de cota (opcional, padrão 0)**: `ACC_ALERT_CRITICAL_RESERVE_PER_HOUR` e `ACC_ALERT_CRITICAL_RESERVE_PER_DAY` separam parte do limite que **só** críticos usam (comuns usam `limite - reserva`; críticos usam o limite cheio). Os valores aprovados de F0 não definem reserva (padrão 0); sugestão para a Diretoria decidir: reserva 2 por hora e 5 por dia. O limite total **nunca** é excedido nem por críticos.
- O **kill switch bloqueia tudo, inclusive crítico**; a trava de saída do piloto continua aplicada a todos (crítico não muda destinatário nem Cc).

## 4. Variáveis de ambiente (apenas nomes e valores recomendados; nenhum valor é segredo)

| Variável | Formato | Ausente (padrão) | Inválido |
|---|---|---|---|
| `ACC_ALERT_KILL_SWITCH` | `true` ou `false` exatos | não bloqueia | bloqueia tudo e audita |
| `ACC_ALERT_MAX_PER_HOUR` | inteiro >= 0 (janela móvel de 60 min; `0` bloqueia tudo) | sem limite (comportamento atual) | bloqueia tudo |
| `ACC_ALERT_MAX_PER_DAY` | inteiro >= 0 (janela móvel de 24 h) | sem limite | bloqueia tudo |
| `ACC_ALERT_BATCH_SIZE` | inteiro >= 1 (envios por execução do ciclo de risco) | sem limite | bloqueia tudo |
| `ACC_ALERT_CRITICAL_RESERVE_PER_HOUR` / `_PER_DAY` | inteiro >= 0: cota reservada só a alertas críticos | 0 (sem reserva) | bloqueia tudo |
| `ACC_ALERT_ENABLED_PROJECTS` | UUIDs separados por vírgula | todos os projetos (a trava do piloto continua valendo) | bloqueia tudo |
| `ACC_ALERT_ENABLED_SOURCES` | fontes separadas por vírgula: `RISCO, RELATORIO_SEMANAL, CONTRATO, SLA, ACOES, SSMA, SISTEMA, CONSTRUMANAGER, AUTORIZACAO, EMAIL, ENTREGAVEIS, CRONOGRAMA, DIARIO` | todas **exceto** `CRONOGRAMA` e `DIARIO` | bloqueia tudo |
| `ACC_ALERT_ENABLED_TYPES` | tipos do catálogo (ex.: `RISK_IMMEDIATE,RISK_ESCALATION`) | todos os tipos das fontes habilitadas | bloqueia tudo |

Regras: variável **vazia** é inválida (diferente de ausente); a lista explícita **substitui** o padrão (não soma); UUIDs não diferenciam maiúsculas; valores inválidos nunca são copiados para a auditoria (só o nome da variável).

### 4.1 Valores de F0 APROVADOS pela Diretoria (recomendação aprovada; AINDA NÃO APLICADA: nada foi criado na Vercel)
```
ACC_ALERT_MAX_PER_HOUR=10
ACC_ALERT_MAX_PER_DAY=30
ACC_ALERT_BATCH_SIZE=5
ACC_ALERT_ENABLED_PROJECTS=<UUID da obra WEG>
```
Nomes reais das variáveis: limite por hora = `ACC_ALERT_MAX_PER_HOUR`, por dia = `ACC_ALERT_MAX_PER_DAY`, lote = `ACC_ALERT_BATCH_SIZE`, projetos = `ACC_ALERT_ENABLED_PROJECTS` (somente a WEG). 10 por hora e 30 por dia seguem o limiar O2 do doc 34. Para voltar ao comportamento atual basta **remover** as variáveis. Recomendação adicional, **sem decisão ainda**: limitar também as fontes de F0 (`ACC_ALERT_ENABLED_SOURCES=SISTEMA,SLA,ACOES,AUTORIZACAO`), de modo que nenhum alerta automático de risco, resumo, lote ou SSMA circule até a fase própria. Com os quatro valores aprovados e sem lista de fontes, valem as fontes legadas (todas, exceto CRONOGRAMA e DIARIO), sempre sob limite, lote e projeto.

## 5. O que muda em produção

**Variáveis ausentes (padrão):** nenhum fluxo existente muda de resultado. Mensagens do piloto saem exatamente como antes (mesmos destinatários, Cc institucional, assunto e corpo; teste compara o ciclo real com e sem governador). Sem acesso ao banco no caminho feliz. O que muda: (a) todo envio passa por uma camada que lê as variáveis a cada mensagem; (b) emissor sem `governance` é bloqueado (hoje todos têm); (c) fontes reservadas (CRONOGRAMA, DIARIO) não têm emissor, logo nada muda; (d) **se `ACC_OUTBOUND_MODE=production` for definido sem allowlist de projetos e limite, o governador bloqueia** (hoje a produção nunca foi ligada; é a regra de dois controles do doc 34).

**Variáveis definidas:** passa a valer a habilitação por projeto/fonte/tipo, os limites e o lote; cada bloqueio é registrado em `audit_log_entries` (`ALERT_GOVERNOR_SUPPRESSED`, motivo, fonte, tipo, projeto) e o excedente vira falha retentável visível na outbox. Com limite ativo, cada envio grava 1 a 3 linhas no ledger (admissão, e eventualmente devolução/supressão) e faz 1 a 3 leituras de `audit_log_entries`.

## 6. Habilitação progressiva (alinhada ao doc 34, seção 7.1)

| Fase | Variáveis | Condição para avançar |
|---|---|---|
| **F0** deploy sem automação nova | valores da seção 4.1 | 24 h sem incidente; G2 só com supressões esperadas; G4 vazio; O1/O2 do doc 34 limpos |
| **F1** usuários | igual a F0 | aceitação do doc 20 |
| **F2** obras | igual a F0; ciclo de risco só em dry-run | dry-run aprovado pelo Dono; G4 vazio |
| **F3** fontes, uma por vez | acrescentar à lista de fontes na ordem do doc 34: `EMAIL` (confirmações de resposta), depois `ENTREGAVEIS`, depois `SSMA`, `CONSTRUMANAGER`; manter `BATCH_SIZE=5` | 24 h estável por fonte; volume dentro de 3x a mediana (G1) |
| **F4** alertas reais, pilotados | `ACC_WEEKLY_REPORTS_ENABLED=true` (doc 34) e acrescentar `RISCO`, depois `RELATORIO_SEMANAL`, depois `CONTRATO`; começar com `ACC_ALERT_ENABLED_TYPES=RISK_IMMEDIATE` e ampliar para `RISK_ESCALATION`, `RISK_DIGEST`; `ACC_OUTBOUND_MODE` != `production` (tudo para a caixa do piloto) | 48 h; G2 sem `HOURLY_LIMIT` inesperado; O3/G4 vazios; O5 só a caixa do piloto |
| **F5** destinatários reais | `ACC_OUTBOUND_MODE=production` **somente** com `ACC_ALERT_ENABLED_PROJECTS` e limite (sugestão: 30 por hora, 100 por dia, lote 10), um projeto por vez | 7 dias sem O3/G4; O5 limpo; sem reclamação de volume |

Fontes `CRONOGRAMA` e `DIARIO` só entram quando existir emissor aprovado e teste próprio. **Parada imediata**: `ACC_ALERT_KILL_SWITCH=true` (efeito na próxima mensagem; o provedor deixa de ser chamado) e, para parar a origem, pausar o job (doc 34, 7.3).

## 7. Monitoramento (somente leitura)

Consultas prontas e testadas em `scripts/sql/monitoramento-limite-alertas.sql` (cada bloco começa por `-- @query <id>`; o teste executa todas contra a tabela real e valida que são `select`):

| Id | Mostra | Limiar sugerido |
|---|---|---|
| G1 | admitidos por hora, projeto, fonte e tipo (48 h) | acima de 3x a mediana da fonte = investigar; acima do limite configurado = defeito |
| G2 | suprimidos por motivo, fonte e tipo (24 h) | `KILL_SWITCH`/`INVALID_CONFIG` inesperados = incidente; `HOURLY_LIMIT`/`DAILY_LIMIT` repetidos = revisar limite ou rajada; `NO_GOVERNANCE_CONTEXT` ou `TYPE_UNKNOWN` = defeito de código; `LEDGER_UNAVAILABLE` = banco indisponível |
| G3 | cota devolvida por hora e motivo | mais de 20% dos admitidos devolvidos = falhas de provedor (cruzar com F1) |
| G4 | **duplicidade**: mesma chave admitida mais de uma vez | qualquer linha = pausar o ciclo e investigar a chave |
| G5 | uso corrente (última hora e 24 h) | acima de 80% do limite = avisar |
| G6 | mensagens ADIADAS (fila PENDING, sem tentativa gasta) por motivo, tipo e prioridade | crítico adiado por mais de 2 janelas = avisar a Diretoria; adiados crescendo sem queda = limite baixo ou rajada |

Além disso, as consultas O1 a O5 do doc 34 (seção 5.4) continuam valendo sobre `risk_alert_outbox`. Complementos somente leitura sobre as tabelas de entrega (colunas conferidas nas migrations):

```sql
-- F1: falhas e resultados incertos de envio (outbox de risco) na última hora; esperado: nenhuma linha
select status, suppression_reason, count(*) as qtd, max(attempt_count) as max_tentativas
  from public.risk_alert_outbox
 where created_at > now() - interval '1 hour' and status in ('FAILED')
 group by 1, 2;

-- F2: enviados por tabela de entrega e hora (comparar com G1)
select 'weekly_alert_digests' as origem, date_trunc('hour', sent_at) as hora, count(*) from public.weekly_alert_digests where status = 'SENT' and sent_at > now() - interval '24 hours' group by 1, 2
union all
select 'contract_alert_batches', date_trunc('hour', sent_at), count(*) from public.contract_alert_batches where status = 'SENT' and sent_at > now() - interval '24 hours' group by 1, 2
union all
select 'ssma_field_notification_deliveries', date_trunc('hour', sent_at), count(*) from public.ssma_field_notification_deliveries where status = 'SENT' and sent_at > now() - interval '24 hours' group by 1, 2
order by 2 desc;
```
Eventos auditados (`audit_log_entries`): `ALERT_GOVERNOR_ADMITTED`, `ALERT_GOVERNOR_RELEASED`, `ALERT_GOVERNOR_SUPPRESSED` (`actor_type` SYSTEM; `entity_type` `ALERT_SEND` ou `ALERT_SEND_SUPPRESSED`). Não há dados pessoais no detalhe (só motivo, fonte, tipo e instante).

## 8. Evidências de teste (locais, provedores FAKE)

`scripts/test-alert-send-governor.mjs` (puro + provedor com ledger em memória + estrutural) e `scripts/test-alert-send-governor-sql.mjs` (PGlite, tabela real `audit_log_entries`, ciclo real `runRiskAlertCycle`): abaixo do limite envia; no limite suprime e audita; lote maior que o tamanho divide em execuções sem gastar tentativa; fonte, projeto e tipo não habilitados bloqueiam; valor inválido bloqueia e audita sem vazar o valor; kill switch; reexecução do ciclo (mesmo instante e depois) e reenvio da mesma chave não reenviam; falha incerta nunca libera reenvio; concorrência entre instâncias não excede o limite; padrão com variáveis ausentes envia exatamente como o ciclo sem governador e sem tocar no ledger; o governador não afrouxa a trava do piloto; consultas G1 a G6 somente leitura.

## 9. Pendências e o que depende de autorização

- **Autorização da Diretoria (D8)** antes de criar qualquer `ACC_ALERT_*` na Vercel e antes de qualquer fase além de F0; este trabalho não enviou nem configurou nada.
- ~~P1~~ **resolvida** (seção 3.1): portão antes da reivindicação; excedentes não gastam tentativa. Resíduo: nos fluxos de e-mail do ciclo de risco, a montagem do conteúdo (inclusive emissão de tokens de resposta) ocorre antes do portão e se repete a cada adiamento; custo baixo, sem efeito sobre o destinatário.
- **P2**: fonte por **origem do dado** (e-mail, cronograma, diário) dentro do alerta de risco não é distinguida; hoje a fonte é a família do emissor (`RISCO`). Distinguir exige o campo de origem do caso no contexto de envio.
- **P3**: índice de apoio para a contagem global em `audit_log_entries` (só por `occurred_at`/`entity_type`). Requer migration; **não criada** para não alterar o plano de 70 itens. Com o volume do piloto a consulta é adequada (limite de 10 mil linhas na janela; acima disso o governador bloqueia por segurança). Alternativa sem migration: manter `ACC_ALERT_MAX_PER_DAY` baixo.
- **P4**: dedup por `dedupKey` só nos emissores com chave estável (ciclo de risco, lembretes, confirmações, especialista); os demais dependem das chaves/claims das próprias tabelas (seção 2).
- **P5**: alertas enviados antes da ativação do governador não entram no ledger; a janela começa vazia na primeira ativação.
- Contagem de saída conta **admissões** (envios tentados e não devolvidos), não aceite de entrega: aceite do provedor continua não sendo confirmação de entrega (`outbound-delivery.ts`).


## 10. Teste de massa e preservação (evidência local)

`test-alert-send-governor-sql.mjs`: 200 alertas simulados (20 críticos) com os valores de F0 (10/h, 30/dia, lote 5, só WEG) e provedor FAKE, execuções a cada 10 minutos: pico em 1 h = 10, pico em 24 h = 30, maior lote = 5, 0 duplicidades (28 reenvios do mesmo evento barrados), 200 de 200 enviados ao final (nada perdido), críticos antes dos comuns, outro projeto bloqueado. Variáveis ausentes: piloto igual ao atual e nenhuma linha no ledger. Variáveis inválidas: bloqueia, audita `INVALID_CONFIG` e o valor lido não aparece na mensagem nem na auditoria. Consulta G6 (monitoramento) lista os adiados.