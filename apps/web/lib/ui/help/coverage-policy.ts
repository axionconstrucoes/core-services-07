// Política de cobertura do Hover Text. Rotas que NÃO precisam de inventário de elementos (com motivo obrigatório, >= 20 caracteres).
// Qualquer rota nova (page.tsx) que não esteja em um manifesto (lib/ui/help/manifests/*.ts) nem aqui FALHA em scripts/test-help-coverage.mjs.
// Não use isenção para fugir da documentação de telas funcionais.

export const EXEMPT_ROUTES: Record<string, string> = {
  // rotas técnicas sem interface própria ou apenas redirecionamento — o inventário dos módulos deve preencher o restante
};
