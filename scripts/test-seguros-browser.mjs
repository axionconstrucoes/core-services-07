// Testes em NAVEGADOR REAL (Chrome headless via CDP) do módulo SEGUROS: abas, teclado, celular, estados (desabilitado, conflito, erro),
// envio real inexistente, contraste medido e axe-core. Monta os componentes REAIS com dados sintéticos (sem Next, login, Supabase ou rede).
// Uso: node scripts/test-seguros-browser.mjs [--require-chrome]   (CHROME_PATH=<exe> opcional; sem Chrome => SKIP, exceto com --require-chrome)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { buildFixture } from "./lib/browser-harness-build.mjs";
import { chromeAvailable, CHROME, sleep, withBrowser } from "./lib/browser-harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(here, "fixtures", "seguros-browser");
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

const work = mkdtempSync(path.join(tmpdir(), "acc-seguros-fixture-"));
const built = await buildFixture({
  entry: path.join(FX, "entry.tsx"),
  html: readFileSync(path.join(FX, "index.template.html"), "utf8"),
  fixtureCss: readFileSync(path.join(FX, "fixture.css"), "utf8"),
  outDir: work,
  stubs: {
    "next/link": path.join(FX, "stubs", "next-link.tsx"),
    "next/navigation": path.join(FX, "stubs", "next-navigation.ts"),
    "@/app/[projectId]/seguros/actions": path.join(FX, "stubs", "seguros-actions.ts"),
    "@/app/[projectId]/seguros/actions-persistencia": path.join(FX, "stubs", "seguros-actions-persistencia.ts"),
  },
});
console.log(`fixture: ${built.modules} módulos; ausentes: ${built.missing.length ? built.missing.join(", ") : "nenhum"}`);

const D = { width: 1280, height: 900 };
const M = { width: 390, height: 844, mobile: true };
const TABS = ["Painel", "Apólices", "Fianças e garantias", "Endossos", "Adiantamentos", "Sinistros e eventos", "Dossiês", "Minutas e acionamento", "Canais oficiais", "Sujeitos e RCC", "Referências", "Auditoria"];

// clica no primeiro elemento (button) visível cujo texto contém `text`; devolve true/false
const CLICK = (text, sel = "button") => `(()=>{const t=${JSON.stringify(text)};const el=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.offsetParent!==null&&(e.textContent||"").trim().includes(t));if(!el)return false;el.click();return true;})()`;
const TEXT = (t) => `document.body.innerText.includes(${JSON.stringify(t)})`;

// contraste: todo elemento com texto próprio visível, medido contra o fundo EFETIVO (helpers da fixture do HelpHint)
const CONTRAST = `(()=>{const out=[];const all=[...document.querySelectorAll("body *")];let n=0;
  for(const el of all){ if(!el.offsetParent&&el.tagName!=="BODY") continue; if(["SCRIPT","STYLE","SVG","PATH"].includes(el.tagName.toUpperCase())) continue;
    const own=[...el.childNodes].some(c=>c.nodeType===3&&c.textContent.trim().length>0); if(!own) continue; n++;
    const m=__t.measureText(el); const large=m.size>=24||(m.size>=18.66&&Number(m.weight)>=700); const min=large?3:4.5;
    if(m.ratio<min) out.push({t:m.text,ratio:Math.round(m.ratio*100)/100,fg:m.fg,bg:m.bg,tag:el.tagName,cls:(el.className||"").toString().slice(0,60)}); }
  return {measured:n,fails:out.slice(0,8),failCount:out.length};})()`;
const SMALL_TARGETS = `(()=>{const out=[];for(const el of document.querySelectorAll("button,select,input:not([type=checkbox]),textarea,a")){ if(!el.offsetParent) continue; const r=el.getBoundingClientRect();
  if(!(el.textContent||"").trim() && el.tagName==="BUTTON" && el.querySelector("svg")) continue; /* ícone (i): área de toque expandida pelo HelpHint */
  if(r.height<43.5) out.push({tag:el.tagName,t:(el.textContent||el.getAttribute("aria-label")||"").trim().slice(0,30),h:Math.round(r.height)}); }
  return out.slice(0,8);})()`;

