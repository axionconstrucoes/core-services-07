import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";
import { SsmaFieldApp } from "@/components/ssma/ssma-field-app";
import { getProject, getProjectMembers } from "@/lib/data";
import { buildEsgSsmaProjectFolderName } from "@/lib/integrations/esg-ssma/drive-source-policy";

export const metadata: Metadata = { title: "Aplicativo SSMA/ESG" };

function projectLabel(project: NonNullable<Awaited<ReturnType<typeof getProject>>>): string {
  try {
    return buildEsgSsmaProjectFolderName(project.code, project.client, project.location, project.name);
  } catch {
    return `${project.code} ${project.name}`.trim().toLocaleUpperCase("pt-BR");
  }
}

function currentDateTimeInSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

export default async function SsmaAppPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: authData }, project, members] = await Promise.all([
    supabase.auth.getUser(),
    getProject(projectId),
    getProjectMembers(projectId),
  ]);

  if (!authData.user) redirect("/login");
  if (!project) notFound();

  const currentMember = members.find((member) => member.userId === authData.user.id && member.status === "ACTIVE");
  if (!currentMember) notFound();

  const technicianLabel = currentMember.user.title
    ? `${currentMember.user.name} — ${currentMember.user.title}`
    : currentMember.user.name;

  const label = projectLabel(project);
  const canManage = ["ADMINISTRADOR", "GERENTE", "GESTOR"].includes(currentMember.permission);
  // Quem pode ser responsável por uma ação corretiva: membros ativos que não são somente leitura.
  const assignable = members
    .filter((member) => member.status === "ACTIVE" && member.permission !== "LEITURA")
    .map((member) => ({ userId: member.userId, name: member.user.name }));

  // Checklist diário: só conta envio CONFIRMADO pelo servidor (status SUBMITTED) desta obra no dia de hoje (America/Sao_Paulo).
  const today = currentDateTimeInSaoPaulo().slice(0, 10);
  const dayStart = new Date(`${today}T00:00:00-03:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const { data: todaySubmissions } = await supabase
    .from("ssma_form_submissions")
    .select("checklist_slug")
    .eq("project_id", projectId)
    .eq("status", "SUBMITTED")
    .in("checklist_slug", ["dda", "fotos-diarias", "almoxarifado", "limpeza"])
    .gte("occurred_at", dayStart.toISOString())
    .lt("occurred_at", dayEnd.toISOString());
  const initialCompleted = Array.from(new Set((todaySubmissions ?? []).map((row) => row.checklist_slug as string)));

  return (
    <SsmaFieldApp
      initialCompleted={initialCompleted}
      userId={authData.user.id}
      project={{ id: projectId, label, canManage, members: assignable }}
      projectId={projectId}
      projectLabel={projectLabel(project)}
      technicianLabel={technicianLabel}
      initialDateTime={currentDateTimeInSaoPaulo()}
    />
  );
}
