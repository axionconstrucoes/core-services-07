# Fase 6 / H2b — Pilares, revisão de sinais e organizações externas globais

Migrations: `20261209100000_email_signal_pillars_and_review` e `20261209101000_external_org_global_admin_and_change_requests` (rollbacks em `supabase/rollbacks/`). Nada foi aplicado no Supabase operacional; validado em Postgres 17 local descartável.

## 1. Pilares e áreas funcionais (decisão 7)

Pilares: somente **PRAZO, CUSTO, SEGURANCA, QUALIDADE**. **Jurídico e Comercial são áreas funcionais** (`email_risk_signals.functional_area`), não pilares.

Mapeamento (fonte no banco: `email_signal_functional_area_for` / `email_signal_impact_pillar_for`; espelho TS: `lib/email-classification/pillars.ts`; paridade provada em `test-f6-h2b-sinais-pilares`):

| Tipo de sinal | Pilar (impacto) | Área funcional |
|---|---|---|
| ATRASO_FABRICACAO_ENTREGA, RISCO_PARALISACAO, SUSPENSAO_FORNECIMENTO, CANCELAMENTO_PEDIDO, ESCASSEZ_INSUMO, NECESSIDADE_SUBSTITUICAO | PRAZO | — |
| REAJUSTE_AUMENTO_PRECO, RENEGOCIACAO, CUSTO_ADICIONAL | CUSTO | COMERCIAL |
| OCORRENCIA_SEGURANCA | SEGURANCA | — |
| QUALIDADE_DEFEITO, QUALIDADE_MONTAGEM | QUALIDADE | — |
| PLEITO | CUSTO (impacto óbvio) | JURIDICO |
| DESCUMPRIMENTO_INDICIO, CONFLITO_RESPONSABILIDADE, RECLAMACAO_FORMAL, NOTIFICACAO_OFICIAL, ORDEM_FORA_DE_DELEGACAO, ALTERACAO_CONTRATUAL_SEM_FORMALIZACAO, DEPENDE_APROVACAO_CLIENTE | nulo | JURIDICO |

Migração aditiva e sem perda: o pilar original fica em `legacy_pillar`; linhas que eram `JURIDICO` passam a ter área JURIDICO e pilar nulo (ou CUSTO no PLEITO); linhas `CUSTO` ganham área COMERCIAL. Novo CHECK: pilar nulo ou um dos quatro; ao menos um eixo (pilar ou área). Como o pilar pode ser nulo, a deduplicação passa a ser por (classificação, tipo) — índice único + gatilho BEFORE INSERT que (a) normaliza o gravador antigo (que ainda envia `pillar='JURIDICO'`) e (b) descarta duplicata em silêncio (equivale a `ON CONFLICT DO NOTHING`, então `lib/email-pipeline/sql-store.ts` continua funcionando sem alteração).

**Compatibilidade com D** (`collect-email-risk-cases` lê `pillar`/`signal_kind`): a view `email_risk_signals_legacy` entrega `pillar` no contrato antigo (área jurídica volta como `JURIDICO`). Mudança mínima em D: `lib/risk-alerts/load-email-risk-signals.ts` seleciona `functional_area`, calcula `pillar` com `legacyPillarOf` (comportamento anterior preservado, inclusive o PLEITO caindo na área JURIDICO) e passa a ignorar sinais com `review_status = 'DISCARDED'`. O coletor (`collect-email-risk-cases.ts`) não foi tocado.

## 2. Confirmar / descartar sinais (decisão 6)

`email_risk_signal_review(p_signal_id, p_decision CONFIRM|DISCARD, p_note)`:

- Quem decide: GESTOR/GERENTE/ADMINISTRADOR ativo do projeto, **ou** profissional expressamente delegado (`email_signal_review_delegations`: por projeto e área/pilar ou `TODAS`, validade futura ≤ 180 dias, concedida e revogada somente por ADMINISTRADOR, delegado precisa ser membro ativo — perde o poder se for desativado, se vencer ou for revogada).
- Sinal de vínculo CANDIDATO/AMBÍGUO (mensagem não `LINKED`/analisada) ou de organização cujo vínculo no projeto não é ATIVO e vigente fica **PENDENTE**: CONFIRM é recusado com `PENDING_LINK_VALIDATION`; DISCARD continua permitido. D já exigia `LINKED` para gerar caso.
- Decisão única (`ALREADY_REVIEWED`), DISCARD exige justificativa ≥ 5 caracteres, tudo em `email_signal_review_audit` (append-only: nem superusuário altera/apaga/trunca), com via (`TIER`/`DELEGATION`) e estado antes/depois.
- UI: `app/[projectId]/integracoes/sinais-email` (qualquer membro ativo abre e lê; botões só para quem pode revisar; ADMIN concede/revoga delegações). Conteúdo de e-mail aparece como texto sanitizado, nunca como instrução. Hover Text em todos os controles (`lib/ui/help/modules/sinais-email.ts`).

