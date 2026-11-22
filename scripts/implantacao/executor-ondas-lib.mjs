// Biblioteca do EXECUTOR DE ONDAS (Fase 2, frente A) - opção (b) de docs/implantacao/11 e plano 12, seção 2.
// Funções puras + orquestração com transporte injetável. Nada aqui lê segredo, abre rede ou banco por conta própria:
// o transporte (HTTP da API de gerenciamento ou adaptador local de PostgreSQL) é passado por quem chama.
//
// Corpo enviado por arquivo (UMA chamada = UMA transação implícita; fatos comprovados na homologação, ver docs/implantacao/16):
//   set local lock_timeout = '5s';
//   set local statement_timeout = '120s';
//   <conteúdo do arquivo de supabase/migrations, lido do disco, sem transcrição>
//   ;
//   insert into supabase_migrations.schema_migrations (version, name) values ('<versão>', '<nome>');
// Depois de CADA arquivo: chamada somente leitura que confere P0 e a linha no histórico. Depois de CADA onda: hash do histórico.
// Para na primeira falha. Nunca usa a CLI nem a ferramenta de migration do conector.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export const P0_MD5 = "930f6d75898793479b418950b0053bd9";
export const HOTFIX_STEM = "20261121090000_hotfix_risk_alert_action_authorization";
export const LOCK_TIMEOUT = "5s";
export const STATEMENT_TIMEOUT = "120s";
// A documentação não publica limite de corpo; o conector recusa ~2 MB. Margem conservadora: 1 MB (maior migration: ~65 KB).
export const MAX_CORPO_BYTES = 1024 * 1024;
export const API_BASE = "https://api.supabase.com";

// Alvos permitidos. O operacional só com --producao + confirmação digitada (ver confirmarProducao).
export const ALVOS = Object.freeze({
  homolog: Object.freeze({ ref: "gtadbeaevxglrqkhcwfz", nome: "acc-homolog (homologação)", producao: false }),
  operacional: Object.freeze({ ref: "plbcvwostmdmdmrziwmd", nome: "ACC operacional (PRODUÇÃO)", producao: true }),
});

export class ExecutorErro extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

