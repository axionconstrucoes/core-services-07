// Perfil de e-mail do PROJETO PILOTO — puro, sem I/O, sem "server-only" (testável por script Node e usado pelos dois providers).
//
// Durante o piloto de uma obra, TODA mensagem do ACC daquela obra (alertas, escalonamentos, repetições, reenvios, filas, resumos)
// sai por um único transporte restrito: remetente institucional fixo e destino institucional fixo. Os participantes são SIMULADOS:
// o destinatário lógico continua sendo decidido, registrado e auditado pelos fluxos de origem (outbox, emails, audit_log_entries);
// só o endereço de ENTREGA muda, no último ponto antes da rede (GmailEmailProvider/FakeEmailProvider.send).
//
// Configuração SOMENTE por variáveis de ambiente do servidor (nada versionado; sem a variável de projeto, nada muda):
//   ACC_PROJECT_PILOT_PROJECT_ID    UUID do projeto piloto (conferido pelo id — nunca pelo nome; ver scripts/resolve-pilot-project.mjs)
//   ACC_PROJECT_PILOT_DESTINATION   destino único (precisa estar na lista fixa abaixo)
//   ACC_PROJECT_PILOT_SENDER        remetente único (precisa estar na lista fixa abaixo)
// Os endereços aceitos são constantes do código: a configuração nunca consegue apontar para uma pessoa real.
//
// Fail-closed: se o projeto piloto estiver definido mas qualquer parte da configuração for inválida, o envio daquele projeto é
// RECUSADO antes de MIME e rede (nunca cai para o comportamento normal). Mensagens de outros projetos não são tocadas.

import { EmailSendError, type SendEmailInput } from "./email-provider";

export const PROJECT_PILOT_PROJECT_ID_ENV = "ACC_PROJECT_PILOT_PROJECT_ID";
export const PROJECT_PILOT_DESTINATION_ENV = "ACC_PROJECT_PILOT_DESTINATION";
export const PROJECT_PILOT_SENDER_ENV = "ACC_PROJECT_PILOT_SENDER";

/** Único destino admitido para participantes simulados. */
export const PROJECT_PILOT_ALLOWED_DESTINATIONS = ["axion@axion.com.br"] as const;
/** Único remetente admitido (caixa institucional que também recebe as respostas). */
export const PROJECT_PILOT_ALLOWED_SENDERS = ["crm@axion.com.br"] as const;

export const PROJECT_PILOT_SUBJECT_TAG = "[PILOTO]";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Env = Record<string, string | undefined>;

export type ProjectPilotProfile =
  | { configured: false }
  | { configured: true; valid: false; reason: string }
  | { configured: true; valid: true; projectId: string; destination: string; sender: string };

export function resolveProjectPilotProfile(env: Env = process.env): ProjectPilotProfile {
  const rawProject = (env[PROJECT_PILOT_PROJECT_ID_ENV] ?? "").trim();
  if (rawProject === "") return { configured: false };
  if (!UUID_PATTERN.test(rawProject)) return { configured: true, valid: false, reason: `${PROJECT_PILOT_PROJECT_ID_ENV} não é um UUID` };
  const destination = (env[PROJECT_PILOT_DESTINATION_ENV] ?? "").trim().toLowerCase();
  if (!(PROJECT_PILOT_ALLOWED_DESTINATIONS as readonly string[]).includes(destination)) {
    return { configured: true, valid: false, reason: `${PROJECT_PILOT_DESTINATION_ENV} ausente ou fora da lista fixa de destinos do piloto` };
  }
  const sender = (env[PROJECT_PILOT_SENDER_ENV] ?? "").trim().toLowerCase();
  if (!(PROJECT_PILOT_ALLOWED_SENDERS as readonly string[]).includes(sender)) {
    return { configured: true, valid: false, reason: `${PROJECT_PILOT_SENDER_ENV} ausente ou fora da lista fixa de remetentes do piloto` };
  }
  return { configured: true, valid: true, projectId: rawProject.toLowerCase(), destination, sender };
}

/** Projeto ao qual a mensagem pertence: contexto explícito do piloto; senão o projeto da dica da AXIA (todos os fluxos de obra a enviam). */
export function messageProjectId(input: Pick<SendEmailInput, "pilot" | "vera">): string | null {
  const id = input.pilot?.projectId ?? input.vera?.projectId ?? null;
  return id && UUID_PATTERN.test(id) ? id.toLowerCase() : null;
}

