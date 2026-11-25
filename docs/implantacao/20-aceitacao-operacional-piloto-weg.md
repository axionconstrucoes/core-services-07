# 20 - Teste de aceitação operacional com usuários reais (piloto WEG)

Status: roteiro PRONTO PARA EXECUÇÃO POR PESSOAS na janela de publicação. Nenhum passo deste documento foi executado por IA; nenhum banco remoto, e-mail ou ambiente foi tocado na sua preparação. Este documento não autoriza nada: quem autoriza é o Dono (doc `06`).

Fontes (todas no repositório): matriz de permissões `docs/permissoes-matriz-central.md` e `apps/web/lib/permissions/project-tier.ts` / `nav-access.ts`; menu `apps/web/lib/ui/nav-items.ts`; manual `docs/manual/manual-usuario-acc.md` (seções 1.3, 9, 10); trava de módulos `docs/implantacao/trava-modulos/README.md`; e-mail `docs/implantacao/04-requisitos-email.md`, `docs/email-respostas-lote3.md`, `docs/piloto-weg-e2e-ciclo-por-email.md`, `docs/teste-controlado-alertas-criticos.md`, `apps/web/lib/email/pilot-outbound-guard.ts`, `project-pilot-profile.ts`; SLA `docs/sla-medio-baixo-aprovados.md`, `docs/sla-regras-duplicadas-weg.md`, `apps/web/lib/sla/default-matrix.ts`; auditoria `supabase/migrations/20260819195713_audit_foundation.sql` e `apps/web/app/[projectId]/auditoria/page.tsx`; AXIA `docs/axia-conversa-natural.md`; roteiro de perfis `docs/homologacao-roteiro-perfis-segunda-23-11.md`; papéis `docs/implantacao/05` e `06`.

Consistência (rotas existentes, perfis, flags, apêndice das 66 rotas): `node scripts/test-aceitacao-roteiro.mjs`.

## 1. Regras gerais

1. **Quem executa são pessoas**, cada uma com o PRÓPRIO login Google corporativo. Ninguém digita senha de outra pessoa, ninguém compartilha sessão, nenhuma IA autentica em nome de alguém.
2. **Dados 100% sintéticos.** Tudo o que for criado leva o prefixo `[ACEITE]` no título. NUNCA usar nome, e-mail, documento, contrato ou foto reais de terceiros (cliente, fornecedor, empregado) em registro, anexo ou print. Anexos de teste: arquivos gerados para o teste (ex.: imagem em branco com texto "ACEITE").
3. **Todas as escritas acontecem SOMENTE na obra de teste `TESTE`** (item P-02). Na obra WEG real só se faz LEITURA (itens F.01 e B.01 explicitam). Se qualquer passo de escrita for aberto por engano na obra WEG: parar e avisar o Dono.
4. **Nada de e-mail para terceiros.** Ver a seção 4 (bloco G) antes de qualquer passo que envie ou responda e-mail.
5. **Evidência:** print com a URL, o perfil/conta (sem senha) e o horário (America/Sao_Paulo, com segundos) visíveis. Salvar FORA do repositório, em pasta de acesso restrito, nome `<item>-<APROVADO|REPROVADO|BLOQUEADO>-<aaaammdd-hhmmss>`. Não versionar. **Cobrir (tarja) todo token:** URLs `/email-actions/<token>`, o trecho depois de `alerta-` no Reply-To e qualquer cabeçalho de autenticação são sensíveis. Preservar originais (CLAUDE.md itens 9, 10).
6. **Resultado por item:** APROVADO, REPROVADO (com severidade), BLOQUEADO (pré-condição não satisfeita; explicar) ou N/A (justificar). Item sem evidência = não executado.
7. **Severidade:** P0 = segurança/isolamento (dado de outra obra visível, escrita não autorizada aceita, e-mail a quem não é da caixa de teste, auditoria sem linha ou editável, segredo exposto); P1 = função principal do bloco não funciona ou erro cru/500/tela em branco; P2 = texto, layout, lacuna já documentada, observação.
8. **Fonte da verdade de permissão:** o banco (RLS e RPCs). A tela pode esconder ou mostrar, mas a recusa do banco é que vale (`docs/permissoes-matriz-central.md`, topo). Onde a matriz do repositório NÃO documenta o perfil, o item diz "NÃO DOCUMENTADO" e o resultado é OBSERVADO (registrar o que ocorreu), exceto a regra fixa: **LEITURA nunca grava** (qualquer gravação aceita para LEITURA = P0).

## 2. Papéis (doc `05` e `06`) e blocos

Papéis do doc `06`: Dono = diretoria AXION; Eng = responsável técnico do ACC (aqui "Eng. TI"; acumula a TI de DNS/Workspace do doc `06` apenas para ler configuração); SSMA/Qual = coordenação da área (aqui desmembrada em SSMA e Qualidade); Jur = jurídico. **Planejamento** e **Auditor** não constam como papel nos docs `05`/`06`: são definidos aqui (Planejamento = responsável pelo cronograma da obra; Auditor = pessoa indicada pelo Dono, sem papel executor no bloco que audita).

| Bloco | Tema | Executa | Apoio | Duração estimada* |
|---|---|---|---|---|
| A | Login e sessão | Qualquer conta de teste (cada uma o seu) | Eng. TI | 30 min |
| B | Permissões por perfil e isolamento entre obras | Eng. TI (conduz), uma pessoa por conta | Dono (vínculos) | 90 min |
| C | Planejamento | Planejamento | Eng. TI | 40 min |
| D | Jurídico | Jurídico | Auditor | 50 min |
| E | SSMA | SSMA | Eng. TI (flags) | 60 min |
| F | Alertas, SLA, escalonamento | Eng. TI + Planejamento | Dono | 90 min + espera de até 2 h do escalonamento (em paralelo aos demais) |
| G | Resposta por e-mail | Eng. TI + um membro de cada papel | Dono (autoriza flags) | 90 min |
| H | Auditoria | Auditor | Eng. TI | 45 min |
| I | Módulos bloqueados | Qualidade (+ Jurídico para Seguros) | Eng. TI | 40 min |
| J | AXIA e ajuda (i) | Qualquer perfil; Qualidade e Jurídico para as perguntas de especialista | - | 30 min |
| K | TopBar e identificação da obra | Qualquer perfil | - | 20 min |

*Estimativas de planejamento, não medidas. Com execução em paralelo por papel, previsão de 5 a 6 horas corridas na janela, mais o tempo de preparação (seção 3).

Ordem sugerida: P (pré-requisitos) -> A -> B -> (C, D, E, I, J, K em paralelo) -> F e G (F começa cedo, pois o escalonamento tem espera) -> H por último (audita o que os demais fizeram) -> fechamento (seção 8).

## 3. Pré-requisitos (todos obrigatórios; a falta de qualquer um = NO-GO de início, nada é executado)

| ID | Pré-requisito | Responsável | Como comprovar |
|---|---|---|---|
| P-01 | Autorização escrita do Dono para a janela de aceitação, com a lista de caixas de teste autorizadas e das flags que podem estar ligadas (seção 4.2) | Dono | Registro da autorização (ata/e-mail interno) |
| P-02 | Obra `TESTE` (e `TESTE-2`, sem vínculo com as contas de TESTE) existe, marcada formalmente como obra de teste e EXCLUÍDA de envio real (doc `06`, B6/B7); sem destinatário real cadastrado | Dono + Eng. TI | Print do cadastro (`/projetos` e Editar projeto) |
| P-03 | Contas de teste, UMA POR PERFIL, vinculadas à obra TESTE: ADMINISTRADOR, GESTOR, GERENTE, COLABORADOR, LEITURA; mais (a) conta SEM VÍNCULO nenhum e (b) conta de OUTRA OBRA (membro só de TESTE-2). Cada conta pertence a uma pessoa real presente | Dono (vínculos) + Eng. TI | `/[projectId]/usuarios` (ADMINISTRADOR) mostrando perfil e situação ACTIVE de cada conta; e-mails dos testadores NÃO vão em prints públicos |
| P-04 | Caixas de teste autorizadas: a caixa institucional `crm@axion.com.br` (única caixa admitida pela trava, ver 4.1) e, para G, as caixas dos testadores listadas no P-01. Nenhuma outra | Dono | Lista no P-01 |
| P-05 | Modo de envio conferido por Eng. TI SEM exibir valores: `ACC_OUTBOUND_MODE` NÃO é `production` (só o valor exato `production` abre envio real; ausente, `pilot` ou outro = piloto) | Eng. TI | Declaração "piloto ativo", print do painel com valores cobertos |
| P-06 | Estado das flags da seção 4.2 conferido (nomes e liga/desliga, sem valores sensíveis) e anotado no registro | Eng. TI | Tabela 4.2 preenchida |
| P-07 | Trava de módulos (35 RPCs) aplicada no ambiente da janela, conforme doc `12`/`trava-modulos`: conferência 1 = 35 travadas e 0 executáveis (somente leitura, feita por Eng. TI com autorização) | Eng. TI | Saída da conferência (sem credenciais) |
| P-08 | Matriz de SLA da obra TESTE configurada IGUAL à da WEG (F.02), por ADMINISTRADOR, para que os alertas da TESTE provem os prazos da WEG | Eng. TI + Dono | Tela `/[projectId]/acoes/configuracao` da TESTE e linha de auditoria (H) |
| P-09 | Decisão do Dono sobre a migration `20261121177000` (SLA MÉDIO 2 / BAIXO 5 dias úteis, doc `05` B4) REGISTRADA antes da janela: este roteiro assume que NÃO foi aplicada na WEG (MÉDIO 1 d.u. / BAIXO 3 d.u.) | Dono | Registro da decisão |
| P-10 | Ambiente sincronizado: versão do app em produção = a ensaiada (commit e hash anotados); ninguém deve alterar o ambiente durante a aceitação | Eng. TI | Anotação |
| P-11 | Pasta de evidências FORA do repositório criada, com acesso restrito | Eng. TI | Anotação |
| P-12 | Navegador: janelas anônimas/perfis separados para cada testador (não derrubar a sessão de outro) | Todos | - |

## 4. Bloco G: como testar resposta por e-mail SEM disparar mensagens a terceiros

Esta seção vem antes do bloco porque define as travas que valem para os blocos D, E e F também (qualquer item que gere e-mail).

### 4.1 Como a trava de piloto funciona (conforme o código; nada aqui foi inventado)

- `apps/web/lib/email/pilot-outbound-guard.ts`: `ACC_OUTBOUND_MODE` só libera destinatários originais com o valor EXATO `production`; qualquer outra coisa mantém o piloto (fail-closed). Em piloto, a allowlist efetiva é UMA caixa: `crm@axion.com.br` (constante `ACC_EXPECTED_PILOT_RECIPIENT`; `resolvePilotAllowedRecipients()` devolve só ela). Mensagem destinada a qualquer outra pessoa é REDIRECIONADA para essa caixa, com o assunto prefixado por `[TESTE CONTROLADO] `. `ACC_PILOT_RECIPIENT` ausente ou diferente BLOQUEIA o envio.
- Reply-To: só é preservado o endereço opaco da caixa inbound oficial do ACC (`<caixa-acc>+alerta-<token>@<domínio>`), nunca um endereço de pessoa.
- Perfil de piloto por projeto (`project-pilot-profile.ts`): vale SOMENTE para a obra WEG (id fixo no código) e entrega ao próprio colaborador com Cc obrigatório a `crm@axion.com.br`, restrito a 3 participantes fixos no código. **Por isso o bloco G é feito na obra TESTE, nunca na WEG**: na TESTE o destino efetivo é só `crm@axion.com.br`.
- Seguros: envio real exige a flag `ACC_INSURANCE_REAL_SEND_ENABLED` E aprovação humana; minutas permanecem DRAFT. Reemissão de alertas: `ACC_RISK_ALERT_REISSUE_SEND_ENABLED`.

