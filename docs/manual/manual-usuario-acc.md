# Manual do Usuário do ACC — por aba

> Arquivo GERADO por `scripts/gerar-manual-usuario.mjs` a partir da base por aba (`apps/web/lib/assistant/abas`), a mesma fonte da AXIA. Não edite à mão: altere a base e gere de novo. O teste `scripts/test-axia-manual-abas.mjs` falha se este arquivo divergir.
> O manual anterior, `docs/manual-referencia-acc.md`, foi PRESERVADO (referência técnica detalhada, com divergências registradas).

## Como ler este manual

- Este manual explica como USAR cada aba do ACC. Ele não faz análise contratual ou técnica: isso é dos Especialistas de IA (Experts IA), sempre com revisão humana.
- A AXIA é a assistente de uso do ACC e responde com esta mesma base. Ela não lê dados da obra, não altera nada e não analisa contratos.
- Cada aba traz: finalidade, funcionalidades, informações exibidas, passo a passo, regras e status, permissões, integrações, perguntas e respostas, limitações e diferenças entre perfis.
- Prazos de SLA para assumir: CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO e BAIXO conforme a Matriz de SLA configurada para a obra.
- A barra lateral mostra ícone e texto sempre visíveis, sem texto ao passar o mouse.

### Situação de cada aba

- **Disponível**
- **Disponível (partes ainda em validação final de uso)**
- **Ainda não liberada**

Algumas abas ainda estão em validação final de uso e outras ainda não foram liberadas; a situação de cada aba está indicada acima e na seção própria dela.

### Índice de abas e rotas

| Aba | Rota | Situação |
|---|---|---|
| Entrar no ACC (Login) | `/login` | Disponível |
| Selecione um projeto | `/projetos` | Disponível |
| Criar e editar obras | `/projetos/novo` | Disponível |
| Dashboard | `/[projectId]/dashboard` | Disponível |
| Quatro Pilares | `/[projectId]/pilares` | Disponível (partes ainda em validação final de uso) |
| Timeline | `/[projectId]/timeline` | Disponível |
| Auditoria | `/[projectId]/auditoria` | Disponível |
| Providências | `/[projectId]/providencias` | Disponível |
| Financeiro | `/[projectId]/financeiro` | Disponível |
| Jurídico | `/[projectId]/juridico` | Disponível |
| Jurídico IA (antes da contratação) | `/juridico` | Disponível |
| Revisão Contratual | `/[projectId]/revisao-contratual` | Disponível |
| Revisão de Cláusulas | `/[projectId]/revisao-clausulas` | Disponível |
| Documentos | `/[projectId]/documentos` | Disponível |
| Versão do documento | `/[projectId]/documentos/versoes/[documentVersionId]` | Disponível |
| E-mail arquivado e anexos | `/[projectId]/documentos/emails/[emailId]` | Disponível |
| Adicionais (redirecionamento) | `/[projectId]/adicionais` | Disponível |
| Eventos | `/[projectId]/ledger` | Disponível |
| Detalhe do evento | `/[projectId]/ledger/[eventId]` | Disponível |
| Responder alertas de contrato (lote) | `/[projectId]/ledger/lote-alertas/[batchId]` | Disponível |
| Solicitações | `/[projectId]/action-requests` | Disponível (partes ainda em validação final de uso) |
| Ações e Escalonamentos | `/[projectId]/acoes` | Disponível |
| Matriz de SLA e Escalonamento | `/[projectId]/acoes/configuracao` | Disponível |
| Resumo semanal de alertas | `/[projectId]/acoes/resumo-semanal/[digestId]` | Disponível |
| Alerta de risco | `/[projectId]/alertas/[caseId]` | Disponível |
| Reemissão de alertas | `/[projectId]/reemissao-alertas` | Disponível |
| Resposta rápida de alerta (e-mail) | `/alertas/acao/[projectId]/[batchId]/[eventId]` | Disponível |
| Resposta rápida de vários alertas (e-mail) | `/alertas/lote/[projectId]/[batchId]` | Disponível |
| Resposta rápida de alerta de providência (e-mail) | `/alertas/providencia/[projectId]/[itemId]` | Disponível |
| Consultar IA sobre o alerta | `/alertas/consulta-ia/[projectId]/[subject]/[id]` | Disponível |
| Ação de e-mail (botões do e-mail) | `/email-actions/[token]` | Disponível |
| ESG/SSMA | `/[projectId]/esg` | Disponível (partes ainda em validação final de uso) |
| Registros de campo SSMA | `/[projectId]/ssma-registros` | Disponível |
| Avaliação do técnico SSMA | `/[projectId]/ssma-avaliacao` | Disponível |
| App de campo SSMA | `/ssma` | Disponível |
| Modo offline do app SSMA | `/ssma/offline` | Disponível |
| Qualidade | `/[projectId]/qualidade` | Disponível (partes ainda em validação final de uso) |
| Dashboard | — | Disponível (partes ainda em validação final de uso) |
| RNC | — | Disponível (partes ainda em validação final de uso) |
| Evidências | — | Disponível |
| Inspeções | — | Ainda não liberada |
| Reclamações | — | Ainda não liberada |
| Ensaios e laudos | — | Ainda não liberada |
| Requisitos | — | Ainda não liberada |
| Ações (CAPA) | — | Disponível |
| Eficácia | — | Disponível |
| Recorrências | — | Ainda não liberada |
| Custos de não qualidade | — | Ainda não liberada |
| Auditoria | — | Disponível |
| Garantias | `/[projectId]/garantias` | Disponível (partes ainda em validação final de uso) |
| Seguros | `/[projectId]/seguros` | Disponível (partes ainda em validação final de uso) |
| Painel | — | Disponível (partes ainda em validação final de uso) |
| Apólices | — | Disponível (partes ainda em validação final de uso) |
| Fianças e garantias | — | Ainda não liberada |
| Endossos | — | Disponível (partes ainda em validação final de uso) |
| Adiantamentos | — | Disponível |
| Sinistros e eventos | — | Disponível |
| Dossiês | — | Ainda não liberada |
| Minutas e acionamento | — | Disponível (partes ainda em validação final de uso) |
| Canais oficiais | — | Disponível (partes ainda em validação final de uso) |
| Sujeitos e RCC | — | Ainda não liberada |
| Referências | — | Disponível |
| Auditoria | — | Disponível |
| Integrações | `/[projectId]/integracoes` | Disponível |
| Caixas de e-mail da obra | `/[projectId]/integracoes/caixas` | Disponível |
| Contatos externos monitorados | `/[projectId]/integracoes/contatos-externos` | Disponível |
| Sinais de risco de e-mail | `/[projectId]/integracoes/sinais-email` | Disponível |
| Experts IA | `/[projectId]/experts-ia` | Disponível |
| Descrição dos Especialistas | `/[projectId]/experts-ia/descricao` | Disponível |
| Diretor de Engenharia e Construção IA | `/[projectId]/experts-ia/diretor-engenharia` | Disponível |
| Diretor de Planejamento IA | `/[projectId]/experts-ia/diretor-planejamento` | Disponível |
| Usuários | `/[projectId]/usuarios` | Disponível |
| Competências | `/[projectId]/competencias` | Ainda não liberada |
| Aprovações externas | `/[projectId]/aprovacoes-externas` | Disponível |
| Autorizações | `/[projectId]/autorizacoes` | Disponível |
| Autorização de acesso aos e-mails da obra | `/autorizacao-email/[authorizationId]` | Disponível |
| Start-up ACC | `/[projectId]/startup` | Disponível |
| Ajuda e tutorial | `/[projectId]/ajuda` | Disponível |
| Fale com a AXIA (rota /vera) | `/vera` | Disponível |
| AXIA e Especialistas: quem responde o quê | — | Disponível |
| Perfis e permissões | — | Disponível |
| Criticidades e prazos (SLA) | — | Disponível |
| Barra lateral de navegação | — | Disponível |

## 1. Acesso, navegação e perfis

Como entrar no ACC, escolher a obra, navegar pela barra lateral e entender o que cada perfil pode fazer.

### 1.1 Entrar no ACC (Login)

- **Tipo:** pagina
- **Rota:** `/login` · relacionadas: `/`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Entrar no ACC (Login): Porta de entrada do ACC. O login usa somente a conta Google corporativa do domínio axion.com.br; não existe senha própria do ACC.

**2. Funcionalidades**
- Botão “Entrar com Google”.
- A raiz do endereço (/) apenas leva a Selecione um projeto.
- Sem sessão, qualquer tela leva ao login e depois volta ao destino original.

**3. Informações e indicadores exibidos**
- Mensagem de erro de login quando o Google não conclui ou a conta é de outro domínio.
- A faixa “SISTEMA EM TESTE” aparece em todas as páginas.

**4. Passo a passo**
1. Abra o endereço do ACC.
2. Clique em Entrar com Google.
3. Escolha a conta corporativa do domínio axion.com.br.
4. Você chega a Selecione um projeto ou ao destino que tentou abrir.

**5. Regras e significados de status**
- Conta de outro domínio é recusada e a sessão é encerrada.
- Ter conta Google não basta: o acesso é concedido por obra pelo Administrador.

Mensagens que aparecem na tela:
- “Acesso restrito a contas do domínio axion.com.br.”
- “Não foi possível concluir o login com Google. Tente novamente.”

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Autenticação Google; depois do login, a lista de obras vem das permissões de cada obra.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Não consigo entrar no ACC, o que faço?
  **R:** Use o botão Entrar com Google com a conta corporativa do domínio axion.com.br; contas de outro domínio são recusadas. Se você entra mas não vê a obra, a sua conta ainda não foi liberada nela: peça ao Administrador na tela Usuários.

**9. Limitações e o que ainda não está liberado**
- A tela de login ainda está em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Entrar no ACC (Login)" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/login/page.tsx`, `apps/web/app/page.tsx`, `docs/manual-referencia-acc.md (4.1)`

### 1.2 Selecione um projeto

- **Tipo:** pagina
- **Rota:** `/projetos`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Selecione um projeto: Lista as obras às quais você tem acesso e leva ao Dashboard da obra escolhida. Também tem o cartão do Jurídico IA (análise de minuta antes da contratação).

**2. Funcionalidades**
- Cartão por obra que abre o Dashboard.
- Cartão Jurídico IA.
- Para o Administrador: NOVO PROJETO e Editar projeto.

**3. Informações e indicadores exibidos**
- Nome e dados básicos de cada obra a que você pertence.

**4. Passo a passo**
1. Depois do login, veja a lista.
2. Clique no cartão da obra.
3. Dentro da obra, o seletor de projeto no topo troca de obra e sempre cai no Dashboard.

**5. Regras e significados de status**
- Se nenhuma obra aparece, a conta ainda não foi liberada em nenhuma obra.
- Abrir uma obra sem acesso mostra página não encontrada.

Mensagens que aparecem na tela:
- “Selecione um projeto”
- “Nenhum projeto disponível para sua conta.”

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Dashboard e Jurídico IA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Por que não vejo uma obra na lista?
  **R:** A lista mostra só as obras de que você participa. Se uma obra não aparece, a sua conta ainda não foi liberada nela: peça ao Administrador da obra, na tela Usuários.

**9. Limitações e o que ainda não está liberado**
- A AXIA não lê quais obras você tem; ela só explica o fluxo.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Selecione um projeto" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/projetos/page.tsx`, `docs/manual-referencia-acc.md (4.1)`

### 1.3 Perfis e permissões

- **Tipo:** tema
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Perfis e permissões: Cada pessoa tem um perfil por obra, definido pelo Administrador na tela Usuários: Administrador, Gerente, Colaborador ou Leitura. O perfil decide o que aparece no menu e o que se pode gravar.

**2. Funcionalidades**
- Menu e rota repetem a mesma regra: esconder o menu nunca é a única barreira.

**3. Informações e indicadores exibidos**
- Itens só do Administrador: Eventos, Integrações, Usuários, Autorizações, Reemissão de alertas e Start-up ACC.

**4. Passo a passo**
1. Se você não vê uma aba, o seu perfil não tem acesso a ela nesta obra.
2. Peça ao Administrador na tela Usuários.

**5. Regras e significados de status**
- Qualidade, Garantias, Seguros, Quatro Pilares e Competências exigem nível Leitura ou superior; Aprovações externas exige Colaborador ou superior.
- Financeiro exige acesso financeiro à obra.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Usuários.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Por que não vejo uma aba?
  **R:** O seu perfil não tem acesso a ela nesta obra: menu e rota seguem a mesma regra. Peça ao Administrador, na tela Usuários.

**9. Limitações e o que ainda não está liberado**
- As diferenças detalhadas entre perfis seguem em revisão no Q&A da AXIA.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Perfis e permissões" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/permissions/nav-access.ts`, `apps/web/lib/ui/nav-items.ts`

### 1.4 Barra lateral de navegação

- **Tipo:** tema
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Barra lateral de navegação: A barra lateral lista as abas da obra, cada uma com ícone e texto sempre visíveis; não há texto que só aparece ao passar o mouse.

**2. Funcionalidades**
- Navegar entre as abas.
- Itens restritos só aparecem a quem tem acesso.

**3. Informações e indicadores exibidos**
- Ícone e rótulo de cada aba.

**4. Passo a passo**
1. Clique no nome da aba na barra lateral.

**5. Regras e significados de status**
- A ordem e os rótulos seguem o menu real do ACC.
- Revisão Contratual e Revisão de Cláusulas saíram do menu e abrem por link.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Todas as abas.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde ficam as abas do ACC?
  **R:** Na barra lateral da obra: cada aba mostra ícone e texto sempre visíveis. Abas restritas só aparecem a quem tem acesso.

**9. Limitações e o que ainda não está liberado**
- Os itens da barra lateral dependem do seu acesso à obra.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Barra lateral de navegação" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/ui/nav-items.ts`, `apps/web/components/layout/app-sidebar.tsx`

## 2. Dashboard e indicadores

Visões executivas da obra: Dashboard, Quatro Pilares, Timeline e Auditoria.

### 2.1 Dashboard

- **Tipo:** menu
- **Rota:** `/[projectId]/dashboard` · relacionadas: `/[projectId]/dashboard/visual`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Dashboard: Visão executiva da obra: consolida alertas, eventos, risco atual, integrações, aditivos e avanço, para identificar rapidamente o que precisa de atenção.

**2. Funcionalidades**
- Cartões de topo (Alertas de risco, Eventos Ledger, Risco atual, Integrações, Aditivos, Avanço físico).
- Painéis de situação contratual, financeiro resumido, SSMA e status das integrações.
- O selo de integrações no cabeçalho.

**3. Informações e indicadores exibidos**
- Selo: Integrações ativas, Integrações parciais ou Falha em integração.
- Quando falta dado, a tela mostra “—”, “Não disponível” ou “Aguardando”, nunca um valor inventado.

**4. Passo a passo**
1. Clique em Dashboard na barra lateral.
2. Leia o selo de integrações e o texto abaixo dele.
3. Confira os cartões de topo e desça pelos painéis.
4. Para tratar um alerta ou evento, use as abas Eventos, Ações e Escalonamentos.

**5. Regras e significados de status**
- “Integrações parciais” significa que alguma fonte está pendente ou pede atenção; “Falha” só aparece quando há erro real.
- A rota /dashboard/visual apenas redireciona para o Dashboard.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Alimenta-se de Eventos, Ações e Escalonamentos, ESG/SSMA, Financeiro (resumo), Documentos e Integrações.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que mostra o Dashboard?
  **R:** O Dashboard é a visão executiva da obra: alertas de risco, eventos, risco atual, integrações, aditivos e avanço. O selo do cabeçalho resume o estado das integrações; passe o mouse ou leia o texto abaixo dele para ver qual está pendente.

