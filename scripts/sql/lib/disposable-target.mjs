// Alvo DESCARTÁVEL dos runners de PostgreSQL real: o container e a URL da API vêm de variáveis de ambiente, mas só
// são aceitos se forem inequivocamente locais e descartáveis. Qualquer outra coisa encerra o processo (fail-closed).
//
//  - container: supabase_db_acc-disposable-<nome>  (nunca supabase_db_axion-contract-intelligence nem outro padrão);
//  - API: http(s)://127.0.0.1|localhost:<porta> com porta explícita, fora da faixa da stack de desenvolvimento
//    (54300-54399, ver supabase/config.toml). Sem usuário/senha, caminho ou query na URL.
// Nunca lê DATABASE_URL, .env* nem faz chamada de rede para resolver o alvo.

import { spawnSync } from "node:child_process";

export const DISPOSABLE_CONTAINER_PATTERN = /^supabase_db_acc-disposable-[a-z0-9][a-z0-9-]{1,40}$/;
export const DEV_STACK_PORT_RANGE = [54300, 54399];
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

function refuse(message) {
  console.error(message);
  process.exit(1);
}

export function requireDisposableContainer(envName, { legacyNames = [] } = {}) {
  const raw = process.env[envName];
  if (!raw || !(DISPOSABLE_CONTAINER_PATTERN.test(raw) || legacyNames.includes(raw))) {
    refuse(
      `${envName} precisa ser um container descartável "supabase_db_acc-disposable-<nome>" (obtido: ${JSON.stringify(raw)}). ` +
        "Nunca a stack local real (supabase_db_axion-contract-intelligence) nem banco remoto."
    );
  }
  return raw;
}

export function requireLocalApiUrl(envName) {
  const raw = process.env[envName];
  let url;
  try {
    url = new URL(raw);
  } catch {
    return refuse(`${envName} não é uma URL válida (obtido: ${JSON.stringify(raw)}).`);
  }
  const port = Number(url.port);
  if (!["http:", "https:"].includes(url.protocol) || !LOCAL_HOSTS.has(url.hostname) || !Number.isInteger(port) || port < 1024) {
    refuse(`${envName} precisa ser http://127.0.0.1:<porta> (ou localhost) com porta explícita (obtido: ${JSON.stringify(raw)}).`);
  }
  if (url.username || url.password || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    refuse(`${envName} não pode ter credenciais, caminho, query ou fragmento.`);
  }
  if (port >= DEV_STACK_PORT_RANGE[0] && port <= DEV_STACK_PORT_RANGE[1]) {
    refuse(`${envName}: a porta ${port} pertence à stack de desenvolvimento local (${DEV_STACK_PORT_RANGE.join("-")}) — recusado.`);
  }
  return `${url.protocol}//${url.hostname}:${port}`;
}

/** Porta do host publicada pelo Postgres do container (docker port), para amarrar a URL do banco ao container validado. */
export function publishedPostgresPort(container) {
  const result = spawnSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8" });
  if (result.status !== 0) refuse(`docker port ${container} falhou — o container existe e está rodando? ${result.stderr ?? ""}`.trim());
  const match = /:(\d+)\s*$/m.exec(result.stdout ?? "");
  if (!match) refuse(`não foi possível ler a porta publicada de ${container}.`);
  return Number(match[1]);
}
