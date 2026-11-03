# Plano de implantação e recuperação — AXIA, autorização de e-mail, endurecimento e WhatsApp simulado

> **Plano, não execução.** Nenhum passo abaixo foi executado em produção. Cada fase que toca produção exige autorização expressa.
> Nenhuma credencial neste documento. Identificadores de projeto/deploy ficam no painel dos provedores, não aqui.

## 1. Premissas
- Um merge na `main` dispara **deploy automático** da aplicação. As migrations **não** acompanham o deploy: precisam ser aplicadas à parte.
- Produção já tem as migrations até `20261028130000` (ver `docs/transicao-remota/aplicacao-migrations-producao.md`). Esta integração traz **sete** novas.
- PITR do banco desativado; há backups físicos diários. Não há reversão automática de migration.
- Canais externos novos nascem **desligados**: WhatsApp (`ACC_WHATSAPP_ENABLED` ausente) e voz ElevenLabs (`ELEVENLABS_ENABLED` ausente). Nenhuma variável nova é obrigatória.

## 2. As sete migrations (ordem de versão = ordem de aplicação)
| # | Versão | O que faz | Natureza | Código antigo com ela aplicada | Código novo sem ela |
|---|---|---|---|---|---|
| 1 | `20261029120000_email_access_authorizations` | tabelas/funções de autorização de e-mail por projeto (RLS, histórico imutável) | aditiva | não usa; sem efeito | página/aba de autorização falha só nessas telas |
| 2 | `20261030120000_close_ssma_construmanager_search_path_gaps` | `ALTER FUNCTION … SET search_path = ''` em 12 funções (corpo/ACL idênticos) | altera configuração de função | compatível (mesmas assinaturas e corpos) | sem efeito funcional |
| 3 | `20261030130000_fix_construmanager_budget_response_state` | troca o CHECK de `construmanager_version_impact_reviews` por três estados consistentes | altera constraint (valida os dados existentes) | compatível; a resposta do orçamento deixa de falhar | resposta do orçamento continua falhando (defeito anterior) |
| 4 | `20261030140000_ssma_photo_discard_authorize_only` | cria `authorize_discard_unregistered_ssma_photo` e **remove** `discard_unregistered_ssma_photo` | remove função | o cliente SSMA antigo chama a função removida só na limpeza após falha de registro (já não removia o arquivo): erro ignorado | a rota nova responde 403 (nada é removido) até a migration |
| 5 | `20261030150000_restrict_anon_execute_authenticated_only_functions` | revoga `EXECUTE` de `anon`/PUBLIC em 22 funções SECURITY DEFINER | restringe privilégio | compatível: todos os chamadores são sessão autenticada ou servidor (service role); conferido por busca no código e pelos runners na stack completa | sem efeito |
| 6 | `20261031100000_whatsapp_contacts_and_simulated_log` | tabelas `person_whatsapp_contacts` e `whatsapp_simulated_messages`, funções `set_person_whatsapp_contact` e `whatsapp_dispatch_target` | aditiva | não usa | formulário de telefone falha ao salvar; a tela de usuários continua carregando (a leitura do contato é tolerante) |
| 7 | `20261101100000_restrict_anon_execute_remaining_security_definer` | revoga `EXECUTE` de `anon`/PUBLIC em 21 funções SECURITY DEFINER antigas; **4 exceções documentadas** (helpers de RLS `has_project_permission`, `is_project_member`, `is_shared_project_admin`, `is_any_project_admin`) | restringe privilégio (falha e desfaz se `authenticated`/`service_role` mudarem ou se sobrar outra função anônima) | compatível: todos os chamadores são sessão autenticada ou servidor; sem sessão já eram recusadas no corpo | sem efeito funcional |

Dependências entre elas: a 5 cita funções criadas pela 1 (`request/decide/revoke_email_access_authorization`) e a 2 cita funções de SSMA/Construmanager já em produção;
a 4 é a única que remove algo. Cada migration valida as assinaturas esperadas e **falha inteira** sem aplicar nada parcialmente.

