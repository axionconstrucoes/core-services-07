// Manifesto — FASE 6 / H2b: Integrações › Sinais de risco de e-mail + novos elementos de Contatos externos (dados globais). Arquivo NOVO;
// entra em ./index.ts por 2 linhas.
import type { HelpManifest } from "../types";

const R = "/[projectId]/integracoes/sinais-email";
const RC = "/[projectId]/integracoes/contatos-externos";

export const SINAIS_EMAIL_MANIFEST: HelpManifest = {
  module: "integracoes-sinais-email",
  routes: [R],
  elements: [
    { route: R, kind: "page", label: "Sinais de risco de e-mail", helpId: "integracoes.sinais-email.pagina" },
    { route: R, kind: "table", label: "Resumo dos sinais", helpId: "integracoes.sinais-email.resumo" },
    { route: R, kind: "table", label: "Lista de sinais", helpId: "integracoes.sinais-email.lista" },
    { route: R, kind: "status", label: "Situação do sinal", helpId: "integracoes.sinais-email.estado" },
    { route: R, kind: "status", label: "Pilar e área funcional", helpId: "integracoes.sinais-email.pilar-area" },
    { route: R, kind: "message", label: "Evidência do sinal", helpId: "integracoes.sinais-email.evidencia" },
    { route: R, kind: "field", label: "Justificativa da decisão", helpId: "integracoes.sinais-email.campo-justificativa" },
    { route: R, kind: "admin-action", label: "Confirmar sinal", helpId: "integracoes.sinais-email.acao-confirmar" },
    { route: R, kind: "admin-action", label: "Descartar sinal", helpId: "integracoes.sinais-email.acao-descartar" },
    { route: R, kind: "admin-action", label: "Delegação de revisão", helpId: "integracoes.sinais-email.delegacoes" },
    { route: R, kind: "field", label: "Profissional delegado", helpId: "integracoes.sinais-email.campo-delegado" },
    { route: R, kind: "field", label: "Área ou pilar da delegação", helpId: "integracoes.sinais-email.campo-escopo" },
    { route: R, kind: "field", label: "Validade da delegação", helpId: "integracoes.sinais-email.campo-validade" },
    { route: R, kind: "field", label: "Motivo da delegação", helpId: "integracoes.sinais-email.campo-motivo" },
    { route: R, kind: "admin-action", label: "Conceder delegação", helpId: "integracoes.sinais-email.acao-delegar" },
    { route: R, kind: "admin-action", label: "Revogar delegação", helpId: "integracoes.sinais-email.acao-revogar" },
    { route: R, kind: "table", label: "Auditoria da revisão", helpId: "integracoes.sinais-email.auditoria" },
    // Contatos externos (Fase 6/H2b)
    { route: RC, kind: "message", label: "Dados globais da organização", helpId: "integracoes.contatos-externos.dados-globais" },
    { route: RC, kind: "table", label: "Solicitações de alteração de dados globais", helpId: "integracoes.contatos-externos.solicitacoes" },
    { route: RC, kind: "admin-action", label: "Salvar / solicitar alteração dos dados da organização", helpId: "integracoes.contatos-externos.acao-alterar-dados" },
    { route: RC, kind: "field", label: "Nota da decisão", helpId: "integracoes.contatos-externos.campo-nota-decisao" },
    { route: RC, kind: "admin-action", label: "Aprovar e aplicar solicitação", helpId: "integracoes.contatos-externos.acao-aprovar-solicitacao" },
    { route: RC, kind: "admin-action", label: "Recusar solicitação", helpId: "integracoes.contatos-externos.acao-recusar-solicitacao" },
    { route: RC, kind: "admin-action", label: "Cancelar solicitação", helpId: "integracoes.contatos-externos.acao-cancelar-solicitacao" },
  ],
};