### 4.2 Flags e variáveis (somente nomes; valores NUNCA em documento, print ou chat)

| Nome | Estado exigido para a aceitação | Efeito se diferente |
|---|---|---|
| `ACC_OUTBOUND_MODE` | diferente de `production` | `production` = envio real a destinatários originais: **NO-GO imediato (P0)** |
| `ACC_RISK_ALERT_REISSUE_SEND_ENABLED` | desligada | Ligada = reemissão envia de verdade; só com autorização expressa |
| `ACC_INSURANCE_REAL_SEND_ENABLED` | desligada | Ligada = possível envio a seguradora: P0 |
| `ACC_EMAIL_REPLY_CONFIRMATIONS_ENABLED` | ligada (valor exato `true`) SOMENTE se o Dono autorizar no P-01 | Desligada: a resposta é processada mas a confirmação ao remetente NÃO sai; os itens G.10 ficam BLOQUEADOS (conferir pelo estado na tela e pela auditoria) |
| `ACC_EMAIL_SPECIALIST_ENABLED` | ligada só para G.11 e se autorizado | Desligada: ESPECIALISTA por e-mail é recusado com explicação e nada é gravado (esse é o comportamento a verificar) |
| `ACC_EMAIL_TOKEN_OWNER_STRICT` | conforme decisão do Dono (padrão desligada) | Registrar o estado; o resultado de G.08/G.09 depende dele |
| `ACC_EMAIL_WORKSPACE_TENANT_DOMAINS`, `ACC_EMAIL_TRUSTED_AUTHSERV_IDS` | conforme decisão do Dono após SPF/DKIM/DMARC | Sem SPF/DKIM próprios as respostas legítimas podem ser recusadas por `AUTH_NOT_ALIGNED` (doc `04`, seção 3) |
| `ACC_SSMA_NOTIFICATIONS_ENABLED`, `ACC_SSMA_NOTIFICATIONS_SCOPE` | conforme P-01 | E-mail de aviso SSMA só existe se ligada; sempre sob a trava de piloto |
| `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED` | padrão (ligada: qualquer valor diferente de `false`) para E.07; valor exato `false` para E.08 | Ver bloco E |
| `ACC_WEEKLY_REPORTS_ENABLED` | conforme P-01 (valor exato `true` liga) | Desligada: C.07 e F.09 = N/A |
| `AXIA_CHAT_PROVIDER` | ausente/`off` (padrão) | Com IA ligada o consumo e o custo mudam (fora do escopo) |

Preencher esta tabela no registro (liga/desliga + quem conferiu + horário).

### 4.3 O envio real só ocorre se o responsável autorizar

O envio de e-mail a destinatários reais (colaboradores, cliente, fornecedor, seguradora) NÃO faz parte desta aceitação e só ocorre quando o Dono decidir por escrito, depois de SPF/DKIM/DMARC (doc `06`, B3 NO-GO hoje), colocando `ACC_OUTBOUND_MODE=production`, conferindo allowlist e flags (doc `04`, seção 5). **Ninguém, durante a aceitação, altera essas variáveis.** Se alguém perceber que um e-mail saiu para endereço fora da lista do P-04: PARAR TUDO (P0), avisar o Dono, preservar o cabeçalho completo do e-mail como evidência (com tarja nos tokens) e não reenviar.

### 4.4 Método seguro para os itens G (cada passo envia, no máximo, para `crm@axion.com.br`)

1. Todo alerta de G nasce na obra TESTE a partir de evento/ação com título `[ACEITE]` (método de `docs/teste-controlado-alertas-criticos.md`: evento sintético de risco, pela tela do evento ou pelo ciclo de alertas já agendado).
2. O e-mail do alerta chega à caixa institucional (destino efetivo conferido por Eng. TI no cabeçalho `To` e no assunto `[TESTE CONTROLADO]`). Quem monitora essa caixa é a pessoa designada no P-01.
3. As RESPOSTAS são enviadas pelos testadores a partir das próprias caixas corporativas (remetentes autorizados do P-04), usando o atalho `mailto` do e-mail (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA) ou digitando o comando na primeira linha do texto novo. **Não encaminhar o e-mail do alerta a ninguém**; não incluir terceiros em Para/Cc/Cco; no ENVIAR PARA usar apenas e-mail exato de conta de teste vinculada à TESTE (o item notifica por e-mail somente sob a mesma trava, ou seja, a caixa de teste).
4. O remetente NÃO autorizado de G.08 é uma caixa de teste própria da Axion (conta sem vínculo à TESTE), jamais um endereço externo. A resposta a remetente desconhecido não gera e-mail ao desconhecido (doc `piloto-weg-e2e-ciclo-por-email.md`, elo 6).
5. Eng. TI acompanha a saída (outbox e log do provedor, somente leitura) e confirma que cada mensagem de saída tem como destino efetivo `crm@axion.com.br`.
6. Valor do token: tarja em qualquer print. Token por item vale 30 dias; expiração (`TOKEN_EXPIRED`) NÃO é testável na janela (ver seção 9).
7. Se SPF/DKIM próprios não estiverem publicados, é esperado que respostas legítimas sejam recusadas por `AUTH_*` (fail-closed). Nesse caso G.04 a G.07 e G.09 a G.11 ficam BLOQUEADOS (não reprovados), o bloco G vira "NO-GO CONDICIONAL" para respostas por e-mail (doc `06`, B3) e o Dono decide; G.08 (recusa) e G.12 continuam executáveis e valem.

## 5. Itens por bloco

Colunas: **Passos** (com a tela/rota real), **Esperado**, **Evidência** (o que capturar), **Aprovado se / Reprovado se**. Rotas escritas como `/[projectId]/...` usam o id da obra TESTE, salvo indicação. "Obra" = TESTE.

### Bloco A - Login e sessão (executa: cada conta de teste)

O login do app é exclusivamente pela conta Google corporativa (tela `/login`, botão Google; não há campo de senha do app). Fonte: `apps/web/app/login/page.tsx`, manual 1.1.

| ID | Passos | Esperado | Evidência | Aprovado se / Reprovado se |
|---|---|---|---|---|
| A.01 | 1. Abrir a raiz `/` em janela anônima. 2. Será levado a `/login`. 3. Entrar com Google (própria conta). 4. Após o retorno, observar a tela inicial e `/projetos` | Login conclui; cai na lista/seleção de obras com a(s) obra(s) vinculada(s); sem erro | Print de `/login`, print de `/projetos` com horário | Aprovado: entra sem erro. Reprovado P1: loop de login, erro de OAuth persistente ou 500 |
| A.02 | Na tela de login, procurar campo de e-mail/senha do app | Não existe; só o botão Google (texto "autenticação exclusiva pela conta Google corporativa") | Print | Aprovado: só Google. Reprovado P2: existir outra forma não prevista (registrar) |
| A.03 | Tentar entrar com conta Google NÃO corporativa (conta pessoal de teste do próprio testador) | Não obtém acesso a nenhuma obra nem dado (recusado no login ou sem vínculo) | Print do resultado | Aprovado: nenhum dado. Reprovado P0: vê qualquer obra |
| A.04 | Conta de TESTE, perfil qualquer: clicar em Sair (TopBar, botão de logout) | Volta a `/login`; botão Voltar do navegador não mostra dados da obra sem reautenticar | Prints antes e depois; teste do Voltar | Aprovado: dados não reaparecem sem login. Reprovado P0: dado visível após logout |
| A.05 | Abrir, em janela anônima SEM login, uma URL direta de módulo (ex.: `/[projectId]/dashboard`, colando o id da TESTE) | Redireciona a `/login` (com retorno `next` seguro); nenhum dado | Print da URL final | Aprovado: login exigido. Reprovado P0: dado exibido sem sessão |
| A.06 | SESSÃO EXPIRADA/ENCERRADA (sem manipular cookies): abrir a mesma conta em duas abas; sair na aba 1; na aba 2 clicar em um item do menu e tentar gravar uma solicitação `[ACEITE]` | Aba 2 é redirecionada a `/login` ou recebe recusa clara; nada gravado; sem erro cru/stack | Prints das duas abas; conferir na lista que nada foi criado | Aprovado: recusa limpa e nada gravado. Reprovado P0: gravou sem sessão; P1: erro cru/500 |
| A.07 | Conta SEM VÍNCULO: entrar (A.01) e abrir `/projetos` | Entra, mas sem obra listada/sem acesso a dados; nenhuma obra de terceiros exposta | Print | Aprovado: vazio/sem dados. Reprovado P0: lista obra sem vínculo |

### Bloco B - Permissões por perfil e isolamento entre obras (executa: Eng. TI conduz; uma pessoa por conta)

**Fonte da matriz (não inventada):** níveis `acc_project_tier` = ADMIN (ADMINISTRADOR), MANAGE (GESTOR e GERENTE, mesmo nível), REGISTER (COLABORADOR), READ (LEITURA), NONE (inativo, convite pendente, outra obra, sem vínculo) - `docs/permissoes-matriz-central.md` seção 2 e `apps/web/lib/permissions/project-tier.ts`. Visibilidade do menu: `nav-access.ts` (`TIER_GATED_SEGMENTS`: qualidade, garantias, seguros, pilares, competencias = READ; aprovacoes-externas = REGISTER) e `nav-items.ts` (`restrictedTo: "admin"`: Eventos/`ledger`, Integrações, Usuários, Autorizações, Reemissão de alertas, Start-up ACC; `restrictedTo: "financial"`: Financeiro, regra de acesso financeiro da obra).

Quadro de referência (o que se espera ver no MENU por perfil):

| Item do menu (rota) | ADMINISTRADOR | GESTOR/GERENTE | COLABORADOR | LEITURA | Sem vínculo / outra obra |
|---|---|---|---|---|---|
| Dashboard, Timeline, Solicitações, Ações, Jurídico, Documentos, Providências, ESG/SSMA, Experts IA, Auditoria, Ajuda | vê | vê | vê | vê | não vê (sem acesso à obra) |
| Quatro Pilares, Qualidade, Garantias, Seguros, Competências | vê | vê | vê | vê (READ) | não |
| Aprovações externas | vê | vê | vê (REGISTER) | NÃO vê | não |
| Eventos, Integrações, Usuários, Autorizações, Reemissão de alertas, Start-up ACC | vê | NÃO vê | NÃO vê | NÃO vê | não |
| Financeiro | só com acesso financeiro à obra (`lib/financial/access.ts`) - independe do perfil: registrar o que cada conta vê | idem | idem | idem | não |

