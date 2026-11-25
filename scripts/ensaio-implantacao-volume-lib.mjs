// Gerador de dados SINTETICOS por perfil de volume (scripts/data/implantacao-perfil-volume.json) para o ensaio local.
// Somente banco LOCAL descartavel. Nao le nem copia nenhum dado operacional: o perfil tem so contagens/tamanhos.
// Estrategia generica: para cada tabela do perfil que exista no espelho, insere N linhas com generate_series, preenchendo as colunas
// NOT NULL sem default por tipo (FKs ignoradas com session_replication_role=replica; CHECKs de coluna unica respeitados por 1o literal).
// Tabelas que nao puderem ser preenchidas sao REPORTADAS (nunca silenciadas).
export function escalar(perfil, escala) {
  return perfil.tabelas.map((t) => ({ ...t, alvo: Math.max(1, Math.round(t.linhas * escala)) }));
}
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;

export async function semearVolume(su, perfil, escala = 1) {
  const resultado = [];
  await su.query("set session_replication_role = replica");
  try {
    for (const t of escalar(perfil, escala)) {
      const ex = (await su.query("select to_regclass($1) is not null e", [`public.${t.nome}`])).rows[0].e;
      if (!ex) { resultado.push({ tabela: t.nome, status: "AUSENTE-NO-ESPELHO", linhas: 0 }); continue; }
      const cols = (await su.query(
        `select column_name, data_type, udt_name, column_default, is_nullable, is_generated, is_identity
           from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t.nome])).rows;
      const checks = (await su.query(
        `select pg_get_constraintdef(c.oid) d from pg_constraint c where c.conrelid = $1::regclass and c.contype='c'`, [`public.${t.nome}`])).rows.map((r) => r.d);
      const textCols = cols.filter((c) => ["text", "character varying"].includes(c.data_type)).length || 1;
      const largura = Math.max(8, Math.floor((t.heapBytes / Math.max(1, t.linhas) - 60) / textCols));
      const nomes = [];
      const vals = [];
      for (const c of cols) {
        if (c.is_generated === "ALWAYS" || c.is_identity === "YES") continue;
        const precisa = c.is_nullable === "NO" && c.column_default === null;
        const ehTexto = ["text", "character varying"].includes(c.data_type);
        if (!precisa && !(ehTexto && c.column_default === null && /body|content|text|summary|snippet|payload|description/i.test(c.column_name))) continue;
        let v;
        if (c.data_type === "uuid") v = "gen_random_uuid()";
        else if (ehTexto) {
          if (/hash|sha/i.test(c.column_name)) { nomes.push(q(c.column_name)); vals.push("(md5(i::text) || md5(i::text || 'b'))"); continue; }
          const chk = checks.find((d) => d.includes(c.column_name) && /'[^']+'/.test(d) && !/char_length|length\(/i.test(d));
          const lit = chk ? /'([^']+)'/.exec(chk)?.[1] : null;
          v = lit ? `'${lit}'` : `('syn-' || i || '-' || repeat('x', ${largura}))`;
        } else if (["integer", "bigint", "smallint"].includes(c.data_type)) v = "i";
        else if (c.data_type === "numeric" || c.data_type === "double precision" || c.data_type === "real") v = "0";
        else if (c.data_type === "boolean") v = "false";
        else if (c.data_type.startsWith("timestamp")) v = "now() - (i || ' minutes')::interval";
        else if (c.data_type === "date") v = "current_date";
        else if (c.data_type === "jsonb" || c.data_type === "json") v = "'{}'::jsonb";
        else if (c.data_type === "ARRAY") v = "'{}'";
        else if (c.data_type === "USER-DEFINED") v = `(select e.enumlabel from pg_enum e join pg_type ty on ty.oid=e.enumtypid where ty.typname='${c.udt_name}' order by e.enumsortorder limit 1)::${q(c.udt_name)}`;
        else if (c.data_type === "bytea") v = "'\x00'::bytea";
        else v = "null";
        nomes.push(q(c.column_name));
        vals.push(v);
      }
      if (!nomes.length) { resultado.push({ tabela: t.nome, status: "SEM-COLUNAS-OBRIGATORIAS", linhas: 0 }); continue; }
      try {
        const t0 = Date.now();
        await su.query(`insert into public.${q(t.nome)} (${nomes.join(",")}) select ${vals.join(",")} from generate_series(1, ${t.alvo}) as g(i)`);
        resultado.push({ tabela: t.nome, status: "OK", linhas: t.alvo, ms: Date.now() - t0 });
      } catch (e) {
        resultado.push({ tabela: t.nome, status: `NAO-GERADA: ${String(e.message).split("\n")[0].slice(0, 120)}`, linhas: 0 });
      }
    }
  } finally {
    await su.query("set session_replication_role = origin");
  }
  await su.query("analyze");
  return resultado;
}
