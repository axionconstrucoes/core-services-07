# 33 - Inteligência integrada: o que o ACC já relaciona entre fontes (e o que ainda não)

Status: apuração e teste local concluídos (Fase 5 / Frente G). Nenhum dado real foi usado em teste, fixture ou IA; nenhuma IA real, API, e-mail ou conexão remota foi acionada. Este documento não autoriza nada: quem autoriza é o Dono (doc `06`).

Regra de leitura: **só é afirmado o que um teste executado demonstra**. Onde o sistema não produz algo, está escrito NÃO.

Fontes: código em `apps/web/lib` (risk-alerts, email-classification, email-pipeline, email-replies, sla, ai, integrations, pilares), migrations em `supabase/migrations`, SLA vigente em `docs/implantacao/26-sla-vigente-x-aprovado-weg.md`, e a cópia local do backup de produção de 22/11/2026 (somente contagens agregadas, somente leitura).

## 1. Resposta curta

1. **Cada fonte funciona sozinha e deixa rastro até a origem.** E-mail, relatório semanal, cronograma e ingestão semanal viram *casos de risco* com SLA, e-mail de alerta e auditoria. Diário de obra gera *achados estruturados*. ConstruManager normaliza *documentos*. Contrato existe como *cláusulas* e *documentos*.
2. **Antes desta frente NADA relacionava fontes diferentes sobre o mesmo fato.** O teste da seção 3 mostra três casos de três fontes sobre a mesma frente de obra, todos independentes: nenhum referencia outro, cada um abre a própria ação de SLA. A única ligação estruturada existente é alerta -> RNC/garantia/sinistro (`acc_alert_links`), que não cobre e-mail, diário, cronograma, ConstruManager nem contrato.
3. **Incremento implementado (pequeno, puro, sem IA):** `apps/web/lib/risk-alerts/cross-source-dossier.ts`. Relaciona registros **já produzidos** pelas fontes, só por **referência comum explícita** (ex.: nº de cláusula, frente/linha) ou, sem chave, por **proximidade temporal como HIPÓTESE**. Gera cronologia, fatos, hipóteses, fontes ausentes, autores de registro e rastreabilidade, e um texto para o ESPECIALISTA em envelope de dado externo. **Não** conclui causa, **não** atribui responsabilidade, **não** é persistido e **ainda não está ligado a nenhuma tela, ciclo ou e-mail** (ver seção 6).
4. **No banco de produção (backup de 22/11/2026) a base para a análise cruzada ainda está vazia no lado e-mail:** 713 e-mails (30/09/2025 a 19/11/2026), 0 classificações de e-mail e 0 sinais de risco de e-mail; nenhum caso de risco com origem EMAIL. Os 43 casos de risco existentes vêm só de cronograma (10), relatório semanal (24) e ingestão semanal (9). Há também 201 relatórios de diário, 35 achados de diário, 192 documentos do ConstruManager, 12 cláusulas, 171 documentos e 1 evento contratual (contagens agregadas).
5. **Alertas por e-mail:** resposta, encaminhamento e resolução pelo e-mail estão implementados e testados para os tipos de alerta de risco, SSMA, ação de SLA, resumo semanal e contrato. Há lacunas pontuais (seção 4.3).

## 2. Inventário: o que existe para análise cruzada