Quadro de referência de GRAVAÇÃO (somente o que a matriz do repositório documenta; seções 3 e 3.1 de `docs/permissoes-matriz-central.md`):

| Operação | LEITURA | COLABORADOR | GESTOR/GERENTE | ADMINISTRADOR |
|---|---|---|---|---|
| Ler RNC, garantias, seguros, auditorias do módulo | sim | sim | sim | sim |
| Registrar RNC / abrir caso de garantia / registrar evidência (REGISTER) | não | sim | sim | sim |
| Decisões de gestão: confirmar, encerrar, decidir cobertura, verificação de eficácia (MANAGE) | não | não | sim | sim |
| Aprovar minuta de seguro (ADMIN) | não | não | não | sim |
| Upload/promoção de anexos em Documentos (`can_manage_project_documents`: lista fixa ADMINISTRADOR, GESTOR, GERENTE) | não | não | sim | sim |
| Escrita direta em tabelas / apagar evidência | nunca | nunca | nunca | nunca |

NÃO DOCUMENTADO na matriz do repositório (portanto "OBSERVADO", salvo LEITURA que nunca grava): gravações em Solicitações, Providências, SSMA, Ações/SLA, Jurídico, Competências por perfil. O que existe é o roteiro `docs/homologacao-roteiro-perfis-segunda-23-11.md` (COLABORADOR registra solicitação; destinatário externo exige confirmação de gestão) e a regra geral de `has_project_permission` (matriz seção 1: níveis 3 para ADMINISTRADOR e 1 para os demais papéis; mínimos 'EDITOR' e 'GESTOR' na prática exigem ADMINISTRADOR).

**IMPORTANTE (interação com a trava):** as escritas dos módulos bloqueados (Qualidade parcial, Seguros, Competências) estão travadas para TODOS os perfis, inclusive ADMINISTRADOR (bloco I). Por isso as provas positivas de gravação por perfil usam apenas o que a trava mantém liberado (`quality_ncr_create`, `quality_evidence_register`, `quality_warranty_create`, `quality_ncr_transition`, `quality_warranty_transition`, `quality_capa_register` parcial) e módulos não travados (Solicitações, SSMA, Providências).

| ID | Passos | Esperado | Evidência | Aprovado se / Reprovado se |
|---|---|---|---|---|
| B.01 | ADMINISTRADOR abre `/[projectId]/usuarios` na TESTE e compara cada conta de P-03 com o perfil esperado e ACTIVE. Na WEG: SOMENTE abrir para leitura, sem alterar nada (opcional, Dono presente) | Lista coincide com P-03; nenhuma conta inesperada na TESTE | Print da lista (e-mails cobertos) | Aprovado: coincide. Reprovado P0: membro/perfil inesperado |
| B.02 | ADMINISTRADOR: percorrer todo o menu e abrir cada rota restrita (`/[projectId]/ledger`, `/[projectId]/integracoes`, `/[projectId]/usuarios`, `/[projectId]/autorizacoes`, `/[projectId]/reemissao-alertas`, `/[projectId]/startup`) | Todas abrem sem erro | Print do menu completo | Aprovado: tudo abre. Reprovado P1: item do quadro não aparece ou erro |
| B.03 | GESTOR e depois GERENTE: comparar o menu com o quadro | Mesmo menu, e igual entre si; sem os 6 itens admin | Print do menu de cada | Aprovado: igual ao quadro. Reprovado P1: item admin visível (P0 se abrir dados) |
| B.04 | COLABORADOR: comparar o menu com o quadro | Vê Aprovações externas; sem itens admin | Print | Aprovado/Reprovado como B.03 |
| B.05 | LEITURA: comparar o menu com o quadro | NÃO vê Aprovações externas nem itens admin; vê Qualidade, Garantias, Seguros, Pilares, Competências | Print | Aprovado/Reprovado como B.03 |
| B.06 | Com cada conta NÃO administradora, colar a URL de cada rota restrita (`/[projectId]/usuarios`, `/[projectId]/integracoes`, `/[projectId]/ledger`, `/[projectId]/startup`, `/[projectId]/autorizacoes`, `/[projectId]/reemissao-alertas`). LEITURA ainda cola `/[projectId]/aprovacoes-externas`. As subrotas `/[projectId]/integracoes/caixas`, `/[projectId]/integracoes/contatos-externos` e `/[projectId]/integracoes/sinais-email` NÃO têm regra documentada de menu (o roteiro de perfis do repositório espera GESTOR consultando contatos e sinais): abrir e registrar como OBSERVADO, sem gravar dado global | Negado, 404 ou redirecionamento nas rotas restritas; nenhum dado dessas telas; sem erro cru | Print de cada tentativa (pode ser em um print por rota com a barra de URL visível) | Aprovado: nenhum dado. Reprovado P0: dado visível ou escrita possível |
| B.07 | `/[projectId]/financeiro`: abrir com todas as contas | Só abre para quem tem acesso financeiro à obra; demais negado/oculto. NÃO DOCUMENTADO por perfil: OBSERVADO | Print por conta | Aprovado: coerente com a regra de acesso financeiro e igual entre menu e URL. Reprovado P0: menu oculto mas URL abre dado (ou vice-versa sem acesso) |
| B.08 | LEITURA tenta gravar: em `/[projectId]/action-requests` registrar solicitação `[ACEITE]`; em `/[projectId]/providencias`; em SSMA (`/[projectId]/ssma-registros`) | Nenhuma gravação aceita (botão indisponível ou recusa clara); lista permanece igual | Print da recusa + print da lista antes/depois | Aprovado: nada gravado. **Reprovado P0: qualquer gravação aceita** |
| B.09 | COLABORADOR: (1) em `/[projectId]/action-requests` registrar solicitação `[ACEITE]` para destinatário INTERNO de teste; (2) tentar destinatário externo sem confirmação de gestão; (3) em `/[projectId]/qualidade` (aba RNC) registrar RNC `[ACEITE]` com origem e referência; (4) tentar CONFIRMAR/ENCERRAR a RNC | (1) registrada; (2) recusada para COLABORADOR; (3) criada com código (sem origem/referência é recusada); (4) botão indisponível ("exige perfil de gestão") ou recusa, nada gravado | Prints de cada passo; ID/código da RNC | Aprovado: conforme esperado. Reprovado P0: COLABORADOR confirma/encerra; P1: não consegue registrar (1)/(3) |
| B.10 | GESTOR e GERENTE: (1) na solicitação para destinatário externo, tentar SEM confirmação e depois com confirmação+motivo válidos; (2) em `/[projectId]/integracoes/contatos-externos` (acesso OBSERVADO, ver B.06): se a tela abrir, solicitar alteração de dado global; (3) em `/[projectId]/aprovacoes-externas` abrir e preparar (decisões de Seguros ficam bloqueadas, bloco I) | (1) sem confirmação recusado; com ambos segue e fica na auditoria; (2) GESTOR solicita mas NÃO altera dado global (sem gravação direta); se a rota for negada, registrar o resultado real; (3) abre, não envia | Prints; linha de auditoria (H) | Aprovado: coerente. Reprovado P0: grava dado global sem ADMINISTRADOR; envia mensagem |
| B.11 | ADMINISTRADOR altera o perfil de uma conta de teste (ex.: COLABORADOR -> LEITURA) em `/[projectId]/usuarios`; o testador atualiza a página; depois desativa a conta (INACTIVE) e reativa | Efeito imediato nas telas (menu e gravação); conta inativa perde TODO o acesso (nível NONE, sem convite pendente); linha de auditoria quando existir | Prints antes/depois; hora | Aprovado: acesso acompanha o vínculo. Reprovado P0: acesso mantido após desativar |
| B.12 | `/[projectId]/action-requests` e o detalhe `/[projectId]/action-requests/[actionRequestId]`: abrir a solicitação criada em B.09 com GESTOR e com LEITURA | Detalhe abre para membros; LEITURA só consulta | Prints | Aprovado: coerente. Reprovado P0: LEITURA altera |
| B.13 | Conta SEM VÍNCULO: colar a URL `/[projectId]/dashboard` e `/[projectId]/qualidade` da TESTE | Negado/404; nenhum dado | Prints | Aprovado: nenhum dado. Reprovado P0 |
| B.14 | **Isolamento entre obras (leitura).** Conta de OUTRA OBRA (membro só de TESTE-2) cola, uma a uma, URLs da TESTE: `/[projectId]/dashboard`, `/[projectId]/auditoria`, `/[projectId]/documentos`, `/[projectId]/qualidade`, `/[projectId]/garantias/[caseId]`, `/[projectId]/qualidade/rnc/[ncrId]`, `/[projectId]/ledger/[eventId]`, `/[projectId]/alertas/[caseId]` (com os ids reais criados em B.09/F.04) | Todas negadas/404; nenhum dado; o seletor de obra na TopBar não lista a TESTE | Print de cada uma | Aprovado: nada visível. **Reprovado P0** |
| B.15 | **Isolamento (id cruzado).** Conta da TESTE-2 monta a URL com o id DA PRÓPRIA obra e o id de recurso da TESTE (ex.: `/[idTESTE-2]/garantias/[caseId-da-TESTE]` e `/[idTESTE-2]/qualidade/rnc/[ncrId-da-TESTE]`) | 404/negado; nenhum dado da TESTE | Prints | Aprovado/Reprovado P0 |
| B.16 | **Isolamento (escrita).** Conta da TESTE-2 tenta registrar solicitação/RNC na TESTE por URL colada ou por "Voltar" do histórico | Impossível/recusado; a lista da TESTE não ganha registro | Print + conferência da lista pela conta ADMINISTRADOR da TESTE | Aprovado: nada gravado. **Reprovado P0** |
| B.17 | **Isolamento (e-mail).** Conta da TESTE-2 abre o link de ação de e-mail de um alerta da TESTE (rota `/email-actions/[token]`, token coberto no print; o link vem do e-mail na caixa de teste, entregue por Eng. TI) | "Este link não existe ou seu usuário não tem acesso" ou equivalente; sem botão; estado do item inalterado | Print com token coberto; estado do item antes/depois | Aprovado: nada alterado. Reprovado P0 |
| B.18 | Isolamento na auditoria: conta da TESTE-2 abre `/[projectId]/auditoria` da TESTE e da própria obra | TESTE negada; na própria obra só linhas dela | Prints | Aprovado/Reprovado P0 |

### Bloco C - Planejamento (executa: Planejamento)

Fontes: manual 2.1 (Dashboard), 3.1 (Providências), `docs/weekly-schedule-email-ingestion.md` (cronograma `.mpp` capturado por e-mail, planilha semanal, comparação de versões). Não existe tela de upload manual de cronograma documentada neste roteiro: a "importação" é a captura automática pela caixa monitorada, atrás da flag `ACC_WEEKLY_REPORTS_ENABLED`.

