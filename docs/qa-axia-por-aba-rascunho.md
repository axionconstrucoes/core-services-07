# Q&A da AXIA por aba — rascunho para revisão

> **Estado:** RASCUNHO em revisão de Reynaldo. **A AXIA ainda NÃO consulta este arquivo** e **nada dele foi carregado na base de conhecimento da AXIA**; as respostas da AXIA continuam vindo da base fixa em `lib/assistant/knowledge.ts`.
>
> **Fonte:** cada resposta remete a uma seção de `docs/manual-referencia-acc.md` (a "fonte aprovada"). As respostas são curtas e só repetem o que o manual afirma; onde o manual registra divergência ou falta de prova, a resposta diz isso.
>
> **Consulta pela AXIA — PENDENTE.** A AXIA atual (`apps/web/lib/assistant/knowledge.ts`) responde por uma **base fixa escrita no código**, com busca por palavras-chave. **Não existe** hoje um mecanismo para ela consultar conteúdo aprovado em arquivo ou em banco; por isso não há demonstração de resposta com fonte nesta etapa. Para ligar este Q&A à AXIA é preciso: (1) aprovar as respostas; (2) definir o formato aprovado (por exemplo, entradas com id, palavras-chave, resumo, passos, link da tela e seção do manual); (3) gerar/atualizar `knowledge.ts` ou criar um carregador de conteúdo aprovado; (4) testar. Nada disso foi feito, para preservar o comportamento atual.
>
> **Como usar:** em cada aba há as **perguntas sugeridas pelo sistema** (Q) e um quadro **"Perguntas do Reynaldo"** para você acrescentar as suas, com a resposta pretendida e a seção do manual. Marque o status de cada item: `RASCUNHO`, `APROVADO` ou `REVISAR`.

Formato de cada item: **Q** pergunta · **R** resposta curta · **Fonte** seção do manual · **Status**.

---

## Entrada e projetos (manual 4.1)

**Q1. Como entro no ACC?** — **R:** Pelo login com a conta Google corporativa (`@axion.com.br`). Contas de outro domínio são recusadas. Depois do login você vê as obras às quais tem acesso; o acesso é por projeto. **Fonte:** 4.1. **Status:** RASCUNHO.

**Q2. Por que não vejo uma obra?** — **R:** Ter a conta Google não basta: o acesso é concedido por projeto pelo Administrador. Peça a inclusão na tela Usuários da obra. **Fonte:** 4.1, 4.30. **Status:** RASCUNHO.

**Q3. O que é a faixa "SISTEMA EM TESTE"?** — **R:** Aviso de que o sistema está em fase de testes; ela aparece em todas as páginas e só some por configuração e novo deploy, não por data. **Fonte:** 1 e 4.1. **Status:** RASCUNHO.

| Perguntas do Reynaldo (aba Entrada) | Resposta pretendida | Seção do manual | Status |
|---|---|---|---|
| | | | |

## Dashboard (4.2)

**Q1. O que mostra o Dashboard?** — **R:** Visão executiva da obra: alertas ativos, quantidade de eventos, risco atual, integrações, aditivos, avanço físico, financeiro resumido, SSMA, prazo/planejamento e status do relatório semanal. **Fonte:** 4.2. **Status:** RASCUNHO.

**Q2. O valor dos aditivos do Dashboard é confiável?** — **R:** O manual registra que o valor base do contrato usado no cálculo de aditivos está fixo no código (divergência a revisar); confirme o número com o responsável antes de usá-lo em decisão. **Fonte:** 4.2 e Anexo D. **Status:** REVISAR.

| Perguntas do Reynaldo (Dashboard) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Timeline (4.3)

**Q1. Como busco um assunto em toda a obra?** — **R:** Pelo campo de busca da Timeline, que pesquisa no acervo; use os filtros de fonte, categoria, período e participantes para refinar. **Fonte:** 4.3. **Status:** RASCUNHO.

**Q2. Como exporto a Timeline para uso jurídico?** — **R:** A exportação gera o conjunto filtrado em dossiê PDF, índice XLSX/CSV, arquivos originais e ZIP. Qualquer membro da obra exporta e a exportação fica registrada na auditoria. **Fonte:** 4.3. **Status:** RASCUNHO.

**Q3. Por que não aparecem eventos recentes?** — **R:** A Timeline abre filtrada do início do projeto até o prazo-base, o que pode esconder eventos posteriores; ajuste o período. **Fonte:** 4.3. **Status:** REVISAR.

