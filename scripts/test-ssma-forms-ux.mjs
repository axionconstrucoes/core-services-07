// Formulários SSMA (trilha A): nomes exibidos DDS/DSS com valores gravados preservados, mensagens de envio/aviso de
// acidente, indicador de conclusão (imagem fornecida, sem alteração) e cores dos cartões 11 e 12.
// Uso: node scripts/test-ssma-forms-ux.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const defs = await import("../apps/web/lib/ssma/checklist-definitions.ts");
const fb = await import("../apps/web/lib/ssma/form-feedback.ts");

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; }
}
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const by = (slug) => defs.SSMA_CHECKLISTS.find((d) => d.slug === slug);

console.log("\n======================================\nSSMA — FORMULÁRIOS (UX, DDS/DSS, CONCLUSÃO)\n======================================");

await check("DDS = Diálogo Diário e DSS = Diálogo Semanal nos nomes EXIBIDOS", () => {
  assert.equal(defs.checklistTitle(by("dda")), "DDS — Diálogo Diário de Segurança");
  assert.equal(defs.checklistShortTitle(by("dda")), "DDS — Fotos");
  assert.equal(defs.checklistCheckLabel(by("dda"), "DDA realizado"), "DDS realizado");
  assert.equal(defs.checklistTitle(by("dds")), "DSS — Diálogo Semanal de Segurança");
  assert.equal(defs.checklistShortTitle(by("dds")), "DSS — Fotos");
  assert.equal(defs.checklistCheckLabel(by("dds"), "DDS realizado"), "DSS realizado");
});
await check("identificadores e valores GRAVADOS não mudam (compatibilidade com o banco e registros existentes)", () => {
  assert.deepEqual([by("dda").number, by("dda").slug, by("dda").title, by("dda").checks[0]], [1, "dda", "DDA", "DDA realizado"]);
  assert.deepEqual([by("dds").number, by("dds").slug, by("dds").title, by("dds").checks[0]], [2, "dds", "DDS", "DDS realizado"]);
  assert.equal(by("dda").driveFolder, "01 - DIÁLOGO DIÁRIO DE SEGURANÇA - DDA (FOTOS)");
  assert.equal(by("dds").driveFolder, "02 - DIÁLOGO SEMANAL DE SEGURANÇA - DDS (FOTOS)");
});
await check("demais formulários e siglas sem relação NÃO foram alterados (sem substituição indiscriminada)", () => {
  for (const d of defs.SSMA_CHECKLISTS.filter((x) => !["dda", "dds"].includes(x.slug))) {
    assert.equal(defs.checklistTitle(d), d.title);
    assert.equal(defs.checklistShortTitle(d), d.shortTitle);
    for (const c of d.checks) assert.equal(defs.checklistCheckLabel(d, c), c);
  }
  assert.equal(by("apr").title, "APR — Análise preliminar de risco");
  const esg = read("../apps/web/components/esg/esg-submission-form.tsx");
  assert.ok(esg.includes("Tema do DDS"), "o DDS do módulo ESG (diálogo diário) segue como DDS");
});
await check("quase-acidente (classificação) segue obrigatória no formulário Riscos apontados", () => {
  const f = by("riscos-apontados").fields.find((x) => x.id === "classificacao");
  assert.ok(f && f.required && f.options.includes("Quase-acidente"));
});
await check("erro do servidor vira mensagem útil e nunca promete sucesso; dados continuam na tela", () => {
  assert.match(fb.friendlySubmitError(new Error("PROJECT_ACCESS_DENIED")), /acesso a esta obra/);
  assert.match(fb.friendlySubmitError(new Error("ACCIDENT_REQUIRED_FIELDS_MISSING")), /data\/hora da remoção/);
  assert.match(fb.friendlySubmitError(new Error("AUTH_REQUIRED")), /sessão expirou/);
  assert.match(fb.friendlySubmitError(new TypeError("Failed to fetch")), /Nada foi confirmado/);
  assert.match(fb.friendlySubmitError(new Error("algo inesperado do servidor")), /continuam nesta tela/);
  assert.match(fb.friendlySubmitError(new Error("Falha ao enviar “a.jpg”.")), /Falha ao enviar/);
  assert.match(fb.OFFLINE_FORM_MESSAGE, /Registrar ocorrência \/ inspeção/);
});
await check("aviso do acidente: registrado ≠ comunicado; 409/502/rede explicam e NÃO convidam a reenviar", () => {
  assert.equal(fb.accidentNotificationWarning({ ok: true, status: 200 }), null);
  const w409 = fb.accidentNotificationWarning({ ok: false, status: 409 });
  assert.match(w409, /FOI registrado/); assert.match(w409, /NINGUÉM foi avisado/);
  assert.match(fb.accidentNotificationWarning({ ok: false, status: 502 }), /falhou para ao menos um destinatário/);
  assert.match(fb.accidentNotificationWarning(null), /não registre o acidente de novo/);
  assert.match(fb.accidentNotificationWarning({ ok: false, status: 500 }, "x"), /\(x\)/);
});
await check("o formulário só mostra confirmação DEPOIS de finalizar; falha de aviso não é falha de envio (sem duplicar)", () => {
  const app = read("../apps/web/components/ssma/ssma-field-app.tsx");
  const iFinalize = app.indexOf('rpc("finalize_ssma_form_submission"');
  const iConfirm = app.indexOf("setConfirmation({ warning })");
  assert.ok(iFinalize > 0 && iConfirm > iFinalize, "confirmação só após finalize");
  assert.ok(!/O acidente foi registrado, mas a comunicação imediata não foi concluída/.test(app), "mensagem antiga (que parecia erro) removida");
  assert.ok(app.includes("OFFLINE_FORM_MESSAGE") && app.includes("navigator.onLine"));
});
await check("indicador de conclusão: imagem fornecida preservada (hash), transparência, acessível e só com envio confirmado", () => {
  const buf = readFileSync(new URL("../apps/web/public/ssma/done-icon.png", import.meta.url));
  assert.equal(createHash("sha256").update(buf).digest("hex").slice(0, 16), "3ad3551792fff3e2");
  assert.equal(buf.readUInt32BE(16), 512); assert.equal(buf.readUInt32BE(20), 512);
  assert.equal(buf[25], 6, "PNG RGBA (com transparência)");
  const app = read("../apps/web/components/ssma/ssma-field-app.tsx");
  assert.ok(app.includes('src="/ssma/done-icon.png"') && app.includes('alt="Concluído"') && app.includes('title="Concluído"'));
  assert.ok(app.includes("completed.has(definition.slug)"), "ícone depende da regra existente (concluído = enviado e confirmado)");
  assert.ok(!/>\s*Concluído\s*</.test(app.replace(/alt="Concluído"/g, "")), "texto visível 'Concluído' substituído pelo ícone");
  assert.ok(/ml-auto/.test(app), "alinhado à direita");
});
await check("cartões 11 e 12: fundo forte (verde-escuro / vermelho) com texto e ícone brancos", () => {
  const app = read("../apps/web/components/ssma/ssma-field-app.tsx");
  assert.ok(app.includes("bg-[#14532d]") && app.includes("bg-[#b91c1c]"));
  const ratio = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return 1.05 / (L + 0.05); };
  assert.ok(ratio("#14532d") >= 7 && ratio("#b91c1c") >= 4.5, `contraste ${ratio("#14532d").toFixed(1)} / ${ratio("#b91c1c").toFixed(1)}`);
});

console.log(`\nResumo: ${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