**Recomendação de ordem entre banco e código: migrations primeiro, deploy depois.** Com as migrations aplicadas, o código antigo continua funcionando (a única
diferença é a limpeza de foto SSMA do cliente antigo, que já era ineficaz). Com o deploy antes das migrations, o código novo funciona de forma degradada (telas de
autorização, descarte e contato WhatsApp), sem quebrar fluxos existentes.

## 3. Fase 0 — pré-condições (somente leitura, sem alterar nada)
1. Confirmar o estado das migrations em produção (`supabase migration list`, com autorização para acessar o remoto) = até `20261028130000`.
2. Backup: confirmar o backup físico diário mais recente e fazer um dump **fora do repositório** do esquema `public` e dos dados de `construmanager_version_impact_reviews`, `ssma_form_submissions` e `ssma_submission_photos`.
3. Consultas de pré-checagem (somente `select`):
   - linhas de `construmanager_version_impact_reviews` que violariam o novo CHECK (esperado: 0):
     `select count(*) from public.construmanager_version_impact_reviews where not ((not send_to_budget and budget_user_id is null and budget_response is null and budget_responded_at is null and status='CONCLUIDA') or (send_to_budget and budget_user_id is not null and budget_response is null and budget_responded_at is null and status='PENDENTE_ORCAMENTO') or (send_to_budget and budget_user_id is not null and coalesce(length(btrim(budget_response)),0) >= 10 and budget_responded_at is not null and status='CONCLUIDA'));`
   - a função removida não é chamada por jobs: `select count(*) from pg_stat_user_functions where funcname='discard_unregistered_ssma_photo';`
   - funções executáveis por `anon` hoje (lista de referência da migration 5).
4. Ensaio em banco descartável: aplicar as sete sobre uma cópia **somente do esquema** de produção (sem dados) e rodar a auditoria `run-security-definer-search-path-audit` (esperado: 0 falhas) e o runner `run-ssma-construmanager-search-path-test`.
5. Congelar merges na `main` durante a janela; avisar usuários do SSMA (a janela é curta, as migrations são rápidas).

## 4. Fase 1 — migrations em produção (autorização explícita; uma de cada vez, em ordem)
`supabase db push` aplica as pendentes em ordem. Após **cada** migration, verificar:
1. `select count(*) from supabase_migrations.schema_migrations` aumentou em 1 e a versão esperada consta.
2. Migration 1: tabelas novas com RLS ligada (`select relname from pg_class where relname like '%email_access%' and not relrowsecurity` = vazio).
3. Migration 2: `select proname, proconfig from pg_proc where proname in (…12 funções…)` com `search_path=""`.
4. Migration 3: constraint `construmanager_version_impact_reviews_state_check` presente e a antiga ausente.
5. Migration 4: `authorize_discard_unregistered_ssma_photo` existe e `discard_unregistered_ssma_photo` não.
6. Migrations 5 e 7: a mesma contagem (`select count(*) from pg_proc p where pronamespace='public'::regnamespace and prosecdef and prorettype<>'trigger'::regtype and has_function_privilege('anon',p.oid,'execute')`). Esperado (esquema de produção, ver seção 8): 45 antes da 1; 47 após a 1; **25 após a 5**; **4 após a 7** (as exceções documentadas). Qualquer outro valor: parar.
7. Migration 7: `authenticated` e `service_role` mantêm EXECUTE nas 21; as 4 exceções continuam executáveis por `anon` (decisão registrada no cabeçalho da migration).
8. Migration 6: duas tabelas novas com RLS; `whatsapp_dispatch_target` só executável por `service_role`.
Se qualquer verificação falhar: **parar**, não aplicar a seguinte, e usar a seção 6.

## 5. Fase 2 — merge e deploy automático
1. Abrir o PR (só com autorização), aguardar o CI (`ci-pr-checks.yml`: lint, build, testes, SSMA com Chrome real).
2. Conferir no painel que **nenhuma variável nova** é necessária e que `ACC_WHATSAPP_ENABLED` e `ELEVENLABS_ENABLED` estão ausentes em produção.
3. Merge na `main` → deploy automático. Acompanhar o deploy até `READY`.
4. Verificação pós-deploy (smoke): login; tela de usuários (coluna WhatsApp só para administrador); página de autorização de e-mail; envio SSMA com foto; resposta do orçamento Construmanager; `Verificar escalonamentos` num projeto de teste; confirmar que nenhuma linha aparece em `whatsapp_simulated_messages`.

