-- ============================================================
-- 20261106110000_ssma_esg_evidence_reference.sql
--
-- NÃO APLICADA EM PRODUÇÃO. Depende de 20261106100000_ssma_esg_acoes_perfis_notificacoes.sql
-- (can_register_esg_compliance).
--
-- PROPÓSITO: REFERÊNCIA entre um registro de campo SSMA (ssma_field_records, inclusive
-- quase-acidente) e uma comprovação ESG (esg_obligation_submissions) como EVIDÊNCIA de apoio.
--
-- Regras de segurança:
--   - A referência é só um ponteiro. NÃO altera, NÃO cria e NÃO conclui nada: nenhum trigger e
--     nenhum UPDATE em esg_obligations / esg_obligation_submissions / ssma_field_records.
--     Vincular nunca marca a obrigação como cumprida (a revisão continua só do Administrador).
--   - Aponta para uma comprovação JÁ EXISTENTE (a obrigação é derivada dela); nunca cria comprovação.
--   - Mesma obra obrigatória (registro = comprovação = obrigação).
--   - Única por (comprovação, registro) enquanto ativa; chamadas concorrentes são idempotentes.
--   - Escrita só por RPC SECURITY DEFINER (sem INSERT/UPDATE/DELETE direto). Quem vincula: membro
--     ATIVO com can_register_esg_compliance e que lê o registro; Administrador em qualquer
--     comprovação, demais perfis só na PRÓPRIA comprovação (mesma regra da evidência ESG).
--   - Desvincular = marcar revogada (quem/quando/motivo); a linha nunca é apagada. Revincular
--     depois cria nova referência, preservando o histórico.
--   - Auditoria em audit_log_entries (padrão de ssma_incident_link_set).
-- Aditiva e idempotente; não apaga dados.
-- ============================================================

create table if not exists public.esg_ssma_record_references (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  obligation_id uuid not null references public.esg_obligations (id),
  submission_id uuid not null references public.esg_obligation_submissions (id),
  field_record_id uuid not null references public.ssma_field_records (id),
  note text check (note is null or char_length(note) <= 500),
  created_by_user_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.profiles (id) on delete restrict,
  revoked_reason text check (revoked_reason is null or char_length(revoked_reason) between 3 and 500),
  check ((revoked_at is null) = (revoked_by_user_id is null) and (revoked_at is null) = (revoked_reason is null))
);

create unique index if not exists esg_ssma_record_references_active_uidx
  on public.esg_ssma_record_references (submission_id, field_record_id) where revoked_at is null;
create index if not exists esg_ssma_record_references_project_idx on public.esg_ssma_record_references (project_id);
create index if not exists esg_ssma_record_references_obligation_idx on public.esg_ssma_record_references (obligation_id);
create index if not exists esg_ssma_record_references_record_idx on public.esg_ssma_record_references (field_record_id);

alter table public.esg_ssma_record_references enable row level security;
revoke all on public.esg_ssma_record_references from anon, authenticated;
grant select on public.esg_ssma_record_references to authenticated;
grant all on public.esg_ssma_record_references to service_role;
drop policy if exists "esg_ssma_record_references_select_members" on public.esg_ssma_record_references;
create policy "esg_ssma_record_references_select_members" on public.esg_ssma_record_references
  for select to authenticated using (public.is_project_member(project_id));

