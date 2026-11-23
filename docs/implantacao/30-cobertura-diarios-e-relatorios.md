# 30 - Cobertura de dados: diários de obra, relatórios, atas e SSMA

Fonte da apuração: **cópia local do backup lógico de produção de 22/11/2026 (04:46 UTC)**, restaurada em PostgreSQL local descartável, consultada somente por agregados (contagens, datas, status, tamanhos). Nenhum conteúdo de diário, relatório, ata, anexo ou nome de pessoa foi lido. Nenhuma conexão remota foi feita.

Janela alvo do histórico: **22/05/2025 a 22/11/2026** (18 meses; 19 meses-calendário, 2025-05 a 2026-11).

Veredito curto: **nenhuma das fontes desta área está OPERACIONAL para os 18 meses.** O Diário de Obra está sincronizando de forma saudável, mas só tem dados de 16/03/2026 a 11/11/2026 (201 RDOs). Atas, relatórios de Qualidade e relatórios mensais/gerenciais não têm trilha própria de importação.

## 1. Matriz de cobertura

Legenda: "obra WEG" = projeto `AXION-DEV-001` (único projeto com Diário de Obra conectado em produção). Responsável = rótulo funcional; nenhum nome é registrado aqui.

| Fonte | Sistema de origem | Projeto/obra | Colaborador ou responsável (rótulo) | Permissão de acesso | Data inicial disponível | Data final disponível | Volume esperado (se verificável) | Volume importado | Volume processado | Anexos e versões preservados | Última sincronização bem-sucedida | Frequência incremental | Falhas | Dados ausentes | Evidência de consulta e análise | Status | Bloqueio | Ação necessária |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RDO / Diário de Obra | API do Diário de Obra (somente leitura) | obra WEG | Equipe de campo da obra (autor do RDO não é capturado) | Chave de API server-side (variável de CI); fail-closed | 16/03/2026 (RDO mais antigo importado) | 11/11/2026 (RDO mais recente); última leitura 21/11/2026 21:43 | 201 na origem (checkpoint `totalNaOrigem`=201), igual ao importado | 201 RDOs (1 obra, 1 integração) | 201 normalizados + hash; 35 achados determinísticos; 20 mudanças auditadas (18 RDOs) | Não há anexo/foto armazenados: só contagem (fotos 1.484 e anexos 34 contados; vídeos 0). Versões: hash canônico + trilha de mudanças (20), mas sem cópia do conteúdo anterior | 21/11/2026 21:43 (incremental, SUCESSO, janela 09/11 a 22/11) | Diária 21:43 BRT, janela móvel de 14 dias; BASELINE/RECONCILE só manuais | 96 execuções (10 BASELINE, 80 INCREMENTAL, 6 RECONCILE), 0 com erro | Antes de 16/03/2026 (10 meses da janela: 2025-05 a 2026-02); 11/11 a 22/11/2026; 11 dias seg-sáb sem RDO entre 16/03 e 11/11; autor; efetivo por função só em 98,5%; equipamentos só em 64,2%; ocorrências 4,5%; checklist 0%; piso do baseline = `start_date` do projeto = 01/01/2026 | Seção 2 e arquivo de evidência | PARCIAL | Varredura histórica nunca olhou antes de 01/01/2026 (piso = data de início do projeto); origem pode não ter dados anteriores a 16/03/2026 (não verificável sem acesso à API) | Confirmar com a obra a data do primeiro RDO; se houver, ajustar `start_date`/piso (decisão de negócio) e rodar BASELINE manual; investigar RDOs após 11/11 |
| Relatório semanal (planilha XLSX em e-mail) | E-mail (Gmail), classificação RELATORIO_SEMANAL | obra WEG | Planejamento da contratada (remetente autorizado por regra) | Caixa de e-mail do piloto, leitura | 24/03/2026 (e-mail) / semana 12 | 22/10/2026 (e-mail) / semana 43 | 41 e-mails classificados como relatório semanal; semanas 12 a 43 = 32 semanas possíveis | 56 planilhas (26 semanas distintas, 29 arquivos distintos por SHA-256, vindas de 29 e-mails), 31,8 MB | 280 abas: 106 com métricas, 44 com cruzamento, 62 com classificação de risco; 54 planilhas aguardam revisão humana ou parcial | Sim, planilha original preservada (anexo + SHA-256); 573 anexos de e-mail com storage, 0 erro de processamento | Última planilha criada 22/10/2026; ingestão agendada ativa | Diária (workflow de ingestão semanal) | 0 planilhas com erro; 3 alertas de planilha ausente e 3 de curva S ausente (2 abertos de cada) | Semanas 13, 18, 19, 24, 36, 42 e 44 em diante (sem planilha após 22/10); semanas anteriores a 12; 50 de 56 em PENDING_HUMAN_REVIEW; abas ausentes: Curva S 38, Financeiro 38 | Seção 3 | PARCIAL | Revisão humana pendente de 50 planilhas; ausência de relatórios após 22/10/2026 (origem ou envio) | Revisar fila humana; confirmar com a contratada o envio das semanas 44+ e das faltantes; backfill pré-2026-03 |
| Atas e compromissos | E-mail (3 e-mails ATA_REUNIAO) e documentos (17 de tipo ATA_REUNIAO) | obra WEG | Coordenação do contrato | Caixa de e-mail do piloto; upload manual | 24/04/2026 (e-mail); 25/09/2026 (documentos, data de cadastro) | 27/08/2026 (e-mail); 29/09/2026 (documentos) | Não verificável (sem lista de reuniões) | 3 e-mails + 3 anexos; 17 documentos | Compromissos/prazos: não há tabela própria de atas/compromissos (ver seção 4) | Anexos preservados (3, 4,6 MB) | Não aplicável (sem sincronização dedicada) | Nenhuma | 0 | Extração estruturada de decisões, responsáveis e prazos; atas sem trilha de importação | Seção 4 | PARCIAL | Sem pipeline de atas; atas de 05/2025 a 03/2026 ausentes | Definir fonte oficial das atas (Drive/e-mail) e construir extração com revisão humana |
| Relatórios SSMA (formulários de campo + registros) | App de campo do ACC (checklists) e planilha semanal (aba SSMA) | obra WEG | Técnico de SSMA (2 autores distintos nos formulários) | Autenticado, RBAC por projeto | 09/09/2026 (formulário); 05/11/2026 (registro de campo) | 19/11/2026 (formulário) | Não verificável | 31 formulários (11 tipos), 5 registros de campo, 2 ações corretivas, 35 fotos (23 sincronizadas ao Drive, 12 com falha de sincronização) | 100% dos formulários com valores e checklist preenchidos; risco em 11 de 31 | Fotos em storage com SHA-256 (35/35); original preservado | Fotos: 19/11/2026 | Tempo real (app) | 12 fotos com `drive_sync_error` (06/11/2026, 1.740 bytes no total) | 29 de 31 formulários concentrados em 11/2026; antes de 09/2026 inexistente; aba SSMA semanal: 44 extraídas, 10 ausentes | Seção 3.3 | PARCIAL | Uso do app de campo começou em 09/2026; fotos com falha de Drive | Reprocessar sincronização Drive das 12 fotos; backfill SSMA anterior não existe na origem do app |
| Relatórios de Qualidade | Sem fonte identificada | obra WEG | - | - | - | - | - | 0 (sem tabela, sem classificação de e-mail) | 0 | - | - | - | - | Tudo | Inventário (nenhuma tabela `quality`/`qualidade`) | NAO CONECTADA | Não há fonte nem modelo | Definir se Qualidade vive em e-mail, Drive ou ConstruManager e modelar |
| Relatórios mensais, de progresso e gerenciais | E-mail / Drive | obra WEG | - | - | - | - | - | 0 classificados (nenhuma classificação mensal/gerencial; só RELATORIO_SEMANAL) | 0 | - | - | - | - | Tudo | Classificações de e-mail e tipos de documento | NAO CONECTADA | Sem classificador, sem tipo de documento | Criar classificação e fonte; 663 e-mails e 383 anexos ainda sem classificação podem conter esses relatórios |
| Registros de campo (SSMA) | App de campo | obra WEG | Técnico de SSMA | Autenticado | 05/11/2026 | 10/11/2026 | - | 5 registros (4 ocorrências, 1 inspeção de teste) | 2 ações corretivas | 3 fotos | - | Tempo real | 0 | Volume irrelevante para 18 meses | Consulta agregada | PARCIAL | Uso inicial do app | Ampliar uso; não há histórico |

