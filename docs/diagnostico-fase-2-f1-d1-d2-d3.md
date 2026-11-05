# Diagnóstico da Fase 2 — F1, D1, D2 e D3

> Diagnóstico **documental**: nenhum código, permissão ou regra foi alterado. Base: `main` em `751fe2f` (produção) e leitura somente-consulta do banco de produção em 04/11/2026. Caminhos relativos a `apps/web/` salvo indicação. Fonte do manual: `docs/manual-referencia-acc.md`.
>
> **Rótulos:** **FATO** = lido no código ou no banco; **PROVADO** = executado em banco de teste; **DECISÃO** = depende de Reynaldo.

## Resumo das decisões pedidas

| # | Ponto | Decisão que destrava | Recomendação |
|---|---|---|---|
| **F1-a** | Para onde apontam os botões e links dos e-mails de alerta | Trocar os destinos que hoje levam a Eventos pelos destinos que já funcionam fora de Eventos (rota do lote) | **Trocar os destinos**; mantém Eventos administrativo |
| **F1-b** | O link do **título** do alerta (e-mail e lembrete) | Apontar para uma tela de resumo do alerta restrita ao destinatário, ou manter o link a Eventos só para Administrador | Resumo restrito (novo, pequeno) |
| **F1-c** | Timeline e "Consultar IA" para quem não é Administrador | Mostrar o evento sem link, ou criar o resumo restrito | Sem link + texto "Detalhe disponível ao Administrador" |
| **F1-d** | Token de e-mail acionável só confere "membro ativo" | Passar a conferir também o destinatário pretendido | Opcional (endurecimento) |
| **D1** | Quem revisa o grau de risco | Alinhar o banco à interface, ou a interface ao banco | Decidir a política de perfil primeiro |
| **D2** | Evento que vira ALTO e ainda pode sair no lote semanal | Filtrar o lote pelo grau efetivo, reagir à reclassificação, ou só documentar | Filtrar o lote pelo grau efetivo |
| **D3** | Validação da Matriz de SLA rejeita os próprios padrões | Corrigir a validação (intervalos), mudar a semântica, ou só documentar | Corrigir a validação |

---

# F1 — Links de alerta e 404 para quem não é Administrador

## F1.1 Situação atual (FATO)

Desde o PR #129, as páginas de **Eventos** (`/{obra}/ledger`, `/{obra}/ledger/{evento}`, `/{obra}/ledger/lote-alertas/{lote}`) chamam `requireProjectAdminPage` e devolvem **404** para quem não é Administrador ativo (`lib/email-authorization/guard.ts`). Isso **não** alcança as rotas fora de Eventos: `/alertas/...`, `/email-actions/{token}`, `/{obra}/acoes` e `/{obra}/documentos/...`.

### Quais links levam a 404 para destinatários não Administradores

| # | Origem | Link | Destino | Para não Administrador | Fonte |
|---|---|---|---|---|---|
| 1 | E-mail do **lote** (rodapé "RESPONDER AO ACC") | `{base}/{obra}/ledger/lote-alertas/{lote}` | Eventos | **404** | `lib/email/create-and-send-contract-alert-batch.ts:149`; `lib/email/templates/contract-alert-batch-template.ts:213,233` |
| 2 | E-mail do lote, plano B por alerta (`respondItemUrl`) | `…/ledger/lote-alertas/{lote}#evento-{evento}` | Eventos | **404** | `create-and-send-contract-alert-batch.ts:152`; `contract-alert-batch-template.ts:134-136` |
| 3 | Tela `/alertas/acao/{obra}/{lote}/{evento}` com vários alertas: botão "RESPONDER AO ACC" | `/{obra}/ledger/lote-alertas/{lote}#evento-{evento}` | Eventos | **404** (caso raro: o e-mail já usa `/alertas/lote` quando há vários alertas) | `app/alertas/acao/[projectId]/[batchId]/[eventId]/page.tsx:95` |
| 4 | **Título** do alerta no e-mail do lote | `{base}/{obra}/ledger/{evento}` | Eventos | **404** | `lib/email/run-contract-alert-batches.ts:223`; `templates/alert-body-parts.ts:18-20` |
| 5 | **Título** e âncoras de evidência/confronto do alerta **manual** (enviado por Administrador na aba Eventos) | `…/ledger/{evento}#…` | Eventos | **404** | `app/[projectId]/ledger/[eventId]/send-alert-actions.ts:94,158,181,253` |
| 6 | **Lembrete** recorrente de evento | `…/ledger/{evento}` | Eventos | **404** | `lib/alerts/contract-event-reminder-mailer.ts:63` |
| 7 | Links de **evidência** nos e-mails | `…/ledger/{evento}#{âncora}` | Eventos | **404** | `lib/alerts/alert-source-links.ts:55` |
| 8 | **Timeline**: cada evento da lista | `/{obra}/ledger/{evento}` | Eventos | **404** | `components/timeline/timeline-list.tsx:43` |
| 9 | **Busca da Timeline**: resultados de evento e de anotação | `/{obra}/ledger/{evento}` | Eventos | **404** | `app/[projectId]/timeline/timeline-search-actions.ts:679,725` |
| 10 | **Consultar IA**: fontes "Evento" e "Cláusula" | `/{obra}/ledger/{evento}` | Eventos | **404** | `lib/ai/alert-consult/load-alert-consult-subject.ts:39,46-50` |

