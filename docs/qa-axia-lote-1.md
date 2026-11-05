# Q&A da AXIA — Lote 1 (Navegação, Riscos, Escalonamento, Especialistas)

> **Estado:** PROPOSTA para aprovação de Reynaldo. **A AXIA ainda NÃO consulta este arquivo**; nada daqui foi carregado na base de conhecimento dela. A integração só acontece depois da aprovação.
>
> **Fonte aprovada:** `docs/manual-referencia-acc.md` (atualizado em 04/11/2026, produção `751fe2f`). Cada resposta repete só o que o manual afirma e remete à **seção exata**. Onde o manual registra divergência (D1, D2, D3…) ou ponto a revisar (F1 a F9, Anexo F), a entrada está marcada e a resposta proposta já diz o que é fato e o que está em revisão.
>
> **Origem:** `docs/qa-axia-por-aba-rascunho.md` (rascunho por aba, que continua válido para as demais abas). Este lote o refina nos quatro temas prioritários.

## Como revisar

1. Em cada entrada, marque o **Status**: `APROVADA`, `APROVADA COM AJUSTE (escreva o ajuste)` ou `REJEITADA`.
2. Use o quadro **"Perguntas do Reynaldo"** no fim de cada bloco para acrescentar as suas perguntas, com a resposta pretendida e a seção do manual.
3. Pontos que dependem de decisão sua estão em **"Decisões antes de aprovar"** (abaixo). Enquanto a decisão não sair, a resposta proposta usa a redação neutra indicada.

## Regra de integração (depois da aprovação)

- Cada **pergunta aprovada** (e as suas variações) recebe a resposta aprovada **com a seção do manual** ("Fonte: Manual do ACC, seção X").
- **Pergunta sem entrada aprovada** continua com o encaminhamento atual para a Ajuda e tutorial ("Não encontrei esse assunto…").
- A AXIA continua **só em texto**. A voz fica para a **Fase 3**.
- **Critério de aceite:** para cada pergunta aprovada, a resposta vem deste lote e cita a seção correta; para uma pergunta fora do lote, o encaminhamento à Ajuda permanece.

## Regra de encaminhamento: "Falar com o ADMIN"

**Quando aparece** (qualquer um dos três):
1. **Resposta parcial** — a entrada aprovada tem **Cobertura: parcial** (as 11 entradas que aguardam F1, D1, D2 ou D3 e R6/E10).
2. **Ausência de resposta aprovada** — a pergunta cai no encaminhamento atual ("Não encontrei esse assunto…").
3. **Clique em "Isso não respondeu à minha pergunta"** — botão novo, mostrado sob **toda** resposta da AXIA.

**Como aparece:**
- O texto **"Falar com o ADMIN"** em **amarelo `#FFD54F` e negrito**, com o mesmo amarelo do link do tutorial. **Posição:** na área escura da caixa, ao lado do link da Ajuda, **fora do cartão branco** da resposta (amarelo sobre branco não tem contraste; a regra do ACC é branco sobre escuro e preto sobre claro). **Decisão G2.**
- O **link da Ajuda é preservado** em todos os três casos ("Ajuda e tutorial" e "Abrir o tutorial completo").
- Na ausência de resposta aprovada, o texto atual do encaminhamento continua; "Falar com o ADMIN" é acrescentado.

**Para onde leva — DESTINO PENDENTE (decisão G1):**
- **Nenhum canal oficial de atendimento ao usuário está definido** no repositório nem nos documentos: os endereços institucionais encontrados (`crm@axion.com.br`, `axion@axion.com.br`, `acc_ia@axion.com.br`) são identidades de envio, de resposta de alertas e do piloto, **não** um canal de suporte. A aba **Usuários**, que lista os administradores, é **só do Administrador** desde o PR #129, então a AXIA não pode mandar o usuário "ver quem é o administrador"; a frase atual da AXIA ("peça a um administrador da obra em Usuários") está desatualizada (ponto F5).
- **Opções:** (a) e-mail para um endereço institucional de suporte do ACC (`mailto:`); (b) e-mail ao Administrador da obra, se o ACC passar a expor um contato por obra; (c) grupo de mensagens da Axion (Teams ou WhatsApp), se existir.
- **Enquanto o destino estiver pendente:** o texto aparece como orientação ("Peça ao administrador da sua obra") **sem link**, e o link só é ativado quando o canal for configurado no servidor.

**Privacidade (obrigatória):** o clique **apenas abre o canal** (por exemplo, uma mensagem **em branco** para o endereço). **Nada é enviado automaticamente**: nem a pergunta, nem a resposta, nem o histórico da conversa. O ACC **não grava** o texto digitado na AXIA por causa do clique. Opcional: um aviso curto, "Descreva a sua dúvida na mensagem; o ACC não envia o que você digitou aqui."

**Testes de encaminhamento ao ADMIN (para a integração em prévia local):**
| # | Teste | Esperado |
|---|---|---|
| A1 | Pergunta sem entrada aprovada | texto de encaminhamento + **Falar com o ADMIN** + link da Ajuda |
| A2 | Entrada com **Cobertura: parcial** | resposta + **Falar com o ADMIN** + link da Ajuda |
| A3 | Clique em "Isso não respondeu à minha pergunta" | aparece **Falar com o ADMIN** (e a Ajuda continua) |
| A4 | Entrada com **Cobertura: completa** | **não** mostra "Falar com o ADMIN" até o clique em A3 |
| A5 | Estilo | amarelo `#FFD54F`, negrito, fora do cartão branco; contraste ≥ 4,5:1 sobre o fundo escuro |
| A6 | **Privacidade** | o destino configurado **não contém** pergunta, resposta ou histórico (sem `body`, `q` ou similar na URL); a requisição de clique não carrega o texto digitado |
| A7 | Destino pendente | sem canal configurado, **não** há link morto: aparece só a orientação |
| A8 | Resposta em texto, controles de voz ocultos, citação do manual | continua válido em todos os casos |

## Decisões antes de aprovar

> Diagnóstico completo, com fontes e opções: `docs/diagnostico-fase-2-f1-d1-d2-d3.md`.

| # | Decisão | Por quê | Redação neutra usada enquanto isso |
|---|---|---|---|
| **F1** | **Eventos só para Administrador:** manter e ajustar os links, ou liberar a leitura do evento aos membros? | Hoje o botão "RESPONDER AO ACC" dos e-mails e os eventos da Timeline levam a uma página que dá 404 para quem não é Administrador (manual, Anexo F). | "A aba Eventos é só para o Administrador. Se você não a vê, peça a um Administrador." |
| **D1** | Quem pode registrar a revisão do grau de risco. | A tela diz "gestor, gerente ou administrador"; o banco só aceita Administrador (manual 6.4). | "Hoje, na prática, só o Administrador registra a revisão do grau." |
| **D2** | Envio de alerta de evento reclassificado para ALTO. | Pode sair no lote semanal automático; o envio de ALTO/CRÍTICO do Ledger é manual (manual 6.7.2 e 6.7.4). | "No Ledger o envio é manual; reclassificar para ALTO não retira nem acelera o evento no lote semanal." |
| **G1** | **Canal oficial** do "Falar com o ADMIN": e-mail de suporte do ACC, e-mail do Administrador da obra, ou grupo de mensagens? | Verificado em 04/11/2026 (código, variáveis de exemplo e documentos): **nenhum canal oficial registrado**; a aba Usuários é só do Administrador. | Orientação sem link até o canal existir. |
| **G2** | Onde mostrar "Falar com o ADMIN" em amarelo e negrito. | Amarelo sobre o cartão branco da resposta não tem contraste. | Mostrar na área escura, ao lado do link da Ajuda. |
| **G3** | As 11 entradas que aguardam F1, D1, D2 ou D3 devem ter **Cobertura: parcial** (mostram o ADMIN)? | Evita dar a resposta neutra como completa. | Sim, até a decisão. |
| **G4** | O **estado das rotinas** (nota B) aparece na resposta da AXIA ou só no manual? | É dado mutável. | Só no manual; a AXIA diz "depende da configuração vigente". |
| **D3** | Validação e preenchimento da Matriz de SLA (campos "Até 2º escalão" e "Até Diretoria"). | A validação da tela exige "Nível 2 > assumir" e "Nível 3 > Nível 2", mas o motor trata os valores como intervalos (manual 7.4). | A resposta não dá instrução de preenchimento da Matriz; só descreve a regra. |
| **H1** | **Tarefa separada de D3:** adotar o calendário de feriados no motor de prazos (nacionais confirmados + estaduais da UF da obra + inclusões manuais). | O motor publicado (deploy `751fe2f`) exclui só sábado e domingo e conta feriado de segunda a sexta como dia útil. A regra pretendida está na **nota E**; os exemplos, na **nota F**. Depende de um campo de UF estruturado na obra (hoje `location` é texto livre "Cidade / UF"). | A AXIA descreve só o que o motor faz hoje; a regra pretendida aparece como **proposta**, nunca como fato (R6, E6). |

## Painel de aprovação (38 entradas)

