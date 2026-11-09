"use client";

import { useRouter } from "next/navigation";

/**
 * Campo "Obra" da tela ESG: lista só obras em que o usuário pode registrar. Trocar a obra abre a mesma tela da outra obra;
 * as obrigações, comprovações e responsáveis são sempre os da obra escolhida (nada da obra anterior é reaproveitado).
 */
export function EsgProjectSwitch({ currentId, projects }: { currentId: string; projects: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  if (projects.length === 0) return null;
  return (
    <label className="block text-sm font-bold text-slate-900">
      Obra
      <select
        value={projects.some((p) => p.id === currentId) ? currentId : ""}
        onChange={(event) => event.target.value && router.push(`/${event.target.value}/esg`)}
        data-testid="esg-project-select"
        className="mt-1 block min-h-11 w-full max-w-xl rounded-md border-2 border-slate-400 bg-white px-3 text-sm font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7f1d1d]"
      >
        {!projects.some((p) => p.id === currentId) ? <option value="" disabled>Obra atual (sem permissão de registro)</option> : null}
        {projects.map((project) => (
          <option key={project.id} value={project.id}>{project.label}</option>
        ))}
      </select>
    </label>
  );
}
