// Garante que as classes copiadas para a fixture de contraste do navegador (scripts/fixtures/help-browser/entry.tsx, cena #contrast)
// continuam IDÊNTICAS às dos arquivos de módulo; se alguém mudar a classe no módulo, este teste falha e a medição do Chrome
// deixa de valer até a fixture ser atualizada. Também confirma que o HelpHint expõe a área de toque expandida (>= 44 px no celular).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFileSync(path.join(root, p), "utf8");
const fixture = rd("scripts/fixtures/help-browser/entry.tsx");
const web = "apps/web/components/";
const pairs = [
  [web + "assistant/vera-trigger.tsx", "hover:bg-black/10 focus-visible:!outline-black"],
  [web + "assistant/vera-trigger.tsx", "text-black group-hover:text-black group-focus-visible:text-black"],
  [web + "integrations/construmanager-version-impact-form.tsx", "text-neutral-700 hover:text-black focus-visible:text-black"],
  [web + "integrations/construmanager-version-impact-form.tsx", "mt-2 grid gap-2 rounded-md border border-amber-300 bg-white p-3 text-xs text-black"],
  [web + "legal/delete-legal-consultation-button.tsx", "min-h-9 rounded-md bg-[#ff6b57] px-2.5 py-1 text-xs font-semibold text-black disabled:opacity-60"],
  [web + "projects/copy-structure-wizard.tsx", "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-[#b42318]"],
  [web + "projects/copy-structure-wizard.tsx", "border-black/10 bg-white/95 text-[#0f172a] shadow-xl"],
  [web + "projects/create-project-form.tsx", "placeholder:text-[#475569]"],
  [web + "projects/edit-project-form.tsx", "border-[#374151] bg-[#ffffff] text-[#000000] shadow-none placeholder:text-[#4b5563] [color-scheme:light] focus-visible:border-[#7f1d1d] focus-visible:ring-2 focus-visible:ring-[#7f1d1d]"],
  [web + "projects/edit-project-form.tsx", "!border-[#000000] bg-transparent text-[#000000] hover:bg-black/10 hover:text-[#000000] focus-visible:ring-2 focus-visible:ring-[#000000]"],
  [web + "projects/edit-project-form.tsx", "bg-[#7f1d1d] text-[#ffffff] hover:bg-[#681717] hover:text-[#ffffff] focus-visible:ring-2 focus-visible:ring-[#000000]"],
  [web + "projects/edit-project-form.tsx", "border-[#6b7280] bg-[#A8ADB5] text-[#000000] shadow-xl"],
  [web + "projects/edit-project-form.tsx", "text-[#000000] hover:text-[#000000] focus-visible:text-[#000000]"],
];
let fail = 0;
for (const [file, cls] of pairs) {
  const inSource = rd(file).includes(cls);
  const inFixture = fixture.includes(cls);
  if (!inSource || !inFixture) { fail += 1; console.log(`FAIL ${file}: "${cls.slice(0, 70)}..." fonte=${inSource} fixture=${inFixture}`); }
}
// área de toque expandida
const hint = rd(web + "shared/help-hint.tsx");
const touchOk = hint.includes("max-sm:after:size-11") && hint.includes("pointer-coarse:after:size-11") && hint.includes('hitArea === "vertical"');
if (!touchOk) { fail += 1; console.log("FAIL help-hint.tsx perdeu a área de toque expandida (44 px)"); }
const side = rd(web + "layout/app-sidebar.tsx");
if (!side.includes('hitArea="vertical"') || !side.includes("m-0 text-white/85")) { fail += 1; console.log("FAIL app-sidebar.tsx perdeu o (i) sem margem negativa / hitArea vertical"); }
console.log(`${fail ? "FALHOU" : "OK"}: ${pairs.length} trechos de classe sincronizados entre fixture e módulos; área de toque do HelpHint e da sidebar preservadas.`);
process.exit(fail ? 1 : 0);
