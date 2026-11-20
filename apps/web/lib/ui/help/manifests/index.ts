// Agrega os manifestos por módulo (cobertura). Cada módulo edita só o seu arquivo.
import type { HelpManifest } from "../types";
import { ADMIN_MANIFEST } from "./admin";
import { COMERCIAL_MANIFEST } from "./comercial";
import { DASHBOARD_MANIFEST } from "./dashboard";
import { ENGENHARIA_MANIFEST } from "./engenharia";
import { EXPERTS_MANIFEST } from "./experts";
import { INTEGRACOES_MANIFEST } from "./integracoes";
import { JURIDICO_MANIFEST } from "./juridico";
import { PLANEJAMENTO_MANIFEST } from "./planejamento";
import { SHARED_MANIFEST } from "./shared";
import { SSMA_MANIFEST } from "./ssma";

export const ALL_HELP_MANIFESTS: HelpManifest[] = [
  SHARED_MANIFEST,
  DASHBOARD_MANIFEST,
  COMERCIAL_MANIFEST,
  PLANEJAMENTO_MANIFEST,
  JURIDICO_MANIFEST,
  SSMA_MANIFEST,
  ENGENHARIA_MANIFEST,
  INTEGRACOES_MANIFEST,
  EXPERTS_MANIFEST,
  ADMIN_MANIFEST,
];