| ID | Passos | Esperado | Evidência | Aprovado se / Reprovado se |
|---|---|---|---|---|
| C.01 | Abrir `/[projectId]/dashboard` (obra TESTE; depois a WEG, SOMENTE LEITURA, se o Dono autorizar) | Indicadores de prazo/cronograma carregam; estado "SEM DADOS" ou pendente, quando não há cronograma, aparece explícito e não como zero inventado | Print | Aprovado: abre e sem erro cru. Reprovado P1: erro/tela em branco |
| C.02 | Abrir `/[projectId]/dashboard/visual` | Abre sem erro; mesmos dados da C.01 | Print | Aprovado/Reprovado P1 |
| C.03 | `/[projectId]/providencias`: registrar providência `[ACEITE]` com prazo; ver o prazo exibido; alterar o andamento | Registrada com autor e horário; prazo visível; (LEITURA não grava, B.08) | Print + ID | Aprovado: registrada e visível. Reprovado P1: não registra |
| C.04 | `/[projectId]/timeline`: localizar a providência criada | A linha do tempo mostra o evento, com ator e horário | Print | Aprovado: aparece. Reprovado P1: ausente |
| C.05 | `/[projectId]/experts-ia/diretor-planejamento`: ler a tela; SE o Dono tiver autorizado consumo de IA, fazer UMA pergunta sintética sobre prazo | A resposta (se IA ativa) diferencia fato, inferência e recomendação, cita evidência e declara revisão humana; sem IA ativa: estado claro de indisponível | Print | Aprovado: rotulagem presente ou indisponibilidade clara. Reprovado P1: recomendação sem evidência apresentada como fato |
| C.06 | Link de resposta rápida de providência: usar o atalho recebido no e-mail de teste (rota `/alertas/providencia/[projectId]/[itemId]`) com conta autorizada, e abrir sem confirmar | Abrir não altera estado; confirmar registra uma vez | Prints antes/depois | Aprovado: conforme. Reprovado P0: GET altera estado |
| C.07 | Importação do cronograma (SOMENTE se `ACC_WEEKLY_REPORTS_ENABLED` ligada, P-06): Planejamento envia o `.mpp` SINTÉTICO de teste para a caixa monitorada da TESTE e acompanha em `/[projectId]/documentos` (classificação do anexo como cronograma) e no dashboard | Anexo registrado, original preservado, classificação com fonte; comparação com versão anterior só quando houver duas versões; sem sobrescrever versão anterior | Print do documento/anexo; ID | Aprovado: registrado e rastreável. Reprovado P1: perde/sobrescreve versão. N/A: flag desligada (anotar) |
| C.08 | Alerta de prazo: criar providência com prazo vencendo/vencido na TESTE e acompanhar o alerta em `/[projectId]/acoes` (ver F.03 e F.06) | Alerta de prazo gerado com a classificação e o prazo da matriz | Print | Aprovado: gerado. Reprovado P1 |

### Bloco D - Jurídico (executa: Jurídico; Auditor acompanha)

Fontes: manual 4.1 a 4.9; roteiro de perfis. Jamais usar contrato, cláusula ou documento real de terceiros: gerar um contrato sintético `[ACEITE]`.

| ID | Passos | Esperado | Evidência | Aprovado se / Reprovado se |
|---|---|---|---|---|
| D.01 | `/[projectId]/documentos`: abrir a lista; com GESTOR (e GERENTE e ADMINISTRADOR) tentar anexar/promover documento sintético; com COLABORADOR e LEITURA tentar o mesmo | Upload/promoção só para ADMINISTRADOR, GESTOR, GERENTE (`can_manage_project_documents`); demais recusados claramente | Prints por perfil; ID do documento | Aprovado: conforme. Reprovado P0: COLABORADOR/LEITURA grava |
| D.02 | `/[projectId]/documentos/versoes/[documentVersionId]`: abrir a versão do documento criado | Mostra versão, fonte e origem; sem apagar/alterar o original | Print | Aprovado: rastreável. Reprovado P1: sem origem |
| D.03 | `/[projectId]/documentos/emails/[emailId]` e `/[projectId]/documentos/emails/[emailId]/anexos/[attachmentId]`: abrir um e-mail arquivado SINTÉTICO (enviado à caixa de teste em G) e seu anexo | E-mail e anexo originais preservados; nenhuma opção de editar o original | Print | Aprovado: preservado. Reprovado P0: permite alterar/apagar o original |
| D.04 | `/[projectId]/juridico`: abrir; ler avisos e vínculos com contratos da obra | Abre sem erro; informações com fonte | Print | Aprovado/Reprovado P1 |
| D.05 | Expert jurídico: abrir `/juridico` (tela global "antes da contratação") e, depois, o histórico `/[projectId]/juridico/consulta/[consultationId]` (consulta sintética `[ACEITE]`, SOMENTE se o Dono autorizar consumo de IA) | Resposta rotulada como recomendação, com evidência e revisão humana; não altera nenhum documento | Print | Aprovado: rotulada. Reprovado P1: apresentada como decisão |
| D.06 | `/[projectId]/ledger` (ADMINISTRADOR): localizar o evento/alerta de contrato sintético | Evento listado; GESTOR/COLABORADOR/LEITURA NÃO acessam (B.06) | Print | Aprovado: conforme. Reprovado P0: acesso indevido |
| D.07 | `/[projectId]/ledger/[eventId]`: abrir o evento | Detalhe com fonte e histórico | Print | Aprovado/Reprovado P1 |
| D.08 | Resposta de alerta de contrato (lote e individual): usar os links do e-mail de teste `/alertas/lote/[projectId]/[batchId]`, `/alertas/acao/[projectId]/[batchId]/[eventId]` e `/[projectId]/ledger/lote-alertas/[batchId]`; ABRIR o link (GET) e conferir que não muda estado; depois confirmar EM ANDAMENTO | GET não registra nada; EM ANDAMENTO exige confirmação explícita; autor = quem está logado; reabrir mostra "já respondido"; quem não é responsável nem ADMINISTRADOR vê "não existe ou sem acesso" | Prints antes/depois; linha de auditoria | Aprovado: conforme. Reprovado P0: GET altera estado ou terceiro responde |
| D.09 | Pergunta de especialista ao Expert jurídico por e-mail (`ESPECIALISTA:`) fica no bloco G.11; aqui, conferir que a AXIA NÃO responde matéria jurídica (J.02) | - | - | Referência cruzada |

### Bloco E - SSMA (executa: SSMA; Eng. TI confere as flags)

Fontes: manual 5.1 a 5.5; `docs/implantacao/trava-modulos/README.md` (seção "Botões SSMA ENVIAR PARA / ESPECIALISTA"); `apps/web/lib/ssma/field-notifications/content.ts`. Os botões ENVIAR PARA e ESPECIALISTA são LINKS AUTENTICADOS do e-mail de aviso SSMA que abrem o formulário do registro; o GET NÃO altera estado; usam `ssma_corrective_action_forward` e a consulta ao especialista com limite diário; não passam pelas 35 RPCs travadas.

| ID | Passos | Esperado | Evidência | Aprovado se / Reprovado se |
|---|---|---|---|---|
| E.01 | `/[projectId]/esg`: abrir a visão ESG/SSMA | Abre sem erro; mostra estado e pendências | Print | Aprovado/Reprovado P1 |
| E.02 | `/[projectId]/ssma-registros`: criar registro de campo sintético `[ACEITE]` (ocorrência) com foto sintética | Registro criado com código, autor, horário; evidência preservada | Print + código | Aprovado: criado e rastreável. Reprovado P1 |
| E.03 | Notificação: com `ACC_SSMA_NOTIFICATIONS_ENABLED` ligada (P-06/P-01), gerar o aviso do registro de E.02 | Um e-mail de aviso chega SOMENTE a `crm@axion.com.br` com assunto `[TESTE CONTROLADO]`; botões presentes | Print do e-mail (token coberto); cabeçalho `To` | Aprovado: único destino crm. **Reprovado P0: outro destino** |
| E.04 | `/[projectId]/ssma-avaliacao`: abrir a avaliação do técnico; registrar avaliação sintética (perfil adequado) | Registro com autor e horário; LEITURA não grava (B.08) | Print | Aprovado/Reprovado P1 |
| E.05 | App de campo: abrir `/ssma` e `/ssma/[projectId]` (celular ou janela estreita) | Lista e formulário abrem; só a obra vinculada | Print | Aprovado/Reprovado P1 |
| E.06 | Modo offline: abrir `/ssma/offline` | Tela offline abre sem erro; nenhum dado sensível no armazenamento além do esperado (inspeção visual) | Print | Aprovado/Reprovado P2 |
| E.07 | Flag `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED` no PADRÃO (ligada): no e-mail do E.03, clicar em ENVIAR PARA e depois em ESPECIALISTA | Cada botão abre (exige login) o formulário do registro; abrir NÃO altera estado; ENVIAR PARA registra só após confirmação com justificativa; ESPECIALISTA respeita o limite diário | Prints dos formulários; linha de auditoria | Aprovado: conforme. Reprovado P0: GET altera estado |
| E.08 | Eng. TI, SOMENTE com autorização do Dono (P-01), define `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED` com o valor exato `false`, gera novo aviso e confere; depois RESTAURA o padrão | Botões ENVIAR PARA/ESPECIALISTA permanecem no layout, DESATIVADOS, com o motivo exibido; o fluxo normal (RESOLVIDO, EM ANDAMENTO) continua | Print do e-mail com botões desativados; registro do estado final da flag | Aprovado: desativado com motivo e restaurado. Reprovado P1: botão ativo com a flag desligada; P1: flag não restaurada. N/A: sem autorização |
| E.09 | RESOLVIDO de ação SSMA por e-mail exige foto: responder RESOLVIDO sem foto e com foto (ver G.05) | Sem foto, recusado/pede evidência; com foto, aplicado | Prints | Aprovado: conforme. Reprovado P1 |
| E.10 | SSMA/ESG: usuário de OUTRA obra tenta abrir `/ssma/[projectId]` da TESTE | Negado | Print | Aprovado/Reprovado P0 |

### Bloco F - Alertas, classificação, SLA e escalonamento (executa: Eng. TI + Planejamento; Dono presente)

**Prazos de SLA vigentes para a obra WEG (matriz PRÓPRIA da obra, prazo para ASSUMIR):** CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 1 dia útil; BAIXO 3 dias úteis. Fonte: regras ativas da WEG em `docs/sla-regras-duplicadas-weg.md` e estado remoto do doc `05` (item "Correção de SLA MÉDIO/BAIXO": remoto 1/3, aprovado 2/5, só ações novas mudam; `20261121177000` NÃO aplicada, decisão do Dono, P-09). **Este roteiro NÃO afirma 2 e 5 para a WEG.** O padrão do código (`apps/web/lib/sla/default-matrix.ts`) é 2/5 e vale apenas quando a obra não tem regra própria: não é a matriz da WEG. Intervalos de escalonamento (Nível 2 e Diretoria) NÃO são afirmados aqui: o que vale é o que a tela da matriz da obra mostra. A WEG tem regras duplicadas ativas para CRÍTICO e ALTO com intervalos de escalonamento diferentes (doc `sla-regras-duplicadas-weg.md`): registrar o que a tela mostra e levar a divergência ao Dono (lacuna, seção 10).

