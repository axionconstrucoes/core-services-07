// Servidor HTTP REAL (node:http) que imita o PostgREST do Supabase o suficiente para os testes de resiliência:
// tabelas em memória com índice único, GET com filtros eq/gte, .single() (Accept vnd.pgrst.object+json → 406 PGRST116),
// POST (insert e upsert com Prefer: resolution=merge-duplicates), PATCH com filtros, RPC de heartbeat.
// Falhas são injetadas por regras: { match(req) → bool, times, action } com action:
//   "522" | "502" | "503" | "504" | "520" | "524"  → página HTML do Cloudflare, sem tocar no estado;
//   "504-after-commit" / "522-after-commit"       → APLICA a escrita e retorna o erro (caso ambíguo real);
//   "429:<seg>" | "429-date:<seg>"                → 429 com Retry-After em segundos ou data HTTP;
//   "522-empty"                                   → 522 com corpo vazio;
//   "reset"                                       → derruba a conexão (ECONNRESET no cliente).
// Não usa rede externa. Nunca é usado fora de testes.
import http from "node:http";

export function cloudflareHtml(status) {
  const labels = { 520: "Web server is returning an unknown error", 522: "Connection timed out", 524: "A timeout occurred", 502: "Bad gateway", 503: "Service unavailable", 504: "Gateway time-out" };
  return (
    `<!DOCTYPE html>\n<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->\n<html><head>` +
    `<title>fake.supabase.co | ${status}: ${labels[status] ?? "Error"}</title><meta charset="UTF-8" /></head><body>` +
    `<div><h1>${labels[status] ?? "Error"}</h1><span>Error code ${status}</span>` +
    `<p>Contact your hosting provider letting them know your web server is not completing requests.</p>` +
    `<span>Cloudflare Ray ID: <strong class="font-semibold">a60238eaab8d3eb7</strong></span>` +
    `<span>Performance &amp; security by Cloudflare</span></div>` +
    `<script>(function(){function d(){var b=a.getElementById("cf-footer-item-ip")}})();</script></body></html>`
  );
}

