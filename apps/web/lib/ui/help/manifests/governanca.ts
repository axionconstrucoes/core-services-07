// Manifesto — FASE 6 / H2a: Competências e Aprovações externas. Arquivo NOVO; entra em ./index.ts por 2 linhas.
import type { HelpManifest, HelpManifestElement } from "../types";
import { GOVERNANCA_HELP } from "../modules/governanca";

const C = "/[projectId]/competencias";
const A = "/[projectId]/aprovacoes-externas";

// Rótulos legíveis por helpId (a lista de elementos é gerada a partir do catálogo para não divergir dele: 1 entrada = 1 elemento inventariado).
const elements: HelpManifestElement[] = GOVERNANCA_HELP.map((h): HelpManifestElement => ({
  route: h.id.startsWith("governanca.competencias.menu") || h.id.startsWith("governanca.aprovacoes.menu") ? "*" : h.id.startsWith("governanca.competencias.") ? C : A,
  kind: h.kind ?? "field",
  label: h.id.endsWith(".menu") ? `Menu lateral › ${h.title}` : h.title,
  helpId: h.id,
}));

export const GOVERNANCA_MANIFEST: HelpManifest = {
  module: "governanca",
  routes: [C, A],
  elements,
};
