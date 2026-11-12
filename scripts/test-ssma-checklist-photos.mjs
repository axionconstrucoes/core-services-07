// Abertura das fotos de checklist SSMA pelo ACC (original no Storage, URL assinada, RLS do usuário).
// Uso: node scripts/test-ssma-checklist-photos.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const { resolveChecklistPhoto, checklistPhotoErrorMessage, checklistPhotoPath, CHECKLIST_PHOTO_SIGNED_URL_SECONDS } = await import(
  "../apps/web/lib/ssma/checklist-photos/resolve-checklist-photo.ts"
);
const { mapChecklistSubmission, CHECKLIST_SUBMISSIONS_LIMIT } = await import("../apps/web/lib/ssma/checklist-photos/checklist-submissions-view.ts");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; }
  catch (error) { console.log(`FAIL ${name}\n     ${error.message}`); failed += 1; }
}

const OBRA_A = "00000000-0000-4000-8000-0000000000aa";
const OBRA_B = "00000000-0000-4000-8000-0000000000bb";
const FOTO = "11111111-1111-4111-8111-111111111111";
const SUB = "22222222-2222-4222-8222-222222222222";

const row = (over = {}) => ({
  id: FOTO,
  project_id: OBRA_A,
  submission_id: SUB,
  storage_bucket: "project-documents",
  storage_path: `${OBRA_A}/ssma/${SUB}/${FOTO}-foto.jpg`,
  ssma_form_submissions: { id: SUB, project_id: OBRA_A, status: "SUBMITTED" },
  ...over,
});

// Simula a RLS: só devolve a linha se o usuário for membro da obra da foto.
function deps({ user = "u1", memberOf = [OBRA_A], photo = row(), objectExists = true } = {}) {
  const calls = { sign: [] };
  return {
    calls,
    getUserId: async () => user,
    loadPhoto: async (id) => (photo && photo.id === id && memberOf.includes(photo.project_id) ? photo : null),
    signUrl: async (bucket, path, seconds) => {
      calls.sign.push({ bucket, path, seconds });
      return objectExists ? `https://storage.example/sign/${bucket}/${path}?token=t&expires=${seconds}` : null;
    },
  };
}

console.log("\n======================================\nSSMA — fotos de checklist pelo ACC\n======================================");

await check("acesso permitido: membro da obra recebe URL assinada temporária do original", async () => {
  const d = deps();
  const out = await resolveChecklistPhoto(d, { projectId: OBRA_A, photoId: FOTO });
  assert.equal(out.status, 302);
  assert.match(out.url, /project-documents/);
  assert.equal(d.calls.sign.length, 1);
  assert.equal(d.calls.sign[0].seconds, CHECKLIST_PHOTO_SIGNED_URL_SECONDS);
  assert.ok(CHECKLIST_PHOTO_SIGNED_URL_SECONDS <= 300, "URL deve ser de curta duração");
});

await check("sem sessão => 401, sem consultar foto nem assinar", async () => {
  const d = deps({ user: null });
  const out = await resolveChecklistPhoto(d, { projectId: OBRA_A, photoId: FOTO });
  assert.equal(out.status, 401);
  assert.equal(out.reason, "SEM_SESSAO");
  assert.equal(d.calls.sign.length, 0);
});

await check("usuário sem vínculo na obra (RLS não devolve a linha) => 404 genérico", async () => {
  const d = deps({ memberOf: [OBRA_B] });
  const out = await resolveChecklistPhoto(d, { projectId: OBRA_A, photoId: FOTO });
  assert.equal(out.status, 404);
  assert.equal(out.reason, "NAO_ENCONTRADO");
  assert.equal(d.calls.sign.length, 0);
});

await check("foto de outra obra pedida pela rota desta obra => 404 (mesmo sendo membro das duas)", async () => {
  const d = deps({ memberOf: [OBRA_A, OBRA_B], photo: row({ project_id: OBRA_B, storage_path: `${OBRA_B}/ssma/${SUB}/x.jpg`, ssma_form_submissions: { id: SUB, project_id: OBRA_B, status: "SUBMITTED" } }) });
  const out = await resolveChecklistPhoto(d, { projectId: OBRA_A, photoId: FOTO });
  assert.equal(out.status, 404);
  assert.equal(out.reason, "NAO_ENCONTRADO");
  assert.equal(d.calls.sign.length, 0);
});

await check("submissão de outra obra (foto e formulário divergentes) => 404", async () => {
  const d = deps({ photo: row({ ssma_form_submissions: { id: SUB, project_id: OBRA_B, status: "SUBMITTED" } }) });
  const out = await resolveChecklistPhoto(d, { projectId: OBRA_A, photoId: FOTO });
  assert.equal(out.status, 404);
  assert.equal(d.calls.sign.length, 0);
});

await check("formulário não enviado, sem formulário ou id de formulário divergente => 404", async () => {
  for (const sub of [{ id: SUB, project_id: OBRA_A, status: "UPLOADING" }, null, { id: "outro", project_id: OBRA_A, status: "SUBMITTED" }]) {
    const d = deps({ photo: row({ ssma_form_submissions: sub }) });
    const out = await resolveChecklistPhoto(d, { projectId: OBRA_A, photoId: FOTO });
    assert.equal(out.status, 404);
    assert.equal(d.calls.sign.length, 0);
  }
});

