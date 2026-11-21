# Roteiro de homologação AUTENTICADA — ACC (Qualidade, Garantias, Seguros, Quatro Pilares, Alertas, SSMA, Hover Text e Contraste)

Fase 4 / Frente D (item 8). Este roteiro é para uma PESSOA executar no aplicativo real, logada, com perfis diferentes. Ele NÃO prova nada sozinho:
tudo que existe até aqui (testes puros, Postgres real local, navegador com dados sintéticos) valida regras e componentes, mas nenhuma tela foi vista em
sessão autenticada real. **Regra: nenhuma tela é declarada homologada sem execução registrada neste roteiro, com evidência (print) e responsável.**
Estado de TODAS as telas: nenhuma está EXECUTADO-AUTENTICADO (quadro da seção 9, atualizado na Fase 5/E e revisto na Fase 6/H1; ver seções 12 e 13). Ambiente isolado e kit: `docs/homologacao-ambiente-isolado.md`.

## 0. Antes de começar (pré-condições do ambiente)

| # | Pré-condição | Como conferir | Se falhar |
|---|---|---|---|
| 0.1 | Ambiente de teste, nunca o projeto do piloto WEG nem dado real de cliente | A obra usada se chama "TESTE" (ou equivalente) e tem apenas dados fictícios | Parar. Criar a obra de teste antes |
| 0.2 | As migrations das fases 3 e 4 estão aplicadas NESSE ambiente (decisão e execução do dono, fora deste roteiro) | Ver `docs/implantacao/06-checklist-go-no-go.md` (blocos "migrations" e "hotfix P0") | Sem as migrations, as telas de Qualidade, Garantias e Seguros não têm tabelas: o roteiro NÃO é executável. Registrar "BLOQUEADO — ambiente" no quadro |
| 0.3 | O aplicativo implantado é a versão com as RPCs (Qualidade/Seguros) | Versão/commit anotado pelo responsável da implantação | Descrever a versão no quadro |
| 0.4 | Envio real de e-mail DESLIGADO ou restrito ao destino de teste | Variáveis de envio conforme `docs/implantacao/04-requisitos-email.md` | Não executar os passos de e-mail (D-x) |
| 0.5 | Navegador atualizado (Chrome) e um segundo navegador/janela anônima para trocar de perfil | — | — |
| 0.6 | Pasta de evidências criada fora do repositório, sem dado pessoal real | Ex.: `homologacao-autenticada/AAAA-MM-DD/<módulo>/<passo>.png` | — |

## 1. Perfis de teste necessários

Criar (pela tela **Usuários**, como ADMINISTRADOR) contas de teste do domínio da empresa, uma por perfil. Registrar apenas o PAPEL no quadro, nunca senha.

| Código | Papel na obra TESTE | Nível (`acc_project_tier`) | Para que serve |
|---|---|---|---|
| P-LEI | LEITURA | READ | Consulta; todo botão de escrita deve estar desabilitado e o banco deve recusar |
| P-COL | COLABORADOR | REGISTER | Registra evidências, solicitações, andamento operacional; NÃO decide |
| P-GES | GESTOR | MANAGE | Decide (confirma/encerra RNC, decisão de sinistro, conferência de endosso, confirma destinatário externo) |
| P-GER | GERENTE | MANAGE | Idem GESTOR (precisa ser outra pessoa para provar independência de conferentes) |
| P-ADM | ADMINISTRADOR | ADMIN | Aprova minuta, vê Integrações/Usuários/Autorizações/Eventos/Start-up |
| P-ADM2 | ADMINISTRADOR de OUTRO projeto (obra "TESTE 2") sem vínculo com a obra TESTE | NONE na obra TESTE | Isolamento entre projetos |
| P-INA | Membro INATIVO na obra TESTE | NONE | Acesso removido vale na próxima ação |
| P-PEN | Convite pendente (sem aceitar) | NONE | Convite não concede acesso |

Para os passos de independência de conferentes (Seguros, endosso) são necessárias DUAS pessoas distintas com nível MANAGE além de quem solicita e de quem emite: use P-GES, P-GER e mais um GESTOR (P-GES2) e o P-ADM como emissor/solicitante, conforme o passo.

## 2. Dados mínimos (criar na obra TESTE, todos fictícios e identificados como "TESTE")

| Dado | Quantidade | Observação |
|---|---|---|
| Documentos (contrato, apólice, aditivo, relatório) | 4 | PDF fictício, nome começando por `TESTE-` |
| E-mails registrados | 2 | Um da AXION e um de "cliente" fictício, ingeridos pelo fluxo normal |
| Fotos do SSMA | 2 | Uma com não conformidade evidente (fictícia) |
| RNC | 3 | Uma por origem diferente (e-mail, foto SSMA, inspeção) |
| Caso de garantia | 2 | Um dentro e um fora do prazo de garantia |
| Apólice + parte + cláusula | 1 | Performance Bond fictício; cláusula específica identificada |
| Fiança bancária | 1 | — |
| Adiantamento + amortização | 1 | — |
| Endosso crítico (muda segurado/valor) | 1 | Para dupla conferência |
| Sinistro (aviso) | 1 | — |
| Alerta de risco | 2 | Um CRÍTICO e um MÉDIO, gerados pelo ciclo de alertas de teste |
| Destinatários de e-mail | 3 | Um `@axion.com.br`, um domínio externo FICTÍCIO de uso próprio do testador, um endereço inválido |

## 3. Como registrar cada passo

Para cada passo: executar, comparar com "Resultado esperado", capturar print (PNG, sem dado pessoal real, mostrando o perfil logado e a URL) e marcar **OK**, **FALHOU** ou **BLOQUEADO** no quadro da seção 9, com data, executor e nome do arquivo de evidência.
Falha = abrir pendência com: passo, perfil, resultado obtido, print. Uma falha em passo de AUTORIZAÇÃO (A-) ou de ENVIO (D-) é crítica e bloqueia a homologação do módulo.

## 4. Autorização e menus (transversal — executar ANTES dos módulos)

