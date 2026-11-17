// Orquestração PURA do espelhamento de fotos SSMA para o Drive, isolada por projeto.
// Sem rede e sem Supabase: o acesso a dados e o espelhamento entram por injeção (testável).
//
// Regras:
//  - Cada projeto é processado de forma independente: falha em um nunca impede nem mascara outro.
//  - Projeto SEM pasta SSMA/ESG configurada (project_integrations ESG_SSMA) é "bloqueado por configuração":
//    suas fotos PENDING/FAILED NÃO são tocadas (continuam FAILED, sem novas linhas de auditoria a cada ciclo) e
//    entram no relatório como aviso por projeto. Voltam a ser processadas sozinhas quando a pasta for configurada.
//  - Falha real de espelhamento (credencial, permissão, subpasta, storage) em projeto configurado => exit 1 e
//    anotação ::error:: por projeto.
//  - Projeto crítico (piloto) bloqueado por configuração => exit 1 (nunca fica silencioso).
//  - Nada é apagado e nenhuma evidência original é alterada.

export function shortId(id) {
  return String(id ?? "").slice(0, 8) || "desconhecido";
}

export function countBlockedByProject(blockedRows) {
  const counts = new Map();
  for (const row of blockedRows) counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
  return counts;
}

export function buildSummaries({ processed, blockedCounts, criticalProjectIds }) {
  const critical = new Set(criticalProjectIds);
  const byProject = new Map();
  const ensure = (projectId) => {
    if (!byProject.has(projectId)) {
      byProject.set(projectId, {
        projectId,
        critical: critical.has(projectId),
        processed: 0,
        synced: 0,
        failed: 0,
        blockedByConfig: 0,
        errors: new Set(),
      });
    }
    return byProject.get(projectId);
  };
  for (const item of processed) {
    const s = ensure(item.projectId);
    s.processed += 1;
    if (item.status === "SYNCED" || item.status === "ALREADY_SYNCED") s.synced += 1;
    else {
      s.failed += 1;
      if (item.error) s.errors.add(item.error);
    }
  }
  for (const [projectId, count] of blockedCounts) ensure(projectId).blockedByConfig += count;
  return [...byProject.values()].sort((a, b) => a.projectId.localeCompare(b.projectId));
}

export function decideOutcome(summaries) {
  const annotations = [];
  let exitCode = 0;
  for (const s of summaries) {
    const label = `projeto ${shortId(s.projectId)}${s.critical ? " (PILOTO)" : ""}`;
    if (s.failed > 0) {
      exitCode = 1;
      annotations.push(
        `::error title=SSMA Drive Photo Sync::${label}: ${s.failed} de ${s.processed} foto(s) com falha de espelhamento (${[...s.errors].join("; ") || "erro não classificado"}).`
      );
    }
    if (s.blockedByConfig > 0) {
      if (s.critical) {
        exitCode = 1;
        annotations.push(
          `::error title=SSMA Drive Photo Sync::${label}: ${s.blockedByConfig} foto(s) pendente(s) sem pasta SSMA/ESG configurada. Projeto crítico: corrigir antes de seguir.`
        );
      } else {
        annotations.push(
          `::warning title=SSMA Drive Photo Sync::${label}: ${s.blockedByConfig} foto(s) aguardando configuração da pasta SSMA/ESG (preservadas como FAILED, não reprocessadas até configurar).`
        );
      }
    }
  }
  return { exitCode, annotations };
}

export function summaryRows(summaries) {
  return summaries.map((s) => ({
    projeto: shortId(s.projectId),
    piloto: s.critical ? "sim" : "não",
    processadas: s.processed,
    sincronizadas: s.synced,
    falhas: s.failed,
    aguardandoConfig: s.blockedByConfig,
  }));
}

/**
 * deps:
 *  - loadConfiguredProjectIds(): Promise<string[]>         projetos com pasta ESG_SSMA preenchida
 *  - loadActionableRows(projectIds, limit): Promise<row[]> PENDING/FAILED de formulários SUBMITTED desses projetos
 *  - loadBlockedRows(configuredProjectIds): Promise<{project_id}[]>  PENDING/FAILED dos demais projetos (só contagem)
 *  - syncRow(row): Promise<{status, error?}>               espelha UMA foto
 */
export async function runSsmaPhotoSync({ deps, limit, apply, criticalProjectIds = [], log = console.log }) {
  const configured = await deps.loadConfiguredProjectIds();
  const rows = configured.length ? await deps.loadActionableRows(configured, limit) : [];
  const blockedCounts = countBlockedByProject(await deps.loadBlockedRows(configured));

  log(`Fotos SSMA pendentes/falhadas processáveis: ${rows.length}`);
  log(`Projetos sem pasta SSMA/ESG configurada (fotos preservadas): ${blockedCounts.size}`);
  log(`Modo: ${apply ? "APLICAR" : "SIMULAÇÃO"}`);

  const processed = [];
  if (apply) {
    for (const row of rows) {
      let result;
      try {
        result = await deps.syncRow(row);
      } catch {
        // Isolamento: exceção inesperada em uma foto nunca interrompe as demais.
        result = { status: "FAILED", error: "Exceção inesperada no espelhamento." };
      }
      processed.push({ projectId: row.project_id, photoId: row.id, status: result.status, error: result.error });
    }
  }

  const summaries = buildSummaries({ processed, blockedCounts, criticalProjectIds });
  const { exitCode, annotations } = decideOutcome(summaries);
  return { summaries, annotations, exitCode, rowCount: rows.length };
}