create or replace function public.esg_link_ssma_record(
  p_submission_id uuid,
  p_field_record_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_sub record;
  v_record_project uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select s.project_id, s.obligation_id, s.filled_by_user_id into v_sub
    from public.esg_obligation_submissions s where s.id = p_submission_id;
  -- Anti-oráculo: quem não é membro da obra da comprovação recebe o mesmo erro de uma comprovação inexistente.
  if v_sub.project_id is null or not coalesce(public.is_project_member(v_sub.project_id), false) then
    raise exception 'OBLIGATION_NOT_FOUND';
  end if;
  select r.project_id into v_record_project from public.ssma_field_records r where r.id = p_field_record_id;
  -- Registro de outra obra só é revelado a quem também é membro dessa obra.
  if v_record_project is null
     or (v_record_project <> v_sub.project_id and not coalesce(public.is_project_member(v_record_project), false)) then
    raise exception 'RECORD_NOT_FOUND';
  end if;
  if v_record_project <> v_sub.project_id then raise exception 'PROJECT_MISMATCH'; end if;

  -- membro ATIVO que registra conformidade ESG, e que enxerga o registro SSMA (membro da obra)
  if not coalesce(public.can_register_esg_compliance(v_sub.project_id), false)
     or not coalesce(public.is_project_member(v_record_project), false) then
    raise exception 'FORBIDDEN';
  end if;
  if not coalesce(public.has_project_permission(v_sub.project_id, 'ADMINISTRADOR'), false)
     and v_sub.filled_by_user_id <> v_user then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.esg_ssma_record_references (project_id, obligation_id, submission_id, field_record_id, note, created_by_user_id)
  values (v_sub.project_id, v_sub.obligation_id, p_submission_id, p_field_record_id, nullif(btrim(coalesce(p_note, '')), ''), v_user)
  on conflict (submission_id, field_record_id) where revoked_at is null do nothing
  returning id into v_id;

  if v_id is null then
    -- já vinculada (ex.: chamada concorrente): idempotente, devolve a referência ativa, sem nova auditoria
    select x.id into v_id from public.esg_ssma_record_references x
     where x.submission_id = p_submission_id and x.field_record_id = p_field_record_id and x.revoked_at is null;
    return v_id;
  end if;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (v_sub.project_id, 'USER', v_user, null, 'ESG_SSMA_RECORD_LINKED', 'ESG_SSMA_RECORD_REFERENCE', v_id::text,
          format('Registro de campo SSMA %s referenciado como evidência da comprovação ESG %s (obrigação %s). Nenhum status foi alterado.', p_field_record_id, p_submission_id, v_sub.obligation_id));
  return v_id;
end;
$$;
revoke all on function public.esg_link_ssma_record(uuid, uuid, text) from public, anon;
grant execute on function public.esg_link_ssma_record(uuid, uuid, text) to authenticated;

create or replace function public.esg_unlink_ssma_record(
  p_reference_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_ref public.esg_ssma_record_references;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_ref from public.esg_ssma_record_references where id = p_reference_id for update;
  -- Anti-oráculo: quem não é membro da obra da referência recebe o mesmo erro de uma referência inexistente.
  if v_ref.id is null or not coalesce(public.is_project_member(v_ref.project_id), false) then raise exception 'REFERENCE_NOT_FOUND'; end if;
  if not coalesce(public.can_register_esg_compliance(v_ref.project_id), false) then raise exception 'FORBIDDEN'; end if;
  if not coalesce(public.has_project_permission(v_ref.project_id, 'ADMINISTRADOR'), false)
     and v_ref.created_by_user_id <> v_user then
    raise exception 'FORBIDDEN';
  end if;
  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 500 then raise exception 'REASON_REQUIRED'; end if;
  if v_ref.revoked_at is not null then raise exception 'ALREADY_REVOKED'; end if;

  update public.esg_ssma_record_references
     set revoked_at = now(), revoked_by_user_id = v_user, revoked_reason = v_reason
   where id = v_ref.id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (v_ref.project_id, 'USER', v_user, null, 'ESG_SSMA_RECORD_UNLINKED', 'ESG_SSMA_RECORD_REFERENCE', v_ref.id::text,
          format('Referência do registro de campo SSMA %s à comprovação ESG %s revogada (histórico preservado). Motivo: %s', v_ref.field_record_id, v_ref.submission_id, v_reason));
  return v_ref.id;
end;
$$;
revoke all on function public.esg_unlink_ssma_record(uuid, text) from public, anon;
grant execute on function public.esg_unlink_ssma_record(uuid, text) to authenticated;
