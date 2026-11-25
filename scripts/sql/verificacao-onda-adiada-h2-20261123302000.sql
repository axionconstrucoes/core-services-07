-- VERIFICACAO DE ONDA adiada-H2-20261123302000 (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Adiada: 20261123302000_quality_revoke_direct_writes. SO com a versao do app que chama as RPCs de 20261123301000; revoga a escrita direta (reversivel).
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-adiada-h2-20261123302000.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-adiada-h2-20261123302000.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\if :{?fase}
\else
\set fase depois
\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
    ('20261123302000_quality_revoke_direct_writes', 'sem-objeto-novo', '(redefine funcoes/politicas/dados: conferir P0 e docs/implantacao/03)', null::boolean)
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261123302000_quality_revoke_direct_writes', 'sem-objeto-novo', '(redefine funcoes/politicas/dados: conferir P0 e docs/implantacao/03)', null::boolean)
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