| Perguntas do Reynaldo (Timeline) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## EVENTOS (4.4 a 4.6)

**Q1. O que é um evento?** — **R:** Registro cronológico de algo da obra com possível implicação contratual. O detalhe mostra o achado de IA (com severidade e confiança), a evidência original, o confronto com cláusulas, anotações e o histórico de ações. **Fonte:** 4.4, 4.5. **Status:** RASCUNHO.

**Q2. Quem pode enviar o alerta de um evento?** — **R:** O envio é manual e só o Administrador consegue. A IA prepara, uma pessoa aprova e o sistema envia; nunca é automático. **Fonte:** 4.5, 6.4, 6.7.4. **Status:** RASCUNHO.

**Q3. Como respondo a um lote de alertas?** — **R:** Pelo botão do e-mail você abre a tela do lote e define uma ação por alerta (Resolvido, Em andamento ou Enviado para outro colaborador); salva aos poucos e confirma quando todos tiverem ação. **Fonte:** 4.6. **Status:** RASCUNHO.

| Perguntas do Reynaldo (EVENTOS) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Solicitações (4.7)

**Q1. Para que servem as Solicitações?** — **R:** São pedidos rastreáveis para alguém analisar, responder ou executar algo; a lista mostra a situação (Aberta, Encerrada, Cancelada) e o detalhe permite enviar por e-mail e ver respostas. **Fonte:** 4.7. **Status:** RASCUNHO.

| Perguntas do Reynaldo (Solicitações) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Ações e Escalonamentos (4.8 a 4.11) — ver também cap. 7

**Q1. Quando um alerta passa do responsável para o gestor?** — **R:** Em ALTO e CRÍTICO, quando o prazo de assumir da Matriz vence sem a ação ser assumida (Crítico: 1 hora corrida; Alto: 4 horas úteis), ou na hora, se o responsável escolher Tomando providências, Enviar para, Especialista ou Outro. O aviso sai no primeiro ciclo horário depois do vencimento. **Fonte:** 7.2, 7.3, 7.5. **Status:** RASCUNHO.

**Q2. O que acontece se eu responder "Em andamento"?** — **R:** No alerta de risco, equivale a "Tomando providências": a ação é marcada como assumida e, em Alto/Crítico, sobe imediatamente ao próximo nível. Nos lembretes recorrentes de alertas de contrato, "Em andamento" só mantém os lembretes. **Fonte:** 7.3, 9.1 P4. **Status:** RASCUNHO.

**Q3. Qual a diferença entre prazo de ação, envio imediato e lote semanal?** — **R:** Prazo de ação é o tempo para agir (Tabela 1); envio imediato é o aviso no próximo ciclo horário para Alto/Crítico no módulo de riscos semanais; lote semanal é o consolidado de Médio/Baixo às quartas, a partir das 07:00. Nos eventos do Ledger o envio é manual. **Fonte:** 6.7.1, 6.7.2. **Status:** RASCUNHO.

**Q4. Os prazos contam feriados?** — **R:** Não. Feriados ainda não são considerados; sábados e domingos não contam nos prazos úteis. **Fonte:** 7.4. **Status:** RASCUNHO.

**Q5. Quem configura os prazos?** — **R:** O Administrador, na Matriz de SLA (a tela de configuração não tem link direto; o botão da tela de Ações leva à Matriz em Usuários). **Fonte:** 4.10. **Status:** REVISAR.

**Q6. O que significa "Limite de escalonamento atingido"?** — **R:** A Diretoria também deixou o prazo vencer; fica registrado, sem novo e-mail e sem nível seguinte. **Fonte:** 7.2.1. **Status:** RASCUNHO.

| Perguntas do Reynaldo (Ações e Escalonamentos) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Alertas por e-mail e telas de resposta (4.12 a 4.16)

**Q1. Por que este risco foi classificado como CRÍTICO?** — **R:** Porque, pelos critérios adotados, o descumprimento foi declarado iminente (ou o prazo venceu), há penalidade prevista em cláusula verificada e não há tempo de mitigação. A sugestão separa Fato, Inferência e Recomendação; o grau valido é o da revisão humana mais recente. **Fonte:** 6.3 a 6.5, 9.1 P1. **Status:** RASCUNHO.

**Q2. Abrir o link do e-mail registra alguma coisa?** — **R:** Não: abrir o link por si só não registra nada; é preciso escolher a ação e confirmar. **Fonte:** 4.13, 4.16. **Status:** RASCUNHO.

