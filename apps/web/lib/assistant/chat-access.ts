// Quem pode usar a conversa com IA da AXIA (piloto restrito). Não afeta o Q&A determinístico: quem não é elegível continua
// recebendo exatamente as mesmas respostas aprovadas, as saudações básicas e os encaminhamentos — só não chama a IA.
//
//   AXIA_CHAT_ACCESS = admins (padrão) | all
//     admins: a IA só é usada por quem é ADMINISTRADOR ativo da obra (na tela "Selecione um projeto": ADMINISTRADOR ativo em
//             alguma obra). A permissão é lida com a SESSÃO do usuário (RLS), nunca com o cliente de serviço.
//     all   : todos os membros autenticados (liberação progressiva, depois do piloto).
//   Qualquer valor desconhecido = admins (fail closed). O provedor continua desligado até AXIA_CHAT_PROVIDER ser configurado.

type Env = Record<string, string | undefined>;

export type AxiaChatAccessMode = "admins" | "all";

export function loadAxiaChatAccess(env: Env = process.env): AxiaChatAccessMode {
  return (env.AXIA_CHAT_ACCESS ?? "admins").trim().toLowerCase() === "all" ? "all" : "admins";
}

/** Cliente Supabase da SESSÃO do usuário (estrutural, para teste). */
export interface MembershipReader {
  from(table: "project_memberships"): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): PromiseLike<{ data: Array<{ project_id: string; permission: string }> | null; error: unknown }> & {
          eq(column: string, value: string): PromiseLike<{ data: Array<{ project_id: string; permission: string }> | null; error: unknown }>;
        };
      };
    };
  };
}

/**
 * A pessoa pode usar a IA da AXIA? Em modo "admins": precisa ser ADMINISTRADOR ativo (da obra, ou de alguma obra na seleção).
 * Qualquer erro de leitura = não elegível (fail closed).
 */
export async function isAxiaChatEligible(
  reader: MembershipReader,
  userId: string,
  projectId: string | null,
  env: Env = process.env
): Promise<boolean> {
  if (loadAxiaChatAccess(env) === "all") return true;
  try {
    const base = reader.from("project_memberships").select("project_id, permission").eq("user_id", userId).eq("status", "ACTIVE");
    const query = projectId ? (base as unknown as { eq(c: string, v: string): PromiseLike<{ data: Array<{ project_id: string; permission: string }> | null; error: unknown }> }).eq("project_id", projectId) : base;
    const { data, error } = await query;
    if (error || !data) return false;
    return data.some((row) => row.permission === "ADMINISTRADOR");
  } catch {
    return false;
  }
}
