// Compatibilidade do APP ANTIGO (codigo da `main`) com o schema NOVO (pos-ondas). Docs: docs/implantacao/28.
// Logica pura (sem I/O, sem rede, sem banco): recebe o texto dos arquivos e dois catalogos (antes/depois) em JSON
// exportados por scripts/implantacao/sql/catalogo-compat.sql. Nenhum dado de tabela e lido.

const STR = String.raw`"([^"\\\n]*)"|'([^'\\\n]*)'|\x60([^\x60\\]*)\x60`;

function unq(m, i = 1) {
  return m[i] ?? m[i + 1] ?? m[i + 2] ?? null;
}

// Encontra o fechamento do par que abre em `i` (um de ( { [), ignorando strings e template literals.
export function matchClose(s, i) {
  const open = s[i];
  const close = { "(": ")", "{": "}", "[": "]" }[open];
  let depth = 0;
  for (let k = i; k < s.length; k += 1) {
    const c = s[k];
    if (c === '"' || c === "'" || c === "`") {
      k += 1;
      while (k < s.length && s[k] !== c) k += s[k] === "\\" ? 2 : 1;
      continue;
    }
    if (c === "/" && s[k + 1] === "/") { while (k < s.length && s[k] !== "\n") k += 1; continue; }
    if (c === "/" && s[k + 1] === "*") { k = s.indexOf("*/", k + 2); if (k < 0) return -1; k += 1; continue; }
    if (c === open) depth += 1;
    else if (c === close) { depth -= 1; if (depth === 0) return k; }
  }
  return -1;
}

// Chaves de nivel 1 de um literal de objeto `{ a: 1, b, "c": 2, ...x }`. Retorna {chaves, dinamico}.
export function chavesDoObjeto(texto) {
  const chaves = [];
  let dinamico = false;
  const body = texto.slice(1, -1);
  let depth = 0;
  let i = 0;
  let inicio = 0;
  const itens = [];
  while (i < body.length) {
    const c = body[i];
    if (c === '"' || c === "'" || c === "`") {
      i += 1;
      while (i < body.length && body[i] !== c) i += body[i] === "\\" ? 2 : 1;
    } else if (c === "(" || c === "{" || c === "[") depth += 1;
    else if (c === ")" || c === "}" || c === "]") depth -= 1;
    else if (c === "," && depth === 0) { itens.push(body.slice(inicio, i)); inicio = i + 1; }
    i += 1;
  }
  itens.push(body.slice(inicio));
  for (const raw of itens) {
    const it = raw.replace(/\/\/[^\n]*/g, "").trim();
    if (!it) continue;
    if (it.startsWith("...")) { dinamico = true; continue; }
    const m = it.match(/^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*(?::|\(|$)/) ;
    if (m) chaves.push(m[1] ?? m[2] ?? m[3]);
    else if (it.startsWith("[")) dinamico = true;
  }
  return { chaves, dinamico };
}

// Colunas do select do PostgREST: "a, b:c, t(x,y), alias:t2!fk(z), c::text, j->>k, *".
export function parseSelect(texto) {
  const itens = [];
  let depth = 0;
  let ini = 0;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (c === "," && depth === 0) { itens.push(texto.slice(ini, i)); ini = i + 1; }
  }
  itens.push(texto.slice(ini));
  const colunas = [];
  const embeds = [];
  for (const raw of itens) {
    const it = raw.trim();
    if (!it) continue;
    const p = it.indexOf("(");
    if (p > 0 && it.endsWith(")")) {
      let cab = it.slice(0, p).trim();
      if (cab.includes(":")) cab = cab.split(":").pop().trim();
      const rel = cab.split("!")[0].trim();
      const dentro = it.slice(p + 1, -1);
      embeds.push({ relacao: rel, ...parseSelect(dentro) });
      continue;
    }
    let nome = it;
    if (nome.includes(":") && !nome.includes("::")) nome = nome.split(":").pop().trim();
    nome = nome.split("::")[0].split("->")[0].trim();
    if (nome && nome !== "*" && /^[A-Za-z_][\w]*$/.test(nome)) colunas.push(nome);
    else if (nome === "*") colunas.push("*");
  }
  return { colunas, embeds };
}