/** true quando a mensagem pertence ao projeto piloto configurado (mesmo que a configuração esteja inválida). */
export function isProjectPilotMessage(input: Pick<SendEmailInput, "pilot" | "vera">, env: Env = process.env): boolean {
  const profile = resolveProjectPilotProfile(env);
  if (!profile.configured) return false;
  const raw = (env[PROJECT_PILOT_PROJECT_ID_ENV] ?? "").trim().toLowerCase();
  return messageProjectId(input) === raw;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Texto curto e seguro para cabeçalho/assunto: sem quebra de linha, sem endereço de e-mail, limitado. */
export function sanitizePilotLabel(value: string | null | undefined, max = 60): string | null {
  const cleaned = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\S+@\S+/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned === "" ? null : cleaned;
}

export interface ProjectPilotRouting {
  input: SendEmailInput;
  /** true => esta mensagem DEVE sair pelo remetente `sender` (e só por ele). */
  routed: boolean;
  sender: string | null;
  destination: string | null;
}

function buildBanner(input: SendEmailInput): { text: string; html: string; participant: string; level: string } {
  const participant = sanitizePilotLabel(input.pilot?.participantLabel) ?? "não informado (ver auditoria do alerta)";
  const level = sanitizePilotLabel(input.pilot?.escalationLevel, 40) ?? "não se aplica";
  const text = [
    "=== PILOTO — TESTE CONTROLADO ===",
    `Participante simulado: ${participant}`,
    `Nível de escalonamento: ${level}`,
    "Nenhum destinatário real recebeu esta mensagem; o destinatário lógico está registrado na auditoria do ACC.",
    "================================",
    "",
  ].join("\n");
  const html =
    `<div data-acc-pilot="1" style="border:2px solid #b45309;background:#fffbeb;color:#78350f;padding:10px 14px;margin:0 0 12px;font-family:Arial,sans-serif;font-size:13px">` +
    `<strong>PILOTO — TESTE CONTROLADO</strong><br>` +
    `Participante simulado: <strong>${escapeHtml(participant)}</strong> · Nível de escalonamento: <strong>${escapeHtml(level)}</strong><br>` +
    `Nenhum destinatário real recebeu esta mensagem; o destinatário lógico está registrado na auditoria do ACC.</div>`;
  return { text, html, participant, level };
}

/**
 * Aplica o perfil do projeto piloto. Mensagem de outro projeto (ou sem projeto, ou sem perfil configurado) volta INTOCADA.
 * Mensagem do projeto piloto: To = destino fixo; Reply-To/threading preservados como já validados pelo guard global; cc/bcc removidos;
 * assunto e corpo identificados como PILOTO com participante simulado e nível de escalonamento.
 */
export function applyProjectPilotProfile(input: SendEmailInput, env: Env = process.env): ProjectPilotRouting {
  const profile = resolveProjectPilotProfile(env);
  if (!profile.configured || !isProjectPilotMessage(input, env)) return { input, routed: false, sender: null, destination: null };
  if (!profile.valid) throw new EmailSendError(`Perfil do projeto piloto inválido (${profile.reason}) — envio bloqueado antes de qualquer chamada de rede.`);

  const banner = buildBanner(input);
  const guarded = { ...input } as SendEmailInput & Record<string, unknown>;
  guarded.to = profile.destination;
  delete guarded.cc;
  delete guarded.bcc;
  const stripped = input.subject.replace(/^(\[(TESTE CONTROLADO|PILOTO)[^\]]*\]\s*)+/, "");
  guarded.subject = `${PROJECT_PILOT_SUBJECT_TAG} [${banner.level}] ${stripped}`;
  guarded.text = `${banner.text}${input.text}`;
  if (input.html !== undefined) {
    const bodyOpen = input.html.match(/<body[^>]*>/i);
    guarded.html = bodyOpen ? input.html.replace(bodyOpen[0], `${bodyOpen[0]}${banner.html}`) : `${banner.html}${input.html}`;
  }
  return { input: guarded, routed: true, sender: profile.sender, destination: profile.destination };
}

/**
 * Última conferência, sobre a mensagem MIME já montada (transporte final): para uma mensagem roteada, From = remetente do piloto,
 * To = destino do piloto e NENHUM Cc/Bcc/Resent-*. Qualquer divergência impede o envio.
 */
export function assertPilotMimeRecipients(mime: string, sender: string, destination: string): void {
  const headerBlock = mime.split(/\r?\n\r?\n/, 1)[0] ?? "";
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const headers = new Map<string, string[]>();
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    headers.set(name, [...(headers.get(name) ?? []), line.slice(idx + 1).trim()]);
  }
  const addressesOf = (name: string): string[] =>
    (headers.get(name) ?? []).flatMap((v) => (v.match(/[^\s<>",;]+@[^\s<>",;]+/g) ?? []).map((a) => a.toLowerCase()));
  for (const forbidden of ["cc", "bcc", "resent-to", "resent-cc", "resent-bcc"]) {
    if (headers.has(forbidden)) throw new EmailSendError("Mensagem do projeto piloto com cabeçalho de destinatário adicional — bloqueada antes de qualquer chamada de rede.");
  }
  const to = addressesOf("to");
  if (to.length !== 1 || to[0] !== destination) throw new EmailSendError("Mensagem do projeto piloto com Para diferente do destino único — bloqueada antes de qualquer chamada de rede.");
  const from = addressesOf("from");
  if (from.length !== 1 || from[0] !== sender) throw new EmailSendError("Mensagem do projeto piloto com remetente diferente do remetente do piloto — bloqueada antes de qualquer chamada de rede.");
}
