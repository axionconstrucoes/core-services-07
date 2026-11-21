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
- (Fase 3, SUPERADO na Fase 4/A) A competência técnica ou jurídica não era verificada além do nível MANAGE. Agora há `project_competences` + `acc_has_competence`, mas a competência é **declarada** pelo Administrador: o sistema não valida CREA/OAB. Ver `docs/permissoes-matriz-central.md` seção 8.
- Seguros e Qualidade nunca foram exercitados contra o Supabase operacional, porque as migrations 20261122*/20261123* não estão aplicadas lá.

## Fase 4 / D — casos novos (autorização, menu e destinatário externo)

Provas: `scripts/test-menu-permissoes.mjs` (10 OK), `scripts/test-destinatarios-externos.mjs` (17 OK), `scripts/test-destinatarios-externos-realpg.mjs` (17 OK em Postgres 17 local), `scripts/test-seguros-browser.mjs` B10 (Chrome real, dados sintéticos). Nenhuma tela foi vista em sessão autenticada real: ver `docs/homologacao-autenticada-roteiro.md` (todas NÃO EXECUTADO).

| Caso | Tema | Prova | Nível |
|---|---|---|---|
| F4-D-01 | Menu: LEITURA, COLABORADOR, GESTOR, GERENTE e ADMINISTRADOR ativos veem Qualidade, Garantias, Seguros e Pilares; inativo, pendente, outro projeto e sem login não veem | test-menu-permissoes, MENU (realpg) | PURO + BANCO |
| F4-D-02 | Rota direta negada (404) para quem não tem nível, em todas as subrotas dos quatro segmentos | test-menu-permissoes | UI-ESTÁTICO |
| F4-D-03 | Menu == banco: tier de `acc_project_tier`, `quality_can_read` e `insurance_access` coincidem com a visibilidade; mudança de papel vale na próxima chamada | MENU (realpg) | BANCO |
| F4-D-04 | Validação de e-mail no servidor: sintaxe, normalização, limites, domínio reservado, injeção de cabeçalho (CR/LF/NUL/U+2028), lista de destinatários | test-destinatarios-externos + PARIDADE (realpg) | PURO + BANCO |
| F4-D-05 | Destinatário externo sem confirmação é recusado; com confirmação sem motivo é recusado; só gestão confirma | test-destinatarios-externos, realpg | PURO + BANCO |
| F4-D-06 | Trilha de confirmação (quem, quando, destinatário, motivo) append-only, inclusive para superusuário; RLS só gestão do próprio projeto | realpg | BANCO |
| F4-D-07 | Canal oficial de Seguros tipo e-mail: confirmação de outro usuário/projeto/contexto/endereço ou expirada não vale; canal legado intacto | realpg | BANCO |
| F4-D-08 | Formulário de canal com confirmação e motivo: ajuda, rótulos, 44 px, contraste (desktop e celular) e envio de confirmação ao servidor | seguros-browser B10 | CHROME |
## Fase 4 / Agente A — Endossos e competências (casos `CASO F4-A-nn`)

Casos 31, 37 e 39 reforçados para as operações que passaram a exigir competência. Provas: `test-competencias` (puro, 9 OK), `test-competencias-realpg` (Postgres 17 real, 15 OK),
`test-endossos-dupla-conferencia` (11 OK) e `test-endossos-dupla-conferencia-realpg` (20 OK, regra nova), além das suítes `*realpg*` existentes com competência nos fixtures.
Nível de prova: BANCO + DOMÍNIO + UI-ESTÁTICO. **Nenhuma tela foi vista em sessão autenticada nesta fase**; o painel de competências e os bloqueios proativos só foram verificados
por tipos, lint, análise estática e Hover Text.

