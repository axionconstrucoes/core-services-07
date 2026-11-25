# Pendências de implantação e matriz de prontidão (B3, 20/11/2026)

> Somente leitura. Nada foi aplicado no Supabase operacional (projeto `plbcvwostmdmdmrziwmd`); só `list_migrations` e um SELECT agregado (contagens, sem dados pessoais). Complementa `docs/migrations-conciliacao-historico-remoto.md` (que cobre até 06/11) e `docs/arquitetura/acc-ordem-noturna-20261121.md`.

## 1. Migrations locais NÃO aplicadas ao Supabase operacional

Método: 166 arquivos em `supabase/migrations` × 134 registros de `list_migrations`. A correspondência é por **nome** (o conector registra a hora da aplicação como versão; ver conciliação). Os 134 registros remotos têm todos arquivo local de mesmo nome; sobram **32 arquivos locais sem registro remoto**.

**Contagem real: 32 migrations locais pendentes.** A última versão remota é `20261119034721 scheduler_pg_cron_dispatch`.

| # | Versão | Arquivo (nome) | Observação |
|--:|---|---|---|
| 1 | 20261107090000 | email_mailbox_collection_controls | Controles de coleta por caixa. **Fora de ordem**: versão anterior à última remota (`20261119034721`); `supabase db push` reclamaria; aplicar na ordem do plano. Pré-requisito da 110000. |
| 2 | 20261116090000 | list_addable_profiles_for_project | Lista de usuários adicionáveis (tela Usuários). Fora de ordem. Revogada de `anon` pela 160000. |
| 3 | 20261118140000 | sla_matrix_rules_unique_active_key | Unicidade da regra ativa da Matriz de SLA. Fora de ordem; "não aplicar sem decisão". Pré-condição da 177000. |
| 4 | 20261120100000 | sla_action_operations_by_responsible | Operações de ação SLA pelo responsável. |
| 5 | 20261120110000 | risk_case_sla_consistency_guards | Guardas de consistência caso de risco × SLA. |
| 6 | 20261120120000 | ssma_forward_and_ai_consult_limits | Limites de consulta de IA (20/usuário/dia, 100/obra/dia) e encaminhamento SSMA. |
| 7 | 20261120130000 | risk_alert_action_server_side_guard | Guarda de servidor da ação do alerta. Substituída na prática pela 090000 do dia 21. |
| 8 | 20261120140000 | ai_consult_reserve_global_user_lock | Trava de reserva de consulta de IA. |
| 9 | 20261120150000 | weekly_digest_evidence_and_guards | Evidências e guardas do resumo semanal. |
| 10 | 20261120151000 | risk_alert_action_no_outbox_authorization | Ação do alerta sem autorização via outbox. |
| 11 | 20261120152000 | risk_sla_consistency_report_and_email_guards | Relatório de consistência e guardas de e-mail. |
| 12 | 20261120153000 | null_safe_authorization_checks | Checagens de autorização tolerantes a NULL. |
| 13 | 20261120160000 | email_reply_tokens_and_ssma_by_email | Tokens de resposta por e-mail e SSMA por e-mail. |
| 14 | 20261120170000 | ai_consult_all_expert_paths | Limite de IA em todos os caminhos de Expert. |
| 15 | 20261120190000 | null_safe_ssma_cores | NULL-safe nos núcleos SSMA. |
| 16 | **20261121090000** | **hotfix_risk_alert_action_authorization** | **HOTFIX P0 de segurança.** Produção ainda tem o corpo vulnerável de `record_risk_alert_action` (hash do `prosrc` igual ao da 20260921090000; nenhum evento humano registrado, sem exploração). Prioridade máxima. |
| 17 | 20261121100000 | centralize_project_permission_rule | Regra única de permissão por projeto. |
| 18 | 20261121101000 | null_safe_authorization_residual | Resíduos NULL-safe. |
| 19 | 20261121110000 | email_mailbox_controls_hardening | Endurece os controles de caixa (depende da 107090000). |
| 20 | 20261121120000 | email_replies_sla_digest_contract_by_email | Respostas por e-mail (SLA, resumo, contrato). Funcionalidade ligada por `ACC_EMAIL_REPLY_CONFIRMATIONS_ENABLED` (desligado). |
| 21 | 20261121130000 | outbound_delivery_states | Estados de envio: aceito pelo provedor × entrega comprovada. |
| 22 | 20261121150000 | ai_consult_governance | Governança de consumo de IA. (Não existe `20261121140000`.) |
| 23 | 20261121160000 | revoke_anon_list_addable_profiles | Revoga `anon` da função da migration 2. |
| 24 | 20261121170000 | l2_revoke_anon_trigger_functions | Revoga `anon` de funções de gatilho. |
| 25 | 20261121171000 | l2_forecast_followup_and_guards | Acompanhamento por eventos, previsão e guardas. |
| 26 | 20261121172000 | l2_sla_forward_by_email_audit | Auditoria das decisões por e-mail. |
| 27 | 20261121173000 | email_specialist_consultations | Consultas de especialista por e-mail (cabeçalho interno ainda cita 170000). |
| 28 | 20261121174000 | ai_consult_audit | Auditoria de consultas de IA (cabeçalho interno ainda cita 170000). |
| 29 | 20261121175000 | audit_delete_proposals_and_findings | Auditoria de DELETE em propostas adicionais e achados de IA. |
| 30 | 20261121176000 | risk_sla_consistency_closed_by_source | Caso encerrado na origem × ação SLA acumulada. |
| 31 | **20261121177000** | **sla_medio_baixo_prazos_aprovados** | **NÃO APLICAR sem autorização.** MÉDIO 1→2 dias úteis, BAIXO 3→5. Análise na seção 2. |
| 32 | 20261121178000 | reissue_approval_flow | Fluxo auditável de aprovação de reemissão (só grava decisão; envio depende da flag). |