> **Integração do lote 1 (05/11/2026):** por autorização do Reynaldo, as **20 entradas PRONTAS** (N2, N7, N8, R1, R3, R4, R5, R7, E1, E2, E3, E4, E7, E9, X1–X6) foram integradas à AXIA (`apps/web/lib/assistant/approved-batch-1.ts`), cada uma com a seção do manual. As **18 restantes** (7 com ressalva e 11 que aguardam decisão) **continuam em revisão** e não foram integradas; perguntas sobre elas seguem o encaminhamento para a Ajuda. **Falar com o ADMIN:** orientação **em texto**; o hiperlink fica **pendente** (G1, sem canal oficial). O destino fictício `example.invalid` existe só nos testes.

**Contagem por status (38 = 20 + 7 + 11), conferida contra as listas de IDs:**

| Status | Qtd | IDs |
|---|---|---|
| **PRONTA** | **20** | N2, N7, N8 · R1, R3, R4, R5, R7 · E1, E2, E3, E4, E7, E9 · X1, X2, X3, X4, X5, X6 |
| **PRONTA com ressalva** | **7** | N5, R11, E5, E6, E8, X7, X9 |
| **AGUARDA decisão** | **11** | F1: N1, N3, N6, X8 · D1: N4, R2 · D2: R8, R9, R10 · D3: R6, E10 |

**Mudou nesta revisão:** **E6** passou de PRONTA para **PRONTA com ressalva** (a resposta separa o comportamento do motor publicado da regra pretendida, que depende de H1/D3). Nenhum outro ID mudou. A versão anterior somava 21 PRONTA + 6 ressalva; a tabela A abaixo reúne PRONTA e ressalva (**27** = 20 + 7), e esse número de cabeçalho era a fonte da confusão de contagem.

O texto completo de cada entrada está nos quatro blocos abaixo. **Diagnóstico das decisões:** `docs/diagnostico-fase-2-f1-d1-d2-d3.md`.

### A. Prontas para aprovação — 27 entradas (não dependem de F1, D1, D2 nem D3)

| ID | Bloco | Pergunta | Seção do manual | Observação | Status |
|---|---|---|---|---|---|
| N2 | Navegação | Como entro no ACC e escolho a obra? | 4.1 | — | PRONTA |
| N5 | Navegação | O que mostra o Dashboard? | 4.2 | Layout pode mudar com a escolha A/B de tipografia (F6); a resposta não cita cores nem colunas | PRONTA (ressalva) |
| N7 | Navegação | Onde fica o tutorial e como falo com a AXIA? | 4.33; 4.34; 8.5 | — | PRONTA |
| N8 | Navegação | O que é a faixa "SISTEMA EM TESTE"? | 1; 4.1 | — | PRONTA |
| R1 | Riscos · classificação | O que significam os graus de risco? | 6.5 | — | PRONTA |
| R3 | Riscos · classificação | Como o sistema sugere o grau? | 6.3; 6.5 | — | PRONTA |
| R4 | Riscos · classificação | De onde nasce um risco? | 6.2 | — | PRONTA |
| R5 | Riscos · classificação | O que acontece com cláusula ambígua, OCR parcial ou falta de prazo? | 6.6 | — | PRONTA |
| R7 | Riscos · prazo de ação | O prazo vale também para MÉDIO e BAIXO? | 6.7.1; 7.2 (item 9) | — | PRONTA |
| R11 | Riscos · política de envio | Com que frequência o alerta se repete? | 6.7.3 | Camada de estado em produção (04/11/2026) mutável: revalidar antes de integrar | PRONTA (ressalva) |
| E1 | Escalonamento | Qual a diferença entre os dois mecanismos de escalonamento? | 7.1 | — | PRONTA |
| E2 | Escalonamento · A | Como o alerta sobe de nível? | 7.2 (itens 1 a 4 e 9) | Revisada: exemplo com T0, marcos e limite (1 h, 2 h, 4 h em Crítico) | PRONTA |
| E3 | Escalonamento · A | O que é "Limite de escalonamento atingido"? | 7.2.1 | — | PRONTA |
| E4 | Escalonamento · A | O que muda se eu responder o alerta? | 7.3 | — | PRONTA |
| E5 | Escalonamento · A | Quanto tempo depois do vencimento chega o aviso? | 7.5 | Camada de estado em produção (04/11/2026) mutável: revalidar antes de integrar | PRONTA (ressalva) |
| E6 | Escalonamento · A | O que muda em fim de semana ou feriado? | 7.4; 7.6 | Revisada: separa o motor publicado (feriado conta como dia útil) da regra pretendida (proposta, depende de H1/D3) | PRONTA (ressalva) |
| E7 | Escalonamento · A | E se não houver Nível 2 ou destinatário? | 7.2 (item 7); 7.7 | — | PRONTA |
| E8 | Escalonamento · B | O que são os lembretes "Repete: a cada N dias"? | 7.1; 7.3; 6.7.3 | Camada de estado em produção (04/11/2026) mutável: revalidar antes de integrar | PRONTA (ressalva) |
| E9 | Escalonamento · A | O que faz o botão "Verificar escalonamentos"? | 7.3; 4.9 | — | PRONTA |
| X1 | Especialistas | Quais especialistas existem? | 8.1; 8.2 | — | PRONTA |
| X2 | Especialistas | Quando uso a AXIA e quando abro um especialista? | 8.3 | — | PRONTA |
| X3 | Especialistas | A AXIA consulta os especialistas ou lê os dados da obra? | 8.5 | — | PRONTA |
| X4 | Especialistas | O especialista altera dados ou envia e-mails? | 8.4 | — | PRONTA |
| X5 | Especialistas | Quem pode consultar um especialista? | 8.1; 8.2 | — | PRONTA |
| X6 | Especialistas | Como confiro a resposta de um especialista? | 8.1; 8.6 | — | PRONTA |
| X7 | Especialistas | O que o Consultor Jurídico consegue ler? | 8.2; 8.7 | Divergências D2 e D16 do cap. 8 já constam do manual | PRONTA (ressalva) |
| X9 | Especialistas | As consultas jurídicas ficam guardadas? Quem as vê? | 4.20 | Validação manual com duas contas **adiada** (F4); há testes automatizados e leitura em produção | PRONTA (com ressalva F4) |

### B. Dependem de decisão — 11 entradas

| ID | Bloco | Pergunta | Seção do manual | Depende de | O que a decisão muda na resposta | Status |
|---|---|---|---|---|---|---|
| N1 | Navegação | Como navego pelo ACC? | 3; 4.1 | **F1** | A frase sobre Eventos e o acesso dos e-mails ao detalhe | AGUARDA F1 |
| N3 | Navegação | Por que não vejo uma aba do menu? | 2; 3; 4.1 | **F1**, F3 | O que dizer a quem cai em "não encontrada" ao seguir um link de e-mail | AGUARDA F1 |
| N4 | Navegação | Quais são os perfis e o que cada um pode fazer? | 2 | **D1** | Quem revisa o grau e o que a tela mostra a Gerente e Gestor | AGUARDA D1 |
| N6 | Navegação | Como encontro um evento ou procuro um assunto? | 4.3; 4.4; 4.5 | **F1** | Se o clique no evento abre o detalhe para todos, abre um resumo ou não abre | AGUARDA F1 |
| R2 | Riscos · classificação | Quem define o grau de risco? | 6.3; 6.4 | **D1** | A lista de perfis que revisam | AGUARDA D1 |
| R6 | Riscos · prazo de ação | Qual o prazo para agir em cada grau? | 6.7.1; 7.4 | **D3** | Se a resposta pode orientar a configuração da Matriz | AGUARDA D3 |
| R8 | Riscos · política de envio | Como e quando o alerta é enviado? | 6.1; 6.7.2 | **D2** | A linha do lote semanal (Baixo/Médio × grau efetivo) | AGUARDA D2 |
| R9 | Riscos · política de envio | ALTO e CRÍTICO são enviados na hora? | 6.7.2; 7.5 | **D2** | Se o lote passa a excluir ALTO/CRÍTICO | AGUARDA D2 |
| R10 | Riscos · política de envio | O que acontece se um evento for reclassificado como ALTO? | 6.7.4 | **D2** | Todo o conteúdo (hoje descreve uma divergência) | AGUARDA D2 |
| E10 | Escalonamento · A | Onde se configura a Matriz de SLA? | 4.10; 7.4; 3 | **D3** | Se a resposta pode dizer quais números digitar | AGUARDA D3 |
| X8 | Especialistas | Onde acesso cada especialista? | 8.2 | **F1**; D1 e D4 do cap. 8 | Acesso ao Evento (Comercial) por quem não é Administrador | AGUARDA F1 |

**Enquanto a decisão não sai**, as 11 usam a redação neutra da tabela "Decisões antes de aprovar" e podem ser integradas assim, se você preferir não esperar.

---

# BLOCO 1 — NAVEGAÇÃO

