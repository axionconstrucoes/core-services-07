# Matriz central de permissões — Qualidade, Garantias e Seguros (Fase 3 / B)

Fonte única: `public.acc_project_tier(project_id)` (migration `20261123100000`). Espelho na interface:
`apps/web/lib/permissions/project-tier.ts`. A interface NUNCA é a autoridade: o banco (RLS + RPCs) recusa o que a tela
esconder ou deixar passar. Provas: `scripts/test-permissoes-tier.mjs` (puro) e `scripts/test-permissoes-unificadas-realpg.mjs`
(Postgres real; CASO 31, 37 e 39).

## 1. Investigação das funções centrais existentes (NÃO alteradas)

| Função | Definição vigente | O que decide | Consumidores |
|---|---|---|---|
| `has_project_permission(projeto, mínimo)` | `20261121100000` (delega a `project_permission_for`; tabela de níveis em `20260829200000`) | Papel atual: ADMINISTRADOR/ADMIN = 3; GESTOR/GERENTE/COLABORADOR/LEITURA/EDITOR/VIEWER = 1. Mínimo: ADMINISTRADOR/ADMIN = 3; GESTOR/GERENTE/COLABORADOR/EDITOR = 2; LEITURA/VIEWER = 1. Só `status = 'ACTIVE'`. | 82 migrations / 207 ocorrências (policies RLS e RPCs). Na prática: `'ADMINISTRADOR'`/`'ADMIN'` (110 chamadas) exige administrador; `'EDITOR'` (29) e `'GESTOR'` (10) também exigem administrador (2 > 1); somente `'LEITURA'/'VIEWER'` abre para todos. |
| `project_permission_for(projeto, usuário, mínimo)` | `20260829200000` / `20261120160000` | Mesma tabela, com usuário explícito (worker de e-mail). Sem EXECUTE para public/anon/authenticated. | 5 migrations (SSMA por e-mail, ações corretivas). |
| `is_project_member(projeto)` / `project_member_active_for(projeto, usuário)` | `20261121100000` / `20261120160000` | Existe membership `ACTIVE`. | 66 migrations / 160 ocorrências. |
| `can_manage_project_documents(projeto)` | `20260829200000` | Lista fixa ADMINISTRADOR, GESTOR, GERENTE (Documentos). Sem EXECUTE para authenticated (só chamada interna). | 7 migrations (upload/promoção de anexos). |
| `project_memberships` | `20260824090000`, `20260829200000`, `20260911113000` | `permission` (ADMINISTRADOR, GESTOR, GERENTE, COLABORADOR, LEITURA), `status` (ACTIVE/INACTIVE), `area` (opcional: DIRETORIA, ADMINISTRATIVO, COMERCIAL, FINANCEIRO, ENGENHARIA, ORÇAMENTO, JURÍDICO, PLANEJAMENTO, COMPRAS, SSMA/ESG). PK `(project_id, user_id)`. Convite pendente (`project_member_invitations`) NÃO é membership. | todas as acima |

Conclusão: `has_project_permission` só tem DOIS degraus úteis (administrador vs. qualquer membro). Por isso Qualidade e
Seguros criaram listas próprias de papéis. Congelada por testes N1/S5 (não foi tocada). Esta frente cria UMA tabela para os
três módulos e faz os wrappers delegarem.

## 2. Função central

`acc_project_tier(p_project_id uuid) returns text` — `STABLE`, `SECURITY DEFINER`, `search_path = ''`, EXECUTE só `authenticated`.

| Situação | Nível |
|---|---|
| ADMINISTRADOR (legado ADMIN), membership ACTIVE no projeto | `ADMIN` |
| GESTOR ou GERENTE, ACTIVE | `MANAGE` |
| COLABORADOR (legado EDITOR), ACTIVE | `REGISTER` |
| LEITURA (legado VIEWER), ACTIVE | `READ` |
| membership INACTIVE, só convite pendente, outro projeto, papel desconhecido, projeto nulo/inexistente, sem `auth.uid()` (anon / authenticated sem sub / service_role sem sub) | `NONE` |

Wrappers finos (mesmas assinaturas e GRANTs; migration `20261123101000`): `quality_can_read` = tier ≥ READ;
`quality_can_register` = tier ≥ REGISTER; `quality_can_manage` = tier ≥ MANAGE; `insurance_access(projeto, 'READ'|'REGISTER'|'MANAGE'|'ADMIN')`
= tier ≥ nível; nível desconhecido = `false`.

### Mudanças de comportamento (todas documentadas)

1. **Nenhuma** para os cinco papéis possíveis hoje (provado contra as definições anteriores, para todos os perfis).
2. Papel desconhecido/legado inalcançável por constraint: antes `quality_can_read`/`insurance_access READ` aceitavam qualquer papel não nulo; agora
   papel desconhecido = `NONE` (fail-closed). `quality_can_register` passa a aceitar os legados ADMIN/EDITOR (como `insurance_access` já fazia).
3. **`insurance_claim_advance` (migration `20261123102000`)**: antes QUALQUER etapa exigia REGISTER, de modo que um COLABORADOR podia registrar a
   decisão da seguradora (deferido/indeferido), a negativa de cobertura, a contestação, a indenização/cumprimento e o encerramento do evento. Agora
   `DECISAO`, `NEGATIVA`, `CONTESTACAO`, `INDENIZACAO_CUMPRIMENTO` e `ENCERRADO` exigem MANAGE; as demais etapas seguem REGISTER. A interface
   (`claimStageLevel`, `levelForOp`, botões e formulário do sinistro) e os Hover Texts foram ajustados.

## 3. Matriz perfil × operação

Legenda: ✔ pode; ✘ recusado (`FORBIDDEN` / `AUTH_REQUIRED` / `permission denied`). Inativo, convite pendente, outro projeto, anon e
authenticated sem sub = sempre ✘ (nível NONE). Nível exigido entre parênteses.

