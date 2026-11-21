// FIXTURE: nível do usuário definido pela cena (window.__tier). Não é a autoridade — só alimenta a tela de teste.
declare global { interface Window { __tier?: string } }
export async function getProjectTier(_projectId: string): Promise<string> { return window.__tier ?? "NONE"; }
export async function requireSegmentAccess(): Promise<void> { /* a guarda real é do layout do segmento (testada em test-menu-permissoes) */ }
