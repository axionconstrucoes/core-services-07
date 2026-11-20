// Caminho histórico da ajuda contextual. O registro único e o contrato vivem em ./help/ (types.ts, registry.ts).
// Mantido para não quebrar imports existentes (`@/lib/ui/feature-help`): reexporta tudo do registro universal.
export type { FeatureHelpDefinition, HelpEntry } from "./help/registry";
export { ACC_FEATURE_HELP, ALL_HELP_ENTRIES, getFeatureHelp } from "./help/registry";
