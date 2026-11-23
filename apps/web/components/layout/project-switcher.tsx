"use client";

import { useRouter } from "next/navigation";
import type { Project } from "@axion/types";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Rótulo estável do seletor: "CÓDIGO · nome". O código vem PRIMEIRO porque o seletor trunca o FINAL do texto (largura curta
 * entre sm e lg): assim a obra ativa é sempre distinguível, mesmo com nomes longos. Se o nome já termina com "· código"
 * (convenção das obras reais), o sufixo é removido para não repetir. O nome completo continua no title do seletor.
 */
export function projectOptionLabel(project: Pick<Project, "code" | "name">): string {
  const code = project.code.trim();
  if (!code) return project.name;
  const name = project.name.trim();
  const lower = name.toLowerCase();
  const codeLower = code.toLowerCase();
  let base = name;
  for (const sep of ["·", "•", "-", "–", "—"]) {
    const tail = `${sep} ${codeLower}`;
    if (lower.endsWith(tail)) {
      base = name.slice(0, name.length - tail.length).trim();
      break;
    }
  }
  return base && base.toLowerCase() !== codeLower ? `${code} · ${base}` : code;
}

export function ProjectSwitcher({
  projects,
  currentProjectId,
  className,
}: {
  projects: Project[];
  currentProjectId: string;
  className?: string;
}) {
  const router = useRouter();
  const currentProject = projects.find((project) => project.id === currentProjectId);

  return (
    <>
    <Select
      value={currentProjectId}
      onChange={(e) => router.push(`/${e.target.value}/dashboard`)}
      // Nome truncado com reticências (ver classe truncate abaixo) —
      // title nativo do <select> funciona como tooltip acessível do
      // valor completo, o mesmo padrão de ajuda-via-title já usado na
      // sidebar (ver app-sidebar.tsx).
      title={currentProject?.name}
      className={cn("min-w-0 truncate [@media(pointer:coarse)]:h-11 border-border bg-transparent font-bold text-foreground", className)}
    >
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {projectOptionLabel(project)}
        </option>
      ))}
    </Select>
    <FeatureInfo helpId="shared.global.seletor-projeto" />
    </>
  );
}
