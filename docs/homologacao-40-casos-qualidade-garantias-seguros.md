# Homologação local — 40 casos (Qualidade, Garantias, Seguros e Sinistros)

Gerado em 20/11/2026 sobre `integration/acc-noturna`. Tudo local: nenhuma migration aplicada ao Supabase operacional, nenhuma IA real, nenhum e-mail, aviso ou endosso real enviado.

## Níveis de prova

- **BANCO**: Postgres 17 real local (`test-quality-realpg`: 30 OK; `test-insurance-realpg`: 19 OK), com replay de todas as migrations em base descartável.
- **DOMÍNIO**: funções puras (`test-quality-domain` 20 OK; `test-insurance-domain` 20 OK; `test-quality-insurance-experts` 36 OK).
- **UI-ESTÁTICO**: análise do código das telas e actions com cliente simulado (`test-quality-ui` 17 OK; `test-garantias-ui` 18 OK; `test-seguros-ui` 27 OK; `test-pilares-dashboard` 15 OK; `test-quality-sources-ingestion` 16 OK).
- **CHROME**: navegador real (`test-seguros-browser` 8 OK; `test-help-browser --sweep` 50 OK, 1.490 painéis).

## Matriz

| Caso | Tema | Testes que o nomeiam | Nível |
|---:|---|---|---|
| 1 | Falha estrutural em execução | quality-domain, quality-realpg, quality-sources-ingestion, quality-ui | BANCO + DOMÍNIO |
| 2 | NC em foto do SSMA | idem | BANCO + DOMÍNIO |
| 3 | Reclamação de cliente por e-mail | quality-realpg, quality-ui | BANCO |
| 4 | Reclamação por e-mail AXION | quality-insurance-experts, quality-realpg, quality-ui | BANCO |
| 5 | Indício em diário de obra | quality-domain, quality-insurance-experts, quality-realpg, quality-ui | BANCO |
| 6 | Relatório de fiscalização | quality-insurance-experts, quality-realpg, quality-ui | BANCO |
| 7 | Defeito pós-entrega | garantias-ui, quality-insurance-experts, quality-realpg | BANCO + DOMÍNIO |
| 8 | Pintura | idem | BANCO + DOMÍNIO |
| 9 | Impermeabilização | idem | BANCO + DOMÍNIO |
| 10 | Máquina em garantia | garantias-ui, quality-insurance-experts | DOMÍNIO |
| 11 | Máquina após término contratual | garantias-ui, quality-insurance-experts | DOMÍNIO |
| 12 | Vício oculto | garantias-ui, quality-insurance-experts, quality-realpg | BANCO + DOMÍNIO |
| 13 | Solidez e segurança | idem | BANCO + DOMÍNIO |
| 14 | Ausência de comprovantes de manutenção | garantias-ui, quality-insurance-experts, quality-realpg, quality-sources-ingestion | BANCO |
| 15 | Performance Bond por inadimplemento | insurance-domain, insurance-realpg, seguros-ui | BANCO |
| 16 | Performance Bond por atraso | idem | BANCO |
| 17 | Adiantamento não amortizado | idem | BANCO |
| 18 | Fiança bancária | idem | BANCO |
| 19 | RCC entre subcontratadas | insurance-domain, seguros-ui | DOMÍNIO (sem banco) |
| 20 | Danos à própria obra | insurance-domain, seguros-ui | DOMÍNIO (sem banco) |
| 21 | Segurado incorreto | insurance-domain, insurance-realpg, seguros-ui | BANCO |
| 22 | Beneficiário final não identificado | idem | BANCO |
| 23 | Endosso solicitado e pendente | idem | BANCO |
| 24 | Endosso efetivamente emitido | idem | BANCO |
| 25 | Aviso de sinistro | idem | BANCO |
| 26 | Expectativa de sinistro | insurance-realpg (CASO 25/26/27/28 agrupados), insurance-domain, seguros-ui | BANCO |
| 27 | Regulação | insurance-realpg (CASO 25-28 agrupados: linha do tempo completa), insurance-domain, seguros-ui | BANCO |
| 28 | Negativa de cobertura | insurance-realpg (negativa e contestação), insurance-domain, quality-insurance-experts, seguros-ui | BANCO |
| 29 | Apólice ausente | insurance-domain, insurance-realpg, quality-insurance-experts, seguros-ui | BANCO |
| 30 | Seguradora indisponível | + quality-sources-ingestion | BANCO |
| 31 | Usuário sem autorização | garantias-ui, insurance-realpg, quality-realpg, seguros-browser e outros | BANCO + CHROME |
| 32 | Envio real bloqueado | insurance-domain, insurance-realpg, seguros-ui, quality-sources-ingestion | BANCO |
| 33 | Dados insuficientes | 10 testes (quality, insurance, garantias, pilares, seguros) | BANCO + DOMÍNIO |
| 34 | Impactos simultâneos nos 4 pilares | pilares-dashboard, quality-domain, quality-realpg, quality-ui | BANCO + DOMÍNIO |
| 35 | RNC com encerramento indevido | idem | BANCO + DOMÍNIO |
| 36 | Reabertura de RNC | quality-domain, quality-realpg, quality-ui | BANCO |
| 37 | Auditoria | insurance-realpg, quality-realpg, seguros-ui, quality-ui, insurance-domain | BANCO |
| 38 | Concorrência | 8 conexões simultâneas: exatamente uma vence (insurance-realpg, quality-realpg); UI com conflito de versão (seguros-browser) | BANCO + CHROME |
| 39 | Isolamento entre projetos | insurance-realpg, quality-realpg (RLS + FK composta), demais por análise estática | BANCO |
| 40 | Regressão completa do ACC | `test:scripts` 1.606 OK (98+ scripts), `test:sql` 677, `test:email` 753, `test:alerts` 519, `test:ssma` 186, `test:alert-sim` 62, lint, `tsc`, build, Chrome 50/50 | REGRESSÃO |

