// Cliente CDP para testes de navegador do HelpHint: Chrome headless com perfil temporário, mouse/teclado/toque reais (Input.*),
// capturas e injeção do axe-core. Estende (em arquivo novo) o padrão de scripts/lib/cdp-chrome.mjs.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEYS = {
  Tab: { key: "Tab", code: "Tab", vk: 9 },
  Enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
  Space: { key: " ", code: "Space", vk: 32, text: " " },
  Escape: { key: "Escape", code: "Escape", vk: 27 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  PageDown: { key: "PageDown", code: "PageDown", vk: 34 },
};

// O pid inicial do Chrome pode não ser o processo real (launcher/crashpad/GPU filhos): encerra TODOS os processos cujo
// comando contém o perfil temporário (e só eles; o Chrome pessoal do usuário não é tocado).
function killByProfile(profile) {
  const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(profile)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try { spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "ignore", timeout: 20000 }); } catch { /* noop */ }
}

export function chromeAvailable() {
  return existsSync(CHROME);
}

export async function withBrowser(fn, { timeoutMs = 300000 } = {}) {
  const port = 9500 + Math.floor(Math.random() * 400);
  const profile = mkdtempSync(path.join(tmpdir(), "acc-help-browser-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb",
      "--disable-extensions", "--no-first-run", `--remote-debugging-port=${port}`, "--remote-allow-origins=*",
      `--user-data-dir=${profile}`, "about:blank",
    ],
    { stdio: "ignore" }
  );
  let ws;
  const cleanup = () => {
    try { ws?.close(); } catch { /* noop */ }
    killByProfile(profile);
    try { proc.kill(); } catch { /* noop */ }
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* perfil residual em tmp */ }
  };
  const timer = setTimeout(() => {
    console.error(`TIMEOUT global (${timeoutMs} ms): encerrando o Chrome.`);
    cleanup();
    process.exit(124);
  }, timeoutMs);
  try {
    let page;
    let lastError = "sem resposta";
    for (let i = 0; i < 150 && !page; i += 1) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        page = Array.isArray(targets) ? targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl) : undefined;
      } catch (e) {
        lastError = String(e?.message ?? e);
      }
      if (!page) await sleep(200);
    }
    if (!page) throw new Error(`Chrome não expôs a página de depuração (${lastError})`);
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    const consoleErrors = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method === "Runtime.exceptionThrown") {
        consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? "exceção");
      } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        consoleErrors.push(msg.params.args?.map((a) => a.value ?? a.description).join(" "));
      }
    };
    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const myId = ++id;
        pending.set(myId, (msg) => (msg.error ? rej(new Error(`${method}: ${JSON.stringify(msg.error)}`)) : res(msg.result)));
        ws.send(JSON.stringify({ id: myId, method, params }));
      });
    await send("Page.enable");
    await send("Runtime.enable");
    let nav = 0;
    let axeSource = null;
    const api = {
      consoleErrors,
      async open(file, { hash = "", query = "", width = 1280, height = 800, mobile = false } = {}) {
        await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
        await send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 1 } : { enabled: false });
        await send("Page.navigate", { url: "about:blank" });
        await sleep(60);
        await send("Page.navigate", { url: `${pathToFileURL(file).href}?n=${++nav}${query ? `&${query}` : ""}${hash}` });
        for (let i = 0; i < 100; i += 1) {
          if ((await api.eval("window.__ready === true").catch(() => false)) === true) break;
          await sleep(100);
        }
        if (!(await api.eval("window.__ready === true"))) throw new Error("fixture não ficou pronta");
        await api.eval("document.fonts ? document.fonts.ready.then(()=>true) : true");
        consoleErrors.length = 0;
      },
      async resize(width, height, mobile = false) {
        await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
        await sleep(150);
      },
      async eval(expr) {
        const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
        return r.result.value;
      },
      async move(x, y) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); },
      async mouseDown(x, y) { await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 }); },
      async mouseUp(x, y) { await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 }); },
      async click(x, y) { await api.move(x, y); await api.mouseDown(x, y); await api.mouseUp(x, y); },
      async wheel(x, y, deltaY) { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY }); },
      async key(name, { shift = false } = {}) {
        const k = KEYS[name];
        if (!k) throw new Error(`tecla desconhecida ${name}`);
        const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers: shift ? 8 : 0 };
        await send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", ...base, ...(k.text ? { text: k.text } : {}) });
        await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      },
      async touchStart(x, y) { await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }); },
      async touchEnd() { await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); },
      async tap(x, y) { await api.touchStart(x, y); await sleep(40); await api.touchEnd(); },
      async swipeUp(x, y, distance) {
        await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        const steps = 12;
        for (let i = 1; i <= steps; i += 1) {
          await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - (distance * i) / steps }] });
          await sleep(16);
        }
        await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      },
      async screenshotPng() {
        const r = await send("Page.captureScreenshot", { format: "png" });
        return Buffer.from(r.data, "base64");
      },
      async screenshot(out) {
        const b = await api.screenshotPng();
        writeFileSync(out, b);
        return b;
      },
      async injectHelpers(file) { await api.eval(readFileSync(file, "utf8")); },
      async runAxe() {
        if (!axeSource) axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
        if (!(await api.eval("typeof window.axe === 'object'"))) await api.eval(axeSource);
        return api.eval(`axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete']})
          .then(r=>({version:axe.version,
            violations:r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.slice(0,4).map(n=>({target:n.target.join(' '),summary:(n.failureSummary||'').slice(0,240)}))})),
            incomplete:r.incomplete.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length})),passes:r.passes.length}))`);
      },
    };
    return await fn(api);
  } finally {
    clearTimeout(timer);
    try { ws?.close(); } catch { /* noop */ }
    killByProfile(profile);
    await sleep(800); // o Chrome libera os arquivos do perfil só depois de encerrar
    cleanup();
  }
}
