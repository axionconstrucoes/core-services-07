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
    { route: R, kind: "field", label: "Situação", helpId: "integracoes.contatos-externos.campo-situacao" },
    { route: R, kind: "field", label: "Contrato / referência", helpId: "integracoes.contatos-externos.campo-contrato" },
    { route: R, kind: "field", label: "Cláusula de delegação", helpId: "integracoes.contatos-externos.campo-clausula" },
    { route: R, kind: "field", label: "Limites de competência", helpId: "integracoes.contatos-externos.campo-escopo" },
    { route: R, kind: "field", label: "Vigência", helpId: "integracoes.contatos-externos.campo-vigencia" },
    { route: R, kind: "field", label: "Motivo", helpId: "integracoes.contatos-externos.campo-motivo" },
    { route: R, kind: "field", label: "Organização do contato", helpId: "integracoes.contatos-externos.campo-organizacao" },
    { route: R, kind: "field", label: "Domínio de e-mail", helpId: "integracoes.contatos-externos.campo-dominio" },
    { route: R, kind: "field", label: "E-mail do contato", helpId: "integracoes.contatos-externos.campo-email" },
    { route: R, kind: "field", label: "Nome do contato", helpId: "integracoes.contatos-externos.campo-nome" },
    { route: R, kind: "field", label: "Razão social", helpId: "integracoes.contatos-externos.campo-razao" },
    { route: R, kind: "field", label: "CNPJ / identificação fiscal", helpId: "integracoes.contatos-externos.campo-cnpj" },
    { route: R, kind: "field", label: "Papel no projeto", helpId: "integracoes.contatos-externos.campo-papel" },
    { route: R, kind: "field", label: "Observações", helpId: "integracoes.contatos-externos.campo-observacoes" },
    { route: R, kind: "field", label: "Confirmo o vínculo", helpId: "integracoes.contatos-externos.campo-confirmacao" },
    { route: R, kind: "admin-action", label: "Salvar vínculo", helpId: "integracoes.contatos-externos.acao-salvar-vinculo" },
    { route: R, kind: "admin-action", label: "Salvar domínio", helpId: "integracoes.contatos-externos.acao-salvar-dominio" },
    { route: R, kind: "admin-action", label: "Salvar contato", helpId: "integracoes.contatos-externos.acao-salvar-contato" },
    { route: R, kind: "admin-action", label: "Cadastrar organização", helpId: "integracoes.contatos-externos.acao-cadastrar" },
    { route: R, kind: "admin-action", label: "Confirmar contato", helpId: "integracoes.contatos-externos.acao-confirmar-contato" },
    { route: R, kind: "admin-action", label: "Rejeitar contato", helpId: "integracoes.contatos-externos.acao-rejeitar" },
  ],
};
