// Inserção IDEMPOTENTE de e-mails (mesmo padrão do coletor incremental): tenta o lote; se o lote falha (por exemplo, outra
// execução inseriu a mesma mensagem entre a leitura e a escrita), reinsere LINHA A LINHA. Conflito do índice único do
// Gmail (23505) conta como duplicada — a mensagem já existe, nada se perde. Qualquer outro erro ABORTA (nunca é engolido).
// `client` é um cliente Supabase (ou compatível): client.from("emails").insert(rowOrRows) -> { error }.
export async function insertEmailsIdempotent(client, rows, batchSize = 100) {
  let inserted = 0;
  let duplicates = 0;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await client.from("emails").insert(batch);
    if (!error) {
      inserted += batch.length;
      continue;
    }
    for (const row of batch) {
      const result = await client.from("emails").insert(row);
      if (!result.error) inserted += 1;
      else if (result.error.code === "23505") duplicates += 1;
      else throw new Error(result.error.message);
    }
  }
  return { inserted, duplicates };
}