| Capacidade | Onde (código) | O que faz de verdade | Limite |
|---|---|---|---|
| Classificação de e-mail (determinística) | `lib/email-classification/` (`classify.ts`, `rules.ts`, `party.ts`) | Vínculo ao projeto (LINKED / CANDIDATE / AMBIGUOUS / UNLINKED), oficialidade da parte, checagem de autoridade, pilar e sinais por regra. Sempre INDÍCIO (`confirmed=false`) | Regras por palavra-chave; "interferência" não é tipo de sinal. Sem IA |
| Pipeline de e-mail | `lib/email-pipeline/` | Roda a classificação e grava (desligado por padrão; gravação só com flag dupla) | Em produção ainda sem linhas |
| Sinais por pilar | `email_risk_signals`; `lib/risk-alerts/collect-email-risk-cases.ts` | Sinal vira caso de risco: só LINKED+ANALYZED; INDÍCIO nunca passa de ALTO; CRÍTICO exige confirmação humana; injeção => REVIEW_REQUIRED; separa FATO, INFERÊNCIA e RECOMENDAÇÃO; "SEM DADOS" | Um caso por sinal; sem ligação com outras fontes |
| Pilares | `lib/pilares/` (4 pilares: Prazo, Custo, Segurança, Qualidade; Jurídico e Comercial são áreas) | Painel por pilar a partir de RNC, garantias, sinistros, cronograma, SSMA | Agrega por pilar; não relaciona fato entre fontes |
| Vínculos entre registros | `acc_alert_links` (migration `20261123303000`), `lib/pilares/alert-links*.ts`; `risk_alert_action_links`; `event_cross_references`; `event_evidence` | Alerta -> RNC / garantia / sinistro (estruturado, histórico append-only, mesmo projeto); evento contratual -> cláusulas/evidências/e-mails | Não cobre diário, cronograma, ConstruManager; evento contratual existe como registro manual/assistido (1 em produção) |
| Casos de risco e ciclo | `lib/risk-alerts/` (`collect-risk-cases.ts`, `plan-risk-alerts.ts`, `run-risk-alert-cycle.ts`, `alert-state-machine.ts`) | Cronograma (`schedule_version_comparisons`), relatório semanal (`weekly_report_sheets`), ingestão semanal e e-mail viram caso; ação SLA; e-mail imediato ALTO/CRÍTICO; consolidado semanal MÉDIO/BAIXO; escalonamento | Cada caso é uma ilha por fonte |
| Communication ledger | `lib/risk-alerts/communication-ledger.ts` (e `docs/` do piloto) | Quem foi avisado em cada etapa (responsável, nível 2, diretoria), suprimidos x entregues, reemissão autorizada | É ledger de **comunicação do alerta**, não de fatos entre fontes |
| Event ledger | migration `20260818224157_event_ledger_foundation.sql`; `lib/ai/context/build-event-context.ts`; `lib/ledger/` | Evento contratual com evidências (e-mail, documento), cláusulas relacionadas e candidatos de confronto; contexto somente leitura para o Expert | Depende de evento criado e vinculado; não é preenchido automaticamente pelas fontes |
| Diário de obra | `lib/integrations/diario-de-obra/` | RDO normalizado; regras determinísticas (clima, efetivo, ocorrência por categoria estruturada, série); achado com evidência de **schema fechado** (sem texto livre) | Por desenho NÃO lê texto: não tem como citar "interferência"; só categoria, contagem e data |
| ConstruManager | `lib/integrations/construmanager/` | Pastas, documentos, versões, vigência, conferência cruzada interna (ListaMestra x Arquivo), conteúdo opcional | Metadados do documento; comunicação/transmittal como texto não é modelada; sem ligação com alerta ou contrato |
| Contrato | tabelas `clauses`, `documents`; `lib/clause-mapper.ts`, `lib/ai/legal/` | Cláusulas e documentos contratuais; `clause_ref` no e-mail só quando há diretiva | Nenhuma extração automática de obrigação a partir de e-mail |
| Criticidade justificada | `lib/risk-classification/suggest-risk.ts` | Função pura: FATO / INFERÊNCIA / RECOMENDAÇÃO e `missingInformation`; devolve "indeterminado" quando faltam insumos | Insumos (iminência, tempo de mitigação, penalidade) são declarados por pessoa; sem penalidade em cláusula nunca passa de MÉDIO |
| Especialistas (IA da área) | `lib/ai/experts/` (comercial, ESG, jurídico, planejamento, engenharia, qualidade, CEO), `lib/ai/alert-consult/`, `lib/ai/curation/`, `lib/risk-alerts/experts/` | Consulta por área/assunto, curadoria multi-Expert + consolidação, provedor FAKE determinístico nos testes; grounding, limite de IA e auditoria | O Expert de um alerta de e-mail recebe só o contexto desse e-mail (teste 8) |
| AXIA | `lib/assistant/` | Assistente de **uso do ACC**, separada dos especialistas | Não participa de análise de alerta (seção 5) |
| Rastreabilidade até a fonte | `originPath`, `evidence_ref` (`email:<id>#body@offset`), `event_evidence`, `acc_alert_link_events`, trilha de auditoria do ciclo | Cada caso aponta a origem; a mensagem original nunca é alterada | Rastreia por fonte; não há trilha do "dossiê" (ainda) |
| SLA | `lib/sla/` | Prazo para assumir e escalonamento por matriz (seção 3.2) | Ver divergência de valores padrão do código abaixo |

