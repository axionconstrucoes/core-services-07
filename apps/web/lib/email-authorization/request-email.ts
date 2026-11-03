// E-mail individual da solicitação de autorização de acesso aos e-mails da obra.
// Puro (sem I/O): devolve assunto, texto e HTML. Os botões são LINKS para a página autenticada do ACC — abrir o
// link (GET) nunca registra aceite ou recusa; a decisão só é gravada depois da confirmação explícita na página.
// O cabeçalho "Fale com a VERA" é acrescentado pelo provider de e-mail (lib/email/branding/vera-email-header.ts).

import {
  ACC_COLOR_BODY,
  ACC_COLOR_HEADING,
  ACC_COLOR_MUTED,
  ACC_FONT_FAMILY,
  ACC_FONT_SIZE_AUX,
  ACC_FONT_SIZE_BODY,
  ACC_FONT_SIZE_SECTION,
  ACC_FONT_SIZE_TITLE,
} from "../email/brand-style";
import { EMAIL_AUTH_FILTERS, GMAIL_OAUTH_SCOPE, buildEmailAuthScopeSnapshot } from "./notice";

export interface AuthorizationRequestEmailInput {
  collaboratorName: string;
  accountEmail: string;
  projectName: string;
  authorizationId: string;
  /** URL base do ACC, sem barra final (ex.: https://acc.axion.com.br). */
  baseUrl: string;
}

export interface AuthorizationRequestEmail {
  subject: string;
  text: string;
  html: string;
}

export function authorizationPageUrl(baseUrl: string, authorizationId: string, action?: "autorizar" | "recusar"): string {
  const url = `${baseUrl.replace(/\/+$/, "")}/autorizacao-email/${authorizationId}`;
  return action ? `${url}?acao=${action}` : url;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function button(href: string, label: string, primary: boolean): string {
  const background = primary ? ACC_COLOR_HEADING : "#FFFFFF";
  const color = primary ? "#FFFFFF" : ACC_COLOR_HEADING;
  return `<a href="${esc(href)}" style="display:inline-block;background:${background};color:${color};border:2px solid ${ACC_COLOR_HEADING};border-radius:6px;padding:12px 18px;font-family:${ACC_FONT_FAMILY};font-size:${ACC_FONT_SIZE_BODY};font-weight:bold;text-decoration:none;margin:4px 6px 4px 0;">${esc(label)}</a>`;
}

export function buildAuthorizationRequestEmail(input: AuthorizationRequestEmailInput): AuthorizationRequestEmail {
  const snapshot = buildEmailAuthScopeSnapshot();
  const subject = `Autorização de acesso aos e-mails da obra ${input.projectName} | ACC`;
  const authorizeUrl = authorizationPageUrl(input.baseUrl, input.authorizationId, "autorizar");
  const declineUrl = authorizationPageUrl(input.baseUrl, input.authorizationId, "recusar");
  const pageUrl = authorizationPageUrl(input.baseUrl, input.authorizationId);

  const permissionLines = [
    `Permissão do Google: ${snapshot.oauthScopeLabel} (${GMAIL_OAUTH_SCOPE}).`,
    "O ACC apenas lê mensagens e anexos; não envia, não apaga e não altera e-mails da sua conta.",
    "Atenção: essa permissão do Google não se limita a uma obra (tecnicamente permite ler a caixa inteira). A limitação à obra é feita pelos filtros do próprio ACC.",
  ];

  const text = [
    `Olá, ${input.collaboratorName}.`,
    "",
    `Você está sendo convidado(a) a autorizar o acesso do ACC à sua conta ${input.accountEmail} para a obra ${input.projectName}.`,
    "",
    "FINALIDADE",
    "Registrar, nesta obra, as comunicações e anexos relacionados ao contrato, formar a linha do tempo e gerar alertas. A autorização vale só para esta obra.",
    "",
    "PERMISSÕES",
    ...permissionLines,
    "",
    "FILTROS APLICADOS PELO ACC",
    ...EMAIL_AUTH_FILTERS.map((line) => `- ${line}`),
    "",
    "Abrir os links abaixo não registra nenhuma resposta: você confirma a decisão dentro do ACC, com login.",
    `AUTORIZAR ACESSO PARA ESTA OBRA: ${authorizeUrl}`,
    `NÃO AUTORIZAR: ${declineUrl}`,
    `Ler a explicação completa: ${pageUrl}`,
  ].join("\n");

  const cell = `font-family:${ACC_FONT_FAMILY};font-size:${ACC_FONT_SIZE_BODY};color:${ACC_COLOR_BODY};line-height:1.5;`;
  const heading = (title: string) =>
    `<p style="margin:18px 0 4px 0;font-family:${ACC_FONT_FAMILY};font-size:${ACC_FONT_SIZE_SECTION};font-weight:bold;color:${ACC_COLOR_HEADING};">${esc(title)}</p>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;"><tr><td align="center" style="padding:16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;"><tr><td style="padding:20px 24px;${cell}">
<h1 style="margin:0 0 8px 0;font-family:${ACC_FONT_FAMILY};font-size:${ACC_FONT_SIZE_TITLE};color:${ACC_COLOR_HEADING};">Autorização de acesso aos e-mails da obra</h1>
<p style="margin:0 0 12px 0;">Olá, <strong>${esc(input.collaboratorName)}</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 4px 0;${cell}">
<tr><td style="padding:2px 12px 2px 0;color:${ACC_COLOR_MUTED};">Colaborador</td><td><strong>${esc(input.collaboratorName)}</strong></td></tr>
<tr><td style="padding:2px 12px 2px 0;color:${ACC_COLOR_MUTED};">Conta</td><td><strong>${esc(input.accountEmail)}</strong></td></tr>
<tr><td style="padding:2px 12px 2px 0;color:${ACC_COLOR_MUTED};">Obra</td><td><strong>${esc(input.projectName)}</strong></td></tr>
</table>
${heading("Finalidade")}
<p style="margin:0;">Registrar, nesta obra, as comunicações e anexos relacionados ao contrato, formar a linha do tempo e gerar alertas. A autorização vale somente para esta obra.</p>
${heading("Permissões efetivas")}
${permissionLines.map((line) => `<p style="margin:0 0 4px 0;">${esc(line)}</p>`).join("\n")}
${heading("Filtros aplicados pelo ACC")}
<ul style="margin:0;padding-left:20px;">${EMAIL_AUTH_FILTERS.map((line) => `<li style="margin:0 0 4px 0;">${esc(line)}</li>`).join("")}</ul>
<p style="margin:18px 0 8px 0;font-size:${ACC_FONT_SIZE_AUX};color:${ACC_COLOR_MUTED};">Abrir os botões abaixo não registra nenhuma resposta. Você confirma a decisão dentro do ACC, com login.</p>
<p style="margin:0 0 8px 0;">${button(authorizeUrl, "AUTORIZAR ACESSO PARA ESTA OBRA", true)}${button(declineUrl, "NÃO AUTORIZAR", false)}</p>
<p style="margin:0;font-size:${ACC_FONT_SIZE_AUX};color:${ACC_COLOR_MUTED};">Se os botões não funcionarem, copie este endereço: ${esc(pageUrl)}</p>
</td></tr></table></td></tr></table>
</body></html>`;

  return { subject, text, html };
}
