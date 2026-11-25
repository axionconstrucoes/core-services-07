// Manifesto de exportacao autorizada do Construmanager: validacao pura.
// Fixture 100% SINTETICA (nenhum dado real). Uso:
//   node scripts/test-construmanager-export-manifest.mjs

import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const {
  validateExportManifest,
  normalizeManifestDate,
  parseCsv,
  EXPORT_MANIFEST_COLUMNS,
} = await import("../apps/web/lib/integrations/construmanager/export-manifest.ts");

let passed = 0;
let failed = 0;
function check(name, condition) {
  console.log(`${condition ? "OK  " : "FAIL"} ${name}`);
  if (condition) passed += 1;
  else failed += 1;
}

const H = EXPORT_MANIFEST_COLUMNS.join(",");
const sha = (c) => c.repeat(64);

const csv = [
  H,
  `CM-1,Contrato,C-001,Contrato sintetico,00,15/03/2025,Autor A,Vigente,docs/c1.pdf,${sha("a")},1000`,
  `CM-2,Aditivo,AD-01,Aditivo sintetico,01,2026-01-10,Autor B,Aprovado,docs/ad1.pdf,${sha("b")},2000`,
  `CM-3,Correspondencia,COR-9,"Carta, com virgula",00,12/08/2026,Autor C,Enviado,docs/cor9.pdf,${sha("c")},300`,
  `CM-4,Ata,ATA-3,Ata sintetica,00,01/10/2026,Autor D,Final,docs/ata3.pdf,${sha("c")},300`,
  `CM-5,Medicao,MED-2,Medicao sintetica,02,31/02/2026,Autor E,Aprovada,docs/med2.xlsx,${sha("d")},50`,
  `CM-6,Protocolo,P-1,Protocolo sintetico,00,05/05/2026,,Recebido,../fuga.pdf,xyz,0`,
  `CM-7,Qualidade,Q-1,RNC sintetica,00,02/02/2025,Autor G,Aberto,docs/q1.pdf,${sha("e")},10`,
  `CM-1,Contrato,C-001,Contrato duplicado,00,15/03/2025,Autor A,Vigente,docs/c1b.pdf,${sha("f")},1000`,
].join("\r\n");

const v = validateExportManifest(csv);

check("sem erro de cabecalho", v.headerErrors.length === 0);
check("8 linhas lidas", v.summary.rows === 8);
check("5 aceitas", v.summary.accepted === 5);
check("3 rejeitadas", v.summary.rejected === 3);
check("campo com virgula entre aspas preservado como uma celula", parseCsv('a,b\n"x, y",z')[1][0] === "x, y");
check("data 31/02 rejeitada (nao inferida)", v.rows[4].ok === false && /data_documento/.test(v.rows[4].errors.join(" ")));
check("autor ausente rejeitado", /autor/.test(v.rows[5].errors.join(" ")));
check("caminho com .. rejeitado", /caminho relativo/.test(v.rows[5].errors.join(" ")));
check("sha invalido rejeitado", /sha256/.test(v.rows[5].errors.join(" ")));
check("tamanho 0 rejeitado", /vazio/.test(v.rows[5].errors.join(" ")));
check("origem+revisao duplicada rejeitada", /duplicados/.test(v.rows[7].errors.join(" ")));
check("SHA identico vira aviso, nao erro", v.rows[3].ok && v.rows[3].warnings.some((w) => /identico/.test(w)));
check("contagem de duplicados por SHA = 1", v.summary.duplicatesBySha === 1);
check("contrato anterior a janela exige revisao de vigencia", v.rows[0].normalized?.requiresVigencyReview === true);
check("aditivo dentro da janela nao exige", v.rows[1].normalized?.requiresVigencyReview === false);
check("qualidade anterior a janela: so aviso, sem vigencia", v.rows[6].ok && v.rows[6].normalized.preWindow && !v.rows[6].normalized.requiresVigencyReview);
check("mapeamento ATA -> ATA_REUNIAO", v.rows[3].normalized.suggestedKind === "ATA_REUNIAO");
check("mapeamento CONTRATO -> CONTRATO_BASE", v.rows[0].normalized.suggestedKind === "CONTRATO_BASE");
check("agregado por mes", v.summary.byMonth["2026-08"] === 1 && v.summary.byMonth["2026-10"] === 1);
check("manifesto sem coluna obrigatoria falha no cabecalho", validateExportManifest("origem_id,titulo\n1,x").headerErrors.length > 0);
check("manifesto vazio falha", validateExportManifest("").headerErrors.length === 1);
check("data DD/MM/AAAA e ISO normalizam igual", normalizeManifestDate("05/06/2026") === "2026-06-05" && normalizeManifestDate("2026-06-05") === "2026-06-05");
check("data invalida -> null", normalizeManifestDate("2026-13-01") === null);
check("ponto e virgula como delimitador", validateExportManifest(csv.replace(/,/g, ";").replace('"Carta; com virgula"', "Carta")).headerErrors.length === 0);

const med = validateExportManifest(`${H}\nCM-9,medição,M,t,0,2026-01-01,A,s,a.pdf,${sha("1")},5`).rows[0];
check("MEDICAO com acento aceita e mapeada", med.ok && med.normalized.sourceType === "MEDICAO");

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
