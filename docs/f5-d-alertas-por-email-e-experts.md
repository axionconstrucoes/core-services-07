# Fase 5 / Frente D — Alertas por e-mail e situação dos EXPERTS

Escopo: nova fonte de caso de risco `EMAIL`, quatro botões (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA) para todas as áreas acionáveis, prova do mecanismo de e-mail (Gmail-like e Outlook-like) e situação de todos os EXPERTS.
Tudo abaixo foi validado com **fixtures e transporte falso** (nenhum e-mail real, nenhuma chamada a Gmail/Graph, nenhum banco operacional). Onde algo é real no código mas NÃO foi visto em produção, está dito.

## 1. Fonte `EMAIL` (alertas originados por e-mail)

| Item | Decisão / comportamento |
|---|---|
| Entrada | `email_risk_signals` (Frente B) unida a `email_message_classifications` (mesma mensagem). Leitura somente leitura: `apps/web/lib/risk-alerts/load-email-risk-signals.ts`. Tabelas ainda inexistentes (migrations da Frente B não aplicadas) => lista vazia, nenhum caso EMAIL, sem derrubar o ciclo. |
| Coletor | `apps/web/lib/risk-alerts/collect-email-risk-cases.ts` (puro) — ligado em `supabase-store.ts` junto aos três coletores existentes. |
| Elegibilidade (fail-closed) | Só `is_indication = true`, `project_link_status = LINKED` e `status = ANALYZED`. Candidata, ambígua, sem vínculo, não analisada, sem classificação ou pilar desconhecido NÃO vira alerta. Nunca se vincula projeto por coincidência de domínio (isso é decisão da Frente B/C). |
| Um caso por sinal | `source_id` = id do sinal; `originPath` = `documentos/emails/<email_id>` (rastreável até o e-mail original, que não é alterado). Idempotente (mesmo sinal => mesmo caso; testado). |
| Área da Matriz | PRAZO→PLANEJAMENTO, CUSTO→COMERCIAL, SEGURANÇA→ESG_SSMA, QUALIDADE→ENGENHARIA, JURÍDICO→JURIDICO. Tipos de sinal de seguro/apólice/sinistro/garantia/fiança/caução/endosso => JURIDICO. **Não existe área "Qualidade" na Matriz de SLA**: Qualidade responde pela ENGENHARIA (o ESPECIALISTA, porém, é roteado pelo assunto e abre o Analista de Qualidade). |
| Grau | Regra determinística pelo tipo do sinal: paralisação/suspensão/acidente/embargo = CRÍTICO; cancelamento/descumprimento/pleito/ordem fora da competência/notificação/RNC/atraso/sinistro = ALTO; reajuste/aumento/renegociação/escassez/substituição/defeito/conflito/reclamação = MÉDIO; **tipo desconhecido => REVIEW_REQUIRED** (nunca um default ativo). |
| Indício ≠ fato | Sinal não confirmado (`confirmed = false`) **nunca passa de ALTO**; CRÍTICO exige `confirmed = true`. Texto do alerta separa: INDÍCIO (não comprovado) · FATO no e-mail · INFERÊNCIA da regra (`rule_version`) · RECOMENDAÇÃO. |
| Sem dado | Impacto ausente => "SEM DADOS". Nada de atraso/valor/cláusula inventado; cláusula e autoridade (`authority_check`, `clause_ref`) só são referenciadas quando existem. |
| Conteúdo não confiável | Texto de terceiros é sanitizado (sem CR/LF/controles/bidi, 240 caracteres) e escapado no HTML; instrução embutida (`detectEmbeddedInstructions` ou `injection_flag`) => REVIEW_REQUIRED e o trecho NÃO é reproduzido no alerta. |
| SLAs | Aplicados pela Matriz existente (CRÍTICO 1h corrida, ALTO 4h úteis — conferidos no ciclo simulado: 10h→11h e 10h→14h de Brasília). **MÉDIO/BAIXO não abrem ação SLA individual: o motor existente só cria ação para ALTO/CRÍTICO; esses casos entram no consolidado semanal.** MÉDIO 2 d.u. / BAIXO 5 d.u. vivem na Matriz (aplicação prospectiva está na Frente/migration 20261121177000, que NÃO foi tocada nem aplicada aqui; as 9 ações abertas permanecem intactas). |
| Migration | `20261204100000_risk_alert_cases_email_source.sql` só amplia o CHECK de `risk_alert_cases.source_type`. Não redefine função (corpo de `record_risk_alert_action` com MD5 idêntico antes/depois — testado), não altera SLA/dados. Rollback em `supabase/rollbacks/` recusa-se se houver casos EMAIL. |