### N1 — Como navego pelo ACC?
**Também pergunta:** "como uso o menu", "onde fica cada tela", "como me localizo no sistema".
**Resposta proposta:** O ACC é organizado **por obra**. Entre com a conta Google corporativa, escolha a obra e use o **menu lateral**: Dashboard, Timeline, Eventos, Solicitações, Ações e Escalonamentos, Jurídico, Documentos, Providências, Financeiro, ESG/SSMA, Experts IA, Integrações, Usuários, Autorizações, Auditoria, Ajuda e tutorial e Start-up ACC. O menu mostra **só o que o seu perfil pode abrir**: Eventos, Integrações, Usuários, Autorizações e Start-up ACC são do Administrador, e Financeiro segue uma regra própria. Na barra de cima você troca de obra, vê o código e o contrato, abre **Fale com a AXIA** e sai. Se não vir uma aba, peça a um Administrador.
**Seção do manual:** 3 (Mapa de navegação); 4.1.
**Cobertura:** parcial até a decisão (aciona **Falar com o ADMIN**).
**Status:** AGUARDA **F1** (acesso ao detalhe do evento pelos e-mails e pela Timeline).

### N2 — Como entro no ACC e escolho a obra?
**Também pergunta:** "login", "não consigo entrar", "como troco de obra".
**Resposta proposta:** Abra o endereço do ACC e clique em **Entrar com Google**, usando a conta corporativa `@axion.com.br`; contas de outro domínio são recusadas. Em **Selecione um projeto**, clique no cartão da obra: o Dashboard abre. Para trocar de obra, use o seletor de projeto na barra de cima. O ícone **Sair** encerra a sessão. Se a sua obra não aparece, o acesso é concedido por obra pelo Administrador, na tela Usuários.
**Seção do manual:** 4.1 (fluxo principal, passos 1 a 6; permissões).
**Cobertura:** completa.
**Status:** PRONTA.

### N3 — Por que não vejo uma aba do menu?
**Também pergunta:** "sumiu o Eventos", "não aparece Usuários", "não tenho Financeiro".
**Resposta proposta:** O menu depende do **perfil na obra**. **Eventos, Integrações, Usuários, Autorizações e Start-up ACC** aparecem só para o **Administrador**. **Financeiro** aparece para Administrador, Gerente ou quem é da área Diretoria/Financeiro, e depende de configuração. Se você digitar o endereço de uma aba restrita sem permissão, a página mostra "não encontrada". Peça ao Administrador da obra.
**Seção do manual:** 2 (perfis e permissões); 3 (mapa de navegação); 4.1 (estados e exceções).
**Cobertura:** parcial até a decisão (aciona **Falar com o ADMIN**).
**Status:** AGUARDA **F1** (e F3: validação com conta sem privilégios, adiada).

### N4 — Quais são os perfis e o que cada um pode fazer?
**Também pergunta:** "o que é Leitura", "qual a diferença entre Gerente e Colaborador", "quantos perfis existem".
**Resposta proposta:** Há **quatro perfis** na tela: **Administrador**, **Gerente**, **Colaborador** e **Leitura** (o valor antigo "Gestor" equivale a Gerente). Qualquer membro **ativo** da obra pode **ler**. Para **gravar** ações administrativas, o banco exige hoje o perfil **Administrador**; a tela pode mostrar formulários a outros perfis, que recebem recusa ao salvar. O Administrador gerencia pessoas na tela Usuários.
**Seção do manual:** 2 (perfis e regra do banco); Anexo A (D1); Anexo B (D12).
**Cobertura:** parcial até a decisão (aciona **Falar com o ADMIN**).
**Status:** AGUARDA **D1** (confirmado em produção: só o Administrador revisa o grau). Corrige o "três perfis" da base atual da AXIA (D12).

### N5 — O que mostra o Dashboard?
**Também pergunta:** "o que significa SEM RISCO", "o que é o selo do topo", "de onde vêm os números".
**Resposta proposta:** O Dashboard é o **resumo executivo da obra**. No topo, seis indicadores: alertas ativos, eventos registrados, risco atual, integrações, aditivos e avanço físico. Abaixo, painéis de situação contratual, financeiro resumido, SSMA, avanço físico e financeiro, planejamento por e-mail, status das integrações, relatório semanal processado e distribuição dos alertas por grau. O selo do cabeçalho mede as **integrações** (não indica que o sistema esteja fora do ar). Os números vêm do que já foi recebido e processado; **o ACC não estima** o que ainda não tem fonte.
**Seção do manual:** 4.2.
**Cobertura:** completa.
**Status:** PRONTA (ressalva **F6**: o layout pode mudar com a escolha A/B de tipografia; a resposta não cita cores nem colunas).

### N6 — Como encontro um evento ou procuro um assunto?
**Também pergunta:** "como busco um e-mail", "como filtro a Timeline", "como abro o detalhe do evento".
**Resposta proposta:** Na **Timeline**, use a busca por palavra ou assunto (ela varre o acervo: e-mails, anexos, documentos, Diário de Obra e outros) e os filtros **Fontes**, **Categorias/Impactos**, **Período** e **Participantes**. **Todos** significa sem filtro; se você desmarcar todas as opções de um grupo, a Timeline mostra tudo de novo e avisa. Clicar em um evento abre o **detalhe**, que fica na aba **Eventos**, restrita ao Administrador.
**Seção do manual:** 4.3 (Timeline); 4.4 e 4.5 (Eventos).
**Cobertura:** parcial até a decisão (aciona **Falar com o ADMIN**).
**Status:** AGUARDA **F1**.

### N7 — Onde fica o tutorial e como falo com a AXIA?
**Também pergunta:** "onde está o manual", "como peço ajuda", "a AXIA fala?".
**Resposta proposta:** O **tutorial** está em **Ajuda e tutorial**, em PDF (consulta) e PowerPoint (editável). O botão **Fale com a AXIA**, na barra de cima, abre a conversa **por texto** e traz o link "Abrir o tutorial completo". A AXIA **ensina a usar o ACC**; ela **não lê os dados da sua obra** e não altera nada. A leitura em voz fica para uma fase futura.
**Seção do manual:** 4.33; 4.34; 8.5.
**Cobertura:** completa.
**Status:** PRONTA.

### N8 — O que é a faixa "SISTEMA EM TESTE"?
**Resposta proposta:** É o aviso de que o sistema está em **fase de testes**. Aparece em todas as páginas e só some por configuração e novo deploy, não por data.
**Seção do manual:** 1; 4.1.
**Cobertura:** completa.
**Status:** PRONTA.

| Perguntas do Reynaldo (Navegação) | Resposta pretendida | Seção do manual | Status |
|---|---|---|---|
| | | | |
| | | | |

---

# BLOCO 2 — RISCOS

> **Atenção para a AXIA:** classificação, prazo de ação e política de envio são **três coisas diferentes** (manual 6.7). As entradas estão separadas. Nas entradas sobre **envio** (R8 a R11), a resposta traz **três camadas**: **política aprovada**, **comportamento atual do Ledger** e **estado das rotinas em produção**. A terceira camada é **mutável** (referência: 04/11/2026): antes de integrar, ela deve ser relida; se preferir, a AXIA diz só "depende da configuração vigente" e o estado fica apenas no manual.

## 2.1 Classificação

### R1 — O que significam os graus de risco?
**Também pergunta:** "o que é crítico", "diferença entre alto e médio", "critérios de risco".
**Resposta proposta:** **Crítico:** risco iminente de descumprimento e penalização contratual, com necessidade de ação imediata. **Alto:** iminente, mas ainda há tempo para mitigação. **Médio:** possível consequência a médio prazo. **Baixo:** risco processual, de acompanhamento e organização. **Não existe um número fixo de dias** que separe os níveis. A sugestão automática só indica um grau quando os dados permitem; **toda classificação exige revisão humana com justificativa**.
**Seção do manual:** 6.5 (Os quatro níveis).
**Cobertura:** completa.
**Status:** PRONTA.

### R2 — Quem define o grau de risco?
**Também pergunta:** "quem pode reclassificar", "a IA define o risco?", "posso mudar o grau?".
**Resposta proposta:** Três papéis: a **regra do sistema** calcula uma **sugestão** (sem IA); a **IA** dos especialistas pode propor um grau **provisório**; e uma **pessoa autorizada** registra o grau com **justificativa obrigatória**. O histórico é imutável e o grau em vigor é sempre o da **revisão humana mais recente**. Hoje, na prática, **só o Administrador** consegue registrar a revisão; a tela pode mostrar o formulário a Gerente e Gestor, que recebem recusa ao salvar.
**Seção do manual:** 6.3; 6.4 (tabela "Quem sugere, quem define e quem revisa").
**Cobertura:** parcial até a decisão (aciona **Falar com o ADMIN**).
**Status:** AGUARDA **D1** (confirmado em produção: só o Administrador passa).

