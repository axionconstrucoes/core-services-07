// Entrada da FIXTURE estática das telas de Governança (Fase 6/H2a): monta as páginas REAIS (competencias/page.tsx e
// aprovacoes-externas/page.tsx) com o catálogo de ajuda REAL, o CSS REAL e um cliente Supabase FALSO com dados SINTÉTICOS (rotulado FIXTURE).
// Sem login, rede ou Supabase. Cenas por hash: #comp-admin, #comp-validador, #comp-leitura, #aprov-gestor, #aprov-colab, #aprov-admin, #aprov-leitura.
import { createRoot } from "react-dom/client";
import CompetenciasPage from "@/app/[projectId]/competencias/page";
import AprovacoesPage from "@/app/[projectId]/aprovacoes-externas/page";
import { hashExternalSendContent } from "@/lib/governance/external-send-binding";

const P = "10000000-0000-4000-8000-0000000000f1";
const U = {
  ana: "00000000-0000-4000-8000-0000000000a1",
  bruno: "00000000-0000-4000-8000-0000000000a2",
  carla: "00000000-0000-4000-8000-0000000000a3",
  davi: "00000000-0000-4000-8000-0000000000a4",
  eva: "00000000-0000-4000-8000-0000000000a5",
};
const D = { doc1: "20000000-0000-4000-8000-000000000001", doc2: "20000000-0000-4000-8000-000000000002" };
const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const profiles = [
  { id: U.ana, name: "Ana Administradora (sintética)" },
  { id: U.bruno, name: "Bruno Gestor (sintético)" },
  { id: U.carla, name: "Carla Jurídica (sintética)" },
  { id: U.davi, name: "Davi Validador (sintético)" },
  { id: U.eva, name: "Eva Colaboradora (sintética)" },
];
const comp = (n: number, user: string, competence: string, over: Record<string, unknown> = {}) => ({
  id: id(n), project_id: P, user_id: user, competence, status: "ACTIVE", habilitation_status: "MAINTENANCE", revalidation_status: "REQUIRED",
  valid_from: "2026-01-01", valid_until: null, granted_by: U.ana, granted_at: "2026-03-01T12:00:00Z", row_version: 1, evidence_document_id: D.doc1,
  registration_kind: "OAB", revalidated_at: null, revoked_at: null, ...over,
});
const req = (n: number, over: Record<string, unknown> = {}) => ({
  id: id(100 + n), project_id: P, target_user_id: U.bruno, competence: "TECNICO_RESPONSAVEL", requested_by: U.ana, requested_at: "2026-11-20T12:00:00Z",
  expires_at: "2026-12-20T12:00:00Z", valid_until: null, registration_kind: "CREA", evidence_document_id: D.doc1, basis_note: null, status: "PENDING",
  validator_user_id: null, validator_kind: null, validated_at: null, validation_note: null, row_version: 1, ...over,
});
const val = (n: number, user: string, status: string, over: Record<string, unknown> = {}) => ({
  id: id(200 + n), project_id: P, user_id: user, designated_by: U.ana, designated_at: "2026-11-10T12:00:00Z", designation_document_id: D.doc2,
  reason: "Ata da diretoria designa validador independente de habilitação.", valid_from: "2026-11-10", valid_until: "2027-03-01", status,
  accepted_at: status === "ACTIVE" ? "2026-11-11T12:00:00Z" : null, revoked_at: null, revoke_reason: null, ...over,
});

const mk = (subject: string, body: string, attachments: string[] = []) => ({ subject, body, attachments, hash: hashExternalSendContent({ subject, body, attachments }) });
const C1 = mk("Solicitação de informações técnicas", "Prezados,\nsolicitamos o envio do laudo técnico da obra sintética.\nAtt.", ["laudo-sintetico.pdf"]);
const C2 = mk("Minuta de apólice", "Minuta sintética de Seguros para análise da seguradora.");
const prep = (n: number, over: Record<string, unknown>, c?: { hash: string }) => ({
  id: id(300 + n), project_id: P, context: "SOLICITACAO_ACAO", action_kind: "SOLICITACAO_ACAO",
  recipients: ["contato@cliente-sintetico.com.br", "pessoa@axion.com.br"], external_recipients: ["contato@cliente-sintetico.com.br"],
  content_hash: c?.hash ?? "a".repeat(64), content_version: "v1", prepared_by: U.eva, prepared_at: "2026-11-21T10:00:00Z", status: "PREPARED",
  required_tier: "MANAGE", decided_by: null, decided_at: null, decision_note: null, consumed_at: null, entity_type: null, ...over,
});

