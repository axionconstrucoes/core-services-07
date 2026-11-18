# Regras duplicadas da Matriz de SLA (WEG) — evidência e proposta

Situação em 18/11/2026. Nenhum dado de `sla_matrix_rules` foi alterado.

## Registros existentes (projeto WEG, todos `active = true`, `area = null`)

Os campos `respond`/`complete` estão nulos em todas as linhas. `notify_by_email` é true em todas. `requires_delay_justification` é true em todas. Todas as linhas têm `is_default = false` e foram gravadas pelo usuário administrador do projeto (`updated_by_user_id` c7bfe367…).

| id | risco | unidade | assumir | Nível 2 → Diretoria (`escalation_2_after`) | após Diretoria (`board_after`) | confirmação | criada em (UTC) |
|---|---|---|---|---|---|---|---|
| de804a0d-cdec-4ed4-be78-0cdd4d0e2859 | CRITICAL | horas corridas | 1 | 1 | 2 | sim | 20/09 23:14:45 |
| ab8fed99-0990-4611-9f0d-abbd196718e7 | CRITICAL | horas corridas | 1 | **2** | **3** | sim | 22/09 18:58:40 |
| 0ddc9440-b0ef-4f0d-8681-ad886e4a8a97 | HIGH | horas úteis | 4 | 4 | 4 | sim | 20/09 23:14:45 |
| b92ed86f-c29c-4a2b-bea9-8cf92888b223 | HIGH | horas úteis | 4 | **6** | **8** | sim | 22/09 18:58:35 |
| 64ff1d0a-1dfc-4191-98ce-3a0152c27496 | MEDIUM | dias úteis | 1 | 1 | 1 | não | 20/09 23:14:45 |
| 6d602e23-4c1b-4e66-838e-3940ead115c6 | LOW | dias úteis | 3 | 3 | 2 | não | 20/09 23:14:45 |

`updated_at` é igual a `created_at` em todas as linhas.

## Como o motor usa os valores

A lógica está em `apps/web/lib/sla/compute-escalation.ts`.

- O alerta vai ao Responsável em T.
- Se o caso não for assumido até T + `assumir`, sobe ao **Gestor (Nível 2)**. A comparação é estrita (`>`), então a subida acontece no primeiro instante depois do prazo.
- Sem ação por mais `escalation_2_after`, contado a partir desse vencimento, sobe à **Diretoria (Nível 3)**.
- `board_after` não gera um nível novo. Só marca o "limite de escalonamento atingido" e é registrado na auditoria, sem envio de e-mail.

## Comparação com a decisão informada em 18/11/2026

| Risco | Decisão | Linha que atende | Linha divergente |
|---|---|---|---|
| CRÍTICO | 1 h corrida; Gestor em T+61 min; Diretoria em T+121 min | de804a0d (1/1/2): Gestor após T+60, Diretoria após T+120 | ab8fed99 (1/2/3): Diretoria só após T+180 |
| ALTO | 4 h úteis; escalonamento seguinte +4 h úteis | 0ddc9440 (4/4/4) | b92ed86f (4/6/8): Diretoria após +6 h úteis |
| MÉDIO | 1 dia útil | 64ff1d0a (1/1/1) | — |
| BAIXO | 3 dias úteis | 6d602e23 (3/3/2) | — |

Para os níveis não críticos, a decisão fala em "prazo útil adicional conforme a regra aprovada". Os valores de `board_after` são 4 h úteis em ALTO, 1 dia útil em MÉDIO e 2 dias úteis em BAIXO. Eles não aparecem em nenhuma decisão documentada encontrada além dos defaults de `docs/sla-escalation.md`, por isso pedem confirmação.

## Conflito com uma alteração posterior registrada (para decisão)

Em 22/09/2026 houve uma alteração explícita feita pela tela de configuração, registrada na auditoria (`audit_log_entries`):

- `ef529c93-a312-4ec4-8e9a-695e39fb22d0` (SLA_MATRIX_RULE_UPDATED, CRITICAL, 22/09 18:58:40 UTC): mudou de 1/1/2 para 1/2/3.
- `82c31b86-7da1-41f1-9897-586f33afae86` (SLA_MATRIX_RULE_UPDATED, HIGH, 22/09 18:58:36 UTC): mudou de 4/4/4 para 4/6/8.
- Junto delas há os registros `SLA_CONFIGURATION_UPDATED` 03f1dde2… e f5c29e2e…, que apontam para as linhas novas.