Observações sobre a matriz:

- Nesta tabela, "PARCIAL" significa que existe dado importado e consultável, mas a janela de 18 meses não está coberta. Nada foi marcado OPERACIONAL.
- As 56 planilhas vêm de 56 anexos distintos, mas só 29 arquivos distintos por SHA-256 (e 29 e-mails): o mesmo arquivo aparece em mais de um anexo ou semana. Vale conferir se há planilha repetida em semanas diferentes.
- Os quase 4 meses finais (a partir de 22/10) não têm planilha semanal nem anexo: é exatamente a faixa que a análise cruzada mais precisa.

## 2. Diário de Obra: o que existe e o que falta

### 2.1 Cobertura mensal (RDOs por mês de data de referência)

| Mês | RDOs | Fotos (contagem) | Anexos (contagem) |
|---|---|---|---|
| 2025-05 a 2026-02 | 0 | 0 | 0 |
| 2026-03 (a partir de 16/03) | 14 | 34 | 0 |
| 2026-04 | 22 | 113 | 0 |
| 2026-05 | 26 | 161 | 0 |
| 2026-06 | 26 | 211 | 0 |
| 2026-07 | 27 | 222 | 0 |
| 2026-08 | 26 | 237 | 11 |
| 2026-09 | 26 | 242 | 2 |
| 2026-10 | 25 | 195 | 17 |
| 2026-11 (até 11/11) | 9 | 69 | 4 |

