-- Piloto WEG — CORREÇÃO DOS RÓTULOS [DEV] do projeto (NÃO EXECUTADO; exige autorização expressa e valores CONFERIDOS pelo responsável).
-- Preserva o ID 00000000-0000-4000-8000-000000000001 e TODO o histórico: só atualiza 4 campos de cadastro em UMA linha de public.projects.
-- Nenhuma chave estrangeira muda (e-mails, documentos, casos de risco, ações de SLA, auditoria apontam pelo UUID). O `code` (AXION-DEV-001)
-- NÃO é alterado por padrão: é chave única sem efeito funcional; mudar só se o responsável quiser (variável :novo_code).
-- Dry-run por padrão: a transação termina em ROLLBACK. Para gravar, passe -v commit=1 (somente depois da autorização).
--
-- Uso (conexão de manutenção do projeto OPERACIONAL, SOMENTE com autorização; senha por variável de ambiente PGPASSWORD):
--   psql "<conexão>" -v ON_ERROR_STOP=1 \
--     -v novo_nome="WEG - Fábrica de Fios - Linhares" \
--     -v novo_cliente="<razão social CONFERIDA no contrato assinado>" \
--     -v novo_contrato="<número CONFERIDO no contrato assinado; vazio = não alterar>" \
--     -v novo_local="Linhares - ES" \
--     -f scripts/sql/piloto-weg-corrigir-rotulos.sql
-- Valores CANDIDATOS (lidos do texto do contrato base por OCR; confirmar no original): ver docs/piloto-weg-dados-cadastrais.md.

\set ON_ERROR_STOP on
\if :{?novo_nome} \else \echo 'ERRO: informe -v novo_nome=...' \quit \endif
\if :{?novo_cliente} \else \echo 'ERRO: informe -v novo_cliente=...' \quit \endif
\if :{?novo_local} \else \set novo_local '' \endif
\if :{?novo_contrato} \else \set novo_contrato '' \endif
\if :{?novo_code} \else \set novo_code '' \endif
\if :{?commit} \else \set commit 0 \endif

begin;

-- 1) Guarda: precisa ser EXATAMENTE o projeto piloto (UUID + código atual) e ainda com os rótulos de desenvolvimento.
select (select count(*) from public.projects
         where id = '00000000-0000-4000-8000-000000000001' and code = 'AXION-DEV-001' and name like '[DEV]%') = 1 as projeto_ok,
       (length(btrim(:'novo_nome')) >= 5 and :'novo_nome' not like '%[DEV]%') as nome_ok,
       (length(btrim(:'novo_cliente')) >= 3 and :'novo_cliente' not ilike '%fict%' and :'novo_cliente' not ilike '%DEV%') as cliente_ok
\gset
\if :projeto_ok \else \echo 'GUARDA: projeto piloto nao encontrado no estado esperado ([DEV]); nada foi alterado' \quit \endif
\if :nome_ok \else \echo 'GUARDA: novo_nome invalido' \quit \endif
\if :cliente_ok \else \echo 'GUARDA: novo_cliente invalido (nao pode conter ficticio/DEV)' \quit \endif

-- 2) ANTES (evidência)
select 'ANTES' as momento, id, code, name, client, contract_number, location from public.projects where id = '00000000-0000-4000-8000-000000000001';

-- 3) Atualização mínima, em UMA linha (contrato/local/código só mudam se informados)
update public.projects
   set name = :'novo_nome',
       client = :'novo_cliente',
       contract_number = case when :'novo_contrato' = '' then contract_number else :'novo_contrato' end,
       location = case when :'novo_local' = '' then location else :'novo_local' end,
       code = case when :'novo_code' = '' then code else :'novo_code' end
 where id = '00000000-0000-4000-8000-000000000001' and code = 'AXION-DEV-001';

-- 4) DEPOIS (evidência) e conferência de que NADA do histórico mudou de lugar
select 'DEPOIS' as momento, id, code, name, client, contract_number, location from public.projects where id = '00000000-0000-4000-8000-000000000001';
select 'historico_preservado' as verificacao,
       (select count(*) from public.emails where project_id = '00000000-0000-4000-8000-000000000001') as emails,
       (select count(*) from public.documents where project_id = '00000000-0000-4000-8000-000000000001') as documentos,
       (select count(*) from public.risk_alert_cases where project_id = '00000000-0000-4000-8000-000000000001') as casos_risco,
       (select count(*) from public.sla_actions where project_id = '00000000-0000-4000-8000-000000000001') as acoes_sla;

\if :commit
  \echo 'COMMIT solicitado: gravando.'
  commit;
\else
  \echo 'DRY-RUN: ROLLBACK (nada gravado). Use -v commit=1 somente com autorização.'
  rollback;
\endif
