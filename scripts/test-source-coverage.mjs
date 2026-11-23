// Cobertura temporal por fonte: relatorio por mes e regra de status.
// Fixtures SINTETICAS. Sem rede, sem credencial, sem banco.
//
// Uso: node scripts/test-source-coverage.mjs

import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const { calcularCobertura, classificarStatus, mesesDaJanela, JANELA_HISTORICO_18_MESES } = await import(
  "../apps/web/lib/coverage/source-coverage.ts"
);

let passaram = 0;
let falharam = 0;
function check(rotulo, condicao) {
  if (condicao) {
    passaram += 1;
    console.log(`OK   ${rotulo}`);
  } else {
    falharam += 1;
    console.log(`FALHA ${rotulo}`);
  }
}

const J = JANELA_HISTORICO_18_MESES;
const meses = mesesDaJanela(J);
check("janela de 18 meses toca 19 meses calendario", meses.length === 19 && meses[0] === "2025-05" && meses[18] === "2026-11");
check("janela invertida nao gera meses", mesesDaJanela({ inicio: "2026-02-01", fim: "2026-01-01" }).length === 0);

// Serie sintetica: so a partir de 2026-03-16 ate 2026-11-11.
const datas = [];
for (let d = new Date("2026-03-16T00:00:00Z"); d <= new Date("2026-11-11T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
  datas.push(d.toISOString().slice(0, 10));
}
const validas = datas.length;
datas.push("2024-01-01", "2027-01-01", "lixo", "2026-02-30");

const c = calcularCobertura(datas, J);
check("primeira e ultima data dentro da janela", c.primeiraData === "2026-03-16" && c.ultimaData === "2026-11-11");
check(
  "meses anteriores a primeira data sao lacuna",
  c.mesesSemRegistro.length === 10 && c.mesesSemRegistro[0] === "2025-05" && c.mesesSemRegistro[9] === "2026-02"
);
check("fora da janela e datas invalidas contadas a parte", c.foraDaJanela === 2 && c.datasInvalidas === 2);
check("lacuna inicial e final em dias", c.lacunaInicialDias === 298 && c.lacunaFinalDias === 11);
check("total soma os meses", c.total === validas && c.total === c.meses.reduce((s, m) => s + m.registros, 0));
check("novembro parcial conta 11 dias", c.meses.find((m) => m.mes === "2026-11").diasDistintos === 11);

const agora = "2026-11-22T12:00:00Z";
const parcial = classificarStatus({ cobertura: c, conectada: true, ultimaSincronizacao: "2026-11-21T21:43:00Z", agora });
check("historico incompleto => PARCIAL, nunca OPERACIONAL", parcial.status === "PARCIAL" && parcial.motivos.length >= 2);

const vazia = calcularCobertura([], J);
check(
  "sem registros => NAO_CONECTADA",
  classificarStatus({ cobertura: vazia, conectada: true, ultimaSincronizacao: null, agora }).status === "NAO_CONECTADA"
);
check(
  "sem conexao => NAO_CONECTADA mesmo com dados",
  classificarStatus({ cobertura: c, conectada: false, ultimaSincronizacao: null, agora }).status === "NAO_CONECTADA"
);
check("vazia: lacunas = janela inteira", vazia.lacunaInicialDias === 549 && vazia.mesesSemRegistro.length === 19);

// Cobertura plena sintetica.
const plena = [];
for (let d = new Date("2025-05-22T00:00:00Z"); d <= new Date("2026-11-22T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
  plena.push(d.toISOString().slice(0, 10));
}
const cp = calcularCobertura(plena, J);
check("cobertura plena: sem meses vazios", cp.mesesSemRegistro.length === 0 && cp.lacunaInicialDias === 0 && cp.lacunaFinalDias === 0);
check(
  "plena e sincronizada => OPERACIONAL",
  classificarStatus({ cobertura: cp, conectada: true, ultimaSincronizacao: "2026-11-22T00:43:00Z", agora }).status === "OPERACIONAL"
);
check(
  "plena mas sincronizacao antiga => PARCIAL",
  classificarStatus({ cobertura: cp, conectada: true, ultimaSincronizacao: "2026-11-01T00:00:00Z", agora }).status === "PARCIAL"
);
check(
  "plena sem sincronizacao registrada => PARCIAL",
  classificarStatus({ cobertura: cp, conectada: true, ultimaSincronizacao: null, agora }).status === "PARCIAL"
);

console.log(`\n${passaram} passaram, ${falharam} falharam`);
process.exit(falharam === 0 ? 0 : 1);