## Limites que esta matriz NÃO esconde

- **Casos 19 e 20 (RCC, danos à própria obra)** têm prova só no domínio: a análise é checklist e regra, não há tabela de respostas (o checklist RCC não é persistido).
- **Casos 25 a 28** estão agrupados em um único teste de banco real (`insurance-realpg`), com a máquina de estados completa (expectativa só com base contratual da própria apólice, aviso, reclamação, regulação, negativa, contestação, decisão, indenização, encerrado).
- **Casos 10 e 11 (máquina)**: a conclusão é derivada por regra a partir de sinais preenchidos por humano; não há IA real nem fatos reais por trás, e o banco só constata fatos (não conclui exclusão de garantia).
- **Nenhum caso foi executado com IA real** nem com dados operacionais. A triagem usa provedor simulado, desligado por padrão.
- **Telas de Qualidade, Garantias e Pilares não foram exercitadas em sessão autenticada** com Supabase real; a verificação é estática, com cliente simulado e, no módulo de Seguros, harness Chrome com stubs.
- **Isolamento entre projetos** está provado em banco real para as tabelas de Qualidade e Seguros; nas telas, por análise estática (filtro por `project_id`, sem service role).
- **Vigência e texto oficial** de Lei 15.040/2024, Circular SUSEP 662/2022, NBR 14037 e NBR 15575 não foram confirmados no texto oficial; os testes verificam que o sistema declara isso, não que as normas estejam aplicadas corretamente. Exige parecer jurídico humano.

## Fase 3 / E — atualização dos limites (persistência)

- **Casos 19 e 20 (RCC entre subcontratadas, danos à própria obra)** agora têm prova em BANCO: o checklist RCC é persistido (`insurance_rcc_checklists`/`_items`, append-only, fonte obrigatória) e `test-f3e-persistencia-realpg` o exercita; o domínio continua não presumindo cobertura.
- **Casos 21 e 22** passam a comparar a apólice com expectativas GRAVADAS (`insurance_expected_subjects`, com fonte e versão), não apenas com texto digitado.
- **Casos 10 a 14 e 33** têm parecer de cobertura de garantia persistido por versão (`quality_warranty_coverage_opinions`) com a conclusão REVERIFICADA em SQL (paridade TS x SQL em 5.184 combinações).
- Defeitos corrigidos na revisão funcional (cada um com teste em `scripts/test-f3e-revisao-funcional.mjs`): garantia legal potencial com prazo FORA não é mais "potencialmente coberto"; restrição sem fonte aplicável ao evento não é mais ignorada; data do evento com hora no último dia da vigência não é "fora da vigência"; "1.500" em Garantias é R$ 1.500; etapas de fiança/caução não usam termos da seguradora.