## 2. Botões para todas as áreas

Testado (`scripts/test-f5-d-email-alerts.mjs`, testes 8–10): as 4 ações funcionam nas **9 áreas** (DIRETORIA, ADMINISTRATIVO, COMERCIAL, FINANCEIRO, ENGENHARIA, ORCAMENTO, JURIDICO, PLANEJAMENTO, ESG_SSMA) e nos 4 graus, pela máquina de estados real e, no Postgres (PGlite), pela RPC `record_risk_alert_action` protegida.

- RESOLVIDO encerra **somente** o caso do alerta e a ação SLA. Provado no banco: RNC, garantia (caso de garantia) e sinistro permanecem byte a byte iguais (`test-f5-d-email-alerts-sql.mjs`, E3). A RPC não escreve nessas tabelas; RNC/garantia/sinistro seguem seus fluxos próprios.
- CRÍTICO: RESOLVIDO vira proposta de resolução que exige confirmação (regra existente, inalterada).
- ESPECIALISTA é consulta textual somente leitura (não muda o estado do alerta). O Expert vem da escolha explícita, do nome citado, do assunto do caso ou da área; **a AXIA nunca é destino**.
- Lacuna declarada: DIRETORIA e ADMINISTRATIVO não têm Expert dedicado; o ESPECIALISTA nesses casos exige seleção explícita ou curadoria multi-Expert (nenhum Expert é presumido). Casos EMAIL nunca caem nessas áreas.

## 3. Mecanismo de e-mail (SIMULADO x REAL)

| Item | Situação |
|---|---|
| HTML Gmail-like (https + mailto) | **Simulado/provado**: 4 links autenticados `/{projeto}/alertas/{caso}?acao=…` (GET só pré-seleciona; a ação é POST revalidado no servidor), 3 `mailto:` seguros (< 2000 caracteres, token por item, sem dado do alerta no corpo), sem `<script>`/`<form>`/`javascript:`. |
| Outlook-like | **Simulado/provado**: VML condicional (`mso`) + `bgcolor` por botão ativo, texto simples com os 4 atalhos. Compatibilidade já coberta por `test-email-outlook-compat.mjs`. |
| Injeção de cabeçalho | Assunto com CRLF não gera cabeçalho Bcc no MIME. |
| Envio real | **Continua bloqueado** (provider falso + rede cortada no teste; modo piloto/trava de remetente existentes intactas). **Não foi enviado nenhum e-mail nem aberto nenhum cliente real**: a renderização no Gmail/Outlook de verdade NÃO foi vista (depende de homologação humana). |

## 4. Situação dos EXPERTS (código x operação)

"Ativo" abaixo = existe e está implementado no código do repositório (`IMPLEMENTED`). **Se o provider de IA real está ligado em produção NÃO é comprovável por este repositório** (depende de variáveis de ambiente/segredos; padrão do código = `fake`).