| Passo | Perfil | Ação | Resultado esperado | Evidência |
|---|---|---|---|---|
| A-01 | P-LEI | Abrir a obra TESTE | Menu mostra Dashboard, Quatro Pilares, Qualidade, Garantias, Seguros etc.; NÃO mostra Eventos, Integrações, Usuários, Autorizações, Reemissão de alertas, Start-up | Print do menu |
| A-02 | P-COL, P-GES, P-GER | Idem | Mesmos itens de A-01 (itens restritos continuam só para ADMINISTRADOR) | Print do menu de cada |
| A-03 | P-ADM | Idem | Também aparecem Eventos, Integrações, Usuários, Autorizações, Reemissão de alertas e Start-up | Print |
| A-04 | P-ADM2 (sem vínculo com TESTE) | Tentar abrir `/<id-da-obra-TESTE>/qualidade` colando a URL | Página não encontrada (404) ou redirecionamento; nenhum dado da obra aparece | Print da URL e da resposta |
| A-05 | P-ADM2 | Repetir A-04 para `/garantias`, `/seguros`, `/pilares`, `/qualidade/rnc/<id>`, `/garantias/<id>` | Todas negadas | Prints |
| A-06 | P-INA | Abrir a obra TESTE e cada rota de A-05 | Negado; o menu não lista Qualidade, Garantias, Seguros nem Quatro Pilares | Prints |
| A-07 | P-PEN | Idem A-06 | Negado | Prints |
| A-08 | P-ADM | Inativar P-COL pela tela Usuários; com P-COL logado, clicar em qualquer item restrito por nível e recarregar | Na próxima ação P-COL perde acesso (404) e o menu deixa de listar os quatro itens; nenhuma ação de escrita é aceita | Prints antes/depois |
| A-09 | P-ADM | Reativar P-COL | Acesso volta na próxima carga | Print |
| A-10 | P-LEI | Em cada módulo, tentar cada botão de escrita | Botões desabilitados com a explicação "Requer perfil:"; se houver como forçar (URL/ação), o servidor recusa com mensagem clara | Prints |
| A-11 | P-COL | Tentar decisões de gestão (confirmar/encerrar RNC, decisão de sinistro, conferir endosso) | Recusado com mensagem clara; nada é gravado | Prints |

Critério de aceite do bloco A: nenhum perfil vê, abre por URL ou executa o que a matriz (`docs/permissoes-matriz-central.md`, seção 3) não permite; nenhum print mostra dado de outra obra.

## 5. Qualidade (`/<obra>/qualidade`)

Abas: Dashboard, RNC, Evidências, Inspeções, Reclamações, Ensaios e laudos, Requisitos, Ações (CAPA), Eficácia, Recorrências, Custos de não qualidade, Auditoria. Detalhe: `/<obra>/qualidade/rnc/<id>`.

| Passo | Perfil | Ação | Resultado esperado | Evidência |
|---|---|---|---|---|
| Q-01 | P-LEI | Percorrer as 12 abas | Todas abrem sem erro; dados somente de leitura; "SEM DADOS" onde não há dado (nunca zero) | Print por aba |
| Q-02 | P-COL | Registrar RNC com fonte original (e-mail) | RNC criada com código; fonte rastreável preenchida e imutável | Print do registro |
| Q-03 | P-COL | Tentar registrar RNC sem fonte | Recusado com mensagem pedindo a fonte | Print |
| Q-04 | P-COL | Registrar evidência (foto SSMA) e reclassificar a evidência | Registro ok; reclassificar é recusado (exige gestão) | Prints |
| Q-05 | P-COL | Avançar RNC até investigação; tentar "confirmar" | Etapas operacionais ok; confirmar/encerrar recusado | Prints |
| Q-06 | P-GES | Confirmar RNC, registrar CAPA, verificação de eficácia (com evidência classificada como FATO) | Aceitos; auditoria registra autor e instante | Prints + aba Auditoria |
| Q-07 | P-GES | Tentar encerrar RNC sem verificação de eficácia | Encerramento impedido com a lista do que falta | Print |
| Q-08 | P-GES | Encerrar RNC completa; depois reabrir | Encerra só com requisitos cumpridos; reabertura preserva histórico | Prints |
| Q-09 | P-GES / P-GER | Abrir a mesma RNC nos dois perfis e gravar ao mesmo tempo | Um grava; o outro recebe aviso de conflito de versão e o texto digitado é preservado | Prints dos dois |
| Q-10 | P-ADM2 | Tentar ler RNC da obra TESTE por URL | Negado | Print |
| Q-11 | qualquer | Aba Dashboard: comparar totais com a lista da aba RNC | Totais coerentes com os registros | Print lado a lado |
| Q-12 | P-GES | Vínculo de alerta: vincular alerta a RNC e desvincular (motivo) | Vínculo criado; desvínculo exige motivo; nada é apagado | Prints |

## 6. Garantias (`/<obra>/garantias`, detalhe `/<obra>/garantias/<id>`)

| Passo | Perfil | Ação | Resultado esperado | Evidência |
|---|---|---|---|---|
| G-01 | P-LEI | Abrir lista e detalhe | Leitura ok; sem botões de escrita ativos | Prints |
| G-02 | P-COL | Abrir caso de garantia com origem rastreável | Caso criado; sem origem é recusado | Prints |
| G-03 | P-COL | Consultar cobertura (painel de cobertura) | Resultado em fato / inferência / recomendação; sem prazo ou cobertura inventados; "SEM DADOS" quando faltar cláusula | Print |
| G-04 | P-COL | Registrar vistoria, manutenção, reparo, custo (com fonte) | Aceitos; custo sem fonte é recusado | Prints |
| G-05 | P-COL | Tentar editar causa, prazos, termos, custos do caso | Recusado (exige gestão) | Print |
| G-06 | P-GES | Decidir cobertura e editar causa/prazos com justificativa | Aceito; auditoria mostra antes/depois | Prints |
| G-07 | P-GES | Registrar aceite do cliente apenas com evidência FATO e só em REPARADA/VERIFICADA | Aceito com evidência; sem evidência recusado | Prints |
| G-08 | P-GES | Tentar encerrar sem requisitos | Impedido com lista do que falta | Print |
| G-09 | P-ADM2 | URL do caso de outra obra | Negado | Print |
| G-10 | P-GES | Parecer de cobertura: gravar nova versão | Nova versão; histórico das versões preservado | Print |

## 7. Seguros (`/<obra>/seguros`) — 12 abas

Abas: Painel, Apólices, Fianças e garantias, Endossos, Adiantamentos, Sinistros e eventos, Dossiês, Minutas e acionamento, Canais oficiais, Sujeitos e RCC, Referências, Auditoria.

| Passo | Perfil | Ação | Resultado esperado | Evidência |
|---|---|---|---|---|
| S-01 | P-LEI | Percorrer as 12 abas | Leitura ok; botões de escrita desabilitados com explicação | Prints |
| S-02 | P-GES | Cadastrar apólice, parte, cláusula (com fonte) | Aceitos; sem fonte recusado | Prints |
| S-03 | P-COL | Tentar cadastrar apólice | Recusado | Print |
| S-04 | P-COL | Solicitar endosso crítico | Pedido registrado (NÃO é endosso emitido) | Print |
| S-05 | P-ADM (emissor) | Registrar emissão do endosso | Estado EMITIDO, sem efeito de cobertura ainda | Print |
| S-06 | P-GES | Conferir (1ª aprovação) | "1 de 2 conferências"; endosso segue sem efeito de cobertura | Print |
| S-07 | P-ADM (emissor) | Tentar conferir o endosso que emitiu | Recusado (emissor não confere) | Print |
| S-08 | P-GER | Conferir (2ª aprovação, outra pessoa) | Endosso CONFERIDO com efeito de cobertura conforme o texto EMITIDO | Print |
| S-09 | P-GES | Tentar conferir de novo | Recusado (já conferiu) | Print |
| S-10 | P-GES | Registrar adiantamento e amortização; conferir saldo | Soma e saldo coerentes, sem dupla contagem | Print |
| S-11 | P-COL | Abrir aviso de sinistro e registrar andamento operacional | Aceito | Print |
| S-12 | P-COL | Tentar registrar decisão da seguradora / negativa / indenização | Recusado (exige gestão) | Print |
| S-13 | P-GES | Registrar decisão com fundamentação e fontes | Aceito; auditoria registra | Print |
| S-14 | P-COL | Criar minuta (DRAFT) | Minuta criada; lacunas aparecem como [PREENCHER] | Print |
| S-15 | P-GES | Tentar aprovar minuta | Recusado (só ADMINISTRADOR) | Print |
| S-16 | P-ADM | Aprovar minuta completa e tentar enviar | Aprovação ok; botão Enviar desabilitado: "indisponível nesta fase"; tentativa registra apenas bloqueio | Print |
| S-17 | P-ADM2 | URL de `/seguros` da obra TESTE | Negado | Print |
| S-18 | P-GES | Aba Auditoria: localizar todos os registros acima | Autor, instante e ação corretos | Print |

