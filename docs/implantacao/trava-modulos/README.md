# Trava central reversível de RPCs de escrita (Qualidade, Seguros/Garantias, Competências)

Frente C da Fase 2 do piloto WEG. Revisada e testada em 22/11/2026. **Nada aqui foi executado em produção, homologação ou DEV compartilhado**; a validação foi feita só em PostgreSQL 17 local descartável (`127.0.0.1:55434`), base própria criada e apagada pelo teste.

## O que é

Mecanismo nativo do PostgreSQL: `REVOKE EXECUTE ... FROM authenticated, anon, public` em **35 RPCs de escrita** de módulos cuja tela não foi comprovada em sessão autenticada. Nenhuma tabela dos módulos aceita INSERT/UPDATE/DELETE direto de `authenticated`/`anon` (provado no teste T14), então a RPC é o único caminho: revogada, a chamada direta pela API e a tela recebem `42501`. `service_role` e o dono (`postgres`) mantêm EXECUTE. Nenhuma tabela, dado, política ou nível (`acc_project_tier`) é alterado.

| Arquivo | Para quê | Onde roda |
|---|---|---|
| `1-aplicar-trava.sql` | revoga as 35 e imprime 3 conferências; grava auditoria | operação (janela autorizada, logo após a onda M e antes de reabrir o app) |
| `2-reverter-trava.sql` | devolve EXECUTE a `authenticated` (total ou por módulo) | operação, módulo a módulo, após homologar a tela |
| `3-teste-homolog-transacional.sql` | prova por perfil (8 perfis x 35 RPCs + 8 liberadas), sempre desfeito | **somente homologação**, com autorização |
| `scripts/test-trava-modulos-realpg.mjs` | aplicar, negar, reverter e identidade de privilégios em PG real local (19 verificações) | local, fora do CI |

## Correções feitas na revisão (WIP f7cb6a6 e scripts de referência)

