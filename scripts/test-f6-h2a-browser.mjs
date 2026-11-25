// FASE 6 / H2a — HARNESS de navegador REAL (Chrome headless via CDP) das telas de Competências e de Aprovações externas.
// ROTULO: FIXTURE. Monta as páginas REAIS (competencias/page.tsx e aprovacoes-externas/page.tsx), as server actions REAIS, o catálogo de
// Hover Text REAL e o CSS REAL com um cliente Supabase FALSO e dados SINTÉTICOS (scripts/fixtures/governanca-browser). NÃO há login, rede,
// Supabase nem e-mail: isto NÃO é homologação autenticada (as 36 linhas do roteiro seguem sob responsabilidade de H1). Prova: renderização por
// papel, alvos >= 44 px, contraste AA (medido + axe), Hover Text, ausência de overflow no celular e os PARÂMETROS que cada formulário envia à RPC.
// Uso: node scripts/test-f6-h2a-browser.mjs [--require-chrome]   (HELP_BROWSER_OUT=<dir> para as capturas)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixture } from "./lib/browser-harness-build.mjs";
import { chromeAvailable, CHROME, sleep, withBrowser } from "./lib/browser-harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(here, "fixtures", "governanca-browser");
const HELP = path.join(here, "fixtures", "help-browser", "page-helpers.js");
const args = new Set(process.argv.slice(2));

if (!chromeAvailable()) {
  console.log(`SKIP: Chrome não encontrado em "${CHROME}" (defina CHROME_PATH). Nenhuma verificação de navegador foi executada.`);
  process.exit(args.has("--require-chrome") ? 2 : 0);
}
const sibling = path.resolve(here, "..", "..", "axion-backups", "homologacao", "browser", "h2a");
const OUT = process.env.HELP_BROWSER_OUT ?? (existsSync(path.dirname(path.dirname(sibling))) ? sibling : path.join(tmpdir(), "acc-h2a-browser-out"));
mkdirSync(OUT, { recursive: true });

const results = [];
function record(name, ok, evidence) {
  results.push({ name, ok, evidence });
  console.log(`${ok ? "OK  " : "FAIL"} [FIXTURE] ${name}${evidence ? ` :: ${evidence}` : ""}`);
}
async function check(name, fn) {
  try {
    const r = await fn();
    record(name, r.ok, r.ev);
  } catch (e) {
    record(name, false, `exceção: ${String(e?.message ?? e).slice(0, 300)}`);
  }
}

const work = mkdtempSync(path.join(tmpdir(), "acc-h2a-fixture-"));
const built = await buildFixture({
  entry: path.join(FX, "entry.tsx"),
  html: readFileSync(path.join(FX, "index.template.html"), "utf8"),
  fixtureCss: readFileSync(path.join(FX, "fixture.css"), "utf8"),
  outDir: work,
  stubs: {
    "next/link": path.join(FX, "stubs", "next-link.tsx"),
    "next/navigation": path.join(FX, "stubs", "next-navigation.ts"),
    "@axion/db/server": path.join(FX, "stubs", "axion-db-server.ts"),
    "@/lib/permissions/project-tier-server": path.join(FX, "stubs", "project-tier-server.ts"),
    "@/lib/governance/external-send-binding": path.join(FX, "stubs", "external-send-binding.ts"),
    "./external-send-binding": path.join(FX, "stubs", "external-send-binding.ts"),
  },
});
console.log(`fixture: ${built.modules} módulos, bundle ${Math.round(built.jsBytes / 1024)} KB, css ${Math.round(built.cssBytes / 1024)} KB; ausentes: ${built.missing.length ? built.missing.join(", ") : "nenhum"}`);

const P = "10000000-0000-4000-8000-0000000000f1";
const D = { width: 1280, height: 900 };
const M = { width: 390, height: 844, mobile: true };