**Q3. Posso consultar a IA sobre um alerta?** — **R:** Sim, pelo CONSULTAR IA dos e-mails de alerta legados ou pela ação ESPECIALISTA no alerta formal. A consulta só lê: não altera o alerta nem registra providência, e a resposta exige revisão humana. **Fonte:** 4.15, 8.3. **Status:** RASCUNHO.

| Perguntas do Reynaldo (Alertas) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Providências (4.17, 4.18)

**Q1. Quando uma providência passa a gerar alerta?** — **R:** Quando a janela abre, 60 dias corridos antes do término previsto, ou no prazo individual; sem escolha de grau, nasce Médio provisório. **Fonte:** 4.17, 6.5. **Status:** RASCUNHO.

**Q2. Quem pode alterar o grau de risco?** — **R:** A tela indica gestor, gerente e administrador, mas em teste com as migrations reais só o administrador conseguiu registrar; a produção não foi consultada. **Fonte:** 6.4, Anexo E. **Status:** REVISAR.

| Perguntas do Reynaldo (Providências) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Jurídico e revisões (4.20 a 4.22)

**Q1. Posso perguntar ao Consultor Jurídico sobre uma obra já contratada?** — **R:** O painel aparece, mas hoje a consulta é recusada fora do espaço pré-contratual (divergência registrada). **Fonte:** 4.20, 8.2, Anexo B D2. **Status:** REVISAR.

**Q2. O que a revisão de cláusulas faz?** — **R:** Mostra candidatos a cláusula extraídos dos contratos e aditivos; a cláusula definitiva só existe depois da aprovação humana, registrada na auditoria. A lista não equivale à análise integral do contrato. **Fonte:** 4.22, 6.2. **Status:** RASCUNHO.

**Q3. O especialista consegue consultar um aditivo com OCR parcial?** — **R:** Não. Os especialistas leem só a camada de texto (PDF), DOCX e TXT; PDF escaneado falha e imagens/XLSX não são suportados. O OCR existe apenas no processamento de documentos, que sinaliza "cobertura parcial". Confira sempre o arquivo original. **Fonte:** 8.7, Anexo E. **Status:** RASCUNHO.

| Perguntas do Reynaldo (Jurídico/Revisões) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Documentos (4.23)

**Q1. Que arquivos posso enviar e o que acontece depois?** — **R:** Contratos, aditivos, editais, propostas e outros documentos entram por upload manual, com versões, tipo, idioma e leitura/OCR; a tela mostra o status de processamento e a cobertura da leitura. **Fonte:** 4.23. **Status:** RASCUNHO.

**Q2. O que significa "cobertura parcial"?** — **R:** Que parte das páginas não foi lida por completo; não trate o documento como lido integralmente e confira o original. **Fonte:** 6.6. **Status:** RASCUNHO.

| Perguntas do Reynaldo (Documentos) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Financeiro (4.24)

**Q1. De onde vêm os números do Financeiro?** — **R:** Somente da aba Financeiro da planilha Excel do relatório semanal, nunca de PDF nem de valores digitados. Quem vê: Administrador/Gerente ou áreas Diretoria/Financeiro, e depende de a funcionalidade estar ativa. **Fonte:** 4.24. **Status:** RASCUNHO.

| Perguntas do Reynaldo (Financeiro) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Experts IA (4.25, cap. 8)

**Q1. Qual especialista devo usar para esta dúvida?** — **R:** Uso do sistema → AXIA. Contrato/aditivo → Jurídico. Estratégia e valores → Comercial. Prazo → Planejamento. SSMA/ESG → ESG. Dúvida sobre um alerta → CONSULTAR IA ou ESPECIALISTA. Assunto que cruza áreas → curadoria multiagente. Nenhum decide: todos exigem revisão humana. **Fonte:** 8.3, 9.1 P5. **Status:** RASCUNHO.

**Q2. Os especialistas executam ações no ACC?** — **R:** Não: apenas respondem. As exceções são registros: a avaliação de atraso (grava a avaliação), a curadoria multiagente (grava auditoria) e a ação ESPECIALISTA no alerta (grava a resposta na conversa do alerta). **Fonte:** 8.4. **Status:** RASCUNHO.

**Q3. Como confiro a resposta de um especialista?** — **R:** Pela base contratual citada (documento, cláusula e trecho) e, na CONSULTAR IA, pela lista "Fontes utilizadas" com links; abra o documento original. Fatos documentados ainda não trazem fonte por item. **Fonte:** 8.1, 8.6. **Status:** RASCUNHO.

