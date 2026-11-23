# 32. Cobertura de dados: ConstruManager e documentos

Escopo: Agente F da apuracao de cobertura (janela de 18 meses: 22/05/2025 a 22/11/2026).
Base de apuracao: copia local da producao de 22/11/2026 (04:46 UTC), somente leitura,
somente agregados (contagens, datas, status, tipos, tamanhos). Nenhum conteudo, nome
de pessoa ou titulo foi lido. Nenhuma conexao ao ConstruManager, ao Supabase ou a
qualquer API foi feita. As ondas A-N nao alteram nenhuma destas tabelas (a copia
com ondas aplicadas tem os mesmos totais).

## 1. Resposta direta

- O ConstruManager esta PARCIAL: ha metadados e conteudo efetivamente importados e
  consultaveis, mas somente de UM modulo (Lista Mestra de documentos tecnicos) de UMA
  obra, e a janela de datas importada comeca em 19/03/2026, nao em 22/05/2025.
- Correspondencias, protocolos, aprovacoes, pendencias, notificacoes, atas,
  medicoes e registros de Qualidade e SSMA do ConstruManager: NAO CONECTADOS. O
  cliente da API chama apenas os endpoints de login, obra, pasta, arquivo e lista
  mestra.
- Contratos e aditivos NAO vem do ConstruManager: entram por upload manual (politica
  vigente) e e-mail.

## 2. Inventario agregado (producao em 22/11/2026)

### 2.1 Tabelas construmanager_*

| Tabela | Linhas | Periodo | Observacao |
|---|---|---|---|
| construmanager_folders | 25 | visto 03/09/2026 a 21/11/2026 | 1 obra, niveis 1/2/3 = 1/4/20 pastas |
| construmanager_documents | 192 | criacao na origem 19/03/2026 a 15/09/2026 | todos dentro da janela; 0 anteriores a 22/05/2025 |
| construmanager_document_versions | 11 | 19/03/2026 a 23/07/2026 | revisoes historicas; 0 orfas |
| construmanager_document_vigency | 192 | visto 06/09/2026 a 21/11/2026 | revisao vigente por documento |
| construmanager_version_transitions | 2 | 15/09/2026 | ambas SOMENTE_NO_CONSTRUMANAGER (nao baixadas) |
| construmanager_version_impact_reviews / deliveries | 2 / 2 | 24/09/2026 | CONCLUIDA / SENT |
| construmanager_sync_runs | 254 | 03/09/2026 a 21/11/2026 | 253 SUCESSO, 1 ERRO |
| construmanager_content_runs | 21 | 12/11/2026 a 17/11/2026 | 20 SUCESSO (197 armazenados), 1 ERRO; todas MANUAL |
| construmanager_content_links | 203 | 05/09/2026 a 17/11/2026 | 199 ARMAZENADO, 4 REFERENCIA_EXTERNA, 0 pendentes |
| construmanager_content_blobs | 178 | 05/09/2026 a 17/11/2026 | 456.460.540 bytes (435,3 MiB); 10 extensoes |

Criacao na origem dos 192 documentos por mes: 2026-03: 23; 04: 4; 05: 124; 06: 2;
07: 36; 08: 1; 09: 2. Meses sem nenhum documento: 2025-05 a 2026-02 (9 meses),
2026-10 e 2026-11. Extensoes: DWG 96, PDF 74, TXT 6, XLSX 5, IFC 3, BAK 2, XLS 2,
e 1 de cada ZIP, PNG, NWD, RVT. 9 autores distintos; 0 sem autor; 0 com data de
aprovacao. 20 documentos com conflito entre revisao do metadado e do nome
(`revision_conflict`); 6 com historico de versoes.

Sincronizacao de metadados: ultima bem-sucedida em 21/11/2026 21:18 (-03); cadencia
observada de 6 execucoes por dia em 19-21/11/2026 (2 por dia em 17-18/11). Total de
documentos visto por rodada: 192. Falha: 1 rodada em 06/09/2026
(`ListaMestra/List`, "Index was outside the bounds of the array", erro do servidor de
origem), sem recorrencia. Falha de conteudo: 1 rodada em 12/11/2026 (erro interno de
codigo, corrigido; 197 armazenamentos nas 20 rodadas seguintes).

