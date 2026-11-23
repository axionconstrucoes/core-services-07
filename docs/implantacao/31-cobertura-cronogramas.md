# 31 - Cobertura de dados: cronogramas e planejamento (Agente E)

Janela alvo: **22/05/2025 a 22/11/2026** (18 meses). Fonte dos numeros: copia local do backup de producao de 22/11/2026 04:46 UTC (somente leitura, agregados) e a copia pos-ondas A-N (mesmos numeros: as ondas nao alteram dados de cronograma). Nenhum conteudo de documento, nome de pessoa ou de atividade foi lido. Producao nao foi consultada.

## 1. Apurado (numeros reais)

| Item | Valor |
|---|---|
| Obras com cronograma estruturado | 1 de 10 projetos (piloto) |
| Revisoes de cronograma (`schedule_versions`) | 10 (1 BASELINE + 9 UPDATE), todas `EXTRACTED`, 0 `FAILED`, 0 `PENDING` |
| Periodo coberto pelas revisoes (data do documento) | 03/09/2026 a 22/10/2026 (baseline enviada em 20/09/2026; revisoes por e-mail, uma por semana de obra) |
| Meses da janela com revisao | 3 de 18 (ago/2026: 1; set/2026: 6; out/2026: 3). 15 meses sem nenhuma (mai/2025 a jul/2026 e nov/2026) |
| Linha de base oficial (`project_schedule_baselines`) | 1 ativa (definida em 26/09/2026), 0 substituidas. Linhas de base anteriores a 22/05/2025: **nenhuma** (o primeiro inicio planejado e 28/04/2026) |
| Atividades / relacoes | 550 atividades (55 por revisao), 356 relacoes (34-38 por revisao) |
| Marcos (`is_milestone`) | **0** em 550 atividades |
| Atividades criticas por revisao | 19 a 28 |
| Origem | 9 revisoes por e-mail semanal (11 intakes: 9 `AUTHORIZED_AUTO`, 2 `PENDING_HUMAN_REVIEW` por remetente nao autorizado, sem versao) + baseline por upload manual |
| Comparacoes (`schedule_version_comparisons`) | 18 `COMPUTED` (9 vs baseline, 9 vs semana anterior): 6+3 `CRITICAL`/`HIGH` vs baseline; 3 `CRITICAL`, 5 `HIGH`, 1 `REVIEW_REQUIRED` vs anterior |
| Ultima revisao ingerida | 22/10/2026; alertas `MISSING_WEEKLY_SCHEDULE` abertos para 4 semanas (05/10 a 09/11/2026) |
| Relatorio semanal Excel (Curva S, Linha de Base, Financeiro, Histograma, SSMA) | 56 workbooks (24 arquivos distintos): 4 `EXTRACTED`, 2 `PARTIAL`, 50 `PENDING_HUMAN_REVIEW`; Curva S com valores extraidos em apenas 4 abas (14 aguardam revisao humana, 38 sem aba) |
| Anexos .mpp em e-mail | 72 anexos, 36 arquivos distintos (SHA-256), 24/03/2026 a 22/10/2026, **todos com bytes armazenados**; 9 viraram revisao; 27 arquivos distintos nao viraram versao (15 em mensagens anteriores a 17/08/2026, de mar a ago/2026; 12 anexos secundarios dentro das 11 mensagens ja ingeridas, nas quais so um .mpp por mensagem e selecionado) |
| E-mails na base | 713, de 30/09/2025 a 19/11/2026 (nada antes de 30/09/2025) |

## 2. Matriz de cobertura

