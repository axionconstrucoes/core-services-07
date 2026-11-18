// Repositorio PUBLICO: logs, resumos e artefatos do GitHub Actions sao
// visiveis a qualquer pessoa. Nome de arquivo, pasta, titulo e id do
// fornecedor NUNCA vao ao log — so uma referencia opaca (hash curto do
// id interno do vinculo) e contagens. A correlacao com o registro real
// e feita no banco por quem tem acesso.
import { createHash } from "node:crypto";

export function opaqueRef(value) {
  return (
    "ref-" +
    createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 10)
  );
}

// Mensagens de erro (API de terceiro, ZIP, Storage) podem repetir o nome
// do arquivo ou da entrada do pacote. Remove cada nome conhecido.
export function redactNames(message, ...names) {
  let text = String(message ?? "");
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    if (name.length < 3) continue;
    text = text.split(name).join("[nome omitido]");
    const base = name.replace(/\.[^.]+$/, "");
    if (base.length >= 3 && base !== name) text = text.split(base).join("[nome omitido]");
  }
  return text;
}
