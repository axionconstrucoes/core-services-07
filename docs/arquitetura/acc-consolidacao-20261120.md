---
title: ACC — consolidação de arquitetura e integridade
date: 2026-11-20
status: implementado localmente, pendente de homologação e publicação
branch: integration/acc-consolidacao
tags:
  - acc
  - arquitetura
  - seguranca
  - experts-ia
---

# ACC — consolidação de arquitetura e integridade (20/11/2026)

> [!warning] Nada publicado
> Todo o trabalho está em branches **locais**. Nenhuma migration foi aplicada em produção, nenhum e-mail real foi
> enviado, nenhum push/merge/deploy foi feito. Mapa visual: [[acc-consolidacao-fluxo.canvas]].

## Branches e dependências

| Branch | Commit(s) | Base | Conteúdo |
|---|---|---|---|
| `review/pr-243-emails` | `750f79e` | PR #243 (`d8de792`) | layout universal e botões dos e-mails |
| `fix/integridade-operacional` | `baba746` | `750f79e` | operações por responsável, consistência, ENCAMINHAR SSMA, limite de IA |
| `fix/integridade-p0` | `a938ff9` | `baba746` | revalidação de `record_risk_alert_action` no servidor |
| `feat/p0p1-seguranca-consistencia` | `b3758dc` | `a938ff9` | P0/P1 (abaixo) |
| `feat/p2-acoes-por-email` | `d731e25`, `ce07257` | `a938ff9` | P2 |
| `feat/p3-experts-engenharia` | `7f37267` | `a938ff9` | P3 |
| `feat/p4-comercial-orcamentos` | `4b15617` | `a938ff9` | P4 |
| `integration/acc-consolidacao` | merges + `dee671e`, `b29f481` | `a938ff9` | integração das quatro frentes |

## Migrations locais (ordem de aplicação)

| Migration | Frente | Efeito |
|---|---|---|
| `20261120100000_sla_action_operations_by_responsible` | integridade | RPCs `sla_action_*` (responsável ou ADMINISTRADOR) |
| `20261120110000_risk_case_sla_consistency_guards` | integridade | travas no ledger de e-mail; auditoria de prazo |
| `20261120120000_ssma_forward_and_ai_consult_limits` | integridade | ENCAMINHAR SSMA; limite de consultas de IA |
| `20261120130000_risk_alert_action_server_side_guard` | P0 | transição de risco revalidada no banco |
| `20261120140000_ai_consult_reserve_global_user_lock` | P0 | trava usuário → obra |
| `20261120150000_weekly_digest_evidence_and_guards` | P0/P1 | resumo semanal com descrição/evidência e travas |
| `20261120151000_risk_alert_action_no_outbox_authorization` | P0/P1 | **autorização falha fechada (NULL)**; outbox não autoriza |
| `20261120152000_risk_sla_consistency_report_and_email_guards` | P0/P1 | view de divergências; e-mail recusa ação encerrada e LEITURA |
| `20261120153000_null_safe_authorization_checks` | P0/P1 | mesma classe de defeito nas ações SLA |
| `20261120160000_email_reply_tokens_and_ssma_by_email` | P2 | tokens por item, anexos, log de respostas, SSMA por e-mail |
| `20261120170000_ai_consult_all_expert_paths` | P3 | limite de IA em todos os caminhos de Expert |
| `20261120190000_null_safe_ssma_cores` | integração | núcleos SSMA falham fechado contra NULL |

> [!danger] Falha de autorização preexistente em produção
> Em `record_risk_alert_action` (produção), a expressão de permissão resultava `NULL` quando o caso não tinha
> responsável anterior; `if not NULL` não recusava — **qualquer membro ativo da obra, inclusive LEITURA, podia agir
> sobre um alerta de risco**. Consulta somente leitura em produção (20/11): **nenhum evento humano registrado** —
> não houve exploração. Correção: `20261120151000`. Mesma classe de defeito corrigida em `20261120153000` e
> `20261120190000`.

## Experts IA (runtime do ACC)