Pontos de atenção da ordem: (a) as migrations 1-3 têm versão **menor** que a última remota; (b) 19 depende da 1; 23 depende da 2; 31 depende (por unicidade) da 3; (c) a mudança de comportamento do hotfix (16) deve ir antes de qualquer reabertura de envio; (d) as duas migrations 27 e 28 trazem cabeçalho com a versão antiga no comentário, só estético; (e) ordem sugerida: seguir a numeração, com o hotfix (16) possivelmente antecipado em janela própria, como já decidido em `acc-ordem-noturna-20261121.md`.

## 2. Impacto da migration 20261121177000 (SLA MÉDIO/BAIXO) sobre ações abertas — análise sem alterar nada

**Por código (migration, `compute-escalation.ts`, `sla-actions-data.ts`):** a migration só (a) desativa a regra geral ativa de `sla_matrix_rules` com o valor antigo e cria outra com 2/5 (ou atualiza no lugar a regra por área) e (b) redefine o padrão de `sla_ssma_assume_due_at`. `sla_actions` guarda `assume_due_at`, `respond_due_at`, `complete_due_at` na criação e **nenhuma coluna ou gatilho liga `sla_actions` a `sla_matrix_rules`** (busca por `matrix_rule`/`rule_id` em migrations: só o comentário da própria 177000). O motor de escalonamento lê os prazos gravados na ação. Logo: **nenhuma ação aberta é recalculada, reaberta ou re-escalonada**; só **novas** ações (e reemissões que criem ação nova) usam 2/5.

**Contagens (SELECT agregado no operacional, 20/11/2026, sem identificadores):**

| Dado | Resultado |
|---|---|
| `sla_actions` por risco/status | CRÍTICO ESCALATED 6; ALTO ESCALATED 9 + PENDING 1; MÉDIO PENDING 6; BAIXO PENDING 2 + ESCALATED 1 (total 25) |
| Regras ativas MÉDIO/BAIXO | MÉDIO: 1 geral, DIAS ÚTEIS, 1 (valor antigo, será trocada); BAIXO: 1 geral, DIAS ÚTEIS, 3 (idem). Nenhuma regra personalizada ou por área nessas faixas; nenhuma duplicidade ativa (a migration falharia com `SLA_MATRIX_DUPLICATE_ACTIVE`) |

Efeito esperado se aplicada: 2 regras gerais desativadas + 2 novas criadas (4 linhas de auditoria `SLA_CONFIGURATION_UPDATED`, ator SYSTEM); as 6 ações MÉDIO e 3 BAIXO abertas **mantêm** os prazos antigos (1 e 3 dias úteis) — portanto convivem, durante a vigência delas, ações com prazo antigo e novas com o aprovado. Risco residual: ações MÉDIO/BAIXO já vencidas continuam vencidas (não ganham prazo extra) e podem escalar pelos prazos antigos; qualquer extensão retroativa seria decisão separada (não implementada). Não foi possível validar o resultado em Postgres real nesta sessão (runners locais existem: `scripts/test-sla-medio-baixo-aprovados-sql.mjs`).

## 3. Matriz de prontidão para implantação

Legenda: **PRONTO** = sem bloqueio conhecido no código; **DEPENDE** = precisa de ação/decisão humana; **BLOQUEIA** = não implantar/ligar antes de resolver.

