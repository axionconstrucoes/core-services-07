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
| Emitir / conferir / recusar endosso (MANAGE) | ✘ | ✘ | ✔ | ✔ | ✔ |
| Registrar adiantamento e amortização (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Abrir aviso/expectativa/reclamação de sinistro (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Andamento do sinistro: aviso, reclamação, documentação complementar, regulação (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Decisão da seguradora, negativa, contestação, indenização/cumprimento, encerramento (MANAGE) — **novo na Fase 3/B** | ✘ | ✘ | ✔ | ✔ | ✔ |
| Atualizar item do dossiê; criar/editar/cancelar minuta; tentar envio (bloqueado fail-closed) (REGISTER) | ✘ | ✔ | ✔ | ✔ | ✔ |
| Aprovar minuta para envio (ADMIN; envio real continua bloqueado por trava) | ✘ | ✘ | ✘ | ✘ | ✔ |
| Escrita direta nas tabelas, exclusão | ✘ | ✘ | ✘ | ✘ | ✘ |

## 4. Competência especializada (técnica / jurídica) — LACUNA declarada

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