| Fonte | Sistema de origem | Projeto/obra | Responsavel (rotulo) | Permissao de acesso | Data inicial | Data final | Volume esperado | Volume importado | Volume processado | Anexos e versoes preservados | Ultima sincronizacao bem-sucedida | Frequencia incremental | Falhas | Dados ausentes | Evidencia de consulta e analise | Status | Bloqueio | Acao necessaria |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cronograma executivo semanal (.mpp, revisoes) | E-mail (Gmail do planejamento) -> ACC (MPP worker + MPXJ) | Obra piloto (1 de 10) | Planejamento da obra (1o escalao) | Leitura Gmail somente-leitura; RLS por membro de projeto | 03/09/2026 (revisao); 24/03/2026 (primeiro .mpp em e-mail) | 22/10/2026 | 36 .mpp distintos recebidos por e-mail | 10 versoes (9 e-mail + 1 upload) | 10 `EXTRACTED`, 550 atividades, 356 relacoes | Sim: 1 `document_version` por revisao (SHA-256 unico, `version_index` unico), bytes no storage; 72/72 anexos .mpp com bytes | Fluxo `weekly-all` com sucesso em 22/11/2026 01:41 (-03); ultima revisao ingerida 22/10/2026 | Horaria (workflow); cadencia semanal | Semanas 05/10 a 09/11/2026 sem envio (4 alertas); 2 intakes pendentes de revisao humana; falhas historicas de job (JOB_FAILURE) nos heartbeats, ultimo sucesso < 1 h | 15 de 18 meses sem revisao; 27 .mpp distintos recebidos nao versionados; 9 outras obras sem cronograma; revisoes de 28/10 a 22/11/2026 | Consultas SQL agregadas (secao 1) e testes sinteticos | **PARCIAL** | Nenhum tecnico para o que ja esta no storage; revisao humana dos intakes pendentes | Recuperar historico dos 15 .mpp pre-17/08/2026 com `weekly-schedule-historical-from-storage` (policy de revisao humana, sem Gmail; exige autorizacao para rodar contra producao); decidir o tratamento dos 12 anexos secundarios; cobrar planejamento pelas semanas sem envio |
| Linha de base contratual/oficial | ACC (`project_schedule_baselines`), a partir de upload manual | Obra piloto | Administrador do projeto | Admin (RPC `set_project_schedule_baseline`) | 20/09/2026 (arquivo); efetiva 26/09/2026 | vigente | 1 por obra com cronograma | 1 | 1 | Sim: historico nunca apagado (`superseded_at`, FK `on delete restrict`); 0 anteriores | n/a (manual) | Manual | Extrator copia datas planejadas como datas de linha de base (DEFEITO 1) | Baseline contratual original anterior a 22/05/2025: nao existe no ACC; baseline do MS Project nao lida | Consulta: 550/550 atividades com baseline = planejado | **PARCIAL** | Arquivo da baseline contratual original (quem fornece: Planejamento/Contratos da obra) | Receber a(s) baseline(s) contratual(is) anteriores e carregar como `BASELINE`/`REVISED_BASELINE`; corrigir extracao dos campos Baseline do MPXJ |
| Cronogramas contratuais (anexos de contrato/aditivos) e reprogramacoes | Contratos e aditivos (documentos) | Todas | Contratos | n/a | nao verificavel | nao verificavel | nao verificavel | 0 documentos com kind de cronograma alem dos 2 do piloto | 0 | n/a | n/a | n/a | n/a | Nenhum cronograma contratual fora do piloto; reprogramacoes formais (RECOVERY/REVISED_BASELINE) = 0 | `documents.kind` agregado | **NAO CONECTADA** | Fornecimento dos arquivos | Enviar cronogramas contratuais e aditivos por obra; classificar `CRONOGRAMA_BASELINE`/`REVISAO` |
| Relatorio semanal Excel (Curva S, planejado x realizado, histograma, financeiro, SSMA) | E-mail -> ACC (leitor de workbook) | Obra piloto | Planejamento | idem | 25/09/2026 (processamento) | 22/10/2026 | 1 por semana de obra (W12 a W43 recebidas) | 56 workbooks / 24 arquivos | 4 `EXTRACTED`, 2 `PARTIAL`, 50 aguardando revisao humana | Sim (SHA-256, anexo, intake) | 22/10/2026 | Horaria | 38 abas Curva S ausentes; 14 aguardando revisao | Curva S extraida em 4 workbooks (W39 a W43) | Consultas agregadas | **PARCIAL** | Revisao humana das abas | Revisar/mapear as abas pendentes; confirmar com o planejamento o formato das semanas sem Curva S |
| Marcos contratuais e curvas de avanco do MPP | MPP (MPXJ) | Obra piloto | Planejamento | idem | n/a | n/a | marcos esperados: definir lista contratual | 0 marcos extraidos | n/a | n/a | n/a | n/a | n/a | Nenhum marco no MPP importado (`is_milestone` = 0 em 550); folga total nao extraida (0 de 550) | Consulta agregada | **NAO CONECTADA** (marcos) | Lista de marcos contratuais com datas | Fornecer marcos contratuais (id do MPP) e implementar extracao de folga/baseline |
| Cronograma x e-mails, RDO e ConstruManager | ACC (cruzamento) | Obra piloto | n/a | RLS | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | Sem chave de ligacao atividade de cronograma <-> RDO/e-mail/ConstruManager; so ligacao revisao <-> e-mail (intake) <-> workbook | Leitura de codigo (secao 5) | **NAO CONECTADA** | Decisao de modelagem | Definir relacao por atividade (WBS/unique_id) com evidencia rastreavel |