try {
  await withBrowser(async (b) => {
    const load = async (scene, opts = D, query = "") => {
      await b.open(built.index, { hash: `#${scene}`, query, ...opts });
      await b.injectHelpers(HELP);
    };
    const text = () => b.eval("document.body.innerText");
    const count = (sel) => b.eval(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
    const has = async (re) => re.test(await text());
    const btnTexts = () => b.eval("[...document.querySelectorAll('button')].map(x=>x.innerText.trim()).filter(Boolean)");
    // preenche campos de um formulário (inputs/selects/textareas não controlados), marca caixas e envia pelo botão indicado
    const fillAndSubmit = (formSel, values, submitText, checks = []) => b.eval(`(()=>{
      const forms=[...document.querySelectorAll('form')].filter(f=>(${JSON.stringify(formSel)}==='*'||f.querySelector(${JSON.stringify(formSel)}))&&[...f.querySelectorAll('button[type=submit]')].some(x=>x.innerText.trim().startsWith(${JSON.stringify(submitText)})));
      const f=forms[0]; if(!f) return 'sem-formulario';
      const set=(el,v)=>{ el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
      for(const [n,v] of Object.entries(${JSON.stringify(values)})){ const el=f.querySelector('[name="'+n+'"]'); if(!el) return 'campo-ausente:'+n; set(el,v); }
      for(const n of ${JSON.stringify(checks)}){ const el=f.querySelector('[name="'+n+'"]'); if(!el) return 'check-ausente:'+n; el.checked=true; }
      window.__rpc=[]; window.__redirects=[];
      const btn=[...f.querySelectorAll('button[type=submit]')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(submitText)}));
      if(!btn) return 'botao-ausente';
      f.requestSubmit(btn); return 'ok'; })()`);
    const settle = async () => { for (let i = 0; i < 40; i += 1) { if ((await b.eval("(window.__redirects||[]).length>0")) === true) break; await sleep(100); } await sleep(150); };
    const rpcs = () => b.eval("JSON.stringify(window.__rpc||[])").then((x) => JSON.parse(x));
    const redirects = () => b.eval("JSON.stringify(window.__redirects||[])").then((x) => JSON.parse(x));

    // ---------- 1. Renderização por papel ----------
    await check("R1 Competências (ADMIN): estados, revalidação pendente, solicitações, validadores, trilha; sem poder revalidar o que ele mesmo concedeu", async () => {
      await load("comp-admin");
      const t = await text();
      const must = ["Competências", "Como a competência passa a valer", "Aguarda revalidação", "Sem validação de habilitação", "Revalidação pendente (1)", "Solicitações (2)", "Solicitar competência (administrador)", "Validadores designados (2)", "Trilha de governança", "Você não pode revalidar esta competência", "Cancelar solicitação", "Revogar designação"];
      const missing = must.filter((m) => !t.includes(m));
      const noValidate = !(await btnTexts()).some((x) => x.startsWith("Validar habilitação")); // Ana solicitou: não valida a própria solicitação
      const noRevalidate = !(await btnTexts()).some((x) => x.startsWith("Revalidar competência")); // Ana concedeu c1: não revalida
      await b.screenshot(path.join(OUT, "comp-admin-desktop.png"));
      return { ok: missing.length === 0 && noValidate && noRevalidate, ev: `faltando: ${missing.join("; ") || "nada"}; sem validar a própria solicitação: ${noValidate}; sem revalidar o que concedeu: ${noRevalidate}` };
    });
    await check("R2 Competências (validador designado): vê Validar e Revalidar; NÃO vê Solicitar competência nem Designar validador", async () => {
      await load("comp-validador");
      const bt = await btnTexts();
      const t = await text();
      return { ok: bt.some((x) => x.startsWith("Validar habilitação")) && bt.some((x) => x.startsWith("Revalidar competência")) && !t.includes("Solicitar competência (administrador)") && !bt.some((x) => x.startsWith("Designar validador")) && !bt.some((x) => x.startsWith("Revogar designação")), ev: `botões: ${bt.filter((x) => /Valid|Revog|Design|Cancel|Registrar/.test(x)).join(" | ")}` };
    });
    await check("R3 Competências (designado aguardando aceite): vê 'Aceitar designação'; (leitura sem alçada): sem formulários de decisão e sem trilha", async () => {
      await load("comp-proposto");
      const a = (await btnTexts()).some((x) => x.startsWith("Aceitar designação"));
      await load("comp-leitura");
      const t = await text();
      const bt = await btnTexts();
      const none = !bt.some((x) => /^(Validar|Recusar|Revalidar|Designar|Revogar|Cancelar solicitação|Registrar)/.test(x));
      return { ok: a && none && t.includes("Você não valida esta solicitação") && t.includes("Sem eventos visíveis"), ev: `aceitar: ${a}; sem ações de decisão: ${none}` };
    });
    await check("R4 Aprovações (GESTOR): decide a preparação comum; minuta de Seguros exige ADMINISTRADOR (sem botão); hash que diverge desabilita Aprovar", async () => {
      await load("aprov-gestor");
      const t = await text();
      const dis = await b.eval("[...document.querySelectorAll('button')].filter(x=>x.innerText.trim().startsWith('Aprovar')).map(x=>x.disabled)");
      await b.screenshot(path.join(OUT, "aprov-gestor-desktop.png"));
      const ok = t.includes("Aguardando decisão (3)") && t.includes("Você não decide esta preparação: ela exige ADMINISTRADOR") && t.includes("confere com o conteúdo") && t.includes("DIVERGE do conteúdo") && dis.length === 2 && dis.filter(Boolean).length === 1;
      return { ok, ev: `botões Aprovar (desabilitado?): ${JSON.stringify(dis)}` };
    });
    await check("R5 Aprovações: ADMIN aprova a minuta de Seguros; COLABORADOR prepara mas não decide; LEITURA recebe 404", async () => {
      await load("aprov-admin");
      const adminApprove = (await btnTexts()).filter((x) => x.startsWith("Aprovar")).length;
      await load("aprov-colab");
      const t = await text();
      const bt = await btnTexts();
      await load("aprov-leitura");
      const nf = await b.eval("window.__notFound===true");
      return { ok: adminApprove === 3 && t.includes("Preparar envio externo") && !bt.some((x) => x.startsWith("Aprovar")) && bt.some((x) => x.startsWith("Cancelar preparação")) && nf, ev: `ADMIN vê ${adminApprove} botões Aprovar; colaborador sem Aprovar; 404 para LEITURA: ${nf}` };
    });

    // ---------- 2. Envio dos formulários: parâmetros que chegam à RPC ----------
    await check("F1 Solicitar competência (ADMIN): RPC project_competence_request_create com pessoa, competência e evidência; sucesso redireciona com ?ok=solicitada", async () => {
      await load("comp-admin");
      const U3 = "00000000-0000-4000-8000-0000000000a3";
      const D1 = "20000000-0000-4000-8000-000000000001";
      const r = await fillAndSubmit("[name=competence]", { userId: U3, competence: "SEGUROS", evidenceDocumentId: D1, registrationKind: "OAB", registrationNumber: "SINT-1" }, "Registrar solicitação");
      await settle();
      const c = (await rpcs())[0];
      const red = (await redirects())[0];
      const ok = r === "ok" && c?.fn === "project_competence_request_create" && c.args.p_user_id === U3 && c.args.p_competence === "SEGUROS" && c.args.p_data?.evidence_document_id === D1 && c.args.p_data?.registration_kind === "OAB" && red === `/${P}/competencias?ok=solicitada`;
      return { ok, ev: `${r}; ${JSON.stringify(c)}; ${red}` };
    });
    await check("F2 Designar validador: ID de perfil externo prevalece sobre o membro escolhido; prazo limitado a 180 dias no próprio campo", async () => {
      await load("comp-admin");
      const EXT = "00000000-0000-4000-8000-0000000000b9";
      const lim = await b.eval("(()=>{const i=document.querySelector('input[name=validUntil][max]');return i?Math.round((new Date(i.max)-new Date(i.min))/864e5):-1})()");
      const until = await b.eval("document.querySelector('input[name=validUntil][max]').max");
      const r = await fillAndSubmit("[name=designationDocumentId]", { externalUserId: EXT, designationDocumentId: "20000000-0000-4000-8000-000000000002", reason: "Ata da diretoria designa validador independente.", validUntil: until }, "Designar validador");
      await settle();
      const c = (await rpcs())[0];
      return { ok: lim === 180 && r === "ok" && c?.fn === "project_competence_validator_designate" && c.args.p_user_id === EXT && c.args.p_valid_until === until, ev: `prazo máx ${lim} dias; ${r}; ${JSON.stringify(c)}` };
    });
    await check("F3 Validador designado: Validar envia APPROVE com a nota, a versão e a evidência conferida; Revalidar envia project_competence_revalidate", async () => {
      await load("comp-validador");
      const note = "Diploma e registro conferidos no documento anexado.";
      const r1 = await fillAndSubmit("[name=evidenceChecked]", { note }, "Validar habilitação", ["evidenceChecked"]);
      await settle();
      const c1 = (await rpcs())[0];
      await load("comp-validador");
      const r2 = await b.eval(`(()=>{const f=[...document.querySelectorAll('form')].find(f=>[...f.querySelectorAll('button')].some(x=>x.innerText.trim().startsWith('Revalidar competência')));
        if(!f) return 'sem-form'; const n=f.querySelector('[name=note]'); n.value=${JSON.stringify(note)}; f.querySelector('[name=evidenceChecked]').checked=true;
        window.__rpc=[]; window.__redirects=[]; f.requestSubmit([...f.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Revalidar competência'))); return 'ok'; })()`);
      await settle();
      const c2 = (await rpcs())[0];
      const ok = r1 === "ok" && c1?.fn === "project_competence_request_decide" && c1.args.p_decision === "APPROVE" && c1.args.p_evidence_checked === true && c1.args.p_note === note && c1.args.p_expected_row_version === 1
        && r2 === "ok" && c2?.fn === "project_competence_revalidate" && c2.args.p_evidence_checked === true && c2.args.p_expected_row_version === 1;
      return { ok, ev: `${JSON.stringify(c1)} || ${JSON.stringify(c2)}` };
    });
    await check("F4 Preparar envio (COLABORADOR): o hash enviado == SHA-256 do Node sobre o JSON canônico; destinatários normalizados; anexos ordenados; nenhuma RPC de consumo/envio", async () => {
      await load("aprov-colab");
      const subject = "Minuta de apólice";
      const body = "Linha 1\r\nLinha 2 com acento: ação, coração.";
      const r = await fillAndSubmit("[name=recipients]", { context: "SEGUROS_MINUTA", action: "ENVIO_NOVO", version: "v2", recipients: "B@Seguradora-Sintetica.com.br\ninterno@axion.com.br", subject, body, attachments: "z.pdf\na.pdf" }, "Preparar");
      await settle();
      const calls = await rpcs();
      const c = calls[0];
      const canonical = JSON.stringify({ subject, body: body.replace(/\r\n/g, "\n").trim(), attachments: ["a.pdf", "z.pdf"] });
      const nodeHash = createHash("sha256").update(canonical, "utf8").digest("hex");
      const ok = r === "ok" && calls.length === 1 && c.fn === "acc_external_send_prepare_with_content" && c.args.p_content_hash === nodeHash && JSON.stringify(c.args.p_recipients) === JSON.stringify(["b@seguradora-sintetica.com.br", "interno@axion.com.br"])
        && JSON.stringify(c.args.p_attachments) === JSON.stringify(["a.pdf", "z.pdf"]) && c.args.p_content_version === "v2" && !calls.some((x) => /consume|send_mail|gmail/i.test(x.fn));
      return { ok, ev: `hash navegador ${c?.args?.p_content_hash?.slice(0, 16)}… x Node ${nodeHash.slice(0, 16)}…; ${calls.length} RPC` };
    });
    await check("F5 Decidir (GESTOR): Aprovar envia APPROVE com motivo; Recusar envia REJECT; Cancelar envia acc_external_send_cancel; nunca consome a autorização", async () => {
      const run = async (btn, reason) => {
        await load("aprov-gestor");
        const r = await b.eval(`(()=>{const f=[...document.querySelectorAll('form')].find(f=>f.querySelector('[name=externalCount]')&&[...f.querySelectorAll('button')].some(x=>x.innerText.trim().startsWith('Aprovar')&&!x.disabled));
          if(!f) return 'sem-form'; f.querySelector('[name=reason]').value=${JSON.stringify(reason)}; window.__rpc=[]; window.__redirects=[];
          f.requestSubmit([...f.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(btn)}))); return 'ok'; })()`);
        await settle();
        return { r, c: (await rpcs())[0], red: (await redirects())[0] };
      };
      const a = await run("Aprovar", "Cliente pediu retorno formal por escrito.");
      const x = await run("Recusar", "Texto incompleto, refazer a mensagem.");
      const c = await run("Cancelar", "Preparador desistiu do envio externo.");
      const ok = a.c?.fn === "acc_external_send_decide" && a.c.args.p_decision === "APPROVE" && a.red === `/${P}/aprovacoes-externas?ok=aprovada`
        && x.c?.args.p_decision === "REJECT" && x.red.endsWith("?ok=recusada") && c.c?.fn === "acc_external_send_cancel" && c.red.endsWith("?ok=cancelada");
      return { ok, ev: `${JSON.stringify(a.c)} | ${JSON.stringify(x.c)} | ${JSON.stringify(c.c)}` };
    });
    await check("F6 Erro de RPC: a mensagem vem do catálogo (código na URL), nunca texto de SQL; ?erro= desconhecido mostra mensagem genérica", async () => {
      await load("comp-admin", D, "erro=INDEPENDENT_VALIDATOR_REQUIRED");
      const t1 = await text();
      await load("comp-admin", D, "erro=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
      const t2 = await text();
      const injected = await b.eval("document.querySelectorAll('script:not([src])').length");
      return { ok: t1.includes("pessoa independente") && t2.includes("Não foi possível concluir a ação") && !t2.includes("<script>") && injected === 0, ev: "mensagens conferidas" };
    });

    // ---------- 3. Alvos, contraste, Hover Text, overflow ----------
    const scenes = ["comp-admin", "comp-validador", "comp-proposto", "comp-leitura", "aprov-gestor", "aprov-colab", "aprov-admin"];
    await check("A1 alvos >= 44 px: todo botão de envio, campo, seleção e caixa de marcação (pela etiqueta) das telas", async () => {
      const bad = [];
      let total = 0;
      for (const s of scenes) {
        await load(s);
        const r = await b.eval(`(()=>{const out=[];const els=[...document.querySelectorAll('form button[type=submit], form input:not([type=hidden]):not([type=checkbox]), form select, form textarea, form input[type=checkbox]')];
          for(const e of els){ const t=e.type==='checkbox'?e.closest('label'):e; const r=t.getBoundingClientRect(); if(r.width===0&&r.height===0) continue; out.push({k:(e.name||e.innerText||e.tagName).toString().slice(0,30),h:Math.round(r.height*10)/10,w:Math.round(r.width)}); } return out; })()`);
        total += r.length;
        for (const e of r) if (e.h < 43.5 || (e.w < 44)) bad.push(`${s}:${e.k} ${e.w}x${e.h}`);
      }
      return { ok: bad.length === 0 && total > 20, ev: `${total} controles medidos em ${scenes.length} cenas; abaixo de 44 px: ${bad.slice(0, 6).join(", ") || "nenhum"}` };
    });
    await check("A2 contraste AA medido: todo texto visível >= 4,5:1 (3:1 para texto grande) nas 7 cenas", async () => {
      const worst = [];
      let measured = 0;
      for (const s of scenes) {
        await load(s);
        const r = await b.eval(`(()=>{const out=[];const seen=new Set();const w=document.createTreeWalker(document.getElementById('root'),NodeFilter.SHOW_TEXT);
          for(let n=w.nextNode();n;n=w.nextNode()){ if(!n.textContent.trim()) continue; const el=n.parentElement; if(seen.has(el)) continue; seen.add(el);
            const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) continue; const m=__t.measureText(el); const large=m.size>=24||(m.size>=18.66&&Number(m.weight)>=700);
            out.push({ratio:m.ratio,need:large?3:4.5,t:m.text,fg:m.fg,bg:m.bg,image:m.image}); } return out; })()`);
        measured += r.length;
        for (const e of r) if (!e.image && e.ratio < e.need) worst.push(`${s}:"${e.t}" ${e.ratio.toFixed(2)} (${e.fg} sobre ${e.bg})`);
      }
      return { ok: worst.length === 0 && measured > 150, ev: `${measured} textos medidos; abaixo do mínimo: ${worst.slice(0, 5).join(" | ") || "nenhum"}` };
    });
    await check("A3 axe-core (WCAG 2.2 AA + boas práticas) sem violações sérias/críticas nas 7 cenas", async () => {
      const found = [];
      let all = 0;
      const ids = new Set();
      for (const s of scenes) {
        await load(s);
        const r = await b.runAxe();
        all += r.violations.length;
        for (const v of r.violations) ids.add(`${v.id}/${v.impact}`);
        for (const v of r.violations) if (v.impact === "serious" || v.impact === "critical") found.push(`${s}:${v.id}(${v.nodes.map((n) => n.target).join(",").slice(0, 80)})`);
      }
      return { ok: found.length === 0, ev: `violações sérias/críticas: ${found.slice(0, 6).join(" | ") || "nenhuma"}; total de violações de qualquer impacto: ${all} (${[...ids].join(", ")})` };
    });
    await check("A4 Hover Text: o ícone (i) de cada tela abre o painel do catálogo real (governanca.*) e ele fecha com Esc", async () => {
      const seen = [];
      for (const s of ["comp-admin", "aprov-gestor"]) {
        await load(s);
        const r = await b.eval("(()=>{const e=document.querySelector('button[aria-label^=\"Informações sobre\"]');return __t.rectOf(e)})()");
        await b.move(r.cx, r.cy);
        await sleep(600);
        const id = await b.eval("document.querySelector('[role=dialog][data-help-id]')?.getAttribute('data-help-id')||''");
        seen.push(id);
        await b.key("Escape");
        await sleep(250);
        seen.push(String(await count("[role=dialog][data-help-id]")));
      }
      return { ok: seen[0].startsWith("governanca.competencias.") && seen[2].startsWith("governanca.aprovacoes.") && seen[1] === "0" && seen[3] === "0", ev: seen.join(" | ") };
    });
    await check("A5 celular (390 px): sem rolagem horizontal da página nas 7 cenas; capturas", async () => {
      const over = [];
      for (const s of scenes) {
        await load(s, M);
        const w = await b.eval("({sw:document.documentElement.scrollWidth,iw:window.innerWidth})");
        if (w.sw > w.iw + 1) over.push(`${s} ${w.sw}>${w.iw}`);
        if (s === "comp-admin" || s === "aprov-gestor") await b.screenshot(path.join(OUT, `${s}-celular.png`));
      }
      return { ok: over.length === 0, ev: `overflow: ${over.join(", ") || "nenhum"}` };
    });
    await check("Z1 sem exceções de página/console (além do notFound proposital)", async () => {
      await load("comp-admin");
      await load("aprov-gestor");
      const errs = b.consoleErrors.filter((e) => !/NEXT_NOT_FOUND/.test(String(e)));
      return { ok: errs.length === 0, ev: errs.slice(0, 3).join(" | ") || "nenhum" };
    });
  }, { timeoutMs: 280000 });
} finally {
  rmSync(work, { recursive: true, force: true });
}

const fail = results.filter((r) => !r.ok);
writeFileSync(path.join(OUT, "resultados-h2a-browser.json"), JSON.stringify({ label: "FIXTURE (dados sintéticos, cliente Supabase falso; não é homologação autenticada)", ranAt: new Date().toISOString(), ok: results.length - fail.length, fail: fail.length, results }, null, 2));
console.log(`\nResultado [FIXTURE]: ${results.length - fail.length} OK, ${fail.length} FAIL, total ${results.length}. Capturas e relatório: ${OUT}`);
if (fail.length) console.log(`Falhas:\n${fail.map((f) => ` - ${f.name}`).join("\n")}`);
process.exit(fail.length ? 1 : 0);