### Links que **continuam funcionando** (não mexer)

| Origem | Link | Por que funciona |
|---|---|---|
| Botões **RESOLVIDO / EM ANDAMENTO / ENVIADO P/** do lote | `/alertas/acao/{obra}/{lote}/{evento}?acao=` (um alerta) ou `/alertas/lote/{obra}/{lote}?evento=&acao=` (vários) | Rotas fora de Eventos; a leitura e a gravação dependem do lote (abaixo) |
| Botões **DAR CIÊNCIA / ASSUMIR / DEFINIR PRAZO / RESPONDER AO ACC** do alerta unitário | `/email-actions/{token}` | Rota própria; token com verificação no banco (abaixo) |
| E-mails de **risco semanal** (trilha B) e de **escalonamento SLA** | `/{obra}/acoes/{id}` e `/{obra}/documentos/emails/{id}` | Não passam por Eventos (`lib/risk-alerts/build-risk-alert-emails.ts:107-108`; `app/[projectId]/acoes/actions.ts:692`) |
| `buildRespondToAccUrl` (`/ledger/{evento}?respond=acc…`) | — | Sem uso em e-mail no código atual (só definição e um teste de marca) |

**Conclusão (FATO):** o caminho de **resposta** ao alerta já existe fora de Eventos e funciona para o destinatário. O que quebra para não Administradores é o **botão "RESPONDER AO ACC" do rodapé do lote** (itens 1 a 3), o **título do alerta** (4 a 7) e os **links da Timeline e da Consultar IA** (8 a 10).

## F1.1-b Confirmado em produção (leitura somente-consulta do banco vinculado, 04/11/2026)

- Políticas `contract_alert_batches_select_recipient_or_admin` e `contract_alert_batch_items_select_recipient_or_admin` **existem**: `recipient_user_id = auth.uid()` **ou** `has_project_permission(project_id,'ADMIN')`.
- Função `save_contract_alert_batch_item_response` **existe** com a recusa a quem não é destinatário nem Administrador.
- Função `get_email_alert_action_context` **existe** e chama `is_project_member`.
- Dados reais: **15 lotes** e **8 tokens** de e-mail acionável.
- O código servido é o `main` em `751fe2f` (deploy Ready): os 10 links da tabela acima **estão no ar**. O 404 para não Administrador **não foi observado com conta real** (validação com conta sem privilégios adiada); é a consequência direta do guarda de página já publicado.

## F1.2 Proposta: fluxo restrito para "RESPONDER AO ACC" (Eventos continua administrativo)

**Princípio:** não liberar Eventos. Apontar o botão para a rota que **já existe** e já filtra por destinatário.

1. **Rodapé do e-mail do lote** (`batchUrl`), **`respondItemUrl`** e o **botão da tela `/alertas/acao`** passam a apontar para `/alertas/lote/{obra}/{lote}` (com `?evento={id}` quando houver). É a página que já usa o mesmo formulário (`ContractAlertBatchForm`) e as mesmas regras. Mudança de **3 linhas de URL**, sem permissão nova.
2. **Título do alerta**: duas opções (DECISÃO F1-b): (a) apontar para a mesma tela `/alertas/lote/...#evento-{id}` (resumo e resposta no mesmo lugar); (b) manter o link a Eventos **somente quando o destinatário for Administrador** (o e-mail é por destinatário, então o gerador pode decidir). Para o alerta **manual** (enviado por Administrador a outros membros) e para o **lembrete**, a opção (a) pede uma tela de resumo restrita nova: `/alertas/evento/{obra}/{evento}`, somente leitura (título, grau, cláusula, evidências), com as verificações abaixo.

### Como o servidor verifica usuário, projeto e alerta

**Para a resposta do lote (já implementado — FATO):**

| Verificação | Onde e como |
|---|---|
| **Usuário** | `proxy.ts:46-66` exige sessão (sem login → `/login?next=`); a leitura usa o cliente da **sessão** (`lib/email/get-contract-alert-batch.ts`) e a gravação usa `auth.uid()` na função do banco |
| **Projeto** | A consulta filtra `.eq("project_id", projectId)`; id de outro projeto resulta em nulo. A RLS do lote vale por projeto |
| **Alerta** | Lote por `id` + `project_id`; o item precisa pertencer ao lote (`batch.items.some(eventId)`); a função do banco recusa "O alerta não pertence a este lote." |
| **Quem lê** | RLS `contract_alert_batches_select_recipient_or_admin`: `recipient_user_id = auth.uid()` **ou** Administrador do projeto (`supabase/migrations/20260921130000_contract_alert_batches_foundation.sql:182-188`); os itens seguem a mesma regra (`:189`) |
| **Quem grava** | `save_contract_alert_batch_item_response`: exige `recipient_user_id = auth.uid()` **ou** Administrador; lote existente, não respondido e disponível (`supabase/migrations/20261027140000_alert_batch_partial_responses.sql:52-61,69`) |
| **Mensagem** | Uniforme: "Este link não existe ou seu usuário não tem acesso aos alertas." (não revela se o lote existe) |

**Para o alerta unitário por token (já implementado — FATO):** `get_email_alert_action_context` exige login, token existente e `is_project_member`, devolve a mesma mensagem para "não existe" e "sem acesso", e calcula `can_execute` pelo prazo (expirado), uso único (consumido) e perfil: ACKNOWLEDGE e RESPOND para qualquer membro ativo; ASSUMIR e DEFINIR PRAZO para Administrador, Gestor ou Gerente (`supabase/migrations/20260829200000_project_permission_gerente_compat.sql:323-390`). **Lacuna (DECISÃO F1-d):** o token guarda `intended_recipient_email`, mas a função **não compara** o e-mail do usuário logado com ele; qualquer membro ativo do projeto que receba o link consegue agir. Endurecimento opcional: exigir que o e-mail do usuário seja o destinatário pretendido (ou Administrador).

**Para o novo resumo restrito `/alertas/evento/{obra}/{evento}` (proposta):** (1) sessão; (2) `projectId` + RLS de membro ativo; (3) **o usuário precisa ser destinatário do alerta**: existir item de lote do evento em lote cujo `recipient_user_id = auth.uid()`, **ou** ação SLA do evento com `responsible_user_id = auth.uid()` ou nível de escalonamento atribuído a ele, **ou** ser Administrador; (4) resposta uniforme "não existe ou sem acesso" (404 igual para os três casos de negação). Só leitura; sem links para Eventos.

## F1.3 Timeline, busca e Consultar IA (análise à parte)

| Caso | Hoje | Opções (DECISÃO F1-c) |
|---|---|---|
| **Timeline** (lista de eventos) | Todo membro vê a lista; o clique leva a Eventos (404 para não Administrador) | **A.** Para não Administrador, mostrar o cartão **sem link**, com "Detalhe disponível ao Administrador" (o servidor já sabe o perfil e pode passar `canOpenEvents` ao componente cliente). **B.** Resumo restrito `/alertas/evento` (só se houver alerta). **C.** Liberar leitura do evento (contraria "Eventos administrativo") |
| **Busca da Timeline** | Resultados de evento e de anotação apontam a Eventos; os demais resultados (documentos, e-mails etc.) têm links próprios e **não** são afetados | Mesma regra da Timeline; a busca grava nada |
| **Consultar IA** | A página `/alertas/consulta-ia/{obra}/{tipo}/{id}` abre para **qualquer membro ativo** da obra (`getCurrentProjectPermission` + RLS + filtro de projeto; `app/alertas/consulta-ia/[projectId]/[subject]/[id]/page.tsx:24-25`); as **fontes** "Evento" e "Cláusula" usam o link a Eventos | Para não Administrador, mostrar essas duas fontes como **texto** (sem link) e manter as fontes de evidência com link próprio |
| **Mensagem do 404** | Genérica ("página não encontrada") | Opcional: para quem é membro, "Esta área é do Administrador da obra" (sem revelar dados) |

## F1.4 Testes propostos

**Matriz:** destinatário autorizado × outro membro do mesmo projeto (não Administrador, não destinatário) × usuário de outro projeto × anônimo × Administrador.

| # | Teste | Camada | Esperado |
|---|---|---|---|
| T1 | Destinatário abre e responde o lote | banco local (PGlite) com as políticas reais; função de gravação | lê o lote e os itens; grava a resposta de um item do lote |
| T2 | **Outro membro** do mesmo projeto | PGlite | `select` do lote e dos itens devolve **vazio**; a função de gravação **recusa** ("Você não tem permissão…") |
| T3 | **Membro de outro projeto** | PGlite | `select` vazio; gravação recusada; lote de projeto A consultado com `project_id` de B → nulo |
| T4 | Administrador | PGlite | lê e responde (comportamento atual preservado) |
| T5 | Anônimo | PGlite | sem acesso à tabela |
| T6 | Item que **não pertence** ao lote | PGlite | "O alerta não pertence a este lote." |
| T7 | `getContractAlertBatch` com 3 sessões | código real do app contra o banco local (mesmo método do teste do histórico jurídico) | nulo para outro membro e outro projeto; página mostra a mensagem uniforme |
| T8 | Token: membro de outro projeto, expirado, já usado, perfil insuficiente | PGlite (função do token) | "Token not found or not accessible"; `can_execute` falso nos demais |
| T9 | **Estático:** nenhum e-mail gerado para destinatário não Administrador contém `/ledger/` | análise de código dos montadores de e-mail | falha se algum montador apontar a Eventos sem condicionar ao perfil |
| T10 | **Estático:** o rodapé do lote e o botão de `/alertas/acao` apontam para `/alertas/lote/` | análise de código | passa depois da correção |
| T11 | Navegador (sessão real): destinatário não Administrador abre o e-mail do lote e responde; outro membro e usuário de outro projeto veem a mensagem uniforme | manual/depois | depende de **contas reais** (adiado) |

---

# D1 — Quem revisa o grau de risco: interface × servidor × banco

## D1.1 Comparação (FATO)

| Camada | Perfis que aceita ou anuncia | Fonte |
|---|---|---|
| Texto da tela (painel de revisão) | "gestor, gerente ou administrador" | `components/risk/risk-review-panel.tsx:144,261` |
| Controle da tela em **Eventos** (`canReview`) | ADMINISTRADOR, GESTOR, GERENTE | `components/risk/risk-review-section.tsx:39` (hoje a página é só do Administrador) |
| Controle da tela em **Providências** (`canEdit` → `canReview`) | ADMINISTRADOR, GESTOR, GERENTE | `lib/delivery/delivery-data.ts:73`; `components/delivery/delivery-items-table.tsx:162-170` |
| **Ação do servidor** | **não confere perfil**; chama a função do banco e repassa a mensagem | `app/[projectId]/risco/actions.ts:13,64` |
| **Função do banco** `review_risk_classification` | exige `has_project_permission(obra,'GESTOR')`; erro: "…exige gestor, gerente ou administrador da obra." | `supabase/migrations/20261028120000_risk_classification_reviews.sql:122-124` |
| **Função de permissão** `has_project_permission` | ADMINISTRADOR = nível 3; GESTOR/GERENTE/COLABORADOR/LEITURA = nível 1; a exigência `'GESTOR'` = nível 2 ⇒ **só ADMINISTRADOR passa** | `supabase/migrations/20260829200000_project_permission_gerente_compat.sql:69-119` |
| **Produção** (consulta somente leitura, 04/11/2026) | `has_project_permission`: ADMINISTRADOR nível 3, GESTOR nível 1, exigência `'GESTOR'` nível 2. `review_risk_classification` existe e exige `'GESTOR'` | leitura direta das definições no banco vinculado |

**Efeito real (FATO + PROVADO):** só o **Administrador** consegue registrar a revisão do grau. Em **Providências**, Gestor e Gerente **veem o formulário** e recebem recusa ao salvar, com a mensagem "exige gestor, gerente ou administrador". Em **Eventos** a divergência ficou escondida, porque a página agora é só do Administrador. A afirmação "sem prova em produção" do manual (6.4) deixa de valer: **está provado em produção**. O manual 6.8/D11 também fica desatualizado: a função de revisão **existe em produção**.

## D1.2 Opções (DECISÃO D1)

| Opção | O que muda | Risco |
|---|---|---|
| **A. Alinhar o banco à interface** (Gestor e Gerente revisam) | Nova regra de permissão específica para revisão (por exemplo, uma função auxiliar que aceita ADMINISTRADOR, GESTOR e GERENTE) e migration; não altera o resto das permissões | Muda quem altera o grau efetivo (afeta recorrência de lembretes); exige migration em produção |
| **B. Alinhar a interface ao banco** (só Administrador) | `canReview` só para ADMINISTRADOR em Providências e Eventos; texto "administrador da obra" na tela e na mensagem do banco | Sem migration de regra (a mensagem do banco pode ficar); reduz o que Gestor e Gerente "veem" |
| **C. Manter e documentar** | Só o texto do manual e da AXIA | A tela continua prometendo mais do que o banco aceita |

---

# D2 — Evento que vira ALTO: gatilho, momento do envio e duplicidade

## D2.1 Gatilho (FATO + PROVADO)

**Não existe gatilho de envio quando um evento é reclassificado para ALTO.** Reclassificar (`review_risk_classification`) grava o histórico imutável (`risk_classification_reviews`) e passa o acompanhamento recorrente **aberto** ao intervalo do novo grau; **não cria nem altera** `sla_actions`, **não envia** nada e não move o evento de lote (`20261028120000_risk_classification_reviews.sql:148-157`). Verificado por execução em banco de teste (manual 6.7.4).

## D2.2 Quando o alerta de um evento sai (FATO)

| Caminho | Quando | Condição | Fonte |
|---|---|---|---|
| **Envio manual** do alerta do evento | Quando o Administrador envia, a **qualquer grau** (inclusive ALTO/CRÍTICO) | Perfil Administrador; destinatário membro ativo; confronto com justificativa | `ledger/[eventId]/send-alert-actions.ts:21,73-80,108-125`; `lib/email/send-contract-alert-email.ts:87-91` |
| **Lote semanal automático** | **Quarta-feira 10:10 UTC** (07:10 em São Paulo), pelo workflow do GitHub `10 10 * * 3` (o cron da Vercel `0 10 * * 3` dispara **outra** rotina, o resumo semanal de ações sem evento) | Ação SLA `LOW`/`MEDIUM` com responsável, `related_event_id` e status aberto | `.github/workflows/contract-alert-batches.yml:5`; `apps/web/vercel.json:5-6` (rota `/api/cron/weekly-alert-digest`); `lib/email/run-contract-alert-batches.ts:71-80` |
| Casos de risco do **módulo semanal** (trilha B) | ALTO/CRÍTICO no próximo ciclo horário (`20 * * * *`) | Não é o evento do Ledger | manual 6.7.2 |

**A seleção do lote usa o grau da ação SLA (`sla_actions.risk_level`), não a severidade do evento** (`run-contract-alert-batches.ts:73`), e o e-mail **exibe** o grau efetivo do evento (`:207`). Consequência (PROVADO, manual 6.7.4): um evento reclassificado para ALTO que **ainda tem ação LOW/MEDIUM e nunca entrou em lote** continua elegível e **sai na quarta com "ALTO" no corpo**. Evento ALTO **sem** ação SLA não entra no lote.

## D2.3 Como o sistema evita duplicidade (FATO)

| Mecanismo | Efeito | Fonte |
|---|---|---|
| Exclui eventos que já estão em lote `PENDING`, `SENT` ou `RESPONDED` | Um evento não volta a sair enquanto o lote vigente existir | `run-contract-alert-batches.ts:85-117` |
| Um evento por lote (uma ação SLA por evento; em duplicidade, vale o maior risco) | Sem repetição dentro do lote | `run-contract-alert-batches.ts:117-128`; `unique (batch_id, event_id)` (`20260921130000…:134`) |
| Um e-mail por obra e destinatário | Agrupamento | `lib/alerts/batch-grouping.ts` |
| Reserva ativa por evento (índice único) | Duas execuções simultâneas não pegam o mesmo evento | `supabase/migrations/20260923210000_contract_alert_batch_dispatch_claims.sql:35` |
| Lote `FAILED` libera o evento | Reprocessamento sem duplicar | mesmas consultas (só bloqueia os estados vigentes) |
| Reclassificar depois do lote | **Não reenvia** e o item mantém a severidade antiga | manual 6.7.4 (PROVADO) |

## D2.3-b Estado em produção (leitura, 04/11/2026)

Há **23 ações SLA**: MÉDIO 6 pendentes, BAIXO 2 pendentes e 1 escalada, ALTO 7 escaladas e 1 pendente, CRÍTICO 6 escaladas. Nas **3 quartas agendadas** (14, 21 e 28/10) o lote semanal rodou com sucesso e encontrou **0 eventos elegíveis**: nenhum lote automático por agenda foi enviado em produção. **Hoje** a rotina está **desabilitada** desde 03/11/2026 10:22 (-03:00). A divergência D2 é **latente**: só vale quando a rotina for religada e houver ação BAIXO ou MÉDIO com responsável e evento.

## D2.4 Opções (DECISÃO D2)

| Opção | O que muda |
|---|---|
| **A. Filtrar o lote pelo grau efetivo** | O lote exclui eventos cujo grau efetivo é ALTO ou CRÍTICO (a regra declarada é "lote só para BAIXO/MÉDIO") e eles passam a depender do envio manual ou de uma regra imediata |
| **B. Reagir à reclassificação** | Ao reclassificar para ALTO/CRÍTICO, atualizar ou cancelar a ação SLA e disparar a cobrança imediata (trilha B) — mudança maior |
| **C. Manter e documentar** | Texto do manual e da AXIA (já proposto em R9/R10) |

---

# D3 — Matriz de SLA: prazos efetivos

## D3.1 O que a matriz padrão calcula (FATO — `lib/sla/default-matrix.ts:17-70`; `lib/sla/compute-escalation.ts:1-24,123-139`)

Os três números de cada grau são **intervalos em cadeia**, não horários absolutos: **assumir** (a partir do início, T0) → **+ intervalo do Nível 2** → **+ intervalo do Nível 3**.

### Tabela 1 — Prazo de ação (assumir)

| Grau | Prazo para assumir | Unidade | Pede ciência | Pede justificativa de atraso |
|---|---|---|---|---|
| CRÍTICO | **1** | horas **corridas** | sim | sim |
| ALTO | **4** | horas **úteis** | sim | sim |
| MÉDIO | **1** | dias **úteis** | não | sim |
| BAIXO | **3** | dias **úteis** | não | sim |

Prazos de *responder* e *concluir*: **nulos** por padrão. Expediente padrão 08:00–18:00, segunda a sexta, `America/Sao_Paulo`; **feriados não são considerados** (`lib/sla/time-units.ts`).

### Tabela 2 — Escalonamento (marcos acumulados desde T0)

| Grau | Sobe ao Nível 2 (gerência) | Sobe ao Nível 3 (Diretoria) | Limite atingido | Intervalos digitados (assumir / N2 / N3) |
|---|---|---|---|---|
| CRÍTICO | T0 + **1 h** | T0 + **2 h** | T0 + **4 h** | 1 / 1 / 2 |
| ALTO | T0 + **4 h úteis** | T0 + **8 h úteis** | T0 + **12 h úteis** | 4 / 4 / 4 |
| MÉDIO | T0 + **1 dia útil** | T0 + **2 dias úteis** | T0 + **3 dias úteis** | 1 / 1 / 1 |
| BAIXO | T0 + **3 dias úteis** | T0 + **6 dias úteis** | T0 + **8 dias úteis** | 3 / 3 / 2 |

Só **ALTO e CRÍTICO** sobem por prazo no ciclo automático (`lib/risk-alerts/plan-risk-alerts.ts:261`); MÉDIO e BAIXO escalam apenas pelo botão "Verificar escalonamentos" e em ações SLA manuais. O aviso sai **no primeiro ciclo depois** do marco (manual 7.5).

### Tabela 3 — Frequência de envio (outra escala, independente)

| O quê | Frequência | Fonte |
|---|---|---|
| Ciclo de riscos do módulo semanal (ALTO/CRÍTICO, escalonamento) | **de hora em hora** (`20 * * * *`) | `.github/workflows/weekly-schedule-email-ingestion.yml:32` |
| Consolidado de riscos MÉDIO/BAIXO (módulo semanal) | **quarta-feira ≥ 07:00** no fuso do projeto | `lib/risk-alerts/digest-window.ts` |
| Lote semanal dos eventos do Ledger (BAIXO/MÉDIO) | **quarta-feira 10:10 UTC** (workflow do GitHub) | `contract-alert-batches.yml:5` |
| Resumo semanal de ações SLA **sem** evento | **quarta-feira 10:00 UTC** (cron da Vercel) | `apps/web/vercel.json:5-6` |
| Lembretes recorrentes ao responsável | CRÍTICO **1 dia**, ALTO **2**, MÉDIO **4**, BAIXO **7** (corridos); rotina a cada 30 min | `lib/alerts/repeat-policy.ts:10-22`; `.github/workflows/alert-reminders.yml:11` |

## D3.1-b Como o motor lê os três números gravados (reconciliação do limite de CRÍTICO)

**Valor gravado (padrão do código, `lib/sla/default-matrix.ts:56-69`):** CRÍTICO = `assumeDeadlineValue 1`, `escalation2AfterValue 1` (rótulo da tela "Até 2º escalão"), `boardAfterValue 2` (rótulo "Até Diretoria"), unidade `CLOCK_HOURS` (horas corridas).

**Como o motor interpreta** (`lib/sla/compute-escalation.ts:100-142`): cada número é um **intervalo contado a partir do marco calculado do passo anterior**, e não a partir do horário em que o aviso saiu.

| Passo | Fórmula | Campo gravado | Contado a partir de |
|---|---|---|---|
| Marco A — sobe ao **Nível 2** (gerência) | `T0 + assumir` | `assumeDeadlineValue` = 1 | **T0**, o instante do ciclo que detectou o caso |
| Marco B — sobe ao **Nível 3** (Diretoria) | `marco A + escalation2AfterValue` | 1 | **marco A** (o vencimento calculado do prazo de assumir) |
| Marco C — **limite atingido** (`TOP_LEVEL_REACHED`) | `marco B + boardAfterValue` | 2 | **marco B** (o vencimento calculado da Diretoria) |

**Exemplo (fictício, CRÍTICO padrão 1 / 1 / 2, horas corridas):**

| | Cálculo | Horário |
|---|---|---|
| **T0** (ciclo detecta o risco) | — | ter 10/11, **14:20** |
| **Prazo para assumir** (marco A) → Nível 2 | 14:20 + 1 h | **15:20** |
| **Nível 3** (marco B) | 15:20 + 1 h | **16:20** |
| **Limite** (marco C) | 16:20 + **2 h** | **18:20** |

**Reconciliação:** o "**+2 h**" do registro anterior é o **intervalo** entre o marco do Nível 3 e o limite (valor gravado `boardAfterValue = 2`). O **limite**, contado desde T0, é **4 h** (1 + 1 + 2). Os dois registros estão certos: um fala do intervalo, o outro do total acumulado. Em ALTO (4 h úteis, 4, 4) o limite é T0 + 12 h úteis; em MÉDIO (1, 1, 1 dias úteis), T0 + 3 dias úteis; em BAIXO (3, 3, 2 dias úteis), T0 + 8 dias úteis. **Correção de rótulo no manual (6.7.1):** as colunas "até Nível 2" e "até Nível 3" descreviam os campos de forma ambígua; passam a dizer "intervalo entre o prazo de assumir e a subida à Diretoria" e "intervalo entre a Diretoria e o limite".

**Vencimento calculado × horário efetivo do aviso (FATO — `compute-escalation.ts:223,236,245`; `docs` do manual 7.5):**
- O **vencimento** é o marco calculado (15:20, 16:20, 18:20 no exemplo). O motor só age quando **`agora` é estritamente maior** que o marco, e só quando **um ciclo roda**.
- O **aviso efetivo** sai no **primeiro ciclo depois do marco**. O agendamento nominal é de hora em hora (`20 * * * *`), mas as execuções **observadas** do GitHub nos últimos dias foram em 01/11 07:38, 15:15, 19:45, 23:39; 02/11 06:19, 16:18, 23:37; 03/11 06:55 UTC, isto é, **a cada 4 a 10 horas**. O aviso pode, portanto, chegar horas depois do vencimento.
- Se **vários marcos** vencem entre dois ciclos, o motor usa o maior nível já vencido: o aviso pode ir **direto à Diretoria**, sem passar pelo Nível 2.
- Um **vencimento** nunca é recalculado pelo horário em que o aviso saiu: um aviso atrasado **não** adia os marcos seguintes.

**Feriados nacionais consomem prazo útil? Sim (FATO):** o motor só exclui **sábado e domingo** (`lib/sla/time-units.ts:115-116`). Feriados nacionais, regionais e municipais **não são descontados** (`time-units.ts:8-13`: "LIMITAÇÃO CONHECIDA … feriados … NÃO são descontados"; `supabase/migrations/20260822123400_sla_project_settings.sql:13`: "Sem calendário de feriados nesta fase"; a tela diz "Feriados ainda não são considerados nesta versão", `components/sla/sla-project-settings-form.tsx:57`). Um feriado em dia de semana conta como dia útil inteiro em ALTO, MÉDIO e BAIXO. CRÍTICO usa horas corridas e nunca depende de calendário.

## D3.1-c Rotinas: agenda, último sucesso confirmado e estado em produção

**Regra aplicada:** só consta como **ativa** a rotina com **evidência de que está habilitada**. Configuração no código não basta. Evidências usadas: estado do workflow no GitHub (`gh`), execuções e logs, e registros gravados no banco de produção (consultas de leitura).

| Rotina | Agenda | Último sucesso confirmado | Estado em produção |
|---|---|---|---|
| **Ciclo horário de risco e escalonamento** (`weekly-schedule-email-ingestion.yml`, job `risk-alerts` → `/api/cron/risk-alerts`) | nominal `20 * * * *`; execuções reais a cada 4–10 h | **03/11/2026 06:55 UTC**: HTTP **200** nas 8 últimas execuções (200 = ciclo executou; 204 seria flag desligada). Último registro de escalonamento: **02/11 16:20:57 UTC** (14 no total). Último envio real de alerta de risco (`SENT`): **26/09/2026 15:06 UTC** (3 enviados; 31 registros na outbox, os demais suprimidos ou pendentes) | **DESLIGADO**: workflow desabilitado manualmente em **03/11/2026 10:22 (-03:00)**. A flag `ACC_WEEKLY_REPORTS_ENABLED` está `true` no GitHub (desde 25/09) e estava **ligada na Vercel** até a última execução (resposta 200) |
| **Lote semanal de eventos do Ledger** (`contract-alert-batches.yml` → `/api/cron/contract-alert-batches`) | quarta 10:10 UTC (`10 10 * * 3`); o GitHub atrasa 5–6 h | **28/10/2026 16:34 UTC** (sucesso). Nas 3 quartas agendadas (14, 21 e 28/10) o resultado foi `eventsEligible 0`, **nenhum lote enviado**. Último lote enviado: **10/10/2026 02:05 UTC** (15 lotes no total, todos enviados ou respondidos) | **DESLIGADO**: workflow desabilitado em **03/11/2026 10:22 (-03:00)**. Nenhum lote automático por agenda chegou a ser enviado em produção |
| **Resumo semanal de ações SLA sem evento** (cron da **Vercel**, `/api/cron/weekly-alert-digest`) | quarta 10:00 UTC (`0 10 * * 3`); execuções reais às 10:11 UTC | **28/10/2026 10:11 UTC** (enviado). Antes: 14/10 e 21/10 (enviados) | **AGENDADO e EXECUTANDO**, com **falha** na última: em **04/11/2026 10:11 UTC** o registro ficou `FAILED` — "Falha no envio do resumo semanal." A causa **não foi determinada** (logs de runtime retidos por 1 h no plano atual). Observação, sem afirmar causalidade: as variáveis do piloto foram criadas na Vercel em 03/11 13:35 UTC, depois do último sucesso |
| **Lembretes recorrentes** (`alert-reminders.yml`) | a cada 30 min nominal | execuções agendadas com sucesso até **03/11/2026**; **0 acompanhamentos recorrentes e 0 eventos gravados** no banco: nenhum lembrete foi enviado em produção | **DESLIGADO**: workflow desabilitado em **03/11/2026 10:22 (-03:00)** |
| Saúde do sistema (Vercel, `/api/cron/system-health`) | diário 10:30 UTC | declarado no `vercel.json` do deploy `751fe2f` | agendado; execução **não verificada** |

**Leitura (FATO):** em 04/11/2026 só o **resumo semanal de ações sem evento** continua rodando (e falhou hoje). Os três mecanismos automáticos do GitHub (ciclo de risco e escalonamento, lote de eventos e lembretes) estão **desligados desde 03/11 10:22**, por decisão manual (trava do piloto). O botão "Verificar escalonamentos" e o envio manual do Administrador **não dependem** dessas rotinas. **Esta tabela muda com o tempo**: precisa ser relida antes de qualquer afirmação operacional.

## D3.1-d Calendário de feriados: fontes e regra pretendida (04/11/2026)

- **Motor publicado (FATO, deploy `751fe2f`):** exclui só sábado e domingo; feriado de segunda a sexta conta como dia útil. Crítico (horas corridas) não depende de calendário.
- **Fontes indicadas:** iCalendário (datas nacionais) e Calendarr (estaduais por UF). São secundárias; as datas foram conferidas em fontes oficiais onde possível: Lei 662/1949 (com a Lei 10.607/2002), Lei 6.802/1980 (12/10) e Lei 14.759/2023 (20/11) para as nacionais; Lei SP 9.497/1997 para 09/07. **Goiás:** o Calendarr diz "sem feriado estadual", mas portais de Goiás e do TJGO citam 24/10 e 28/10; **divergência não resolvida**. Detalhes na nota E de `docs/qa-axia-lote-1.md`.
- **Regra pretendida (PROPOSTA):** calendário da obra = fins de semana + nacionais confirmados + estaduais da UF da obra; municipais, setoriais e facultativos só por inclusão do Administrador, com regra aplicável. Exemplos executados na nota F (20/11/2026 e 09/07/2027): o prazo de assumir de um Alto de 4 h úteis passa de sexta 11:20 para segunda 11:20.
- **Pré-requisito:** o projeto só tem `location` em texto livre; a UF precisa de campo estruturado.
- **Tarefa separada H1 (não faz parte da decisão D3):** adotar o calendário no motor. A decisão D3 continua sendo só a validação/preenchimento da Matriz.

## D3.2 O problema (FATO)

A tela da Matriz valida "**Até 2º escalão** > **Prazo assumir**" e "**Até Diretoria** > **Até 2º escalão**" (`lib/sla/validate-matrix-rule.ts:42-52`), tratando os campos como **valores absolutos crescentes**, mas o motor os soma como **intervalos**. Resultado: **nenhum dos quatro padrões passa na própria validação** (CRÍTICO 1/1/2 falha em 1 ≤ 1; ALTO 4/4/4; MÉDIO 1/1/1; BAIXO 3/3/2 falha em 2 ≤ 3). O envio real do piloto exige as quatro regras **salvas explicitamente** (`lib/risk-alerts/pilot-readiness.ts:76-90`), então o Administrador precisa digitar números que passem — e, **como são intervalos**, digitar "1/2/3" produziria marcos 1 h, 3 h e 6 h, não o que a tela sugere.

## D3.3 Opções (DECISÃO D3)

| Opção | O que muda | Risco |
|---|---|---|
| **A. Corrigir a validação** (aceitar intervalos ≥ 1, sem exigir ordem crescente) | Só a regra de validação e os rótulos ("Intervalo até o Nível 2/3") | Baixo; preserva os prazos efetivos da Tabela 2 |
| **B. Mudar o motor** para valores absolutos acumulados | Reescrever cálculo e migrar valores salvos | Alto; muda prazos de matrizes já salvas |
| **C. Só documentar** | Instrução ao Administrador | A tela continua rejeitando os padrões |

---

# O que fica para depois da revisão

Integração do Q&A à AXIA, mudanças de permissão, correção de links e abertura de PR **não** foram feitas. Cada ponto acima só avança com a decisão indicada.
