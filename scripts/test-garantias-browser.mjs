// Testes em NAVEGADOR REAL (Chrome headless via CDP) do ACEITE DO CLIENTE de Garantias (Fase 4/B): informado x comprovado, formulário do aceite
// comprovado (evidência, hash, manifestante externo), histórico, estados desabilitado/erro/conflito, celular 390 px, contraste medido e axe-core.
// Monta o VerificationPanel REAL com dados sintéticos (sem Next, login, Supabase ou rede). Server Actions substituídas por stubs (nada é gravado).
// Uso: node scripts/test-garantias-browser.mjs [--require-chrome]   (CHROME_PATH=<exe> opcional; sem Chrome => SKIP, exceto com --require-chrome)
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixture } from "./lib/browser-harness-build.mjs";
import { chromeAvailable, CHROME, sleep, withBrowser } from "./lib/browser-harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(here, "fixtures", "garantias-browser");
const HELP = path.join(here, "fixtures", "help-browser", "page-helpers.js");
if (!chromeAvailable()) {
  console.log(`SKIP: Chrome não encontrado em "${CHROME}" (defina CHROME_PATH). Nenhuma verificação de navegador foi executada.`);
  process.exit(process.argv.includes("--require-chrome") ? 2 : 0);
}

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    const r = await fn();
    const ok = r === undefined ? true : r.ok;
    console.log(`${ok ? "OK  " : "FAIL"} ${name}${r?.ev ? ` :: ${r.ev}` : ""}`);
    ok ? (passed += 1) : (failed += 1);
  } catch (e) {
    console.log(`FAIL ${name} :: exceção: ${String(e?.message ?? e).slice(0, 300)}`);
    failed += 1;
  }
}

const work = mkdtempSync(path.join(tmpdir(), "acc-garantias-fixture-"));
const built = await buildFixture({
  entry: path.join(FX, "entry.tsx"),
  html: readFileSync(path.join(FX, "index.template.html"), "utf8"),
  fixtureCss: readFileSync(path.join(FX, "fixture.css"), "utf8"),
  outDir: work,
  stubs: {
    "next/link": path.join(FX, "stubs", "next-link.tsx"),
    "next/navigation": path.join(FX, "stubs", "next-navigation.ts"),
    "@/app/[projectId]/garantias/actions": path.join(FX, "stubs", "garantias-actions.ts"),
  },
});
console.log(`fixture: ${built.modules} módulos; ausentes: ${built.missing.length ? built.missing.join(", ") : "nenhum"}`);

const D = { width: 1280, height: 900 };
const M = { width: 390, height: 844, mobile: true };
const CLICK = (text, sel = "button") => `(()=>{const t=${JSON.stringify(text)};const el=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.offsetParent!==null&&(e.textContent||"").trim().includes(t));if(!el)return false;el.click();return true;})()`;
const TEXT = (t) => `document.body.innerText.includes(${JSON.stringify(t)})`;
const SET = (id, value, tag = "input") => `(()=>{const el=document.getElementById(${JSON.stringify(id)});if(!el)return false;const proto=${tag === "textarea" ? "HTMLTextAreaElement" : tag === "select" ? "HTMLSelectElement" : "HTMLInputElement"}.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(${tag === "select" ? '"change"' : '"input"'},{bubbles:true}));return true;})()`;
const CONTRAST = `(()=>{const out=[];const all=[...document.querySelectorAll("body *")];let n=0;
  for(const el of all){ if(!el.offsetParent&&el.tagName!=="BODY") continue; if(["SCRIPT","STYLE","SVG","PATH"].includes(el.tagName.toUpperCase())) continue;
    const own=[...el.childNodes].some(c=>c.nodeType===3&&c.textContent.trim().length>0); if(!own) continue; n++;
    const m=__t.measureText(el); const large=m.size>=24||(m.size>=18.66&&Number(m.weight)>=700); const min=large?3:4.5;
    if(m.ratio<min) out.push({t:m.text,ratio:Math.round(m.ratio*100)/100,fg:m.fg,bg:m.bg,tag:el.tagName,cls:(el.className||"").toString().slice(0,60)}); }
  return {measured:n,fails:out.slice(0,8),failCount:out.length};})()`;
