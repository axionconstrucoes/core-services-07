// Oficialidade da parte a partir da resolução de acc_resolve_external_party (Frente C). Fail-closed: sem vínculo ATIVO e vigente
// NUNCA se presume autoridade; domínio compartilhado/ambíguo NUNCA vincula projeto por coincidência de domínio.
import type { Officiality, PartyMatch, PartyResolution } from "./types";

export interface PartyVerdict {
  officiality: Officiality;
  party_kind: string;
  organization_id: string | null;
  match: PartyMatch | null;
  /** AMBIGUOUS quando domínio compartilhado/ambíguo; CANDIDATE quando só há vínculo candidato/vencido; LINKED com vínculo ativo vigente. */
  link: "LINKED" | "CANDIDATE" | "AMBIGUOUS" | "NONE";
  basis: string;
}

const SUPPLIER_KINDS = new Set(["FORNECEDOR", "SUBCONTRATADA", "PRESTADOR"]);
const DELEGATE_KINDS = new Set(["FISCALIZACAO", "CONSULTOR", "PROJETISTA", "CORRETOR"]);

export function activeMatches(res: PartyResolution): PartyMatch[] {
  return (res.matches ?? []).filter((m) => m.link_status === "ACTIVE" && m.valid_now === true);
}

export function judgeParty(res: PartyResolution | undefined): PartyVerdict {
  if (!res || !res.known) {
    return { officiality: "EXTERNA_NAO_CLASSIFICADA", party_kind: "DESCONHECIDA", organization_id: null, match: null, link: "NONE", basis: "remetente sem vínculo conhecido no projeto (fail-closed)" };
  }
  if (res.ambiguous || res.domain_shared) {
    return {
      officiality: "EXTERNA_NAO_CLASSIFICADA",
      party_kind: "AMBIGUA",
      organization_id: null,
      match: null,
      link: "AMBIGUOUS",
      basis: res.domain_shared ? "domínio compartilhado por várias relações: não vincula projeto nem presume papel" : "resolução ambígua de parte",
    };
  }
  const active = activeMatches(res);
  if (active.length === 0) {
    return { officiality: "EXTERNA_NAO_CLASSIFICADA", party_kind: "CANDIDATA", organization_id: null, match: null, link: "CANDIDATE", basis: "vínculo candidato, encerrado ou fora de vigência: sem autoridade presumida" };
  }
  const distinct = new Set(active.map((m) => m.organization_id));
  if (distinct.size > 1) {
    return { officiality: "EXTERNA_NAO_CLASSIFICADA", party_kind: "AMBIGUA", organization_id: null, match: null, link: "AMBIGUOUS", basis: "mais de uma organização ativa para o mesmo remetente" };
  }
  const m = active[0];
  const kind = m.org_kind.toUpperCase();
  const scope = (m.delegation_scope ?? []).filter(Boolean);
  let officiality: Officiality = "EXTERNA_NAO_CLASSIFICADA";
  if (kind === "CLIENTE") officiality = "OFICIAL_CLIENTE";
  else if (kind === "GERENCIADORA") officiality = "OFICIAL_GERENCIADORA";
  else if (DELEGATE_KINDS.has(kind) && scope.length > 0) officiality = "REPRESENTANTE_DELEGADO";
  else if (SUPPLIER_KINDS.has(kind)) officiality = "FORNECEDOR_SUBCONTRATADA";
  return { officiality, party_kind: kind, organization_id: m.organization_id, match: m, link: "LINKED", basis: `vínculo ativo e vigente (${kind}, papel ${m.role_in_project})` };
}