## 8. Quatro Pilares, Alertas, SSMA, Hover Text e Contraste

### 8.1 Quatro Pilares (`/<obra>/pilares`)

| Passo | Perfil | Ação | Resultado esperado | Evidência |
|---|---|---|---|---|
| PIL-01 | P-LEI | Abrir a tela | Quatro painéis; "SEM DADOS" quando não há dado; cada indicador mostra a fonte | Print |
| PIL-02 | P-GES | Clicar "Ver origem" de um indicador | Leva à tela de origem (RNC, caso, apólice) da MESMA obra | Print |
| PIL-03 | P-ADM2 | URL de `/pilares` da obra TESTE | Negado | Print |

### 8.2 Alertas e solicitações

| Passo | Perfil | Ação | Resultado esperado | Evidência |
|---|---|---|---|---|
| AL-01 | P-GES | Abrir um alerta (`/<obra>/alertas/<id>`) | Resumo, impacto e recomendação; responsável atual; prazo conforme o SLA vigente | Print |
| AL-02 | P-COL | Registrar resposta do alerta | Resposta gravada; auditoria | Print |
| AL-03 | P-LEI | Tentar responder | Recusado | Print |
| AL-04 | P-GES | Solicitações (`/<obra>/action-requests`): abrir uma solicitação | Detalhe exibido; campo Destinatário e campos de confirmação de destinatário externo visíveis | Print |
| AL-05 | P-ADM | Reemissão de alertas / Autorizações | Telas só para administrador | Print |

### 8.3 Destinatário externo de e-mail (Fase 4 / D) — solicitações e canal oficial de Seguros

NÃO executar com envio real ligado (pré-condição 0.4). O sistema valida e registra a confirmação; o envio é decisão separada.

| Passo | Perfil | Ação | Resultado esperado | Evidência |
|---|---|---|---|---|
| D-01 | P-GES | Solicitação: destinatário `nome@axion.com.br` | Segue sem confirmação | Print |
| D-02 | P-GES | Destinatário externo sem marcar a confirmação | Recusado com a mensagem "O destinatário é externo..."; nada emitido | Print |
| D-03 | P-GES | Externo, confirmação marcada, motivo curto | Recusado: motivo de 10 a 1000 caracteres | Print |
| D-04 | P-GES | Externo, confirmação e motivo válidos | Segue; a auditoria passa a ter a linha (quem, quando, destinatário, motivo) | Print + consulta de auditoria (administrador) |
| D-05 | P-COL | Externo com confirmação e motivo | Recusado: somente gestão confirma destinatário externo | Print |
| D-06 | P-GES | Endereço inválido, com vírgula, com espaço, `a@b.com` seguido de quebra de linha colada | Recusado como inválido ANTES de qualquer confirmação | Prints |
| D-07 | P-GES | Seguros > Canais oficiais > Cadastrar canal (tipo e-mail, domínio externo) sem confirmação | Recusado | Print |
| D-08 | P-GES | Idem com confirmação e motivo | Canal cadastrado NÃO verificado; evento na aba Auditoria | Print |
| D-09 | P-GES | Canal PORTAL/TELEFONE | Não exige confirmação | Print |
| D-10 | P-ADM | Tentar alterar ou apagar a trilha de confirmações (não há tela; verificar que não existe caminho) | Sem opção na interface | Print do que existe |

### 8.4 SSMA / ESG

Telas: `/ssma` (fluxo móvel/offline), `/ssma/<obra>`, `/<obra>/ssma-registros`, `/<obra>/ssma-avaliacao`, `/<obra>/esg`.

| Passo | Perfil | Ação | Resultado esperado | Evidência |
|---|---|---|---|---|
| SS-01 | P-COL | Enviar registro SSMA com foto | Registro criado; foto preservada como evidência original | Print |
| SS-02 | P-LEI | Consultar registros e avaliação | Leitura ok | Print |
| SS-03 | P-GES | Avaliação SSMA e ESG: abrir e conferir indicadores | Indicadores com fonte; "SEM DADOS" quando faltar | Print |
| SS-04 | P-ADM2 | URL de `/ssma-registros` da obra TESTE | Negado | Print |
| SS-05 | P-COL | Fluxo offline (`/ssma/offline`): registrar sem rede e sincronizar | Registro fica pendente e sincroniza; sem perda | Print (se o ambiente permitir) |

### 8.5 Hover Text (ajuda contextual)

| Passo | Perfil | Ação | Resultado esperado | Evidência |
|---|---|---|---|---|
| H-01 | P-LEI | Em cada tela dos módulos acima, passar o mouse sobre cada ícone (i) | Painel abre, texto legível, não cortado, fecha com ESC | Print por tela |
| H-02 | P-COL | Teclado: Tab até o (i), Enter/Espaço abre; ESC fecha; foco visível | Funciona sem mouse | Print/vídeo curto |
| H-03 | P-COL | Celular real (ou emulação 390 px): tocar no (i) | Painel rolável, sem cortes | Print no celular |
| H-04 | P-LEI | Menu lateral recolhido: acionar o (i) de cada item | Ajuda disponível também recolhido | Print |
| H-05 | P-GES | Campos novos de destinatário externo e canal oficial | Cada campo tem (i) com texto correto | Print |

### 8.6 Contraste e legibilidade

| Passo | Ação | Resultado esperado | Evidência |
|---|---|---|---|
| C-01 | Em cada tela, inspecionar visualmente texto sobre fundo claro e escuro, selos, botões desabilitados, mensagens de erro e foco | Fundo claro com fonte escura; fundo escuro com fonte clara; nada ilegível | Print por tela |
| C-02 | Ferramenta de contraste do navegador em 5 pontos por tela (títulos, tabela, selo, botão desabilitado, mensagem de erro) | Mínimo 4,5:1 para texto normal e 3:1 para texto grande e controles | Print da medição |
| C-03 | Celular 390 px: nenhuma rolagem horizontal da página; alvos de toque >= 44 px | Conferido em Qualidade, Garantias, Seguros, Pilares | Prints |

## 9. Quadro de status (preencher durante a execução)