### 2.2 Promocao para o acervo documental (documents / document_versions)

95 versoes de origem CONSTRUMANAGER (marcador `[construmanager] link=` em 95 notas),
criadas em 17-18/11/2026: 93 PROCESSED, 2 FAILED (1 "Invalid PDF structure", 1 "sem
texto utilizavel"). Tipos: DESENHO 75, PLANILHA 14, OUTRO 6. Elegibilidade (codigo):
somente PDF, DOCX, XLS, XLSX, CSV, TXT, XML ate 50 MiB; DWG, RVT, IFC, NWD, BAK, ZIP e
imagens ficam como conteudo armazenado sem promocao (nao ha extrator). Dos 192
documentos de origem, 96 sao DWG. Limite por rodada: 10 promocoes.

### 2.3 Documentos e contratos por origem (todo o ACC)

| Tipo (documents.kind) | Documentos | Origem das versoes |
|---|---|---|
| DESENHO | 74 | CONSTRUMANAGER |
| OUTRO | 59 | e-mail 50, ConstruManager 6, upload 3 |
| ATA_REUNIAO | 17 | e-mail |
| CONTRATO_BASE | 9 (1 excluido logicamente) | upload manual 8, "CONTRATO" 1 |
| PLANILHA | 6 | CONSTRUMANAGER (14 versoes) |
| ADITIVO | 3 (1 excluido logicamente, FAILED) | upload manual |
| CRONOGRAMA_REVISAO / BASELINE | 1 / 1 | e-mail (9 versoes) / upload |
| PROPOSTA_COMERCIAL | 1 | upload, vinculada a pai contratual |

Total: 171 documentos, 188 versoes, 189 arquivos. Datas de documento 19/12/2025 a
22/10/2026; nenhuma versao com data anterior a 22/05/2025. Status: PROCESSED 181,
AWAITING_PROCESSING 3, FAILED 4 (2 ConstruManager, 1 upload, 1 e-mail).
68 versoes sem SHA-256 registrado (hash ausente em dados mais antigos; ver lacunas).
190 extracoes de texto para 184 versoes. Contratos: 12 clausulas e 327 candidatas a
clausula em 2 versoes de CONTRATO_BASE; 0 obrigacoes ESG ativas; 0 mudancas
contratuais; 1 evento contratual. Vinculos de anexo contratual (documento pai +
base de incorporacao): 4 (3 OUTRO + 1 PROPOSTA_COMERCIAL); aditivos nao tem vinculo
com o contrato base registrado (0 de 3).

### 2.4 Anexos de e-mail (fonte documental paralela)

573 anexos, 30/09/2025 a 22/10/2026 (por mes: 2025-09: 2, 10: 6, 11: 2, 12: 8; 2026-01:
2, 02: 6, 03: 21, 04: 212, 05: 24, 06: 35, 07: 50, 08: 84, 09: 91, 10: 30).
153 PROCESSED (144 ligados a versao documental), 420 PENDING. Classificacao
confirmada/sugerida: 516 sem classificacao, 21 UNCLASSIFIED, 16 cronograma MPP, 8
relatorio semanal, 6 relatorio semanal de planejamento, 3 ata, 3 alteracao de projeto.
O detalhe de cobertura de e-mail pertence a outro agente; aqui entra so como origem de
documentos.

## 3. Codigo e integracao existente

| Item | Estado |
|---|---|
| API | API HTTP do proprio ConstruManager (`CONSTRUMANAGER_BASE_URL`, HTTPS obrigatorio). Endpoints usados: `/Login/Auth`, `/Login/Token/Get`, `/Obra/List`, `/Pasta/List`, `/Arquivo/List`, `/ListaMestra/List`. |
| Autenticacao | login e senha corporativos (variaveis server-side, nunca no frontend) -> token intermediario -> token Bearer. Segredos somente em GitHub Secrets / Vercel. |
| Permissao | a conta de servico enxerga o que a permissao corporativa dela permite; nao ha evidencia local de quais modulos e obras ela alcanca alem da obra 34164 (WEG). Acoes de sincronizar/baixar exigem ADMINISTRADOR no ACC. |
| Rotinas | `construmanager-metadata-worker`, `-version-monitor`, `-content-worker`, `-promote-documents` (scripts) e workflows `construmanager-*` (monitoramento de metadados a cada 6 h; ingestao de conteudo, recuperacao e promocao somente por disparo manual, com dry-run por padrao e chave de parada). |
| Limites | timeouts por rota (60 s em listagens); lote maximo 50 itens por rodada; 3 tentativas automaticas antes de decisao humana; teto de arquivo configuravel (acima do limite vira REFERENCIA_EXTERNA, 4 casos); promocao maxima 10 por rodada. Automacao FAIL-CLOSED. |
| Historico | a API de lista devolve o estado atual e as revisoes historicas por documento; nao ha, no codigo, chamada para filtrar por periodo nem para modulos de correspondencia, protocolo, ata, medicao, Qualidade ou SSMA. Recuperacao dos 18 meses e anteriores por API: NAO COMPROVADA (ver bloqueios). |
| Preservacao | original armazenado com SHA-256 e tamanho (blob), vinculo `link` por objeto/versao, revisao historica em ordem cronologica, autor e datas brutas e normalizadas (`source_created_at_raw`), transicoes de versao e revisoes de impacto com entrega auditada. Promocao nao altera o original e nao cria evento, risco ou alerta. |

Cobertura por tipo de documento prioritario:

| Tipo | Coberto hoje? |
|---|---|
| Documentos tecnicos / revisoes | SIM, parcial: Lista Mestra de 1 obra (192 documentos, 11 revisoes historicas) |
| Correspondencias, protocolos | NAO (ConstruManager). Entram somente se chegarem por e-mail |
| Aprovacoes, pendencias | NAO. Existe so campo de data de aprovacao (todos nulos) |
| Notificacoes | NAO (ha tipo NOTIFICACAO para upload, sem origem ConstruManager) |
| Atas | NAO via ConstruManager; 17 atas vieram de e-mail |
| Contratos, aditivos | NAO via ConstruManager; upload manual (9 e 3) |
| Medicoes | NAO. Sem tipo proprio de origem; so planilhas |
| Qualidade, SSMA | NAO via ConstruManager. SSMA tem fonte propria (Drive; 31 formularios 09/09 a 19/11/2026) |

## 4. Contratos e aditivos

- Onde ficam: `documents` (kind CONTRATO_BASE / ADITIVO / PROPOSTA_COMERCIAL),
  versoes em `document_versions` (SHA-256, processamento), clausulas em `clauses` e
  candidatas em `clause_extraction_candidates`.
- Vinculo com o projeto: `project_id` em cada documento. Vinculo com contrato base:
  `contractual_parent_document_id` + `contractual_incorporation_basis` (migration
  20260829090000). Estado real: 0 dos 3 aditivos vinculados.
- Vinculo com obrigacoes: `esg_obligations.source_document_version_id` e `clause_id`.
  Estado real: 0 obrigacoes; 12 clausulas registradas em 2 versoes.
- Documentos anteriores a janela que estabelecem obrigacoes vigentes: o ACC nao tem
  filtro de data na entrada; um contrato anterior a 22/05/2025 entra por upload manual
  com sua data real. Hoje nenhum documento tem data anterior a 22/05/2025 (contrato
  mais antigo: 20/03/2026). Falta registrar a vigencia explicitamente (lacuna).

## 5. Matriz de cobertura (linhas desta fonte)

Legenda de colunas: Fonte | Sistema | Projeto/obra | Responsavel (rotulo) | Permissao |
Data inicial | Data final | Esperado | Importado | Processado | Anexos/versoes | Ultima
sincronizacao | Frequencia | Falhas | Ausentes | Evidencia | Status | Bloqueio | Acao.

### CM-1 Lista Mestra de documentos tecnicos

| Campo | Valor |
|---|---|
| Fonte | ConstruManager, Lista Mestra |
| Sistema de origem | ConstruManager (API HTTP) |
| Projeto/obra | WEG Linhares, obra 34164 (1 de 1 obra importada) |
| Responsavel | Conta de servico do ACC; revisao humana por ADMINISTRADOR do projeto |
| Permissao | Credencial corporativa server-side; abrangencia de modulos/obras nao verificada |
| Data inicial | 19/03/2026 (criacao na origem) |
| Data final | 15/09/2026 (criacao); monitorado ate 21/11/2026 |
| Esperado | Nao verificavel sem consulta ao sistema de origem (192 e o total visto por rodada) |
| Importado | 192 documentos, 11 revisoes historicas, 25 pastas; 199 conteudos armazenados (178 unicos, 435,3 MiB) |
| Processado | 95 versoes promovidas (93 PROCESSED, 2 FAILED), incluindo revisoes historicas; DWG, IFC, RVT e demais formatos sem extrator nao sao promovidos |
| Anexos e versoes | Original com SHA-256; revisoes historicas em ordem; 4 referencias externas (acima do limite) |
| Ultima sincronizacao | 21/11/2026 21:18 (-03) |
| Frequencia | Metadados a cada 6 h; conteudo manual |
| Falhas | 1 de 254 sincronizacoes (06/09/2026); 1 de 21 rodadas de conteudo (12/11/2026); 2 promocoes FAILED |
| Ausentes | 22/05/2025 a 18/03/2026 (nenhum documento); out-nov/2026 sem documento novo; DWG sem texto extraido |
| Evidencia | Contagens deste documento; busca do ACC cobre "Construmanager" |
| Status | PARCIAL |
| Bloqueio | Nao ha prova de que o ConstruManager tenha documentos anteriores a 19/03/2026; exige consulta autorizada ao sistema de origem |
| Acao | Responsavel pelo ConstruManager confirma o total e o primeiro documento da obra; se existirem anteriores, nova rodada historica autorizada |

### CM-2 Correspondencias, protocolos, notificacoes, atas, pendencias, aprovacoes

| Campo | Valor |
|---|---|
| Fonte | ConstruManager, modulos de comunicacao e fluxo |
| Sistema de origem | ConstruManager |
| Projeto/obra | WEG Linhares (a confirmar) |
| Responsavel | A definir pela Axion |
| Permissao | Nao verificada |
| Data inicial / final | Sem dados |
| Esperado | Desconhecido |
| Importado / Processado | 0 / 0 |
| Anexos e versoes | Nao se aplica |
| Ultima sincronizacao | Nunca |
| Frequencia | Nenhuma |
| Falhas | Nao se aplica |
| Ausentes | Todo o periodo |
| Evidencia | Codigo chama so Login, Obra, Pasta, Arquivo e ListaMestra |
| Status | NAO CONECTADA |
| Bloqueio | Nao se sabe se a API oficial expoe estes modulos nem se a licenca/permissao da conta de servico os cobre; nao foi testado (conexao proibida nesta apuracao) |
| Acao | Pedir ao ConstruManager a documentacao da API e a lista de modulos liberados; caso nao haja API, usar exportacao autorizada (secao 6) |

### CM-3 Medicoes, Qualidade e SSMA no ConstruManager

| Campo | Valor |
|---|---|
| Fonte | ConstruManager, medicoes e registros de Qualidade/SSMA |
| Importado / Processado | 0 / 0 (SSMA tem fonte propria em Drive: 31 formularios, fora desta linha) |
| Status | NAO CONECTADA |
| Bloqueio | Mesmo de CM-2 |
| Acao | Mesma de CM-2; medicoes tambem podem vir por upload manual de planilha |

### DOC-1 Contratos e aditivos

| Campo | Valor |
|---|---|
| Fonte | Acervo de documentos (upload manual e e-mail) |
| Sistema de origem | Axion (arquivos de contrato) |
| Projeto/obra | WEG |
| Permissao | Upload por usuario autorizado do projeto |
| Data inicial / final | 20/03/2026 a 15/10/2026 (data do documento) |
| Esperado | Nao verificavel (depende da lista de contratos do cliente) |
| Importado | 9 contratos (1 excluido logicamente), 3 aditivos (1 excluido, FAILED), 1 proposta comercial |
| Processado | Todos PROCESSED exceto 1 aditivo FAILED; 12 clausulas, 327 candidatas em 2 versoes |
| Anexos e versoes | SHA-256 em todos menos 1 contrato (68 versoes do acervo sem hash) |
| Ultima sincronizacao | Nao se aplica (carga manual); ultima 15/10/2026 |
| Falhas | 1 aditivo FAILED |
| Ausentes | Vinculo aditivo-contrato (0 de 3); obrigacoes (0); medicoes; contratos anteriores a 22/05/2025 (nenhum com data anterior a 20/03/2026) |
| Evidencia | Contagens acima |
| Status | PARCIAL |
| Bloqueio | Nenhum tecnico; depende de fornecimento dos documentos |
| Acao | Axion lista contratos/aditivos vigentes (inclusive anteriores a janela), carrega, vincula aditivos ao contrato base e confirma obrigacoes por revisao humana |

## 6. Alternativa autorizada: exportacao do ConstruManager

Usar quando a API nao expuser um modulo ou quando a licenca/permissao nao permitir.

1. Quem exporta: usuario com permissao corporativa no ConstruManager, dentro da
   politica da Axion. Nenhuma credencial e compartilhada com o ACC.
2. Formato: pasta de arquivos originais, mais um manifesto CSV (UTF-8, virgula ou
   ponto e virgula) com as colunas `origem_id, tipo_origem, numero, titulo, revisao,
   data_documento, autor, status_origem, arquivo, sha256, tamanho_bytes`.
   `tipo_origem`: CORRESPONDENCIA, PROTOCOLO, DOCUMENTO_TECNICO, REVISAO, APROVACAO,
   PENDENCIA, NOTIFICACAO, ATA, CONTRATO, ADITIVO, MEDICAO, QUALIDADE ou SSMA.
   Datas AAAA-MM-DD ou DD/MM/AAAA; `arquivo` caminho relativo.
3. Controles (implementados em `apps/web/lib/integrations/construmanager/export-manifest.ts`,
   funcao pura): origem, autor, data valida, SHA-256 e tamanho obrigatorios; data
   nunca inferida; caminho sem `..`; duplicidade por origem+revisao rejeitada;
   conteudo identico sinalizado; item anterior a 22/05/2025 sinalizado e, se for
   contrato ou aditivo, marcado para registro de vigencia; sugestao de tipo
   documental mantem o tipo declarado na origem.
4. Ponto de entrada: o manifesto validado orienta o upload multiplo existente em
   Documentos (cada arquivo e conferido contra o SHA-256 do manifesto antes do envio;
   o original nao e alterado). Ainda NAO ha tela nem rotina que consuma o manifesto:
   o modulo valida e produz o plano; a carga continua manual e auditada.
5. Revisao humana obrigatoria antes de qualquer analise por IA; a IA nao altera o
   original e diferencia fato, inferencia e recomendacao.

Teste: `node scripts/test-construmanager-export-manifest.mjs` (25 verificacoes,
fixture sintetica).

## 7. Lacunas e acoes (em ordem de impacto)

1. Confirmar com o ConstruManager (licenca, documentacao da API, modulos e obras
   liberados para a conta de servico). Quem fornece: Axion/ConstruManager.
2. Confirmar total e data do primeiro documento da obra (cobertura anterior a
   19/03/2026). Dependente de consulta autorizada ao sistema de origem.
3. Decidir entre API e exportacao para correspondencias, protocolos, atas,
   medicoes, Qualidade e SSMA.
4. Reprocessar as 2 promocoes FAILED e o aditivo FAILED (revisao humana).
5. Registrar vigencia e vinculo aditivo-contrato; criar obrigacoes a partir de
   clausulas revisadas.
6. Incluir hash SHA-256 nas 68 versoes sem hash (somente com o original disponivel).
7. Habilitar extracao para DWG/IFC/RVT, ou manter como referencia sem texto.
8. Nenhuma alteracao de agendamento, migration ou politica foi feita nesta etapa.