// ------------------------------------------------------------------ redação de segredos
const PADROES_SEGREDO = [
  /\bsbp_[A-Za-z0-9]{8,}\b/g, // token de acesso pessoal do Supabase
  /\bsbp_oauth_[A-Za-z0-9]{8,}\b/g,
  /\bsb_secret_[A-Za-z0-9_-]{8,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, // JWT
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /(postgres(?:ql)?:\/\/[^\s:@/]+:)[^\s@]+@/gi,
];
export function redigir(texto, segredos = []) {
  let t = String(texto ?? "");
  for (const s of segredos) {
    if (typeof s === "string" && s.length >= 6) t = t.split(s).join("[REDIGIDO]");
  }
  for (const re of PADROES_SEGREDO) {
    t = t.replace(re, (m, prefixo) => (typeof prefixo === "string" && /^(Bearer\s+|postgres)/i.test(prefixo) ? `${prefixo}[REDIGIDO]${m.endsWith("@") ? "@" : ""}` : "[REDIGIDO]"));
  }
  return t;
}

// ------------------------------------------------------------------ alvo
export function resolverAlvo({ ref, producao = false }) {
  const entrada = Object.values(ALVOS).find((a) => a.ref === ref);
  if (!entrada) throw new ExecutorErro("ALVO_NAO_PERMITIDO", `alvo ${JSON.stringify(ref)} fora da lista de refs permitidos (${Object.values(ALVOS).map((a) => a.ref).join(", ")})`);
  if (entrada.producao && !producao) throw new ExecutorErro("PRODUCAO_SEM_FLAG", `alvo ${ref} é o operacional: exige --producao explícito e confirmação digitada`);
  if (!entrada.producao && producao) throw new ExecutorErro("FLAG_PRODUCAO_INDEVIDA", `--producao informado para um alvo que não é o operacional (${ref})`);
  return entrada;
}

export function frasePrConfirmacao(alvo, plano) {
  return `APLICAR ${alvo.ref} ${plano.ondas.map((o) => o.id).join(",")}`;
}
// confirmar: função assíncrona que recebe a frase esperada e devolve o texto digitado pelo responsável.
export async function confirmarProducao(alvo, plano, confirmar) {
  if (!alvo.producao) return true;
  if (typeof confirmar !== "function") throw new ExecutorErro("PRODUCAO_SEM_CONFIRMACAO", "operacional exige confirmação digitada");
  const esperado = frasePrConfirmacao(alvo, plano);
  const digitado = String((await confirmar(esperado)) ?? "").trim();
  if (digitado !== esperado) throw new ExecutorErro("PRODUCAO_CONFIRMACAO_INVALIDA", "confirmação digitada não confere; nada foi executado");
  return true;
}

// ------------------------------------------------------------------ arquivos e plano
const STEM_RE = /^(\d{14})_([a-z0-9_]+)$/;
export function separarStem(stem) {
  const m = STEM_RE.exec(stem);
  if (!m) throw new ExecutorErro("NOME_INVALIDO", `nome de migration inválido: ${stem}`);
  return { version: m[1], name: m[2] };
}

// Comandos que não podem estar no arquivo: quebrariam a transação única (BEGIN/COMMIT/ROLLBACK próprios, CONCURRENTLY, VACUUM)
// ou mudariam os limites definidos pelo executor. Linhas de comentário são ignoradas; corpo de função plpgsql usa "end;" (permitido).
const PROIBIDOS_NO_ARQUIVO = [
  [/^\s*(begin|start\s+transaction)\s*(transaction|work)?\s*;/im, "BEGIN/START TRANSACTION próprio"],
  [/^\s*(commit|rollback|abort)\s*(transaction|work)?\s*;/im, "COMMIT/ROLLBACK próprio"],
  [/\bconcurrently\b/i, "CONCURRENTLY (não roda em transação)"],
  [/^\s*vacuum\b/im, "VACUUM (não roda em transação)"],
  [/^\s*(set|reset)\s+(session\s+)?(lock_timeout|statement_timeout)\b/im, "altera lock_timeout/statement_timeout"],
  [/^\s*supabase_migrations\b|\bsupabase_migrations\.schema_migrations\b/i, "escreve no histórico por conta própria"],
];
export function semComentarios(sql) {
  return sql
    .split(/\r?\n/)
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
}
export function validarConteudoArquivo(stem, sql) {
  const limpo = semComentarios(sql);
  for (const [re, motivo] of PROIBIDOS_NO_ARQUIVO) {
    if (re.test(limpo)) throw new ExecutorErro("ARQUIVO_RECUSADO", `${stem}: ${motivo}`);
  }
}

export function lerArquivoMigration(dir, stem) {
  const p = path.join(dir, `${stem}.sql`);
  if (!existsSync(p)) throw new ExecutorErro("ARQUIVO_AUSENTE", `arquivo ausente: ${p}`);
  const bruto = readFileSync(p);
  const sql = bruto.toString("utf8").replace(/^﻿/, "");
  return {
    stem,
    ...separarStem(stem),
    sql,
    bytes: bruto.length,
    sha256: createHash("sha256").update(bruto).digest("hex"),
  };
}

// Seleção: lista de ids de onda (na ordem do JSON) ou uma adiada (E/H2), nunca as duas coisas.
export function montarPlano({ seq, dir, ondas = [], adiada = null }) {
  if (adiada && ondas.length) throw new ExecutorErro("SELECAO_INVALIDA", "use --ondas OU --adiada, não os dois");
  if (!adiada && !ondas.length) throw new ExecutorErro("SELECAO_INVALIDA", "nenhuma onda selecionada");
  const passos = [];
  let selecionadas;
  let anteriores = [];
  if (adiada) {
    const a = seq.adiadas.find((x) => x.onda === adiada);
    if (!a) throw new ExecutorErro("SELECAO_INVALIDA", `adiada desconhecida: ${adiada}`);
    selecionadas = [{ id: a.onda, nome: `ADIADA: ${a.motivo}`, migrations: [a.migration], depende: a.depende ?? [] }];
    anteriores = [...(a.depende ?? [])];
  } else {
    const ids = seq.ondas.map((o) => o.id);
    for (const id of ondas) if (!ids.includes(id)) throw new ExecutorErro("SELECAO_INVALIDA", `onda desconhecida: ${id}`);
    if (new Set(ondas).size !== ondas.length) throw new ExecutorErro("SELECAO_INVALIDA", "onda repetida");
    const ordenadas = [...ondas].sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
    // seleção contígua na ordem do JSON: não se pula onda no meio (a anterior a cada uma tem de estar registrada ou selecionada)
    const idx = ordenadas.map((id) => ids.indexOf(id));
    for (let i = 1; i < idx.length; i++) if (idx[i] !== idx[i - 1] + 1) throw new ExecutorErro("SELECAO_INVALIDA", `seleção não contígua: ${ordenadas.join(",")} (falta ${ids[idx[i - 1] + 1]})`);
    selecionadas = ordenadas.map((id) => seq.ondas.find((o) => o.id === id));
    anteriores = seq.ondas.slice(0, idx[0]).flatMap((o) => o.migrations);
  }
  const ondasPlano = selecionadas.map((o) => {
    const itens = o.migrations.map((stem) => {
      if (seq.jaEfetivaNaoReaplicar.includes(stem)) throw new ExecutorErro("SELECAO_INVALIDA", `${stem} não é reaplicada`);
      const arq = lerArquivoMigration(dir, stem);
      validarConteudoArquivo(stem, arq.sql);
      const corpo = montarCorpoArquivo(arq);
      const bytesCorpo = Buffer.byteLength(corpo, "utf8");
      if (bytesCorpo > MAX_CORPO_BYTES) throw new ExecutorErro("CORPO_GRANDE", `${stem}: corpo ${bytesCorpo} bytes > ${MAX_CORPO_BYTES}`);
      return { tipo: "arquivo", stem, version: arq.version, name: arq.name, sha256: arq.sha256, bytesArquivo: arq.bytes, bytesCorpo, corpo };
    });
    // Hotfix: só o REGISTRO (sem reaplicar), logo depois da onda B (docs/implantacao/14, seção 4-i), protegido pelo portão P0 na mesma transação.
    if (o.id === "B") {
      const hf = separarStem(HOTFIX_STEM);
      const corpo = montarCorpoRegistroHotfix(hf);
      itens.push({ tipo: "registro-hotfix", stem: HOTFIX_STEM, version: hf.version, name: hf.name, sha256: null, bytesArquivo: 0, bytesCorpo: Buffer.byteLength(corpo, "utf8"), corpo });
    }
    return { id: o.id, nome: o.nome, itens };
  });
  for (const o of ondasPlano) passos.push(...o.itens);
  return { ondas: ondasPlano, passos, anteriores, adiada: Boolean(adiada) };
}

// ------------------------------------------------------------------ corpos SQL
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
export function montarCorpoArquivo({ sql, version, name }, opcoes = {}) {
  const lock = opcoes.lockTimeout ?? LOCK_TIMEOUT;
  const stmt = opcoes.statementTimeout ?? STATEMENT_TIMEOUT;
  separarStem(`${version}_${name}`);
  return [
    `set local lock_timeout = ${lit(lock)};`,
    `set local statement_timeout = ${lit(stmt)};`,
    sql,
    ";", // fecha um último comando sem ponto e vírgula; linha própria (um comentário final não o engole)
    `insert into supabase_migrations.schema_migrations (version, name) values (${lit(version)}, ${lit(name)});`,
  ].join("\n");
}

export function montarCorpoRegistroHotfix({ version, name }) {
  return [
    `set local lock_timeout = ${lit(LOCK_TIMEOUT)};`,
    `set local statement_timeout = ${lit(STATEMENT_TIMEOUT)};`,
    `do $exec_p0$ begin`,
    `  if (select md5(replace(p.prosrc, chr(13), '')) from pg_catalog.pg_proc p where p.oid = to_regprocedure('public.record_risk_alert_action(uuid,text,jsonb)')) is distinct from ${lit(P0_MD5)} then`,
    `    raise exception 'P0_GATE: corpo de record_risk_alert_action diverge; registro do hotfix recusado';`,
    `  end if;`,
    `end $exec_p0$;`,
    `insert into supabase_migrations.schema_migrations (version, name) values (${lit(version)}, ${lit(name)});`,
  ].join("\n");
}

export function lerP0Sql(scriptsDir) {
  return readFileSync(path.join(scriptsDir, "sql", "p0-verificar-record-risk-alert-action.sql"), "utf8").replace(/^﻿/, "");
}
// Conferência somente leitura (transação READ ONLY): P0 + presença da linha + contagem e hash do histórico.
export function montarCorpoConferencia(p0Sql, versaoEsperada = null) {
  const p0 = p0Sql.replace(/;\s*$/, "").trim();
  const reg = versaoEsperada
    ? `exists (select 1 from supabase_migrations.schema_migrations h where h.version = ${lit(versaoEsperada.version)} and h.name = ${lit(versaoEsperada.name)})`
    : "null::boolean";
  return [
    "set transaction read only;",
    `with p0 as (\n${p0}\n)`,
    "select (select ok from p0) as p0_ok, (select corpo_md5_sem_cr from p0) as p0_md5,",
    `  ${reg} as registrado,`,
    "  (select count(*)::int from supabase_migrations.schema_migrations) as n,",
    "  (select max(version) from supabase_migrations.schema_migrations) as ultima,",
    "  (select md5(string_agg(version || '_' || name, ',' order by version)) from supabase_migrations.schema_migrations) as hash;",
  ].join("\n");
}
export function montarCorpoHistorico() {
  return "set transaction read only;\nselect version, name from supabase_migrations.schema_migrations order by version;";
}

// Mesmo cálculo do servidor: md5(string_agg(version||'_'||name, ',' order by version)); nulos são ignorados pelo string_agg.
export function hashHistorico(linhas) {
  const ord = linhas
    .filter((l) => l.version != null && l.name != null)
    .sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
  if (!ord.length) return null;
  return createHash("md5").update(ord.map((l) => `${l.version}_${l.name}`).join(",")).digest("hex");
}

// ------------------------------------------------------------------ orquestração
const unicaLinha = (r) => {
  const linhas = Array.isArray(r) ? r : r?.linhas;
  if (!Array.isArray(linhas) || linhas.length !== 1) throw new ExecutorErro("RESPOSTA_INESPERADA", "conferência não devolveu exatamente 1 linha");
  return linhas[0];
};
const bool = (v) => v === true || v === "t" || v === "true";

// transporte: { descricao, executar(sql) -> Promise<{ linhas }> } ; erro do transporte: objeto com .tipo ('sql' | 'incerto') e .message.
export async function executarPlano({ plano, transporte, p0Sql, log = () => {}, retomar = false, segredos = [] }) {
  const L = (s) => log(redigir(s, segredos));
  const conferir = async (esperada) => unicaLinha(await transporte.executar(montarCorpoConferencia(p0Sql, esperada)));
  const resultado = { ok: false, aplicados: [], pulados: [], falha: null };

  // 1) pré-voo (somente leitura)
  const pre = await conferir(null);
  L(`pré-voo: P0 ${bool(pre.p0_ok) ? "ok" : "DIVERGENTE"} (corpo ${pre.p0_md5}); histórico ${pre.n} linhas, última ${pre.ultima}, hash ${pre.hash}`);
  if (!bool(pre.p0_ok)) return { ...resultado, falha: { codigo: "P0_PRE", mensagem: "P0 divergente antes de começar; nada foi executado" } };
  const hist = (await transporte.executar(montarCorpoHistorico())).linhas;
  if (hashHistorico(hist) !== pre.hash) return { ...resultado, falha: { codigo: "HISTORICO_INCOERENTE", mensagem: "hash calculado das linhas lidas difere do hash do servidor" } };
  const registradas = new Set(hist.map((h) => `${h.version}_${h.name}`));
  const versoes = new Map(hist.map((h) => [h.version, h.name]));

  const faltandoAntes = plano.anteriores.filter((s) => !registradas.has(s));
  if (faltandoAntes.length) return { ...resultado, falha: { codigo: "ONDA_ANTERIOR_PENDENTE", mensagem: `pré-requisito não registrado: ${faltandoAntes.slice(0, 5).join(", ")}${faltandoAntes.length > 5 ? "..." : ""}` } };

  let jaFeitos = 0;
  for (const p of plano.passos) {
    if (registradas.has(p.stem)) jaFeitos += 1;
    else if (versoes.has(p.version)) return { ...resultado, falha: { codigo: "VERSAO_COM_OUTRO_NOME", mensagem: `${p.version} já registrada com outro nome (${versoes.get(p.version)})` } };
  }
  // só se retoma um PREFIXO já registrado (execução anterior interrompida); qualquer outro padrão é incoerente
  const prefixo = plano.passos.findIndex((p) => !registradas.has(p.stem));
  const nPrefixo = prefixo === -1 ? plano.passos.length : prefixo;
  if (jaFeitos > 0) {
    if (!retomar) return { ...resultado, falha: { codigo: "JA_REGISTRADA", mensagem: `${jaFeitos} item(ns) do plano já estão no histórico (use --retomar só para continuar uma execução interrompida)` } };
    if (jaFeitos !== nPrefixo) return { ...resultado, falha: { codigo: "RETOMADA_INCOERENTE", mensagem: "itens já registrados não formam um prefixo do plano" } };
  }

  // 2) execução
  const atual = hist.map((h) => ({ version: h.version, name: h.name }));
  let i = 0;
  for (const onda of plano.ondas) {
    L(`== onda ${onda.id}: ${onda.itens.length} item(ns)`);
    for (const p of onda.itens) {
      i += 1;
      if (i <= nPrefixo && jaFeitos > 0) {
        resultado.pulados.push(p.stem);
        L(`PULADO (já registrado) ${p.stem}`);
        continue;
      }
      const t0 = Date.now();
      try {
        await transporte.executar(p.corpo);
      } catch (e) {
        const msg = redigir(e?.message ?? String(e), segredos);
        let estado = "desconhecido";
        try {
          const c = await conferir(p);
          estado = bool(c.registrado) ? "REGISTRADO apesar do erro (tratar como aplicado e conferir)" : "não registrado (transação desfeita)";
          estado += `; P0 ${bool(c.p0_ok) ? "ok" : "DIVERGENTE"}`;
        } catch (e2) {
          estado = `conferência pós-falha também falhou: ${redigir(e2?.message ?? String(e2), segredos)}`;
        }
        L(`PARAR: falhou ${p.stem} (${e?.tipo ?? "erro"}): ${msg} | estado: ${estado}`);
        return { ...resultado, falha: { codigo: e?.tipo === "sql" ? "FALHA_SQL" : "FALHA_INCERTA", stem: p.stem, mensagem: msg, estado } };
      }
      const ms = Date.now() - t0;
      const c = await conferir(p);
      if (!bool(c.registrado)) {
        L(`PARAR: ${p.stem} sem linha no histórico depois da chamada`);
        return { ...resultado, falha: { codigo: "NAO_REGISTRADO", stem: p.stem, mensagem: "linha ausente no histórico" } };
      }
      atual.push({ version: p.version, name: p.name });
      resultado.aplicados.push(p.stem);
      if (!bool(c.p0_ok)) {
        L(`PARAR: P0 divergiu depois de ${p.stem} (corpo ${c.p0_md5})`);
        return { ...resultado, falha: { codigo: "P0_DIVERGENTE", stem: p.stem, mensagem: `P0 divergente (corpo ${c.p0_md5})` } };
      }
      L(`OK ${p.tipo === "registro-hotfix" ? "(só registro) " : ""}${p.stem} em ${ms} ms; P0 ok; registrado`);
    }
    const c = await conferir(null);
    const esperado = hashHistorico(atual);
    if (c.hash !== esperado || Number(c.n) !== atual.length) {
      L(`PARAR: hash do histórico depois da onda ${onda.id} = ${c.hash} (${c.n}); esperado ${esperado} (${atual.length})`);
      return { ...resultado, falha: { codigo: "HASH_HISTORICO", mensagem: `onda ${onda.id}: hash ${c.hash} != ${esperado}` } };
    }
    L(`onda ${onda.id} concluída: histórico ${c.n} linhas, hash ${c.hash} (confere)`);
  }
  return { ...resultado, ok: true };
}

// ------------------------------------------------------------------ transporte HTTP (API de gerenciamento)
// POST {API_BASE}/v1/projects/{ref}/database/query, corpo JSON {"query": "..."}; Authorization: Bearer <token>.
// Erros: "Failed to run sql query: ERROR:  <SQLSTATE>: ..." => erro de SQL (transação desfeita pelo próprio PostgreSQL);
// qualquer outro (rede, 401/403/429, 5xx sem SQLSTATE, tempo esgotado do cliente) => INCERTO (o executor confere o estado).
export function criarTransporteHttp({ ref, token, fetchImpl = globalThis.fetch, timeoutMs = 180_000 }) {
  if (!/^[a-z]{20}$/.test(ref)) throw new ExecutorErro("ALVO_NAO_PERMITIDO", "ref inválido");
  if (typeof token !== "string" || token.length < 20) throw new ExecutorErro("TOKEN_INVALIDO", "token ausente ou curto demais");
  const url = `${API_BASE}/v1/projects/${ref}/database/query`;
  return {
    descricao: `API de gerenciamento (${ref})`,
    async executar(sql) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      let resp;
      try {
        resp = await fetchImpl(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query: sql }),
          signal: ac.signal,
        });
      } catch (e) {
        const err = new Error(redigir(`falha de rede/tempo: ${e?.name ?? ""} ${e?.message ?? e}`, [token]));
        err.tipo = "incerto";
        throw err;
      } finally {
        clearTimeout(timer);
      }
      const texto = await resp.text();
      if (resp.status >= 200 && resp.status < 300) {
        let dados;
        try { dados = texto ? JSON.parse(texto) : []; } catch { const err = new Error("resposta não-JSON"); err.tipo = "incerto"; throw err; }
        return { linhas: Array.isArray(dados) ? dados : [] };
      }
      let msg = texto;
      try { msg = JSON.parse(texto)?.message ?? texto; } catch { /* texto cru */ }
      const err = new Error(redigir(`HTTP ${resp.status}: ${String(msg).slice(0, 600)}`, [token]));
      err.tipo = /ERROR:\s+[0-9A-Z]{5}:/.test(String(msg)) ? "sql" : "incerto";
      err.status = resp.status;
      throw err;
    },
  };
}