Legenda: NÃO EXECUTADO (padrão) · OK · FALHOU · BLOQUEADO. Só vale OK com data, executor, perfil e evidência anotados.

| Tela / rota | Passos | Status | Data | Executor | Evidência |
|---|---|---|---|---|---|
| Menu e autorização por nível (transversal) | A-01 a A-11 | **EXECUTADO-BANCO-REAL** | 21/11/2026 | agente F5-E (automatizado, NÃO é pessoa logada) | Regra de nível, RLS e paridade do menu em Postgres 17 local: test-permissoes-unificadas-realpg, test-destinatarios-externos-realpg, test-competencias-realpg. Tela/menu NÃO visto: BLOQUEADO |
| Qualidade — Dashboard | Q-01, Q-11 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | qualidade-dashboard-aprovado.jpg (aba vista autenticada como ADM; SEM DADOS e depois 1 RNC coerente com a lista) |
| Qualidade — RNC (lista e detalhe) | Q-02 a Q-09, Q-12 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | qualidade-rnc-*.jpg (Q-02 e Q-03 vistos; Q-05 só até triagem como ADM; Q-04/Q-06 a Q-09/Q-12 NÃO vistos) |
| Qualidade — Evidências | Q-01, Q-04 | **EXECUTADO-BANCO-REAL** | 21/11/2026 | agente F5-E (automatizado, NÃO é pessoa logada) | Registro de evidência/classificação: test-quality-rpc-realpg. Tela NÃO vista |
| Qualidade — Inspeções | Q-01 | **BLOQUEADO** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Sem sessão autenticada e sem harness de tela para esta aba (o harness Chrome cobre Seguros, Garantias, SSMA offline e Hover/Contraste, não as abas de Qualidade). Ação humana: ambiente isolado (docs/homologacao-ambiente-isolado.md H1–H5) + pessoa logada |
| Qualidade — Reclamações | Q-01 | **BLOQUEADO** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Sem sessão autenticada e sem harness de tela para esta aba (o harness Chrome cobre Seguros, Garantias, SSMA offline e Hover/Contraste, não as abas de Qualidade). Ação humana: ambiente isolado (docs/homologacao-ambiente-isolado.md H1–H5) + pessoa logada |
| Qualidade — Ensaios e laudos | Q-01 | **BLOQUEADO** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Sem sessão autenticada e sem harness de tela para esta aba (o harness Chrome cobre Seguros, Garantias, SSMA offline e Hover/Contraste, não as abas de Qualidade). Ação humana: ambiente isolado (docs/homologacao-ambiente-isolado.md H1–H5) + pessoa logada |
| Qualidade — Requisitos | Q-01 | **BLOQUEADO** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Sem sessão autenticada e sem harness de tela para esta aba (o harness Chrome cobre Seguros, Garantias, SSMA offline e Hover/Contraste, não as abas de Qualidade). Ação humana: ambiente isolado (docs/homologacao-ambiente-isolado.md H1–H5) + pessoa logada |
| Qualidade — Ações (CAPA) | Q-01, Q-06 | **EXECUTADO-BANCO-REAL** | 21/11/2026 | agente F5-E (automatizado, NÃO é pessoa logada) | Transições, evidência, encerramento, reabertura e auditoria: test-quality-realpg, test-quality-rpc-realpg, test-f5-e-governanca-realpg. Tela NÃO vista |
| Qualidade — Eficácia | Q-01, Q-06, Q-07 | **EXECUTADO-BANCO-REAL** | 21/11/2026 | agente F5-E (automatizado, NÃO é pessoa logada) | Transições, evidência, encerramento, reabertura e auditoria: test-quality-realpg, test-quality-rpc-realpg, test-f5-e-governanca-realpg. Tela NÃO vista |
| Qualidade — Recorrências | Q-01 | **BLOQUEADO** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Sem sessão autenticada e sem harness de tela para esta aba (o harness Chrome cobre Seguros, Garantias, SSMA offline e Hover/Contraste, não as abas de Qualidade). Ação humana: ambiente isolado (docs/homologacao-ambiente-isolado.md H1–H5) + pessoa logada |
| Qualidade — Custos de não qualidade | Q-01 | **BLOQUEADO** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Sem sessão autenticada e sem harness de tela para esta aba (o harness Chrome cobre Seguros, Garantias, SSMA offline e Hover/Contraste, não as abas de Qualidade). Ação humana: ambiente isolado (docs/homologacao-ambiente-isolado.md H1–H5) + pessoa logada |
| Qualidade — Auditoria | Q-01, Q-06 | **EXECUTADO-BANCO-REAL** | 21/11/2026 | agente F5-E (automatizado, NÃO é pessoa logada) | Transições, evidência, encerramento, reabertura e auditoria: test-quality-realpg, test-quality-rpc-realpg, test-f5-e-governanca-realpg. Tela NÃO vista |
| Garantias — Lista | G-01, G-02 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | garantias-lista-aprovado.jpg (G-02 caso criado com origem; lista vista) |
| Garantias — Detalhe do caso (cobertura, transição, registros, referências) | G-03 a G-10 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | garantias-detalhe-GAR0001-aprovado.jpg, garantias-cobertura-aprovado.jpg (G-03 e texto INFORMADO×COMPROVADO vistos; G-04 a G-10 NÃO vistos) |
| Seguros — Painel | S-01 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | seguros-painel-aprovado.jpg |
| Seguros — Apólices | S-01 a S-03 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | seguros-apolice-sem-fonte-recusada-aprovado.jpg (S-02 como ADM: cadastro e recusa sem fonte; S-03 NÃO visto) |
| Seguros — Fianças e garantias | S-01 | **FIXTURE** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Aba renderizada no Chrome com os componentes REAIS e dados sintéticos (test-seguros-browser: 12 OK/0 FAIL; B1 abre as 12 abas, B2 teclado, B6 celular 390 px, B7 contraste, B8 axe). Sem login, sem Supabase: NÃO é tela autenticada |
| Seguros — Endossos (dupla conferência) | S-04 a S-09 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | seguros-endosso-solicitado-sem-efeito-aprovado.jpg (S-04 visto; emissão exige documento: S-05 a S-09 NÃO vistos) |
| Seguros — Adiantamentos | S-10 | **EXECUTADO-BANCO-REAL** | 21/11/2026 | agente F5-E (automatizado, NÃO é pessoa logada) | Dupla conferência, saldos, decisão fundamentada, minuta, canal e reabertura de sinistro: test-endossos-dupla-conferencia-realpg, test-f4b-garantias-seguros-realpg, test-destinatarios-externos-realpg, test-f5-e-governanca-realpg. Tela NÃO vista |
| Seguros — Sinistros e eventos | S-11 a S-13 | **EXECUTADO-BANCO-REAL** | 21/11/2026 | agente F5-E (automatizado, NÃO é pessoa logada) | Dupla conferência, saldos, decisão fundamentada, minuta, canal e reabertura de sinistro: test-endossos-dupla-conferencia-realpg, test-f4b-garantias-seguros-realpg, test-destinatarios-externos-realpg, test-f5-e-governanca-realpg. Tela NÃO vista |
| Seguros — Dossiês | S-01 | **FIXTURE** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Aba renderizada no Chrome com os componentes REAIS e dados sintéticos (test-seguros-browser: 12 OK/0 FAIL; B1 abre as 12 abas, B2 teclado, B6 celular 390 px, B7 contraste, B8 axe). Sem login, sem Supabase: NÃO é tela autenticada |
| Seguros — Minutas e acionamento | S-14 a S-16 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | texto da aba visto (Enviar desabilitado, nada é enviado); minuta não criada: S-14 a S-16 NÃO vistos |
| Seguros — Canais oficiais | D-07 a D-09 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | aba vista vazia; D-07 a D-09 NÃO vistos |
| Seguros — Sujeitos e RCC | S-01 | **FIXTURE** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Aba renderizada no Chrome com os componentes REAIS e dados sintéticos (test-seguros-browser: 12 OK/0 FAIL; B1 abre as 12 abas, B2 teclado, B6 celular 390 px, B7 contraste, B8 axe). Sem login, sem Supabase: NÃO é tela autenticada |
| Seguros — Referências | S-01 | **FIXTURE** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Aba renderizada no Chrome com os componentes REAIS e dados sintéticos (test-seguros-browser: 12 OK/0 FAIL; B1 abre as 12 abas, B2 teclado, B6 celular 390 px, B7 contraste, B8 axe). Sem login, sem Supabase: NÃO é tela autenticada |
| Seguros — Auditoria | S-18 | **EXECUTADO-BANCO-REAL** | 21/11/2026 | agente F5-E (automatizado, NÃO é pessoa logada) | Cadastro e trilha: test-insurance-realpg. Tela NÃO vista |
| Quatro Pilares | PIL-01 a PIL-03 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | pilares-aprovado.jpg (PIL-01; PIL-02/03 NÃO vistos) |
| Alertas — detalhe do alerta | AL-01 a AL-03 | **BLOQUEADO** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Sem sessão autenticada e sem harness de tela do detalhe do alerta. Ação humana: ambiente isolado (H1–H5) + pessoa logada |
| Solicitações — lista e detalhe | AL-04, D-01 a D-06 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | solicitacoes-vazio-aprovado.jpg (lista vazia; sem como criar pela tela: D-01 a D-06 NÃO vistos) |
| Reemissão de alertas / Autorizações | AL-05 | **EXECUTADO-BANCO-REAL** | 21/11/2026 | agente F5-E (automatizado, NÃO é pessoa logada) | Aprovação de reemissão: test-reissue-approval-realpg. Tela NÃO vista |
| SSMA — registros e avaliação | SS-01 a SS-04 | **EXECUTADO-BANCO-REAL** | 21/11/2026 | agente F5-E (automatizado, NÃO é pessoa logada) | Concorrência/registro SSMA: test-ssma-esg-concurrency-realpg. Tela NÃO vista |
| SSMA — fluxo offline | SS-05 | **FIXTURE** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Fila offline em Chrome REAL (IndexedDB, rede cortada via CDP, servidor FALSO local): test-ssma-offline-browser 8 OK/0 FAIL. NÃO prova iPhone/Safari/Android nem o fluxo autenticado |
| ESG | SS-03 | **EXECUTADO-AUTENTICADO (ADM, parcial; seção 15)** | 21/11/2026 | agente HOMOLOG-ADM (reynaldo = ADMINISTRADOR + TENANT_ADMIN, sessão Google real) | esg-aprovado.jpg (tela abre; indicadores NÃO vistos) |
| Hover Text (todas as telas acima) | H-01 a H-05 | **FIXTURE** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Harness Chrome (fixture, sem sessão): test-help-browser 48 OK/0 FAIL e --sweep 50 OK/0 FAIL (catálogo completo: 1609 painéis abrem em desktop e celular, ESC/foco/título/sem estouro; menor contraste medido 8,55:1); test-help-catalog 10, test-help-coverage 4, test-help-reconcile 4 (0 lacunas). Leitura em tela REAL autenticada NÃO feita |
| Contraste e legibilidade (todas as telas acima) | C-01 a C-03 | **FIXTURE** | 21/11/2026 | agente F6-H1 (automatizado, NÃO é pessoa logada) | Harness/auditoria (sem sessão): test-contrast-audit 12, test-contrast-system 10, test-theme-contrast 8, test-select-contrast 6 OK/0 FAIL; auditor estático = 16 apontamentos, todos medidos no Chrome (CA1-CA16) sem reprovação real; garantias-browser 4 OK e seguros-browser 12 OK (contraste efetivo, alvos 44 px, 390 px, axe sem sérios/críticos). Inspeção em tela REAL autenticada NÃO feita |