### Qualidade e Garantias (RNC `quality_ncrs`, caso de garantia `quality_warranty_cases`)

| Operação | LEITURA | COLABORADOR | GESTOR | GERENTE | ADMINISTRADOR |
|---|---|---|---|---|---|
| Ler RNC, garantias, evidências, ações, custos (RLS select, READ) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Registrar RNC / abrir caso de garantia (`quality_ncr_create`, `quality_warranty_create`) (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Registrar evidência, ação corretiva, manutenção, vistoria, reparo, custo, consequência, recorrência, reclamação, inspeção, ensaio, requisito (RPCs `quality_*_register`; INSERT/UPDATE direto revogado na fase 3/D) (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Avançar fases operacionais: triagem, investigação, plano de ação, correção, verificação, vistoria, análise, reparo (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Decisões de gestão: confirmar / não confirmar, cancelar, duplicar, encerrar, reabrir, decidir cobertura (COBERTA / NAO_COBERTA), verificar reparo (MANAGE) | ✘ | ✘ | ✔ | ✔ | ✔ |
| Registrar verificação de eficácia (`quality_verification_register`, MANAGE) | ✘ | ✘ | ✔ | ✔ | ✔ |
| Alterar estado/versão/criticidade direto na tabela | ✘ | ✘ | ✘ | ✘ | ✘ (só via RPC; triggers barram também service_role/superusuário) |
| Apagar qualquer registro (evidência nunca é apagada, nem por superusuário) | ✘ | ✘ | ✘ | ✘ | ✘ (nunca) |

### Seguros, fianças, endossos, adiantamentos e sinistros

| Operação | LEITURA | COLABORADOR | GESTOR | GERENTE | ADMINISTRADOR |
|---|---|---|---|---|---|
| Ler apólices, fianças, endossos, sinistros, minutas, auditoria (READ) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Cadastrar/versionar apólice, partes, cláusulas; canal oficial; fiança bancária; outras garantias; sincronizar dossiê (MANAGE) | ✘ | ✘ | ✔ | ✔ | ✔ |
| Solicitar endosso; pôr endosso em análise (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Registrar emissão do endosso; recusar o endosso (`insurance_endorsement_advance`, MANAGE) | ✘ | ✘ | ✔ | ✔ | ✔ |
| Conferir endosso — aprovar ou recusar a conferência (`insurance_endorsement_review`, MANAGE; ver 3.1) — **Fase 3/C** | ✘ | ✘ | ✔ (*) | ✔ (*) | ✔ (*) |
| Registrar adiantamento e amortização (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Abrir aviso/expectativa/reclamação de sinistro (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Andamento do sinistro: aviso, reclamação, documentação complementar, regulação (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Decisão da seguradora, negativa, contestação, indenização/cumprimento, encerramento (MANAGE) — **novo na Fase 3/B** | ✘ | ✘ | ✔ | ✔ | ✔ |
| Atualizar item do dossiê; criar/editar/cancelar minuta; tentar envio (bloqueado fail-closed) (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Aprovar minuta para envio (ADMIN; envio real continua bloqueado por trava) | ✘ | ✘ | ✘ | ✘ | ✔ |
| Escrita direta nas tabelas, exclusão | ✘ | ✘ | ✘ | ✘ | ✘ |

### 3.1 Endossos: dupla conferência humana independente (Fase 3 / C)

Migration `20261123200000_endorsement_dual_review.sql`; provas: `scripts/test-endossos-dupla-conferencia.mjs` (puro) e
`scripts/test-endossos-dupla-conferencia-realpg.mjs` (Postgres real). Pedido de endosso NÃO é endosso emitido: o pedido continua separado do emitido, e a
comparação texto solicitado × emitido é preservada.

**Quando exige DUAS conferências.** Endosso que altera segurados, beneficiários/partes, obrigações garantidas, valores (importância segurada, limites, prêmio,
valor garantido) ou coberturas (cláusulas de cobertura/exclusão, sublimite, franquia). A classificação é o campo declarado `change_kinds` (valores validados pelo
banco). É **fail-closed**: sem classificação válida (ausente, lista vazia) = crítico; marcar qualquer item crítico = crítico; mesmo classificado como NÃO crítico
(prorrogação de vigência, dados cadastrais, outro sem item crítico), texto emitido DIFERENTE do solicitado = crítico (o texto emitido pode trazer alteração
crítica que ninguém pediu). A classificação na emissão só AUMENTA a criticidade; o banco recusa rebaixar (`CLASSIFICATION_DOWNGRADE`) e impede conferência simples
sem classificação inteiramente não crítica (CHECK). Não crítico + texto idêntico = conferência simples (1 aprovação).

**Regra de independência — SUBSTITUÍDA na Fase 4/A (ver seção 8).** A regra da Fase 3 (a mais estrita: o conferente não podia ser quem solicitou nem quem emitiu, ou seja, >= 4 pessoas) foi
redefinida pela migration `20261124102000`: na dupla conferência, cada conferente (1) tem MANAGE no projeto; (2) tem competência SEGUROS ou JURIDICO ativa no projeto
(`COMPETENCE_REQUIRED`); (3) NÃO é quem registrou a emissão (`REVIEWER_IS_ISSUER`); (4) é distinto do outro conferente e não confere duas vezes na mesma
rodada (`ALREADY_REVIEWED`, UNIQUE `(endosso, rodada, conferente)`). O SOLICITANTE pode conferir, se atender a (1) e (2). Registro histórico da Fase 3: o conferente também não podia ser o solicitante (`REVIEWER_IS_REQUESTER`, removido). Garantido no banco por CHECK sobre snapshots preenchidos por trigger (o cliente não os controla),
UNIQUE e trigger de guarda — não só pela RPC nem pela tela. Na conferência simples valem MANAGE e a regra de não repetir; a independência de solicitante/emissor não é
exigida (comportamento anterior preservado).

| Situação | Resultado |
|---|---|
| 1ª aprovação (dupla) | endosso segue EMITIDO, **sem** efeito de cobertura; versão +1 |
| 2ª aprovação independente | CONFERIDO, `coverage_effective = true` (conforme o TEXTO EMITIDO) |
| Recusa de qualquer conferente (nota >= 20 caracteres) | EM_REVISAO, sem efeito de cobertura; sai por nova emissão (abre nova rodada de conferências; histórico preservado) ou por RECUSADO |
| Divergência entre solicitado e emitido | aprovação exige nota >= 20 caracteres |
| Duas conferências simultâneas (mesma versão) | uma vence; a outra recebe `VERSION_CONFLICT`; a mesma pessoa em paralelo grava uma só |
| Endosso já CONFERIDO antes desta migration | permanece válido, `legacy_single_review = true` (conferência única histórica); não reabre; flag imutável |
| Endosso pendente (SOLICITADO/EM_ANALISE/EMITIDO) antes da migration | segue o fluxo novo; sem classificação = dupla conferência (fail-closed) |

Cada conferência é uma linha append-only em `insurance_endorsement_reviews` (autor, instante, resultado, nota, rodada, snapshots) e gera evento em `insurance_audit_events`
(`ENDORSEMENT_REVIEW_APROVADO` / `ENDORSEMENT_REVIEW_RECUSADO`, mais `ENDORSEMENT_CONFERIDO` / `ENDORSEMENT_EM_REVISAO` quando o estado muda). `insurance_endorsement_advance(..., 'CONFERIDO')` continua
aceito por compatibilidade, mas SEMPRE delega à conferência (nunca confere sozinho).

### Persistência de pareceres, checklist RCC e sujeitos esperados (Fase 3 / E; migrations `20261123400000`–`402000`)

Todas as tabelas são append-only (cada gravação é uma NOVA versão; UPDATE/DELETE/TRUNCATE bloqueados por trigger, inclusive para superusuário), com leitura
por RLS pelos wrappers centrais e ZERO escrita direta. Provas: `scripts/test-f3e-persistencia.mjs` (puro) e `scripts/test-f3e-persistencia-realpg.mjs` (Postgres real).

| Operação | RPC | Nível | LEITURA | COLABORADOR | GESTOR | GERENTE | ADMINISTRADOR |
|---|---|---|---|---|---|---|---|
| Gravar nova versão do parecer de cobertura de garantia (conclusão reverificada pelo banco) | `quality_warranty_opinion_save` | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ |
| Listar versões do parecer | `quality_warranty_opinion_versions` / RLS | READ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Gravar nova versão do checklist RCC (toda resposta com fonte) | `insurance_rcc_checklist_save` | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ |
| Ler checklist RCC | `insurance_rcc_checklist_get` / RLS | READ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Gravar sujeito esperado (segurado, beneficiário, final, tomador, titular), com fonte | `insurance_expected_subject_save` | MANAGE | ✘ | ✘ | ✔ | ✔ | ✔ |
| Ler sujeitos esperados | `insurance_expected_subjects_get` / RLS | READ | ✔ | ✔ | ✔ | ✔ | ✔ |

Decisão de nível: o parecer e o checklist são REGISTRO de análise (REGISTER, como as demais evidências); o sujeito esperado é o PARÂMETRO contra o qual a auditoria de
sujeitos confere a apólice — alterá-lo poderia mascarar um segurado incorreto, por isso MANAGE. Inativo, convite pendente, ADMIN de outro projeto, authenticated sem sub e anon: sempre recusados.

## 4. Competência especializada (técnica / jurídica) — LACUNA da Fase 3, RESOLVIDA na Fase 4/A (seção 8)

> Texto abaixo preservado como registro histórico da Fase 3. A opção (b) foi implementada: `project_competences` + `acc_has_competence` (seção 8).

A matriz-alvo pede que decisões especializadas (p.ex. confirmar a causa técnica de uma RNC, decidir cobertura de garantia, conferir um
endosso, registrar negativa de cobertura) exijam autoridade adequada. O atributo existente que poderia expressar isso é
`project_memberships.area`, mas ele é opcional, é uma classificação departamental atribuída por administrador (não há valor
QUALIDADE ou SEGUROS), não está ligado a alçada/cargo (`profiles.title` é texto livre) e nenhuma regra do sistema o trata como
competência. **Lacuna: não há atributo confiável de competência.** Em vez de inventar um, esta frente:

- NÃO usa `area` para conceder nem negar acesso;
- mantém as decisões especializadas em MANAGE (GESTOR/GERENTE/ADMINISTRADOR, conforme a matriz acima, sem reduzir nada já concedido ao COLABORADOR além do ajuste do sinistro);
- registra a exigência como DECISÃO DO DONO: se a Diretoria quiser que a decisão técnica/jurídica fique restrita a quem tem competência, as opções são
  (a) subir essas transições para ADMIN (basta mudar `min_role` do catálogo `quality_state_transitions`, os níveis de `insurance_int_require` e este documento) ou
  (b) criar um atributo explícito de competência por membro (ex.: tabela `project_member_competences` administrada só por ADMINISTRADOR) e uma segunda função
  `acc_project_can_decide(projeto, competência)` sobre `acc_project_tier`.

## 5. Observações para o dono (não alteradas nesta frente)

- RESOLVIDO na fase 3/D (seção 7): COLABORADOR não reclassifica evidência nem edita causa/prazos/custos/termos do caso de garantia; essas decisões passaram a MANAGE, com justificativa e auditoria antes/depois.
- Alterar papel/status de membro continua sendo operação de ADMINISTRADOR (RPCs de usuários, fora deste escopo); o nível muda na PRÓXIMA chamada (sem cache) — provado em teste.
- `service_role` (chave de servidor, nunca no frontend) tem BYPASSRLS por desenho do Supabase; as RPCs recusam `service_role` sem usuário (`AUTH_REQUIRED`).

## 6. Casos cobertos

- **CASO 31 (usuário sem autorização)**: para cada operação crítica acima, todos os perfis (LEITURA, COLABORADOR, GESTOR, GERENTE, ADMINISTRADOR, inativo, pendente, outro projeto, anon, authenticated sem sub, service_role sem sub) — autorizados passam; os demais são recusados sem nenhuma linha gravada.
- **CASO 39 (isolamento entre projetos)**: administrador de B não lê, cria, transiciona nem referencia dados de A; papel alto em outro projeto não vira privilégio; o nível vale só no projeto consultado.
- **CASO 37 (auditoria)**: recusas não geram auditoria; operações autorizadas geram trilha com o ator correto; trilhas continuam append-only.


## 7. Fase 3 / Frente D — RPCs transacionais, integridade e vínculos (migrations `20261123300000`..`303000`)

Toda RPC abaixo usa `quality_can_register` (REGISTER) ou `quality_can_manage` (MANAGE) — wrappers de `acc_project_tier` —, é `SECURITY DEFINER` com `search_path` vazio, só `authenticated`
(anon/PUBLIC sem EXECUTE), audita na MESMA transação e usa controle otimista (`expected_version` → `VERSION_REQUIRED`/`VERSION_CONFLICT`). O INSERT/UPDATE/DELETE direto de `authenticated`
nas 15 tabelas de Qualidade/Garantias foi REVOGADO (migration `20261123302000`, reversível: `supabase/rollbacks/`). Provas: `scripts/test-quality-rpc-realpg.mjs` (Postgres real; CASO 31/37/38/39 e `CASO F3-D-NN`).

| Operação (RPC) | Mínimo | LEITURA | COLABORADOR | GESTOR | GERENTE | ADMINISTRADOR | Regras adicionais |
|---|---|---|---|---|---|---|---|
| Registrar evidência (`quality_evidence_register`) | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ | fonte original obrigatória e imutável; NC_COMPROVADA exige epistêmico FATO; duplicata da mesma fonte no mesmo caso recusada; RNC cancelada/duplicada não recebe |
| Reclassificar evidência (`quality_evidence_revise`) | **MANAGE** | ✘ | ✘ | ✔ | ✔ | ✔ | justificativa >= 10; recusada (`EVIDENCE_LOCKED`) se a evidência já sustenta verificação, aceite ou decisão de transição |
| Registrar CAPA (`quality_capa_register`) | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ | RNC/garantia encerrada, cancelada ou fora do fluxo não recebe (`CASE_NOT_ACTIVE`) |
| Atualizar status da CAPA (`quality_capa_update_status`) | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ | transições válidas; CANCELADA exige MANAGE + justificativa; desfazer EXECUTADA exige justificativa |
| Verificação de eficácia (`quality_verification_register`) | MANAGE | ✘ | ✘ | ✔ | ✔ | ✔ | evidência obrigatória do mesmo caso e FATO; só em VERIFICACAO (RNC) / REPARADA (garantia); versão lida do caso |
| Aceite do cliente (`quality_warranty_acceptance_register`) | **MANAGE** | ✘ | ✘ | ✔ | ✔ | ✔ | decisão do dono: quem registra o aceite é gestão, com evidência FATO do caso, só em REPARADA/VERIFICADA; vale para um ciclo (novo reparo/reabertura o descarta) |
| Aceite do cliente COMPROVADO (`quality_warranty_acceptance_prove`; único que libera o encerramento — Fase 4/B; o `register` acima passou a gravar só o aceite INFORMADO) | **MANAGE** | ✘ | ✘ | ✔ | ✔ | ✔ | evidência FATO do caso (e-mail/documento), hash SHA-256, manifestante externo (e-mail que não é de membro ativo nem do registrante), data não anterior ao último reparo |
| Reparo / reincidência (`quality_warranty_repair_register`) | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ | custo só com fonte; reincidência aponta reparo anterior do MESMO caso |
| Vistoria, manutenção (`quality_warranty_survey_register`, `..._maintenance_register`) | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ | — |
| Consequência por pilar, custo, recorrência (`quality_consequence_register`, `quality_cost_register`, `quality_recurrence_register`) | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ | consequência exige fonte; probabilidade só com fundamento; valor de custo só com fonte; criticidade = pior pilar |
| Reclamação, inspeção, ensaio, requisito (`quality_complaint_register`, ...) | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ | fonte original obrigatória; ensaio conclusivo exige laudo |
| Editar título/descrição da RNC (`quality_ncr_update_fields`) | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ | diff no servidor |
| Editar causa raiz, prazo, responsável, requisito da RNC | **MANAGE** | ✘ | ✘ | ✔ | ✔ | ✔ | trocar causa raiz/prazo já definidos exige justificativa; RNC encerrada/cancelada não edita |
| Editar defeito, reclamação do cliente, fornecedor, contrato do caso (`quality_warranty_case_update`) | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ | diff no servidor |
| Editar causa, sinalizadores (vício oculto, solidez), prazos, custos, termos e datas de garantia, responsável, RNC vinculada | **MANAGE** | ✘ | ✘ | ✔ | ✔ | ✔ | justificativa quando já informados; custo só com fonte (`COST_SOURCE_REQUIRED`) |
| Relatório de integridade de encerramentos (`quality_closure_integrity_report`) | READ | ✔ | ✔ | ✔ | ✔ | ✔ | somente leitura |
| Vincular alerta a RNC/garantia/sinistro (`acc_alert_link_create`) | REGISTER | ✘ | ✔ | ✔ | ✔ | ✔ | alerta e entidade do MESMO projeto (`LINK_TARGET_INVALID`); idempotente; não altera estado da entidade |
| Desvincular (`acc_alert_link_unlink`) | **MANAGE** | ✘ | ✘ | ✔ | ✔ | ✔ | motivo >= 10; nada é apagado (histórico append-only) |
| Ler vínculos (`acc_alert_links_for_alert`, `acc_alert_links_for_entity`, RLS) | READ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Escrita direta nas 15 tabelas e em `acc_alert_links` | — | ✘ | ✘ | ✘ | ✘ | ✘ | só pelas RPCs |

Inativo, convite pendente, ADMIN de outro projeto, `authenticated` sem `sub` e `anon`: sempre ✘ (nível NONE; `AUTH_REQUIRED`/`FORBIDDEN`/`permission denied`).

### Mudanças de comportamento da fase 3/D (todas documentadas)

1. COLABORADOR deixa de: reclassificar evidência já registrada; editar causa raiz, prazo e responsável da RNC; editar causa/prazos/custos/termos/sinalizadores do caso de garantia; cancelar ação corretiva;
   registrar o aceite do cliente da garantia. Continua registrando evidências, ações, consequências, custos (com fonte), reparos, vistorias, reclamações e andamento operacional.
2. Registros-filhos não entram em RNC/garantia encerrada, cancelada, duplicada ou não confirmada (reabrir antes); evidência continua sendo aceita nesses casos (é o que sustenta a reabertura), exceto RNC cancelada/duplicada.
3. O aceite do cliente não sobrevive a novo reparo ou reabertura; a verificação de eficácia só aceita evidência classificada como FATO.
4. Novas colunas aditivas (`quality_warranty_cases.cost_source_ref`, `accepted_evidence_id`, `quality_warranty_repairs.cost_source_ref`); nenhuma coluna removida e nenhum dado apagado.
5. Triggers de integridade (`20261123300000`): estado só muda por transição do catálogo, com ator e com as mesmas guardas da RPC; UPDATE direto, `service_role` e superusuário não encerram sem verificação/aceite.

### Casos cobertos na frente D

CASO 1-9, 12-14, 31, 33-39 reexercitados por RPC e `CASO F3-D-01` (escrita direta negada), `-02` (COLABORADOR não reclassifica), `-03/03b` (campos e custos), `-04` (encerramento indevido da RNC por todos os caminhos), `-05` (garantia/aceite), `-06` (RESOLVIDO do alerta não encerra),
`-07` (reabertura), `-08` (evidência travada e nunca apagada), `-10` (vínculos), `-11` (backfill), `-12` (privilégios), `-14` (NC comprovada = FATO), `-15` (CAPA), `-18` (relatório de integridade), `-19` (reversibilidade).

## 8. Fase 4 / Frente D — menu por nível, rotas e destinatário externo (migration `20261127100000`)

### 8.1 Menu e rotas por nível

Fonte do nível: `acc_project_tier` (RPC; se a RPC ainda não existir no ambiente, a interface usa a MESMA tabela de papéis sobre a membership ATIVA — nunca abre mais do que ela permite). Regra pura: `apps/web/lib/permissions/nav-access.ts`
(`TIER_GATED_SEGMENTS`); servidor: `apps/web/lib/permissions/project-tier-server.ts`. O layout do projeto oculta os itens e um `layout.tsx` em cada segmento nega o acesso direto por URL (404).
O menu nunca é a barreira única: loader, actions, RPCs e RLS repetem a regra.

| Item do menu / rota | Nível mínimo | Espelho no banco | LEITURA | COLABORADOR | GESTOR | GERENTE | ADMINISTRADOR | inativo / pendente / outro projeto / sem login |
|---|---|---|---|---|---|---|---|---|
| Qualidade (`/qualidade`, `/qualidade/rnc/<id>`) | READ | `quality_can_read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ (item oculto, rota 404) |
| Garantias (`/garantias`, `/garantias/<id>`) | READ | `quality_can_read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| Seguros (`/seguros`) | READ | `insurance_access(.., 'READ')` | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| Quatro Pilares (`/pilares`) | READ | consolida Qualidade, Garantias e Seguros (leitura) | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| Itens `restrictedTo: "admin"` (Eventos, Integrações, Usuários, Autorizações, Reemissão, Start-up) | ADMINISTRADOR | `has_project_permission('ADMINISTRADOR')` | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| Financeiro | regra própria (`evaluateFinancialDashboardAccess`) | — | conforme regra | conforme regra | conforme regra | conforme regra | conforme regra | ✘ |

Hoje todo nível ATIVO lê os quatro módulos (é o que o banco faz); a diferença visível está entre ter membership ativa ou não. Se a Diretoria quiser esconder um módulo de um papel (por exemplo, Seguros para COLABORADOR),
basta subir o mínimo do segmento em `TIER_GATED_SEGMENTS` E o espelho no banco (`insurance_access`/RLS) — as duas pontas precisam mudar juntas; o teste `test-destinatarios-externos-realpg.mjs` (seção MENU) acusa divergência.
Provas: `scripts/test-menu-permissoes.mjs` (puro) e seção MENU de `scripts/test-destinatarios-externos-realpg.mjs` (paridade com o Postgres real).

### 8.2 Destinatário externo de e-mail

| Operação | Função / RPC | Quem | Regra |
|---|---|---|---|
| Validar e normalizar endereço | `acc_email_normalize` / `validateRecipientEmail` | servidor e banco | um único endereço, até 254 caracteres (local 64, rótulo 63), TLD alfabético, sem espaço/vírgula/ponto e vírgula/aspas/`<>`/controle (CR, LF, NUL, U+2028), domínios reservados recusados |
| Classificar domínio | `acc_recipient_domain_status` / `classifyRecipientDomain` | servidor e banco | INTERNO (TENANT, semente `axion.com.br`), PERMITIDO, EXTERNO; casamento EXATO (subdomínio não herda) |
| Confirmar destinatário externo | `acc_external_recipient_confirm` | GESTOR, GERENTE ou ADMINISTRADOR do projeto | motivo de 10 a 1000 caracteres; grava quem, quando, destinatário, domínio, contexto, motivo, fonte e nível |
| Ler a trilha | RLS de `external_recipient_confirmations` | MANAGE ou ADMIN do próprio projeto | append-only (nem superusuário altera/apaga); sem escrita direta |
| Canal oficial de Seguros (tipo e-mail) | gatilho `insurance_official_channels_recipient_guard` | quem cadastra (MANAGE) | domínio EXTERNO só entra com confirmação do MESMO usuário, projeto, contexto e endereço nas últimas 24 h; valor normalizado; canais legados intactos |

Pontos de destinatário encontrados e tratados: (1) **Solicitações** (`action-requests`, campo livre `recipientEmail`): validação e confirmação no servidor antes de emitir botões ou enviar; (2) **Canal oficial de Seguros** (campo `channel_value` do tipo e-mail): servidor + gatilho no banco.
Verificados e SEM digitação livre de destinatário externo: Alertas do ledger (`send-alert-actions`: destinatário é MEMBRO do projeto), Ações/escalonamentos (`acoes/actions`: e-mail do perfil de membro), Autorizações de e-mail (`accountEmail`: a RPC exige conta do domínio da empresa),
Integrações (`emailAddress`: padrão `@axion.com.br`), digests e SLA (destinatários vindos de membros) — nenhum aceita endereço externo digitado. Qualidade e Garantias não têm campo de destinatário de e-mail (só referência de fonte). Envio real continua impossível por este controle: nada aqui chama provedor de e-mail.
## 8. Fase 4 / Agente A — Competências profissionais e nova regra de conferência de endossos

Migrations `20261124100000_project_competences.sql`, `20261124101000_competence_enforcement.sql`, `20261124102000_endorsement_review_requester_competence.sql`
(com rollbacks em `supabase/rollbacks/`). Provas: `scripts/test-competencias.mjs` (puro), `scripts/test-competencias-realpg.mjs` (Postgres 17 real) e as suítes
`*realpg*` existentes, ajustadas para conceder competência nos fixtures.

### 8.1 Princípio

`acc_project_tier` (seção 2) continua medindo **AUTORIDADE DE GESTÃO**. **Competência** mede **HABILITAÇÃO PROFISSIONAL** declarada pelo Administrador do projeto
(responsável técnico, jurídico, seguros). Um GESTOR, GERENTE ou ADMINISTRADOR não é, pelo papel, responsável técnico nem advogado. A competência é **adicional** ao
nível: nunca o substitui (COLABORADOR com competência continua sem poder decidir) e o nível nunca substitui a competência.

### 8.2 Modelo

| Elemento | Regra |
|---|---|
| Tabela `project_competences` | membro, projeto, competência (`TECNICO_RESPONSAVEL`, `JURIDICO`, `SEGUROS` — lista fechada por CHECK), validade (`valid_from`, `valid_until` opcional), identificação profissional **opcional e declarada** (`registration_kind` CREA/CAU/OAB/SUSEP/OUTRO + `registration_number` texto, até 60), evidência (documento do MESMO projeto, opcional), observação, quem concedeu, quando, revogação (quem, quando, motivo) e `row_version` |
| Escrita | **somente** as RPCs `project_competence_grant` / `project_competence_revoke` (SECURITY DEFINER, `search_path` vazio); `INSERT/UPDATE/DELETE` diretos revogados de `anon`/`authenticated`; EXECUTE só para `authenticated` |
| Quem concede/revoga | **somente ADMINISTRADOR ativo do projeto** (`acc_project_tier = 'ADMIN'`); **ninguém concede a si mesmo** (`SELF_GRANT_FORBIDDEN`); o alvo precisa ser membro ATIVO do mesmo projeto; uma competência ativa por (projeto, pessoa, competência); revogação com motivo >= 10 caracteres e versão otimista; competência revogada não reabre (concede-se de novo) |
| Renovação | competência ATIVA mas já vencida não bloqueia nova concessão: é encerrada pelo sistema (evento `REVOKED` com `VENCIDA_SUBSTITUIDA`) e substituída |
| Imutabilidade | nunca é apagada; só a revogação altera o registro; trilha `project_competence_events` append-only (também para superusuário) + `audit_log_entries` na mesma transação |
| `acc_has_competence(projeto, competência)` | `true` só se: usuário autenticado, registro ACTIVE, `valid_from <= hoje <= valid_until` (inclusivo; sem fim = vale) e o usuário é membro ACTIVE do projeto. Qualquer outra coisa (anon, sem sub, projeto/competência nulos ou desconhecidos, vencida, futura, revogada, membro inativo/pendente, outro projeto) = `false` (fail-closed) |
| Identificação CREA/OAB | texto **declarado**; o sistema **não** valida junto ao conselho, não completa e não inventa (em branco = "Não informado") |

### 8.3 Atos que exigem competência (perfil × ato)

O nível exigido pela RPC (coluna "Nível") **continua valendo**; a competência é a segunda condição. Sem a competência: `COMPETENCE_REQUIRED` (transação inteira desfeita, nenhuma linha gravada).

| Ato | RPC | Nível | Competência exigida | Onde é imposto |
|---|---|---|---|---|
| Decisão da seguradora registrada | `insurance_claim_advance` → DECISAO | MANAGE | JURIDICO | gatilho em `insurance_claim_steps` |
| Negativa de cobertura | → NEGATIVA | MANAGE | JURIDICO | idem |
| Contestação | → CONTESTACAO | MANAGE | JURIDICO | idem |
| Indenização/cumprimento | → INDENIZACAO_CUMPRIMENTO | MANAGE | JURIDICO | idem |
| Aprovar minuta para envio | `insurance_draft_approve` | ADMIN | SEGUROS **ou** JURIDICO | gatilho em `insurance_drafts` |
| Conferir (ou recusar conferência de) endosso crítico | `insurance_endorsement_review` | MANAGE | SEGUROS **ou** JURIDICO (todo conferente) | RPC + gatilho em `insurance_endorsement_reviews` |
| Laudo técnico da RNC: confirmar / não confirmar / encerrar | `quality_ncr_transition` → CONFIRMADA, NAO_CONFIRMADA, ENCERRADA | MANAGE | TECNICO_RESPONSAVEL | gatilho em `quality_state_events` |
| Parecer de cobertura de garantia: coberta / não coberta | `quality_warranty_transition` → COBERTA, NAO_COBERTA | MANAGE | TECNICO_RESPONSAVEL | idem |

Por que gatilhos sobre as tabelas de registro dos atos (e não redefinição das RPCs): valem para qualquer caminho que grave o ato, o ator verificado é o **autor gravado no ato**
(`created_by`/`actor_user_id`/`approved_by`, que as RPCs preenchem com `auth.uid()`), e as RPCs mantidas por outras frentes não são sobrepostas. Ato sem autor atribuído (NULL)
só existe em carga de manutenção por superusuário (nenhuma RPC o produz).

Perfil × concessão/revogação de competência (prova em `test-competencias-realpg`): ADMINISTRADOR ✔ (nunca a si mesmo); GESTOR, GERENTE, COLABORADOR, LEITURA, inativo, convite
pendente, ADMIN de outro projeto, authenticated sem sub, anon ✘ (e GESTOR **com** competência também ✘).

Não exigem competência (decisão consciente): etapas operacionais do sinistro (AVISO, RECLAMACAO, DOC_COMPLEMENTAR, REGULACAO), **ENCERRADO** do sinistro (permanece ato de gestão
MANAGE), cancelamento/duplicidade de RNC, triagem/investigação, verificação de eficácia, aceite do cliente, reparo. Se o dono quiser mais atos sob competência, é acrescentar a
etapa/estado ao gatilho e à matriz TS (`lib/permissions/competences.ts`).

### 8.4 Endossos críticos — regra substituta da Fase 3 (migration 20261124102000)

| Pessoa | Pode conferir endosso crítico? |
|---|---|
| Emissor (quem registrou a emissão) | **Não** (`REVIEWER_IS_ISSUER`; CHECK no banco) |
| Solicitante | **Sim**, se MANAGE **e** competência SEGUROS/JURIDICO; senão `COMPETENCE_REQUIRED` / `FORBIDDEN` |
| Qualquer outro MANAGE | Sim, se tiver a competência |
| Mesma pessoa duas vezes na rodada | Não (`ALREADY_REVIEWED`) |

São necessárias **duas** conferências aprovadas de pessoas distintas, ambas diferentes do emissor. Mínimo de pessoas: solicitante + emissor + 1 segundo conferente = 3 (antes: 4).
Auditoria: cada conferência grava `reviewer_is_requester` e `reviewer_competence` (snapshots por gatilho) além dos snapshots de solicitante e emissor; o evento de auditoria inclui
`reviewerIsRequester`. Conferência SIMPLES (não crítico, texto idêntico) e endossos legados (conferência única histórica) **não mudam**. A cláusula "texto emitido divergente do
solicitado = dupla conferência" foi **MANTIDA**: a nova regra não a torna desnecessária (o texto emitido pode trazer alteração crítica que ninguém pediu). Solicitado, emitido e
conferido continuam sendo etapas registradas, cada uma com seu autor; o banco não força que solicitante e emissor sejam pessoas diferentes (nunca forçou).

### 8.5 Decisões e riscos para o dono

1. **Antes de aplicar as migrations 20261124\* no operacional**, o Administrador precisa conceder as competências (senão decisões técnicas/jurídicas e conferência de endosso
   crítico ficam bloqueadas por desenho — fail-closed). A tela está na aba Auditoria de Seguros; **não há página própria** de competências (fica fora do menu até a Fase 4/D definir a navegação).
2. **Autoconcessão proibida**: projeto com um único Administrador não consegue conceder competência a si mesmo; precisa de um segundo Administrador (ou carga de manutenção autorizada).
   Alternativa (não adotada): permitir autoconcessão com marca visível.
3. O sistema **não valida** CREA/OAB; a concessão é uma declaração do Administrador. Validação junto ao conselho é decisão futura.
4. `ENCERRADO` do sinistro e o aceite do cliente não exigem competência; confirmar se devem.
5. `acc_has_competence` consulta só o próprio usuário (sem parâmetro de pessoa), para não vazar competência alheia.

## 5. Fase 4 / B — Seguros e Garantias: novas operações e níveis (nenhum nível existente mudou)

| Operação | Nível | Observação |
|---|---|---|
| Registrar termos do CONTRATO ou da APÓLICE para a conferência de coerência (`insurance_instrument_terms_save`) | MANAGE | fonte obrigatória; append-only |
| Registrar termos da MINUTA (`insurance_instrument_terms_save`) | REGISTER | idem |
| Justificar divergência de coerência (`insurance_coherence_justify`) | MANAGE | texto de 20 a 4000 caracteres + fonte; só minuta em DRAFT |
| Consultar coerência, prontidão do RCC e consolidado de adiantamentos (`insurance_coherence_check`, `insurance_rcc_readiness`, `insurance_advances_consolidated`) | READ | somente leitura |
| Aprovar minuta (`insurance_draft_approve`) | ADMIN (inalterado) | agora também exige coerência: termos dos três instrumentos e nenhuma divergência sem justificativa |
| Atualizar fiança/caução (`bank_guarantee_update`, `other_guarantee_update`) | MANAGE (inalterado) | agora exige fonte da mudança e motivo; grava histórico append-only |
| Decisão, indenização/cumprimento, negativa, contestação (`insurance_claim_advance`) | MANAGE (inalterado) | agora exigem nota (>= 20) e fonte; RC cruzada exige checklist RCC pronto em Decisão/Indenização |
| Aceite COMPROVADO da garantia (`quality_warranty_acceptance_prove`) | MANAGE | ver tabela de Qualidade e Garantias |
| Listar histórico de aceites (`quality_warranty_acceptances_list`) | READ | |

Provas: `scripts/test-f4b-garantias-seguros-realpg.mjs` (CASO F4-B-R04 e R13: 10 perfis; LEITURA, COLABORADOR, GESTOR, GERENTE, ADMINISTRADOR, inativo, convite pendente, outro projeto, anon, authenticated sem sub).

Lacuna que PERMANECE (decisão do dono): competência técnica/jurídica do usuário não é verificada além do nível MANAGE (escopo A da Fase 4 trata da tabela de competências); a conferência humana da identidade do manifestante e do hash também permanece humana.

## 9. Fase 5 / Frente E — governança: habilitação validada, caso encerrado e envio externo de uso único

Migrations `20261205100000_competence_validation_requests.sql`, `20261205101000_closed_case_material_change_guards.sql` e `20261205102000_external_send_single_use_confirmation.sql` (rollbacks em `supabase/rollbacks/`). Provas: `scripts/test-f5-e-governanca.mjs` (puro) e `scripts/test-f5-e-governanca-realpg.mjs` (Postgres 17 real). Esta seção SUBSTITUI a regra de concessão da seção 8.2 (Fase 4/A) e acrescenta as demais.

### 9.1 Competência especializada só com validação INDEPENDENTE de habilitação

| Regra | Efeito |
|---|---|
| Conceder competência é SOLICITAÇÃO (`project_competence_requests`) | Só ADMINISTRADOR do projeto solicita (inclusive para si). A solicitação NÃO produz poderes (`grantsAuthority=false`). Exige documento de habilitação do próprio projeto. |
| Validação independente | Quem valida é diferente de quem solicitou E de quem recebe: (a) segundo ADMINISTRADOR ativo do projeto, ou (b) VALIDADOR DESIGNADO. Exige confirmar que a evidência foi conferida e nota >= 20 caracteres. Solicitação vence em 30 dias. |
| Organização com administrador único | O administrador designa um validador (pessoa externa/diretoria): documento da designação (ata/ofício), prazo máximo de 180 dias, ACEITE do próprio designado, revogável por ele ou pelo administrador; trilha append-only. O validador NÃO vira membro nem lê dados da obra; só valida solicitações. |
| CREA/OAB/SUSEP | Continua TEXTO declarado; NUNCA comprova habilitação. Sem a validação, nenhuma autoridade especializada. |
| Caminho antigo | `project_competence_grant` e INSERT direto (authenticated, service_role) são recusados (`HABILITATION_VALIDATION_REQUIRED`). Carga por superusuário fora da aplicação fica `MAINTENANCE` (vale, mas identificável). Linhas já existentes ao aplicar a migration ficam `UNVALIDATED` (sem poder até nova validação). |
| Decisões | `acc_user_has_competence` exige `habilitation_status in (VALIDATED, MAINTENANCE)`; todas as exigências da seção 8.3 passam a valer só com habilitação validada. |

### 9.2 Caso encerrado (RNC, garantia, sinistro)

Já existia: RPCs de Qualidade recusam edição/filhos em caso fechado; reabertura de RNC/garantia é transição auditada (MANAGE, justificativa + evidência). Fechado agora no banco (vale também para service_role/superusuário): UPDATE material de RNC/garantia ENCERRADA, filhos novos (CAPA, eficácia, vistoria/manutenção/reparo, custos) e UPDATE/passo novo em sinistro ENCERRADO são recusados (`CLOSED_CASE_IMMUTABLE`). Evidência NOVA continua aceita (aditiva; caminho da reabertura). Sinistro: reabertura auditada `insurance_claim_reopen` (MANAGE; destino DOC_COMPLEMENTAR/REGULACAO/CONTESTACAO; motivo >= 20 + fonte; evento append-only). Registro complementar controlado `acc_closed_case_complement_add` (MANAGE/ADMIN; só caso encerrado; fonte obrigatória; não altera o original).

### 9.3 Envio externo: confirmação de uso único

| Etapa | Quem | Regra |
|---|---|---|
| Preparar (`acc_external_send_prepare`) | COLABORADOR ou acima | Destinatários (até 20, validados) + ação + SHA-256 do conteúdo + versão. Nada é enviado. |
| Aprovar/recusar (`acc_external_send_decide`) | GESTOR, GERENTE ou ADMINISTRADOR; minuta de Seguros só ADMINISTRADOR | Destinatário externo exige motivo >= 10. Grava uma confirmação por externo, ligada à preparação (ação + hash). |
| Usar (`acc_external_send_consume`) | SÓ quem aprovou | Mesmos destinatários, ação e hash aprovados; vale 24 h; consome UMA vez (chave primária em `external_recipient_confirmation_uses`). Conteúdo alterado = nova aprovação. Não envia: o envio real segue as travas do ACC. |
| Canal oficial de Seguros | GESTOR+ | A confirmação passa a ser consumida no cadastro (uso único), não mais reutilizável por 24 h. |

Sem allowlist: qualquer domínio externo VÁLIDO pode ser preparado/analisado e, quando autorizado, usado; `acc_recipient_domains` só dispensa a confirmação (TENANT/PERMITIDO). LEITURA/consulta de mensagens já recebidas ou enviadas NÃO passa por este fluxo e não exige a aprovação excepcional de novo envio.

### 9.4 Decisões e riscos para o dono
- O segundo administrador pode ser uma conta cadastrada pelo próprio solicitante; a independência real depende de quem cadastra administradores. O validador designado reduz o risco, mas a designação é feita pelo administrador: recomenda-se que o dono mantenha a lista de validadores aceitos.
- Linhas de competência já existentes ficam UNVALIDATED: se algum ambiente já usa competências, será preciso revalidar.
- Não há tela para solicitar/validar competência nem para preparar/aprovar envio externo (apenas RPCs e módulos TS): UI pendente.
