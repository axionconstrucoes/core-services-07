// Autenticação OBRIGATÓRIA do remetente de respostas por e-mail — PURO, sem I/O.
//
// Regra (P2): a mensagem só é aceita quando um servidor CONFIÁVEL (authserv-id do Authentication-Results; padrão
// mx.google.com, configurável em ACC_EMAIL_TRUSTED_AUTHSERV_IDS) registrou
//   - dmarc=pass com header.from IGUAL ao domínio do From; ou
//   - dkim=pass com assinatura (header.d / header.i) ALINHADA ao domínio do From (mesmo domínio ou subdomínio dele).
// SPF sozinho NÃO basta (não protege o From visível). Todos os cabeçalhos Authentication-Results são lidos:
//   - nenhum cabeçalho => AUTH_RESULTS_MISSING (rejeição explicada ao remetente, nunca silenciosa);
//   - só cabeçalhos de servidores não confiáveis (podem ter sido escritos pelo próprio remetente) => AUTH_UNTRUSTED_SERVER;
//   - qualquer dmarc=fail/permerror ou dkim alinhado com fail/permerror num cabeçalho confiável => AUTH_FAILED
//     (conflito nunca vira aceitação);
//   - confiável sem pass alinhado => AUTH_NOT_ALIGNED.
// O cabeçalho ARC-Authentication-Results NÃO conta (é do encaminhador, não do servidor que recebeu).

export const TRUSTED_AUTHSERV_IDS_ENV = "ACC_EMAIL_TRUSTED_AUTHSERV_IDS";
export const DEFAULT_TRUSTED_AUTHSERV_IDS: readonly string[] = ["mx.google.com"];

export type SenderAuthenticationFailure = "AUTH_RESULTS_MISSING" | "AUTH_UNTRUSTED_SERVER" | "AUTH_FAILED" | "AUTH_NOT_ALIGNED";

export type SenderAuthentication =
  | { ok: true; method: "DMARC" | "DKIM"; authservId: string }
  | { ok: false; reason: SenderAuthenticationFailure };

export interface ParsedAuthenticationResult {
  authservId: string;
  results: Array<{ method: string; result: string; props: Record<string, string> }>;
}

/** Lista de authserv-id confiáveis (minúsculas). Variável vazia/ausente => padrão (mx.google.com). */
export function resolveTrustedAuthservIds(env: Record<string, string | undefined> = process.env): string[] {
  const raw = (env[TRUSTED_AUTHSERV_IDS_ENV] ?? "").split(/[,;\s]+/).map((v) => v.trim().toLowerCase()).filter(Boolean);
  return raw.length > 0 ? raw : [...DEFAULT_TRUSTED_AUTHSERV_IDS];
}

