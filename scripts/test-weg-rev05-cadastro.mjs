// Piloto WEG REV.05 (27/11/2026) — cadastro oficial: participantes, contas retiradas e destinatários. Puro, sem rede e sem e-mail.
// Uso: node scripts/test-weg-rev05-cadastro.mjs
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./ts-module-resolver.mjs", import.meta.url);

const p = await import("../apps/web/lib/email/project-pilot-profile");
const { EmailSendError } = await import("../apps/web/lib/email/email-provider");
const { evaluateFinancialDashboardAccess } = await import("../apps/web/lib/financial/access");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`);
  }
}
const assert = (c, m = "asserção falhou") => {
  if (!c) throw new Error(m);
};

const WEG = "00000000-0000-4000-8000-000000000001";
const ENV = { ACC_PROJECT_PILOT_PROJECT_ID: WEG, ACC_PROJECT_PILOT_SENDER: "crm@axion.com.br" };
const msg = (to) => ({ to, subject: "Alerta", text: "x", pilot: { projectId: WEG } });
const blocked = (to) => {
  try {
    p.applyProjectPilotProfile(msg(to), ENV);
  } catch (error) {
    return error instanceof EmailSendError;
  }
  return false;
};

check("participantes ativos do piloto = exatamente Reynaldo, Jaime e Carlos Evandro", () => {
  const got = [...p.PILOT_PARTICIPANT_ADDRESSES].sort();
  assert(JSON.stringify(got) === JSON.stringify(["carlos.evandro@axion.com.br", "jaime.ramos@axion.com.br", "reynaldo@axion.com.br"]), got.join(","));
});

check("Carla retirada temporariamente: não é participante e o envio para ela é bloqueado antes da rede", () => {
  assert(!p.isPilotParticipantAddress("carla@axion.com.br"));
  assert(blocked("carla@axion.com.br"));
});

check("axion@ e acc@ continuam proibidos e bloqueados em qualquer envio do piloto", () => {
  for (const a of ["axion@axion.com.br", "acc@axion.com.br"]) {
    assert(p.PILOT_FORBIDDEN_ADDRESSES.includes(a), a);
    assert(!p.isPilotParticipantAddress(a), a);
    assert(blocked(a), a);
  }
});

check("crm@ é a cópia institucional obrigatória e nunca destinatário lógico", () => {
  assert(p.ACC_PILOT_INSTITUTIONAL_ADDRESS === "crm@axion.com.br");
  assert(!p.isPilotParticipantAddress("crm@axion.com.br"));
  for (const to of p.PILOT_PARTICIPANT_ADDRESSES) {
    const r = p.applyProjectPilotProfile(msg(to), ENV);
    assert(r.routed && r.to === to && JSON.stringify(r.cc) === JSON.stringify(["crm@axion.com.br"]), to);
  }
});

check("alerta técnico de integração vai só à Diretoria (sem Carla, axion@ ou crm@ como destinatário lógico)", () => {
  const src = readFileSync(new URL("../apps/web/app/api/cron/system-health/route.ts", import.meta.url), "utf8");
  assert(/const ADMIN_RECIPIENTS = \["reynaldo@axion\.com\.br"\];/.test(src));
  assert(!/carla@|axion@axion|const ADMIN_RECIPIENTS = \[[^\]]*crm@/.test(src));
});

check("crm@ (LEITURA, sem área) não acessa o dashboard financeiro; Reynaldo (ADMINISTRADOR/DIRETORIA) acessa", () => {
  assert(!evaluateFinancialDashboardAccess({ permission: "LEITURA", status: "ACTIVE", area: null }).allowed);
  assert(evaluateFinancialDashboardAccess({ permission: "ADMINISTRADOR", status: "ACTIVE", area: "DIRETORIA" }).allowed);
});

check("nenhum código da aplicação usa axion@ fora da lista de bloqueio", () => {
  const src = readFileSync(new URL("../apps/web/lib/email/project-pilot-profile.ts", import.meta.url), "utf8");
  const uses = src.split("\n").filter((l) => l.includes("axion@axion.com.br") && !l.trim().startsWith("//"));
  assert(uses.length === 1 && uses[0].includes("PILOT_FORBIDDEN_ADDRESSES"), uses.join(" | "));
});

console.log(`\nResultado: ${passed} OK, ${failed} FAIL`);
if (failed > 0) process.exit(1);