## 3. Preservacao de revisoes e linhas de base (prova)

- **Cada revisao e uma versao de documento propria**: `schedule_versions.document_version_id` referencia `document_versions`, que tem `unique (document_id, version_index)` e indice unico por hash no projeto. Revisao nova = nova linha; a migration fundadora declara "snapshot historico completo, nunca sobrescrito". No banco: 10 versoes, 10 SHA-256 distintos, 9 `version_index` (1-9) no documento de revisoes e 1 no da baseline.
- **Sem escrita por cliente**: `schedule_versions`, `schedule_activities` e `schedule_task_relations` so tem policy de SELECT; nenhuma de INSERT/UPDATE/DELETE (so `service_role`/workers). Verificado no banco e por teste estatico.
- **Baseline oficial**: historico em `project_schedule_baselines`; a RPC marca a anterior com `superseded_at` e insere nova linha (nunca DELETE); indice unico garante 1 ativa por projeto; FK `on delete restrict` impede apagar a versao de uma baseline.
- **Idempotencia**: o intake tem `unique (project_id, gmail_message_id)`; .mpp com SHA-256 ja conhecido vira `RECEIVED_DUPLICATE` (conta como recebimento, nao cria versao).
- **Ressalva (nao e sobrescrita por revisao nova)**: o reprocessamento da MESMA `document_version` (`scripts/process-document-version.mjs`) apaga e recria a `schedule_version` dela; isso nunca toca outras revisoes. Efeitos colaterais: as `schedule_version_comparisons` dessa versao somem (cascade) e, se ela for a baseline oficial, o `delete` falha pela FK (protecao desejada). Registrado como observacao, nao defeito.
- **Nao ha trigger de imutabilidade** nas tabelas de cronograma: a protecao depende de nao existir policy de escrita e de `service_role` ser usado so pelos workers. Recomendado (nao implementado, exige migration nova e decisao): trigger que bloqueie UPDATE/DELETE de `schedule_activities`.
- Teste: `scripts/test-schedule-revision-preservation.mjs` (revisao nova nao altera a anterior; policies; baseline; pipeline).

## 4. Defeitos e lacunas (com evidencia)

1. **DEFEITO - baseline do MPP nao e extraida**: `process-document-version.mjs` grava `baseline_start/end = planned_start/end`; `extract-mpp.py` nao le os campos Baseline do MPXJ. Evidencia: 550/550 atividades com baseline = planejado. Consequencia: `delay.currentDelayDays` e `finalDate.slipDays` dentro de uma revisao sao sempre 0 (confirmado: as 18 comparacoes tem atraso 0 e marco final sem desvio); so a comparacao entre revisoes (planejado atual x anterior) e valida. Correcao exige alterar o extrator e reprocessar: nao feita (ambigua; exige autorizacao e decisao sobre reprocesso).
2. **LACUNA - marcos**: 0 marcos nos 10 arquivos; `milestones.evaluated` e 0 em todas as comparacoes; `contractMilestoneUniqueIds` nao e alimentado por nenhuma configuracao (a tabela de config nao tem a coluna). "Marcos ameacados" so passa a existir com marcos reais ou lista contratual.
3. **LACUNA - folga e percentual**: `total_float_*` nao e extraido (0/550); `is_critical` e `percent_complete` sim.
4. **LACUNA - historico**: 15 .mpp (mar a ago/2026) estao no storage sem versao; nenhum .mpp anterior a 24/03/2026; nada anterior a 30/09/2025 em e-mails.
5. **LACUNA - alertas abertos**: 4 semanas sem envio (05/10 a 09/11/2026).