### R3 — Como o sistema sugere o grau?
**Também pergunta:** "por que o grau ficou indeterminado", "o que a sugestão considera".
**Resposta proposta:** A sugestão é uma **regra determinística**, sem IA. Ela considera a natureza do risco (descumprimento contratual ou processual), a obrigação e a **cláusula verificada**, a **penalidade** (só conta se houver descrição e cláusula verificada), a situação do prazo (vencido, a vencer, sem prazo) e dois fatos **declarados por pessoa autorizada**: se é **iminente** e se há **tempo para mitigação**. Se faltar informação, o sistema **não escolhe**: mostra a faixa de níveis possíveis e o que falta confirmar.
**Seção do manual:** 6.3; 6.5 (linha "sem nível").
**Cobertura:** completa.
**Status:** PRONTA.

### R4 — De onde nasce um risco?
**Também pergunta:** "como o contrato vira alerta", "quando a pessoa precisa revisar".
**Resposta proposta:** O sistema lê o contrato e os aditivos (com OCR nas páginas digitalizadas), detecta **candidatos a cláusula**, e uma **pessoa aprova ou rejeita** cada um (intervenção humana nº 1). Um **evento** nasce por triagem de e-mail, candidato aprovado ou obrigação ESG/SSMA; o sistema propõe um **confronto evento × cláusula**, que uma pessoa aprova ou rejeita (nº 2). A severidade do evento e o grau são revisados por pessoa autorizada (nº 3). O alerta só sai depois desses passos, com o texto original preservado.
**Seção do manual:** 6.2 (passos 1 a 9).
**Cobertura:** completa.
**Status:** PRONTA.

### R5 — O que acontece com cláusula ambígua, OCR parcial ou falta de prazo?
**Resposta proposta:** **Cláusula ambígua:** o detector reduz a confiança e a lista mostra o selo "conferir" com os motivos; a pessoa aprova, edita ou rejeita. **Classificação ambígua:** o sistema devolve a faixa de níveis e o que confirmar. **OCR parcial:** o ACC marca a página não lida, avisa "cobertura parcial" e mantém a versão em **revisão humana**; não trate como leitura integral. **Falta de prazo:** "desconhecido" entra em "Informações que faltam"; uma providência sem data fica sem prazo calculado até alguém preencher.
**Seção do manual:** 6.6 (Casos especiais).
**Cobertura:** completa.
**Status:** PRONTA.

## 2.2 Prazo de ação

### R6 — Qual o prazo para agir em cada grau? *(revisada)*
**Também pergunta:** "quanto tempo tenho para assumir o alerta", "o que é SLA", "matriz de prazos".
**Resposta proposta:** O **prazo para assumir** padrão é: **Crítico 1 hora corrida**; **Alto 4 horas úteis**; **Médio 1 dia útil**; **Baixo 3 dias úteis**. É o tempo que o responsável tem para assumir o alerta; passado esse prazo, o caso pode **subir ao Nível 2** (como o alerta sobe está em E2). **Horas úteis** contam só no expediente (padrão 08:00–18:00, segunda a sexta, fuso de São Paulo); **horas corridas** não esperam expediente. **Hoje, no ACC publicado, feriados não são descontados** — nacionais, estaduais ou municipais: um feriado em dia de semana conta como dia útil (nota C). Está prevista, **como proposta ainda não aprovada nem implementada**, uma regra de calendário por obra (feriados nacionais confirmados e estaduais da UF da obra; notas E e F). Cada obra pode ter a sua matriz, configurada pelo Administrador.
**Seção do manual:** 6.7.1 (Tabela 1); 7.4.
**Cobertura:** parcial até a decisão D3 (aciona **Falar com o ADMIN**).
**Status:** AGUARDA **D3** (a resposta não orienta quais números digitar na Matriz). A parte sobre feriados tem evidência suficiente para o **motor publicado** (nota C); a **regra pretendida** é a tarefa separada **H1** (notas E e F) e não entra na resposta como fato.

### R7 — O prazo vale também para MÉDIO e BAIXO?
**Resposta proposta:** O prazo existe para os quatro graus, mas **só Alto e Crítico** passam pelo **escalonamento por prazo** no ciclo automático. Para Médio e Baixo, o prazo vale em ações manuais e aparece como "Prazo para assumir" no **consolidado semanal**.
**Seção do manual:** 6.7.1 (ressalva b); 7.2 (item 9).
**Cobertura:** completa.
**Status:** PRONTA.

## 2.3 Política de envio

### R8 — Como e quando o alerta é enviado? *(revisada: três camadas)*
**Também pergunta:** "quando chega o e-mail de risco", "o que é o consolidado de quarta", "o alerta sai sozinho?".
**Resposta proposta:**
- **Política aprovada.** **Alto e Crítico** são enviados **de imediato** (no ACC, no primeiro ciclo automático depois do fato). **Médio e Baixo** são **reunidos em lotes semanais automáticos**, às quartas-feiras.
- **Comportamento atual, por origem.** **(A) Eventos do Ledger:** o alerta do evento é enviado **manualmente** pelo Administrador, a **qualquer grau**; **não há envio automático imediato** de Alto ou Crítico de evento. O **lote semanal automático** reúne só ações de grau **Baixo e Médio** ligadas a eventos. **(B) Riscos do módulo semanal** (cronograma e relatório semanal): **segue a política** — Alto e Crítico saem no **próximo ciclo horário**; Médio e Baixo vão no **consolidado de quarta**, a partir das 07:00 no fuso do projeto. **(C) Providências:** o alerta sai quando abre a janela de 60 dias antes do término (ou no prazo individual), com repetição por grau.
- **Estado em produção (04/11/2026; pode mudar).** Os envios automáticos dependem de rotinas do agendador. Neste momento o **ciclo horário de riscos** e o **lote semanal de eventos** estão **desligados** (desde 03/11/2026), então esses envios automáticos **não estão ocorrendo**; o **envio manual** do Administrador funciona normalmente. O **resumo semanal de ações sem evento** continua agendado às quartas, e a execução de 04/11 **falhou no envio**.
**Seção do manual:** 6.1; 6.7.2 (Tabela 2); Anexo F (rotinas em produção).
**Cobertura:** parcial até a decisão (aciona **Falar com o ADMIN**).
**Status:** AGUARDA **D2** · camada de estado a revalidar antes de integrar.

### R9 — ALTO e CRÍTICO são enviados na hora? *(revisada: três camadas)*
**Resposta proposta:**
- **Política aprovada:** sim, Alto e Crítico devem ser enviados de imediato — **na prática, no primeiro ciclo automático**, não no mesmo instante do fato.
- **Comportamento atual:** **só no módulo de riscos semanais** isso é automático (próximo ciclo horário, com configuração ligada). Nos **eventos do Ledger** o envio é **manual**, feito pelo Administrador; **não existe** envio automático imediato de Alto ou Crítico para eventos.
- **Estado em produção (04/11/2026; pode mudar):** o ciclo horário está **desligado** desde 03/11/2026; até então ele rodava (o último envio real de alerta de risco foi em 26/09/2026). Hoje o envio automático de Alto e Crítico por esse ciclo está **parado**; continua disponível o envio manual do Administrador.
**Seção do manual:** 6.7.2 ("Para o manual"); 7.5; Anexo F.
**Cobertura:** parcial até a decisão (aciona **Falar com o ADMIN**).
**Status:** AGUARDA **D2** · camada de estado a revalidar.

### R10 — O que acontece se um evento for reclassificado como ALTO? *(revisada: três camadas)*
**Resposta proposta:**
- **Política aprovada:** um evento Alto deve ser tratado como Alto: envio imediato, e não em lote semanal.
- **Comportamento atual do Ledger:** reclassificar **não dispara envio nem cria ação**: só registra o histórico e ajusta o acompanhamento recorrente. O envio de alerta de evento Alto é **manual**. Se o evento **ainda não entrou em lote** e a sua ação SLA continua Baixo ou Médio, ele **continua elegível** ao lote semanal e pode sair na quarta com "Alto" no corpo. Se **já entrou em lote**, **não é reenviado** e o item mantém a severidade antiga. Esta é uma divergência **registrada para decisão**.
- **Estado em produção (04/11/2026; pode mudar):** o lote semanal está **desligado** desde 03/11/2026 e, nas três quartas de outubro em que rodou (14, 21 e 28), **não encontrou nenhum evento elegível**. Hoje o risco da divergência é **latente**: só vale quando a rotina for religada.
**Seção do manual:** 6.7.4; Anexo F.
**Cobertura:** parcial até a decisão (aciona **Falar com o ADMIN**).
**Status:** AGUARDA **D2** · camada de estado a revalidar.

### R11 — Com que frequência o alerta se repete? *(revisada: três camadas)*
**Resposta proposta:**
- **Política aprovada:** os lembretes repetem a cada **1 dia (Crítico)**, **2 dias (Alto)**, **4 dias (Médio)** e **7 dias (Baixo)**, em dias corridos, até a conclusão. Esta tabela **não** é a Matriz de SLA.
- **Comportamento atual:** o lembrete vale para o **acompanhamento recorrente** do alerta enviado; se a rotina atrasar, ela manda **um** lembrete, sem acumular. A repetição não sobe de nível.
- **Estado em produção (04/11/2026; pode mudar):** a rotina de lembretes está **desligada** desde 03/11/2026, e **nenhum acompanhamento recorrente foi gravado** em produção até agora; portanto, **nenhum lembrete automático foi enviado**.
**Seção do manual:** 6.7.3; Anexo F.
**Cobertura:** completa.
**Status:** PRONTA (ressalva: o estado das rotinas é dado datado — nota B).