| Item | Situação (evidência) | Risco se ignorado | Prontidão | Ação / decisão |
|---|---|---|---|---|
| Hotfix `record_risk_alert_action` (090000) | Produção vulnerável (hash idêntico à 20260921090000); sem evento humano registrado | Execução indevida da ação do alerta | **BLOQUEIA** o envio real | Publicar em homologação → produção antes de abrir qualquer envio |
| SPF/DKIM/DMARC de `axion.com.br` | Pendente: "DKIM próprio + DMARC" (ordem noturna); não verificável daqui (DNS fora do escopo) | Mensagens em spam ou rejeitadas; baixa reputação | **BLOQUEIA** o envio a destinatários reais | Configurar e conferir SPF/DKIM/DMARC; ou ligar `ACC_EMAIL_WORKSPACE_TENANT_DOMAINS` após homologação |
| Flag de reemissão `ACC_RISK_ALERT_REISSUE_SEND_ENABLED` | Desligada por padrão (`reissue-send-gate.ts`); migration 178000 só grava a decisão | Reemissão sem governança, ou nenhuma (se esquecida) | **DEPENDE** | Aplicar 178000, aprovar casos, homologar e só então ligar a flag no servidor |
| Caixas de e-mail | Só uma caixa com aceite individual; uma habilitada sem aceite; duas cadastradas sem coleta | Coleta sem autorização / lacuna de cobertura | **DEPENDE** | Aceites individuais ou autorização corporativa formal; decidir a caixa habilitada sem aceite |
| Delegação de domínio / WIF GitHub→Google | Pendente (`GOOGLE_WIF_PROVIDER`) | Coleta por caixa não funciona | **DEPENDE** | Google Admin + variáveis; aplicar 107090000 e 121110000 |
| Escalões 1 e 2 (Nível 2 / Diretoria) | Escalonamento depende de responsáveis da Matriz; sem responsável a ação é pulada/marcada | Alerta não chega a quem decide | **DEPENDE** | Conferir Matriz por área; ver "responsáveis ausentes" |
| Responsáveis ausentes | O ciclo trata ausência de responsável com supressão/registro (outbox SUPPRESSED 28 no DEV WEG) | Alertas retidos sem dono | **DEPENDE** | Preencher responsável direto e Nível 2/Diretoria antes do envio real |
| Casos CLOSED × OPEN | DEV WEG: 43 casos (OPEN 21 / CLOSED 22; `state` todos OPEN); 25 ações SLA abertas vencidas | Reemitir alerta de caso já encerrado na origem | **DEPENDE** | Decidir se `state` OPEN em caso CLOSED é intencional; a 176000 trata encerrados na origem; elegibilidade da 178000 exige `status = OPEN` |
| Correção de SLA MÉDIO/BAIXO (177000) | Ver seção 2: só novas ações; 9 ações abertas mantêm prazo antigo | Convivência de prazos; expectativa de reprazo retroativo | **DEPENDE** (autorização expressa) | Autorizar aplicação; decidir à parte sobre prazo retroativo |
| Projeto TESTE | Não foi inspecionado nesta frente (sem leitura de dados de projeto); pelo código, a trava de piloto redireciona e-mails a `crm@axion.com.br` e prefixa `[TESTE CONTROLADO]` | Mistura de dado de teste com operação, ou e-mail real por engano | **PRONTO** com a trava; **DEPENDE** ao abrir produção | Manter `ACC_OUTBOUND_MODE` ≠ `production` até a decisão; identificar o projeto TESTE e excluí-lo do envio real |
| Piloto WEG | Piloto controlado (docs `piloto-weg-*`); envio só pela allowlist do piloto | Envio a terceiros fora do piloto | **PRONTO** no modo piloto | Qualquer abertura exige decisão do dono (modo `production` é o único que libera destinatários originais) |
| Repositório seguro | Plano de repositório privado em `docs/seguranca/plano-repositorio-privado` | Código/evidências expostos | **DEPENDE** | Executar o plano (decisão humana; não feito nesta frente) |
| Destinatário livre em Solicitações (`action-requests`) | Ver `docs/inconsistencias-bloco1-b3-20261120.md` (análise): sem checagem de perfil; no modo piloto o provedor redireciona | Envio por membro de leitura a endereço arbitrário quando em `production` | **DEPENDE** | Decidir política (proposta no documento); sem mudança nesta frente |

Resumo: a implantação **não está pronta para envio real**; os bloqueios são (1) o hotfix de segurança ainda não publicado, (2) autenticação de domínio de e-mail (SPF/DKIM/DMARC) e (3) as decisões humanas sobre caixas, responsáveis e a flag de reemissão. A correção de SLA e as demais 30 migrations são aplicáveis na ordem, sob autorização, em ambiente descartável primeiro.