| Perguntas do Reynaldo (Experts IA) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Integrações (4.26)

**Q1. O que é integrado ao ACC?** — **R:** E-mail corporativo (Google Workspace), Diário de Obra, Construmanager e ESG/SSMA; contratos, aditivos e editais entram por upload manual em Documentos. O status de cada fonte aparece na aba. **Fonte:** 4.26. **Status:** RASCUNHO.

| Perguntas do Reynaldo (Integrações) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## ESG/SSMA (4.27 a 4.29)

**Q1. Para que serve a aba ESG/SSMA?** — **R:** Para comprovar obrigações contratuais de ESG/SSMA: prazo, comprovação, evidência, status e risco de penalidade. Não é um sistema de ESG corporativo nem de gestão de segurança do trabalho. **Fonte:** 4.27. **Status:** RASCUNHO.

**Q2. Como instalo o app de campo e o que funciona sem internet?** — **R:** O app de campo (PWA) é instalado pelo navegador por link ou QR Code, sem loja. Registros e checklists feitos sem sinal ficam na fila do aparelho e sincronizam quando a internet volta; consultar a IA exige internet. **Fonte:** 4.29. **Status:** RASCUNHO (funcionamento em aparelho real não validado).

| Perguntas do Reynaldo (ESG/SSMA) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Usuários, Autorizações, Auditoria (4.30 a 4.32)

**Q1. Como dou acesso a alguém?** — **R:** O Administrador adiciona ou pré-cadastra a pessoa na tela Usuários, definindo cargo, área, permissão e status. **Fonte:** 4.30. **Status:** RASCUNHO.

**Q2. O que é a Autorização de e-mail?** — **R:** Registro do consentimento do colaborador para o ACC usar a caixa de e-mail dele em uma obra (aceite, recusa, revogação), com histórico imutável. Não conecta a conta Google; recusar ou revogar ainda não interrompe a sincronização (decisão pendente). **Fonte:** 4.31. **Status:** REVISAR.

**Q3. Quem vê a Auditoria?** — **R:** Todo membro da obra (apesar de o texto da tela falar em Diretoria). Os filtros são inferidos do texto e a consulta não tem paginação. **Fonte:** 4.32. **Status:** REVISAR.

| Perguntas do Reynaldo (Usuários/Autorizações/Auditoria) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

## Ajuda, AXIA e Start-up (4.33 a 4.35)

**Q1. A AXIA responde sobre o meu contrato?** — **R:** Não. Ela orienta sobre o uso do ACC com base no tutorial e na ajuda, só por texto nesta fase; não lê dados da obra e não altera nada. **Fonte:** 4.34, 8.5. **Status:** RASCUNHO.

**Q2. Posso ouvir a resposta da AXIA?** — **R:** Ainda não: nesta fase a AXIA responde só por texto. A leitura em voz fica para a Fase 3. **Fonte:** 1, 4.34. **Status:** RASCUNHO.

**Q3. Onde encontro o tutorial?** — **R:** Na aba Ajuda e tutorial, em PDF (consulta) e PowerPoint (editável). **Fonte:** 4.33. **Status:** RASCUNHO.

**Q4. O que é o Start-up ACC?** — **R:** Tela do Administrador para validar os riscos históricos (achados Alto e Crítico anteriores à entrada do ACC), de modo que fatos antigos já pacificados não gerem alertas novos. **Fonte:** 4.35. **Status:** RASCUNHO.

| Perguntas do Reynaldo (Ajuda/AXIA/Start-up) | Resposta pretendida | Seção | Status |
|---|---|---|---|
| | | | |

---

## Perguntas gerais do Reynaldo (qualquer aba)

| Aba | Pergunta | Resposta pretendida | Seção do manual | Status |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |

## Lacunas conhecidas da base atual da AXIA (a corrigir ao ligar este Q&A)

- Diz que há "três perfis" (existem quatro rótulos de tela: Administrador, Gerente, Colaborador e Leitura; o valor legado GESTOR equivale a Gerente).
- Cita CONSULTAR IA "no e-mail ou na tela do alerta"; o link vai nos e-mails legados, e o alerta formal usa a ação ESPECIALISTA.
- Não tem entradas sobre escalonamento, Matriz de SLA, hub Experts IA, ação ESPECIALISTA, curadoria multiagente nem CEO IA; essas perguntas caem no "não encontrei".
- Não lista Autorizações entre os itens restritos ao Administrador.
