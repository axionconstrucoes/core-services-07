"use client";

import { useState } from "react";
import { HelpHint } from "@/components/shared/help-hint";
import { AdvancesPanel, EndorsementsPanel, GuaranteesPanel } from "@/components/insurance/panel-instruments";
import { ClaimsPanel, DossierPanel } from "@/components/insurance/panel-claims";
import { DraftsPanel } from "@/components/insurance/panel-drafts";
import { OverviewPanel } from "@/components/insurance/panel-overview";
import { PoliciesPanel } from "@/components/insurance/panel-policies";
import { AuditPanel, ChannelsPanel, ReferencesPanel } from "@/components/insurance/panel-support";
import { PersistedSubjectsPanel } from "@/components/insurance/panel-subjects-persisted";
import { Callout, WorkspaceProvider, type WorkspaceCtx } from "@/components/insurance/kit";
import { SEGUROS_TABS, type SegurosTabId } from "@/lib/insurance-ui/tabs";
import type { InsuranceCapabilities } from "@/lib/insurance-ui/permissions";
import { EMPTY_PERSISTED, type PersistedSupport } from "@/lib/insurance-ui/persistence-data";
import type { InsuranceWorkspaceLoad } from "@/lib/insurance-ui/types";
import { cn } from "@/lib/utils";

const SECTION_NAMES: Record<string, string> = {
  policies: "apólices", versions: "versões", parties: "partes", clauses: "cláusulas", bankGuarantees: "fianças", otherGuarantees: "outras garantias",
  channels: "canais", endorsements: "endossos", advances: "adiantamentos", amortizations: "amortizações", claims: "sinistros", claimSteps: "etapas",
  dossierItems: "dossiê", drafts: "minutas", audit: "auditoria", settings: "configuração de envio", dashboardItems: "painel", documents: "documentos",
};

export function SegurosWorkspace({ projectId, load, caps, today, nowIso, persisted = EMPTY_PERSISTED }: { projectId: string; load: InsuranceWorkspaceLoad; caps: InsuranceCapabilities; today: string; nowIso: string; persisted?: PersistedSupport }) {
  const [tab, setTab] = useState<SegurosTabId>("painel");
  const [target, setTarget] = useState<WorkspaceCtx["target"]>({});
  const goTo = (t: string, tg: WorkspaceCtx["target"] = {}) => {
    setTarget(tg);
    setTab(t as SegurosTabId);
  };
  const failed = Object.keys(load.errors);
  const ctx: WorkspaceCtx = { projectId, data: load.data, caps, today, nowIso, goTo, target };

  return (
    <WorkspaceProvider value={ctx}>
      <div className="flex flex-col gap-4">
        {load.moduleUnavailable ? (
          <Callout tone="warn" role="alert">O módulo de Seguros ainda não está habilitado neste ambiente (as migrações de seguros não foram aplicadas ao banco consultado). Nada foi carregado; isto NÃO significa que não há seguros cadastrados.</Callout>
        ) : failed.length ? (
          <Callout tone="danger" role="alert">Não foi possível carregar: {failed.map((k) => SECTION_NAMES[k] ?? k).join(", ")}. As telas dessas seções podem estar incompletas: não interprete a ausência de linhas como ausência de dados.</Callout>
        ) : null}
        {load.foreignRowsDropped > 0 ? <Callout tone="warn" role="alert">{load.foreignRowsDropped} linha(s) de outro projeto foram descartadas por segurança. Avise o administrador.</Callout> : null}
        <nav aria-label="Abas do módulo Seguros" className="-mx-1 overflow-x-auto px-1">
          <ul className="flex min-w-max items-center gap-1 rounded-md bg-muted p-1">
            {SEGUROS_TABS.map((t) => (
              <li key={t.id} className="flex items-center">
                {/* help-exempt: aba gerada de SEGUROS_TABS; cada aba declara o helpId literal na lista e o ícone de ajuda é renderizado ao lado */}
                <button
                  type="button"
                  aria-current={tab === t.id ? "page" : undefined}
                  onClick={() => goTo(t.id)}
                  className={cn("min-h-11 rounded-sm px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                >
                  {t.label}
                </button>
                <HelpHint helpId={t.helpId} />
              </li>
            ))}
          </ul>
        </nav>
        {tab === "painel" ? <OverviewPanel /> : null}
        {tab === "apolices" ? <PoliciesPanel /> : null}
        {tab === "garantias" ? <GuaranteesPanel /> : null}
        {tab === "endossos" ? <EndorsementsPanel /> : null}
        {tab === "adiantamentos" ? <AdvancesPanel /> : null}
        {tab === "sinistros" ? <ClaimsPanel /> : null}
        {tab === "dossies" ? <DossierPanel /> : null}
        {tab === "minutas" ? <DraftsPanel /> : null}
        {tab === "canais" ? <ChannelsPanel /> : null}
        {tab === "sujeitos" ? <PersistedSubjectsPanel persisted={persisted} /> : null}
        {tab === "referencias" ? <ReferencesPanel /> : null}
        {tab === "auditoria" ? <AuditPanel /> : null}
      </div>
    </WorkspaceProvider>
  );
}
