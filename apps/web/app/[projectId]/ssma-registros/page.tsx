import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { SsmaInstallCard } from "@/components/ssma/ssma-install-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProject, getProjectMembers } from "@/lib/data";
import { getFieldRecords } from "@/lib/ssma/field-records/data";
import { FieldRecordsTable } from "@/components/ssma/field-records/field-records-table";
import { summarizeFieldRecords } from "@/lib/ssma/field-records/field-record-view";
import { PossibleDuplicatesPanel } from "@/components/ssma/field-records/possible-duplicates-panel";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { findPossibleDuplicates, type SsmaFormMetricsRow, type SsmaIncidentLinkRow } from "@/lib/ssma/dashboard-metrics";
import type { FieldRecordRow } from "@/lib/ssma/field-records/field-record-view";
import { createSupabaseServerClient } from "@axion/db/server";

export const metadata: Metadata = { title: "Registros de campo SSMA" };


export default async function SsmaFieldRecordsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, members] = await Promise.all([getProject(projectId), getProjectMembers(projectId)]);
  if (!project) notFound();

  const names = new Map(members.map((member) => [member.userId, member.user.name]));
  const { available, records } = await getFieldRecords(projectId, names);
  const today = new Date().toISOString().slice(0, 10);
  const summary = summarizeFieldRecords(records, today);

  // Possíveis duplicidades (acidente x ocorrência de campo): só o Administrador revisa; nada é descontado sem a decisão.
  let duplicatePairs: ReturnType<typeof findPossibleDuplicates> = [];
  const duplicateLabels: Record<string, { form: string; record: string }> = {};
  if (available && (await getCurrentProjectPermission(projectId)) === "ADMINISTRADOR") {
    const supabase = await createSupabaseServerClient();
    const [forms, rows, links] = await Promise.all([
      supabase.from("ssma_form_submissions").select("id,checklist_slug,occurred_at,field_values").eq("project_id", projectId).eq("status", "SUBMITTED").eq("checklist_slug", "ocorrencia-acidente"),
      supabase.from("ssma_field_records").select("id,kind,category,description,location,occurred_at").eq("project_id", projectId).eq("kind", "OCORRENCIA"),
      supabase.from("ssma_incident_links").select("form_submission_id,field_record_id,decision").eq("project_id", projectId),
    ]);
    if (!forms.error && !rows.error && !links.error) {
      duplicatePairs = findPossibleDuplicates({
        forms: (forms.data ?? []) as SsmaFormMetricsRow[],
        fieldRecords: (rows.data ?? []) as unknown as FieldRecordRow[],
        links: (links.data ?? []) as SsmaIncidentLinkRow[],
      });
      for (const f of (forms.data ?? []) as Array<{ id: string; field_values: Record<string, unknown> | null }>) {
        duplicateLabels[f.id] = { form: `${String(f.field_values?.funcionario ?? "acidente")} (${String(f.field_values?.afastamento ?? "sem classificação")})`, record: "" };
      }
      for (const r of (rows.data ?? []) as Array<{ id: string; category: string; location: string }>) {
        duplicateLabels[r.id] = { form: "", record: `${r.category} · ${r.location}` };
      }
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registros de campo SSMA"
        description="Ocorrências e inspeções registradas pelo app de campo, com as ações corretivas e o andamento. Registros criados sem sinal aparecem aqui depois de sincronizados."
        actions={
          <Link href={`/ssma/${projectId}`} className="rounded-md border border-[#7f1d1d] px-3 py-2 text-sm font-semibold text-[#7f1d1d]">
            Abrir app de campo
          </Link>
        }
      />

      {!available ? (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">Os registros de campo ainda não estão disponíveis neste ambiente (migration pendente).</CardContent></Card>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Resumo">
            {[
              ["Registros", summary.total],
              ["Ações em aberto", summary.openActions],
              ["Ações em atraso", summary.overdueActions],
              ["Críticos em aberto", summary.critical],
            ].map(([label, value]) => (
              <Card key={label as string}><CardContent className="p-4"><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>
            ))}
          </section>

          <PossibleDuplicatesPanel projectId={projectId} pairs={duplicatePairs} labels={duplicateLabels} />

          <Card>
            <CardHeader><CardTitle className="text-base">Registros</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {records.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nenhum registro enviado ainda.</p>
              ) : (
                <FieldRecordsTable records={records} today={today} />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <SsmaInstallCard />
    </div>
  );
}
