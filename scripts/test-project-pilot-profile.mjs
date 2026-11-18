// Perfil do projeto piloto (modelo de ENTREGA DIRETA com cópia institucional) — unidade pura, sem rede e sem e-mail.
// Uso: node scripts/test-project-pilot-profile.mjs
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const p = await import("../apps/web/lib/email/project-pilot-profile");
const { EmailSendError } = await import("../apps/web/lib/email/email-provider");
const { prepareOutboundMessage } = await import("../apps/web/lib/email/outbound-routing");

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
const throwsSend = (fn, re) => {
  try {
    fn();
  } catch (error) {
    assert(error instanceof EmailSendError, `não é EmailSendError: ${error?.message}`);
    if (re) assert(re.test(error.message), `mensagem: ${error.message}`);
    return;
  }
  throw new Error("não lançou");
};

const WEG = "00000000-0000-4000-8000-000000000001";
const ACC = "crm@axion.com.br";
const BOX = "axion@axion.com.br";
const ACCX = "acc@axion.com.br"; // inexistente no Workspace: proibido
const REY = "reynaldo@axion.com.br";
const JAIME = "jaime.ramos@axion.com.br";
const CARLOS = "carlos.evandro@axion.com.br";
const ENV = { ACC_PROJECT_PILOT_PROJECT_ID: WEG, ACC_PROJECT_PILOT_SENDER: ACC };
const msg = (over = {}) => ({ to: REY, subject: "Alerta", text: "Corpo", correlationId: "c-1", pilot: { projectId: WEG, participantLabel: "usuário a1b2c3d4", escalationLevel: "RESPONSAVEL" }, ...over });

check("constantes: participantes = os três colaboradores (Corazza fora do piloto, decisão de 18/11/2026); Cc = crm@; axion@ só na lista PROIBIDA", () => {
  assert(JSON.stringify([...p.PILOT_PARTICIPANT_ADDRESSES]) === JSON.stringify([REY, JAIME, CARLOS]));
  assert(p.ACC_PILOT_INSTITUTIONAL_ADDRESS === ACC);
  assert(JSON.stringify([...p.PILOT_FORBIDDEN_ADDRESSES]) === JSON.stringify([BOX, ACCX]));
  assert(!p.PILOT_PARTICIPANT_ADDRESSES.includes(BOX) && !p.PILOT_PARTICIPANT_ADDRESSES.includes("crm@axion.com.br"));
});

check("perfil: sem a variável do projeto nada muda (configured=false); mensagens fora do piloto voltam intocadas (exceto guarda global)", () => {
  assert(p.resolveProjectPilotProfile({}).configured === false);
  const r = p.applyProjectPilotProfile(msg(), {});
  assert(r.routed === false && r.input.to === REY && !r.input.cc);
});

check("perfil válido: WEG + remetente crm@; sem destino/grupo; Cc institucional; participantes fixos", () => {
  const prof = p.resolveProjectPilotProfile(ENV);
  assert(prof.configured && prof.valid && prof.sender === ACC && prof.projectId === WEG);
  assert(JSON.stringify(prof.cc) === JSON.stringify([ACC]) && prof.participants.length === 4 && prof.authorizedSenders.length === 0);
  assert(!("destination" in prof), "o perfil não pode mais ter destino único");
});

check("perfil inválido (fail closed): não-UUID, projeto ≠ WEG, remetente ausente/crm/axion, autorizado fora dos participantes", () => {
  const bad = [
    { ...ENV, ACC_PROJECT_PILOT_PROJECT_ID: "nao-uuid" },
    { ...ENV, ACC_PROJECT_PILOT_PROJECT_ID: "22222222-2222-4222-8222-222222222222" },
    { ...ENV, ACC_PROJECT_PILOT_SENDER: "" },
    { ...ENV, ACC_PROJECT_PILOT_SENDER: ACCX },
    { ...ENV, ACC_PROJECT_PILOT_SENDER: REY },
    { ...ENV, ACC_PROJECT_PILOT_SENDER: BOX },
    { ...ENV, ACC_PROJECT_PILOT_AUTHORIZED_SENDERS: "estranho@exemplo.com" },
    { ...ENV, ACC_PROJECT_PILOT_AUTHORIZED_SENDERS: `${JAIME}, ${ACC}` },
    { ...ENV, ACC_PROJECT_PILOT_AUTHORIZED_SENDERS: BOX },
  ];
  for (const env of bad) {
    const prof = p.resolveProjectPilotProfile(env);
    assert(prof.configured && !prof.valid, `deveria ser inválido: ${JSON.stringify(env)}`);
  }
});

