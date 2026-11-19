// Cabeçalho "Fale com a AXIA" dos e-mails do ACC.
//
// Aplicado em UM ponto — no provider de e-mail, depois da guarda do modo piloto (ver gmail-email-provider.ts e
// fake-email-provider.ts) —, para que TODO e-mail enviado pelo ACC ganhe a foto circular e o texto à direita sem
// alterar o conteúdo, o assunto, os botões, as cores nem o agrupamento por obra de cada modelo.
//
// A conversa NÃO acontece no e-mail: foto e texto são um link para o ACC, que exige login e respeita as permissões.
// O link nunca leva dados pessoais, conteúdo contratual nem credenciais — no máximo ids de obra/autorização (UUID)
// e um tipo de contexto fixo (alerta, providencia, ssma, autorizacao).
//
// Alternativa legível: se o cliente de e-mail não carregar imagens ou ignorar estilos, ainda aparecem o texto do
// link "Fale com a AXIA" e o texto alternativo da foto; a versão em texto simples ganha uma linha com o endereço.
//
// DISPONIBILIDADE: o acesso "FALE COM A AXIA" é a ajuda DETERMINÍSTICA (Q&A aprovado, login e escopo por obra) e por isso
// NÃO depende de a IA generativa estar ligada: AXIA_CHAT_PROVIDER=off (estado de produção) continua exibindo o acesso, e a
// AXIA responde só com a base aprovada (ver lib/assistant/chat-orchestrator.ts). Este módulo NUNCA liga provedores de IA e
// não lê AXIA_CHAT_PROVIDER. Chave de desligamento explícita: ACC_AXIA_EMAIL_HEADER=off remove o cabeçalho de todos os e-mails.
//
// Sem "server-only": testável por script Node.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { InlineImageAttachment, SendEmailInput, VeraEmailHint } from "../email-provider";

export const VERA_EMAIL_IMAGE_CID = "vera-assistente-acc";
export const VERA_EMAIL_MARKER = 'data-vera-header="1"';
const VERA_IMAGE_FILE = "ajuda-acc-email.png";
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const CONTEXTS = new Set(["geral", "alerta", "providencia", "ssma", "autorizacao"]);

/** Endereço da AXIA para o e-mail. Sem contexto específico, abre a ajuda geral (/vera). */
export function buildVeraUrl(baseUrl: string, hint?: VeraEmailHint): string {
  const base = baseUrl.replace(/\/+$/, "");
  const projectId = hint?.projectId && UUID.test(hint.projectId) ? hint.projectId : null;
  const authorizationId = hint?.authorizationId && UUID.test(hint.authorizationId) ? hint.authorizationId : null;
  const context = hint?.context && CONTEXTS.has(hint.context) ? hint.context : "geral";

  if (authorizationId) return `${base}/autorizacao-email/${authorizationId}?vera=abrir`;
  if (projectId) return `${base}/${projectId}/ajuda?vera=abrir&contexto=${context}`;
  return `${base}/vera`;
}

export function loadVeraInlineImage(appRootDir: string = process.cwd()): InlineImageAttachment | null {
  const filePath = path.join(appRootDir, "public", "assistente", VERA_IMAGE_FILE);
  if (!existsSync(filePath)) return null;
  try {
    return {
      cid: VERA_EMAIL_IMAGE_CID,
      filename: VERA_IMAGE_FILE,
      mimeType: "image/png",
      contentBase64: readFileSync(filePath).toString("base64"),
    };
  } catch {
    return null;
  }
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function buildVeraHeaderHtml(url: string, hasImage: boolean): string {
  const href = escapeAttribute(url);
  const label = "FALE COM A AXIA";
  const image = hasImage
    ? `&nbsp;<img src="cid:${VERA_EMAIL_IMAGE_CID}" width="40" height="40" alt="AXIA — Assistente ACC" style="vertical-align:middle;border-radius:20px;border:2px solid #7F1D1D;width:40px;height:40px;">`
    : "";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ${VERA_EMAIL_MARKER} style="background:#FFFFFF;">` +
    `<tr><td align="right" style="padding:8px 14px;">` +
    `<a href="${href}" title="Abrir a AXIA — Assistente ACC" style="text-decoration:none;color:#7F1D1D;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;">` +
    `<span style="vertical-align:middle;">${label}</span>${image}</a>` +
    `</td></tr></table>`
  );
}

/** true por padrão (ajuda determinística sempre disponível); só "off"/"0"/"false" em ACC_AXIA_EMAIL_HEADER desliga o cabeçalho. */
export function isAxiaEmailAccessAvailable(env: Record<string, string | undefined> = process.env): boolean {
  const flag = (env.ACC_AXIA_EMAIL_HEADER ?? "").trim().toLowerCase();
  return !(flag === "off" || flag === "0" || flag === "false");
}

export interface ApplyVeraOptions {
  /** Exibição do cabeçalho; padrão = isAxiaEmailAccessAvailable(process.env). false => e-mail sem cabeçalho da AXIA. */
  axiaAvailable?: boolean;
  /** URL base do ACC; padrão AXION_APP_BASE_URL. Sem ela, o e-mail segue sem o cabeçalho (nunca falha o envio). */
  baseUrl?: string | null;
  loadImage?: () => InlineImageAttachment | null;
}

export function applyVeraEmailHeader(input: SendEmailInput, options: ApplyVeraOptions = {}): SendEmailInput {
  if (!(options.axiaAvailable ?? isAxiaEmailAccessAvailable())) return input;
  const baseUrl = (options.baseUrl ?? process.env.AXION_APP_BASE_URL ?? "").trim();
  if (!/^https?:\/\//i.test(baseUrl)) return input;
  if (input.html?.includes(VERA_EMAIL_MARKER)) return input;

  const url = buildVeraUrl(baseUrl, input.vera);
  const textLine = `Fale com a AXIA (assistente do ACC): ${url}`;
  const text = `${textLine}\n\n${input.text}`;

  if (!input.html) return { ...input, text };

  const image = (options.loadImage ?? loadVeraInlineImage)();
  const header = buildVeraHeaderHtml(url, image !== null);
  const html = /<body[^>]*>/i.test(input.html) ? input.html.replace(/<body[^>]*>/i, (match) => `${match}${header}`) : `${header}${input.html}`;
  const inlineImages =
    image && !(input.inlineImages ?? []).some((existing) => existing.cid === image.cid) ? [...(input.inlineImages ?? []), image] : input.inlineImages;

  return { ...input, text, html, inlineImages };
}