## 6. Recuperação
**Código:** no painel de deploy, promover (instant rollback) o deployment anterior à integração. Não exige tocar no banco — o código antigo funciona com as seis migrations aplicadas (seção 2).
**Banco:** preferir **não reverter** (aditivas/compatíveis). Se necessário, executar em transação, na ordem inversa, e só o que for preciso:

```sql
begin;
-- 7) devolver EXECUTE a anon nas 21 funções da migration 20261101100000 (só se surgir chamador anônimo legítimo; ver a lista no cabeçalho dela)
-- grant execute on function <assinatura> to anon;
-- 6) WhatsApp (aditiva) — perde contatos/registros simulados: exportar antes
drop function if exists public.whatsapp_dispatch_target(uuid, uuid);
drop function if exists public.set_person_whatsapp_contact(uuid, uuid, text, boolean);
drop table if exists public.whatsapp_simulated_messages;
drop table if exists public.person_whatsapp_contacts;
drop function if exists public.is_admin_of_person_project(uuid);

-- 5) devolver EXECUTE a anon (estado anterior; só se algum chamador anônimo legítimo for descoberto)
-- grant execute on function <assinatura> to anon;   -- repetir para as 22 funções listadas na migration 20261030150000

-- 4) recriar a função antiga e remover a nova
drop function if exists public.authorize_discard_unregistered_ssma_photo(uuid, text);
create or replace function public.discard_unregistered_ssma_photo(p_submission_id uuid, p_storage_path text)
returns boolean language plpgsql security definer set search_path = public, storage as $$
declare
  v_submission public.ssma_form_submissions%rowtype;
  v_prefix text;
begin
  select * into v_submission from public.ssma_form_submissions where id = p_submission_id;
  if v_submission.id is null or v_submission.technician_user_id <> auth.uid() or v_submission.status <> 'UPLOADING' then
    return false;
  end if;
  v_prefix := v_submission.project_id::text || '/ssma/' || p_submission_id::text || '/';
  if left(p_storage_path, length(v_prefix)) <> v_prefix then return false; end if;
  if exists (select 1 from public.ssma_submission_photos where storage_path = p_storage_path) then return false; end if;
  delete from storage.objects where bucket_id = 'project-documents' and name = p_storage_path;
  return found;
end; $$;
revoke all on function public.discard_unregistered_ssma_photo(uuid, text) from public;
grant execute on function public.discard_unregistered_ssma_photo(uuid, text) to authenticated;

-- 3) restaurar o CHECK antigo (volta o defeito da resposta do orçamento)
alter table public.construmanager_version_impact_reviews drop constraint if exists construmanager_version_impact_reviews_state_check;
alter table public.construmanager_version_impact_reviews add constraint construmanager_version_impact_reviews_check check (
  (send_to_budget and budget_user_id is not null and status = 'PENDENTE_ORCAMENTO') or (not send_to_budget and budget_user_id is null and status = 'CONCLUIDA'));

-- 2) search_path: valores anteriores — 'public' (create_ssma_form_submission, finalize_ssma_form_submission, create_ssma_accident_submission,
--    ssma_corrective_action_update, ssma_field_record_submit, submit_construmanager_budget_response, submit_construmanager_version_impact_review)
--    e 'public, storage' (can_upload_ssma_photo_object, can_upload_ssma_field_photo_object, register_ssma_submission_photo, ssma_field_record_register_photo)
-- alter function public.<função>(<assinatura>) set search_path = public;   -- (ou public, storage)
-- 1) autorização de e-mail: remover só se necessário (exportar antes: o histórico é imutável e é evidência)
commit;
```
Observações: o item 3 só é válido se não houver linha `CONCLUIDA` com `send_to_budget` (criada após a correção). O item 1 apaga evidência imutável de autorizações — **exportar antes**.
Restauração por backup físico diário é o último recurso (perde dados posteriores ao backup).

