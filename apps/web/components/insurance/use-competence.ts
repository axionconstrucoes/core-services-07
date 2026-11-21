"use client";

import { useWorkspace } from "@/components/insurance/kit";
import { competenceBlockText, hasCompetence, COMPETENCE_REQUIREMENTS, type CompetenceAct } from "@/lib/permissions/competences";

/**
 * Fase 4/A: o usuário atual tem a competência exigida para o ato? Espelho do banco (que é a autoridade e repete a checagem por gatilho).
 * Fail-closed: competências não carregadas ou membership sem leitura => false. `blockText` explica o bloqueio na tela.
 */
export function useCompetenceFor(act: CompetenceAct | null): { required: boolean; ok: boolean; blockText: string | null } {
  const { data, currentUserId, today, caps } = useWorkspace();
  if (!act) return { required: false, ok: true, blockText: null };
  const ok = hasCompetence(
    data.competences.map((c) => ({ userId: c.user_id, projectId: c.project_id, competence: c.competence, status: c.status, validFrom: c.valid_from, validUntil: c.valid_until })),
    currentUserId,
    data.projectId,
    COMPETENCE_REQUIREMENTS[act].any,
    today,
    caps.read,
  );
  return { required: true, ok, blockText: ok ? null : competenceBlockText(act) };
}
