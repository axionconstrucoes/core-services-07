# ACC — Inventário mestre de requisitos

Atualizado em 18/11/2026, na branch `feat/template-universal-alertas` (base `origin/main` = `a732eae`, que é também o que está em Production).

**Legenda:** 🟢 homologado (código + testes + evidência) · 🟡 parcial ou não publicado · 🔴 ausente ou não iniciado.
Nenhum item está 🟢 em Production: tudo abaixo está em branch/PR, sem merge e sem deploy. Evidência visual: `docs/homologacao/template-universal-20261118/index.html`.

## Distinção das evidências visuais

| Tipo | O que é | Usado em |
|---|---|---|
| 1. HTML real do template | Saída dos montadores do ACC com dados fictícios, aberta no Chrome (desktop e celular emulado) | 12 imagens de e-mail |
| 2. Página simulada | Componente real em página isolada, ações do servidor trocadas por stubs inertes | 8 imagens de interface (`interface/`) |
| 3. Interface autenticada real | Sessão real no ACC com dados reais | **Nenhuma** (sem sessão autorizada) |
| 4. Gmail/Outlook | Renderização efetiva nos clientes | **Nenhuma** (não verificado) |

## Requisitos

| ID | Requisito (decisão aprovada) | Estado | Código / branch | Testes | Production | Pendência |
|---|---|---|---|---|---|---|
| R-01 | Dropdown ENVIAR PARA azul-marinho escuro, letras brancas, item selecionado destacado | 🟡 | `components/risk-alerts/alert-action-forms.tsx` (`#0B1F3A`, selecionado `#315783`, `color-scheme:dark`) | `test-alert-action-forms-ui`; cor computada no Chrome `rgb(11,31,58)/branco`; classes presentes no CSS compilado | Não | Lista **aberta** (popup nativo) não aparece em captura headless; navegação por teclado é a nativa do `<select>`; alinhar com o PR #192 (Select compartilhado) |
| R-02 | Template universal único (logo oficial vinho/branco, paleta aprovada, MÉDIO azul, BAIXO verde) | 🟡 | `lib/email/templates/universal-alert-template.ts`, `universal-alert-actions.ts`, `alert-box-style.ts` | `test-universal-alert-template` (25) | Não | Ver cobertura por módulo abaixo |
| R-03 | Quatro botões: RESOLVIDO / EM ANDAMENTO / ENVIAR PARA (cinza `#6B7280`) + ESPECIALISTA (laranja `#C2410C`) | 🟢* | idem | `test-universal-alert-template`, `test-alert-box-templates`, `test-contract-alert-batch` | Não | *homologado só em HTML real; não em Gmail/Outlook |
| R-04 | ESPECIALISTA somente consulta (opção A): sem estado, sem escalonamento por consulta | 🟢* | `lib/ai/alert-consult/*` (assunto `risco`), `alert-action-forms.tsx`, `alertas/[caseId]/actions.ts` (recusa a ação antiga na web) | `test-pilot-risk-alert-actions` itens 57, 58, 63, 66 | Não | *resposta real da IA não testada (nenhuma IA foi chamada); `AXIA_CHAT_PROVIDER` segue `off` |
| R-05 | RESOLVIDO com confirmação, solução e evidência; tique verde | 🟡 | `alert-action-forms.tsx`, `alertas/[caseId]/page.tsx` | itens 60 do piloto; UI | Não | Tique só aparece após registro real: não verificado com sessão autenticada |
| R-06 | EM ANDAMENTO: calendário, ALTO/CRÍTICO data+hora, MÉDIO/BAIXO data, providências | 🟡 | idem | itens 61 do piloto; UI | Não | Calendário nativo não capturável; abre por `showPicker()` só com gesto do usuário |
| R-07 | ENVIAR PARA: só membros ativos da obra, justificativa opcional, auditoria, prazo preservado | 🟡 | idem + `alert-detail-data.ts` | itens 62 do piloto | Não | Sem sessão real; a Matriz hoje escalona imediatamente em ALTO/CRÍTICO (regra existente, não alterada) |
| R-08 | Alertas de risco (imediato, escalonamento, acompanhamento) no template | 🟢* | `risk-alerts/build-risk-alert-emails.ts`, `run-risk-alert-cycle.ts` | `test-risk-alert-email-theme`, `test-pilot-risk-alerts`, `test-pilot-risk-alert-audit` | Não | *sem envio real |
| R-09 | Consolidado com quatro botões por ocorrência e tique verde | 🟢* | idem | `test-pilot-risk-alerts` | Não | e-mails já entregues são estáticos |
| R-10 | Alertas de contrato (individual e lote) no template | 🟡 | `contract-alert-template.ts`, `contract-alert-batch-template.ts` | `test-alert-box-templates`, `test-contract-alert-batch` | Não | ESPECIALISTA usa a consulta existente de evento; sem URL fica desativado com motivo |
| R-11 | Template em SLA, SSMA, financeiro, suprimentos e demais e-mails | 🔴 | — | — | Não | Cada fluxo tem backend de ação próprio (tokens `ACKNOWLEDGE` etc.); sem os quatro botões |
| R-12 | AXIA no cabeçalho sem depender da IA generativa | 🟢* | `vera-email-header.ts` | `test-email-authorization` | Não | `ACC_AXIA_EMAIL_HEADER=off` desliga; nada liga provedor de IA |
| R-13 | Redeploy Production com leitura de respostas (`crm@`) | 🟢 | sem código novo | Mailbox Check `ok:true`; dry-run zerado | `dpl_GS1neZBrXW7Ztem3E6k4AUy56zd6` | Gate no lado da Vercel (`PROCEEDED_NO_REPLY`) ainda não observado |
| R-14 | Usuários: ATIVO `#39FF14`, EXCLUIR DO PROJETO, dropdowns da Matriz, barra lateral | 🔴 | PRs #192, #193, #194 abertos, não revisados | — | Não | Não iniciado nesta branch |
| R-15 | Matriz de precedência documental (Jurídico → Base documental) | 🔴 | branch `feat/matriz-precedencia-por-item-20261118` **não existe** neste repositório | — | Não | Migrations a preparar, sem aplicar |
| R-16 | AXIA — memória corporativa evolutiva e "FONTE DA IA / SKILLS / FONTES" | 🔴 | — | — | Não | Não iniciado |
| R-17 | Detecção de insatisfação (tensão relacional × risco contratual) | 🔴 | branch `feat/sinais-relacionais-email-20261118` **não existe** neste repositório | — | Não | Localizar o código (outro clone/máquina?) antes de reutilizar |
| R-18 | Reconciliação de SLAs (6 h úteis / 12 h úteis / 2 d.u. / 5 d.u.) | 🟡 | Matriz atual do banco diverge nos quatro níveis | — | Não alterados | Decisão por projeto; sem alteração automática |
| R-19 | SSMA, Planejamento e Dashboard (PRs #190, #191, #195) | 🔴 | PRs abertos, não revisados nesta rodada | — | Não | — |
| R-20 | Aba Administração de Integrações: menos espaço entre caixas | 🟡 | `app/[projectId]/integracoes/page.tsx` e 3 formulários (gaps menores) | build ok | Não | Sem verificação visual (tela exige sessão de administrador) |

## Cobertura do template por módulo

| Módulo / e-mail | No template universal? |
|---|---|
| Alertas de risco: imediato, escalonamento, acompanhamento | Sim |
| Consolidado semanal de risco (MÉDIO/BAIXO) | Sim |
| Alerta de contrato (individual e em lote) | Sim (painel de quatro botões) |
| Escalonamento de SLA (`sla-escalation-template`) | Não |
| SSMA (acidente, notificações de campo) | Não |
| Resumo semanal de alertas (`weekly-alert-digest-template`) | Não |
| Lembretes de contrato e de entrega, saúde do sistema | Não |

## Branches, PRs e worktrees inspecionados

- `origin/main` = `a732eae` = Production. Nenhuma alteração em SLAs, cron, migrations, workflows, credenciais ou destinatários nesta branch.
- Esta branch: 4 commits à frente de `main`, sem push até este documento.
- Branches citadas e **não encontradas**: `feat/template-universal` (o trabalho está em `feat/template-universal-alertas`), `feat/sinais-relacionais-email-20261118`, `feat/matriz-precedencia-por-item-20261118`.
- PRs abertos relevantes: #229 e #230 (Draft, preservados), #203 (Draft, agendador), #190, #191, #195 (dashboard), #192, #193, #194 (Select, participantes, migration), #164, #137, #185.
- Worktrees de outros trabalhos (20, incluindo `acc-axia-wip`, `acc-ssma-*`, `acc-fix-*`) não foram tocados.
