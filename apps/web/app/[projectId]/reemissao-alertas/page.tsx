import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isProjectAdmin } from "@/lib/email-authorization/guard";
import { mapReissuePendingRow, type ReissuePendingRow } from "@/lib/risk-alerts/reissue-approval";

import { ReissueApprovalForm } from "./reissue-approval-form";

export const metadata: Metadata = { title: "Reemissão de alertas" };

export default async function ReissueApprovalPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  // Controle no servidor (além do menu e da RPC): quem não é administrador ativo da obra não vê a página.
  if (!(await isProjectAdmin(projectId)).isAdmin) notFound();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("risk_alert_reissue_pending", { p_project_id: projectId });
  const rows: ReissuePendingRow[] = error ? [] : ((data ?? []) as Array<Record<string, unknown>>).map(mapReissuePendingRow);
  const eligible = rows.filter((r) => r.eligible).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reemissão de alertas à Diretoria"
        description="Decisão administrativa e auditável sobre casos Crítico/Alto cuja comunicação não chegou a todos os destinatários da cadeia."
        actions={<FeatureInfo helpId="reemissao-alertas" />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            Como funciona
            <FeatureInfo helpId="planejamento.reemissao.como-funciona" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>
            Aprovar <strong>apenas registra a decisão</strong> (quem, quando, justificativa e caso) na trilha de auditoria. Nenhum e-mail é enviado por esta página. A reemissão só acontece no ciclo de alertas, quando o
            interruptor de envio das reemissões estiver ligado e todas as travas do piloto forem satisfeitas; mesmo assim, casos com bloqueio manual (suspensão) continuam sem envio.
          </p>
          <p>A lista abaixo é uma leitura aproximada da lacuna; o ciclo reavalia cada destinatário no momento do envio e só reemite quem realmente não foi informado.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            Casos Crítico/Alto abertos ({rows.length}) — elegíveis: {eligible}
            <FeatureInfo helpId="planejamento.reemissao.contagem" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Não foi possível carregar a lista. Nada foi alterado.
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhum caso Crítico/Alto aberto nesta obra.</p>
          ) : (
            <ReissueApprovalForm projectId={projectId} rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
