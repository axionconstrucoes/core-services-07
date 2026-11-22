// Substituto de "next/navigation" apenas na fixture de navegador. ?ativo=<segmento> escolhe o item ativo (padrão: dashboard).
export function usePathname(): string {
  let ativo = "dashboard";
  try { ativo = new URLSearchParams(window.location.search).get("ativo") || ativo; } catch { /* fora do navegador */ }
  return `/fixture-proj/${ativo}`;
}

// useRouter: no-op na fixture (o ProjectSwitcher só navega ao trocar de projeto).
export function useRouter() {
  return { push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined, forward: () => undefined, prefetch: () => undefined };
}