| ID | Passos | Esperado | Evidência | Aprovado se / Reprovado se |
|---|---|---|---|---|
| F.01 | LEITURA da obra WEG (Eng. TI/ADMINISTRADOR, sem editar): abrir `/[projectId]/acoes/configuracao` da WEG | Matriz mostra CRÍTICO 1 h corrida, ALTO 4 h úteis, MÉDIO 1 d.u., BAIXO 3 d.u. (prazo para assumir); anotar os intervalos de Nível 2 e Diretoria exibidos e se há regra duplicada | Print da matriz | Aprovado: valores = 1 h / 4 h úteis / 1 d.u. / 3 d.u. Reprovado P1: valor diferente (parar e levar ao Dono: pode indicar que a 177000 foi aplicada) |
| F.02 | ADMINISTRADOR da TESTE: abrir `/[projectId]/acoes/configuracao` e conferir (ou configurar, P-08) os MESMOS valores do F.01. Quem não é ADMINISTRADOR tenta alterar | Salvo com autor/horário; linha `SLA_CONFIGURATION_UPDATED` na auditoria (H); não administrador não altera | Print + auditoria | Aprovado: igual à WEG e auditado. Reprovado P0: não administrador altera |
| F.03 | `/[projectId]/acoes`: abrir a lista de ações e escalonamentos; filtrar por nível | Abre; mostra níveis, prazos, responsáveis | Print | Aprovado/Reprovado P1 |
| F.04 | Geração: criar na TESTE quatro eventos/ações sintéticos `[ACEITE]`, um por nível (CRÍTICO, ALTO, MÉDIO, BAIXO), pelo método do 4.4; abrir cada `/[projectId]/alertas/[caseId]` | Cada alerta nasce com a classificação do nível; detalhe mostra evidência/fonte e distingue fato, inferência e recomendação | Prints; anotar horário de criação (T) com segundos | Aprovado: 4 casos classificados. Reprovado P1: classificação errada ou sem fonte |
| F.05 | Classificação: conferir que uma classificação feita por indício (e-mail) não é apresentada como fato confirmado | Indício rotulado; CRÍTICO sem confirmação humana não é gerado (conforme doc e2e) | Print | Aprovado/Reprovado P1 |
| F.06 | Prazos: para cada caso de F.04 comparar o "prazo para assumir" exibido com T + prazo da matriz: CRÍTICO = T + 1 h corrida; ALTO = T + 4 horas ÚTEIS (dentro do expediente e feriados configurados); MÉDIO = T + 1 dia útil; BAIXO = T + 3 dias úteis | Cada prazo exibido = o cálculo; MÉDIO/BAIXO NÃO aparecem como 2/5 dias úteis | Print do prazo + cálculo escrito pelo testador | Aprovado: os 4 coincidem. Reprovado P1: divergência; P0 não aplicável |
| F.07 | Escalonamento (CRÍTICO, espera real): NÃO assumir o caso CRÍTICO de F.04; aguardar o vencimento (1 h corrida) | Depois do vencimento o caso sobe ao Nível 2 (motor: comparação estrita, no primeiro instante após o prazo) e, depois, à Diretoria, nos intervalos que a tela da matriz mostra; os e-mails de escalonamento vão SÓ a `crm@axion.com.br` | Prints do estado a cada nível; e-mails (token coberto); horários | Aprovado: sobe no prazo, com e-mail apenas à caixa de teste. Reprovado P0: e-mail a outro destino; P1: não escala ou escala antes do prazo |
| F.08 | Assumir (EM ANDAMENTO) um caso ALTO de F.04 antes do vencimento (por tela) | A ação SLA passa a IN_PROGRESS (satisfaz o prazo de assumir); NÃO provoca escalonamento extraordinário nem reinicia prazos (doc `auditoria-escalonamento-acoes-20261118.md`) | Prints antes/depois | Aprovado: prazos inalterados. Reprovado P1: reinicia/escala |
| F.09 | `/[projectId]/acoes/resumo-semanal/[digestId]`: abrir um resumo semanal gerado (SOMENTE se `ACC_WEEKLY_REPORTS_ENABLED`/ciclo ligado; senão N/A) | Resumo abre; envio só à caixa de teste | Print | Aprovado/N/A |
| F.10 | `/[projectId]/reemissao-alertas` (ADMINISTRADOR): abrir; tentar reemitir um alerta de teste com `ACC_RISK_ALERT_REISSUE_SEND_ENABLED` DESLIGADA | O envio de reemissão fica bloqueado/indisponível com explicação; nada sai | Print; conferência da outbox por Eng. TI | Aprovado: bloqueado. **Reprovado P0: saiu e-mail** |
| F.11 | Encerramento: RESOLVIDO de todos os casos de F.04 (tela) para limpar a fila de teste | Casos RESOLVED; lembretes interrompidos | Print | Aprovado/Reprovado P2 |

### Bloco G - Resposta por e-mail (executa: Eng. TI + um membro de cada papel). LEIA A SEÇÃO 4 ANTES.

Pré-condições: P-04, P-05, P-06. Um caso por comando, em casos DIFERENTES do F.04 (para não confundir os estados). Comandos (primeira linha do texto novo da resposta): `RESOLVIDO: <o que foi feito>`; `EM ANDAMENTO: <providência>` + linha `Previsão: dd/mm/aaaa [hh:mm]` (ALTO/CRÍTICO com horário); `ENVIAR PARA: <e-mail exato ou nome completo>` + `Justificativa: ...`; `ESPECIALISTA: <pergunta>` (consulta, não altera o item). RESOLVIDO e ENVIAR PARA consomem o token; EM ANDAMENTO e ESPECIALISTA não. Regras do canal: domínio corporativo, e-mail exato do perfil, membro ATIVO da obra, perfil diferente de LEITURA, ator do item ou ADMINISTRADOR, autenticação do remetente (Authentication-Results de servidor confiável com DMARC/DKIM alinhado), limite por remetente/hora. Fontes: `docs/email-respostas-lote3.md`, `apps/web/lib/email-replies/token-reply-decision.ts`.

| ID | Passos | Esperado | Evidência | Aprovado se / Reprovado se |
|---|---|---|---|---|
| G.01 | Eng. TI confirma P-04/P-05/P-06 e que o provedor de teste está em piloto; registra a tabela 4.2 | Piloto ativo; flags conforme a tabela | Tabela preenchida | Aprovado: tudo conforme. **Reprovado P0 = NO-GO: modo `production` ou flag de envio real ligada** |
| G.02 | Gerar o alerta de teste (4.4, passo 1) na TESTE | E-mail chega SOMENTE em `crm@axion.com.br`; assunto com `[TESTE CONTROLADO]`; 3 atalhos de resposta (RESOLVIDO, EM ANDAMENTO, ENVIAR PARA) e o de ESPECIALISTA conforme flag; Reply-To é a caixa oficial do ACC | Print do e-mail (tokens cobertos); cabeçalhos To/Cc/Reply-To | Aprovado: destino único crm. **Reprovado P0: outro destino ou Reply-To de pessoa** |
| G.03 | Abrir o link do e-mail (`/email-actions/[token]`) com o responsável: apenas abrir | Não registra nada (estado idêntico); mostra botões; quem não é responsável nem ADMINISTRADOR vê "não existe ou sem acesso" | Prints; estado antes/depois | Aprovado: GET não altera. Reprovado P0: altera |
| G.04 | Remetente AUTORIZADO responde `EM ANDAMENTO: acompanhar [ACEITE]` + `Previsão:` válida, em caso ALTO | Aplicado (estado em andamento; previsão registrada; prazos não mudam); confirmação ao remetente se a flag estiver ligada (G.10); token NÃO consumido; auditoria `RISK_ALERT_ACTION` | Print do estado; auditoria; horário | Aprovado: aplicado. Reprovado P1: não aplica com remetente válido (BLOQUEADO se rejeição por `AUTH_*`, ver 4.4 passo 7) |
| G.05 | `RESOLVIDO` (a) sem descrição; (b) com descrição de pelo menos o mínimo exigido; em ALTO/CRÍTICO (c) com e sem anexo de evidência (E.09: foto na ação SSMA) | (a) recusado (`RESOLVE_DESCRIPTION_REQUIRED`), nada alterado; (b)/(c) aplicado e token consumido; sem anexo em ALTO/CRÍTICO: anotar o comportamento observado (o atalho indica anexo obrigatório; o doc e2e registra que descrição só em texto foi aceita, decisão de produto pendente) | Prints de cada tentativa | Aprovado: (a) recusado e (b) aplicado. Reprovado P1: (a) aplica. Observação P2: divergência do anexo |
| G.06 | `ENVIAR PARA: <e-mail exato de conta de teste vinculada à TESTE>` + `Justificativa: ...` | Responsável trocado; prazo de assumir do encaminhado próprio (conforme doc de auditoria do escalonamento); histórico com autor e origem EMAIL; token consumido | Prints do histórico | Aprovado: conforme. Reprovado P1/P0 (P0 se encaminhar a destinatário sem vínculo) |
| G.07 | IDEMPOTÊNCIA: (a) reprocessar a MESMA mensagem de resposta (reenviar não: pedir ao Eng. TI reprocessar a mesma mensagem pelo worker, ou aguardar a repetição natural do ciclo); (b) responder RESOLVIDO de novo com OUTRA mensagem ao mesmo token já consumido | (a) nenhum efeito duplicado (uma linha de evento, uma chave de idempotência); (b) recusa `TOKEN_ALREADY_USED`/item fechado `ITEM_CLOSED`, "NÃO aplicado" e nada alterado | Prints; contagem de linhas de auditoria antes/depois | Aprovado: sem duplicidade. Reprovado P1: duplica efeito |
| G.08 | REMETENTE NÃO AUTORIZADO: (a) caixa de teste Axion de conta SEM vínculo à TESTE responde um comando válido; (b) membro LEITURA responde; (c) membro ativo que não é ator do item nem ADMINISTRADOR responde | Todos recusados (ex.: `UNAUTHORIZED_REPLY` / `TOKEN_NOT_OWNER`), nada alterado, e NENHUM e-mail é enviado ao remetente desconhecido (a); (b) e (c) recebem explicação "não aplicada" somente se o canal de confirmação estiver ligado e sempre sob a trava | Prints do estado inalterado; conferência da outbox | Aprovado: nada alterado e nada enviado a desconhecido. **Reprovado P0: ação aplicada ou e-mail a desconhecido** |
| G.09 | COMANDO AMBÍGUO: responder com dois comandos na mesma mensagem (ex.: `RESOLVIDO` e `EM ANDAMENTO`) e outra com texto livre sem comando | `COMMAND_AMBIGUOUS` / `COMMAND_NOT_RECOGNIZED`: "NÃO aplicado / nada foi alterado", orientação de como responder | Prints | Aprovado: nada alterado. Reprovado P1: interpreta e aplica |
| G.10 | CONFIRMAÇÕES: conferir que cada resposta (aplicada ou recusada) gera a confirmação ao autor ("Sua resposta foi REGISTRADA" / "NÃO foi aplicada") somente se `ACC_EMAIL_REPLY_CONFIRMATIONS_ENABLED=true` autorizada; confirmação sai pelo mesmo provedor e travas | Com a flag: uma confirmação por resposta, na conversa do remetente, sob a trava de piloto; sem a flag: nenhuma sai | Prints das confirmações ou ausência | Aprovado: conforme a flag. Reprovado P0: confirmação a destino fora da lista; BLOQUEADO: flag desligada |
| G.11 | ESPECIALISTA por e-mail: (a) com `ACC_EMAIL_SPECIALIST_ENABLED` DESLIGADA: enviar `ESPECIALISTA: ...`; (b) se o Dono autorizar, ligada: enviar pergunta SINTÉTICA | (a) recusada com explicação e nada gravado; (b) recibo e resposta rotulados como RECOMENDAÇÃO com revisão humana em ALTO/CRÍTICO; o item NÃO é alterado e o token NÃO é consumido; a pergunta não aparece na auditoria | Prints; estado do item inalterado | Aprovado: conforme. Reprovado P1: altera o item; P0: pergunta/dados em log ou auditoria |
| G.12 | PROVA NEGATIVA DE ENVIO A TERCEIROS: ao fim do bloco, Eng. TI lista (somente leitura) todas as mensagens de saída geradas na janela | 100% com destino efetivo `crm@axion.com.br`; nenhuma para cliente, fornecedor, seguradora ou colaborador fora da caixa de teste | Listagem (sem tokens) | Aprovado: lista só crm. **Reprovado P0 = NO-GO imediato** |