Divergência conhecida (não alterada aqui): a matriz **padrão do código** (`default-matrix.ts`) usa MÉDIO 2 dias úteis e BAIXO 5 dias úteis; a matriz **vigente na WEG** usa MÉDIO 1 e BAIXO 3 (doc 26). Os testes desta frente usam regras explícitas da WEG (1 h corrida, 4 h úteis, 1 dia útil, 3 dias úteis). Nada neste documento afirma 2 e 5 para a WEG.

## 3. O cenário obrigatório, medido

Teste: `scripts/test-f5-g-analise-cruzada.mjs` (16 verificações, todas passam). Fixtures **sintéticas** (domínio `.invalid`, contrato `CT-SIM-0001`). Funções reais, ciclo real com store em memória e provedores falsos. Sem rede, sem banco, sem IA real.

Cenário: um colaborador envia e-mail comunicando interferência entre a tubulação da Linha 3 e uma viga, citando a Cláusula 8.2; o RDO de 17/11 registra "Incompatibilidade de Projetos" e "Dia parado"; o relatório semanal W47 mostra avanço abaixo do planejado na Linha 3; a comparação de cronograma W47 indica deslocamento de 12 dias da data final; o ConstruManager contém um documento formal "RFI-045 Interferência Linha 3 REV01"; o contrato (Cláusula 8.2) obriga a comunicar em 24 h e prevê decisão em 5 dias úteis.

### 3.1 O que cada fonte entrega hoje (testes 1 a 5)

- E-mail: INDÍCIO de PRAZO (`RISCO_PARALISACAO`, `ATRASO_FABRICACAO_ENTREGA`), nunca confirmado; oficialidade INTERNA; sem `clause_ref` (a mensagem não é diretiva); a palavra "interferência" **não** é identificada como tipo do fato.
- Diário: achados `OCORRENCIA_REGISTRADA` das categorias `INCOMPATIBILIDADE_DE_PROJETOS` (MÉDIO) e `DIA_PARADO` (ALTO), com evidência estruturada. Nenhum texto livre.
- Relatório semanal e cronograma: casos de risco com impacto objetivo (deslocamento 12 dias). Nenhum referencia outra fonte.
- ConstruManager: documento normalizado (nome, revisão 01, pasta, autor do upload, data). Nenhum campo de vínculo.
- Ciclo real: três casos independentes (EMAIL, SCHEDULE_COMPARISON, WEEKLY_REPORT_SHEET). O caso EMAIL ALTO abre ação de SLA com prazo para assumir = 4 h úteis (10:00 -> 14:00 de Brasília). Nenhum caso referencia outro.

### 3.2 Matriz vigente da WEG, conferida (teste 6)

| Grau | Prazo para assumir | Resultado do teste (criação terça 10:00 de Brasília) |
|---|---|---|
| CRÍTICO | 1 h corrida | 11:00 |
| ALTO | 4 h úteis | 14:00 |
| MÉDIO | 1 dia útil | quarta 10:00 |
| BAIXO | 3 dias úteis | sexta 10:00 |

Escalonamento: vencido o prazo sem reconhecimento sobe ao Nível 2; vencido o intervalo seguinte sobe à Diretoria (CRÍTICO +1 / +2 h corridas; ALTO +4 / +4 h úteis; MÉDIO +1 / +1 dia útil; BAIXO +3 / +2 dias úteis). Conferido por `computeEscalation` nos quatro graus.

### 3.3 Saída esperada (a) a (l): o sistema produz? (teste 15)

"Existente" = o que o código já fazia antes desta frente. "Com dossiê" = com o incremento F5-G.

