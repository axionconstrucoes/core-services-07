// Cobertura temporal de uma fonte de dados (diarios, relatorios, atas...).
//
// Modulo puro: sem rede, sem banco, sem IA. Recebe SOMENTE datas ja
// agregadas (metadado) e devolve o retrato de cobertura contra a janela
// alvo do historico. Nunca recebe nem devolve conteudo de documento.
//
// REGRA DE STATUS (conservadora, de proposito)
//
// OPERACIONAL exige evidencia de dado efetivamente importado E cobertura
// da janela inteira (dentro da tolerancia) E sincronizacao recente.
// Qualquer falta rebaixa para PARCIAL. Sem nenhum registro importado, ou
// sem conexao, e' NAO_CONECTADA. Nao existe caminho que declare
// OPERACIONAL a partir de configuracao ou de "esperado".

export type StatusCobertura = "OPERACIONAL" | "PARCIAL" | "NAO_CONECTADA";

export interface JanelaAlvo {
  inicio: string; // AAAA-MM-DD
  fim: string; // AAAA-MM-DD
}

/** Janela do historico de 18 meses definida para o piloto. */
export const JANELA_HISTORICO_18_MESES: JanelaAlvo = Object.freeze({
  inicio: "2025-05-22",
  fim: "2026-11-22",
});

export interface MesCobertura {
  mes: string; // AAAA-MM
  registros: number;
  diasDistintos: number;
}

export interface RelatorioCobertura {
  total: number;
  primeiraData: string | null;
  ultimaData: string | null;
  /** Meses da janela, inclusive os sem nenhum registro. */
  meses: MesCobertura[];
  mesesSemRegistro: string[];
  /** Dias entre o inicio da janela e o primeiro registro (0 se cobre desde o inicio). */
  lacunaInicialDias: number;
  /** Dias entre o ultimo registro e o fim da janela. */
  lacunaFinalDias: number;
  /** Registros fora da janela alvo (ignorados nas contagens por mes). */
  foraDaJanela: number;
  /** Registros com data invalida (ignorados). */
  datasInvalidas: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parseIso(iso: string): Date | null {
  if (!ISO.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : d;
}

function diasEntre(a: string, b: string): number {
  const da = parseIso(a);
  const db = parseIso(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** Lista AAAA-MM de cada mes tocado pela janela, em ordem. */
export function mesesDaJanela(janela: JanelaAlvo): string[] {
  const ini = parseIso(janela.inicio);
  const fim = parseIso(janela.fim);
  if (!ini || !fim || ini > fim) return [];
  const meses: string[] = [];
  let ano = ini.getUTCFullYear();
  let mes = ini.getUTCMonth();
  const anoFim = fim.getUTCFullYear();
  const mesFim = fim.getUTCMonth();
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes + 1).padStart(2, "0")}`);
    mes += 1;
    if (mes > 11) {
      mes = 0;
      ano += 1;
    }
  }
  return meses;
}

export function calcularCobertura(datas: readonly string[], janela: JanelaAlvo): RelatorioCobertura {
  const porMes = new Map<string, { registros: number; dias: Set<string> }>();
  for (const m of mesesDaJanela(janela)) porMes.set(m, { registros: 0, dias: new Set() });

  let invalidas = 0;
  let fora = 0;
  let primeira: string | null = null;
  let ultima: string | null = null;

  for (const bruta of datas) {
    const data = typeof bruta === "string" ? bruta.slice(0, 10) : "";
    if (!parseIso(data)) {
      invalidas += 1;
      continue;
    }
    if (data < janela.inicio || data > janela.fim) {
      fora += 1;
      continue;
    }
    if (primeira === null || data < primeira) primeira = data;
    if (ultima === null || data > ultima) ultima = data;
    const bucket = porMes.get(data.slice(0, 7));
    if (bucket) {
      bucket.registros += 1;
      bucket.dias.add(data);
    }
  }

  const meses: MesCobertura[] = [...porMes.entries()].map(([mes, b]) => ({
    mes,
    registros: b.registros,
    diasDistintos: b.dias.size,
  }));

  const janelaDias = diasEntre(janela.inicio, janela.fim);

  return {
    total: meses.reduce((s, m) => s + m.registros, 0),
    primeiraData: primeira,
    ultimaData: ultima,
    meses,
    mesesSemRegistro: meses.filter((m) => m.registros === 0).map((m) => m.mes),
    lacunaInicialDias: primeira ? Math.max(0, diasEntre(janela.inicio, primeira)) : janelaDias,
    lacunaFinalDias: ultima ? Math.max(0, diasEntre(ultima, janela.fim)) : janelaDias,
    foraDaJanela: fora,
    datasInvalidas: invalidas,
  };
}

export interface EntradaStatus {
  cobertura: RelatorioCobertura;
  /** Existe conexao/configuracao ativa com a fonte. */
  conectada: boolean;
  /** Ultima sincronizacao bem-sucedida (ISO) ou null. */
  ultimaSincronizacao: string | null;
  /** "Agora" injetado, para o calculo ser deterministico. */
  agora: string;
  /** Tolerancia de lacuna nas pontas da janela, em dias. */
  toleranciaDias?: number;
  /** Idade maxima da ultima sincronizacao, em dias. */
  sincronizacaoMaxDias?: number;
}

export interface DecisaoStatus {
  status: StatusCobertura;
  motivos: string[];
}

export function classificarStatus(e: EntradaStatus): DecisaoStatus {
  const tol = e.toleranciaDias ?? 14;
  const maxSync = e.sincronizacaoMaxDias ?? 2;
  const c = e.cobertura;

  if (!e.conectada || c.total === 0) {
    return {
      status: "NAO_CONECTADA",
      motivos: [!e.conectada ? "sem conexao ativa com a fonte" : "nenhum registro importado na janela"],
    };
  }

  const motivos: string[] = [];
  if (c.lacunaInicialDias > tol) motivos.push(`historico comeca ${c.lacunaInicialDias} dias apos o inicio da janela`);
  if (c.lacunaFinalDias > tol) motivos.push(`ultimo registro ${c.lacunaFinalDias} dias antes do fim da janela`);
  if (c.mesesSemRegistro.length > 0) motivos.push(`meses sem registro: ${c.mesesSemRegistro.join(", ")}`);

  if (!e.ultimaSincronizacao) {
    motivos.push("sem sincronizacao bem-sucedida registrada");
  } else {
    const idade = diasEntre(e.ultimaSincronizacao.slice(0, 10), e.agora.slice(0, 10));
    if (idade > maxSync) motivos.push(`ultima sincronizacao ha ${idade} dias`);
  }

  return motivos.length === 0 ? { status: "OPERACIONAL", motivos: [] } : { status: "PARCIAL", motivos };
}
