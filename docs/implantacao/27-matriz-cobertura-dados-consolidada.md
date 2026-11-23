# 27 - Matriz de cobertura de dados consolidada do piloto WEG (histórico de 18 meses)

Janela exigida: **22/05/2025 a 22/11/2026** (18 meses), mais incremental contínuo e documentos anteriores que estabeleçam obrigações vigentes. Fonte da apuração: **cópia local do backup lógico de produção de 22/11/2026 (04:46 UTC)**, consultada somente por agregados (contagens, datas mínima e máxima, status). Nenhuma conexão a sistema de origem, nenhuma credencial, nenhum conteúdo de mensagem ou documento foi lido. Obra: WEG (`AXION-DEV-001`; no banco, "[DEV] WEG - Fábrica de Fios - Linhares").

> **Resultado central: nenhuma fonte está OPERACIONAL para os 18 meses.** O que existe em produção cobre, no melhor caso, cerca de 13 meses de e-mail (com meses quase vazios) e 8 meses de RDO e, na maioria das fontes, 3 a 7 meses. A ausência de uma fonte crítica é registrada abaixo como pendência explícita de GO-LIVE; não há afirmação de cobertura sem evidência.

As matrizes completas, com as 19 colunas exigidas, estão nos documentos de cada fonte: **29** (e-mail), **30** (diários, relatórios, atas, SSMA, Qualidade), **31** (cronogramas), **32** (ConstruManager e documentos). Evidências detalhadas (com rótulos de caixa, nunca conteúdo) ficam **fora do repositório**.

## 1. Visão consolidada
| # | Fonte | Sistema de origem | Período realmente presente | Volume importado | Última sincronização OK | Status | Bloqueio principal |
|---|---|---|---|---|---|---|---|
| 1 | E-mail, CAIXA-1 (Gmail) | Gmail | 30/09/2025 a 18/11/2026 | 681 mensagens (513 recebidas, 168 enviadas), 466 threads, 573 anexos (420 pendentes; Drive 100% pendente) | não comprovada nas tabelas consultadas (as 8 contas de `email_accounts` têm `last_sync_at` nulo; ver doc 29) | **PARCIAL** | 05/2025 a 09/2025 com 0 mensagens; set a dez/2025 só 29; sem enviadas antes de 05/01/2026 |
| 2 | E-mail, demais colaboradores da WEG | Gmail | nenhum | 0 (**6 de 7** colaboradores ativos sem caixa conectada) | n/a | **NÃO CONECTADA** | delegação de domínio, lista de autorizados, aceite individual |
| 3 | Outlook / Microsoft 365 | Microsoft Graph | nenhum | 0 | n/a | **NÃO CONECTADA** | não há integração operando; exige registro de app e consentimento (a caixa institucional é Google) |
| 4 | Diário de Obra (RDO) | API do Diário de Obra | 16/03/2026 a 11/11/2026 | 201 RDOs (1.484 fotos contadas, nenhuma baixada) | 21/11/2026 21:43 | **PARCIAL** | 10 meses (05/2025 a 02/2026) sem RDO; piso de busca é `start_date` 01/01/2026; os 201 estão "Preenchendo Relatório" |
| 5 | Relatório semanal (XLSX em e-mail) | Gmail | 24/03/2026 a 22/10/2026 (semanas 12 a 43) | 56 planilhas; 4 extraídas, 2 parciais, **50 aguardando revisão humana** | 22/10/2026 | **PARCIAL** | semanas 13, 18, 19, 24, 36, 42 e 44 em diante ausentes |
| 6 | Atas e compromissos | e-mail e upload | 04/2026 a 09/2026 | 3 e-mails e 17 documentos | n/a | **PARCIAL** | sem pipeline nem tabela de compromissos |
| 7 | SSMA (formulários e registros) | App de campo do ACC | 09/09/2026 a 19/11/2026 | 31 formulários, 35 fotos (12 com falha de Drive), 5 registros, 2 ações | 19/11/2026 | **PARCIAL** | uso do app começou em 09/2026 |
| 8 | Relatórios de Qualidade | sem fonte | nenhum | 0 | n/a | **NÃO CONECTADA** | sem fonte, tabela nem classificador |
| 9 | Relatórios mensais, de progresso e gerenciais | sem fonte | nenhum | 0 | n/a | **NÃO CONECTADA** | sem classificador; 663 e-mails sem classificação podem conter esses relatórios |
| 10 | Cronogramas e revisões | e-mail (MPP/XLSX) e upload | 03/09/2026 a 22/10/2026 | 10 revisões (1 baseline, 9 atualizações), 550 atividades, em 1 de 10 projetos | 22/11/2026 (batimento dos jobs; não é data de revisão) | **PARCIAL** | 15 de 18 meses sem revisão; sem baseline anterior a 22/05/2025; **defeito: o extrator grava baseline = planejado** |
| 11 | ConstruManager: documentos técnicos e revisões | API do ConstruManager | 19/03/2026 a 15/09/2026 | 192 documentos, 11 revisões; 197 conteúdos armazenados; 2 promoções com falha | 21/11/2026 21:18 | **PARCIAL** | 0 documentos de 22/05/2025 a 18/03/2026; formatos DWG/IFC/RVT/NWD sem extrator |
| 12 | ConstruManager: correspondências, protocolos, aprovações, pendências, notificações, atas, medições, Qualidade e SSMA | API do ConstruManager | nenhum | 0 | n/a | **NÃO CONECTADA** | não se sabe se a API e a licença expõem esses módulos (não testado) |
| 13 | Contratos e aditivos | upload manual | 20/03/2026 a 15/10/2026 | 9 contratos, 3 aditivos, 1 proposta; 12 cláusulas | n/a | **PARCIAL** | 0 de 3 aditivos vinculados ao contrato base; nenhum documento anterior a 22/05/2025 |