const SMALL_TARGETS = `(()=>{const out=[];for(const el of document.querySelectorAll("button,select,input:not([type=checkbox]),textarea,a")){ if(!el.offsetParent) continue; const r=el.getBoundingClientRect();
  if(!(el.textContent||"").trim() && el.tagName==="BUTTON" && el.querySelector("svg")) continue;
  if(r.height<43.5) out.push({tag:el.tagName,t:(el.textContent||el.getAttribute("aria-label")||"").trim().slice(0,30),h:Math.round(r.height)}); }
  return out.slice(0,8);})()`;

await withBrowser(async (b) => {
  const load = async ({ status = "NENHUM", manage = 1, mobile = false, mode = "ok" } = {}) => {
    await b.open(built.index, { query: `status=${status}&manage=${manage}`, ...(mobile ? M : D) });
    await b.eval(`window.__mode=${JSON.stringify(mode)}`);
    await b.injectHelpers(HELP);
  };

  await check("G1 situação do aceite: sem aceite, informado, comprovado e legado — rótulo, aviso de que só o comprovado libera o encerramento e histórico", async () => {
    const problems = [];
    const expect = {
      NENHUM: ["Sem aceite (SEM DADOS)", "Só o aceite COMPROVADO", "Histórico de aceites: SEM DADOS"],
      INFORMADO: ["Aceite INFORMADO por usuário interno", "Só o aceite COMPROVADO", "Informado"],
      COMPROVADO: ["Aceite COMPROVADO (manifestação do cliente", "Comprovado", "SHA-256 aaaaaaaaaaaa", "maria@cliente.exemplo.invalid", "Cliente Exemplo SA"],
      LEGADO: ["Aceite legado (anterior à regra", "Só o aceite COMPROVADO"],
    };
    for (const [status, texts] of Object.entries(expect)) {
      await load({ status });
      for (const t of texts) if (!(await b.eval(TEXT(t)))) problems.push(`${status}: falta "${t}"`);
      const warn = await b.eval(TEXT("Só o aceite COMPROVADO"));
      if (status === "COMPROVADO" && warn) problems.push("COMPROVADO não deveria exibir o aviso de bloqueio");
    }
    // comprovado: o histórico mostra o informado anterior E o comprovado
    await load({ status: "COMPROVADO" });
    const hist = await b.eval(`document.querySelectorAll('[data-testid="aceite-historico"] li').length`);
    if (hist !== 2) problems.push(`histórico com ${hist} linhas (esperado 2)`);
    return { ok: problems.length === 0 && b.consoleErrors.length === 0, ev: problems.join(" | ") || "4 situações; histórico preservado; sem erros de console" };
  });

  await check("G2 formulário do aceite comprovado: validação no servidor/tela, evidência só e-mail/documento FATO, hash 64 hex, chamada sem envio de comunicação", async () => {
    const problems = [];
    await load({ status: "INFORMADO" });
    const opts = await b.eval(`[...document.querySelectorAll("#acp-evi option")].map(o=>o.textContent.trim())`);
    if (!opts.some((o) => o.includes("msg-aceite-2026-11-18")) || !opts.some((o) => o.includes("ata-vistoria-final.pdf"))) problems.push(`opções de evidência sem e-mail/documento: ${JSON.stringify(opts)}`);
    if (opts.some((o) => o.includes("foto-laje") || o.includes("inferencia-interna"))) problems.push("evidência de foto/inferência não deveria ser oferecida como prova");
    const hashAttr = await b.eval(`(()=>{const h=document.getElementById("acp-hash");return {min:h.minLength,max:h.maxLength,pattern:h.pattern,mono:h.className.includes("font-mono")}})()`);
    if (hashAttr.min !== 64 || hashAttr.max !== 64 || !hashAttr.pattern.includes("{64}")) problems.push(`campo de hash sem restrição de 64 hex: ${JSON.stringify(hashAttr)}`);
    await b.eval(SET("acp-data", "2026-11-18")); await b.eval(SET("acp-nome", "Maria Cliente")); await b.eval(SET("acp-email", "maria@cliente.exemplo.invalid"));
    await b.eval(SET("acp-evi", "00000000-0000-4000-8000-000000000021", "select")); await b.eval(SET("acp-hash", "b".repeat(64)));
    await b.eval(CLICK("Registrar aceite comprovado")); await sleep(200);
    const calls = await b.eval(`JSON.stringify(window.__calls||[])`);
    if (!calls.includes('"op":"proveAcceptanceAction"') || !calls.includes("b".repeat(64)) || !calls.includes("maria@cliente.exemplo.invalid")) problems.push(`proveAcceptanceAction não chamada: ${calls.slice(0, 160)}`);
    if (/send|enviar|mail\(/i.test(calls.replace(/maria@cliente\.exemplo\.invalid/g, "").replace(/proveAcceptanceAction/g, ""))) problems.push("chamada com envio de comunicação");
    if (!(await b.eval(TEXT("Registrado.")))) problems.push("sem confirmação de registro");
    // recusa do banco (manifestante interno): mensagem clara, formulário preservado
    await load({ status: "INFORMADO", mode: "internal" });
    await b.eval(SET("acp-data", "2026-11-18")); await b.eval(SET("acp-nome", "Maria Cliente")); await b.eval(SET("acp-email", "gestor@axion.exemplo.invalid"));
    await b.eval(SET("acp-evi", "00000000-0000-4000-8000-000000000021", "select")); await b.eval(SET("acp-hash", "b".repeat(64)));
    await b.eval(CLICK("Registrar aceite comprovado")); await sleep(200);
    if (!(await b.eval(TEXT("não substitui a manifestação do cliente")))) problems.push("recusa do banco sem mensagem clara");
    // conflito de versão
    await load({ status: "INFORMADO", mode: "conflict" });
    await b.eval(SET("acp-data", "2026-11-18")); await b.eval(SET("acp-nome", "Maria Cliente")); await b.eval(SET("acp-email", "maria@cliente.exemplo.invalid"));
    await b.eval(SET("acp-evi", "00000000-0000-4000-8000-000000000021", "select")); await b.eval(SET("acp-hash", "b".repeat(64)));
    await b.eval(CLICK("Registrar aceite comprovado")); await sleep(200);
    if (!(await b.eval(TEXT("alterado por outra pessoa")))) problems.push("conflito sem aviso");
    return { ok: problems.length === 0 && b.consoleErrors.length === 0, ev: problems.join(" | ") || "evidência filtrada; hash restrito; chamada correta; recusa e conflito com mensagem" };
  });

  await check("G3 perfil sem gestão e caso fora de Reparada/Verificada: formulários desabilitados com o motivo; nada é chamado", async () => {
    const problems = [];
    await load({ status: "NENHUM", manage: 0 });
    if (!(await b.eval(TEXT("exige perfil de gestão")))) problems.push("sem explicação de perfil");
    const dis = await b.eval(`[...document.querySelectorAll("button")].filter(x=>/Registrar aceite/.test(x.textContent)).map(x=>x.disabled||x.getAttribute("aria-disabled")==="true")`);
    if (!dis.length || dis.some((x) => !x)) problems.push(`botões de aceite habilitados para LEITURA: ${JSON.stringify(dis)}`);
    await b.open(built.index, { query: "status=NENHUM&manage=1&state=ABERTA", ...D });
    await b.injectHelpers(HELP);
    if (!(await b.eval(TEXT("só pode ser registrado com o caso Reparado ou Verificado")))) problems.push("sem explicação de estado");
    return { ok: problems.length === 0, ev: problems.join(" | ") || "LEITURA e estado ABERTA bloqueados com explicação" };
  });

  await check("G4 celular 390 px: sem rolagem horizontal, alvos de toque >= 44 px; contraste medido (fundo efetivo) nas 4 situações; axe-core sem violações sérias/críticas", async () => {
    const problems = [];
    for (const mobile of [true, false]) {
      for (const status of ["NENHUM", "INFORMADO", "COMPROVADO", "LEGADO"]) {
        await load({ status, mobile });
        const o = await b.eval(`({over:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,small:${SMALL_TARGETS}})`);
        if (mobile && o.over) problems.push(`${status}: rolagem horizontal`);
        if (o.small.length) problems.push(`${status}${mobile ? "/390" : ""}: alvos pequenos ${JSON.stringify(o.small.slice(0, 3))}`);
        const c = await b.eval(CONTRAST);
        if (c.failCount) problems.push(`${status}${mobile ? "/390" : ""}: contraste ${c.failCount} ${JSON.stringify(c.fails.slice(0, 2))}`);
        if (!mobile) {
          const ax = await b.runAxe();
          const bad = ax.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
          if (bad.length) problems.push(`${status}: axe ${bad.join(",")}`);
        }
      }
    }
    return { ok: problems.length === 0, ev: problems.join(" | ").slice(0, 700) || "4 situações x desktop/celular; sem reprovações" };
  });
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
