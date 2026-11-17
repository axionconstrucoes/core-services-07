// Perfil de e-mail do PROJETO PILOTO (WEG) — puro, sem I/O, sem "server-only" (testável por script Node e usado pelos dois providers).
//
// MODELO DE ENTREGA DIRETA COM CÓPIA INSTITUCIONAL (substitui o modelo anterior de destino único):
//   - Participantes autorizados: Reynaldo, Jaime e Carlos Evandro (lista FIXA no código; endereços conferidos nos perfis do ACC).
//   - Destinatário principal (To): o PRÓPRIO colaborador a quem o alerta se destina — o usuário lógico do alerta é também o destinatário físico.
//   - Cópia obrigatória (Cc): acc@axion.com.br em TODA mensagem do piloto, inclusive quando o remetente é o próprio ACC.
//   - Remetente: acc@axion.com.br (identidade institucional) ou um participante AUTORIZADO e AUTENTICADO. Nunca outra identidade; sem
//     credencial própria do remetente solicitado a mensagem NÃO sai (nunca é enviada "como outra pessoa" nem pelo remetente padrão).
//   - axion@axion.com.br é PROIBIDO em To, Cc, Reply-To e qualquer cabeçalho de destinatário.
//   - Projeto: exclusivamente a WEG (conferido pelo id, nunca pelo nome).
//
// Configuração SOMENTE por variáveis de ambiente do servidor (nada versionado; sem a variável de projeto, nada muda):
//   ACC_PROJECT_PILOT_PROJECT_ID          UUID do projeto piloto (precisa ser a WEG)
//   ACC_PROJECT_PILOT_SENDER              identidade institucional de envio (precisa ser acc@axion.com.br)
//   ACC_PROJECT_PILOT_AUTHORIZED_SENDERS  (opcional) participantes autorizados a ENVIAR com a própria identidade, separados por vírgula
// As variáveis legadas ACC_PROJECT_PILOT_DESTINATION e ACC_PROJECT_PILOT_TEST_GROUP NÃO são mais lidas (permanecem apenas como histórico).
//
// Fail-closed: se o projeto piloto estiver definido mas qualquer parte da configuração for inválida, o envio daquele projeto é
// RECUSADO antes de MIME e rede (nunca cai para o comportamento normal). Mensagens de outros projetos não são tocadas.

import { EmailSendError, type SendEmailInput } from "./email-provider";
import { ALERT_REPLY_MAILBOX_ENV } from "./alert-reply-address";
import { resolveGuardedReplyTo } from "./pilot-outbound-guard";

export const PROJECT_PILOT_PROJECT_ID_ENV = "ACC_PROJECT_PILOT_PROJECT_ID";
export const PROJECT_PILOT_SENDER_ENV = "ACC_PROJECT_PILOT_SENDER";
export const PROJECT_PILOT_AUTHORIZED_SENDERS_ENV = "ACC_PROJECT_PILOT_AUTHORIZED_SENDERS";
export const WEG_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

/** Identidade institucional do ACC: remetente padrão do piloto e cópia (Cc) obrigatória de toda mensagem. */
export const ACC_PILOT_INSTITUTIONAL_ADDRESS = "acc@axion.com.br";

/** Participantes autorizados do piloto WEG — endereços conferidos nos perfis do ACC (profiles.email), todos ACTIVE e na allowlist. */
export const PILOT_PARTICIPANT_ADDRESSES = [
  "reynaldo@axion.com.br",
  "jaime.ramos@axion.com.br",
  "carlos.evandro@axion.com.br",
] as const;

/** Endereços PROIBIDOS no roteamento do piloto (To, Cc, Reply-To, destinatários de resposta). */
export const PILOT_FORBIDDEN_ADDRESSES = ["axion@axion.com.br"] as const;

export const PROJECT_PILOT_SUBJECT_TAG = "[PILOTO]";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Env = Record<string, string | undefined>;

export type ProjectPilotProfile =
  | { configured: false }
  | { configured: true; valid: false; reason: string }
  | {
      configured: true;
      valid: true;
      projectId: string;
      /** Identidade institucional (acc@). */
      sender: string;
      /** Participantes autorizados a enviar com a própria identidade (subconjunto de PILOT_PARTICIPANT_ADDRESSES). */
      authorizedSenders: string[];
      /** Cópia obrigatória. */
      cc: string[];
      participants: string[];
    };

const normalizeAddress = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();
const isParticipant = (address: string) => (PILOT_PARTICIPANT_ADDRESSES as readonly string[]).includes(address);
const isForbidden = (address: string) => (PILOT_FORBIDDEN_ADDRESSES as readonly string[]).includes(address);

export function isPilotParticipantAddress(address: string | null | undefined): boolean {
  return isParticipant(normalizeAddress(address));
}

