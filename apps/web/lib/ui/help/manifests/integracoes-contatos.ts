// Manifesto — FASE 5 / C: Integrações › Contatos externos monitorados. Arquivo NOVO; entra em ./index.ts por 2 linhas.
import type { HelpManifest } from "../types";

const R = "/[projectId]/integracoes/contatos-externos";

export const INTEGRACOES_CONTATOS_MANIFEST: HelpManifest = {
  module: "integracoes-contatos",
  routes: [R],
  elements: [
    { route: R, kind: "page", label: "Contatos externos monitorados", helpId: "integracoes.contatos-externos.pagina" },
    { route: R, kind: "table", label: "Resumo", helpId: "integracoes.contatos-externos.resumo" },
    { route: R, kind: "table", label: "Cobertura da sincronização", helpId: "integracoes.contatos-externos.cobertura" },
    { route: R, kind: "admin-action", label: "Contatos descobertos pendentes (Confirmar contato / Rejeitar)", helpId: "integracoes.contatos-externos.candidatos" },
    { route: R, kind: "table", label: "Organizações e vínculos (Corrigir vínculos, domínios e contatos)", helpId: "integracoes.contatos-externos.organizacoes" },
    { route: R, kind: "admin-action", label: "Nova organização neste projeto", helpId: "integracoes.contatos-externos.nova-organizacao" },
    { route: R, kind: "table", label: "Auditoria recente", helpId: "integracoes.contatos-externos.auditoria" },
  ],
};
