// Estrutura MASCARADA de uma planilha semanal, para diagnóstico em log de repositório PÚBLICO.
// Nunca devolve o texto de nome de aba, de célula, de autor ou de arquivo: apenas classes de um vocabulário FECHADO,
// índices, estado (visível/oculta), referência de dimensão (ex.: A1:Z99) e contagens. Pura (recebe os nomes e os XMLs).

/** Normalização idêntica à do identificador de abas (minúsculas, sem acentos, só [a-z0-9]). */
export function normalizeName(name) {
  return String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Vocabulário FECHADO: a classe é o que se imprime; o nome nunca. */
const CLASSES = [
  ["CURVA_S", /^curvas|^scurve/],
  ["LINHA_BASE", /^linhadebase|^linhabase|^baseline/],
  ["FINANCEIRO", /financ/],
  ["HISTOGRAMA", /^histogram|^maodeobra|^efetivo|^workforce|^manpower/],
  ["SSMA", /^ssma|^esg|^seguranca|^hse|^ehs/],
  ["GRAFICO", /^grafico|^chart/],
  ["MEDICAO_FATURAMENTO", /medicao|faturamento/],
  ["CONTRATACAO_ENTREGAS", /contratacao|entregas/],
];

export function classifySheetName(name) {
  const key = normalizeName(name);
  const hits = CLASSES.filter(([, re]) => re.test(key)).map(([id]) => id);
  return hits.length ? hits.join("+") : "OUTRA";
}

/** Dimensão declarada no XML da aba (<dimension ref="A1:Z99"/>); nada de conteúdo. */
export function dimensionOf(sheetXml) {
  const m = /<dimension\b[^>]*\bref="([A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?)"/.exec(sheetXml ?? "");
  return m ? m[1] : null;
}

export function sheetHasDrawing(sheetXml) {
  return /<drawing\b/.test(sheetXml ?? "");
}

/**
 * @param {Array<{index:number,name:string,hidden:boolean,dimension:string|null,drawing:boolean}>} sheets
 * @param {(names:Array<{name:string,index:number}>) => Array<{category:string,status:string,sheetIndex:number|null}>} identify
 * @param {{charts:number,drawings:number,externalLinks:number}} pkg
 */
export function summarizeStructure(sheets, identify, pkg) {
  const matches = identify(sheets.map((s) => ({ name: s.name, index: s.index })));
  const byIndex = new Map(matches.filter((m) => m.sheetIndex != null).map((m) => [m.sheetIndex, m.category]));
  return {
    // IDENTIFICAÇÃO (nome da aba pelo parser atual) ≠ VALIDAÇÃO (o conteúdo corresponde semanticamente à categoria). Só a primeira é feita aqui.
    identificacao_aba: "POR_NOME_PARSER_ATUAL",
    validacao_conteudo: "NAO_REALIZADA (ler a estrutura nao prova que a aba corresponde a categoria esperada)",
    abas: sheets.length,
    ocultas: sheets.filter((s) => s.hidden).length,
    graficos: pkg.charts,
    desenhos: pkg.drawings,
    linksExternos: pkg.externalLinks,
    reconhecimento: Object.fromEntries(matches.map((m) => [m.category, m.status])),
    abas_detalhe: sheets.map((s) => ({
      i: s.index,
      classe: classifySheetName(s.name),
      reconhecida_como: byIndex.get(s.index) ?? null,
      identificacao: byIndex.has(s.index) ? "IDENTIFICADA_POR_NOME" : "NAO_IDENTIFICADA_POR_NOME",
      validacao_conteudo: "NAO_REALIZADA",
      oculta: s.hidden,
      dimensao: s.dimension,
      desenho: s.drawing,
    })),
    // Abas cuja classe aponta para uma categoria esperada mas que o parser atual NÃO reconheceu (candidatas a apelido de layout).
    proposta_alias_financeiro: proposeFinanceiroAlias(sheets, matches),
    pistas_nao_reconhecidas: sheets
      .filter((s) => !byIndex.has(s.index))
      .map((s) => ({ i: s.index, classe: classifySheetName(s.name) }))
      .filter((s) => s.classe !== "OUTRA"),
  };
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export async function inspectPackage(JSZip, buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const workbookXml = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const relsXml = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const targets = new Map();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const sheets = [];
  let index = 0;
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? "");
    const rid = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    const state = /\bstate="([^"]+)"/.exec(m[0])?.[1] ?? "visible";
    const path = rid ? targets.get(rid) : null;
    const xml = path ? await zip.file(path)?.async("string") : null;
    sheets.push({ index, name, hidden: state !== "visible", dimension: dimensionOf(xml), drawing: sheetHasDrawing(xml) });
    index += 1;
  }
  const count = (re) => names.filter((n) => re.test(n)).length;
  return {
    sheets,
    pkg: {
      charts: count(/^xl\/charts\/chart\d+\.xml$/),
      drawings: count(/^xl\/drawings\/drawing\d+\.xml$/),
      externalLinks: count(/^xl\/externalLinks\/externalLink\d+\.xml$/),
    },
  };
}


/**
 * PROPOSTA (não aplicada em produção): alias ESTREITO para Financeiro. Só o nome normalizado EXATO "resumofinanceiro(s)" e apenas
 * quando o parser atual não achou Financeiro e há exatamente UMA aba candidata. Não generaliza ("resumo", "financeiro detalhado", etc.).
 */
export const FINANCEIRO_ALIAS_EXATOS = new Set(["resumofinanceiro", "resumofinanceiros"]);
export function proposeFinanceiroAlias(sheets, matches) {
  const atual = matches.find((m) => m.category === "FINANCEIRO");
  if (!atual || atual.status !== "MISSING_SHEET") return { aplicada_em_producao: false, casaria: false, motivo: atual ? atual.status : "sem_categoria" };
  const cand = sheets.filter((s) => FINANCEIRO_ALIAS_EXATOS.has(normalizeName(s.name)));
  if (cand.length !== 1) return { aplicada_em_producao: false, casaria: false, motivo: cand.length ? "ambigua" : "sem_candidata" };
  return { aplicada_em_producao: false, casaria: true, aba_indice: cand[0].index, validacao_conteudo: "NAO_REALIZADA" };
}