## 10. Critérios de aceite do conjunto

1. Blocos A, Q, G, S, PIL, AL, D, SS, H e C com todos os passos OK ou BLOQUEADO com justificativa aceita pelo dono; nenhum FALHOU em passo de autorização ou de envio.
2. Nenhum print mostra dado de outra obra, senha, token ou chave.
3. Nenhum e-mail real foi enviado durante a homologação; nenhum acionamento de seguradora; nenhum pedido real de endosso.
4. Auditoria: toda decisão feita no roteiro aparece com autor e instante corretos.
5. Pendências abertas listadas com responsável e prazo. Uma tela com pendência crítica NÃO é homologada.

## 11. O que este roteiro NÃO substitui

Testes automatizados (puros, Postgres real local, navegador com dados sintéticos) continuam sendo a rede de segurança da regressão; eles NÃO equivalem a homologação autenticada. O que já foi provado em ambiente local está em `docs/homologacao-40-casos-qualidade-garantias-seguros.md` e nos relatórios das fases. Regras de autorização: `docs/permissoes-matriz-central.md`. Implantação e GO/NO-GO: `docs/implantacao/`.

## 12. Fase 5 / E — status honesto por linha do quadro (21/11/2026)

Legenda: **EXECUTADO-AUTENTICADO** (pessoa logada vendo a tela, com print) · **EXECUTADO-BANCO-REAL** (regra provada em Postgres 17 local com identidade por claims JWT simulados no banco; a TELA não foi vista) · **FIXTURE** (teste estático/dados sintéticos) · **BLOQUEADO** (com o motivo).

Verificação de ambiente e credenciais (sem imprimir segredos, sem contornar autenticação):
- **Nenhuma linha é EXECUTADO-AUTENTICADO.** Não existe, no repositório nem no ambiente local do agente, credencial de teste legítima (usuário/senha ou sessão de teste) para uma obra "TESTE". As únicas chaves presentes em `apps/web/.env.local` (arquivo não versionado) apontam para o projeto Supabase operacional; usá-las para forjar sessão ou criar usuário seria contornar a autenticação e é proibido.
- **Ambiente não atende a pré-condição 0.2.** Leitura somente-leitura do projeto operacional em 21/11/2026: `quality_ncrs`, `quality_warranty_cases`, `insurance_policies`, `project_competences` e `external_recipient_confirmations` NÃO existem (migrations das fases 3 a 5 pendentes). Sem essas tabelas as telas de Qualidade, Garantias e Seguros não são executáveis lá.
- O banco local de desenvolvimento (Docker, 95 migrations) e o Postgres 17 de homologação (127.0.0.1:55434) não têm a aplicação autenticada (GoTrue + app) com as migrations atuais; o segundo foi usado só como base descartável para os testes "banco real".