Essa alteração **nunca entrou em vigor**:

- O upsert da tela usava `onConflict: project_id,risk_level,area`. Como a área era NULL, não houve colisão e o banco **inseriu uma linha nova** em vez de atualizar a existente.
- O motor pegava a primeira linha devolvida pelo banco, e o banco devolvia a mais antiga.
- Todos os snapshots gravados na `risk_alert_outbox` da WEG confirmam isso: 12 de CRITICAL com 1/1/2 (01/10 a 23/10) e 14 de HIGH com 4/4/4 (26/09 a 02/11).

A decisão informada agora (T+61 / T+121; ALTO +4 h úteis) coincide com as regras **efetivamente aplicadas**, e não com a alteração de 22/09. Antes de desativar qualquer linha, é preciso confirmar que a alteração de 22/09 fica superada pela decisão atual.

## O que muda no código (PR)

- **Seleção determinística** (`pickDeterministicMatrixRule`):
  - entre linhas ativas da mesma chave (risco + área), vence a criada primeiro; em empate de data, vence o menor id;
  - não depende da ordem devolvida pelo banco;
  - preserva exatamente o comportamento que já estava em produção;
  - as linhas ignoradas aparecem em `ignoredDuplicateRuleIds` e no snapshot da outbox (`ruleId`, `ignoredDuplicateRuleIds`), para auditoria.
- **Correção da tela de configuração:**
  - passa a **atualizar** a regra efetiva da chave (pelo id); só insere quando a chave não tem regra;
  - a auditoria registra como "Anterior" a regra efetiva.
- **Migration nova, não aplicada:** `20261118140000_sla_matrix_rules_unique_active_key.sql`.
  - Cria um índice único parcial sobre as regras ativas com `NULLS NOT DISTINCT`.
  - Enquanto houver duplicatas ativas, não cria nada e só emite um aviso.

## Proposta de dados (NÃO executada — depende de decisão)

Para manter a decisão de 18/11 (T+61 / T+121; ALTO +4 h úteis), sem apagar histórico:

```sql
begin;
update public.sla_matrix_rules
   set active = false, updated_at = now(), updated_by_user_id = '<admin que decide>'
 where id in ('ab8fed99-0990-4611-9f0d-abbd196718e7', 'b92ed86f-c29c-4a2b-bea9-8cf92888b223')
   and project_id = '00000000-0000-4000-8000-000000000001'
   and active;
insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
values
 ('00000000-0000-4000-8000-000000000001', 'USER', '<admin que decide>', null, 'SLA_MATRIX_RULE_DUPLICATE_DEACTIVATED', 'SLA_MATRIX_RULE',
  '00000000-0000-4000-8000-000000000001:CRITICAL:GLOBAL',
  'Duplicata ab8fed99 (1/2/3, 22/09) desativada; vale de804a0d (1/1/2) — decisão de 18/11/2026: Gestor T+61 min, Diretoria T+121 min. A alteração de 22/09 (auditoria ef529c93) nunca entrou em vigor.'),
 ('00000000-0000-4000-8000-000000000001', 'USER', '<admin que decide>', null, 'SLA_MATRIX_RULE_DUPLICATE_DEACTIVATED', 'SLA_MATRIX_RULE',
  '00000000-0000-4000-8000-000000000001:HIGH:GLOBAL',
  'Duplicata b92ed86f (4/6/8, 22/09) desativada; vale 0ddc9440 (4/4/4) — decisão de 18/11/2026: 4 h úteis + 4 h úteis. A alteração de 22/09 (auditoria 82c31b86) nunca entrou em vigor.');
commit;
```

Se, ao contrário, a alteração de 22/09 tiver de prevalecer, o caminho é desativar de804a0d e 0ddc9440. Isso **muda** os prazos em vigor (Diretoria em T+180 min no CRÍTICO) e contraria a decisão de 18/11.

Depois da limpeza, a migration acima pode ser aplicada para impedir novas duplicatas.