### Bloco H - Auditoria (executa: Auditor; Eng. TI apoia)

Fonte: tabela `public.audit_log_entries` (colunas `occurred_at`, `actor_type` SYSTEM/USER/LEGACY, `actor_user_id`, `action`, `entity_type`, `entity_id`, `detail`), **append-only** (trigger `prevent_audit_log_entry_mutation` recusa UPDATE e DELETE), leitura por RLS para membros da obra (`is_project_member`). Tela: `/[projectId]/auditoria` (colunas Data/Hora, Ator, Ação, Entidade, Detalhe; filtros Todos, Projetos e versões, Atas, Relatórios e RDO, Medições, E-mails, Ações e SLA, SSMA/ESG, Integrações e falhas; aviso de supervisão quando houver falhas). **Não existe consulta guardada de auditoria no repositório**: a consulta do auditor é a tela com filtros; o SQL abaixo é um modelo SOMENTE LEITURA para Eng. TI com autorização, nunca rodado por IA nem com credenciais neste documento.

```sql
-- Somente leitura. Substituir os marcadores. Nao executar sem autorizacao do Dono.
select occurred_at, actor_type, actor_user_id, action, entity_type, entity_id, left(detail, 200) as detail
from public.audit_log_entries
where project_id = '<id-da-obra-TESTE>'
  and occurred_at >= '<inicio-da-janela>'
order by occurred_at;
```

Linhas esperadas por ação (somente as que os docs e as migrations do repositório confirmam; para as demais o nome NÃO está documentado: o Auditor registra o texto exibido e o Eng. TI confirma a regra):

| Ação do teste | Linha esperada em `audit_log_entries` | Onde conferir na tela |
|---|---|---|
| Resposta/ação sobre alerta (tela, link ou e-mail), ex.: B.10, F.08, G.04 a G.06 | `action = RISK_ALERT_ACTION`, `entity_type = RISK_ALERT_CASE`, `entity_id = <id do caso>`, `detail = "Ação sobre alerta: ... (estado X -> Y)."`; ator USER quando humano | Filtro "Ações e SLA" ou "Todos"; Entidade = `RISK_ALERT_CASE · <id>` |
| Alteração da matriz de SLA (F.02, P-08) | `action = SLA_CONFIGURATION_UPDATED` (gatilho existente; ator SYSTEM nas alterações por migration; por tela, ator conforme o gatilho: registrar) | Filtro "Ações e SLA" |
| Exceção de destinatário de Nível 2 do piloto (se usada) | `RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_SET` / `..._UNSET`, `entity_type = PROJECT_RISK_ALERT_AREA_LEVEL` | Filtro "Ações e SLA" |
| Consulta de especialista por e-mail (G.11 b) | `EMAIL_SPECIALIST_CONSULT_REQUESTED` e demais `EMAIL_SPECIALIST_CONSULT_*`; guarda ids, Expert, área e canal; NUNCA o texto da pergunta | Filtro "E-mails" |
| Aplicação da trava de módulos (se feita na janela) | `action = MODULE_LOCK_APPLIED`, ator SYSTEM, `entity_type = DatabaseFunction`, uma linha por obra | Filtro "Todos" |
| Tentativa BLOQUEADA (bloco I) e recusas (B.08, G.08) | NENHUMA linha de gravação nova do registro recusado (a recusa não grava); conferir que a lista do módulo não mudou | Comparar antes/depois |
| Demais ações (registro SSMA, providência, solicitação, vínculo de usuário, documento) | Nome da `action` NÃO documentado nos docs consultados: registrar o que aparecer | Filtros "SSMA/ESG", "Projetos e versões", "Todos" |

| ID | Passos | Esperado | Evidência | Aprovado se / Reprovado se |
|---|---|---|---|---|
| H.01 | Anotar o horário de início da janela e, após cada ação relevante dos blocos B a G, abrir `/[projectId]/auditoria` (ou o filtro adequado) e localizar a linha | Para cada ação com linha documentada na tabela acima existe UMA linha, com horário próximo (diferença menor que alguns minutos), ator coerente e entidade correta | Print por ação, com a linha destacada e o ID do item | Aprovado: linha presente e única. **Reprovado P0: ação relevante sem linha de auditoria** |
| H.02 | Conferir o conteúdo do `detail` de todas as linhas da janela | Sem token, sem senha, sem chave, sem texto de pergunta de especialista, sem e-mail de terceiros real | Inspeção do Auditor | Aprovado: limpo. **Reprovado P0: segredo/token exposto** |
| H.03 | Repetir a mesma resposta duas vezes (G.07) e contar as linhas | Efeito duplicado não gera linha duplicada de ação | Contagem antes/depois | Aprovado: sem duplicidade. Reprovado P1 |
| H.04 | Filtros: aplicar cada filtro da tela e conferir a classificação das linhas; criar uma falha esperada (ex.: item de F.10 bloqueado) e ver o aviso de supervisão quando existir falha registrada | Filtros reduzem a lista de forma coerente; aviso aparece quando há falha/indisponibilidade registrada | Prints | Aprovado/Reprovado P2 |
| H.05 | IMUTABILIDADE (inspeção): procurar na tela de Auditoria qualquer botão/menu de editar, apagar ou ocultar linha | Não existe; a tela é só leitura. A prova de que UPDATE/DELETE são recusados é do banco (trigger da migration `20260819195713`); Eng. TI NÃO tenta alterar linha em produção; se quiser provar, só em homologação, com autorização | Print da tela inteira | Aprovado: sem controle de edição. **Reprovado P0: existir como editar/apagar** |
| H.06 | Isolamento: o Auditor (conta de OUTRA obra) abre a auditoria da própria obra e tenta a da TESTE (B.18) | Só vê a própria | Prints | Aprovado/Reprovado P0 |
| H.07 | Quem lê: conferir que o acesso à tela é por pertencer à obra (RLS por membro) e registrar se LEITURA vê a auditoria da obra | O código/migration concede a leitura a QUALQUER membro da obra; a tela diz "supervisão para a Diretoria": divergência de redação = observação P2 (lacuna na seção 10) | Print do LEITURA | Aprovado: coerente com RLS; registrar |

### Bloco I - Módulos BLOQUEADOS (executa: Qualidade; Jurídico para Seguros; Eng. TI confere)

Fonte: `docs/implantacao/trava-modulos/README.md`. A trava revoga EXECUTE de `authenticated`/`anon`/`public` em **35 RPCs de escrita** (23 de telas bloqueadas/fixture/competências + 12 de RNC/Garantias não comprovadas): 6 telas de Qualidade (custos, ensaios, inspeções, reclamações, recorrências, requisitos), 8 de Seguros/Garantias bancárias e 9 de Competências, mais 12 RPCs de RNC/Garantias. Chamada direta e tela recebem `42501`. Leitura (RLS) continua. As 6 RPCs liberadas continuam: `quality_ncr_create`, `quality_ncr_transition`, `quality_evidence_register`, `quality_warranty_create`, `quality_capa_register` (parcial) e `quality_warranty_transition`; a decisão técnica (CONFIRMADA/NAO_CONFIRMADA/ENCERRADA da RNC; COBERTA/NAO_COBERTA da garantia) é contida por competência (`COMPETENCE_REQUIRED`). **O que o usuário deve ver:** a operação NÃO acontece e a tela não quebra. O texto amigável "módulo em homologação" NÃO existe (pendência declarada no README, "a mensagem de `42501` chega à tela como o erro da RPC"): o critério é bloqueio visível e coerente, sem tela quebrada, sem stack trace, sem gravação parcial. Passos G-04 a G-10 e Q-04/Q-06 a Q-09 são os do roteiro `docs/homologacao-autenticada-roteiro.md`; aqui eles são tentados COM A EXPECTATIVA DE RECUSA.