Total 201 RDOs em 201 datas distintas (um por dia; 5 domingos com RDO). Entre 16/03 e 11/11 há 207 dias de segunda a sábado, 11 sem RDO.

### 2.2 Preenchimento de campos estruturados (percentual de RDOs com conteúdo não vazio)

| Campo | % preenchido |
|---|---|
| clima (manhã, tarde, noite, índice pluviométrico) | 100 |
| horário de trabalho | 100 |
| mão de obra (padrão, lista não vazia) | 98,5 |
| mão de obra personalizada | 0 |
| atividades | 100 |
| materiais | 100 |
| equipamentos | 64,2 |
| ocorrências | 4,5 |
| comentários | 3,0 |
| checklist | 0 |
| número do relatório | 100 |
| RDO com ao menos uma foto | 87,6 |

Status na origem: todos os 201 estão como "Preenchendo Relatório" (nenhum aprovado/fechado), o que significa que o conteúdo ainda pode mudar. Há 20 mudanças auditadas em 18 RDOs entre 14/10 e 17/11/2026.

### 2.3 Sincronização

- BASELINE: 10 execuções em 07/09/2026, janelas de 90 dias, 146 RDOs criados, `baselineComplete=true`, piso 01/01/2026.
- INCREMENTAL: 80 execuções (07/09 a 21/11), 590 listados, 51 criados, 10 atualizados, 85 inalterados, 0 erro.
- RECONCILE: 6 execuções em 17/11, 341 listados, 4 criados, 10 atualizados.
- Nenhum erro sanitizado registrado. O checkpoint da última execução garante cobertura (`coverageGuaranteed`) e 0 candidatos restantes.

### 2.4 Requisitos x o que o código extrai

