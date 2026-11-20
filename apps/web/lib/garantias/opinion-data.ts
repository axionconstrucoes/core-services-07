// Leitura (servidor, sob RLS, cliente do USUÁRIO) das versões do parecer de cobertura de um caso de garantia. Só a RPC de leitura
// quality_warranty_opinion_versions (security definer, READ+). Falha/indisponibilidade NÃO vira "sem versões" silencioso: devolve o aviso.
import { createSupabaseServerClient } from "@axion/db/server";
import { mapOpinionVersions, type OpinionVersionView } from "./opinion";

export interface OpinionLoad {
  versions: OpinionVersionView[];
  available: boolean;
  error: string | null;
}

export async function listWarrantyOpinions(caseId: string): Promise<OpinionLoad> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("quality_warranty_opinion_versions", { p_case_id: caseId });
  if (error) {
    const unavailable = error.code === "42883" || error.code === "PGRST202" || error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? "");
    return { versions: [], available: !unavailable, error: unavailable ? null : "Não foi possível carregar as versões do parecer." };
  }
  return { versions: mapOpinionVersions(data), available: true, error: null };
}