## 3. Organizações externas globais (decisão 9)

- `acc_external_org_save`, `acc_external_domain_set`, `acc_external_contact_set` (C) foram **redefinidos** por migration nova: a única mudança é a autorização — somente ADMINISTRADOR ativo (`acc_external_assert_global_admin`). Assinaturas e retornos iguais.
- GESTOR/GERENTE: `acc_external_change_request` (ORG_CREATE, ORG_UPDATE, DOMAIN_SET, CONTACT_SET; motivo obrigatório), `acc_external_change_cancel` (quem pediu ou ADMIN); só ADMINISTRADOR decide (`acc_external_change_decide`; APPROVE aplica na mesma transação; REJECT exige motivo). ORG_CREATE aprovado cria a organização **e um vínculo CANDIDATO** no projeto solicitante (sem autoridade; o gestor valida). Tudo auditado em `external_contacts_audit`.
- Continuam com a gestão (MANAGE/ADMIN): vínculos do projeto (`acc_external_link_save`) e decisão sobre contatos descobertos do projeto (`acc_external_candidate_decide`). Residual: confirmar um candidato cria uma linha em `external_contacts` (global) de organização já vinculada ao projeto; decisão registrada nesta entrega como "gestão de relação do projeto".
- UI: `contatos-externos` mostra solicitações (aprovar/recusar/cancelar), formulário de alteração de dados da organização e rótulos "Solicitar …" para GESTOR/GERENTE.

## 4. Riscos e limites declarados

- "ADMINISTRADOR" = ADMINISTRADOR ativo do **projeto de onde a ação parte**; não existe administrador de todo o tenant. Um admin do projeto A altera dado global visível a ele (organização com vínculo em projeto onde é membro). Decisão do responsável pendente se isso basta.
- Uma organização criada por ADMIN sem vínculo só é visível a quem a criou até existir um vínculo (RLS existente); por isso o cadastro aprovado já cria o vínculo CANDIDATO.
- Descartar um sinal não encerra caso de risco já aberto (`alert_case_id`); só impede novos casos.
- O menu lateral não tem entrada para `sinais-email` (`nav-items.ts` é de H2a). Acesso: Integrações → Contatos externos → "Sinais de risco de e-mail". Profissional delegado que não é Administrador não vê "Integrações" no menu (restrito a admin): precisa do link direto ou de um item de menu (pedido para H2a).
- `next build` não roda neste worktree (junção `node_modules` aponta para fora da raiz — limitação do Turbopack); validação por `tsc`, `eslint`, testes e Postgres real.
- A decisão `JURIDICO` para `DEPENDE_APROVACAO_CLIENTE`/`ALTERACAO_CONTRATUAL…` preserva o roteamento atual de D; reclassificar para COMERCIAL é decisão futura e exige mudar o mapeamento nos dois lados (SQL e TS).

## 5. Testes

- `scripts/test-f6-h2b-sinais-pilares.mjs` (puro): pilares, mapeamento, paridade TS×SQL, contrato legado de D, revisão/delegação/vínculo pendente, solicitações, estática de migrations/ações/telas.
- `scripts/test-f6-h2b-sinais-orgs-realpg.mjs` (Postgres real local): migração sobre linhas legadas, rollback+reaplicação, CHECKs/gatilho, matriz de papéis para revisar (positivos e negativos), vínculo pendente, delegação (validade, escopo, revogação, expiração, delegado inativo), auditoria append-only, view legacy + coletor de D, dados globais só ADMIN (todos os papéis negativos), solicitações por tipo, privilégios.
- Ajustados por redefinição de contrato: `test-f5-b-classificacao-email` (área jurídica), `test-f5-b-classificacao-realpg` (duplicata descartada), `test-f5-g-pipeline-realpg` (`neq` no cliente falso), `test-f5-c-contatos-realpg` (dados globais por ADMIN).