| Caso | Tema | Teste |
|---|---|---|
| F4-A-01 | espelho TS de `acc_user_has_competence` (vigente, vencida, futura, revogada, outro usuário/projeto, membro inativo) | competencias |
| F4-A-02/03 | matriz de atos e paridade TS × SQL dos gatilhos | competencias |
| F4-A-04/05 | contrato estático das migrations (RLS, zero escrita direta, append-only, sem anon, independência só do emissor) | competencias |
| F4-A-06/07 | allowlist de operações, validações, mensagens claras (`COMPETENCE_REQUIRED` não substituída por nível) | competencias |
| F4-A-08/09 | UI (bloqueios proativos, painel só por Server Action, sem segredo no cliente) e Hover Text/manifesto | competencias |
| F4-A-10 | estrutura no banco: RLS, grants, funções fechadas | competencias-realpg |
| F4-A-11 | concessão: matriz negativa por perfil (LEITURA, COLABORADOR, GESTOR, GERENTE, inativo, pendente, outro projeto, anon, sem sub, GESTOR com competência) | competencias-realpg |
| F4-A-12 | validações de concessão: autoconcessão, membro, lista fechada, validade, registro declarado, evidência de outro projeto, duplicada | competencias-realpg |
| F4-A-13 | `acc_has_competence` (vigência, membro inativo, projeto) e paridade com o TS | competencias-realpg |
| F4-A-14 | revogação (só ADMIN, motivo, versão, efeito imediato, imutabilidade, histórico) | competencias-realpg |
| F4-A-15 | sinistro: decisão/negativa/contestação/indenização por papel e por competência (só SEGUROS/TÉCNICO não basta) | competencias-realpg |
| F4-A-16 | minuta: ADMINISTRADOR sem competência de minuta recusado; GESTOR com JURIDICO recusado por nível; envio real continua desligado | competencias-realpg |
| F4-A-17/18 | Qualidade: laudo técnico da RNC e parecer de cobertura de garantia por papel e por competência | competencias-realpg |
| F4-A-19 | efeito imediato da revogação, vencimento, escrita direta por superusuário, carga de manutenção sem autor | competencias-realpg |
| F4-A-20 | auditoria: eventos e auditoria central, append-only | competencias-realpg |
| F4-A-21 | isolamento entre projetos e RLS de leitura | competencias-realpg |
| F4-A-22 | concorrência: 6 concessões e 6 revogações simultâneas | competencias-realpg |
| F4-A-23 | endosso crítico: competência exigida de todo conferente; solicitante confere; emissor barrado | competencias-realpg |
| F4-A-24 | idempotência (3 aplicações) e base legada: decisões antigas permanecem; atos novos exigem competência | competencias-realpg |
| F3-C-01..04 (reescritos) | independência: emissor, repetição, não-gestor e sem competência barrados; solicitante com competência confere | endossos-dupla-conferencia (puro e realpg) |

Limites: a competência é declarada pelo Administrador (CREA/OAB não são validados); nenhuma tela foi homologada em sessão autenticada; as migrations 20261124* não foram aplicadas ao Supabase operacional.
## Fase 4 / B — Garantias (aceite comprovado) e Seguros (coerência, fundamentação, fonte, consolidação)

Escopo B da Fase 4 (migrations `20261125100000`..`203000`; nada aplicado ao Supabase operacional). Casos novos nomeados `CASO F4-B-NN` (puros) e `CASO F4-B-Rnn` (Postgres 17 real, base descartável com replay de todas as migrations reaplicadas 2x).