| ID | Passos | Esperado | Evidência | Aprovado se / Reprovado se |
|---|---|---|---|---|
| I.00 | Eng. TI confirma a trava aplicada (P-07) e anota o resultado das 3 conferências (35/0; 6; 0 competências TECNICO_RESPONSAVEL ativas) | 35 travadas, 0 executáveis, 6 liberadas, 0 competências ativas | Saída (sem credenciais) | Aprovado: confere. **Reprovado P0 = NO-GO do bloco: trava não aplicada** (nada abaixo vale como bloqueado) |
| I.01 | Qualidade `/[projectId]/qualidade`: abrir cada aba bloqueada (custos, ensaios, inspeções, reclamações, recorrências, requisitos) e tentar gravar um registro `[ACEITE]` | Leitura abre; gravação recusada (`42501`/permissão negada); a lista não ganha registro; tela estável | Print da recusa; print da lista antes/depois | Aprovado: recusa sem quebrar. Reprovado P0: gravou; P1: tela quebrada/stack trace/500 |
| I.02 | Garantias: no caso de teste em `/[projectId]/garantias/[caseId]` tentar G-04 (vistoria, manutenção, reparo/custo), G-05/G-06 (editar causa/prazos/termos/custos), G-07 (aceite informado e comprovado), G-10 (parecer de cobertura); G-08 (encerrar) e G-06 decidir cobertura | G-04, G-05, G-06, G-07 e G-10 recusados (RPCs travadas); decisão de cobertura/encerramento recusada por competência (`COMPETENCE_REQUIRED`) ou impedida com a lista do que falta; leitura do caso abre | Print por tentativa | Aprovado: nada gravado. Reprovado P0: gravou; P1: erro cru |
| I.03 | RNC `/[projectId]/qualidade/rnc/[ncrId]`: Q-04 reclassificar evidência, editar campos (causa/prazo/responsável), executar CAPA (status), verificação de eficácia, consequências; tentar CONFIRMAR e ENCERRAR | Recusados; CONFIRMAR/ENCERRAR por competência; o que a trava deixa liberado (criar RNC, registrar evidência, avançar etapas operacionais) segue funcionando (I.06) | Prints | Aprovado/Reprovado como I.01 |
| I.04 | Seguros `/[projectId]/seguros`: abrir as abas (apólices, fianças, endossos, adiantamentos, sinistros, dossiês, minutas, canais, sujeitos/RCC) e tentar gravar/cadastrar/avançar/aprovar minuta com ADMINISTRADOR e com GESTOR | Leitura abre; escritas das 8 RPCs de Seguros/fiança travadas para TODOS (inclusive ADMINISTRADOR); NENHUM envio a seguradora; minuta permanece DRAFT | Prints | Aprovado: recusa e nada sai. **Reprovado P0: minuta enviada ou registro gravado** |
| I.05 | Competências `/[projectId]/competencias`: abrir e tentar solicitar/validar/revalidar competência | Tela abre (READ); as 9 RPCs travadas recusam; sem competência ativa por conta própria | Prints | Aprovado/Reprovado como I.01 |
| I.06 | CONTROLE POSITIVO: com COLABORADOR criar RNC `[ACEITE]` e registrar evidência (RPCs liberadas) e abrir caso de garantia `[ACEITE]` | Funcionam (confirma que o bloqueio é só das RPCs listadas e que a trava não quebrou o que foi homologado) | Prints; códigos | Aprovado: funcionam. Reprovado P1: bloqueadas |
| I.07 | Sem erro cru: em todos os I.01 a I.05, ler a mensagem exibida | Mensagem de recusa da RPC (técnica, ex.: permissão negada) sem stack trace, sem SQL, sem caminho de arquivo, sem chave/segredo; sem tela em branco; botão volta ao estado normal | Print da mensagem | Aprovado: sem stack/segredo. Observação P2 (conhecida): mensagem técnica `42501` sem texto amigável. Reprovado P1: stack trace/SQL/500; P0: segredo no erro |
| I.08 | Auditoria: após I.01 a I.05, abrir `/[projectId]/auditoria` | Nenhuma linha de escrita dos registros recusados; (se a trava foi aplicada na janela: uma linha `MODULE_LOCK_APPLIED` por obra) | Print | Aprovado: nenhuma escrita. Reprovado P0: gravou |
| I.09 | Isolamento no bloqueado: usuário de OUTRA obra abre `/[idOutraObra]/garantias/[caseId-da-TESTE]` (G-09) | Negado (a leitura de outra obra é recusada por RLS; G-09 não é bloqueio, é isolamento) | Print | Aprovado/Reprovado P0 |

### Bloco J - AXIA e ajuda (i) (executa: qualquer perfil; Qualidade e Jurídico fazem as perguntas de especialista)

Fonte: `docs/axia-conversa-natural.md`, `docs/email-respostas-lote3.md` ("A AXIA nunca é destino"), manual 1.4 e `apps/web/components/layout/app-sidebar.tsx` (ícone (i) dedicado ao lado de cada item, abre por clique, Enter, toque ou foco). A AXIA é assistente de USO da suíte: responde com texto aprovado da base de perguntas, cita a seção do manual, não lê dados de obra, documentos nem do usuário, e NÃO responde matéria de especialista (jurídica, técnica, contratual, SSMA). `AXIA_CHAT_PROVIDER` ausente = IA desligada; o caminho determinístico atende.

| ID | Passos | Esperado | Evidência | Aprovado se / Reprovado se |
|---|---|---|---|---|
| J.01 | Abrir "Fale com a AXIA" (topo das telas da obra) e perguntar: "Por que não vejo uma aba?" e "Como vejo os alertas?" | Resposta de USO, com a seção do manual e links da obra da sessão; coerente com o perfil (menu e rota seguem a mesma regra; peça ao ADMINISTRADOR em Usuários) | Print | Aprovado: resposta de uso com citação. Reprovado P1: resposta inventada/sem fonte |
| J.02 | Perguntar matéria de ESPECIALISTA: Jurídico: "Esta cláusula de multa é válida?"; Qualidade: "Posso confirmar a causa desta RNC?"; SSMA: "Este EPI atende à norma?" | A AXIA não responde o mérito; encaminha à Ajuda, aos Experts IA ou ao ADMINISTRADOR; não decide, não recomenda mérito | Print de cada | Aprovado: não responde o mérito. Reprovado P1: responde o mérito |
| J.03 | Perguntar por dado de obra: "Quantos alertas críticos estão abertos?" | Não lê dados da obra; orienta onde ver na tela; nada de números | Print | Aprovado: sem dado. **Reprovado P0: expõe dado de obra/de outra obra** |
| J.04 | Sidebar (i): para CADA item visível do menu clicar no ícone (i) ao lado (e repetir com Enter/teclado em um item) | Abre o texto de ajuda daquele item; fecha com ESC/novo clique; clicar no (i) NÃO navega; o link do item continua navegando | Print de 3 itens + vídeo curto opcional | Aprovado: todos abrem. Reprovado P2: item sem (i) ou ajuda vazia |
| J.05 | Experts IA (`/[projectId]/experts-ia`, `/[projectId]/experts-ia/descricao`, `/[projectId]/experts-ia/diretor-engenharia`): ler; distinguir da AXIA | Experts são o canal para análise de especialista (recomendação, com evidência e revisão humana); a AXIA não os substitui | Print | Aprovado/Reprovado P2 |
| J.06 | `/[projectId]/ajuda` (Ajuda e tutorial): abrir e achar a seção do perfil | Abre; conteúdo coerente com o manual | Print | Aprovado/Reprovado P2 |

### Bloco K - TopBar e identificação da obra (executa: qualquer perfil)