Executado (Postgres 17.12 local, base descartável, 195 migrations em replay): test-f5-e-governanca-realpg 14 OK/0 FAIL; test-competencias-realpg 15/0; test-destinatarios-externos-realpg 17/0; test-quality-realpg 30/0; test-quality-rpc-realpg 54/0; test-insurance-realpg 19/0; test-f4b-garantias-seguros-realpg 13/0; test-f3e-persistencia-realpg 14/0; test-endossos-dupla-conferencia-realpg 20/0; test-permissoes-unificadas-realpg 31/0; test-lote4-isolation-realpg 19/0; test-email-specialist-realpg 6/0; test-reissue-approval-realpg 10/0; test-ssma-esg-concurrency-realpg 18/0.

Cenários novos do item 14 em banco real: **25** (destinatário externo sem confirmação), **26** (uso único; nada é enviado) e **27** (colaborador prepara, aprovação conforme a matriz) — `scripts/test-f5-e-governanca-realpg.mjs`. Os passos D-01 a D-10 continuam exigindo pessoa logada para homologar a TELA.

**Para homologar de verdade:** (1) o dono aplica as migrations no ambiente de TESTE (não no operacional sem decisão); (2) cria a obra "TESTE" e os perfis da seção 1 pelo fluxo normal da tela Usuários; (3) uma pessoa executa os passos e anexa prints. Só então uma linha passa a EXECUTADO-AUTENTICADO.

## 13. Fase 6 / H1 — revisão das 36 linhas e bloqueios exatos (21/11/2026)

Resumo do quadro da seção 9 após a Fase 6: **0 EXECUTADO-AUTENTICADO · 18 EXECUTADO-BANCO-REAL · 8 FIXTURE (harness Chrome) · 10 BLOQUEADO** (36 linhas). Nada foi marcado autenticado: não há sessão real, e nenhuma credencial/URL do Supabase operacional foi usada.

### 13.1 O que foi (re)executado nesta fase

| Camada | Resultado (todas com `block-live-ai`, sem rede externa, sem e-mail) |
|---|---|
| **Postgres 17.12 real local (127.0.0.1:55434), base descartável, RLS por claims JWT no banco** — 19 scripts `*-realpg` | ensaio-implantacao-ondas 139/0 · competencias 15/0 · destinatarios-externos 17/0 · email-specialist 6/0 · endossos-dupla-conferencia 20/0 · f3e-persistencia 14/0 · f4b-garantias-seguros 13/0 · f5-a-monitoramento 11/0 · f5-b-classificacao 11/0 · f5-c-contatos 14/0 · f5-e-governanca 14/0 · f5-g-pipeline 13/0 · insurance 19/0 · lote4-isolation 19/0 · permissoes-unificadas 31/0 · quality 30/0 · quality-rpc 54/0 · reissue-approval 10/0 · ssma-esg-concurrency 18/0 · **kit de homologação 24/0** (novo) |
| **Chrome headless via CDP (FIXTURE — dados sintéticos, sem login)** | test-help-browser 48/0 e `--sweep` 50/0 (1609 painéis do catálogo, desktop+celular) · test-seguros-browser 12/0 (12 abas) · test-garantias-browser 4/0 · test-ssma-offline-browser 8/0 |
| **Contraste/Hover (estático + medição no Chrome)** | test-contrast-audit 12 · test-contrast-system 10 · test-theme-contrast 8 · test-select-contrast 6 · test-help-catalog 10 · test-help-coverage 4 · test-help-reconcile 4 (isenções 219; citando helpId 156) — todos 0 falha |
| Guarda e kit (puro) | test-homolog-guard 39/0 |

Rótulos: **EXECUTADO-BANCO-REAL** = regra provada no banco; a TELA não foi vista. **FIXTURE** = componente real renderizado no Chrome com dados sintéticos, sem autenticação e sem Supabase. Nenhum desses é homologação de tela autenticada.

### 13.2 Bloqueios exatos (o que impede cada grupo e a ação humana correspondente)

| Grupo de linhas | Bloqueio exato | Ação humana |
|---|---|---|
| Todas as telas em sessão real (qualquer passo "Tela NÃO vista") | O login é **Google-only** e restrito a `@axion.com.br`; não existe projeto Supabase de homologação com Google Auth; o único backend existente é o operacional (proibido). Sem Docker, a stack local com GoTrue não sobe | H1 (aprovar custo ≈ US$ 10/mês e criar `acc-homolog`), H2 (OAuth client no Google Cloud), H3 (provedor Google + URLs no painel), H4 (2–3 contas Google `@axion.com.br` de teste reais e as pessoas entrando), H5 (onde o app roda) — ver `docs/homologacao-ambiente-isolado.md`, seções 2 a 4 |
| Qualidade — 7 abas só de leitura (Dashboard, Inspeções, Reclamações, Ensaios e laudos, Requisitos, Recorrências, Custos de não qualidade) | Além da sessão: **não existe harness de tela** para estas abas | Mesmas ações acima; opcionalmente pedir um harness Chrome (como o de Seguros) numa fase futura |
| Quatro Pilares, Alertas (detalhe), ESG | Sem sessão e sem harness de tela | Idem |
| P-INA, P-PEN, P-ADM2 (isolamento, inativo, convite pendente) | Exigem 3 contas Google adicionais (inativo, pendente que NÃO entra, administrador de outra obra) | H4 ampliado (seção 4.2 do documento do ambiente) |
| Dupla conferência de Seguros (S-05 a S-09) em tela | Exige 4 pessoas distintas logadas (solicitante, emissor, 2 conferentes) | H4 ampliado |

### 13.3 Como o kit transforma a linha em EXECUTADO-AUTENTICADO

1. Os passos H1–H5 acima são feitos pelo responsável. 2. O kit (`scripts/homolog/*`) aplica as migrations SOMENTE no projeto novo (guarda recusa `plbcvwostmdmdmrziwmd` e qualquer host desconhecido), cria as obras fictícias e os pré-cadastros; os perfis nascem no **primeiro login Google real** de cada conta. 3. Uma pessoa executa as seções 4 a 8 deste roteiro e anexa prints. Só então a linha do quadro pode ser marcada EXECUTADO-AUTENTICADO, com data, executor, perfil e evidência.

## 14. Execução no acc-homolog (21/11/2026) — evidências reais até agora

Projeto `gtadbeaevxglrqkhcwfz` (acc-homolog, sa-east-1, Postgres 17), isolado do operacional. **Nenhuma tela foi vista em sessão autenticada ainda**: o navegador controlado pelo agente não tinha a sessão Google (tela de login com a etiqueta SISTEMA EM TESTE). Nada abaixo é homologação de tela.