| Perguntas do Reynaldo (Riscos) | Resposta pretendida | Seção do manual | Status |
|---|---|---|---|
| | | | |
| | | | |

---

# BLOCO 3 — ESCALONAMENTO

> **Atenção para a AXIA:** há **dois mecanismos diferentes**. **A** sobe por **hierarquia** (Nível 1 → 2 → 3 → limite), pela Matriz de SLA. **B** só manda **lembretes** ao responsável atual. Não misturar.

### E1 — Qual a diferença entre os dois mecanismos de escalonamento?
**Também pergunta:** "o que é escalonar", "escalonamento e lembrete são a mesma coisa?".
**Resposta proposta:** **Mecanismo A — alertas de risco e ações SLA:** o alerta sobe por **hierarquia** (Nível 1, depois Nível 2 da gerência, depois Nível 3 da Diretoria, depois o limite), conforme os prazos da **Matriz de SLA**. **Mecanismo B — acompanhamento recorrente:** manda **lembretes** ao responsável atual a cada 1, 2, 4 ou 7 dias, **sem hierarquia**. A matriz de prazos (1 h, 4 h úteis, 1 dia útil, 3 dias úteis) é do mecanismo A; os intervalos de 1/2/4/7 dias são do B.
**Seção do manual:** 7.1.
**Cobertura:** completa.
**Status:** PRONTA.

### E2 — Como o alerta sobe de nível? *(mecanismo A — revisada)*
**Resposta proposta:** O **Nível 1** é o responsável da área, definido na **Matriz de responsabilidades**. A contagem começa em **T0**, quando o ciclo automático **detecta** o caso. Enquanto o responsável **não assume**, valem três marcos, cada um contado **a partir do vencimento calculado do anterior** (e não do horário em que o e-mail saiu). Para **Crítico** no padrão (1 h, +1 h, +2 h, horas corridas), **desde T0**:
- **Nível 2 (gerência): em +1 h** — vence o prazo para assumir;
- **Diretoria (Nível 3): em +2 h** — o primeiro intervalo (1 h) conta do marco anterior;
- **Limite de escalonamento atingido: em +4 h** — o segundo intervalo (2 h) conta do marco da Diretoria (2 h + 2 h).

**Exemplo** com T0 às 14:20: Nível 2 às **15:20**, Diretoria às **16:20**, limite às **18:20**. No padrão, o total até o limite é de **12 h úteis** em Alto, **3 dias úteis** em Médio e **8 dias úteis** em Baixo. No ciclo automático, **só Alto e Crítico** sobem por prazo; cada obra pode ter valores próprios.
**Seção do manual:** 7.2 (itens 1 a 4 e 9); 6.7.1 (Tabela 1); Anexo F; diagnóstico D3.1-b.
**Cobertura:** completa.
**Status:** PRONTA.

### E3 — O que é "Limite de escalonamento atingido"? *(mecanismo A)*
**Resposta proposta:** Significa que a **Diretoria também deixou o prazo vencer**. Não é um nível, **não tem destinatário e não envia e-mail**: o ACC só registra uma vez e mostra a mensagem na tela.
**Seção do manual:** 7.2.1.
**Cobertura:** completa.
**Status:** PRONTA.

### E4 — O que muda se eu responder o alerta? *(mecanismo A)*
**Resposta proposta:** **Resolvido:** exige confirmação, justificativa se a Matriz exigir e, em Alto e Crítico, **evidência**; o caso vai à revisão humana e só **Confirmar resolução** o encerra; não escala. **Tomando providências:** marca como assumido e, em **Alto/Crítico**, **escala imediatamente** ao próximo nível; o alerta continua aberto. **Enviar para:** troca o responsável (também escala em Alto/Crítico); sem ação do encaminhado no prazo, volta ao anterior. **Especialista** e **Outro:** também escalam em Alto/Crítico. Depois da primeira ação humana, a subida **por tempo** para, salvo se a Matriz tiver prazos de responder ou concluir.
**Seção do manual:** 7.3 (tabela de respostas).
**Cobertura:** completa.
**Status:** PRONTA.

### E5 — Quanto tempo depois do vencimento chega o aviso? *(mecanismo A — revisada)*
**Resposta proposta:** São dois horários diferentes:
- **Vencimento calculado:** o marco do prazo (por exemplo, 15:20 para o Nível 2). É definido pela Matriz a partir de T0 e **não muda** se o aviso atrasar.
- **Horário efetivo do aviso:** o do **primeiro ciclo automático depois do vencimento** (só se `agora` for maior que o marco), e **só se o ciclo estiver ligado**. O ciclo é agendado de hora em hora, mas o agendador atrasa: nos últimos dias as execuções vieram a cada **4 a 10 horas**. Se **vários marcos** vencerem entre dois ciclos, o aviso pode ir **direto à Diretoria**. O atraso do aviso **não adia** os marcos seguintes.

A contagem começa no ciclo que **detecta** o caso, depois da chegada do e-mail ou da planilha. O estado atual do ciclo em produção está na **nota datada B** (abaixo); enquanto o ciclo estiver desligado, o escalonamento só ocorre pelo botão **"Verificar escalonamentos"** (Administrador).
**Seção do manual:** 7.5; 7.2 (item 6); Anexo F; diagnóstico D3.1-b e D3.1-c.
**Cobertura:** completa.
**Status:** PRONTA (ressalva: estado das rotinas é dado datado, nota B).

### E6 — O que muda em fim de semana ou feriado? *(mecanismo A — revisada)*
**Resposta proposta:** **Horas e dias corridos** (Crítico) ignoram expediente e calendário: sobem de madrugada, fim de semana e feriado. **Horas e dias úteis** (Alto, Médio, Baixo) só contam no expediente (padrão 08:00–18:00, segunda a sexta); **sábado e domingo nunca contam**. **O que o ACC faz hoje (motor publicado):** feriados nacionais, estaduais e municipais **não são descontados**; um feriado em dia de semana **conta como dia útil inteiro** — o ACC avisa na tela "Feriados ainda não são considerados nesta versão". **Exemplo (nota F, caso 1):** com o feriado nacional da **sexta 20/11/2026**, um Alto de 4 horas úteis aberto na quinta 19/11 às 17:20 vence **na própria sexta, às 11:20**; com o feriado descontado, venceria na **segunda 23/11, às 11:20**. **Crítico** continua contando **1 hora corrida**, inclusive no feriado.
**Regra pretendida (proposta, ainda não implementada):** o calendário da obra desconta fins de semana, feriados nacionais confirmados e feriados estaduais da UF da obra; feriados municipais, datas setoriais e pontos facultativos entram só por inclusão do Administrador, com regra aplicável. A AXIA só diz isto se a pergunta for sobre o que está planejado, e sempre como **proposta**.
**Seção do manual:** 7.4; 7.6 (exemplos 1 e 2, fictícios).
**Cobertura:** completa para o motor publicado.
**Status:** PRONTA (ressalva: a regra pretendida depende de **H1**/D3; evidência do motor em nota C, calendário em notas E e F). As duas fontes de calendário indicadas (iCalendário e Calendarr) foram levantadas e conferidas contra fontes oficiais onde foi possível; ver nota E.

### E7 — E se não houver Nível 2 ou destinatário cadastrado? *(mecanismo A)*
**Resposta proposta:** Se o **Nível 2 não está cadastrado**, o aviso vai **direto ao Nível 3**. Se falta o **Nível 1 ou o Nível 3**, **nenhum e-mail sai** e o sistema registra "revisão de configuração necessária". Destinatário sem e-mail na hora do envio gera falha registrada. O Administrador corrige na **Matriz de responsabilidades**.
**Seção do manual:** 7.2 (item 7); 7.7 (Destinatário ausente).
**Cobertura:** completa.
**Status:** PRONTA.

### E8 — O que são os lembretes "Repete: a cada N dias"? *(mecanismo B — revisada)*
**Resposta proposta:** São lembretes ao **responsável atual**, a cada **1, 2, 4 ou 7 dias** conforme o grau, até a conclusão. **Não sobem de nível.** "Em andamento" mantém os lembretes; "Resolvido" os interrompe; "Enviado para" troca o responsável sem reiniciar o prazo. **Estado em produção (04/11/2026; pode mudar):** a rotina de lembretes está **desligada** desde 03/11/2026 e nenhum acompanhamento recorrente foi gravado até agora; portanto, nenhum lembrete automático foi enviado.
**Seção do manual:** 7.1; 7.3 (Mecanismo B); 6.7.3; Anexo F.
**Cobertura:** completa.
**Status:** PRONTA (ressalva: o estado das rotinas é dado datado — nota B).

