// FASE 4 / A — fixture de competências para testes em PostgreSQL real (inserção direta como superusuário, só em base descartável).
// A concessão pelo caminho real (RPC project_competence_grant, só ADMIN) é provada em test-competencias-realpg.mjs.
export const ALL_COMPETENCES = ["TECNICO_RESPONSAVEL", "JURIDICO", "SEGUROS"];

/** Concede as competências a cada usuário (granted_by = outro usuário da lista, pois ninguém concede a si mesmo). */
export async function grantCompetences(su, projectId, userIds, competences = ALL_COMPETENCES) {
  for (const u of userIds) {
    const grantor = userIds.find((x) => x !== u);
    if (!grantor) throw new Error("grantCompetences: informe ao menos 2 usuários (concedente distinto)");
    for (const c of competences) {
      await su.query(
        "insert into public.project_competences (project_id,user_id,competence,granted_by) values ($1,$2,$3,$4) on conflict do nothing",
        [projectId, u, c, grantor],
      );
    }
  }
}