// ------------------------------------------------------------------ transporte local (ensaio em PostgreSQL real)
// Envia o MESMO texto por client.query(texto) SEM parâmetros: o driver "pg" usa o protocolo de consulta simples (uma mensagem Query),
// em que vários comandos formam uma transação implícita - o equivalente local de UMA chamada à API de gerenciamento.
export function criarTransporteLocalPg(client, descricao = "PostgreSQL local") {
  return {
    descricao,
    async executar(sql) {
      try {
        const r = await client.query(sql);
        const ultimo = Array.isArray(r) ? r[r.length - 1] : r;
        return { linhas: ultimo?.rows ?? [] };
      } catch (e) {
        const err = new Error(`ERROR: ${e.code ?? "?????"}: ${String(e.message).split("\n")[0]}`);
        err.tipo = e.code && /^[0-9A-Z]{5}$/.test(e.code) ? "sql" : "incerto";
        err.sqlstate = e.code;
        throw err;
      }
    },
  };
}

// ------------------------------------------------------------------ ensaio de atomicidade (corpos montados pelo MESMO código)
// Casos descartáveis: os de falha se desfazem sozinhos; o de sucesso é compensado (drop + delete da linha) e o hash final
// do histórico tem de ser igual ao inicial. Usado no PostgreSQL local e, com token, na homologação (nunca no operacional).
export const ENSAIO_SCHEMA = "acc_exec_ensaio";
export function casosEnsaio({ versaoExistente }) {
  const t = (n) => `${ENSAIO_SCHEMA}.t${n}`;
  const criar = `create schema if not exists ${ENSAIO_SCHEMA};`;
  return [
    {
      id: "falha-no-ultimo-comando",
      descricao: "arquivo OK + insert com versão JÁ registrada (viola a PK no último comando)",
      arquivo: { version: versaoExistente.version, name: versaoExistente.name, sql: `${criar}\ncreate table ${t(1)} (i int);\ninsert into ${t(1)} values (1);` },
      espera: "falha",
      tabela: t(1),
    },
    {
      id: "falha-em-bloco-do",
      descricao: "arquivo cria tabela e depois um bloco DO $$ levanta exceção",
      arquivo: { version: "29991231000002", name: "acc_exec_ensaio_bloco_do", sql: `${criar}\ncreate table ${t(2)} (i int);\ndo $$ begin raise exception 'ENSAIO_EXECUTOR_BLOCO_DO'; end $$;` },
      espera: "falha",
      tabela: t(2),
    },
    {
      id: "estouro-statement-timeout",
      descricao: "statement_timeout reduzido a 1s só neste caso; arquivo cria tabela e dorme 3s",
      arquivo: { version: "29991231000003", name: "acc_exec_ensaio_timeout", sql: `${criar}\ncreate table ${t(3)} (i int);\nselect pg_sleep(3);` },
      opcoes: { statementTimeout: "1s" },
      espera: "falha",
      tabela: t(3),
    },
    {
      id: "sucesso-compensado",
      descricao: "arquivo cria tabela e registra; depois é compensado (drop + delete da linha)",
      arquivo: { version: "29991231000005", name: "acc_exec_ensaio_sucesso", sql: `${criar}\ncreate table ${t(5)} (i int);` },
      espera: "sucesso",
      tabela: t(5),
      compensacao: `drop table ${t(5)};\ndrop schema if exists ${ENSAIO_SCHEMA};\ndelete from supabase_migrations.schema_migrations where version = '29991231000005' and name = 'acc_exec_ensaio_sucesso';`,
    },
  ];
}