check("variáveis LEGADAS (DESTINATION, TEST_GROUP) são ignoradas: o resultado é idêntico com ou sem elas e nunca aparece axion@", () => {
  const a = p.resolveProjectPilotProfile(ENV);
  const b = p.resolveProjectPilotProfile({ ...ENV, ACC_PROJECT_PILOT_DESTINATION: BOX, ACC_PROJECT_PILOT_TEST_GROUP: "WEG_INTERNAL_FOUR" });
  assert(JSON.stringify(a) === JSON.stringify(b));
  assert(!JSON.stringify(b).includes(BOX));
});

check("autorizados a ENVIAR: lista opcional de participantes (normaliza caixa/duplicatas)", () => {
  const prof = p.resolveProjectPilotProfile({ ...ENV, ACC_PROJECT_PILOT_AUTHORIZED_SENDERS: ` ${JAIME.toUpperCase()}, ${JAIME}, ${CARLOS} ` });
  assert(prof.valid && JSON.stringify(prof.authorizedSenders) === JSON.stringify([JAIME, CARLOS]));
});

check("roteamento: To = colaborador, Cc = [crm@], sem Bcc; remetente = crm@; exibição institucional; faixa de TESTE só no envio de teste", () => {
  for (const to of [REY, JAIME, CARLOS, REY.toUpperCase()]) {
    const r = p.applyProjectPilotProfile(msg({ to, bcc: "x@y.com" }), ENV);
    assert(r.routed && r.to === to.toLowerCase() && r.input.to === to.toLowerCase());
    assert(JSON.stringify(r.input.cc) === JSON.stringify([ACC]) && JSON.stringify(r.cc) === JSON.stringify([ACC]) && !r.input.bcc);
    assert(r.sender === ACC && r.senderDisplayName === undefined);
    // Alerta operacional real: sem faixa nem prefixo de teste.
    assert(r.input.subject === "Alerta" && !r.input.text.includes("PILOTO — TESTE CONTROLADO") && !r.input.text.includes("TESTE"), r.input.subject);
    // Envio único de TESTE (testMessage): faixa e prefixo presentes.
    const t = p.applyProjectPilotProfile(msg({ to, pilot: { projectId: WEG, participantLabel: "usuário a1b2c3d4", escalationLevel: "RESPONSAVEL", testMessage: true } }), ENV);
    assert(/^\[PILOTO\] \[RESPONSAVEL\] Alerta$/.test(t.input.subject) && t.input.text.includes("PILOTO — TESTE CONTROLADO"));
    assert(t.input.text.includes(`cópia institucional em ${ACC}`));
  }
  // Prefixos de teste herdados são removidos do assunto do alerta real.
  const herdado = p.applyProjectPilotProfile(msg({ subject: "[TESTE CONTROLADO] [PILOTO] Alerta" }), ENV);
  assert(herdado.input.subject === "Alerta", herdado.input.subject);
  // Gestor do Planejamento (corazza@) é destinatário permitido; outros endereços continuam bloqueados.
  assert(p.applyProjectPilotProfile(msg({ to: "corazza@axion.com.br" }), ENV).to === "corazza@axion.com.br");
});