export function resolveProjectPilotProfile(env: Env = process.env): ProjectPilotProfile {
  const rawProject = (env[PROJECT_PILOT_PROJECT_ID_ENV] ?? "").trim();
  if (rawProject === "") return { configured: false };
  if (!UUID_PATTERN.test(rawProject)) return { configured: true, valid: false, reason: `${PROJECT_PILOT_PROJECT_ID_ENV} não é um UUID` };
  if (rawProject.toLowerCase() !== WEG_PROJECT_ID) return { configured: true, valid: false, reason: "O piloto é restrito à WEG" };
  const sender = normalizeAddress(env[PROJECT_PILOT_SENDER_ENV]);
  if (sender !== ACC_PILOT_INSTITUTIONAL_ADDRESS) {
    return { configured: true, valid: false, reason: `${PROJECT_PILOT_SENDER_ENV} ausente ou diferente da identidade institucional do piloto` };
  }
  const rawAuthorized = (env[PROJECT_PILOT_AUTHORIZED_SENDERS_ENV] ?? "").trim();
  const authorizedSenders: string[] = [];
  if (rawAuthorized !== "") {
    for (const item of rawAuthorized.split(",")) {
      const address = normalizeAddress(item);
      if (!isParticipant(address)) {
        return { configured: true, valid: false, reason: `${PROJECT_PILOT_AUTHORIZED_SENDERS_ENV} contém endereço que não é participante autorizado do piloto` };
      }
      if (!authorizedSenders.includes(address)) authorizedSenders.push(address);
    }
  }
  return {
    configured: true,
    valid: true,
    projectId: rawProject.toLowerCase(),
    sender,
    authorizedSenders,
    cc: [ACC_PILOT_INSTITUTIONAL_ADDRESS],
    participants: [...PILOT_PARTICIPANT_ADDRESSES],
  };
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
  /** true => esta mensagem DEVE sair pela identidade `sender` (e só por ela). */
  routed: boolean;
  /** Remetente autenticado resolvido (acc@ ou participante autorizado). */
  sender: string | null;
  /** Destinatário principal (o próprio colaborador). */
  to: string | null;
  /** Cópia institucional obrigatória. */
  cc: string[];
  /** Nome de exibição do From: undefined => nome institucional do ACC; null => endereço puro (remetente que é uma PESSOA). */
  senderDisplayName?: string | null;
}

function buildBanner(input: SendEmailInput, senderLabel: string): { text: string; html: string; participant: string; level: string } {
  const participant = sanitizePilotLabel(input.pilot?.participantLabel) ?? "não informado (ver auditoria do alerta)";
  const level = sanitizePilotLabel(input.pilot?.escalationLevel, 40) ?? "não se aplica";
  const note = `Mensagem de TESTE do piloto WEG, entregue diretamente ao destinatário lógico; cópia institucional em ${ACC_PILOT_INSTITUTIONAL_ADDRESS}. Remetente: ${senderLabel}.`;
  const text = ["=== PILOTO — TESTE CONTROLADO ===", `Participante: ${participant}`, `Nível de escalonamento: ${level}`, note, "================================", ""].join("\n");
  const html =
    `<div data-acc-pilot="1" style="border:2px solid #b45309;background:#fffbeb;color:#78350f;padding:10px 14px;margin:0 0 12px;font-family:Arial,sans-serif;font-size:13px">` +
    `<strong>PILOTO — TESTE CONTROLADO</strong><br>` +
    `Participante: <strong>${escapeHtml(participant)}</strong> · Nível de escalonamento: <strong>${escapeHtml(level)}</strong><br>` +
    `${escapeHtml(note)}</div>`;
  return { text, html, participant, level };
}

/**
 * Aplica o perfil do projeto piloto. Mensagem de outro projeto (ou sem projeto, ou sem perfil configurado) volta INTOCADA.
 * Mensagem do projeto piloto:
 *   - To = o próprio colaborador (precisa ser um dos participantes autorizados — qualquer outro endereço BLOQUEIA o envio);
 *   - Cc = acc@axion.com.br, sempre (inclusive com remetente acc@); nunca Bcc;
 *   - remetente = acc@ (padrão) ou o participante solicitado, SE autorizado (ACC_PROJECT_PILOT_AUTHORIZED_SENDERS); caso contrário bloqueia;
 *   - Reply-To validado pelo guard (caixa inbound do ACC + token opaco) e nunca para endereço proibido;
 *   - assunto e corpo identificados como PILOTO.
 */