Contagem: **0 OPERACIONAL, 9 PARCIAL, 4 NÃO CONECTADA** (linhas 1 a 13).

## 2. Pendências explícitas de GO-LIVE (fontes críticas ausentes ou incompletas)
1. **E-mail de 22/05 a 29/09/2025**: não se sabe se esse período existe na caixa. Próximo passo de menor custo: **dry-run** do backfill em blocos mensais (que não grava nada) sobre a CAIXA-1; depende de autorização.
2. **E-mail dos 6 colaboradores sem caixa conectada** e do Outlook: dependem de delegação de domínio por caixa, consentimento do Microsoft Graph (somente `Mail.Read` de aplicativo), lista de autorizados e aceite individual.
3. **RDO anterior a 16/03/2026**: só uma consulta autorizada à API do Diário de Obra mostra se existe. Mudar o piso de busca altera `projects.start_date`, que afeta outras telas: **decisão de negócio**.
4. **Relatório semanal**: 50 planilhas aguardando revisão humana e as semanas faltantes (a recuperar nos e-mails ou com a contratada).
5. **Cronogramas**: recuperação dos 15 `.mpp` de mar a ago/2026 já guardados em e-mail (rotina existente, simulação por padrão; `--apply` precisa de autorização); baselines e cronogramas contratuais anteriores, lista de marcos contratuais e revisões de 28/10 a 22/11/2026 só o Planejamento e os Contratos podem fornecer.
6. **ConstruManager**: confirmar com o fornecedor quais módulos a API e a licença cobrem; consulta autorizada sobre documentos anteriores a 19/03/2026; alternativa de exportação autorizada (manifesto validado pelo novo módulo, doc 32).
7. **Contratos e aditivos**: vincular os 3 aditivos ao contrato base, registrar vigência e obrigações, listar os contratos vigentes anteriores à janela.
8. **Atas, Qualidade, relatórios mensais e gerenciais**: a Axion precisa definir a fonte oficial.
9. **Anexos de e-mail**: 420 de 573 pendentes de processamento e 100% do Drive pendente (o novo worker de anexos por delegação continua desligado até a aceitação).

## 3. O que isso significa para o piloto
- O piloto **pode operar com a cobertura parcial atual** (é uma decisão do Dono), mas **não pode ser apresentado como histórico de 18 meses integrado**: os números acima são o limite real de hoje.
- O requisito de histórico de 18 meses só se cumpre com os itens da seção 2, que **dependem de credenciais, autorizações corporativas e decisões que não estão ao alcance do desenvolvimento**.
- A cobertura continua a crescer de forma incremental depois do go-live; esta matriz deve ser reexecutada (`scripts/lib/mail-universal/coverage-report.mjs` e `apps/web/lib/coverage/source-coverage.ts`, ambos puros e testados) a cada nova fonte conectada.
