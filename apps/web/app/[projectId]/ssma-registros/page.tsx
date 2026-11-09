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
import { findPossibleDuplicates, listNearMisses, type SsmaFormMetricsRow, type SsmaIncidentLinkRow } from "@/lib/ssma/dashboard-metrics";
import type { FieldRecordRow } from "@/lib/ssma/field-records/field-record-view";
import { createSupabaseServerClient } from "@axion/db/server";

export const metadata: Metadata = { title: "Registros de campo SSMA" };


const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function SsmaFieldRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const from = query.de && ISO_DAY.test(query.de) ? query.de : null;
  const to = query.ate && ISO_DAY.test(query.ate) ? query.ate : null;
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

  // Near Misses (mesmo critério do Dashboard): formulários "Riscos apontados" com classificação "Quase-acidente" + registros de campo.
  let nearMisses: ReturnType<typeof listNearMisses> = [];
  if (available) {
    const supabase = await createSupabaseServerClient();
    const [nmForms, nmRecords] = await Promise.all([
      supabase.from("ssma_form_submissions").select("id,checklist_slug,occurred_at,field_values").eq("project_id", projectId).eq("status", "SUBMITTED").eq("checklist_slug", "riscos-apontados"),
      supabase.from("ssma_field_records").select("id,category,location,description,occurred_at").eq("project_id", projectId).eq("category", "Quase-acidente"),
    ]);
    if (!nmForms.error && !nmRecords.error) {
      nearMisses = listNearMisses((nmForms.data ?? []) as SsmaFormMetricsRow[], (nmRecords.data ?? []) as never[], { from, to });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registros de campo SSMA"
        description="Ocorrências e inspeções registradas pelo app de campo, com as ações corretivas e o andamento. Registros criados sem sinal aparecem aqui depois de sincronizados."
        actions={
          <Link href={`/ssma/${projectId}`} className="rounded-md border border-white/40 px-3 py-2 text-sm font-semibold bg-[#7f1d1d] text-white hover:bg-[#9b2424] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
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

          <Card id="near-misses">
            <CardHeader><CardTitle className="text-base">Near Misses (quase-acidentes): {nearMisses.length}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
                <label className="flex flex-col gap-1">De<input type="date" name="de" defaultValue={from ?? ""} className="min-h-10 rounded border px-2" /></label>
                <label className="flex flex-col gap-1">Até<input type="date" name="ate" defaultValue={to ?? ""} className="min-h-10 rounded border px-2" /></label>
                <button type="submit" className="min-h-10 rounded border border-[#7f1d1d] px-3 font-semibold text-red-700">Filtrar período</button>
                {from || to ? <Link href={`/${projectId}/ssma-registros#near-misses`} className="min-h-10 px-2 py-2 text-red-700 underline">Limpar</Link> : null}
              </form>
              {nearMisses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum Near Miss no período{from || to ? " filtrado" : ""}. Zero aqui significa nenhum registrado, não falta de dado.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {nearMisses.map((item) => (
                    <li key={`${item.source}-${item.id}`} className="py-2">
                      <p className="font-semibold">{new Date(item.occurredAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} · {item.place || "local não informado"}</p>
                      <p className="text-muted-foreground">{item.description || "sem descrição"} · origem: {item.source === "FORMULARIO" ? "formulário" : "registro de campo"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

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
