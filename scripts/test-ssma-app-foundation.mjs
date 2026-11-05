import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const { SSMA_CHECKLISTS } = await import("../apps/web/lib/ssma/checklist-definitions.ts");

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const definitions = read("apps/web/lib/ssma/checklist-definitions.ts");
const app = read("apps/web/components/ssma/ssma-field-app.tsx");
const page = read("apps/web/app/ssma/[projectId]/page.tsx");
const manifest = read("apps/web/app/manifest.ts");
const esgPage = read("apps/web/app/[projectId]/esg/page.tsx");
const rootLayout = read("apps/web/app/layout.tsx");
const pwaRegistration = read("apps/web/components/pwa-registration.tsx");
const serviceWorker = read("apps/web/public/sw.js");
const chrome = read("apps/web/components/ssma/ssma-chrome.tsx");

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(message);
}

// Comportamento das definições reais (sem contagem fixa de telas: novas telas não quebram o teste).
const N = SSMA_CHECKLISTS.length;
assert(N >= 11, "Devem existir ao menos as 11 telas originais");
assert(SSMA_CHECKLISTS.every((d, i) => d.number === i + 1), "Numeração das telas deve ser única e consecutiva de 1 a N");
assert(new Set(SSMA_CHECKLISTS.map((d) => d.slug)).size === N, "Slugs devem ser únicos");
assert(SSMA_CHECKLISTS.every((d) => typeof d.driveFolder === "string" && d.driveFolder.trim().length > 0), "Toda tela deve ter pasta do Drive");
assert(new Set(SSMA_CHECKLISTS.map((d) => d.driveFolder)).size === N, "Pastas do Drive devem ser únicas");
assert(
  SSMA_CHECKLISTS.every((d) => d.title && d.shortTitle && d.checks.length > 0 && d.photoActions.length > 0 && Array.isArray(d.fields)),
  "Toda tela deve ter título, itens de checklist, ações de foto e campos"
);
assert(
  SSMA_CHECKLISTS.every((d) => new Set(d.fields.map((f) => f.id)).size === d.fields.length && new Set(d.checks).size === d.checks.length),
  "Campos e itens de checklist não podem se repetir dentro da tela"
);
assert(
  SSMA_CHECKLISTS.every((d) => d.fields.every((f) => f.type !== "select" || (f.options?.length ?? 0) > 0)),
  "Todo campo select deve ter opções"
);
assert(
  SSMA_CHECKLISTS.every((d) => (d.requiredPhotoActions ?? []).every((a) => d.photoActions.includes(a))),
  "Ações de foto obrigatórias devem existir entre as ações da tela"
);
const remessa = SSMA_CHECKLISTS.find((d) => d.slug === "remessa-bota-fora");
assert(remessa, "Remessa deve existir");
assert(remessa.independent === true, "Remessa deve ser independente");
assert(remessa.driveFolder === "07 - REMESSAS PARA BOTA-FORA", "Remessa deve preservar a pasta real do Drive");
const ocorrencia = SSMA_CHECKLISTS.find((d) => d.slug === "ocorrencia-acidente");
assert(ocorrencia && ocorrencia.independent === true, "Ocorrência / acidente deve existir e ser independente");
const afastamento = ocorrencia.fields.find((f) => f.id === "afastamento");
assert(
  afastamento?.type === "select" && afastamento.required === true && JSON.stringify(afastamento.options) === JSON.stringify(["Sem afastamento", "Com afastamento"]),
  "Ocorrência deve ter o campo obrigatório de afastamento com exatamente Sem/Com afastamento"
);
assert(
  JSON.stringify(ocorrencia.requiredPhotoActions) === JSON.stringify(["Foto do local", "Foto da remoção"]),
  "Ocorrência deve exigir foto do local e da remoção"
);
assert(definitions.includes('type SsmaChecklistState = "FEITO" | "NA"'), "Estados devem ser somente Feito e NA");
assert(!definitions.toLowerCase().includes("justificativa"), "NA não deve exigir justificativa");
// O cabeçalho (logo, centralização, bordô) vive em ssma-chrome.tsx (SsmaHeader).
assert(chrome.includes('src="/branding/acc-logo.png"'), "Deve usar o logo ACC oficial");
assert(chrome.includes("items-center") && chrome.includes("min-h-24") && chrome.includes("text-center"), "Logo deve ficar centralizado verticalmente e o título centralizado no cabeçalho");
assert(chrome.includes('bg-[#7f1d1d]'), "Cabeçalho deve usar bordô institucional");
assert(app.includes('checked={checks[check] === value}'), "Feito e NA devem ser mutuamente exclusivos");
assert(app.includes("definition.checks.every"), "Todos os itens devem ser respondidos antes do envio");
assert(app.includes("!allChecksAnswered"), "Envio deve ficar bloqueado com checklist incompleto");
assert(app.includes("Carregado automaticamente do cadastro da obra"), "Técnico deve ser automático");
assert(page.includes("getProjectMembers(projectId)"), "Técnico deve vir do cadastro real do projeto");
assert(page.includes('member.status === "ACTIVE"'), "Somente membro ativo pode acessar");
assert(page.includes("buildEsgSsmaProjectFolderName"), "Nome da obra deve seguir o padrão aprovado");
assert(manifest.includes('display: "standalone"'), "Aplicativo deve ser instalável");
assert(manifest.includes('theme_color: "#7f1d1d"'), "Manifest deve usar a cor institucional");
assert(rootLayout.includes("<PwaRegistration />"), "Layout deve registrar o aplicativo instalável");
assert(pwaRegistration.includes('register("/sw.js")'), "Service worker deve ser registrado");
// O fetch handler existe só para a casca offline e estáticos versionados (comportamento real: test-ssma-service-worker.mjs).
assert(serviceWorker.includes('addEventListener("fetch"'), "Service worker deve tratar a casca offline");
assert(!/\/api\//.test(serviceWorker.replace(/\/\*[\s\S]*?\*\//, "").replace(/\/\/.*$/gm, "")) && !serviceWorker.includes("supabase"), "Service worker não deve referenciar rotas de API nem Supabase");
assert(serviceWorker.includes('request.method !== "GET"') && serviceWorker.includes("/_next/static/") && serviceWorker.includes("SHELL_URL"), "Cache restrito a GET de estáticos versionados e à casca offline");
assert(!/cache\.(?:put|add)\([^)]*\/ssma\/(?!offline)/.test(serviceWorker), "Páginas autenticadas com dados não devem ser guardadas em cache");
assert(esgPage.includes("/ssma/${projectId}"), "Módulo ESG deve oferecer acesso ao aplicativo");
assert(definitions.includes('value: "MEDIA", label: "Médio", className: "bg-[#2563EB] text-white"'), "Médio deve ser azul");
assert(definitions.includes('value: "ALTA", label: "Alto", className: "bg-[#FFD600] text-black"'), "Alto deve ser amarelo");
assert(app.includes('type="file"') && app.includes('name="photos"'), "Formulários devem permitir selecionar fotos");
assert(app.includes("multiple"), "Seleção de fotos deve aceitar múltiplos arquivos");
assert(app.includes('accept="image/jpeg,image/png,.jpg,.jpeg,.png"'), "Upload deve aceitar somente JPG e PNG");
assert(app.includes("MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024"), "Cada foto deve ser limitada a 15 MB");
assert(app.includes("MAX_PHOTOS_PER_FORM = 20"), "Cada formulário deve aceitar no máximo 20 fotos");
assert(app.includes("URL.createObjectURL(file)"), "Fotos devem ter pré-visualização local");
assert(app.includes("URL.revokeObjectURL"), "Pré-visualizações devem liberar memória do navegador");
assert(app.includes("removePhoto(photo.id)"), "Usuário deve poder remover uma foto antes do envio");
assert(app.includes("Selecionar fotos do computador"), "Desktop deve ter ação explícita para escolher fotos");
assert(app.includes("file.lastModified"), "Fotos repetidas devem ser detectadas na seleção");
assert(app.includes("action: selectedActionRef.current"), "Foto deve preservar a ação correspondente, como antes/depois");

console.log(`${checks} verificações, 0 falhas`);