/** Remove comentários RFC 5322 "(...)" (sem aninhamento profundo) e normaliza espaços. */
function stripComments(value: string): string {
  let out = "";
  let depth = 0;
  for (const ch of value) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Um valor de cabeçalho Authentication-Results (RFC 8601) => authserv-id + resultados por método. */
export function parseAuthenticationResultsHeader(value: string): ParsedAuthenticationResult | null {
  const clean = stripComments(value);
  if (!clean) return null;
  const parts = clean.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const authservId = parts[0].split(" ")[0].toLowerCase();
  if (!authservId || authservId.includes("=")) return null;
  const results: ParsedAuthenticationResult["results"] = [];
  for (const part of parts.slice(1)) {
    const tokens = part.split(" ").filter(Boolean);
    const head = /^([a-z0-9_-]+)=([a-z]+)$/i.exec(tokens[0] ?? "");
    if (!head) continue;
    const props: Record<string, string> = {};
    for (const token of tokens.slice(1)) {
      const kv = /^([a-z0-9_.-]+)=(.+)$/i.exec(token);
      if (kv) props[kv[1].toLowerCase()] = kv[2].replace(/^"|"$/g, "").toLowerCase();
    }
    results.push({ method: head[1].toLowerCase(), result: head[2].toLowerCase(), props });
  }
  return { authservId, results };
}

/** Domínio de um endereço (minúsculas) ou null. */
export function domainOf(address: string): string | null {
  const at = address.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return null;
  const domain = address.trim().toLowerCase().slice(at + 1).replace(/>$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
}

/** Alinhamento relaxado: assinatura do mesmo domínio do From ou de um subdomínio dele (nunca o inverso, nunca outro domínio). */
export function isAlignedDomain(signingDomain: string | null | undefined, fromDomain: string): boolean {
  if (!signingDomain) return false;
  const d = signingDomain.trim().toLowerCase().replace(/^@/, "");
  return d === fromDomain || d.endsWith(`.${fromDomain}`);
}

function dkimSigningDomain(props: Record<string, string>): string | null {
  if (props["header.d"]) return props["header.d"];
  const i = props["header.i"];
  if (i) return i.includes("@") ? i.slice(i.lastIndexOf("@") + 1) : i;
  return null;
}

/**
 * Avalia TODOS os Authentication-Results da mensagem. `headers` aceita um único valor com vários cabeçalhos separados
 * por quebra de linha (formato gravado em alert_email_messages.authentication_results) ou uma lista.
 */
export function verifySenderAuthentication(input: { fromEmail: string; authenticationResults: string | readonly string[] | null | undefined; trustedAuthservIds?: readonly string[] }): SenderAuthentication {
  const fromDomain = domainOf(input.fromEmail);
  const raw = input.authenticationResults;
  const values = (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n/) : []).map((v) => String(v).trim()).filter(Boolean);
  if (values.length === 0 || !fromDomain) return { ok: false, reason: "AUTH_RESULTS_MISSING" };
  const trusted = new Set((input.trustedAuthservIds ?? DEFAULT_TRUSTED_AUTHSERV_IDS).map((v) => v.toLowerCase()));
  const parsed = values.map(parseAuthenticationResultsHeader).filter((p): p is ParsedAuthenticationResult => p !== null);
  if (parsed.length === 0) return { ok: false, reason: "AUTH_RESULTS_MISSING" };
  const fromTrusted = parsed.filter((p) => trusted.has(p.authservId));
  if (fromTrusted.length === 0) return { ok: false, reason: "AUTH_UNTRUSTED_SERVER" };

  let dmarcPass: string | null = null;
  let dkimPass: string | null = null;
  for (const header of fromTrusted) {
    for (const r of header.results) {
      if (r.method === "dmarc") {
        const headerFrom = r.props["header.from"] ?? null;
        if (r.result === "fail" || r.result === "permerror") return { ok: false, reason: "AUTH_FAILED" };
        if (r.result === "pass" && headerFrom === fromDomain) dmarcPass = dmarcPass ?? header.authservId;
      } else if (r.method === "dkim") {
        const aligned = isAlignedDomain(dkimSigningDomain(r.props), fromDomain);
        if (aligned && (r.result === "fail" || r.result === "permerror")) return { ok: false, reason: "AUTH_FAILED" };
        if (aligned && r.result === "pass") dkimPass = dkimPass ?? header.authservId;
      }
    }
  }
  // DMARC (política do domínio) tem precedência na rastreabilidade; DKIM alinhado também basta.
  if (dmarcPass) return { ok: true, method: "DMARC", authservId: dmarcPass };
  if (dkimPass) return { ok: true, method: "DKIM", authservId: dkimPass };
  return { ok: false, reason: "AUTH_NOT_ALIGNED" };
}

/** Texto da resposta explicativa ao remetente (sem detalhes do cabeçalho, sem dados do alerta). */
export function senderAuthenticationMessage(reason: SenderAuthenticationFailure): string {
  switch (reason) {
    case "AUTH_RESULTS_MISSING":
      return "A mensagem chegou sem o resultado de autenticação do servidor de e-mail (DMARC/DKIM). Por segurança, o ACC só aceita comandos de e-mails autenticados: responda a partir da sua caixa corporativa ou registre a ação no ACC.";
    case "AUTH_UNTRUSTED_SERVER":
      return "A autenticação da mensagem não foi registrada por um servidor de e-mail confiável. Por segurança, nada foi alterado: responda a partir da sua caixa corporativa ou registre a ação no ACC.";
    case "AUTH_FAILED":
      return "A verificação de autenticidade do remetente (DMARC/DKIM) falhou. Por segurança, nada foi alterado: responda a partir da sua caixa corporativa ou registre a ação no ACC.";
    default:
      return "A assinatura do e-mail não corresponde ao domínio do remetente (DMARC/DKIM sem alinhamento). Por segurança, nada foi alterado: responda a partir da sua caixa corporativa ou registre a ação no ACC.";
  }
}
