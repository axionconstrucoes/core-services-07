# Roteiro de homologação AUTENTICADA — ACC (Qualidade, Garantias, Seguros, Quatro Pilares, Alertas, SSMA, Hover Text e Contraste)

Fase 4 / Frente D (item 8). Este roteiro é para uma PESSOA executar no aplicativo real, logada, com perfis diferentes. Ele NÃO prova nada sozinho:
tudo que existe até aqui (testes puros, Postgres real local, navegador com dados sintéticos) valida regras e componentes, mas nenhuma tela foi vista em
sessão autenticada real. **Regra: nenhuma tela é declarada homologada sem execução registrada neste roteiro, com evidência (print) e responsável.**
Estado inicial de TODAS as telas: **NÃO EXECUTADO** (quadro da seção 9).

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
| Menu e autorização por nível (transversal) | A-01 a A-11 | NÃO EXECUTADO | — | — | — |
| Qualidade — Dashboard | Q-01, Q-11 | NÃO EXECUTADO | — | — | — |
| Qualidade — RNC (lista e detalhe) | Q-02 a Q-09, Q-12 | NÃO EXECUTADO | — | — | — |
| Qualidade — Evidências | Q-01, Q-04 | NÃO EXECUTADO | — | — | — |
| Qualidade — Inspeções | Q-01 | NÃO EXECUTADO | — | — | — |
| Qualidade — Reclamações | Q-01 | NÃO EXECUTADO | — | — | — |
| Qualidade — Ensaios e laudos | Q-01 | NÃO EXECUTADO | — | — | — |
| Qualidade — Requisitos | Q-01 | NÃO EXECUTADO | — | — | — |
| Qualidade — Ações (CAPA) | Q-01, Q-06 | NÃO EXECUTADO | — | — | — |
| Qualidade — Eficácia | Q-01, Q-06, Q-07 | NÃO EXECUTADO | — | — | — |
| Qualidade — Recorrências | Q-01 | NÃO EXECUTADO | — | — | — |
| Qualidade — Custos de não qualidade | Q-01 | NÃO EXECUTADO | — | — | — |
| Qualidade — Auditoria | Q-01, Q-06 | NÃO EXECUTADO | — | — | — |
| Garantias — Lista | G-01, G-02 | NÃO EXECUTADO | — | — | — |
| Garantias — Detalhe do caso (cobertura, transição, registros, referências) | G-03 a G-10 | NÃO EXECUTADO | — | — | — |
| Seguros — Painel | S-01 | NÃO EXECUTADO | — | — | — |
| Seguros — Apólices | S-01 a S-03 | NÃO EXECUTADO | — | — | — |
| Seguros — Fianças e garantias | S-01 | NÃO EXECUTADO | — | — | — |
| Seguros — Endossos (dupla conferência) | S-04 a S-09 | NÃO EXECUTADO | — | — | — |
| Seguros — Adiantamentos | S-10 | NÃO EXECUTADO | — | — | — |
| Seguros — Sinistros e eventos | S-11 a S-13 | NÃO EXECUTADO | — | — | — |
| Seguros — Dossiês | S-01 | NÃO EXECUTADO | — | — | — |
| Seguros — Minutas e acionamento | S-14 a S-16 | NÃO EXECUTADO | — | — | — |
| Seguros — Canais oficiais | D-07 a D-09 | NÃO EXECUTADO | — | — | — |
| Seguros — Sujeitos e RCC | S-01 | NÃO EXECUTADO | — | — | — |
| Seguros — Referências | S-01 | NÃO EXECUTADO | — | — | — |
| Seguros — Auditoria | S-18 | NÃO EXECUTADO | — | — | — |
| Quatro Pilares | PIL-01 a PIL-03 | NÃO EXECUTADO | — | — | — |
| Alertas — detalhe do alerta | AL-01 a AL-03 | NÃO EXECUTADO | — | — | — |
| Solicitações — lista e detalhe | AL-04, D-01 a D-06 | NÃO EXECUTADO | — | — | — |
| Reemissão de alertas / Autorizações | AL-05 | NÃO EXECUTADO | — | — | — |
| SSMA — registros e avaliação | SS-01 a SS-04 | NÃO EXECUTADO | — | — | — |
| SSMA — fluxo offline | SS-05 | NÃO EXECUTADO | — | — | — |
| ESG | SS-03 | NÃO EXECUTADO | — | — | — |
| Hover Text (todas as telas acima) | H-01 a H-05 | NÃO EXECUTADO | — | — | — |
| Contraste e legibilidade (todas as telas acima) | C-01 a C-03 | NÃO EXECUTADO | — | — | — |

## 10. Critérios de aceite do conjunto

1. Blocos A, Q, G, S, PIL, AL, D, SS, H e C com todos os passos OK ou BLOQUEADO com justificativa aceita pelo dono; nenhum FALHOU em passo de autorização ou de envio.
2. Nenhum print mostra dado de outra obra, senha, token ou chave.
3. Nenhum e-mail real foi enviado durante a homologação; nenhum acionamento de seguradora; nenhum pedido real de endosso.
4. Auditoria: toda decisão feita no roteiro aparece com autor e instante corretos.
5. Pendências abertas listadas com responsável e prazo. Uma tela com pendência crítica NÃO é homologada.

## 11. O que este roteiro NÃO substitui

Testes automatizados (puros, Postgres real local, navegador com dados sintéticos) continuam sendo a rede de segurança da regressão; eles NÃO equivalem a homologação autenticada. O que já foi provado em ambiente local está em `docs/homologacao-40-casos-qualidade-garantias-seguros.md` e nos relatórios das fases. Regras de autorização: `docs/permissoes-matriz-central.md`. Implantação e GO/NO-GO: `docs/implantacao/`.
