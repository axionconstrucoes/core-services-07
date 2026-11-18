// A classificação "DESENHO" é a única fonte de verdade para separar
// desenhos/projetos técnicos dos demais documentos. Não inferir pelo
// nome do arquivo ou pasta, pois isso pode deslocar documentos jurídicos.
import type { ManagedDocument } from "@/lib/document-management";

export function isTechnicalProjectDocument(document: Pick<ManagedDocument, "kind" | "parentDocumentId">): boolean {
  // Anexos formalmente incorporados ao contrato permanecem também visíveis
  // no grupo contratual para preservar a referência jurídica.
  return document.kind === "DESENHO";
}

export function partitionTechnicalProjects<T extends Pick<ManagedDocument, "kind" | "parentDocumentId">>(documents: readonly T[]): {
  projects: T[];
  otherDocuments: T[];
} {
  const projects: T[] = [];
  const otherDocuments: T[] = [];
  for (const document of documents) {
    (isTechnicalProjectDocument(document) ? projects : otherDocuments).push(document);
  }
  return { projects, otherDocuments };
}

/** A lista usa o arquivo original; se ausente, o título cadastrado. */
export function projectFileName(document: Pick<ManagedDocument, "title" | "versions">): string {
  return document.versions[0]?.originalFileName?.trim() || document.title;
}

/** O assunto vem do resumo explicitamente cadastrado, nunca de interpretação do nome. */
export function projectSubject(document: Pick<ManagedDocument, "versions">): string {
  return document.versions[0]?.summary?.trim() || "Não informado";
}

export function projectDocumentDate(document: Pick<ManagedDocument, "createdAt" | "versions">): string {
  return document.versions[0]?.documentDate || document.createdAt;
}