| Área | Expert | Ativo / provider | Fontes de contexto (AVAILABLE) | Fontes futuras (não consumidas) | Limites principais |
|---|---|---|---|---|---|
| Multidisciplinar (2+ temas) | CEO IA (`ceo`) | IMPLEMENTED no código; provider real NÃO COMPROVADO (`AXION_AI_PROVIDER_CEO` / `AXION_AI_PROVIDER`; padrão `fake`) | sla_actions, contract_events, timeline_export, esg_obligations, contract_changes | — | Nunca substitui a análise de um Expert especializado; nunca executa decisão. No alerta: curadoria multi-Expert (um parecer por Expert + consolidação). |
| COMERCIAL, FINANCEIRO, ORCAMENTO | Diretor Comercial IA (`commercial-director`) | IMPLEMENTED no código; provider real NÃO COMPROVADO (`AXION_AI_PROVIDER_COMMERCIAL_DIRECTOR`) | contract_events, event_evidence, event_notes, clauses, document_versions, emails, contract_changes | — | Nunca inventa margem, desconto, limite de negociação, preço ou condição comercial; dado ausente => "NÃO DISPONÍVEL". |
| JURIDICO (e seguros, garantias financeiras, sinistros) | Consultor Jurídico IA (`legal-consultant`) | IMPLEMENTED no código; provider real NÃO COMPROVADO (`AXION_AI_PROVIDER_LEGAL_CONSULTANT`) | document_versions, clauses, emails, contract_changes, timeline_export, event_notes, event_evidence, insurance_guarantees, legal_references_insurance_warranty | meeting_minutes, diario_obra, construmanager, relatorios_semanais, formal_notifications, legal_sources | Nunca inventa artigo de lei/citação; sem base legal oficial carregada declara a limitação. |
| PLANEJAMENTO | Diretor de Planejamento IA (`planning-director`) | IMPLEMENTED no código; provider real NÃO COMPROVADO (`AXION_AI_PROVIDER_PLANNING_DIRECTOR`) | schedule_activities, contract_events, contract_changes, document_versions, timeline_export | — | Não substitui projetistas/responsáveis técnicos/SSMA/Jurídico/Diretoria; não analisa solução técnica de engenharia. |
| ENGENHARIA | Diretor de Engenharia e Construção IA (`engineering-director`) | IMPLEMENTED no código; provider real NÃO COMPROVADO (`AXION_AI_PROVIDER_ENGINEERING_DIRECTOR`) | document_versions, contract_events, event_evidence, event_notes, clauses, emails, contract_changes | construmanager, diario_obra | Não substitui projetistas nem responsáveis técnicos (ART/RRT); não analisa cronograma/caminho crítico. |
| Qualidade / garantia pós-entrega (sem área SLA própria; por assunto) | Analista IA de Qualidade (`quality-analyst`) | IMPLEMENTED no código; provider real NÃO COMPROVADO (`AXION_AI_PROVIDER_QUALITY_ANALYST`) | document_versions, clauses, emails, contract_events, event_evidence, event_notes, quality_records, warranty_assistance | diario_obra, relatorios_semanais | Perfil simulado (sem registro profissional/ART/RRT); nunca emite laudo, atesta conformidade, aprova serviço/medição, encerra ou reabre RNC. |
| ESG_SSMA | Diretor de ESG IA (`esg-director`) | IMPLEMENTED no código; provider real NÃO COMPROVADO (`AXION_AI_PROVIDER_ESG_DIRECTOR`) | esg_obligations, esg_obligation_evidence, contract_events, document_versions, clauses | — | Não é sistema de ESG corporativo amplo nem gestão operacional completa de SSMA; só obrigações com origem contratual explícita. |
| DIRETORIA, ADMINISTRATIVO | — (sem Expert dedicado) | n/a | — | — | Lacuna declarada: seleção explícita ou curadoria multi-Expert. |

Observação importante: **nenhum Expert consome ainda `email_risk_signals`/`email_message_classifications`** (a fonte `emails` já existe para eles). Ao consultar o ESPECIALISTA num caso EMAIL, o Expert recebe o título/resumo/impacto do caso (fato x inferência x recomendação) e a referência ao e-mail original, não a classificação estruturada. Ligar isso é um passo futuro (decisão do dono).

## 5. Não feito / riscos / decisões

- Pilar QUALIDADE mapeado para a área ENGENHARIA (não há área "Qualidade" na Matriz). Decisão do dono: criar área própria na Matriz (migration + responsáveis) ou manter.
- O vocabulário `signal_kind` da Frente B ainda não é contrato final: a tabela de graus usa fragmentos (ex. `PARALISACAO`, `REAJUSTE`); tipos fora dela viram REVIEW_REQUIRED (seguro, mas gera revisão humana). Ajustar quando B congelar a taxonomia.
- Os casos EMAIL não são "fechados" automaticamente quando a classificação muda; só pelas ações humanas. (Coletor devolve `closed = false`.)
- MÉDIO/BAIXO sem ação SLA individual é comportamento pré-existente do motor, não mudado aqui.
- Hover Text/UI: nenhuma tela nova nesta frente (os botões e a página do alerta já existentes atendem as áreas); portanto nenhum manifesto de ajuda novo.