### E9 — O que faz o botão "Verificar escalonamentos"? *(mecanismo A)*
**Resposta proposta:** Varre as ações abertas de **qualquer** grau e escala as que passaram do prazo, sem duplicar avisos. Exige perfil **Administrador**; para outros perfis a tela mostra o botão, mas o resultado é "0 escaladas". Ele **não depende** da rotina automática.
**Seção do manual:** 7.3; 4.9.
**Cobertura:** completa.
**Status:** PRONTA.

### E10 — Onde se configura a Matriz de SLA? *(mecanismo A — revisada)*
**Resposta proposta:** Em **Matriz de SLA e Escalonamento** (`/{obra}/acoes/configuracao`), pelo **Administrador**: prazos por grau, fuso e expediente da obra. A tela **não tem link no menu**. Os campos "Até 2º escalão" e "Até Diretoria" são **intervalos**, cada um contado a partir do marco anterior (ver E2). Mudar a matriz **não recalcula** ações já criadas. A validação da tela está em **revisão**: se ela recusar valores, procure o responsável pelo ACC.
**Seção do manual:** 4.10; 7.4; 3 ("Fora do menu"); 6.7.1.
**Cobertura:** parcial até a decisão (aciona **Falar com o ADMIN**).
**Status:** AGUARDA **D3** (a resposta não indica quais números digitar).

| Perguntas do Reynaldo (Escalonamento) | Resposta pretendida | Seção do manual | Status |
|---|---|---|---|
| | | | |
| | | | |

---

# BLOCO 4 — ESPECIALISTAS

### X1 — Quais especialistas existem?
**Também pergunta:** "o que é Experts IA", "o que faz o CEO IA".
**Resposta proposta:** Existem **5 especialistas de IA** no ACC: **CEO IA**, **Diretor Comercial IA**, **Consultor Jurídico IA**, **Diretor de Planejamento IA** e **Diretor de ESG IA**. Todos **respondem em modo de leitura**, e **toda resposta exige revisão humana**. O CEO IA consolida as posições dos demais e **não tem tela própria**. As skills do repositório **não são** especialistas do produto. A **AXIA não é um especialista**.
**Seção do manual:** 8.1; 8.2.
**Cobertura:** completa.
**Status:** PRONTA.

### X2 — Quando uso a AXIA e quando abro um especialista?
**Resposta proposta:** Use a **AXIA** para **dúvidas de uso do sistema** ("como faço", "o que significa", "onde fica"). Abra o **especialista** para analisar a obra: **Consultor Jurídico** para contrato e aditivos; **Diretor Comercial** para estratégia, aditivo, medição e pagamento (pelo Evento); **Diretor de Planejamento** para prazo e atraso; **Diretor de ESG** para obrigações SSMA/ESG. Para dúvida sobre **um alerta específico**, use a ação **ESPECIALISTA** do alerta; para assunto que cruza áreas, a **curadoria multiagente**.
**Seção do manual:** 8.3 (tabela).
**Cobertura:** completa.
**Status:** PRONTA.

### X3 — A AXIA consulta os especialistas ou lê os dados da obra?
**Resposta proposta:** **Não.** A AXIA responde com uma **base curada** do tutorial e da ajuda, **sem IA generativa**, não lê dados da obra, não grava nada e **não encaminha** a um especialista. Ela cita um link de módulo e, quando existe, o slide do tutorial.
**Seção do manual:** 8.5.
**Cobertura:** completa.
**Status:** PRONTA.

### X4 — O especialista altera dados ou envia e-mails?
**Resposta proposta:** Os especialistas **apenas respondem**. Há três registros que gravam algo, sem alterar contrato, cronograma, e-mail ou prazo: o botão **"Avaliar risco de atraso"** (registra a avaliação e a auditoria), a **curadoria multiagente** (registra auditoria) e a ação **ESPECIALISTA** no alerta (registra a resposta na conversa do alerta). A resposta **não resolve nem escala** o alerta sozinha.
**Seção do manual:** 8.4.
**Cobertura:** completa.
**Status:** PRONTA.

### X5 — Quem pode consultar um especialista?
**Resposta proposta:** **Qualquer membro ativo** da obra, inclusive Leitura, pode **consultar**; o acesso é isolado por obra. A **curadoria multiagente** e a **avaliação de atraso** exigem perfil Gerente, Gestor ou Administrador (na tela da avaliação, o botão é do Administrador).
**Seção do manual:** 8.1 ("Perfis"); 8.2 (linha "Perfis").
**Cobertura:** completa.
**Status:** PRONTA.

### X6 — Como confiro a resposta de um especialista?
**Resposta proposta:** A resposta separa **fatos documentados**, **interpretação (sugestão, não fato)**, **riscos**, **recomendações** e **informações faltantes**. Confira a **Base contratual** (documento, cláusula e trecho) abrindo a cláusula citada, e as **Fontes utilizadas** quando houver. Rascunhos ficam **pendentes de revisão humana**; nada é enviado. A tela indica se o provedor é IA real ou modo de teste.
**Seção do manual:** 8.1 ("Fonte da resposta"); 8.6.
**Cobertura:** completa.
**Status:** PRONTA.

### X7 — O que o Consultor Jurídico consegue ler?
**Resposta proposta:** Lê o texto de **contrato-base, aditivos, edital, propostas e especificações** em **PDF com texto selecionável, DOCX e TXT**, até **5 documentos** e **120 000 caracteres** por consulta, e avisa quando houve corte. **PDF escaneado sem texto falha**; JPG, PNG e planilhas **não são suportados** nesse fluxo. Ele **não tem base legal oficial** carregada.
**Seção do manual:** 8.2 (colunas "Dados/documentos" e "Limitações"); 8.7.
**Cobertura:** completa.
**Status:** PRONTA (ressalva: divergências D2 e D16 do cap. 8 já constam do manual).

### X8 — Onde acesso cada especialista?
**Resposta proposta:** **Consultor Jurídico:** aba **Jurídico**. **Diretor Comercial:** painel no **Evento** (aba Eventos, restrita ao Administrador). **Diretor de Planejamento:** **Experts IA › Diretor de Engenharia**. **Diretor de ESG:** aba **ESG/SSMA › consultar**. **CEO IA:** sem tela própria; aparece na curadoria multiagente. Nos alertas, a ação **ESPECIALISTA** escolhe o especialista pelo tema.
**Seção do manual:** 8.2 (linha "Onde é acessado").
**Cobertura:** parcial até a decisão (aciona **Falar com o ADMIN**).
**Status:** AGUARDA **F1** (e D1 e D4 do cap. 8).

