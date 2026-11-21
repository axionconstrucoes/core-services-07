// Fixture de navegador de GARANTIAS (Fase 4/B): monta o VerificationPanel REAL (aceite do cliente: informado x comprovado) com dados sintéticos,
// sem Next, login, Supabase ou rede. Query: status=NENHUM|INFORMADO|COMPROVADO|LEGADO (padrão NENHUM), manage=1|0 (padrão 1), state=VERIFICADA.
import { createRoot } from "react-dom/client";
import { VerificationPanel } from "@/components/garantias/records-panels";
import { mapAcceptanceRow, mapEvidenceViewRow, mapWarrantyCaseRow } from "@/lib/garantias/types";

const P = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const q = new URLSearchParams(location.search);
const status = q.get("status") ?? "NENHUM";
const canManage = q.get("manage") !== "0";
const state = q.get("state") ?? "VERIFICADA";

const accepted = status !== "NENHUM";
const warranty = mapWarrantyCaseRow({
  id: id(1), project_id: P, code: "GAR-0001", service_system: "Impermeabilização", state, defect_description: "Infiltração na laje de cobertura", cause_category: "EXECUCAO",
  origin_type: "EMAIL", criticality: "MEDIUM", reopen_count: 0, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z", row_version: 7,
  accepted_at: accepted ? "2026-11-18T12:00:00Z" : null, accepted_by_name: accepted ? "Maria Cliente" : null, accepted_evidence_id: accepted ? id(21) : null,
  acceptance_status: status === "LEGADO" ? "NENHUM" : status, current_acceptance_id: status === "INFORMADO" || status === "COMPROVADO" ? id(31) : null,
});
const evidence = [
  mapEvidenceViewRow({ id: id(21), source_type: "EMAIL", source_ref: "msg-aceite-2026-11-18", classification: "NC_COMPROVADA", epistemic: "FATO", created_at: "2026-11-18T00:00:00Z" }),
  mapEvidenceViewRow({ id: id(22), source_type: "DOCUMENTO", source_ref: "ata-vistoria-final.pdf", classification: "INDICIO", epistemic: "FATO", created_at: "2026-11-18T00:00:00Z" }),
  mapEvidenceViewRow({ id: id(23), source_type: "SSMA_FOTO", source_ref: "foto-laje-01.jpg", classification: "INDICIO", epistemic: "FATO", created_at: "2026-11-10T00:00:00Z" }),
  mapEvidenceViewRow({ id: id(24), source_type: "EMAIL", source_ref: "inferencia-interna", classification: "INDICIO", epistemic: "INFERENCIA", created_at: "2026-11-10T00:00:00Z" }),
];
const acceptances =
  status === "COMPROVADO"
    ? [
        mapAcceptanceRow({ id: id(31), kind: "COMPROVADO", accepted_at: "2026-11-18", accepted_by_name: "Maria Cliente", manifestant_organization: "Cliente Exemplo SA", manifestant_contact: "maria@cliente.exemplo.invalid", evidence_id: id(21), evidence_source_ref: "msg-aceite-2026-11-18", source_hash: "a".repeat(64), created_by: id(704), created_at: "2026-11-19T10:00:00Z" }),
        mapAcceptanceRow({ id: id(30), kind: "INFORMADO", accepted_at: "2026-11-17", accepted_by_name: "Cliente Informado", evidence_id: id(21), evidence_source_ref: "msg-aceite-2026-11-18", created_by: id(704), created_at: "2026-11-18T10:00:00Z" }),
      ]
    : status === "INFORMADO"
      ? [mapAcceptanceRow({ id: id(31), kind: "INFORMADO", accepted_at: "2026-11-18", accepted_by_name: "Maria Cliente", evidence_id: id(21), evidence_source_ref: "msg-aceite-2026-11-18", created_by: id(704), created_at: "2026-11-18T10:00:00Z" })]
      : [];

declare global {
  interface Window {
    __ready?: boolean;
  }
}
createRoot(document.getElementById("root")!).render(
  <div style={{ padding: 16 }} className="mx-auto max-w-[1200px]">
    <VerificationPanel projectId={P} warranty={warranty} verifications={[]} evidence={evidence} acceptances={acceptances} canManage={canManage} />
  </div>,
);
window.__ready = true;
