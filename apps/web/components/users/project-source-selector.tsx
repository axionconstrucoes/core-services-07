"use client";

import { useRouter } from "next/navigation";

// Troca o projeto cujos usuários e faróis são exibidos. Navega para a mesma aba do outro projeto; o acesso continua sendo validado no servidor.
export function ProjectSourceSelector({ currentProjectId, projects }: { currentProjectId: string; projects: { id: string; label: string }[] }) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
      <span className="font-semibold">Projeto exibido nos faróis de fontes</span>
      <select
        value={currentProjectId}
        onChange={(event) => router.push(`/${event.target.value}/usuarios`)}
        className="min-h-10 rounded border border-border bg-card px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {projects.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
      </select>
    </label>
  );
}
