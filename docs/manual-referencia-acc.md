# Manual de Referência do ACC — Axion Contract Intelligence

> **Estado:** rascunho para revisão de Reynaldo. Elaborado por leitura do código e da documentação do repositório em 04/11/2026 (base: produção `a83843d`). Nenhuma tela foi aberta em navegador autenticado nesta análise: o que vale para o comportamento em tela vem de leitura de código, de migrations e de testes automatizados. Itens verificados por execução em banco de teste (PGlite) estão assinalados como **PROVADO POR EXECUÇÃO**.
>
> **Como ler as fontes:** caminhos relativos a `apps/web/` salvo indicação (`docs/…`, `scripts/…`, `supabase/…` são da raiz). `arquivo:linha` reflete o código desta data e pode deslocar.
>
> **Rótulos de situação** — **IMPLEMENTADO**: existe no código. **VALIDADO NO PILOTO**: há documento ou teste que comprova (o único ensaio com e-mails reais foi em banco isolado e só para CRÍTICO; **nada está comprovado em produção**). **DEPENDE DE CONFIGURAÇÃO**: exige variável, flag, tabela ou cadastro. **Dn / En**: divergência registrada para revisão (Anexos A a D).
>
> **Textos atuais × sugestões:** em todo o manual, os textos hover e avisos **atuais** (literais da tela, com fonte) ficam em tabelas separadas das **sugestões de melhoria**, que não foram aplicadas ao código.
>
> **Q&A da AXIA:** o rascunho por aba está em `docs/qa-axia-por-aba-rascunho.md`, com fonte neste manual e espaço para perguntas de Reynaldo. **É um rascunho em revisão e a AXIA ainda NÃO o consulta**: ela continua respondendo pela base fixa de `lib/assistant/knowledge.ts`; a ligação do Q&A aprovado à AXIA está pendente.

## Sumário

1. Conceito do ACC
2. Perfis, permissões e regras gerais
3. Mapa de navegação
4. Fluxos por aba
5. Textos hover, avisos e dicas — como funcionam
6. Classificação de riscos
7. Escalonamento de alertas
8. Uso dos especialistas
9. Q&A e textos de ajuda
- Anexos: A (divergências de riscos e escalonamento), B (divergências de especialistas), C (itens não encontrados), D (divergências por aba), E (verificações em ambiente de teste)

---

## 1. CONCEITO DO ACC

O **ACC (Axion Contract Intelligence)** é o sistema da Axion para acompanhar contratos de obra com rastreabilidade. Ele reúne documentos do contrato (contrato-base, aditivos, editais, propostas), e-mails e relatórios semanais da obra e os transforma em **eventos**, **alertas** e **providências**, sempre com a origem consultável e com **revisão humana** nas decisões.

**O que o ACC faz**
- **Guarda e lê documentos** (Documentos, Jurídico): versões, tipo, idioma, extração de texto e OCR com marcação de cobertura parcial (cap. 6.2).
- **Registra eventos com possível implicação contratual** (EVENTOS, Timeline) e confronta cada evento com as cláusulas, com aprovação humana.
- **Classifica o risco** em Baixo, Médio, Alto e Crítico por critérios adotados pela Axion; a sugestão é uma regra, a IA só propõe de forma provisória e quem registra o grau é uma pessoa, com justificativa e histórico imutável (cap. 6).
- **Dispara e cobra alertas** com prazos de ação por criticidade (SLA), escalonamento do responsável ao gestor e à Diretoria, lembretes recorrentes e resumos semanais (cap. 7).
- **Acompanha providências**, obrigações **ESG/SSMA** (inclusive o app de campo, com fila offline), solicitações e o relatório semanal (cronograma, financeiro).
- **Oferece cinco especialistas de IA** (Comercial, Jurídico, Planejamento, ESG e CEO) para apoio à decisão e a **AXIA**, assistente de uso do sistema que, nesta fase, **responde apenas por texto** (cap. 8).

**Princípios que valem em todas as abas** (regras permanentes do projeto, `CLAUDE.md`)
1. **Rastreabilidade:** toda informação derivada mantém o caminho até a fonte original; os documentos e evidências originais não são alterados.
2. **IA com revisão humana:** a IA indica evidências, **diferencia fato, inferência e recomendação** e nunca decide sozinha (cap. 8.1). Nada enviado ou executado pela IA sem pessoa.
3. **Segredos só no servidor:** chaves e credenciais nunca vão ao navegador, ao Git ou aos logs.
4. **Arquitetura simples:** aplicação web única (Next.js/React/TypeScript) sobre banco PostgreSQL (Supabase), sem microsserviços.
5. **Canais externos nascem desligados:** WhatsApp e voz (ElevenLabs) ficam desligados por padrão; o e-mail tem modo piloto com trava de destinatário.

**Estado desta fase (Fase 1)**
- A **AXIA responde somente por texto**. A voz Elena Vinter (ElevenLabs) fica para a **Fase 3**; a integração e o Voice ID foram preservados, desligados.
- **Imagem da AXIA:** esta versão usa o **ícone neutro provisório** derivado do ícone oficial da marca ACC (`apps/web/public/assistente/ajuda-acc.png`). A arte definitiva da AXIA só entra depois de comprovadas a origem e os direitos de uso (autoria/licença e, se houver pessoa retratada, consentimento); ver `docs/vera-autorizacao-email-e-voz.md` §1.
- Os alertas automáticos e o piloto de e-mail **não estão comprovados em produção**: o ensaio com e-mails reais foi em ambiente isolado, e o documento do piloto registra as variáveis do piloto por projeto como ausentes na produção em 04/11/2026, **mas a leitura da configuração da Vercel nessa data mostra que elas existem** (criadas em 03/11/2026, antes do último deploy; os valores não foram lidos) — ver Anexo E (`docs/piloto-projeto-email.md`).
- A produção roda o commit `a83843d` (merge do PR #128).

**Entrada no sistema:** login com conta Google corporativa (`@axion.com.br`); o acesso é **por projeto**, não basta ter a conta (seção 4.1). A faixa **"SISTEMA EM TESTE"** aparece em todas as páginas até a configuração `NEXT_PUBLIC_ACC_TEST_MODE=false` e novo deploy.

---

## 2. PERFIS, PERMISSÕES E REGRAS GERAIS

**Perfis por obra** (rótulos de tela em `lib/labels.ts:110-116`): **Administrador**; **Gerente** (o valor legado GESTOR é tratado como sinônimo); **Colaborador**; **Leitura**. A AXIA ainda diz "três perfis" (D12 do Anexo B).

**Regra real do banco (PROVADA POR EXECUÇÃO em 04/11/2026, ver Anexo E):** a função `has_project_permission` só devolve verdadeiro para **escrita** quando o perfil é **ADMINISTRADOR**. Gestor, Gerente, Colaborador e Leitura têm nível 1 (**somente leitura**); a exigência histórica "EDITOR" equivale ao nível 2, que só o administrador alcança (`supabase/migrations/20260829200000_project_permission_gerente_compat.sql:69-119`). A leitura é de qualquer membro **ativo** da obra (RLS). **SEM PROVA:** que a produção tenha a mesma definição.

**Consequência — a tela promete mais do que o banco aceita em vários pontos:** Providências, Classificação de risco, concluir alerta de providência, Revisão de cláusulas e Start-up mostram formulários a perfis que o banco recusa ao salvar, e alguns textos citam "EDITOR ou ADMIN" ou "gestor, gerente ou administrador". As mensagens de erro do banco chegam em inglês em alguns pontos. Lista em Anexo D.

**Esconder o menu nunca é a única barreira:** itens restritos (Financeiro, Autorizações, Start-up ACC) somem do menu, mas rota, carregador, ações e RLS aplicam a mesma regra (`lib/ui/nav-items.ts:17-22`).

**Regras gerais de tela**
- Todas as rotas exigem login, exceto `/login`, `/auth/callback` e rotas de cron (`proxy.ts:46-66`); sem sessão, o destino fica em `?next=`.
- Todas as abas são **por obra** (`/{obra}/…`); o projeto vem da URL e é revalidado no servidor.
- Erros e mensagens: o ideal do sistema é mensagem segura em português; há exceções registradas no Anexo D.

---

## 3. MAPA DE NAVEGAÇÃO

Menu lateral (`lib/ui/nav-items.ts:26-53`):

| Aba (rótulo) | Rota | Restrição de menu | Seção do manual |
|---|---|---|---|
| Dashboard | `/{obra}/dashboard` | — | 4.2 |
| Timeline | `/{obra}/timeline` | — | 4.3 |
| EVENTOS | `/{obra}/ledger` | — | 4.4 a 4.6 |
| Solicitações | `/{obra}/action-requests` | — | 4.7 |
| Ações e Escalonamentos | `/{obra}/acoes` | — | 4.8 a 4.11 |
| Jurídico | `/{obra}/juridico` | — | 4.20 |
| Documentos | `/{obra}/documentos` | — | 4.23 |
| Providências | `/{obra}/providencias` | — | 4.17 |
| Financeiro | `/{obra}/financeiro` | papel Administrador/Gerente ou área Diretoria/Financeiro; depende de `ACC_WEEKLY_REPORTS_ENABLED` | 4.24 |
| ESG/SSMA | `/{obra}/esg` | — | 4.27 a 4.29 |
| Experts IA | `/{obra}/experts-ia` | — | 4.25 e cap. 8 |
| Integrações | `/{obra}/integracoes` | — | 4.26 |
| Usuários | `/{obra}/usuarios` | — | 4.30 |
| Autorizações | `/{obra}/autorizacoes` | só Administrador | 4.31 |
| Auditoria | `/{obra}/auditoria` | — | 4.32 |
| Ajuda e tutorial | `/{obra}/ajuda` | — | 4.33 e 4.34 |
| Start-up ACC | `/{obra}/startup` | só Administrador | 4.35 |

**Fora do menu (existem):** Revisão contratual (`/revisao-contratual`) e Revisão de cláusulas (`/revisao-clausulas`) — saíram da barra lateral, o Expert Jurídico é o ponto único de análise; Matriz de SLA (`/acoes/configuracao`, sem link na interface); Registros de campo (`/ssma-registros`, botão em ESG/SSMA); alertas (`/alertas/…`, abertos pelos e-mails), ação de e-mail (`/email-actions/{token}`); app de campo (`/ssma`); AXIA (`/vera`); Adicionais (`/adicionais`, só redireciona para Documentos).

#### Itens restritos do menu e hover do menu (detalhe)

Itens do menu e restrição, `lib/ui/nav-items.ts:26-53`:

| Aba | Rota | Restrição de menu |
|---|---|---|
| ESG/SSMA | `/{obra}/esg` | nenhuma (`nav-items.ts:45`) |
| Usuários | `/{obra}/usuarios` | nenhuma (`nav-items.ts:48`) |
| Autorizações | `/{obra}/autorizacoes` | `restrictedTo: "admin"` (`nav-items.ts:49`) |
| Auditoria | `/{obra}/auditoria` | nenhuma (`nav-items.ts:50`) |
| Ajuda e tutorial | `/{obra}/ajuda` | nenhuma (`nav-items.ts:51`) |
| Start-up ACC | `/{obra}/startup` | `restrictedTo: "admin"` (`nav-items.ts:52`) |

- "admin" = membership ATIVA com permissão exatamente `ADMINISTRADOR` (`app/[projectId]/layout.tsx:32-44`). Itens restritos são removidos da lista renderizada (`layout.tsx:46-50`; `components/layout/app-sidebar.tsx:96`). O próprio código declara que esconder o menu nunca é a única barreira (`nav-items.ts:17-22`).
- Hover de cada item do menu: `title` nativo = `"{rótulo} — {shortDescription}"` (`components/layout/app-sidebar.tsx:119`), com o texto de `ACC_FEATURE_HELP` do `helpId` do item.
- Todas as rotas exigem login: visitante sem sessão é redirecionado a `/login` com `?next=` (`proxy.ts:46-66`; só `/login`, `/auth/callback` e rotas de cron são públicas).

**Índice das seções do capítulo 4**

- 4.1 Entrada no sistema, seleção de projeto e faixa "SISTEMA EM TESTE"
- 4.2 Dashboard
- 4.3 Timeline
- 4.4 EVENTOS (lista)
- 4.5 EVENTOS — detalhe do evento, confronto evento × cláusula, curadoria, notas e envio de alerta
- 4.6 EVENTOS — Responder alertas do ACC (lote de alertas)
- 4.7 Solicitações
- 4.8 Ações e Escalonamentos
- 4.9 Botão "Verificar escalonamentos"
- 4.10 Matriz de SLA e Escalonamento
- 4.11 Resumo semanal de alertas (riscos médios e baixos)
- 4.12 Alerta de risco (alerta formal)
- 4.13 Resposta rápida de alertas de evento (lote de e-mail)
- 4.14 Resposta rápida de alerta de providência
- 4.15 Consultar IA sobre o alerta
- 4.16 Ação de e-mail (botões do e-mail acionável)
- 4.17 Providências
- 4.18 Classificação de risco (painel "Grau de risco" e seção "Classificação de risco") — aparece em `/{obra}/ledger/[eventId]` e dentro de `/{obra}/providencias` (Editar > Grau de risco)
- 4.19 Adicionais
- 4.20 Jurídico
- 4.21 Revisão contratual (menu: "Análise Contratual", cabeçalho: "Revisão Contratual")
- 4.22 Revisão de cláusulas
- 4.23 Documentos
- 4.24 Financeiro
- 4.25 Experts IA
- 4.26 Integrações
- 4.27 ESG/SSMA
- 4.28 ESG/SSMA — Registros de campo
- 4.29 ESG/SSMA — App de campo (PWA)
- 4.30 Usuários
- 4.31 Autorizações
- 4.32 Auditoria
- 4.33 Ajuda e tutorial
- 4.34 AXIA — "Fale com a AXIA" (caixa de conversa) e rota `/vera`
- 4.35 Start-up ACC

---

## 4. FLUXOS POR ABA

> Cada seção traz: para que serve, quem acessa e permissões (o que a tela mostra × o que o servidor exige), fluxo principal, estados e exceções, **textos hover e avisos atuais** (tabela com fonte), **sugestões de melhoria** (separadas) e fontes. Os temas de riscos, escalonamento e especialistas ficam nos capítulos 6, 7 e 8 e são apenas referenciados.

### 4.1 Entrada no sistema, seleção de projeto e faixa "SISTEMA EM TESTE" — rotas `/`, `/login`, `/projetos` (e `/{obra}/dashboard` como destino)

- **Para que serve**
  Porta de entrada do ACC. `/` apenas redireciona para `/projetos` (`app/page.tsx:3-4`). `/login` autentica com a conta Google corporativa. `/projetos` lista as obras do usuário e leva ao Dashboard da obra escolhida (`app/projetos/page.tsx:99`). A faixa "SISTEMA EM TESTE" aparece no topo de todas as páginas, inclusive no login (`app/layout.tsx:36`).

- **Quem acessa / permissões**
  - `/login` é pública, assim como `/auth/callback` e rotas de cron (`proxy.ts:50-58`). Qualquer outra rota sem sessão redireciona para `/login?next=<destino>` (`proxy.ts:60-75`).
  - Só contas `@axion.com.br` entram; o domínio é validado no servidor mesmo que o Google já restrinja (`app/auth/callback/route.ts:8-10,69-78`). Conta fora do domínio tem a sessão revogada e volta ao login com erro (`app/auth/callback/route.ts:73-78`).
  - `/projetos` mostra apenas projetos com `workspaceType === "OBRA"` que a RLS devolve ao usuário (`app/projetos/page.tsx:16-19`, `lib/data.ts:143-163`). Ter conta Google corporativa não basta: o acesso é "por projeto" (`app/login/page.tsx:52-54`).
  - Botão NOVO PROJETO e botão "Editar projeto" por cartão só aparecem se o usuário é ADMINISTRADOR ativo em ao menos um projeto (NOVO PROJETO) ou naquele projeto (Editar) (`app/projetos/page.tsx:51,79-84,134-141`). A barreira real das telas de criação/edição está nas próprias rotas (`/projetos/novo`, `/projetos/{id}/editar`) — não analisadas aqui.
  - Para não administradores o prefixo `[DEV]` é removido do nome do projeto na lista (`app/projetos/page.tsx:46-49`).
  - Faixa de teste: visível para todos; não depende de perfil.
  - **DEPENDE DE CONFIGURAÇÃO:** a faixa só some com `NEXT_PUBLIC_ACC_TEST_MODE=false` (valor exato) + novo deploy. Ausente, vazio, "true" ou qualquer outro valor mostra a faixa (`lib/test-mode.ts:11-15`; `.env.example:1-8`). Não há desligamento por data (`lib/test-mode.ts:6-7`; `docs/product-go-live.md:18-22`).

- **Fluxo principal**
  1. Abrir o endereço do ACC. Sem sessão, o sistema leva a `/login` e guarda o destino original em `?next=` (`proxy.ts:60-75`).
  2. Clicar em "Entrar com Google" (`app/login/google-signin-button.tsx:34`). O botão passa a "Redirecionando para o Google..." e fica desabilitado.
  3. Escolher a conta corporativa no Google. O retorno passa por `/auth/callback`, que troca o código por sessão e valida o domínio (`app/auth/callback/route.ts:36-78`).
  4. O usuário vai para o destino guardado (se for um caminho interno seguro) ou para `/projetos` (`app/auth/callback/route.ts:22-26`; `lib/safe-redirect.ts:10-40`).
  5. Em "Selecione um projeto", clicar no cartão da obra abre `/{obra}/dashboard` (`app/projetos/page.tsx:99`).
  6. Dentro da obra, o seletor de projeto no topo troca de obra e sempre cai no Dashboard da obra escolhida (`components/layout/project-switcher.tsx:23`). "Sair" (ícone no topo) encerra a sessão e volta a `/login` (`components/auth/logout-button.tsx:9-12`; `lib/auth-actions.ts:6-10`).
  7. Cartão azul "Jurídico IA" leva a `/juridico` (análise de minuta antes da contratação, fora de uma obra específica) (`app/projetos/page.tsx:145-165`).

- **Estados e exceções**
  - Erros no login (`app/login/page.tsx:10-14,58`): `oauth_missing_code` e `oauth_exchange_failed` mostram "Não foi possível concluir o login com Google. Tente novamente."; `domain_not_allowed` mostra "Acesso restrito a contas do domínio @axion.com.br.".
  - Sem projetos para a conta: "Nenhum projeto disponível para sua conta." (`app/projetos/page.tsx:94`).
  - Acessar `/{obra}/...` de obra inexistente ou sem acesso: o layout responde página não encontrada (404), sem explicação de permissão (`app/[projectId]/layout.tsx:21-22`).
  - A barra lateral esconde "Autorizações" e "Start-up ACC" de quem não é ADMINISTRADOR e "Financeiro" de quem não passa na regra financeira; esconder o menu não é a barreira — rota, loader, actions e RLS aplicam a mesma regra (`app/[projectId]/layout.tsx:42-47`; `lib/ui/nav-items.ts:21-25,38,50,52`). Financeiro só aparece se a flag de relatórios semanais estiver ligada (**DEPENDE DE CONFIGURAÇÃO**: `ACC_WEEKLY_REPORTS_ENABLED`, `lib/feature-flags/weekly-reports.ts:22-24`; `app/[projectId]/layout.tsx:25-29`).
  - Acesso financeiro: ADMINISTRADOR ou GERENTE, ou área DIRETORIA/FINANCEIRO (`lib/financial/access.ts:17-35`).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | arquivo:linha |
|---|---|---|
| Faixa global | `SISTEMA EM TESTE` (role="status") | `lib/test-mode.ts:17`; `components/layout/test-mode-banner.tsx:15-21` |
| Login, título | `AXION Controle de Contratos` | `app/login/page.tsx:51` |
| Login, descrição | `Acesso restrito a usuários autorizados por projeto — autenticação exclusiva pela conta Google corporativa.` | `app/login/page.tsx:52-54` |
| Botão Google | `Entrar com Google` / `Redirecionando para o Google...` | `app/login/google-signin-button.tsx:34` |
| Erro OAuth | `Não foi possível concluir o login com Google. Tente novamente.` | `app/login/page.tsx:10-11` |
| Erro de domínio | `Acesso restrito a contas do domínio @axion.com.br.` | `app/login/page.tsx:12` |
| Projetos, título | `Selecione um projeto` | `app/projetos/page.tsx:69` |
| Projetos, subtítulo | `Obras e projetos Axion com inteligência contratual ativa.` | `app/projetos/page.tsx:73` |
| Botão criar | `NOVO PROJETO` | `app/projetos/page.tsx:82` |
| Botão editar (cartão) | `Editar projeto` | `app/projetos/page.tsx:139` |
| Cartão da obra | `No. sistema UNO: {código} · Contrato {nº} · Início {data} · Prazo baseline {data}` | `app/projetos/page.tsx:119-124` |
| Cartão Jurídico IA (title) | `Criar ou abrir uma análise de minuta antes da contratação da obra.` | `app/projetos/page.tsx:148` |
| Cartão Jurídico IA | `Jurídico IA` / `Análise prévia de minutas para apoiar a negociação contratual, com consulta integrada aos especialistas do CEO IA.` | `app/projetos/page.tsx:155-161` |
| Sem projetos | `Nenhum projeto disponível para sua conta.` | `app/projetos/page.tsx:94` |
| Seletor de projeto (title) | nome completo do projeto atual | `components/layout/project-switcher.tsx:28` |
| Topo, título | `AXION Controle de Contratos` | `components/layout/top-bar.tsx:36-38` |
| Topo, editar projeto (title/aria-label) | `Editar projeto` | `components/layout/top-bar.tsx:75-76` |
| Topo, código/contrato | `Contrato {nº}` | `components/layout/top-bar.tsx:69` |
| Sair (title/aria-label) | `Sair` | `components/auth/logout-button.tsx:10` |
| Menu lateral, item (title) | `<Rótulo> — <descrição curta do FeatureInfo>` (ex.: `Dashboard — Visão executiva do contrato e dos principais riscos.`) | `components/layout/app-sidebar.tsx:115-125` |
| Menu lateral, recolher | `Expandir menu` / `Recolher menu`; aria-label `Expandir menu lateral` / `Recolher menu lateral` | `components/layout/app-sidebar.tsx:152-153` |
| Hover automático em campos | `Função deste campo: <aria-label, senão placeholder, senão rótulo, senão name>.` | `components/shared/automatic-field-help.tsx:17-18` |

- **Sugestões de melhoria dos textos**
  - `No. sistema UNO` (`app/projetos/page.tsx:119`): "UNO" e "No." são jargão interno; sugestão "Código do projeto: {código}" (o rótulo da barra superior mostra só o código, sem "UNO").
  - Faixa "SISTEMA EM TESTE" não explica o efeito prático (dados de teste? e-mails redirecionados?). Sugestão de apoio no hover/aria: "Ambiente em fase de testes; os envios de e-mail podem ser redirecionados" — só se confirmado pela operação (modo piloto, `lib/email/send-outcome.ts:60-65`).
  - Erro de domínio e de OAuth não dizem a quem pedir acesso. Sugestão: acrescentar "Em caso de dúvida, fale com o administrador do projeto."
  - A página 404 de obra sem acesso não diferencia "não existe" de "sem permissão"; considerar mensagem "Você não tem acesso a este projeto ou ele não existe."
  - O hover automático `Função deste campo: ...` usa placeholder/`name` bruto quando não há rótulo (ex.: `Função deste campo: destinatario@exemplo.com.`). Ver sugestões nas abas abaixo.

- **Fontes**
  `app/page.tsx`, `app/login/page.tsx`, `app/login/google-signin-button.tsx`, `app/auth/callback/route.ts`, `proxy.ts`, `lib/safe-redirect.ts`, `app/projetos/page.tsx`, `app/[projectId]/layout.tsx`, `components/layout/{test-mode-banner,top-bar,project-switcher,app-sidebar}.tsx`, `lib/test-mode.ts`, `lib/ui/nav-items.ts`, `.env.example`, `docs/product-go-live.md`.

---

### 4.2 Dashboard — rota `/{obra}/dashboard` (a rota `/{obra}/dashboard/visual` só redireciona para ela)

- **Para que serve**
  Painel executivo da obra em uma tela: alertas ativos, quantidade de eventos, risco atual, integrações, aditivos, avanço físico, financeiro resumido, SSMA, prazo/planejamento, distribuição dos alertas e status do relatório semanal. Texto de ajuda no menu: "Visão executiva do contrato e dos principais riscos." (`lib/ui/feature-help.ts:23-28`). Não há ação de edição nesta tela (só leitura).

- **Quem acessa / permissões**
  - UI: qualquer membro que chegue à obra vê o Dashboard; a página não faz checagem de perfil (`app/[projectId]/dashboard/page.tsx:215-228`).
  - Servidor/RLS: os dados vêm de consultas com a sessão do usuário, portanto limitadas pela RLS (membro do projeto). A aba FINANCEIRO do relatório semanal só é devolvida a quem passa em `can_view_project_financial_dashboard` (ADMINISTRADOR, GERENTE, ou área DIRETORIA/FINANCEIRO) (`supabase/migrations/20260920120000*.sql:1484-1490`; `lib/financial/access.ts:17-35`). Para os demais perfis, os painéis financeiros caem em "Não disponível" (`app/[projectId]/dashboard/page.tsx:478-481`). Esse efeito é inferido do código e da migração; **não testado em tela**.
  - Restrição de menu: o item "Dashboard" não tem restrição (`lib/ui/nav-items.ts:29`). O item "Financeiro" (outra aba) é restrito.
  - `/dashboard/visual`: redirecionamento fixo para `/{obra}/dashboard` (`app/[projectId]/dashboard/visual/page.tsx:3-10`). Os componentes antigos do "dashboard visual" (`components/dashboard-visual/*`, `components/dashboard/*`) não são importados por nenhuma página atual (busca em `app/`, `components/` e `lib/` sem resultado) — seus textos de ajuda existem em `lib/ui/feature-help.ts:144-240` mas **não aparecem na tela hoje**. Não existem subabas nem filtro de período visíveis; o carregamento usa fixo `range: "PROJECT"` (`app/[projectId]/dashboard/page.tsx:224`).

- **Fluxo principal**
  1. Entrar na obra (ou clicar em "Dashboard" na barra lateral).
  2. Ler o selo de integrações no cabeçalho (INTEGRAÇÕES ATIVAS / PARCIAIS / FALHA EM INTEGRAÇÃO / SEM INTEGRAÇÕES). Passar o mouse mostra o motivo; o motivo também aparece escrito abaixo do selo (`page.tsx:696-718`; `lib/ui/resolve-system-status.ts:35-58`).
  3. Conferir os seis cartões de topo: Alertas ativos, Eventos Ledger, Risco atual, Integrações, Aditivos, Avanço físico (`page.tsx:731-801`).
  4. Descer pelos painéis: Situação contratual, Financeiro resumido — R$ mil, SSMA — Segurança, Avanço físico/financeiro do contrato, Planejamento — recebimento por e-mail, Status das integrações, Distribuição dos alertas, Relatório semanal processado (`page.tsx:807-1308`).
  5. Para tratar um alerta ou evento, usar as abas EVENTOS, Ações e Escalonamentos (ver cap. 6 e 7) — o Dashboard não tem links de navegação nos cartões.

- **Estados e exceções**
  - Sem dado: "—", "Não disponível", "Não recebido", "Ausente" ou "Aguardando Curva S" conforme o campo (`page.tsx:793-797,1115-1117,1137-1139,1288-1306`). O rodapé afirma: "Nenhum indicador financeiro ou SSMA é estimado quando a fonte não está disponível." (`page.tsx:1335-1337`).
  - Risco atual: maior severidade entre os achados ativos; sem achado ativo mostra "SEM RISCO"; qualquer severidade abaixo de Média mostra "BAIXO" (`page.tsx:660-671`; `lib/dashboard-visual/resolve-active-findings-summary.ts:25-27,57-65`). Cores: CRÍTICO vermelho, ALTO laranja, MÉDIO âmbar, demais verde (`page.tsx:747-760`).
  - Integrações: "ATIVO" (conectado), "ATENÇÃO", "ERRO", "PENDENTE" (`page.tsx:1236-1246`). Fonte pendente de configuração gera "INTEGRAÇÕES PARCIAIS", nunca "falha" (`lib/ui/resolve-system-status.ts:1-14`).
  - Status de e-mail/anexo "EXTRACTED" ou "PROCESSED" aparece como selo "OK" (`page.tsx:121-133`); outros status técnicos aparecem como vêm do banco (ex.: valor cru de `processing_status`) (`page.tsx:1118-1121`).
  - SSMA: contagens vêm de formulários SSMA enviados, classificados por palavras-chave no texto ("acidente", "com/sem afastamento", "ocorrência"...) (`page.tsx:559-626`). Se não houver correspondência, mostra "—". É uma heurística, não um campo estruturado.
  - Efetivo, impacto climático e dias não trabalhados dependem do Diário de Obra (RDO) e do histograma do relatório semanal (`page.tsx:383-470,536-552`).
  - Data de término exibida = a mais cedo entre o fim contratual (baseline) e o fim do cronograma MPP (`page.tsx:395-398`) — a tela não informa qual das duas fontes foi usada.
  - Valor contratual "base" está fixo no código em R$ 33.450.000 (cláusula 5.1 do contrato WEG) e é usado para calcular "Aditivos" em qualquer obra (`page.tsx:487-500`). Em outra obra o painel Aditivos pode ficar incorreto. **Divergência a validar com o time técnico.**
  - Financeiro e rótulo "Faturamento Direto WEG" são fixos no texto (`page.tsx:1071,895-896`).
  - DEPENDE DE CONFIGURAÇÃO: integrações (Gmail, Drive etc.), recebimento do relatório semanal e do cronograma por e-mail (ver `docs/weekly-schedule-email-ingestion.md`).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | arquivo:linha |
|---|---|---|
| Menu lateral (title) | `Dashboard — Visão executiva do contrato e dos principais riscos.` | `lib/ui/feature-help.ts:23-28`; `components/layout/app-sidebar.tsx:125` |
| Texto longo do FeatureInfo "dashboard" (não exibido na tela; só catálogo) | `Consolida a situação atual do projeto, alertas, riscos, pendências, ações e análises dos Experts IA. É a visão rápida para identificar o que necessita atenção.` | `lib/ui/feature-help.ts:26-27` |
| Cabeçalho | `AXION CONTROLE DE CONTRATOS` / `Dashboard Executivo` / `{nome} · {código}` | `page.tsx:680,684,688-690` |
| Nome ausente | `Projeto não disponível` / `Código não disponível` | `page.tsx:688-690` |
| Selo de integrações (title) | motivo, ex.: `Falha em: <fontes>.` ou `<fontes> requer atenção; <fontes> pendente.` | `page.tsx:697`; `lib/ui/resolve-system-status.ts:41-56` |
| Selo — rótulos | `INTEGRAÇÕES ATIVAS`, `INTEGRAÇÕES PARCIAIS`, `FALHA EM INTEGRAÇÃO`, `SEM INTEGRAÇÕES` | `lib/ui/resolve-system-status.ts:35-56` |
| Sem integrações | `Nenhuma integração conhecida para este projeto.` | `lib/ui/resolve-system-status.ts:39` |
| Atualização | `Atualização operacional` / `Dados persistidos no ACC` | `page.tsx:721-724` |
| Cartão 1 | `Alertas ativos` / `Achados ainda ativos` | `page.tsx:733-735` |
| Cartão 2 | `Eventos Ledger` / `Eventos registrados` | `page.tsx:740-742` |
| Cartão 3 | `Risco atual` / `Situação consolidada` | `page.tsx:747,763` |
| Cartão 4 | `Integrações` (`x/y`) / `Fontes conectadas` | `page.tsx:768-770` |
| Cartão 5 | `Aditivos` / valor ou `Nenhum valor formalizado` | `page.tsx:775-781` |
| Cartão 6 | `Avanço físico` / `Aguardando Curva S` ou `Último relatório semanal` | `page.tsx:786-797` |
| Painel Situação contratual | `Situação contratual`; `Alertas ativos`; `Ações pendentes`; `Ações vencidas`; `Escalonamentos`; `Data de início`; `Data de término` | `page.tsx:807-852` |
| Painel Financeiro | `Financeiro resumido — R$ mil`; `Contrato + aditivos`; `Aditivos`; `Realizado total`; `Saldo`; nota `Valores em R$ mil · realizado inclui faturamento AXION + faturamento direto WEG.` | `page.tsx:855-897` |
| Painel SSMA | `SSMA — Segurança`; `Acidentes com afastamento`; `Acidentes sem afastamento`; `Ocorrências de segurança`; `Dias sem acidente` | `page.tsx:900-960` |
| Avanço | `Avanço físico do contrato` (`Avanço físico atual`; `Aguardando processamento da Curva S.`); `Avanço financeiro do contrato` (`Avanço financeiro`, `Faturamento AXION`, `Faturamento Direto WEG`, `Realizado total`, `Base contratual`, `Saldo`) | `page.tsx:971-1095` |
| Planejamento | `Planejamento — recebimento por e-mail`; `Cronograma atualizado`; `Relatório semanal`; `Não recebido`; `Dias decorridos`; `Dias não trabalhados`; `Impacto climático`; `Efetivo atual` (`N pessoas`); `Histograma {período}` | `page.tsx:1109-1205` |
| Status das integrações | `Status das integrações`; selos `ATIVO`, `ATENÇÃO`, `ERRO`, `PENDENTE` | `page.tsx:1211-1246` |
| Distribuição | `Distribuição dos alertas`; `Baixo`, `Médio`, `Alto`, `Crítico` | `page.tsx:1262-1272` |
| Relatório semanal | `Relatório semanal processado`; `Curva S`, `Linha de Base`, `Financeiro`, `SSMA`; valor `Ausente` | `page.tsx:1285-1308` |
| Aviso | `Atualização automática` / `Cronograma, relatório semanal, financeiro e SSMA são exibidos somente após o respectivo e-mail/anexo ter sido persistido e processado pelo ACC.` | `page.tsx:1317-1322` |
| Rodapé | `ACC · Dashboard executivo` / `Nenhum indicador financeiro ou SSMA é estimado quando a fonte não está disponível.` | `page.tsx:1333-1337` |

  Observação: a página **não usa FeatureInfo (ⓘ)** nem `title` em cartões; o único `title` próprio é o do selo de integrações (`page.tsx:697`).

- **Sugestões de melhoria dos textos**
  - "Eventos Ledger" (`page.tsx:740`) usa o termo técnico "Ledger"; o menu chama a aba de "EVENTOS". Sugestão: "Eventos registrados" como título e "Total de eventos" como subtítulo.
  - "Alertas ativos / Achados ainda ativos" mistura "alerta" e "achado" (a aba Providências e o cap. 6.1 distinguem trilhas de alerta). Sugestão: manter um termo só ("Achados ativos") ou explicar a diferença em um ⓘ.
  - "Distribuição dos alertas" mostra Baixo/Médio/Alto/Crítico sem dizer que se refere a **achados ativos** (não aos e-mails enviados).
  - "Risco atual — Situação consolidada": explicar no hover que é a maior severidade entre os achados ativos.
  - Status técnicos crus ("ATIVO"/"ERRO" ok, mas `processing_status` e `status` do relatório aparecem como vêm do banco, ex.: valor em inglês). Sugestão: traduzir para rótulos (Recebido, Processado, Falha).
  - "Data de término" não informa a fonte (baseline do contrato ou cronograma MPP): sugestão de ⓘ ou legenda "menor data entre prazo contratual e cronograma".
  - "Faturamento Direto WEG" e "valor base R$ 33.450.000" são específicos de um cliente; revisar antes de usar em outras obras.
  - Os ⓘ de `lib/ui/feature-help.ts:144-240` (dashboard visual, filtro de tempo etc.) não aparecem mais na tela: remover ou reativar para evitar manual prometendo algo que não existe.

- **Fontes**
  `app/[projectId]/dashboard/page.tsx`, `app/[projectId]/dashboard/visual/page.tsx`, `lib/dashboard-visual/get-dashboard-visual-data.ts`, `lib/dashboard-visual/resolve-active-findings-summary.ts`, `lib/ui/resolve-system-status.ts`, `lib/ui/resolve-integration-display-status.ts`, `lib/ui/feature-help.ts`, `lib/financial/access.ts`, `supabase/migrations/20260920120000*.sql`.

---

### 4.3 Timeline — rota `/{obra}/timeline` (com exportação do Timeline filtrado)

- **Para que serve**
  Linha do tempo cronológica dos eventos consolidados da obra, com busca em todo o acervo e filtros por fonte, categoria, período e participantes. Permite exportar o conjunto filtrado (dossiê PDF, índice XLSX/CSV, arquivos originais, ZIP) para uso jurídico, perícia ou arbitragem (`docs/timeline-export.md:1-14`). Descrição no cabeçalho: "Linha do tempo cronológica de todos os eventos consolidados." (`app/[projectId]/timeline/page.tsx:88`).

- **Quem acessa / permissões**
  - UI: a aba aparece para todos (`lib/ui/nav-items.ts:30`); o botão "Exportar Timeline Filtrado" não depende de perfil (`components/timeline/timeline-export-panel.tsx:222-236`).
  - Servidor/RLS: leitura por membro do projeto (consulta `getEvents` com a sessão). A exportação grava um registro em `timeline_exports` que a RLS permite a **qualquer membro do projeto, inclusive LEITURA** (exportar é reempacotar o que já se vê) (`docs/timeline-export.md:84-90`; `app/[projectId]/timeline/timeline-export-actions.ts:17-23`). O registro é somente de inclusão (sem UPDATE/DELETE) e gera auditoria `CONTRACTUAL_TIMELINE_EXPORTED` (`docs/timeline-export.md:78-84`).
  - Arquivos originais são obtidos pelo navegador com a sessão do usuário (URL assinada); se a RLS não libera o arquivo, ele entra no manifesto como `UNAVAILABLE`, nunca por outro caminho (`docs/timeline-export.md:36-44,100-108`). Nunca usa `service_role`.
  - A busca no acervo é uma Server Action que exige usuário autenticado ("Usuário não autenticado.") (`app/[projectId]/timeline/timeline-search-actions.ts:154-157`). Os critérios de acesso interno de cada fonte não foram detalhados aqui (**não verificado linha a linha**).

- **Fluxo principal**
  1. Abrir "Timeline". A tela já abre filtrada pelo período do projeto: início = data de início do projeto e fim = prazo baseline (`components/timeline/timeline-page-client.tsx:62-66`).
  2. (Opcional) Digitar em "Buscar palavra / assunto". Após ~350 ms a busca percorre o acervo (e-mails, anexos, documentos, conteúdo extraído, Diário de Obra, Construmanager, relatórios, eventos e anotações); aparece barra de progresso, "Buscando... N%", depois "N resultado(s) encontrado(s)" e "N itens examinados" (`timeline-page-client.tsx:140-217`; `components/timeline/timeline-filters.tsx:66-130`).
  3. Com busca ativa, a tela troca para "Timeline temática — N ocorrência(s)", com cartões que levam ao item de origem; nesse modo o painel de exportação some (`timeline-page-client.tsx:302-331`; `components/timeline/timeline-archive-results.tsx:44-50`).
  4. Sem busca, ajustar filtros: Fontes, Categorias/Impactos, Período (caixa "Todo período da obra", campos De/Até) e Participantes (e-mail) (`timeline-filters.tsx:132-388`).
  5. (Opcional) Marcar eventos específicos (caixa por evento ou "selecionar todos"). Sem seleção, tudo que está filtrado é exportado (`components/timeline/timeline-list.tsx:21-41`).
  6. Clicar em "Exportar Timeline Filtrado", conferir "Serão exportados X evento(s) de Y registro(s) disponíveis" e o resumo dos filtros, escolher formatos e clicar em "Confirmar exportação" (`timeline-export-panel.tsx:239-276`).
  7. O navegador baixa os arquivos (PDF dossiê `timeline-dossie-AAAA-MM-DD.pdf`; XLSX e CSV `timeline-indice-...`; ou um ZIP `timeline-export-AAAA-MM-DD-<id>.zip`) e o sistema registra a exportação; a tela mostra "N evento(s) exportado(s). ID da exportação: <uuid>." (`timeline-export-panel.tsx:167-214`).
  8. Clicar em um evento da lista abre o detalhe em `/{obra}/ledger/{evento}` (`timeline-list.tsx:42-45`).

- **Estados e exceções**
  - Sem eventos para os filtros: "Nenhum evento encontrado para os filtros selecionados." (`timeline-page-client.tsx:319-320`). Sem resultados na busca: "Nenhum item do acervo contém a palavra ou expressão pesquisada." (`timeline-archive-results.tsx:36-41`).
  - Erro na busca: "Erro na busca" + mensagem (ex.: "Falha ao pesquisar o acervo.") (`timeline-filters.tsx:84-86,110-117`; `timeline-page-client.tsx:177,195-198`).
  - Sem participantes: "Nenhum participante identificado nos e-mails do projeto." Participantes só vêm de e-mails reais vinculados como evidência (`timeline-filters.tsx:323-326`; `docs/timeline-export.md:70-73`).
  - Exportação com 0 eventos ou 0 formatos: erro "Nenhum evento no conjunto filtrado. Ajuste os filtros antes de exportar." / "Selecione ao menos um formato de exportação." (`timeline-export-panel.tsx:108-117`).
  - A exportação pode terminar com arquivos gerados mas falha no registro de auditoria: "Exportação gerada, mas falhou ao registrar auditoria: ..." (`timeline-export-panel.tsx:208-212`). Sessão expirada: "Sessão expirada. Faça login novamente." (`timeline-export-actions.ts:29-32`).
  - "Tudo em ZIP" prevalece: se marcado, só o ZIP é baixado, mesmo com PDF/XLSX marcados (`timeline-export-panel.tsx:167-181`).
  - Evidências sem arquivo: o manifesto usa "Fonte referenciada, arquivo original não disponível para exportação." (`docs/timeline-export.md:96-100`). E-mail: só remetente/destinatário/assunto/data/trecho; sem CC, sem anexos, sem corpo integral; a representação é rotulada como gerada (`docs/timeline-export.md:55-62`).
  - Anotações internas saem com o prefixo "ANOTAÇÃO INTERNA — INFORMAÇÃO DECLARADA" (`docs/timeline-export.md:110-114`).
  - Limitações conhecidas: sem checksum do pacote; verificação visual final em navegador autenticado ficou pendente na época (`docs/timeline-export.md:116-134`). Integração com Experts por seleção de Timeline é `FUTURE_SOURCE` (`docs/timeline-export.md:62-66`).
  - O período inicial termina no prazo baseline: eventos posteriores a essa data ficam fora da lista até desmarcar "Todo período da obra" ou editar as datas (`timeline-page-client.tsx:62-66`). **Atenção para o usuário.**
  - Ordem: a lista na tela segue a ordem do carregamento (mais recentes primeiro, `lib/data.ts:196-200`), enquanto a exportação é em ordem cronológica crescente (`timeline-export-panel.tsx:125`).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | arquivo:linha |
|---|---|---|
| Menu lateral (title) | `Timeline — Histórico cronológico contratual e jurídico do projeto.` | `lib/ui/feature-help.ts:30-35`; `app-sidebar.tsx:125` |
| FeatureInfo "timeline" (catálogo; não exibido na página) | `Organiza acontecimentos relevantes desde o início real da obra, incluindo documentos, e-mails, eventos, aprovações e evidências. O Timeline preserva o histórico anterior ao início operacional do ACC.` | `lib/ui/feature-help.ts:33-34` |
| Cabeçalho | `Timeline` / `Linha do tempo cronológica de todos os eventos consolidados.` | `timeline/page.tsx:88` |
| Busca (rótulo/placeholder) | `Buscar palavra / assunto`; `Ex.: compactação do solo` | `timeline-filters.tsx:54-71` |
| Busca (ajuda) | `Pesquisa todo o acervo: e-mails, anexos, documentos, conteúdo extraído, Diário de Obra, Construmanager, relatórios, eventos e anotações.` | `timeline-filters.tsx:76-80` |
| Progresso | `Buscando... N%`; `N resultado(s) encontrado(s)`; `Erro na busca`; `Pesquisando o acervo completo...`; `Busca concluída`; `N itens examinados` | `timeline-filters.tsx:83-129` |
| Filtros | `Fontes`; `Categorias/Impactos`; `Período` (`Todo período da obra`, `De`, `Até`); `Participantes (e-mail)` (`Todos`) | `timeline-filters.tsx:134-188,247-318` |
| Participante (title) | endereço de e-mail | `timeline-filters.tsx:372` |
| Seleção | `Selecionar eventos específicos para exportação (opcional — sem seleção, todos os eventos filtrados abaixo são exportados)` / `N evento(s) selecionado(s) manualmente para exportação` | `timeline-list.tsx:25-27` |
| Caixa do evento (aria-label) | `Selecionar evento <título> para exportação` | `timeline-list.tsx:40` |
| Botão de exportar | `Exportar Timeline Filtrado` | `timeline-export-panel.tsx:234` |
| Resumo | `Serão exportados X evento(s) de Y registro(s) disponíveis.`; `Fontes: ...`; `Categorias/Impactos: ...`; `Período: ... a ...`; `Participantes: ...`; `Seleção manual de eventos: ...` | `timeline-export-panel.tsx:44-64,241-249` |
| Formatos | `Dossiê PDF`; `Índice XLSX/CSV`; `Arquivos originais`; `Tudo em ZIP` | `timeline-export-panel.tsx:26-31` |
| Botões | `Confirmar exportação` / `Gerando…`; `Cancelar` | `timeline-export-panel.tsx:269-274` |
| Sucesso | `N evento(s) exportado(s). ID da exportação: <id>.` | `timeline-export-panel.tsx:214` |
| Resultados da busca | `Timeline temática — N ocorrência(s)`; tipos `E-mail`, `Anexo de e-mail`, `Documento`, `Conteúdo de documento`, `Construmanager`, `Diário de Obra`, `Relatório Semanal`, `Evento`, `Anotação`; `Data não disponível` | `timeline-archive-results.tsx:7-8,19-29,46-48` |

- **Sugestões de melhoria dos textos**
  - O campo de busca recebe hover automático `Função deste campo: Ex.: compactação do solo.` (usa o placeholder) (`components/shared/automatic-field-help.tsx:17-18`). Sugestão: `aria-label="Buscar palavra ou assunto em todo o acervo"`.
  - "Timeline temática" aparece só durante a busca, sem explicação; sugestão: "Resultados da busca por «termo»".
  - Cabeçalho diz "todos os eventos consolidados", mas a tela abre limitada ao período do projeto (início → prazo baseline). Sugestão: texto "Eventos do período selecionado (por padrão, o período da obra)".
  - Rótulo "Índice XLSX/CSV" não diz que baixa **dois** arquivos (XLSX e CSV). Sugestão: "Índice (XLSX + CSV)".
  - "Tudo em ZIP" deveria avisar que substitui as demais seleções (ver `timeline-export-panel.tsx:167`).
  - "Categorias/Impactos": a UI mistura os dois termos; usar um só ("Impactos contratuais"), como em `lib/labels.ts:35-47`.
  - Os resultados da busca mostram `hit.sourceType` e `hit.matchedIn` crus (códigos), enquanto a lista usa rótulos amigáveis (`timeline-archive-results.tsx:68-70`). Sugestão: usar `sourceTypeShortLabels`.
  - Falta ⓘ (FeatureInfo) na página, apesar de existir texto no catálogo.

- **Fontes**
  `app/[projectId]/timeline/page.tsx`, `app/[projectId]/timeline/timeline-export-actions.ts`, `app/[projectId]/timeline/timeline-search-actions.ts`, `components/timeline/{timeline-page-client,timeline-filters,timeline-list,timeline-export-panel,timeline-archive-results}.tsx`, `lib/timeline-export/*`, `docs/timeline-export.md`, `supabase/migrations/20260822040325_timeline_exports_foundation.sql` (citada em `docs/timeline-export.md:76-77`).

---

### 4.4 EVENTOS (lista) — rota `/{obra}/ledger`

- **Para que serve**
  Registro cronológico dos eventos da obra com possível implicação contratual, em tabela: data, evento, fonte, categorias, status e severidade do achado de IA (`app/[projectId]/ledger/page.tsx:15`; `components/ledger/event-table.tsx:12-17`). O rótulo no menu é "EVENTOS" (rota técnica `ledger`) (`lib/ui/nav-items.ts:31`).

- **Quem acessa / permissões**
  - UI e servidor: leitura por qualquer membro do projeto; a lista não tem botões de escrita (`ledger/page.tsx:9-18`).
  - Restrição de menu: nenhuma.

- **Fluxo principal**
  1. Abrir "EVENTOS".
  2. Localizar o evento na tabela (ordem do mais recente ao mais antigo, `lib/data.ts:196-200`).
  3. Clicar na data ou no título para abrir o detalhe (ver próxima seção) (`event-table.tsx:24-31`).

- **Estados e exceções**
  - Sem eventos: "Nenhum evento registrado." (`ledger/page.tsx:16`).
  - Coluna "Achado IA" mostra "—" quando o evento não tem avaliação de IA (`event-table.tsx:44`).
  - Status de evento: Novo, Em Análise, Confrontado, Resolvido (`lib/labels.ts:49-54`). Severidade: Baixo, Médio, Alto, Crítico (`lib/labels.ts:60-65`). Categorias: Prazo, Custo, Escopo, Multas, Penalidades, Medições, Pagamentos, Responsabilidades, Alterações de Projeto, Notificações, Claims / Change Orders (`lib/labels.ts:35-47`).
  - Eventos entram por ingestão automática ou criação por outros fluxos; **não encontrado** botão "novo evento" nesta tela.

- **Textos hover e avisos atuais**

| Elemento | Texto literal | arquivo:linha |
|---|---|---|
| Menu lateral (title) | `EVENTOS — Registro estruturado dos eventos relevantes do contrato.` | `lib/ui/feature-help.ts:37-42`; `app-sidebar.tsx:125` |
| FeatureInfo "event-ledger" (catálogo) | `Mantém os acontecimentos relevantes identificados no projeto, com origem, evidência, impacto, classificação e rastreabilidade.` | `lib/ui/feature-help.ts:40-41` |
| Cabeçalho | `EVENTOS` / `Registro cronológico de eventos com possível implicação contratual.` | `ledger/page.tsx:15` |
| Colunas | `Data`, `Evento`, `Fonte`, `Categorias`, `Status`, `Achado IA` | `event-table.tsx:12-17` |
| Vazio | `Nenhum evento registrado.` | `ledger/page.tsx:16` |
| Título da guia do navegador | `Event Ledger` | `ledger/page.tsx:7` |

- **Sugestões de melhoria dos textos**
  - Título da guia "Event Ledger" (`ledger/page.tsx:7`) contradiz o menu "EVENTOS"; alinhar.
  - Páginas de lote usam "Voltar para o Ledger" / "Ver Ledger" (`ledger/lote-alertas/[batchId]/page.tsx:36,71`); trocar por "Voltar para EVENTOS".
  - Coluna "Achado IA" pode confundir com "alerta"; sugestão de hover: "Severidade sugerida pela IA — sujeita a revisão humana".

- **Fontes**
  `app/[projectId]/ledger/page.tsx`, `components/ledger/event-table.tsx`, `lib/labels.ts`, `lib/ui/nav-items.ts`, `lib/ui/feature-help.ts`.

---

### 4.5 EVENTOS — detalhe do evento, confronto evento × cláusula, curadoria, notas e envio de alerta — rota `/{obra}/ledger/{eventoId}`

- **Para que serve**
  Página completa de um evento: resumo, status e categorias; "Achado da IA" com severidade e confiança; revisão de risco; evidência original; confronto com outras fontes; anotações; histórico de ações por e-mail; confrontação contratual (evento × cláusula) com revisão humana; curadoria multiagente; consulta a especialistas. Também é o destino dos botões dos e-mails de alerta (`?respond=acc`) (`app/[projectId]/ledger/[eventId]/page.tsx:41,98-107`). Princípio: a IA sugere, o humano revisa; confiança "sujeita a revisão humana, não substitui decisão da equipe" (`page.tsx:136-138`).

- **Quem acessa / permissões**
  - Ver a página: qualquer membro do projeto (RLS de leitura). Evento de outro projeto ou inexistente: página não encontrada (`page.tsx:51`; `send-alert-actions.ts:56-58`).
  - UI: `canReview = ADMINISTRADOR` (`page.tsx:53`) controla: "Avaliar risco de atraso de cronograma", aviso pré-envio de risco, formulário "Enviar Alerta", formulários de aprovar/rejeitar/complementar justificativa e formulário de nova anotação (`page.tsx:139-150,253-272`; `components/ledger/event-notes-section.tsx:53-59`).
  - `canTriggerCuration = ADMINISTRADOR, GESTOR ou GERENTE` (`page.tsx:56`) controla "Executar análise multiagente". A Server Action confere de novo (`run-multi-expert-curation-actions.ts:41-43`). **Não verificado** se GESTOR/GERENTE conseguem gravar o registro de auditoria dessa análise (a mensagem de erro "Análise concluída, mas falhou ao registrar auditoria..." existe em `run-multi-expert-curation-actions.ts:92`). **DEPENDE DE VERIFICAÇÃO.**
  - Servidor/RLS:
    - Enviar alerta: `getCurrentProjectPermission` precisa ser ADMINISTRADOR; senão `NotAuthorizedError`: "Envio de alerta por e-mail exige permissão ADMINISTRADOR no projeto." (`lib/email/send-contract-alert-email.ts:87-92`). Destinatário tem de ser membro ACTIVE do mesmo projeto (`send-alert-actions.ts:73-82`).
    - Aprovar/rejeitar confronto: RPC `review_event_clause_confrontation_candidate` exige `has_project_permission(..., 'EDITOR')`, que só ADMINISTRADOR satisfaz (`supabase/migrations/20260821021746_event_clause_confrontation_foundation.sql:564-568`; função em `20260829200000_project_permission_gerente_compat.sql:69-119`). Complementar justificativa: ADMINISTRADOR (`supabase/migrations/20260828150000_event_clause_confrontation_review_note_amendment.sql:61-62`).
    - Anotações: política `event_notes_insert_editor_self_authored` (autor = usuário atual e permissão 'EDITOR', i.e. ADMINISTRADOR) (`supabase/migrations/20260822033339_event_notes_foundation.sql:85-97`).
  - Resumo prático: **ADMINISTRADOR** faz tudo; **GESTOR/GERENTE** veem tudo e podem rodar a curadoria multiagente (UI); **COLABORADOR e LEITURA** só leem.

- **Fluxo principal**
  1. Abrir o evento (pela lista EVENTOS, pela Timeline ou pelo botão do e-mail de alerta). Se veio do e-mail, aparece o aviso azul: "Você chegou aqui a partir de um alerta de risco {nível} enviado por e-mail. Sua resposta em "Anotações do Evento" abaixo fica registrada e vinculada a este evento." (`page.tsx:98-106`).
  2. Ler resumo, "Registrado por ..." (usuário, "sistema (ingestão automática)" ou "... (registro histórico)") e o cartão "Achado da IA — {tipo}" (`page.tsx:77-153`; tipos: Desvio, Conflito, Informação Nova, Impacto Potencial, `lib/labels.ts:67-72`).
  3. Conferir "Evidência original" (e-mail com De/Para/Assunto/trecho; documento com título e versão) e "Confronto com outras fontes" (referências cruzadas) (`page.tsx:157-165`; `components/ledger/evidence-viewer.tsx`; `components/ledger/cross-reference-list.tsx`).
  4. **Confrontação contratual — Revisão humana** (`page.tsx:177-278`): para cada candidato (cláusula, confiança, status, tipo, severidade, fundamentos do evento e da cláusula, autor da análise), o administrador escreve a justificativa e clica "Aprovar relação" ou "Rejeitar". Justificativa mínima 20 caracteres, específica, sem frases genéricas como "aprovado" ou "de acordo" (`lib/ledger/confrontation-justification-validation.ts:24-81`). Após decidido, aparece quem decidiu e quando; aprovações antigas sem justificativa específica mostram aviso e permitem "Complementar justificativa" (`page.tsx:227-261`).
  5. **Enviar alerta por e-mail** (apenas ADMINISTRADOR, e só se o evento tem Achado da IA): escolher o destinatário entre os membros ativos, conferir o nome (somente leitura) e clicar "Enviar Alerta" (`components/ledger/send-contract-alert-form.tsx:63-88`). O e-mail leva os botões de ação (DAR CIÊNCIA, ASSUMIR RESPONSABILIDADE, DEFINIR PRAZO, RESPONDER AO ACC) quando a emissão dos tokens funciona; se falhar, o alerta sai sem os botões (`send-alert-actions.ts:208-218`). Regras de nível de risco, prazos, repetição e escalonamento: ver cap. 6 (6.7) e cap. 7.
  6. **Anotações do Evento**: escolher Categoria (Contexto Operacional, Informação Comercial, Observação Jurídica, Planejamento, Financeiro, Outros), digitar a "Nova anotação" e clicar "Adicionar anotação" (`components/ledger/event-note-form.tsx:84-110`; `lib/labels.ts:187-194`). A anotação é "informação declarada internamente — não é evidência, documento, e-mail ou cláusula" (`event-notes-section.tsx:28-31`).
  7. **Curadoria multiagente**: clicar "Executar análise multiagente"; o sistema roteia aos Experts IA, o CEO IA consolida e mostra tema, experts consultados, situação, divergências, recomendação e decisões humanas necessárias, registrando em Auditoria (`components/ledger/run-multi-expert-curation-button.tsx:28-134`). Ver cap. 8 (uso dos especialistas).
  8. **Consulta a especialista** (`ExpertQueryPanel`, `page.tsx:288`) e **revisão de risco** (`EventRiskReviewSection`, `page.tsx:155`) — ver cap. 6.7 e cap. 8.

- **Estados e exceções**
  - Status do candidato de confronto: Pendente de revisão, Aprovado, Rejeitado (`lib/labels.ts:173-177`). Só candidatos aprovados com justificativa válida viram bloco estruturado no e-mail; rejeitados nunca entram (`send-alert-actions.ts:92-123`).
  - Envio **bloqueado** quando algum confronto aprovado da cláusula não tem justificativa específica: "O confronto aprovado da Cláusula N não tem uma justificativa específica registrada (...). Peça a um revisor com permissão de aprovação para complementá-la antes de enviar este alerta." (`send-alert-actions.ts:115-122`).
  - Erros do envio (`send-alert-actions.ts:42-82,251-256`): "Dados do evento ausentes. Recarregue a página e tente novamente."; "Informe o e-mail do destinatário."; "Evento ou projeto não encontrado."; "Este evento não possui um achado de IA associado para virar um alerta."; "O destinatário informado não corresponde a um usuário ativo deste projeto."; "Sessão expirada. Faça login novamente."; "Evento ... não encontrado ou não autorizado para o usuário atual." (`lib/email/send-contract-alert-email.ts:81-85`).
  - Sem destinatário elegível: "Nenhum usuário ativo elegível neste projeto para receber este alerta por e-mail." (`send-contract-alert-form.tsx:90-92`).
  - **DEPENDE DE CONFIGURAÇÃO — modo de saída:** em MODO PILOTO (`ACC_OUTBOUND_MODE=PILOT`, destino em `ACC_PILOT_RECIPIENT`) qualquer envio é redirecionado à caixa de teste e o colaborador escolhido NÃO recebe. O formulário mostra o aviso antes do envio e a confirmação diz isso (`lib/email/pilot-notice.ts:10-19`; `lib/email/send-outcome.ts:41-65`; `send-contract-alert-form.tsx:57-61,96-107`). Se o modo piloto estiver mal configurado: "Modo piloto mal configurado — o envio será bloqueado." (`pilot-notice.ts:16`). Aceite do provedor nunca é "entrega confirmada" (`send-outcome.ts:9-10`).
  - Aprovar/rejeitar/complementar com erro de servidor: a tela mostra a mensagem crua do banco (`actions.ts:64-65,110-117`). Sem permissão, a mensagem em inglês "EDITOR or ADMIN permission required" pode aparecer (`supabase/migrations/20260821021746_event_clause_confrontation_foundation.sql:568`). Quando a função de complementar ainda não existe: mensagem específica em `actions.ts:111-116` (não transcrita; ver arquivo).
  - Sem candidatos: "Nenhum candidato de confronto Evento x Cláusula para este evento." (`page.tsx:181`). Sem referências: "Nenhuma referência cruzada registrada." (`cross-reference-list.tsx:38`). Referência apagada: "Referência não disponível". E-mail ou documento ausente: "E-mail não disponível" / "Versão de documento não disponível" (`evidence-viewer.tsx:40,54`). Sem anotações: "Nenhuma anotação registrada para este evento." (`event-notes-section.tsx:34`).
  - Avaliação de atraso de cronograma sem atividade atrasada: "Nenhuma atividade de cronograma está atrasada no momento — nada a avaliar." (`assess-schedule-delay-actions.ts:51`); sucesso mostra "Severidade: A → B" e, se aplicável, "— DECISÃO HUMANA NECESSÁRIA" (`assess-schedule-delay-button.tsx:24-29`).
  - Curadoria sem especialista selecionado: "Nenhum — roteamento não selecionou um especialista para este tema." (`run-multi-expert-curation-button.tsx:75`).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | arquivo:linha |
|---|---|---|
| Aviso de chegada por e-mail | `Você chegou aqui a partir de um alerta de risco ... enviado por e-mail. Sua resposta em "Anotações do Evento" abaixo fica registrada e vinculada a este evento.` | `ledger/[eventId]/page.tsx:99-106` |
| Cartão da IA | `Achado da IA — {tipo}`; `Confiança estimada: N% — sugestão sujeita a revisão humana, não substitui decisão da equipe.` | `page.tsx:131,136-138` |
| Botão risco | `Avaliar risco de atraso de cronograma` / `Avaliando…` | `assess-schedule-delay-button.tsx:21` |
| Título de seções | `Evidência original`; `Confronto com outras fontes`; `Confrontação contratual — Revisão humana` | `page.tsx:158,163,178` |
| Rótulo da evidência | `Evidência original — {fonte}`; `De:`; `Para:`; `Assunto:`; `Versão {x} · {data}` | `evidence-viewer.tsx:25,34-36,50` |
| Tipos de referência | `Contrato/Aditivo`, `Edital/RFI/RFP`, `Proposta Axion`, `Cronograma`, `Projeto Técnico`, `Comunicação` | `cross-reference-list.tsx:4-11` |
| Candidato | `Cláusula {n}`; `Confiança N%`; `Fundamento do evento`; `Fundamento da cláusula` | `page.tsx:190,196,212,217` |
| Aviso do candidato | `Produzido por análise automatizada ({analisador} v{versão}) — exige revisão humana antes de gerar confronto definitivo.` | `page.tsx:222-225` |
| Decisão registrada | `Aprovado/Rejeitado por {nome} em {data}.`; `Observação: ...`; `Justificativa complementada por ... em ...` | `page.tsx:229-245` |
| Aviso de justificativa fraca | `Esta aprovação não tem uma justificativa específica registrada — não pode ser usada como conclusão do confronto em alertas por e-mail até ser complementada.` / `Esta rejeição não tem uma justificativa específica registrada.` | `page.tsx:248-250` |
| Sem permissão (confronto) | `Você possui acesso de leitura. Aprovação ou rejeição exige permissão EDITOR ou ADMIN.` | `page.tsx:270` |
| Sem permissão (curadoria) | `Executar a curadoria multiagente exige permissão GERENTE ou ADMINISTRADOR neste projeto.` | `page.tsx:284` |
| Formulário aprovar | `Justificativa da aprovação`; ajuda `A relação foi aprovada, mas a conclusão não descreve qual condição contratual coincide, diverge ou exige ação.`; placeholder `Ex.: o prazo de pagamento proposto no evento (30 dias) diverge do prazo contratual, que é até o 25º dia, condicionado à nota fiscal e documentos.`; botão `Aprovar relação` / `Aprovando…` | `confrontation-review-forms.tsx:71-88`; `lib/ledger/confrontation-justification-validation.ts:24-25` |
| Formulário rejeitar | `Justificativa da rejeição`; `Explique por que este evento não se relaciona com esta cláusula.`; placeholder `Ex.: a cláusula trata de garantia de execução; ...`; botão `Rejeitar` / `Rejeitando…` | `confrontation-review-forms.tsx:103-128` |
| Erros de justificativa | `Informe uma justificativa específica — este campo é obrigatório.`; `A justificativa precisa explicar a decisão com mais detalhe (mínimo de 20 caracteres).` | `confrontation-justification-validation.ts:66,72` |
| Complementar | `Complementar justificativa`; `Justificativa complementada`; `Salvar complemento` / `Salvando…`; `Cancelar` | `confrontation-review-note-amend-form.tsx:37,59,68,71` |
| Enviar alerta | `Enviar este achado como alerta por e-mail (padrão institucional ACC)`; campo Nome (placeholder `Nome`); botão `Enviar Alerta` / `Enviando…` | `send-contract-alert-form.tsx:53,82,86` |
| Aviso piloto (antes) | `Modo piloto ativo: qualquer envio manual é redirecionado para a caixa de teste (xx***@domínio) — o colaborador selecionado não receberá a mensagem.` | `lib/email/send-outcome.ts:61-63` |
| Resultado piloto | `MODO PILOTO: o provedor aceitou a mensagem, mas ela foi redirecionada para a caixa de teste (...). O colaborador selecionado (...) NÃO recebeu este e-mail. Aceite do provedor não é confirmação de entrega.` | `send-outcome.ts:46-47` |
| Resultado produção | `O provedor aceitou a mensagem para xx***@domínio. Aceite do provedor não é confirmação de entrega.` | `send-outcome.ts:55` |
| Anotações | `Anotações do Evento`; `Informação declarada internamente — não é evidência, documento, e-mail ou cláusula, e não foi confirmada documentalmente.`; `Categoria`; `Nova anotação`; placeholder `Ex.: Não temos um contrato assinado, mas o cliente já está medindo os serviços e pagando regularmente.`; botão `Adicionar anotação` / `Salvando…` | `event-notes-section.tsx:25-30`; `event-note-form.tsx:85-110` |
| Sem permissão (anotações) | `Você possui acesso de leitura. Adicionar anotação exige permissão EDITOR ou ADMIN.` | `event-notes-section.tsx:57` |
| Erros de anotação | `Selecione uma categoria válida.`; `Informe o texto da anotação.`; `Sessão expirada. Faça login novamente.` | `event-notes-actions.ts:42,46,53` |
| Curadoria | `Curadoria multiagente (Experts IA)`; `Roteia este evento aos Experts IA competentes e consolida as posições via CEO IA. Análise de IA sujeita a revisão humana — nenhuma ação é executada automaticamente.`; `Executar análise multiagente` / `Executando análise…`; `Consultando os Experts IA e consolidando via CEO IA. Isso pode levar algum tempo — aguarde nesta tela.`; `Análise de IA — nunca substitui decisão humana. Registrada em Auditoria (...)` | `run-multi-expert-curation-button.tsx:33-34,44-57,128-131` |
| Rótulos do resultado | `Tema roteado`; `Experts consultados`; `Situação (CEO IA)`; `Divergências entre Experts`; `Recomendação do CEO IA`; `Decisões humanas necessárias` | `run-multi-expert-curation-button.tsx:68-107` |
| Hover automático | `Função deste campo: Ex.: o prazo de pagamento ...` (placeholder usado como descrição) etc. | `components/shared/automatic-field-help.tsx:17-18` |

  Observação: a página **não usa FeatureInfo (ⓘ)**; os únicos `title`/`aria-label` do detalhe são os gerados automaticamente em campos e o `alt="ACC"` do logo do formulário de alerta (`send-contract-alert-form.tsx:51`).

- **Sugestões de melhoria dos textos**
  - **Erro de perfil (alta prioridade):** `Aprovação ou rejeição exige permissão EDITOR ou ADMIN` (`page.tsx:270`) e `Adicionar anotação exige permissão EDITOR ou ADMIN` (`event-notes-section.tsx:57`) usam perfis antigos que não existem mais no ACC. Na prática só ADMINISTRADOR consegue (`20260829200000_project_permission_gerente_compat.sql:69-119`). Texto sugerido: "Você tem acesso somente de leitura. Esta ação exige o perfil ADMINISTRADOR neste projeto."
  - `Executar a curadoria multiagente exige permissão GERENTE ou ADMINISTRADOR` (`page.tsx:284`, `run-multi-expert-curation-actions.ts:43`) omite GESTOR, que o código aceita (`page.tsx:56`). Alinhar: "GESTOR, GERENTE ou ADMINISTRADOR" ou, se GESTOR for legado, usar só os perfis vigentes. O mesmo vale para `assess-schedule-delay-actions.ts:36`, cuja mensagem cita GERENTE ou ADMINISTRADOR, mas a UI só mostra o botão a ADMINISTRADOR (`page.tsx:139-141`).
  - Mensagem de bloqueio de envio diz "Peça a um revisor com permissão de aprovação": nomear o perfil ("peça a um ADMINISTRADOR do projeto").
  - Texto de ajuda da justificativa (`CONFRONTATION_JUSTIFICATION_HELP_TEXT`) começa com "A relação foi aprovada, mas a conclusão não descreve..." e é exibido **antes** de aprovar (como dica do campo) e como erro também na **rejeição** (`confrontation-justification-validation.ts:24-25,76-78`). Em rejeição, "foi aprovada" confunde. Sugestão: texto neutro, "A justificativa precisa dizer qual condição contratual coincide, diverge ou exige ação."
  - Erro cru do banco em inglês ("EDITOR or ADMIN permission required") aparece ao usuário (`actions.ts:64-65`). Traduzir a mensagem na Server Action.
  - `Confiança N%` x `Confiança estimada: N% — sugestão sujeita a revisão humana`: manter a nota nas duas posições, pois o candidato só traz "exige revisão humana" no rodapé.
  - Rótulos técnicos em inglês na lista de analisador/versão ("v{analyzerVersion}") — manter, mas explicar que é a versão da regra de análise.
  - O envio mostra "Enviar Alerta", enquanto o resto do sistema distingue alerta de achado/risco; manter coerência com cap. 6.1.
  - Campo Nome só-leitura tem hover automático `Função deste campo: Nome.` — pouco útil; trocar por aria-label "Nome do destinatário selecionado (somente conferência)".

- **Fontes**
  `app/[projectId]/ledger/[eventId]/{page,actions,send-alert-actions,event-notes-actions,run-multi-expert-curation-actions,assess-schedule-delay-actions}.ts(x)`, `components/ledger/*`, `lib/ledger/confrontation-justification-validation.ts`, `lib/email/{send-contract-alert-email,send-outcome,pilot-notice}.ts`, `lib/labels.ts`, `lib/contract-review.ts`, `supabase/migrations/{20260821021746_event_clause_confrontation_foundation,20260828150000_event_clause_confrontation_review_note_amendment,20260822033339_event_notes_foundation,20260829200000_project_permission_gerente_compat}.sql`. Capítulos relacionados: cap. 6 (riscos, 6.7), cap. 7 (escalonamento), cap. 8 (especialistas).

---

### 4.6 EVENTOS — Responder alertas do ACC (lote de alertas) — rota `/{obra}/ledger/lote-alertas/{loteId}`

- **Para que serve**
  Tela aberta pelo botão do e-mail que reúne vários alertas de contrato. O responsável define uma ação por alerta (RESOLVIDO, EM ANDAMENTO ou ENVIADO P/ outro colaborador) e envia a resposta ao ACC (`lote-alertas/[batchId]/page.tsx:60-81`; `lib/email-actions/contract-alert-batch-types.ts:13-29`).

- **Quem acessa / permissões**
  - Exige login (como qualquer rota). A leitura do lote usa a sessão e a política de leitura do lote: só o **destinatário** ou um **ADMINISTRADOR** do projeto veem o lote (`lib/email/get-contract-alert-batch.ts:28-33`; política em `supabase/migrations/20260921120000*.sql`, citada no comentário). Outros usuários veem "Lote de alertas indisponível".
  - Sem restrição de menu: a rota não está no menu, só no link do e-mail.
  - Quem pode gravar a resposta: **não verificado em detalhe** (funções `respondToContractAlertBatch` / `saveContractAlertBatchItem`, também usadas pelo endpoint `app/api/contract-alert-batches/[batchId]/respond/route.ts`).

- **Fluxo principal**
  1. Abrir o link do e-mail (pode chegar com `?acao=` e `?evento=` para pré-selecionar uma ação em um alerta) (`page.tsx:46-54`).
  2. Para cada alerta, escolher "Ação obrigatória" (RESOLVIDO / EM ANDAMENTO / ENVIADO P/). Ao escolher ENVIADO P/ aparece "Enviado para" para escolher o colaborador (`contract-alert-batch-form.tsx:125-169`). Sobre cada escolha aparece um aviso de repetição ou encerramento (ver abaixo; política de intervalos no cap. 6.7 / cap. 7).
  3. (Opcional) "Salvar esta ação" para gravar um alerta de cada vez (resposta parcial); aparece "Ação salva" (`contract-alert-batch-form.tsx:171-191`).
  4. Quando todos os alertas têm ação, o botão "RESPONDER AO ACC" habilita (`contract-alert-batch-form.tsx:197-205`). Ao enviar, aparece "Todos os alertas foram respondidos. A resposta ao ACC foi enviada." (`contract-alert-batch-form.tsx:99-101`).
  5. "VER EVENTO" (no e-mail) é só consulta e não conta como resposta (`page.tsx:79-80`).

- **Estados e exceções**
  - Lote inexistente ou sem acesso: cartão "Lote de alertas indisponível" com o botão "Voltar para o Ledger" (`page.tsx:30-39`).
  - Lote já respondido: "Lote respondido integralmente." e "Registrado em {data}." com botão "Ver Ledger" (`page.tsx:66-73`).
  - Lote em outro estado (não enviado ou aguardando reprocessamento): "Este lote de alertas ainda não foi enviado ou está aguardando reprocessamento." (`page.tsx:74-75`).
  - Pendências: "Todos os alertas precisam ter uma ação definida antes do envio." + lista "Pendentes:" (`contract-alert-batch-form.tsx:207-220`). Erros do servidor: "Não foi possível identificar todos os alertas do lote.", "Todos os alertas precisam ter uma ação definida antes do envio.", "Selecione um colaborador para cada alerta enviado." (`actions.ts:30,39,42`).
  - Contador: "N de M alertas respondidos" (`contract-alert-batch-form.tsx:199-201`).
  - Modo compacto ("CONFIRMAR TUDO", rótulo "Ação") existe para uso embutido (`contract-alert-batch-form.tsx:126,203`); onde é embutido: não verificado.

- **Textos hover e avisos atuais**

| Elemento | Texto literal | arquivo:linha |
|---|---|---|
| Cabeçalho | `ACC · AXION CONTROLE DE CONTRATOS`; `Responder alertas de contrato`; `{projeto} · Responsável: {nome} · N alerta(s) neste lote` | `page.tsx:59-63` |
| Instrução | `Defina RESOLVIDO, EM ANDAMENTO ou ENVIADO P/ para cada alerta. "VER EVENTO" é só consulta e não conta como resposta. A resposta ao ACC só é liberada quando todos os alertas abaixo tiverem uma ação definida.` | `page.tsx:78-81` |
| Título da guia | `Responder alertas do ACC` | `page.tsx:14` |
| Bloco do alerta (title) | título do alerta | `contract-alert-batch-form.tsx:111` |
| Opções | `Selecione uma ação`; `RESOLVIDO`; `EM ANDAMENTO`; `ENVIADO P/`; `Enviado para`; `Selecione um colaborador` | `contract-alert-batch-form.tsx:140,163`; `contract-alert-batch-types.ts:21-25` |
| Avisos por ação | EM ANDAMENTO: `Este alerta será repetido {intervalo do risco} até a conclusão.`; ENVIADO P/: `O destinatário receberá este alerta {intervalo do risco} até a conclusão.`; RESOLVIDO: `Ao confirmar, este alerta será encerrado e os lembretes futuros serão interrompidos.` (role="note") | `lib/alerts/repeat-policy.ts:42-52`; `components/alerts/alert-action-notice.tsx:11-24` |
| Botões | `Salvar esta ação` / `Salvando…`; `Ação salva`; `RESPONDER AO ACC` / `CONFIRMAR TUDO` / `Enviando resposta…` | `contract-alert-batch-form.tsx:185-187,203` |

- **Sugestões de melhoria dos textos**
  - "Voltar para o Ledger" e "Ver Ledger" (`page.tsx:36,71`): trocar por "EVENTOS".
  - "ENVIADO P/" é abreviação em maiúsculas; no aviso "O destinatário receberá este alerta..." fica claro; sugestão de rótulo "ENVIAR PARA OUTRO RESPONSÁVEL" ou manter e explicar no ⓘ.
  - "Responsável: {nome}" pode confundir com responsável pela ação; no lote é o destinatário do e-mail. Sugestão "Destinatário do lote".
  - Esta página não usa FeatureInfo; não há ⓘ explicando "o que acontece com cada ação" além do aviso azul e do aviso por ação (intervalos: ver cap. 6.7 e 7.3).

- **Fontes**
  `app/[projectId]/ledger/lote-alertas/[batchId]/{page,actions,actions-state}.ts(x)`, `contract-alert-batch-form.tsx`, `lib/email-actions/contract-alert-batch-types.ts`, `lib/email-actions/contract-alert-batch-validation.ts`, `lib/email/get-contract-alert-batch.ts`, `lib/alerts/repeat-policy.ts`, `components/alerts/alert-action-notice.tsx`.

---

### 4.7 Solicitações — rotas `/{obra}/action-requests` (lista) e `/{obra}/action-requests/{solicitacaoId}` (detalhe)

- **Para que serve**
  Solicitações rastreáveis para alguém analisar, responder ou executar algo (`app/[projectId]/action-requests/page.tsx:18`). Lista as solicitações da obra com situação (Aberta, Encerrada, Cancelada) e abre o detalhe, onde é possível enviar a solicitação por e-mail, ver respostas e responsáveis (`[actionRequestId]/page.tsx:81-207`). Ajuda do menu: "Permite registrar e acompanhar solicitações direcionadas às áreas e responsáveis da AXION relacionadas ao contrato ou à obra." (`lib/ui/feature-help.ts:44-49`).

- **Quem acessa / permissões**
  - Ver lista e detalhe: qualquer membro do projeto (RLS `is_project_member`, `supabase/migrations/20260819014144_action_request_foundation.sql:166-169`). Detalhe de solicitação de outra obra: página não encontrada (`[actionRequestId]/page.tsx:52-55`).
  - **Enviar por e-mail:** a UI mostra o formulário a qualquer um que veja o detalhe, sem checar perfil (`[actionRequestId]/page.tsx:100-148`). A Server Action não confere perfil; só exige que o ActionRequest seja visível pela sessão e delega à notificação (`actions.ts:28-31,70-77`; `lib/email/send-action-request-notification.ts:27-47`). **Ou seja, aparentemente qualquer perfil com acesso (inclusive LEITURA) pode disparar o envio** — comportamento inferido do código, **não testado em tela**; vale confirmar se é intencional, pois outras ações de envio da obra exigem ADMINISTRADOR (ex.: alerta de evento, `lib/email/send-contract-alert-email.ts:87-92`).
  - Restrição de menu: nenhuma (`lib/ui/nav-items.ts:32`).
  - **DEPENDE DE CONFIGURAÇÃO:** envio de e-mail depende do provedor e do modo de saída (ver detalhe de EVENTOS); o aviso de MODO PILOTO desta tela **não foi encontrado** — o formulário de Solicitações não mostra aviso de piloto.

- **Fluxo principal**
  1. Abrir "Solicitações" e clicar em uma solicitação (título, situação, resumo de 2 linhas e "Solicitada em {data}") (`action-requests/page.tsx:25-38`).
  2. No detalhe, ler título, descrição e situação.
  3. Em "Envio por e-mail" (enquanto não enviada): preencher Destinatário (e-mail), conferir Assunto (padrão "Solicitação: {título}") e Mensagem (padrão: a descrição), e clicar "Enviar solicitação por e-mail" (`[actionRequestId]/page.tsx:105-147`). O e-mail leva os botões DAR CIÊNCIA, ASSUMIR RESPONSABILIDADE, DEFINIR PRAZO e RESPONDER AO ACC, se a emissão funcionar; se falhar, segue sem botões (`actions.ts:40-68`). Prazos e repetição: ver cap. 7.
  4. A página recarrega mostrando "Enviada em {data}", "Falha no envio" ou "Envio em andamento…".
  5. Acompanhar "Respostas" (por e-mail ou no app) e "Responsáveis".
  6. **Criar uma solicitação nova:** não encontrado nesta aba (não há botão nem formulário de criação no app web; não há política de INSERT para usuários nas migrações lidas — as solicitações nascem de outros fluxos/sistema; a conferir com a equipe técnica).

- **Estados e exceções**
  - Situação da solicitação: Aberta, Encerrada, Cancelada (`lib/labels.ts:153-157`).
  - Estado do envio (derivado de notificações e entregas): NOT_SENT → mostra o formulário; SENDING → "Envio em andamento…"; SENT → "Enviada" + data; FAILED → "Falha no envio — O envio não foi concluído. Nenhuma tentativa automática adicional foi feita." (`[actionRequestId]/page.tsx:19-43,86-99`). Não há botão para reenviar após falha (**não encontrado**).
  - Envio duplicado ou erro de provedor não derrubam a página: o estado real é regravado e a página recarrega (`actions.ts:28-32,78-85`). O usuário não vê a causa do erro.
  - Campos obrigatórios ausentes lançam erro técnico "Campo obrigatório ausente: {campo}" (`actions.ts:18-26`) — sem tratamento amigável.
  - Sem solicitações: "Nenhuma solicitação registrada para este projeto." (`action-requests/page.tsx:21`). Sem respostas: "Nenhuma resposta registrada ainda." (`[actionRequestId]/page.tsx:159`). Sem responsáveis: "Nenhum responsável atribuído." (`[actionRequestId]/page.tsx:195`).
  - Resposta de e-mail mostra o assunto; resposta no app mostra o conteúdo (`[actionRequestId]/page.tsx:168-179`).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | arquivo:linha |
|---|---|---|
| Menu lateral (title) | `Solicitações — Pedidos de informação, documentação ou providências.` | `lib/ui/feature-help.ts:44-49`; `app-sidebar.tsx:125` |
| Cabeçalho | `Solicitações` / `Solicitações rastreáveis para alguém analisar, responder ou executar algo.` | `action-requests/page.tsx:18` |
| Vazio | `Nenhuma solicitação registrada para este projeto.` | `action-requests/page.tsx:21` |
| Cartão | `Solicitada em {data}` | `action-requests/page.tsx:36` |
| Situações | `Aberta`, `Encerrada`, `Cancelada` | `lib/labels.ts:153-157` |
| Detalhe | `Envio por e-mail`; `Enviada` (+ `em {data}`); `Falha no envio`; `Envio em andamento…` | `[actionRequestId]/page.tsx:83,88-99` |
| Formulário | `Destinatário` (placeholder `destinatario@exemplo.com`); `Assunto`; `Mensagem`; botão `Enviar solicitação por e-mail` | `[actionRequestId]/page.tsx:106-147` |
| Aviso do formulário | `Revise o destinatário e o conteúdo antes de confirmar — o envio é uma ação explícita e não pode ser desfeito.` | `[actionRequestId]/page.tsx:137-140` |
| Blocos | `Respostas`; `Resposta por e-mail`; `Resposta no app`; `Nenhuma resposta registrada ainda.`; `Responsáveis`; `Nenhum responsável atribuído.` | `[actionRequestId]/page.tsx:155,168,195` |
| Texto no e-mail enviado | `---\nAções disponíveis:\n...` | `actions.ts:62` |
| Hover automático | `Função deste campo: destinatario@exemplo.com.` / `Função deste campo: Assunto.` / `Função deste campo: Mensagem.` | `components/shared/automatic-field-help.tsx:17-18` |

  Observação: a aba não usa FeatureInfo (ⓘ) nem `title` próprios.

- **Sugestões de melhoria dos textos**
  - Hover do campo Destinatário: `Função deste campo: destinatario@exemplo.com.` (usa o placeholder). Sugestão: `aria-label="E-mail de quem vai receber a solicitação"`.
  - Falta aviso de MODO PILOTO (existe em EVENTOS). Se o ambiente estiver em piloto, o usuário pode achar que o e-mail chegou à pessoa; replicar `getPilotSendNotice()` aqui, se confirmado.
  - "Nenhuma tentativa automática adicional foi feita" não diz o que fazer: sugestão "Entre em contato com o administrador do projeto para reenviar" (não há botão de reenvio).
  - Erro técnico "Campo obrigatório ausente: recipientEmail" (`actions.ts:22`) deve virar mensagem amigável.
  - Mensagem "não pode ser desfeito" está correta (não há cancelamento do envio); manter.
  - A definição de "Solicitações" no menu ("direcionadas às áreas e responsáveis da AXION") sugere criação/uso interno, mas a tela só envia e acompanha; alinhar texto ou implementar criação.
  - Perfis: se for decidido restringir o envio a ADMINISTRADOR, mostrar a mensagem de leitura usada em EVENTOS.

- **Fontes**
  `app/[projectId]/action-requests/page.tsx`, `app/[projectId]/action-requests/[actionRequestId]/page.tsx`, `app/[projectId]/action-requests/actions.ts`, `lib/email/send-action-request-notification.ts`, `lib/data.ts` (`getActionRequests`, linha ~1013), `lib/labels.ts`, `lib/ui/feature-help.ts`, `supabase/migrations/20260819014144_action_request_foundation.sql`.

### 4.8 Ações e Escalonamentos — rota `/{obra}/acoes`
- **Para que serve**: lista as ações com prazo de SLA (assumir, responder, concluir) e o nível de escalonamento atual (Nível 1 Responsável, Nível 2 Gerência, Nível 3 Diretoria). Subtítulo da tela: "Matriz de criticidade, SLA interno e escalonamento automático — Nível 1 → Nível 2 → Nível 3." (`app/[projectId]/acoes/page.tsx:65`). A tela tem 4 sub-abas: "Ações abertas", "Visão gerencial", "Histórico" e "Nova ação" (`page.tsx:79-96`). Detalhes de como o alerta escala: ver cap. 7.2 e 7.3.
- **Quem acessa / permissões**:
  - Rota: qualquer membro do projeto vê a lista (leitura por RLS `sla_actions_select_project_members_only`, `supabase/migrations/20260822054900_sla_escalation_foundation.sql:414-417`). Não há `notFound` por perfil na página.
  - UI: "Nova ação" só aparece para ADMINISTRADOR (`page.tsx:40,91-96`); Assumir, Estudando solução, Concluir e Reatribuir só para ADMINISTRADOR (`isResponsible = canConfigure || (canCreate && responsável == usuário)`, `page.tsx:109-112`; `canConfigure = ADMINISTRADOR`, `page.tsx:41`). Na prática GESTOR, GERENTE, COLABORADOR e LEITURA só leem. Na sub-aba Histórico ninguém tem botões (`page.tsx:138-139`).
  - Servidor: criar exige política `sla_actions_insert_editor` (EDITOR, na prática ADMINISTRADOR); atualizar exige o responsável com EDITOR ou ADMIN (`20260822054900_sla_escalation_foundation.sql:421-446`). As actions de assumir, iniciar, concluir e reatribuir **não conferem perfil no código** e dependem só da RLS (`app/[projectId]/acoes/actions.ts:160-290`). O botão "Matriz de responsabilidades e prazos" só aparece para ADMINISTRADOR (`page.tsx:69-73`).
- **Fluxo principal**:
  1. Abrir "Ações e Escalonamentos" no menu (`lib/ui/nav-items.ts:31`).
  2. Em "Ações abertas" localizar o cartão (título, área, origem, selos de risco, status e nível; responsável e prazos) (`components/sla/sla-action-item.tsx:68-87`).
  3. ADMINISTRADOR: clicar "Assumir Ação" (grava `ACKNOWLEDGED` e a hora; `actions.ts:176-185`, botão `sla-action-item.tsx:118-125`). O texto do código explica que isso interrompe só o prazo de assumir (`actions.ts:174-176`).
  4. Opcional: "Estudando solução" (status `IN_PROGRESS`; só aparece após assumir; `sla-action-item.tsx:128-136`, `actions.ts:210`).
  5. Preencher "Observação de conclusão" (obrigatória) e clicar "Concluir Ação" (`sla-action-item.tsx:143-155`; `actions.ts:239-250`). A ação vai para a sub-aba Histórico.
  6. Reatribuir: escolher alguém em "Reatribuir para" e clicar "Direcionar"; os prazos e o escalonamento originais são mantidos (`sla-action-item.tsx:158-183`).
  7. "Nova ação" (ADMINISTRADOR): informar título, área, nível de risco, prazo contratual opcional e descrição; "Criar ação". Os prazos são calculados pela Matriz no momento da criação, e o responsável vem da Matriz da área (`components/sla/sla-action-form.tsx:26-63`; `actions.ts:104-145`). Origem sempre "Manual" (`sla-action-form.tsx` campo oculto `origin`).
  8. "Visão gerencial": totais (Total, Vencidas, Escaladas, Risco alto/crítico, Concluídas) e filtros por Risco, Status, Área, Responsável e Escalão; tabela com "Tempo restante / vencido há" (`components/sla/sla-actions-summary.tsx:73-170`).
- **Estados e exceções**:
  - Status exibidos: Pendente, Assumida, Estudando solução, Concluída, Vencida, Escalada, Cancelada (`lib/labels.ts:295-303`). Níveis: "Nível 1 · Responsável", "Nível 2 · Gerência", "Nível legado · Escalão 2" (só histórico), "Nível 3 · Diretoria" (`lib/labels.ts:305-310`).
  - Vazio: "Nenhuma ação aberta." (`page.tsx:101`); "Nenhuma ação concluída/cancelada ainda." (`page.tsx:130`).
  - Erros de ação: "Sessão expirada. Faça login novamente." (`actions.ts:89`) ou a mensagem crua do Postgres (`error.message`, por exemplo `actions.ts:188,213,255,284`) quando a RLS recusa. As actions de iniciar e reatribuir nem checam a sessão antes de gravar (`actions.ts:200-215,267-291`).
  - Histórico de escalonamento no cartão: "{data}: pendência não resolvida por {nível}; escalonada para {nível} ({nome}). Motivo: {motivo}." (`sla-action-item.tsx:104-114`; motivos em `lib/labels.ts:333-341`).
  - Abaixo de cada ação aberta aparece o painel "Ações via e-mail" só se houver registros (`page.tsx:118`; `components/email-actions/email-alert-action-history-panel.tsx:20-31`).
  - Em "Visão gerencial" o filtro de Status não oferece "Assumida" nem "Cancelada" (`sla-actions-summary.tsx:25`), embora essas ações apareçam na lista.
- **Textos hover e avisos atuais**:

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Título da página (aba do navegador) | Ações e Escalonamentos | `app/[projectId]/acoes/page.tsx:25` |
| Subtítulo | Matriz de criticidade, SLA interno e escalonamento automático — Nível 1 → Nível 2 → Nível 3. | `page.tsx:65` |
| Hover (shortDescription) do menu | Providências, responsáveis, prazos e SLA. | `lib/ui/feature-help.ts:51-55` |
| Clique no "i" do menu (description) | Acompanha ações criadas a partir de riscos, findings, solicitações e decisões humanas, incluindo responsável, prazo, SLA e eventual escalonamento. | `lib/ui/feature-help.ts:55` |
| "i" da sub-aba Ações abertas | Hover: "Ações e escalonamentos ainda em andamento." Clique: "Lista as ações com prazo de SLA em curso, com responsável, prazo e escalonamento (quando acionado)." e revisão humana: "A execução e o encerramento da ação são sempre decisão humana." | `lib/ui/feature-help.ts:405-412` |
| "i" Visão gerencial | Hover: "Panorama consolidado das ações por área e responsável." | `lib/ui/feature-help.ts:414-419` |
| "i" Histórico | Hover: "Ações já concluídas ou canceladas." | `lib/ui/feature-help.ts:420-425` |
| "i" Nova ação | Hover: "Cria manualmente uma ação com prazo de SLA." Revisão humana: "A criação manual de uma ação é sempre decisão humana. Findings de IA também podem gerar ações automaticamente." | `lib/ui/feature-help.ts:426-432` |
| Aria-label do "i" | Informações sobre {título da ajuda} | `components/shared/feature-info.tsx:61` |
| Hover do título da ação na Visão gerencial | Descrição da ação (tooltip, sublinhado pontilhado, `cursor-help`) | `components/sla/sla-actions-summary.tsx:181-190` |
| Placeholder do título | Ex.: Responder notificação do cliente | `components/sla/sla-action-form.tsx:27` |
| Placeholder da conclusão | O que foi feito para concluir esta ação? | `components/sla/sla-action-item.tsx:149` |
| Rótulo da conclusão | Observação de conclusão (recomendado detalhar evidência para risco alto/crítico) | `sla-action-item.tsx:148` |
| Aviso de reatribuição | O direcionamento mantém os prazos e o escalonamento originais. | `sla-action-item.tsx:179` |
| Sucesso de criação | Ação criada e sujeita à matriz de SLA. | `sla-action-form.tsx:63` |
| Botões durante o envio | Assumindo… / Registrando… / Concluindo… / Direcionando… / Criando… | `sla-action-item.tsx:123,133,152,176`; `sla-action-form.tsx` |
| Responsável vazio | não atribuído | `sla-action-item.tsx:81` |

- **Sugestões de melhoria dos textos**:
  - S-A1: "Estudando solução" é o nome do botão e do status, mas o botão parece uma pergunta de estado; sugerir "Marcar como Estudando solução" (e manter o status). Ver também D6 do cap. 7 (três nomes para estados próximos).
  - S-A2: A tela esconde os botões de GESTOR/GERENTE sem dizer por quê. Sugestão: quando o usuário não é ADMINISTRADOR, mostrar "Apenas o administrador do projeto pode assumir, concluir ou reatribuir ações."
  - S-A3: O erro cru do banco aparece ao usuário quando a RLS recusa (`actions.ts:188,213,255,284`). Sugestão: trocar por "Você não tem permissão para alterar esta ação."
  - S-A4: A Visão gerencial não filtra por "Assumida"/"Cancelada" (`sla-actions-summary.tsx:25`); incluir ou explicar.
- **Fontes**: `app/[projectId]/acoes/page.tsx`; `app/[projectId]/acoes/actions.ts`; `components/sla/sla-action-item.tsx`; `components/sla/sla-action-form.tsx`; `components/sla/sla-actions-summary.tsx`; `lib/labels.ts:283-341`; `lib/ui/feature-help.ts:51-55,405-432`; `supabase/migrations/20260822054900_sla_escalation_foundation.sql:414-446`.

---

### 4.9 Botão "Verificar escalonamentos" — rota `/{obra}/acoes` (cabeçalho)
- **Para que serve**: dispara manualmente a varredura das ações abertas e escala as que passaram do prazo. Não há agendador na própria tela; o comentário do componente diz que, enquanto não existir agendador real, este botão é o gatilho (`components/sla/sla-process-escalations-button.tsx:9-12`). Regras de prazo e quem é notificado: ver cap. 7.3, 7.5 e 7.7. Existe também o motor automático (cron), tratado no cap. 7.
- **Quem acessa / permissões**: a UI mostra o botão a qualquer membro (`page.tsx:68`). A action não confere perfil (`actions.ts:547-560`). A função `escalate_sla_action` exige ADMINISTRADOR (`supabase/migrations/20260910120000_skip_missing_sla_level_2.sql:39-40`; histórico em `20260830100500_restrict_sla_escalation_to_administrators.sql:1-30`). Para os demais perfis o erro da função é descartado e a ação é pulada (`actions.ts:615-619`), então o usuário vê **nenhuma mensagem** (nem erro, nem "0 escaladas"; a mensagem de sucesso só aparece com contagem maior que zero, `sla-process-escalations-button.tsx:26-28`). Isso é a divergência D2 do cap. 7.
- **Fluxo principal**:
  1. Clicar "Verificar escalonamentos". O botão muda para "Verificando…".
  2. O servidor lê ações, Matriz, responsáveis e fuso, calcula pela regra determinística e, quando devido, chama a função de escalonamento (`actions.ts:548-610`).
  3. Se houve escalonamento: "{N} ação(ões) escalada(s)." em verde.
  4. O e-mail ao novo nível sai pela fila (outbox) quando a ação está ligada a um alerta de risco, ou direto pelo envio antigo caso contrário (`actions.ts:621-700`).
- **Estados e exceções**: erro geral mostrado em vermelho ao lado do botão, por exemplo "Falha ao processar escalonamentos." ou "Falha ao enfileirar escalonamento: ..." (`actions.ts:631,711-713`). Falha de envio de e-mail não desfaz o escalonamento (`actions.ts:695-700`). Canal WhatsApp é simulado e desligado por padrão (`actions.ts:660-663`) — DEPENDE DE CONFIGURAÇÃO.
- **Textos hover e avisos atuais**:

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Botão | Verificar escalonamentos / Verificando… | `components/sla/sla-process-escalations-button.tsx:23` |
| Sucesso | {N} ação(ões) escalada(s). | `sla-process-escalations-button.tsx:27` |
| Erro | texto de `state.error` | `sla-process-escalations-button.tsx:25` |
| Hover/title | não encontrado | — |

- **Sugestões de melhoria dos textos**: o botão não tem `title` nem explicação. Sugestão: `title="Confere agora os prazos das ações abertas e escala as vencidas. Só administradores conseguem escalar."`; e mostrar "Nenhuma ação precisava de escalonamento." quando o resultado for zero, e "Apenas administradores podem escalar manualmente." para os demais (S7 do cap. 9).
- **Fontes**: `components/sla/sla-process-escalations-button.tsx`; `app/[projectId]/acoes/actions.ts:547-715`; `supabase/migrations/20260910120000_skip_missing_sla_level_2.sql:39-40`; `docs/manual-acc-capitulos-6-9.md` cap. 7.3.

---

### 4.10 Matriz de SLA e Escalonamento — rota `/{obra}/acoes/configuracao` (e seção em `/{obra}/usuarios#matriz-responsabilidades`)
- **Para que serve**: configurar, por projeto, o fuso e o expediente, os prazos por nível de risco (Baixo, Médio, Alto, Crítico) e quem é o Nível 1, Nível 2 e Nível 3 de cada área. O que cada prazo significa e os exemplos: cap. 6.7 e 7.4. Atenção: o botão "Matriz de responsabilidades e prazos" da tela de Ações leva a `/{obra}/usuarios#matriz-responsabilidades`, não a `/acoes/configuracao` (`app/[projectId]/acoes/page.tsx:70`). Nenhum link da interface para `/acoes/configuracao` foi encontrado (busca em `app` e `components`), então essa rota existe mas só é acessada digitando o endereço.
- **Quem acessa / permissões**: `/acoes/configuracao` devolve 404 para quem não é ADMINISTRADOR (`app/[projectId]/acoes/configuracao/page.tsx:32-35`). Na tela de Usuários a seção só aparece com `canManage = ADMINISTRADOR` (`app/[projectId]/usuarios/page.tsx:55,198`). O servidor revalida: matriz de prazos (`actions.ts:334-337`) e responsáveis (`actions.ts:442-444`) exigem ADMINISTRADOR, e a RLS reforça (`sla_matrix_rules` e `sla_project_settings_write_admin_only`, `supabase/migrations/20260822123400_sla_project_settings.sql:65-72`). **Exceção**: a action de fuso/expediente `configureSlaProjectSettingsAction` **não confere perfil no código** (`actions.ts:723-770`); só a RLS impede os demais.
- **Fluxo principal**:
  1. ADMINISTRADOR abre a seção (pela tela de Usuários).
  2. "Timezone e horário útil": informar o identificador de fuso (ex.: America/Sao_Paulo) e hora de início e fim do expediente (0 a 23); "Salvar" (`components/sla/sla-project-settings-form.tsx:36-66`).
  3. "Prazos por nível de risco": em cada linha (Baixo, Médio, Alto, Crítico) escolher a unidade (Horas úteis, Horas corridas, Dias úteis, Dias corridos), o prazo de assumir (Nível 1), responder, concluir, Nível 2 e Nível 3, as opções (E-mail, Confirmação, Justificativa) e clicar "Salvar" (ou "Cancelar" para descartar) (`components/sla/sla-matrix-config-form.tsx:93-197`; unidades em `lib/labels.ts:314-319`).
  4. "Responsáveis por área e nível": para cada área escolher Nível 1 Responsável, (Engenharia e Planejamento) Nível 1 Corresponsável, Nível 2 Gerência e Nível 3 Diretoria; "Salvar" (`components/sla/sla-area-responsibles-form.tsx:72-138`).
- **Estados e exceções**:
  - Linha sem regra salva mostra "(default)" (`sla-matrix-config-form.tsx:89`); ações já criadas **não** são recalculadas (comentário em `actions.ts:296-304`).
  - Validação do servidor: valores devem ser maiores que zero; Nível 2 maior que "assumir"; Nível 3 maior que Nível 2 (`lib/sla/validate-matrix-rule.ts:31-49`). Os campos numéricos aceitam passo de 0,5 (`sla-matrix-config-form.tsx:106`).
  - Responsáveis: pessoas diferentes para responsável e corresponsável; corresponsável só em Engenharia ou Planejamento; os escolhidos devem estar ativos ou com pré-cadastro aguardando o primeiro login (`actions.ts:450-495`).
  - Fuso inválido: `Timezone inválida: "{valor}". Use um identificador IANA (ex.: America/Sao_Paulo).` (`actions.ts:746`).
  - O painel "Alertas de risco do piloto" na página `/acoes/configuracao` só aparece com `ACC_WEEKLY_REPORTS_ENABLED` ligado (DEPENDE DE CONFIGURAÇÃO) (`configuracao/page.tsx:63,166`; flag em `lib/feature-flags/weekly-reports.ts:20`).
- **Textos hover e avisos atuais**:

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Título | Matriz de SLA e Escalonamento | `app/[projectId]/acoes/configuracao/page.tsx:68` |
| Subtítulo | Configuração específica deste projeto — sobrescreve os defaults (BAIXO/MÉDIO/ALTO/CRÍTICO) descritos em docs/sla-escalation.md. | `configuracao/page.tsx:70-71` |
| Título em Usuários | Matriz de responsabilidades e prazos | `app/[projectId]/usuarios/page.tsx:200` |
| Texto em Usuários | Configuração exclusiva deste projeto. O Nível 1 trata a ação, o Nível 2 recebe o primeiro escalonamento e o Nível 3 corresponde à Diretoria. | `usuarios/page.tsx:201-203` |
| Texto em Usuários | Riscos médios e baixos são reunidos em um único e-mail às quartas-feiras, às 7h. Riscos altos e críticos mantêm o alerta e o escalonamento imediato definidos na matriz. | `usuarios/page.tsx:205` |
| Seção | Timezone e horário útil (+ "i": Hover "Base de cálculo dos prazos de SLA deste projeto."; clique "Define o fuso horário e o horário comercial usados para calcular os prazos de SLA deste projeto, sobrescrevendo o default do sistema.") | `configuracao/page.tsx:77-78`; `lib/ui/feature-help.ts:434-439` |
| Seção | Prazos por nível de risco (+ "i": "Prazos de SLA para cada nível de risco."; "Configura, por nível de risco (Baixo/Médio/Alto/Crítico), o prazo interno de SLA aplicável neste projeto, sobrescrevendo os defaults padrão.") | `configuracao/page.tsx:94-95`; `feature-help.ts:441-446` |
| Seção | Responsáveis por área e nível (+ "i": "Quem recebe a ação e o escalonamento em cada área."; "Define, por área, quem é o responsável direto e quem recebe o escalonamento (1º escalão, 2º escalão e diretoria) quando o SLA não é cumprido.") | `configuracao/page.tsx:139-140`; `feature-help.ts:448-453` |
| Cabeçalhos da tabela | Risco, Unidade, Nível 1: assumir, Responder, Concluir, Nível 2, Nível 3, Opções, Ações | `configuracao/page.tsx:110-118` |
| Hover das opções | Notificar por e-mail / Exige confirmação de recebimento / Exige justificativa de atraso (rótulos visíveis: E-mail, Confirmação, Justificativa) | `components/sla/sla-matrix-config-form.tsx:170,174,178` |
| Aria-labels dos campos | Unidade de tempo — {Risco}; Prazo para assumir — {Risco}; Prazo para responder — {Risco}; Prazo para concluir — {Risco}; Prazo do Nível 2 — {Risco}; Prazo do Nível 3 — {Risco} | `sla-matrix-config-form.tsx:93,111,123,135,149,163` |
| Aviso expediente | Horário útil: 08:00–18:00, segunda a sexta ({fuso}). (valores vêm do cadastro; mostra "Usando o default institucional — ainda não configurado por este projeto." se não houver cadastro) | `components/sla/sla-project-settings-form.tsx:53-55` |
| Aviso feriados | Feriados ainda não são considerados nesta versão. | `sla-project-settings-form.tsx:57` |
| Aviso Nível 2 vazio | Se o Nível 2 não estiver definido, o alerta será escalonado diretamente para o Nível 3. | `sla-area-responsibles-form.tsx:132` |
| Opção vazia | Não definido | `sla-area-responsibles-form.tsx:72` |
| Confirmação | Salvo. | `sla-matrix-config-form.tsx:200`; `sla-project-settings-form.tsx:61`; `sla-area-responsibles-form.tsx` |
| Erros do servidor | Edição da Matriz de SLA exige permissão ADMINISTRADOR. · Apenas administradores podem alterar a matriz de responsáveis. · Selecione pessoas diferentes como responsável e corresponsável. · O corresponsável adicional só pode ser definido para Engenharia ou Planejamento. · Um dos usuários selecionados não está ativo neste projeto. · Um dos pré-cadastros selecionados não está mais aguardando o primeiro login. | `actions.ts:336,443,464,453,481,493` |
| Erros de validação | Ordem de escalonamento incoerente: "Até 2º escalão" precisa ser maior que "Prazo assumir". (idem "Até Diretoria" > "Até 2º escalão"); "{campo} não pode ser negativo nem zero."; "{campo}: valor numérico inválido." | `lib/sla/validate-matrix-rule.ts:45,38,35` |

- **Sugestões de melhoria dos textos**:
  - S-M1: a mensagem de validação fala em "Até 2º escalão"/"Até Diretoria"/"Prazo assumir", mas a tela fala "Nível 2", "Nível 3", "Nível 1: assumir" (`validate-matrix-rule.ts:45` x `configuracao/page.tsx:112-116`). Padronizar (S3 do cap. 9).
  - S-M2: o subtítulo cita o arquivo interno `docs/sla-escalation.md` (`configuracao/page.tsx:70-71`); remover (S2 do cap. 9).
  - S-M3: os rótulos "E-mail / Confirmação / Justificativa" são curtos e a explicação só aparece no hover (`title`), que não existe no celular; escrever por extenso numa legenda da tabela.
  - S-M4: falta dizer na tela que cada prazo de Nível 2 e Nível 3 conta a partir do vencimento do nível anterior (ver cap. 7.4 e D3/D4); hoje não há essa explicação.
  - S-M5: o botão da tela de Ações aponta para Usuários; trocar o texto por "Abrir matriz em Usuários" para evitar confusão com a rota `/acoes/configuracao`.
- **Fontes**: `app/[projectId]/acoes/configuracao/page.tsx`; `app/[projectId]/usuarios/page.tsx:55,198-300`; `components/sla/sla-matrix-config-form.tsx`; `components/sla/sla-project-settings-form.tsx`; `components/sla/sla-area-responsibles-form.tsx`; `app/[projectId]/acoes/actions.ts:305-536,723-770`; `lib/sla/validate-matrix-rule.ts`; `lib/ui/feature-help.ts:434-453`.

---

### 4.11 Resumo semanal de alertas (riscos médios e baixos) — rota `/{obra}/acoes/resumo-semanal/[digestId]`
- **Para que serve**: página aberta pelo e-mail semanal que reúne riscos médios e baixos; o destinatário responde cada item. Calendário e política de envio: cap. 6.7.2 e 7.4.
- **Quem acessa / permissões**: exige login (o `proxy.ts` redireciona não logados para `/login` com `?next=`, `proxy.ts:44-60`). Não há checagem de perfil na página; o texto de erro "O link não existe ou seu usuário não tem acesso a este resumo." decorre da leitura sob RLS (`app/[projectId]/acoes/resumo-semanal/[digestId]/page.tsx:25-35`). O servidor só aceita a resposta do destinatário do resumo ou de ADMINISTRADOR (`supabase/migrations/20260910230000_weekly_risk_alert_digest.sql:130-133`).
- **Fluxo principal**:
  1. Abrir o link do e-mail.
  2. Para cada alerta ler título, descrição e prazo e escolher em "Tratamento obrigatório": Ciente, Estudando solução, Resolvido ou "Direcionar para…" (`weekly-digest-form.tsx:15-18,75-95`).
  3. Se escolheu "Direcionar para…", escolher a pessoa (membros ativos); o aviso diz que prazos e escalonamento não são reiniciados (`weekly-digest-form.tsx:97-108`).
  4. Clicar "Enviar todas as respostas" (liberado só com todos respondidos; `weekly-digest-form.tsx:118-122`). Tudo é gravado de uma vez pela função `submit_weekly_alert_digest`.
- **Estados e exceções**: digest inexistente ou sem acesso: cartão "Resumo semanal indisponível" com botão "Voltar para Ações" (`page.tsx:25-35`); status RESPONDED: "Resumo respondido integralmente." (`page.tsx:51-58`); status diferente de SENT: "Este resumo ainda não foi enviado ou está aguardando reprocessamento." (`page.tsx:59-60`); erros: "Não foi possível identificar todos os itens do resumo.", "Responda todos os itens antes de enviar.", "Selecione para quem cada ação será direcionada." (`actions.ts:19,28,31`); erros do banco são exibidos como vieram: "Você não tem permissão para responder este resumo.", "Este resumo semanal já foi respondido.", "Este resumo ainda não está disponível para resposta." (`20260910230000_weekly_risk_alert_digest.sql:131,137,141`).
- **Textos hover e avisos atuais**:

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Título | Resumo semanal — riscos médios e baixos | `.../resumo-semanal/[digestId]/page.tsx:45` |
| Aviso azul | Selecione uma opção para cada alerta. O sistema só aceitará o envio quando todos estiverem respondidos. | `page.tsx:64` |
| Hover do cartão do alerta | `title` = descrição (ou título) do alerta | `weekly-digest-form.tsx:58` |
| Rótulo do campo | Tratamento obrigatório | `weekly-digest-form.tsx:75` |
| Aviso do direcionamento | Os prazos e o escalonamento não serão reiniciados. | `weekly-digest-form.tsx:108` |
| Rodapé fixo | Todos os itens estão respondidos. / Responda todos os itens para liberar o envio. | `weekly-digest-form.tsx:118` |
| Botão | Enviar todas as respostas / Enviando respostas… | `weekly-digest-form.tsx:121` |
| Sucesso | Todas as respostas foram registradas. As ações do ACC já foram atualizadas. | `weekly-digest-form.tsx:48` |

- **Sugestões de melhoria dos textos**: (a) as opções Ciente, Estudando solução, Resolvido e Direcionar não explicam o efeito na cobrança; sugerir uma frase por opção, alinhada ao cap. 7.3; (b) erros do banco chegam crus ao usuário (`actions.ts:44`); traduzir "permissão", "já respondido"; (c) "Tratamento obrigatório" pode virar "Como você vai tratar este alerta? (obrigatório)".
- **Fontes**: `app/[projectId]/acoes/resumo-semanal/[digestId]/{page.tsx,weekly-digest-form.tsx,actions.ts}`; `supabase/migrations/20260910230000_weekly_risk_alert_digest.sql:107-145`.

---

### 4.12 Alerta de risco (alerta formal) — rota `/{obra}/alertas/[caseId]`
- **Para que serve**: página autenticada de um alerta de risco do piloto, com situação, prazos pela Matriz, ações formais (RESOLVIDO, TOMANDO PROVIDÊNCIAS, ENVIAR P/, ESPECIALISTA, OUTRO, CONFIRMAR RESOLUÇÃO), linha do tempo, mensagens e entregas. Estados, regras de escalonamento imediato em ALTO/CRÍTICO e Expert: cap. 7.2, 7.3 e 8.
- **Quem acessa / permissões**: a página devolve 404 se `ACC_WEEKLY_REPORTS_ENABLED` estiver desligada (`app/[projectId]/alertas/[caseId]/page.tsx:24`; DEPENDE DE CONFIGURAÇÃO) ou se o alerta não for visível ao usuário (`page.tsx:29`). Leitura por membro do projeto (RLS) (`actions.ts:46-47`). A ação é um POST autenticado; a decisão final é da função `record_risk_alert_action`, que valida estado esperado, idempotência e quem pode agir (`supabase/migrations/20260921090000_pilot_risk_alert_delivery.sql:692-770`; mensagem "Usuário sem permissão para agir sobre este alerta." na linha 769). Quem pode agir (resumo): administrador, responsável atual ou anterior, encaminhado ativo, destinatário ou responsável da área na Matriz (cap. 7.3).
- **Fluxo principal**:
  1. Abrir o alerta (do menu ou do botão do e-mail). Se vier de botão do e-mail (`?acao=&t=`), a ação já vem pré-selecionada e o token é validado; nada muda só por abrir (`page.tsx:20-21`).
  2. Ler o cartão "Situação" (resumo, impacto, recomendação do Expert, responsável atual e anterior, nível atual e próximo, prazos da Matriz, ação SLA, próximo escalonamento por prazo, exigências da Matriz, destinatários suprimidos) (`page.tsx:35-49`).
  3. Em "Ações" clicar um dos botões entre colchetes; preencher o formulário daquela ação e clicar "Confirmar {AÇÃO}" (`components/risk-alerts/alert-action-forms.tsx:54-126`):
     - RESOLVIDO / CONFIRMAR RESOLUÇÃO: Conclusão (obrigatória), Evidência (obrigatória para ALTO/CRÍTICO), Justificativa (obrigatória se a Matriz exigir) e a caixa "Confirmo a resolução" (`alert-action-forms.tsx:73-79`).
     - TOMANDO PROVIDÊNCIAS: Providência (obrigatória) e Previsão opcional (`:81-85`).
     - ENVIAR P/: pesquisar, escolher o Destinatário, escrever a Instrução e marcar a confirmação (`:87-107`).
     - ESPECIALISTA: escolher o Expert e escrever a Pergunta (`:108-122`).
     - OUTRO: Descrição obrigatória (`:123`).
  4. Ler a mensagem verde com o resultado; o servidor devolve "{resumo}. Estado: {estado}." mais, se houver, "Escalonamento imediato para {nível} registrado." e "Nível máximo já atingido (Diretoria informada)." (`app/[projectId]/alertas/[caseId]/actions.ts:118`).
- **Estados e exceções**:
  - Alerta já resolvido: "Alerta resolvido — nenhuma ação adicional." (`alert-action-forms.tsx:48`).
  - Link do e-mail inválido: "Link do e-mail expirado ou inválido — use os botões abaixo normalmente." (`page.tsx:55`); no envio: "Link de ação expirado ou inválido. Use os botões da própria página." (`actions.ts:111`).
  - Expert sem tema claro: "Selecione o Expert: o tema da pergunta não foi identificado com confiança suficiente." (`actions.ts:70`).
  - Listas vazias: "Nenhum evento.", "Nenhuma mensagem.", "Nenhum encaminhamento.", "Nenhuma." (`page.tsx:75,94,109,118`).
  - Erros do banco aparecem como vieram (`actions.ts:120`), p.ex. "Estado do alerta mudou (esperado ..., atual ...) — recarregue e repita." (`20260921090000_pilot_risk_alert_delivery.sql:727`), "Já existe um encaminhamento ativo; aguarde a ação ou a devolução." (`:860`), "O prazo para assumir este encaminhamento expirou; a responsabilidade voltou ao remetente." (`:775`).
  - Destinatário fora da lista do piloto: a opção mostra "— fora da allowlist do piloto (recebe só este alerta)" (`alert-action-forms.tsx:99`); lista do piloto DEPENDE DE CONFIGURAÇÃO.
- **Textos hover e avisos atuais**:

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Título | Alerta de risco — {título} (subtítulo: {referência} · área {área} · código {código}) | `app/[projectId]/alertas/[caseId]/page.tsx:33` |
| Selo de risco | `{view.riskLevel}` cru (HIGH, CRITICAL etc.) | `page.tsx:36` |
| Selo | Limite de escalonamento atingido | `page.tsx:36` |
| Rótulos dos botões | [RESOLVIDO] [TOMANDO PROVIDÊNCIAS] [ENVIAR P/] [ESPECIALISTA] [OUTRO] [CONFIRMAR RESOLUÇÃO] | `lib/risk-alerts/types.ts:296-303`; `alert-action-forms.tsx:56` |
| Aviso âmbar (ALTO/CRÍTICO) | Risco {nível}: esta ação provoca escalonamento imediato ao próximo nível hierárquico ({nível}). A ação e o escalonamento são eventos distintos, ambos auditados; o alerta permanece aberto. | `alert-action-forms.tsx:69` |
| Rótulos | Conclusão · Evidência (obrigatória para ALTO/CRÍTICO) · Justificativa (obrigatória pela Matriz) · Confirmo a resolução (responsável e data ficam registrados). · Confirmo o encaminhamento (um único encaminhamento ativo; prazo para assumir pela Matriz). | `alert-action-forms.tsx:75-78,105` |
| Busca de destinatário | Pesquisar destinatário (nome, e-mail, área, posição na Matriz) / placeholder "Digite para filtrar…" | `alert-action-forms.tsx:90-91` |
| Aviso do Expert | O Expert apenas recomenda: não executa ações nem resolve o alerta; a resposta exige revisão humana e chega na mesma thread. | `alert-action-forms.tsx:120` |
| Aria-label do formulário | Ação {AÇÃO} | `alert-action-forms.tsx:61` |
| Botões | Confirmar {AÇÃO} / Registrando… | `alert-action-forms.tsx:126` |
| Cartões | Situação · Ações · Timeline · Mensagens e respostas (thread do alerta) · Encaminhamentos, devoluções e entregas · Entregas (outbox) | `page.tsx:36,53,73,92,107,117` |
| Sinalização | Destinatários suprimidos (piloto): {n}; "(default — simulação)" ao lado dos prazos | `page.tsx:44,48` |

- **Sugestões de melhoria dos textos**: (a) mostrar o risco e o estado com os rótulos do `lib/labels.ts`, não `HIGH/CRITICAL`, e `ESCALATED` etc. na "Ação SLA" (`page.tsx:36,45`; S5 do cap. 9); (b) "Timeline" e "outbox" são termos técnicos para usuário final (`page.tsx:73,117`); sugerir "Histórico do alerta" e "Envios de e-mail"; (c) levar o aviso de escalonamento imediato também para o cartão "Situação" e para o e-mail (S4 do cap. 9); (d) o origin e o tipo de evento aparecem em código (`e.type`, `e.origin`) na timeline; traduzir.
- **Fontes**: `app/[projectId]/alertas/[caseId]/{page.tsx,actions.ts}`; `components/risk-alerts/alert-action-forms.tsx`; `lib/risk-alerts/types.ts:296-318`; `supabase/migrations/20260921090000_pilot_risk_alert_delivery.sql:692-860`; `docs/manual-acc-capitulos-6-9.md` cap. 7.2 e 7.3.

---

### 4.13 Resposta rápida de alertas de evento (lote de e-mail) — rotas `/alertas/acao/{obra}/{lote}/{evento}`, `/alertas/lote/{obra}/{lote}` e `/{obra}/ledger/lote-alertas/{lote}`
- **Para que serve**: responder, a partir do e-mail, os alertas de eventos de contrato. Há três telas para o mesmo lote: (1) resposta rápida de **um** alerta (`/alertas/acao`), (2) resposta rápida de **vários** (`/alertas/lote`, versão compacta) e (3) a página completa dentro da obra (`/{obra}/ledger/lote-alertas/{lote}`), que o botão "RESPONDER AO ACC" abre quando o e-mail tem vários alertas. As ações são só RESOLVIDO, EM ANDAMENTO e ENVIADO P/ (`lib/email-actions/contract-alert-batch-types.ts`). Isso é uma trilha diferente da do alerta de risco formal (cap. 6.1).
- **Quem acessa / permissões**: exige login (`proxy.ts:44-60`). Leitura sob RLS; "Este link não existe ou seu usuário não tem acesso ao alerta." (`app/alertas/acao/[projectId]/[batchId]/[eventId]/page.tsx:59`). Gravação: a função `submit_contract_alert_batch_response` só aceita o destinatário do lote ou ADMINISTRADOR (`supabase/migrations/20260921130000_contract_alert_batches_foundation.sql:254-257`). A UI não mostra perfil. Abrir o link (GET) nunca registra nada (`compact-action-form.tsx:37-38`).
- **Fluxo principal**:
  1. Clicar o botão do e-mail (RESOLVIDO, EM ANDAMENTO ou ENVIADO P/ no alerta desejado).
  2. Lote de 1 alerta: a página mostra projeto, título e a ação; ler o aviso azul sobre a repetição ou encerramento; se ENVIADO P/, escolher o colaborador; clicar "CONFIRMAR" (`compact-action-form.tsx:37-62`).
  3. Lote com vários alertas: a tela rápida avisa "Este e-mail contém vários alertas. Para preservar a resposta conjunta, conclua todos no ACC." e leva a "RESPONDER AO ACC" (`page.tsx:90-100`).
  4. Na página do lote: para cada alerta escolher "Ação obrigatória"; opcionalmente "Salvar esta ação" para gravar na hora (resposta parcial); "Ação salva" confirma. O botão final "RESPONDER AO ACC" (na versão compacta "CONFIRMAR TUDO") só libera com todos respondidos; o contador mostra "X de Y alertas respondidos" (`contract-alert-batch-form.tsx:125-205`).
- **Estados e exceções**:
  - Já respondido: "Este alerta já foi respondido." / "Este lote de alertas já foi respondido." / "Lote respondido integralmente." (`alertas/acao/.../page.tsx:63`; `alertas/lote/.../page.tsx:71`; `ledger/lote-alertas/[batchId]/page.tsx:69`).
  - Ainda não enviado: "Este lote ainda não está disponível para resposta." / "Este lote de alertas ainda não foi enviado ou está aguardando reprocessamento." (`alertas/lote/.../page.tsx:75`; `ledger/lote-alertas/[batchId]/page.tsx:75`).
  - Ação ausente ou inválida: "Ação inválida ou ausente." (`alertas/acao/.../page.tsx:66`); no envio: "Ação inválida.", "Selecione um colaborador.", "Evento não encontrado neste lote.", "Este alerta não está disponível para seu usuário." (`alertas/acao/.../actions.ts:20,24,34,29`); no lote: "Todos os alertas precisam ter uma ação definida antes do envio.", "Selecione um colaborador para cada alerta enviado." (`ledger/lote-alertas/[batchId]/actions.ts:39,42`).
  - Falha do lote inteiro: lista de pendentes em vermelho (`contract-alert-batch-form.tsx:224-235`).
  - Página do lote inexistente: "Lote de alertas indisponível" com botão "Voltar para o Ledger" (`ledger/lote-alertas/[batchId]/page.tsx:33,36`).
- **Textos hover e avisos atuais**:

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Cabeçalho | AXION Controle de Contratos · Resposta rápida ao alerta | `alertas/acao/.../page.tsx:52-53` |
| Cabeçalho (lote) | Resposta rápida · {obra} · {n} alertas | `alertas/lote/.../page.tsx:64` |
| Hover do título | `title` = título do alerta | `alertas/acao/.../page.tsx:72`; `contract-alert-batch-form.tsx:111` |
| Aviso EM ANDAMENTO | Este alerta será repetido a cada {N} dia(s) até a conclusão. (CRÍTICA 1, ALTA 2, MÉDIA 4, BAIXA 7 — dias corridos) | `lib/alerts/repeat-policy.ts:10-15,43` |
| Aviso ENVIADO P/ | O destinatário receberá este alerta a cada {N} dia(s) até a conclusão. | `repeat-policy.ts:51` |
| Aviso RESOLVIDO | Ao confirmar, este alerta será encerrado e os lembretes futuros serão interrompidos. | `repeat-policy.ts:47` |
| Aviso azul da página do lote | Defina RESOLVIDO, EM ANDAMENTO ou ENVIADO P/ para cada alerta. "VER EVENTO" é só consulta e não conta como resposta. A resposta ao ACC só é liberada quando todos os alertas abaixo tiverem uma ação definida. | `ledger/lote-alertas/[batchId]/page.tsx:79-80` |
| Rótulos | Ação · Ação obrigatória · Enviado para · Selecione uma ação · Selecione um colaborador | `contract-alert-batch-form.tsx:126,140,154,163`; `compact-action-form.tsx:57` |
| Botões | CONFIRMAR / Confirmando… · Salvar esta ação / Salvando… · Ação salva · RESPONDER AO ACC / CONFIRMAR TUDO / Enviando resposta… | `compact-action-form.tsx:62`; `contract-alert-batch-form.tsx:185-203` |
| Pendências | Todos os alertas precisam ter uma ação definida antes do envio. · Pendentes: | `contract-alert-batch-form.tsx:209-212` |
| Sucesso | Ação registrada no ACC. Você pode voltar ao e-mail. · Todos os alertas foram respondidos. A resposta ao ACC foi enviada. | `compact-action-form.tsx:43`; `contract-alert-batch-form.tsx:100` |

- **Sugestões de melhoria dos textos**: (a) o aviso de EM ANDAMENTO não diz que um alerta ALTO/CRÍTICO desse lote é tratado por **outro mecanismo** que não escala na hora (ver cap. 6.1 e 7.1); acrescentar uma linha curta; (b) "RESPONDER AO ACC" é o nome do botão que leva à página e também do botão final, o que confunde; sugerir "ABRIR LOTE NO ACC" no primeiro; (c) o hover do título só repete o título (`title={item.title}`), sem valor; trocar por resumo ou remover.
- **Fontes**: `app/alertas/acao/[projectId]/[batchId]/[eventId]/*`; `app/alertas/lote/[projectId]/[batchId]/page.tsx`; `app/[projectId]/ledger/lote-alertas/[batchId]/*`; `lib/alerts/repeat-policy.ts`; `components/alerts/alert-action-notice.tsx`; `lib/email-actions/respond-to-contract-alert-batch.ts`; `supabase/migrations/20260921130000_contract_alert_batches_foundation.sql:240-270`.

---

### 4.14 Resposta rápida de alerta de providência — rota `/alertas/providencia/{obra}/{providencia}`
- **Para que serve**: responder, a partir do e-mail, o alerta de uma providência de início ou de entrega (RESOLVIDO, EM ANDAMENTO, ENVIADO P/). A tela é somente leitura até o clique em CONFIRMAR (`app/alertas/providencia/[projectId]/[itemId]/page.tsx:16-18`).
- **Quem acessa / permissões**: exige login; leitura por RLS. A função `delivery_item_respond` confere que quem age participa da obra; **concluir (RESOLVIDO) exige `has_project_permission(...,'GESTOR')`**, que no banco só ADMINISTRADOR satisfaz (`supabase/migrations/20261027150000_delivery_item_respond.sql:49`, regra geral em `20260829200000_project_permission_gerente_compat.sql:104-112`); a mensagem do banco diz: "Concluir exige confirmação de um usuário autorizado (gestor, gerente ou administrador). Use EM ANDAMENTO ou ENVIADO P/ para encaminhar a um gestor." (`20261027150000_delivery_item_respond.sql:84`). Divergência: o texto promete GESTOR/GERENTE, o banco aceita só ADMINISTRADOR (ver D1 do cap. 9).
- **Fluxo principal**: 1) clicar o botão do e-mail; 2) conferir projeto, fase e título; 3) RESOLVIDO: preencher Evidência / documento / protocolo ou Justificativa; EM ANDAMENTO: apenas ler o aviso; ENVIADO P/: escolher o colaborador; 4) CONFIRMAR.
- **Estados e exceções**: "Este link não existe ou seu usuário não tem acesso à providência." (`page.tsx:65`); "Esta providência já está encerrada." (concluída ou não aplicável; `page.tsx:67`); "Ação inválida ou ausente." (`page.tsx:69`); erros do banco repassados quando têm menos de 260 caracteres, senão "Não foi possível registrar a ação." (`actions.ts:34-35`): "Você não tem permissão para agir sobre esta providência.", "O alerta já está com este responsável.", "O destinatário precisa ser um colaborador ativo vinculado à obra.", "Concluir exige evidência/documento/protocolo ou uma justificativa." (`20261027150000_delivery_item_respond.sql:41,65,71,89`).
- **Textos hover e avisos atuais**:

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Cabeçalho | Resposta rápida ao alerta de providência | `page.tsx:61` |
| Hover do título | `title` = título da providência | `page.tsx:77` |
| Avisos azuis | mesmos de `lib/alerts/repeat-policy.ts:43,47,51` (ver tela anterior) | `components/alerts/alert-action-notice.tsx` |
| Aviso do RESOLVIDO | Concluir a providência exige gestor, gerente ou administrador da obra e uma evidência/protocolo ou uma justificativa. | `delivery-alert-action-form.tsx:65` |
| Campos | Evidência / documento / protocolo · Justificativa (se não houver evidência) · Enviado para | `delivery-alert-action-form.tsx:68,72` |
| Botão e sucesso | CONFIRMAR / Confirmando… · Ação registrada no ACC. Você pode voltar ao e-mail. | `delivery-alert-action-form.tsx:81,37` |

- **Sugestões de melhoria dos textos**: trocar "gestor, gerente ou administrador da obra" por "administrador da obra" enquanto o banco aceitar só esse perfil, ou ajustar a regra (D1). A lista "Enviado para" mostra todos os membros ativos, inclusive quem não pode concluir; avisar "Para concluir, encaminhe a um administrador".
- **Fontes**: `app/alertas/providencia/[projectId]/[itemId]/*`; `supabase/migrations/20261027150000_delivery_item_respond.sql:19-127`.

---

### 4.15 Consultar IA sobre o alerta — rota `/alertas/consulta-ia/{obra}/{evento|providencia}/{id}`
- **Para que serve**: pergunta a um especialista de IA sobre um alerta, a partir do botão CONSULTAR IA do e-mail. É consulta somente de leitura: não altera o alerta nem registra providência (`app/alertas/consulta-ia/.../actions.ts:6-9`). Especialistas disponíveis e como conferir respostas: cap. 8.
- **Quem acessa / permissões**: exige login e vínculo ativo com a obra; qualquer perfil com acesso (`page.tsx:24`; `lib/ai/alert-consult/run-alert-consult.ts:87-88`). Tipo na URL deve ser `evento` ou `providencia`, senão "Este link não existe..." (`page.tsx:21`). O provedor de IA real DEPENDE DE CONFIGURAÇÃO (a tela diz quando é resposta de teste).
- **Fluxo principal**: 1) abrir o link do e-mail; 2) conferir a especialidade pré-selecionada pela sua área (Contratual/Jurídico, Engenharia, Planejamento e Prazo, SSMA, Documentação e Entrega, Geral; `lib/ai/alert-consult/specialties.ts:29-65`); 3) ajustar a Pergunta (padrão: "Como tratar ou mitigar esta situação de risco? Apresente opções práticas de acordo com sua especialidade.", máximo 2000 caracteres; `specialties.ts:72-75`); 4) clicar "Consultar"; 5) ler a resposta, a indicação do provedor e as "Fontes utilizadas".
- **Estados e exceções**: "Este link não existe ou seu usuário não tem acesso ao alerta." (`page.tsx:63`); erros: "Selecione uma especialidade.", "Digite uma pergunta.", "A pergunta deve ter no máximo 2000 caracteres.", "Você não possui acesso ativo a esta obra.", "Este alerta não existe ou seu usuário não tem acesso a ele.", "Não foi possível identificar o alerta desta consulta. Reabra o link do e-mail e tente novamente.", "Falha ao consultar o especialista de IA." (`specialties.ts:137,151-154`; `run-alert-consult.ts:78-80`).
- **Textos hover e avisos atuais**:

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Cabeçalho | Consultar IA sobre o alerta | `page.tsx:59` |
| Tipo do alerta | Alerta de evento contratual / Alerta de providência | `page.tsx:68` |
| Nota da área | Selecionado pela sua área cadastrada ({área}): {especialidade}. · Sua área cadastrada ({área}) não tem especialista correspondente; selecionamos "Geral". · Você não tem área cadastrada nesta obra; selecionamos "Geral". + " Você pode trocar a seleção." | `page.tsx:44-48`; `alert-consult-panel.tsx:74` |
| Aviso principal | A consulta não altera o alerta e não registra nenhuma providência. | `alert-consult-panel.tsx:96` |
| Aviso de teste | Resposta de TESTE ({provedor}) — nenhuma análise real de IA foi realizada. | `alert-consult-panel.tsx:116` |
| Provedor real | Provedor: {rótulo} · {modelo} | `alert-consult-panel.tsx:120` |
| Fontes | Fontes utilizadas (consultáveis no ACC); tipos Evento, Cláusula, Evidência, Providência | `alert-consult-panel.tsx:126-127,24-29` |
| Botão | Consultar (ícone gira enquanto carrega) | `alert-consult-panel.tsx:93` |

- **Sugestões de melhoria dos textos**: não há aviso de revisão humana nesta tela além do que o painel de resposta de especialista exibir (cap. 9.2); acrescentar "A resposta é apoio à decisão e precisa de revisão humana." perto do botão "Consultar". Os caminhos de acesso por perfil estão em D12/D13 do cap. 8.
- **Fontes**: `app/alertas/consulta-ia/[projectId]/[subject]/[id]/*`; `lib/ai/alert-consult/{specialties.ts,run-alert-consult.ts}`.

---

### 4.16 Ação de e-mail (botões do e-mail acionável) — rota `/email-actions/[token]`
- **Para que serve**: confirmar, dentro do ACC, uma das quatro ações de um e-mail de alerta: DAR CIÊNCIA, ASSUMIR RESPONSABILIDADE, DEFINIR PRAZO, RESPONDER AO ACC. Vale para alerta de contrato, ação de SLA e solicitação de ação (`lib/email-actions/types.ts:7-47`).
- **Quem acessa / permissões**: exige login (o `proxy.ts` preserva o destino em `?next=`, `proxy.ts:44-60`). A página lê o contexto sem alterar nada (`app/email-actions/[token]/page.tsx:12-16`). O servidor (função `confirm_email_alert_action`) exige membro ATIVO; ASSUMIR RESPONSABILIDADE e DEFINIR PRAZO exigem ADMINISTRADOR, GESTOR ou GERENTE; COLABORADOR e LEITURA só podem DAR CIÊNCIA e RESPONDER (`supabase/migrations/20260829200000_project_permission_gerente_compat.sql:477-482`). O e-mail só oferece os botões plausíveis ao destinatário (`lib/email-actions/resolve-allowed-actions.ts:12,47-56`), mas isso é só UX. Observação: aqui GERENTE/GESTOR têm permissão no banco, ao contrário das demais telas deste capítulo.
- **Fluxo principal**: 1) clicar o botão no e-mail; 2) fazer login se pedido; 3) conferir Projeto, tipo do alerta, título e "Ação solicitada"; 4) RESPONDER: escrever a Resposta (3 a 4000 caracteres); DEFINIR PRAZO: escolher "Novo prazo" (obrigatório) e comentar; ciência e assumir: nenhum campo; 5) "Confirmar" (`app/email-actions/[token]/confirm-form.tsx:36-65`).
- **Estados e exceções**: "Este link não é válido, expirou, ou você não tem acesso a ele." (`page.tsx:40`); "Esta ação já foi confirmada anteriormente." (`page.tsx:44`); "Este link expirou em {data}. Peça um novo alerta/notificação." (`page.tsx:48`); "Sua permissão no projeto não é suficiente para esta ação." (`page.tsx:52`); "Data/hora inválida." (`actions.ts:24`); erros do banco repassados sem tradução (`lib/email-actions/confirm-action.ts:49`), como "Token expired", "Not an active project member", "Insufficient permission for this action" (`20260829200000_...sql:435,477,481`), em português apenas "A resposta precisa ter entre 3 e 4000 caracteres" e "O prazo não pode ser no passado" (`:494,503`). Tempo de vida do link: não encontrado no código lido (definido no SQL de emissão; DEPENDE DE CONFIGURAÇÃO).
- **Textos hover e avisos atuais**:

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Cabeçalho | AXION Controle de Contratos · Ação de e-mail | `app/email-actions/[token]/page.tsx:33-34` |
| Rótulos fixos | Projeto · {Alerta de contrato \| Ação de SLA \| Solicitação de ação} · Ação solicitada | `page.tsx:75,79,83`; `lib/email-actions/types.ts:42-46` |
| Rótulos das ações | DAR CIÊNCIA · ASSUMIR RESPONSABILIDADE · DEFINIR PRAZO · RESPONDER AO ACC | `lib/email-actions/types.ts:24-29` |
| Explicações curtas (title e legenda no e-mail) | Confirma que você tomou conhecimento deste alerta. · Assume a responsabilidade por tratar este item. · Define ou ajusta o prazo de resposta para este item. · Abre o campo para registrar sua resposta diretamente no ACC. | `lib/email-actions/types.ts:35-40` |
| Campos | Resposta · Novo prazo · Comentário (obrigatório se estiver reduzindo um prazo já existente) | `confirm-form.tsx:40,50,55` |
| Botão | Confirmar / Confirmando… | `confirm-form.tsx:62` |
| Sucesso | Confirmado com sucesso. | `confirm-form.tsx:31` |
| Histórico na tela da ação | Ações via e-mail | `components/email-actions/email-alert-action-history-panel.tsx:31` |

- **Sugestões de melhoria dos textos**: (a) traduzir os erros em inglês do banco para português na camada `confirm-action.ts`; (b) "Peça um novo alerta/notificação" não diz a quem pedir; sugerir "Abra o alerta no ACC e use os botões da própria página."; (c) a explicação do RESPONDER AO ACC diz "Abre o campo", mas o clique leva a uma tela de confirmação; ajustar.
- **Fontes**: `app/email-actions/[token]/*`; `lib/email-actions/{types.ts,resolve-allowed-actions.ts,confirm-action.ts}`; `supabase/migrations/20260829200000_project_permission_gerente_compat.sql:410-505`.

---

### 4.17 Providências — rota `/{obra}/providencias`
- **Para que serve**: tabela única das providências de início e de entrega da obra (CNO, as-built, databook, AVCB, concessionárias etc.) com responsável, prazo, situação, grau de risco e evidência. Os alertas recorrentes usam esses mesmos registros (`lib/ui/feature-help.ts:242-247`). Título da página: "Providências e pendências para entrega" (`app/[projectId]/providencias/page.tsx:51`). Cada registro leva um grau de risco, tratado na seção "Classificação de risco" abaixo e no cap. 6.
- **Quem acessa / permissões**: qualquer membro vê a tabela (leitura por RLS `project_delivery_items_select_members`, `supabase/migrations/20261027130000_project_delivery_items.sql:102`). Sem projeto: 404 (`page.tsx:23`). UI: controles de cadastro e a coluna "Ações" aparecem para ADMINISTRADOR, GESTOR ou GERENTE (`lib/delivery/delivery-data.ts:73`; `page.tsx:59`). **Servidor**: todas as funções `delivery_items_seed_checklist`, `delivery_item_add_custom`, `delivery_item_update_fields` e `delivery_item_change_status` exigem `has_project_permission(...,'GESTOR')`, que só ADMINISTRADOR satisfaz (`20261027130000_project_delivery_items.sql:137,193,229,315`; regra em `20260829200000_...:104-112`). Resultado: GESTOR e GERENTE veem os formulários, mas o banco recusa ao salvar com o texto "Você não tem permissão para configurar as providências desta obra." ou "...editar as providências desta obra." (`:138,230`) ou "Concluir ou alterar a situação exige confirmação de um usuário autorizado (gestor, gerente ou administrador)." (`:316`). Confirmar no banco real: DEPENDE DE CONFIGURAÇÃO.
- **Fluxo principal**:
  1. Abrir "Providências" no menu (`lib/ui/nav-items.ts:40`).
  2. Tabela vazia: ADMINISTRADOR clica "Cadastrar checklist inicial" (14 providências, sem datas nem responsáveis) (`components/delivery/delivery-admin-controls.tsx:25-28`; mensagem de sucesso `providencias/actions.ts:26`).
  3. Para acrescentar item da obra: preencher "Nova providência da obra" e "Fase" (Início da obra ou Entrega) e clicar "Adicionar" (`delivery-admin-controls.tsx:36-50`). Entra com grau MÉDIO provisório (`:52`).
  4. Na linha, clicar "Editar": em "Dados da providência" informar Data limite de finalização, Prazo interno antecipado, Responsável interno, "Depende de" e "Quem", Número do CNO (só no item CNO), Evidência, "Bloqueia a entrega" e "Aplicabilidade e responsabilidade contratual confirmadas"; "Salvar dados" (`components/delivery/delivery-item-editor.tsx:43-125`).
  5. Em "Situação" escolher a nova situação (Pendente, Em andamento, Concluído, Não aplicável), preencher Justificativa e Evidência quando exigido e clicar "Confirmar situação" (`delivery-item-editor.tsx:127-142`; `lib/delivery/delivery-items.ts:20-25`).
  6. Em "Grau de risco" (dentro do Editar) usar o painel de classificação (seção abaixo).
  7. Ler a coluna "Acompanhamento", que informa quando os alertas começam (60 dias corridos antes do fim da obra ou no prazo individual) (`delivery-items-table.tsx:82-90`; `lib/delivery/delivery-items.ts:297-335`).
- **Estados e exceções**:
  - Situações: Pendente, Em andamento, Concluído, Não aplicável (`lib/delivery/delivery-items.ts:20-25`). Concluir exige evidência ou justificativa; Não aplicável exige justificativa; registrar evidência não conclui (`delivery-item-editor.tsx:93,128`; SQL `20261027130000_project_delivery_items.sql:324,327`).
  - Selos na linha: Sem responsável, Sem prazo, Próximo do vencimento, Vencido, Bloqueia a entrega, Aplicabilidade a confirmar, Risco a definir (`delivery-items-table.tsx:21-29`). Cores da linha: vencido (vermelho), concluído (verde), não aplicável (cinza), próximo do vencimento (laranja) (`:rowTone`).
  - Sem a data final da obra: aviso âmbar `Preencha a data final da obra para calcular a janela de alertas de 60 dias antes do término. Sem ela, só os prazos individuais geram alerta.` (`delivery-items-table.tsx:82-84`).
  - Módulo não habilitado: "Este módulo ainda não foi habilitado neste ambiente (a migration das providências não foi aplicada)." (`page.tsx:56`) — DEPENDE DE CONFIGURAÇÃO.
  - Vazio: "Nenhuma providência cadastrada. Cadastre o checklist inicial ou adicione providências específicas da obra." (`page.tsx:61`).
  - Erros: "Informe o nome da providência.", "Selecione a situação." (`actions.ts:36,77`); mensagens do banco com menos de 220 caracteres, senão "Não foi possível salvar. Tente novamente." (`actions.ts:18`); outras do banco: "O responsável interno precisa ser um colaborador ativo da obra.", "A providência já está nesta situação." (`20261027130000_...:239,318`).
- **Textos hover e avisos atuais**:

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Título e subtítulo | Providências e pendências para entrega · {obra} — tabela única de providências: os alertas usam estes mesmos registros. | `providencias/page.tsx:51-52` |
| Hover do menu (i) | "Tabela de providências e pendências para a entrega da obra." Clique: "Controla as providências de início e de entrega da obra (CNO, as-built, databook, AVCB, concessionárias etc.) com responsável, prazo, situação e evidência. Os alertas recorrentes usam estes mesmos registros." | `lib/ui/feature-help.ts:242-247` |
| Aviso do checklist | Cria 14 providências sem datas, responsáveis nem comprovações. O checklist não comprova que cada item seja obrigação da construtora: confirme a aplicabilidade item a item. | `delivery-admin-controls.tsx:28-29` |
| Placeholder | Ex.: Licença ambiental de operação | `delivery-admin-controls.tsx:39` |
| Aviso do novo item | A nova providência começa com grau MÉDIO provisório (nunca crítico por padrão). Depois de criar, use "Classificação de risco" na linha: a sugestão pelos critérios pede cláusula, prazo e a avaliação de iminência e de tempo para mitigação, e só a revisão com justificativa muda o grau. | `delivery-admin-controls.tsx:52-53` |
| Rótulos | Responsável interno (colaborador ativo da obra) · Prazo interno antecipado (opcional) · Registrar a evidência não conclui a providência. · Justificativa (obrigatória para Não aplicável; vale como comprovação ao concluir) | `delivery-item-editor.tsx:55,51,93,128` |
| Aviso de situação | Concluir exige gestor, gerente ou administrador e evidência ou justificativa. Tudo fica no histórico. | `delivery-item-editor.tsx:136` |
| Mensagens | Providência adicionada. · Providência atualizada. · Situação atualizada. · {N} providências do checklist inicial cadastradas (a confirmar). · O checklist inicial já estava cadastrado. | `providencias/actions.ts:26,41,67,87` |
| Texto de apoio | Término previsto: {data} — alertas das providências de entrega começam 60 dias corridos antes (ou no prazo individual, se ele vencer antes). · CNO (providência de início): prazo de referência {data} — {base} | `delivery-items-table.tsx:87-95` |
| Mensagens de acompanhamento | Item encerrado (concluído ou não aplicável). · Providência de início: acompanhada por prazo próprio, sem janela D−60. · Prazo vencido — permanece vencida até conclusão ou dispensa justificada. · Dentro da janela de 60 dias antes do término. | `lib/delivery/delivery-items.ts:297-335` |
| Colunas | Providência, Fase, Data limite, Responsável, Situação, Grau de risco, Evidência / protocolo, Acompanhamento, Ações | `delivery-items-table.tsx:101-110` |

- **Sugestões de melhoria dos textos**:
  - S-P1: "Concluir exige gestor, gerente ou administrador" (`delivery-item-editor.tsx:136`; também `delivery-alert-action-form.tsx:65`) não corresponde ao banco, que só aceita ADMINISTRADOR (D1). Alinhar texto ou regra.
  - S-P2: os formulários aparecem para GESTOR/GERENTE e falham só ao salvar; esconder ou avisar "Apenas administradores salvam alterações."
  - S-P3: "Aplicabilidade e responsabilidade contratual confirmadas" não explica o efeito (selo "Aplicabilidade a confirmar" some); acrescentar uma linha.
  - S-P4: "Editar" abre um painel longo sem título; incluir "Editar providência" e deixar claro que "Dados" e "Situação" são salvos por botões separados.
  - S-P5: coluna Grau de risco mostra "repete a cada N dias" (`delivery-items-table.tsx:155`), mas o texto não explica que é a frequência do lembrete; usar "lembrete a cada N dias".
- **Fontes**: `app/[projectId]/providencias/{page.tsx,actions.ts}`; `components/delivery/{delivery-admin-controls,delivery-item-editor,delivery-items-table}.tsx`; `lib/delivery/{delivery-data.ts,delivery-items.ts}`; `lib/ui/feature-help.ts:242-247`; `supabase/migrations/20261027130000_project_delivery_items.sql`.

---

### 4.18 Classificação de risco (painel "Grau de risco" e seção "Classificação de risco") — aparece em `/{obra}/ledger/[eventId]` e dentro de `/{obra}/providencias` (Editar > Grau de risco)
- **Para que serve**: mostrar o grau de risco atual, os critérios, uma sugestão determinística e permitir que uma pessoa autorizada registre um grau final com justificativa e histórico. Critérios, quem sugere e quem define: cap. 6.3 a 6.5; o painel de aviso antes do envio: cap. 9.2. Aqui só o fluxo de tela.
- **Quem acessa / permissões**: qualquer membro vê o grau, os critérios e o histórico. O formulário "Revisar classificação" aparece para ADMINISTRADOR, GESTOR ou GERENTE (`components/risk/risk-review-section.tsx:39`; para providências `canEdit` em `lib/delivery/delivery-data.ts:73`); os demais veem "Apenas gestor, gerente ou administrador da obra revisa o grau de risco." (`components/risk/risk-review-panel.tsx:261`). **Servidor**: `review_risk_classification` exige `has_project_permission(...,'GESTOR')`, só ADMINISTRADOR no banco (`supabase/migrations/20261028120000_risk_classification_reviews.sql:122-123`). Divergência D1 do cap. 9.
  - No Ledger a seção só existe se o evento tiver avaliação de IA (`app/[projectId]/ledger/[eventId]/page.tsx:155`); o aviso "antes do envio" fica em `:142`.
- **Fluxo principal**:
  1. Abrir o evento no Ledger (seção "Classificação de risco") ou, em Providências, "Editar" e "Grau de risco".
  2. Ler "Grau de risco atual" e, se difere, "({Classificação da IA \| Classificação inicial}: {nível} — preservada)" (`risk-review-panel.tsx:117-125`).
  3. Abrir "Critérios de classificação" (`:128-140`; textos em `lib/risk-classification/suggest-risk.ts:22-27`).
  4. Preencher: Natureza do risco (A confirmar, Possível descumprimento contratual, Processual); Prazo contratual aplicável (só em evento: A confirmar, Já vencido, Ainda não venceu, Sem prazo contratual; em providência o prazo vem do registro); "O descumprimento é iminente?" (A confirmar/Sim/Não); "Ainda há tempo para mitigação?" (A confirmar/Sim, há tempo/Não há tempo); Consequência prevista (opcional) e, se houver cláusula verificada, a caixa de confirmação (`risk-review-panel.tsx:147-198`).
  5. Ler a "Sugestão" (Fato, Inferência ou Recomendação, com referências) que se atualiza na hora; ela não altera o alerta (`:200-229`).
  6. Escolher "Grau de risco a registrar" (vem preenchido com a sugestão), opcionalmente a "Referência verificável" e a Justificativa (obrigatória), e clicar "Registrar classificação" (`:231-258`).
  7. A action recalcula a sugestão no servidor com cláusula, evidência e prazo lidos do banco (o navegador só informa o que a pessoa declarou) e chama a função SQL, que grava o histórico (`app/[projectId]/risco/actions.ts:13-16,43-71`).
- **Estados e exceções**: "Selecione o grau de risco." · "Informe a justificativa da classificação." · "Alerta não encontrado nesta obra." (`risco/actions.ts:39,40,44`); mensagens do banco com menos de 220 caracteres, senão "Não foi possível registrar a revisão. Tente novamente." (`:26`); do banco: "Revisar o grau de risco exige gestor, gerente ou administrador da obra.", "O grau de risco já é este." (`20261028120000_risk_classification_reviews.sql:123,125`). O histórico não pode ser alterado nem apagado (`:56`). Sem cláusula verificada: "Sem cláusula verificada vinculada: uma penalidade não pode ser tratada como prevista em contrato." (`risk-review-panel.tsx:197`). Sem histórico: "Nenhuma revisão registrada — vale a classificação original." (`:267`). Sucesso: "Classificação de risco registrada no histórico." (`risco/actions.ts:77`). A classificação pelo botão de edição de providências não envia o risco (`providencias/actions.ts:135-136` comentário).
- **Textos hover e avisos atuais**:

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Título da seção (evento) | Classificação de risco | `components/risk/risk-review-section.tsx:44` |
| Título (providência) | Grau de risco | `components/delivery/delivery-item-editor.tsx:207` |
| Resumo do grau | {Nível} — repete a cada {N} dia(s) | `risk-review-panel.tsx:119` |
| Critérios | Crítico: Risco iminente de descumprimento e penalização contratual, com necessidade de ação imediata. · Alto: ...mas ainda existe tempo para mitigação. · Médio: Risco com possível consequência a médio prazo. · Baixo: Risco processual, relacionado ao acompanhamento e à organização. | `lib/risk-classification/suggest-risk.ts:22-27` |
| Nota dos critérios | Não há um número de dias que separe os níveis: iminência e tempo para mitigação são informados por quem revisa. | `risk-review-panel.tsx:138` |
| Título do formulário | Revisar classificação (gestor, gerente ou administrador) | `risk-review-panel.tsx:144` |
| Rótulos | Natureza do risco · Prazo contratual aplicável · O descumprimento é iminente? · Ainda há tempo para mitigação? · Consequência/penalidade contratual prevista (opcional) · Grau de risco a registrar · Referência verificável (opcional; placeholder "Cláusula, documento ou protocolo") · Justificativa (obrigatória) | `risk-review-panel.tsx:147-251` |
| Aviso da sugestão | A sugestão não altera o alerta; é apoio à decisão e exige revisão humana. | `risk-review-panel.tsx:228` |
| Selos da base | Fato · Inferência · Recomendação | `risk-review-panel.tsx:45` |
| Botão | Registrar classificação / Registrando… | `risk-review-panel.tsx:257` |
| Hover dos níveis (i) | Baixo: Impacto limitado; acompanhamento de rotina. · Médio: Exige atenção e acompanhamento. · Alto: Pode gerar impacto contratual, econômico ou operacional relevante. · Crítico: Pode gerar consequência grave e exige atenção prioritária. | `lib/ui/feature-help.ts:378-401` |
| Aviso antes do envio | Ver cap. 9.2 (`components/risk/risk-review-section.tsx:69-104` (EventRiskPreSendNotice)) | `components/risk/risk-review-section.tsx` |

- **Sugestões de melhoria dos textos**: S1, S6 e S13 do cap. 9.2.2 (hover dos selos diferente dos critérios, texto "gestor, gerente ou administrador" x banco, "imediato" não é imediato). Acréscimos: (a) o histórico mostra "Usuário" quando o nome não é encontrado (`risk-review-panel.tsx:275`) e "A definir" no nível anterior; (b) o rótulo "Classificação da IA" sugere que o grau original veio de IA também para eventos cadastrados manualmente — conferir.
- **Fontes**: `app/[projectId]/risco/{actions.ts,actions-state.ts}`; `components/risk/{risk-review-panel,risk-review-section}.tsx`; `lib/risk-classification/suggest-risk.ts`; `supabase/migrations/20261028120000_risk_classification_reviews.sql:56,101-125`; `docs/manual-acc-capitulos-6-9.md` cap. 6.

---

### 4.19 Adicionais — rota `/{obra}/adicionais` (e `/{obra}/adicionais/[proposalId]`) — **sem tela própria**
- **Para que serve**: antigamente acompanhava propostas de serviços adicionais (nova proposta, status, aprovações, contratado, checklist documental, curadoria por Experts IA). A aba foi removida da interface. Hoje a regra é: serviço adicional aprovado entra por **upload manual do ADM na área Documentos** (`app/[projectId]/adicionais/page.tsx:3-6`; `lib/ui/feature-help.ts:141`).
- **Quem acessa / permissões**: as duas rotas apenas redirecionam para `/{obra}/documentos` do mesmo projeto, sem consultar o banco (`app/[projectId]/adicionais/page.tsx:21`; `adicionais/[proposalId]/page.tsx:18`). Não há item "Adicionais" no menu (`lib/ui/nav-items.ts:26-53`). As permissões de upload em Documentos são tratadas na seção Documentos do manual (outra equipe), fora deste escopo; não encontrado aqui um upload específico para "adicionais" na tela de Documentos (busca por "adicional/ADDITIONAL" em `app/[projectId]/documentos` sem resultados).
- **Fluxo principal (vigente)**: ADMINISTRADOR abre Documentos e envia o arquivo do adicional aprovado. Detalhes na seção Documentos.
- **Código remanescente (não acessível pela interface)**:
  - Existem as actions `createAdditionalProposalAction` (origens Manual, Google Drive, Fonte existente; planilha de custo opcional .xlsx/.xls cuja aba FECHAMENTO/B12 vira estimativa), `updateAdditionalProposalStatusAction`, `updateAdditionalProposalApprovalsAction`, `markAdditionalProposalContractedAction`, `linkAdditionalProposalSourceAction` e `runAdditionalProposalCurationAction` (curadoria Comercial + Planejamento + Jurídico, consolidada pelo CEO IA) (`app/[projectId]/adicionais/actions.ts:61,188,212,242,277,312`). Os formulários em `components/additionals/*` **não são renderizados por nenhuma página** (busca de uso em `app` e `components` só encontra os próprios arquivos, `components/shared/badges.tsx` e `components/dashboard-visual/summary-cards.tsx`).
  - Escrita nessas actions depende da RLS (`project_additional_proposals_insert_editor` e `_update_editor`, mínimo EDITOR = ADMINISTRADOR, `supabase/migrations/20260823070000_additional_proposal_lifecycle.sql:170-189`); as actions só exigem sessão (`actions.ts:52-56`). Como são Server Actions exportadas, mantê-las sem tela é um ponto a avaliar (superfície sem uso).
  - Origem "Google Drive" é recusada no servidor sem cliente configurado: "Integração com Google Drive ainda não configurada — não é possível criar uma proposta com essa origem." (`actions.ts:95`) — DEPENDE DE CONFIGURAÇÃO.
- **Estados e exceções (código remanescente)**: status de proposta: Possível adicional, Em análise, Em negociação, Contratado, Não contratado, Cancelado (`lib/labels.ts:344-351`); aprovações: Não avaliado, Não necessário, Pendente, Aprovado, Rejeitado (`lib/labels.ts:353-359`); prazo: inclui A solicitar, Solicitado, Aprovado parcialmente (`lib/labels.ts:361-369`); formalização: Aditivo contratual, E-mail de aprovação, Ordem de compra / PO, Ordem de serviço, Carta / autorização formal, Ata / registro formal aceito, Outro, Não identificado (`lib/labels.ts:371-380`). Mensagem genérica de campo faltando: "Campo obrigatório ausente: {campo}" (`actions.ts:49`).
- **Textos hover e avisos atuais** (existem no código, mas sem tela):

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Ajuda do módulo | "Controle das propostas e possíveis serviços adicionais." / "Acompanha possíveis adicionais desde a solicitação do cliente até orçamento, proposta, negociação, contratação, documentação, execução e impacto de prazo." | `lib/ui/feature-help.ts:87-92` |
| Nova proposta | "Cadastra ou vincula uma possível proposta adicional ao projeto." | `lib/ui/feature-help.ts:347-351` |
| Marcar como Contratado | "Registra uma contratação já decidida por uma pessoa. A IA não pode executar esta ação." | `lib/ui/feature-help.ts:353-357` |
| Formalização | "Indica como a aprovação do adicional foi documentada: e-mail, PO, aditivo, ordem de serviço ou outro meio." | `lib/ui/feature-help.ts:359-363` |
| Status de prazo | "É independente da contratação comercial. Um adicional contratado não significa automaticamente que extensão de prazo foi aprovada." | `lib/ui/feature-help.ts:365-369` |
| Documentação | "Mostra os documentos existentes e o que ainda falta para comprovar e acompanhar a contratação." | `lib/ui/feature-help.ts:371-375` |
| Aba Propostas | "Lista as propostas de adicionais já cadastradas, com status, título e data." | `lib/ui/feature-help.ts:508-512` |
| Planilha | Planilha de custo (opcional — .xlsx/.xls) · Google Drive está desabilitado nesta fase — selecione a planilha diretamente. Se ela tiver exatamente uma aba "FECHAMENTO", o valor da célula B12 preenche automaticamente o valor proposto acima (estimativa, nunca definitivo). | `components/additionals/additional-proposal-create-form.tsx:215-221` |
| Sem Drive | Integração com Google Drive ainda não configurada. Não é possível criar uma proposta com origem Drive agora — use a origem Manual. | `additional-proposal-create-form.tsx:73-76` |
| Sucesso | Proposta criada como "Possível adicional". · Proposta marcada como CONTRATADO. · Aprovações atualizadas. | `additional-proposal-create-form.tsx:253`; `additional-proposal-contracted-form.tsx:126`; `additional-proposal-approvals-form.tsx:92` |
| Contratado | Ação exclusivamente humana — nenhum Expert IA pode executar esta ação. | `additional-proposal-contracted-form.tsx:50` |
| Curadoria | Curadoria de Experts IA · Comercial + Planejamento + Jurídico, consolidados pelo CEO IA. | `additional-proposal-curation-panel.tsx:31-32` |
| Checklist | Checklist documental · O sistema busca automaticamente o que já existe no projeto antes de pedir um novo upload. | `additional-proposal-checklist.tsx:37-42` |

- **Sugestões de melhoria dos textos**: (a) a ajuda `adicionais` e `adicionais-tab-propostas` descrevem uma aba que não existe mais (`lib/ui/feature-help.ts:87-92,508-512`); atualizar ou marcar como descontinuada para não induzir a AXIA ou o usuário a procurar a aba; (b) a ajuda de Integrações já traz a regra vigente (upload manual do ADM em Documentos, `feature-help.ts:141`); sugerir repetir a frase no redirecionamento (hoje o usuário é levado a Documentos sem explicação); (c) se a funcionalidade não voltar, avaliar remover as Server Actions e os componentes sem uso (decisão do dono do produto; não alterar sem autorização, regra 9 do CLAUDE.md).
- **Fontes**: `app/[projectId]/adicionais/{page.tsx,[proposalId]/page.tsx,actions.ts}`; `components/additionals/*`; `lib/labels.ts:344-388`; `lib/ui/feature-help.ts:87-92,141,347-375,508-512`; `supabase/migrations/20260823070000_additional_proposal_lifecycle.sql:163-215`.

### 4.20 Jurídico — rota `/{obra}/juridico` (e entrada global `/juridico`)

- **Para que serve**
  Tela única com dois comportamentos conforme o tipo do espaço (`project.workspaceType`, `app/[projectId]/juridico/page.tsx:42`). Em **obra contratada**: lista a base documental contratual (contrato-base, aditivos e documentos vinculados) e oferece a consulta ao Consultor Jurídico IA (`:93-113`). Em **espaço pré-contratual** (negociação de minuta, separado das obras assinadas): card de upload da minuta + consulta jurídica + "Análise integrada para negociação" com todos os especialistas e consolidação do CEO IA (`:59-66`, `:118`). A entrada global `/juridico` cria e lista os espaços pré-contratuais (`app/juridico/page.tsx:13-43`); o card "Jurídico IA" em `/projetos` leva a ela (`app/projetos/page.tsx:147-150`). Conteúdo dos especialistas: ver CAP69 cap. 8.

- **Quem acessa / permissões**
  - Menu: item "Jurídico" sem restrição (`NAV:32`).
  - Obra contratada: qualquer membro ativo vê a página; a consulta exige membership ativo (`lib/ai/legal-query-action.ts:31` — "Você não possui acesso ativo a este espaço."). **Não há upload nesta tela em obra contratada**: o botão "Gerenciar documentos" leva a `/documentos` (`juridico/page.tsx:96`).
  - Pré-contratual: UI mostra o upload só para ADMINISTRADOR, GESTOR ou GERENTE (`:43`); LEITURA e COLABORADOR veem o aviso de acesso de leitura (`components/legal/precontract-document-card.tsx:141-145`). A conferência de leitura do documento revalida no servidor autenticação, membership, tipo PRE_CONTRATUAL, vínculo versão→documento→projeto e prefixo do storage (`lib/legal/precontract-document-verify-action.ts:1-24`, `:80-94`). O registro do arquivo em si é protegido pelas RPCs de upload de documentos (`documentos/page.tsx:133-139`) — não reverificado aqui.
  - **Criar** um espaço pré-contratual: a UI de `/juridico` mostra o formulário a qualquer usuário, mas a RPC `create_precontract_workspace` só aceita quem é ADMINISTRADOR ativo em algum projeto: "Somente administradores podem criar análises pré-contratuais." (`supabase/migrations/20260911120000_legal_precontract_workspaces.sql:36-42`; `app/juridico/actions.ts:22-30`). A mensagem do banco é exibida crua.
  - Quais espaços a lista `/juridico` mostra depende de `getProjects()` e da RLS de `projects`: **não verificado nesta leitura**.
  - Painel integrado pré-contratual: exige membership ativo (`lib/ai/precontract-curation-action.ts:28-30`).
  - IA real: **DEPENDE DE CONFIGURAÇÃO** (provider Anthropic x provider de teste; ver "Estados").

- **Fluxo principal**
  1. Em `/projetos`, clicar no card "Jurídico IA" (ou abrir `/juridico`).
  2. Preencher "Nome da oportunidade ou concorrência" e "Cliente" e clicar "Criar e anexar documentos" (`components/legal/precontract-workspace-create-form.tsx:131-145`).
  3. Aparece "Análise “<nome>” criada." e o painel "Carregar documentos para a análise" (`:105-116`); enviar a minuta, anexos e demais documentos e clicar "Abrir análise jurídica" (`:122`). Alternativamente, abrir um card da lista (`app/juridico/page.tsx:35-37`).
  4. Em `/{obra}/juridico` (pré-contratual): escolher o "Tipo documental" (Contrato base, Aditivo, Memorial/Edital, Proposta Comercial, Proposta Técnica — `precontract-document-card.tsx:37`; rótulos `lib/labels.ts:441-465`), arrastar ou selecionar PDF/DOCX/TXT (vários de uma vez) (`:25`, `:124-127`).
  5. Se o arquivo parecer nova versão de um documento existente, escolher "Registrar como nova versão" ou "Registrar como documento separado" (`:224-225`, `:233`, `:242`) — a decisão é sempre humana.
  6. Aguardar a barra de envio e o status "Processando documento" até "Pronto"; a consulta só é liberada com conteúdo legível (`lib/legal/precontract-document-state.ts:179-199`).
  7. Escrever a pergunta e clicar "Consultar" (consulta ao Consultor Jurídico) ou, no painel inferior, "Consultar todos os especialistas" (análise integrada) (`components/ai/expert-query-panel.tsx:439-446`; `precontract-curation-panel.tsx:55-58`).
  8. Revisar a resposta (seções "Interpretação (sugestão, não fato)", "Fatos documentados", "Riscos", "Recomendações" etc., `expert-query-panel.tsx:276-310`). Nenhuma recomendação é enviada ou aceita automaticamente (`precontract-curation-panel.tsx:74`).
  9. "Voltar às análises pré-contratuais" retorna a `/juridico` (`juridico/page.tsx:120`).
  - Obra contratada: passos 7-8 somente, mais conferir a lista "Base documental" (`:93-104`).

- **Estados e exceções**
  - Status do upload pré-contratual: "Aguardando documento", "Aguardando sua confirmação", "Enviando", "Processando documento", "Pronto", "Documento duplicado", "Erro" (`precontract-document-state.ts:28-36`). Há "Cancelar envio" durante o envio e "Tentar novamente" em erro (`precontract-document-card.tsx:194,206`).
  - Consulta bloqueada com motivo visível: "Confirme como este arquivo deve ser registrado para continuar.", "Aguarde o envio do documento terminar.", "Processando documento — a consulta é liberada quando o conteúdo estiver disponível.", "Nenhum documento pôde ser lido. Envie um PDF, DOCX ou TXT com texto selecionável.", "Envie um documento da negociação para consultar o especialista jurídico." (`precontract-document-state.ts:187-199`).
  - **Sem OCR neste fluxo**: a verificação extrai texto em memória, sem gravar extração (`precontract-document-verify-action.ts:8-11`); PDF digitalizado falha com "Nenhum texto pôde ser extraído de "<arquivo>". O arquivo pode ser um PDF digitalizado sem OCR." (`lib/documents/extraction/extract-document-text.ts:150`). Formatos fora de PDF/DOCX/TXT são recusados (`lib/documents/extraction/document-format.ts:14-34`). O OCR com cobertura por página existe apenas no worker de Documentos (ver aba Documentos).
  - Mensagens de erro de verificação: "Não foi possível processar este documento. Tente novamente ou envie outro arquivo.", "Documento não encontrado nesta análise.", "Documento sem arquivo armazenado.", "Este espaço não é uma análise jurídica pré-contratual.", "Sessão expirada. Entre novamente para continuar." (`precontract-document-verify-action.ts:46,80,94,118,121`). Falha geral do lote: "Não foi possível verificar os documentos. Recarregue a página." (`components/legal/use-precontract-upload.ts:131`).
  - Pergunta/resposta **não são persistidas**; recarregar zera a conversa (`precontract-workspace-client.tsx:5-10`). O documento permanece e é reconhecido após F5.
  - Vazio: "Nenhuma análise pré-contratual criada." (`app/juridico/page.tsx:39`); "Nenhum contrato, minuta, aditivo ou anexo cadastrado." (`juridico/page.tsx:104`).
  - Banner de provider: antes da primeira consulta "O provider será exibido aqui após a primeira consulta."; provider real mostra "Provider: … Resposta gerada por IA. Toda sugestão exige revisão humana antes de qualquer ação."; provider de teste mostra "… não é IA real" (`expert-query-panel.tsx:389,394-397`, `:401-403`). **DEPENDE DE CONFIGURAÇÃO** (provider por expert: `lib/ai/providers/resolve-provider-for-expert`; rótulos `lib/ai/provider-ui-metadata.ts:18,21`).
  - Base legal: "Base legal oficial não disponível nesta fase (nenhum corpus normativo versionado no projeto)." (`expert-query-panel.tsx:298`).
  - Tempo: a página aceita até 300 s por ação (`juridico/page.tsx:27`); o painel integrado mostra "Consultando Jurídico, Comercial, Engenharia/Planejamento e ESG/SSMA e consolidando via CEO IA. Isso pode levar algum tempo — aguarde nesta tela." (`precontract-curation-panel.tsx:62`).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Menu "Jurídico" (title) | "Jurídico — Documentos contratuais e consulta ao especialista jurídico." | `NAV:32`, `FH:58-64`, `app-sidebar.tsx:125` |
| FeatureInfo `juridico` (descrição) | "Em obras contratadas, reúne contrato-base, anexos, aditivos e consulta jurídica. Antes da contratação, o espaço jurídico permite analisar a minuta com todos os especialistas e consolidação do CEO IA." | `FH:61-62` |
| FeatureInfo `juridico` (revisão humana) | "Toda análise da IA é apoio à decisão e exige validação humana." | `FH:63` |
| Card do cabeçalho (descrição) | "Ambiente de negociação da minuta antes da contratação, separado das obras assinadas." / "Consulta ao contrato assinado, anexos, aditivos e especialista jurídico." | `juridico/page.tsx:57-58` |
| Linha de documento contratual (title) | `resumo da versão mais recente` ou "Documento contratual: <título>" | `juridico/page.tsx:100` |
| Campo Nome (title) | "Identifica a negociação antes de ela se tornar uma obra contratada." | `precontract-workspace-create-form.tsx:135` |
| Campo Cliente (title) | "Empresa contratante responsável pela minuta em negociação." | `:141` |
| Card pré-contratual (descrição) | "Contrato, minuta ou aditivo em PDF, DOCX ou TXT. O especialista jurídico responde a partir do texto deste documento." | `precontract-document-card.tsx:79-80` |
| Área de arrastar | "Arraste os documentos aqui ou clique para selecionar" / "PDF, DOCX ou TXT com texto selecionável · é possível selecionar vários de uma vez" | `:124,126` |
| Aviso LEITURA | "Você possui acesso de leitura. O envio de documentos exige permissão de GERENTE, GESTOR ou ADMINISTRADOR." | `:143` |
| Barra de progresso (aria-label) | "Envio de <arquivo>" | `:174` |
| Pergunta (title) | "Descreva o contexto e a pergunta. O especialista usará os documentos e dados disponíveis neste projeto; a resposta exige revisão humana." | `expert-query-panel.tsx:429` |
| Painel integrado (descrição) | "Consulta Jurídico, Comercial, Engenharia/Planejamento e ESG/SSMA; o CEO IA consolida as posições. Revisão humana obrigatória." | `precontract-curation-panel.tsx:34` |
| Painel integrado (title do campo) | "Descreva a cláusula e o objetivo da negociação. Os especialistas usarão também os documentos deste espaço." | `:46` |
| Painel integrado (aviso) | "Nenhuma recomendação é enviada ou aceita automaticamente." | `:74` |
| Resposta (rodapé) | "Revisão humana obrigatória." / "Rascunho pendente de revisão humana — nada foi enviado." | `expert-query-panel.tsx:322,318` |
| Card "Jurídico IA" em /projetos (title) | "Criar ou abrir uma análise de minuta antes da contratação da obra." | `app/projetos/page.tsx:149` |
| Cabeçalho de `/juridico` | "Jurídico — análise prévia" / "Negociação de minutas antes da contratação." | `app/juridico/page.tsx:22` |

- **Sugestões de melhoria dos textos**
  1. O formulário de criação em `/juridico` aparece para todos, mas só ADMINISTRADOR consegue criar; o usuário não-admin recebe a mensagem crua da RPC. Sugestão: antes do formulário, "Somente administradores podem criar uma análise pré-contratual."
  2. "texto selecionável" (`precontract-document-state.ts:196`, `precontract-document-card.tsx:126`) é jargão. Sugestão: "PDF com texto (não escaneado), DOCX ou TXT. PDFs escaneados ainda não são lidos nesta tela."
  3. A diferença entre "Pergunte ao especialista jurídico" (1 especialista) e "Consultar todos os especialistas" (5) não está explicada ao usuário na tela. Sugestão: uma linha em cada título/descrição.

- **Fontes**: `app/[projectId]/juridico/page.tsx:27-120`; `app/juridico/page.tsx:1-43`; `app/juridico/actions.ts:1-30`; `components/legal/*`; `lib/legal/precontract-document-state.ts`; `lib/legal/precontract-document-verify-action.ts`; `lib/ai/legal-query-action.ts`; `lib/ai/precontract-curation-action.ts`; `components/ai/expert-query-panel.tsx`; `components/ai/precontract-curation-panel.tsx`; `supabase/migrations/20260911120000_legal_precontract_workspaces.sql`; `FH:58-64`. Observação de deriva: CAP69 cita o controle de upload do Jurídico em `juridico/page.tsx:41`; hoje a regra está em `juridico/page.tsx:43`.

---

### 4.21 Revisão contratual (menu: "Análise Contratual", cabeçalho: "Revisão Contratual") — rota `/{obra}/revisao-contratual` — FORA DO MENU

- **Para que serve**
  Fila de revisão humana de "candidatos" a evento contratual detectados automaticamente a partir de threads de e-mail do projeto. Nada entra no Event Ledger sem aprovação humana (`app/[projectId]/revisao-contratual/page.tsx:56-58`). Aprovar cria um evento no Event Ledger; rejeitar exige justificativa.

- **Quem acessa / permissões**
  - Fora do menu desde a decisão registrada em `NAV:33-38` ("o Expert Jurídico da página inicial é o ponto único"); rota, página, APIs e permissões continuam existindo. **Nenhum link para esta rota foi encontrado** em `app/`, `components/` ou `lib/` (busca por `revisao-contratual`) — acesso só digitando a URL. O texto do assistente AXIA/ajuda: não encontrado.
  - A página não bloqueia por perfil; a lista vem da RLS (`lib/contract-review.ts:40-48`, só `status = PENDING_REVIEW`).
  - UI: botões de aprovar/rejeitar só para `permission === "ADMINISTRADOR"` (`page.tsx:50-51`). Os demais perfis veem o aviso de leitura (`:359-363`).
  - Servidor: a RPC `review_email_thread_event_candidate` exige `has_project_permission(..., 'EDITOR')` (`supabase/migrations/20260820180344_contract_review_workflow.sql:50-54`), que na regra atual equivale a ADMINISTRADOR. UI e banco coincidem; a mensagem fala em "EDITOR ou ADMIN" (perfis legados).
  - Os cartões "Sua permissão" e "Pode revisar" exibem o perfil bruto (ou "SEM ACESSO") e "Sim/Não" (`:63-92`).

- **Fluxo principal**
  1. Abrir a URL; conferir os três cartões: Pendentes, Sua permissão, Pode revisar.
  2. Em cada candidato (ordenado por score decrescente, `lib/contract-review.ts:45-47`), ler assunto, thread (16 primeiros caracteres), severidade, categorias, Score, Mensagens, Início, Última mensagem (`page.tsx:101-184`).
  3. Abrir "Ver evidências (N)" e ler cada e-mail (data, direção, assunto, De, Para, trecho) (`:186-255`).
  4. Para aprovar: ajustar "Título do evento", preencher "Conclusão do revisor" (obrigatória) e clicar "Aprovar como evento" → o usuário é redirecionado ao evento no Ledger (`:259-313`; `actions.ts:75-142`).
  5. Para rejeitar: preencher "Justificativa da rejeição" (obrigatória) e clicar "Rejeitar candidato" → retorna à fila (`:315-356`; `actions.ts:145-192`).

- **Estados e exceções**
  - Fila vazia: "Nenhum candidato aguardando revisão." (`page.tsx:96`).
  - Candidato já revisado: erro "Este candidato já foi revisado." (`actions.ts:69-71`); não encontrado/sem permissão: "Candidato não encontrado ou sem permissão de acesso." (`:60-62`); falha de RPC: "Falha ao aprovar candidato: …" / "Falha ao rejeitar candidato: …" (`:113-115`, `:177-179`). As actions **lançam exceção** (sem estado de formulário amigável): o usuário vê a página de erro do Next.
  - Campo obrigatório: "Campo obrigatório ausente: <campo>" (`:17-19`).
  - Aprovação revalida Ledger, Timeline e Auditoria (`:118-132`).
  - Dependência: candidatos só existem se a ingestão/detecção de e-mails estiver ativa (**DEPENDE DE CONFIGURAÇÃO**: ver Integrações).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Descrição da página | "Candidatos detectados automaticamente a partir das comunicações do projeto. Nenhum candidato entra no Event Ledger sem revisão humana." | `page.tsx:57` |
| FeatureInfo `analise-contratual` | "Analisa contrato e documentos associados em nível macro, destacando obrigações, condições comerciais, prazos, responsabilidades e riscos." — existe em FH mas **nenhum componente a consome** (não encontrado fora de `feature-help.ts`) e descreve algo diferente da tela real | `FH:66-71` |
| Placeholder aprovação | "Descreva o fato contratual confirmado, sua relevância e o entendimento do revisor." | `page.tsx:303` |
| Placeholder rejeição | "Explique por que este candidato não deve ser tratado como evento contratual." | `:344` |
| Aviso sem permissão | "Você possui acesso de leitura. Aprovação ou rejeição exige permissão EDITOR ou ADMIN." | `:359-362` |
| Títulos da aba (metadata) | "Análise Contratual" (aba do navegador) x "Revisão Contratual" (cabeçalho) | `:25`, `:56` |

- **Sugestões de melhoria dos textos**
  1. O aviso fala em "EDITOR ou ADMIN" (nomes legados que não existem na UI de Usuários). Sugestão: "Aprovar ou rejeitar exige o perfil ADMINISTRADOR."
  2. Nome inconsistente: aba do navegador "Análise Contratual", cabeçalho "Revisão Contratual", FeatureInfo "Análise Contratual" com descrição de análise macro. Padronizar em "Revisão contratual (candidatos de e-mail)" e corrigir ou remover o FeatureInfo órfão.
  3. Erros de servidor sem tratamento amigável (exceção): converter em mensagem na tela.

- **Fontes**: `app/[projectId]/revisao-contratual/page.tsx`, `actions.ts`; `lib/contract-review.ts:36-48,184-209`; `supabase/migrations/20260820180344_contract_review_workflow.sql:50-54,312`; `NAV:33-38`; `FH:66-71`.

---

### 4.22 Revisão de cláusulas — rota `/{obra}/revisao-clausulas` — FORA DO MENU

- **Para que serve**
  Fila de validação humana dos "candidatos a cláusula" que o detector automático extrai dos contratos/aditivos. A cláusula definitiva só existe após aprovação humana, registrada na auditoria; a lista **não** equivale à análise integral do contrato (`app/[projectId]/revisao-clausulas/page.tsx:153-157`).

- **Quem acessa / permissões**
  - Fora do menu (`NAV:33-38`). Links existentes: botão "Documentos" ↔ esta tela só existe no sentido tela→Documentos (`page.tsx:145-150`); o assistente AXIA (`lib/assistant/knowledge.ts:73-75`) e o contexto de fontes de risco (`lib/risk-classification/load-risk-source-context.ts:64`) apontam para esta rota. **A aba Documentos não tem link para ela**, embora o passo da AXIA diga "Abra Documentos e vá à revisão de cláusulas" (`knowledge.ts:70`) — divergência.
  - **A tela não verifica perfil**: o formulário de aprovar/rejeitar aparece para qualquer membro (não há `permission` em `page.tsx` nem em `components/clauses/clause-candidate-review-form.tsx`). O servidor decide: a RPC `review_clause_extraction_candidate` exige `'EDITOR'` ("EDITOR or ADMIN permission required", `supabase/migrations/20260821012417_clause_extraction_review_foundation.sql:483-488`), equivalente hoje a ADMINISTRADOR. Resultado: GERENTE/GESTOR/COLABORADOR/LEITURA veem o formulário e recebem erro ao enviar (`actions.ts` relança `error.message`).

- **Fluxo principal**
  1. Conferir os totais clicáveis: Pendentes, Aprovados, Rejeitados, Total detectado (`page.tsx:169-190`); o padrão é a fila "Pendentes".
  2. Filtrar por busca ("Buscar (número, título ou texto)"), "Parte", Status e "Só os que exigem conferência" (`:200-235`); filtros ficam na URL; 20 itens por página (`:22`).
  3. Clicar num candidato da lista; badges "conferir" e status aparecem à direita (`:272-290`).
  4. No painel "Candidato selecionado": ler a confiança da detecção, os motivos de conferência e a "Evidência de origem"; clicar "Abrir página original (p. N)" (abre `/documentos/versoes/{id}?paginaGlobal=N#original`) (`:352-378`).
  5. Corrigir "Número da cláusula", "Título" e "Texto contratual" se preciso; marcar "Conferi número, título e texto com a página original do contrato."; clicar "Aprovar cláusula" (`components/clauses/clause-candidate-review-form.tsx:111-161`).
  6. Ou, em "Rejeitar candidato", informar a justificativa e enviar (`:169-185`).
  7. O sistema volta à mesma lista, com filtros, página e item preservados (`actions.ts` final; só caminho interno do próprio projeto, `lib/safe-redirect`).

- **Estados e exceções**
  - Status: Pendente / Aprovado / Rejeitado (`page.tsx:24-28`). Decididos mostram "Aprovado por revisão humana"/"Rejeitado por revisão humana", observação, id da cláusula criada e "Decisão registrada na auditoria; esta tela não a altera." (`:407-414`).
  - Aprovação exige número, título e texto: "Número, título e texto são obrigatórios para aprovação."; rejeição exige "Informe a justificativa da rejeição."; ação inválida: "Ação de revisão inválida." (`actions.ts`, validações iniciais).
  - Rascunho local não enviado: "Rascunho não enviado restaurado para este candidato." / "Alterações salvas como rascunho nesta aba (ainda não enviadas)." (`clause-candidate-review-form.tsx:96,102`).
  - Vazio: "Nenhum candidato detectado. Ausência de candidatos não significa ausência de cláusulas ou de riscos: o detector pode não ter reconhecido o formato do documento ou a leitura pode estar incompleta. Confira o documento original." / "Nenhum candidato com estes filtros." (`page.tsx:252-253`).
  - Item inexistente: "Candidato não encontrado neste projeto (pode pertencer a um documento na lixeira)." (`:329`).
  - **OCR / cobertura parcial**: cada versão com leitura parcial ou revisão visual ganha o aviso `CoverageNotice` (`page.tsx:132-134,159+`; `components/documents/coverage-notice.tsx:17-57`); candidatos cujo intervalo de páginas contém página pendente ou com revisão visual recebem o badge "conferir" e os motivos "Página pendente de leitura: …" / "Página com revisão visual: …" (`page.tsx:60-71`).
  - Dependências: candidatos dependem do worker de documentos e do detector (**DEPENDE DE CONFIGURAÇÃO**, ver aba Documentos).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Descrição da página | "Valide os candidatos identificados automaticamente antes que sejam incorporados à base contratual." | `page.tsx:143` |
| Regra de governança | "Regra de governança: a detecção automática apenas sugere cláusulas. A criação da cláusula contratual definitiva exige aprovação humana, registrada na auditoria. Nenhum candidato é aprovado automaticamente, e a lista não equivale à análise integral do contrato." | `:154-156` |
| Confiança (texto) | "Confiança da detecção: quão seguro o detector está de que o trecho é o início de uma cláusula com esta numeração. Não representa avaliação de risco jurídico, relevância ou conformidade da cláusula." | `:36-38` |
| Título truncado (title) | título completo do candidato | `:272` |
| Badge "conferir" (title) | motivos separados por quebra de linha | `:284` |
| Placeholder busca | "Ex.: 6.4, cronograma, garantia" | `:205` |
| Aviso "Exige conferência" | "Exige conferência com o original:" | `:362` |
| Observação (placeholder) | "Ex.: numeração ajustada conforme documento original." | `clause-candidate-review-form.tsx:140` |
| Rejeição (placeholder / aviso) | "Informe por que este trecho não deve ser tratado como cláusula." / "A rejeição exige justificativa e fica registrada na auditoria." | `:177`, `:170` |
| FeatureInfo `analise-clausulas` | "Permite examinar cláusulas individualmente e relacioná-las com eventos, documentos, e-mails e evidências da execução da obra." — **não consumido por nenhum componente** e não corresponde à tela real (que é fila de validação de candidatos) | `FH:73-78` |
| Aba do navegador | "Análise de Cláusulas" x cabeçalho "Revisão de Cláusulas" | `page.tsx:20,142` |

- **Sugestões de melhoria dos textos**
  1. Falta aviso de perfil: usuário sem permissão preenche o formulário e só descobre o erro ao enviar ("EDITOR or ADMIN permission required", em inglês e crua). Sugestão: exibir antes do formulário "Somente ADMINISTRADOR aprova ou rejeita candidatos" e traduzir o erro.
  2. O passo da AXIA "Abra Documentos e vá à revisão de cláusulas" (`knowledge.ts:70`) não bate com a UI (não há link em Documentos). Corrigir o texto da AXIA ou criar o link.
  3. Nome inconsistente (aba "Análise de Cláusulas" x cabeçalho "Revisão de Cláusulas" x FeatureInfo órfão com outra descrição).

- **Fontes**: `app/[projectId]/revisao-clausulas/page.tsx`, `actions.ts`; `components/clauses/clause-candidate-review-form.tsx`; `components/documents/coverage-notice.tsx`; `supabase/migrations/20260821012417_clause_extraction_review_foundation.sql:416,483-488`; `lib/assistant/knowledge.ts:63-78`; `FH:73-78`.

---

### 4.23 Documentos — rota `/{obra}/documentos` (+ `/documentos/versoes/{versão}`)

- **Para que serve**
  Repositório documental e de evidências do projeto: upload manual de contratos, aditivos, editais, RFI, RFP, clarificações, propostas, relatórios e cronogramas, com versões, tipo, status de processamento, cobertura de leitura (OCR) e idioma (`app/[projectId]/documentos/page.tsx:218-221`; `FH:80-85`). Tem cinco abas: Documentos, Cláusulas, Cronograma, Anexos de E-mail e (se habilitada) Registro por e-mail (`:223-261`). O Google Drive **não** é origem de documentos aqui: "reservado exclusivamente ao SSMA/ESG" (`:220`; `FH:137-142`).

- **Quem acessa / permissões**
  - Menu "Documentos" sem restrição (`NAV:39`). A página lê com a sessão do usuário (RLS).
  - Enviar documento / nova versão / vincular resposta do cliente / promover anexo de e-mail: UI para ADMINISTRADOR, GESTOR, GERENTE (`page.tsx:140-141`); a proteção definitiva é a RPC (`register_project_document_upload`, `promote_email_attachment_to_document`, via `can_manage_project_documents`) (`:133-139`).
  - Vincular documento como anexo contratual e **Lixeira**: só ADMINISTRADOR (`:149`, `:347`, `:360`).
  - "Anexos do Contrato": incluir = ADMINISTRADOR/GESTOR/GERENTE/COLABORADOR; excluir = ADMINISTRADOR/GESTOR/GERENTE (`:158-159`). LEITURA só visualiza/baixa.
  - Página da versão `/documentos/versoes/{id}`: leitura pelos dados do usuário; download via URL assinada.

- **Fluxo principal**
  1. Aba "Documentos" → cartão "Adicionar documentos" (visível só a quem pode enviar, `:267-293`).
  2. "Selecionar arquivos" (vários, em mais de uma rodada); máximo 50 MB por arquivo (`components/documents/multi-upload/document-multi-upload-panel.tsx:106,118-120`).
  3. Definir o tipo documental de cada arquivo, ou escolher "Tipo para aplicar ao lote" e clicar "Aplicar aos arquivos aguardando"; nenhum tipo é atribuído automaticamente, exceto `.mpp` (cronograma baseline) (`:128-171`).
  4. Clicar "Iniciar envio" ("Enviando lote…") (`:165`). Cada arquivo percorre: Validando → Calculando hash → (Confirmar nova versão? / Conflito de tipo / Duplicado) → Enviando → Registrando → Processando → Concluído (`status-labels.ts:5-18`).
  5. Se o arquivo parecer nova versão, confirmar; se houver conflito de tipo, escolher "Enviar como documento novo e separado" ou "Cancelar este arquivo" (`queue-item-row.tsx:129,~156,163`).
  6. Alternativa avançada: "Upload individual (avançado)" com Tipo documental, Título, Versão, Data do documento, Origem, Autor/emissor, Resumo, Observações e Arquivo (`documentos/page.tsx:281-291`; `components/documents/document-upload-form.tsx:355-476`).
  7. Para nova versão de um documento existente: "Adicionar nova versão" no cartão (`components/documents/document-card.tsx:209`).
  8. Acompanhar o selo de processamento por versão; documentos aparecem agrupados (Contrato-base | anexos; Aditivo | anexos) e "Demais documentos (sem vínculo contratual)" (`page.tsx:316-338`).
  9. Abrir a versão (link "Ver cobertura e abrir páginas originais" ou a partir da Timeline) para ver a leitura (extração), a cobertura página a página, o arquivo original e o texto extraído (`versoes/[documentVersionId]/page.tsx:302-446`).
  10. ADMINISTRADOR: "Enviar para a lixeira" (ícone, com justificativa), restaurar ou "Excluir definitivamente" a partir da "Lixeira (N)" (`trash-document-control.tsx:38-81`; `page.tsx:360-367`).

- **Estados e exceções**
  - **Tipos documentais** (21 rótulos em `lib/labels.ts:441-465`): Contrato base, Aditivo, Memorial/Edital, RFI, RFP, Especificação, Desenho, Planilha, Cronograma baseline, Revisão de cronograma, Relatório semanal, Proposta AXION, Resposta/Aprovação do cliente, E-mail, Ata de Reunião, Proposta Comercial, Proposta Técnica, Planilha Contratual, Relatório, Notificação, ESG/SSMA, Diário de Obra, Outro (a lista do formulário individual é um subconjunto: `document-upload-form.tsx:14-29`).
  - **Formatos aceitos** (upload de Documentos): pdf, doc, docx, xls, xlsx, csv, txt, xml, mpp, jpg, jpeg, png; máximo 50 MB (`lib/documents/multi-upload/allowed-file-types.ts:7-21`; mensagem no formulário individual: "PDF, Word, Excel, CSV, TXT, XML, MPP, JPG ou PNG. Máximo 50 MB." `document-upload-form.tsx:~500`). Recusas: "Arquivo vazio.", "Arquivo ultrapassa o limite de 50 MB.", "Formato de arquivo não permitido." (`queue-core.ts:115,121,126`).
  - **Status de processamento por versão**: "Sem arquivo", "Aguardando processamento", "Processando", "Processado", "Falha no processamento" (`document-card.tsx:25-30`); acrescenta " · leitura parcial" se a cobertura for parcial (`:142`). O erro técnico da versão aparece em vermelho (`:171`).
  - **Fila de upload** — estado terminal "Upload concluído — análise/OCR pendente" para tipos que exigem revisão humana (hoje só Ata de Reunião: `use-document-upload-queue.ts:499,513-518`); `.mpp` mostra "Arquivo MPP armazenado — extração ainda não realizada." (`:509`) — pode estar defasado, pois o worker MPP existe (`.github/workflows/mpp-document-worker.yml`; `docs/weekly-schedule-email-ingestion.md:97`) e a aba Cronograma lista atividades extraídas (`page.tsx:119-131`).
  - **Duplicidade e versões**: arquivo idêntico → "Arquivo idêntico já existe em "<título>"." ou "Arquivo duplicado dentro deste mesmo lote."; "Parece uma nova versão de "<título>"." ; "Já existe "<título>" com tipo documental diferente." (`queue-core.ts:202,213,232,240`). No formulário individual: "Este arquivo já existe neste projeto (conteúdo idêntico a um documento já cadastrado) — não foi enviado de novo." e "Este projeto já tem um Contrato-base ativo. Abra o card do Contrato-base existente e use "Adicionar nova versão" em vez de criar um novo documento." (`document-upload-form.tsx:298-306`).
  - **Extração / OCR (resumo; detalhe em CAP69 cap. 6)**: o processamento é feito por worker externo (`scripts/process-document-version.mjs`) acionado pelo workflow `Document Processing Worker` a cada 5 min (`.github/workflows/document-processing-worker.yml:3-6`); exige segredos `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY` — **DEPENDE DE CONFIGURAÇÃO**. Na tela da versão: "Leitura do documento (extração mais recente)" com extrator/versão, data de conclusão e "N extração(ões) anterior(es) preservada(s) como histórico" (`versoes/…/page.tsx:304-313`).
  - **Cobertura**: três situações em `extraction-coverage-panel.tsx`: (a) sem registro — "Cobertura de leitura não registrada … Esta extração é anterior ao controle de cobertura por página (OCR). Não a considere uma leitura integral do documento" (`:39-42`); (b) integral — "Leitura integral do texto: X/Y páginas" (`:56`), com aviso se há páginas que pedem revisão visual (`:60-61`); (c) parcial — "Cobertura parcial: X/Y páginas lidas (P%) · N página(s) pendente(s)" + "Este documento não foi integralmente lido nem analisado. Análises, buscas e cláusulas baseadas nesta extração não incluem o conteúdo das páginas pendentes — consulte a página original." (`:68-73`). Quadros: "Páginas lidas", "Lidas por OCR (confiança ≥ 70%)", "Pendentes", "Revisão visual (páginas únicas)" (`:86-94`). Motivos de pendência: "OCR com confiança abaixo de 70%", "Conteúdo gráfico sem texto legível", "Falha no OCR", "Sem texto extraído" (`lib/documents/extraction/extraction-coverage.ts:60-64`; `panel:125`). Motivos de revisão visual: "Tabela ou desenho vetorial", "Figura embutida", "Tabela digitalizada (OCR não preserva a estrutura)", "OCR com baixa confiança", "Conteúdo gráfico sem texto" (`extraction-coverage.ts:52-58`).
  - **Aviso de cobertura nos cartões e listas**: `CoverageNotice` (vermelho se parcial, âmbar se só revisão visual) com link "Ver cobertura e abrir páginas originais" (`coverage-notice.tsx:17-57`); renderizado em cada versão do cartão (`document-card.tsx:152-154`). *Nota de deriva:* CAP69 (tabela de OCR parcial) diz que o card de documentos não avisa; o código atual avisa.
  - **Texto original x normalizado**: botões "Texto original" / "Normalizado (busca/análise)" e nota "O texto original não é alterado." quando há correção de codificação de fonte (`versoes/…/page.tsx:411-430`).
  - **Visualização do original**: PDF em iframe; imagem inline; demais formatos: "Não há visualização incorporada disponível para este formato." + "O arquivo original pode ser aberto pelo botão de download acima." (`:371-378`). Sem extração: "Nenhuma extração processada para esta versão (status: …)." (`:322-324`).
  - **Idioma**: selo "Idioma: Português/Inglês/Espanhol/Francês/Alemão/Italiano" ou o código ISO (`document-card.tsx:32-44,145-147`), preenchido pelo worker via detecção offline (`franc-min`); sem tradução automática; o original é sempre autoritativo (`docs/multilingual-documents.md:5-14,21-31`). A doc cita a tela em `documentos/page.tsx`, mas o selo está em `document-card.tsx`. Tradução sob demanda: não implementada (FUTURE_SOURCE).
  - **Espelho no Google Drive**: **não há nenhuma indicação na UI** (`drive_sync_status` só aparece em `lib/drive/sync-attachment-to-drive.ts`; busca em `app/` e `components/` sem resultado). Pela doc, o Supabase é a fonte autoritativa e o Drive é espelho best-effort **de anexos de e-mail**, com resultado `SYNCED | ALREADY_SYNCED | SKIPPED | FAILED` e sem nunca bloquear a ingestão (`docs/email-attachments-and-drive-mirror.md:5-8,112-128`); como a OAuth do Drive não estava configurada em nenhum ambiente, tudo fica `SKIPPED` (`:192-195`) — **DEPENDE DE CONFIGURAÇÃO** (`GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN` + pasta de anexos). A política de produto na UI diz que o Drive é só ESG/SSMA (`mock-data/src/sources.ts:19-24`; `FH:141`): conflito a decidir pelo produto. A sincronização é feita por script manual (`scripts/gmail-attachment-ingest.mjs`, `scripts/retry-email-attachment-drive-sync.mjs`).
  - **Anexos de e-mail → Documentos**: o anexo ingerido nasce em "Anexos de E-mail" e só vira documento por promoção explícita com tipo escolhido por humano (`docs/email-attachments-and-drive-mirror.md:10-30`; botão restrito a quem pode enviar, `page.tsx:433`).
  - **Registro por e-mail**: aba só existe com `ACC_WEEKLY_REPORTS_ENABLED=true` (`page.tsx:253-260`; `lib/feature-flags/weekly-reports.ts:20-24`) — **DEPENDE DE CONFIGURAÇÃO**; falha de carga mostra o erro no lugar da lista (`:72-79`).
  - **Vazio**: "Nenhum documento cadastrado." + "Confronto contratual pendente: ainda não há base documental disponível para este projeto." (`:306-311`); cronograma: "Nenhuma atividade de cronograma cadastrada." (`:393`); lixeira: "Nenhum documento na lixeira." (`trash-panel.tsx:25`); anexos: "Nenhum anexo de e-mail encontrado para os filtros selecionados." (`email-attachments-panel.tsx:166`).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Menu "Documentos" (title) | "Documentos — Repositório documental e de evidências do projeto." | `NAV:39`, `FH:80-85` |
| Descrição da página | "Upload manual de contratos, aditivos, editais, RFI, RFP, clarificações, propostas, relatórios e cronogramas. O Google Drive é reservado exclusivamente ao SSMA/ESG." | `documentos/page.tsx:220` |
| FeatureInfo aba Documentos | "Lista contratos, aditivos, propostas e demais documentos do projeto, com suas versões, status de processamento e origem. Permite enviar novos documentos e novas versões." | `FH:487-492`; usado em `page.tsx:229` |
| FeatureInfo aba Cláusulas | "Lista as cláusulas contratuais já aprovadas e cadastradas para este projeto." | `FH:494-498` |
| FeatureInfo aba Cronograma | "Mostra as atividades do cronograma do projeto, comparando as datas baseline com as datas atuais." | `FH:500-504` |
| FeatureInfo aba Anexos de E-mail | "Mostra os arquivos encontrados nos e-mails do projeto e identifica quais foram processados pelo ACC e quais efetivamente participaram das análises dos Experts IA. …" | `FH:534-539` |
| FeatureInfo aba Registro por e-mail | "Lista cada envio por e-mail … classificação determinística … Ao abrir um registro, mostra todos os anexos do mesmo message_id …" | `FH:525-530` |
| FeatureInfo aria-label | "Informações sobre <título>" | `components/shared/feature-info.tsx:61` |
| Aviso sem permissão de envio | "O envio de documentos requer permissão de Editor ou Administrador." | `documentos/page.tsx:297-299` |
| Aviso de tipo antes do envio | "Antes de iniciar, confirme o tipo documental de cada arquivo. … Nenhum tipo é atribuído automaticamente, exceto arquivos .mpp, identificados como cronograma baseline." | `document-multi-upload-panel.tsx:171` |
| Ajuda de seleção | "Você pode selecionar arquivos em mais de uma vez — nada do que já foi adicionado se perde. Máximo 50 MB por arquivo." | `:118-120` |
| Botão limpar erros | "Limpar todos os erros" | `upload-summary-bar.tsx:46` |
| Status na fila | "Aguardando envio", "Validando", "Calculando hash", "Confirmar nova versão?", "Conflito de tipo — decisão necessária", "Duplicado", "Enviando", "Registrando", "Processando", "Concluído", "Upload concluído — análise/OCR pendente", "Erro", "Rejeitado" | `status-labels.ts:5-18` |
| Selo de processamento | "Sem arquivo / Aguardando processamento / Processando / Processado / Falha no processamento" (+ " · leitura parcial") | `document-card.tsx:25-30,142` |
| Selo humano | "Revisão humana necessária" | `document-card.tsx:150` |
| Texto para Ata sem cobertura | "Extração de participantes, decisões, responsáveis, prazos e pendências ainda não está implementada nesta etapa." | `document-card.tsx:159-160` |
| Lixeira (ícone) | title/aria-label "Enviar para a lixeira"; placeholder "Ex.: Documento obsoleto, substituído pela versão revisada em anexo."; "Documento enviado para a lixeira."; "Confirmar envio para a lixeira" | `trash-document-control.tsx:38-39,68,73,81` |
| Exclusão definitiva | "Excluir definitivamente “<título>”?" / "Documento excluído do ACC, mas alguns arquivos físicos não puderam ser removidos do Storage. A auditoria foi preservada." | `permanent-delete-document-control.tsx:79,44` |
| Vínculo contratual | "Vincular como anexo contratual" / "Trocar anexo contratual para" / "Vínculo salvo."; placeholder "Ex.: Cláusula 4.2 do contrato incorpora esta proposta por referência." | `document-card.tsx:227`, `link-contractual-attachment-control.tsx:94,153,124` |
| Link de página pendente (title) | "<arquivo>, página local N (página global M)" | `extraction-coverage-panel.tsx:17` |
| iframe do original (title) | "Visualização de <arquivo>" | `versoes/…/page.tsx:359` |
| Descrição do arquivo (title) | descrição do arquivo anexo | `:338` |

- **Sugestões de melhoria dos textos**
  1. **Erro real**: "O envio de documentos requer permissão de Editor ou Administrador." (`page.tsx:297-299`) contradiz a regra efetiva (ADMINISTRADOR, GESTOR/GERENTE podem enviar; "Editor" não existe na UI de Usuários). Sugestão: "O envio de documentos exige perfil ADMINISTRADOR ou GERENTE (GESTOR)."
  2. "Arquivo MPP armazenado — extração ainda não realizada." (`use-document-upload-queue.ts:509`) e "Extração de participantes… não está implementada nesta etapa" (`document-card.tsx:159`) soam a funcionalidade ausente; o MPP é de fato extraído depois pelo worker. Sugestão: "Cronograma enviado. A leitura das atividades é feita em segundo plano e aparece na aba Cronograma."
  3. "Upload concluído — análise/OCR pendente" não diz quem executa nem quando. Sugestão: "Enviado. O processamento (leitura/OCR) roda em segundo plano, normalmente em poucos minutos; acompanhe o selo de status do documento."
  4. O selo "Processado" convive com "leitura parcial" apenas como sufixo; sugestão de rótulo único "Processado — leitura parcial (N páginas pendentes)" já que a página da versão usa linguagem forte ("não foi integralmente lido nem analisado").
  5. Nada informa ao usuário o estado do espelho no Drive; se o produto mantiver o espelho, mostrar "Espelho no Drive: Pendente/Sincronizado/Ignorado/Falhou" ou explicar na ajuda que o Drive só é usado no ESG/SSMA.
  6. A Aba "Cláusulas" não aponta para "Revisão de cláusulas" (fila de candidatos): incluir link "Revisar candidatos a cláusula".

- **Fontes**: `app/[projectId]/documentos/page.tsx`; `app/[projectId]/documentos/versoes/[documentVersionId]/page.tsx`; `components/documents/{document-card,document-upload-form,coverage-notice,extraction-coverage-panel,trash-document-control,permanent-delete-document-control,link-contractual-attachment-control,email-attachments-panel}.tsx`; `components/documents/multi-upload/*`; `lib/documents/multi-upload/{allowed-file-types,queue-core,types}.ts`; `lib/documents/extraction/{extraction-coverage,document-format}.ts`; `lib/labels.ts:441-465`; `docs/email-attachments-and-drive-mirror.md`; `docs/multilingual-documents.md`; `docs/proposta-cobertura-extracao.md`; `.github/workflows/document-processing-worker.yml`; `lib/feature-flags/weekly-reports.ts`.

---

### 4.24 Financeiro — rota `/{obra}/financeiro`

- **Para que serve**
  Dashboard financeiro do relatório semanal, alimentado **exclusivamente** pela aba "Financeiro" da planilha Excel recebida no relatório semanal ("nunca por PDF nem por valores digitados"): cards, gráficos por série, alterações desde o relatório anterior, cruzamento Financeiro × Curva S × MPP, tabela detalhada por período e correção humana auditada (`app/[projectId]/financeiro/page.tsx:100-103`; `FH:516-521`).

- **Quem acessa / permissões**
  - **Visualizar**: membership ACTIVE no projeto E (papel ADMINISTRADOR ou GERENTE OU área DIRETORIA ou FINANCEIRO) (`lib/financial/access.ts:6-11,23-30`). GESTOR é tratado como GERENTE. COLABORADOR e LEITURA só visualizam se forem da área Diretoria/Financeiro. Regra decidida por papel + área + status, nunca por nome/e-mail (`access.ts:3-4`).
  - **Corrigir valores**: precisa visualizar E ser ADMINISTRADOR ou GERENTE; COLABORADOR e LEITURA nunca, mesmo da área Financeiro (`access.ts:12-15,38-46`).
  - UI x servidor: o item de menu "Financeiro" só aparece se `canViewProjectFinancialDashboard` (`NAV:44`; `layout.tsx:24-28,46`); a rota refaz o teste no loader e mostra "Acesso negado" (`page.tsx:76-86`); a action de correção repete (`financeiro/actions.ts` — `canView`/`canEdit` via `getProjectFinancialAccess`); no banco, funções SQL `can_view_project_financial_dashboard` e `can_edit_project_financial_data` (migration `20260920120000`, citada em `access.ts:1-4`; arquivo não reaberto nesta leitura).
  - **Flag**: com `ACC_WEEKLY_REPORTS_ENABLED` diferente de `true`, o menu some (`layout.tsx:26-28`) e a rota mostra "Funcionalidade indisponível neste ambiente." (`page.tsx:61-72`) — **DEPENDE DE CONFIGURAÇÃO**. Os dados dependem da ingestão dos relatórios semanais por e-mail e do worker de métricas (**DEPENDE DE CONFIGURAÇÃO**; ver `docs/weekly-schedule-email-ingestion.md`).

- **Fluxo principal**
  1. Abrir "Financeiro" (somente se o item aparecer no menu).
  2. Ler o cabeçalho compacto: Projeto, Semana WNN, Data de corte, E-mail, Arquivo de origem (arquivo · aba · intervalo), Status, Confiança, Última atualização, Versão (mais recente/anterior/única + SHA), Unidade/moeda, Expert (`:108-120`).
  3. Ajustar o formulário "Selecionar semana, versão e período": Semana da obra, Versão do envio, De, Até, Série → "Aplicar" ou "Limpar" (`:124-170`).
  4. Ler os cards (período, acumulado ou derivado) e os gráficos de série (`:189-215`).
  5. Revisar "ALTERAÇÕES DESDE O RELATÓRIO ANTERIOR" (Métrica, Período, Anterior, Atual, Diferença, Classificação, Fonte anterior → atual) (`:218-257`).
  6. Revisar "Cruzamento Financeiro × Curva S × MPP" (Fato, Diferença, Possível interpretação; interpretações são hipóteses) (`:261-288`).
  7. Na "Tabela detalhada (N período(s))": pesquisar período, ordenar (Período crescente/decrescente, Maior desvio), paginar (`:291-359`).
  8. "ABRIR RELATÓRIO DE ORIGEM" (topo) leva ao e-mail de origem em Documentos (`:95,103`).
  9. Se o usuário puder editar: seção "Correção humana de valores" — escolher Período e Coluna, informar "Valor correto" (formato BR) e "Justificativa (célula/aba consultada)" (≥ 10 caracteres) e clicar "Registrar correção" (`:373-383`; `components/financial/financial-correction-form.tsx:30-69`).

- **Estados e exceções**
  - Status da aba: "Extraída", "Aba Financeiro ausente", "Aba ambígua — revisão humana", "Extração pendente de revisão", "Mapeada manualmente", "Dados validados/corrigidos por humano", "Falha na extração" (`page.tsx:40-48`). Nos quatro últimos problemáticos, aviso âmbar com link "Revisar/mapear no relatório de origem" (`:176-183`).
  - Vazio: "Nenhum relatório semanal com aba Financeiro lida para este projeto (sem relatório, sem planilha ou aba ainda não processada)." ou "Nenhuma versão válida corresponde à seleção. Escolha outra semana/versão." (`:173`); "Semana sem valores financeiros disponíveis (nenhuma coluna reconhecida com valor armazenado)." (`:190`); "Nenhuma série financeira compatível para gráfico nesta versão." (`:214`); "Não há relatório válido anterior para comparar." (`:224`); "Nenhuma alteração detectada entre os períodos já reportados." (`:226`); "Sem Curva S/MPP disponíveis para cruzar nesta versão." (`:270`); "Nenhum período corresponde à pesquisa." (`:316`).
  - Versões: "versão substituída" (selo), "Versões anteriores desta semana: … — versões da mesma semana nunca são somadas." (`:110,360-367`). Valores desconhecidos nunca viram zero no gráfico (`financial-series-chart.tsx:1-5`).
  - Classificação de alteração: Baixo, Médio, Alto, Revisão necessária (`:50`).
  - Correção: erros "Sem acesso financeiro neste projeto.", "Sem permissão para corrigir dados financeiros neste projeto (necessário papel Administrador ou Gerente).", "Valor inválido — use formato brasileiro (1.234,56) ou negativo entre parênteses.", "Aba Financeiro não encontrada.", "Período não encontrado na aba." (`financeiro/actions.ts`); sucesso "Correção registrada (original preservado, auditada); métricas serão recalculadas pelo worker." O original é preservado em `data.original` e o recálculo é idempotente pelo worker (**DEPENDE DE CONFIGURAÇÃO** do worker).
  - OCR/cobertura: não se aplica (fonte é planilha, não PDF).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Menu "Financeiro" (title) | "Financeiro — Dashboard financeiro do relatório semanal (aba Financeiro do Excel)." | `NAV:44`, `FH:518` |
| FeatureInfo `financeiro` | "Cards, gráficos e tabela alimentados exclusivamente pela aba Financeiro da planilha Excel do relatório semanal (previsto, realizado, acumulados, medido, faturado, recebido, custo, receita), com seleção de semana/versão, alterações desde o relatório anterior e cruzamento com a Curva S e o MPP. Acesso restrito a membros ativos com papel Administrador ou Gerente, ou das áreas Diretoria e Financeiro; correções só para Administrador/Gerente." — **definido em FH mas não consumido por nenhum FeatureInfo da página** (a ajuda só chega via tooltip do menu, que mostra a `shortDescription`) | `FH:520` |
| Acesso negado | "Acesso negado. Dados financeiros são restritos a membros ativos do projeto com papel Administrador ou Gerente, ou das áreas Diretoria e Financeiro. Solicite acesso ao administrador do projeto." | `page.tsx:82` |
| Indisponível | "Funcionalidade indisponível neste ambiente. O dashboard Financeiro faz parte dos relatórios semanais, ainda não habilitados nesta instalação." | `:67` |
| Descrição | "Dashboard alimentado exclusivamente pela aba Financeiro da planilha Excel do relatório semanal — nunca por PDF nem por valores digitados." | `:102` |
| Formulário de filtros | role=search, aria-label "Selecionar semana, versão e período"; selects aria-label "Semana da obra", "Versão do envio", "Período inicial", "Período final", "Série financeira" | `:124,127,138,149,153,157` |
| Título do card (title) | nota do card (`card.note`) | `:196` |
| Métrica alterada (title) | detalhe da alteração (`change.detail`) | `:244` |
| Fonte anterior → atual (title) | "<fonte anterior> → <fonte atual>" | `:250` |
| Célula Origem (title) | fonte da linha | `:346` |
| Tabela | placeholder "W37 ou 2026-09"; aria-label "Pesquisar e ordenar a tabela", "Pesquisar período", "Ordenar", "Paginação da tabela" | `:296,303,307,354` |
| Cruzamento | "Abas do mesmo relatório: … Fatos e diferenças vêm dos dados extraídos; interpretações são hipóteses — sem conclusão automática de causalidade." | `:267` |
| Correção humana | "O valor original extraído é preservado (evento de revisão + cópia em data.original); a correção fica sinalizada, auditada (usuário/data/justificativa) e as métricas são recalculadas pelo worker de forma idempotente." | `:379` |
| Formulário de correção | aria-label "Corrigir valor financeiro extraído"; "Valor correto (formato BR: 1.234,56 ou (1.234,56))"; placeholder "1.234,56"; "Justificativa (célula/aba consultada)"; placeholder "Ex.: célula D14 da aba Financeiro lida em 12.500,00"; botão "Registrar correção"/"Registrando…" | `financial-correction-form.tsx:30,60-69` |
| Gráfico | aria-label "<título> — <período> — unidade <unidade>"; vazio "Sem valores disponíveis para este gráfico no relatório selecionado." | `financial-series-chart.tsx:23-25,39` |

- **Sugestões de melhoria dos textos**
  1. "Semana WNN" e o campo "Expert: Expert Comercial/Financeiro (commercial-director) · consolidação CEO IA" (`page.tsx:110,119`) expõem jargão/identificador interno. Sugestão: "Semana da obra (ex.: W37)" e "Análise: Diretor Comercial IA, consolidada pelo CEO IA".
  2. A descrição de acesso completa (inclusive "correções só para Administrador/Gerente") não é exibida na tela, só o texto do "Acesso negado". Ligar um FeatureInfo `financeiro` ao título da página ou ao cabeçalho.
  3. O usuário que vê o dashboard mas não pode corrigir (ex.: área Financeiro com papel COLABORADOR) não recebe explicação de por que não existe a seção de correção. Sugestão: nota "Correção de valores: somente Administrador ou Gerente."
  4. Rótulos como "Revisão necessária" e códigos de alteração `(change.code)` aparecem sem legenda.

- **Fontes**: `app/[projectId]/financeiro/page.tsx`, `actions.ts`; `lib/financial/access.ts`, `access-server.ts:20-60`, `financial-dashboard-data.ts:123-192`; `app/[projectId]/layout.tsx:20-50`; `NAV:41-44`; `lib/feature-flags/weekly-reports.ts`; `components/financial/*`; `FH:516-521`.

---

### 4.25 Experts IA — rota `/{obra}/experts-ia` (hub) e `/{obra}/experts-ia/diretor-engenharia` (painel de Planejamento)

Conteúdo, identidades, escopo e limites dos especialistas: ver CAP69 cap. 8 (não repetido). Aqui só a tela.

- **Para que serve**
  O hub reúne os 5 Experts oficiais (CEO IA, Diretor Comercial IA, Consultor Jurídico IA, Diretor de Planejamento IA, Diretor de ESG IA) com nome, missão, status e provider, e abre o acesso contextual de cada um (`app/[projectId]/experts-ia/page.tsx:15-20,41-89`). Não substitui os acessos existentes (Dashboard, ESG/SSMA). O painel de Planejamento é a tela de consulta do Diretor de Planejamento IA sobre o cronograma MPP estruturado (`diretor-engenharia/page.tsx:19-43`).

- **Quem acessa / permissões**
  - Menu "Experts IA" sem restrição (`NAV:46`). O hub não faz verificação de perfil (só dados estáticos de definição).
  - Consulta de Planejamento: exige membership ativo; sem membership retorna "Você não possui acesso ativo a este projeto." (`lib/ai/engineering-query-action.ts:37-39`); a leitura de dados segue a RLS. Não há diferença entre ADMINISTRADOR, GERENTE, COLABORADOR e LEITURA na consulta (todos membros ativos podem perguntar).
  - IA real: **DEPENDE DE CONFIGURAÇÃO** (provider Anthropic por expert). Resposta sobre cronograma depende do MPP processado pelo worker (`.github/workflows/mpp-document-worker.yml`) — **DEPENDE DE CONFIGURAÇÃO**.
  - Destinos dos botões "Abrir Expert": Diretor Comercial → `/dashboard`; ESG → `/esg`; Planejamento → `/experts-ia/diretor-engenharia`; Jurídico → `/juridico`; CEO IA não tem destino (`experts-ia/page.tsx:21-26`).

- **Fluxo principal**
  1. Abrir "Experts IA"; ler cada cartão (nome, ⓘ, status, missão, provider).
  2. Clicar "Abrir Expert" no cartão desejado (ativo e com destino).
  3. Para Planejamento: ler "Consultas recomendadas" (4 perguntas-modelo), escrever a pergunta em "Faça uma pergunta sobre este projeto" e clicar "Consultar" (`diretor-engenharia/page.tsx:24-43`; `expert-query-panel.tsx:420-446`).
  4. Ler a resposta e a sinalização de provider; toda sugestão exige revisão humana.

- **Estados e exceções**
  - Selo do cartão: "Ativo" (verde) ou "Em implantação" (`experts-ia/page.tsx:64`). Todos os 5 estão `IMPLEMENTED` em `lib/ai/expert-definitions/definitions.ts` (status nas linhas 45, 100, 174, 221, 265), portanto hoje todos aparecem "Ativo".
  - Ativo sem destino (CEO IA): "Operacional — consulta disponível via API; interface dedicada ainda não construída nesta fase." (`:79`). Inativo: "Em implantação — ainda não operacional nesta fase." (`:83`).
  - Provider: "Provider: Anthropic" (real) ou "Provider: Fake/Teste" (`:69`; `lib/ai/provider-ui-metadata.ts:18,21`). Na consulta, "O provider será exibido aqui após a primeira consulta." antes da 1ª resposta, e aviso de "provider determinístico (fake) — não é IA real" quando for o caso (`expert-query-panel.tsx:389,401-403`).
  - Erros: "Você não possui acesso ativo a este projeto."; contexto ausente: "Não foi possível identificar o contexto desta análise. Recarregue a página e tente novamente." (`lib/ai/expert-query-request.ts:33-34`); pergunta vazia: "Digite uma pergunta." (`:36`).
  - Sem histórico: a resposta anterior sai da tela a cada nova consulta e nada é persistido (`expert-query-panel.tsx:360-364`).
  - Cobertura/OCR: o painel só vê o que o worker já extraiu; documentos com leitura parcial limitam a análise (ver Documentos).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Menu "Experts IA" (title) | "Experts IA — Especialistas Claude responsáveis pela curadoria do projeto." | `NAV:46`, `FH:112-118` |
| FeatureInfo `experts-ia` | "Centraliza os agentes especialistas do ACC. Eles analisam informações, detectam divergências, identificam riscos e produzem recomendações." / revisão: "A IA analisa e recomenda. Decisões vinculantes permanecem humanas." | `FH:115-117` |
| Descrição do hub | "Hub central dos Experts oficiais do ACC para este projeto — toda sugestão exige revisão humana. Os acessos já existentes (Diretor Comercial IA no Dashboard, Diretor de ESG IA em ESG/SSMA) continuam disponíveis normalmente; este hub não os substitui." | `experts-ia/page.tsx:37` |
| FeatureInfo por expert | `expert-ceo`: "Consolida as demais análises e prioriza decisões executivas."; `expert-commercial-director`: "Analisa propostas, valores e condições comerciais."; `expert-legal-consultant`: "Analisa obrigações contratuais e consequências jurídicas."; `expert-planning-director`: "Analisa atrasos, antecipações e impactos de prazo."; `expert-esg-director`: "Analisa obrigações ESG e SSMA com impacto contratual." | `FH:272-305`; renderizado em `page.tsx:54` |
| Botão do cartão | "Abrir Expert" | `page.tsx:75` |
| Cabeçalho Planejamento | "Especialista em cronogramas e planejamento de obras. Analisa prazo, caminho crítico, desvios, relações entre atividades e impactos contratuais com base no MPP estruturado, sempre com revisão humana." | `diretor-engenharia/page.tsx:21` |
| Consultas recomendadas | "Qual é a data final prevista da obra e quais atividades estão no caminho crítico?" / "Quais atividades têm menor folga e maior risco de atraso?" / "Quais relações entre atividades podem comprometer o prazo final?" / "O cronograma carregado indica risco de impacto contratual relevante?" | `:29-32` |
| Placeholder | "Ex.: Qual é a data final prevista da obra, quantas atividades existem e quais estão no caminho crítico?" | `:42` |
| Título do campo | "Descreva o contexto e a pergunta. O especialista usará os documentos e dados disponíveis neste projeto; a resposta exige revisão humana." | `expert-query-panel.tsx:429` |
| Atalho em Documentos → Cronograma | cartão "Diretor de Planejamento IA" / botão "Analisar cronograma" | `documentos/page.tsx:378-388` |

- **Sugestões de melhoria dos textos**
  1. "Operacional — consulta disponível via API; interface dedicada ainda não construída nesta fase." (CEO IA) é texto técnico. Sugestão: "O CEO IA atua nos bastidores: consolida as posições dos demais especialistas nas análises integradas e curadorias."
  2. "Em implantação" nunca aparece hoje (todos IMPLEMENTED); manter, mas o selo "Ativo" não diferencia IA real de provider de teste — o provider vem em outra linha pequena. Sugestão: destacar "Provider: Fake/Teste" quando for o caso.
  3. A menção "Especialistas Claude" na ajuda do menu expõe o nome do fornecedor; avaliar padronizar para "Especialistas de IA".

- **Fontes**: `app/[projectId]/experts-ia/page.tsx`; `app/[projectId]/experts-ia/diretor-engenharia/page.tsx`; `components/ai/expert-query-panel.tsx`; `lib/ai/engineering-query-action.ts`; `lib/ai/expert-query-request.ts`; `lib/ai/provider-ui-metadata.ts`; `lib/ai/expert-definitions/definitions.ts`; `FH:112-118,272-305`; `NAV:46`.

---

### 4.26 Integrações — rota `/{obra}/integracoes`

- **Para que serve**
  Administração do status operacional das fontes do projeto (e-mail corporativo/Google Workspace, Diário de Obra, Construmanager, ESG/SSMA) e da ingestão controlada de e-mails (Gmail). Política vigente: contratos, aditivos, edital/RFI/RFP, dúvidas de licitação e serviços adicionais entram por **upload manual** em Documentos; o **Google Drive é usado somente para ESG/SSMA**; Drive de Orçamentos e de Planejamento não estão integrados (`FH:137-142`; `packages/mock-data/src/sources.ts:3-25`). Cabeçalho da tela: "Administração de Integrações" (`app/[projectId]/integracoes/page.tsx:67`), enquanto o menu diz "Integrações".

- **Quem acessa / permissões**
  - Menu sem restrição (`NAV:47`); a página é visível a qualquer membro com leitura via RLS.
  - UI: `canManage = permission === "ADMINISTRADOR"` (`page.tsx:54`) controla: "+ Adicionar conta AXION", "Desconectar", "Editar origem", verificações de conexão (Construmanager, Drive SSMA), "Configuração de ingestão deste projeto", "Escopo automático dos e-mails" e "Prévia antes de importar / Confirmar sincronização" (`:101-146`; `components/integrations/integration-card.tsx:131,168,172`; `email-accounts-panel.tsx:35,104`). Os demais perfis só veem status e o painel de sincronização.
  - Servidor: salvar configuração de ingestão e confirmar sincronização exigem `has_project_permission(..., 'ADMIN')` — "Permissão ADMIN é necessária para configurar a ingestão de e-mails deste projeto." / "… para confirmar uma sincronização de e-mails." (`supabase/migrations/20260823110500_controlled_gmail_ingestion_config_rpc.sql`, linhas ~48-49 e ~169-170 da função, conforme busca). **Registrar/desconectar conta** exige ser ADMIN em pelo menos um projeto (`is_any_project_admin`) e só aceita `@axion.com.br` (`20260823110000_controlled_gmail_ingestion_preparation.sql`: erros "Permissão ADMIN (em pelo menos um projeto) é necessária para registrar uma conta de e-mail AXION." / "Somente contas @axion.com.br podem ser registradas como conta AXION."). Origem da fonte: RPC `save_integration_origin`; validação da pasta SSMA: "Permissão de administrador é necessária para validar esta integração." (`integracoes/actions.ts:224-266,282-288`).
  - Ações Construmanager (sincronizar metadados, baixar/preparar conteúdo) exigem ADMINISTRADOR dentro das RPCs (`actions.ts:490,664,865`).

- **Fluxo principal**
  1. Ler os cartões de fonte: nome, selo de status, descrição, detalhe/última sincronização e "Origem da fonte" (`integration-card.tsx:77-125`).
  2. ADMINISTRADOR: "Editar origem" para informar sistema, projeto/obra, conta, tipo de Drive, pasta/local, arquivo e responsável; para ESG/SSMA informar a URL da pasta do Drive compartilhado (`:172-185`; `actions.ts:224-266`).
  3. ESG/SSMA: usar a verificação "somente leitura" (confirma as 12 subpastas e conta itens, sem baixar/mover/alterar) e abrir "Abrir pasta SSMA/ESG no Google Drive" (`ssma-drive-connection-check.tsx:29`; `integration-card.tsx:119-125`).
  4. Gmail: em "Contas de e-mail AXION", "+ Adicionar conta AXION" → "Endereço @axion.com.br" (+ "Nome de exibição (opcional)") → "Registrar conta" (`email-accounts-panel.tsx:29-39,64-86`).
  5. "Configuração de ingestão deste projeto": conta, período ("Desde o início do projeto", "A partir de hoje", "Período personalizado"), domínio do cliente, participantes, incluir anexos → "Salvar configuração" (`email-ingestion-config-form.tsx:178-182,321`).
  6. "Escopo automático dos e-mails": regras de palavras/assuntos → "Salvar regras de escopo" (`email-project-scope-form.tsx:47,62,81`).
  7. "Prévia antes de importar": conferir Conta, Projeto, Período, Domínio cliente, Participantes, Anexos e a contagem preliminar → "Confirmar sincronização" (`email-sync-confirmation-panel.tsx:53-82`).
  8. Acompanhar o "Painel de sincronização": barra de progresso e contadores (`email-sync-panel.tsx:19-70`).
  9. No Dashboard, o selo "Status das integrações" resume o total por estado (ver abaixo).

- **Estados e exceções**
  - **Selo de status (4 estados)**: "Ativo" (CONECTADO), "Pendente", "Atenção", "Erro" (`lib/labels.ts:93-98`; cores `components/shared/badges.tsx:110-115`).
  - **E-mail**: status derivado da configuração + conta, nunca da contagem de mensagens: ERRO se conta em erro; ATENÇÃO se autorização expirada; PENDENTE se configuração incompleta (precisa estar habilitada, ter conta e domínio do cliente); ATIVO se conta Conectada/Sincronizando (`lib/ui/resolve-integration-display-status.ts:22-35`). Rótulos da conta: "Não conectada", "Conectada", "Sincronizando", "Autorização expirada", "Erro" (`lib/labels.ts:433-439`).
  - **Demais fontes**: usam o status armazenado em `project_integrations` sem reinterpretação (`resolve-integration-display-status.ts:13-15`); sem registro → "PENDENTE" e "Integração ainda não configurada para este projeto." (`integration-card.tsx:58,99`); "Origem ainda não definida" (`:117`). Detalhe e erro de conexão podem vir do campo `detail`/`last_connection_error`.
  - **Selo do Dashboard** (`components/dashboard/integration-status-summary.tsx`): quatro contadores (Ativo/Pendente/Atenção/Erro) com tooltip listando as fontes do status ("Nenhuma fonte neste status" quando zero) e link "Ver Integrações". Informação é por contagem; para detalhes usar esta aba.
  - **Painel de sincronização**: status "Preparando", "Sincronizando", "Concluída", "Falha"; rótulos de progresso "Preparando...", "Sincronizando e-mails — N%", "Nenhuma mensagem elegível encontrada", "Sincronização concluída", "Falha na sincronização" (`email-sync-panel.tsx:11-16`; `lib/email/inbound/ingestion-controls/compute-sync-progress.ts:18-36`). Sem execução: "Nenhuma sincronização confirmada ainda." (`:28`). Após confirmar: "Sincronização confirmada e enfileirada." (`email-sync-confirmation-panel.tsx:76`) — a confirmação **só enfileira**; quem baixa os e-mails é o workflow `Gmail Inbound Sync` (cron a cada 15 min, `.github/workflows/gmail-inbound-sync.yml:5`), que exige segredos Google (`GOOGLE_GMAIL_…_CLIENT_ID/_SECRET/_REFRESH_TOKEN`) e Supabase — **DEPENDE DE CONFIGURAÇÃO**. Sem esses segredos a tela mostra a fila confirmada, mas nada é importado.
  - **Conta Google**: o ACC "nunca armazena a senha nem exibe tokens"; a credencial é administrada fora da interface; registrar a conta não conecta o Gmail por si (`FH:563-568`; `email-accounts-panel.tsx:3-5`). A permissão do Google é somente leitura e não limitada a uma obra; quem limita a leitura à obra são os filtros do ACC (`FH:122-126`).
  - **Drive SSMA**: validar sem credencial → "Credencial somente leitura do Google Drive ainda não está configurada no ambiente." (`actions.ts` linha ~37 do bloco 267+); sem URL → "Configure primeiro a URL da pasta SSMA/ESG em Editar origem."; sem acesso → "A conta configurada não possui acesso de leitura à pasta SSMA/ESG." (`actions.ts:65`) — **DEPENDE DE CONFIGURAÇÃO**.
  - **Espelho de anexos no Drive**: sem tela; ver aba Documentos.
  - Construmanager/Diário de Obra: painéis de monitoramento, KPI de clima e verificação de conexão; credenciais **DEPENDE DE CONFIGURAÇÃO** (workflows `construmanager-*.yml`, `diario-de-obra-*.yml`). Escopo Construmanager é só metadados (`integration-card.tsx:149-151`).
  - Erros de formulário aparecem em vermelho abaixo do campo (`state.error`), com a mensagem da RPC (ex.: "Esta fonte não faz parte das integrações operacionais do ACC.", "Informe a URL completa da pasta SSMA/ESG no Google Drive compartilhado." — `actions.ts:~236,~243`).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Menu "Integrações" (title) | "Integrações — Conexões do ACC com fontes externas." | `NAV:47`, `FH:137-142` |
| FeatureInfo `integracoes` | "Mostra e gerencia fontes externas utilizadas pelo projeto. Política atual: contratos e aditivos, edital/RFI/RFP e dúvidas da licitação, e serviços adicionais aprovados entram por upload manual do ADM na área de Documentos. Google Drive é usado somente para ESG/SSMA. Drive de Orçamentos e Drive de Planejamento não estão integrados." (não está ligado a nenhum ⓘ na página; só chega via menu como `shortDescription`) | `FH:140-141` |
| Cabeçalho | "Administração de Integrações" / "Status operacional das fontes configuradas para este projeto." | `integracoes/page.tsx:67` |
| Subtítulo Gmail | "Gmail / E-mails" / "Ingestão controlada de e-mails @axion.com.br — conectar uma conta nunca significa importar a caixa inteira." | `:95-97` |
| Descrições das fontes | E-mail: "E-mails selecionados trocados com o cliente e demais partes interessadas."; Diário de Obra: "Registros diários de obra, consumidos via API do Diário de Obra."; Construmanager: "Projetos técnicos, revisões e logs por data/usuário via API do Construmanager."; ESG/SSMA: "Única fonte do Google Drive usada pelo ACC: registros, evidências e documentos de segurança, saúde, meio ambiente e obrigações ESG/SSMA do projeto." | `packages/mock-data/src/sources.ts:6-23` |
| FeatureInfo "Origem da fonte" | "Mostra apenas informações realmente preenchidas por um humano sobre a origem desta fonte … Quando nada foi definido, mostra "Origem ainda não definida"." | `FH:625-630`; usado em `integration-card.tsx:106` |
| FeatureInfo ESG/SSMA | "Consolida registros, evidências e documentos … Técnico de Segurança e Responsável/Gerente ESG são configuráveis por projeto e não precisam ser usuários do ACC." | `FH:632-637`; `integration-card.tsx:76` |
| FeatureInfo Tipo de Drive | "Identifica tecnicamente o tipo de local no Google Drive monitorado: Meu Drive (pessoal), Drive compartilhado (de equipe) ou Pasta compartilhada (pasta específica) — nunca confundir os três tipos." | `FH:639-643` |
| FeatureInfo "Adicionar conta AXION" | "Registra uma conta de e-mail @axion.com.br como conta AXION autorizada a ser monitorada pelo ACC. Somente contas @axion.com.br podem ser registradas — nunca contas pessoais ou de outro domínio." / "Registrar a conta é sempre uma decisão humana (ADMIN); nenhuma senha ou token é solicitado nesta tela." | `FH:555-561` |
| FeatureInfo "Conta conectada" | "Indica que esta conta AXION está registrada e autorizada. O ACC nunca armazena a senha nem exibe tokens de acesso — a credencial de acesso ao Gmail é administrada separadamente, fora da interface." | `FH:563-568` |
| Outras ajudas Gmail | `gmail-client-domain` (570-575), `gmail-ingestion-period` (577-582), `gmail-include-attachments` (584-589), `gmail-incremental-sync` (591-596), `gmail-prefilled-fields` "Campos em verde" (598-603), `gmail-participant-monitored` (605-610), `gmail-participant-cliente` (612-616), `gmail-participant-terceiro` (618-623), `gmail-sync-progress` (646-651) | `FH` |
| Campos pré-preenchidos (title) | "Valor carregado do sistema (já salvo)." | `email-ingestion-config-form.tsx:304` |
| Classificação de participante (title) | "Classificação sugerida automaticamente pelo domínio — corrigível." | `:282` |
| Campo de e-mail | placeholder "nome@axion.com.br"; pattern `.+@axion\.com\.br` | `email-accounts-panel.tsx:70` |
| Domínio/participante | placeholders "cliente.com.br", "contato@cliente.com.br", "observação (opcional)" | `email-ingestion-config-form.tsx:231,268,291` |
| Escopo automático | placeholders "weg\nfabrica de fios\nlinhares\nrfq-1015661" e "ENC: Negociação - Planilha de custos..." | `email-project-scope-form.tsx:47,62` |
| Selo do Dashboard | título "Status das integrações"; tooltip das fontes (uma por linha) ou "Nenhuma fonte neste status"; link "Ver Integrações" | `integration-status-summary.tsx:19,27,35` |
| FeatureInfo selo | "Mostra quantas fontes do projeto estão Ativo, Pendente, Atenção ou Erro. Passe o mouse sobre cada número para ver quais fontes compõem aquele status; para detalhes e configuração, acesse Integrações." | `FH:144-149` |
| Aviso da raiz do Drive | "Raiz autorizada: <caminho>. Orçamentos e Planejamento não são fontes do Drive para o ACC." | `integration-origin-form.tsx:122` |
| Verificação SSMA | "Somente leitura: confirma as 12 subpastas e conta os itens, sem baixar, mover ou alterar arquivos." | `ssma-drive-connection-check.tsx:29` |

- **Sugestões de melhoria dos textos**
  1. O ⓘ `integracoes` (a política de upload manual x Drive) é a explicação mais importante da tela, mas não está ligado a nenhum controle na página; só o tooltip curto do menu a representa. Ligar um FeatureInfo ao título da página.
  2. Título do menu "Integrações" x cabeçalho "Administração de Integrações": padronizar.
  3. Quem não é ADMINISTRADOR simplesmente não vê os formulários, sem explicação. Sugestão: nota "Configuração disponível apenas para ADMINISTRADOR."
  4. "Sincronização confirmada e enfileirada." não informa que a execução depende de um processo agendado (a cada ~15 min) nem o que fazer se nada acontecer. Sugestão: "Confirmada. A importação roda em segundo plano (aprox. a cada 15 minutos); acompanhe no Painel de sincronização."
  5. Erros vindos da RPC em inglês/técnicos chegam crus ao usuário (padrão `error.message`); traduzir os mais comuns.

- **Fontes**: `app/[projectId]/integracoes/page.tsx`, `actions.ts`; `components/integrations/{integration-card,email-accounts-panel,email-ingestion-config-form,email-project-scope-form,email-sync-confirmation-panel,email-sync-panel,email-integration-card,ssma-drive-connection-check,integration-origin-form}.tsx`; `components/dashboard/integration-status-summary.tsx`; `lib/ui/resolve-integration-display-status.ts`; `lib/labels.ts:93-98,433-439`; `components/shared/badges.tsx:110-120`; `packages/mock-data/src/sources.ts`; `FH:122-126,137-149,555-651`; `.github/workflows/gmail-inbound-sync.yml`; `supabase/migrations/20260823110000_*.sql`, `20260823110500_*.sql`; `docs/email-attachments-and-drive-mirror.md`.

### 4.27 ESG/SSMA — rota `/{obra}/esg`

- **Para que serve**
  Comprovação de **obrigações contratuais** de ESG/SSMA: para cada obrigação, prazo, comprovação, evidência, status e risco de penalidade. A própria tela diz que não é sistema de ESG corporativo nem de gestão operacional de segurança do trabalho (`app/[projectId]/esg/page.tsx:126-128`; escopo em `docs/esg-obligations.md:6-25`). Reúne quatro abas internas e o atalho para o app de campo.

- **Quem acessa / permissões**
  - Menu: todos os perfis veem o item (`nav-items.ts:45`). A página não bloqueia nenhum perfil; leitura por qualquer membro da obra (RLS `esg_obligations_select_project_members_only`, `supabase/migrations/20260822050000_esg_obligations_foundation.sql:184-187`; idem submissões `:353-356` e evidências `:488-491`).
  - **UI**: formulário "Nova obrigação", "Registrar nova comprovação" e "Revisar/ajustar status" aparecem **somente para ADMINISTRADOR** (`page.tsx:48-50,185,277,292`).
  - **Servidor/RLS**: criar obrigação, criar submissão e anexar evidência exigem nível "EDITOR" (`esg_obligations_foundation.sql:191-198,360-370,493-500`). Pelo mapeamento de níveis, EDITOR = ADMINISTRADOR, GERENTE/GESTOR e COLABORADOR; LEITURA fica fora (`supabase/migrations/20260824090000_project_membership_roles_status_area.sql:178-201`; `20260829200000_...compat.sql:105-115`). A **revisão** exige ADMIN = ADMINISTRADOR (RPC `review_esg_obligation_submission`, `esg_obligations_foundation.sql:574-575`).
  - **Divergência UI × servidor**: o banco aceita Gerente e Colaborador como "Técnico de Segurança" (`docs/esg-obligations.md:90-93`), mas a tela só oferece os formulários ao Administrador (`page.tsx:48-50`). Hoje Gerente/Colaborador só leem. Registrar como ponto de decisão (ver "Sugestões").
  - Consulta ao "Diretor de ESG IA": ver cap. 8 do manual; aqui só a posição na tela.

- **Fluxo principal**
  1. Abrir **ESG/SSMA** no menu. A aba inicial é "Minhas pendências" (`page.tsx:156`).
  2. **Minhas pendências**: lista obrigações sem comprovação ou cujo último registro está Pendente, Não cumprido ou Cumprido parcialmente (`page.tsx:101-114`). Cada linha mostra título, categoria, prazo (ou "Sem prazo definido") e a caixa "[ ] / [x] Evidência anexada (n)" com a evidência exigida (`components/esg/esg-technician-pending-list.tsx:20-44`).
  3. **Visão gerencial**: cartões Total, Cumpridas, Parciais, Pendentes, Não cumpridas, Risco alto / crítico; filtros por status, categoria, risco, responsável e duas datas (de/até, sobre a data de referência do último registro); tabela Obrigação, Categoria, Responsável, Último registro, Status, Risco (`components/esg/esg-managerial-summary.tsx:84-106,110-152,161-166`). Risco aqui é recalculado pelo código com a regra determinística e a contagem real de evidências (`page.tsx:79-89`; regra em `lib/esg/compute-obligation-risk.ts:44-111`). Classificação de risco em si: ver cap. 6.
  4. **Checklist do projeto** (Administrador):
     1. Preencher **Nova obrigação** (Título, Categoria, Periodicidade, Cláusula/referência opcional, Origem contratual em texto livre, Descrição, Evidência exigida, Penalidade prevista, Responsável em texto livre) e tocar **Adicionar obrigação ao checklist** (`components/esg/esg-obligation-form.tsx:34-106`; `app/[projectId]/esg/actions.ts:30-78`).
     2. Em cada obrigação, abrir **Registrar nova comprovação**, informar Data de referência, Rótulo do período, Prazo, Status, (se categoria DDS) Tema do DDS / Equipe-público / Número de participantes, Descrição, Observação, Justificativa e anexar Evidências, depois **Registrar comprovação** (`page.tsx:292-303`; `components/esg/esg-submission-form.tsx:157-233`). O registro é criado primeiro e os arquivos sobem em seguida (`esg-submission-form.tsx:85-145`).
     3. O Administrador revisa cada comprovação com **Revisar/ajustar status (ADMIN)** + **Confirmar revisão** (`components/esg/esg-review-form.tsx:33-48`; RPC `actions.ts:195-222`).
  5. **Diretor de ESG IA**: campo de pergunta ao especialista (ver cap. 8) (`page.tsx:311-319`).
  6. Cartão superior **Aplicativo de campo SSMA/ESG**: botões **Registros de campo** (`/{obra}/ssma-registros`) e **Abrir aplicativo** (`/ssma/{obra}`) (`page.tsx:131-153`).

- **Estados e exceções**
  - Sem obrigações: "Nenhuma obrigação ESG/SSMA configurada para este projeto." (`page.tsx:197`). Sem comprovações: "Nenhuma comprovação registrada ainda." (`:230`). Sem pendências: "Nenhuma pendência no momento." (`esg-technician-pending-list.tsx:17`). Obrigação desativada: selo "Inativa" (`page.tsx:211`).
  - Status possíveis: Cumprido, Cumprido parcialmente, Pendente, Não cumprido, Não aplicável, Dispensado (`lib/labels.ts:262-269`). **Não aplicável** e **Dispensado** exigem Justificativa (campo obrigatório na tela `esg-submission-form.tsx:213-216`; também no servidor `actions.ts:106-108`).
  - Evidências: formatos .pdf .doc .docx .xls .xlsx .csv .txt .jpg .jpeg .png (`esg-submission-form.tsx:226`); limite 50 MB por arquivo (`:100-101`); formato fora da lista falha (`:104-107`). Se o envio de um arquivo falhar, a comprovação já foi gravada, mas a tela mostra o erro (`:117,150`).
  - Sessão expirada: "Sessão expirada. Faça login novamente." (`actions.ts:38,92`; `esg-submission-form.tsx:122`).
  - O risco gravado na criação da comprovação é calculado **com 0 evidências** (comentário `actions.ts:146-149`); o selo de risco do Checklist usa o valor gravado (`page.tsx:242-244`), enquanto a Visão gerencial recalcula com as evidências reais (`page.tsx:76-89`). Pode haver diferença entre as duas abas até a revisão (a RPC de revisão não foi lida nesta tarefa: **não verificado** se ela recalcula).
  - Nenhum agendador cria comprovações periódicas: cada registro é manual (`docs/esg-obligations.md:255-258`).
  - Consulta de IA: depende do provedor configurado — **DEPENDE DE CONFIGURAÇÃO**; ver cap. 8.

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Menu "ESG/SSMA" (title) | "ESG/SSMA — Obrigações ESG e SSMA com impacto contratual." | `app-sidebar.tsx:119` + `lib/ui/feature-help.ts:105-110` |
| Título da página | "Comprovação de Obrigações ESG/SSMA" | `esg/page.tsx:126` |
| Descrição | "Obrigações contratuais de ESG/SSMA — prazo, comprovação, evidência, status e risco de penalidade. Não é um sistema de ESG corporativo nem de gestão operacional de segurança do trabalho." | `esg/page.tsx:127` |
| Cartão do app | "Aplicativo de campo SSMA/ESG" / "Interface responsiva para celular, tablet e desktop. Nesta fase, disponível para validação dos formulários." | `esg/page.tsx:134-137` |
| ⓘ "Minhas pendências" (curto) | "Obrigações ESG/SSMA aguardando comprovação." | `feature-help.ts:457-462` |
| ⓘ "Minhas pendências" (completo) | "Lista as obrigações ESG/SSMA pendentes, vencidas ou parcialmente cumpridas que ainda precisam de comprovação." | `feature-help.ts:460-461` |
| ⓘ "Visão gerencial" | curto: "Panorama de status e risco por obrigação." / completo: "Consolida o status mais recente e o nível de risco de cada obrigação ESG/SSMA do projeto." (título do popover: "Visão gerencial ESG") | `feature-help.ts:464-468` |
| ⓘ "Checklist do projeto" | curto: "Todas as obrigações ESG/SSMA cadastradas e seu histórico." / completo: "Mostra cada obrigação com cláusula/fonte de origem, comprovações registradas, evidências anexadas e revisão. Permite cadastrar novas obrigações, registrar comprovação e revisar submissões, conforme a permissão do usuário." / revisão humana: "O cadastro, a comprovação e a revisão são sempre realizados por uma pessoa." | `feature-help.ts:470-477` |
| ⓘ "Diretor de ESG IA" | curto: "Consulta ao especialista de ESG/SSMA." / completo: "Permite perguntar ao Diretor de ESG IA sobre obrigações, riscos e pendências deste projeto." / "A IA responde com base nos dados do projeto; a decisão final permanece humana." | `feature-help.ts:478-484` |
| Mecânica do ⓘ | hover/foco = tooltip curto; clique/toque = popover com `title` + descrição; `aria-label="Informações sobre {título}"`; Esc fecha | `components/shared/feature-info.tsx:62,86-90,102-116` |
| Revisão | "Revisar/ajustar status (ADMIN)"; placeholder "Observação da revisão (obrigatória para Não aplicável/Dispensado)"; "Revisão registrada." | `esg-review-form.tsx:33,48,51` |
| Justificativa | "Justificativa (obrigatória para Não aplicável/Dispensado)" ou "(opcional)" | `esg-submission-form.tsx:213` |
| Evidências | "Evidências (fotos, PDF, planilha, documento — múltiplos arquivos)" | `esg-submission-form.tsx:221` |
| Sucesso | "Comprovação registrada com sucesso." / "Obrigação configurada." | `esg-submission-form.tsx:145`; `esg-obligation-form.tsx:103` |
| Erros | "Arquivo \"{nome}\" ultrapassa 50 MB." / "Formato de arquivo não permitido: {nome}" / "Justificativa é obrigatória para NAO_APLICAVEL/DISPENSADO." / "Obrigação não encontrada." | `esg-submission-form.tsx:100,106`; `actions.ts:107,131` |
| Filtro de risco | opções exibidas como "LOW", "MEDIUM", "HIGH", "CRITICAL" | `esg-managerial-summary.tsx:29,129-133` |
| Selo de pendência | "[ ] Nenhuma comprovação registrada ainda" | `esg-technician-pending-list.tsx:36` |
| Linha de comprovação | "preenchido por {nome ou \"usuário não disponível\"} em {data}" / "Revisado por {nome} em {data}" | `esg/page.tsx:246-247,270-272` |
| Rótulos de categoria | DDS, Integração de Segurança, Treinamento, Inspeção, Relatório, Documentação de Terceiros, Registro de Acidente/Incidente, Destinação de Resíduos, Comprovante Ambiental, Licença, Certificado, Permissão, Entrega de EPI, Documento Exigido pelo Cliente (lista parcial: as linhas 214-228 de `lib/labels.ts` foram lidas só em parte) | `lib/labels.ts:214-228` |

- **Sugestões de melhoria dos textos** (não aplicadas)
  1. Filtro de risco com códigos em inglês ("LOW/MEDIUM/HIGH/CRITICAL") destoa do selo "Baixo/Médio/Alto/Crítico" (`lib/labels.ts:60-65`) e da Start-up. Sugestão: usar `severityLabels`.
  2. Mensagem de erro com código técnico: "Justificativa é obrigatória para NAO_APLICAVEL/DISPENSADO." → "Informe a justificativa: ela é obrigatória para Não aplicável e Dispensado." (`actions.ts:107`).
  3. As duas datas do filtro gerencial não têm rótulo nem `aria-label` (`esg-managerial-summary.tsx:141-152`): acrescentar "Último registro de" / "até".
  4. A aba "Minhas pendências" não filtra por usuário; lista as pendências de **toda a obra** (`page.tsx:101-114`). Ou renomear (ex.: "Pendências da obra") ou filtrar pelo responsável.
  5. "Revisar/ajustar status (ADMIN)" expõe sigla técnica; sugestão "Revisão do Administrador".
  6. A caixa "[ ]/[x]" em texto puro (`esg-technician-pending-list.tsx:36,40`) poderia ser um ícone com texto alternativo.
  7. "Nesta fase, disponível para validação dos formulários." (`page.tsx:136`) é aviso de projeto, não de usuário final; revisar na entrada em produção.
  8. Perfis Gerente e Colaborador não veem nenhum formulário e a tela não explica por quê. Se a decisão de produto for manter só o Administrador, avisar "Somente Administradores registram comprovações"; se for abrir ao Técnico (o banco já permite), ajustar `page.tsx:48-50`.

- **Fontes**
  `app/[projectId]/esg/page.tsx`; `app/[projectId]/esg/actions.ts`; `components/esg/*.tsx`; `lib/esg/compute-obligation-risk.ts`; `lib/labels.ts:60-65,214-269`; `lib/ui/feature-help.ts:105-110,457-484`; `docs/esg-obligations.md` (§1, §3, §11, §12); `supabase/migrations/20260822050000_esg_obligations_foundation.sql`; `20260824090000_project_membership_roles_status_area.sql`; `20260829200000_project_permission_gerente_compat.sql`.

---

### 4.28 ESG/SSMA — Registros de campo — rota `/{obra}/ssma-registros`

- **Para que serve**
  Painel no ACC (web) das **ocorrências e inspeções** registradas pelo app de campo, com ações corretivas e andamento. Registros feitos sem sinal só aparecem aqui depois de sincronizados (`app/[projectId]/ssma-registros/page.tsx:27-30`). Não há item próprio no menu: o acesso é pelo botão "Registros de campo" da tela ESG/SSMA (`esg/page.tsx:140-145`).

- **Quem acessa / permissões**
  Qualquer membro da obra: a página só exige que a obra exista (`notFound()` caso contrário, `ssma-registros/page.tsx:17-18`) e não verifica perfil. Leitura por membro ATIVO via RLS (`supabase/migrations/20261028130000_ssma_field_records.sql:17`; `docs/modulo-seguranca-pwa.md`, tabela "O que existe"). Escrita só por RPC (mesmo arquivo `:17`); o perfil Leitura não registra (`...ssma_field_records.sql:183-186`). Esta tela é só leitura.

- **Fluxo principal**
  1. Em ESG/SSMA, tocar **Registros de campo**.
  2. Ler os quatro totais: Registros, Ações em aberto, Ações em atraso, Críticos em aberto (`page.tsx:41-50`).
  3. Percorrer a tabela com colunas Fato, Tipo / categoria, Local, Risco, Registrado por, Responsável, Prazo, Ação corretiva, Fotos (`components/ssma/field-records/field-records-table.tsx:19`); fotos abrem por link assinado em nova aba (`field-records-table.tsx:41`; rota `app/api/ssma/records/photos/[photoId]/route.ts`, citada em `docs/modulo-seguranca-pwa.md`).
  4. **Abrir app de campo** (cabeçalho) leva a `/ssma/{obra}` (`page.tsx:30-34`).
  5. Rodapé: cartão "Instalar no celular" com QR Code (ver abaixo).

- **Estados e exceções**
  - Tabela ainda não criada no banco do ambiente: "Os registros de campo ainda não estão disponíveis neste ambiente (migration pendente)." (`page.tsx:38`; detecção por 42P01/PGRST205 em `lib/ssma/field-records/data.ts:25`).
  - Sem registros: "Nenhum registro enviado ainda." (`page.tsx:56`).
  - Ação corretiva exibida como "Em atraso" quando vencida, senão Aberta / Em andamento / Concluída, ou "Sem ação" (`field-records-table.tsx:36`; `lib/ssma/field-records/types.ts:117`).
  - Ocorrência × Inspeção (`field-records-table.tsx:30`); risco Baixo/Médio/Alto/Crítico (`types.ts:116`).
  - Estado real da migration em produção: **não verificado** (sem acesso ao banco).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Título | "Registros de campo SSMA" | `ssma-registros/page.tsx:12,28` |
| Descrição | "Ocorrências e inspeções registradas pelo app de campo, com as ações corretivas e o andamento. Registros criados sem sinal aparecem aqui depois de sincronizados." | `page.tsx:29` |
| Botão | "Abrir app de campo" | `page.tsx:32` |
| Resumo | `aria-label="Resumo"` | `page.tsx:41` |
| Cartão de instalação | `aria-label="Instalar o app de campo"`; título "Instalar no celular" | `components/ssma/ssma-install-card.tsx:12-13` |
| QR | `aria-label="QR Code com o endereço do app de campo"` | `ssma-install-card.tsx:16` |
| Aviso do QR | "O QR Code leva somente este endereço. Quem o abrir precisa entrar com a própria conta e só vê as obras de que participa." | `ssma-install-card.tsx:20` |
| Sem URL configurada | "{mensagem} O QR Code só é gerado depois de configurar o endereço." — **DEPENDE DE CONFIGURAÇÃO** (`ACC_SSMA_PWA_URL`, ou `AXION_APP_BASE_URL` + `/ssma`) | `ssma-install-card.tsx:24`; `docs/modulo-seguranca-pwa.md` ("Configuração") |
| Aviso de validação | "Os passos podem variar conforme a versão do sistema e do navegador; ainda não foram validados em aparelhos reais." | `ssma-install-card.tsx:36` |
| Link da foto | texto do link por foto (rótulo exato: **não lido**) | `field-records-table.tsx:41` |

  Esta página não usa `FeatureInfo` (**não encontrado**).

- **Sugestões de melhoria dos textos**
  1. "(migration pendente)" é jargão técnico para o usuário final (`page.tsx:38`); sugestão: "Os registros de campo ainda não estão habilitados neste ambiente. Fale com o administrador."
  2. Sem ⓘ de ajuda nesta tela; considerar um `helpId` (ex.: `ssma-registros`) para explicar a diferença entre "Ações em aberto" e "Críticos em aberto".
  3. Não existe item de menu: o usuário só chega pelo botão de ESG/SSMA; mencionar isso no tutorial.

- **Fontes**
  `app/[projectId]/ssma-registros/page.tsx`; `components/ssma/field-records/field-records-table.tsx`; `components/ssma/ssma-install-card.tsx`; `components/ssma/ssma-offline-capabilities.tsx`; `lib/ssma/field-records/{data,types}.ts`; `docs/modulo-seguranca-pwa.md`; `supabase/migrations/20261028130000_ssma_field_records.sql`.

---

### 4.29 ESG/SSMA — App de campo (PWA) — rota `/ssma` e `/ssma/{obra}` (fora do prefixo `/{obra}`)

- **Para que serve**
  Aplicativo de celular, instalado pelo navegador (link/QR Code, sem loja), para o técnico registrar **ocorrência/inspeção** (com fotos, responsável e prazo) e os **checklists de campo**, mesmo sem sinal. Os registros ficam na fila do aparelho e sincronizam ao voltar a internet (`docs/modulo-seguranca-pwa.md`, "Decisões" e "Operação sem sinal"; `components/ssma/ssma-offline-capabilities.tsx:45-59`).

- **Quem acessa / permissões**
  - Exige login; sem sessão vai a `/login` (`app/ssma/page.tsx:17`; `app/ssma/[projectId]/page.tsx:93`).
  - Seletor `/ssma` lista só obras do tipo OBRA em que o usuário é membro ATIVO (`app/ssma/page.tsx:19-24`). Mensagem se nenhuma: "Você ainda não participa de nenhuma obra ativa. Peça a um administrador para vincular a sua conta." (`:32`).
  - `/ssma/{obra}`: não-membro recebe 404 (`app/ssma/[projectId]/page.tsx:94-97`).
  - Perfil "gestor" na UI = ADMINISTRADOR, GERENTE ou GESTOR (`[projectId]/page.tsx:104`); define quem pode concluir ação sem foto, com justificativa (ver abaixo). Responsáveis selecionáveis = membros ativos que não são Leitura (`:106-108`).
  - **Servidor**: o perfil LEITURA consulta mas não registra (`20261028130000_ssma_field_records.sql:183-186`); andamento/conclusão só pelo responsável ou gestor+ (`:264,300-301,328`). A UI avisa: "Somente o responsável ou um gestor da obra atualiza esta ação." (`components/ssma/field-records/record-detail.tsx:210`).
  - Fotos/consulta de IA: consulta é somente leitura, confere login, vínculo e obra no servidor (`app/ssma/consult-actions.ts:154-156`).

- **Fluxo principal**
  1. Abrir `/ssma` (QR Code ou ícone instalado). Escolher a obra em "Selecione a obra" (`app/ssma/page.tsx:30`).
  2. Aba **Início** (barra inferior: Início, Registros, Sincronização, Perfil — `ssma-chrome.tsx:174-179`): vê a obra, o cumprimento "Checklist de hoje — n de 10 concluídos", o botão **Registrar ocorrência / inspeção** ("Funciona sem sinal · fotos, responsável e prazo") e a lista de checklists (`ssma-field-app.tsx:611-628`, numeração de linha aproximada a partir do trecho lido; checklists em `lib/ssma/checklist-definitions.ts`: 12 definições, de "DDA" a "Ocorrência / acidente").
  3. **Novo registro** (`field-records-app.tsx:142-145`): escolher Tipo de registro (Ocorrência/Inspeção), Categoria, Descrição ("Descreva o que foi observado, sem diagnósticos"), Local ("Ex.: Bloco B, pavimento 2"), data/hora do fato, **Risco** (Baixo/Médio/Alto/Crítico), Ação corretiva opcional (responsável + prazo), fotos (câmera ou galeria) e **Salvar registro** (`components/ssma/field-records/new-record-form.tsx:141-262`).
  4. O registro passa por **Salvo no aparelho → Aguardando envio → Sincronizado** (ou **Falha no envio**) (`lib/ssma/field-records/types.ts:74-79`). Aba **Sincronização**: contadores por estado e botão **Enviar agora / tentar de novo** (`field-records-app.tsx:252-263`).
  5. Aba **Registros**: "Neste aparelho" e "Registros da obra" (a lista do servidor só aparece online) (`field-records-app.tsx:147-164`). Abrir um registro mostra **Ação corretiva** e o formulário **Registrar andamento** / **Concluir ação** (`record-detail.tsx:136-210`).
  6. Concluir ação: responsável precisa de **foto de evidência**; gestor pode concluir sem foto com justificativa de ao menos 10 caracteres (`record-detail.tsx:196-198`; texto da regra também em `lib/assistant/knowledge.ts` entrada "ssma-registrar").
  7. **Consultar IA — especialista de SSMA**: pergunta sobre o registro; só leitura (`components/ssma/field-records/record-consult.tsx:26-36`).
  8. Aba **Perfil**: conta, obra, registros pendentes, **Sair da conta** com confirmação (`field-records-app.tsx:326-357`). Sair não apaga registros não enviados (`:335`).
  9. No topo, **Fale com a AXIA** (somente dentro de `/ssma/{obra}`) (`ssma-chrome.tsx:141-143,166`).

- **Estados e exceções**
  - **Sem sinal**: faixa "Sem conexão — você pode registrar normalmente; o envio acontece quando a internet voltar." (`field-records-app.tsx:122`). Com a casca offline: "Modo sem conexão do aparelho." (mesma linha).
  - O que funciona sem sinal: registrar (com fotos JPG/PNG) e ver o estado dos registros do aparelho. Exige internet: enviar, ver a lista da obra, registrar andamento/concluir, consultar IA, entrar/trocar conta ou obra (`ssma-offline-capabilities.tsx:45-57`).
  - Primeira vez sem sinal / sem obra guardada: tela "Sem conexão" — "Este aparelho ainda não tem uma obra guardada para uso sem sinal. Abra o app com internet, entre com a sua conta e acesse a obra uma vez." (`ssma-offline-shell.tsx:116-117`; rota `app/ssma/offline/page.tsx`).
  - Fotos: JPG ou PNG, até 15 MB, máximo 20 por registro, sem compressão; HEIC (padrão do iPhone) não aceito (`ssma-offline-capabilities.tsx:59`). Excesso: "Selecione no máximo {n} fotos." (`new-record-form.tsx:87`).
  - Validações de registro: "Informe a categoria.", "Descreva o registro (mínimo de 3 caracteres).", "A descrição excede 4000 caracteres.", "Informe o local.", "Informe uma data e hora válidas." (`lib/ssma/field-records/types.ts:55-60`).
  - Andamento/conclusão offline: "Registrar andamento e conclusão exige conexão. Tente novamente quando a internet voltar." (`record-detail.tsx:83`); "A evidência deve ser JPG ou PNG de até 15 MB." (`:87`).
  - Outra conta no aparelho: bloqueio de envio por troca de conta (`queue-core.ts:249-250`); opção "Remover os registros de outras contas deste aparelho…" com **Apagar do aparelho** / **Manter** (`field-records-app.tsx:287-297`).
  - Sem espaço: "Sem espaço no aparelho para guardar este registro e suas fotos." (`queue-core.ts:145`). Foto sumiu do aparelho: "Arquivo da foto não está mais no aparelho. Descarte o registro e refaça." (`queue-core.ts:225`).
  - iOS pode apagar dados de sites pouco usados; andamento/conclusão não entram na fila offline; lista da obra não fica no aparelho (`docs/modulo-seguranca-pwa.md`, "Não testado / limitações").
  - **Não validado em iPhone/Android reais**; testado em Chrome (IndexedDB e service worker reais) (`ssma-offline-capabilities.tsx:69`; `ssma-install-card.tsx:36`). Qualquer afirmação de "funciona offline no celular" deve ser tratada como **não confirmada em campo**.
  - Notificação de acidente: o envio do e-mail de acidente é feito por `/api/ssma/accident-notifications` (`ssma-field-app.tsx:~848`, trecho lido sem numeração exata); comportamento do envio real: **não verificado**.
  - Consulta de IA: "Resposta de TESTE ({provedor}) — nenhuma análise real de IA foi realizada." quando o provedor é de teste (`record-consult.tsx:42`) — **DEPENDE DE CONFIGURAÇÃO** do provedor.

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Título do app | "ACC SSMA" (modelo "ACC SSMA \| %s"); cabeçalho "SSMA/ESG" | `app/ssma/layout.tsx:6`; `app/ssma/page.tsx:28` |
| Navegação | `aria-label="Navegação do app de campo"`; abas "Início", "Registros", "Sincronização", "Perfil" | `ssma-chrome.tsx:183,175-178` |
| Voltar | `aria-label="Voltar"` | `ssma-chrome.tsx:152` |
| Botão novo | "Novo registro" | `field-records-app.tsx:143-145` |
| Seções | "Neste aparelho", "Registros da obra"; "Nenhum registro enviado ainda."; "Os registros da obra são exibidos quando há conexão."; "Nenhum registro neste aparelho." | `field-records-app.tsx:147-164,267` |
| Campos | "Descreva o que foi observado, sem diagnósticos"; "Ex.: Bloco B, pavimento 2"; "Ação corretiva (opcional)"; "Sem ação corretiva"; "Fotos são opcionais · JPG ou PNG · até 15 MB · máximo de {n}" | `new-record-form.tsx:169,174,201,205,230` |
| Foto | `aria-label="Tirar foto"`, `"Escolher fotos"`, `"Remover {arquivo}"` | `new-record-form.tsx:220,221,236` |
| Horário | "O horário real do registro no aparelho é guardado junto, mesmo que o envio ocorra depois." | `new-record-form.tsx:180` |
| Rodapé do form | "Será enviado agora; se a conexão falhar, fica salvo no aparelho." / "Sem conexão: o registro ficará salvo no aparelho e será enviado quando a internet voltar." | `new-record-form.tsx:254` |
| Conclusão | "A conclusão exige foto de evidência{ ou justificativa de pelo menos 10 caracteres (gestor)}. Nada é concluído sem esse registro." | `record-detail.tsx:197` |
| Sucesso | "Ação concluída e registrada." / "Andamento registrado." | `record-detail.tsx:107` |
| Consulta | "Consultar IA — especialista de SSMA"; "A consulta não altera o registro nem a ação corretiva."; "Sem conexão: a consulta exige internet."; "Fonte: o próprio registro ({rótulo}) e o contexto da obra. Opções são sugestões para revisão humana; nada foi executado." | `record-consult.tsx:27,35,36,45` |
| Perfil | "Os registros são guardados no navegador do aparelho, separados por conta. Sair da conta NÃO apaga registros ainda não enviados." / "Sem conexão: para trocar de conta, abra o app com internet." | `field-records-app.tsx:335,357` |
| Instalação (iOS/Android) | passos em `INSTALL_INSTRUCTIONS` (texto exato **não lido**) | `ssma-install-card.tsx:29,33`; `lib/ssma/pwa-install.ts` |
| Offline | "O que funciona sem sinal" / "O que exige internet" | `ssma-offline-capabilities.tsx:64,66` |

- **Sugestões de melhoria dos textos**
  1. "Checklist de hoje — n de 10 concluídos" mas existem 12 definições (inclui "Remessa para bota-fora" e "Ocorrência / acidente") (`checklist-definitions.ts:191,211`): verificar o que entra na conta de 10 (**não verificado**) e alinhar o texto.
  2. Mensagem "Sem conexão — você pode registrar normalmente" é clara; mas a faixa sobre andamento/conclusão só aparece dentro do detalhe (`record-detail.tsx:207`). Replicar o aviso na lista para quem espera concluir ações no campo.
  3. O botão **Salvar registro** não diz "no aparelho" quando offline; o texto de apoio abaixo (`new-record-form.tsx:254`) cumpre o papel, mas ficaria mais visível no botão ("Salvar no aparelho").
  4. `aria-label` de campos no PWA está presente em botões de foto; faltam rótulos acessíveis explícitos nos botões de seleção de Tipo/Risco (linhas 144 e 187 usam botões; texto visível provavelmente suficiente — **não auditado**).

- **Fontes**
  `app/ssma/{page,layout,consult-actions}.ts*`; `app/ssma/[projectId]/page.tsx`; `app/ssma/offline/page.tsx`; `components/ssma/*.tsx`; `components/ssma/field-records/*.tsx`; `lib/ssma/field-records/*`; `lib/ssma/checklist-definitions.ts`; `docs/modulo-seguranca-pwa.md`; `supabase/migrations/20261028130000_ssma_field_records.sql`.

---

### 4.30 Usuários — rota `/{obra}/usuarios`

- **Para que serve**
  Mostra quem tem acesso à obra (internos Axion e terceiros), com cargo, área, permissão e status. O Administrador adiciona/pré-cadastra pessoas, muda permissão, cargo e status, cadastra o WhatsApp para alerta crítico e configura a **Matriz de responsabilidades e prazos** da obra (`app/[projectId]/usuarios/page.tsx:88-90,197-309`). Participar de um e-mail não concede acesso ao ACC (`lib/ui/feature-help.ts:249-255`).

- **Quem acessa / permissões**
  - Menu: todos os perfis (`nav-items.ts:48`). A página não redireciona ninguém; a lista de membros depende da RLS (não lida aqui).
  - `canManage = permission === "ADMINISTRADOR"` (`page.tsx:55`). **UI**: só o Administrador vê o botão "+ Adicionar usuário", a coluna "WhatsApp (alerta crítico na Diretoria)", os controles da coluna "Ações" e toda a seção da Matriz (`page.tsx:90,104,135,151,197`). Demais perfis veem a tabela somente leitura.
  - **Servidor**: as Server Actions chamam RPCs que validam ADMINISTRADOR no banco: `add_project_member`, `set_project_member_status`, `update_project_member_role`, `set_profile_job_title`, `pre_register_project_member`, `set_person_whatsapp_contact` (`usuarios/actions.ts:154,190,235,271,322,363`; cabeçalho do arquivo `:7`). Para o WhatsApp o código cita explicitamente "valida ADMINISTRADOR no banco" (`actions.ts:354`; erro "Apenas administradores do projeto podem cadastrar o WhatsApp de um membro." `:365`). A busca por e-mail exige ADMINISTRADOR do projeto (comentário `actions.ts:66`).
  - **Proteção do último Administrador**: o banco impede que a obra fique sem Administrador ativo (trigger, `supabase/migrations/20260824090000_project_membership_roles_status_area.sql:258-325`).
  - Novos membros só podem ser Administrador, Gerente ou Colaborador (`actions.ts:32`; `add-project-member-form.tsx:31`). Na edição de membro existente, a lista inclui também **Leitura** (`member-row-actions.tsx:45-47`). O próprio usuário não edita a própria permissão: aparece "Próprio usuário" (`member-row-actions.tsx:116`).
  - Responsáveis por área e prazos: ver caps. 6-7.

- **Fluxo principal**
  1. Abrir **Usuários**. A tabela mostra Usuário (nome, e-mail), Origem ("Axion (Interno)" ou "Terceiro"), Cargo, Área, Permissão, Status, [WhatsApp], Ações (`page.tsx:96-106`; `lib/labels.ts:118-121`).
  2. **Adicionar pessoa que já fez login** (Administrador): **+ Adicionar usuário** → "Buscar por e-mail @axion.com.br" → **Buscar** → escolher **Permissão** e **Área** ("Selecione…") → **Confirmar** (`components/users/manage-members-panel.tsx:28-30`; `add-project-member-form.tsx:109-178`). Mensagem de sucesso: "Usuário adicionado com sucesso." (`:76`).
  3. **Pessoa que nunca entrou (convite/pré-cadastro)**: se a busca não achar, a tela oferece **Pré-cadastrar {e-mail}** com Nome, Cargo, Permissão, Área, e botão **Pré-cadastrar** (`add-project-member-form.tsx:186-242`). Sucesso: "Pré-cadastro criado. O usuário aparecerá como \"Aguardando primeiro login\" até entrar no ACC pela primeira vez." (`:89-90`). O acesso só vale quando a pessoa entrar pela primeira vez com a conta Google (`:191-193`). A ativação ocorre no primeiro login (`supabase/migrations/20260825121000_activate_project_member_invitation_on_login.sql`; arquivo não lido, só pelo nome). Não existe convite por e-mail disparado pelo ACC: **não encontrado** (o pré-cadastro só registra o convite no banco).
  4. Pré-cadastros pendentes aparecem na mesma tabela, esmaecidos, com Status "Aguardando primeiro login" e sem botões de ação (`page.tsx:165-192`). Só os pendentes são listados (`:70`).
  5. **Ações por linha**: **Editar cargo** → campo "Cargo" + **Salvar**; seletor de permissão + **Salvar**; **Desativar** / **Reativar** (`member-row-actions.tsx:84-125`). Desativar mantém o histórico (a linha permanece com Status "Inativo").
  6. **WhatsApp (alerta crítico na Diretoria)**: telefone internacional (ex.: +5527999990000), caixa "Canal autorizado pelo participante" e **Salvar** → "Salvo" (`member-whatsapp-form.tsx:28-47`). O contato é da pessoa e vale em todas as obras (`title` do campo). O canal é simulado e só para alertas CRÍTICOS na Diretoria (`actions.ts:353-354`).
  7. **Matriz de responsabilidades e prazos** (Administrador): "Responsáveis por área" (um formulário por área), tabela "Prazos por grau de risco" (colunas Risco, Unidade, Nível 1: assumir, Responder, Concluir, Nível 2, Nível 3, Opções, Ações) e bloco recolhível "Fuso horário e horário útil" (`page.tsx:209-307`). Significado dos níveis e prazos: **ver cap. 7**.
  8. Quando o recurso de relatório semanal está ligado, uma linha informa o 1º e 2º escalão de Planejamento (`page.tsx:236-251`) — **DEPENDE DE CONFIGURAÇÃO** (`isWeeklyReportsEnabled()`).

- **Estados e exceções**
  - Sem usuários nem pré-cadastros: "Nenhum usuário com acesso a este projeto." (`page.tsx:93`).
  - Busca: exige e-mail completo `@axion.com.br`: "Busque pelo e-mail completo @axion.com.br (busca por nome parcial ainda não é suportada)." (`actions.ts:81`); não achou: "Nenhum profile encontrado para este e-mail. O usuário precisa ter feito o primeiro login no ACC — ou pode ser pré-cadastrado abaixo." (`:101`); já membro: "Este usuário já pertence a este projeto." (`:127`).
  - Pré-cadastro só para o domínio Axion: "Pré-cadastro restrito a e-mails {domínio}." (`actions.ts:311`). Papel/área inválidos: "Papel inválido: {x}." / "Área inválida: {x}." (`:147,151,232,315,319`). Convite com status "Cancelado" existe no rótulo (`lib/labels.ts:141-145`), mas **não há tela para cancelar** um pré-cadastro: **não encontrado**.
  - Telefone: erros "Informe o telefone no formato internacional, com + e código do país (ex.: +5527999990000)." e "Informe o telefone antes de autorizar o canal." (`actions.ts:367,368`), "O usuário não é membro ativo deste projeto." (`:366`).
  - Se o banco recusar (ex.: último Administrador), a mensagem do banco é exibida em vermelho sob a linha (`member-row-actions.tsx:128-130`; `actions.ts:197,242,278`).
  - Usuário com permissão legada GESTOR continua aparecendo como "Gerente" e a opção do seletor não é duplicada (`member-row-actions.tsx:11-19,45-47`).
  - Contatos WhatsApp só são lidos para Administradores (`page.tsx:56-67`).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Menu "Usuários" (title) | "Usuários — Controle de acesso e permissões do projeto." | `app-sidebar.tsx:119` + `feature-help.ts:249-255` |
| ⓘ completo (não há ⓘ no cabeçalho da página) | "Gerencia os usuários autorizados, suas áreas, funções e permissões. Participar de um e-mail ou comunicação não concede acesso ao ACC." | `feature-help.ts:253-254` (o ⓘ do menu é só o `title`) |
| Título | "Usuários & Permissões" | `usuarios/page.tsx:88` |
| Descrição | "Usuários internos Axion e terceiros com acesso a este projeto." | `page.tsx:88` |
| Matriz | "Configuração exclusiva deste projeto. O Nível 1 trata a ação, o Nível 2 recebe o primeiro escalonamento e o Nível 3 corresponde à Diretoria." | `page.tsx:202` |
| Matriz (cadência) | "Riscos médios e baixos são reunidos em um único e-mail às quartas-feiras, às 7h. Riscos altos e críticos mantêm o alerta e o escalonamento imediato definidos na matriz." | `page.tsx:205` |
| ⓘ da Matriz | `sla-config-responsaveis` ("Responsáveis por área"); `sla-config-matriz-prazos` ("Prazos por grau de risco"); `sla-config-timezone` ("Fuso horário e horário útil") — textos em `feature-help.ts` (o de `sla-config-matriz-prazos` está na linha 441; os demais **não lidos aqui**; ver cap. 7) | `page.tsx:213,259,296` |
| WhatsApp (hover) | `title`: "Cadastro da pessoa: vale em todos os projetos em que ela tem vínculo"; `aria-label`: "Telefone internacional da pessoa (WhatsApp)"; placeholder "+5527999990000" | `member-whatsapp-form.tsx:32,34` |
| Cabeçalho coluna | "WhatsApp (alerta crítico na Diretoria)" | `page.tsx:104` |
| Rótulos de Área | Diretoria, Administrativo, Comercial, Financeiro, Engenharia, Orçamento, Jurídico, Planejamento, Compras, SSMA/ESG | `lib/labels.ts:128-139` |
| Status de membro | "Ativo" / "Inativo"; convite: "Aguardando primeiro login", "Ativado", "Cancelado" | `lib/labels.ts:123-126,141-145` |
| Linha do próprio | "Próprio usuário" | `member-row-actions.tsx:116` |
| Botões | "+ Adicionar usuário", "Editar cargo", "Salvar", "Desativar", "Reativar", "Buscar", "Confirmar", "Pré-cadastrar", "Cancelar", "Fechar" | `manage-members-panel.tsx:29`; `member-row-actions.tsx:95,112,124`; `add-project-member-form.tsx:115,176,238,249` |

- **Sugestões de melhoria dos textos**
  1. Título da página "Usuários & Permissões" ≠ rótulo do menu "Usuários" ≠ `title` do ⓘ "Usuários" (`page.tsx:88`; `nav-items.ts:48`): padronizar.
  2. A página não tem ⓘ no cabeçalho; as telas "Autorizações" e outras têm (`autorizacoes/page.tsx:63`). Acrescentar `<FeatureInfo helpId="usuarios" />` em `actions` do `PageHeader`.
  3. Vários botões **Salvar** na mesma linha (cargo, permissão) sem rótulo acessível; o `<Select name="newPermission">` não tem `aria-label` (`member-row-actions.tsx:103`). Sugestão: `aria-label="Permissão de {nome}"` e "Salvar permissão"/"Salvar cargo".
  4. Mensagens do banco chegam cruas (`throw new Error(error.message)`, `actions.ts:162,197,242,278,332`), podendo mostrar texto técnico em inglês, como a de último Administrador. Mapear para texto em português (como já feito para o WhatsApp, `actions.ts:361-371`).
  5. "Nenhum profile encontrado" (`actions.ts:101`) usa "profile": trocar por "perfil" ou "cadastro".
  6. O seletor de novos membros não inclui Leitura, mas a edição inclui; explicar na tela ou unificar.
  7. Alterar o nome do rótulo legado: o valor interno GESTOR aparece como "Gerente"; manter a mesma palavra em manual, e-mails e AXIA (a AXIA fala em "três perfis: Administrador, Gerente e Colaborador" e omite Leitura — `lib/assistant/knowledge.ts` entrada "permissoes").

- **Fontes**
  `app/[projectId]/usuarios/page.tsx`; `app/[projectId]/usuarios/actions.ts`; `components/users/*.tsx`; `lib/users/project-permission.ts`; `lib/labels.ts:110-145`; `lib/ui/feature-help.ts:249-255,441`; `lib/assistant/knowledge.ts` ("permissoes"); migrations `20260824090000_project_membership_roles_status_area.sql`, `20260825120500_project_member_invitations_foundation.sql` (só pelo nome), `20260829200000_project_permission_gerente_compat.sql`.

---

### 4.31 Autorizações — rota `/{obra}/autorizacoes` (e página do colaborador `/autorizacao-email/{id}`)

- **Para que serve**
  Registra, por colaborador, conta e obra, o **consentimento** para o ACC usar a caixa de e-mail corporativa naquela obra (aceite, recusa, revogação), com versão do texto e histórico imutável. **Não conecta** a conta Google: a conexão é feita à parte pelo administrador, e a situação dela aparece na tabela (`app/[projectId]/autorizacoes/page.tsx:62,77-80`; `docs/vera-autorizacao-email-e-voz.md` §2).

- **Quem acessa / permissões**
  - **/{obra}/autorizacoes**: somente Administrador. Três camadas: item de menu restrito (`nav-items.ts:49`); `notFound()` no servidor se não for administrador ativo (`autorizacoes/page.tsx:48-49`; `lib/email-authorization/guard.ts:9-20`); RLS e funções do banco (`docs/vera-autorizacao-email-e-voz.md` §2, "Aba Autorizações"; migration `supabase/migrations/20261029120000_email_access_authorizations.sql`, não lida linha a linha). As ações repetem a checagem (`autorizacoes/actions.ts:22,40`): erro "Somente administradores da obra podem fazer isso." (`page.tsx:21`).
  - **/autorizacao-email/{id}** (fora do prefixo da obra): exige login (`proxy.ts:46-66`). Só o **próprio colaborador** decide e revoga (`isSubject`, `autorizacao-email/[authorizationId]/page.tsx:71,159,203`; texto: "Somente {nome} pode responder a esta solicitação." `:241`). Administradores veem a página e o histórico mas não respondem. A regra "só o titular, uma única vez" é aplicada no banco (`autorizacao-email/[authorizationId]/actions.ts:7-8`).

- **Fluxo principal**
  1. **Administrador**: abrir **Autorizações** → em "Solicitar autorização" escolher o **Colaborador** (apenas membros ativos), opcionalmente a **Conta (em branco = e-mail do colaborador)** → **Solicitar e enviar e-mail** (`page.tsx:72-101`; `actions.ts:17-37`). A conta precisa ser @axion.com.br.
  2. O colaborador recebe um e-mail individual com botões que levam à página autenticada do ACC (`lib/email-authorization/request-email.ts:2,50`). Abrir o link **não registra nada** (`[authorizationId]/page.tsx:73`).
  3. **Colaborador**: lê as seis seções do texto — "Para que serve", "Que permissão o ACC usa", "Quais filtros o ACC aplica", "Se você não autorizar", "Como revogar no ACC", "Como revogar a permissão concedida ao Google" (`lib/email-authorization/notice.ts:61-106`) — e escolhe **AUTORIZAR ACESSO PARA ESTA OBRA** ou **NÃO AUTORIZAR** (`:167-172`).
  4. Segunda etapa de confirmação: marcar a caixa ("Li as informações acima e autorizo…" ou "…não autorizo…") e **CONFIRMAR AUTORIZAÇÃO** / **CONFIRMAR RECUSA**, ou **Voltar sem decidir** (`:176-196`).
  5. Depois de autorizar, o colaborador pode **Revogar autorização desta obra** → Motivo (opcional) + caixa de confirmação + **CONFIRMAR REVOGAÇÃO** (`:203-236`).
  6. **Administrador** acompanha a tabela "Autorizações desta obra" (Colaborador, Conta, Decisão, Data, Conexão da conta, Ações), abre **Ver texto e histórico** e pode **Cancelar solicitação** (se Aguardando resposta) ou **Revogar** (se Autorizado), com Motivo e caixa "Confirmo" (`page.tsx:105-165`).

- **Estados e exceções**
  - Decisão: "Aguardando resposta", "Autorizado", "Não autorizado", "Revogado" (`lib/email-authorization/notice.ts:130-142`). Conexão da conta: "Conta conectada", "Sincronizando", "Reautorização no Google necessária", "Erro na conexão", "Conta não conectada", "Conta não registrada no ACC" (`notice.ts:110-128`).
  - Tabela vazia: "Nenhuma solicitação registrada para esta obra." (`page.tsx:111`).
  - Mensagens do administrador: "Solicitação registrada e e-mail enviado ao colaborador."; "Solicitação registrada, mas o e-mail não pôde ser enviado agora. O colaborador ainda não foi avisado."; "Autorização revogada (ou solicitação cancelada). O histórico foi preservado."; "Marque a caixa de confirmação. Nada foi alterado."; "Escolha um colaborador da obra." (`page.tsx:18-23`). Erros de regra: "O colaborador precisa ser membro ativo desta obra."; "Informe uma conta de e-mail @axion.com.br."; "Já existe uma solicitação pendente ou uma autorização vigente para este colaborador, conta e obra." (`lib/email-authorization/request.ts:15-19`).
  - E-mail de solicitação só sai conforme a guarda do modo piloto (`request.ts` comentário linhas 29-33): **DEPENDE DE CONFIGURAÇÃO** (provedor de e-mail e modo piloto). Se falhar, a solicitação fica registrada com `emailSent=false`.
  - Página do colaborador: link inexistente ou sem acesso → "Este link não existe ou o seu usuário não tem acesso a esta autorização." (`[authorizationId]/page.tsx:63`). Respondida: "Esta solicitação já foi respondida. Nada foi alterado."; texto mudou: "O texto desta autorização mudou. Recarregue a página e leia novamente. Nada foi registrado."; "Esta autorização não pode mais ser revogada. Nada foi alterado."; "Não foi possível registrar agora. Tente novamente; nada foi alterado." (`:25-30`). Versão do texto indisponível: "O texto desta autorização (versão {v}) não está mais disponível. Peça ao administrador da obra uma nova solicitação." (`:154`).
  - **Limitação importante (decisão pendente)**: a sincronização de e-mails **ainda não consulta** estas autorizações; recusa e revogação ficam registradas e visíveis, mas não bloqueiam a leitura automaticamente — quem decide a conexão é o administrador (`docs/vera-autorizacao-email-e-voz.md` §2, "Decisão pendente"). O manual não deve prometer que revogar interrompe a sincronização.
  - A revogação no ACC **não remove** a permissão concedida ao Google (`autorizacoes/page.tsx:161-163`; `notice.ts:99-106`).
  - O texto da autorização (versão `2026-10-v1`) é fixo e versionado (`notice.ts:13,57-59`). Conferência do texto: `scripts/test-email-authorization.mjs` (comentário `notice.ts:3`; não executado).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Menu (title) | "Autorizações — Consentimento dos colaboradores para o acesso aos e-mails da obra (só administradores)." | `app-sidebar.tsx:119` + `feature-help.ts:120-126` |
| ⓘ no cabeçalho (completo) | "Mostra, por colaborador, conta e obra, se o acesso aos e-mails foi autorizado, recusado ou revogado, quando, e a situação da conexão da conta. O aceite é registrado no ACC; a conexão da conta Google é separada e feita pelo administrador." / revisão humana: "A permissão do Google (somente leitura) não é limitada a uma obra; quem limita a leitura à obra são os filtros do ACC." | `autorizacoes/page.tsx:63`; `feature-help.ts:123-125` |
| Título/descrição | "Autorizações de acesso aos e-mails" / "Consentimento de cada colaborador para o ACC usar a conta de e-mail corporativa nesta obra." | `autorizacoes/page.tsx:61-62` |
| Explicação | "O colaborador recebe um e-mail individual com a finalidade, as permissões e os filtros, e responde dentro do ACC. O aceite registrado aqui é o consentimento no ACC; ele não conecta a conta Google (a conexão é feita à parte, e a situação dela aparece na tabela)." | `page.tsx:77-79` |
| Aviso de rodapé | "Revogar aqui registra o fim do consentimento no ACC. Para remover a permissão concedida ao Google, o colaborador usa a conta Google dele ou o administrador do Google Workspace." | `page.tsx:162` |
| Campos | "Colaborador", "Escolha…", "Conta (em branco = e-mail do colaborador)", placeholder "nome@axion.com.br", "Solicitar e enviar e-mail", "Ver texto e histórico", "Cancelar solicitação"/"Revogar", placeholder "Motivo (opcional)", "Confirmo" | `page.tsx:84,86,95-96,99,136,140,144,147` |
| Página do colaborador (título) | "Autorização de acesso aos e-mails da obra" | `[authorizationId]/page.tsx:19,86` |
| Aviso acima do texto | "O aceite registrado aqui é o seu consentimento no ACC. Ele não conecta nem desconecta a conta Google: a conexão é feita pelo administrador, com credenciais guardadas no servidor." | `[authorizationId]/page.tsx:128` |
| Texto do consentimento | seções "Para que serve", "Que permissão o ACC usa" (inclui "Atenção: essa permissão do Google não é limitada a uma obra. Tecnicamente, ela permite ler a caixa inteira. Quem limita a leitura à obra são os filtros do próprio ACC…"), "Quais filtros o ACC aplica", "Se você não autorizar", "Como revogar no ACC", "Como revogar a permissão concedida ao Google" | `notice.ts:61-106` |
| Decisão | "Sua decisão para esta obra"; "Escolha uma opção. Você ainda vai confirmar na próxima etapa; nada é registrado só por abrir esta página." | `[authorizationId]/page.tsx:162,165` |
| Sucesso | "Autorização registrada para esta obra. Ela não conecta a conta sozinha: a conexão é feita pelo administrador."; "Recusa registrada. Nada foi alterado na sua conta Google."; "Autorização revogada para esta obra. O histórico foi preservado." | `:22-24` |
| Gatilho AXIA | `VeraTrigger context="autorizacao" variant="photo"` (foto da AXIA no cabeçalho; ao abrir pergunta "Como funciona esta autorização de acesso aos e-mails?") | `[authorizationId]/page.tsx:87`; `components/assistant/vera-events.ts:20` |
| Histórico | "Solicitada", "Autorizada", "Recusada", "Revogada" + data, autor, nota, "(texto v{versão})" | `[authorizationId]/page.tsx:252-257` |

- **Sugestões de melhoria dos textos**
  1. Caixa "Confirmo" na revogação do administrador é vaga (`autorizacoes/page.tsx:147`): "Confirmo a revogação desta autorização" / "Confirmo o cancelamento da solicitação".
  2. A mensagem "Este link não existe ou o seu usuário não tem acesso…" (`[authorizationId]/page.tsx:63`) aparece também para quem abre o link logado com **outra** conta; sugerir "Entre com a conta @axion.com.br que recebeu o e-mail" (se não logado, o proxy já leva ao login: `proxy.ts:56-66`).
  3. No manual, descrever as **seis** seções do texto exibidas (`notice.ts:61-106`), sem resumir em "quatro blocos".
  4. O texto "Atenção: essa permissão do Google… permite ler a caixa inteira" é correto e importante; manter. Acrescentar, se a decisão pendente continuar aberta, um aviso ao administrador: "Recusas e revogações ainda não interrompem a sincronização automaticamente" (`docs/vera-autorizacao-email-e-voz.md` §2).
  5. Mensagem `flash` do administrador "permissao" usa "obra" e "administradores da obra": coerente; nenhuma mudança.

- **Fontes**
  `app/[projectId]/autorizacoes/{page,actions}.ts*`; `app/autorizacao-email/[authorizationId]/{page,actions}.ts*`; `lib/email-authorization/{notice,guard,request,request-email,store}.ts`; `lib/ui/feature-help.ts:120-126`; `docs/vera-autorizacao-email-e-voz.md` §2; `proxy.ts:46-66`; `supabase/migrations/20261029120000_email_access_authorizations.sql` (citada em §2, não lida integralmente).

---

### 4.32 Auditoria — rota `/{obra}/auditoria`

- **Para que serve**
  Trilha cronológica de ações relevantes da obra (quem, quando, o quê, qual entidade, detalhe), com filtros por assunto e um aviso quando há registros de falha ou indisponibilidade (`app/[projectId]/auditoria/page.tsx:95,97-113`; `lib/ui/feature-help.ts:263-269`).

- **Quem acessa / permissões**
  - Menu: **todos os perfis** (sem `restrictedTo`, `nav-items.ts:50`); a página não verifica perfil. A leitura é por membro da obra via RLS `audit_log_entries_select_project_members_only` (`supabase/migrations/20260819195713_audit_foundation.sql:104-110`); não há política de INSERT para usuário comum (`:111`).
  - A descrição da página diz "para a Diretoria" (`page.tsx:95`), mas a tela **não** é restrita à Diretoria: qualquer membro vê a trilha da obra. Divergência texto × acesso.

- **Fluxo principal**
  1. Abrir **Auditoria**: vê a lista completa (filtro "Todos").
  2. Em "Filtrar logs:" tocar um filtro: Todos, Projetos e versões, Atas de reunião, Relatórios e RDO, Medições, E-mails, Ações e SLA, SSMA/ESG, Integrações e falhas (`page.tsx:18-28,97-107`). O filtro vai na URL `?tipo=` (`:102`).
  3. Se houver falhas, ler o aviso "Supervisão do ACC: n registro(s) de falha ou indisponibilidade no histórico. Use o filtro “Integrações e falhas” para investigar." (`:109-113`).
  4. Ler a tabela: Data/Hora, Ator, Ação, Entidade ("tipo · id"), Detalhe (`:118-151`).

- **Estados e exceções**
  - Sem registros para o filtro: "Nenhum registro de auditoria para este filtro." (`:116`).
  - Valor de `?tipo=` desconhecido volta a "Todos" (`:55-57`).
  - Ator: "Sistema" (tipo SYSTEM), rótulo gravado ou "Usuário legado" (tipo LEGACY), nome do usuário ou "Usuário não disponível" (`:63-82`).
  - **A categoria dos filtros é inferida por palavras-chave** no texto de ação/entidade/detalhe (regex em `classifyLog`, `:32-42`); não é um campo gravado. Um registro pode cair em categoria "errada" se o texto não contiver a palavra; o padrão final é "Projetos e versões" (`:41`). O contador de falhas também é por regex (`:89-91`) e **conta tudo**, não só o filtro ativo.
  - Sem paginação nem limite: a consulta traz todas as linhas da obra, ordenadas pela mais recente (`lib/data.ts:933-951`) — **desempenho em obras grandes: não verificado**. ID de obra inválido devolve lista vazia, sem erro (`lib/data.ts:945-948`).
  - Textos legados com acentuação corrompida são normalizados na exibição (`page.tsx:138,147`; `lib/normalize-legacy-mojibake.ts`).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Menu (title) | "Auditoria — Histórico rastreável das ações realizadas no ACC." | `app-sidebar.tsx:119` + `feature-help.ts:263-269` |
| ⓘ completo | "Registra quem realizou ações relevantes, quando ocorreram e quais informações foram afetadas, preservando governança e rastreabilidade." (a página não exibe esse ⓘ no cabeçalho: **não encontrado**) | `feature-help.ts:267-268` |
| Título/descrição | "Auditoria" / "Trilha cronológica e supervisão operacional para a Diretoria." | `auditoria/page.tsx:95` |
| Filtros | "Filtrar logs:" + rótulos listados acima | `page.tsx:98,19-27` |
| Entidade (hover) | `title="Categoria: {rótulo}"` no texto "tipo · id" | `page.tsx:141` |
| Aviso | "Supervisão do ACC: {n} registro(s) de falha ou indisponibilidade no histórico. Use o filtro “Integrações e falhas” para investigar." | `page.tsx:111` |
| Vazio | "Nenhum registro de auditoria para este filtro." | `page.tsx:116` |

- **Sugestões de melhoria dos textos**
  1. Ajustar "para a Diretoria" (`page.tsx:95`) à realidade (todos os membros veem) ou restringir o acesso — decisão de produto.
  2. Acrescentar `<FeatureInfo helpId="auditoria" />` ao cabeçalho, como em outras abas.
  3. Dizer ao usuário que os filtros são aproximados ("classificação automática por palavras"), por exemplo sob "Filtrar logs:".
  4. "Entidade" mostra `tipo · id` técnico (`page.tsx:142`); sugerir nome legível quando existir.
  5. Os filtros são links com `Badge`; falta `aria-current` no ativo (`page.tsx:100-106`).

- **Fontes**
  `app/[projectId]/auditoria/page.tsx`; `lib/data.ts:933-971`; `lib/normalize-legacy-mojibake.ts`; `lib/ui/feature-help.ts:263-269`; `supabase/migrations/20260819195713_audit_foundation.sql:104-111`.

---

### 4.33 Ajuda e tutorial — rota `/{obra}/ajuda` (tutorial PDF/PPTX e AXIA)

- **Para que serve**
  Reúne a apresentação da suíte e o tutorial permanente do ACC em **PDF** (consulta) e **PowerPoint** (editável), com imagens das telas e dos e-mails de alerta em dados fictícios (`app/[projectId]/ajuda/page.tsx:20,28-32,49-51`; `lib/ui/feature-help.ts:256-262`). É também o destino dos links "Fale com a AXIA" dos e-mails (`/{obra}/ajuda?vera=abrir&contexto=…`, `docs/vera-autorizacao-email-e-voz.md` §1).

- **Quem acessa / permissões**
  - Menu: todos os perfis (`nav-items.ts:51`). A página exige que a obra exista para o usuário (`getProject`; senão `notFound()`, `ajuda/page.tsx:14-15`).
  - Arquivos do tutorial: rota autenticada que devolve **401** sem login e **404** para quem não participa da obra (RLS via `getProject`) (`app/[projectId]/ajuda/tutorial/[formato]/route.ts:17-23`). Os arquivos ficam em `content/tutorial/` e **não** em `public/` (`lib/help/tutorial-files.ts:1-3`). Formatos aceitos só `pdf` e `pptx`; outro vira 404 (`route.ts:14-16`).
  - Todos os perfis (inclusive Leitura) acessam; nenhuma ação desta tela altera dados.

- **Fluxo principal**
  1. Abrir **Ajuda e tutorial**.
  2. Ler o resumo do conteúdo: acesso e seleção de obra, documentos e cláusulas, alertas e respostas parciais, CONSULTAR IA, providências e CNO, SSMA no celular e permissões (`ajuda/page.tsx:28-32`).
  3. Tocar **Abrir o PDF** (abre inline em nova aba) ou **Baixar o PowerPoint** (download) (`page.tsx:34-47`; `lib/help/tutorial-files.ts:5-17`).
  4. Em qualquer tela, tocar **Fale com a AXIA** (ver seção AXIA); a caixa traz o link "Abrir o tutorial completo (PDF e PowerPoint)" (`components/assistant/assistant-widget.tsx:361-364`).

- **Estados e exceções**
  - Arquivo ausente no servidor: resposta "Arquivo indisponível" (404) (`route.ts:27-31`). Presença dos dois arquivos no repositório: `content/tutorial/ACC-apresentacao-e-tutorial.pdf` e `.pptx` (listagem de diretório).
  - Cache privado de 5 minutos (`route.ts:38`).
  - Conteúdo dos slides: **não verificado** nesta tarefa (binários não abertos). A AXIA referencia slides 3 (tutorial), 19 e 20 (SSMA), 22 (sem internet) e 24 (permissões) (`lib/assistant/knowledge.ts`, campos `tutorialSlide`).
  - A página diz que as imagens "informam o que foi verificado e o que ainda depende de teste real" (`page.tsx:30-31`); essa afirmação só vale se os slides realmente tiverem essa marcação (**não verificado**).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Menu (title) | "Ajuda e tutorial — Apresentação e guia de uso do ACC (PDF e PowerPoint)." | `app-sidebar.tsx:119` + `feature-help.ts:256-262` |
| ⓘ completo | "Reúne a apresentação da suíte e o tutorial permanente, com imagens das telas e dos e-mails de alerta (dados fictícios). O PDF é para consulta e o PowerPoint é editável." (ausente do cabeçalho da página: **não encontrado**) | `feature-help.ts:260-261` |
| Título/descrição | "Ajuda e tutorial" / "Apresentação da suíte e guia de uso do ACC, com imagens das telas e dos e-mails de alerta." | `ajuda/page.tsx:20` |
| Cartão | "Apresentação e tutorial do ACC" | `page.tsx:24` |
| Botões | "Abrir o PDF", "Baixar o PowerPoint" | `lib/help/tutorial-files.ts:10,16` |
| Rodapé | "Acesso restrito a usuários autenticados com acesso a esta obra. O PowerPoint é editável; o PDF é para consulta." | `page.tsx:50` |
| Erros HTTP | "Não encontrado" / "Não autenticado" / "Arquivo indisponível" | `route.ts:15,20,23,30` |

- **Sugestões de melhoria dos textos**
  1. A página não menciona a AXIA nem o ⓘ; adicionar um parágrafo "Dúvida rápida? Use Fale com a AXIA" e o `FeatureInfo` no cabeçalho.
  2. O texto "Acesso restrito a usuários autenticados…" não diz que o arquivo usa dados fictícios (a descrição do ⓘ diz); repetir.
  3. Erros HTTP em texto puro quando o PDF falha (`route.ts`); usuário vê a mensagem do navegador. Sem alternativa na tela: avaliar mensagem amigável.

- **Fontes**
  `app/[projectId]/ajuda/page.tsx`; `app/[projectId]/ajuda/tutorial/[formato]/route.ts`; `lib/help/tutorial-files.ts`; `content/tutorial/*` (existência); `lib/ui/feature-help.ts:256-262`; `lib/assistant/knowledge.ts`.

---

### 4.34 AXIA — "Fale com a AXIA" (caixa de conversa) e rota `/vera`

- **Para que serve**
  Assistente de ajuda do ACC. **Nesta fase responde apenas por texto**: recupera orientação de uma **base de conhecimento curada** (sem IA generativa, sem rede, sem custo), nunca consulta dados da obra e nunca altera nada (`lib/assistant/answer.ts:1-8,44-52`; `app/[projectId]/ajuda/assistente/route.ts:8-9`). A leitura em voz (ElevenLabs) existe no código mas está **desligada** (ver estados). O nome técnico `vera` foi mantido em rota e eventos (`docs/vera-autorizacao-email-e-voz.md`, nota de renomeação).

- **Quem acessa / permissões**
  - Qualquer usuário logado **com acesso à obra** (login e participação checados no servidor: `ajuda/assistente/route.ts:14-19`). Sem restrição por perfil: Leitura também usa.
  - O gatilho aparece no topo de todas as telas da obra (`components/layout/top-bar.tsx:86`), no cabeçalho da página de autorização (`autorizacao-email/[authorizationId]/page.tsx:87`) e no cabeçalho do app SSMA dentro de uma obra (`ssma-chrome.tsx:141-143,166`). A caixa é montada uma vez por layout (`app/[projectId]/layout.tsx:63`).
  - **/vera**: página de entrada dos e-mails sem contexto. Exige login (proxy); com **uma** obra redireciona para `/{obra}/ajuda?vera=abrir&contexto=geral`; com várias, lista para escolher; com nenhuma, avisa (`app/vera/page.tsx:10-15,24-40`).
  - Limites: 20 perguntas por minuto por usuário (`ajuda/assistente/route.ts:21-23`), 500 caracteres por pergunta (`lib/assistant/limits.ts:3`), 8 leituras de voz por minuto (`voz/route.ts:54`). O contador é em memória por instância (`lib/assistant/rate-limit.ts:1-6`), portanto aproximado em ambiente serverless.

- **Fluxo principal**
  1. Tocar **Fale com a AXIA** (foto circular + texto; em tela estreita só a foto) (`components/assistant/vera-trigger.tsx:29-48`). Também abre por link de e-mail (`?vera=abrir&contexto=geral|alerta|providencia|ssma|autorizacao`) (`assistant-widget.tsx:144-156`; contextos em `vera-events.ts:6,14`).
  2. A caixa mostra "Olá! Sou a AXIA, a assistente do ACC. Pergunte como usar o sistema — documentos, alertas, providências, SSMA ou a autorização de e-mails." e **sugestões** conforme o contexto (`assistant-widget.tsx:263,28-41`).
  3. Tocar uma sugestão ou digitar em "Digite sua pergunta" e enviar (botão "Enviar pergunta") (`:342-359`).
  4. A resposta traz título, resumo, passos numerados, botões de link para telas do ACC e "Tutorial: slide n" (`:283-302`; assuntos em `lib/assistant/knowledge.ts`: acesso, documentos, cláusulas, graus de risco, cores e repetição, alertas, CONSULTAR IA, providências, SSMA instalar/registrar/sem internet, permissões, ajuda, dashboard, quem é a AXIA, e 7 assuntos de autorização de e-mails).
  5. **Esc** ou **Fechar a AXIA** fecha e devolve o foco ao elemento anterior (`:160-169,195-199`).
  6. Rodapé: **Abrir o tutorial completo (PDF e PowerPoint)** (`:361-364`).

- **Estados e exceções**
  - Pergunta sem assunto correspondente (pontuação mínima 2): título "Não encontrei esse assunto", resumo do fallback e link "Ajuda e tutorial" (`answer.ts:105,122-132`; texto em `knowledge.ts:330-335`).
  - Pergunta que pede para **alterar dados** ("apague", "crie", "aprove", "envie"…): a resposta traz o aviso "A AXIA só orienta: ela não altera dados nem executa ações no sistema. Os passos abaixo mostram como fazer isso você mesmo, com o seu perfil." (`answer.ts:95-103,115`; `knowledge.ts:338-339`).
  - Erros de rede/servidor: "Não foi possível obter a resposta agora. Tente novamente." / "Sem conexão com o ACC. Verifique a internet e tente novamente." / "Muitas perguntas em pouco tempo. Aguarde um minuto." / "A assistente não está disponível neste ambiente." (503) (`assistant-widget.tsx:118,124`; `route.ts:22,41`). Pergunta vazia ou acima de 500: "Escreva uma pergunta de até 500 caracteres." (`route.ts:33`).
  - Modo: variável `AXION_AI_PROVIDER_ASSISTENTE`; só `fake` (padrão) é aceito, qualquer outro valor falha de forma explícita em vez de mudar de modo (`answer.ts:19,45-52`) — **DEPENDE DE CONFIGURAÇÃO** (padrão funciona sem configuração).
  - **Voz desligada nesta fase**: os controles ("Voz", "Ouvir resposta", "Parar") só aparecem se `available === true`, isto é, se o servidor reportar voz disponível (`components/assistant/assistant-voice-controls.tsx:15-31`); a disponibilidade vem de `ELEVENLABS_*` ou do modo `simulado` (`lib/assistant/elevenlabs-speech.ts:117-125`; `docs/vera-autorizacao-email-e-voz.md` §4: "desligada até ELEVENLABS_ENABLED, ELEVENLABS_API_KEY e ELEVENLABS_VOICE_IDS serem configuradas"). **DEPENDE DE CONFIGURAÇÃO**; nenhuma chamada real foi testada (mesmo §4). No manual, descrever a AXIA como "texto apenas".
  - Preferência de voz fica no `localStorage` (`acc-vera-voz`) só como conveniência (`assistant-widget.tsx:43-59`).
  - A AXIA não guarda histórico entre aberturas da caixa (estado só em memória do componente, `:62-67`). Persistência de conversa: **não encontrado**.
  - Imagem: a AXIA usa o ícone neutro provisório da marca ACC; a arte definitiva depende da comprovação de origem e direitos (`docs/vera-autorizacao-email-e-voz.md` §1). Não afeta o fluxo, mas é pendência.
  - Alterações não commitadas: refatoração dos controles de voz (working tree).

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Gatilho (hover) | `title="Fale com a AXIA"` | `vera-trigger.tsx:34` |
| Gatilho (leitor de tela) | `aria-label="Fale com a AXIA — Assistente ACC"`; texto visível "Fale com a AXIA" (oculto em tela estreita; `sr-only` na variante "photo") | `vera-trigger.tsx:33,45,47` |
| Caixa | `aria-label="AXIA — Assistente ACC"`; título "AXIA — Assistente ACC"; subtítulo "Ajuda com o ACC" | `assistant-widget.tsx:243-253` |
| Fechar | `aria-label="Fechar a AXIA"` | `:255` |
| Campo | placeholder "Digite sua pergunta"; `aria-label="Pergunta para a AXIA"`; botão `aria-label="Enviar pergunta"` | `:347-354` |
| Carregando | "Procurando a orientação…" | `:307` |
| Sugestões (geral) | "Como envio documentos?", "O que significa risco crítico?", "Como instalo o SSMA no celular?" | `:29` |
| Sugestões (alerta) | "O que significa risco crítico?", "De quantos em quantos dias o alerta repete?", "Como respondo a um lote de alertas?" | `:30` |
| Sugestões (providência) | "Como cadastro uma providência?", "Como funciona o prazo do CNO?", "O que significa D-60?" | `:31` |
| Sugestões (ssma) | "Como instalo o SSMA no celular?", "Como registro uma ocorrência?", "O que funciona sem internet?" | `:32` |
| Sugestões (autorizacao) | "Para que serve esta autorização?", "O que o ACC poderá ler na minha conta?", "Quais filtros são aplicados?", "O que acontece se eu não autorizar?", "Como revogo a autorização?", "Como revogo a permissão no Google?" | `:33-40` |
| Voz (se ligada) | "Voz", "Ouvir resposta", "Preparando…", "Parar"; "A leitura em voz ainda não está habilitada neste ambiente. A resposta em texto continua disponível." (servidor) | `assistant-voice-controls.tsx:37,59,68`; `voz/route.ts:76` |
| Resposta "quem é você" | "Sou a AXIA, a Assistente ACC. Oriento sobre o uso do ACC com base no tutorial e na ajuda do sistema. Não altero dados, não aprovo nem envio nada: quem executa as ações é você, com o seu perfil." | `knowledge.ts` entrada "vera" (≈229-237) |
| `/vera` | título "AXIA — Assistente ACC"; "Escolha a obra para conversar com a AXIA:"; "Você ainda não participa de nenhuma obra no ACC. Peça a um administrador para liberar o seu acesso." | `app/vera/page.tsx:8,21,25,28` |

- **Sugestões de melhoria dos textos**
  1. **Inconsistência de perfis**: a AXIA responde "Há três perfis por obra: Administrador, Gerente e Colaborador. Itens restritos, como Financeiro e Start-up ACC, só aparecem a quem tem acesso." (`knowledge.ts` entrada "permissoes", ≈196-206) — o sistema tem **quatro** (inclui Leitura, `lib/labels.ts:110-116`) e a lista de itens restritos omite **Autorizações** (`nav-items.ts:49`). Corrigir o texto.
  2. O comentário do limitador cita "camada gratuita (F0) do serviço de voz" (`rate-limit.ts:5-6`), referência ao antigo piloto Azure; o serviço atual é ElevenLabs. Só comentário de código, mas confunde quem audita.
  3. O texto do assistente menciona "Fase 3" para a voz (`assistant-widget.tsx:14`; `assistant-voice-controls.tsx:5-6` "Fase 1"/"Fase 3"); manter a numeração de fases consistente no manual.
  4. "Não encontrei esse assunto" é correto, mas a sugestão "Reformule a pergunta com uma dessas palavras" (`knowledge.ts:334`) funcionaria melhor com os botões de sugestão exibidos novamente.
  5. Acessibilidade: a caixa usa `role="dialog"` com `aria-labelledby` e também `aria-label` (`assistant-widget.tsx:242-244`); manter só um dos dois. A nota "Ajuda com o ACC" já cumpre a regra de "não altera evidências / diferencia fato e recomendação" do CLAUDE.md (regra 12).

- **Fontes**
  `components/assistant/{assistant-widget,assistant-voice-controls,vera-trigger,vera-events}.ts*`; `app/[projectId]/ajuda/assistente/route.ts`; `app/[projectId]/ajuda/assistente/voz/route.ts`; `app/vera/page.tsx`; `lib/assistant/{answer,knowledge,limits,rate-limit,elevenlabs-speech}.ts`; `components/layout/top-bar.tsx:86`; `app/[projectId]/layout.tsx:63`; `docs/vera-autorizacao-email-e-voz.md` §1, §3, §4; `git status` (alterações locais).

---

### 4.35 Start-up ACC — rota `/{obra}/startup`

- **Para que serve**
  Antes de ligar o acompanhamento operacional, o Administrador **valida os riscos históricos** (achados Alto e Crítico anteriores à entrada do ACC), de modo que fatos antigos já pacificados não gerem alertas novos. Define as datas do período histórico e conclui a validação (`app/[projectId]/startup/page.tsx:57`; `lib/ui/feature-help.ts:128-136`).

- **Quem acessa / permissões**
  - Menu restrito a Administrador (`nav-items.ts:52`) **e** a página dá `notFound()` para quem não é membro ATIVO com permissão exata ADMINISTRADOR (`startup/page.tsx:42-48`).
  - **Servidor/banco**: as Server Actions de Start-up exigem só sessão ativa (`requireUser`, `startup/actions.ts:35-38`) e gravam em `projects` e `ai_findings`, cujas políticas de UPDATE exigem nível EDITOR (= Administrador, Gerente ou Colaborador) (`supabase/migrations/20260823090000_startup_historical_review.sql:39-44`; `20260823080000_client_source_confrontation_and_findings.sql:230`). **Divergência**: a UI é restrita ao Administrador, mas o servidor/RLS aceitariam chamada direta de outro perfil de nível EDITOR. Ponto a decidir (ver sugestões). Não há teste de que a checagem de perfil exista na camada de ação (**não encontrado** em `startup/actions.ts`).

- **Fluxo principal**
  1. Abrir **Start-up ACC**. O cartão "Cabeçalho" mostra Data de início da obra (ou "Não configurada"), Data de término da baseline, Data de início operacional ACC, o período histórico "{início} → dia anterior ao início operacional" e o estado: Não iniciado, Em análise, Em revisão humana, Concluído (`page.tsx:21-26,65-98`). Contadores: Findings históricos, ALTO, CRÍTICO, Decididos, % conclusão (`:91-95`).
  2. Em **Configuração** (formulário), informar Data de início da obra, Data de término da baseline e Data de início operacional ACC e tocar **Salvar datas** (`components/startup/startup-config-form.tsx:19-34`). Sucesso: "Configuração salva."
  3. Em **Findings históricos ALTO/CRÍTICO**, ler a **legenda de risco** (Baixo, Médio, Alto, Crítico, cada um com ⓘ) (`page.tsx:104-108`; `components/shared/risk-legend.tsx:13-21`). Cada cartão traz selo de risco, tipo, classificação, ícone(s) do(s) Expert(s) com `title` do nome, interpretação e "Recomendação: …" (`components/startup/historical-finding-card.tsx:51-73`).
  4. Para cada achado, **uma** decisão humana (`historical-finding-card.tsx:80-98`):
     - **Desconsiderar** → "Justificativa" (obrigatória) → **Confirmar** (`:132-153`);
     - **Já tratado / Pacificado** → "Como foi resolvido" (obrigatório), "Data aproximada (opcional)", "Evidência (opcional)" → **Confirmar** (`:155-184`);
     - **Cuidar deste assunto** → "Responsável (@axion.com.br)", "Área" (padrão Engenharia), "Descrição da ação", "Prazo (opcional)", "Observação (opcional)" → **Criar ação** (`:186-250`). A ação nasce com responsável AXION, prazo e acompanhamento por SLA e aparece em Ações e Escalonamentos (`feature-help.ts:333-337`; `card:129`).
  5. Depois de todas as decisões, **Concluir Start-up do projeto** fica habilitado (`complete-startup-button.tsx:17`). Ao concluir grava o marco e a data limite da revisão histórica (dia anterior ao início operacional) sem reescrever nenhum achado (`lib/startup/complete-startup.ts:1-4,38-51`).
  6. O botão **Dashboard** no cabeçalho volta ao painel (`page.tsx:59-61`).

- **Estados e exceções**
  - Nenhum achado Alto/Crítico: "Nenhum finding histórico ALTO/CRÍTICO registrado ainda — LOW/MEDIUM permanecem pesquisáveis mas não bloqueiam o Start-up." (`page.tsx:111`).
  - Concluir bloqueado enquanto houver pendência: botão desabilitado e "{n} finding(s) ALTO/CRÍTICO ainda sem decisão humana." (`complete-startup-button.tsx:22-24`). O servidor **reconfere** e recusa: "Não é possível concluir o Start-up: {n} finding(s) histórico(s) ALTO/CRÍTICO ainda sem decisão humana." (`complete-startup.ts:30-35`).
  - Concluído: botão some (`page.tsx:119`); mensagem "Start-up concluído." (`complete-startup-button.tsx:26`). Achados decididos mostram resumo: "Desconsiderado. Justificativa: …", "Já tratado / pacificado. …", "Ação de SLA criada para este finding — ver Ações e Escalonamentos." (`historical-finding-card.tsx:113-129`). **Reabrir/desfazer uma decisão: não encontrado.**
  - Erros genéricos: "Falha ao configurar Start-up.", "Falha ao desconsiderar finding.", "Falha ao marcar finding como pacificado.", "Falha ao criar ação.", "Falha ao concluir Start-up." e "Sessão expirada. Faça login novamente." (`startup/actions.ts:37,57,76,97,125,140`).
  - Só aparecem como responsáveis membros com e-mail @axion.com.br (`historical-finding-card.tsx:198`).
  - Achados LOW/MEDIUM **não** entram nesta tela (`page.tsx:51`).
  - Existência efetiva dos achados históricos em cada obra: **DEPENDE DE CONFIGURAÇÃO / dados reais** (geração pelos Experts; ver cap. 8) — não verificado.

- **Textos hover e avisos atuais**

| Elemento | Texto literal | Arquivo:linha |
|---|---|---|
| Menu (title) | "Start-up ACC — Validação dos riscos históricos antes da operação normal." | `app-sidebar.tsx:119` + `feature-help.ts:128-136` |
| ⓘ "Start-up ACC" (completo) | "Analisa o histórico desde o início real da obra e apresenta os riscos Alto e Crítico anteriores ao início operacional do ACC." / "Usos": Desconsiderar; Já tratado / pacificado; Cuidar deste assunto / resultado: "Isso evita novos alertas sobre fatos históricos já resolvidos." (sem ⓘ no cabeçalho da página: **não encontrado**) | `feature-help.ts:131-135` |
| Título/descrição | "Start-up ACC" / "Validação dos riscos históricos antes de ativar o acompanhamento operacional — o ACC conhece todo o passado do projeto, mas nunca trata fato histórico já pacificado como ocorrência nova." | `page.tsx:56-57` |
| ⓘ "Data de início da obra" | curto: "Define o início histórico da obra — não o início do ACC." / completo: "Define o início histórico da obra e NÃO o início do ACC." | `page.tsx:73`; `feature-help.ts:309-313` |
| ⓘ "Data de início operacional ACC" | curto: "Define quando começa o acompanhamento prospectivo." / completo: "…não corta Timeline nem histórico." | `page.tsx:78`; `feature-help.ts:315-319` |
| ⓘ "Findings históricos" | título "Finding": "Achado produzido pela curadoria de IA." / "Um finding é um achado estruturado produzido pela curadoria de IA (fatos, interpretação, risco e recomendação), sempre rastreável até sua fonte original." / "Todo finding exige revisão humana — a IA nunca decide sozinha." | `page.tsx:106`; `feature-help.ts:655-661` |
| Legenda de risco | selos "Baixo", "Médio", "Alto", "Crítico" com ⓘ: "Impacto limitado; acompanhamento de rotina." · "Exige atenção e acompanhamento." · "Pode gerar impacto contratual, econômico ou operacional relevante." · "Pode gerar consequência grave e exige atenção prioritária." (cores: verde, azul, amarelo, vermelho) | `risk-legend.tsx:16-19`; `feature-help.ts:378-401`; `components/shared/badges.tsx:40-43,76` |
| ⓘ "Desconsiderar" | "Encerra o finding no Start-up, com justificativa." / "Encerra este finding no Start-up mediante justificativa, sem apagar o fato histórico." | `historical-finding-card.tsx:85`; `feature-help.ts:321-325` |
| ⓘ "Já tratado / pacificado" | "A situação existiu, mas já foi resolvida." / "Indica que a situação existiu, mas foi resolvida antes da entrada operacional do ACC." | `card:91`; `feature-help.ts:327-331` |
| ⓘ "Cuidar deste assunto" | "Transforma o finding histórico em ação ativa." / "Transforma o finding histórico em ação ativa, com responsável AXION, prazo e acompanhamento por SLA." | `card:97`; `feature-help.ts:333-337` |
| ⓘ "Concluir Start-up" | "Finaliza a validação histórica." / "Finaliza a validação histórica quando todos os riscos Alto e Crítico tiverem recebido uma decisão humana." | `complete-startup-button.tsx:20`; `feature-help.ts:339-343` |
| Ícone do Expert | `title="{nome do Expert}"` | `card:64` |

  Sobre o significado de risco Baixo/Médio/Alto/Crítico (critérios, prazos): ver cap. 6; aqui só a legenda de tela.

- **Sugestões de melhoria dos textos**
  1. O cartão tem o título "Cabeçalho" (`page.tsx:67`), pouco informativo: "Situação do Start-up".
  2. "Data de término da baseline" não tem ⓘ (`page.tsx:75`) e o termo "baseline" não é explicado em nenhum lugar da tela: criar `helpId` com a definição.
  3. Capitalização inconsistente: botão "Já tratado / Pacificado" (`historical-finding-card.tsx:89`) × ⓘ "Já tratado / pacificado" (`feature-help.ts:327`) × resumo "Já tratado / pacificado." (`:124`).
  4. Rótulos ALTO/CRÍTICO em caixa alta nos contadores e na mensagem (`page.tsx:92-93,105`) × selos "Alto/Crítico" da legenda (`labels.ts:60-65`): unificar. Na mensagem vazia aparece "LOW/MEDIUM" em inglês (`page.tsx:111`): trocar por "Baixo/Médio".
  5. Mensagens de falha genéricas (`startup/actions.ts`) escondem a causa; devolver a mensagem tratada.
  6. Avisar, antes de **Concluir Start-up do projeto**, que a ação grava um marco e fixa a data limite da revisão histórica, e que não há botão para reabrir (**não encontrado**). Sugestão de diálogo de confirmação (o botão envia direto, `complete-startup-button.tsx:14-20`).
  7. Resolver a divergência de permissão (ver "Quem acessa"): ou explicitar no texto "Somente Administradores" ou fechar a lacuna no servidor.

- **Fontes**
  `app/[projectId]/startup/{page,actions,actions-state}.ts*`; `components/startup/*.tsx`; `components/shared/{risk-legend,badges,feature-info}.tsx`; `lib/startup/*.ts`; `lib/labels.ts:60-65`; `lib/ui/feature-help.ts:128-136,309-343,378-401,655-661`; migrations `20260823090000_startup_historical_review.sql`, `20260823080000_client_source_confrontation_and_findings.sql`.

---

## 5. TEXTOS HOVER, AVISOS E DICAS — COMO FUNCIONAM

O ACC usa quatro mecanismos de texto de apoio. Cada seção do capítulo 4 lista os textos **atuais** de cada tela; as **sugestões** vêm separadas.

| Mecanismo | Como aparece | Onde está |
|---|---|---|
| **Hover do menu lateral** | `title` nativo = "{rótulo} — {descrição curta}", com o texto do catálogo de ajuda do item | `components/layout/app-sidebar.tsx:119`; catálogo `lib/ui/feature-help.ts` |
| **ⓘ de ajuda (FeatureInfo)** | Ícone ⓘ: dica curta ao passar o mouse (`role="tooltip"`) e quadro completo ao clicar (`role="dialog"`), com `aria-label` "Informações sobre {título}" | `components/shared/feature-info.tsx:57-103`; textos em `lib/ui/feature-help.ts` (chave `helpId`) |
| **Hover automático de campo** | "Função deste campo: {aria-label, senão placeholder, senão rótulo, senão name}." | `components/shared/automatic-field-help.tsx:17-18` |
| **`title` e `aria-label` específicos** | Dicas de botões, selos e colunas escritas na própria tela | cada componente (listado por aba) |

**Observações transversais (para decisão)**
- O hover automático usa o placeholder ou o `name` bruto quando não há rótulo, o que gera textos fracos, por exemplo "Função deste campo: destinatario@exemplo.com." Sugestão: preencher `aria-label` nos campos de busca, destinatário e justificativa.
- Vários textos do catálogo `feature-help.ts` descrevem telas que não existem mais ou nunca foram ligadas a um ⓘ (Dashboard visual antigo, Adicionais, Análise Contratual/Cláusulas, Financeiro e Integrações dentro da página). Ver Anexo D.
- Os ⓘ dos selos de risco não correspondem aos critérios adotados (D3 do Anexo A, sugestão S1 do cap. 9.2).
- A AXIA tem a própria base de conhecimento, separada do catálogo de ajuda (cap. 8.5 e Q&A).


---

## 6. CLASSIFICAÇÃO DE RISCOS

### 6.1 Três trilhas de alerta (não misturar)

O ACC tem três origens distintas de alerta, com regras de envio diferentes. Todo o capítulo indica a que trilha cada regra pertence.

| Trilha | Nasce de | Quem classifica | Como é enviado |
|---|---|---|---|
| **A. Evento contratual (Ledger)** | `contract_events` + `event_ai_assessments.severity` | IA/seed + revisão humana | Envio **manual** pela tela do evento (qualquer grau) e **lote semanal automático** só de ações SLA BAIXO/MÉDIO ligadas ao evento |
| **B. Casos de risco do módulo semanal** | Comparação de cronograma, planilhas do relatório semanal, alertas de ausência | Limites configurados por projeto / mapa de severidade do projeto | ALTO/CRÍTICO no próximo ciclo horário; MÉDIO/BAIXO em consolidado semanal |
| **C. Providências** | `project_delivery_items` | Pessoa (sem escolha = MÉDIO provisório) + revisão | Janela de 60 dias antes do término (D-60) ou prazo individual; repetição por grau |

Fonte: `lib/risk-alerts/plan-risk-alerts.ts`, `lib/email/run-contract-alert-batches.ts`, `lib/delivery/delivery-items.ts:339-352`. Situação: IMPLEMENTADO; envio DEPENDE DE CONFIGURAÇÃO.

**Aviso de nomenclatura.** O código usa `BAIXA/MEDIA/ALTA/CRITICA` nos eventos (`supabase/migrations/20260818224157_event_ledger_foundation.sql:98-99`) e `LOW/MEDIUM/HIGH/CRITICAL` nas ações SLA e nos alertas de risco (`lib/sla/types.ts`). Na interface o padrão é "Baixo/Médio/Alto/Crítico" (`lib/labels.ts:57-66`). A "prioridade" da triagem de e-mail (`CRITICA/ALTA/MEDIA/BAIXA` por pontuação, `scripts/email-contract-triage.mjs:~438-452`) **não é** o grau de risco do alerta (D10).

### 6.2 De onde nasce um risco

Cadeia completa, do documento ao alerta:

1. **Leitura do contrato e dos aditivos (IMPLEMENTADO).** O worker `scripts/process-document-version.mjs` extrai o texto; páginas digitalizadas passam por OCR (tesseract, idioma `por`, 300 dpi, confiança mínima 70 — `scripts/lib/pdf-ocr.mjs:34-41`). Cada página recebe um estado: `TEXTO_NATIVO`, `OCR`, `OCR_BAIXA_CONFIANCA`, `SEM_CONTEUDO_ADICIONAL`, `PAGINA_EM_BRANCO`, `GRAFICO_SEM_TEXTO` ou `FALHA_OCR` (`pdf-ocr.mjs:45-53`). O texto original nunca é sobrescrito e o idioma é detectado offline (`docs/proposta-cobertura-extracao.md:66`, `docs/multilingual-documents.md:84-94`).
2. **Detecção de cláusulas (IMPLEMENTADO).** `scripts/clause-decimal-detector.mjs` e `clause-structure-detector.mjs` geram **candidatos** com confiança de 0 a 1 e status `PENDING_REVIEW/APPROVED/REJECTED` (`supabase/migrations/20260821012417_clause_extraction_review_foundation.sql:15-56`). A confiança cai 0,15 se houver sinalização e 0,10 se vier de OCR (`clause-decimal-detector.mjs:~283-285`).
3. **Revisão da cláusula — intervenção humana nº 1.** Em `/{obra}/revisao-clausulas`, a pessoa aprova, edita ou rejeita (rejeição exige nota; aprovação exige número, título e texto). Exige permissão EDITOR na função do banco e grava em `audit_log_entries` (`app/[projectId]/revisao-clausulas/actions.ts:103-160`; migration `…:483-503`). A cláusula aprovada passa a existir em `clauses`.
4. **Obrigação.** Não há entidade genérica "obrigação contratual" ligada à cláusula em `apps/web`. O que existe: (a) a cláusula verificada usada como descrição da obrigação na sugestão de risco (`lib/risk-classification/load-risk-source-context.ts:65`); (b) obrigações **ESG/SSMA** com risco determinístico próprio (`lib/esg/compute-obligation-risk.ts`). Providências **não** têm vínculo cláusula↔obrigação (`load-risk-source-context.ts:88`).
5. **Evento.** Nasce por triagem determinística de e-mail (`created_by_type='SYSTEM'`, status `NOVO`, **sem severidade** — `20260820152152_email_contract_triage_foundation.sql:146-165`), por candidato de e-mail aprovado por pessoa (`20260820180344_contract_review_workflow.sql:142-165`) ou por obrigação ESG (`20260822050000_esg_obligations_foundation.sql:639`).
6. **Confronto evento × cláusula (IMPLEMENTADO).** `scripts/event-clause-confrontation-analyzer.mjs` propõe candidatos com severidade BAIXO/MÉDIO/ALTO (nunca CRÍTICO): rescisão e multa/penalidade → ALTO se confiança ≥ 0,7, senão MÉDIO; prazo, pagamento/medição, escopo, seguro e SSMA → MÉDIO; demais → BAIXO (`analyzer.mjs:312-339`). **Intervenção humana nº 2:** aprovar ou rejeitar o confronto (rejeição exige nota; a tela exige ADMINISTRADOR — `app/[projectId]/ledger/[eventId]/page.tsx:53`). A aprovação cria o vínculo `event_cross_references`. O envio do alerta é bloqueado se a aprovação não tiver justificativa específica (`send-alert-actions.ts:21,108-125`).
7. **Severidade do evento.** Uma linha por evento em `event_ai_assessments`, com `requires_human_review` sempre verdadeiro (`…foundation.sql:103-104`). No `apps/web` só `applyScheduleDelayAssessmentToEvent` grava essa tabela (`lib/ai/experts/planning-director/apply-schedule-delay-assessment.ts:103`); as demais linhas vêm de fluxos externos ao `apps/web` (`docs/classificacao-de-risco.md:23`).
8. **Classificação e revisão do grau — intervenção humana nº 3** (6.4).
9. **Alerta.** Ver 6.6 (envio) e capítulo 7 (cobrança).

### 6.3 Informações usadas na classificação (sugestão determinística)

A sugestão é uma **função pura, sem IA** (`lib/risk-classification/suggest-risk.ts`). Entradas (`:51-63`):

- natureza do risco: descumprimento contratual, processual ou desconhecida;
- obrigação e cláusula verificada;
- consequência/penalidade **e a cláusula que a prevê**;
- situação do prazo: vencido, a vencer, sem prazo, desconhecido;
- **iminência** e **tempo para mitigação**: sim, não ou desconhecido.

Regras de fundo (IMPLEMENTADO):
- Iminência e tempo de mitigação são **declarados por pessoa autorizada**, nunca deduzidos de dias (`suggest-risk.ts:9-11,58-60`). O único fato derivado é: prazo vencido ⇒ iminente (`:145`).
- Penalidade só conta se houver descrição **e** cláusula verificada (`:118`).
- Quem fornece cláusula, evidências e prazo é o **servidor**, não o navegador (`lib/risk-classification/actions.ts:15-16`).
- A saída traz nível, níveis possíveis, `DEFINIDA|INDETERMINADA`, incerteza e a base separada em **FATO / INFERÊNCIA / RECOMENDAÇÃO**, mais a lista do que falta confirmar; `requiresHumanReview` é sempre verdadeiro (`:73-91`).
- Não existe número de dias que separe os níveis, por decisão (`docs/classificacao-de-risco.md:16`; `lib/ai/risk-criteria.ts:25-26`). Exceção por domínio, não geral: ESG usa janela fixa de 7 dias "a vencer" (`compute-obligation-risk.ts`).

### 6.4 Quem sugere, quem define e quem revisa

| Papel | O que faz | Fonte | Situação |
|---|---|---|---|
| **Regra (código)** | Calcula a sugestão a partir dos fatos declarados | `suggest-risk.ts` | IMPLEMENTADO |
| **IA (Experts)** | Propõe grau **provisório**; os 5 Experts recebem os mesmos critérios no prompt | `lib/ai/risk-criteria.ts:13-42`; `docs/classificacao-de-risco.md:71-81` | IMPLEMENTADO; efeito real DEPENDE DE CONFIGURAÇÃO (provedor `anthropic` + chaves; padrão é `fake`: `lib/ai/providers/get-ai-provider.ts:22`) |
| **Pessoa autorizada** | Registra o grau com **justificativa obrigatória**; o histórico é imutável e a classificação original da IA nunca é sobrescrita; grau efetivo = revisão mais recente | RPC `review_risk_classification` (`supabase/migrations/20261028120000_risk_classification_reviews.sql:80-160`); `lib/risk-classification/reviewed-severity.ts:84-115` | IMPLEMENTADO (migration **não aplicada em produção** segundo os docs — D11) |

Ao revisar o grau, o acompanhamento recorrente **aberto** passa ao intervalo do novo grau, sem mexer no próximo lembrete já agendado (`…reviews.sql:148-157`). Alterar o risco de uma providência direto na tabela também é registrado, com o texto "Alteração direta na tabela de providências (sem justificativa informada)." (`…:162-185`).

**Quem pode revisar — DIVERGÊNCIA D1 (alta).** A tela e o documento dizem "gestor, gerente ou administrador" (`components/risk/risk-review-section.tsx:39`; `risk-review-panel.tsx:144,261`; `docs/classificacao-de-risco.md:56`). A função do banco chama `has_project_permission(…, 'GESTOR')` (`…reviews.sql:122`), e a definição vigente dessa função (`20260829200000_project_permission_gerente_compat.sql:69-110`) só deixa passar **ADMINISTRADOR**. O stub de teste (`scripts/lib/pglite-supabase-stub.mjs:43-56`) concede GESTOR/GERENTE, então o teste existente não detecta isso. **Verificação em ambiente de teste (04/11/2026, PROVADO POR EXECUÇÃO):** com as 126 migrations reais carregadas em PGlite, **sem** o stub, `has_project_permission(obra,'GESTOR')` e a RPC `review_risk_classification` só passam para **ADMINISTRADOR**; GESTOR, GERENTE, COLABORADOR e LEITURA são negados (a mensagem do erro ainda diz "gestor, gerente ou administrador"). **SEM PROVA:** que o banco de produção tenha a mesma definição da função (o banco remoto não foi consultado). Texto do manual: "Hoje, na prática, só o administrador consegue registrar a revisão do grau; a tela mostra o formulário também a gestor e gerente, que recebem recusa ao salvar."

Outras permissões relacionadas: envio manual do alerta do evento = ADMINISTRADOR (`lib/email/send-contract-alert-email.ts:87-91`); destinatário precisa ser membro ativo (`send-alert-actions.ts:73-80`); curadoria multiagente = ADMINISTRADOR, GESTOR ou GERENTE (`ledger/[eventId]/page.tsx:56`).

**Auditoria:** `risk_classification_reviews` (imutável, bloqueia UPDATE/DELETE inclusive service role — `…reviews.sql:49-60`), `audit_log_entries` (revisão de cláusula e confronto), `sla_action_escalations` e `alert_followup_events` (`lib/alerts/followup-engine.ts:~33-40`).

### 6.5 Os quatro níveis

Critérios adotados pela Axion (`suggest-risk.ts:22-27`; `docs/classificacao-de-risco.md:9-14`). Cores/rótulos: Baixo verde, Médio azul, Alto amarelo, Crítico vermelho (`components/shared/badges.tsx:24-44`).

| Nível | Critério (texto adotado) | Regra que produz a sugestão | Exemplo **fictício** |
|---|---|---|---|
| **CRÍTICO** | "Risco iminente de descumprimento e penalização contratual, com necessidade de ação imediata." | Descumprimento contratual + iminente (ou prazo já vencido) + penalidade com cláusula verificada + **sem** tempo de mitigação (`suggest-risk.ts:103-105`). Cronograma: prazo ultrapassado + recuperação improvável estruturada (`lib/ai/experts/planning-director/derive-schedule-delay-severity.ts:74-84`). ESG: não cumprido com penalidade descrita | O prazo de entrega do marco 3 já venceu; a cláusula fictícia 12.4 prevê multa de 0,5% ao dia; não há como recuperar o prazo. |
| **ALTO** | "Risco iminente de descumprimento e penalização, mas ainda existe tempo para mitigação." | Iminente + penalidade com cláusula + **com** tempo de mitigação (`:105`). Atraso de cronograma sem avaliação conclusiva fica ALTO com "decisão humana necessária" (`derive-schedule-delay-severity.ts:50-72`) | Faltam 6 dias para o marco 3, a atividade está atrasada, a multa está prevista, mas há equipe para recuperar. |
| **MÉDIO** | "Risco com possível consequência a médio prazo." | Descumprimento não iminente (`:107`) ou iminente sem penalidade confirmada em cláusula (`:104`). Providência sem escolha nasce MÉDIO provisório (`lib/delivery/delivery-items.ts:349`) | A apólice de seguro vence em 90 dias e ainda não foi renovada. |
| **BAIXO** | "Risco processual, relacionado ao acompanhamento e à organização." | Natureza processual (`:101`) | Falta anexar a ata assinada à pasta do projeto; sem efeito contratual. |
| *(sem nível)* | — | Natureza desconhecida, ou faltam iminência/mitigação ⇒ nível vazio, `INDETERMINADA`, com faixa possível ("entre Alto e Crítico") e o que confirmar (`:174-219`) | Ninguém informou se há tempo de mitigação. |

**O que é de quem, por nível:** a sugestão é regra; a IA só propõe de forma provisória (`risk-criteria.ts:40-41`); o grau efetivo é sempre o da revisão humana mais recente. Em todos os níveis a pessoa autorizada pode reclassificar com justificativa.

**Trilha B (módulo semanal).** A severidade vem de limites por projeto (`project_schedule_risk_thresholds`); sem limite configurado para a dimensão adversa o caso fica `REVIEW_REQUIRED` (`lib/schedule/weekly-ingestion/classify-schedule-risk.ts:1-10,37-47`). Alertas de ausência só ganham grau pelo mapa `risk_alert_severity_map` do projeto; sem mapa, `REVIEW_REQUIRED` (`lib/risk-alerts/collect-risk-cases.ts:83-87`). **`REVIEW_REQUIRED` nunca gera e-mail** (`plan-risk-alerts.ts:80-82`). A sugestão "ausência = ALTO, Curva S = MÉDIO" existe só como sugestão do painel de prontidão e não é ativa até ser gravada (`lib/risk-alerts/pilot-readiness.ts:42-46`) — o documento `docs/weekly-schedule-email-ingestion.md:~405` fala em mapeamento fixo `INGESTION_ALERT_RISK_LEVEL` que **não existe** no código (D5).

### 6.6 Casos especiais

| Caso | Tratamento | Fonte | Situação |
|---|---|---|---|
| **Cláusula ambígua / extração duvidosa** | O detector marca sinalizações (`INICIO_SEM_PONTUACAO`, `TITULO_DA_CLAUSULA_NAO_DETECTADO`, `NUMERACAO_INCONSISTENTE`, `NUMERO_REPETIDO`), reduz a confiança e a lista mostra o selo "conferir" com os motivos; a pessoa aprova/edita/rejeita | `scripts/clause-decimal-detector.mjs:209-239,283-293`; `app/[projectId]/revisao-clausulas/page.tsx:60-72,283-289` | IMPLEMENTADO |
| **Ambiguidade na classificação** | O sistema **não escolhe**: devolve a faixa de níveis possíveis e o que confirmar | `suggest-risk.ts:16-17,174-219` | IMPLEMENTADO |
| **Ambiguidade jurídica na leitura por IA** | Consultor Jurídico separa fato, interpretação e recomendação; usa linguagem condicional; declara "DECISÃO HUMANA NECESSÁRIA" quando insuficiente | `lib/ai/experts/legal-consultant/identity.ts:56-77` | IMPLEMENTADO; DEPENDE DE CONFIGURAÇÃO (provedor real) |
| **OCR parcial** | Marcador `[ACC — CONTEUDO NAO LIDO INTEGRALMENTE …]` no lugar da página; `document_extractions.error_message` = "COBERTURA PARCIAL: N pagina(s) sem leitura integral … Nao tratar como leitura integral do documento."; a versão fica com `requires_human_review = true` | `scripts/process-document-version.mjs:1211-1217,1234-1243,1392` | IMPLEMENTADO. Reconhecem: tela da versão, busca da Timeline, detecção de cláusulas e (por página) a revisão de cláusulas. **Não** avisam: `lib/clause-review.ts` e o card de documentos (D8). Cobertura estruturada própria é só **proposta** (`docs/proposta-cobertura-extracao.md:3`) |
| **Falta de prazo** | A pessoa informa o status do prazo; "desconhecido" entra em "Informações que faltam: Prazo contratual aplicável". Providência sem data final nem prazo individual fica `SEM_DATA_FINAL` ("Preencha a data final da obra …"). Datas de início divergentes (CNO) ⇒ prazo legal **não** calculado | `suggest-risk.ts:178`; `delivery-items.ts:323-325`; `docs/alertas-recorrentes-e-providencias.md:54-57` | IMPLEMENTADO |
| **Divergência contrato × aditivo** | **Não há comparador determinístico** de cláusulas. Existe regra **por IA**: precedência (1) aditivo aprovado, só na parte que altera; (2) contrato assinado; (3) anexos incorporados; (4) edital/RFP; (5) informativos; vigência do aditivo precisa ser confirmada. O confronto de fonte do cliente classifica em COMPATÍVEL / EXIGÊNCIA ADICIONAL / CONFLITO CONTRATUAL / POSSÍVEL MUDANÇA DE ESCOPO / DOCUMENTO CONTRATUAL INCORPORADO / INDETERMINADO | `lib/ai/experts/legal-consultant/identity.ts:79-125,138-148`; `lib/additionals/confrontation/identity.ts:14-45` | Instrução de IA IMPLEMENTADA (DEPENDE DE CONFIGURAÇÃO); comparação determinística **NÃO COBERTA** |
| **Aditivo de valor/prazo (proposta de adicional)** | Gate de fechamento determinístico (pode seguir / com condições / não seguir ainda / informação insuficiente), sempre com revisão humana; **não** é o grau BAIXO–CRÍTICO | `lib/additionals/closing-gate.ts:11-33` | IMPLEMENTADO |

### 6.7 Prazo de ação × política de envio (duas coisas diferentes)

A criticidade afeta duas decisões **independentes**: *quanto tempo* a equipe tem para agir (prazo de ação, SLA interno) e *como e quando* o alerta chega às pessoas (política de envio). A repetição de lembretes é uma terceira escala, também separada (6.7.3).

#### 6.7.1 Tabela 1 — Prazo de ação por criticidade

Matriz padrão no **código** (`lib/sla/default-matrix.ts:17-70`; espelho em `docs/sla-escalation.md:20-31`). Não há seed no banco (nenhuma migration insere em `sla_matrix_rules`). Cada projeto pode sobrescrever (ADMINISTRADOR, em `/{obra}/acoes/configuracao`; `app/[projectId]/acoes/actions.ts:326-331`). Precedência: regra da **área** do projeto > regra geral do projeto > padrão do código (`lib/sla/resolve-matrix-rule.ts:197-210`).

| Risco | Prazo para **assumir** | Intervalo adicional até **Nível 2** (gerência) | Intervalo adicional até **Nível 3** (Diretoria) | Unidade | Pede confirmação de ciência | Pede justificativa de atraso |
|---|---|---|---|---|---|---|
| **CRÍTICO** | **1** | +1 | +2 | **horas corridas** | sim | sim |
| **ALTO** | **4** | +4 | +4 | **horas úteis** | sim | sim |
| **MÉDIO** | **1** | +1 | +1 | **dias úteis** | não | sim |
| **BAIXO** | **3** | +3 | +2 | **dias úteis** | não | sim |

Os prazos de *responder* e *concluir* são **nulos** no padrão ("nunca inventados"). Os números "Nível 2" e "Nível 3" são **intervalos acumulados** em cadeia, não horários absolutos desde o início (capítulo 7.3). Situação: IMPLEMENTADO; valores por obra DEPENDEM DE CONFIGURAÇÃO; o ensaio isolado usou a matriz CRÍTICO equivalente ao padrão (`docs/teste-controlado-alertas-criticos.md:40`).

> **Confirmação do pedido.** CRÍTICO 1 h corrida, ALTO 4 h úteis, MÉDIO 1 dia útil e BAIXO 3 dias úteis **conferem** com o código para o prazo de *assumir*. Ressalvas: (a) feriados não são considerados (cap. 7.4); (b) para MÉDIO e BAIXO não há escalonamento por prazo no ciclo automático — o prazo só vale em ações SLA manuais e aparece como "Prazo para assumir" no consolidado semanal (D5 do cap. 7).

#### 6.7.2 Tabela 2 — Política de envio

A regra esperada ("ALTO e CRÍTICO imediatos; MÉDIO e BAIXO consolidados em lotes semanais automáticos") está **implementada apenas na trilha B**. Nas outras trilhas há diferenças.

| Trilha | CRÍTICO / ALTO | MÉDIO / BAIXO | Confirma a regra esperada? | Condições (DEPENDE DE CONFIGURAÇÃO) |
|---|---|---|---|---|
| **B — Casos de risco do módulo semanal** | **Imediato** ao surgir, subir ou alterar: cria a ação SLA, envia ao Nível 1 e escalona. "Imediato" = **próximo ciclo horário** (`20 * * * *`, `.github/workflows/weekly-schedule-email-ingestion.yml:32`) | **Nunca individual**: um consolidado por destinatário (Nível 1 da área), **quarta-feira a partir das 07:00** no fuso do projeto (`lib/risk-alerts/types.ts:4-5`, `digest-window.ts:1-9`) | **SIM** (fontes: `plan-risk-alerts.ts:12-14,49,193-194`; `components/sla/pilot-risk-alerts-panel.tsx:41-42`) | `ACC_WEEKLY_REPORTS_ENABLED="true"` (`lib/feature-flags/weekly-reports.ts:22-24`), `risk_alerts_enabled` do projeto, allowlist de destinatários, mapa de severidade, matriz explícita nos 4 níveis (`pilot-readiness.ts:76-90`), `ACC_RISK_ALERTS_CRON_SECRET` |
| **A — Eventos do Ledger** | **Não há envio automático imediato.** O envio é **manual**, a qualquer grau, por ADMINISTRADOR (`send-alert-actions.ts:27-33`; `send-contract-alert-email.ts:87-91`). Depois do envio, entram a repetição 1/2/4/7 dias e a cobrança | **Lote semanal automático** de ações SLA `LOW`/`MEDIUM` ligadas a evento: quarta, 10:10 UTC = 07:10 em São Paulo (`.github/workflows/contract-alert-batches.yml:5`; também chamado pelo cron Vercel `0 10 * * 3`, `vercel.json`); um e-mail por obra e destinatário (`lib/alerts/batch-grouping.ts:1-4`) | **PARCIAL — DIVERGÊNCIA D2 (alta)**: o lote escolhe por `sla_actions.risk_level` (`run-contract-alert-batches.ts:73`), mas exibe o grau revisado ou da IA (`:207`), e a revisão **não altera** `sla_actions`. Um evento revisado para ALTO/CRÍTICO **que ainda não entrou em lote** pode sair no lote de quarta (provado por execução em banco de teste, ver 6.7.4) | `CRON_SECRET`, `ACC_APP_BASE_URL`, modo de envio (`ACC_OUTBOUND_MODE`, `ACC_PILOT_RECIPIENT`) |
| **C — Providências** | Alerta quando a janela abre (D-60 ou prazo individual), com repetição por grau | idem (o grau decide só o intervalo) | Não se aplica (regra própria) | datas da obra / prazo individual (`delivery-items.ts:323-352`) |
| Ações SLA manuais **sem evento** | — | Resumo semanal próprio, semana de segunda a domingo (`lib/email/run-weekly-alert-digests.ts:20-34,57-66`) | Não se aplica | `/api/cron/weekly-alert-digest` |

**Para o manual:** não afirmar "ALTO/CRÍTICO são sempre enviados imediatamente e automaticamente". Afirmar: *"No módulo de riscos semanais, ALTO e CRÍTICO são enviados no próximo ciclo horário; MÉDIO e BAIXO, no consolidado de quarta. Nos eventos do Ledger, o envio é manual."*

#### 6.7.3 Repetição de lembretes (terceira escala, independente)

CRÍTICO 1 dia, ALTO 2, MÉDIO 4, BAIXO 7 — dias corridos (24/48/96/168 h) até a conclusão (`lib/alerts/repeat-policy.ts:10-22`). O primeiro lembrete = envio + intervalo, ancorado na grade; uma execução atrasada manda **um** lembrete, sem acumular (`lib/alerts/followup-engine.ts:1-25`). Rotina a cada 30 min (`.github/workflows/alert-reminders.yml:11`), mas o GitHub Actions não garante pontualidade (observado 2 a 5 h: `docs/alertas-recorrentes-e-providencias.md:35-41`). IMPLEMENTADO; **sem ensaio real** de ALTO, MÉDIO ou BAIXO nos documentos.

#### 6.7.4 O que acontece quando um evento é reclassificado como ALTO (verificado em banco de teste)

Verificado em 04/11/2026 com as migrations reais em PGlite (a seleção do produtor foi **emulada em SQL**; o código TypeScript do produtor não foi executado contra banco). Separando alertas contratuais de eventos do Ledger:

| Situação | Resultado | Situação da prova |
|---|---|---|
| **Alerta contratual de evento ALTO/CRÍTICO** | Só é enviado **manualmente**, por ADMINISTRADOR (`sendContractAlertEmailAction`), sem filtro por severidade. Não há envio automático desses eventos: o lote automático **exclui** `HIGH/CRITICAL` e o ciclo `/api/cron/risk-alerts` trata casos do cronograma semanal, não eventos do Ledger | Por leitura |
| **Lote automático (quarta)** | Seleciona `sla_actions` `LOW`/`MEDIUM` com responsável, `related_event_id` e status aberto; exclui eventos já em lote PENDING/SENT/RESPONDED; agrupa por obra e responsável. A seleção usa o `risk_level` da ação SLA, **não** a severidade do evento | Por leitura |
| **Evento ainda sem lote, reclassificado para ALTO** | A ação SLA continua `LOW`; o evento **continua elegível** e sairia no lote semanal com a severidade ALTA no e-mail. Ou seja, um evento ALTO pode ir no lote automático | **Por execução** |
| **Evento já em lote, reclassificado para ALTO** | O evento continua bloqueado e **não é reenviado**; o item do lote **mantém a severidade antiga** (MÉDIO); o lote segue SENT; `sla_actions.risk_level` não muda; o acompanhamento recorrente passa a ALTA/48 h, com `next_reminder_at` inalterado | **Por execução** |
| Testes existentes (7: produtor, lote, envio, concorrência, SQL de risco, cenário e parcial do lote) | Todos passam, mas **nenhum cobria** a reclassificação para ALTO seguida do produtor; o teste do produtor lê o texto do código | Por execução |

**Consequência para o texto do manual:** não afirmar "ALTO e CRÍTICO são sempre enviados imediatamente". Para o Ledger, dizer "o envio é manual; reclassificar um evento para ALTO não o retira nem o acelera no lote semanal". Isto é uma **divergência de regra operacional registrada para decisão**; nenhuma regra foi alterada nesta etapa.

### 6.8 O que foi validado

| Item | Validação | Fonte |
|---|---|---|
| Sugestão determinística e critérios | Testes automatizados | `scripts/test-risk-classification.mjs` |
| Revisão com histórico imutável | Teste SQL em PGlite com stub de permissão (ver D1) | `scripts/test-risk-classification-sql.mjs` |
| Regras de envio (BAIXO/MÉDIO não imediatos; ALTO/CRÍTICO imediatos; consolidado quarta ≥ 07:00 SP) | Testes de script | `scripts/test-pilot-risk-alerts.mjs` (testes 9–14) |
| CRÍTICO imediato + lembrete + escalonamento com e-mails reais | **Ambiente isolado** descartável, 5 e-mails à caixa de teste | `docs/teste-controlado-alertas-criticos.md` |
| Ensaio de preparação | **Não executado** | `docs/ensaio-alertas-criticos-preparacao.md:1-3` |
| Piloto por projeto | "Implementado e testado sem envio real"; o documento diz `ACC_PROJECT_PILOT_*` ausentes em 2026-11-04, mas a Vercel lista essas variáveis em produção (ver Anexo E) | `docs/piloto-projeto-email.md:3,31,199-200` |

### 6.9 Divergências do capítulo 6 (para revisão)

D1 permissão de revisão (alta) · D2 lote semanal × grau efetivo (alta) · D3 textos ⓘ dos níveis (média) · D4 `classificacao-de-risco.md` se contradiz (média) · D5 `INGESTION_ALERT_RISK_LEVEL` só no doc (média) · D6 "defaults" × prontidão do piloto (média) · D7 enum cru na tela do alerta (baixa) · D8 `proposta-cobertura-extracao.md` desatualizado (baixa) · D9 cron fixo em UTC (baixa) · D10 nomes iguais na triagem de e-mail (baixa) · D11 migrations não aplicadas (informativa) · D12 "imediato" = próximo ciclo (informativa). Detalhes no Anexo A.

---

## 7. ESCALONAMENTO DE ALERTAS

### 7.1 Dois mecanismos distintos

| Mecanismo | O que é | Escalona por hierarquia? | Fonte |
|---|---|---|---|
| **A. Alertas de risco + ações SLA** | Nível 1 → Nível 2 (gerência) → Nível 3 (Diretoria) → limite, pelos prazos da Matriz | **Sim** | `lib/risk-alerts/plan-risk-alerts.ts`, `lib/sla/compute-escalation.ts` |
| **B. Acompanhamento recorrente** | Lembretes "Repete: a cada N dia(s)" ao responsável atual, em 24/48/96/168 h corridas | **Não** (sem hierarquia) | `lib/alerts/repeat-policy.ts:10-22`, `followup-engine.ts:1-20` |

A matriz CRÍTICO 1 h / ALTO 4 h úteis / MÉDIO 1 dia útil / BAIXO 3 dias úteis pertence ao mecanismo A. Os intervalos do B (1/2/4/7 dias) são outra tabela e **não** são a matriz de SLA (D15).

### 7.2 Linha do tempo do alerta (mecanismo A)

1. **Identificação do responsável (Nível 1).** Vem da Matriz de responsabilidades por (projeto, área), tabela `sla_area_responsibles`: Nível 1 = responsável direto (+ corresponsável); Nível 2 = Gerência (`escalation_1_user_id`); Nível 3 = Diretoria (`board_user_id`) (`lib/sla/resolve-matrix-policy.ts:13-18`; `docs/weekly-schedule-email-ingestion.md:63-71`). A área vem da fonte: aba Financeiro → FINANCEIRO; SSMA → ESG_SSMA; demais abas e comparações de cronograma → PLANEJAMENTO (`lib/risk-alerts/collect-risk-cases.ts:94-100`). IMPLEMENTADO; DEPENDE DE CONFIGURAÇÃO (Matriz preenchida).
2. **Início da contagem (T0).** O alerta só é gerado para ALTO/CRÍTICO quando o caso é novo, reaberto, subiu de grau ou mudou (`plan-risk-alerts.ts:194`). **T0 = o instante do ciclo do worker que detectou o caso**, não a data do e-mail ou relatório de origem (`plan-risk-alerts.ts:196`; `lib/sla/compute-deadlines.ts:87-105`). A ação SLA nasce com os prazos calculados uma única vez; mudar a matriz depois **não recalcula** (`app/[projectId]/acoes/actions.ts:300-305`).
3. **Primeiro aviso.** Vai ao Nível 1 e ao corresponsável, sem duplicar (`plan-risk-alerts.ts:134-136`).
4. **Cobrança por prazo.** Motor `computeEscalation` (aritmética de datas, sem IA): enquanto a ação **não foi assumida**, o marco é o prazo de assumir; se assumida e houver prazo de concluir (ou responder), é ele; sem nenhum, **não há marco** (`compute-escalation.ts:209-252`).
   - `agora > marco` → sobe ao **Nível 2**;
   - `agora > marco + intervalo do Nível 2` → sobe ao **Nível 3 (Diretoria)**;
   - `agora > marco + intervalo N2 + intervalo N3` → **limite atingido** (`TOP_LEVEL_REACHED`).
5. **Gatilhos adicionais:** prazo contratual a ≤ 24 h força ao menos o Nível 2; prazo contratual perdido força a Diretoria; sinal de "nova evidência" força ao menos o Nível 2 (`compute-escalation.ts:254-271`). No ciclo horário, a origem automática do prazo contratual nas ações geradas pelo motor de alertas **não foi encontrada**.
6. **Atraso do worker.** Se vários prazos venceram entre dois ciclos, o motor usa o **maior nível já vencido** e o aviso pode ir **direto à Diretoria**, sem passar pelo Nível 2 (`compute-escalation.ts:273-274`; `resolve-escalation-destination.ts:303-323`) — não há teste citado para esse salto (D10).
7. **Nível 2 não cadastrado:** o aviso vai direto ao Nível 3 (`supabase/migrations/20260910120000_skip_missing_sla_level_2.sql`; `resolve-escalation-destination.ts:307-315`). No piloto, "Escalão 1 (Gestor) não definido" (`docs/piloto-projeto-email.md:53`) — o salto N1 → Diretoria é o cenário esperado até cadastrar o Nível 2 (D14).
8. **Aplicação.** A RPC `escalate_sla_action_system` (só `service_role`) grava o nível, o status `ESCALATED`, a linha em `sla_action_escalations` e a auditoria `ACTION_ESCALATED` com ator SYSTEM, com concorrência otimista (`supabase/migrations/20260921090000_pilot_risk_alert_delivery.sql:490-600`).
9. **Só ALTO e CRÍTICO** passam pelo escalonamento por prazo no ciclo horário (`plan-risk-alerts.ts:261`).
10. **Resolução ou último nível.** Ação concluída ou cancelada **nunca escala** (`compute-escalation.ts:189-197`). No último nível: ver 7.2.1.

#### 7.2.1 Ao atingir o último nível (`TOP_LEVEL_REACHED`)

Significa que a Diretoria também deixou o prazo vencer. **Não é um nível, não tem destinatário e não envia e-mail**: registra uma única vez (chave `caso:TOP_LEVEL_REACHED:once`) e aparece na tela como "Limite de escalonamento atingido" (`compute-escalation.ts:119-127`; `lib/risk-alerts/alert-state-machine.ts:204-205,446-488`; `lib/labels.ts:~313`). Só é registrado quando a ação **já está em Diretoria** e não há nova subida pendente — pode ocorrer um ciclo depois do instante calculado (D11). Opcional e desligado por padrão: WhatsApp **simulado** para CRÍTICO que acaba de chegar à Diretoria (`run-risk-alert-cycle.ts:459-463`). Validado em ensaio isolado: "+4 h: limite atingido; sem novo e-mail" (`docs/teste-controlado-alertas-criticos.md:38`).

### 7.3 Quem escalona e quando — respostas que interrompem ou mantêm a cobrança

Estados do caso: Aberto, Ciência registrada, Tomando providências, Encaminhado, Aguardando ação do encaminhado, Devolvido ao responsável anterior, Consulta ao Expert pendente, Expert respondeu, Resolução proposta (revisão humana), Resolvido, Revisão humana necessária, Limite de escalonamento atingido (`lib/risk-alerts/types.ts:305-318`). Ações permitidas por estado: `alert-state-machine.ts:50-63`.

| Resposta do usuário | Efeito na cobrança | Fonte |
|---|---|---|
| **RESOLVIDO** | Exige confirmação, justificativa (se a Matriz exigir) e, em ALTO/CRÍTICO, **evidência**. Com confirmação exigida (padrão ALTO/CRÍTICO) o caso vai a "Resolução proposta (revisão humana)"; só **CONFIRMAR RESOLUÇÃO** o encerra. Não escala; cessa a cobrança | `alert-state-machine.ts:287-310,384` |
| **TOMANDO PROVIDÊNCIAS** (“Em andamento”) | Marca a ação como assumida. Em **ALTO/CRÍTICO escala imediatamente** ao próximo nível, mesmo sem prazo vencido. O alerta continua aberto. BAIXO/MÉDIO não escalam | `alert-state-machine.ts:43,311-319,381-422` |
| **ENVIAR P/** | Troca o responsável; prazo de assumir do encaminhado pela Matriz; também escala imediatamente (ALTO/CRÍTICO). Sem ação do encaminhado no prazo: devolve ao anterior com e-mail, prazos originais preservados | `alert-state-machine.ts:320-359,490-567` |
| **ESPECIALISTA** | Exige Expert e pergunta; o Expert só recomenda; também escala imediatamente (ALTO/CRÍTICO) | `alert-state-machine.ts:360-369` |
| **OUTRO** | Texto obrigatório; também escala imediatamente (ALTO/CRÍTICO); nada resolve | `alert-state-machine.ts:370-378` |
| **Qualquer ação humana** | Preenche "assumida". Na matriz padrão (sem prazos de responder/concluir) **a subida por tempo para** depois da primeira ação humana; só continua se a Matriz tiver `responder`/`concluir` | `compute-escalation.ts:209-221`; SQL `…pilot_risk_alert_delivery.sql:941-952` |
| **“Recusada”** | **Não existe** como estado de alerta. O mais próximo é a rejeição de recomendação de IA ALTO/CRÍTICO (escala na hora) e o encaminhamento expirado | `20260904120000_rejection_escalation_governance.sql:1-40` |

**Mecanismo B (lembretes):** “EM ANDAMENTO” mantém o acompanhamento e os lembretes; reconfirmar não posterga; ENVIADO P/ troca o responsável sem reiniciar o prazo; RESOLVIDO interrompe os lembretes (`followup-engine.ts:8-16,120-165`; `lib/alerts/repeat-policy.ts:42-52`).

**Quem pode agir:** administrador, responsável atual ou anterior, encaminhado ativo, destinatário do alerta ou responsável da área na Matriz.

**Botão “Verificar escalonamentos”:** varre as ações SLA abertas (qualquer risco) e escala com `escalate_sla_action`, que exige ADMINISTRADOR; usa a mesma outbox e chave, sem duplicar. A tela mostra o botão a qualquer membro e o erro do não-administrador é engolido (“0 escaladas”) (`app/[projectId]/acoes/actions.ts:547-634`; D2).

### 7.4 Calendário, fuso e matriz de referência

- **Fuso:** `America/Sao_Paulo` por padrão, configurável por projeto (`sla_project_settings`); validado como IANA na aplicação (`lib/sla/time-units.ts:22-27`; `actions.ts:740-746`). Cálculo via `Intl`, nunca offset fixo.
- **Expediente:** 08:00–18:00, segunda a sexta, configurável por projeto (`time-units.ts:25-26`; tela “Início do expediente”/“Fim do expediente”).
- **Fim de semana:** sábado e domingo nunca são dias úteis (`time-units.ts:114-117`). Início fora do expediente é empurrado para a próxima janela útil antes de contar (`:147-162`).
- **Horas e dias corridos** ignoram expediente e fuso — CRÍTICO sobe de madrugada, fim de semana e feriado (`:166-172`).
- **Dia útil:** avança N dias de calendário que não sejam sábado/domingo, mantendo o **mesmo horário de parede**; fração vira horas úteis (`:201-227`).
- **Feriados: não implementados.** Não há tabela ou lista; a tela avisa “Feriados ainda não são considerados nesta versão.” (`components/sla/sla-project-settings-form.tsx:57`). ALTO, MÉDIO e BAIXO contam feriados como dias úteis (D12).
- **Consolidado semanal:** quarta-feira a partir das 07:00 no fuso do projeto (`lib/risk-alerts/digest-window.ts:356-369`). Já os agendadores `weekly-alert-digest` e `contract-alert-batches` estão fixos em UTC (07:00/07:10 em São Paulo só enquanto o Brasil estiver em UTC−3 — D9).
- **Matriz de referência (conferência):** CRÍTICO 1 h corrida, ALTO 4 h úteis, MÉDIO 1 dia útil, BAIXO 3 dias úteis **conferem** (`lib/sla/default-matrix.ts:18-69`). Veja a Tabela 1 em 6.7.1.
- **Divergência D3 (grave para operação):** a validação ao salvar na tela exige “Nível 2 > assumir” e “Nível 3 > Nível 2” (`lib/sla/validate-matrix-rule.ts:278-290`), mas o motor trata esses valores como **intervalos** e **nenhum default passaria** na validação (1/1/2, 4/4/4, 1/1/1, 3/3/2). O envio real do piloto exige as 4 regras **salvas explicitamente** (`pilot-readiness.ts:80,111`). Antes de escrever o procedimento do administrador, confirmar o que ele deve digitar.

### 7.5 Vencimento calculado × momento em que a rotina processa e envia

- O ciclo de alertas de risco é `GET /api/cron/risk-alerts`, disparado **de hora em hora** (`20 * * * *`, UTC) pelo GitHub Actions; **não** está em `vercel.json` (`.github/workflows/weekly-schedule-email-ingestion.yml:32`; `app/api/cron/risk-alerts/route.ts:18-23`). DEPENDE DE CONFIGURAÇÃO: `ACC_WEEKLY_REPORTS_ENABLED=true`, `ACC_APP_BASE_URL`, `ACC_RISK_ALERTS_CRON_SECRET`.
- O aviso de Nível 2/3 **nunca sai exatamente no vencimento**: sai no primeiro ciclo cujo `agora` é **estritamente maior** que o vencimento (`compute-escalation.ts:223,236,245`). Atraso típico: até ~1 h mais o atraso do GitHub Actions, que não garante pontualidade (observado 2 a 5 h em outro workflow: `.github/workflows/alert-reminders.yml:3-7`). Para o ciclo de risco **não há medição** documentada.
- O relógio começa no ciclo que detecta o caso, **depois** da ingestão do e-mail/planilha de origem. Na prática, a primeira cobrança de um CRÍTICO “1 hora corrida” sai entre 1 h e ~2 h (ou mais) depois do evento (D9 do levantamento; ver Anexo A).
- A cada ciclo, o envio ainda depende de: recurso ligado, projeto habilitado, prontidão do piloto (pendências deixam a outbox `SUPPRESSED` com o motivo) e provedor Gmail configurado (`plan-risk-alerts.ts:152-173`; `run-risk-alert-cycle.ts:150-171`).
- Execução concorrente: HTTP 409 na mesma instância; entre instâncias, `concurrency` do workflow, chave única e `for update` na RPC (`route.ts:48-50`).

### 7.6 Exemplos numéricos (todos **fictícios**)

Premissas: matriz padrão, Nível 2 e Nível 3 cadastrados, destinatários elegíveis, fuso São Paulo (UTC−3), expediente 08–18 de segunda a sexta, sem feriados, ciclo às :20. Calendário fictício: 10/11/2026 é terça. O instante exato de cada aviso depende dos segundos do ciclo (“agora > prazo” é estrito) e de atraso do agendador; os horários abaixo são os **vencimentos calculados**, e o aviso sai no primeiro ciclo depois deles.

**Exemplo 1 — CRÍTICO sem resposta** (horas corridas; assumir 1 h; +1 h; +2 h)

| Horário (ter 10/11) | Evento | Quem recebe |
|---|---|---|
| 14:20 | Ciclo detecta o risco CRÍTICO; cria a ação SLA; prazo de assumir = 15:20 | Nível 1 e corresponsável |
| 15:20 | Prazo de assumir vence; no primeiro ciclo depois, sobe ao Nível 2 | Gerência (Nível 2) |
| 16:20 | (15:20 + 1 h) vence; no primeiro ciclo depois, sobe ao Nível 3 | Diretoria |
| 18:20 | (16:20 + 2 h) vence; no ciclo seguinte registra “Limite de escalonamento atingido” | **Ninguém** (só registro) |

Se o T0 fosse 22:20, os marcos seriam 23:20, 00:20 e 02:20, sem esperar expediente. Coerente com `docs/ensaio-alertas-criticos-preparacao.md` (T0, T+1 h, T+2 h, T+4 h). Auditoria: `RISK_ALERT_PLANNED`, `RISK_ALERT_EMAIL_SENT`, `ACTION_ESCALATED` (ator SYSTEM) por nível e `RISK_ALERT_TOP_LEVEL_REACHED`.

**Exemplo 2 — ALTO aberto perto do fim do expediente** (horas úteis; assumir 4 h; +4 h; +4 h)

| Horário | Cálculo | Marco |
|---|---|---|
| Qui 12/11 17:20 | Ciclo detecta o ALTO; restam 40 min no dia e faltam 3 h 20 min | continua na sexta às 08:00 |
| Sex 13/11 11:20 | 40 min + 3 h 20 min | **prazo de assumir**; sobe ao Nível 2 no ciclo seguinte |
| Sex 13/11 15:20 | 11:20 + 4 h úteis (cabe no dia) | sobe à **Diretoria** |
| Seg 16/11 09:20 | 15:20 + 4 h úteis: restam 2 h 40 min na sexta; faltam 1 h 20 min na segunda | **limite atingido** (fim de semana não conta) |

Se a detecção fosse às 18:20 ou no sábado, a contagem só começaria na próxima janela útil. Um feriado na sexta **não** seria descontado.

**Exemplo 3 — alerta tratado antes de subir ao gestor** (CRÍTICO, T0 qua 11/11 09:20; prazo de assumir 10:20)

- 09:50 — o responsável aciona **RESOLVIDO** com conclusão, evidência (obrigatória em CRÍTICO) e confirmação. O caso vai a “Resolução proposta (revisão humana)” e a ação passa a “assumida”. Sem escalonamento.
- 10:20, 11:20, 12:20 — ciclos: ação assumida e sem prazos de responder/concluir ⇒ sem marco ⇒ **nenhum aviso ao gestor**.
- Depois de **CONFIRMAR RESOLUÇÃO**: “Resolvido”, ação concluída, que nunca escala.
- **Contraste:** se às 09:50 ele escolhesse TOMANDO PROVIDÊNCIAS, ENVIAR P/, ESPECIALISTA ou OUTRO, o gestor receberia aviso **imediatamente**, mesmo antes de 10:20 (`alert-state-machine.ts:43,381-422`).

### 7.7 Destinatários, registro e falhas

- **Quem recebe:** imediato = Nível 1 + corresponsável; escalonamento = destino do novo nível (Nível 2 ou, se ausente, Nível 3; Diretoria → Nível 3); limite atingido = ninguém; MÉDIO/BAIXO = só o consolidado, por destinatário Nível 1 (`plan-risk-alerts.ts:134-136,215,382-418`; `resolve-escalation-destination.ts:303-323`). O e-mail mostra “Nível atual”, “Nível anterior”, “Responsável (Nível 1)” e “Motivo do escalonamento” (`build-risk-alert-emails.ts:120-123`).
- **Filtros por destinatário (piloto):** allowlist por usuário (vazia ⇒ `PILOT_ALLOWLIST_MISSING`; fora ⇒ `PILOT_RECIPIENT_SUPPRESSED`), membro ativo (`USER_NOT_ACTIVE`), e-mail cadastrado (`EMAIL_MISSING`), domínio corporativo (`EMAIL_NOT_CORPORATE`), e-mail não desligado pela Matriz (`NOTIFY_BY_EMAIL_DISABLED`) (`plan-risk-alerts.ts:46,89-104,217-219`).
- **Auditoria (`audit_log_entries`, ator SYSTEM):** `RISK_ALERT_PLANNED`, `RISK_ALERT_EMAIL_SENT`, `RISK_ALERT_EMAIL_FAILED`, `RISK_ALERT_DEADLINE_EXPIRED`, `RISK_ALERT_TOP_LEVEL_REACHED`, `RISK_ALERT_RECIPIENT_SUPPRESSED`, `RISK_ALERT_CONFIGURATION_REVIEW_REQUIRED`, `RISK_ALERT_NOT_READY_FOR_REAL_SEND`, `RISK_ALERT_DIGEST_RETRY_SENT`, `RISK_ALERT_EXPERT_FAILED`, `RISK_ALERT_ACTION`, e as da ação SLA (`ACTION_ACKNOWLEDGED/STARTED/COMPLETED/OVERDUE/REASSIGNED/ESCALATED`). Edição da matriz: `SLA_MATRIX_RULE_UPDATED` com valor anterior e novo. Além disso: outbox `risk_alert_outbox` (PENDING/SENT/FAILED/SUPPRESSED/SKIPPED, tentativas, erro sanitizado, snapshot da regra), casos, timeline, `sla_action_escalations` (`plan-risk-alerts.ts:189,279,296,341,423`; `run-risk-alert-cycle.ts:251-262,429-468`; `actions.ts:376-396`).
- **Destinatário ausente:**
  - Nível 1 ou Nível 3 ausente ⇒ política bloqueante: **nenhum e-mail** e auditoria `RISK_ALERT_CONFIGURATION_REVIEW_REQUIRED` (`plan-risk-alerts.ts:184-191`).
  - Destino do escalonamento sem usuário ⇒ o nível **sobe**, **não sai e-mail**, fica registrado na auditoria (`:286-347`).
  - Destinatário sem e-mail no momento do envio ⇒ falha registrada: “Destinatário sem e-mail no momento do envio.” (`run-risk-alert-cycle.ts:474-478`).
- **Falha e reprocessamento:** máximo de **3 tentativas** (`lib/risk-alerts/types.ts:44`); falha mantém PENDING até esgotar, depois FAILED; SENT/FAILED/SUPPRESSED/SKIPPED não repetem; reivindicação (claim) de 10 min evita envio duplicado em execuções simultâneas (`supabase-store.ts:509-537`). Chaves únicas: imediato `caso:IMMEDIATE:fingerprint:usuário`; escalonamento `caso:ESCALATION:nível:usuário` (mesma chave do botão manual e da ação humana); consolidado `projeto:DIGEST:janela:usuário`. Mudança de conteúdo gera nova chave e e-mail “ATUALIZADO”. Consolidado com falha é retentado por até 6 dias, depois `DIGEST_WINDOW_EXPIRED` (`plan-risk-alerts.ts:221,307,405`; `run-risk-alert-cycle.ts:509,524-528`).
- **Modo piloto:** `ACC_PROJECT_PILOT_*` envia tudo de `crm@axion.com.br` para `axion@axion.com.br` com `[PILOTO]` e faixa de teste, mantendo o destinatário lógico na auditoria; `ACC_EMAIL_ONLY_RECIPIENT` é trava global opcional. **Segundo a Vercel (leitura em 04/11/2026), `ACC_PROJECT_PILOT_*` existem em produção e `ACC_EMAIL_ONLY_RECIPIENT` não existe** (o documento do piloto diz que ambas estavam ausentes; divergência — Anexo E) (`docs/piloto-projeto-email.md:3-15,31,45`). DEPENDE DE CONFIGURAÇÃO.

### 7.8 O que foi validado

Ensaio isolado, banco descartável, 5 e-mails reais à caixa de teste, relógio simulado: nada antes do prazo; +10 min → Nível 2; +75 min → Diretoria; +4 h → limite sem novo e-mail (`docs/teste-controlado-alertas-criticos.md:1-9,36-40`). Testes: `scripts/test-pilot-risk-alerts.mjs`, `scripts/test-sla-escalation.mjs`. **Nada em produção.** Medição do atraso do ciclo no GitHub: não encontrada.

### 7.9 Divergências do capítulo 7

Resumo (detalhe no Anexo A): `docs/sla-escalation.md` desatualizado quanto a cron e permissão; validação da tela rejeita os padrões; “Até 2º escalão/Diretoria” × “Nível 2/3”; “Em andamento” com três rótulos; subida por tempo cessa após a primeira ação; feriados ausentes; regras por área sem tela; “recusada” inexistente; estado do piloto em produção não comprovado.

---

## 8. USO DOS ESPECIALISTAS

### 8.1 O que existe

Existem **5 especialistas de IA do produto** (“Experts IA”), registrados em `lib/ai/expert-definitions/definitions.ts:301-307`: **CEO IA**, **Diretor Comercial IA**, **Consultor Jurídico IA**, **Diretor de Planejamento IA** e **Diretor de ESG IA**. As skills de `.claude/` do repositório (contratos comerciais, ESG/SSMA, estratégia executiva) são ferramentas de desenvolvimento do Claude Code e **não fazem parte do produto** (`docs/ai/specialist-framework.md:11-18`). A **AXIA não é um especialista** (8.5).

**Regras comuns:**
- Todos são **somente leitura** nas consultas: não gravam, não enviam, não alteram cronograma (`lib/ai/experts/planning-director/query.ts:68-72`).
- **Revisão humana sempre**: `requiresHumanReview` é forçado em todas as respostas e o rascunho fica travado em “pendente de revisão” (`lib/ai/query/validate-expert-query-response.ts:147-151,257`).
- **Provedor:** IA real (Anthropic) ou modo de teste `fake`, escolhido por Expert (`AXION_AI_PROVIDER_*`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, só no servidor — `lib/ai/providers/resolve-provider-for-expert.ts:34-62`; `anthropic-config.ts:38-60`). O repositório **não fixa** modelo nem provedor (`apps/web/.env.example` não os contém); **confirmar com o responsável quais Experts rodam com IA real em produção**. A tela indica o provedor; no modo teste exibe “Esta resposta é gerada por um provider determinístico (fake) — não é IA real.” (`components/ai/expert-query-panel.tsx:391-407`).
- **Nenhum documento registra validação com IA real no piloto**; há suítes offline com provedor `fake` (`docs/testes-sem-ia-real.md:3-26`) e um “primeiro teste real” opt-in do Comercial sem relatório (`docs/ai/grounding-and-citation-guardrails.md:12-14`). `docs/estado-e-pendencias.md:30-31`: “A versão em produção não contém nada desta integração.”
- **Projeto selecionado:** vem da rota (`projectId` na URL) e é revalidado no servidor; o servidor falha fechado sem projeto, escopo ou evento (`lib/ai/expert-query-request.ts`). Escopos: `EVENT` (um evento) e `PROJECT` (a obra).
- **Perfis:** qualquer membro ativo da obra (inclusive LEITURA) pode **consultar**; o isolamento é por RLS, pois as ações usam a sessão do usuário (`lib/contract-review.ts:184-206`). Exigem GERENTE/GESTOR/ADMINISTRADOR: curadoria multiagente no evento e avaliação de atraso.
- **Fonte da resposta:** a resposta é estruturada em fatos documentados, contexto interno declarado, base contratual (com documento, cláusula e trecho), base legal, práticas negociais, interpretação, riscos, recomendações, informações faltantes e rascunho. Rótulos de tela: “Interpretação (sugestão, não fato)”, “Fatos documentados”, “Base contratual”, etc. (`expert-query-panel.tsx:276-322`). Regra 12 do projeto: **cumprida** para revisão humana, leitura sem alteração e separação fato/interpretação/recomendação; **parcial** para evidência — `fatosDocumentados` não traz fonte por item; só a base contratual e a lista “Fontes utilizadas” (CONSULTAR IA) apontam fontes consultáveis (D15 do Anexo B).
- **Checagem de fidelidade (grounding)** do rascunho: só quando o provedor é Anthropic **e** há rascunho; existe para Comercial, Jurídico e Planejamento; **não** para ESG nem CEO (`commercial-director/query.ts:138`; `legal-consultant/query.ts:175`; `planning-director/query.ts:213`).

### 8.2 Tabela dos especialistas

| | **Diretor Comercial IA** | **Consultor Jurídico IA** | **Diretor de Planejamento IA** | **Diretor de ESG IA** | **CEO IA** |
|---|---|---|---|---|---|
| **Para que serve** | Negociação e decisões comerciais: proposta, aditivo, medição, pagamento, retenção, reajuste, multa, garantia; rascunha e-mail/carta/minuta (`definitions.ts:41-89`) | Interpreta contrato e aditivos, direitos e obrigações, lacunas, contradições, risco jurídico; rascunha carta/notificação (`:96-162`) | Atraso/aceleração com consequência contratual, impacto em prazo, caminho crítico, nova versão de projeto, não conformidades de compras (`:170-210`) | Obrigações ESG/SSMA **de origem contratual** com consequência econômica/contratual; evidência faltante, multa/paralisação (`:217-251`) | Camada executiva: consolida posições, divergências, riscos, alternativas e decisões humanas; nunca executa nem rascunha (`:261-299`) |
| **Onde é acessado** | Painel no **Evento** `/{obra}/ledger/{evento}`; curadorias; ação ESPECIALISTA do alerta. O hub aponta ao Dashboard, onde **não há painel** (D1) | `/{obra}/juridico`; análise integrada pré-contratual; ESPECIALISTA; CONSULTAR IA | `/{obra}/experts-ia/diretor-engenharia`; ESPECIALISTA; CONSULTAR IA; curadorias; botão “Avaliar risco de atraso” no Evento | `/{obra}/esg` aba “consultar”; ESPECIALISTA; CONSULTAR IA; consulta por registro no PWA SSMA; curadoria pré-contratual | **Sem tela própria** (hub: “interface dedicada ainda não construída”). É o consolidador das curadorias; opção “Multi-Expert (CEO)” do ESPECIALISTA (D4) |
| **Perfis** | Consulta: qualquer membro ativo (RLS). Curadoria no evento: GERENTE/GESTOR/ADMINISTRADOR. Curadoria de adicionais: qualquer usuário autenticado, sem checar perfil | Consulta: membro ativo. Upload de documento: ADMINISTRADOR/GESTOR/GERENTE (`juridico/page.tsx:41`) | Consulta: membro ativo. Avaliação de atraso: ação aceita ADMINISTRADOR/GESTOR/GERENTE, botão só para ADMINISTRADOR (D8) | Membro ativo (RLS) | Via curadoria: GERENTE+ no evento; pré-contratual e adicionais: membro/autenticado |
| **Perguntas típicas** | “Qual a melhor estratégia para negociar este aditivo?” (`expert-query-panel.tsx:336`) | “O que a cláusula X diz sobre multa e como alterá-la?” | “Qual a data final prevista, quantas atividades e quais estão no caminho crítico?” (`diretor-engenharia/page.tsx:39-42`) | “Que obrigações SSMA estão vencidas e que evidência falta?” | Consolidação: “Qual a posição geral sobre este evento?” (só pelas curadorias) |
| **Dados/documentos que consulta** | Evento, evidências, anotações, cláusulas, documentos (metadados), e-mails. Em `PROJECT`: eventos recentes + obrigações ESG, **sem texto contratual** | **Único fluxo principal que lê o texto** de contrato-base, **aditivos**, edital, propostas, especificações: até 5 documentos, 120 000 caracteres, só PDF/DOCX/TXT com texto selecionável (`load-precontract-document-texts.ts:41-66`) | `.mpp` estruturado (atividades, relações), eventos, obrigações. Avaliação formal de prazo é **fail-closed** | `esg_obligations`, submissões e evidências, eventos | Posições dos demais Experts + SLA, eventos, timeline, ESG |
| **O que entrega** | Análise, recomendação, risco, rascunhos | Análise de cláusulas com “Cláusula do contrato × Sugestão”, confiança e “Por que alterar?”; rascunhos | Análise de prazo e impacto; fato determinístico “Cronograma MPP estruturado: N atividades e M relações”; severidade de atraso (botão) | Interpretação e pendências; cálculo de risco ESG é **determinístico antes** da IA (`lib/esg/compute-obligation-risk.ts`) | SITUAÇÃO / FATOS / POSIÇÃO DE CADA EXPERT / DIVERGÊNCIAS / RISCOS / ALTERNATIVAS / RECOMENDAÇÃO / DECISÕES HUMANAS (`definitions.ts:289`) |
| **Limitações** | Nunca inventa margem, desconto ou preço (“NÃO DISPONÍVEL — NECESSÁRIA DEFINIÇÃO HUMANA”) | **Sem base legal oficial** carregada (“Base legal oficial não disponível nesta fase”); **sem OCR**; PDF digitalizado falha; no painel de obra contratada a consulta é recusada (D2) | Não faz Lean/Last Planner/PPC; sem `.mpp` extraído, análise formal é bloqueada; a avaliação de atraso é determinística e **hoje sempre devolve “INCERTA”** (D7) | Não faz ESG corporativo genérico; **sem grounding** em rascunhos (D5); não diagnostica acidentes | Não tem tela; “Multi-Expert” do alerta consulta só o CEO (D4); sem grounding |
| **Revisão humana** | Sempre | Sempre; “DECISÃO HUMANA NECESSÁRIA” quando insuficiente ou crítico | Sempre; avaliação de atraso sempre exige decisão humana hoje | Sempre | Sempre; “decisões humanas necessárias” é seção obrigatória |
| **Grava no ACC?** | Não (consulta) | Não | Consulta: não. **Botão de atraso grava** `event_ai_assessments` + auditoria | Não | Curadoria grava auditoria `AI_MULTI_EXPERT_CURATION_CREATED` |
| **Situação** | IMPLEMENTADO; IA real DEPENDE DE CONFIGURAÇÃO | idem; fluxo pré-contratual testado offline | idem; depende de worker `.mpp` | idem | idem |

### 8.3 Quando usar a AXIA, quando abrir um especialista

| Dúvida | Use |
|---|---|
| “Como faço…?”, “o que significa…?”, “onde fica…?” (uso do sistema) | **AXIA** — responde só com a base curada do tutorial e da ajuda; não lê dados da obra |
| “O que diz o contrato/aditivo sobre…?”, “como alterar esta cláusula?” | **Consultor Jurídico** (em espaço pré-contratual hoje; ver D2) |
| Estratégia comercial, aditivo, medição, pagamento | **Diretor Comercial** (pelo Evento) |
| Prazo, caminho crítico, atraso | **Diretor de Planejamento** |
| Obrigação SSMA/ESG, evidência faltante | **Diretor de ESG** |
| Dúvida sobre um alerta específico | **CONSULTAR IA** (link dos e-mails legados) ou ação **ESPECIALISTA** no alerta formal |
| Assunto que cruza várias áreas | **Curadoria multiagente** (Evento, GERENTE+) ou **análise integrada pré-contratual** |

**Encaminhamento automático:** **não há** entre AXIA e especialistas (`lib/assistant/*` não importa nenhum Expert) nem dinâmico entre especialistas. O que existe é (a) roteamento **determinístico por palavra-chave**, na curadoria, de uma rodada de especialistas seguida da consolidação do CEO (`lib/ai/curation/route-experts.ts:61-132`); (b) na ação ESPECIALISTA, sugestão do Expert pelo tema e pela área, com a pessoa podendo escolher; se não houver confiança, o caso vai a revisão humana, nunca cai em Planejamento por padrão (`lib/risk-alerts/route-alert-expert.ts:1-14,88-123`).

### 8.4 Apenas respondem ou executam ações?

Os Experts **apenas respondem**, com as exceções abaixo, todas gravações de **registro** (não alteram contrato, cronograma, e-mail ou prazo):

| Exceção | O que grava | Quem aciona | Fonte |
|---|---|---|---|
| Avaliar risco de atraso | `event_ai_assessments` + auditoria `SCHEDULE_DELAY_SEVERITY_ASSESSED` | Botão no Evento (ADMINISTRADOR na tela) | `ledger/[eventId]/assess-schedule-delay-actions.ts:23-72`; `apply-schedule-delay-assessment.ts:103-132` |
| Curadoria multiagente | Auditoria `AI_MULTI_EXPERT_CURATION_CREATED` | GERENTE+ | `lib/ai/curation/persist-curation-audit.ts:55-65` |
| ESPECIALISTA no alerta formal | Resposta do Expert na thread do alerta (`EXPERT_ANSWERED`) e e-mail ao solicitante, pelo worker | Usuário que age no caso; a ação **escala imediatamente** (ALTO/CRÍTICO) | `lib/risk-alerts/supabase-store.ts:777-810`; `run-risk-alert-cycle.ts:296-330` |

A resposta do Expert **não resolve** o alerta nem escala sozinha: o estado `EXPERT_ANSWERED` continua exigindo ação humana (`alert-state-machine.ts:58`). O Expert **não cria** ações SLA no código atual (`docs/sla-escalation.md:222-231` descreve a possibilidade; não encontrada no código).

### 8.5 AXIA × especialistas

| Aspecto | AXIA | Especialistas |
|---|---|---|
| Finalidade | Ensinar a usar o ACC | Analisar dados e documentos da obra |
| Motor | Base curada estática; **sem IA generativa** (só aceita modo `fake`; outro valor devolve 503) — `lib/assistant/answer.ts:44-52` | Montagem de contexto + provedor + validação |
| Lê dados da obra? | **Não** | Sim |
| Grava? | Não | Em geral não (8.4) |
| Perfil | Qualquer membro; 20 perguntas/min/usuário | Consulta: qualquer membro |
| Fonte citada | Link de módulo + “Tutorial: slide N” | Base contratual; “Fontes utilizadas” na CONSULTAR IA |
| Encaminha a especialista? | **Não** | Roteamento determinístico em curadoria/alerta |

Estado da AXIA: **Fase 1 — responde somente por texto**; os controles de voz (seletor, "Ouvir resposta", "Parar") ficam **ocultos** com a voz desligada (teste de renderização `scripts/test-assistant-render.mjs`). A voz Elena Vinter via ElevenLabs é **Fase 3**: a integração e o Voice ID estão preservados, desligados (`ELEVENLABS_ENABLED=false`) e sem chamada real. Implementada em branch local, não publicada; voz ElevenLabs testada só com serviço simulado e desligada por padrão (`docs/assistente-acc-piloto.md:3`; `docs/vera-voz-elevenlabs.md`).

### 8.6 Exemplos de consulta (fictícios) e como conferir

| Especialista | Exemplo de pergunta | Como conferir |
|---|---|---|
| Diretor Comercial | No Evento “Pedido de aditivo de escopo”: “Qual estratégia recomenda para negociar este aditivo?” | Ler “Base contratual” (documento, cláusula e trecho) e abrir a cláusula citada; a resposta traz “Rascunho pendente de revisão humana — nada foi enviado.” |
| Consultor Jurídico | Em espaço pré-contratual: “A cláusula de multa por atraso é proporcional?” | Comparar “Cláusula do contrato” com “Sugestão” no painel e abrir o arquivo original; ver o aviso “Análise realizada com conteúdo parcial…” se houve corte; “Por que alterar?” mostra fundamento, risco e base |
| Diretor de Planejamento | “Quais atividades estão no caminho crítico?” | Conferir no cronograma `.mpp` da obra (a resposta informa N atividades e M relações extraídas); sem `.mpp` extraído, o sistema bloqueia e explica |
| Diretor de ESG | “Que evidências faltam para a obrigação de licença ambiental?” | Abrir a obrigação na aba ESG e verificar submissões e evidências listadas |
| CEO IA | Botão “Executar análise multiagente” no Evento | Ler “Experts consultados”, “Divergências entre Experts” e “Decisões humanas necessárias”; o registro fica na Auditoria |
| CONSULTAR IA (alerta) | “Como mitigar este risco?” | Seção “Fontes utilizadas (consultáveis no ACC)” com links a evento, cláusula, evidência ou providência |

### 8.7 Divergências do capítulo 8

Principais (detalhe no Anexo B): D1 hub × Dashboard sem painel · D2 painel jurídico recusado em obra contratada · D3 “consulta via API” inexistente para o CEO · D4 “Multi-Expert (CEO)” consulta só o CEO · D5 ESG sem grounding · D6 cards do Dashboard Visual não usados · D7 avaliação de atraso determinística e sempre “INCERTA” · D8 botão só ADMINISTRADOR × servidor aceita mais perfis · D9 “Planejamento” × “Engenharia” · D10–D11 docs/comentários desatualizados · D12–D13 AXIA com perfis e caminho do CONSULTAR IA incorretos, sem entradas sobre escalonamento, hub, ESPECIALISTA e CEO · D14 consultas sem checagem de perfil nem limite de taxa · D15 evidência por fato · D16 contexto `PROJECT` sem texto contratual.

**Limitações de leitura de aditivos digitalizados (verificado por leitura de código em 04/11/2026):** os Experts leem PDF só pela camada de texto (pdfjs), DOCX por mammoth e TXT em UTF-8; **PDF escaneado sem texto falha** de forma declarada; **JPG, PNG e XLSX não são suportados**; o OCR existe só no worker offline (`scripts/lib/pdf-ocr.mjs`) e o carregador dos Experts relê os arquivos do Storage sem usar essas extrações. Limites por consulta: no máximo 5 documentos contratuais (os mais recentes), só a versão vigente, 120 000 caracteres com truncamento declarado. **SEM PROVA:** um PDF misto (texto de carimbo + páginas escaneadas) pode passar como leitura parcial sem alerta (inferido do código, não executado); a qualidade da extração em aditivos reais da Axion não foi testada.

**OCR e aditivo parcial:** o caminho dos Experts **não usa OCR** (`lib/documents/extraction/extract-document-text.ts:1-12,150`). Um aditivo digitalizado falha na leitura e entra em “Não legíveis”; um aditivo com texto selecionável é lido, mas só se o fluxo carregar documentos contratuais (5 mais recentes, 120 000 caracteres — o contrato-base pode ficar de fora se houver mais de 5 documentos mais novos: D16).

---

## 9. Q&A E TEXTOS DE AJUDA

### 9.1 Perguntas em rascunho (cada resposta vinculada à seção do manual)

> Rascunhos para revisão; respostas curtas, com remissão à seção. Nada aqui foi publicado na base da AXIA.

**P1. Por que este risco foi classificado como CRÍTICO?** *(seções 6.3, 6.4, 6.5)*
Porque, pelos critérios adotados, o descumprimento foi declarado **iminente** (ou o prazo já venceu), há **penalidade prevista em cláusula verificada** e **não há tempo de mitigação**. Abra “Classificação de risco” no evento: a sugestão separa **Fato, Inferência e Recomendação** e lista o que faltou confirmar. Se a classificação veio da IA, ela é provisória; o grau valido é o da revisão humana mais recente, com justificativa e histórico. Se discordar, peça a revisão a um administrador (a tela indica também gestor e gerente, mas em teste só o administrador conseguiu registrar — D1).

**P2. Quando um alerta passa do responsável para o gestor?** *(seções 7.2, 7.3, 7.5)*
Em ALTO e CRÍTICO, quando o prazo de **assumir** da Matriz vence sem a ação ser assumida (CRÍTICO: 1 h corrida; ALTO: 4 h úteis), **ou imediatamente** se o responsável escolher TOMANDO PROVIDÊNCIAS, ENVIAR P/, ESPECIALISTA ou OUTRO. O aviso sai no primeiro ciclo horário **depois** do vencimento, não no minuto exato. Se não houver gestor cadastrado, o aviso vai direto à Diretoria.

**P3. Qual a diferença entre prazo de ação, envio imediato e lote semanal?** *(seção 6.7)*
**Prazo de ação** é quanto tempo a equipe tem para agir (Tabela 1). **Envio imediato** é o aviso que sai no próximo ciclo horário para ALTO/CRÍTICO no módulo de riscos semanais. **Lote semanal** é o consolidado de MÉDIO/BAIXO, às quartas-feiras a partir das 07:00. Nos eventos do Ledger o envio é **manual**. **Repetição** (1/2/4/7 dias) é uma terceira coisa: o lembrete até a conclusão.

**P4. O que acontece se eu responder “Em andamento”?** *(seção 7.3)*
No alerta de risco, “Em andamento” corresponde a **TOMANDO PROVIDÊNCIAS**: a ação é marcada como assumida e, em **ALTO/CRÍTICO, o alerta sobe imediatamente ao próximo nível**, que recebe aviso; o alerta continua aberto. Depois disso, na matriz padrão, a subida por tempo para. Nos lembretes recorrentes de alertas de contrato, “Em andamento” só **mantém** os lembretes. A tela usa nomes diferentes para estados parecidos (“Estudando solução”, “Tomando providências”): ver Anexo A (D6).

**P5. Qual especialista devo usar para esta dúvida?** *(seção 8.3)*
Uso do sistema → AXIA. Contrato/aditivo → Jurídico. Estratégia e valores → Comercial. Prazo → Planejamento. SSMA/ESG → ESG. Dúvida sobre um alerta → CONSULTAR IA ou ESPECIALISTA. Assunto que cruza áreas → curadoria multiagente. Nenhum especialista decide: todos exigem revisão humana.

**P6. O especialista consegue consultar um aditivo com OCR parcial?** *(seção 8.7)*
**Não.** O caminho dos especialistas não usa OCR: aditivos com texto selecionável (PDF/DOCX/TXT) são lidos quando o fluxo carrega documentos contratuais; PDF digitalizado falha e é listado como “não legível”. A leitura por OCR existe só no processamento de documentos, que sinaliza “COBERTURA PARCIAL” (seção 6.6). Confira sempre o arquivo original.

**Perguntas adicionais sugeridas**
- **P7. O alerta de CRÍTICO é enviado automaticamente?** *(6.7.2)* No módulo de riscos semanais, sim, no próximo ciclo horário, se o recurso estiver ligado; nos eventos do Ledger, o envio é manual por administrador.
- **P8. Os prazos contam feriados?** *(7.4)* Não: feriados ainda não são considerados; sábados e domingos não contam para prazos úteis.
- **P9. O que significa “Limite de escalonamento atingido”?** *(7.2.1)* A Diretoria também deixou o prazo vencer; fica registrado, sem novo e-mail e sem nível seguinte.
- **P10. A AXIA responde sobre o meu contrato?** *(8.5)* Não: ela só orienta sobre o uso do ACC.
- **P11. Quem pode alterar o grau de risco?** *(6.4)* A tela indica gestor, gerente e administrador; em teste com as migrations reais só o administrador conseguiu registrar (D1). A produção não foi consultada.
- **P12. A resposta da IA é uma decisão?** *(8.1)* Não. É apoio à decisão e exige revisão humana; a decisão é sempre da equipe.

### 9.2 Inventário de textos de tela (hover, avisos e dicas)

#### 9.2.1 Textos **atuais**

**Riscos** (fontes em `apps/web/`)
| Onde | Texto atual |
|---|---|
| Hover dos selos, `lib/ui/feature-help.ts:379-401` | Baixo: “Impacto limitado; acompanhamento de rotina.” · Médio: “Exige atenção e acompanhamento.” · Alto: “Pode gerar impacto contratual, econômico ou operacional relevante.” · Crítico: “Pode gerar consequência grave e exige atenção prioritária.” |
| Painel de risco, `components/risk/risk-review-panel.tsx` | “Grau de risco atual:” (117) · “Não há um número de dias que separe os níveis: iminência e tempo para mitigação são informados por quem revisa.” (137-139) · “Revisar classificação (gestor, gerente ou administrador)” (144) · “O descumprimento é iminente?” (171) · “Ainda há tempo para mitigação?” (179) · “Sem cláusula verificada vinculada: uma penalidade não pode ser tratada como prevista em contrato.” (197) · “A sugestão não altera o alerta; é apoio à decisão e exige revisão humana.” (228) · “Justificativa (obrigatória)” (251) · “Apenas gestor, gerente ou administrador da obra revisa o grau de risco.” (261) · “Nenhuma revisão registrada — vale a classificação original.” (265-267) |
| Aviso antes de enviar, `components/risk/risk-review-section.tsx:83-101` | “Grau de risco atual: {Nível} (classificação automática, ainda não revisada por pessoa autorizada).” · “Antes de enviar, confirme a classificação na seção “Classificação de risco” desta página.” |
| Achado, `ledger/[eventId]/page.tsx:137` | “Confiança estimada: N% — sugestão sujeita a revisão humana, não substitui decisão da equipe.” |
| Providência, `components/delivery/delivery-admin-controls.tsx:52-53` | “A nova providência começa com grau MÉDIO provisório (nunca crítico por padrão). …” |
| Revisão de cláusulas, `revisao-clausulas/page.tsx:68-69,283-289` | Selo “conferir” com `title` listando motivos: sinalizações do detector, “Página pendente de leitura: N”, “Página com revisão visual: N” |
| Mensagens | “Classificação de risco registrada no histórico.” · “Selecione o grau de risco.” · “Informe a justificativa da classificação.” |

**Alertas e escalonamento**
| Onde | Texto atual |
|---|---|
| Painel do piloto, `components/sla/pilot-risk-alerts-panel.tsx:41-42,55,61,96,106,112` | “Baixo/Médio: consolidado único às quartas-feiras, 07:00 ({fuso})” · “Alto/Crítico: imediato + escalonamento Nível 1 → 2 → 3 pelos prazos da Matriz” · “Allowlist não configurada — nenhum e-mail é enviado (fail-closed).” · “Nenhum alerta registrado.” |
| Configuração, `app/[projectId]/acoes/configuracao/page.tsx:68-71` | “Configuração específica deste projeto — sobrescreve os defaults (BAIXO/MÉDIO/ALTO/CRÍTICO) descritos em docs/sla-escalation.md.” |
| Matriz, `components/sla/sla-matrix-config-form.tsx:170-178` | Hover: “Notificar por e-mail” · “Exige confirmação de recebimento” · “Exige justificativa de atraso”; `aria-label`s “Prazo para assumir — {Risco}”, “Prazo do Nível 2 — {Risco}”, “Prazo do Nível 3 — {Risco}” |
| Validação, `lib/sla/validate-matrix-rule.ts:281,288` | “Ordem de escalonamento incoerente: “Até 2º escalão” precisa ser maior que “Prazo assumir”.” |
| Expediente, `components/sla/sla-project-settings-form.tsx:53-57` | “Horário útil: 08:00–18:00, segunda a sexta ({timezone}).” · “Feriados ainda não são considerados nesta versão.” |
| Tela de ações, `app/[projectId]/acoes/page.tsx:64-65` | “Matriz de criticidade, SLA interno e escalonamento automático — Nível 1 → Nível 2 → Nível 3.” · botão “Verificar escalonamentos” |
| Ajuda `lib/ui/feature-help.ts:441-446,663-668` | “O SLA define os prazos internos para assumir, responder e concluir uma ação, com escalonamento automático quando o prazo não é cumprido.” |
| Alerta, `components/risk-alerts/alert-action-forms.tsx:68-70` | “Risco {HIGH\|CRITICAL}: esta ação provoca escalonamento imediato ao próximo nível hierárquico ({nível}). A ação e o escalonamento são eventos distintos, ambos auditados; o alerta permanece aberto.” |
| Alerta, mesmo arquivo | “Evidência (obrigatória para ALTO/CRÍTICO)” · “Confirmo a resolução (responsável e data ficam registrados).” · “O Expert apenas recomenda: não executa ações nem resolve o alerta; a resposta exige revisão humana e chega na mesma thread.” |
| Tela do alerta, `app/[projectId]/alertas/[caseId]/page.tsx` | “Alerta de risco — {título}” · “Link do e-mail expirado ou inválido — use os botões abaixo normalmente.” · “Limite de escalonamento atingido” (`lib/labels.ts`) |
| Botões de e-mail, `lib/email-actions/types.ts:24-40` | DAR CIÊNCIA — “Confirma que você tomou conhecimento deste alerta.” · ASSUMIR RESPONSABILIDADE — “Assume a responsabilidade por tratar este item.” · DEFINIR PRAZO — “Define ou ajusta o prazo de resposta para este item.” · RESPONDER AO ACC — “Abre o campo para registrar sua resposta diretamente no ACC.” |
| Lembretes, `lib/alerts/repeat-policy.ts:36-52` | “Repete: a cada N dia(s) até a conclusão.” · “Este alerta será repetido a cada N dia(s) até a conclusão.” · “Ao confirmar, este alerta será encerrado e os lembretes futuros serão interrompidos.” |
| Rodapé do e-mail, `lib/risk-alerts/build-risk-alert-emails.ts:146` | “Alerta gerado automaticamente pelo ACC a partir da Matriz de responsabilidades e prazos do projeto — não é uma decisão de IA.…” |

**Especialistas e AXIA**
| Onde | Texto atual |
|---|---|
| Hub, `app/[projectId]/experts-ia/page.tsx:37,78-80` | “Hub central dos Experts oficiais do ACC para este projeto — toda sugestão exige revisão humana. Os acessos já existentes (Diretor Comercial IA no Dashboard, …)” · “Operacional — consulta disponível via API; interface dedicada ainda não construída nesta fase.” |
| Ajuda, `lib/ui/feature-help.ts:112-118` | “A IA analisa e recomenda. Decisões vinculantes permanecem humanas.” |
| Painel, `components/ai/expert-query-panel.tsx:429` | Hover do campo: “Descreva o contexto e a pergunta. O especialista usará os documentos e dados disponíveis neste projeto; a resposta exige revisão humana.” |
| Painel, `:391-407` | “… Toda sugestão exige revisão humana antes de qualquer ação.” · “Esta resposta é gerada por um provider determinístico (fake) — não é IA real. …” |
| Painel, `:145-155,298` | “Análise realizada com conteúdo parcial: parte dos documentos excedeu o limite de contexto. Confirme as cláusulas diretamente nos arquivos originais.” · “Base legal oficial não disponível nesta fase (nenhum corpus normativo versionado no projeto).” |
| Planejamento, `schedule-source-guard.ts:167-171` | “Análise formal de prazo indisponível — cronograma Microsoft Project (.mpp) não localizado entre os documentos ativos do projeto. …” |
| Evento, `run-multi-expert-curation-button.tsx:68-71` | “Roteia este evento aos Experts IA competentes e consolida as posições via CEO IA. Análise de IA sujeita a revisão humana — nenhuma ação é executada automaticamente.” |
| CONSULTAR IA, `alert-consult-panel.tsx:96,116,127` | “A consulta não altera o alerta e não registra nenhuma providência.” · “Resposta de TESTE ({provider}) — nenhuma análise real de IA foi realizada.” · “Fontes utilizadas (consultáveis no ACC)” |
| SSMA, `app/ssma/.../record-consult.tsx:35-45` | “A consulta não altera o registro nem a ação corretiva.” · “Sem conexão: a consulta exige internet.” |
| AXIA, `components/assistant/assistant-widget.tsx:243-358` | “Ajuda com o ACC” · “Fale com a AXIA” (`vera-trigger.tsx:33-34`) · “A leitura em voz ainda não está habilitada neste ambiente. A resposta em texto continua disponível.” |
| Base da AXIA, `lib/assistant/knowledge.ts` | Entradas `criterios-risco`, `cores-repeticao`, `alertas-resposta`, `consultar-ia`, `providencias`, `permissoes`, `vera`. **Não há entradas** sobre escalonamento, Matriz de SLA, hub Experts IA, ação ESPECIALISTA, curadoria ou CEO IA — essas perguntas caem no texto de “não encontrei”. |

#### 9.2.2 **Sugestões de melhoria** (não aplicadas; nada foi alterado no código)

| # | Onde | Problema (ref.) | Sugestão |
|---|---|---|---|
| S1 | Hover dos selos `feature-help.ts:379-401` | Não correspondem aos critérios adotados (D3) | Usar os critérios literais: “Crítico: risco iminente de descumprimento e penalização contratual, com necessidade de ação imediata.” etc. |
| S2 | Configuração da Matriz `configuracao/page.tsx:70-71` | Cita um arquivo interno (`docs/sla-escalation.md`) ao usuário final | Remover a referência ou trocar por “Defaults: veja a Matriz abaixo.” |
| S3 | Validação `validate-matrix-rule.ts:281,288` e cabeçalhos | “Até 2º escalão” × “Nível 2”; semântica “+X após o anterior” invisível (D3/D4) | Padronizar em “Nível 2/Nível 3” e explicar “contado a partir do vencimento do nível anterior”; **corrigir a validação** que rejeita os padrões |
| S4 | Rótulos “Em andamento” / “Tomando providências” / “Estudando solução” (D6) | Três nomes para estados próximos | Uma nomenclatura, e avisar no botão de ALTO/CRÍTICO que **escala na hora** (o aviso já existe no formulário; levar também à tela da ação SLA e ao e-mail) |
| S5 | Tela do alerta `[caseId]/page.tsx:36` | Mostra `HIGH/CRITICAL` cru (D7) | Usar `lib/labels.ts` |
| S6 | Painel de risco `risk-review-panel.tsx:144,261` | Texto promete gestor/gerente (D1) | Alinhar ao que o banco aceita após decidir a regra |
| S7 | Botão “Verificar escalonamentos” | Erro de não-administrador engolido (D2) | Mostrar “Apenas administradores podem escalar manualmente.” ou ocultar o botão |
| S8 | Aviso de feriados `sla-project-settings-form.tsx:57` | Correto, mas pouco visível | Repetir o aviso no texto de ajuda “Prazos por nível de risco” |
| S9 | Hub `experts-ia/page.tsx:22,37,78-80` | Aponta Comercial ao Dashboard sem painel; promete “API” do CEO (D1/D3) | Apontar o Comercial para o Evento; trocar o texto do CEO por “Disponível nas análises multiagente (Evento e análise pré-contratual).” |
| S10 | Painel jurídico de obra contratada | Mostra painel que a ação recusa (D2) | Ocultar o painel ou explicar “Consulta disponível apenas em análise pré-contratual.” |
| S11 | Resposta dos Experts | Fatos sem fonte por item (D15) | Exibir a fonte ao lado de cada fato documentado |
| S12 | Base da AXIA `knowledge.ts:128,200` | Perfis (“três” × cinco) e caminho do CONSULTAR IA (D12/D13) | Corrigir e acrescentar entradas: escalonamento, Matriz de SLA, ESPECIALISTA, hub Experts IA |
| S13 | Fim da seção de risco / e-mail | “Imediato” pode demorar até ~1–2 h ou mais | Informar “enviado no próximo ciclo (até cerca de 1 hora)” |

---

## ANEXO A — Divergências dos capítulos 6 e 7 (para revisão)

**Classificação de riscos (cap. 6)**
- **D1 (alta) — Permissão para revisar o grau.** Tela/documento: gestor, gerente ou administrador. Banco: só ADMINISTRADOR efetivo. Teste PGlite não pega. Mesmo padrão em `project_delivery_items`. A tela do Ledger também cita “EDITOR ou ADMIN” (`ledger/[eventId]/page.tsx:270`), mas exige ADMINISTRADOR (`:53`).
- **D2 (alta) — Lote semanal × grau efetivo.** O lote escolhe por `sla_actions.risk_level` LOW/MEDIUM e exibe o grau revisado/IA; a revisão não altera `sla_actions`. Evento ALTO/CRÍTICO pode sair no lote de quarta.
- **D3 (média) — Hover dos níveis** diferente dos critérios adotados.
- **D4 (média) — `docs/classificacao-de-risco.md`** diz em 71-81 que os 5 Experts recebem os critérios e em 109-110 que “os prompts continuam sem os critérios”.
- **D5 (média) — `INGESTION_ALERT_RISK_LEVEL`** existe só no doc e em um script de teste; o código usa `risk_alert_severity_map`.
- **D6 (média) — “Defaults da matriz”**: doc/tela dizem que vale o padrão; o piloto exige regras explícitas nos 4 níveis.
- **D7 (baixa) — Enum cru** na tela do alerta.
- **D8 (baixa) — `docs/proposta-cobertura-extracao.md:24`** diz que a revisão de cláusulas não reconhece cobertura parcial; a página já avisa por página pendente.
- **D9 (baixa) — Dois agendadores semanais** (ciclo horário com janela por fuso × crons fixos em UTC), e o cron Vercel também chama o lote (sobreposição protegida por claim).
- **D10 (baixa) — Mesmos nomes** (`CRITICA/ALTA/MEDIA/BAIXA`) na prioridade de triagem de e-mail.
- **D11 (informativa) — Migrations não aplicadas em produção** (`docs/classificacao-de-risco.md:3-5`; `docs/estado-e-pendencias.md:18`). Estado do banco remoto **não verificado**.
- **D12 (informativa) — “Imediato” = próximo ciclo** (até ~1 h, mais atraso do GitHub Actions).

**Escalonamento (cap. 7)**
- **E1 — `docs/sla-escalation.md:11,14-15,188-196` desatualizado:** diz que não há cron e que qualquer membro escala; há ciclo horário e escalar exige administrador; descreve 4 níveis, o código usa 3. O comentário antigo está também em `components/sla/sla-process-escalations-button.tsx:9-12`.
- **E2 — Quem pode escalar manualmente:** RPC exige ADMINISTRADOR; botão visível a qualquer membro; erro engolido (`actions.ts:615-619`).
- **E3 — Validação × padrões:** nenhum padrão passa na validação da tela; o piloto exige regras salvas explicitamente. Valores reais do piloto: não encontrados.
- **E4 — Nomenclatura:** “Até 2º escalão/Diretoria” × “Nível 2/3”; a semântica de intervalo não aparece na tela.
- **E5 — MÉDIO/BAIXO:** sem escalonamento por prazo no ciclo; o prazo vale só em ações manuais e no consolidado.
- **E6 — “Em andamento”:** três rótulos; em ALTO/CRÍTICO escala na hora.
- **E7 — Subida por tempo cessa** após a primeira ação humana se a Matriz não tiver prazos de responder/concluir (`docs/weekly-schedule-email-ingestion.md:417` diz só “para quando assumida/concluída”).
- **E8 — “Recusada”** não existe como estado de alerta.
- **E9 — T0 = hora do ciclo**, não do evento de origem; sem SLA de pontualidade do ciclo.
- **E10 — Salto de níveis** (Nível 1 → Diretoria) em atraso do worker, sem teste citado.
- **E11 — `TOP_LEVEL_REACHED`** pode ser registrado um ciclo depois do instante calculado.
- **E12 — Feriados** não considerados.
- **E13 — Regras por área:** o resolvedor e o esquema suportam; a tela só edita a regra geral do projeto.
- **E14 — Nível 2 não definido no piloto** (`docs/piloto-projeto-email.md:53`).
- **E15 — Dois mecanismos** com rótulos parecidos (“Crítica/Alta” × “Crítico/Alto”).
- **E16 — Estado em produção:** perfil de piloto e variáveis de e-mail ausentes em 04/11/2026; o ciclo automático em produção **não está comprovado**.
- **E17 — Identidade do remetente em produção** “inconclusiva” (`docs/piloto-projeto-email.md:33`).

## ANEXO B — Divergências do capítulo 8 (Especialistas)

D1 O hub aponta o Comercial ao Dashboard (`experts-ia/page.tsx:22,37`), onde não há painel (`ledger/[eventId]/page.tsx:288` é o único). · D2 O painel jurídico aparece em obra contratada, mas `legal-query-action.ts:50-56` recusa fora do pré-contratual. · D3 O CEO “via API”: sem rota. · D4 “Multi-Expert (CEO)” do alerta chama só `answerCeoQuery` (`run-risk-alert-cycle.ts:107`). · D5 ESG gera rascunhos sem grounding. · D6 Cards “Experts IA/CEO IA” do Dashboard Visual não são usados por nenhuma página (`components/dashboard-visual/experts-cards.tsx`). · D7 A avaliação de atraso grava como “Diretor de Engenharia IA” mas é determinística, sempre “INCERTA” (`generate-schedule-recoverability-assessment.ts:36-54`), usa `schedule_activities` e não o `.mpp` estruturado, e nunca chega a CRÍTICO por esse caminho. · D8 Botão só ADMINISTRADOR (`ledger/[eventId]/page.tsx:53,139-141`) × ação que aceita ADMINISTRADOR/GESTOR/GERENTE; a mensagem cita só GERENTE/ADMINISTRADOR. · D9 Mesmo Expert com dois nomes: “Planejamento” (tela) × “Engenharia” (prompt, curadoria, gravação). · D10 Docs desatualizados (`docs/ai/anthropic-provider.md`, `docs/ai/expert-capabilities.md`, comentário em `resolve-provider-for-expert.ts:26-33`). · D11 Comentário desatualizado em `planning-director/query.ts:101-105`. · D12 AXIA diz que há três perfis (existem cinco). · D13 AXIA diz que CONSULTAR IA está na tela do alerta; o link vai nos e-mails legados; a base não menciona ESPECIALISTA, hub nem escalonamento. · D14 Consultas de IA real sem checagem de perfil nem limite de taxa (só a AXIA tem 20/min). · D15 Fato sem fonte por item (regra 12 do projeto atendida só em parte). · D16 Contexto `PROJECT` sem texto contratual; os 5 documentos mais recentes podem excluir o contrato-base. · D17 Texto “Em implantação” no hub sem nenhum Expert nesse estado.

## ANEXO C — Itens não encontrados

- Comparação determinística contrato-base × aditivo.
- Feriados no cálculo de prazos.
- Valores reais da matriz, responsáveis e allowlist do projeto piloto (exigiria leitura do banco).
- Estado de aplicação das migrations no banco remoto.
- Medição do atraso do ciclo `risk-alerts` no GitHub Actions.
- Estado “recusada” para alertas de risco.
- Ensaio real (produção) de ALTO, MÉDIO ou BAIXO.
- OCR no caminho dos Experts; base legal oficial; qualquer validação de IA real em produção.
- Criação de ação SLA por Expert no código.
- Tela dedicada `/{obra}/risco` (o painel é embutido no Ledger e nas Providências).

---

## ANEXO D — Divergências por aba (capítulo 4)

#### Anexo — Divergências e itens não encontrados (para revisão)

1. Mensagens citam perfis antigos ("EDITOR ou ADMIN") em `ledger/[eventId]/page.tsx:270` e `event-notes-section.tsx:57`; o servidor exige ADMINISTRADOR.
2. Mensagens de curadoria e avaliação de atraso citam "GERENTE ou ADMINISTRADOR" (`page.tsx:284`, `run-multi-expert-curation-actions.ts:43`, `assess-schedule-delay-actions.ts:36`) mas o código aceita também GESTOR; o botão de atraso só aparece a ADMINISTRADOR.
3. Valor base do contrato fixo (R$ 33.450.000) e "WEG" no Dashboard (`dashboard/page.tsx:487-500,895,1071`).
4. ⓘ do dashboard antigo (`feature-help.ts:144-240`) e componentes `components/dashboard-visual/*`, `components/dashboard/*` sem uso nas páginas atuais.
5. Termo "Ledger" persiste em: título da guia (`ledger/page.tsx:7`), cartão do Dashboard (`dashboard/page.tsx:740`), botões do lote (`lote-alertas/.../page.tsx:36,71`).
6. Envio por e-mail de Solicitações sem verificação de perfil e sem aviso de modo piloto (inferido do código; não testado).
7. Não encontrado: criação de solicitação pelo app; reenvio após falha; ⓘ (FeatureInfo) nas páginas Dashboard, Timeline, EVENTOS, Solicitações (existem no catálogo `feature-help.ts` apenas para o título do menu).
8. Não verificado: páginas `/projetos/novo` e `/projetos/{id}/editar`; política exata de leitura dos candidatos de busca da Timeline; quem pode gravar a resposta do lote; GESTOR/GERENTE conseguirem gravar auditoria da curadoria.
9. Não executado: nenhuma tela foi aberta em navegador nesta análise; tudo vem de leitura de código e migrações.

#### Divergências encontradas nesta parte (para revisão)

| # | Divergência | Evidência |
|---|---|---|
| E1 | Perfis GESTOR e GERENTE veem os controles de Providências, Classificação de risco e Concluir alerta de providência, mas o banco só aceita ADMINISTRADOR nessas funções (mínimo `GESTOR` = nota 2, GERENTE = nota 1). Os textos de tela prometem "gestor, gerente ou administrador". | `lib/delivery/delivery-data.ts:73`; `components/risk/risk-review-section.tsx:39`; `supabase/migrations/20260829200000_project_permission_gerente_compat.sql:87-112`; `20261027130000_project_delivery_items.sql:137,193,229,315`; `20261027150000_delivery_item_respond.sql:49`; `20261028120000_risk_classification_reviews.sql:122` |
| E2 | Na tela de Ações, os botões Assumir, Estudando solução, Concluir e Reatribuir só aparecem para ADMINISTRADOR; ninguém mais pode tratar a ação, mesmo sendo o "responsável". | `app/[projectId]/acoes/page.tsx:40-41,109-112` |
| E3 | O botão "Verificar escalonamentos" é visível a todos, mas só ADMINISTRADOR escala; para os demais nada é informado. | `page.tsx:68`; `actions.ts:615-619`; `20260910120000_skip_missing_sla_level_2.sql:39-40` |
| E4 | A rota `/{obra}/acoes/configuracao` não é ligada por nenhum link; o botão da tela de Ações leva à seção equivalente em Usuários. | `page.tsx:70`; busca de links |
| E5 | `configureSlaProjectSettingsAction` (fuso e expediente) não confere perfil no código (as outras duas actions de configuração conferem); a RLS cobre. | `app/[projectId]/acoes/actions.ts:723-770` x `:334-337,442-444` |
| E6 | Aba "Adicionais" removida da interface; ajudas (`adicionais`, `adicionais-tab-propostas`) e ~800 linhas de componentes seguem no código sem uso; Server Actions seguem expostas. | `app/[projectId]/adicionais/page.tsx:3-21`; `lib/ui/feature-help.ts:87,508` |
| E7 | Erros em inglês do banco (Token expired, Not an active project member, Insufficient permission for this action) chegam ao usuário na tela de Ação de e-mail. | `lib/email-actions/confirm-action.ts:49`; `20260829200000_...sql:435,477,481` |
| E8 | A Visão gerencial não filtra por status "Assumida" nem "Cancelada". | `components/sla/sla-actions-summary.tsx:25` |
| E9 | Tempo de vida do link de e-mail acionável: não encontrado nos arquivos lidos. | `lib/email-actions/issue-tokens.ts` (sem constante) |

#### Pendências de verificação (não encontrado / não reaberto)
- RLS de `projects` para listar espaços PRE_CONTRATUAL em `/juridico`: não verificado.
- Migration `20260920120000` (funções SQL financeiras) citada no código, não reaberta.
- Linhas exatas de trechos de `integracoes/actions.ts` e das RPCs de e-mail foram obtidas por busca de padrão; conferir antes de publicar citações com "~".
- Textos do assistente AXIA sobre Revisão contratual: não encontrados.

#### Resumo de divergências e pontos para decisão (lote 4)

1. ESG/SSMA: UI limita registro/revisão ao Administrador; o banco permite Gerente/Colaborador registrarem (`esg/page.tsx:48-50` × RLS "EDITOR").
2. ESG/SSMA: aba "Minhas pendências" lista toda a obra; selo de risco do Checklist usa valor gravado com 0 evidências, enquanto a Visão gerencial recalcula.
3. Usuários: sem tela para cancelar pré-cadastro (rótulo "Cancelado" existe); novos membros não podem ser Leitura, mas a edição permite.
4. Autorizações: recusa/revogação ainda não interrompem a sincronização de e-mails (decisão pendente em `docs/vera-autorizacao-email-e-voz.md` §2).
5. Auditoria: texto diz "para a Diretoria", acesso é de todo membro; filtros inferidos por regex; sem paginação.
6. Start-up: UI só Administrador; servidor/RLS aceitam nível EDITOR.
7. AXIA: base de conhecimento fala em "três perfis" e omite Leitura e a aba Autorizações dos itens restritos.
9. PWA SSMA: nada validado em aparelho real; "n de 10 concluídos" × 12 definições de checklist.

---

## ANEXO E — Verificações em ambiente de teste (04/11/2026)

Verificações feitas **sem rede, sem e-mail e sem banco remoto**, com as 126 migrations reais carregadas em PGlite. Scripts e saídas ficaram fora do repositório.

| Item | Resultado | Situação da prova |
|---|---|---|
| **D1 — permissão de revisão do grau** | `has_project_permission(obra,'GESTOR')` e a RPC `review_risk_classification`: só ADMINISTRADOR passa; GESTOR, GERENTE, COLABORADOR e LEITURA são negados. O teste existente passa porque o stub de teste concede GESTOR/GERENTE | **Por execução**; produção **sem prova** |
| **D2(a) — alerta contratual de evento ALTO/CRÍTICO** | Envio só manual, por ADMINISTRADOR, sem filtro de severidade; sem envio automático | Por leitura |
| **D2(b) — lote automático** | Seleciona ações SLA `LOW`/`MEDIUM` ligadas a evento; usa `risk_level` da ação SLA | Por leitura |
| **D2(c) — reclassificar para ALTO** | Evento sem lote continua elegível ao lote semanal; evento já em lote não é reenviado e o item mantém a severidade antiga; `sla_actions.risk_level` não muda; lembrete recorrente passa a 48 h | **Por execução** (seleção do produtor emulada em SQL; o TS do produtor não foi executado) |
| Testes existentes de lote e risco (7) | Todos passam; nenhum cobria reclassificação para ALTO seguida do produtor | Por execução |
| **Aditivos digitalizados nos Experts** | Sem OCR; PDF escaneado falha de forma declarada; JPG/PNG/XLSX não suportados; limites de 5 documentos e 120 000 caracteres | Por leitura |
| **Sem prova** | Definição da função de permissão em produção; o produtor TS rodando contra banco; PDF misto passando como leitura parcial sem alerta; qualidade de extração em aditivos reais; migrations aplicadas em produção; tela aberta em navegador autenticado | — |

**Regras operacionais preservadas:** nada foi alterado em permissões, envios, matriz de SLA ou migrations; as divergências estão registradas para decisão.

### E.2 Produção — leitura de configuração e migrations (Vercel e Supabase, somente leitura, 04/11/2026)

| Item | Resultado | Situação da prova |
|---|---|---|
| Deploy ativo em produção | `a83843d` (Merge PR #128), estado READY; é a base do candidato | Lido na Vercel |
| Migrations | 126 locais, 126 aplicadas no projeto Supabase de produção (mesmo `ref` da `NEXT_PUBLIC_SUPABASE_URL` de produção), nenhuma pendente, nenhuma só no remoto; a última é `20261101100000`; o candidato não adiciona migration | Lido (`supabase migration list --linked`) |
| `ACC_OUTBOUND_MODE` | `pilot` em produção | Lido |
| `ACC_PROJECT_PILOT_PROJECT_ID`, `_DESTINATION`, `_SENDER` | **Existem** em produção, criadas em 03/11/2026 13:35 UTC, três minutos antes do último deploy; **valores não lidos**. O documento do piloto dizia que estavam ausentes | Lido (existência) — divergência com o documento |
| `ACC_PILOT_RECIPIENT` | Existe; valor não lido | Lido (existência) |
| `ACC_EMAIL_ONLY_RECIPIENT` | **Não existe** em produção | Lido |
| `ACC_WEEKLY_REPORTS_ENABLED`, `ACC_RISK_ALERTS_CRON_SECRET`, `CRON_SECRET` | Existem, mas são variáveis sensíveis: o valor não é legível, então **não se sabe** se o ciclo automático de riscos está ligado | Sem prova do valor |
| `ELEVENLABS_*` | **Nenhuma** variável em produção ⇒ voz desligada (o código exige `ELEVENLABS_ENABLED="true"`) | Lido |
| `AXION_AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS` | Existem em produção; os valores de provedor e chave são sensíveis e não foram lidos | Lido (existência) |
