// Manifesto (inventário AUTORITATIVO) do módulo "fontes" — botão "Registrar indício de Qualidade" nas telas de outros módulos. Arquivo EXCLUSIVO do agente I1.
import type { HelpManifest, HelpManifestElement } from "../types";

const ROTAS = [
  "/[projectId]/ssma-registros",
  "/[projectId]/documentos/emails/[emailId]",
  "/[projectId]/documentos/emails/[emailId]/anexos/[attachmentId]",
  "/[projectId]/documentos/versoes/[documentVersionId]",
];
const TRIAGEM = new Set(ROTAS.slice(0, 3));

const base: Array<Omit<HelpManifestElement, "route">> = [
  { kind: "button", label: "Registrar indício de Qualidade", helpId: "fontes.indicio.botao" },
  { kind: "message", label: "Origem já registrada", helpId: "fontes.indicio.duplicidade" },
  { kind: "field", label: "Título do indício", helpId: "fontes.indicio.titulo" },
  { kind: "field", label: "O que foi observado", helpId: "fontes.indicio.descricao" },
  { kind: "field", label: "Classificação", helpId: "fontes.indicio.classificacao" },
  { kind: "button", label: "Registrar RNC com esta evidência", helpId: "fontes.indicio.confirmar" },
];

export const FONTES_MANIFEST: HelpManifest = {
  module: "fontes",
  // Sem rota própria: o componente vive nas telas de SSMA e Documentos (inventariadas nos manifestos desses módulos).
  routes: [],
  elements: ROTAS.flatMap((route) => [
    ...base.map((b) => ({ route, ...b })),
    ...(TRIAGEM.has(route) ? [{ route, kind: "button" as const, label: "Triagem assistida (inferência)", helpId: "fontes.indicio.triagem" }] : []),
    ...(route.endsWith("[documentVersionId]") ? [{ route, kind: "field" as const, label: "Tipo da fonte", helpId: "fontes.indicio.tipo-fonte" }] : []),
  ]),
};
