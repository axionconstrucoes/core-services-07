// Remoção de texto citado (parseReplyBody) — Gmail PT/EN, Outlook desktop/web/mobile PT-BR e EN. O texto citado do alerta
// original contém os nomes dos botões (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA); se vazar para o texto "novo" o comando fica
// ambíguo ou é lido do trecho errado. Cobre "Enviado em:" / "Enviada em:" (Outlook PT-BR), linhas em branco entre De: e
// Enviado:, "escreveu:" quebrado em duas linhas e respostas legítimas curtas (sem citação) preservadas.
// Uso: node scripts/test-email-quote-parser-ptbr.mjs
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const { parseReplyBody } = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");
const { parseOperationalEmailCommand } = await import("../apps/web/lib/risk-alerts/replies/operational-email-command");

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

const ORIGINAL = "Alerta de risco ALTO\nResponda com: RESOLVIDO, EM ANDAMENTO ou ENVIAR PARA <nome>\nCódigo: ALR-0042";
const cut = (reply, header) => parseReplyBody(`${reply}\n\n${header}\n\n${ORIGINAL}`);

await check("1. Outlook PT-BR desktop: 'De:' + 'Enviado em:' (forma real) corta a citação", () => {
  const r = cut("RESOLVIDO trocado o disjuntor do QD-3", "De: ACC CRM <crm@axion.com.br>\nEnviado em: sexta-feira, 20 de novembro de 2026 10:15\nPara: Carlos <carlos@axion.com.br>\nAssunto: [ACC] Alerta ALTO");
  assert(r.clean === "RESOLVIDO trocado o disjuntor do QD-3", JSON.stringify(r.clean));
  assert(/ALR-0042/.test(r.quoted));
});
await check("2. Outlook PT-BR: 'Enviada em:' (feminino) e 'Enviado:' (sem 'em')", () => {
  assert(cut("RESOLVIDO ok", "De: ACC <crm@axion.com.br>\nEnviada em: 20 de novembro de 2026 10:15\nPara: x").clean === "RESOLVIDO ok");
  assert(cut("RESOLVIDO ok", "De: ACC <crm@axion.com.br>\nEnviado: sexta-feira, 20 de novembro de 2026 10:15\nPara: x").clean === "RESOLVIDO ok");
});
await check("3. Outlook EN: 'From:' + 'Sent:' / 'Date:'", () => {
  assert(cut("RESOLVED ok", "From: ACC <crm@axion.com.br>\nSent: Friday, November 20, 2026 10:15 AM\nTo: x").clean === "RESOLVED ok");
  assert(cut("RESOLVED ok", "From: ACC <crm@axion.com.br>\nDate: 20 Nov 2026\nTo: x").clean === "RESOLVED ok");
});
await check("4. Outlook web/mobile: linha em branco entre 'De:' e 'Enviado em:' também corta", () => {
  assert(cut("EM ANDAMENTO trocando; Previsão: 25/11/2026", "De: ACC <crm@axion.com.br>\n\nEnviado em: 20/11/2026 10:15\nPara: x").clean === "EM ANDAMENTO trocando; Previsão: 25/11/2026");
});
await check("5. CRLF (corpo vindo do servidor) funciona igual", () => {
  const raw = `RESOLVIDO ok\r\n\r\nDe: ACC <crm@axion.com.br>\r\nEnviado em: 20 de novembro de 2026 10:15\r\nPara: x\r\n\r\n${ORIGINAL}`.replace(/\n/g, "\r\n").replace(/\r\r\n/g, "\r\n");
  assert(parseReplyBody(raw).clean === "RESOLVIDO ok");
});
await check("6. Gmail/Apple PT e EN: 'Em ... escreveu:' / 'On ... wrote:' (inclusive quebrado em duas linhas)", () => {
  assert(cut("RESOLVIDO ok", "Em sex., 20 de nov. de 2026 às 10:15, ACC <crm@axion.com.br> escreveu:").clean === "RESOLVIDO ok");
  assert(cut("RESOLVED ok", "On Fri, Nov 20, 2026 at 10:15 AM ACC <crm@axion.com.br> wrote:").clean === "RESOLVED ok");
  assert(cut("RESOLVIDO ok", "Em sex., 20 de nov. de 2026 às 10:15, ACC Contract Intelligence <\ncrm@axion.com.br> escreveu:").clean === "RESOLVIDO ok", "quebrado");
});
await check("7. Separadores clássicos: Original Message / Mensagem original / linha de sublinhados / '>' / encaminhada", () => {
  assert(cut("RESOLVIDO ok", "-----Original Message-----").clean === "RESOLVIDO ok");
  assert(cut("RESOLVIDO ok", "-----Mensagem original-----").clean === "RESOLVIDO ok");
  assert(cut("RESOLVIDO ok", "________________________________").clean === "RESOLVIDO ok");
  assert(cut("RESOLVIDO ok", "> citado").clean === "RESOLVIDO ok");
  assert(cut("RESOLVIDO ok", "---------- Mensagem encaminhada ----------").clean === "RESOLVIDO ok");
});
await check("8. Resposta legítima sem citação não é cortada; 'Em ...' no meio de frase sem 'escreveu:' fica", () => {
  assert(parseReplyBody("RESOLVIDO: concluído em 20/11 pela equipe").clean === "RESOLVIDO: concluído em 20/11 pela equipe");
  assert(parseReplyBody("EM ANDAMENTO\nEm campo, equipe providenciando.\nPrevisão: 25/11/2026").clean.includes("Previsão: 25/11/2026"));
  assert(parseReplyBody("Remeto o texto De: parte e Enviado: depois").clean.includes("Enviado: depois"), "'De:' no meio da linha não é cabeçalho");
});
await check("9. Comando lido só do texto novo: citação com RESOLVIDO/EM ANDAMENTO/ENVIAR PARA não gera ambiguidade", () => {
  const r = cut("RESOLVIDO trocado o disjuntor do QD-3", "De: ACC CRM <crm@axion.com.br>\nEnviado em: sexta-feira, 20 de novembro de 2026 10:15\nPara: Carlos <carlos@axion.com.br>\nAssunto: Alerta");
  const cmd = parseOperationalEmailCommand(r.clean);
  assert(cmd.command?.kind === "RESOLVE" && cmd.command.note === "trocado o disjuntor do QD-3", JSON.stringify(cmd));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
