"use client";

import type { SelectableProject } from "@/lib/ssma/project-selection";

/**
 * Campo "Obra": lista APENAS as obras em que o usuário está autorizado a registrar (nunca texto livre).
 * Continua editável para permitir escolher outra obra autorizada; a autorização real é do servidor.
 */
export function ProjectSelect({
  projects,
  value,
  onChange,
  disabled,
  hint,
}: {
  projects: readonly SelectableProject[];
  value: string | null;
  onChange: (projectId: string) => void;
  disabled?: boolean;
  hint?: string | null;
}) {
  return (
    <label className="block text-sm font-bold text-slate-900">
      Obra / Local de trabalho *
      <select
        name="projectId"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || projects.length === 0}
        required
        data-testid="project-select"
        className="mt-1 block min-h-12 w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-3 text-base font-semibold text-slate-900 outline-none focus:border-[#7f1d1d]"
      >
        <option value="" disabled>{projects.length === 0 ? "Nenhuma obra autorizada" : "Selecione a obra"}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>{project.label}</option>
        ))}
      </select>
      {hint ? <span role="status" className="mt-1 block text-xs font-semibold text-amber-800">{hint}</span> : null}
    </label>
  );
}