export async function executarEnsaioAtomicidade({ transporte, p0Sql, log = () => {}, segredos = [] }) {
  const L = (s) => log(redigir(s, segredos));
  const conf = async (v) => unicaLinha(await transporte.executar(montarCorpoConferencia(p0Sql, v)));
  const existe = async (tabela) => {
    const r = await transporte.executar(`set transaction read only;\nselect to_regclass(${lit(tabela)}) is not null as existe, to_regnamespace(${lit(ENSAIO_SCHEMA)}) is not null as schema_existe;`);
    return unicaLinha(r);
  };
  const ini = await conf(null);
  if (!bool(ini.p0_ok)) throw new ExecutorErro("P0_PRE", "P0 divergente antes do ensaio");
  const hist = (await transporte.executar(montarCorpoHistorico())).linhas;
  const ultima = hist[hist.length - 1];
  const resultados = [];
  for (const c of casosEnsaio({ versaoExistente: ultima })) {
    const corpo = montarCorpoArquivo(c.arquivo, c.opcoes);
    let erro = null;
    try { await transporte.executar(corpo); } catch (e) { erro = e; }
    const depois = await conf(c.arquivo);
    const tab = await existe(c.tabela);
    let ok;
    let detalhe;
    if (c.espera === "falha") {
      const linhaNova = c.id === "falha-no-ultimo-comando" ? false : bool(depois.registrado);
      ok = Boolean(erro) && erro.tipo === "sql" && !bool(tab.existe) && !bool(tab.schema_existe) && !linhaNova && depois.hash === ini.hash && Number(depois.n) === Number(ini.n) && bool(depois.p0_ok);
      detalhe = `erro=${erro ? redigir(erro.message, segredos).slice(0, 160) : "NENHUM"}; tabela=${bool(tab.existe)}; schema=${bool(tab.schema_existe)}; hash ${depois.hash === ini.hash ? "igual" : "DIFERENTE"}`;
    } else {
      const okAplicado = !erro && bool(depois.registrado) && bool(tab.existe) && Number(depois.n) === Number(ini.n) + 1;
      let okComp = false;
      try {
        await transporte.executar(c.compensacao);
        const fim = await conf(null);
        const tab2 = await existe(c.tabela);
        okComp = fim.hash === ini.hash && !bool(tab2.existe) && !bool(tab2.schema_existe) && bool(fim.p0_ok);
      } catch (e) {
        detalhe = `compensação falhou: ${redigir(e.message, segredos)}`;
      }
      ok = okAplicado && okComp;
      detalhe = detalhe ?? `aplicado=${okAplicado} (registrado e tabela criada); compensado=${okComp} (hash final igual ao inicial)`;
    }
    L(`${ok ? "OK  " : "FAIL"} ensaio ${c.id}: ${c.descricao} | ${detalhe}`);
    resultados.push({ id: c.id, ok, detalhe });
  }
  const fim = await conf(null);
  const igual = fim.hash === ini.hash && bool(fim.p0_ok);
  L(`${igual ? "OK  " : "FAIL"} ensaio: histórico final igual ao inicial (${fim.n} linhas, hash ${fim.hash}); P0 ${bool(fim.p0_ok) ? "ok" : "DIVERGENTE"}`);
  return { ok: igual && resultados.every((r) => r.ok), resultados, hashInicial: ini.hash, hashFinal: fim.hash };
}
