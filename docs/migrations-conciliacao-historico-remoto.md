# Conciliação do histórico de migrations (local × Supabase remoto)

Gerado em 06/11/2026 por leitura (`list_migrations` + objetos instalados) no projeto Supabase
`plbcvwostmdmdmrziwmd`. **Nada foi alterado no histórico remoto.** Este documento só registra a
correspondência e prepara a conciliação, que fica sob decisão humana.

## Por que as versões diferem
O conector do Supabase (`apply_migration`) registra a migration com a **hora da aplicação** como versão,
mantendo o **nome**. O arquivo local mantém o prefixo escolhido no repositório. A correspondência é
feita pelo **nome** + conferência dos objetos instalados — nunca só pelo timestamp.
**Regra: não reaplicar uma migration apenas porque a versão local difere da remota.**

## Resultado da comparação (132 arquivos locais × 129 registros remotos)
127 migrations têm versão e nome idênticos. As demais:

| Arquivo local | Registro remoto | Situação |
|---|---|---|
| `20261105150000_axia_chat_budget` | `20261105173838 axia_chat_budget` | **Aplicada** (mesmo nome; versão do conector difere) |
| `20261106090000_sla_configuration_audit_system_actor` | `20261106195625 sla_configuration_audit_system_actor` | **Aplicada** (PR #143; SHA-256 `5c7170163b8bf8572e5bd5e36292b371c406d5ea801e345ba6a96550d9e266b9`; definição instalada conferida) |
| `20261106100000_ssma_esg_acoes_perfis_notificacoes` | — | **Pendente** (autorizada). Objetos ausentes: `can_register_esg_compliance`, `ssma_link_sla_action`, `sla_action_ssma_guard`, `ssma_incident_links`, `ssma_field_notification_deliveries` |
| `20261106110000_ssma_esg_evidence_reference` | — | **Pendente** — aguarda aprovação do SQL. Tabela `esg_ssma_record_references` ausente |
| `20261106120000_email_access_authorizations` | — | **Preparo, NÃO aplicar. Arquivo fora deste PR (permanece só na branch `feat/ssma-esg-limpa`).** Atenção: **tem o mesmo nome** de `20261029120000_email_access_authorizations`, já aplicada (tabela `email_access_authorizations` existe). São conteúdos diferentes (SHA-256 `8f1dc148…` × `b82ae81f…`); a conciliação por nome seria enganosa |

Não existe arquivo local `20261106130000`.

## Conciliação proposta (NÃO executada)
Só se for desejado alinhar a versão registrada à local (decisão humana, janela controlada, com backup do
registro). Cada comando afeta apenas `supabase_migrations.schema_migrations`, nunca o schema:

```sql
-- conferir antes: select version, name from supabase_migrations.schema_migrations where name in ('axia_chat_budget','sla_configuration_audit_system_actor');
-- update supabase_migrations.schema_migrations set version = '20261105150000' where version = '20261105173838' and name = 'axia_chat_budget';
-- update supabase_migrations.schema_migrations set version = '20261106090000' where version = '20261106195625' and name = 'sla_configuration_audit_system_actor';
```
Alternativa sem tocar no histórico: manter as versões do conector e usar este documento como tabela de
correspondência. A recomendação é a alternativa (menor risco).
