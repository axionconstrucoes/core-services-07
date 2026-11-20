export interface CompactContractAlertActionState {
  success: boolean;
  error: string | null;
  warning?: string | null;
}

export const initialCompactContractAlertActionState: CompactContractAlertActionState = {
  success: false,
  error: null,
};