await withBrowser(async (b) => {
  const load = async ({ role = "ADMINISTRADOR", mobile = false, mode = "ok", user = "704" } = {}) => {
    await b.open(built.index, { query: `role=${role}&user=${user}`, ...(mobile ? M : D) });
    await b.eval(`window.__mode=${JSON.stringify(mode)}`);
    await b.injectHelpers(HELP);
  };
  const tab = async (name) => { await b.eval(CLICK(name, "nav button")); await sleep(80); };

  await check("B1 desktop: as 12 abas abrem sem exceção e cada uma exibe ícones de ajuda (i)", async () => {
    await load();
    const bad = [];
    for (const t of TABS) {
      await tab(t);
      const info = await b.eval(`({h:document.querySelectorAll("main, body")[0]?document.body.querySelectorAll("button[aria-haspopup],button[aria-expanded]").length:0,cur:document.querySelector("nav [aria-current=page]")?.textContent})`);
      if (info.cur !== t || info.h < 2) bad.push(`${t}:${info.cur}/${info.h}`);
    }
    return { ok: bad.length === 0 && b.consoleErrors.length === 0, ev: `${TABS.length} abas; falhas=${bad.join("; ") || "nenhuma"}; erros de console=${b.consoleErrors.length}` };
  });

  await check("B2 teclado: Tab chega às abas, Enter troca de aba e o foco permanece visível", async () => {
    await load();
    await b.eval(`document.querySelector("nav button").focus()`);
    await b.key("Tab"); await b.key("Tab"); // pula o ícone (i) da primeira aba e foca a segunda aba
    const f = await b.eval(`document.activeElement.textContent.trim()`);
    await b.key("Enter"); await sleep(80);
    const cur = await b.eval(`document.querySelector("nav [aria-current=page]").textContent`);
    const ring = await b.eval(`(()=>{const e=document.activeElement;const cs=getComputedStyle(e);return {outline:cs.outlineStyle,shadow:cs.boxShadow!=="none"}})()`);
    return { ok: f === "Apólices" && cur === "Apólices" && (ring.outline !== "none" || ring.shadow), ev: `foco=${f}; aba atual=${cur}; anel=${JSON.stringify(ring)}` };
  });

  await check("B3 envio real inexistente: botão Enviar desabilitado, motivos de bloqueio visíveis, tentativa registrada apenas como bloqueio", async () => {
    await load();
    await tab("Minutas e acionamento");
    await b.eval(CLICK("Aviso de sinistro — AP-1", "table button")); await sleep(100);
    const st = await b.eval(`(()=>{const s=document.querySelector('[data-testid="seguros-send-disabled"]');return s?{disabled:s.disabled,aria:s.getAttribute("aria-disabled"),text:s.textContent.trim()}:null})()`);
    const reasons = await b.eval(TEXT("Nesta fase o sistema não possui transporte de envio"));
    const noSend = await b.eval(`![...document.querySelectorAll("button")].some(x=>/^enviar\\b/i.test(x.textContent.trim())&&!x.disabled)`);
    await b.eval(CLICK("Registrar tentativa de envio")); await sleep(150);
    const after = await b.eval(TEXT("Resposta do banco: enviado = não"));
    const calls = await b.eval(`JSON.stringify(window.__calls||[])`);
    return { ok: st?.disabled === true && st.aria === "true" && reasons && noSend && after && calls.includes("draft_attempt_send") && calls.replace(/draft_attempt_send/g,"").indexOf("send")<0, ev: `botão=${JSON.stringify(st)}; motivos=${reasons}; resposta=${after}; chamadas=${calls.slice(0, 80)}` };
  });

  await check("B4 conflito de versão (CASO 38): aviso claro, texto digitado preservado, botão Recarregar dados aciona o refresh", async () => {
    await load({ mode: "conflict" });
    await tab("Apólices");
    await b.eval(CLICK("AP-1", "table button")); await sleep(100);
    await b.eval(CLICK("Nova versão")); await sleep(100);
    await b.eval(`(()=>{const ta=[...document.querySelectorAll("textarea")].find(t=>t.id.endsWith("-reason"));const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set;set.call(ta,"Motivo digitado antes do conflito");ta.dispatchEvent(new Event("input",{bubbles:true}));
      const sel=[...document.querySelectorAll("select")].find(s=>s.id.endsWith("-status")&&!s.id.startsWith("seg-"));const ss=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set;ss.call(sel,"CANCELADA");sel.dispatchEvent(new Event("change",{bubbles:true}));})()`);
    await sleep(60);
    await b.eval(CLICK("Gravar nova versão")); await sleep(200);
    const msg = await b.eval(TEXT("alterado por outra pessoa"));
    const kept = await b.eval(`[...document.querySelectorAll("textarea")].some(t=>t.value==="Motivo digitado antes do conflito")`);
    await b.eval(CLICK("Recarregar dados")); await sleep(80);
    const refreshes = await b.eval(`window.__refreshes||0`);
    return { ok: msg && kept && refreshes >= 1, ev: `aviso=${msg}; texto preservado=${kept}; refresh=${refreshes}` };
  });

  await check("B5 perfil LEITURA (CASO 31): ações de escrita desabilitadas com explicação; consulta continua", async () => {
    await load({ role: "LEITURA" });
    await tab("Apólices");
    const r = await b.eval(`(()=>{const nova=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Nova apólice");return {disabled:nova?.disabled,expl:document.body.innerText.includes("Requer perfil:"),rows:document.querySelectorAll("tbody tr").length}})()`);
    return { ok: r.disabled === true && r.expl && r.rows >= 1, ev: JSON.stringify(r) };
  });

  await check("B6 celular 390 px: sem rolagem horizontal da página, abas rolam, alvos de toque >= 44 px em todas as abas", async () => {
    await load({ mobile: true });
    const bad = [];
    for (const t of TABS) {
      await tab(t);
      const o = await b.eval(`({over:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,sw:document.documentElement.scrollWidth,small:${SMALL_TARGETS}})`);
      if (o.over) bad.push(`${t}: rolagem horizontal (${o.sw}px)`);
      if (o.small.length) bad.push(`${t}: alvos pequenos ${JSON.stringify(o.small)}`);
    }
    const nav = await b.eval(`(()=>{const n=document.querySelector("nav");return {scrollable:n.scrollWidth>n.clientWidth}})()`);
    return { ok: bad.length === 0 && nav.scrollable, ev: `${bad.join(" | ") || "sem violações"}; nav rolável=${nav.scrollable}` };
  });

  await check("B7 contraste medido (fundo efetivo) em todas as abas, com formulários abertos e perfil LEITURA (estado desabilitado)", async () => {
    const fails = [];
    let measured = 0;
    for (const role of ["ADMINISTRADOR", "LEITURA"]) {
      await load({ role });
      for (const t of TABS) {
        await tab(t);
        // abre formulários da aba para medir também campos, rótulos e erros
        for (const label of ["Nova apólice", "Nova fiança", "Registrar pedido de endosso", "Registrar adiantamento", "Abrir sinistro ou evento", "Cadastrar canal"]) await b.eval(CLICK(label));
        await sleep(60);
        const c = await b.eval(CONTRAST);
        measured += c.measured;
        if (c.failCount) fails.push(`${role}/${t}: ${c.failCount} → ${JSON.stringify(c.fails.slice(0, 3))}`);
      }
    }
    return { ok: fails.length === 0, ev: `${measured} textos medidos; ${fails.length ? fails.join(" | ").slice(0, 600) : "nenhuma reprovação (4,5:1 texto; 3:1 texto grande)"}` };
  });

  await check("B9 endossos (Fase 3/C): dupla conferência visível, 1 de 2, bloqueio por independência (solicitante, emissor, já conferiu), formulário de recusa, contraste e alvos 44 px", async () => {
    const problems = [];
    const ROW = `(()=>{const tr=[...document.querySelectorAll("tbody tr")].find(r=>r.offsetParent!==null&&(r.textContent||"").includes("/ #1"));if(!tr)return false;const bt=tr.querySelector("button");if(!bt)return false;bt.click();return true;})()`;
    const BTN = (t) => `(()=>{const el=[...document.querySelectorAll("button")].find(e=>e.offsetParent!==null&&(e.textContent||"").trim()==="${t}");return el?{disabled:el.disabled}:null;})()`;
    for (const [user, expectEnabled, reasonPart] of [["704", true, ""], ["701", false, "solicitou"], ["702", false, "registrou a emissão"], ["703", false, "já conferiu"]]) {
      await load({ user });
      await tab("Endossos");
      if (!(await b.eval(ROW))) { problems.push(`${user}: linha do endosso não encontrada`); continue; }
      await sleep(80);
      for (const t of ["Conferência humana independente", "Dupla conferência exigida", "1 de 2 conferência(s) aprovada(s)"]) if (!(await b.eval(TEXT(t)))) problems.push(`${user}: falta "${t}"`);
      const btn = await b.eval(BTN("Conferir texto emitido"));
      if (!btn) problems.push(`${user}: botão Conferir ausente`);
      else if (btn.disabled === expectEnabled) problems.push(`${user}: botão Conferir disabled=${btn.disabled}, esperado ${!expectEnabled}`);
      if (reasonPart && !(await b.eval(TEXT(reasonPart)))) problems.push(`${user}: motivo do bloqueio sem "${reasonPart}"`);
      if (user === "704") {
        await b.eval(CLICK("Recusar conferência"));
        await sleep(80);
        if (!(await b.eval(TEXT("Motivo da recusa da conferência")))) problems.push("formulário de recusa não abriu");
        await b.eval(CLICK("Conferir texto emitido"));
        await sleep(60);
      }
      const c = await b.eval(CONTRAST);
      if (c.failCount) problems.push(`${user}: contraste ${c.failCount} ${JSON.stringify(c.fails.slice(0, 2))}`);
      const small = await b.eval(SMALL_TARGETS);
      if (small.length) problems.push(`${user}: alvos pequenos ${JSON.stringify(small.slice(0, 3))}`);
    }
    return { ok: problems.length === 0, ev: problems.length ? problems.join(" | ").slice(0, 600) : "4 perfis (independente, solicitante, emissor, já conferiu); sem reprovações" };
  });

  await check("B10 Fase 4/B: coerência da minuta (divergência, termos, justificativa), fundamentação da decisão do sinistro, fonte na atualização de fiança e consolidado de adiantamentos — validações na tela, contraste e alvos 44 px", async () => {
    const problems = [];
    const SET = (suffix, value, tag = "input") => `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.offsetParent!==null&&e.id.endsWith(${JSON.stringify("-" + suffix)}));if(!el)return false;const proto=${tag === "textarea" ? "HTMLTextAreaElement" : tag === "select" ? "HTMLSelectElement" : "HTMLInputElement"}.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(${tag === "select" ? '"change"' : '"input"'},{bubbles:true}));return true;})()`;
    const measure = async (where) => {
      const c = await b.eval(CONTRAST);
      if (c.failCount) problems.push(`${where}: contraste ${c.failCount} ${JSON.stringify(c.fails.slice(0, 2))}`);
      const small = await b.eval(SMALL_TARGETS);
      if (small.length) problems.push(`${where}: alvos pequenos ${JSON.stringify(small.slice(0, 3))}`);
    };
    for (const mobile of [false, true]) {
      await load({ mobile });
      const tag = mobile ? "mobile" : "desktop";
      // --- coerência da minuta ---
      await tab("Minutas e acionamento");
      await b.eval(CLICK("Aviso de sinistro — AP-1", "table button")); await sleep(100);
      for (const t of ["Coerência minuta × apólice × contrato", "Divergente — aprovação bloqueada", "Fim da vigência", "SEM justificativa", "Termos: Contrato", "Termos: Apólice", "Termos: Minuta", "Justificar divergência"]) if (!(await b.eval(TEXT(t)))) problems.push(`${tag}: falta "${t}"`);
      await b.eval(CLICK("Termos: Minuta")); await sleep(80);
      if (!(await b.eval(TEXT("Termos do instrumento: Minuta")))) problems.push(`${tag}: formulário de termos não abriu`);
      await b.eval(SET("insured_name", "Contratante Sintética SA"));
      await b.eval(CLICK("Gravar termos (nova versão)")); await sleep(120);
      if (!(await b.eval(TEXT("Informe o documento-fonte OU a referência da fonte")))) problems.push(`${tag}: termos sem fonte não foram barrados na tela`);
      await b.eval(SET("source_ref", "minuta p.1"));
      await b.eval(CLICK("Gravar termos (nova versão)")); await sleep(150);
      const calls1 = await b.eval(`JSON.stringify(window.__calls||[])`);
      if (!/"op":"terms_save"/.test(calls1) || !/"sourceKind":"MINUTA"/.test(calls1)) problems.push(`${tag}: terms_save não chamado: ${calls1.slice(0, 120)}`);
      await b.eval(CLICK("Justificar divergência")); await sleep(80);
      await b.eval(SET("field", "VIGENCIA_FIM", "select"));
      await b.eval(SET("justification", "curta", "textarea"));
      await b.eval(CLICK("Registrar justificativa")); await sleep(120);
      if (!(await b.eval(TEXT("Mínimo de 20 caracteres")))) problems.push(`${tag}: justificativa curta não foi barrada`);
      if (!(await b.eval(TEXT("A justificativa exige fonte")))) problems.push(`${tag}: justificativa sem fonte não foi barrada`);
      await measure(`${tag}/coerência`);
      await b.eval(SET("justification", "Aditivo n. 2 estendeu a vigência (carta anexa).", "textarea"));
      await b.eval(SET("source_ref", "aditivo-2"));
      await b.eval(CLICK("Registrar justificativa")); await sleep(150);
      const calls2 = await b.eval(`JSON.stringify(window.__calls||[])`);
      if (!/"op":"coherence_justify"/.test(calls2) || !/"field":"VIGENCIA_FIM"/.test(calls2)) problems.push(`${tag}: coherence_justify não chamado`);
      if (/send/.test(calls2.replace(/draft_attempt_send/g, ""))) problems.push(`${tag}: operação de envio apareceu`);
      // --- fundamentação do sinistro ---
      await tab("Sinistros e eventos");
      await b.eval(CLICK("Evento em regulação", "table button")); await sleep(100);
      await b.eval(CLICK("Avançar para: Decisão")); await sleep(100);
      if (!(await b.eval(TEXT("Fontes da fundamentação")))) problems.push(`${tag}: campo de fontes ausente`);
      await b.eval(CLICK("Registrar nova etapa")); await sleep(120);
      if (!(await b.eval(TEXT("exigem fundamentação")))) problems.push(`${tag}: decisão sem nota não foi barrada na tela`);
      await b.eval(SET("note", "Decisão da seguradora após regulação do evento", "textarea"));
      await b.eval(CLICK("Registrar nova etapa")); await sleep(120);
      if (!(await b.eval(TEXT("exige ao menos uma fonte")))) problems.push(`${tag}: decisão sem fonte não foi barrada na tela`);
      await measure(`${tag}/sinistro`);
      // --- fiança: atualização com fonte ---
      await tab("Fianças e garantias");
      await b.eval(CLICK("Atualizar", "table button")); await sleep(100);
      if (!(await b.eval(TEXT("Motivo da atualização")))) problems.push(`${tag}: formulário de atualização sem motivo`);
      await b.eval(SET("amount", "400000"));
      await b.eval(CLICK("Gravar alteração")); await sleep(120);
      if (!(await b.eval(TEXT("exige a fonte da mudança")))) problems.push(`${tag}: atualização sem fonte não foi barrada`);
      await measure(`${tag}/fiança`);
      // --- adiantamentos consolidados ---
      await tab("Adiantamentos");
      for (const t of ["Consolidado de adiantamentos (sem dupla contagem)", "Soma dos adiantamentos", "Saldo não amortizado", "Duplicidades excluídas da soma"]) if (!(await b.eval(TEXT(t)))) problems.push(`${tag}: falta "${t}"`);
      await measure(`${tag}/adiantamentos`);
    }
    if (b.consoleErrors.length) problems.push(`erros de console=${b.consoleErrors.length}`);
    return { ok: problems.length === 0, ev: problems.length ? problems.join(" | ").slice(0, 900) : "desktop e celular 390 px; sem reprovações de contraste/alvos; validações na tela e chamadas sem envio" };
  });

  await check("B8 axe-core (wcag2a/aa, 2.1, 2.2, boas práticas): sem violações sérias ou críticas nas abas principais", async () => {
    await load();
    const serious = [];
    const minor = new Set();
    for (const t of ["Painel", "Apólices", "Endossos", "Sinistros e eventos", "Minutas e acionamento", "Sujeitos e RCC"]) {
      await tab(t);
      if (t === "Apólices") await b.eval(CLICK("Nova apólice"));
      const ax = await b.runAxe();
      for (const v of ax.violations) (v.impact === "serious" || v.impact === "critical" ? serious.push(`${t}:${v.id}(${v.nodes.map((n) => n.target).join(",").slice(0, 120)})`) : minor.add(v.id));
    }
    return { ok: serious.length === 0, ev: `sérias/críticas=${serious.length}${serious.length ? " " + serious.join(" | ").slice(0, 500) : ""}; moderadas/leves=${[...minor].join(",") || "0"}` };
  });
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
