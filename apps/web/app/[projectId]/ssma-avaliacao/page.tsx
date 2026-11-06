import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EvaluationWorkflowDemo } from "@/components/ssma/evaluation-workflow-demo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { getProject, getProjectMembers } from "@/lib/data";
import {
  EVALUATION_RULES_VERSION,
  computeTechnicianEvaluation,
  monthBounds,
  type EvalAction,
  type EvalForm,
  type EvalRecord,
  type EvaluationSheet,
} from "@/lib/ssma/technician-evaluation";
import { createSupabaseServerClient } from "@axion/db/server";

export const metadata: Metadata = { title: "Avaliação do técnico SSMA — PRÉVIA, critérios em revisão" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f-]{36}$/i;
const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

function SheetView({ title, sheet }: { title: string; sheet: EvaluationSheet }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title}: {sheet.period.from} a {sheet.period.to}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-2xl font-bold" data-testid="eval-total">
          {sheet.total === null ? "Sem dados" : `${sheet.total} / 100`}
          {sheet.indicative && sheet.total !== null ? <span className="ml-2 text-sm font-semibold text-amber-300">(indicativa: cobertura {Math.round(sheet.coverage * 100)}%)</span> : null}
        </p>
        <p className="text-xs">{sheet.totalMemory}</p>
        <div className="space-y-3">
          {sheet.dimensions.map((d) => (
            <details key={d.key} className="rounded border p-3" open>
              <summary className="cursor-pointer text-sm font-bold">
                {d.label} · peso {Math.round(d.weight * 100)}% · {d.score === null ? "SEM DADOS (não é zero)" : `${d.score}/100 (peso efetivo ${Math.round(d.effectiveWeight * 1000) / 10}%)`}
              </summary>
              <div className="mt-2 space-y-2 text-sm">
                <p className="font-semibold">Memória de cálculo</p>
                <ul className="list-disc pl-5">{d.memory.map((line) => <li key={line}>{line}</li>)}</ul>
                {d.managementDependencies.length > 0 ? (
                  <>
                    <p className="font-semibold">Dependências da gerência (fora da nota do técnico)</p>
                    <ul className="list-disc pl-5">{d.managementDependencies.map((line) => <li key={line}>{line}</li>)}</ul>
                  </>
                ) : null}
                {d.evidence.length > 0 ? (
                  <>
                    <p className="font-semibold">Evidências ({d.evidence.length})</p>
                    <ul className="list-disc pl-5">
                      {d.evidence.slice(0, 15).map((e) => (
                        <li key={`${e.type}-${e.id}`}>{e.date.slice(0, 10)} · {e.label} · <span className="text-xs">{e.id.slice(0, 8)}</span></li>
                      ))}
                      {d.evidence.length > 15 ? <li>… e mais {d.evidence.length - 15}</li> : null}
                    </ul>
                  </>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function TechnicianEvaluationPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tecnico?: string; mes?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const [project, members, permission] = await Promise.all([getProject(projectId), getProjectMembers(projectId), getCurrentProjectPermission(projectId)]);
  if (!project || !permission) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const viewerId = authData.user?.id ?? "";
  const viewerIsManager = permission === "ADMINISTRADOR" || permission === "GERENTE";

  const active = members.filter((m) => m.status === "ACTIVE");
  const month = query.mes && MONTH.test(query.mes) ? query.mes : new Date(new Date().getTime() - 3 * 3600_000).toISOString().slice(0, 7);
  // Quem não é gerente só enxerga a própria ficha.
  const requested = query.tecnico && UUID.test(query.tecnico) ? query.tecnico : viewerId;
  const technicianId = viewerIsManager ? requested : viewerId;
  const technician = members.find((m) => m.userId === technicianId);

  const { from, to } = monthBounds(month);
  const [formsRes, recordsRes] = await Promise.all([
    supabase
      .from("ssma_form_submissions")
      .select("id, checklist_slug, occurred_at, created_at, technician_user_id, field_values, ssma_submission_photos(id)")
      .eq("project_id", projectId)
      .eq("status", "SUBMITTED")
      .eq("technician_user_id", technicianId)
      .lte("occurred_at", `${to}T23:59:59-03:00`)
      .limit(2000),
    supabase
      .from("ssma_field_records")
      .select("id, kind, category, location, description, occurred_at, received_at, reported_by_user_id, ssma_corrective_actions(id, status, due_date, concluded_at, responsible_user_id), ssma_field_record_photos(id)")
      .eq("project_id", projectId)
      .lte("occurred_at", `${to}T23:59:59-03:00`)
      .limit(2000),
  ]);
  const unavailable = formsRes.error || recordsRes.error;

  const forms: EvalForm[] = ((formsRes.data ?? []) as unknown as Array<EvalForm & { ssma_submission_photos?: unknown[] | null }>).map((f) => ({ ...f, photoCount: f.ssma_submission_photos?.length ?? 0 }));
  const allRecords = (recordsRes.data ?? []) as unknown as Array<Omit<EvalRecord, "photoCount" | "action"> & { ssma_corrective_actions?: EvalAction | EvalAction[] | null; ssma_field_record_photos?: unknown[] | null }>;
  const records: EvalRecord[] = allRecords.map((r) => ({ ...r, photoCount: r.ssma_field_record_photos?.length ?? 0, action: one(r.ssma_corrective_actions) }));
  const actions = records.flatMap((r) => (r.action ? [{ ...r.action, record_id: r.id }] : []));

  const monthly = computeTechnicianEvaluation({ technicianUserId: technicianId, period: { from, to }, forms, records, actions });
  const earliest = [...forms.map((f) => f.occurred_at), ...records.filter((r) => r.reported_by_user_id === technicianId).map((r) => r.occurred_at)].sort()[0];
  const cumulativeFrom = earliest ? new Date(new Date(earliest).getTime() - 3 * 3600_000).toISOString().slice(0, 10) : from;
  const cumulative = computeTechnicianEvaluation({ technicianUserId: technicianId, period: { from: cumulativeFrom, to }, forms, records, actions });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Avaliação do técnico SSMA — PRÉVIA, critérios em revisão"
        description={`PRÉVIA das regras ${EVALUATION_RULES_VERSION}: cálculo de leitura, sem nota gravada e sem efeito sobre ninguém, até as regras detalhadas serem aprovadas.`}
        actions={<Link href={`/${projectId}/ssma-registros`} className="rounded-md border border-[#7f1d1d] px-3 py-2 text-sm font-semibold text-red-700">Registros de campo</Link>}
      />
      <p role="note" className="rounded-lg border-2 border-amber-600 p-3 text-sm font-semibold" data-testid="preview-notice">
        PRÉVIA — critérios em revisão. Não é avaliação oficial. Ainda NÃO estão aprovados: a redistribuição de pesos quando falta dado, a cobertura mínima de 60% e o desconto por reincidência. Sem dados não é nota zero. A quantidade de Near Misses ou de acidentes não reduz a nota; avaliam-se comunicação, tratamento e reincidência.
      </p>

      <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
        {viewerIsManager ? (
          <label className="flex flex-col gap-1">
            Técnico
            <select name="tecnico" defaultValue={technicianId} className="min-h-10 rounded border bg-white px-2 text-black">
              {active.map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1">Mês<input type="month" name="mes" defaultValue={month} className="min-h-10 rounded border bg-white px-2 text-black" /></label>
        <button type="submit" className="min-h-10 rounded bg-[#7f1d1d] px-3 font-semibold text-white">Calcular</button>
      </form>

      {unavailable ? (
        <Card><CardContent className="p-4 text-sm">Os dados SSMA ainda não estão disponíveis neste ambiente para o cálculo.</CardContent></Card>
      ) : (
        <>
          <p className="text-sm font-semibold">Técnico: {technician?.user.name ?? "não encontrado nesta obra"}</p>
          <SheetView title="Ficha mensal" sheet={monthly} />
          <SheetView title="Ficha acumulada" sheet={cumulative} />
          <EvaluationWorkflowDemo viewerIsTechnician={viewerId === technicianId} viewerIsManager={viewerIsManager} />
        </>
      )}
    </div>
  );
}