### X9 — As consultas jurídicas ficam guardadas? Quem as vê?
**Resposta proposta:** Sim. Cada consulta jurídica bem-sucedida fica guardada em **"Minhas consultas jurídicas"**, na aba Jurídico. **Só quem fez a consulta** a vê, abre e exclui; **nenhum outro membro da obra, nem o Administrador**, tem acesso pela interface do ACC. Ao excluir, a pergunta e a resposta somem do seu histórico; **cópias técnicas** (backups) e o que o provedor de IA reteve **não** são apagadas por esse botão.
**Seção do manual:** 4.20 (atualização pós-PR #129).
**Cobertura:** completa.
**Status:** PRONTA (ressalva **F4**: validação manual com duas contas adiada; há testes automatizados e leitura em produção).

| Perguntas do Reynaldo (Especialistas) | Resposta pretendida | Seção do manual | Status |
|---|---|---|---|
| | | | |
| | | | |

---

## Notas datadas de evidência

### Nota A — Observação de 04/11/2026: política aprovada × comportamento do Ledger × estado das rotinas

| Camada | Conteúdo |
|---|---|
| **Política aprovada** | Alto e Crítico: envio imediato (no primeiro ciclo automático). Médio e Baixo: lotes semanais automáticos, às quartas. |
| **Comportamento atual do Ledger** | Alerta de evento: envio **manual** do Administrador, a qualquer grau. Lote semanal automático: só ações SLA Baixo/Médio ligadas a evento. Não há envio automático imediato de Alto/Crítico de evento. Reclassificar para Alto não dispara envio. |
| **Estado das rotinas (nota B)** | Ver abaixo. |

### Nota B — Estado das rotinas em 04/11/2026 (dado datado; reler antes de qualquer afirmação)

Três níveis de prova, **separados**: **flag habilitada** (configuração), **workflow ativo** (o agendador roda) e **envio comprovado** (há registro de e-mail enviado).

| Rotina | Flag habilitada | Workflow ativo | Envio comprovado |
|---|---|---|---|
| **Ciclo horário de risco e escalonamento** | **Sim**: `ACC_WEEKLY_REPORTS_ENABLED=true` no GitHub (desde 25/09); na Vercel, ligada de forma **indireta** (HTTP 200 nas 8 últimas execuções, até 03/11 06:57 UTC; a rota devolve 204 se desligada). O valor sensível da Vercel não foi lido | **Não**: workflow desabilitado manualmente em **03/11/2026 10:22 (-03:00)**. Última execução agendada: 03/11 06:55 UTC | **Último e-mail de alerta de risco enviado: 26/09/2026 15:06 UTC** (3 no total). Escalonamento aplicado e registrado em 02/11 16:20 UTC (14 no total), **sem e-mail comprovado depois de 26/09** |
| **Lote semanal de eventos** | sem flag própria (depende de segredo do cron e URL do app) | **Não**: desabilitado em 03/11 10:22 (-03:00). Última execução agendada: 28/10 16:34 UTC | **Nenhum lote por agenda**: nas quartas de 14, 21 e 28/10 o resultado foi `eventsEligible 0`. Último lote enviado: 10/10/2026 02:05 UTC (15 no total; origem não distinguida) |
| **Resumo semanal de ações sem evento** | sem flag própria | **Sim**: cron da Vercel agendado e executando (registros em 14/10, 21/10, 28/10 e 04/11, ~10:11 UTC) | Último **enviado**: 28/10/2026 10:11 UTC. A execução de **04/11 falhou** (nota D) |
| **Lembretes recorrentes** | sem flag própria | **Não**: desabilitado em 03/11 10:22 (-03:00) | **Nenhum**: 0 acompanhamentos recorrentes e 0 eventos gravados |

### Nota C — Dia útil e feriados: o que o deploy publicado faz (verificado em 04/11/2026)

- **Caminho efetivamente usado (SLA):** o motor em TypeScript `apps/web/lib/sla/time-units.ts` (`addTimeUnits`), chamado por `acoes/actions.ts` (criação de ação e "Verificar escalonamentos"), por `risk-alerts/plan-risk-alerts.ts` (ciclo horário) e por `alert-detail-data.ts`. A árvore do código é **idêntica** à do deploy `751fe2f` (diferença zero em `apps/web/lib/sla`). O banco **não** calcula prazos de SLA; só grava os valores calculados.
- **O que o motor exclui:** apenas **sábado e domingo** (`time-units.ts:115-116`). Não há lista, tabela ou parâmetro de feriados: o código declara "feriados (nacionais, regionais ou municipais) NÃO são descontados" (`time-units.ts:8-13`), a migration `20260822123400…:13` e a tela ("Feriados ainda não são considerados nesta versão") dizem o mesmo, e a produção tem **0 tabelas** com "holiday" ou "feriado".
- **Único outro "dia útil" no sistema:** a função SQL `add_business_days` (segunda a sexta; "feriados poderão ser acrescentados posteriormente"), usada só para o prazo de confirmação da política de recursos, **não** para SLA. Também não cita feriado em produção.
- **Registro anterior de calendário com feriados nacionais:** **não localizado** no repositório nem na produção. Em 04/11/2026 foram indicadas duas fontes externas (iCalendário e Calendarr), levantadas na **nota E**.
- **Demonstração (motor real executado):** feriado nacional na **sexta 20/11/2026** (Consciência Negra), fuso de São Paulo, expediente 08:00–18:00.

| Caso | Entrada | Resultado do motor | Se o feriado fosse descontado |
|---|---|---|---|
| Alto (4 / 4 / 4 h úteis) | T0 = qui 19/11 17:20 | assumir (Nível 2): **sex 20/11 11:20**; Nível 3: **sex 20/11 15:20**; limite: **seg 23/11 09:20** | assumir: seg 23/11 11:20 |
| Médio (1 dia útil) | T0 = qui 19/11 10:00 | prazo para assumir: **sex 20/11 10:00** | seg 23/11 10:00 |
| Crítico (corridas 1 / 1 / 2) | T0 = qui 19/11 23:20 | 00:20, 01:20 e 03:20 de sex 20/11 (calendário não interfere) | igual |

### Nota D — Falha do resumo semanal de ações sem evento (registro separado, 04/11/2026)

- **Fato:** em **04/11/2026 10:11 UTC** o resumo semanal ficou com status `FAILED` e a mensagem "Falha no envio do resumo semanal." (sem envio). As três execuções anteriores (14, 21 e 28/10) foram enviadas.
- **Causa:** **não determinada.** O plano atual retém os logs de execução da Vercel por 1 hora; a mensagem gravada é genérica.
- **Observação sem afirmar causa:** as variáveis do piloto foram criadas na Vercel em 03/11 13:35 UTC, depois do último envio bem-sucedido.
- **Não afeta** as respostas do Q&A (a AXIA não afirma que o resumo semanal funciona). **Pendente:** investigar.

### Nota E — Calendário de feriados: levantamento e confirmação (04/11/2026)

**Fontes indicadas:** iCalendário (`https://icalendario.br.com/feriados/`) para as datas nacionais e Calendarr (`https://www.calendarr.com/brasil/feriados-estaduais-no-brasil/`) para as estaduais por UF. Ambas são **fontes secundárias**: nada abaixo entra no calendário pretendido sem a confirmação oficial indicada na coluna "Confirmação". A página do Calendarr **não informa o ano**; os links relacionados apontam para 2026 (inferência).

**Categorias (mantidas separadas, nunca misturadas no mesmo cálculo):** (1) nacional; (2) estadual; (3) municipal; (4) data setorial; (5) ponto facultativo; (6) data comemorativa ou religiosa sem efeito de feriado. Só as categorias **1 e 2**, esta última pela **UF da obra**, entram no calendário pretendido. As demais só entram por inclusão do Administrador, com regra aplicável à obra.

**1. Nacionais (iCalendário; abrangência: todo o país)**

| Data | Feriado | 2026 | 2027 | Confirmação oficial |
|---|---|---|---|---|
| 01/01 | Confraternização Universal | qui | sex | Lei 662/1949, art. 1º (redação da Lei 10.607/2002), planalto.gov.br — **confirmado** |
| 21/04 | Tiradentes | ter | qua | idem — **confirmado** |
| 01/05 | Dia do Trabalho | sex | sáb | idem — **confirmado** |
| 07/09 | Independência | seg | ter | idem — **confirmado** |
| 12/10 | Nossa Senhora Aparecida | seg | ter | Lei 6.802/1980 ("declarado feriado nacional o dia 12 de outubro"), planalto.gov.br — **confirmado** |
| 02/11 | Finados | seg | ter | Lei 662/1949 (redação da Lei 10.607/2002) — **confirmado** |
| 15/11 | Proclamação da República | dom | seg | idem — **confirmado** |
| 20/11 | Consciência Negra | **sex** | sáb | Lei 14.759/2023 (21/12/2023, DOU 22/12/2023, vigência na publicação), planalto.gov.br — **confirmado** |
| 25/12 | Natal | sex | sáb | Lei 662/1949 — **confirmado** |
| móvel | Sexta-feira da Paixão | 03/04 (sex) | 26/03 (sex) | iCalendário a lista como nacional. A Lei 9.093/1995, art. 2º, a trata como feriado **religioso**, dentro do limite de quatro dias fixados por **lei municipal**. Tratar como **nacional na prática**, **não confirmada como federal** |

**Fora da categoria 1 (iCalendário as mostra, mas não são feriados por lei federal):** Páscoa (05/04/2026; 28/03/2027) e Pentecostes (24/05/2026; 16/05/2027) são domingos (categoria 6). Carnaval e Corpus Christi são **pontos facultativos** (categoria 5) e **não constam das datas nacionais do iCalendário**; a página não lista datas de pontos facultativos de 2026 nem de 2027 e informa só que servidores públicos são dispensados e empresas privadas não são obrigadas a dispensar.

**2. Estaduais (Calendarr, 43 linhas, incluindo "sem feriado" em GO e PR; abrangência: a UF indicada; ano inferido 2026)**

Só o **estado de SP foi confirmado** em fonte oficial: **9 de julho**, Lei estadual nº 9.497/1997, art. 1º ("Fica instituído, como feriado civil, o dia 9 de julho"), alesp, com base na Lei federal 9.093/1995, art. 1º, II (data magna do Estado). Em 2027 cai em **sexta-feira**. As demais linhas ficam **levantadas, não confirmadas** até a conferência no diário ou lei da UF:

| UF | Datas levantadas (Calendarr) | Observação |
|---|---|---|
| SP | 09/07 Revolução Constitucionalista | **confirmado** (Lei 9.497/1997) |
| RJ | 23/04 São Jorge; Carnaval (móvel); 20/10 Dia do Comerciário | Carnaval é ponto facultativo (cat. 5); Dia do Comerciário é **setorial** (cat. 4), só para quem trabalha no comércio |
| MG | 21/04 Data Magna | coincide com Tiradentes |
| RS | 20/09 Revolução Farroupilha | |
| BA | 02/07 Independência da Bahia | |
| PE | 06/03 Data Magna; 24/06 São João | |
| PA | 15/08 Adesão do Grão-Pará | |
| SC | 11/08 Dia do Estado | página diz que a lei transfere a data ao domingo seguinte; verificar |
| AM | 05/09 Elevação à província; 08/12 N. S. da Conceição | |
| CE | 19/03 São José; 25/03 Data Magna | |
| DF | 21/04 Fundação de Brasília; 30/11 Dia do Evangélico; Corpus Christi (móvel) | Corpus Christi é ponto facultativo nacional; verificar o que a lei distrital fixa |
| ES | segunda-feira após 8 dias da Páscoa: N. S. da Penha (móvel) | data móvel; calcular por ano |
| MA | 28/07 Adesão à Independência | |
| MS | 11/10 Criação do Estado | |
| **GO** | **a página diz "não há feriado estadual em Goiás"** | **Divergência com fonte oficial:** o portal do Governo de Goiás (Secretaria da Economia, atualizado em 22/10/2025) chama **24/10** de "feriado estadual" em celebração ao aniversário de Goiânia e cita a **Lei 20.756/2020**; chama o **Dia do Servidor Público (28/10)** de feriado estadual, mas o deslocamento de 2025 (para 27/10) foi feito por **Decreto 10.790**, não por lei. Portanto o Calendarr está **errado ou desatualizado para GO**. **Confirmação parcial:** só a página do governo foi lida; o **texto da lei não foi lido** (o PDF obtido em `legisla.casacivil.go.gov.br` é a Lei 19.850/2017, ilegível na extração e sobre antecipação pontual). Em fontes não oficiais o 24/10 também é **municipal** (Lei municipal 6.968/1991): a categoria (estadual ou municipal) precisa ser confirmada. O Dia do Servidor tende a ser **ponto facultativo/setorial** (cat. 4–5) |
| AC | 20/01 Dia do Católico; 25/01 Dia do Evangélico; 15/06 Aniversário do Estado; 05/09 Dia da Amazônia; 17/11 Tratado de Petrópolis | |
| SE | 08/07 Emancipação política | |
| TO | 01/01 Instalação; 08/09 N. S. da Natividade; 05/10 Criação | |
| RO | 04/01 Criação do Estado; 18/06 Dia do Evangélico | |
| AL | 24/06 São João; 29/06 São Pedro; 16/09 Emancipação | |
| RR | 05/10 Elevação a estado | |
| AP | 19/03 São José; 25/07 São Tiago | |
| PR | a página diz "não há feriado estadual" | confirmar |
| PB | 05/08 Fundação do Estado | |
| PI | 13/03 Batalha do Jenipapo; 19/10 Dia do Piauí | |
| MT, RN | **ausentes da página** | levantar em outra fonte |

**3. Municipais, setoriais e facultativos:** nenhum entra no calendário pretendido sem regra aplicável à obra. Exemplo registrado, **não confirmado**: o aniversário de Goiânia (24/10) aparece como municipal em reportagem de 2026 (Lei municipal 6.968/1991); 24/10/2026 cai em sábado.

**4. UF da obra.** O projeto grava só `location`, em **texto livre** ("Cidade / UF"). Em produção, **uma** obra tem UF identificável: **0079, "Goiânia/GO"**; as demais trazem "CIDADE TESTE", "Ambiente de Desenvolvimento" ou "Pré-contratual". Para a obra 0079 há **candidatos, ainda não confirmados em lei**: **24/10** (aniversário de Goiânia, estadual segundo o portal do Governo, municipal segundo outras fontes) e **28/10** (Dia do Servidor, decreto). **Nenhum cai em dia útil em 2026** (24/10/2026 é sábado; 28/10/2026 já passou) **nem em 24/10/2027 (domingo)**. Por isso o caso estadual da nota F continua sendo um **exemplo separado, de outra UF** (obra fictícia em SP, lei confirmada). **24/10 em Goiânia: PENDENTE** (abrangência e categoria — estadual, municipal ou ambas — sem confirmação no texto oficial; não entra no calendário pretendido). Um exemplo para a 0079 só entra depois de ler o texto da Lei 20.756/2020 e fixar a categoria do 24/10. O caso estadual de SP já serve como exemplo separado para R6 e E6. Aplicar a regra pretendida exige um **campo de UF estruturado** (parte de H1).

### Nota F — Exemplos de ALTO com prazo de 4 horas úteis (motor executado em 04/11/2026)

**Parâmetros comuns:** Alto = 4 / 4 / 4 horas úteis; expediente **08:00–18:00, segunda a sexta**; fuso **America/Sao_Paulo (UTC-3)**; motor publicado `apps/web/lib/sla/time-units.ts` (deploy `751fe2f`). "Feriado descontado" = o mesmo motor, mas começando pelo próximo dia útil real (40 min restantes de quinta + 3 h 20 min a partir das 08:00 de segunda); **o motor publicado não faz esse desconto sozinho**.

| | **Caso 1 — feriado nacional** | **Caso 2 — feriado estadual (obra fictícia em SP)** |
|---|---|---|
| Feriado | sexta **20/11/2026**, Consciência Negra (Lei 14.759/2023) | sexta **09/07/2027**, Revolução Constitucionalista (Lei SP 9.497/1997) |
| **T0** | qui 19/11/2026, **17:20** | qui 08/07/2027, **17:20** |
| Vencimento para assumir pelo **motor publicado** | **sex 20/11/2026, 11:20** | **sex 09/07/2027, 11:20** |
| Vencimento com o **feriado descontado** | **seg 23/11/2026, 11:20** | **seg 12/07/2027, 11:20** |
| Nível 3 (motor / descontado) | sex 20/11 15:20 / seg 23/11 15:20 | sex 09/07 15:20 / seg 12/07 15:20 |
| Limite (motor / descontado) | seg 23/11 09:20 / ter 24/11 09:20 | seg 12/07 09:20 / ter 13/07 09:20 |
| Diferença no prazo de assumir | **+1 dia útil** | **+1 dia útil** |

**CRÍTICO não muda.** Crítico usa **horas corridas** (padrão 1 / 1 / 2) e não consulta expediente nem calendário. Executado no motor: T0 qui 19/11/2026 23:20 → Nível 2 às 00:20 de **sex 20/11 (feriado)**; T0 **sex 20/11/2026 10:00** → 11:00; T0 **sex 09/07/2027 10:00** → 11:00. O desconto de feriados, quando adotado, **não deve** alterar Crítico: segue **1 hora corrida**, inclusive durante o feriado.

### Nota G — Validação da AXIA com dados fictícios (04/11/2026; lote real NÃO integrado)

**Aprovação por ID:** nenhuma recebida até agora. Nada do lote real foi para a AXIA; a validação usou duas entradas **fictícias** ("[TESTE] …") ligadas só em ambiente local por `ACC_AXIA_QA_FIXTURES=1` e nunca na Vercel. Código: branch local `local/qa-validacao-ficticia`, commit `88a04db`; teste `scripts/test-axia-qa-validacao.mjs` (21 verificações, 0 falhas).

| Caso | Resultado na prévia local (1920 × 1080) |
|---|---|
| Resposta em texto, completa | Título, resumo e passos; **"Fonte no manual: seção 99.1 (fictícia)"**; sem ADMIN; botão "Isso não respondeu à minha pergunta" visível |
| Resposta parcial | "Resposta parcial: pode não cobrir o seu caso", citação 99.2, **Falar com o ADMIN** já visível |
| Ausência de resposta | "Ainda não tenho uma resposta aprovada para isso", **Falar com o ADMIN** visível |
| "Isso não respondeu à minha pergunta" | O clique **não faz nenhuma requisição** (0 chamadas fetch/XHR) e mostra o ADMIN |
| Clique em "Falar com o ADMIN" | Link fixo `mailto:` montado no servidor, **sem a pergunta e sem o histórico** (0 recursos de rede; o destino não contém o texto da pergunta) |
| Estilo | Cor `rgb(255, 213, 79)` = `#FFD54F`, peso 700 (negrito), na área escura do rodapé, ao lado do link da Ajuda |
| Link da Ajuda | Preservado ("Abrir o tutorial completo (PDF e PowerPoint)", `/{obra}/ajuda`) |

**Canal oficial do ADMIN:** **nenhum registrado** (G1 pendente). Fora do ambiente de teste a AXIA mostra "Falar com o ADMIN" **só em texto**, sem link, com a orientação de procurar o administrador da obra. O destino usado no teste é **fictício** (`admin.ficticio@example.invalid`, domínio reservado que nunca recebe e-mail) e aparece marcado "(destino de teste)". Quando G1 for decidida, o canal oficial entra por configuração server-side e o destino deve ser validado.

## Lacunas da base atual da AXIA que este lote cobre

- Sem entrada sobre **navegação geral** (N1), **escalonamento** (E1 a E10), **Matriz de SLA** (E10), **hub Experts IA** e **especialistas** (X1 a X8), **ação ESPECIALISTA** e **CEO IA**.
- Diz "**três perfis**" (corrigido em N4) e usa "**EVENTOS**" em letras maiúsculas.
- Cita CONSULTAR IA "no e-mail ou na tela do alerta"; o link está nos e-mails legados e o alerta formal usa a ação ESPECIALISTA (X2, X8).
- Não lista **Autorizações**, **Eventos**, **Integrações** e **Usuários** entre as abas do Administrador (N1, N3).
