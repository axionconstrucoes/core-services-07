// Construtor e textos-padrão do catálogo de ajuda do módulo "seguros" (arquivo de apoio EXCLUSIVO do agente do módulo).
import type { FeatureHelpDefinition, HelpElementKind } from "../types";

export const SEGUROS_VERSION = "2026-11-20";

export const P_READ = "Qualquer membro ativo do projeto consulta (nível READ de insurance_access). A interface espelha a regra, mas a autoridade é a RLS do banco.";
export const P_REGISTER = "Administrador, Gestor, Gerente ou Colaborador (nível REGISTER). Perfil de leitura apenas consulta; o banco recusa a escrita mesmo que a tela fosse burlada.";
export const P_MANAGE = "Administrador, Gestor ou Gerente (nível MANAGE). Colaborador e Leitura não executam; o banco recusa a escrita mesmo que a tela fosse burlada.";
export const P_ADMIN = "Somente Administrador (nível ADMIN). Os demais perfis veem o botão desabilitado e o banco recusa o pedido.";

export const HUMAN = "Toda conclusão, minuta ou comparação exibida é apoio à decisão e exige revisão humana (jurídico/seguros) antes de qualquer posição ou comunicação.";

type Extra = Partial<Omit<FeatureHelpDefinition, "id" | "kind" | "module" | "version" | "title" | "shortDescription" | "description">>;

/** Cria uma entrada do módulo: o id recebe o prefixo "seguros." (formato modulo.tela.elemento). */
export function seg(id: string, kind: HelpElementKind, title: string, shortDescription: string, description: string, extra: Extra = {}): FeatureHelpDefinition {
  if (shortDescription.length > 160) throw new Error(`shortDescription > 160 em seguros.${id}`);
  return { id: `seguros.${id}`, kind, module: "seguros", version: SEGUROS_VERSION, title, shortDescription, description, ...extra };
}
