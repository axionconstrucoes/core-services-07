// Validação do Q&A da AXIA (lote 1) — cobertura da resposta e encaminhamento "Falar com o ADMIN".
//
// Puro, sem I/O. NÃO há canal oficial de contato com o ADMIN registrado no projeto (decisão G1 pendente em
// docs/qa-axia-lote-1.md). Enquanto isso:
//   - em produção (ou em qualquer ambiente na Vercel) a AXIA mostra só a orientação em texto, SEM link;
//   - num ambiente local de teste, ligado por ACC_AXIA_QA_FIXTURES=1, o link aponta para um destino FICTÍCIO
//     (domínio reservado .invalid, que nunca resolve), apenas para validar a exibição e a privacidade do clique.
// O destino NUNCA carrega a pergunta nem o histórico da conversa: é uma URL fixa, montada no servidor.

export type AnswerCoverage = "completa" | "parcial" | "ausente";

export const ADMIN_LABEL = "Falar com o ADMIN";
export const NOT_ANSWERED_LABEL = "Isso não respondeu à minha pergunta";

/** Canal oficial do ADMIN: nenhum registrado (G1 pendente). Quando existir, entra aqui, via configuração server-side. */
export const OFFICIAL_ADMIN_CHANNEL: string | null = null;

/** Destino FICTÍCIO, só para teste local. Domínio .invalid (RFC 2606) nunca recebe e-mail. Assunto genérico, sem corpo. */
export const ADMIN_TEST_HREF = "mailto:admin.ficticio@example.invalid?subject=Contato%20com%20o%20administrador%20do%20ACC";

export interface AdminHandoff {
  mode: "link" | "text";
  label: string;
  href: string | null;
  /** true = destino fictício de teste (nunca em produção). */
  test: boolean;
  note: string;
}

type Env = Record<string, string | undefined>;

/** Fixtures e destino fictício só existem fora da Vercel e com a variável explícita. */
export function qaFixturesEnabled(env: Env = process.env): boolean {
  return env.ACC_AXIA_QA_FIXTURES === "1" && !env.VERCEL;
}

export function resolveAdminHandoff(env: Env = process.env): AdminHandoff {
  if (OFFICIAL_ADMIN_CHANNEL) {
    return { mode: "link", label: ADMIN_LABEL, href: OFFICIAL_ADMIN_CHANNEL, test: false, note: "Canal oficial." };
  }
  if (qaFixturesEnabled(env)) {
    return { mode: "link", label: ADMIN_LABEL, href: ADMIN_TEST_HREF, test: true, note: "Destino fictício de teste." };
  }
  return {
    mode: "text",
    label: ADMIN_LABEL,
    href: null,
    test: false,
    note: "Procure o administrador da obra. O canal oficial ainda não foi definido.",
  };
}
