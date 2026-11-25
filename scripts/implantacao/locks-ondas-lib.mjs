// Classificacao de lock e tempo das migrations das ondas, por analise ESTATICA do SQL + tamanhos reais da copia de producao.
// Docs: docs/implantacao/28. Logica pura (sem I/O). Ordem de grandeza, nao medicao: o tempo real vem do ensaio (docs/implantacao/08).

// Divide o SQL em comandos, respeitando comentarios, strings e blocos $tag$...$tag$.
export function dividirComandos(sql) {
  const out = [];
  let ini = 0;
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === "-" && d === "-") { while (i < n && sql[i] !== "\n") i += 1; continue; }
    if (c === "/" && d === "*") { const f = sql.indexOf("*/", i + 2); i = f < 0 ? n : f + 2; continue; }
    if (c === "'") { i += 1; while (i < n) { if (sql[i] === "'" && sql[i + 1] === "'") i += 2; else if (sql[i] === "'") break; else i += 1; } i += 1; continue; }
    if (c === "$") {
      const m = sql.slice(i).match(/^\$([A-Za-z_]\w*)?\$/);
      if (m) { const f = sql.indexOf(m[0], i + m[0].length); i = f < 0 ? n : f + m[0].length; continue; }
    }
    if (c === ";") { out.push(sql.slice(ini, i)); ini = i + 1; }
    i += 1;
  }
  if (sql.slice(ini).trim()) out.push(sql.slice(ini));
  return out.map(semComentarios).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function semComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const ID = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?`;
const limpa = (t) => t.replace(/"/g, "").replace(/^public\./, "");

function acoesAlterTable(resto) {
  const r = [];
  let d = 0;
  let ini = 0;
  for (let i = 0; i < resto.length; i += 1) {
    if (resto[i] === "(") d += 1;
    else if (resto[i] === ")") d -= 1;
    else if (resto[i] === "," && d === 0) { r.push(resto.slice(ini, i).trim()); ini = i + 1; }
  }
  r.push(resto.slice(ini).trim());
  return r.filter(Boolean);
}

const DEFAULT_VOLATIL = /\b(gen_random_uuid|random|uuid_generate_v4|clock_timestamp|nextval|timeofday)\s*\(/i;

// Retorna operacoes: { tipo, tabela, lock, efeito, rewrite, varre, escreve, detalhe }
export function classificarComando(cmd) {
  const ops = [];
  const low = cmd.toLowerCase();
  let m;
  if ((m = cmd.match(new RegExp(`^alter table (?:if exists )?(?:only )?(${ID})\\s+(.*)$`, "i")))) {
    const tabela = limpa(m[1]);
    for (const a of acoesAlterTable(m[2])) {
      const al = a.toLowerCase();
      const base = { tabela, lock: "ACCESS EXCLUSIVE", rewrite: false, varre: false, escreve: false };
      if (/^add column/.test(al)) {
        const def = a.match(/\bdefault\b\s+(.*?)(?:\s+(?:not null|null|references|check|unique|primary|constraint)\b|$)/i);
        const volatil = def && DEFAULT_VOLATIL.test(def[1]);
        const notnull = /\bnot null\b/i.test(a);
        ops.push({ ...base, tipo: "ADD COLUMN", rewrite: !!volatil, varre: false, detalhe: volatil ? "default volatil: reescreve a tabela" : def ? "default constante/estavel: sem reescrita (PG11+)" : "sem default: so catalogo", exigeVazia: notnull && !def });
        if (/\breferences\b/i.test(a)) ops.push({ ...base, tipo: "ADD FOREIGN KEY (coluna)", lock: "SHARE ROW EXCLUSIVE", varre: true, detalhe: "valida a FK varrendo a tabela" });
        if (/\bcheck\b/i.test(a)) ops.push({ ...base, tipo: "ADD CHECK (coluna)", varre: true, detalhe: "valida a restricao varrendo a tabela" });
      } else if (/^add constraint|^add (check|foreign|unique|primary|exclude)/.test(al)) {
        const notValid = /\bnot valid\b/i.test(a);
        let tipo = "ADD CONSTRAINT";
        let lock = "ACCESS EXCLUSIVE";
        if (/\bforeign key\b/i.test(a)) { tipo = "ADD FOREIGN KEY"; lock = "SHARE ROW EXCLUSIVE"; }
        else if (/\bunique\b|\bprimary key\b/i.test(a)) { tipo = "ADD UNIQUE/PK"; lock = "ACCESS EXCLUSIVE"; }
        else if (/\bcheck\b/i.test(a)) tipo = "ADD CHECK";
        ops.push({ ...base, tipo, lock, varre: !notValid, indice: /unique|primary/i.test(a), detalhe: notValid ? "NOT VALID: sem varredura" : "valida varrendo a tabela" });
      } else if (/^validate constraint/.test(al)) ops.push({ ...base, tipo: "VALIDATE CONSTRAINT", lock: "SHARE UPDATE EXCLUSIVE", varre: true, detalhe: "varre a tabela sem bloquear escrita" });
      else if (/^(alter column .* (set data )?type)/.test(al)) ops.push({ ...base, tipo: "ALTER COLUMN TYPE", rewrite: true, detalhe: "pode reescrever a tabela (depende do cast)" });
      else if (/^alter column .* set not null/.test(al)) ops.push({ ...base, tipo: "SET NOT NULL", varre: true, detalhe: "varre a tabela para validar" });
      else if (/^alter column .* (set|drop) default/.test(al)) ops.push({ ...base, tipo: "ALTER COLUMN DEFAULT", detalhe: "so catalogo" });
      else if (/^alter column .* drop not null/.test(al)) ops.push({ ...base, tipo: "DROP NOT NULL", detalhe: "so catalogo" });
      else if (/^drop column/.test(al)) ops.push({ ...base, tipo: "DROP COLUMN", detalhe: "so catalogo (IRREVERSIVEL: dado da coluna some)", irreversivel: true });
      else if (/^drop constraint/.test(al)) ops.push({ ...base, tipo: "DROP CONSTRAINT", detalhe: "so catalogo" });
      else if (/^(enable|disable|force|no force) /.test(al) || /row level security/.test(al)) ops.push({ ...base, tipo: "RLS/TRIGGER toggle", detalhe: "so catalogo" });
      else if (/^rename/.test(al)) ops.push({ ...base, tipo: "RENAME", detalhe: "so catalogo (quebra o app antigo se a coluna e usada)" });
      else if (/^(owner to|set schema)/.test(al)) ops.push({ ...base, tipo: "OWNER/SCHEMA", detalhe: "so catalogo" });
      else ops.push({ ...base, tipo: "ALTER TABLE (outro)", detalhe: a.slice(0, 40) });
    }
  } else if ((m = cmd.match(new RegExp(`^create (unique )?index (?:concurrently )?(?:if not exists )?(?:${ID} )?on (?:only )?(${ID})`, "i")))) {
    ops.push({ tipo: m[1] ? "CREATE UNIQUE INDEX" : "CREATE INDEX", tabela: limpa(m[2]), lock: "SHARE", rewrite: false, varre: true, escreve: false, indice: true, detalhe: "bloqueia escrita durante a construcao do indice" });
  } else if ((m = cmd.match(new RegExp(`^create (?:or replace )?(?:constraint )?trigger (?:${ID}) .*? on (${ID})`, "i")))) {
    ops.push({ tipo: "CREATE TRIGGER", tabela: limpa(m[1]), lock: "SHARE ROW EXCLUSIVE", rewrite: false, varre: false, escreve: false, detalhe: "so catalogo; passa a executar em cada escrita" });
  } else if ((m = cmd.match(new RegExp(`^(?:drop trigger (?:if exists )?${ID} on (${ID}))`, "i")))) {
    ops.push({ tipo: "DROP TRIGGER", tabela: limpa(m[1]), lock: "ACCESS EXCLUSIVE", detalhe: "so catalogo" });
  } else if ((m = cmd.match(new RegExp(`^(?:create|alter|drop) policy (?:if exists )?(?:${ID}|"[^"]+") on (${ID})`, "i")))) {
    ops.push({ tipo: "POLICY", tabela: limpa(m[1]), lock: "ACCESS EXCLUSIVE", detalhe: "so catalogo (RLS: mudanca de acesso, nao de dados)" });
  } else if ((m = cmd.match(new RegExp(`^update (?:only )?(${ID})`, "i")))) {
    ops.push({ tipo: "UPDATE", tabela: limpa(m[1]), lock: "ROW EXCLUSIVE", rewrite: false, varre: true, escreve: true, detalhe: /\bwhere\b/i.test(cmd) ? "com WHERE" : "SEM WHERE: toca todas as linhas" });
  } else if ((m = cmd.match(new RegExp(`^delete from (?:only )?(${ID})`, "i")))) {
    ops.push({ tipo: "DELETE", tabela: limpa(m[1]), lock: "ROW EXCLUSIVE", varre: true, escreve: true, detalhe: /\bwhere\b/i.test(cmd) ? "com WHERE (destrutivo)" : "SEM WHERE (destrutivo)", irreversivel: true });
  } else if ((m = cmd.match(new RegExp(`^insert into (${ID})`, "i")))) {
    ops.push({ tipo: /\bselect\b/i.test(cmd) ? "INSERT..SELECT" : "INSERT", tabela: limpa(m[1]), lock: "ROW EXCLUSIVE", varre: /\bselect\b/i.test(cmd), escreve: true, detalhe: /\bon conflict\b/i.test(cmd) ? "com ON CONFLICT (idempotente)" : "insercao" });
  } else if ((m = cmd.match(new RegExp(`^truncate (?:table )?(?:only )?(${ID})`, "i")))) {
    ops.push({ tipo: "TRUNCATE", tabela: limpa(m[1]), lock: "ACCESS EXCLUSIVE", escreve: true, detalhe: "destrutivo", irreversivel: true });
  } else if ((m = cmd.match(new RegExp(`^drop table (?:if exists )?(${ID})`, "i")))) {
    ops.push({ tipo: "DROP TABLE", tabela: limpa(m[1]), lock: "ACCESS EXCLUSIVE", detalhe: "IRREVERSIVEL", irreversivel: true });
  } else if ((m = cmd.match(new RegExp(`^(grant|revoke) .* on (?:table )?(${ID})(?: .*)?$`, "i"))) && !/\bon (function|schema|sequence|all|type)\b/i.test(cmd)) {
    ops.push({ tipo: m[1].toUpperCase() + " (tabela)", tabela: limpa(m[2]), lock: "ACCESS EXCLUSIVE", detalhe: "so catalogo" });
  } else if (/^do\b/i.test(cmd)) {
    const corpo = cmd.replace(/^do\s+(?:language \w+\s+)?/i, "");
    if (/\b(update|delete from|insert into|alter table|create (unique )?index|execute|drop|truncate|grant|revoke)\b/i.test(corpo)) ops.push({ tipo: "DO (bloco anonimo com DML/DDL)", tabela: null, lock: "variavel", detalhe: "SQL dinamico/escrita dentro do bloco: revisar manualmente" });
    else ops.push({ tipo: "DO (so verificacao)", tabela: null, lock: "nenhum", detalhe: "bloco de checagem (if/raise), sem escrita" });
  } else if ((m = cmd.match(new RegExp(`^drop (function|view|type|index|policy|schema|column)`, "i")))) {
    ops.push({ tipo: `DROP ${m[1].toUpperCase()}`, tabela: null, lock: "catalogo", detalhe: m[1].toLowerCase() === "function" ? "pode quebrar app antigo se a funcao e chamada" : "so catalogo", irreversivel: /^(schema)$/i.test(m[1]) });
  } else if (/^select (cron\.|pg_)/i.test(cmd) || /^select (public\.)?[\w.]+\(/i.test(cmd)) {
    ops.push({ tipo: "SELECT funcao()", tabela: null, lock: "variavel", detalhe: "chamada de funcao no migration (ex.: cron.schedule): conferir" });
  }
  return ops;
}

