// Catálogo de ajuda (Hover Text) da persistência dos PARECERES de cobertura de garantia (Fase 3 / E). Arquivo NOVO do agente E; é espalhado
// em UMA linha em modules/garantias.ts (o manifesto de garantias é derivado desse catálogo). Conteúdo lido do código:
// migrations 20261123400000/401000 (quality_warranty_coverage_opinions, quality_warranty_coverage_check, quality_warranty_opinion_save/versions),
// lib/garantias/opinion.ts e components/garantias/coverage-history.tsx.
import type { FeatureHelpDefinition, HelpElementKind } from "../types";

const V = "2026-11-23";
const REG = "Gravar o parecer: Administrador, Gerente, Gestor e Colaborador (nível REGISTER de acc_project_tier). Perfil Leitura apenas consulta. A autoridade é o banco (RPC quality_warranty_opinion_save e RLS por projeto).";
const READ = "Qualquer membro ativo do projeto consulta as versões (RLS por projeto, quality_can_read).";
const NOT_LEGAL = "Apoio à decisão humana: NÃO é parecer jurídico. A conclusão é DERIVADA dos itens e sinais; nenhuma conclusão é digitada livremente.";

type Extra = Partial<Omit<FeatureHelpDefinition, "id" | "title" | "shortDescription" | "description" | "kind" | "module" | "version">>;
const h = (id: string, kind: HelpElementKind, title: string, shortDescription: string, description: string, extra: Extra = {}): FeatureHelpDefinition => ({
  id,
  kind,
  module: "garantias",
  version: V,
  title,
  shortDescription,
  description,
  ...extra,
});

export const GARANTIAS_PARECERES_HELP: FeatureHelpDefinition[] = [
  h("garantias.detalhe.parecer-secao", "message", "Parecer de cobertura gravado", "Grava a consulta de cobertura como uma nova versão (append-only) e lista as versões anteriores.",
    "A consulta de cobertura (16 itens e sinais) pode ser gravada. Cada gravação cria uma NOVA versão do parecer, apontando para a anterior; nada é sobrescrito nem apagado. O servidor recalcula a conclusão a partir dos itens e sinais e o banco a reverifica: conclusão digitada livremente é impossível.",
    { source: "quality_warranty_coverage_opinions", permissions: REG, limitations: [NOT_LEGAL, "A verificação de linguagem proibida (cinco anos universal, exclusão automática por expiração) é feita no servidor antes de gravar; o banco garante estrutura, fonte por item e conclusão derivada."], humanReview: "Toda versão exige revisão humana; a decisão final é do responsável (Jurídico/Gestão)." }),
  h("garantias.detalhe.parecer-nota", "field", "Nota da versão do parecer", "Anotação opcional sobre o motivo desta reavaliação.", "Texto livre (até 4000 caracteres) gravado junto com a versão. Não altera a conclusão, que é derivada.",
    { permissions: REG, source: "quality_warranty_coverage_opinions.note" }),
  h("garantias.detalhe.parecer-salvar", "button", "Gravar parecer", "Grava os 16 itens e os sinais como uma nova versão do parecer.",
    "Envia itens, sinais e a versão do parecer que você viu. O banco recusa: item preenchido sem fonte (ITEM_SOURCE_REQUIRED), conclusão que não confere com a derivação (CONCLUSION_MISMATCH) e versão defasada (VERSION_CONFLICT, quando outra pessoa gravou antes).",
    { permissions: REG, consequences: ["Cria a versão N+1 com autor, data, versão do motor/referências e auditoria.", "Em conflito de versão nada é gravado: recarregue, confira a versão mais recente e refaça."], limitations: [NOT_LEGAL] }),
  h("garantias.detalhe.parecer-versoes", "table", "Versões do parecer", "Histórico das versões gravadas, da mais recente para a mais antiga.",
    "Lista cada versão com número, data, autor, conclusão derivada, quantidade de itens com dado e de itens SEM DADOS, versão do motor/referências usada e se há encaminhamento ao responsável humano. A versão anterior nunca é alterada.",
    { source: "quality_warranty_coverage_opinions (RPC quality_warranty_opinion_versions)", permissions: READ, missingData: "Nenhuma versão gravada: SEM DADOS (a consulta ainda não foi gravada)." }),
  h("garantias.detalhe.parecer-carregar", "button", "Carregar versão no formulário", "Recarrega os itens e sinais de uma versão gravada para reavaliar.",
    "Copia os itens, fontes e sinais da versão escolhida para o formulário da consulta (nada é gravado até acionar Gravar parecer). Serve para reavaliar partindo de uma versão anterior.",
    { consequences: ["Substitui o conteúdo atual do formulário (não grava nada)."] }),
  h("garantias.detalhe.parecer-desatualizada", "status", "Versão com motor ou referências diferentes", "A versão foi gravada com outra versão do motor ou do índice de referências.",
    "Compara a engine_version gravada com a versão atual do código/lista de itens e do conjunto de referências. Se diferem, a reavaliação é recomendada (não obrigatória): a conclusão gravada continua válida como histórico.",
    { source: "quality_warranty_coverage_opinions.engine_version" }),
];
