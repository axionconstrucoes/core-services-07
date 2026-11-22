// Substituto de "next/navigation" apenas na fixture de navegador. ?ativo=<segmento> escolhe o item ativo (padrão: dashboard).
export function usePathname(): string {
  let ativo = "dashboard";
  try { ativo = new URLSearchParams(window.location.search).get("ativo") || ativo; } catch { /* fora do navegador */ }
  return `/fixture-proj/${ativo}`;
}