const base: Record<string, unknown[]> = {
  profiles,
  documents: [
    { id: D.doc1, title: "Diploma e registro (sintético)", kind: "ESPECIFICACAO" },
    { id: D.doc2, title: "Ata da diretoria (sintética)", kind: "ESPECIFICACAO" },
  ],
  project_memberships: [U.ana, U.bruno, U.carla, U.davi, U.eva].map((u) => ({ user_id: u, permission: "COLABORADOR", status: "ACTIVE" })),
  project_competences: [
    comp(1, U.carla, "JURIDICO"),
    comp(2, U.bruno, "SEGUROS", { habilitation_status: "VALIDATED", revalidation_status: "CURRENT" }),
    comp(3, U.eva, "TECNICO_RESPONSAVEL", { habilitation_status: "UNVALIDATED" }),
  ],
  project_competence_requests: [
    req(1),
    req(2, { status: "APPROVED", target_user_id: U.bruno, competence: "SEGUROS", validator_user_id: U.davi, validator_kind: "DESIGNATED", validated_at: "2026-11-15T12:00:00Z", validation_note: "Documento conferido." }),
  ],
  project_competence_validators: [val(1, U.davi, "ACTIVE"), val(2, U.eva, "PROPOSED")],
  project_competence_governance_events: [{ id: id(900), action: "REQUESTED", actor_user_id: U.ana, actor_role: "ADMIN", created_at: "2026-11-20T12:00:00Z", detail: {} }],
  external_send_preparations: [
    prep(1, {}, C1),
    prep(2, { context: "SEGUROS_MINUTA", action_kind: "ENVIO_NOVO", required_tier: "ADMIN" }, C2),
    prep(3, { status: "APPROVED", decided_by: U.bruno, decided_at: "2026-11-21T11:00:00Z", decision_note: "Cliente pediu retorno formal por escrito." }, C1),
    prep(4, { status: "REJECTED", decided_by: U.bruno, decided_at: "2026-11-21T11:30:00Z", decision_note: "Texto incompleto, refazer." }, C1),
    prep(5, {}, { hash: "b".repeat(64) }), // hash que NÃO confere com o conteúdo (adulterado)
  ],
  external_send_preparation_contents: [
    { preparation_id: id(301), ...C1 },
    { preparation_id: id(302), ...C2 },
    { preparation_id: id(303), ...C1 },
    { preparation_id: id(304), ...C1 },
    { preparation_id: id(305), ...C1 },
  ],
};

type Scene = { page: "comp" | "aprov"; tier: string; me: string; designated?: boolean; drop?: string[] };
const SCENES: Record<string, Scene> = {
  "comp-admin": { page: "comp", tier: "ADMIN", me: U.ana },
  "comp-validador": { page: "comp", tier: "READ", me: U.davi, designated: true },
  "comp-proposto": { page: "comp", tier: "REGISTER", me: U.eva },
  "comp-leitura": { page: "comp", tier: "READ", me: U.carla, drop: ["project_competence_governance_events"] },
  "aprov-gestor": { page: "aprov", tier: "MANAGE", me: U.bruno },
  "aprov-colab": { page: "aprov", tier: "REGISTER", me: U.eva },
  "aprov-admin": { page: "aprov", tier: "ADMIN", me: U.ana },
  "aprov-leitura": { page: "aprov", tier: "READ", me: U.carla },
};

declare global {
  interface Window {
    __ready?: boolean;
    __hash?: (s: { subject: string; body: string; attachments: string[] }) => string;
    __scene?: string;
    __renderError?: string;
  }
}

async function main() {
  const name = location.hash.replace(/^#/, "") || "comp-admin";
  const s = SCENES[name];
  window.__scene = name;
  window.__hash = (c) => hashExternalSendContent(c);
  window.__tier = s.tier;
  const tables: Record<string, unknown[]> = { ...base };
  for (const t of s.drop ?? []) tables[t] = [];
  window.__fx = { me: s.me, tables, designated: s.designated };
  const sp = new URLSearchParams(location.search);
  const searchParams = Promise.resolve({ ok: sp.get("ok") ?? undefined, erro: sp.get("erro") ?? undefined });
  const params = Promise.resolve({ projectId: P });
  const root = document.getElementById("root")!;
  const banner = document.createElement("p");
  banner.id = "fixture-banner";
  banner.setAttribute("style", "margin:0;padding:6px 12px;background:#fde68a;color:#1f2937;font-weight:700;font-size:13px");
  banner.textContent = `FIXTURE (dados sintéticos, cliente Supabase falso) — cena ${name}, nível ${s.tier}. Não é homologação autenticada.`;
  document.body.insertBefore(banner, root);
  root.className = "p-4";
  try {
    const el = s.page === "comp" ? await CompetenciasPage({ params, searchParams }) : await AprovacoesPage({ params, searchParams });
    createRoot(root).render(el);
  } catch (e) {
    window.__renderError = String((e as Error)?.message ?? e);
    root.textContent = window.__notFound ? "404 (notFound)" : `ERRO: ${window.__renderError}`;
  }
  requestAnimationFrame(() => setTimeout(() => { window.__ready = true; }, 150));
}
void main();
