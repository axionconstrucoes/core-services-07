// O resumo semanal NAO inclui acoes de origem SSMA_CORRECTIVE_ACTION.
// Motivos: (1) "Resolvido" no resumo tenta concluir a acao pelo modulo Acoes, o que o guard SSMA recusa (SSMA_ACTION_COMPLETE_VIA_SSMA) e
// reverte o resumo INTEIRO; (2) o resumo e um canal de e-mail automatico e as notificacoes automaticas SSMA estao desativadas no piloto;
// (3) a descricao do item e texto livre do tecnico de campo.
// Uso: node scripts/test-weekly-digest-origem-ssma.mjs
// Parte A: estatica (le o codigo do cron). Parte B: PGlite descartavel, dados sinteticos, sem rede.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
let passed = 0, failed = 0;
async function check(name, fn) { try { await fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).slice(0, 220)}`); failed += 1; } }
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

console.log("\n======================================\nRESUMO SEMANAL x ACOES DE ORIGEM SSMA\n======================================");

// ---------- A) estatica ----------
const digest = readFileSync(path.join(root, "apps/web/lib/email/run-weekly-alert-digests.ts"), "utf8");
const batches = readFileSync(path.join(root, "apps/web/lib/email/run-contract-alert-batches.ts"), "utf8");
await check("A1) o resumo semanal exclui a origem SSMA_CORRECTIVE_ACTION na consulta de sla_actions", () => {
  ok(/\.neq\(\s*"origin"\s*,\s*"SSMA_CORRECTIVE_ACTION"\s*\)/.test(digest), 'falta .neq("origin", "SSMA_CORRECTIVE_ACTION") em run-weekly-alert-digests.ts');
});
await check("A2) os demais filtros do resumo permanecem (risco medio/baixo, responsavel, sem evento, nao concluidas)", () => {
  ok(/\.in\("risk_level", \["MEDIUM", "LOW"\]\)/.test(digest), "filtro de risco");
  ok(/\.not\("responsible_user_id", "is", null\)/.test(digest), "responsavel obrigatorio");
  ok(/\.is\("related_event_id", null\)/.test(digest), "sem evento");
  ok(/\.not\("status", "in", "\(COMPLETED,CANCELLED\)"\)/.test(digest), "somente abertas");
});
await check("A3) lotes de contrato seguem restritos a acoes com evento (acoes SSMA nunca entram)", () => {
  ok(/\.not\("related_event_id", "is", null\)/.test(batches), "lotes exigem related_event_id");
});

// ---------- B) PGlite ----------
const dir = path.join(root, "supabase", "migrations");
const LAST = "20261106110000_ssma_esg_evidence_reference.sql";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().filter((f) => f <= LAST);
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const clean = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "");
const db = new PGlite(); await db.exec(PLATFORM); for (const f of files) await db.exec(clean(f));
const q = async (s, p) => (await db.query(s, p)).rows;
const as = async (uid, fn) => { await db.exec(`select set_config('app.uid','${uid}',false); select set_config('app.role','authenticated',false); set role authenticated;`); try { return await fn(); } finally { await db.exec("reset role;"); } };
const err = async (p) => { try { await p; return null; } catch (e) { return String(e.message); } };
const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const P1 = "10000000-0000-4000-8000-000000000001";
for (const n of [1, 2]) { await db.query("insert into auth.users (id,email) values ($1,$2)", [id(n), `u${n}@exemplo.invalid`]); await db.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict do nothing", [id(n), `u${n}`, `u${n}@exemplo.invalid`]); }
await db.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra 1','O1','C','L','2026-01-01','2027-01-01')", [P1]);
await db.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'ADMINISTRADOR','ACTIVE'),($1,$3,'COLABORADOR','ACTIVE')", [P1, id(1), id(2)]);
const submit = (risk, cat) => as(id(1), () => q("select public.ssma_field_record_submit($1,$2,$3,'OCORRENCIA',$4,'descricao','Bloco A',now(),now(),$5,$6,'2026-12-31') i", [id(1), crypto.randomUUID(), P1, cat, risk, id(2)]));
await submit("MEDIA", "EPI"); await submit("BAIXA", "Sinalização"); await submit("ALTA", "Ato inseguro");
await db.query("insert into public.sla_actions (project_id,origin,title,risk_level,area,responsible_user_id,assume_due_at,complete_due_at,created_by_type,created_by_user_id) values ($1,'MANUAL','Acao comum medio','MEDIUM','ADMINISTRATIVO',$2,now()+interval '1 day',now()+interval '5 days','USER',$3)", [P1, id(2), id(1)]);
// o mesmo conjunto de filtros do cron, com e sem a proposta
const BASE = "from public.sla_actions a where a.risk_level in ('MEDIUM','LOW') and a.responsible_user_id is not null and a.related_event_id is null and a.status not in ('COMPLETED','CANCELLED')";
await check("B1) SEM o filtro de origem, as acoes SSMA de risco medio/baixo entrariam na selecao do resumo (motivo da correcao)", async () => {
  const rows = await q(`select a.origin ${BASE}`);
  eq(rows.filter((r) => r.origin === "SSMA_CORRECTIVE_ACTION").length, 2, "acoes SSMA selecionadas hoje");
});
await check("B2) COM o filtro de origem: so a acao comum e selecionada (a SSMA de risco ALTA ja ficava fora pelo filtro de risco)", async () => {
  const rows = await q(`select a.origin ${BASE} and a.origin <> 'SSMA_CORRECTIVE_ACTION'`);
  eq(rows.map((r) => r.origin), ["MANUAL"], "selecao com a exclusao de origem");
});
await check("B3) acoes comuns continuam podendo ser respondidas com RESOLVIDO no resumo (comportamento preservado)", async () => {
  const comum = (await q("select id from public.sla_actions where origin='MANUAL'"))[0].id;
  const d = (await q("insert into public.weekly_alert_digests (project_id,recipient_user_id,week_date,status,intended_recipient_email,sent_at) values ($1,$2,'2026-11-02','SENT','u2@exemplo.invalid',now()) returning id", [P1, id(2)]))[0].id;
  await db.query("insert into public.weekly_alert_digest_items (digest_id,action_id,position,risk_level,title_snapshot) values ($1,$2,1,'MEDIUM','Acao comum medio')", [d, comum]);
  const e = await err(as(id(2), () => q("select public.submit_weekly_alert_digest($1,$2::jsonb)", [d, JSON.stringify([{ actionId: comum, resolution: "RESOLVED" }])])));
  ok(!e, `resposta recusada: ${e}`);
  eq((await q("select status from public.sla_actions where id=$1", [comum]))[0].status, "COMPLETED", "acao comum concluida");
});
await check("B4) documenta o motivo: RESOLVIDO sobre acao SSMA e recusado pelo guard e reverte o resumo inteiro", async () => {
  const ssma = (await q("select id from public.sla_actions where origin='SSMA_CORRECTIVE_ACTION' and risk_level='MEDIUM'"))[0].id;
  const d = (await q("insert into public.weekly_alert_digests (project_id,recipient_user_id,week_date,status,intended_recipient_email,sent_at) values ($1,$2,'2026-11-09','SENT','u2@exemplo.invalid',now()) returning id", [P1, id(2)]))[0].id;
  await db.query("insert into public.weekly_alert_digest_items (digest_id,action_id,position,risk_level,title_snapshot) values ($1,$2,1,'MEDIUM','Acao SSMA')", [d, ssma]);
  const e = await err(as(id(2), () => q("select public.submit_weekly_alert_digest($1,$2::jsonb)", [d, JSON.stringify([{ actionId: ssma, resolution: "RESOLVED" }])])));
  ok(/SSMA_ACTION_COMPLETE_VIA_SSMA/.test(e ?? ""), `esperado o guard recusar: ${e}`);
  eq((await q("select status from public.weekly_alert_digests where id=$1", [d]))[0].status, "SENT", "resumo segue SENT (nada gravado)");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
