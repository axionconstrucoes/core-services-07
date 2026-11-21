// Documento fiscal brasileiro (CPF/CNPJ): normalização e validação pelos DÍGITOS VERIFICADORES. Espelha insurance_tax_id_valid (SQL).
// Nunca inventa documento: sem dígitos => null. Puro, sem I/O.

/** Só os dígitos; vazio vira null. */
export function taxIdDigits(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D+/g, "");
  return d.length ? d : null;
}

const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** CPF (11 dígitos) ou CNPJ (14) com dígitos verificadores corretos e sem todos os dígitos iguais. */
export function isValidTaxId(v: string | null | undefined): boolean {
  const d = taxIdDigits(v);
  if (!d || (d.length !== 11 && d.length !== 14) || /^(\d)\1+$/.test(d)) return false;
  const n = [...d].map(Number);
  if (d.length === 11) {
    let s = 0;
    for (let i = 0; i < 9; i += 1) s += n[i] * (10 - i);
    let dv = (s * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== n[9]) return false;
    s = 0;
    for (let i = 0; i < 10; i += 1) s += n[i] * (11 - i);
    dv = (s * 10) % 11;
    if (dv === 10) dv = 0;
    return dv === n[10];
  }
  let s = 0;
  for (let i = 0; i < 12; i += 1) s += n[i] * W1[i];
  let dv = s % 11 < 2 ? 0 : 11 - (s % 11);
  if (dv !== n[12]) return false;
  s = 0;
  for (let i = 0; i < 13; i += 1) s += n[i] * W2[i];
  dv = s % 11 < 2 ? 0 : 11 - (s % 11);
  return dv === n[13];
}

/** Normalização de TEXTO para comparação (espelha f4b_norm_text): sem acentos, minúsculas, só [a-z0-9] separados por um espaço. */
export function normalizeText(v: string | null | undefined): string {
  return (v ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Igualdade de parte (espelha f4b_party_equal): documentos (dígitos) quando AMBOS os têm; senão, nomes normalizados presentes e iguais. */
export function partyEqual(a: { name?: string | null; taxId?: string | null }, b: { name?: string | null; taxId?: string | null }): boolean {
  const ta = taxIdDigits(a.taxId);
  const tb = taxIdDigits(b.taxId);
  if (ta && tb) return ta === tb;
  const na = normalizeText(a.name);
  return na !== "" && na === normalizeText(b.name);
}
