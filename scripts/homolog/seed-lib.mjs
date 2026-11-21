// Parte PURA do seed (testável sem banco): mapa de perfis, obras fictícias e parser de contas.
export const ROLE_MAP = Object.freeze({
  "P-LEI": { project: "TESTE", permission: "LEITURA" },
  "P-COL": { project: "TESTE", permission: "COLABORADOR" },
  "P-GES": { project: "TESTE", permission: "GESTOR" },
  "P-GES2": { project: "TESTE", permission: "GESTOR" },
  "P-GER": { project: "TESTE", permission: "GESTOR" }, // não existe papel GERENTE no pré-cadastro: GERENTE = GESTOR (nível MANAGE) de OUTRA pessoa
  "P-ADM": { project: "TESTE", permission: "ADMINISTRADOR" },
  "P-ADM2": { project: "TESTE 2", permission: "ADMINISTRADOR" }, // sem vínculo com a obra TESTE
  "P-INA": { project: "TESTE", permission: "COLABORADOR", inactive: true }, // após o 1º login, a membership é inativada
  "P-PEN": { project: "TESTE", permission: "COLABORADOR", pendingOnly: true }, // convite pendente: a pessoa NÃO deve entrar
});

export const PROJECTS = Object.freeze([
  { code: "TESTE", name: "TESTE (homologação)", client: "Cliente Fictício TESTE", location: "Local fictício", contract_number: "TESTE-0001" },
  { code: "TESTE-2", name: "TESTE 2 (homologação)", client: "Cliente Fictício TESTE 2", location: "Local fictício", contract_number: "TESTE-0002" },
]);

export function parseAccounts(raw) {
  const out = [];
  for (const part of String(raw ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const [code, email] = part.split("=").map((s) => s?.trim());
    if (!code || !email) throw new Error(`entrada inválida: "${part}" (use CODIGO=email)`);
    if (!ROLE_MAP[code]) throw new Error(`código desconhecido: ${code}`);
    const e = email.toLowerCase();
    if (!/^[^@\s]+@axion\.com\.br$/.test(e)) throw new Error(`${code}: só contas @axion.com.br (login do app e pré-cadastro recusam outros domínios)`);
    out.push({ code, email: e, ...ROLE_MAP[code] });
  }
  if (new Set(out.map((a) => a.email)).size !== out.length) throw new Error("e-mail repetido: cada perfil exige uma PESSOA/conta diferente");
  return out;
}

