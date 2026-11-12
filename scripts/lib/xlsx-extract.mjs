// Extrator XLSX do ACC. Duas rotas com a MESMA saída ("[aba - linha N] a | b"):
//  1) leitura em fluxo (ExcelJS stream reader): memória proporcional a uma linha, não ao arquivo;
//  2) leitura em memória (ExcelJS DOM) apenas como reserva se o fluxo falhar.
// Texto de célula nunca derruba a planilha: valor ilegível vira texto vazio e é contado em `celulasIlegiveis`.
import { Readable } from "node:stream";
import ExcelJS from "exceljs";

export const XLSX_EXTRACTOR = "exceljs";
export const XLSX_EXTRACTOR_VERSION = "2";

function safeCellText(cell, stats) {
  try {
    const text = cell.text;
    return text == null ? "" : String(text);
  } catch {
    // Ex.: fórmula/valor com resultado nulo ("Cannot read properties of null (reading 'toString')").
    try {
      const value = cell.value;
      if (value == null) return "";
      if (typeof value === "object") {
        const inner = value.result ?? value.text ?? value.richText?.map((part) => part?.text ?? "").join("");
        return inner == null ? "" : String(inner instanceof Date ? inner.toISOString() : inner);
      }
      return String(value);
    } catch {
      stats.celulasIlegiveis += 1;
      return "";
    }
  }
}

function rowText(row, stats, normalize) {
  const values = [];
  row.eachCell({ includeEmpty: true }, (cell) => values.push(normalize(safeCellText(cell, stats))));
  return values.join(" | ").trim();
}

async function viaStream(buffer, onRow) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([buffer]), {
    entries: "emit", sharedStrings: "cache", styles: "cache", hyperlinks: "ignore", worksheets: "emit",
  });
  for await (const worksheet of reader) {
    for await (const row of worksheet) onRow(worksheet.name, row.number, row);
  }
}

async function viaDom(buffer, onRow) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  workbook.eachSheet((worksheet) => {
    worksheet.eachRow({ includeEmpty: false }, (row, number) => onRow(worksheet.name, number, row));
  });
}

/** @returns {{lines: string[], stats: {rota: string, celulasIlegiveis: number, linhas: number}}} */
export async function readXlsxLines(buffer, normalize = (value) => String(value ?? "").trim()) {
  let lastError = null;
  for (const [rota, reader] of [["fluxo", viaStream], ["memoria", viaDom]]) {
    const stats = { rota, celulasIlegiveis: 0, linhas: 0 };
    const lines = [];
    try {
      await reader(buffer, (sheetName, number, row) => {
        const text = rowText(row, stats, normalize);
        if (!text) return;
        stats.linhas += 1;
        lines.push({ sheet: sheetName, row: number, text });
      });
      return { lines, stats };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Falha ao ler a planilha XLSX.");
}
