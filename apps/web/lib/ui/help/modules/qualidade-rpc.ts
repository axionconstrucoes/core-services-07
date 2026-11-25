// Catálogo de ajuda (Hover Text) dos elementos NOVOS da fase 3/D em Qualidade e Garantias: escrita por RPCs transacionais, justificativas e
// fontes obrigatórias, e as permissões que mudaram (reclassificar evidência, causa raiz/prazo, aceite do cliente, cancelar ação).
// Arquivo NOVO (não é editado em massa pelos demais agentes); é conectado por UMA linha de spread em modules/qualidade.ts e em modules/garantias.ts.
// Conteúdo lido do código: migrations 20261123300000..302000, lib/quality/ui-commands.ts, app/[projectId]/garantias/actions.ts e os componentes.
import type { FeatureHelpDefinition, HelpElementKind } from "../types";

const VERSION = "2026-11-21";
const PERM_MANAGE =
  "GESTOR, GERENTE ou ADMINISTRADOR (acc_project_tier >= MANAGE, via quality_can_manage). COLABORADOR registra, mas não executa esta ação; LEITURA só consulta. A autoridade é o banco: a tela apenas reflete.";
const PERM_REGISTER =
  "ADMINISTRADOR, GERENTE, GESTOR ou COLABORADOR (acc_project_tier >= REGISTER, via quality_can_register). LEITURA só consulta. A autoridade é o banco.";

function entry(module: "qualidade" | "garantias", id: string, kind: HelpElementKind, title: string, shortDescription: string, description: string, extra: Partial<FeatureHelpDefinition> = {}): FeatureHelpDefinition {
  return { id, kind, module, title, shortDescription, description, version: VERSION, ...extra };
}

export const QUALIDADE_RPC_HELP: FeatureHelpDefinition[] = [
  entry(
    "qualidade",
    "qualidade.rnc.campo-justificativa-dados",
    "field",
    "Campo Justificativa da alteração (causa raiz e prazo)",
    "Por que a causa raiz ou o prazo da RNC mudou; obrigatória quando já estavam definidos.",
    "Texto que explica a troca de uma causa raiz ou de um prazo que já estavam definidos na RNC. É obrigatório (mínimo de 10 caracteres) nesse caso; a primeira definição não exige justificativa. A justificativa, o valor anterior e o novo ficam na auditoria (ação QUALITY_NCR_UPDATE).",
    {
      purpose: "Manter rastreável quem mudou a análise de causa ou o prazo, quando e por quê, sem apagar o valor anterior.",
      permissions: PERM_MANAGE,
      source: "RPC quality_ncr_update_fields (audit_log_entries com antes/depois e justificativa).",
      missingData: "Vazio é aceito apenas na primeira definição da causa raiz ou do prazo.",
      limitations: ["Não substitui a investigação: registre a análise na própria causa raiz."],
    },
  ),
];

export const GARANTIAS_RPC_HELP: FeatureHelpDefinition[] = [
  entry(
    "garantias",
    "garantias.detalhe.aceite-evidencia",
    "field",
    "Evidência do aceite do cliente",
    "Evidência do caso (fato) que comprova o aceite: termo assinado, e-mail do cliente ou ata.",
    "Seleciona a evidência do PRÓPRIO caso que sustenta o aceite do cliente. Só evidências classificadas como FATO são oferecidas; o banco recusa evidência de outro caso, de outro projeto ou do tipo inferência/recomendação. A evidência usada no aceite fica travada: não pode ser reclassificada depois.",
    {
      purpose: "Garantir que o aceite do cliente tenha lastro rastreável, e não apenas um nome digitado.",
      permissions: PERM_MANAGE,
      source: "quality_warranty_cases.accepted_evidence_id (RPC quality_warranty_acceptance_register).",
      missingData: "Sem evidência não há aceite: o encerramento do caso continua bloqueado (CUSTOMER_ACCEPTANCE_REQUIRED).",
      consequences: ["O aceite vale para UM ciclo: novo reparo ou reabertura do caso descarta o aceite (a trilha fica na auditoria) e exige um novo aceite."],
    },
  ),
  entry(
    "garantias",
    "garantias.detalhe.reparo-fonte-custo",
    "field",
    "Fonte do custo do reparo",
    "Nota, orçamento ou medição que sustenta o valor de custo informado no reparo.",
    "Referência do documento que comprova o custo estimado ou realizado do reparo. Obrigatória quando qualquer valor é informado; sem valor o custo fica SEM DADOS (nunca zero). O banco recusa valor sem fonte (COST_SOURCE_REQUIRED).",
    {
      purpose: "Nunca aceitar número sem origem: todo custo aponta para a fonte que o sustenta.",
      permissions: PERM_REGISTER,
      source: "quality_warranty_repairs.cost_source_ref (RPC quality_warranty_repair_register).",
      missingData: "Vazio é aceito somente quando não há valor de custo.",
    },
  ),
  entry(
    "garantias",
    "garantias.detalhe.salvar-fonte-custo",
    "field",
    "Fonte dos custos do caso",
    "Documento que sustenta os custos estimado e realizado do caso; obrigatória ao informar ou alterar valores.",
    "Fonte (nota, orçamento, medição) dos valores de custo estimado e realizado do próprio caso. Ao informar ou alterar um valor de custo, a fonte é obrigatória (COST_SOURCE_REQUIRED). Alterar custos é decisão de gestão: o COLABORADOR não altera valores de custo do caso.",
    {
      purpose: "Garantir rastreabilidade dos números de custo do caso até o documento de origem.",
      permissions: PERM_MANAGE,
      source: "quality_warranty_cases.cost_source_ref (RPC quality_warranty_case_update).",
      missingData: "Sem valor de custo, a fonte pode ficar vazia (SEM DADOS).",
    },
  ),
  entry(
    "garantias",
    "garantias.detalhe.salvar-justificativa",
    "field",
    "Justificativa da alteração do caso",
    "Por que dados que definem cobertura ou custos já informados foram mudados.",
    "Texto (mínimo de 10 caracteres) exigido quando a edição muda dados já informados que definem a cobertura ou os custos: categoria de causa, sinalizadores de vício oculto e de solidez e segurança, datas de entrega, descoberta, comunicação e de garantia, termos de garantia, custos e RNC vinculada. A justificativa e o antes/depois ficam na auditoria (QUALITY_WARRANTY_UPDATE).",
    {
      purpose: "Tornar auditável toda mudança em dado que altera a análise de cobertura da garantia.",
      permissions: `${PERM_REGISTER} Campos descritivos (defeito, reclamação do cliente, fornecedor, contrato) podem ser editados por quem registra; causa, prazos, custos, termos e responsável exigem gestão.`,
      source: "RPC quality_warranty_case_update (audit_log_entries).",
      missingData: "Pode ficar vazia quando a edição só altera campos descritivos ou preenche dados antes vazios.",
    },
  ),
];
