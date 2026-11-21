// CatÃ¡logo de ajuda do mÃ³dulo "seguros" â€” Seguros, FianÃ§as, Endossos e Sinistros. Arquivo EXCLUSIVO do agente deste mÃ³dulo.
// Regras de conteÃºdo: ver lib/ui/help/types.ts e docs/design-system/hover-text-e-contraste.md. Ids novos: "seguros.tela.elemento".
// O conteÃºdo estÃ¡ dividido em arquivos de apoio do mesmo mÃ³dulo (seguros-telas, seguros-campos, seguros-acoes) para manter cada arquivo legÃ­vel.
import type { FeatureHelpDefinition } from "../types";
import { SEGUROS_ACOES } from "./seguros-acoes";
import { SEGUROS_CAMPOS } from "./seguros-campos";
import { SEGUROS_DESTINATARIOS } from "./seguros-destinatarios";
import { SEGUROS_ENDOSSOS_DUPLA } from "./seguros-endossos-dupla";
import { SEGUROS_COMPETENCIAS } from "./seguros-competencias";
import { SEGUROS_F4B_HELP } from "./seguros-f4b";
import { SEGUROS_PERSISTENCIA_HELP } from "./seguros-persistencia";
import { SEGUROS_TELAS } from "./seguros-telas";

export const SEGUROS_HELP: FeatureHelpDefinition[] = [...SEGUROS_TELAS, ...SEGUROS_CAMPOS, ...SEGUROS_ACOES, ...SEGUROS_ENDOSSOS_DUPLA, ...SEGUROS_DESTINATARIOS, ...SEGUROS_COMPETENCIAS, ...SEGUROS_PERSISTENCIA_HELP, ...SEGUROS_F4B_HELP];