**9. Limitações e o que ainda não está liberado**
- Os valores exibidos dependem das fontes configuradas; sem fonte, o campo aparece vazio.
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Dashboard" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/dashboard/page.tsx`, `apps/web/lib/ui/nav-items.ts`, `docs/manual-referencia-acc.md (4.2)`

### 2.2 Quatro Pilares

- **Tipo:** menu
- **Rota:** `/[projectId]/pilares`
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Quatro Pilares: Leitura consolidada, só de consulta, dos fatos já registrados no ACC por pilar: Prazo, Custo, Segurança e Qualidade, mais o painel Jurídico/Seguros, cada indicador com a sua fonte.

**2. Funcionalidades**
- Painéis PRAZO, CUSTO, SEGURANÇA e QUALIDADE.
- Painel Jurídico/Seguros.
- Selo de criticidade geral e por pilar (BAIXO, MÉDIO, ALTO, CRÍTICO ou SEM DADOS).

**3. Informações e indicadores exibidos**
- Término da baseline, avanço, atrasos e ações vencidas (Prazo).
- Valores registrados com fonte (Custo).
- Ocorrências e alertas SSMA (Segurança).
- RNC, reclamações, inspeções e garantias (Qualidade).
- Vencimentos e sinistros (Jurídico/Seguros).

**4. Passo a passo**
1. Abra Quatro Pilares no menu.
2. Leia o selo geral e o selo de cada pilar.
3. Abra cada painel e confira o indicador e a fonte dele.

**5. Regras e significados de status**
- A criticidade geral é a pior severidade aberta, nunca uma média.
- Sem consequência registrada, o selo mostra SEM DADOS; o texto do selo sempre aparece, a cor é só reforço.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Consolida Qualidade, Garantias, Seguros, SSMA e cronograma.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Para que serve a aba Quatro Pilares?
  **R:** Ela mostra, só para consulta, PRAZO, CUSTO, SEGURANÇA e QUALIDADE da obra, mais o painel Jurídico/Seguros, a partir dos fatos já registrados no ACC. Sem registro, o selo mostra SEM DADOS.

**9. Limitações e o que ainda não está liberado**
- Tela somente de leitura; parte dos painéis ainda está em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Quatro Pilares" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/pilares/page.tsx`, `apps/web/lib/permissions/nav-access.ts`, `docs/homologacao-autenticada-roteiro.md`

### 2.3 Timeline

- **Tipo:** menu
- **Rota:** `/[projectId]/timeline`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Timeline: Histórico cronológico da obra, com documentos, e-mails, eventos, aprovações e evidências, mais busca no acervo e exportação do que está filtrado.

**2. Funcionalidades**
- Busca por palavra ou assunto em todo o acervo.
- Filtros de fonte, categoria, período e participantes.
- Exportar Timeline Filtrado (PDF dossiê, índice XLSX/CSV, originais e ZIP).

**3. Informações e indicadores exibidos**
- Contagem de resultados e de itens examinados na busca.
- Resumo “Serão exportados X evento(s)” antes de confirmar.

**4. Passo a passo**
1. Abra Timeline.
2. Use Buscar palavra / assunto ou ajuste os filtros.
3. Clique em um evento para abrir o detalhe.
4. Para exportar, clique em Exportar Timeline Filtrado, escolha os formatos e confirme.

**5. Regras e significados de status**
- A tela abre filtrada do início da obra ao prazo baseline: eventos posteriores exigem ajustar o período.
- Com busca ativa, o painel de exportação some.
- Arquivos originais que a permissão não libera entram no manifesto como indisponíveis.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Abre o detalhe do evento em Eventos; lê Documentos, e-mails e demais fontes do acervo.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Por que não aparecem eventos recentes na Timeline?
  **R:** A Timeline abre filtrada do início da obra até o prazo baseline, o que pode esconder eventos posteriores. Ajuste o período nos filtros.
- **P:** Como exporto a Timeline?
  **R:** Clique em Exportar Timeline Filtrado, confira o resumo de quantos eventos serão exportados, escolha os formatos (PDF dossiê, índice XLSX ou CSV, originais, ZIP) e confirme. Sem marcar eventos, exporta tudo o que está filtrado.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Timeline" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/timeline/page.tsx`, `docs/manual-referencia-acc.md (4.3)`

### 2.4 Auditoria

- **Tipo:** menu
- **Rota:** `/[projectId]/auditoria`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Auditoria: Histórico rastreável das ações relevantes realizadas no ACC: quem fez, quando e o que foi afetado.

**2. Funcionalidades**
- Filtros: Todos, Projetos e versões, Atas de reunião, Relatórios e RDO, Medições, E-mails, Ações e SLA, SSMA/ESG, Integrações e falhas.
- Aviso quando há registros de falha ou indisponibilidade.

**3. Informações e indicadores exibidos**
- Tabela com Data/Hora, Ator, Ação, Entidade e Detalhe.

**4. Passo a passo**
1. Abra Auditoria.
2. Escolha um filtro em Filtrar logs.
3. Leia a tabela; para falhas, use Integrações e falhas.

**5. Regras e significados de status**
- A auditoria é só de leitura; os registros não são alterados pela tela.
- Os filtros agrupam por tipo de ação e podem ser aproximados.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Recebe registros dos demais módulos.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde vejo quem fez uma ação no ACC?
  **R:** Na aba Auditoria: a tabela mostra data e hora, ator, ação, entidade e detalhe. Use Filtrar logs para focar em e-mails, SLA, SSMA/ESG ou falhas.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Auditoria" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/auditoria/page.tsx`, `docs/manual-referencia-acc.md (4.32)`

## 3. Planejamento e Custos

Providências de entrega da obra, cronograma e o painel Financeiro (restrito).

### 3.1 Providências

- **Tipo:** menu
- **Rota:** `/[projectId]/providencias`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Providências: Tabela das providências de início e de entrega da obra (por exemplo CNO, as-built, databook, AVCB, concessionárias), com responsável, prazo, situação e evidência. Os alertas recorrentes usam estes mesmos registros.

**2. Funcionalidades**
- Cadastrar o checklist inicial e adicionar providências da obra.
- Editar prazo, responsável e evidência; mudar a situação.
- Coluna Acompanhamento explica quando os alertas começam.

**3. Informações e indicadores exibidos**
- Selos como “Sem responsável” e “Sem prazo”.
- Situações: Pendente, Em andamento, Concluído, Não aplicável.

**4. Passo a passo**
1. Abra Providências.
2. Com a tabela vazia, o Administrador usa Cadastrar checklist inicial.
3. Use Nova providência para acrescentar itens e Editar para prazo, responsável e evidência.
4. Mude a situação com justificativa e evidência quando pedidas.

**5. Regras e significados de status**
- Os alertas de entrega começam 60 dias corridos antes do término previsto, ou no prazo individual se vencer antes.
- CNO: o prazo de referência é o início das atividades mais 30 dias e fica “estimado” até o início ser confirmado.
- Mudar o término previsto recalcula os marcos e grava o histórico.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Alimenta os alertas por e-mail e o resumo de entrega; a resposta rápida do alerta está em Alerta de providência.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como cadastro uma providência?
  **R:** Em Providências, use Nova providência (ela nasce com grau Médio provisório) e depois Editar para informar responsável, prazo e evidência. Se a tabela estiver vazia, o Administrador pode usar Cadastrar checklist inicial.

**9. Limitações e o que ainda não está liberado**
- A tela mostra formulários que o banco pode recusar ao salvar, conforme o perfil; nesse caso peça ao Administrador.
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Providências" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/providencias/page.tsx`, `docs/manual-referencia-acc.md (4.17)`, `docs/alertas-recorrentes-e-providencias.md`

### 3.2 Financeiro

- **Tipo:** menu
- **Rota:** `/[projectId]/financeiro`
- **Situação:** Disponível
- **Quem vê:** Somente quem tem acesso financeiro à obra

**1. Nome e finalidade.** Financeiro: Painel financeiro alimentado só pela aba Financeiro da planilha do relatório semanal: previsto, realizado, acumulados, medido, faturado, recebido, custo e receita.

**2. Funcionalidades**
- Escolher semana, versão e período.
- Cards e gráficos de série.
- Alterações desde o relatório anterior.
- Tabela detalhada e abertura do relatório de origem.

**3. Informações e indicadores exibidos**
- Semana, data de corte, arquivo de origem, status e versão do envio.

**4. Passo a passo**
1. Abra Financeiro (só aparece para quem tem acesso).
2. Ajuste Semana, Versão e período e clique em Aplicar.
3. Leia os cards e a tabela; ABRIR RELATÓRIO DE ORIGEM leva ao e-mail de origem em Documentos.

**5. Regras e significados de status**
- Nada é estimado quando a fonte não existe: o campo fica sem dado.

**6. Permissões.** Só quem passa na regra de acesso financeiro da obra (Administrador ou Gerente, ou áreas Diretoria e Financeiro); a rota e o banco repetem a regra.

**7. Integração com outros módulos**
- Relatório semanal recebido por e-mail e Documentos.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Por que não vejo a aba Financeiro?
  **R:** Financeiro é restrita: aparece só para quem tem acesso financeiro à obra (Administrador ou Gerente, ou áreas Diretoria e Financeiro) e depende de o relatório semanal estar habilitado. Se você precisa dela, peça ao Administrador.

**9. Limitações e o que ainda não está liberado**
- Depende de o relatório semanal estar habilitado; tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela quando tem acesso financeiro à obra.
- Gerente (Gestor): Vê a tela quando é Gerente ou da área Diretoria/Financeiro.
- Colaborador: Vê a tela só se for da área Diretoria ou Financeiro.
- Leitura: Vê a tela só se for da área Diretoria ou Financeiro.

**Capturas de tela:** Tela "Financeiro" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/financeiro/page.tsx`, `apps/web/lib/ui/nav-items.ts`, `docs/manual-referencia-acc.md (4.24)`

## 4. Jurídico e contratos

Documentos do contrato, cláusulas, eventos com implicação contratual e o Expert Jurídico.

### 4.1 Jurídico

- **Tipo:** menu
- **Rota:** `/[projectId]/juridico` · relacionadas: `/[projectId]/juridico/consulta/[consultationId]`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Jurídico: Espaço jurídico da obra: reúne contrato-base, anexos e aditivos e leva à consulta ao Expert Jurídico. Antes da contratação, o mesmo espaço permite carregar a minuta e consultar os especialistas.

**2. Funcionalidades**
- Escolher o tipo documental e enviar arquivos.
- Consultar o especialista jurídico e abrir uma consulta já feita.
- Acompanhar o processamento dos documentos.

**3. Informações e indicadores exibidos**
- Situação de processamento de cada documento (Processando, Pronto).

**4. Passo a passo**
1. Abra Jurídico.
2. Envie os documentos com o tipo documental certo.
3. Aguarde o status Pronto.
4. Escreva a pergunta e use Consultar; a resposta é do especialista e exige revisão humana.

**5. Regras e significados de status**
- A consulta só é liberada com conteúdo legível.
- Toda análise de IA é apoio à decisão e exige validação humana: quem interpreta o contrato é o especialista, não a AXIA.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Usa Documentos e os Experts IA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como uso a aba Jurídico?
  **R:** Em Jurídico você envia os documentos contratuais e abre a consulta ao Expert Jurídico. A AXIA só explica o uso da tela: ela não lê nem interpreta contratos; a análise vem do especialista e exige revisão humana.

**9. Limitações e o que ainda não está liberado**
- A AXIA não interpreta contratos, cláusulas ou documentos; use o especialista.
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Jurídico" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/juridico/page.tsx`, `docs/manual-referencia-acc.md (4.20)`, `apps/web/lib/assistant/guards.ts (encaminhamento ao especialista)`

### 4.2 Jurídico IA (antes da contratação)

- **Tipo:** pagina
- **Rota:** `/juridico`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Jurídico IA (antes da contratação): Entrada global para criar uma análise de minuta antes da contratação, fora de uma obra específica, e carregar os documentos dela.

**2. Funcionalidades**
- Criar a análise informando o nome da oportunidade e o cliente.
- Carregar documentos e abrir a análise.

**3. Informações e indicadores exibidos**
- Lista das análises já criadas.

**4. Passo a passo**
1. Em Selecione um projeto, clique no cartão Jurídico IA.
2. Informe Nome da oportunidade ou concorrência e Cliente.
3. Clique em Criar e anexar documentos e envie a minuta.
4. Abra a análise para consultar os especialistas.

**5. Regras e significados de status**
- Nenhuma recomendação é enviada ou aceita automaticamente.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Abre o espaço Jurídico da análise.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como analiso uma minuta antes de contratar?
  **R:** Pelo cartão Jurídico IA em Selecione um projeto: crie a análise com o nome da oportunidade e o cliente, envie a minuta e abra a análise. A AXIA só orienta o caminho; a análise é do especialista.

**9. Limitações e o que ainda não está liberado**
- A AXIA não analisa a minuta.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Jurídico IA (antes da contratação)" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/juridico/page.tsx`, `docs/manual-referencia-acc.md (4.20)`

### 4.3 Revisão Contratual

- **Tipo:** pagina
- **Rota:** `/[projectId]/revisao-contratual`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Revisão Contratual: Tela de revisão contratual que saiu da barra lateral: o Expert Jurídico da página inicial é o ponto único de análise. A rota e o histórico continuam existindo.

**2. Funcionalidades**
- Abrir a revisão contratual existente por link.

**3. Informações e indicadores exibidos**
- Conteúdo da revisão já registrada.

**4. Passo a passo**
1. Chegue pelo link ou pelo histórico; não há item de menu.
2. Para análise nova, use o Expert Jurídico.

**5. Regras e significados de status**
- Nada foi apagado: só a entrada de navegação saiu.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Documentos e Expert Jurídico.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde fica a Análise Contratual?
  **R:** Ela saiu do menu lateral: a análise de contratos é feita pelo Expert Jurídico. A tela Revisão Contratual continua existindo e abre por link, mas a AXIA não analisa contratos.

**9. Limitações e o que ainda não está liberado**
- Fora do menu; a AXIA não interpreta o conteúdo.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Revisão Contratual" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/revisao-contratual/page.tsx`, `apps/web/lib/ui/nav-items.ts`

### 4.4 Revisão de Cláusulas

- **Tipo:** pagina
- **Rota:** `/[projectId]/revisao-clausulas`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Revisão de Cláusulas: Fila de candidatos a cláusula detectados nos documentos, para revisão humana: a cláusula definitiva só existe depois da aprovação humana, conferida com a página original.

**2. Funcionalidades**
- Escolher um candidato da fila.
- Corrigir o texto e Aprovar cláusula.
- Rejeitar candidato com justificativa.

**3. Informações e indicadores exibidos**
- Totais, candidatos e paginação.

**4. Passo a passo**
1. Abra a tela por link (ela não está no menu).
2. Escolha um candidato e confira número, título, texto e página de origem.
3. Aprove ou rejeite; a rejeição exige justificativa.

**5. Regras e significados de status**
- A detecção só sugere; toda decisão fica na auditoria.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Documentos e Auditoria.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como aprovo uma cláusula detectada?
  **R:** Abra a Revisão de Cláusulas, escolha o candidato, confira o texto com a página original e use Aprovar cláusula; para recusar, Rejeitar candidato exige justificativa. A detecção só sugere e a decisão é sua.