| Evidência | Rótulo | Resultado |
|---|---|---|
| 205 migrations aplicadas pelo kit com guarda (marcador, transação por arquivo, `lock_timeout`) | PROVISIONAMENTO | 205 registradas, 0 pendentes; 218 tabelas em `public`, 0 sem RLS, 260 políticas |
| P0 `record_risk_alert_action` no acc-homolog | BANCO-REAL | md5 do corpo sem CR `930f6d75898793479b418950b0053bd9`, SECURITY DEFINER, `search_path` vazio, sem EXECUTE para anon |
| Operacional após o provisionamento (leitura) | BANCO-REAL | 134 migrations, última `20261119034721`, mesmo md5 do P0: inalterado |
| Primeiro login Google do P-ADM | AUTENTICADO (criação do usuário) | usuário criado pelo provedor Google, sem senha local, e-mail confirmado, perfil pelo trigger `handle_new_user`, 0 memberships e 0 obras antes do seed |
| Seed sintético TESTE e TESTE-2 + perfis (P-ADM ADMINISTRADOR; P-GES, P-COL, P-GES2 pré-cadastro PENDING) | PROVISIONAMENTO | 2 obras, 1 membership ACTIVE, 3 convites PENDING |
| TENANT_ADMIN: ADMINISTRADOR de projeto não altera dado global; TENANT_ADMIN altera mas não ganha competência nem poder em obra sem vínculo; bootstrap auditado | BANCO-REAL (claims JWT simulados no banco; NÃO é sessão de tela) | 11 OK / 0 FAIL (`scripts/homolog/validar-tenant-admin.mjs`) |

Pendente: as 36 verificações de tela exigem sessão real. Um perfil por pessoa: P-GES, P-COL e P-GES2 só ativam no primeiro login Google de cada uma.

## 15. Execução autenticada perfil ADMINISTRADOR (21/11/2026)