// tamanhos: [{esquema, tabela, linhas, bytesTotal, bytesTabela}]; existentes: Set de nomes (public.*) existentes na producao.
export function analisarMigration(nome, sql, { tamanhos, existentes }) {
  const porNome = new Map(tamanhos.filter((t) => t.esquema === "public").map((t) => [t.tabela, t]));
  const criadasAqui = new Set();
  const itens = [];
  for (const cmd of dividirComandos(sql)) {
    const mc = cmd.match(new RegExp(`^create (?:unlogged )?table (?:if not exists )?(${ID})`, "i"));
    if (mc) { criadasAqui.add(limpa(mc[1])); continue; }
    for (const op of classificarComando(cmd)) {
      const t = op.tabela ? porNome.get(op.tabela) : null;
      const nova = op.tabela ? (criadasAqui.has(op.tabela) || !existentes.has(op.tabela)) : false;
      const item = { ...op, migration: nome, nova, linhas: t?.linhas ?? 0, bytes: t?.bytesTotal ?? 0 };
      if (op.tipo.startsWith("DO (bloco")) {
        // SQL dinamico: o alvo real nao e analisavel; usa as tabelas EXISTENTES citadas por nome no bloco como limite superior.
        const citadas = [...new Set(cmd.toLowerCase().match(/[a-z_][a-z0-9_]{2,}/g) ?? [])].filter((w) => existentes.has(w) && porNome.has(w));
        item.alvosPorNome = citadas.sort();
        item.linhas = Math.max(0, ...citadas.map((w) => porNome.get(w).linhas));
        item.bytes = Math.max(0, ...citadas.map((w) => porNome.get(w).bytesTotal));
        item.limiteSuperior = true;
      }
      itens.push(item);
    }
  }
  return itens;
}

