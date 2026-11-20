"use client";

import { HelpHint } from "@/components/shared/help-hint";

// Nome histórico do componente de ajuda contextual (ⓘ). Mantido para os usos existentes (`<FeatureInfo helpId="..." />`):
// toda a implementação vive em HelpHint (components/shared/help-hint.tsx) e todo conteúdo no catálogo (lib/ui/help/registry.ts).
export function FeatureInfo(props: { helpId: string; className?: string; iconClassName?: string }) {
  return <HelpHint {...props} />;
}