check("destinatário fora dos participantes ou proibido => bloqueio (nunca substituição silenciosa)", () => {
  for (const to of ["cliente@weg.net", ACC, BOX, ACCX, "", `${REY},${JAIME}`]) throwsSend(() => p.applyProjectPilotProfile(msg({ to }), ENV), /Destinat/);
});

check("remetente solicitado: padrão = crm@; participante só se autorizado; proibido/estranho bloqueia", () => {
  const withSender = (senderEmail, env = ENV) => p.applyProjectPilotProfile(msg({ pilot: { projectId: WEG, senderEmail, testMessage: true } }), env);
  assert(withSender(undefined).sender === ACC && withSender(ACC.toUpperCase()).sender === ACC);
  throwsSend(() => withSender(JAIME), /Remetente não autorizado/);
  const authorized = { ...ENV, ACC_PROJECT_PILOT_AUTHORIZED_SENDERS: JAIME };
  const r = withSender(JAIME, authorized);
  assert(r.sender === JAIME && r.senderDisplayName === null && r.input.text.includes("participante autorizado e autenticado"));
  throwsSend(() => withSender(CARLOS, authorized), /Remetente não autorizado/);
  throwsSend(() => withSender(BOX, authorized), /Remetente proibido/);
  throwsSend(() => withSender(ACCX, authorized), /Remetente proibido/);
  throwsSend(() => withSender("externo@weg.net", authorized), /Remetente não autorizado/);
});

check("projeto da mensagem: contexto explícito do piloto ou dica da AXIA; outro projeto/sem projeto não é roteado", () => {
  assert(p.applyProjectPilotProfile(msg({ pilot: undefined, vera: { projectId: WEG, context: "alerta" } }), ENV).routed === true);
  assert(p.applyProjectPilotProfile(msg({ pilot: { projectId: "22222222-2222-4222-8222-222222222222" } }), ENV).routed === false);
  assert(p.applyProjectPilotProfile(msg({ pilot: undefined }), ENV).routed === false);
});

check("perfil inválido + mensagem da WEG => EmailSendError antes de qualquer MIME (não cai para a guarda global)", () => {
  throwsSend(() => p.applyProjectPilotProfile(msg(), { ...ENV, ACC_PROJECT_PILOT_SENDER: ACCX }), /Perfil do projeto piloto inválido/);
});

check("participantes/atividade: resolveProjectPilotParticipants e isProjectPilotActive só valem para a WEG com perfil válido", () => {
  assert(JSON.stringify(p.resolveProjectPilotParticipants(WEG, ENV)) === JSON.stringify([REY, JAIME, CARLOS, "corazza@axion.com.br"]));
  assert(p.resolveProjectPilotParticipants("22222222-2222-4222-8222-222222222222", ENV) === null);
  assert(p.isProjectPilotActive(WEG, ENV) === true && p.isProjectPilotActive(WEG, {}) === false && p.isProjectPilotActive(WEG, { ...ENV, ACC_PROJECT_PILOT_SENDER: BOX }) === false);
  assert(p.isPilotParticipantAddress(JAIME.toUpperCase()) && !p.isPilotParticipantAddress(ACC) && !p.isPilotParticipantAddress(BOX) && !p.isPilotParticipantAddress(null));
});

check("prepareOutboundMessage: WEG => perfil (To direto + Cc); outros => guarda global (crm@, sem Cc); a guarda global não reescreve a entrega direta", () => {
  const saved = { ...process.env };
  Object.assign(process.env, ENV, { ACC_PILOT_RECIPIENT: "crm@axion.com.br" });
  try {
    const weg = prepareOutboundMessage(msg({ to: CARLOS }));
    assert(weg.routed && weg.input.to === CARLOS && JSON.stringify(weg.input.cc) === JSON.stringify([ACC]));
    const out = prepareOutboundMessage(msg({ to: "cliente@weg.net", pilot: { projectId: "22222222-2222-4222-8222-222222222222" }, cc: ["x@y.com"] }));
    assert(!out.routed && out.input.to === "crm@axion.com.br" && !out.input.cc);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