| Expert | Versão | Papel |
|---|---|---|
| `planning-director` | v6 | Diretor de Planejamento IA (cronograma, CPM, folgas, curva S, recursos, atrasos, recuperação, 4D) |
| `engineering-director` | v1 | **novo** — Diretor de Engenharia e Construção IA (fundações, estruturas, pisos, coberturas, métodos, construtibilidade, engenharia de valor, compatibilização) |
| `legal-consultant` | v6 | Consultor Jurídico IA |
| `commercial-director` | v5 | Diretor Comercial estratégico, integrado a Orçamentos (somente leitura, nunca inventa preço/margem) |
| `esg-director` | v4 | Diretor de ESG/SSMA IA |
| `ceo` | v4 | consolida pareceres com autoria, divergências e incertezas |

AXIA continua só como assistente de uso da suíte e **não participa** das consultas técnicas. O framework comum dos
especialistas passou a ser carregado no prompt de todos os Experts técnicos (antes não era).

> [!info] Skills
> `planejamento-obras-log-ind-saude` e `engenharia-industrial-logistica` existem só no ambiente Claude Code local
> (sincronizadas da conta, sem licença declarada). O runtime recebe **resumos técnicos próprios**
> (`apps/web/lib/ai/expert-knowledge/*`) com a procedência (sha256) registrada; o texto original não está no repositório.

### Roteamento por área e assunto

| Área / assunto | Expert |
|---|---|
| Planejamento | `planning-director` |
| Engenharia e construção | `engineering-director` |
| Jurídico | `legal-consultant` |
| Comercial, financeiro, orçamento | `commercial-director` |
| SSMA / ESG | `esg-director` |
| Dois ou mais temas | curadoria multi-Expert + consolidação CEO |

Contratos e riscos são roteados pelo assunto concreto (`apps/web/lib/ai/routing/expert-topics.ts`).

## Quatro botões por tipo de alerta

| Tipo | Na web | Por resposta de e-mail (R / A / E) |
|---|---|---|
| Risco imediato, escalonamento, acompanhamento | 4 ativos | ✔ / ✔ / ✔ (evidência por anexo em ALTO/CRÍTICO) |
| Risco consolidado (cada item) | 4 ativos | ✔ / ✔ (só registro em MÉDIO/BAIXO) / ✔ |
| Ação corretiva SSMA | RESOLVIDO e EM ANDAMENTO ativos; ENVIAR PARA e ESPECIALISTA atrás da chave de validação | ✔ (só com foto) / ✔ / ✔ |
| Contrato individual / lote | 4 ativos | pendente |
| Resumo semanal | 3 ativos | pendente |
| Escalonamento de SLA | desativados com motivo | pendente |
| Acidente, falha técnica, impacto de versão | desativados com motivo | sem processamento (sem mailto) |

ESPECIALISTA: consulta textual ao Expert da área, com limite de consumo; nunca altera estado, responsável, SLA ou
escalonamento.

## Testes (branch de integração)

| Suíte | Resultado |
|---|---|
| typecheck · lint · build | OK (lint: 0 erros) |
| `npm test` | 21/21 |
| `test:scripts` | 1200 OK, 0 falhas |
| `test:email` | 618 OK, 0 falhas |
| `test:sql` | 409 OK, 0 falhas |
| `test:alert-sim` | 62/62 |
| `test:ssma` | 186 OK, nenhum pulado |
| `test:alerts` (scripts individuais) | 490 OK, 1 falha preexistente (#59, trava de diff contra origin/main) |

## Pendências e decisões

- Homologação real: Gmail/Outlook (mailto, DMARC/DKIM internos, anexos), navegador autenticado em preview.
- Por e-mail: SLA_ACTION, resumo semanal e lote contratual (dependem de variantes `*_by_email`).
- Decisões de negócio: quem age em cada nível de escalonamento; sincronização automática do responsável
  caso × ação SLA; lote contratual concluir a ação SLA; integração com o sistema de Orçamentos.
- Repositório privado: ver [[../seguranca/plano-repositorio-privado]].