Fonte: `apps/web/components/layout/top-bar.tsx` (seletor de obra, "Contrato <número>", "Editar projeto" quando o perfil pode editar, atalho VERA, avatar, botão sair) e `docs/implantacao/18-homologacao-acelerada-20261122.md` (TopBar #13233b e identificação da obra: o código do projeto saiu da TopBar de propósito; entre 640 e 1279 px o seletor trunca e o código pode ser cortado: decisão de design pendente).

| ID | Passos | Esperado | Evidência | Aprovado se / Reprovado se |
|---|---|---|---|---|
| K.01 | Abrir qualquer tela da obra TESTE e da WEG (leitura): olhar a TopBar | A obra ativa é identificada no seletor pelo rótulo "CÓDIGO · nome" (ex.: "AXION-DEV-001 · ..." na WEG e "0001 · TESTE" na obra TESTE), com o código sempre no início, e, se houver, "Contrato <número>"; fica sempre claro em qual obra se está (TESTE x WEG) | Print da TopBar nas duas obras | Aprovado: obra identificável. Reprovado P1: não dá para saber a obra |
| K.02 | Abrir o seletor de obras (`/projetos` e o seletor da TopBar) | Lista SÓ as obras vinculadas à conta (conta de outra obra não vê a TESTE; sem vínculo vê nenhuma) | Prints | Aprovado/Reprovado P0 |
| K.03 | "Editar projeto" (`/projetos/[projectId]/editar`): conferir quais perfis veem o botão e abrem a rota; LEITURA e COLABORADOR tentam colar a URL | Visível só para quem pode editar; rota recusa os demais; NÃO DOCUMENTADO por perfil: OBSERVADO; qualquer perfil sem permissão que consiga gravar = P0 | Prints | Aprovado: coerente com recusa. Reprovado P0: grava sem permissão |
| K.04 | Larguras 360, 768 e 1280 px (janela redimensionada) | Sem rolagem horizontal da página; o CÓDIGO da obra visível no seletor em todas as larguras (o fim do nome pode ser cortado, o código não); botão sair, AXIA e Editar acessíveis e sem sobreposição. Conferir na TopBar REAL entre 640 e 1279 px (o teste automatizado não reproduz Editar, AXIA e Sair, então a coluna direita real é mais apertada): título descentralizado a 640 px é P3; itens sobrepostos é P2 | Prints das 3 larguras | Aprovado: sem quebra. Reprovado P2: itens sobrepostos |
| K.05 | Banner de modo teste | Anotar se o banner "em teste" aparece no ambiente da janela; em produção ele NÃO deve confundir o usuário com uma obra real | Print | Observação P2 (comparar com a decisão do Dono) |

## 6. Mapa de cobertura das 66 rotas (apêndice A)

Cada página `apps/web/app/**/page.tsx` aparece uma vez. "N/T" = não testada nesta aceitação (motivo na seção 9). Conferido por `scripts/test-aceitacao-roteiro.mjs`.

| Rota | Itens |
|---|---|
| `/` | A.01 |
| `/login` | A.01, A.02 |
| `/projetos` | A.07, K.02 |
| `/projetos/novo` | N/T: criação de obra (fora do escopo) |
| `/projetos/[projectId]/editar` | K.03 |
| `/projetos/[projectId]/copiar-estrutura` | N/T: cópia de estrutura de obra (fora do escopo) |
| `/vera` | N/T: VERA/voz (fora do escopo) |
| `/juridico` | D.05 |
| `/autorizacao-email/[authorizationId]` | N/T: autorização de caixa e delegação (fora do escopo) |
| `/email-actions/[token]` | G.03, B.17 |
| `/alertas/acao/[projectId]/[batchId]/[eventId]` | D.08 |
| `/alertas/lote/[projectId]/[batchId]` | D.08 |
| `/alertas/providencia/[projectId]/[itemId]` | C.06 |
| `/alertas/consulta-ia/[projectId]/[subject]/[id]` | N/T: consome IA real (fora do escopo) |
| `/ssma` | E.05 |
| `/ssma/[projectId]` | E.05, E.10 |
| `/ssma/offline` | E.06 |
| `/[projectId]/dashboard` | C.01, B.14 |
| `/[projectId]/dashboard/visual` | C.02 |
| `/[projectId]/pilares` | B.05 |
| `/[projectId]/timeline` | C.04 |
| `/[projectId]/auditoria` | H.01, B.18 |
| `/[projectId]/providencias` | C.03 |
| `/[projectId]/financeiro` | B.07 |
| `/[projectId]/juridico` | D.04 |
| `/[projectId]/juridico/consulta/[consultationId]` | D.05 |
| `/[projectId]/revisao-contratual` | N/T: fora da sidebar; coberto pelo Expert Jurídico (D.05) |
| `/[projectId]/revisao-clausulas` | N/T: fora da sidebar; coberto pelo Expert Jurídico (D.05) |
| `/[projectId]/documentos` | D.01 |
| `/[projectId]/documentos/versoes/[documentVersionId]` | D.02 |
| `/[projectId]/documentos/emails/[emailId]` | D.03 |
| `/[projectId]/documentos/emails/[emailId]/anexos/[attachmentId]` | D.03 |
| `/[projectId]/adicionais` | N/T: redirecionamento (fora do escopo) |
| `/[projectId]/adicionais/[proposalId]` | N/T: redirecionamento (fora do escopo) |
| `/[projectId]/ledger` | D.06, B.06 |
| `/[projectId]/ledger/[eventId]` | D.07, B.14 |
| `/[projectId]/ledger/lote-alertas/[batchId]` | D.08 |
| `/[projectId]/action-requests` | B.09, B.12 |
| `/[projectId]/action-requests/[actionRequestId]` | B.12 |
| `/[projectId]/acoes` | F.03 |
| `/[projectId]/acoes/configuracao` | F.01, F.02 |
| `/[projectId]/acoes/resumo-semanal/[digestId]` | F.09 |
| `/[projectId]/alertas/[caseId]` | F.04, B.14 |
| `/[projectId]/reemissao-alertas` | F.10, B.06 |
| `/[projectId]/esg` | E.01 |
| `/[projectId]/ssma-registros` | E.02, B.08 |
| `/[projectId]/ssma-avaliacao` | E.04 |
| `/[projectId]/qualidade` | I.01, B.09 |
| `/[projectId]/qualidade/rnc/[ncrId]` | I.03, B.14, B.15 |
| `/[projectId]/garantias` | I.02 |
| `/[projectId]/garantias/[caseId]` | I.02, B.14, B.15, I.09 |
| `/[projectId]/seguros` | I.04 |
| `/[projectId]/competencias` | I.05 |
| `/[projectId]/aprovacoes-externas` | B.10 |
| `/[projectId]/experts-ia` | J.05 |
| `/[projectId]/experts-ia/descricao` | J.05 |
| `/[projectId]/experts-ia/diretor-engenharia` | J.05 |
| `/[projectId]/experts-ia/diretor-planejamento` | C.05 |
| `/[projectId]/integracoes` | B.06 |
| `/[projectId]/integracoes/caixas` | B.06 |
| `/[projectId]/integracoes/contatos-externos` | B.06, B.10 |
| `/[projectId]/integracoes/sinais-email` | B.06 |
| `/[projectId]/autorizacoes` | B.06 |
| `/[projectId]/usuarios` | B.01, B.11 |
| `/[projectId]/startup` | B.06 |
| `/[projectId]/ajuda` | J.06 |

## 7. Critérios de parada e decisão

1. **NO-GO IMEDIATO (parar tudo, registrar, avisar o Dono):** qualquer falha P0 (segurança, isolamento entre obras, escrita não autorizada aceita, e-mail para destino fora de `crm@axion.com.br`/P-04, auditoria ausente ou editável, segredo/token exposto, GET que altera estado, LEITURA gravando, bloqueio da trava não efetivo). Não "tentar de novo para ver se passa": preservar a evidência.
2. **Parada de bloco:** falha P1 na função principal do bloco interrompe o bloco; os demais podem continuar se não dependem dele; o Dono decide o GO do conjunto.
3. **P2:** registrar e seguir; não bloqueia, mas entra no relatório.
4. **Pré-condição não atendida** (P-01 a P-12): não começar. Pré-condição que cai durante a janela (ex.: flag mudou): parar e anotar.
5. **GO da aceitação** = todos os itens obrigatórios APROVADOS (ou N/A justificado) nos blocos A, B, G.12, H, I e K.01/K.02, nenhum P0 e nenhum P1 aberto sem decisão do Dono. Itens BLOQUEADOS por SPF/DKIM (4.4, passo 7) tornam as respostas por e-mail "GO CONDICIONAL" a ser decidido pelo Dono (doc `06`, B3).
6. A decisão final é do Dono (doc `06`: NO-GO prevalece).

## 8. Formulário de registro de resultado (uma linha por item; preencher durante a execução)

Cabeçalho do registro: data, obra TESTE (nome, sem expor ids em canais abertos), versão do app (commit/hash), horário de início e fim, flags da tabela 4.2 (liga/desliga e quem conferiu), lista de testadores por papel (iniciais), local das evidências.

| Item | Executor (papel) | Início (hh:mm:ss) | Resultado (APROVADO / REPROVADO / BLOQUEADO / N/A) | Severidade (P0/P1/P2) | Evidência (arquivo) | ID/horário do registro criado | Observação | Decisão do Dono |
|---|---|---|---|---|---|---|---|---|
| A.01 | | | | | | | | |
| A.02 | | | | | | | | |
| A.03 | | | | | | | | |
| A.04 | | | | | | | | |
| A.05 | | | | | | | | |
| A.06 | | | | | | | | |
| A.07 | | | | | | | | |
| B.01 a B.18 | (uma linha por item) | | | | | | | |
| C.01 a C.08 | (uma linha por item) | | | | | | | |
| D.01 a D.09 | (uma linha por item) | | | | | | | |
| E.01 a E.10 | (uma linha por item) | | | | | | | |
| F.01 a F.11 | (uma linha por item) | | | | | | | |
| G.01 a G.12 | (uma linha por item) | | | | | | | |
| H.01 a H.07 | (uma linha por item) | | | | | | | |
| I.00 a I.09 | (uma linha por item) | | | | | | | |
| J.01 a J.06 | (uma linha por item) | | | | | | | |
| K.01 a K.05 | (uma linha por item) | | | | | | | |

Fechamento: totais (aprovados, reprovados por severidade, bloqueados, N/A); lista de P0/P1 abertos; recomendação do Eng. TI (GO / NO-GO / GO condicional); decisão e assinatura do Dono; data e hora; local seguro das evidências. Evidências originais não são apagadas (CLAUDE.md itens 9 e 10).

Assinaturas (papéis, sem nomes neste documento versionado): Dono; Eng. TI; Auditor; SSMA; Jurídico; Planejamento; Qualidade.

## 9. O que NÃO é testado nesta aceitação (e por quê)

| Não testado | Motivo |
|---|---|
| Data API desligada/religada | Ensaiada em homologação (doc `18`, ciclo 3: 24 OK / 0 FAIL); desligar na produção é decisão operacional separada, não de aceitação por usuários |
| Outlook / Microsoft Graph | Não há envio por Outlook/Graph no código; "Outlook" é só compatibilidade de renderização do HTML (doc `04`, seção 1); homologação visual em Outlook segue pendente no checklist próprio |
| Envio real a destinatários originais (`ACC_OUTBOUND_MODE=production`) | Fora de autorização; só após SPF/DKIM/DMARC e decisão expressa do Dono (doc `06`, B3 NO-GO hoje) |
| Publicação de SPF, DKIM e DMARC | Atividade de DNS (doc `04` e `13`); a aceitação apenas observa o efeito sobre as respostas por e-mail |
| Reemissão de alertas COM envio, envio real de Seguros (`ACC_INSURANCE_REAL_SEND_ENABLED`), WhatsApp (`ACC_WHATSAPP_ENABLED`) | Flags desligadas por padrão; envio real depende de decisão e aprovação humana |
| Aplicação de migrations, rollback, congelamento, pausa de jobs, backup/restore | Escopo dos docs `02`, `03`, `12`, `15`, `16`, `17`; feitos por Eng. TI, não por usuários |
| `service_role`, RLS ao nível de API por JWT, Storage com caminho de membro | Provas técnicas do doc `18` (kit de homologação); não são feitas por usuários de negócio |
| IA real (Experts e AXIA com provedor ligado), consulta `/alertas/consulta-ia/...` | Consumo e custo dependem de limites e orçamento do Dono (doc `06`, B5); só com autorização expressa |
| VERA (voz), `/vera` | Frente separada (`docs/vera-*`) |
| Criação e cópia de obra (`/projetos/novo`, `copiar-estrutura`), Adicionais, Revisão contratual e de cláusulas fora da sidebar | Funções administrativas ou cobertas pelo Expert Jurídico; não fazem parte do piloto |
| Autorização de caixa e delegação de domínio (`/autorizacao-email/...`, Integrações) | Dependem de autorizações individuais e delegação ainda pendentes (doc `05`); testadas só como NEGADO para não administradores (B.06) |
| Expiração de token (30 dias) | Não reproduzível numa janela; coberta por teste automatizado (`TOKEN_EXPIRED`) |
| Carga, concorrência, volume, acessibilidade formal | Fora do escopo de aceitação operacional |
| Dados reais da WEG em teste de escrita | Proibido: escritas só na obra TESTE com dados sintéticos |

## 10. Lacunas e ambiguidades registradas na preparação (para decisão do Dono/Eng. TI antes ou depois da janela)

1. A matriz de permissões do repositório cobre Qualidade, Garantias, Seguros e (nav) Competências/Aprovações externas. NÃO há matriz por perfil para Solicitações, Providências, SSMA, Documentos (além do upload), Jurídico, Ações/SLA, Competências (gravação) nem Editar projeto: nesses casos os itens são OBSERVADO, exceto a regra fixa de que LEITURA não grava.
2. GESTOR e GERENTE são o mesmo nível (MANAGE) na matriz; o manual 1.3 lista "Administrador, Gerente, Colaborador ou Leitura" e a UI mostra "Gerente". O roteiro usa uma conta de cada para provar a igualdade.
3. SLA: padrão do código = MÉDIO 2 d.u. / BAIXO 5 d.u. (aprovado), WEG = 1 / 3 até a decisão sobre a migration `20261121177000`. No backup de produção de 22/11 a WEG tem **uma** regra ativa por nível (as duplicatas históricas de CRÍTICO e ALTO estão inativas; 0 duplicidades ativas), então a aceitação deve encontrar uma regra por nível. A aceitação mede o PRAZO PARA ASSUMIR (1 h corrida, 4 h úteis, 1 d.u., 3 d.u.) e registra os intervalos que a tela mostrar; qual regra duplicada o motor aplica precisa de decisão.
4. Texto da recusa de módulo travado: `42501` técnico na tela, sem mensagem amigável (pendência do README da trava).
5. Nomes de `action` na auditoria só estão documentados para alertas, SLA, especialista, exceção de piloto e trava; o restante o Auditor registra do que aparece.
6. "Consulta guardada" de auditoria não existe no repositório (só filtros da tela). Modelo SQL somente leitura fornecido no bloco H.
7. Auditoria: RLS permite leitura a qualquer membro da obra; a tela é descrita como "supervisão para a Diretoria".
8. Piloto de e-mail: na obra WEG a entrega vai aos participantes fixos do código com Cc a `crm@axion.com.br`; fora da WEG o destino é só `crm@axion.com.br`. O documento obriga o bloco G à obra TESTE. Se o Dono quiser provar a entrega dirigida da WEG, é teste à parte, com autorização.
9. Respostas por e-mail dependem de SPF/DKIM/DMARC (ou da decisão sobre `ACC_EMAIL_WORKSPACE_TENANT_DOMAINS`); sem isso a recusa por `AUTH_*` é o comportamento correto e deixa as provas positivas BLOQUEADAS.
10. RESOLVIDO de caso ALTO sem anexo foi aceito em teste automatizado (doc `piloto-weg-e2e-ciclo-por-email.md`, B6) embora o atalho indique anexo obrigatório: decisão de produto pendente.
11. Cronograma: não há tela de importação manual documentada; a importação é por e-mail (flag `ACC_WEEKLY_REPORTS_ENABLED`).
12. Papéis Planejamento, Qualidade (separada de SSMA) e Auditor não constam nos docs `05`/`06`; definidos neste documento.
13. Subrotas de Integrações (caixas, contatos externos, sinais de e-mail): o menu restringe `integracoes` a ADMINISTRADOR, mas o roteiro de perfis do repositório espera GESTOR usando contatos externos e sinais; a regra efetiva por subrota não está documentada (B.06, B.10 observam).
14. TopBar: o código do projeto não aparece de propósito; entre 640 e 1279 px o nome pode truncar (decisão de design pendente, doc `18`).
