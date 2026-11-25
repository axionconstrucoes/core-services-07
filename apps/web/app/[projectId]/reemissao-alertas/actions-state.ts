// Estado do Server Action de aprovação de reemissão — fora do módulo "use server" (mesmo padrão de integracoes/actions-state.ts).
import type { ReissueApprovalOutcome } from "@/lib/risk-alerts/reissue-approval";

export type ApproveReissueState = { error: string | null; outcome: ReissueApprovalOutcome | null };
export const initialApproveReissueState: ApproveReissueState = { error: null, outcome: null };