export function startFakePostgrest({ tables = {}, uniqueKeys = {} } = {}) {
  const state = Object.fromEntries(Object.entries(tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  const rules = [];
  const hits = [];
  const heartbeats = [];
  let nextId = 1;

  function parseFilters(searchParams) {
    const filters = [];
    for (const [key, value] of searchParams) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
      const m = /^(eq|gte|lte|neq|in)\.(.*)$/.exec(value);
      if (m) filters.push({ col: key, op: m[1], val: m[2] });
    }
    return filters;
  }
  function matches(row, filters) {
    return filters.every(({ col, op, val }) => {
      const v = row[col] == null ? null : String(row[col]);
      if (op === "eq") return v === val;
      if (op === "neq") return v !== val;
      if (op === "gte") return v != null && v >= val;
      if (op === "lte") return v != null && v <= val;
      if (op === "in") return val.replace(/^\(|\)$/g, "").split(",").includes(v);
      return true;
    });
  }
  function uniqueViolation(table, row, ignoreRow = null) {
    const keys = uniqueKeys[table];
    if (!keys) return false;
    return (state[table] ?? []).some((r) => r !== ignoreRow && keys.every((k) => r[k] != null && String(r[k]) === String(row[k])));
  }
  function findUnique(table, row) {
    const keys = uniqueKeys[table];
    if (!keys) return null;
    return (state[table] ?? []).find((r) => keys.every((k) => String(r[k]) === String(row[k]))) ?? null;
  }

  function applyWrite(method, table, url, headers, payload) {
    state[table] ??= [];
    const prefer = String(headers.prefer ?? "");
    if (method === "POST") {
      const rows = Array.isArray(payload) ? payload : [payload];
      const upsert = /resolution=merge-duplicates/.test(prefer);
      const ignore = /resolution=ignore-duplicates/.test(prefer);
      // Atomicidade de lote, como o Postgres: valida tudo antes de gravar.
      if (!upsert && !ignore) {
        const seen = [];
        for (const row of rows) {
          if (uniqueViolation(table, row) || seen.some((s) => uniqueKeys[table]?.every((k) => String(s[k]) === String(row[k])))) {
            return { status: 409, body: { code: "23505", message: `duplicate key value violates unique constraint "${table}_unique"`, details: null, hint: null } };
          }
          seen.push(row);
        }
      }
      const written = [];
      for (const row of rows) {
        const existing = findUnique(table, row);
        if (existing && upsert) {
          Object.assign(existing, row);
          written.push(existing);
        } else if (existing && ignore) {
          continue;
        } else {
          const stored = { id: row.id ?? `row-${nextId++}`, ...row };
          state[table].push(stored);
          written.push(stored);
        }
      }
      return { status: 201, body: /return=representation/.test(prefer) ? written : null };
    }
    if (method === "PATCH") {
      const filters = parseFilters(url.searchParams);
      const target = state[table].filter((r) => matches(r, filters));
      for (const r of target) Object.assign(r, payload);
      return { status: /return=representation/.test(prefer) ? 200 : 204, body: /return=representation/.test(prefer) ? target : null };
    }
    return { status: 405, body: { message: "método não suportado" } };
  }

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://localhost");
      const hit = { method: req.method, path: url.pathname, query: url.search, headers: req.headers, body: raw };
      hits.push(hit);
      const rule = rules.find((r) => r.times > 0 && r.match(hit));
      const send = (status, body, extraHeaders = {}) => {
        const isText = typeof body === "string";
        res.writeHead(status, { "content-type": isText ? "text/html; charset=UTF-8" : "application/json; charset=utf-8", ...extraHeaders });
        res.end(body == null ? "" : isText ? body : JSON.stringify(body));
      };

      let statusAfterCommit = null;
      if (rule) {
        rule.times -= 1;
        rule.fired = (rule.fired ?? 0) + 1;
        const action = rule.action;
        if (action === "reset") return req.socket.destroy();
        if (action === "522-empty") return send(522, "");
        if (/^(502|503|504|520|522|524)$/.test(action)) return send(Number(action), cloudflareHtml(Number(action)));
        if (action.startsWith("429-date:")) {
          const secs = Number(action.split(":")[1]);
          return send(429, { message: "rate limited" }, { "retry-after": new Date(Date.now() + secs * 1000).toUTCString() });
        }
        if (action.startsWith("429:")) return send(429, { message: "rate limited" }, { "retry-after": action.split(":")[1] });
        if (/^(504|522)-after-commit$/.test(action)) statusAfterCommit = Number(action.slice(0, 3));
      }

      const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
      if (rpc) {
        if (rpc[1] === "acc_scheduler_record_heartbeat") {
          const p = JSON.parse(raw || "{}");
          // Mesma semântica da migration 20261119034721: UPDATE da linha de estado do job (idempotente).
          const row = heartbeats.find((h) => h.job === p.p_job) ?? (heartbeats.push({ job: p.p_job, updates: 0 }), heartbeats.at(-1));
          row.updates += 1;
          if (p.p_event === "started") row.last_started_run_id = p.p_run_id;
          else row.last_conclusion = p.p_conclusion;
          return statusAfterCommit ? send(statusAfterCommit, cloudflareHtml(statusAfterCommit)) : send(204, null);
        }
        return send(404, { code: "PGRST202", message: "função inexistente" });
      }

      const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
      if (!m) return send(404, { message: "rota desconhecida" });
      const table = m[1];
      if (req.method === "GET" || req.method === "HEAD") {
        const rows = (state[table] ?? []).filter((r) => matches(r, parseFilters(url.searchParams)));
        if (String(req.headers.accept ?? "").includes("vnd.pgrst.object+json")) {
          if (rows.length !== 1) return send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows`, hint: null });
          return send(200, rows[0]);
        }
        return send(200, rows);
      }
      const result = applyWrite(req.method, table, url, req.headers, raw ? JSON.parse(raw) : null);
      if (statusAfterCommit) return send(statusAfterCommit, cloudflareHtml(statusAfterCommit));
      return send(result.status, result.body);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        host: `127.0.0.1:${port}`,
        state,
        hits,
        heartbeats,
        inject(match, times, action) {
          const rule = { match, times, action };
          rules.push(rule);
          return rule;
        },
        clearRules() {
          rules.length = 0;
        },
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
      });
    });
  });
}