| Item | Existente | Com dossiê F5-G |
|---|---|---|
| (a) descrição objetiva do fato | SIM por fonte (e-mail: trecho + "INDÍCIO"); **NÃO** consolidada entre fontes | SIM: fatos das fontes, cada um com origem |
| (b) evidências de origem | SIM por fonte (`originPath`, `evidence_ref`) | SIM: 6 registros, 5 origens distintas |
| (c) cronologia | **NAO** (nenhum módulo ordena eventos de várias fontes) | SIM: ordenada, com âncora e registros sem data declarados |
| (d) responsáveis | PARCIAL: responsável pelo **tratamento** vem da matriz; responsabilidade pelo **fato** nunca é atribuída (por desenho) | PARCIAL: só "autor do registro" com base documental (remetente do e-mail; quem subiu o arquivo no ConstruManager) |
| (e) efeitos no planejamento | PARCIAL: cronograma informa 12 dias, sem ligação com a interferência | PARCIAL: cronograma ligado como HIPÓTESE temporal (sem chave comum); causalidade não comprovada |
| (f) riscos contratuais | **NAO** para esta mensagem (cláusula só é apontada em diretiva; nenhuma obrigação é extraída do e-mail) | PARCIAL: cláusula citada fica relacionada por referência comum; risco/penalidade exige humano ou Expert |
| (g) criticidade justificada | PARCIAL: nível por regra de tipo (ALTO por ser INDÍCIO); justificativa FATO/INFERÊNCIA/RECOMENDAÇÃO só via `suggestRisk` com insumos declarados | PARCIAL: igual (o dossiê não calcula criticidade) |
| (h) ações recomendadas | PARCIAL: recomendação **genérica** ("conferir a mensagem original e confirmar ou descartar") | PARCIAL: igual; ação específica só por Expert ou pessoa |
| (i) responsável pelo encaminhamento | SIM: Nível 1 / 2 / Diretoria da área pela matriz + ENVIAR PARA | SIM (reaproveita) |
| (j) prazo e escalonamento | SIM: 1 h corrida / 4 h úteis / 1 d.u. / 3 d.u. | SIM (reaproveita) |
| (k) rastreabilidade e auditoria | SIM: outbox, eventos e auditoria do ciclo por caso | PARCIAL: o dossiê é puro e **não é persistido** (sem auditoria própria) |
| (l) fato x hipótese x informação ausente | SIM por fonte (e-mail: FATO / INFERÊNCIA / RECOMENDAÇÃO, "SEM DADOS") | SIM entre fontes (fatos, hipóteses, fontes ausentes) |

Pontos que o teste revelou e que merecem decisão humana:

- **Divergência de grau:** o caso de e-mail nasce ALTO (regra de tipo: paralisação não confirmada), mas `suggestRisk` com a cláusula identificada e sem penalidade comprovada resulta MÉDIO. Os dois são "indícios com regras diferentes"; nenhum deles é decisão. Convém definir qual prevalece na tela.
- **Diário de obra** só entra por proximidade temporal (HIPÓTESE), nunca por conteúdo, porque o módulo foi desenhado para não ler texto livre. Ligar diário a uma interferência específica exigirá uma chave estruturada (por exemplo, atividade ou frente no RDO) e decisão de produto; não foi inventada.
- **ConstruManager** só relaciona por nome de arquivo ("Linha 3"); se a convenção de nomes da obra não repetir a referência, não há vínculo.

### 3.4 Como o dossiê relaciona (e como NÃO relaciona) — testes 9 a 14a

- **Referência comum** (chave explícita extraída de texto: "Cláusula N.N" e padrões informados por quem chama, como "Linha N"): vínculo RELACIONADO. Isso **não prova causa**.
- **Sem chave, a até 7 dias do fato e de outra fonte:** HIPÓTESE, nunca vínculo.
- **Fora da janela e sem chave, ou sem data:** não relacionado.
- **Fonte esperada sem registro:** declarada "informação ausente"; nada é presumido (teste 11).
- **Responsabilidade:** nenhuma frase atribui culpa; só "autor do registro" com a base (teste 10).
- **Isolamento:** registro de **outra obra** é recusado e contado, e não vaza para fatos, hipóteses, cronologia, rastreabilidade nem para o texto do Expert (teste 14a).
- **Segurança do conteúdo:** o texto para o Expert vai em envelope de **dado externo**; instrução embutida no e-mail gera aviso, nunca é obedecida (teste 13).
- **Pureza:** o módulo não toca banco, rede, ambiente nem IA (teste 14).

## 4. Alertas por e-mail: resposta, encaminhamento e resolução sem abrir o navegador

Requisito: todo alerta deve permitir responder, encaminhar e resolver diretamente pelo e-mail.

### 4.1 Evidências (todas executadas nesta frente, saída em arquivo, 0 falhas)

