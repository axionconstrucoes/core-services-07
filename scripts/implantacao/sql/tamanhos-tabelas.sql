-- Tamanhos e contagens EXATAS por tabela (so numeros agregados; nenhum conteudo de linha). SOMENTE LEITURA.
-- Uso: psql -At -d <banco> -f scripts/implantacao/sql/tamanhos-tabelas.sql > tamanhos.json
select coalesce(jsonb_agg(jsonb_build_object(
  'esquema', n.nspname, 'tabela', c.relname,
  'linhas', (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint,
  'linhasEst', greatest(c.reltuples, 0)::bigint,
  'bytesTotal', pg_total_relation_size(c.oid), 'bytesTabela', pg_relation_size(c.oid)
) order by pg_total_relation_size(c.oid) desc), '[]'::jsonb)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and n.nspname in ('public', 'auth', 'storage', 'cron');
