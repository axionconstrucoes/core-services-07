-- Consultas ao Especialista Jurídico: histórico PRIVADO por autor.
--
-- Até aqui a consulta (pergunta + resposta) não era gravada em lugar nenhum. Esta migration cria o histórico e
-- o isola por autor: SOMENTE o autor lista, abre (por ID ou não) e exclui a própria consulta. Nenhuma política
-- dá acesso a outro membro do projeto, nem a administrador (pela interface do ACC / papel `authenticated`).
-- O papel `service_role` ignora RLS por definição do Supabase: nenhum código do ACC usa `service_role` nesta tabela,
-- e quem opera o banco com essa chave passa a ser uma retenção técnica (descrita na interface).
--
-- A autoria vem SEMPRE da sessão (auth.uid()): o cliente não envia nem altera `author_user_id`.
-- Não há UPDATE: a consulta é imutável; a única mudança possível é a exclusão pelo autor.

create table if not exists public.legal_consultations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_user_id uuid not null default auth.uid(),
  question text not null check (char_length(question) between 1 and 8000),
  response jsonb not null,
  provider_meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists legal_consultations_author_idx
  on public.legal_consultations (author_user_id, project_id, created_at desc);

alter table public.legal_consultations enable row level security;
alter table public.legal_consultations force row level security;

revoke all on public.legal_consultations from anon;
revoke all on public.legal_consultations from authenticated;
grant select, insert, delete on public.legal_consultations to authenticated;

drop policy if exists legal_consultations_select_own on public.legal_consultations;
create policy legal_consultations_select_own on public.legal_consultations
  for select to authenticated
  using (author_user_id = auth.uid() and public.is_project_member(project_id));

drop policy if exists legal_consultations_insert_own on public.legal_consultations;
create policy legal_consultations_insert_own on public.legal_consultations
  for insert to authenticated
  with check (author_user_id = auth.uid() and public.is_project_member(project_id));

drop policy if exists legal_consultations_delete_own on public.legal_consultations;
create policy legal_consultations_delete_own on public.legal_consultations
  for delete to authenticated
  using (author_user_id = auth.uid());

comment on table public.legal_consultations is
  'Consultas ao Especialista Jurídico — privadas ao autor (RLS). Sem UPDATE; exclusão só pelo autor. Sem acesso de administrador.';
