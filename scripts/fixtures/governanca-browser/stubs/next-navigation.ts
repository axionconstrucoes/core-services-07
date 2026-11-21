// Substituto de "next/navigation" apenas na fixture de navegador de Governança (H2a): redirect registra o destino (não lança) e notFound
// marca a cena como "404". Só a PRIMEIRA chamada de redirect de cada ação vale (o resto do código segue sem o runtime do Next).
declare global {
  interface Window { __redirects?: string[]; __notFound?: boolean }
}
export function usePathname(): string { return "/fixture-proj/competencias"; }
export function redirect(url: string): never {
  (window.__redirects ??= []).push(url);
  return undefined as never;
}
export function notFound(): never {
  window.__notFound = true;
  throw new Error("NEXT_NOT_FOUND");
}