**9. Limitações e o que ainda não está liberado**
- Fora do menu; a tela pode mostrar formulários que o banco recusa conforme o perfil.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Revisão de Cláusulas" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/revisao-clausulas/page.tsx`, `docs/manual-referencia-acc.md (4.22)`

### 4.5 Documentos

- **Tipo:** menu
- **Rota:** `/[projectId]/documentos`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Documentos: Repositório de documentos e evidências da obra (contratos, aditivos, propostas, cronogramas, projetos, notificações), preservando origem, versão, processamento e rastreabilidade.

**2. Funcionalidades**
- Selecionar arquivos (vários de uma vez, até 50 MB cada).
- Upload individual (avançado).
- Adicionar nova versão a um documento.
- Vincular anexos ao contrato.

**3. Informações e indicadores exibidos**
- Situação: Processado, Aguardando processamento ou Revisão humana necessária.
- Documentos agrupados por contrato-base e aditivo.

**4. Passo a passo**
1. Abra Documentos.
2. Use Selecionar arquivos e defina o tipo documental de cada arquivo.
3. Clique em Iniciar envio e acompanhe cada arquivo.
4. Se o arquivo parecer nova versão ou houver conflito de tipo, escolha entre os botões apresentados.

**5. Regras e significados de status**
- Nenhum tipo é atribuído automaticamente, exceto cronograma .mpp.
- Para vincular um anexo ao contrato, informe o fundamento (mínimo de 20 caracteres).
- Documentos originais são preservados; cada envio gera registro.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Alimenta Timeline, Jurídico, Eventos e o processamento por IA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como envio documentos?
  **R:** Em Documentos use Selecionar arquivos (vários de uma vez, até 50 MB cada), defina o tipo de cada um e clique em Iniciar envio. Cada documento mostra a situação: Processado, Aguardando processamento ou Revisão humana necessária.

**9. Limitações e o que ainda não está liberado**
- O envio de documentos é feito por quem tem permissão; sem ela, o botão não aparece.
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Documentos" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/documentos/page.tsx`, `docs/manual-referencia-acc.md (4.23)`

### 4.6 Versão do documento

- **Tipo:** pagina (dentro de Documentos)
- **Rota:** `/[projectId]/documentos/versoes/[documentVersionId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Versão do documento: Detalhe de uma versão de documento: abre-se a partir do cartão do documento em Documentos.

**2. Funcionalidades**
- Ver os dados e o processamento da versão.

**3. Informações e indicadores exibidos**
- Situação do processamento e origem.

**4. Passo a passo**
1. Em Documentos, abra o cartão do documento.
2. Clique na versão desejada.

**5. Regras e significados de status**
- A versão original é preservada; nova versão não apaga a anterior.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Documentos e Timeline.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde vejo as versões de um documento?
  **R:** Em Documentos, no cartão do documento: cada versão tem a sua tela de detalhe, e a nova versão não apaga a anterior.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Versão do documento" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/documentos/versoes/[documentVersionId]/page.tsx`

### 4.7 E-mail arquivado e anexos

- **Tipo:** pagina (dentro de Documentos)
- **Rota:** `/[projectId]/documentos/emails/[emailId]` · relacionadas: `/[projectId]/documentos/emails/[emailId]/anexos/[attachmentId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** E-mail arquivado e anexos: Detalhe de um e-mail arquivado na obra e de cada anexo dele; abre-se por link a partir de Documentos, Timeline ou Financeiro (relatório de origem).

**2. Funcionalidades**
- Ver o e-mail e seus anexos.
- Abrir o cronograma estruturado, quando o anexo for um cronograma.

**3. Informações e indicadores exibidos**
- Remetente, assunto e anexos do e-mail arquivado.

**4. Passo a passo**
1. Chegue pelo link de origem.
2. Abra o anexo desejado.

**5. Regras e significados de status**
- O e-mail e o anexo são evidência original: a tela só consulta.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Documentos, Timeline, Financeiro.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde vejo o e-mail de origem de um documento?
  **R:** Pelo link de origem em Documentos, Timeline ou Financeiro: a tela do e-mail mostra a mensagem e os anexos. É só consulta; o original não é alterado.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "E-mail arquivado e anexos" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/documentos/emails/[emailId]/page.tsx`

### 4.8 Adicionais (redirecionamento)

- **Tipo:** pagina
- **Rota:** `/[projectId]/adicionais` · relacionadas: `/[projectId]/adicionais/[proposalId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Adicionais (redirecionamento): Não há tela própria de adicionais: as duas rotas apenas levam para Documentos, onde os serviços adicionais aprovados entram por upload manual do Administrador.

**2. Funcionalidades**
- Redirecionamento para Documentos.

**3. Informações e indicadores exibidos**
- Nenhum: a tela não exibe conteúdo.

**4. Passo a passo**
1. Abra Documentos e envie o documento do serviço adicional.

**5. Regras e significados de status**
- Serviços adicionais aprovados entram por upload manual do Administrador na área de Documentos.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Documentos.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde cadastro serviços adicionais?
  **R:** Não há tela própria: serviços adicionais aprovados entram por upload manual do Administrador em Documentos.

**9. Limitações e o que ainda não está liberado**
- Sem tela própria.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Adicionais (redirecionamento)" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/adicionais/page.tsx`, `apps/web/lib/ui/help/legacy.ts (integracoes)`

### 4.9 Eventos

- **Tipo:** menu
- **Rota:** `/[projectId]/ledger`
- **Situação:** Disponível
- **Quem vê:** Somente Administrador da obra

**1. Nome e finalidade.** Eventos: Lista dos eventos relevantes registrados na obra, do mais recente ao mais antigo, com origem, evidência, impacto e classificação.

**2. Funcionalidades**
- Abrir o detalhe do evento pela data ou título.

**3. Informações e indicadores exibidos**
- Colunas de data, título, status, severidade e Achado IA (sugestão sujeita a revisão humana).

**4. Passo a passo**
1. Abra Eventos (menu do Administrador).
2. Clique na data ou no título para abrir o detalhe.

**5. Regras e significados de status**
- Status: Novo, Em Análise, Confrontado, Resolvido. Severidade: Baixo, Médio, Alto, Crítico.
- Não há botão para criar evento nesta tela: eles entram por ingestão ou por outros fluxos.

**6. Permissões.** Só o Administrador da obra vê o item no menu e abre a tela; os demais perfis não a veem (a rota também é protegida, não só o menu).

**7. Integração com outros módulos**
- Timeline, alertas por e-mail e Dashboard.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que é um evento?
  **R:** É o registro de algo da obra com possível implicação contratual, com origem, evidência e classificação. A coluna Achado IA é uma sugestão da IA sujeita a revisão humana.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.
- O título da aba na guia do navegador pode aparecer como Event Ledger.

**10. Diferenças entre perfis**
- Administrador: Vê o item no menu, abre a tela e executa as ações.
- Gerente (Gestor): Não vê o item no menu e não abre a tela.
- Colaborador: Não vê o item no menu e não abre a tela.
- Leitura: Não vê o item no menu e não abre a tela.

