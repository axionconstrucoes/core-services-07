"use client";

import { HelpHint } from "@/components/shared/help-hint";
import { Callout, DataTable, Section, StatusBadge, useWorkspace, type Column } from "@/components/insurance/kit";
import { formatDate } from "@/lib/insurance-ui/format";
import { DASHBOARD_KIND_LABEL, labelOf } from "@/lib/insurance-ui/labels";
import { groupDashboardItems, kpiDisplay, overviewKpis } from "@/lib/insurance-ui/model";
import type { DashboardItemRow } from "@/lib/insurance-ui/types";

const KPI_META: Record<string, { label: string; helpId: string }> = {
  "apolices-vigentes": { label: "Apólices em vigência", helpId: "seguros.painel.kpi-apolices-vigentes" },
  vencimentos: { label: "Vencimentos (vencidos e a vencer em 30 dias)", helpId: "seguros.painel.kpi-vencimentos" },
  "endossos-pendentes": { label: "Endossos pendentes", helpId: "seguros.painel.kpi-endossos-pendentes" },
  "sinistros-andamento": { label: "Eventos e sinistros em andamento", helpId: "seguros.painel.kpi-sinistros-andamento" },
  "garantias-insuficientes": { label: "Adiantamentos com garantia insuficiente", helpId: "seguros.painel.kpi-garantias-insuficientes" },
};

const TAB_FOR_KIND: Record<string, string> = {
  VENCIMENTO: "apolices",
  ENDOSSO_PENDENTE: "endossos",
  GARANTIA_INSUFICIENTE: "adiantamentos",
  GARANTIA_SEM_DADOS: "adiantamentos",
  SINISTRO_EM_ANDAMENTO: "sinistros",
  PRAZO_AVISO: "sinistros",
};

export function OverviewPanel() {
  const { data, today, goTo } = useWorkspace();
  const kpis = overviewKpis(data, today);
  const grouped = groupDashboardItems(data.dashboardItems);
  const columns: Column<DashboardItemRow & { id: string }>[] = [
    { key: "kind", label: "Tipo", render: (r) => labelOf(DASHBOARD_KIND_LABEL, r.kind) },
    { key: "title", label: "Item", render: (r) => r.title },
    { key: "due", label: "Data-limite", render: (r) => formatDate(r.due_date) },
    { key: "days", label: "Dias", render: (r) => (r.days_to_due === null ? "SEM DADOS" : String(r.days_to_due)) },
    { key: "sev", label: "Situação", render: (r) => <StatusBadge text={r.severity.replaceAll("_", " ")} variant={r.severity === "VENCIDO" || r.severity === "INSUFICIENTE" ? "destructive" : r.severity === "SEM_DADOS" ? "secondary" : "warning"} /> },
    {
      key: "go",
      label: "Abrir",
      render: (r) => (
        // help-exempt: atalho de navegação interna cujo destino é a aba nomeada no rótulo; a coluna é descrita no helpId da tabela
        <button type="button" className="min-h-11 underline underline-offset-2" onClick={() => goTo(TAB_FOR_KIND[r.kind] ?? "painel")}>
          Ver aba
        </button>
      ),
    },
  ];
  const rows = data.dashboardItems.map((i) => ({ ...i, id: `${i.kind}:${i.entity_id}` }));
  return (
    <div className="flex flex-col gap-4">
      <Callout tone="info">
        Os números abaixo contam somente o que está cadastrado neste projeto. Quando nada foi cadastrado, o indicador mostra SEM DADOS, nunca zero.
        <HelpHint helpId="seguros.painel.aviso-sem-dados" />
      </Callout>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.id} className="rounded-lg border border-border bg-card p-4 text-card-foreground">
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              {KPI_META[k.id].label}
              <HelpHint helpId={KPI_META[k.id].helpId} />
            </p>
            <p className="mt-1 text-3xl font-bold">{kpiDisplay(k)}</p>
            <p className="text-xs text-muted-foreground">{k.detail}</p>
          </div>
        ))}
      </div>
      <Section title="Itens que pedem atenção" helpId="seguros.painel.lista-atencao">
        {data.dashboardItems.length === 0 && data.policies.length + data.bankGuarantees.length + data.claims.length === 0 ? (
          <p className="text-sm text-muted-foreground">SEM DADOS: nada foi cadastrado no módulo de Seguros deste projeto.</p>
        ) : (
          <DataTable columns={columns} rows={rows} empty="Nenhum item pede atenção nos próximos 30 dias, com base no que está cadastrado." caption="Itens de atenção do módulo de seguros" />
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Fonte: função insurance_dashboard_items (leitura sob RLS). Tipos presentes: {Object.keys(grouped).map((k) => labelOf(DASHBOARD_KIND_LABEL, k)).join(", ") || "nenhum"}.
        </p>
      </Section>
    </div>
  );
}