| Requisito | Prova (script e resultado) |
|---|---|
| Token de resposta (uso único, hash, expiração, projeto) | `test-email-reply-security` 17/17; `test-email-replies-n3-pure` 17/17; `test-email-replies-n3-sql` (no `test:sql`); `test-email-actions` e suítes de token (no `test:email`) |
| Remetente autorizado (identidade, domínio, caixa) | `test-email-sender-identity-hardening` 10/10; `test-email-workspace-tenant-symmetry` 11/11; `test-hotfix-risk-alert-authorization-sql` e `test-email-mailbox-hardening-sql` (no `test:sql`) |
| Comandos RESOLVIDO / EM ANDAMENTO / ENVIAR PARA | `test-operational-email-commands` 14/14; `test-operational-email-intents`; `test-risk-email-commands-p2` 14/14; `test-email-reply-mailto` 6/6 |
| ESPECIALISTA por e-mail | `test-email-specialist-by-email` 16/16; `test-email-specialist-sql` (no `test:sql`) |
| Idempotência e anti-duplicidade | `test-f5-d-email-alerts` (ciclo repetido não duplica casos, ações nem e-mails); `test-email-reply-confirmations-wiring`; `test-contract-alert-batch-concurrency` (no `test:email`); `test-ssma-esg-concurrency-realpg` (8 execuções simultâneas, sem e-mail duplicado) |
| SLA, resposta antes do escalonamento | `test-sla-escalation` 35/35; `test-reply-before-escalation` 12/12; `test-sla-holidays`, `test-sla-matrix-rule-selection` (no `test:alerts`) |
| Auditoria | `test-pilot-risk-alert-audit` e `test-pilot-risk-alert-actions` (66 verificações) no `test:alerts`; `test-communication-ledger` |
| Quatro botões em todo emissor de risco, consolidado, contrato, SSMA | `test-email-universal-all-emitters` |

Execução desta frente (ambiente limpo, `block-live-ai` ativo, saída em arquivo): `npm run test:email` (40 scripts), `npm run test:alerts` (26 scripts), `npm run test:sql` (47 scripts), mais os três `realpg` em PostgreSQL local descartável. Resultado: **0 falhas** em todos (cerca de 2.000 verificações `OK`: email 753, alerts 519, sql 712, realpg 29 + 18).

### 4.2 Como funciona (confirmado no código)

O e-mail de alerta traz atalhos `mailto` para uma caixa de respostas, já com o token do item no endereço e o código visível no assunto. O corpo pré-preenchido contém só o comando. A resposta é lida pela caixa de entrada, validada (token, remetente, projeto, expiração), interpretada **de forma conservadora** (o comando precisa abrir o texto e ser único; qualquer dúvida vai para revisão humana) e aplicada pela mesma máquina de estados do ACC. O ALTO/CRÍTICO exige anexo de evidência no RESOLVIDO e previsão com horário no EM ANDAMENTO. A confirmação volta por e-mail (`ACTION_CONFIRMATION`).

### 4.3 Lacunas apontadas (não corrigidas aqui; dependem de decisão)

1. **Tipos sem resposta por e-mail:** `VERSION_REVIEW` (impacto de versão do ConstruManager que exige ação do orçamentista) não é processável por e-mail (`EMAIL_REPLY_PROCESSABLE_KINDS` não o inclui) e sai pela variante informativa, **sem** os quatro botões. Acidente SSMA e falha operacional também são informativos, por desenho. Se "todo alerta" incluir esses, há trabalho.
2. **Escalonamento de SLA:** o atalho por e-mail só existe quando o destinatário é o responsável da ação ou administrador, a ação não está concluída e não está ligada a caso de risco/SSMA (`slaReplyEligible`); nos demais casos o e-mail não traz atalhos e o ACC no navegador é necessário.
3. **Resumo semanal** (MÉDIO/BAIXO) tem 3 botões ativos por item (o teste de emissores confere 3, não 4).
4. **EM ANDAMENTO** só é comando explícito com a linha "Previsão:"; sem ela a resposta cai na classificação livre e pode ir para revisão humana.
5. **Dependências operacionais, não de código:** a caixa de respostas precisa estar configurada e ser lida (supressão `REPLY_MAILBOX_NOT_CONFIGURED`); durante a trava de saída do piloto os e-mails vão só ao destinatário de teste; "sem acesso ao navegador" só vale com leitura de caixa de entrada em produção, o que depende de autorização e credencial e **não foi exercitado aqui** (sem e-mail real).
6. **Outlook:** há compatibilidade de **renderização** dos alertas (VML, texto simples); não há ingestão de caixa Outlook/Graph no código. O requisito "Gmail/Outlook" de histórico de 18 meses é, hoje, só Gmail.