**Capturas de tela:** Tela "Eventos" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/ledger/page.tsx`, `docs/manual-referencia-acc.md (4.4)`

### 4.10 Detalhe do evento

- **Tipo:** pagina (dentro de Eventos)
- **Rota:** `/[projectId]/ledger/[eventId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Detalhe do evento: Página de um evento: resumo, Achado da IA, evidência original, confronto com cláusulas, anotações e envio de alerta por e-mail (ações do Administrador).

**2. Funcionalidades**
- Ler evidência e confronto.
- Registrar justificativa na revisão humana.
- Adicionar anotação.
- Enviar alerta por e-mail (Administrador).

**3. Informações e indicadores exibidos**
- Selo de severidade, tipo do achado e status de cada candidato de confronto.

**4. Passo a passo**
1. Abra o evento em Eventos ou pelo botão do e-mail de alerta.
2. Leia o resumo e a evidência original.
3. Na revisão humana, escreva a justificativa e aprove ou rejeite.
4. Para alertar, escolha o destinatário e use Enviar Alerta.

**5. Regras e significados de status**
- Aprovar ou rejeitar exige justificativa (mínimo de 20 caracteres).
- O envio do alerta é manual e nunca automático.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Alertas por e-mail, Consultar IA e os Experts IA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Quem pode enviar o alerta de um evento?
  **R:** O envio é manual e feito pelo Administrador, na página do evento, escolhendo o destinatário e usando Enviar Alerta. Nada é enviado automaticamente por abrir a página.

**9. Limitações e o que ainda não está liberado**
- A análise de IA é sugestão; a decisão é humana. A AXIA não analisa o evento.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Detalhe do evento" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/ledger/[eventId]/page.tsx`, `docs/manual-referencia-acc.md (4.5)`

## 5. SSMA, ocorrências, ações e uso offline

ESG/SSMA no ACC, registros de campo, avaliação e o app de campo que funciona sem internet.

### 5.1 ESG/SSMA

- **Tipo:** menu
- **Rota:** `/[projectId]/esg`
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** ESG/SSMA: Acompanha as obrigações ESG e SSMA da obra (ambiental, social, segurança e saúde) e dá acesso ao app de campo e aos registros de campo.

**2. Funcionalidades**
- Minhas pendências.
- Visão gerencial com totais e filtros.
- Checklist do projeto (Administrador).
- Botões Registros de campo e Abrir aplicativo.
- Pergunta ao Diretor de ESG IA.

**3. Informações e indicadores exibidos**
- Totais: Total, Cumpridas, Parciais, Pendentes, Não cumpridas e Risco alto/crítico.

**4. Passo a passo**
1. Abra ESG/SSMA.
2. Em Minhas pendências, veja as obrigações sem comprovação.
3. Use a Visão gerencial para filtrar por status, categoria, risco e responsável.
4. Para o campo, use Registros de campo ou Abrir aplicativo.

**5. Regras e significados de status**
- Uma obrigação só é considerada comprovada com evidência anexada.
- O especialista de ESG responde perguntas técnicas; a AXIA só orienta o uso.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Registros de campo SSMA, Google Drive (somente ESG/SSMA), Dashboard e Quatro Pilares.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como uso a aba ESG/SSMA?
  **R:** Em ESG/SSMA você vê Minhas pendências, a Visão gerencial das obrigações e os botões para os Registros de campo e para o aplicativo de campo. Perguntas técnicas de SSMA são do especialista de ESG, não da AXIA.

**9. Limitações e o que ainda não está liberado**
- A tela abre, mas os indicadores ainda estão em validação final de uso.
- A AXIA não analisa ocorrências nem normas.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "ESG/SSMA" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/esg/page.tsx`, `docs/manual-referencia-acc.md (4.27)`, `docs/homologacao-autenticada-roteiro.md`

### 5.2 Registros de campo SSMA

- **Tipo:** pagina (dentro de ESG/SSMA)
- **Rota:** `/[projectId]/ssma-registros`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Registros de campo SSMA: Lista, para consulta no ACC, os registros feitos no app de campo (ocorrências e inspeções), com ação corretiva, responsável, prazo e fotos.

**2. Funcionalidades**
- Ver totais e tabela.
- Abrir fotos por link.
- Abrir o app de campo.
- Cartão Instalar no celular com QR Code.

**3. Informações e indicadores exibidos**
- Registros, Ações em aberto, Ações em atraso e Críticos em aberto.

**4. Passo a passo**
1. Em ESG/SSMA clique em Registros de campo.
2. Leia os totais e percorra a tabela.
3. Para registrar algo, use o app de campo.

**5. Regras e significados de status**
- O QR Code leva só ao endereço: quem escaneia ainda entra com a própria conta.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- App de campo SSMA e ESG/SSMA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde vejo os registros feitos no campo?
  **R:** Em ESG/SSMA, no botão Registros de campo: a tela mostra os totais e a tabela com ação corretiva, responsável, prazo e fotos. Para registrar algo novo, use o app de campo.

**9. Limitações e o que ainda não está liberado**
- Registro e concorrência validados; a tela em si ainda está em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Registros de campo SSMA" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/ssma-registros/page.tsx`, `docs/manual-referencia-acc.md (4.28)`

### 5.3 Avaliação do técnico SSMA

- **Tipo:** pagina (dentro de ESG/SSMA)
- **Rota:** `/[projectId]/ssma-avaliacao`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Avaliação do técnico SSMA: Ficha mensal e acumulada de avaliação do técnico SSMA. A própria tela se identifica como PRÉVIA, com critérios em revisão.

**2. Funcionalidades**
- Consultar a ficha mensal e a acumulada.

**3. Informações e indicadores exibidos**
- Ficha mensal e ficha acumulada.

**4. Passo a passo**
1. Abra a tela por link (ela não está no menu).
2. Leia a ficha mensal e a acumulada.

**5. Regras e significados de status**
- Os critérios estão em revisão: o resultado não deve ser tratado como definitivo.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Registros de campo SSMA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** A avaliação do técnico SSMA já vale?
  **R:** Ainda não como definitiva: a própria tela se identifica como PRÉVIA, com critérios em revisão.

**9. Limitações e o que ainda não está liberado**
- PRÉVIA, critérios em revisão.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Avaliação do técnico SSMA" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/ssma-avaliacao/page.tsx`

### 5.4 App de campo SSMA

- **Tipo:** pagina
- **Rota:** `/ssma` · relacionadas: `/ssma/[projectId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** App de campo SSMA: Aplicativo de campo que se instala direto do navegador (sem loja): registra ocorrências e inspeções com fotos, responsável e prazo, mesmo sem sinal.

**2. Funcionalidades**
- Escolher a obra.
- Registrar ocorrência ou inspeção.
- Sincronizar.
- Registrar andamento e concluir ação corretiva (online).
- Consultar IA do registro (somente leitura).

**3. Informações e indicadores exibidos**
- Estados do registro: Salvo no aparelho, Aguardando envio, Sincronizado, Falha no envio.

**4. Passo a passo**
1. Abra o app (QR Code ou ícone instalado) e escolha a obra.
2. Toque em Registrar ocorrência / inspeção e preencha os campos obrigatórios.
3. Anexe fotos JPG ou PNG (até 15 MB e 20 por registro).
4. Confira a aba Sincronização.

**5. Regras e significados de status**
- Concluir ação exige foto de evidência; um gestor pode concluir com justificativa de 10 caracteres ou mais.
- Abra o app uma vez com internet antes de usar sem sinal.
- HEIC não é aceito.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Registros de campo SSMA e Google Drive (fotos).

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como registro uma ocorrência no campo?
  **R:** No app de campo, toque em Registrar ocorrência / inspeção, preencha categoria, descrição, local, data e hora e risco, anexe fotos e salve. Sem sinal, o registro fica salvo no aparelho e é enviado quando a internet voltar.

**9. Limitações e o que ainda não está liberado**
- A instalação ainda não foi validada em iPhone e Android reais.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "App de campo SSMA" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/ssma/page.tsx`, `apps/web/app/ssma/[projectId]/page.tsx`, `docs/manual-referencia-acc.md (4.29)`

### 5.5 Modo offline do app SSMA

- **Tipo:** pagina (dentro de App de campo SSMA)
- **Rota:** `/ssma/offline`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Modo offline do app SSMA: Página que o app mostra quando não há conexão: o que funciona sem internet e o que precisa dela.

**2. Funcionalidades**
- Orientar o uso sem sinal.

**3. Informações e indicadores exibidos**
- Aviso de falta de conexão.

**4. Passo a passo**
1. Se aparecer esta página, volte ao app e continue registrando; o envio é automático quando o sinal voltar.

**5. Regras e significados de status**
- Sem sinal ainda registra ocorrências e inspeções, com fotos. Entrar, ver a lista da obra, registrar andamento, concluir ações e consultar IA exigem internet.
- O envio não duplica registros.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- App de campo SSMA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que funciona sem internet no app?
  **R:** Registrar ocorrências e inspeções (com fotos) funciona sem sinal e fica salvo no aparelho. Entrar, ver a lista da obra, registrar andamento, concluir ações e consultar a IA precisam de internet. O envio é automático quando o sinal volta.

**9. Limitações e o que ainda não está liberado**
- O iOS pode apagar dados de apps pouco usados: não deixe registros pendentes por muito tempo.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Modo offline do app SSMA" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/ssma/offline/page.tsx`

## 6. Qualidade e RNC

Módulo de Qualidade: RNC, evidências, ações (CAPA), eficácia e as abas ainda não liberadas.

### 6.1 Qualidade

- **Tipo:** menu
- **Rota:** `/[projectId]/qualidade` · relacionadas: `/[projectId]/qualidade/rnc/[ncrId]`
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Qualidade: Módulo de Qualidade da obra, organizado em abas: Dashboard, RNC, Evidências, Inspeções, Reclamações, Ensaios e laudos, Requisitos, Ações (CAPA), Eficácia, Recorrências, Custos de não qualidade e Auditoria.

**2. Funcionalidades**
- Trocar de aba pela barra Áreas da Qualidade.
- Abrir o detalhe de uma RNC pelo código.

**3. Informações e indicadores exibidos**
- Cada aba mostra os seus registros; sem dado, aparece SEM DADOS.

**4. Passo a passo**
1. Abra Qualidade no menu.
2. Escolha a aba em Áreas da Qualidade.
3. Em RNC, clique no código para abrir o detalhe.

**5. Regras e significados de status**
- Situação por aba: veja cada aba. Seis abas ainda não estão liberadas (Inspeções, Reclamações, Ensaios e laudos, Requisitos, Recorrências e Custos de não qualidade).
- Evidência, fato, inferência e recomendação são mantidos separados.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Garantias, Seguros e Quatro Pilares.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Quais abas da Qualidade estão disponíveis?
  **R:** Estão operacionais o Dashboard, a RNC, as Evidências, as Ações (CAPA), a Eficácia e a Auditoria (algumas ainda em validação final de uso). Inspeções, Reclamações, Ensaios e laudos, Requisitos, Recorrências e Custos de não qualidade ainda não estão liberadas.

**9. Limitações e o que ainda não está liberado**
- Só parte do módulo está validada em uso; seis abas ainda não estão liberadas.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Qualidade" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/qualidade/page.tsx`, `apps/web/lib/quality/ui-model.ts`, `apps/web/lib/ui/help/manifests/qualidade.ts`

### 6.2 Dashboard

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Dashboard: Indicadores reais da Qualidade: RNC abertas e críticas, reaberturas, tempo até o encerramento, ações vencidas, eficácia e RNC por estado.

**2. Funcionalidades**
- Leitura dos indicadores.

**3. Informações e indicadores exibidos**
- RNC abertas e críticas, reaberturas, tempo de encerramento, ações vencidas, eficácia.

**4. Passo a passo**
1. Abra Qualidade; o Dashboard é a aba inicial.

**5. Regras e significados de status**
- Sem dado, mostra SEM DADOS.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- RNC, CAPA e Eficácia.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que mostra o Dashboard da Qualidade?
  **R:** Indicadores da Qualidade: RNC abertas e críticas, reaberturas, tempo até o encerramento, ações vencidas, eficácia e RNC por estado. Sem dado, mostra SEM DADOS.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Dashboard" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/quality/ui-model.ts`, `apps/web/lib/ui/help/modules/qualidade.ts`

### 6.3 RNC

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** RNC: Lista dos relatórios de não conformidade com filtros (busca, estado, criticidade, origem) e formulário de nova RNC; o detalhe abre pelo código.

**2. Funcionalidades**
- Filtrar a lista.
- Criar nova RNC.
- Abrir o detalhe e fazer a transição de estado.

**3. Informações e indicadores exibidos**
- Estado, criticidade e origem de cada RNC.

**4. Passo a passo**
1. Abra a aba RNC.
2. Filtre ou use o formulário de nova RNC.
3. Clique no código para abrir o detalhe e ver o Resumo e a Transição de estado.

**5. Regras e significados de status**
- As transições de estado seguem o catálogo do módulo e ficam na auditoria.
- O encerramento exige a última verificação de eficácia EFICAZ, com evidência.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Evidências, CAPA, Eficácia e Auditoria.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como abro uma RNC?
  **R:** Na aba RNC use o formulário de nova RNC e, depois, clique no código para abrir o detalhe. As transições de estado ficam registradas na auditoria; algumas operações da RNC ainda não foram comprovadas em tela e dependem de decisão pendente.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "RNC" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/qualidade/rnc/[ncrId]/page.tsx`, `apps/web/lib/quality/ui-model.ts`

### 6.4 Evidências

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Disponível
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Evidências: Todas as evidências do projeto, com a fonte original, a classificação (SUSPEITA, INDÍCIO, NC COMPROVADA, RISCO POTENCIAL) e o tipo (fato, inferência ou recomendação).

**2. Funcionalidades**
- Consultar as evidências.

**3. Informações e indicadores exibidos**
- Classificação e tipo de cada evidência.

**4. Passo a passo**
1. Abra a aba Evidências e leia a fonte e a classificação.

**5. Regras e significados de status**
- A fonte original é preservada.
- Fato, inferência e recomendação são rotulados à parte.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- RNC.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que são as Evidências da Qualidade?
  **R:** São os registros de prova do módulo, cada um com a fonte original, a classificação (SUSPEITA, INDÍCIO, NC COMPROVADA ou RISCO POTENCIAL) e o tipo: fato, inferência ou recomendação.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Evidências" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/ui/help/modules/qualidade.ts`

### 6.5 Inspeções

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Ainda não liberada
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Inspeções: Registro de inspeções de qualidade com resultado, local, datas e RNC vinculada. Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**2. Funcionalidades**
- Nenhuma operação de registro está liberada nesta versão.

**3. Informações e indicadores exibidos**
- A aba pode abrir sem registros: sem dado, aparece SEM DADOS ou lista vazia.

**4. Passo a passo**
1. Não há passo a passo: a aba ainda não está liberada.

**5. Regras e significados de status**
- Situação: ainda não liberada.
- Nenhum valor é estimado quando não há registro.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Quando liberada, alimenta Quatro Pilares e a Auditoria do módulo.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Posso usar a aba Inspeções?
  **R:** Não por enquanto: a aba Inspeções ainda não está liberada e o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**9. Limitações e o que ainda não está liberado**
- Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.
- A aba ainda não passou pela validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Inspeções" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/quality/ui-model.ts`, `docs/homologacao-autenticada-roteiro.md`

### 6.6 Reclamações

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Ainda não liberada
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Reclamações: Registro de reclamações de clientes com canal, data e fonte original. Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**2. Funcionalidades**
- Nenhuma operação de registro está liberada nesta versão.

**3. Informações e indicadores exibidos**
- A aba pode abrir sem registros: sem dado, aparece SEM DADOS ou lista vazia.

**4. Passo a passo**
1. Não há passo a passo: a aba ainda não está liberada.

**5. Regras e significados de status**
- Situação: ainda não liberada.
- Nenhum valor é estimado quando não há registro.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Quando liberada, alimenta Quatro Pilares e a Auditoria do módulo.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Posso usar a aba Reclamações?
  **R:** Não por enquanto: a aba Reclamações ainda não está liberada e o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**9. Limitações e o que ainda não está liberado**
- Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.
- A aba ainda não passou pela validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Reclamações" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/quality/ui-model.ts`, `docs/homologacao-autenticada-roteiro.md`

### 6.7 Ensaios e laudos

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Ainda não liberada
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Ensaios e laudos: Registro de ensaios e laudos técnicos. Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**2. Funcionalidades**
- Nenhuma operação de registro está liberada nesta versão.

**3. Informações e indicadores exibidos**
- A aba pode abrir sem registros: sem dado, aparece SEM DADOS ou lista vazia.

**4. Passo a passo**
1. Não há passo a passo: a aba ainda não está liberada.

**5. Regras e significados de status**
- Situação: ainda não liberada.
- Nenhum valor é estimado quando não há registro.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Quando liberada, alimenta Quatro Pilares e a Auditoria do módulo.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Posso usar a aba Ensaios e laudos?
  **R:** Não por enquanto: a aba Ensaios e laudos ainda não está liberada e o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**9. Limitações e o que ainda não está liberado**
- Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.
- A aba ainda não passou pela validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Ensaios e laudos" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/quality/ui-model.ts`, `docs/homologacao-autenticada-roteiro.md`

### 6.8 Requisitos

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Ainda não liberada
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Requisitos: Cadastro de requisitos técnicos do projeto, cada um com fonte. Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**2. Funcionalidades**
- Nenhuma operação de registro está liberada nesta versão.

**3. Informações e indicadores exibidos**
- A aba pode abrir sem registros: sem dado, aparece SEM DADOS ou lista vazia.

**4. Passo a passo**
1. Não há passo a passo: a aba ainda não está liberada.

**5. Regras e significados de status**
- Situação: ainda não liberada.
- Nenhum valor é estimado quando não há registro.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Quando liberada, alimenta Quatro Pilares e a Auditoria do módulo.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Posso usar a aba Requisitos?
  **R:** Não por enquanto: a aba Requisitos ainda não está liberada e o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**9. Limitações e o que ainda não está liberado**
- Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.
- A aba ainda não passou pela validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Requisitos" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/quality/ui-model.ts`, `docs/homologacao-autenticada-roteiro.md`

### 6.9 Ações (CAPA)

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Disponível
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Ações (CAPA): Visão de todas as ações corretivas, preventivas e de contenção do projeto, com prazo e status. As ações são criadas e atualizadas dentro de cada RNC.

**2. Funcionalidades**
- Consultar as ações.

**3. Informações e indicadores exibidos**
- Prazo e status de cada ação.

**4. Passo a passo**
1. Abra a aba Ações (CAPA).
2. Para criar ou atualizar uma ação, abra a RNC correspondente.

**5. Regras e significados de status**
- Ação vencida entra nos indicadores do Dashboard da Qualidade.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- RNC e Eficácia.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde crio uma ação corretiva (CAPA)?
  **R:** A aba Ações (CAPA) só lista as ações; elas são criadas e atualizadas dentro de cada RNC. Abra a RNC pelo código e registre a ação por lá.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso. A atualização de status da CAPA depende de decisão pendente.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Ações (CAPA)" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/ui/help/modules/qualidade.ts`

### 6.10 Eficácia

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Disponível
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Eficácia: Verificações de eficácia registradas (eficaz, ineficaz ou parcial). O encerramento de uma RNC exige a última verificação EFICAZ, com evidência, posterior ao último ciclo de correção.

**2. Funcionalidades**
- Consultar as verificações.

**3. Informações e indicadores exibidos**
- Resultado de cada verificação.

**4. Passo a passo**
1. Abra a aba Eficácia.
2. Registre verificações dentro da RNC.

**5. Regras e significados de status**
- Sem verificação EFICAZ com evidência, a RNC não encerra.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- RNC e CAPA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que é a Eficácia?
  **R:** É o registro da verificação de que a ação resolveu o problema (eficaz, ineficaz ou parcial). Uma RNC só encerra com a última verificação EFICAZ, com evidência.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Eficácia" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/ui/help/modules/qualidade.ts`

### 6.11 Recorrências

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Ainda não liberada
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Recorrências: Relações de recorrência entre RNC, cada uma com fundamento escrito. Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**2. Funcionalidades**
- Nenhuma operação de registro está liberada nesta versão.

**3. Informações e indicadores exibidos**
- A aba pode abrir sem registros: sem dado, aparece SEM DADOS ou lista vazia.

**4. Passo a passo**
1. Não há passo a passo: a aba ainda não está liberada.

**5. Regras e significados de status**
- Situação: ainda não liberada.
- Nenhum valor é estimado quando não há registro.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Quando liberada, alimenta Quatro Pilares e a Auditoria do módulo.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Posso usar a aba Recorrências?
  **R:** Não por enquanto: a aba Recorrências ainda não está liberada e o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**9. Limitações e o que ainda não está liberado**
- Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.
- A aba ainda não passou pela validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Recorrências" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/quality/ui-model.ts`, `docs/homologacao-autenticada-roteiro.md`

### 6.12 Custos de não qualidade

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Ainda não liberada
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Custos de não qualidade: Custos ligados às RNC (retrabalho, material, mão de obra, garantia, perda de prazo). Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**2. Funcionalidades**
- Nenhuma operação de registro está liberada nesta versão.

**3. Informações e indicadores exibidos**
- A aba pode abrir sem registros: sem dado, aparece SEM DADOS ou lista vazia.

**4. Passo a passo**
1. Não há passo a passo: a aba ainda não está liberada.

**5. Regras e significados de status**
- Situação: ainda não liberada.
- Nenhum valor é estimado quando não há registro.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Quando liberada, alimenta Quatro Pilares e a Auditoria do módulo.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Posso usar a aba Custos de não qualidade?
  **R:** Não por enquanto: a aba Custos de não qualidade ainda não está liberada e o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**9. Limitações e o que ainda não está liberado**
- Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.
- A aba ainda não passou pela validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Custos de não qualidade" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/quality/ui-model.ts`, `docs/homologacao-autenticada-roteiro.md`

### 6.13 Auditoria

- **Tipo:** aba (dentro de Qualidade)
- **Situação:** Disponível
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Auditoria: Linha do tempo cronológica dos eventos de estado das RNC e dos registros de auditoria do módulo. Somente leitura.

**2. Funcionalidades**
- Consultar a linha do tempo.

**3. Informações e indicadores exibidos**
- Eventos de estado e registros de auditoria.

**4. Passo a passo**
1. Abra a aba Auditoria dentro de Qualidade.

**5. Regras e significados de status**
- Os registros só são acrescentados, nunca editados ou apagados.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- RNC e Auditoria geral.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde vejo o histórico das RNC?
  **R:** Na aba Auditoria da Qualidade: a linha do tempo dos eventos de estado das RNC e dos registros de auditoria do módulo, só para leitura.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Auditoria" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/ui/help/modules/qualidade.ts`

## 7. Seguros e Garantias

Apólices, endossos, adiantamentos, sinistros, minutas e canais oficiais; casos de garantia técnica.

### 7.1 Garantias

- **Tipo:** menu
- **Rota:** `/[projectId]/garantias` · relacionadas: `/[projectId]/garantias/[caseId]`
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Garantias: Garantias e Assistência Técnica pós-entrega: casos de garantia, ciclo de estados, comprovantes de manutenção e consulta de cobertura.

**2. Funcionalidades**
- Lista de casos.
- Criar um caso com origem.
- Abrir o detalhe do caso.

**3. Informações e indicadores exibidos**
- Estado de cada caso.

**4. Passo a passo**
1. Abra Garantias.
2. Veja a lista de casos.
3. Clique em um caso para abrir o detalhe.

**5. Regras e significados de status**
- Alguns passos do detalhe (G-04 a G-10: vistoria, manutenção, reparo, edição, aceite e parecer de cobertura) não foram vistos em tela e dependem de decisão pendente.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Qualidade, Seguros e Quatro Pilares.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Para que serve a aba Garantias?
  **R:** Para acompanhar casos de garantia e assistência técnica pós-entrega: a lista, o ciclo de estados do caso, comprovantes de manutenção e a consulta de cobertura. Parte do detalhe ainda está em validação final de uso.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Garantias" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/garantias/page.tsx`, `apps/web/app/[projectId]/garantias/[caseId]/page.tsx`, `apps/web/lib/ui/help/manifests/garantias.ts`

### 7.2 Seguros

- **Tipo:** menu
- **Rota:** `/[projectId]/seguros`
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Seguros: Módulo de apólices, fianças, endossos, adiantamentos, sinistros, dossiês e minutas da obra, organizado em 12 abas.

**2. Funcionalidades**
- Trocar de aba.
- Consultar e registrar conforme a situação de cada aba.

**3. Informações e indicadores exibidos**
- Cada aba mostra os seus registros.

**4. Passo a passo**
1. Abra Seguros no menu.
2. Escolha a aba: Painel, Apólices, Fianças e garantias, Endossos, Adiantamentos, Sinistros e eventos, Dossiês, Minutas e acionamento, Canais oficiais, Sujeitos e RCC, Referências ou Auditoria.

**5. Regras e significados de status**
- Pedido de endosso não é endosso emitido: só o endosso CONFERIDO com documento emitido tem efeito.
- Três abas ainda não estão liberadas: Fianças e garantias, Dossiês e Sujeitos e RCC.
- O envio real de minutas não existe: o envio é sempre bloqueado.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Garantias, Quatro Pilares e Aprovações externas.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Quais abas de Seguros estão disponíveis?
  **R:** Painel, Apólices, Endossos, Adiantamentos, Sinistros e eventos, Minutas e acionamento, Canais oficiais, Referências e Auditoria estão disponíveis (algumas ainda em validação final de uso). Fianças e garantias, Dossiês e Sujeitos e RCC ainda não estão liberadas.

**9. Limitações e o que ainda não está liberado**
- Parte das abas ainda está em validação final de uso; três ainda não estão liberadas.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Seguros" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/seguros/page.tsx`, `apps/web/lib/insurance-ui/tabs.ts`, `apps/web/lib/ui/help/manifests/seguros.ts`

### 7.3 Painel

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Painel: Indicadores e itens de atenção do módulo: vencimentos, endossos pendentes, sinistros em andamento e garantias insuficientes (horizonte de 30 dias).

**2. Funcionalidades**
- Leitura dos indicadores.

**3. Informações e indicadores exibidos**
- Cinco indicadores e a lista de itens de atenção.

**4. Passo a passo**
1. Abra Seguros; o Painel é a aba inicial.

**5. Regras e significados de status**
- Horizonte de 30 dias para vencimentos.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Apólices, Endossos e Sinistros.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que mostra o Painel de Seguros?
  **R:** Os indicadores do módulo e a lista de itens de atenção: vencimentos, endossos pendentes, sinistros em andamento e garantias insuficientes, olhando 30 dias à frente.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Painel" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`, `apps/web/lib/ui/help/modules/seguros.ts`

### 7.4 Apólices

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Apólices: Apólices das nove modalidades, com partes, cláusulas, versões e vigência.

**2. Funcionalidades**
- Listar apólices.
- Ver partes, cláusulas e histórico de versões ao selecionar uma.

**3. Informações e indicadores exibidos**
- Vigência e versões.

**4. Passo a passo**
1. Abra a aba Apólices e selecione uma apólice.

**5. Regras e significados de status**
- Cada alteração relevante cria uma nova versão com a fotografia do estado anterior.
- Apólice sem fonte é recusada.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Endossos, Sinistros e Dossiês.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como vejo as versões de uma apólice?
  **R:** Na aba Apólices, selecione a apólice: a tela mostra as partes, as cláusulas e o histórico de versões; cada alteração relevante cria uma nova versão.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Apólices" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`, `apps/web/lib/ui/help/modules/seguros.ts`

### 7.5 Fianças e garantias

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Ainda não liberada
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Fianças e garantias: Fianças bancárias, cauções e outras garantias, separadas de seguro. Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**2. Funcionalidades**
- Nenhuma operação de registro está liberada nesta versão.

**3. Informações e indicadores exibidos**
- A aba pode abrir sem registros: sem dado, aparece SEM DADOS ou lista vazia.

**4. Passo a passo**
1. Não há passo a passo: a aba ainda não está liberada.

**5. Regras e significados de status**
- Situação: ainda não liberada.
- Nenhum valor é estimado quando não há registro.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Quando liberada, alimenta Quatro Pilares e a Auditoria do módulo.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Posso usar a aba Fianças e garantias?
  **R:** Não por enquanto: a aba Fianças e garantias ainda não está liberada e o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**9. Limitações e o que ainda não está liberado**
- Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.
- A aba ainda não passou pela validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Fianças e garantias" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`, `docs/homologacao-autenticada-roteiro.md`

### 7.6 Endossos

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Endossos: Pedidos e emissões de endosso: solicitado, em análise, emitido e conferido, com comparação de textos e dupla conferência.

**2. Funcionalidades**
- Acompanhar cada endosso pela máquina de estados.
- Comparar textos.

**3. Informações e indicadores exibidos**
- Estado: SOLICITADO, EM ANÁLISE, EMITIDO, CONFERIDO ou RECUSADO.

**4. Passo a passo**
1. Abra a aba Endossos e escolha o endosso.

**5. Regras e significados de status**
- Pedido de endosso não é endosso emitido: só o CONFERIDO com documento emitido tem efeito de cobertura.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Apólices e Auditoria.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Um pedido de endosso já vale?
  **R:** Não. Pedido de endosso não é endosso emitido: só o endosso CONFERIDO, com documento emitido, tem efeito de cobertura.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Endossos" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`, `apps/web/lib/ui/help/modules/seguros-endossos-dupla.ts`

### 7.7 Adiantamentos

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Disponível
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Adiantamentos: Registro de adiantamentos e das amortizações, comparando o saldo não amortizado com o limite garantido e com o valor máximo da apólice vinculada. Não calcula indenização.

**2. Funcionalidades**
- Consultar adiantamentos e saldos.

**3. Informações e indicadores exibidos**
- Saldo não amortizado.

**4. Passo a passo**
1. Abra a aba Adiantamentos.

**5. Regras e significados de status**
- A tela não calcula indenização.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Apólices e Fianças.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** A aba Adiantamentos calcula indenização?
  **R:** Não: ela registra adiantamentos e amortizações e compara o saldo não amortizado com o limite garantido e com o valor máximo da apólice vinculada; não calcula indenização.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Adiantamentos" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`

### 7.8 Sinistros e eventos

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Disponível
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Sinistros e eventos: Estágios do evento de sinistro: expectativa, aviso, reclamação, regulação, decisão, negativa, contestação e encerramento, com trilha imutável de etapas.

**2. Funcionalidades**
- Acompanhar o estágio de cada evento.

**3. Informações e indicadores exibidos**
- Estágio do evento e avaliação de cobertura derivada (inferência com revisão humana).

**4. Passo a passo**
1. Abra a aba Sinistros e eventos e selecione o evento.

**5. Regras e significados de status**
- A avaliação de cobertura é uma inferência: exige revisão humana.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Apólices e Minutas e acionamento.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que é a avaliação de cobertura do sinistro?
  **R:** É uma inferência derivada do estágio do evento, mostrada como apoio: ela exige revisão humana e não é decisão da seguradora.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Sinistros e eventos" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`

### 7.9 Dossiês

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Ainda não liberada
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Dossiês: Checklist de documentos por apólice, conforme a modalidade. Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**2. Funcionalidades**
- Nenhuma operação de registro está liberada nesta versão.

**3. Informações e indicadores exibidos**
- A aba pode abrir sem registros: sem dado, aparece SEM DADOS ou lista vazia.

**4. Passo a passo**
1. Não há passo a passo: a aba ainda não está liberada.

**5. Regras e significados de status**
- Situação: ainda não liberada.
- Nenhum valor é estimado quando não há registro.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Quando liberada, alimenta Quatro Pilares e a Auditoria do módulo.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Posso usar a aba Dossiês?
  **R:** Não por enquanto: a aba Dossiês ainda não está liberada e o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**9. Limitações e o que ainda não está liberado**
- Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.
- A aba ainda não passou pela validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Dossiês" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`, `docs/homologacao-autenticada-roteiro.md`

### 7.10 Minutas e acionamento

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Minutas e acionamento: Prepara minutas em rascunho de avisos, reclamações, endossos e cobranças. O envio real não existe: a tentativa de envio é sempre bloqueada.

**2. Funcionalidades**
- Preparar acionamento.
- Listar minutas.
- Aprovação humana do Administrador.

**3. Informações e indicadores exibidos**
- Estado de cada minuta.

**4. Passo a passo**
1. Abra a aba Minutas e acionamento.
2. Prepare a minuta e submeta à aprovação.

**5. Regras e significados de status**
- Nada é enviado por esta aba: o botão Enviar fica desabilitado.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Aprovações externas e Canais oficiais.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** A aba Minutas envia o e-mail para a seguradora?
  **R:** Não. Ela só prepara minutas em rascunho: o envio real não existe e o botão Enviar fica desabilitado.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Minutas e acionamento" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`

### 7.11 Canais oficiais

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Canais oficiais: Canais oficiais de seguradoras e bancos (e-mail, portal, endereço postal, telefone), sempre cadastrados com fonte e nunca inventados.

**2. Funcionalidades**
- Consultar os canais.

**3. Informações e indicadores exibidos**
- Se o canal foi verificado por um gestor.

**4. Passo a passo**
1. Abra a aba Canais oficiais.

**5. Regras e significados de status**
- Todo canal tem fonte.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Minutas e acionamento.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde ficam os canais oficiais da seguradora?
  **R:** Na aba Canais oficiais: e-mail, portal, endereço postal ou telefone, cada um com fonte e a marca de verificação por um gestor.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Canais oficiais" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`

### 7.12 Sujeitos e RCC

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Ainda não liberada
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Sujeitos e RCC: Auditoria dos sujeitos da apólice e checklist de responsabilidade civil cruzada. Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**2. Funcionalidades**
- Nenhuma operação de registro está liberada nesta versão.

**3. Informações e indicadores exibidos**
- A aba pode abrir sem registros: sem dado, aparece SEM DADOS ou lista vazia.

**4. Passo a passo**
1. Não há passo a passo: a aba ainda não está liberada.

**5. Regras e significados de status**
- Situação: ainda não liberada.
- Nenhum valor é estimado quando não há registro.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Quando liberada, alimenta Quatro Pilares e a Auditoria do módulo.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Posso usar a aba Sujeitos e RCC?
  **R:** Não por enquanto: a aba Sujeitos e RCC ainda não está liberada e o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**9. Limitações e o que ainda não está liberado**
- Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.
- A aba ainda não passou pela validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Sujeitos e RCC" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`, `docs/homologacao-autenticada-roteiro.md`

### 7.13 Referências

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Disponível
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Referências: Referências de apoio, com status de verificação e limitações. São referências, não consultoria.

**2. Funcionalidades**
- Consultar as referências.

**3. Informações e indicadores exibidos**
- Status de verificação.

**4. Passo a passo**
1. Abra a aba Referências.

**5. Regras e significados de status**
- Mostra o que foi realmente consultado e o que não foi confirmado.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Nenhuma.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** As Referências de Seguros são consultoria?
  **R:** Não: são referências de apoio, com o status de verificação e as limitações de cada uma.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Referências" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`

### 7.14 Auditoria

- **Tipo:** aba (dentro de Seguros)
- **Situação:** Disponível
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Auditoria: Trilha de acréscimo apenas das ações do módulo, com quem, quando e o quê; mostra os 300 eventos mais recentes, com filtros.

**2. Funcionalidades**
- Filtrar por objeto e por texto.

**3. Informações e indicadores exibidos**
- Quem, quando e o quê.

**4. Passo a passo**
1. Abra a aba Auditoria dentro de Seguros.

**5. Regras e significados de status**
- Só leitura.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Auditoria geral.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde vejo o histórico de Seguros?
  **R:** Na aba Auditoria de Seguros: os 300 eventos mais recentes, com quem, quando e o quê, com filtros por objeto e por texto.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Auditoria" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/insurance-ui/tabs.ts`

## 8. Integrações

Gmail, Outlook, Google Drive e demais conectores existentes, caixas de e-mail, contatos externos, sinais de e-mail e autorizações.

### 8.1 Integrações

- **Tipo:** menu
- **Rota:** `/[projectId]/integracoes`
- **Situação:** Disponível
- **Quem vê:** Somente Administrador da obra

**1. Nome e finalidade.** Integrações: Mostra e gerencia as fontes externas usadas pela obra: Gmail, Google Drive (somente ESG/SSMA) e demais conectores existentes, com a origem de cada fonte.

**2. Funcionalidades**
- Cartões por fonte com status e origem.
- Editar origem.
- Contas de e-mail AXION e configuração de ingestão.
- Prévia antes de importar e Confirmar sincronização.
- Verificação somente leitura da pasta SSMA/ESG.

**3. Informações e indicadores exibidos**
- Status de cada fonte: ativo, atenção, erro ou pendente.

**4. Passo a passo**
1. Abra Integrações (Administrador).
2. Confira os cartões de fonte.
3. Para e-mail, registre a conta do domínio axion.com.br e salve a configuração de ingestão.
4. Confira a prévia e confirme a sincronização.

**5. Regras e significados de status**
- Contratos, aditivos, edital e serviços adicionais entram por upload manual do Administrador em Documentos.
- Drive de Orçamentos e Drive de Planejamento ainda não têm ligação com o ACC.
- Segredos de integração ficam no servidor e nunca aparecem nesta tela.

**6. Permissões.** Só o Administrador da obra vê o item no menu e abre a tela; os demais perfis não a veem (a rota também é protegida, não só o menu).

**7. Integração com outros módulos**
- Documentos, Timeline, Dashboard e ESG/SSMA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que a aba Integrações mostra?
  **R:** As fontes externas da obra (Gmail, Google Drive para ESG/SSMA e outras), cada uma com o status e a origem. Só o Administrador a vê. Contratos e aditivos não entram por aqui: entram por upload manual em Documentos.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê o item no menu, abre a tela e executa as ações.
- Gerente (Gestor): Não vê o item no menu e não abre a tela.
- Colaborador: Não vê o item no menu e não abre a tela.
- Leitura: Não vê o item no menu e não abre a tela.

**Capturas de tela:** Tela "Integrações" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/integracoes/page.tsx`, `apps/web/lib/ui/nav-items.ts`, `docs/manual-referencia-acc.md (4.26)`

### 8.2 Caixas de e-mail da obra

- **Tipo:** subaba (dentro de Integrações)
- **Rota:** `/[projectId]/integracoes/caixas`
- **Situação:** Disponível
- **Quem vê:** Somente Administrador da obra

**1. Nome e finalidade.** Caixas de e-mail da obra: Diagnóstico por caixa de e-mail em sete etapas independentes, com as ações de autorização, habilitação e revogação.

**2. Funcionalidades**
- Ver as caixas e as sete etapas.
- Abrir uma caixa para ver evidências, ações e mensagens importadas.

**3. Informações e indicadores exibidos**
- Estado de cada etapa: Comprovado, Indício, Parcial, Pendente, Bloqueado ou Indisponível.

**4. Passo a passo**
1. Abra Integrações e entre em Caixas de e-mail da obra.
2. Leia o estado de cada etapa.
3. Escolha uma caixa para ver os detalhes.

**5. Regras e significados de status**
- Comprovado só com evidência própria; Indício nunca vale como prova.

**6. Permissões.** Só o Administrador da obra vê o item no menu e abre a tela; os demais perfis não a veem (a rota também é protegida, não só o menu).

**7. Integração com outros módulos**
- Autorizações e Integrações.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que significa Indício nas caixas de e-mail?
  **R:** Indício é evidência indireta e nunca vale como prova: só o estado Comprovado tem evidência própria.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê o item no menu, abre a tela e executa as ações.
- Gerente (Gestor): Não vê o item no menu e não abre a tela.
- Colaborador: Não vê o item no menu e não abre a tela.
- Leitura: Não vê o item no menu e não abre a tela.

**Capturas de tela:** Tela "Caixas de e-mail da obra" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/integracoes/caixas/page.tsx`, `apps/web/lib/ui/help/manifests/integracoes.ts`

### 8.3 Contatos externos monitorados

- **Tipo:** subaba (dentro de Integrações)
- **Rota:** `/[projectId]/integracoes/contatos-externos`
- **Situação:** Disponível
- **Quem vê:** Somente Administrador da obra

**1. Nome e finalidade.** Contatos externos monitorados: Cadastro das organizações e pessoas de fora da AXION que trocam e-mails com a obra, com domínios, contatos e o vínculo de cada uma com a obra.

**2. Funcionalidades**
- Cadastrar e consultar organizações, domínios e contatos.

**3. Informações e indicadores exibidos**
- Papel e vínculo de cada organização na obra.

**4. Passo a passo**
1. Abra Contatos externos monitorados e consulte ou cadastre a organização.

**5. Regras e significados de status**
- O cadastro é auditável.

**6. Permissões.** Só o Administrador da obra vê o item no menu e abre a tela; os demais perfis não a veem (a rota também é protegida, não só o menu).

**7. Integração com outros módulos**
- Sinais de e-mail e Caixas.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Para que servem os Contatos externos?
  **R:** Para cadastrar, de forma auditável, as organizações e pessoas de fora da AXION que trocam e-mails com a obra e o vínculo de cada uma com ela.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê o item no menu, abre a tela e executa as ações.
- Gerente (Gestor): Não vê o item no menu e não abre a tela.
- Colaborador: Não vê o item no menu e não abre a tela.
- Leitura: Não vê o item no menu e não abre a tela.

**Capturas de tela:** Tela "Contatos externos monitorados" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/integracoes/contatos-externos/page.tsx`

### 8.4 Sinais de risco de e-mail

- **Tipo:** subaba (dentro de Integrações)
- **Rota:** `/[projectId]/integracoes/sinais-email`
- **Situação:** Disponível
- **Quem vê:** Somente Administrador da obra

**1. Nome e finalidade.** Sinais de risco de e-mail: Lista indícios de risco extraídos de e-mails da obra, cada um para revisão humana: confirmar ou descartar.

**2. Funcionalidades**
- Confirmar ou descartar um sinal.
- Ver o pilar e a área do sinal.

**3. Informações e indicadores exibidos**
- Pilar (Prazo, Custo, Segurança, Qualidade) e área de cada sinal.

**4. Passo a passo**
1. Abra Sinais de risco de e-mail.
2. Leia o sinal e a origem.
3. Confirme ou descarte, informando o motivo.

**5. Regras e significados de status**
- O sinal é um indício, não um fato: exige revisão humana.
- Descartar ou revogar pede motivo.

**6. Permissões.** Só o Administrador da obra vê o item no menu e abre a tela; os demais perfis não a veem (a rota também é protegida, não só o menu).

**7. Integração com outros módulos**
- Eventos e alertas.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que é um sinal de e-mail?
  **R:** É um indício de risco extraído de um e-mail da obra. Ele exige revisão humana: confirme ou descarte, informando o motivo.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê o item no menu, abre a tela e executa as ações.
- Gerente (Gestor): Não vê o item no menu e não abre a tela.
- Colaborador: Não vê o item no menu e não abre a tela.
- Leitura: Não vê o item no menu e não abre a tela.

**Capturas de tela:** Tela "Sinais de risco de e-mail" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/integracoes/sinais-email/page.tsx`, `docs/experts-qualidade-sinais-provedor.md`

### 8.5 Autorizações

- **Tipo:** menu
- **Rota:** `/[projectId]/autorizacoes`
- **Situação:** Disponível
- **Quem vê:** Somente Administrador da obra

**1. Nome e finalidade.** Autorizações: Mostra, por colaborador, conta e obra, se o acesso aos e-mails foi autorizado, recusado ou revogado, quando, e a situação da conexão da conta.

**2. Funcionalidades**
- Solicitar autorização por e-mail.
- Cancelar solicitação.
- Revogar autorização com motivo.
- Ver texto e histórico.

**3. Informações e indicadores exibidos**
- Decisão, data e conexão da conta.

**4. Passo a passo**
1. Abra Autorizações (Administrador).
2. Escolha o colaborador e use Solicitar e enviar e-mail.
3. Acompanhe a tabela.

**5. Regras e significados de status**
- O aceite é registrado no ACC; a conexão da conta Google é separada e feita pelo administrador.
- A permissão do Google é somente leitura e não é limitada a uma obra; quem limita são os filtros do ACC.

**6. Permissões.** Só o Administrador da obra vê o item no menu e abre a tela; os demais perfis não a veem (a rota também é protegida, não só o menu).

**7. Integração com outros módulos**
- Integrações e Caixas de e-mail.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que é a aba Autorizações?
  **R:** É onde o Administrador acompanha o consentimento de cada colaborador para o ACC usar a caixa de e-mail em uma obra: autorizado, recusado ou revogado, e a situação da conexão da conta.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê o item no menu, abre a tela e executa as ações.
- Gerente (Gestor): Não vê o item no menu e não abre a tela.
- Colaborador: Não vê o item no menu e não abre a tela.
- Leitura: Não vê o item no menu e não abre a tela.

**Capturas de tela:** Tela "Autorizações" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/autorizacoes/page.tsx`, `docs/manual-referencia-acc.md (4.31)`

### 8.6 Autorização de acesso aos e-mails da obra

- **Tipo:** pagina (dentro de Autorizações)
- **Rota:** `/autorizacao-email/[authorizationId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Autorização de acesso aos e-mails da obra: Página do colaborador para autorizar, recusar ou revogar o acesso do ACC à caixa de e-mail corporativa em uma obra específica.

**2. Funcionalidades**
- Ler as seis seções do texto.
- Autorizar ou recusar em duas etapas.
- Revogar depois de autorizar.

**3. Informações e indicadores exibidos**
- Texto do consentimento e histórico.

**4. Passo a passo**
1. Abra o link do e-mail.
2. Leia as informações.
3. Marque a caixa de confirmação e confirme.

**5. Regras e significados de status**
- Abrir o link não registra nada; só a confirmação registra.
- Revogar no ACC não remove a permissão dada ao Google.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Autorizações.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Autorizar o acesso ao e-mail é obrigatório?
  **R:** A autorização é o seu consentimento, feito dentro do ACC com login. Sua recusa fica registrada e não altera nada na sua conta Google. Veja as respostas sobre autorização para os detalhes.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Autorização de acesso aos e-mails da obra" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/autorizacao-email/[authorizationId]/page.tsx`, `apps/web/lib/assistant/knowledge.ts (autorizacao-*)`

## 9. Alertas por e-mail, criticidades, SLA e escalonamentos

Como os alertas nascem, os prazos por criticidade (SLA), o escalonamento e a reemissão.

### 9.1 Responder alertas de contrato (lote)

- **Tipo:** pagina (dentro de Eventos)
- **Rota:** `/[projectId]/ledger/lote-alertas/[batchId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Responder alertas de contrato (lote): Página completa para responder, em um só lugar, todos os alertas de um e-mail em lote.

**2. Funcionalidades**
- Escolher a ação obrigatória de cada alerta.
- Salvar cada ação aos poucos.
- Responder ao ACC quando todos tiverem ação.

**3. Informações e indicadores exibidos**
- Contador de alertas respondidos (por exemplo 2 de 4).

**4. Passo a passo**
1. Abra o link do e-mail.
2. Em cada alerta escolha Resolvido, Em andamento ou Enviado para outro colaborador.
3. Use Salvar esta ação.
4. Quando todos tiverem ação, clique em RESPONDER AO ACC.

**5. Regras e significados de status**
- VER EVENTO é só consulta e não conta como resposta.
- Abrir o link não registra nada.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Escalonamento e lembretes de repetição.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como respondo a um lote de alertas?
  **R:** Abra o link do e-mail, defina uma ação para cada alerta (Resolvido, Em andamento ou Enviado para outro colaborador), salve aos poucos e só então clique em RESPONDER AO ACC; o botão só libera quando todos têm ação.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Responder alertas de contrato (lote)" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/ledger/lote-alertas/[batchId]/page.tsx`, `docs/manual-referencia-acc.md (4.6, 4.13)`

### 9.2 Solicitações

- **Tipo:** menu
- **Rota:** `/[projectId]/action-requests` · relacionadas: `/[projectId]/action-requests/[actionRequestId]`
- **Situação:** Disponível (partes ainda em validação final de uso)
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Solicitações: Pedidos de informação, documentação ou providência direcionados às áreas e responsáveis da AXION, com acompanhamento de envio, respostas e responsáveis.

**2. Funcionalidades**
- Lista de solicitações e detalhe.
- Enviar a solicitação por e-mail a um destinatário.
- Acompanhar respostas e responsáveis.

**3. Informações e indicadores exibidos**
- Situação: Aberta, Encerrada, Cancelada.
- Envio: não enviada, em andamento, enviada ou falha.

**4. Passo a passo**
1. Abra Solicitações e clique em uma solicitação.
2. Em Envio por e-mail, informe o destinatário, confira assunto e mensagem e clique em Enviar solicitação por e-mail.
3. Acompanhe o estado do envio.

**5. Regras e significados de status**
- Não há botão para criar solicitação nesta aba.
- Em falha de envio, nenhuma tentativa automática adicional é feita.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- E-mail e Ações e Escalonamentos.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como envio uma solicitação por e-mail?
  **R:** Abra a solicitação, preencha Destinatário, confira Assunto e Mensagem e clique em Enviar solicitação por e-mail. Depois a página mostra Enviada, Envio em andamento ou Falha no envio.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Solicitações" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/action-requests/page.tsx`, `docs/manual-referencia-acc.md (4.7)`

### 9.3 Ações e Escalonamentos

- **Tipo:** menu
- **Rota:** `/[projectId]/acoes`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Ações e Escalonamentos: Acompanha ações com prazo de SLA e o nível de escalonamento atual (Nível 1 Responsável, Nível 2 Gerência, Nível 3 Diretoria).

**2. Funcionalidades**
- Assumir uma ação.
- Marcar Estudando solução.
- Concluir com observação.
- Reatribuir.
- Nova ação.
- Visão gerencial com filtros.
- Botão Verificar escalonamentos.

**3. Informações e indicadores exibidos**
- Totais: total, vencidas, escaladas, risco alto/crítico e concluídas.
- Status: Pendente, Assumida, Estudando solução, Concluída, Vencida, Escalada, Cancelada.

**4. Passo a passo**
1. Abra Ações e Escalonamentos.
2. Em Ações abertas, localize o cartão.
3. Use Assumir Ação, depois Concluir Ação com a observação de conclusão.
4. Para passar a outra pessoa, use Reatribuir.

**5. Regras e significados de status**
- Assumir interrompe só o prazo de assumir.
- Prazos por criticidade: veja o capítulo de alertas e SLA.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Matriz de SLA, alertas por e-mail e Dashboard.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como assumo e concluo uma ação?
  **R:** Em Ações e Escalonamentos, localize o cartão em Ações abertas, clique em Assumir Ação e, ao terminar, escreva a observação de conclusão e clique em Concluir Ação. Assumir interrompe só o prazo de assumir. Se a ação for recusada, o seu perfil não tem essa permissão.

**9. Limitações e o que ainda não está liberado**
- As ações de assumir e concluir seguem a permissão do banco; sem ela a ação é recusada.
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Ações e Escalonamentos" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/acoes/page.tsx`, `docs/manual-referencia-acc.md (4.8, 4.9)`

### 9.4 Matriz de SLA e Escalonamento

- **Tipo:** pagina (dentro de Ações e Escalonamentos)
- **Rota:** `/[projectId]/acoes/configuracao`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Matriz de SLA e Escalonamento: Configuração, por obra, de fuso e expediente, prazos por nível de risco e responsáveis por área (Nível 1, 2 e 3). Também aparece como seção em Usuários.

**2. Funcionalidades**
- Ver prazos e responsáveis por área.

**3. Informações e indicadores exibidos**
- Prazos por grau de risco e responsáveis.

**4. Passo a passo**
1. O Administrador abre a matriz pela tela Usuários.
2. Consulte os prazos e responsáveis.

**5. Regras e significados de status**
- A AXIA só explica onde a matriz está; ela não altera prazos nem políticas de SLA.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Ações e Escalonamentos e alertas por e-mail.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde fica a matriz de responsáveis?
  **R:** Na tela Usuários, na seção da matriz de responsabilidades e prazos, que o Administrador consulta. A AXIA não altera prazos nem responsáveis.

**9. Limitações e o que ainda não está liberado**
- Fora do menu; a configuração da matriz é um assunto em revisão da AXIA.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Matriz de SLA e Escalonamento" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/acoes/configuracao/page.tsx`, `docs/manual-referencia-acc.md (4.10)`

### 9.5 Resumo semanal de alertas

- **Tipo:** pagina (dentro de Ações e Escalonamentos)
- **Rota:** `/[projectId]/acoes/resumo-semanal/[digestId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Resumo semanal de alertas: Página aberta pelo e-mail semanal que reúne os riscos Médio e Baixo para o destinatário tratar cada item.

**2. Funcionalidades**
- Escolher o tratamento de cada alerta.
- Enviar todas as respostas.

**3. Informações e indicadores exibidos**
- Título, descrição e prazo de cada alerta.

**4. Passo a passo**
1. Abra o link do e-mail.
2. Em Tratamento obrigatório escolha Ciente, Estudando solução, Resolvido ou Direcionar para.
3. Se direcionar, escolha a pessoa.
4. Clique em Enviar todas as respostas.

**5. Regras e significados de status**
- Enviar todas as respostas só libera com todos respondidos.
- Direcionar não reinicia prazos nem escalonamento.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- E-mail semanal e Ações e Escalonamentos.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como respondo o resumo semanal de alertas?
  **R:** Abra o link do e-mail, escolha para cada alerta Ciente, Estudando solução, Resolvido ou Direcionar para, e clique em Enviar todas as respostas, que só libera com todos respondidos.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Resumo semanal de alertas" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/acoes/resumo-semanal/[digestId]/page.tsx`, `docs/manual-referencia-acc.md (4.11)`

### 9.6 Alerta de risco

- **Tipo:** pagina
- **Rota:** `/[projectId]/alertas/[caseId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Alerta de risco: Página de um alerta de risco: situação, prazos, ações (Resolvido, Tomando providências, Enviar para, Especialista, Outro), linha do tempo e mensagens.

**2. Funcionalidades**
- Escolher uma ação e confirmá-la.
- Ler a linha do tempo e os encaminhamentos.

**3. Informações e indicadores exibidos**
- Responsável atual, nível atual e próximo, prazos.

**4. Passo a passo**
1. Abra o alerta pelo menu ou pelo botão do e-mail.
2. Leia o cartão Situação.
3. Clique no botão da ação, preencha o formulário e confirme.

**5. Regras e significados de status**
- Abrir o link do e-mail não muda nada.
- Alto e Crítico: a ação provoca escalonamento imediato ao próximo nível; a ação e o escalonamento são registrados como eventos distintos.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Experts IA (ação ESPECIALISTA), e-mail e SLA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que muda se eu responder o alerta?
  **R:** A ação escolhida fica registrada com data e autor. Em alertas Alto e Crítico, certas ações provocam escalonamento imediato ao próximo nível. Abrir o link, por si só, não registra nada.

**9. Limitações e o que ainda não está liberado**
- Depende da chave do relatório semanal estar habilitada.
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Alerta de risco" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/alertas/[caseId]/page.tsx`, `docs/manual-referencia-acc.md (4.12)`

### 9.7 Reemissão de alertas

- **Tipo:** menu
- **Rota:** `/[projectId]/reemissao-alertas`
- **Situação:** Disponível
- **Quem vê:** Somente Administrador da obra

**1. Nome e finalidade.** Reemissão de alertas: Lista casos Crítico e Alto abertos cuja comunicação não chegou a todos os destinatários e permite ao Administrador registrar, com justificativa, a decisão de reemitir. A página nunca envia e-mail.

**2. Funcionalidades**
- Registrar a decisão de reemissão com justificativa.

**3. Informações e indicadores exibidos**
- Casos Crítico e Alto abertos com entrega incompleta.

**4. Passo a passo**
1. Abra Reemissão de alertas (Administrador).
2. Escolha o caso, escreva a justificativa e registre a decisão.

**5. Regras e significados de status**
- Aprovar só registra a decisão; o envio exige o ciclo, o interruptor das reemissões e as travas do piloto.
- Casos suspensos manualmente continuam sem envio.

**6. Permissões.** Só o Administrador da obra vê o item no menu e abre a tela; os demais perfis não a veem (a rota também é protegida, não só o menu).

**7. Integração com outros módulos**
- Alertas por e-mail e Auditoria.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que faz a Reemissão de alertas?
  **R:** Ela lista casos Crítico e Alto cuja comunicação não chegou a todos e deixa o Administrador registrar a decisão de reemitir, com justificativa. A página não envia e-mail; o envio depende do ciclo e das travas do piloto.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê o item no menu, abre a tela e executa as ações.
- Gerente (Gestor): Não vê o item no menu e não abre a tela.
- Colaborador: Não vê o item no menu e não abre a tela.
- Leitura: Não vê o item no menu e não abre a tela.

**Capturas de tela:** Tela "Reemissão de alertas" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/reemissao-alertas/page.tsx`, `apps/web/lib/ui/help/legacy.ts`

### 9.8 Criticidades e prazos (SLA)

- **Tipo:** tema
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Criticidades e prazos (SLA): Os alertas têm quatro graus (Crítico, Alto, Médio, Baixo), cada um com um prazo para o responsável assumir: CRÍTICO 1 hora corrida; ALTO 4 horas úteis. Para MÉDIO e BAIXO, o prazo para assumir vem da Matriz de SLA configurada para a obra.

**2. Funcionalidades**
- Nível 1 Responsável, Nível 2 Gerência, Nível 3 Diretoria.

**3. Informações e indicadores exibidos**
- Prazos de Crítico e Alto conforme a política; prazos de Médio e Baixo conforme a matriz da obra.

**4. Passo a passo**
1. Veja os prazos de cada ação em Ações e Escalonamentos.
2. O Administrador consulta e ajusta a Matriz de SLA da obra na tela Usuários (bloco Prazos por grau de risco), se tiver permissão.

**5. Regras e significados de status**
- Só Alto e Crítico passam pelo escalonamento por prazo no ciclo automático.
- Os lembretes de repetição (Crítico 1 dia, Alto 2, Médio 4, Baixo 7, dias corridos) são outro mecanismo.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Ações e Escalonamentos e alertas por e-mail.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Qual é o prazo de cada criticidade?
  **R:** Prazo para assumir: CRÍTICO 1 hora corrida; ALTO 4 horas úteis. Para MÉDIO e BAIXO, o prazo vem da Matriz de SLA configurada para a obra; quem tem permissão consulta e ajusta essa matriz na tela Usuários.

**9. Limitações e o que ainda não está liberado**
- A configuração da matriz e feriados são assuntos em revisão da AXIA.
- Alterações na matriz valem para novos alertas; alertas já abertos mantêm o prazo de quando foram criados.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Criticidades e prazos (SLA)" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/assistant/guards.ts`, `apps/web/lib/assistant/approved-batch-1.ts (qa-E2, qa-R7)`

## 10. Respostas e resolução pelo e-mail

O que já funciona pelo e-mail e o que ainda não está liberado.

### 10.1 Resposta rápida de alerta (e-mail)

- **Tipo:** pagina
- **Rota:** `/alertas/acao/[projectId]/[batchId]/[eventId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Resposta rápida de alerta (e-mail): Tela aberta pelo botão do e-mail para responder um alerta de contrato: Resolvido, Em andamento ou Enviado para outra pessoa.

**2. Funcionalidades**
- Confirmar a ação do botão clicado.

**3. Informações e indicadores exibidos**
- Aviso sobre a repetição dos lembretes.

**4. Passo a passo**
1. Clique no botão do e-mail.
2. Confira o aviso e, se for Enviado para, escolha o colaborador.
3. Clique em CONFIRMAR.

**5. Regras e significados de status**
- Em andamento repete o lembrete: Crítico 1 dia, Alto 2, Médio 4 e Baixo 7 (dias corridos).
- Resolvido encerra o alerta e interrompe os lembretes.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Lote de alertas e escalonamento.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como respondo pelo botão do e-mail?
  **R:** Clique no botão do e-mail (Resolvido, Em andamento ou Enviado para), confira o aviso e confirme em CONFIRMAR. Se o e-mail traz vários alertas, a tela leva à resposta completa no ACC.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Resposta rápida de alerta (e-mail)" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/alertas/acao/[projectId]/[batchId]/[eventId]/page.tsx`, `docs/manual-referencia-acc.md (4.13)`

### 10.2 Resposta rápida de vários alertas (e-mail)

- **Tipo:** pagina
- **Rota:** `/alertas/lote/[projectId]/[batchId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Resposta rápida de vários alertas (e-mail): Versão compacta para responder os alertas de um e-mail em lote; só libera o envio final quando todos têm ação.

**2. Funcionalidades**
- Salvar cada ação.
- CONFIRMAR TUDO.

**3. Informações e indicadores exibidos**
- Contador de alertas respondidos.

**4. Passo a passo**
1. Abra o link do e-mail.
2. Escolha a ação de cada alerta e salve.
3. Clique em CONFIRMAR TUDO.

**5. Regras e significados de status**
- Lote ainda não enviado ou já respondido mostra a mensagem correspondente.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Responder alertas de contrato (lote).

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Posso responder alguns alertas do lote e outros depois?
  **R:** Sim: use Salvar esta ação em cada alerta; o envio final (CONFIRMAR TUDO) só libera quando todos tiverem ação.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Resposta rápida de vários alertas (e-mail)" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/alertas/lote/[projectId]/[batchId]/page.tsx`, `docs/manual-referencia-acc.md (4.13)`

### 10.3 Resposta rápida de alerta de providência (e-mail)

- **Tipo:** pagina
- **Rota:** `/alertas/providencia/[projectId]/[itemId]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Resposta rápida de alerta de providência (e-mail): Tela aberta pelo botão do e-mail para responder o alerta de uma providência: Resolvido, Em andamento ou Enviado para.

**2. Funcionalidades**
- Confirmar a ação.
- Informar evidência ao resolver.

**3. Informações e indicadores exibidos**
- Título e fase da providência.

**4. Passo a passo**
1. Clique no botão do e-mail.
2. Para Resolvido, informe evidência, protocolo ou justificativa.
3. Clique em CONFIRMAR.

**5. Regras e significados de status**
- Concluir uma providência exige perfil com permissão e evidência ou justificativa.
- Providência já encerrada não aceita nova resposta.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Providências.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como resolvo uma providência pelo e-mail?
  **R:** Clique no botão Resolvido do e-mail, informe a evidência, o protocolo ou uma justificativa e confirme. A conclusão exige perfil com permissão; se for recusada, peça ao Administrador.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Resposta rápida de alerta de providência (e-mail)" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/alertas/providencia/[projectId]/[itemId]/page.tsx`, `docs/manual-referencia-acc.md (4.14)`

### 10.4 Ação de e-mail (botões do e-mail)

- **Tipo:** pagina
- **Rota:** `/email-actions/[token]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Ação de e-mail (botões do e-mail): Tela de confirmação dos botões dos e-mails acionáveis (por exemplo dar ciência ou assumir). Abrir o link não registra nada: a ação só vale depois da confirmação.

**2. Funcionalidades**
- Confirmar a ação do botão.

**3. Informações e indicadores exibidos**
- Descrição da ação a confirmar.

**4. Passo a passo**
1. Clique no botão do e-mail.
2. Faça login se pedido.
3. Confirme a ação.

**5. Regras e significados de status**
- O link é pessoal e expira; link inválido mostra aviso.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Solicitações, Eventos e alertas.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Por que o botão do e-mail pede login?
  **R:** Porque a ação é registrada em nome de quem confirma: o ACC pede o login, leva à tela certa e só registra a ação depois da sua confirmação.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Ação de e-mail (botões do e-mail)" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/email-actions/[token]/page.tsx`, `docs/manual-referencia-acc.md (4.16)`

## 11. AXIA e Especialistas

A AXIA esclarece dúvidas de USO do ACC; os Especialistas de IA tratam questões técnicas da obra.

### 11.1 Consultar IA sobre o alerta

- **Tipo:** pagina
- **Rota:** `/alertas/consulta-ia/[projectId]/[subject]/[id]`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Consultar IA sobre o alerta: Tela aberta pelo botão CONSULTAR IA do e-mail: pede a opinião de um especialista de IA sobre o alerta. É só consulta, não altera o alerta nem registra providência.

**2. Funcionalidades**
- Ver o especialista sugerido para a sua área.
- Editar a pergunta e consultar.

**3. Informações e indicadores exibidos**
- Especialidades: Contratual/Jurídico, Engenharia, Planejamento e Prazo, SSMA, Documentação e Entrega, Geral.

**4. Passo a passo**
1. Toque em CONSULTAR IA no e-mail.
2. Confira o especialista sugerido e edite a pergunta.
3. Toque em Consultar.

**5. Regras e significados de status**
- A resposta do especialista exige revisão humana.
- Quem responde é o especialista; a AXIA não participa.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Experts IA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como consulto a IA sobre um alerta?
  **R:** Pelo botão CONSULTAR IA do e-mail: confira o especialista sugerido, edite a pergunta se quiser e toque em Consultar. A consulta só lê: não altera o alerta. A resposta é do especialista e exige revisão humana.

**9. Limitações e o que ainda não está liberado**
- Depende de o provedor de IA estar habilitado; não é a AXIA.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Consultar IA sobre o alerta" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/alertas/consulta-ia/[projectId]/[subject]/[id]/page.tsx`, `docs/manual-referencia-acc.md (4.15)`

### 11.2 Experts IA

- **Tipo:** menu
- **Rota:** `/[projectId]/experts-ia`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Experts IA: Reúne os especialistas de IA do ACC (jurídico, engenharia, planejamento, SSMA, qualidade e outros). São eles que analisam informações e produzem recomendações técnicas; a AXIA não faz isso.

**2. Funcionalidades**
- Abrir um especialista e fazer a pergunta.
- Abrir a Descrição dos Especialistas.

**3. Informações e indicadores exibidos**
- Cada resposta separa fato, inferência e recomendação e exige revisão humana.

**4. Passo a passo**
1. Abra Experts IA.
2. Escolha o especialista da sua pergunta.
3. Escreva a pergunta e consulte.
4. Revise a resposta: ela é apoio à decisão.

**5. Regras e significados de status**
- A IA analisa e recomenda; decisões vinculantes permanecem humanas.
- A AXIA e os especialistas são separados: a AXIA ensina a usar o ACC; análise técnica ou contratual é do especialista.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Alertas (ação ESPECIALISTA), Eventos e Jurídico.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Quando uso a AXIA e quando um especialista?
  **R:** Use a AXIA para saber como usar uma tela do ACC. Para analisar um contrato, um documento, um alerta ou uma questão técnica da obra, use um especialista em Experts IA; a resposta dele exige revisão humana.

**9. Limitações e o que ainda não está liberado**
- Depende de o provedor de IA estar habilitado.
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Experts IA" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/experts-ia/page.tsx`, `docs/manual-referencia-acc.md (cap. 8)`, `scripts/test-especialista-never-axia.mjs`

### 11.3 Descrição dos Especialistas

- **Tipo:** subaba (dentro de Experts IA)
- **Rota:** `/[projectId]/experts-ia/descricao`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Descrição dos Especialistas: Página de referência dos especialistas oficiais: competências, fontes, limitações e o perfil simulado de cada um.

**2. Funcionalidades**
- Ler o que cada especialista faz e o que não faz.

**3. Informações e indicadores exibidos**
- Competências, fontes (disponíveis ou futuras) e limitações.

**4. Passo a passo**
1. Abra Descrição dos Especialistas dentro de Experts IA.

**5. Regras e significados de status**
- Fonte autorizada não significa fonte disponível: a tela mostra Disponível ou Fonte futura.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Experts IA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde vejo o que cada especialista faz?
  **R:** Em Experts IA, na Descrição dos Especialistas: competências, fontes, limitações e o perfil de cada um. Fonte autorizada não significa fonte já disponível.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Descrição dos Especialistas" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/experts-ia/descricao/page.tsx`

### 11.4 Diretor de Engenharia e Construção IA

- **Tipo:** subaba (dentro de Experts IA)
- **Rota:** `/[projectId]/experts-ia/diretor-engenharia`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Diretor de Engenharia e Construção IA: Painel para perguntar ao especialista de engenharia e construção. A AXIA apenas explica como abrir e usar o painel.

**2. Funcionalidades**
- Escrever a pergunta e consultar.

**3. Informações e indicadores exibidos**
- Resposta do especialista, sujeita a revisão humana.

**4. Passo a passo**
1. Abra Experts IA e escolha o Diretor de Engenharia e Construção IA.
2. Escreva a pergunta e consulte.

**5. Regras e significados de status**
- O especialista não substitui o responsável técnico; a resposta exige revisão humana.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Experts IA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como pergunto ao Diretor de Engenharia IA?
  **R:** Abra Experts IA, escolha o Diretor de Engenharia e Construção IA, escreva a pergunta e consulte. A resposta é do especialista e exige revisão humana; a AXIA só explica o caminho.

**9. Limitações e o que ainda não está liberado**
- Depende do provedor de IA habilitado.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Diretor de Engenharia e Construção IA" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/experts-ia/diretor-engenharia/page.tsx`

### 11.5 Diretor de Planejamento IA

- **Tipo:** subaba (dentro de Experts IA)
- **Rota:** `/[projectId]/experts-ia/diretor-planejamento`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Diretor de Planejamento IA: Painel para perguntar ao especialista de planejamento. A AXIA apenas explica como abrir e usar o painel.

**2. Funcionalidades**
- Escrever a pergunta e consultar.

**3. Informações e indicadores exibidos**
- Resposta do especialista, sujeita a revisão humana.

**4. Passo a passo**
1. Abra Experts IA e escolha o Diretor de Planejamento IA.
2. Escreva a pergunta e consulte.

**5. Regras e significados de status**
- A resposta exige revisão humana.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Experts IA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como pergunto ao Diretor de Planejamento IA?
  **R:** Abra Experts IA, escolha o Diretor de Planejamento IA, escreva a pergunta e consulte. A resposta é do especialista e exige revisão humana; a AXIA só explica o caminho.

**9. Limitações e o que ainda não está liberado**
- Depende do provedor de IA habilitado.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Diretor de Planejamento IA" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/experts-ia/diretor-planejamento/page.tsx`

### 11.6 Fale com a AXIA (rota /vera)

- **Tipo:** pagina
- **Rota:** `/vera`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Fale com a AXIA (rota /vera): Atalho antigo que abre Ajuda e tutorial já com a conversa da AXIA. A AXIA é a assistente de uso do ACC: explica como usar as telas.

**2. Funcionalidades**
- Redirecionamento para Ajuda e tutorial com a conversa aberta.

**3. Informações e indicadores exibidos**
- Conversa por texto.

**4. Passo a passo**
1. Use Fale com a AXIA na barra de cima, ou abra /vera.

**5. Regras e significados de status**
- A AXIA não altera dados, não lê dados de obras e não analisa contratos; análise é dos especialistas.

**6. Permissões.** A tela não tem item no menu: abre-se por link, botão, e-mail ou outra tela. É preciso estar logado e ter acesso à obra; o servidor confere o acesso a cada abertura.

**7. Integração com outros módulos**
- Ajuda e tutorial.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** O que a AXIA faz?
  **R:** A AXIA ensina a usar o ACC: explica abas, botões e fluxos. Ela não altera nada, não lê dados da obra e não analisa contratos ou questões técnicas; para isso use os especialistas em Experts IA.

**9. Limitações e o que ainda não está liberado**
- A AXIA responde só com a base de uso aprovada.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Fale com a AXIA (rota /vera)" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/vera/page.tsx`, `apps/web/lib/assistant/knowledge.ts`

### 11.7 AXIA e Especialistas: quem responde o quê

- **Tipo:** tema
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** AXIA e Especialistas: quem responde o quê: A AXIA e os Especialistas de IA são coisas separadas. A AXIA responde dúvidas de USO do ACC. Os Especialistas (Experts IA) tratam de questões técnicas e contratuais da obra.

**2. Funcionalidades**
- AXIA: como usar telas, abas e fluxos.
- Especialistas: análise de documentos, alertas e questões técnicas, sempre com revisão humana.

**3. Informações e indicadores exibidos**
- Cada resposta de especialista separa fato, inferência e recomendação.

**4. Passo a passo**
1. Dúvida de como usar o ACC: pergunte à AXIA (Fale com a AXIA).
2. Dúvida técnica ou contratual: abra Experts IA ou use a ação ESPECIALISTA do alerta.

**5. Regras e significados de status**
- A AXIA não lê dados da obra e não altera nada.
- Nenhum especialista consulta a AXIA nem depende dela.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- Experts IA e Ajuda e tutorial.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** A AXIA analisa meu contrato?
  **R:** Não. A AXIA só ensina a usar o ACC. Para analisar um contrato ou documento use os especialistas em Experts IA; a resposta deles exige revisão humana.

**9. Limitações e o que ainda não está liberado**
- Perguntas sobre um caso concreto recebem o aviso de que a AXIA explica só a regra geral.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "AXIA e Especialistas: quem responde o quê" (captura de tela ainda não disponível)

**Fontes:** `apps/web/lib/assistant/guards.ts`, `apps/web/lib/assistant/scope.ts`, `scripts/test-especialista-never-axia.mjs`

## 12. Administração, usuários, competências e permissões

Gestão de pessoas e perfis, competências, aprovações externas, criação de obras e Start-up ACC.

### 12.1 Criar e editar obras

- **Tipo:** pagina
- **Rota:** `/projetos/novo` · relacionadas: `/projetos/[projectId]/editar`, `/projetos/[projectId]/copiar-estrutura`
- **Situação:** Disponível
- **Quem vê:** Sem item no menu: aberta por link, botão, e-mail ou outra tela

**1. Nome e finalidade.** Criar e editar obras: Telas do Administrador para criar uma obra nova, editar os dados de uma obra e copiar a estrutura de uma obra existente.

**2. Funcionalidades**
- NOVO PROJETO.
- Editar projeto.
- Copiar estrutura (equipe e configuração) de outra obra.

**3. Informações e indicadores exibidos**
- Formulário com os dados da obra.

**4. Passo a passo**
1. Em Selecione um projeto, clique em NOVO PROJETO (ou em Editar projeto no cartão da obra).
2. Preencha o formulário e salve.
3. Para copiar a estrutura, use a opção de copiar estrutura da obra.

**5. Regras e significados de status**
- Quem não é Administrador é redirecionado; a barreira real está nas próprias rotas.

**6. Permissões.** Somente Administrador; os demais perfis são redirecionados.

**7. Integração com outros módulos**
- A equipe criada aparece em Usuários.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Quem cria uma obra nova?
  **R:** Somente o Administrador: o botão NOVO PROJETO aparece em Selecione um projeto. Quem não é Administrador é redirecionado.

**9. Limitações e o que ainda não está liberado**
- Telas de criação e edição ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Abre pelo link ou botão e executa as ações disponíveis.
- Gerente (Gestor): Abre pelo link ou botão; as ações seguem o nível Gerente.
- Colaborador: Abre pelo link ou botão; as ações seguem o nível Colaborador.
- Leitura: Abre pelo link ou botão apenas para consultar, quando o servidor liberar.

**Capturas de tela:** Tela "Criar e editar obras" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/projetos/novo/page.tsx`, `apps/web/app/projetos/[projectId]/editar/page.tsx`, `apps/web/app/projetos/[projectId]/copiar-estrutura/page.tsx`

### 12.2 Usuários

- **Tipo:** menu
- **Rota:** `/[projectId]/usuarios`
- **Situação:** Disponível
- **Quem vê:** Somente Administrador da obra

**1. Nome e finalidade.** Usuários: Controle de acesso da obra: usuários, cargos, áreas, permissões, WhatsApp de alerta crítico e a matriz de responsabilidades e prazos.

**2. Funcionalidades**
- Adicionar usuário que já fez login ou pré-cadastrar.
- Editar cargo e permissão.
- Desativar e reativar.
- Matriz de responsabilidades e prazos.

**3. Informações e indicadores exibidos**
- Origem, cargo, área, permissão e status de cada pessoa.

**4. Passo a passo**
1. Abra Usuários (Administrador).
2. Use + Adicionar usuário, busque o e-mail do domínio axion.com.br, escolha Permissão e Área e confirme.
3. Se a pessoa nunca entrou, use Pré-cadastrar.
4. Para tirar o acesso, use Desativar: o histórico é mantido.

**5. Regras e significados de status**
- Participar de um e-mail ou comunicação não concede acesso ao ACC.
- Desativar mantém o histórico.

**6. Permissões.** Só o Administrador da obra vê o item no menu e abre a tela; os demais perfis não a veem (a rota também é protegida, não só o menu).

**7. Integração com outros módulos**
- Todas as abas dependem das permissões definidas aqui.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Como libero a obra para uma pessoa?
  **R:** Na tela Usuários (só o Administrador a vê): + Adicionar usuário, busque o e-mail do domínio axion.com.br, escolha a Permissão e a Área e confirme. Se a pessoa nunca entrou, use Pré-cadastrar.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê o item no menu, abre a tela e executa as ações.
- Gerente (Gestor): Não vê o item no menu e não abre a tela.
- Colaborador: Não vê o item no menu e não abre a tela.
- Leitura: Não vê o item no menu e não abre a tela.

**Capturas de tela:** Tela "Usuários" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/usuarios/page.tsx`, `docs/manual-referencia-acc.md (4.30)`

### 12.3 Competências

- **Tipo:** menu
- **Rota:** `/[projectId]/competencias`
- **Situação:** Ainda não liberada
- **Quem vê:** Membros ativos com nível Leitura ou superior

**1. Nome e finalidade.** Competências: Governança das competências profissionais: solicitações, validação por pessoa independente, revalidação e validadores designados. Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.

**2. Funcionalidades**
- Nenhuma operação de escrita está liberada nesta versão.

**3. Informações e indicadores exibidos**
- A tela pode abrir para consulta.

**4. Passo a passo**
1. Não há passo a passo: as operações desta aba ainda não estão liberadas.

**5. Regras e significados de status**
- Situação: ainda não liberada.
- Atos que exigem habilitação continuam seguindo a regra vigente, sem passar por esta tela.

**6. Permissões.** Membros ATIVOS com nível Leitura ou superior veem a tela. Quem não é membro ativo da obra não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Qualidade, Garantias e Seguros.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Posso solicitar uma competência pela aba Competências?
  **R:** Não nesta versão: as operações da aba Competências (solicitar, validar, revalidar, designar validador) ainda não estão liberadas. Não há instrução de uso a seguir; quando forem liberadas, o manual e a AXIA serão atualizados.

**9. Limitações e o que ainda não está liberado**
- Esta aba ainda não está liberada no ACC: o registro por ela não está liberado ao usuário. Não há instrução de uso a seguir; quando for liberada, o manual e a AXIA serão atualizados.
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela; registra o que o nível Colaborador permite.
- Leitura: Vê a tela e consulta; não grava.

**Capturas de tela:** Tela "Competências" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/competencias/page.tsx`, `apps/web/lib/permissions/nav-access.ts`, `apps/web/lib/ui/help/manifests/governanca.ts`

### 12.4 Aprovações externas

- **Tipo:** menu
- **Rota:** `/[projectId]/aprovacoes-externas`
- **Situação:** Disponível
- **Quem vê:** Membros ativos com nível Colaborador ou superior (Leitura não vê)

**1. Nome e finalidade.** Aprovações externas: Preparação e decisão de comunicações a destinatários externos. A aprovação vale uma vez e fica presa ao conteúdo. Esta tela nunca envia e-mail.

**2. Funcionalidades**
- Preparar um envio informando destinatários, ação e conteúdo.
- Decidir (quem tem permissão).

**3. Informações e indicadores exibidos**
- Estado de cada preparação.

**4. Passo a passo**
1. Abra Aprovações externas (Colaborador ou superior).
2. Prepare o envio.
3. Quem decide aprova ou recusa.

**5. Regras e significados de status**
- A aprovação é de uso único e fica ligada ao conteúdo (hash).

**6. Permissões.** Membros ATIVOS com nível Colaborador ou superior veem a tela; o perfil Leitura não a vê (o menu esconde, mas a rota e o banco também bloqueiam).

**7. Integração com outros módulos**
- Seguros (minutas) e Solicitações.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** A aba Aprovações externas envia e-mail?
  **R:** Não: ela só prepara e registra a decisão sobre comunicações a destinatários externos. A aprovação vale uma vez e fica presa ao conteúdo.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis.
- Gerente (Gestor): Vê a tela; as ações seguem o nível Gerente.
- Colaborador: Vê a tela e faz o que o nível Colaborador permite.
- Leitura: Não vê o item no menu e não abre a tela.

**Capturas de tela:** Tela "Aprovações externas" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/aprovacoes-externas/page.tsx`, `apps/web/lib/permissions/nav-access.ts`

### 12.5 Start-up ACC

- **Tipo:** menu
- **Rota:** `/[projectId]/startup`
- **Situação:** Disponível
- **Quem vê:** Somente Administrador da obra

**1. Nome e finalidade.** Start-up ACC: Validação dos riscos históricos Alto e Crítico anteriores ao início operacional do ACC, com uma decisão humana por achado.

**2. Funcionalidades**
- Configurar as datas da obra.
- Decidir cada achado histórico.
- Concluir o Start-up do projeto.

**3. Informações e indicadores exibidos**
- Estado do Start-up e legenda de risco.

**4. Passo a passo**
1. Abra Start-up ACC (Administrador).
2. Salve as datas.
3. Decida cada achado.
4. Clique em Concluir Start-up do projeto.

**5. Regras e significados de status**
- Concluir grava o marco sem reescrever nenhum achado.

**6. Permissões.** Só o Administrador da obra vê o item no menu e abre a tela; os demais perfis não a veem (a rota também é protegida, não só o menu).

**7. Integração com outros módulos**
- Eventos e Dashboard.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Para que serve o Start-up ACC?
  **R:** Para validar, com decisão humana, os riscos Alto e Crítico do histórico anterior ao início operacional do ACC. Concluir grava o marco sem reescrever nenhum achado.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê o item no menu, abre a tela e executa as ações.
- Gerente (Gestor): Não vê o item no menu e não abre a tela.
- Colaborador: Não vê o item no menu e não abre a tela.
- Leitura: Não vê o item no menu e não abre a tela.

**Capturas de tela:** Tela "Start-up ACC" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/startup/page.tsx`, `docs/manual-referencia-acc.md (4.35)`

## 13. Demais abas

Ajuda e tutorial e as telas fora do menu que continuam acessíveis.

### 13.1 Ajuda e tutorial

- **Tipo:** menu
- **Rota:** `/[projectId]/ajuda`
- **Situação:** Disponível
- **Quem vê:** Todos os membros ativos da obra

**1. Nome e finalidade.** Ajuda e tutorial: Reúne o tutorial do ACC: PDF para consulta e PowerPoint editável, com imagens das telas e dos e-mails de alerta (dados fictícios).

**2. Funcionalidades**
- Abrir o PDF.
- Baixar o PowerPoint.
- Abrir a conversa com a AXIA.

**3. Informações e indicadores exibidos**
- Links do tutorial.

**4. Passo a passo**
1. Abra Ajuda e tutorial no menu da obra.
2. Escolha PDF ou PowerPoint.

**5. Regras e significados de status**
- Os ícones de ajuda nas telas explicam cada módulo.

**6. Permissões.** Todo membro ATIVO da obra vê a tela. O que cada perfil consegue gravar é decidido pelo servidor e pelo banco; se uma ação for recusada, peça ao Administrador da obra.

**7. Integração com outros módulos**
- AXIA.

**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**
- **P:** Onde fica o tutorial?
  **R:** Em Ajuda e tutorial, no menu da obra: PDF para consulta e PowerPoint para edição.

**9. Limitações e o que ainda não está liberado**
- Tela ainda em validação final de uso.

**10. Diferenças entre perfis**
- Administrador: Vê a tela e executa as ações disponíveis nela; é quem gerencia usuários e configurações da obra.
- Gerente (Gestor): Vê a tela; as ações de gravação seguem o que o banco permite ao nível Gerente (a tela mostra Gerente).
- Colaborador: Vê a tela e faz os registros que o nível Colaborador permite.
- Leitura: Só consulta; não grava.

**Capturas de tela:** Tela "Ajuda e tutorial" (captura de tela ainda não disponível)

**Fontes:** `apps/web/app/[projectId]/ajuda/page.tsx`, `docs/manual-referencia-acc.md (4.33)`