Executor: agente HOMOLOG-ADM, na janela Chrome já autenticada pelo responsável (reynaldo@axion.com.br = ADMINISTRADOR da obra TESTE + TENANT_ADMIN), `http://localhost:3000`, Supabase acc-homolog. Evidências (fora do repositório): `C:\VIBE\PROJETOS\axion-backups\homologacao\evidencias\f8-adm\` (arquivos `.jpg`, nomeados `<módulo>-<caso>-<resultado>`). Dado sintético criado: RNC-0001, GAR-0001, apólice HOMOLOG-0001 (rascunho) com endosso #1 (solicitado), organização "[HOMOLOG] Fornecedor sintético" (+ domínio + vínculo CANDIDATO) e uma preparação de aprovação externa pendente (nunca enviada). Conferência no banco (somente SELECT): RNC-0001 em TRIAGEM; vínculo CANDIDATE com `delegation_scope` vazio; auditoria ORG_CREATE, LINK_CREATE_CANDIDATE e DOMAIN_SET_ACTIVE.

Legenda: APROVADO (visto na tela como ADM) · REPROVADO · PENDENTE (motivo) · PENDENTE POR DISPONIBILIDADE (titular e data).

| Caso / tela | Status | Evidência | Observação |
|---|---|---|---|
| Dashboard (visão geral) | APROVADO | dashboard-visao-geral-aprovado | Selo SISTEMA EM TESTE; indicadores "Não disponível" ou "—" (nunca zero inventado) |
| Q-01 Qualidade, aba Dashboard | APROVADO | qualidade-dashboard-aprovado | SEM DADOS sem RNC; após RNC-0001: 1 aberta e 1 sem criticidade (coerente com a lista; Q-11 parcial) |
| Q-01 demais abas (Inspeções, Reclamações, Ensaios, Requisitos, Recorrências, Custos, Auditoria, Evidências, CAPA, Eficácia) | PENDENTE | — | Não percorridas uma a uma; só Dashboard, RNC e detalhe da RNC foram vistos |
| Q-03 RNC sem fonte | APROVADO | qualidade-rnc-sem-origem-recusada-aprovado, qualidade-rnc-sem-referencia-recusada-aprovado | Recusa por origem e referência obrigatórias (validação nativa do navegador, mensagem em inglês: D5) |
| Q-02 RNC com fonte | APROVADO | qualidade-rnc-detalhe-detectada-aprovado | RNC-0001 criada em DETECTADA, fonte preservada, autoria na linha do tempo |
| Q-05 triagem | APROVADO (parcial) | qualidade-rnc-triagem-aprovado | DETECTADA para EM TRIAGEM; confirmar/encerrar não exercitados |
| Encerramento indevido / RESOLVIDO | APROVADO | qualidade-rnc-detalhe-detectada-aprovado | Não existe estado RESOLVIDO; "Encerramento: bloqueado" com o que falta; botão Encerrar nem é oferecido. Não se tentou forçar por RPC |
| Q-04, Q-06 a Q-09, Q-12 | PENDENTE | — | Q-09 e decisões de gestor exigem Ricardo/Jaime; Q-04/Q-06/Q-08 não executados nesta sessão |
| G-02 abrir caso | APROVADO | garantias-detalhe-GAR0001-aprovado | GAR-0001 com origem manual rastreável (ver O1) |
| G-03 cobertura | APROVADO | garantias-cobertura-aprovado | 16 itens com fonte; "INFORMAÇÕES INSUFICIENTES"; "NÃO é parecer jurídico"; nada inventado |
| Aceite INFORMADO × COMPROVADO | APROVADO (regra visível na tela) | — | A tela explica que só o aceite COMPROVADO libera o encerramento e que o INFORMADO fica registrado como tal; registro só em REPARADA/VERIFICADA. Registrar o aceite NÃO foi exercitado |
| G-04 a G-10 | PENDENTE | — | Não executados (reparo, evidência FATO, parecer, gestor) |
| Seguros: 12 abas | APROVADO (parcial) | seguros-painel-aprovado | Abas existem; vistas: Painel, Apólices, Endossos, Minutas, Canais oficiais. Não vistas: Fianças, Adiantamentos, Sinistros, Dossiês, Sujeitos/RCC, Referências, Auditoria |
| S-02 apólice | APROVADO | seguros-apolice-sem-fonte-recusada-aprovado | Sem fonte recusado ("nenhum dado entra sem origem rastreável"); com fonte criada como Rascunho |
| S-04 endosso solicitado | APROVADO | seguros-endosso-solicitado-sem-efeito-aprovado | "SEM efeito"; dupla conferência exigida (sem classificação tratado como crítico); "quem registrou a emissão não a confere" |
| S-05 a S-09 emissão e conferência | PENDENTE | — | Registrar emissão exige documento do projeto; conferir exige 2 conferentes distintos com competência Seguros/Jurídico. Sem documento e sem 2ª pessoa (parte por disponibilidade) |
| S-14 a S-16 minuta e envio BLOQUEADO | APROVADO (texto) / PENDENTE (criar minuta) | — | Aba declara "Nada é enviado... o botão Enviar fica desabilitado". Minuta e aprovação não exercitadas |
| Seguros: sinistro com fundamentação (S-11, S-13) | PENDENTE | — | Não executado |
| Quatro Pilares (PIL-01) | APROVADO | pilares-aprovado | Reflete os dados criados (1 RNC aberta, 1 garantia pendente, 1 endosso pendente); SEM DADOS sem fonte; fonte de cada indicador. PIL-02 não clicado |
| Alertas (detalhe) AL-01 a AL-03 | PENDENTE | — | Não há alerta nesta obra |
| Solicitações | APROVADO (lista vazia) | solicitacoes-vazio-aprovado | Sem como criar solicitação pela tela; D-01 a D-06 PENDENTE |
| Integrações (cards, caixas, Gmail/ESG) | APROVADO | integracoes-aprovado | Tudo PENDENTE com prova por etapa; ver O2 e D3 |
| Contatos externos (TENANT_ADMIN na interface) | APROVADO | contatos-externos-tenant-admin-aprovado, contatos-externos-org-criada-aprovado | Reynaldo vê o formulário de organização/domínio/vínculo; criou org, domínio e vínculo CANDIDATO; auditoria completa; "competência delegada: NENHUMA" (não ganha competência) |
| Sinais de e-mail | APROVADO (vazio) | sinais-email-vazio-aprovado | Estado vazio claro; delegação de revisão visível |
| Competências (tela e regra) | APROVADO (texto) | competencias-bloqueio-explicado-aprovado | Explica que só vale com evidência conferida por pessoa independente; solicitação "NÃO concede poder"; nenhuma competência ativa. Solicitar/validar NÃO exercitado (evidência obrigatória = documento do projeto) |
| Competências: designar validador, revalidação | PENDENTE | — | Exige documento e outra pessoa |
| Aprovações externas | APROVADO | aprovacoes-externas-aprovado, aprovacoes-externas-preparada-hash-aprovado | Preparou envio externo: destinatário EXTERNO, hash SHA-256 "confere com o conteúdo", "Aguardando aprovação", nada enviado. Domínio reservado (.test) recusado. Aprovar sem motivo recusado (D2). Aprovar de fato, divergência de hash e uso único NÃO exercitados |
| ESG | APROVADO (tela abre) | esg-aprovado | Indicadores não vistos |
| Menu por nível (A-03) | APROVADO | dashboard-visao-geral-aprovado | ADM vê Eventos, Integrações, Usuários, Competências, Aprovações externas. A-01, A-02, A-04 a A-11 PENDENTE (outros perfis) |
| Hover Text | APROVADO (parcial) | hover-esg-obra-aprovado, hover-rnc-criticidade-aprovado, hover-rnc-transicao-aprovado | 3 painéis abertos e legíveis. Existência dos (i) por campo confirmada na árvore de acessibilidade em RNC, Garantias, Seguros, Contatos e Aprovações; NÃO foram feitos 5 hovers por módulo |
| Contraste e legibilidade (C-01) | APROVADO (inspeção visual) | todas as telas | Legível em todas as telas vistas; C-02 (medição) NÃO feita |
| Responsividade 390 px (C-03) | PENDENTE | — | `resize_window` respondeu sucesso mas o viewport permaneceu 1407x749. Usar emulação de dispositivo ou celular real |
| Console e rede | APROVADO | — | Nenhum erro de console (padrão error/Error/Unhandled) nas telas visitadas; documentos e recursos 200; as telas renderizam no servidor e as RPCs não aparecem na rede do navegador. Nenhum 4xx/5xx visto |
| Casos COLABORADOR (Carlos) | PENDENTE POR DISPONIBILIDADE | — | carlos.evandro@axion.com.br, 1º login previsto 23/11/2026 manhã. Roteiro em `docs/homologacao-roteiro-perfis-segunda-23-11.md` |
| Casos GESTOR (Jaime) | PENDENTE POR DISPONIBILIDADE | — | jaime.ramos@axion.com.br, previsto 23/11/2026 manhã |
| Casos GESTOR (Ricardo) | PENDENTE POR DISPONIBILIDADE | — | ricardo.martins@axion.com.br, sem data |
| Isolamento (A-04 a A-07), INATIVO, convite PENDENTE, ADM de outra obra | PENDENTE (perfil sem dono) | — | Exigem contas que ainda não existem (H4 ampliado) |

### 15.1 Defeitos e observações

| Id | Classe | Severidade | Descrição e reprodução | Estado |
|---|---|---|---|---|
| D1 | funcional/visual | baixa | Contatos externos: "vigência 20/11/2026" para `valid_from` 2026-11-21 (SELECT confirma). Data pura formatada com `new Date()` (UTC) recuava um dia em America/Sao_Paulo. Mesmo código em Sinais de e-mail | CORRIGIDO (fmtDate das duas páginas; validado no navegador: "vigência 21/11/2026") |
| D2 | texto | baixa | Aprovações externas: "Dados inválidos no formulário" não diz a causa (reproduzido com `.test` e com Aprovar sem motivo) | CORRIGIDO (mensagem do código ENTRADA lista as causas; test-f6-h2a-governanca 15/0). O formulário de preparação continua sendo limpo após o erro (aberto) |
| D3 | texto | baixa | Integrações: "Integração sem registro; última execução inexistente; erros ?." (placeholder "?") e "As falhas de fotos anteriores pertencem ao projeto TESTE" sem haver falhas | ABERTO |
| D4 | texto | baixa | Identificadores técnicos expostos: `quality_warranty_maintenance_status` (aba Cobertura); `SEGURO_GARANTIA_EXECUTANTE` no seletor de apólice do endosso; rótulos `legalName`, `taxId`, `domain`, `notes`, `subject`, `body`, `reason` ("Função deste campo: ...") em Contatos externos e Aprovações | ABERTO |
| D5 | texto | baixa | Validação nativa do navegador em inglês nos formulários de RNC | ABERTO |
| O1 | funcional | baixa | Garantias: logo após "Caso aberto" a lista seguiu em SEM DADOS; atualizou só ao recarregar. Não reproduzido de forma controlada | ABERTO, a reconfirmar |
| O2 | ambiente | informativo | Integrações: "Não foi possível conferir a habilitação das caixas na configuração de ingestão" (sem ingestão configurada no acc-homolog) | Esperado |
| O3 | texto | informativo | Seletor de obra do ESG exibe "TESTE TESTE (homologação)" | ABERTO |

### 15.2 Testes reexecutados após as correções

tsc `--noEmit` em apps/web: 0 erro · eslint nos 3 arquivos tocados: 0 · test-help-catalog 10/0 · test-help-coverage 4/0 · test-help-reconcile 4/0 · test-contrast-audit 12/0 · test-contrast-system 10/0 · test-homolog-guard 39/0 · test-f6-h2a-governanca 15/0.

### 15.3 Efeito no quadro da seção 9

12 linhas passaram a EXECUTADO-AUTENTICADO, todas PARCIAIS para o perfil ADMINISTRADOR (a coluna Evidência diz o que NÃO foi visto). As demais não mudaram.
