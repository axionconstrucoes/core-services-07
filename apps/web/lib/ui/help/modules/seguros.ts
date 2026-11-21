// Catálogo de ajuda do módulo "seguros" — Seguros, Fianças, Endossos e Sinistros. Arquivo EXCLUSIVO do agente deste módulo.
// Regras de conteúdo: ver lib/ui/help/types.ts e docs/design-system/hover-text-e-contraste.md. Ids novos: "seguros.tela.elemento".
// O conteúdo está dividido em arquivos de apoio do mesmo módulo (seguros-telas, seguros-campos, seguros-acoes) para manter cada arquivo legível.
import type { FeatureHelpDefinition } from "../types";
import { SEGUROS_ACOES } from "./seguros-acoes";
import { SEGUROS_CAMPOS } from "./seguros-campos";
import { SEGUROS_DESTINATARIOS } from "./seguros-destinatarios";
import { SEGUROS_ENDOSSOS_DUPLA } from "./seguros-endossos-dupla";
import { SEGUROS_PERSISTENCIA_HELP } from "./seguros-persistencia";
import { SEGUROS_TELAS } from "./seguros-telas";

export const SEGUROS_HELP: FeatureHelpDefinition[] = [...SEGUROS_TELAS, ...SEGUROS_CAMPOS, ...SEGUROS_ACOES, ...SEGUROS_ENDOSSOS_DUPLA, ...SEGUROS_DESTINATARIOS, ...SEGUROS_PERSISTENCIA_HELP];