## 6.1 Gatilhos de decisão
- Falha de qualquer verificação da fase 1 → parar e avaliar a recuperação do item correspondente.
- Erro 5xx em telas de autorização/usuários/SSMA após o deploy → rollback do código (instantâneo) e investigação com as migrations mantidas.
- Qualquer linha em `whatsapp_simulated_messages` com o canal desligado → incidente (não deveria existir).

## 8. Ensaio realizado (banco descartável com o esquema de produção)
Feito em 2026-11-03, só local. Esquema obtido por `supabase db dump` (somente DDL, **sem dados**) e comparado com um banco descartável construído pelas 117 migrations já aplicadas em produção (+ privilégios padrão do Supabase): **738 objetos** (tabelas, funções, triggers, políticas, índices, constraints) e **913 concessões (GRANT)** idênticos. Depois as seis migrations foram aplicadas uma a uma, em ordem de versão, com verificação após cada uma:

| # | Resultado do ensaio |
|---|---|
| 1 | aplicou; 2 tabelas, 4 funções, todas com RLS |
| 2 | aplicou; as 11 funções verificadas com `search_path=""` |
| 3 | aplicou; as 2 linhas sintéticas (válidas no CHECK antigo) foram preservadas; estados novos válidos aceitos (3/3), inválidos rejeitados (2/2) |
| 4 | aplicou; função nova existe, função antiga removida, `protect_delete` e demais gatilhos de `storage.objects` seguem ativos |
| 5 | aplicou; EXECUTE de `anon` removido de 22 funções (47 → 25); `authenticated` mantém EXECUTE |
| 6 | aplicou; 2 tabelas com RLS; `whatsapp_dispatch_target` só para `service_role` |

Com as seis aplicadas: auditoria de `search_path` 353 OK / **1 falha** (25 funções antigas ainda executáveis por `anon`; o CI não vê isso porque PGlite não tem os privilégios padrão do Supabase). Isso levou à **migration 7**.

### Migration 7 (ensaio na mesma base, privilégios do Supabase)
Investigação das 25: assinaturas, corpos, ACL efetiva (incluindo herança de PUBLIC), chamadores no código e políticas RLS. Sem sessão (papel `anon`), as 21 RPCs já recusavam no corpo (`auth.uid()` nulo); 4 helpers de RLS devolvem só `false`. Dos helpers, ~80 políticas "TO public" (valem para anon) os chamam: revogar o EXECUTE faria consultas anônimas falharem com "permission denied" em vez de devolver vazio (já é assim em `documents`, por `is_active_project_administrator`), sem fechar nenhum acesso — ficam como exceções explícitas. `can_upload_ssma_photo_object` só é usada em política `TO authenticated` e foi revogada.
Resultado: 21 revogadas; auditoria **355 OK / 0 falhas** com a lista de exceções justificada (a auditoria falha se aparecer qualquer outra função anônima, ou se uma concessão direta a `anon` ou a PUBLIC for feita — testado); `run-anon-execute-restriction-test` **56 passos OK**: anon/PUBLIC sem EXECUTE e recusado com `permission denied` em cada uma das 21, `authenticated` e `service_role` intactos, exceções devolvendo `false` e nenhuma linha, administrador da obra 1 age na obra 1 e é recusado na obra 2, membro comum e administrador de outra obra são recusados, isolamento de linhas por RLS entre obras.
Compatibilidade: das chamadas `rpc` do código antigo (`main`), a única sem destino é `discard_unregistered_ssma_photo` (removida de propósito); o código novo encontra todas as funções que chama, com EXECUTE para `authenticated` ou `service_role`.
**O que o ensaio não prova:** dados reais (a pré-checagem do CHECK da migration 3 tem de ser rodada em produção), corpos de função de produção diferentes das migrations (comparados só por assinatura e ACL), volume e tempo de bloqueio, extensões/configurações do projeto hospedado, Storage com objetos reais.

## 7. Pendências antes de executar
- Autorização para acessar o remoto e aplicar migrations; janela e responsável.
- ~~Ensaio das seis migrations sobre o esquema de produção~~ — feito (seção 8). As 25 funções anônimas foram tratadas na migration 7. Resta rodar as pré-checagens com dados reais na janela.
- Arte definitiva da AXIA com origem/direitos comprovados (a integração usa um ícone neutro).
- Definir se o PR será único ou empilhado.