await check("formulário embutido como array (formato alternativo do PostgREST) é aceito", async () => {
  const d = deps({ photo: row({ ssma_form_submissions: [{ id: SUB, project_id: OBRA_A, status: "SUBMITTED" }] }) });
  assert.equal((await resolveChecklistPhoto(d, { projectId: OBRA_A, photoId: FOTO })).status, 302);
});

await check("caminho do objeto fora da pasta da obra => 404 (nunca assina)", async () => {
  const d = deps({ photo: row({ storage_path: `${OBRA_B}/ssma/${SUB}/x.jpg` }) });
  const out = await resolveChecklistPhoto(d, { projectId: OBRA_A, photoId: FOTO });
  assert.equal(out.status, 404);
  assert.equal(d.calls.sign.length, 0);
});

await check("arquivo ausente no Storage => 404 'Arquivo indisponível'", async () => {
  const d = deps({ objectExists: false });
  const out = await resolveChecklistPhoto(d, { projectId: OBRA_A, photoId: FOTO });
  assert.equal(out.status, 404);
  assert.equal(out.reason, "ARQUIVO_AUSENTE");
  assert.equal(out.message, "Arquivo indisponível");
});

await check("ids malformados => 404 sem consultar", async () => {
  const d = deps();
  for (const p of [{ projectId: "x", photoId: FOTO }, { projectId: OBRA_A, photoId: "../../etc" }]) {
    assert.equal((await resolveChecklistPhoto(d, p)).status, 404);
  }
  assert.equal(d.calls.sign.length, 0);
});

await check("mensagens de tela: acesso negado × arquivo ausente", async () => {
  assert.match(checklistPhotoErrorMessage(401, "SEM_SESSAO"), /Acesso negado/);
  assert.match(checklistPhotoErrorMessage(403, null), /Acesso negado/);
  assert.equal(checklistPhotoErrorMessage(404, "ARQUIVO_AUSENTE"), "Foto indisponível (arquivo ausente)");
  assert.match(checklistPhotoErrorMessage(404, "NAO_ENCONTRADO"), /Acesso negado ou foto inexistente/);
});

await check("tela: título do checklist, só imagens, rota da própria obra, alt descritivo", async () => {
  const view = mapChecklistSubmission(
    {
      id: SUB, project_id: OBRA_A, checklist_slug: "apr", checklist_number: 4, checklist_title: "APR", occurred_at: "2026-11-06T13:43:00Z", technician_user_id: "u1",
      ssma_submission_photos: [
        { id: FOTO, action_label: "Anexar foto", original_file_name: "a.png", mime_type: "image/png" },
        { id: "33333333-3333-4333-8333-333333333333", action_label: null, original_file_name: "b.pdf", mime_type: "application/pdf" },
      ],
    },
    new Map([["u1", "Técnico"]]),
    OBRA_A
  );
  assert.equal(view.number, 4);
  assert.match(view.title, /APR/);
  assert.equal(view.technicianName, "Técnico");
  assert.equal(view.photos.length, 1);
  assert.equal(view.photos[0].url, checklistPhotoPath(OBRA_A, FOTO));
  assert.match(view.photos[0].alt, /Anexar foto — .*APR/);
  assert.ok(CHECKLIST_SUBMISSIONS_LIMIT > 0 && CHECKLIST_SUBMISSIONS_LIMIT <= 100);
});

await check("estático: rota e dados usam só a sessão do usuário, sem service_role, admin ou Google Drive", async () => {
  const files = [
    "apps/web/app/api/ssma/checklists/[projectId]/photos/[photoId]/route.ts",
    "apps/web/lib/ssma/checklist-photos/data.ts",
    "apps/web/lib/ssma/checklist-photos/resolve-checklist-photo.ts",
    "apps/web/components/ssma/checklist-photos/checklist-submissions-gallery.tsx",
  ];
  for (const file of files) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(!/createSupabaseAdminClient|@axion\/db\/admin|service_role|SUPABASE_SECRET_KEY/.test(src), `${file} não pode usar cliente administrativo`);
    assert.ok(!/googleapis|lib\/drive\/|drive_file_id|drive_sync/.test(src), `${file} não pode tocar no Google Drive`);
    assert.ok(!/\.(insert|update|upsert|delete)\(/.test(src), `${file} deve ser somente leitura`);
    assert.ok(!/getPublicUrl/.test(src), `${file} não pode gerar URL pública`);
  }
  const route = readFileSync(new URL("../apps/web/app/api/ssma/checklists/[projectId]/photos/[photoId]/route.ts", import.meta.url), "utf8");
  assert.match(route, /createSupabaseServerClient/);
  assert.match(route, /createSignedUrl/);
  assert.match(route, /private, no-store/);
  assert.ok(!/export async function (POST|PUT|PATCH|DELETE)/.test(route), "rota só responde GET");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
