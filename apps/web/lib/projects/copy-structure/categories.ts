// Categorias de configuração que podem ser copiadas de um projeto para outro.
//
// A interface "Copiar estrutura de outro projeto" é montada a partir deste registro. Hoje só a categoria
// "team" (equipe e perfis de acesso) existe e está disponível. Novas categorias entram aqui (e ganham o
// seu próprio plano/serviço) sem alterar o fluxo do assistente; as demais NÃO estão implementadas.

export type StructureCategoryId = "team";

export interface StructureCategory {
  id: StructureCategoryId;
  label: string;
  description: string;
  available: boolean;
}

export const STRUCTURE_CATEGORIES: readonly StructureCategory[] = [
  {
    id: "team",
    label: "Equipe e perfis de acesso",
    description:
      "Vincula ao projeto de destino as pessoas já cadastradas no projeto de origem, com perfil e área revisados por você. " +
      "Não copia documentos, registros, credenciais, autorizações de e-mail, destinatários de alertas nem pastas do Drive.",
    available: true,
  },
];

export function availableStructureCategories(): StructureCategory[] {
  return STRUCTURE_CATEGORIES.filter((category) => category.available);
}
