// Contrato de resultado da Server Action de seguros (arquivo sem "use server": pode exportar tipos e constantes).
import type { InsuranceActionError } from "./errors";

export type InsuranceActionResult =
  | { ok: true; result: unknown }
  | { ok: false; error: InsuranceActionError };