// Risco por operacao. Limiares sobre o tamanho REAL (copia de producao):
//   tabela nova/vazia -> BAIXO; so catalogo -> BAIXO; varre/indexa/atualiza/reescreve tabela existente com dados:
//   BAIXO ate 10 MB e 10 mil linhas, MEDIO ate 200 MB, ALTO acima.
export function classificarRisco(item) {
  if (item.limiteSuperior) return item.bytes / 1048576 <= 10 && item.linhas <= 10000 ? "BAIXO" : item.bytes / 1048576 > 200 ? "ALTO" : "MEDIO";
  if (item.nova || !item.tabela) return item.tipo.startsWith("SELECT") ? "REVISAR" : "BAIXO";
  const mb = item.bytes / 1048576;
  const trabalho = item.varre || item.rewrite || item.escreve || item.indice;
  if (!trabalho || item.linhas === 0) return "BAIXO";
  if (mb <= 10 && item.linhas <= 10000) return "BAIXO";
  return mb > 200 ? "ALTO" : "MEDIO";
}

// Estimativa grosseira (ordem de grandeza) do tempo com o lock segurado: varredura ~50 MB/s, indice ~20 MB/s, reescrita ~20 MB/s; piso 10 ms.
export function estimarSegundos(item) {
  if (item.nova || !item.tabela || !item.bytes) return 0.01;
  const mb = item.bytes / 1048576;
  const taxa = item.rewrite || item.indice ? 20 : item.varre || item.escreve ? 50 : 1e6;
  return Math.max(0.01, mb / taxa);
}