## 5. O que o codigo calcula hoje

Calcula (`apps/web/lib/schedule/weekly-ingestion`): casamento de atividades entre revisoes (unique_id, external id, WBS+nome); data final e desvio; marcos que escorregaram (so marcos); caminho critico (entrou/saiu); folga minima; atrasadas na data de status; mudanca de duracao (%); relacoes adicionadas/removidas; avanco fisico ponderado; atraso acumulado (planejado final - baseline final) e tendencia (recuperacao/agravamento); classificacao de risco por limites configurados por projeto (14 dimensoes; sem limite = `REVIEW_REQUIRED`, nunca LOW); alertas de ausencia semanal; Curva S (modulo `s-curve`).

**Novo neste commit** (`compare-schedule-dates.ts`): lista por atividade as mudancas de inicio/termino entre revisoes (adiadas/antecipadas), atividades adicionadas/removidas e marcos ameacados (adiado, folga baixa, vencido sem conclusao). Cobertura por 6 testes sinteticos. Nao esta ligado a pipeline nem a UI (so funcao pura).

Nao calcula: causa de atraso (exige evidencia de e-mail/RDO; o `generateScheduleRecoverabilityAssessment` devolve sempre `INCERTA` por desenho), responsabilidade, impacto contratual potencial (prazo/pleito), dependencias criticas alem da contagem de relacoes, projecao de termino por produtividade, planejado x realizado por atividade (nao ha datas reais: so percentual).

Integracao: revisao <-> e-mail via `weekly_schedule_email_intakes.email_id`; workbook <-> revisao via `weekly_report_workbooks.schedule_version_id` (10 de 56 preenchidos); Diretor de Planejamento le o cronograma extraido (`schedule-context`). Nao ha relacao atividade <-> RDO/ConstruManager.

## 6. Ingestao e limites

- E-mail semanal: `weekly-schedule-email-ingest.mjs` (fases intake, promote, compare, classify, workbook, alerts), `--limit` padrao 50 por execucao, cursor incremental `last_scanned_sent_at`, janela `monitoring_start_at`/`end_at` (ambas nulas na obra piloto), dedup por mensagem e por SHA-256; so 1 .mpp por mensagem (padrao de nome ou unico; ambiguo vai a revisao humana); remetente deve ser autorizado pela Matriz.
- MPP worker: MPXJ via `extract-mpp.py` (atividades, relacoes, criticidade, duracao, % concluido; nao extrai baseline, folga, datas reais, recursos, restricoes); em falha, a `schedule_version` parcial e removida.
- Extratores Excel: leitor de abas esperado (Curva S, Linha de Base, Financeiro, Histograma, SSMA), so valores armazenados.
- Recuperacao historica sem Gmail: `weekly-schedule-historical-from-storage.mjs` (simulacao por padrao; `--apply` cria intakes em revisao humana, sem alertas nem comparacao).

## 7. Depende de autorizacao ou fornecimento

- Rodar a recuperacao historica contra producao (autorizacao do dono; sem credenciais novas alem das ja usadas pelos workers).
- Corrigir extracao de baseline/folga/marcos e reprocessar (decisao + autorizacao).
- Arquivos: baselines contratuais anteriores, cronogramas contratuais/aditivos, lista de marcos contratuais, revisoes de 28/10 a 22/11/2026 (Planejamento da obra).
- Outras 9 obras: nenhum cronograma recebido.