| Caso | O que prova | Teste | Nível |
|---|---|---|---|
| F4-B-01..03 | Aceite do cliente: situação (sem aceite, informado, comprovado, legado), bloqueio de encerramento espelhando o banco, validação do aceite comprovado (evidência e-mail/documento FATO, hash SHA-256, data, manifestante externo, posterior ao reparo) e máquina de estados TS | `test-f4b-garantias-seguros` | DOMÍNIO |
| F4-B-04 | CPF/CNPJ pelos dígitos verificadores, normalização e igualdade de partes | `test-f4b-garantias-seguros` | DOMÍNIO |
| F4-B-05 | Coerência minuta x apólice x contrato (7 campos), valor ausente não diverge, instrumento ausente = SEM DADOS, justificativa presa ao fingerprint | `test-f4b-garantias-seguros` | DOMÍNIO |
| F4-B-06..07 | Fundamentação de sinistro (nota >= 20 + fonte) e fonte + motivo na atualização de fiança/caução | `test-f4b-garantias-seguros` | DOMÍNIO |
| F4-B-08 | Consolidação de adiantamentos sem dupla contagem (duplicidades, amortização acima, teto, centavos) | `test-f4b-garantias-seguros` | DOMÍNIO |
| F4-B-09..11 | Cláusula genérica não prova cobertura; RC cruzada exige RCC pronto; prontidão do RCC; identificação de partes (documento inválido/ausente/duplicado) | `test-f4b-garantias-seguros` | DOMÍNIO |
| F4-B-12..13 | Migrations (RLS, append-only, sem grant a anon, search_path vazio, rollback, inventário); níveis de autorização e Hover Text das operações novas | `test-f4b-garantias-seguros` | ESTÁTICO |
| F4-B-R01 (casos 36, 35) | Aceite informado não encerra; comprovado libera; 24 recusas (papéis, hash, contato, manifestante interno, evidência de tipo/caso errado, anterior ao reparo, versão); histórico append-only; novo ciclo na reabertura | `test-f4b-garantias-seguros-realpg` | BANCO |
| F4-B-R02 (caso 35) | Aceite comprovado nunca nasce por atalho (UPDATE, superusuário, INSERT); legado já encerrado continua válido; legado aberto exige novo aceite | idem | BANCO |
| F4-B-R03 (casos 37, 38, 39) | Concorrência (um vence), RLS por projeto, anon, escrita direta negada, auditoria com hash e manifestante | idem | BANCO |
| F4-B-R04 (casos 31, 39) | Termos dos instrumentos por perfil (10 perfis x 3 operações), fonte obrigatória, append-only, isolamento | idem | BANCO |
| F4-B-R05 | Coerência: SEM_DADOS, divergente, justificada, nova versão reabre o bloqueio, paridade TS x SQL (texto canônico e md5), aprovação mantém as guardas antigas e audita a coerência | idem | BANCO |
| F4-B-R06 | Paridade TS x SQL em lote determinístico (CPF/CNPJ, normalização de texto, igualdade de partes) | idem | BANCO |
| F4-B-R07 (casos 21, 22) | Partes: documento válido e obrigatório quando identificado, dedupe por documento/nome, reativação, NAO_IDENTIFICADO explícito, legado preservado | idem | BANCO |
| F4-B-R08 (caso 20) | Cláusula de cobertura exige identificação; genérica e legado sem identificação não provam cobertura | idem | BANCO |
| F4-B-R09 (casos 25..28) | Decisão/Indenização/Negativa/Contestação sem nota ou sem fonte bloqueadas; RC cruzada exige RCC pronto; paridade da prontidão RCC TS x SQL | idem | BANCO |
| F4-B-R10 (caso 18) | Atualização de fiança/caução exige fonte + motivo; histórico antes/depois append-only; versão otimista; isolamento | idem | BANCO |
| F4-B-R11 (caso 17) | Adiantamentos consolidados: paridade TS x SQL, duplicidades, amortização acima, teto, isolamento | idem | BANCO |
| F4-B-R12 | Privilégios (anon sem EXECUTE, authenticated só RPC), RLS, idempotência (3 aplicações), hotfix P0 intacto | idem | BANCO |
| F4-B-R13 (caso 31) | Autorização negativa por perfil (10 perfis) nas RPCs de aceite | idem | BANCO |
| B10 | Seguros no Chrome: coerência (divergência, termos, justificativa), fundamentação da decisão, fonte na atualização de fiança, consolidado; desktop e 390 px; contraste e alvos 44 px | `test-seguros-browser` | CHROME |
| G1..G4 | Garantias no Chrome: situação do aceite (4 estados), formulário do aceite comprovado (evidência filtrada, hash, recusa do banco, conflito de versão), perfil sem gestão, 390 px, contraste, axe-core | `test-garantias-browser` | CHROME |

### Mudanças de comportamento da Fase 4/B (documentadas)

- **Garantias**: `quality_warranty_acceptance_register` passou a gravar aceite **INFORMADO** (não libera o encerramento). O encerramento exige aceite **COMPROVADO** (`quality_warranty_acceptance_prove`). Encerrada antes da regra continua válida (legado); caso aberto com aceite legado precisa de novo aceite comprovado.
- **Seguros**: a aprovação de minuta ligada a apólice exige os termos de contrato, apólice e minuta e coerência (ou divergência justificada com texto e fonte); decisão, indenização, negativa e contestação exigem nota (>= 20 caracteres) e fonte; atualização de fiança/caução exige fonte e motivo; cobertura exige identificação da cláusula; segurado, beneficiário, proprietário final e titular identificados exigem documento fiscal válido (senão `NAO_IDENTIFICADO`).
- **Limites**: o sistema registra e compara o que foi DECLARADO nos termos; não lê o PDF do contrato/apólice nem recalcula o hash a partir do arquivo; a conferência da evidência, do hash e da identidade do manifestante continua humana. Nenhuma tela foi homologada em sessão autenticada.