| Requisito | Estado | Onde |
|---|---|---|
| Data e autor | Data: sim (`reference_date`, criada/modificada na origem). **Autor: não capturado** | `normalize-report.ts` |
| Atividades | Sim (lista canônica; regra `ATIVIDADE_100_SEM_CONCLUSAO`) | `normalize-report.ts`, `finding-rules.ts` |
| Efetivo próprio e terceirizado | Parcial: `labor.padrao` guarda a lista da API; a separação próprio x terceirizado não é derivada | `normalize-report.ts` |
| Equipamentos | Sim (64,2% dos RDOs trazem) | `normalize-report.ts` |
| Clima | Sim, com KPI de clima impraticável (12 achados) | `climate-kpi.ts` |
| Produção e produtividade | Parcial: só quantidades dentro de atividades; sem produtividade derivada | - |
| Interferências e paralisações | Parcial: apenas via ocorrências e clima | `occurrence-taxonomy.ts` |
| Restrições | Não há campo próprio | - |
| Ocorrências e não conformidades | Sim (taxonomia + achados), mas só 4,5% dos RDOs têm ocorrência | `occurrence-taxonomy.ts` |
| Decisões e responsabilidades | Não extraído | - |
| Compromissos e prazos | Não extraído | - |
| Evidências fotográficas | Só contagem; fotos, vídeos e anexos **não são baixados** (client bloqueia mídia por desenho) | `client.ts` |
| Referências contratuais | Não há vínculo RDO com cláusula/contrato | - |
| Preservação do original | Não: o payload cru nunca é persistido; guarda-se o JSON normalizado e um hash. URLs somem do hash por desenho | `normalize-report.ts` |
| Versões e revisões | Hash canônico + `diario_de_obra_report_changes` (hash anterior/novo e datas), sem snapshot do conteúdo anterior | migration `diario_de_obra_deterministic_sync` |
| Incremental e deduplicação | Sim: janela de 14 dias, candidatos por `modified`, desempate por hash; chave única por relatório (201 ids = 201 hashes) | `sync-policy.ts`, worker |
| Retomada de importação histórica | Sim: checkpoint por janela (`resumeWindowEnd`), executado por processos independentes | `sync-policy.ts`, teste de baseline |
| Relação com planejamento | Só indiretamente (semana de trabalho de e-mails); sem vínculo RDO x tarefa do cronograma | - |
| Relação com contratos | Nenhuma | - |
| Relação com colaboradores | Nenhuma (autor não capturado) | - |
| Relação com e-mails | Nenhuma (nenhuma chave comum além da data) | - |

Lacuna estrutural de cobertura: o piso do baseline é `projects.start_date` (01/01/2026 para a obra WEG). Qualquer RDO anterior a essa data nunca foi procurado, mesmo que existisse. Para alcançar 22/05/2025 é preciso (a) que a obra tenha RDOs nessa época e (b) alterar o piso, o que é decisão de negócio e muda a data de início do projeto; não foi alterado.

## 3. Relatórios semanais e SSMA

### 3.1 Planilhas semanais (e-mail)
- 56 planilhas XLSX (31,8 MB; 29 arquivos distintos), 100% com anexo e extração por valores armazenados; 0 com erro.
- Status: 4 EXTRAÍDAS, 2 PARCIAIS, 50 aguardando revisão humana.
- Semanas cobertas: 12, 14-17, 20-23, 25-35, 37-41 e 43 (26 de 32 entre 12 e 43). Faltam 13, 18, 19, 24, 36 e 42 e tudo após a 43. O trabalho dos e-mails vai de 24/03 a 22/10/2026.
- Abas (280): Linha base 56, Histograma 56, Curva S 56, Financeiro 56, SSMA 56; extraídas: Linha base 36, SSMA 44, Financeiro 18, Histograma 4, Curva S 4.
- Interpretação de intake: 11 e-mails de cronograma (9 autorizados automaticamente, 2 pendentes de revisão), de 27/08 a 22/10/2026.

### 3.2 Documentos e e-mails de relatório
- 713 e-mails (30/09/2025 a 19/11/2026, uma caixa); 41 classificados como relatório semanal, 663 ainda sem classificação.
- 573 anexos, todos com storage, 0 erro de processamento; 133 processados e 383 pendentes sem classificação; 100% com sincronização com o Drive em `PENDING`.