## 5. AXIA x ESPECIALISTA

Confirmado: `test-especialista-never-axia` 7/7 (opções de ESPECIALISTA só com Experts oficiais; perguntas que citam a AXIA nunca resultam em destino AXIA; o código de roteamento e de consulta não importa o assistente AXIA; o botão ESPECIALISTA tem link próprio, distinto do acesso à AXIA), `test-email-specialist-by-email` 16/16, `test-alert-ai-consult` 23/23 e, no cenário desta frente (teste 8), o especialista consultado é `planning-director` e nunca a AXIA. Suítes da AXIA (`test-axia-escopo` 30/30, `test-axia-acesso` 16/16, `test-axia-sem-termos-internos` 14/14) confirmam o escopo de **uso do ACC**.

## 6. Menor incremento: o que foi feito e o que falta para virar funcionalidade

Feito (commit local, sem IA, sem banco):

- `apps/web/lib/risk-alerts/cross-source-dossier.ts`: `buildCrossSourceDossier`, `extractReferenceKeys`, `entryFromRiskCase`, `renderDossierForExpert`.
- `scripts/test-f5-g-analise-cruzada.mjs` (na lista `scripts/test-scripts.list`).

**Não** feito (precisa de decisão e/ou autorização; nenhum item exige IA real):

1. Ligar o dossiê ao caso: carregar, sob RLS e por obra, os registros relacionados (e-mail, relatório, cronograma, diário, ConstruManager, cláusulas) e passar o texto ao ESPECIALISTA (`additionalContext`). Pode ser feito sem migration.
2. Persistir e auditar o dossiê (tabela com versão da regra, entradas e chaves usadas; revisão humana). Exige migration nova; não criada.
3. Definir as chaves de referência por obra (atividade/frente/tag/nº de documento) e a convenção do diário; sem isso o vínculo é só HIPÓTESE temporal.
4. Resolver a divergência de grau (regra do e-mail x `suggestRisk`) e a recomendação específica (hoje genérica).
5. Preencher a base: classificar os 713 e-mails (pipeline desligado por padrão, gravação só com flag dupla), preencher o histórico anterior a 30/09/2025 (o objetivo é 22/05/2025), ingerir Outlook se for requisito. Cada passo exige autorização do Dono e, para gravação em produção, janela própria.
6. O ConstruManager precisa de um modelo de comunicação/transmittal para "comunicação formal" além do documento.

## 7. Isolamento entre organizações e projetos

Confirmado nos testes existentes: `test-lote4-isolation-realpg` 19/19 em PostgreSQL real local descartável (limites e auditoria dos Experts, RLS de dados usados pelos Experts, nunca vê dados de outro projeto), `test-email-workspace-tenant-symmetry` 11/11, e no `test:sql` as verificações de isolamento por obra para providência, lote de contrato, histórico, RLS de tabelas novas e permissões (usuário e administrador de **outra** obra não leem nem alteram). O dossiê desta frente recusa registro de outra obra (teste 14a), mas **não substitui RLS**: quem o alimenta deve ler sob RLS e filtrando por obra.

## 8. Testes desta frente

| Verificação | Resultado |
|---|---|
| `node scripts/test-f5-g-analise-cruzada.mjs` | 16 passaram, 0 falharam |
| `npx tsc --noEmit -p apps/web` | sem erros |
| `npm run lint` | 0 erros (14 avisos já existentes, nenhum nos arquivos novos) |
| `npm run test:email` | 0 falhas |
| `npm run test:alerts` | 0 falhas |
| `npm run test:sql` | 0 falhas |
| realpg (isolamento, reemissão, concorrência SSMA) | 0 falhas |

## 9. O que depende de autorização

- Gravar qualquer classificação de e-mail ou dossiê em produção; migration de persistência do dossiê.
- Ligar o dossiê ao ciclo, tela ou e-mail de alerta.
- Qualquer envio real de e-mail, uso de IA real, ingestão de Outlook, ou leitura de caixa de produção.
- Decidir a matriz de SLA da WEG (doc 26) e o valor padrão do código (2 e 5): **não alterados**.