function constantesDoArquivo(src) {
  const mapa = new Map();
  for (const m of src.matchAll(new RegExp(String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[\w<>\[\]|\s"']+)?=\s*(?:${STR})\s*(?:as const)?\s*;`, "g"))) {
    const v = m[2] ?? m[3] ?? (m[4]?.includes("${") ? null : m[4]);
    if (v != null) mapa.set(m[1], v);
  }
  return mapa;
}

// Resolve o primeiro argumento (literal ou identificador de constante do arquivo/global).
function resolverArg(src, pos, locais, globais) {
  const resto = src.slice(pos).replace(/^\s+/, "");
  const lit = resto.match(new RegExp(`^(?:${STR})`));
  if (lit) {
    const v = unq(lit);
    return { valor: v, dinamico: v.includes("${") };
  }
  const id = resto.match(/^([A-Za-z_$][\w$.]*)/);
  if (id) {
    const nome = id[1];
    if (locais.has(nome)) return { valor: locais.get(nome), dinamico: false };
    if (globais.has(nome)) return { valor: globais.get(nome), dinamico: false };
    return { valor: null, dinamico: true, expr: nome };
  }
  return { valor: null, dinamico: true, expr: "?" };
}

function argumentoApos(src, posFechaNome) {
  // posFechaNome: indice logo apos o 1o argumento; procura `, { ... }`
  const resto = src.slice(posFechaNome);
  const m = resto.match(/^\s*,\s*/);
  if (!m) return null;
  const ini = posFechaNome + m[0].length;
  const c = src[ini];
  if (c !== "{" && c !== "[") return { dinamico: true };
  const fim = matchClose(src, ini);
  if (fim < 0) return { dinamico: true };
  let objeto = src.slice(ini, fim + 1);
  if (c === "[") {
    const j = objeto.indexOf("{");
    if (j < 0) return { dinamico: true };
    const jf = matchClose(objeto, j);
    objeto = objeto.slice(j, jf + 1);
  }
  const { chaves, dinamico } = chavesDoObjeto(objeto);
  return { chaves, dinamico };
}

export function ehArquivoDeProducao(p) {
  if (!/\.(ts|tsx|mjs|js|cjs)$/.test(p)) return false;
  if (/(^|\/)(node_modules|\.next|dist)\//.test(p)) return false;
  if (/\.(test|spec)\.[tj]sx?$/.test(p) || /__tests__\//.test(p)) return false;
  const base = p.split("/").pop();
  if (/^test-/.test(base) || /^ensaio-/.test(base) || /^diagnose-/.test(base)) return false;
  if (/^scripts\/(homolog|implantacao|fixtures|data)\//.test(p)) return false;
  return /^(apps\/web\/(src|scripts|app|lib)|scripts|packages\/[^/]+\/src|supabase\/functions)\//.test(p);
}

// arquivos: { caminho: texto } -> uso
export function extrairUso(arquivos) {
  const globais = new Map();
  const locaisPor = new Map();
  for (const [p, src] of Object.entries(arquivos)) {
    const loc = constantesDoArquivo(src);
    locaisPor.set(p, loc);
    for (const [k, v] of loc) if (/^[A-Z][A-Z0-9_]+$/.test(k)) globais.set(k, v);
  }
  const rpcs = new Map();
  const tabelas = new Map();
  const dinamicos = { rpc: [], from: [] };
  const t = (nome) => {
    if (!tabelas.has(nome)) tabelas.set(nome, { arquivos: new Set(), leitura: new Set(), filtro: new Set(), insert: new Set(), update: new Set(), upsert: new Set(), escritaDinamica: false, embeds: new Set(), usaSelectAsterisco: false });
    return tabelas.get(nome);
  };
  const registrarSelect = (nome, texto, tab) => {
    if (texto.includes("${")) { tab.leituraDinamica = true; return; }
    const sel = parseSelect(texto);
    for (const c of sel.colunas) { if (c === "*") tab.usaSelectAsterisco = true; else tab.leitura.add(c); }
    const percorrer = (embeds) => {
      for (const e of embeds) {
        tab.embeds.add(e.relacao);
        const alvo = t(e.relacao);
        alvo.viaEmbedDe = alvo.viaEmbedDe ?? new Set();
        alvo.viaEmbedDe.add(nome);
        for (const c of e.colunas) if (c !== "*") alvo.leitura.add(c);
        percorrer(e.embeds);
      }
    };
    percorrer(sel.embeds);
  };

  for (const [p, src] of Object.entries(arquivos)) {
    const locais = locaisPor.get(p);
    for (const m of src.matchAll(/\.rpc\(\s*/g)) {
      const pos = m.index + m[0].length;
      const r = resolverArg(src, pos, locais, globais);
      if (r.dinamico || !r.valor) { dinamicos.rpc.push({ arquivo: p, expr: r.expr ?? "template" }); continue; }
      const consumido = src.slice(pos).match(new RegExp(`^(?:${STR})|^[A-Za-z_$][\\w$.]*`))[0].length;
      const args = argumentoApos(src, pos + consumido);
      const e = rpcs.get(r.valor) ?? { arquivos: new Set(), chavesArgs: new Set(), argsDinamicos: false, chamadas: 0 };
      e.arquivos.add(p);
      e.chamadas += 1;
      if (args?.chaves) for (const k of args.chaves) e.chavesArgs.add(k);
      if (args?.dinamico) e.argsDinamicos = true;
      rpcs.set(r.valor, e);
    }
    const froms = [...src.matchAll(/\.from\(\s*/g)];
    for (let n = 0; n < froms.length; n += 1) {
      const m = froms[n];
      const antes = src.slice(Math.max(0, m.index - 12), m.index);
      if (/storage\s*$/.test(antes)) continue; // bucket de arquivos, nao tabela
      if (/(?:^|[^\w$])(?:Array|Buffer|Uint8Array|Int8Array|Uint16Array|Uint32Array|Float32Array|Float64Array|String|Object|Number|Promise|Symbol|Date|BigInt|Readable|Blob|ArrayBuffer)\s*$/.test(antes)) continue; // API nativa, nao supabase
      const pos = m.index + m[0].length;
      const r = resolverArg(src, pos, locais, globais);
      if (r.dinamico || !r.valor) { dinamicos.from.push({ arquivo: p, expr: r.expr ?? "template" }); continue; }
      const nome = r.valor;
      const tab = t(nome);
      tab.arquivos.add(p);
      const limite = Math.min(froms[n + 1]?.index ?? src.length, pos + 2500);
      let janela = src.slice(pos, limite);
      const fimStmt = janela.search(/;\s*\n/);
      if (fimStmt > 0) janela = janela.slice(0, fimStmt);
      const prox = janela.search(/\.(rpc)\(/);
      if (prox > 0) janela = janela.slice(0, prox);
      for (const op of janela.matchAll(/\.(select|insert|update|upsert|eq|neq|gt|gte|lt|lte|like|ilike|is|in|not|order|contains|overlaps)\(\s*/g)) {
        const abre = op.index + op[0].length;
        const nomeOp = op[1];
        if (nomeOp === "select") {
          const a = resolverArg(janela, abre, locais, globais);
          if (a.valor != null) registrarSelect(nome, a.valor, tab);
          else if (!/^\s*\)/.test(janela.slice(abre))) tab.leituraDinamica = true;
        } else if (["insert", "update", "upsert"].includes(nomeOp)) {
          const ch = janela[abre];
          if (ch === "{" || ch === "[") {
            const fim = matchClose(janela, abre);
            let objeto = fim < 0 ? "{}" : janela.slice(abre, fim + 1);
            if (ch === "[") { const j = objeto.indexOf("{"); objeto = j < 0 ? "{}" : objeto.slice(j, matchClose(objeto, j) + 1); }
            const { chaves, dinamico } = chavesDoObjeto(objeto);
            for (const k of chaves) tab[nomeOp].add(k);
            if (dinamico) tab.escritaDinamica = true;
          } else tab.escritaDinamica = true;
        } else {
          const a = resolverArg(janela, abre, locais, globais);
          if (a.valor && !a.dinamico) tab.filtro.add(a.valor.split(".")[0].split("->")[0]);
        }
      }
    }
  }
  const ser = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v instanceof Set ? [...v].sort() : v]));
  return {
    rpcs: Object.fromEntries([...rpcs].sort().map(([k, v]) => [k, ser(v)])),
    tabelas: Object.fromEntries([...tabelas].sort().map(([k, v]) => [k, ser(v)])),
    dinamicos,
    arquivosAnalisados: Object.keys(arquivos).length,
  };
}

// Citacoes literais de nomes do catalogo (cobre wrappers: callRpc("nome"), tabelas via helpers).
export function mencoesLiterais(arquivos, nomes) {
  const alvo = new Set(nomes);
  const achado = {};
  for (const [p, src] of Object.entries(arquivos)) {
    for (const m of src.matchAll(/["'`]([a-z][a-z0-9_]{3,})["'`]/g)) {
      if (alvo.has(m[1])) (achado[m[1]] ??= new Set()).add(p);
    }
  }
  return Object.fromEntries(Object.entries(achado).sort().map(([k, v]) => [k, [...v].sort()]));
}

// ---------- comparacao ----------
function nomesDeArgs(f) {
  const partes = splitArgs(f.argsComDefault ?? f.args ?? "");
  return partes.map((a) => {
    const semModo = a.replace(/^(IN|OUT|INOUT|VARIADIC)\s+/i, "");
    const nome = semModo.split(/\s+/)[0];
    const temDefault = /\sDEFAULT\s/i.test(a) || /\s=\s/.test(a);
    return { nome, temDefault, saida: /^OUT\s/i.test(a) };
  });
}
function splitArgs(s) {
  const r = [];
  let d = 0;
  let ini = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "(") d += 1;
    else if (s[i] === ")") d -= 1;
    else if (s[i] === "," && d === 0) { r.push(s.slice(ini, i).trim()); ini = i + 1; }
  }
  if (s.trim()) r.push(s.slice(ini).trim());
  return r;
}

const por = (lista, chave) => {
  const m = new Map();
  for (const x of lista) { const k = chave(x); (m.get(k) ?? m.set(k, []).get(k)).push(x); }
  return m;
};

export function comparar({ antes, depois, uso, mencoes = {} }) {
  const achados = [];
  const add = (nivel, tipo, objeto, detalhe, arquivos = []) => achados.push({ nivel, tipo, objeto, detalhe, arquivos });
  const fAntes = por(antes.funcoes, (f) => f.nome);
  const fDepois = por(depois.funcoes, (f) => f.nome);
  const nomesRpc = new Set([...Object.keys(uso.rpcs), ...Object.keys(mencoes).filter((n) => fAntes.has(n) || fDepois.has(n))]);
  const resumo = { rpcsUsadas: 0, rpcsOk: 0, tabelasUsadas: 0, tabelasOk: 0 };
  for (const nome of [...nomesRpc].sort()) {
    const u = uso.rpcs[nome];
    const arquivos = u?.arquivos ?? mencoes[nome] ?? [];
    const indireta = !u;
    resumo.rpcsUsadas += 1;
    const antesF = fAntes.get(nome) ?? [];
    const depoisF = fDepois.get(nome) ?? [];
    const antesN = achados.length;
    if (!antesF.length && !depoisF.length) {
      add("ATENCAO", "rpc-inexistente-em-ambos", nome, "citada no codigo mas inexistente na producao atual e na copia pos-ondas (codigo morto ou ja quebrada)", arquivos);
    } else if (!depoisF.length) {
      add("BLOQUEANTE", "rpc-removida", nome, "existe na producao atual e nao existe apos as ondas", arquivos);
    } else {
      const assAntes = new Set(antesF.map((f) => f.args));
      const assDepois = new Set(depoisF.map((f) => f.args));
      const perdidas = [...assAntes].filter((a) => !assDepois.has(a));
      if (perdidas.length && antesF.length) add("BLOQUEANTE", "rpc-assinatura-alterada", nome, `assinatura(s) de producao ausente(s) depois: (${perdidas.join(" | ")}); depois: (${[...assDepois].join(" | ")})`, arquivos);
      // argumentos nomeados que o app envia
      if (u && !u.argsDinamicos && u.chavesArgs.length >= 0) {
        const candidatas = depoisF.filter((f) => {
          const ns = nomesDeArgs(f).filter((a) => !a.saida);
          const nomesF = new Set(ns.map((a) => a.nome));
          const obrig = ns.filter((a) => !a.temDefault).map((a) => a.nome);
          return u.chavesArgs.every((k) => nomesF.has(k)) && obrig.every((k) => u.chavesArgs.includes(k));
        });
        if (!candidatas.length) add("BLOQUEANTE", "rpc-argumentos-incompativeis", nome, `nenhuma assinatura depois aceita exatamente os argumentos enviados {${u.chavesArgs.join(", ")}}; depois: (${[...assDepois].join(" | ")})`, arquivos);
        else if (candidatas.length > 1) add("ATENCAO", "rpc-sobrecarga-ambigua", nome, `${candidatas.length} assinaturas aceitam os argumentos enviados (PostgREST pode responder PGRST203)`, arquivos);
      }
      for (const a of antesF) {
        const d = depoisF.find((f) => f.args === a.args);
        if (!d) continue;
        if (a.retorno !== d.retorno) add("ATENCAO", "rpc-retorno-alterado", nome, `retorno ${a.retorno} -> ${d.retorno}`, arquivos);
        for (const [campo, rot] of [["executaAnon", "anon"], ["executaAuthenticated", "authenticated"], ["executaServiceRole", "service_role"]]) {
          if (a[campo] && !d[campo]) add(rot === "anon" ? "ATENCAO" : "BLOQUEANTE", "rpc-execute-revogado", nome, `EXECUTE de ${rot} revogado em (${a.args})${rot === "anon" ? " (revogacao intencional de seguranca: confirmar que o app antigo nao chama sem login)" : ""}`, arquivos);
        }
        if (a.corpoMd5 && d.corpoMd5 && a.corpoMd5 !== d.corpoMd5) add("INFO", "rpc-corpo-alterado", nome, `corpo da funcao (${a.args}) alterado pelas ondas: mesma assinatura, comportamento pode diferir (guardas/autorizacao novas)`, arquivos);
        if (a.securityDefiner !== d.securityDefiner) add("ATENCAO", "rpc-security-definer-alterado", nome, `security definer ${a.securityDefiner} -> ${d.securityDefiner}`, arquivos);
      }
    }
    if (achados.length === antesN) resumo.rpcsOk += 1;
    if (indireta && achados.length > antesN) achados.slice(antesN).forEach((x) => { x.detalhe += " [citacao literal indireta]"; });
  }

  const cAntes = por(antes.colunas, (c) => c.tabela);
  const cDepois = por(depois.colunas, (c) => c.tabela);
  const pAntes = por(antes.politicas, (p) => p.tabela);
  const pDepois = por(depois.politicas, (p) => p.tabela);
  const gAntes = por(antes.grantsTabela, (g) => g.tabela);
  const gDepois = por(depois.grantsTabela, (g) => g.tabela);
  const rlsA = new Map(antes.rls.map((r) => [r.tabela, r]));
  const rlsD = new Map(depois.rls.map((r) => [r.tabela, r]));
  const gaA = por(antes.gatilhos, (g) => g.tabela);
  const gaD = por(depois.gatilhos, (g) => g.tabela);
  const rsA = por(antes.restricoes, (g) => g.tabela);
  const rsD = por(depois.restricoes, (g) => g.tabela);

  const nomesTabela = new Set([...Object.keys(uso.tabelas), ...Object.keys(mencoes).filter((n) => cAntes.has(n) || cDepois.has(n))]);
  for (const nome of [...nomesTabela].sort()) {
    const u = uso.tabelas[nome];
    const arquivos = u?.arquivos ?? mencoes[nome] ?? [];
    const indireta = !u || !u.arquivos?.length;
    const antesN = achados.length;
    const existiaAntes = cAntes.has(nome);
    const existeDepois = cDepois.has(nome);
    if (!existiaAntes && !existeDepois) {
      if (u?.arquivos?.length) add("ATENCAO", "tabela-inexistente-em-ambos", nome, "referenciada via .from() mas nao existe na producao atual nem apos as ondas (relacao de embed, bucket, view de outro schema ou codigo morto)", arquivos);
      continue;
    }
    resumo.tabelasUsadas += 1;
    if (existiaAntes && !existeDepois) { add("BLOQUEANTE", "tabela-removida", nome, "existe na producao atual e nao existe apos as ondas", arquivos); continue; }
    const colsA = new Map((cAntes.get(nome) ?? []).map((c) => [c.coluna, c]));
    const colsD = new Map((cDepois.get(nome) ?? []).map((c) => [c.coluna, c]));
    if (u) {
      const lidas = new Set([...(u.leitura ?? []), ...(u.filtro ?? [])]);
      for (const c of lidas) if (existiaAntes && colsA.has(c) && !colsD.has(c)) add("BLOQUEANTE", "coluna-removida", `${nome}.${c}`, "lida/filtrada pelo app e removida depois", arquivos);
      for (const op of ["insert", "update", "upsert"]) for (const c of u[op] ?? []) if (existiaAntes && colsA.has(c) && !colsD.has(c)) add("BLOQUEANTE", "coluna-escrita-removida", `${nome}.${c}`, `escrita (${op}) pelo app e removida depois`, arquivos);
      for (const c of new Set([...(u.leitura ?? []), ...(u.insert ?? []), ...(u.update ?? []), ...(u.upsert ?? [])])) {
        const a = colsA.get(c);
        const d = colsD.get(c);
        if (a && d && a.tipo !== d.tipo) add("ATENCAO", "coluna-tipo-alterado", `${nome}.${c}`, `${a.tipo} -> ${d.tipo}`, arquivos);
      }
      const escreve = ["insert", "upsert"].some((op) => (u[op] ?? []).length) || u.escritaDinamica;
      if (escreve) {
        const enviadas = new Set([...(u.insert ?? []), ...(u.upsert ?? [])]);
        for (const [c, d] of colsD) {
          if (!d.naoNulo || d.temDefault || d.gerada || d.identidade) continue;
          const a = colsA.get(c);
          const novoOuEndurecido = !a || !a.naoNulo;
          if (!novoOuEndurecido) continue;
          if (enviadas.has(c)) continue;
          add(u.escritaDinamica || !(u.insert?.length || u.upsert?.length) ? "ATENCAO" : "BLOQUEANTE", a ? "coluna-passou-a-not-null" : "coluna-nova-not-null-sem-default", `${nome}.${c}`, `NOT NULL sem default que o app antigo nao envia no insert${u.escritaDinamica ? " (escrita com chaves dinamicas: verificar)" : ""}`, arquivos);
        }
      }
    }
    // grants
    const gA = new Map((gAntes.get(nome) ?? []).map((g) => [g.papel, new Set(g.privilegios ?? [])]));
    const gD = new Map((gDepois.get(nome) ?? []).map((g) => [g.papel, new Set(g.privilegios ?? [])]));
    for (const [papel, privs] of gA) for (const pv of privs) if (!(gD.get(papel)?.has(pv))) add(papel === "anon" ? "ATENCAO" : "BLOQUEANTE", "grant-revogado", nome, `${pv} revogado de ${papel}`, arquivos);
    // RLS
    const ra = rlsA.get(nome);
    const rd = rlsD.get(nome);
    if (ra && rd && !ra.rls && rd.rls) add("ATENCAO", "rls-habilitada-depois", nome, "RLS passou a ficar habilitada (usuario autenticado sem politica passa a ser negado; service_role nao e afetado)", arquivos);
    const polA = new Map((pAntes.get(nome) ?? []).map((p) => [p.politica, p]));
    const polD = new Map((pDepois.get(nome) ?? []).map((p) => [p.politica, p]));
    for (const [pn, pa] of polA) {
      const pd = polD.get(pn);
      if (!pd) add("ATENCAO", "politica-removida", `${nome}:${pn}`, `politica ${pa.cmd} removida (pode ter sido substituida por outra; conferir efeito)`, arquivos);
      else if (pd.usingMd5 !== pa.usingMd5 || pd.checkMd5 !== pa.checkMd5 || pd.cmd !== pa.cmd || JSON.stringify(pd.papeis) !== JSON.stringify(pa.papeis)) add("ATENCAO", "politica-alterada", `${nome}:${pn}`, `politica ${pa.cmd} com expressao/papeis alterados (validar caso a caso)`, arquivos);
    }
    for (const [pn, pd] of polD) if (!polA.has(pn) && !pd.permissiva) add("ATENCAO", "politica-restritiva-nova", `${nome}:${pn}`, `politica RESTRICTIVE nova ${pd.cmd}: pode negar o que antes era permitido`, arquivos);
    // gatilhos e restricoes novos em tabelas que o app escreve
    const escreveT = u && ["insert", "update", "upsert"].some((op) => (u[op] ?? []).length || false) || u?.escritaDinamica;
    if (escreveT) {
      const ga = new Set((gaA.get(nome) ?? []).map((g) => g.gatilho));
      for (const g of gaD.get(nome) ?? []) if (!ga.has(g.gatilho) && g.habilitado) add("ATENCAO", "gatilho-novo-em-tabela-escrita", `${nome}:${g.gatilho}`, `gatilho novo (${g.funcao}) pode rejeitar escritas do app antigo`, arquivos);
      const rmA = new Map((rsA.get(nome) ?? []).map((r) => [r.restricao, r]));
      for (const r of rsD.get(nome) ?? []) { const ant = rmA.get(r.restricao); if (ant && ant.defMd5 !== r.defMd5) add("ATENCAO", "restricao-alterada-em-tabela-escrita", `${nome}:${r.restricao}`, "definicao da restricao alterada (conferir se so ampliou os valores aceitos)", arquivos); }
      const ra2 = new Set((rsA.get(nome) ?? []).map((r) => r.restricao));
      for (const r of rsD.get(nome) ?? []) if (!ra2.has(r.restricao) && ["c", "u", "f"].includes(r.tipo)) add("ATENCAO", "restricao-nova-em-tabela-escrita", `${nome}:${r.restricao}`, `restricao nova (${{ c: "CHECK", u: "UNIQUE", f: "FK" }[r.tipo]}) pode rejeitar escritas do app antigo`, arquivos);
    }
    if (achados.length === antesN) resumo.tabelasOk += 1;
    if (indireta && achados.length > antesN) achados.slice(antesN).forEach((x) => { x.detalhe += " [citacao literal indireta]"; });
  }
  return { resumo, achados };
}