### 3.3 SSMA
- 31 formulários em 11 tipos (09/09 a 19/11/2026), 29 deles em 11/2026; 35 fotos (23 sincronizadas ao Drive, 12 com falha de 06/11/2026); 5 registros de campo; 2 ações corretivas.

## 4. Fontes corporativas autorizadas (a partir do código e dos dados)

| Documento | Onde vive hoje | Situação |
|---|---|---|
| RDO | API do Diário de Obra (conectada, workflow diário) | Conectada; histórico limitado |
| Relatório semanal | Anexo de e-mail (Gmail) | Conectada; semanas faltantes |
| Atas | E-mail e upload manual de documento | Sem pipeline próprio |
| SSMA | App de campo ACC e aba SSMA da planilha semanal | Parcial |
| Relatórios mensais/gerenciais/Qualidade | Provavelmente e-mail ou Drive | Não identificados |
| Desenhos/documentos de engenharia | ConstruManager: 192 documentos (16/03 a 15/09/2026), 11 versões, 254 execuções (251 automáticas, 1 erro manual) | Fonte de outro agente; não é diário |
| Outlook | Sem código de integração | Não conectada |
| Drive | Sincronização de anexos em `PENDING` para os 573 anexos; só as fotos de SSMA sincronizam | Não operacional para histórico |

## 5. O que foi implementado nesta entrega

- `apps/web/lib/coverage/source-coverage.ts`: módulo puro que, dadas apenas datas agregadas, calcula cobertura por mês contra a janela alvo (meses sem registro, lacuna inicial/final, fora da janela, datas inválidas) e classifica o status com regra conservadora: OPERACIONAL exige dado importado, janela coberta dentro da tolerância e sincronização recente; sem dado ou sem conexão é NAO_CONECTADA; o resto é PARCIAL.
- `scripts/test-source-coverage.mjs` (16 verificações, fixtures sintéticas), incluído em `scripts/test-scripts.list`.

Não foi alterado: worker, migrations, política de SLA, RLS, auditoria. A retomada/checkpoint da importação histórica já existe e é testada (`test-diario-de-obra-baseline-checkpoint.mjs`).

## 6. Lacunas para o histórico de 18 meses (não implementadas)

1. **Confirmar a data do primeiro RDO** na origem e, se anterior a 01/01/2026, decidir o piso do baseline (hoje atrelado a `start_date`). Exige consulta à API (não feita; precisa de credencial e autorização).
2. **Persistir autor** do RDO e decidir se guarda payload original (snapshot) para preservar versões; hoje só há hash.
3. **Efetivo próprio x terceirizado, produção, restrições, decisões, compromissos, prazos e referência contratual** exigem extração com revisão humana (IA com evidência), fora do escopo determinístico atual.
4. **Planilhas semanais**: resolver a fila de 50 revisões humanas e obter as semanas 13, 18, 19, 24, 36, 42 e 44 em diante.
5. **Atas, Qualidade, relatórios mensais/gerenciais**: sem pipeline; definir fonte e classificador.
6. **Classificar os 663 e-mails e 383 anexos** pendentes para descobrir relatórios existentes.
7. **Drive**: 100% dos anexos de e-mail em `PENDING`; 12 fotos de SSMA com falha.
8. **RDOs ainda "Preenchendo Relatório"**: o conteúdo pode mudar; a reconciliação precisa rodar periodicamente.

## 7. Bloqueios e dependências

| Item | Depende de |
|---|---|
| Verificar se existem RDOs antes de 16/03/2026 | Acesso à API do Diário de Obra (credencial, responsável pela obra) |
| Ajustar `start_date`/piso do baseline | Decisão da diretoria/obra (afeta outras telas) |
| Backfill de e-mails antes de 30/09/2025 | Autorização de Gmail/Outlook e escopo de caixas |
| Atas, Qualidade e mensais | Definição de fonte oficial pela Axion |
