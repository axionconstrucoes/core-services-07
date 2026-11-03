// Telefone internacional (E.164): "+" + código do país + número, 8 a 15 dígitos no total. Espelha a validação do banco
// (set_person_whatsapp_contact / CHECK whatsapp_phone_e164_check).

const E164 = /^\+[1-9][0-9]{7,14}$/;

export function normalizeInternationalPhone(raw: string | null | undefined): string | null {
  let value = (raw ?? "").replace(/[\s().-]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  return E164.test(value) ? value : null;
}

/** Telefone mascarado para log/auditoria: mantém o prefixo (+CC) e os 4 últimos dígitos. */
export function maskPhone(phoneE164: string): string {
  if (phoneE164.length <= 7) return "*".repeat(phoneE164.length);
  return `${phoneE164.slice(0, 3)}${"*".repeat(phoneE164.length - 7)}${phoneE164.slice(-4)}`;
}
