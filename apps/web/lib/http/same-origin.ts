// Defesa em profundidade para rotas de escrita autenticadas por cookie: o Next.js só confere Origin em Server Actions, não em
// Route Handlers. O cookie de sessão já é SameSite=Lax (padrão do @supabase/ssr), o que impede o navegador de enviá-lo em POST
// entre sites; esta checagem recusa também clientes que declaram uma origem diferente da do próprio app.
//
// Regras: Sec-Fetch-Site diferente de same-origin/none => cross-origin; senão, se há Origin, o host precisa ser o do app
// (x-forwarded-host quando atrás de proxy). Sem Origin e sem Sec-Fetch-Site (clientes que não são navegador) não é bloqueado aqui:
// a autenticação por sessão continua obrigatória.
export function isCrossOriginRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = headers.get("origin");
  if (!origin) return false;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
