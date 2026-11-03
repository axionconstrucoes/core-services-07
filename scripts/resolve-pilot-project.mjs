// Conferência SOMENTE LEITURA do projeto do piloto antes de definir ACC_PROJECT_PILOT_PROJECT_ID.
//
// Nunca escolhe o projeto pelo nome: lista os candidatos (por trecho de nome/cliente/código) só para o operador identificar o UUID e,
// com --project-id, confirma que esse UUID existe e mostra código/nome/cliente para conferência humana. Não grava nada, não imprime
// chaves, não envia e-mail. Usa o ambiente do servidor (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY) — rode só com autorização
// para ler o banco do ambiente correspondente.
//
// Uso:
//   node --env-file=apps/web/.env.local scripts/resolve-pilot-project.mjs --search <trecho-do-nome>
//   node --env-file=apps/web/.env.local scripts/resolve-pilot-project.mjs --project-id <uuid>
import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
};
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente (nunca na linha de comando).");
  process.exit(2);
}
const projectId = arg("project-id");
const search = arg("search");
if (!projectId && !search) {
  console.error("Informe --project-id <uuid> ou --search <trecho>.");
  process.exit(2);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const cols = "id,code,name,client,location,start_date,baseline_end_date";

if (projectId) {
  if (!UUID.test(projectId)) {
    console.error("--project-id não é um UUID.");
    process.exit(2);
  }
  const { data, error } = await supabase.from("projects").select(cols).eq("id", projectId.toLowerCase()).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    console.error("Nenhum projeto com esse id neste ambiente. NÃO use este valor.");
    process.exit(1);
  }
  console.log("Projeto encontrado — confira com o responsável antes de usar como ACC_PROJECT_PILOT_PROJECT_ID:");
  console.log(JSON.stringify(data, null, 2));
  const { data: cfg } = await supabase
    .from("project_weekly_schedule_ingestion_configs")
    .select("enabled,risk_alerts_enabled,pilot_project_confirmed_at,pilot_delivery_override_email")
    .eq("project_id", data.id)
    .maybeSingle();
  console.log(`Configuração de alertas: ${cfg ? `enabled=${cfg.enabled} risk_alerts_enabled=${cfg.risk_alerts_enabled} piloto confirmado=${cfg.pilot_project_confirmed_at ? "sim" : "não"} override de entrega=${cfg.pilot_delivery_override_email ? "definido" : "nenhum"}` : "sem configuração"}`);
  process.exit(0);
}

const term = String(search).replace(/[%,()]/g, " ").trim();
const { data, error } = await supabase
  .from("projects")
  .select(cols)
  .or(`name.ilike.%${term}%,client.ilike.%${term}%,code.ilike.%${term}%`)
  .order("name");
if (error) throw new Error(error.message);
console.log(`${data.length} candidato(s) para "${term}". O nome NÃO identifica o piloto: escolha pelo UUID e confirme com --project-id.`);
for (const p of data) console.log(`- ${p.id}  ${p.code ?? "-"}  ${p.name}  (cliente: ${p.client ?? "-"})`);