export function applyProjectPilotProfile(input: SendEmailInput, env: Env = process.env): ProjectPilotRouting {
  const profile = resolveProjectPilotProfile(env);
  if (!profile.configured || !isProjectPilotMessage(input, env)) return { input, routed: false, sender: null, to: null, cc: [] };
  if (!profile.valid) throw new EmailSendError(`Perfil do projeto piloto inválido (${profile.reason}) — envio bloqueado antes de qualquer chamada de rede.`);

  const to = normalizeAddress(input.to);
  if (isForbidden(to)) throw new EmailSendError("Destinatário proibido no piloto — envio bloqueado antes de qualquer chamada de rede.");
  if (!isParticipant(to)) {
    throw new EmailSendError("Destinatário fora dos participantes autorizados do piloto — envio bloqueado antes de qualquer chamada de rede.");
  }

  const requestedSender = normalizeAddress(input.pilot?.senderEmail) || profile.sender;
  if (isForbidden(requestedSender)) throw new EmailSendError("Remetente proibido no piloto — envio bloqueado antes de qualquer chamada de rede.");
  if (requestedSender !== profile.sender && !profile.authorizedSenders.includes(requestedSender)) {
    throw new EmailSendError("Remetente não autorizado para o piloto — envio bloqueado antes de qualquer chamada de rede.");
  }
  const senderIsPerson = requestedSender !== profile.sender;

  const banner = buildBanner(input, senderIsPerson ? "participante autorizado e autenticado" : "ACC (institucional)");
  const guarded = { ...input } as SendEmailInput & Record<string, unknown>;
  guarded.to = to;
  guarded.cc = [...profile.cc];
  delete guarded.bcc;
  // Reply-To: só o endereço opaco da caixa inbound OFICIAL do ACC, e nunca um endereço proibido.
  const replyMailbox = normalizeAddress(env[ALERT_REPLY_MAILBOX_ENV]);
  if (isForbidden(replyMailbox)) throw new EmailSendError("Caixa de resposta do piloto proibida — envio bloqueado antes de qualquer chamada de rede.");
  guarded.replyTo = resolveGuardedReplyTo(input, { alertReplyMailbox: replyMailbox || undefined }).replyTo;
  const stripped = input.subject.replace(/^(\[(TESTE CONTROLADO|PILOTO)[^\]]*\]\s*)+/, "");
  guarded.subject = `${PROJECT_PILOT_SUBJECT_TAG} [${banner.level}] ${stripped}`;
  guarded.text = `${banner.text}${input.text}`;
  if (input.html !== undefined) {
    const bodyOpen = input.html.match(/<body[^>]*>/i);
    guarded.html = bodyOpen ? input.html.replace(bodyOpen[0], `${bodyOpen[0]}${banner.html}`) : `${banner.html}${input.html}`;
  }
  return {
    input: guarded,
    routed: true,
    sender: requestedSender,
    to,
    cc: [...profile.cc],
    senderDisplayName: senderIsPerson ? null : undefined,
  };
}

/**
 * Última conferência, sobre a mensagem MIME já montada (transporte final): para uma mensagem roteada, From = remetente resolvido,
 * To = exatamente o destinatário, Cc = exatamente a cópia institucional, NENHUM Bcc/Resent-* e nenhum endereço proibido em qualquer
 * cabeçalho de destinatário (To/Cc/Reply-To). Qualquer divergência impede o envio.
 */
export function assertPilotMimeRecipients(mime: string, sender: string, to: string, cc: readonly string[] = [ACC_PILOT_INSTITUTIONAL_ADDRESS]): void {
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
  for (const forbidden of ["bcc", "resent-to", "resent-cc", "resent-bcc"]) {
    if (headers.has(forbidden)) throw new EmailSendError("Mensagem do projeto piloto com cabeçalho de destinatário adicional — bloqueada antes de qualquer chamada de rede.");
  }
  for (const name of ["to", "cc", "reply-to"]) {
    if (addressesOf(name).some((address) => isForbidden(address) || isForbidden(address.replace(/\+[^@]*@/, "@")))) {
      throw new EmailSendError("Mensagem do projeto piloto com endereço proibido — bloqueada antes de qualquer chamada de rede.");
    }
  }
  const sameSet = (found: string[], expected: readonly string[]) =>
    found.length === expected.length && new Set(found).size === expected.length && expected.every((address) => found.includes(address));
  if (!sameSet(addressesOf("to"), [to])) throw new EmailSendError("Mensagem do projeto piloto com Para diferente do destinatário autorizado — bloqueada antes de qualquer chamada de rede.");
  if (!sameSet(addressesOf("cc"), cc)) throw new EmailSendError("Mensagem do projeto piloto sem a cópia institucional obrigatória — bloqueada antes de qualquer chamada de rede.");
  const from = addressesOf("from");
  if (from.length !== 1 || from[0] !== sender) throw new EmailSendError("Mensagem do projeto piloto com remetente diferente do remetente resolvido — bloqueada antes de qualquer chamada de rede.");
}

/** Participantes autorizados do piloto quando `projectId` é o projeto piloto com perfil VÁLIDO; null em qualquer outro caso (fail closed). */
export function resolveProjectPilotParticipants(projectId: string, env: Env = process.env): string[] | null {
  const profile = resolveProjectPilotProfile(env);
  if (!profile.configured || !profile.valid) return null;
  if (profile.projectId !== projectId.trim().toLowerCase()) return null;
  return [...profile.participants];
}

/** true quando `projectId` é o projeto piloto com perfil válido (entrega direta + cópia institucional ativas). */
export function isProjectPilotActive(projectId: string, env: Env = process.env): boolean {
  return resolveProjectPilotParticipants(projectId, env) !== null;
}