## Reexecução da Fase 3 (20/11/2026, sobre `integration/acc-noturna`)

Os 40 casos foram reexecutados depois das frentes B (permissões unificadas), C (dupla conferência de endossos), D (RPCs transacionais e vínculos) e E (persistência e revisão funcional). Nada foi aplicado ao Supabase operacional; a única leitura operacional foi a Frente A (função `record_risk_alert_action`: **PROTEGIDO**, corpo idêntico ao corrigido por MD5).

### Regressão completa

| Verificação | Resultado |
|---|---|
| `test:scripts` (lista `scripts/test-scripts.list`) | 114/114 scripts, 1.676 OK, 0 falha |
| `test:sql` | 688 OK |
| `test:email` / `test:alerts` | 753 / 519 OK |
| `test:ssma` / `test:alert-sim` | 186 / 62 OK |
| lint / `tsc` / build | verdes |
| Chrome real, varredura do catálogo | 50/50 (1.528 painéis, desktop e celular) |
| Chrome real, Seguros | 9/9 |
| Contraste (auditor) | 16 reprovações conhecidas, nenhuma nova |

### Postgres 17 real (todos os testes `*realpg*` da árvore final)

| Teste | OK |
|---|---:|
| test-quality-realpg | 30 |
| test-quality-rpc-realpg (RPCs transacionais, encerramento indevido, vínculos) | 54 |
| test-insurance-realpg | 19 |
| test-endossos-dupla-conferencia-realpg | 20 |
| test-f3e-persistencia-realpg | 14 |
| test-permissoes-unificadas-realpg | 31 |
| test-lote4-isolation-realpg | 19 |
| test-ssma-esg-concurrency-realpg | 18 |
| test-reissue-approval-realpg | 10 |
| test-email-specialist-realpg | 6 |

### Casos novos da Fase 3 (nomeados `CASO F3-x-NN`)

- **F3-C** (endossos): autoconferência dupla, conferente igual ao solicitante, conferente igual a quem emitiu, mesmo usuário em duas conferências, corrida de conferências, conferência simples, fail-closed, recusa e EM_REVISAO, dados legados, integridade, envio real bloqueado, replay idempotente.
- **F3-D** (RPCs): escrita direta negada em todas as tabelas, COLABORADOR não reclassifica evidência nem edita campos e custos, encerramento indevido por todos os caminhos (RPC, UPDATE direto, superusuário, service_role, INSERT já encerrado, salto de estado, verificação forjada), RESOLVIDO de alerta não encerra, reabertura, evidência travada, vínculos estruturados e backfill, privilégios, reversibilidade.
- **F3-E** (persistência): parecer imutável e append-only, conclusão adulterada rejeitada, versão que substitui a anterior, checklist RCC com fonte obrigatória, sujeitos esperados comparados com a apólice, isolamento entre projetos, concorrência de duas versões.
- **Permissões**: 22 operações x 9 perfis (LEITURA, COLABORADOR, GESTOR, GERENTE, ADMINISTRADOR, inativo, convite pendente, ADMIN de outro projeto, authenticated sem sub), mais anon e service_role sem usuário.

### Limites declarados

- **Nenhuma tela foi homologada em sessão autenticada.** Não havia credencial legítima disponível e o login não foi contornado. As telas de Qualidade, Garantias, Seguros, Pilares, SSMA e Alertas foram verificadas por análise estática, cliente simulado e harness de Chrome com stubs (Seguros, catálogo de Hover Text e sidebar). **Telas não vistas não são declaradas homologadas.**
- A competência técnica ou jurídica do usuário não é verificada além do nível MANAGE: não há atributo confiável de competência por membro (lacuna declarada em `docs/permissoes-matriz-central.md`).
- Seguros e Qualidade nunca foram exercitados contra o Supabase operacional, porque as migrations 20261122*/20261123* não estão aplicadas lá.
