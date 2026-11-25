// Substituto de "next/navigation" na fixture de Seguros: router.refresh() apenas conta chamadas (window.__refreshes).
type W = { __refreshes?: number };
export function usePathname(): string {
  return "/fixture-proj/seguros";
}
export function useRouter() {
  return {
    refresh() {
      const w = window as unknown as W;
      w.__refreshes = (w.__refreshes ?? 0) + 1;
    },
    push() {},
    replace() {},
    back() {},
    forward() {},
    prefetch() {},
  };
}