1. **Auditoria quebrava a trava.** `audit_log_entries.project_id` é `NOT NULL` (migration `20260819195713`); o `insert` sem `project_id` dos scripts aborta o bloco inteiro e **desfaz o REVOKE** (o bloco é uma transação). Agora grava 1 linha por obra (`insert ... select pr.id ... from public.projects pr`). Os scripts comprovados em `axion-backups\fase2\trava-modulos\` têm o mesmo defeito: não usar esses sem a correção, a menos que o schema da homologação difira do repositório.
2. A "identidade de privilégios" é por **conjunto de ACEs** (grantor, grantee, privilégio). Após `revoke` + `grant`, o array `proacl` muda de ordem (`{postgres,authenticated,service_role}` vira `{postgres,service_role,authenticated}`), o que não tem efeito algum.
3. O cabeçalho de `1-aplicar-trava.sql` citava este README, que não existia; agora existe.

## Nomes de RPC x migrations (conferido)

As 41 funções (35 travadas + 6 liberadas) existem em `supabase/migrations/`, com **uma única assinatura por nome** no schema `public` após o replay das 205 migrations (teste T0); o script aborta se um nome ficar ausente ou sobrecarregado. Duas têm redefinição em migration posterior (`bank_guarantee_update`/`other_guarantee_update` em `20261125202000`, `quality_warranty_acceptance_register` em `20261125100000`); vale a última. As 4 homologadas de controle continuam alcançáveis: `quality_ncr_create`, `quality_ncr_transition`, `quality_evidence_register`, `quality_warranty_create` (além de `quality_capa_register` e `quality_warranty_transition`, PARCIAIS com decisão, também liberadas: total 6).

## Mapa RNC / Garantias G-04..G-10 -> RPC (roteiro `docs/homologacao-autenticada-roteiro.md`)

| Passo | O que faz | RPC | Estado na trava |
|---|---|---|---|
| Q-02/Q-03 | registrar RNC com fonte | `quality_ncr_create` | liberada (homologada) |
| Q-04 | registrar evidência | `quality_evidence_register` | liberada (homologada) |
| Q-04 | **reclassificar/revisar** evidência | `quality_evidence_revise` | **travada** (não visto) |
| Q-05, Q-06, Q-08 | avançar, confirmar, encerrar, reabrir RNC | `quality_ncr_transition` | liberada; CONFIRMADA/NAO_CONFIRMADA/ENCERRADA contidas por competência |
| Q-06 | editar campos (causa, prazo, responsável) | `quality_ncr_update_fields` | **travada** |
| Q-06 | registrar CAPA | `quality_capa_register` | liberada (parcial) |
| Q-06 | executar CAPA (status) | `quality_capa_update_status` | **travada** |
| Q-06/Q-07 | verificação de eficácia | `quality_verification_register` | **travada** (também usada na Garantia) |
| Q-06 | consequências | `quality_consequence_register` | **travada** |
| G-02 | abrir caso de garantia | `quality_warranty_create` | liberada (homologada) |
| G-04 | vistoria | `quality_warranty_survey_register` | **travada** |
| G-04 | manutenção | `quality_warranty_maintenance_register` | **travada** |
| G-04 | reparo e custo (com fonte) | `quality_warranty_repair_register` | **travada** |
| G-05 / G-06 | editar causa, prazos, termos, custos | `quality_warranty_case_update` | **travada** |
| G-06, G-08 | decidir cobertura, reparar, verificar, encerrar | `quality_warranty_transition` | liberada; COBERTA/NAO_COBERTA contidas por competência |
| G-07 | aceite informado | `quality_warranty_acceptance_register` | **travada** |
| G-07 | aceite comprovado (com evidência FATO) | `quality_warranty_acceptance_prove` | **travada** |
| G-09 | URL de caso de outra obra | (leitura; RLS) | n/a |
| G-10 | parecer de cobertura (nova versão) | `quality_warranty_opinion_save` | **travada** |

As 6 telas de Qualidade BLOQUEADAS (custos, ensaios, inspeções, reclamações, recorrências, requisitos), 8 de Seguros/Garantias bancárias (fixture) e 9 de Competências completam as 35.

Contenção natural (Conferência 3 de `1-aplicar-trava.sql`): com as competências travadas e 0 competências `TECNICO_RESPONSAVEL` ativas, a decisão técnica (CONFIRMADA/NAO_CONFIRMADA/ENCERRADA da RNC; COBERTA/NAO_COBERTA da garantia) é recusada por `quality_state_event_competence_guard` (`COMPETENCE_REQUIRED`). Se a conferência der mais que 0, levar ao responsável **antes** de reabrir. A reversão total só deve ocorrer depois da homologação autenticada dos passos pendentes (Q-04/Q-06 a Q-09, G-04 a G-10); use a reversão por módulo (editar a lista `liberar` e `esperado`; o teste T11 prova a reversão parcial).

## Botões SSMA ENVIAR PARA / ESPECIALISTA (conclusão)

- São **links autenticados** do e-mail de aviso SSMA que abrem o formulário do registro; o GET não altera estado (`apps/web/lib/ssma/field-notifications/content.ts`). Usam `ssma_corrective_action_forward` e a consulta ao especialista com limite diário (não as RPCs de Qualidade/Garantias/Seguros/Competências).
- Flag: `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED`. **Padrão LIGADO** (qualquer valor diferente de `false`); só o valor exato `false` os desliga (o botão permanece no layout, desativado, com o motivo). Coberto por `scripts/test-ssma-email-buttons.mjs`.
- **A trava não afeta esses botões:** nenhum código do SSMA (`lib/ssma`, `app/ssma`, `app/api/ssma`) referencia as 35 RPCs, e a varredura de `prosrc` (teste T15) não encontra nenhuma função de `public`, inclusive `ssma_*` e gatilhos, que chame uma das 35 (as únicas ocorrências são texto de mensagem em `project_competences_habilitation_guard` e em `quality_warranty_acceptance_register`).
- Recomendação: **manter a flag no padrão (ligada)**. Não há risco de módulo não homologado por esse caminho; desligá-la é decisão de produto/piloto, não é parte da trava. Ficam vinculados ao envio de e-mail (`ACC_SSMA_NOTIFICATIONS_ENABLED`, `ACC_SSMA_NOTIFICATIONS_SCOPE`), que continuam desligados/limitados por padrão. `ESPECIALISTA` por e-mail de **risco** depende de outra flag (`ACC_EMAIL_SPECIALIST_ENABLED`, padrão desligada).

## Como executar

Local (sem tocar em nada compartilhado): `ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> node scripts/test-trava-modulos-realpg.mjs` (sem `ACC_REALPG_URL` é PULADO; recusa qualquer host/porta diferente).

Homologação (**depende de autorização**): rodar `3-teste-homolog-transacional.sql` no SQL Editor do `acc-homolog` (termina sempre em erro `TRAVA-TESTE-RESULTADO`; nada persiste). Esperado: `travadas 42501 = 280/280`, `fora do esperado: []`, `matriz inalterada = t`, `liberadas com EXECUTE = 6/6`. A leitura da matriz por perfil está no corpo da mensagem. Os UUIDs de obra/RNC/garantia são os da homologação; o teste local os semeia como fixture.

Produção (**depende de autorização e da janela**): `1-aplicar-trava.sql` (esperado: Conferência 1 = 35/0, Conferência 2 = 6, Conferência 3 = 0), e `2-reverter-trava.sql` para reverter.

## Pendências

- Executar `3-teste-homolog-transacional.sql` no acc-homolog (autorização).
- Decidir sobre RNC/Garantias parcialmente homologadas (lista `liberar` da reversão por módulo).
- A mensagem de `42501` chega à tela como o erro da RPC (a verificar o texto exibido); o texto amigável ("módulo em homologação") não faz parte desta frente.
