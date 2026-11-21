// Especificação DECLARATIVA dos formulários de seguros: campos, validação local e montagem do p_data das RPCs.
// Dado puro (sem JSX) para ser testado em Node. Cada campo declara o helpId (Hover Text) com literal, de modo que o inventário
// de ajuda (scripts/test-help-catalog.mjs) comprova que o texto existe e é renderizado. A validação local espelha — não substitui —
// os CHECKs e as RPCs do banco (que continuam sendo a autoridade).
import { CHANGE_KIND_LABEL, CLAIM_KIND_LABEL, CAUCAO_FORM_LABEL, CHANNEL_TYPE_LABEL, CLAUSE_KIND_LABEL, DOSSIER_STATUS_LABEL, GUARANTEE_STATUS_LABEL, MODALITY_LABEL, OTHER_GUARANTEE_TYPE_LABEL, PARTY_ROLE_LABEL, POLICY_STATUS_LABEL, CLAIM_STAGE_LABEL } from "./labels";
import { parseDecimalPtBr } from "./format";
import { checkClaimGrounds, checkGuaranteeUpdate, GROUNDS_MESSAGES, GUARANTEE_UPDATE_MESSAGES } from "../insurance/grounds";
import { COHERENCE_FIELDS, COHERENCE_FIELD_LABELS } from "../insurance/coherence";

export type FieldType = "text" | "textarea" | "lines" | "date" | "money" | "int" | "select" | "tristate" | "document" | "checkbox" | "multi";

export type OptionsKey =
  | "documents"
  | "policies"
  | "bankGuarantees"
  | "advances"
  | "policyClauses"
  | "instruments"
  | "officialChannels";

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  helpId: string;
  required?: boolean;
  /** Opções estáticas (enum do banco). */
  options?: { value: string; label: string }[];
  /** Opções dinâmicas fornecidas pela tela (documentos, apólices, ...). */
  optionsKey?: OptionsKey;
  /** "data" -> vai em p_data; "arg" -> argumento próprio da RPC (motivo, nota, confirmação...). */
  target?: "data" | "arg";
  minLength?: number;
  placeholder?: string;
  hint?: string;
  /** Valor inicial para formulários de criação. */
  defaultValue?: string;
}

export interface FormSpec {
  id: string;
  title: string;
  /** helpId do formulário (ícone ao lado do título). */
  helpId: string;
  submitLabel: string;
  /** helpId da ação de envio do formulário (ícone ao lado do botão). */
  submitHelpId: string;
  /** Exige documento-fonte OU referência de fonte (CHECK source_document_id/source_ref do banco). */
  requireSource?: boolean;
  /** Nomes dos campos [documento, referência] da fonte exigida (padrão: source_document_id / source_ref). */
  sourceFields?: [string, string];
  /** Atualização: só as chaves alteradas vão no p_data (RPC usa `p_data ? 'chave'`). */
  onlyChanged?: boolean;
  fields: FieldSpec[];
}

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

const SRC_DOC: FieldSpec = { name: "source_document_id", label: "Documento-fonte", type: "document", helpId: "seguros.campos.documento-fonte", optionsKey: "documents" };
const SRC_REF: FieldSpec = { name: "source_ref", label: "Referência da fonte (página, cláusula, protocolo)", type: "text", helpId: "seguros.campos.referencia-fonte" };
const NOTES: FieldSpec = { name: "notes", label: "Observações", type: "textarea", helpId: "seguros.campos.observacoes" };
const REASON = (minLength = 10): FieldSpec => ({ name: "reason", label: "Motivo", type: "textarea", helpId: "seguros.campos.motivo", required: true, target: "arg", minLength });
const UPD_SRC_DOC: FieldSpec = { name: "update_source_document_id", label: "Documento-fonte da atualização", type: "document", helpId: "seguros.garantias.campo-atualizacao-fonte-documento", optionsKey: "documents", target: "arg" };
const UPD_SRC_REF: FieldSpec = { name: "update_source_ref", label: "Referência da fonte da atualização (aditivo, carta, protocolo)", type: "text", helpId: "seguros.garantias.campo-atualizacao-fonte-referencia", target: "arg" };
const UPD_REASON: FieldSpec = { name: "update_reason", label: "Motivo da atualização", type: "textarea", helpId: "seguros.garantias.campo-atualizacao-motivo", required: true, target: "arg", minLength: 10 };
const START: FieldSpec = { name: "start_date", label: "Início da vigência", type: "date", helpId: "seguros.campos.vigencia-inicio" };
const END: FieldSpec = { name: "end_date", label: "Fim da vigência", type: "date", helpId: "seguros.campos.vigencia-fim" };

const POLICY_COMMON: FieldSpec[] = [
  { name: "insurer_name", label: "Seguradora", type: "text", helpId: "seguros.apolices.campo-seguradora", required: true },
  { name: "policy_number", label: "Número da apólice", type: "text", helpId: "seguros.apolices.campo-numero" },
  { name: "broker_name", label: "Corretora", type: "text", helpId: "seguros.apolices.campo-corretora" },
  { name: "status", label: "Situação", type: "select", helpId: "seguros.apolices.campo-status", options: opts(POLICY_STATUS_LABEL) },
  { name: "coverage_start", label: "Início da vigência", type: "date", helpId: "seguros.campos.vigencia-inicio" },
  { name: "coverage_end", label: "Fim da vigência", type: "date", helpId: "seguros.campos.vigencia-fim" },
  { name: "max_amount", label: "Limite máximo da apólice (R$)", type: "money", helpId: "seguros.apolices.campo-limite-maximo" },
  { name: "contract_number", label: "Número do contrato-base", type: "text", helpId: "seguros.campos.contrato-numero" },
  { name: "contract_document_id", label: "Documento do contrato-base", type: "document", helpId: "seguros.campos.contrato-documento", optionsKey: "documents" },
  SRC_DOC,
  SRC_REF,
  NOTES,
];

export const FORMS = {
  policyCreate: {
    id: "policyCreate",
    title: "Nova apólice",
    helpId: "seguros.apolices.form-nova",
    submitLabel: "Registrar apólice",
    submitHelpId: "seguros.acoes.apolice-registrar",
    requireSource: true,
    fields: [{ name: "modality", label: "Modalidade", type: "select", helpId: "seguros.apolices.campo-modalidade", required: true, options: opts(MODALITY_LABEL) }, ...POLICY_COMMON],
  },
  policyNewVersion: {
    id: "policyNewVersion",
    title: "Nova versão da apólice",
    helpId: "seguros.apolices.form-nova-versao",
    submitLabel: "Gravar nova versão",
    submitHelpId: "seguros.acoes.apolice-nova-versao",
    onlyChanged: true,
    fields: [...POLICY_COMMON, REASON(10)],
  },
  partyAdd: {
    id: "partyAdd",
    title: "Adicionar parte à apólice",
    helpId: "seguros.apolices.form-parte",
    submitLabel: "Adicionar parte",
    submitHelpId: "seguros.acoes.parte-adicionar",
    requireSource: true,
    fields: [
      { name: "party_role", label: "Papel", type: "select", helpId: "seguros.apolices.campo-parte-papel", required: true, options: opts(PARTY_ROLE_LABEL) },
      { name: "identification_status", label: "Identificação", type: "select", helpId: "seguros.apolices.campo-parte-identificacao", required: true, defaultValue: "IDENTIFICADO", options: [{ value: "IDENTIFICADO", label: "Identificada" }, { value: "NAO_IDENTIFICADO", label: "NÃO identificada" }] },
      { name: "party_name", label: "Nome / razão social", type: "text", helpId: "seguros.apolices.campo-parte-nome" },
      { name: "tax_id", label: "CNPJ / CPF", type: "text", helpId: "seguros.apolices.campo-parte-documento-fiscal" },
      SRC_DOC,
      SRC_REF,
    ],
  },
  partyToggle: {
    id: "partyToggle",
    title: "Ativar ou desativar parte",
    helpId: "seguros.apolices.form-parte-ativa",
    submitLabel: "Confirmar",
    submitHelpId: "seguros.acoes.parte-ativar",
    fields: [REASON(10)],
  },
  clauseAdd: {
    id: "clauseAdd",
    title: "Adicionar cláusula, condição ou exclusão",
    helpId: "seguros.apolices.form-clausula",
    submitLabel: "Adicionar cláusula",
    submitHelpId: "seguros.acoes.clausula-adicionar",
    requireSource: true,
    fields: [
      { name: "kind", label: "Tipo", type: "select", helpId: "seguros.apolices.campo-clausula-tipo", required: true, options: opts(CLAUSE_KIND_LABEL) },
      { name: "title", label: "Título", type: "text", helpId: "seguros.apolices.campo-clausula-titulo", required: true },
      { name: "clause_identifier", label: "Identificação da cláusula no texto da apólice (ex.: Cláusula 4.2) — obrigatória para COBERTURA", type: "text", helpId: "seguros.apolices.campo-clausula-identificacao" },
      { name: "clause_text", label: "Texto", type: "textarea", helpId: "seguros.apolices.campo-clausula-texto" },
      { name: "applies_to", label: "Declara aplicar-se a", type: "multi", helpId: "seguros.apolices.campo-clausula-aplica-se", options: opts(CLAIM_KIND_LABEL) },
      { name: "amount", label: "Valor (R$)", type: "money", helpId: "seguros.apolices.campo-clausula-valor" },
      { name: "deadline_days", label: "Prazo em dias", type: "int", helpId: "seguros.apolices.campo-clausula-prazo-dias" },
      { name: "source_page", label: "Página", type: "text", helpId: "seguros.apolices.campo-clausula-pagina" },
      SRC_DOC,
      SRC_REF,
      { name: "verified", label: "Já conferida por humano com o texto da apólice", type: "checkbox", helpId: "seguros.apolices.campo-clausula-verificada" },
    ],
  },
  bankRegister: {
    id: "bankRegister",
    title: "Nova fiança bancária",
    helpId: "seguros.garantias.form-fianca",
    submitLabel: "Registrar fiança",
    submitHelpId: "seguros.acoes.fianca-registrar",
    requireSource: true,
    fields: [
      { name: "bank_name", label: "Banco", type: "text", helpId: "seguros.garantias.campo-banco", required: true },
      { name: "guarantee_number", label: "Número da fiança", type: "text", helpId: "seguros.garantias.campo-numero" },
      { name: "beneficiary_name", label: "Beneficiário", type: "text", helpId: "seguros.garantias.campo-beneficiario" },
      { name: "principal_name", label: "Afiançado (tomador)", type: "text", helpId: "seguros.garantias.campo-tomador" },
      { name: "amount", label: "Valor (R$)", type: "money", helpId: "seguros.garantias.campo-valor" },
      START,
      END,
      { name: "calls_on_first_demand", label: "Paga à primeira demanda?", type: "tristate", helpId: "seguros.garantias.campo-primeira-demanda" },
      { name: "claim_procedure_note", label: "Procedimento de cobrança conforme o instrumento", type: "textarea", helpId: "seguros.garantias.campo-procedimento" },
      { name: "status", label: "Situação", type: "select", helpId: "seguros.garantias.campo-status", options: opts(GUARANTEE_STATUS_LABEL) },
      { name: "contract_number", label: "Número do contrato-base", type: "text", helpId: "seguros.campos.contrato-numero" },
      SRC_DOC,
      SRC_REF,
      NOTES,
    ],
  },
  bankUpdate: {
    id: "bankUpdate",
    title: "Atualizar fiança bancária",
    helpId: "seguros.garantias.form-fianca-atualizar",
    submitLabel: "Gravar alteração",
    submitHelpId: "seguros.acoes.fianca-atualizar",
    onlyChanged: true,
    requireSource: true,
    sourceFields: ["update_source_document_id", "update_source_ref"],
    fields: [
      { name: "amount", label: "Valor (R$)", type: "money", helpId: "seguros.garantias.campo-valor" },
      END,
      { name: "calls_on_first_demand", label: "Paga à primeira demanda?", type: "tristate", helpId: "seguros.garantias.campo-primeira-demanda" },
      { name: "claim_procedure_note", label: "Procedimento de cobrança conforme o instrumento", type: "textarea", helpId: "seguros.garantias.campo-procedimento" },
      { name: "status", label: "Situação", type: "select", helpId: "seguros.garantias.campo-status", options: opts(GUARANTEE_STATUS_LABEL) },
      NOTES,
      UPD_SRC_DOC,
      UPD_SRC_REF,
      UPD_REASON,
    ],
  },
  otherRegister: {
    id: "otherRegister",
    title: "Nova caução, carta de fiança não bancária ou outra garantia",
    helpId: "seguros.garantias.form-outra",
    submitLabel: "Registrar garantia",
    submitHelpId: "seguros.acoes.outra-registrar",
    requireSource: true,
    fields: [
      { name: "guarantee_type", label: "Tipo", type: "select", helpId: "seguros.garantias.campo-tipo", required: true, options: opts(OTHER_GUARANTEE_TYPE_LABEL) },
      { name: "caucao_form", label: "Forma da caução", type: "select", helpId: "seguros.garantias.campo-forma-caucao", options: opts(CAUCAO_FORM_LABEL) },
      { name: "issuer_name", label: "Emissor", type: "text", helpId: "seguros.garantias.campo-emissor" },
      { name: "beneficiary_name", label: "Beneficiário", type: "text", helpId: "seguros.garantias.campo-beneficiario" },
      { name: "principal_name", label: "Afiançado (tomador)", type: "text", helpId: "seguros.garantias.campo-tomador" },
      { name: "amount", label: "Valor (R$)", type: "money", helpId: "seguros.garantias.campo-valor" },
      START,
      END,
      { name: "release_conditions", label: "Condições de liberação / devolução", type: "textarea", helpId: "seguros.garantias.campo-liberacao" },
      { name: "status", label: "Situação", type: "select", helpId: "seguros.garantias.campo-status", options: opts(GUARANTEE_STATUS_LABEL) },
      { name: "contract_number", label: "Número do contrato-base", type: "text", helpId: "seguros.campos.contrato-numero" },
      SRC_DOC,
      SRC_REF,
      NOTES,
    ],
  },
  otherUpdate: {
    id: "otherUpdate",
    title: "Atualizar outra garantia",
    helpId: "seguros.garantias.form-outra-atualizar",
    submitLabel: "Gravar alteração",
    submitHelpId: "seguros.acoes.outra-atualizar",
    onlyChanged: true,
    requireSource: true,
    sourceFields: ["update_source_document_id", "update_source_ref"],
    fields: [
      { name: "amount", label: "Valor (R$)", type: "money", helpId: "seguros.garantias.campo-valor" },
      END,
      { name: "release_conditions", label: "Condições de liberação / devolução", type: "textarea", helpId: "seguros.garantias.campo-liberacao" },
      { name: "status", label: "Situação", type: "select", helpId: "seguros.garantias.campo-status", options: opts(GUARANTEE_STATUS_LABEL) },
      NOTES,
      UPD_SRC_DOC,
      UPD_SRC_REF,
      UPD_REASON,
    ],
  },
  channelRegister: {
    id: "channelRegister",
    title: "Cadastrar canal oficial",
    helpId: "seguros.canais.form-canal",
    submitLabel: "Cadastrar canal",
    submitHelpId: "seguros.acoes.canal-cadastrar",
    requireSource: true,
    fields: [
      { name: "entity_name", label: "Seguradora ou banco", type: "text", helpId: "seguros.canais.campo-entidade", required: true },
      { name: "channel_type", label: "Tipo de canal", type: "select", helpId: "seguros.canais.campo-tipo", required: true, options: opts(CHANNEL_TYPE_LABEL) },
      { name: "channel_value", label: "Endereço do canal (e-mail, portal, endereço, telefone)", type: "text", helpId: "seguros.canais.campo-valor", required: true },
      { name: "policy_id", label: "Apólice vinculada", type: "select", helpId: "seguros.canais.campo-apolice", optionsKey: "policies" },
      { name: "bank_guarantee_id", label: "Fiança bancária vinculada", type: "select", helpId: "seguros.canais.campo-fianca", optionsKey: "bankGuarantees" },
      SRC_DOC,
      SRC_REF,
    ],
  },
  endorsementRequest: {
    id: "endorsementRequest",
    title: "Registrar pedido de endosso",
    helpId: "seguros.endossos.form-pedido",
    submitLabel: "Registrar pedido (não é endosso emitido)",
    submitHelpId: "seguros.acoes.endosso-solicitar",
    fields: [
      { name: "policy_id", label: "Apólice", type: "select", helpId: "seguros.endossos.campo-apolice", required: true, optionsKey: "policies", target: "arg" },
      { name: "requested_text", label: "Texto do endosso solicitado", type: "textarea", helpId: "seguros.endossos.campo-texto-solicitado", required: true },
      { name: "request_document_id", label: "Documento do pedido", type: "document", helpId: "seguros.endossos.campo-documento-pedido", optionsKey: "documents" },
      { name: "request_ref", label: "Referência do pedido (protocolo, e-mail)", type: "text", helpId: "seguros.endossos.campo-referencia-pedido" },
      { name: "change_kinds", label: "O que o endosso altera (marque todos que se aplicam)", type: "multi", helpId: "seguros.endossos.campo-classificacao", options: opts(CHANGE_KIND_LABEL), hint: "Sem classificação, o endosso é tratado como CRÍTICO e exige dupla conferência independente." },
    ],
  },
  endorsementIssue: {
    id: "endorsementIssue",
    title: "Registrar endosso EMITIDO pela seguradora",
    helpId: "seguros.endossos.form-emissao",
    submitLabel: "Registrar emissão",
    submitHelpId: "seguros.acoes.endosso-emitir",
    fields: [
      { name: "issued_number", label: "Número do endosso emitido", type: "text", helpId: "seguros.endossos.campo-numero-emitido", required: true },
      { name: "issued_document_id", label: "Documento do endosso emitido", type: "document", helpId: "seguros.endossos.campo-documento-emitido", required: true, optionsKey: "documents" },
      { name: "issued_text", label: "Texto do endosso emitido (copie do documento emitido)", type: "textarea", helpId: "seguros.endossos.campo-texto-emitido", required: true },
      { name: "issued_at", label: "Data de emissão", type: "date", helpId: "seguros.endossos.campo-data-emissao" },
      { name: "change_kinds", label: "Itens que o texto EMITIDO altera (só acrescenta ao já declarado)", type: "multi", helpId: "seguros.endossos.campo-classificacao-emissao", options: opts(CHANGE_KIND_LABEL), hint: "Marque se o texto emitido altera item crítico que o pedido não declarou. Nunca reduz a criticidade já declarada." },
    ],
  },
  endorsementRefuse: {
    id: "endorsementRefuse",
    title: "Registrar recusa do endosso",
    helpId: "seguros.endossos.form-recusa",
    submitLabel: "Registrar recusa",
    submitHelpId: "seguros.acoes.endosso-recusar",
    fields: [{ name: "refusal_note", label: "Motivo da recusa", type: "textarea", helpId: "seguros.endossos.campo-motivo-recusa", required: true, minLength: 10 }],
  },
  endorsementVerify: {
    id: "endorsementVerify",
    title: "Conferir o texto emitido",
    helpId: "seguros.endossos.form-conferencia",
    submitLabel: "Conferir e tornar efetivo",
    submitHelpId: "seguros.acoes.endosso-conferir",
    fields: [{ name: "divergence_note", label: "Divergência entre solicitado e emitido (obrigatória se os textos diferem)", type: "textarea", helpId: "seguros.endossos.campo-divergencia" }],
  },
  endorsementReviewRefuse: {
    id: "endorsementReviewRefuse",
    title: "Recusar a conferência do endosso",
    helpId: "seguros.endossos.form-conferencia-recusa",
    submitLabel: "Registrar recusa da conferência",
    submitHelpId: "seguros.acoes.endosso-conferencia-recusar",
    fields: [{ name: "note", label: "Motivo da recusa da conferência (mínimo de 20 caracteres)", type: "textarea", helpId: "seguros.endossos.campo-nota-recusa-conferencia", required: true, minLength: 20 }],
  },
  advanceRegister: {
    id: "advanceRegister",
    title: "Registrar adiantamento",
    helpId: "seguros.adiantamentos.form-adiantamento",
    submitLabel: "Registrar adiantamento",
    submitHelpId: "seguros.acoes.adiantamento-registrar",
    requireSource: true,
    fields: [
      { name: "purpose", label: "Finalidade", type: "text", helpId: "seguros.adiantamentos.campo-finalidade", required: true },
      { name: "advanced_amount", label: "Valor adiantado (R$)", type: "money", helpId: "seguros.adiantamentos.campo-valor-adiantado", required: true },
      { name: "advance_date", label: "Data do adiantamento", type: "date", helpId: "seguros.adiantamentos.campo-data" },
      { name: "policy_id", label: "Apólice vinculada", type: "select", helpId: "seguros.adiantamentos.campo-apolice", optionsKey: "policies" },
      { name: "guaranteed_limit", label: "Limite garantido (R$)", type: "money", helpId: "seguros.adiantamentos.campo-limite-garantido" },
      { name: "balance_due_informed", label: "Saldo devido informado (R$)", type: "money", helpId: "seguros.adiantamentos.campo-saldo-devido" },
      { name: "indemnifiable_informed", label: "Valor indenizável informado (R$)", type: "money", helpId: "seguros.adiantamentos.campo-indenizavel" },
      { name: "application_document_id", label: "Documento que comprova a aplicação", type: "document", helpId: "seguros.adiantamentos.campo-documento-aplicacao", optionsKey: "documents" },
      { name: "contract_number", label: "Número do contrato-base", type: "text", helpId: "seguros.campos.contrato-numero" },
      SRC_DOC,
      SRC_REF,
      NOTES,
    ],
  },
  advanceAmortize: {
    id: "advanceAmortize",
    title: "Registrar amortização",
    helpId: "seguros.adiantamentos.form-amortizacao",
    submitLabel: "Registrar amortização",
    submitHelpId: "seguros.acoes.adiantamento-amortizar",
    requireSource: true,
    fields: [
      { name: "amount", label: "Valor amortizado (R$)", type: "money", helpId: "seguros.adiantamentos.campo-amortizacao-valor", required: true },
      { name: "amortized_on", label: "Data da amortização", type: "date", helpId: "seguros.adiantamentos.campo-amortizacao-data" },
      SRC_DOC,
      SRC_REF,
      { name: "note", label: "Observação", type: "textarea", helpId: "seguros.campos.observacoes" },
    ],
  },
  claimOpen: {
    id: "claimOpen",
    title: "Abrir sinistro ou evento",
    helpId: "seguros.sinistros.form-abrir",
    submitLabel: "Abrir evento",
    submitHelpId: "seguros.acoes.sinistro-abrir",
    requireSource: true,
    fields: [
      { name: "stage", label: "Estágio inicial", type: "select", helpId: "seguros.sinistros.campo-estagio-inicial", required: true, defaultValue: "AVISO", options: ["EXPECTATIVA", "AVISO", "RECLAMACAO"].map((v) => ({ value: v, label: CLAIM_STAGE_LABEL[v] })) },
      { name: "claim_kind", label: "Tipo de evento", type: "select", helpId: "seguros.sinistros.campo-tipo", required: true, options: opts(CLAIM_KIND_LABEL) },
      { name: "title", label: "Título do evento", type: "text", helpId: "seguros.sinistros.campo-titulo", required: true },
      { name: "instrument", label: "Instrumento (apólice, fiança ou outra garantia)", type: "select", helpId: "seguros.sinistros.campo-instrumento", required: true, optionsKey: "instruments", target: "arg" },
      { name: "no_instrument_reason", label: "Motivo de não haver instrumento (obrigatório se 'Sem instrumento')", type: "textarea", helpId: "seguros.sinistros.campo-sem-instrumento" },
      { name: "advance_id", label: "Adiantamento relacionado", type: "select", helpId: "seguros.sinistros.campo-adiantamento", optionsKey: "advances" },
      { name: "occurrence_date", label: "Data da ocorrência", type: "date", helpId: "seguros.sinistros.campo-data-ocorrencia" },
      { name: "claimed_amount", label: "Valor reclamado (R$)", type: "money", helpId: "seguros.sinistros.campo-valor-reclamado" },
      { name: "protocol", label: "Protocolo", type: "text", helpId: "seguros.sinistros.campo-protocolo" },
      { name: "notice_deadline_at", label: "Prazo de aviso (somente se cadastrado)", type: "date", helpId: "seguros.sinistros.campo-prazo-aviso" },
      { name: "notice_deadline_basis", label: "Base do prazo de aviso (cláusula/lei)", type: "text", helpId: "seguros.sinistros.campo-base-prazo-aviso" },
      { name: "contractual_basis_clause_id", label: "Cláusula que prevê a expectativa", type: "select", helpId: "seguros.sinistros.campo-clausula-base", optionsKey: "policyClauses" },
      { name: "contractual_basis_note", label: "Base contratual (nota; obrigatória na expectativa sem cláusula)", type: "textarea", helpId: "seguros.sinistros.campo-nota-base" },
      SRC_DOC,
      SRC_REF,
    ],
  },
  claimAdvance: {
    id: "claimAdvance",
    title: "Avançar o estágio do evento",
    helpId: "seguros.sinistros.form-avancar",
    submitLabel: "Registrar nova etapa",
    submitHelpId: "seguros.acoes.sinistro-avancar",
    fields: [
      { name: "note", label: "Nota da etapa", type: "textarea", helpId: "seguros.sinistros.campo-nota-etapa", target: "data" },
      { name: "protocol", label: "Protocolo da etapa", type: "text", helpId: "seguros.sinistros.campo-protocolo" },
      { name: "document_id", label: "Documento da etapa (fonte da fundamentação)", type: "document", helpId: "seguros.sinistros.campo-documento-etapa", optionsKey: "documents" },
      { name: "source_refs", label: "Fontes da fundamentação (uma por linha: carta, e-mail, cláusula, protocolo)", type: "lines", helpId: "seguros.sinistros.campo-fontes-etapa", target: "data" },
      { name: "decision_outcome", label: "Resultado da decisão", type: "select", helpId: "seguros.sinistros.campo-resultado-decisao", options: [{ value: "DEFERIDO", label: "Deferido" }, { value: "INDEFERIDO", label: "Indeferido" }, { value: "PARCIAL", label: "Parcial" }] },
    ],
  },
  instrumentTerms: {
    id: "instrumentTerms",
    title: "Termos do instrumento para a conferência de coerência",
    helpId: "seguros.coerencia.form-termos",
    submitLabel: "Gravar termos (nova versão)",
    submitHelpId: "seguros.acoes.termos-gravar",
    requireSource: true,
    fields: [
      { name: "insured_name", label: "Segurado (nome / razão social)", type: "text", helpId: "seguros.coerencia.campo-segurado-nome" },
      { name: "insured_tax_id", label: "Segurado (CNPJ / CPF)", type: "text", helpId: "seguros.coerencia.campo-segurado-documento" },
      { name: "beneficiary_name", label: "Beneficiário (nome / razão social)", type: "text", helpId: "seguros.coerencia.campo-beneficiario-nome" },
      { name: "beneficiary_tax_id", label: "Beneficiário (CNPJ / CPF)", type: "text", helpId: "seguros.coerencia.campo-beneficiario-documento" },
      { name: "object_text", label: "Objeto", type: "textarea", helpId: "seguros.coerencia.campo-objeto" },
      { name: "coverage_start", label: "Início da vigência", type: "date", helpId: "seguros.campos.vigencia-inicio" },
      { name: "coverage_end", label: "Fim da vigência", type: "date", helpId: "seguros.campos.vigencia-fim" },
      { name: "insured_amount", label: "Importância segurada / garantida (R$)", type: "money", helpId: "seguros.coerencia.campo-importancia" },
      { name: "guaranteed_obligation", label: "Obrigação garantida", type: "textarea", helpId: "seguros.coerencia.campo-obrigacao" },
      { name: "source_page", label: "Página / item", type: "text", helpId: "seguros.apolices.campo-clausula-pagina" },
      SRC_DOC,
      SRC_REF,
    ],
  },
  coherenceJustify: {
    id: "coherenceJustify",
    title: "Justificar divergência de coerência",
    helpId: "seguros.coerencia.form-justificar",
    submitLabel: "Registrar justificativa",
    submitHelpId: "seguros.acoes.divergencia-justificar",
    fields: [
      { name: "field", label: "Campo divergente", type: "select", helpId: "seguros.coerencia.campo-campo-divergente", required: true, target: "arg", options: COHERENCE_FIELDS.map((f) => ({ value: f, label: COHERENCE_FIELD_LABELS[f] })) },
      { name: "justification", label: "Justificativa (mínimo de 20 caracteres)", type: "textarea", helpId: "seguros.coerencia.campo-justificativa", required: true, target: "arg", minLength: 20 },
      { name: "source_document_id", label: "Documento-fonte da justificativa", type: "document", helpId: "seguros.campos.documento-fonte", optionsKey: "documents", target: "arg" },
      { name: "source_ref", label: "Referência da fonte da justificativa", type: "text", helpId: "seguros.campos.referencia-fonte", target: "arg" },
    ],
  },
  dossierItem: {
    id: "dossierItem",
    title: "Atualizar item do dossiê",
    helpId: "seguros.dossies.form-item",
    submitLabel: "Gravar item",
    submitHelpId: "seguros.acoes.dossie-item-gravar",
    fields: [
      { name: "status", label: "Situação do item", type: "select", helpId: "seguros.dossies.campo-status", required: true, target: "arg", options: opts(DOSSIER_STATUS_LABEL) },
      { name: "document_id", label: "Documento anexado", type: "document", helpId: "seguros.dossies.campo-documento", optionsKey: "documents", target: "arg" },
      { name: "note", label: "Nota (obrigatória ao dispensar ou marcar não aplicável)", type: "textarea", helpId: "seguros.dossies.campo-nota", target: "arg" },
    ],
  },
  draftApprove: {
    id: "draftApprove",
    title: "Aprovação humana expressa (ADMINISTRADOR)",
    helpId: "seguros.minutas.form-aprovacao",
    submitLabel: "Registrar aprovação (não envia)",
    submitHelpId: "seguros.acoes.minuta-aprovar",
    fields: [{ name: "confirmation", label: "Digite exatamente: APROVO O CONTEUDO PARA ENVIO", type: "text", helpId: "seguros.minutas.campo-confirmacao", required: true, target: "arg" }],
  },
  draftCancel: {
    id: "draftCancel",
    title: "Cancelar minuta",
    helpId: "seguros.minutas.form-cancelamento",
    submitLabel: "Cancelar minuta",
    submitHelpId: "seguros.acoes.minuta-cancelar",
    fields: [REASON(10)],
  },
  draftEdit: {
    id: "draftEdit",
    title: "Editar minuta",
    helpId: "seguros.minutas.form-edicao",
    submitLabel: "Salvar minuta",
    submitHelpId: "seguros.acoes.minuta-salvar",
    fields: [
      { name: "subject", label: "Assunto", type: "text", helpId: "seguros.minutas.campo-assunto", required: true, target: "arg" },
      { name: "body", label: "Texto da minuta", type: "textarea", helpId: "seguros.minutas.campo-corpo", required: true, target: "arg" },
    ],
  },
} satisfies Record<string, FormSpec>;

export type FormId = keyof typeof FORMS;

export type FormValues = Record<string, string>;

export interface BuiltForm {
  data: Record<string, unknown>;
  args: Record<string, unknown>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Converte os valores textuais do formulário no p_data (e nos argumentos próprios). Vazio é omitido; nunca vira zero. */
export function buildForm(spec: FormSpec, values: FormValues, initial: FormValues = {}): BuiltForm {
  const data: Record<string, unknown> = {};
  const args: Record<string, unknown> = {};
  for (const f of spec.fields) {
    const raw = (values[f.name] ?? "").trim();
    if (spec.onlyChanged && f.target !== "arg" && raw === (initial[f.name] ?? "").trim()) continue;
    if (!raw) continue;
    let v: unknown = raw;
    if (f.type === "money") v = parseDecimalPtBr(raw);
    else if (f.type === "int") v = Number.parseInt(raw, 10);
    else if (f.type === "tristate") v = raw === "true";
    else if (f.type === "checkbox") v = raw === "true";
    else if (f.type === "multi") v = raw.split(",").map((s) => s.trim()).filter(Boolean);
    else if (f.type === "lines") v = (values[f.name] ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    (f.target === "arg" ? args : data)[f.name] = v;
  }
  return { data, args };
}

export type FormErrors = Record<string, string>;

export function validateForm(spec: FormSpec, values: FormValues, initial: FormValues = {}): FormErrors {
  const errors: FormErrors = {};
  const get = (n: string) => (values[n] ?? "").trim();
  for (const f of spec.fields) {
    const raw = get(f.name);
    if (f.required && !raw) {
      errors[f.name] = "Campo obrigatório.";
      continue;
    }
    if (!raw) continue;
    if (f.minLength && raw.length < f.minLength) errors[f.name] = `Mínimo de ${f.minLength} caracteres.`;
    if (f.type === "money") {
      const n = parseDecimalPtBr(raw);
      if (n === null || Number.isNaN(n)) errors[f.name] = "Valor inválido (ex.: 1.234,56).";
      else if (n < 0) errors[f.name] = "O valor não pode ser negativo.";
    }
    if (f.type === "int" && !/^\d+$/.test(raw)) errors[f.name] = "Informe um número inteiro maior ou igual a zero.";
    if (f.type === "date" && !DATE_RE.test(raw)) errors[f.name] = "Data inválida.";
  }
  const [srcDoc, srcRef] = spec.sourceFields ?? ["source_document_id", "source_ref"];
  if (spec.requireSource && !get(srcDoc) && !get(srcRef)) {
    errors[srcRef] = "Informe o documento-fonte OU a referência da fonte: nenhum dado entra sem origem rastreável.";
  }
  if (spec.onlyChanged) {
    const changed = spec.fields.some((f) => f.target !== "arg" && get(f.name) !== (initial[f.name] ?? "").trim());
    if (!changed) errors._form = "Nenhum campo foi alterado.";
  }
  // coerência de datas (espelha os CHECKs coverage_end >= coverage_start / end_date >= start_date)
  for (const [a, b] of [["coverage_start", "coverage_end"], ["start_date", "end_date"]] as const) {
    if (get(a) && get(b) && DATE_RE.test(get(a)) && DATE_RE.test(get(b)) && get(b) < get(a)) errors[b] = "O fim não pode ser anterior ao início.";
  }
  return errors;
}

/** Fundamentação das etapas de decisão/indenização/negativa/contestação (espelha insurance_claim_advance). */
export function validateClaimGrounds(toStage: string, values: FormValues): FormErrors {
  const refs = (values.source_refs ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const code = checkClaimGrounds(toStage, { note: values.note, sourceRefs: refs, documentId: (values.document_id ?? "").trim() || null });
  if (!code) return {};
  return { [code === "GROUNDS_SOURCES_REQUIRED" ? "source_refs" : "note"]: GROUNDS_MESSAGES[code] };
}

/** Atualização de fiança/caução exige fonte + motivo + ao menos um campo alterado (espelha as RPCs). */
export function validateGuaranteeUpdate(values: FormValues, initial: FormValues): FormErrors {
  const get = (n: string) => (values[n] ?? "").trim();
  const changed = ["amount", "end_date", "calls_on_first_demand", "claim_procedure_note", "release_conditions", "status", "notes"].filter((k) => k in values && get(k) !== (initial[k] ?? "").trim());
  const code = checkGuaranteeUpdate({ changedKeys: changed, updateSourceRef: get("update_source_ref"), updateSourceDocumentId: get("update_source_document_id") || null, updateReason: get("update_reason") });
  if (!code) return {};
  return { [code === "UPDATE_SOURCE_REQUIRED" ? "update_source_ref" : code === "UPDATE_REASON_REQUIRED" ? "update_reason" : "_form"]: GUARANTEE_UPDATE_MESSAGES[code] };
}

/** Regras específicas por formulário que dependem de mais de um campo (espelham as RPCs). */
export function validateClaimOpen(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  const get = (n: string) => (values[n] ?? "").trim();
  const instrument = get("instrument");
  if (instrument === "none" && get("no_instrument_reason").length < 5) {
    errors.no_instrument_reason = "Sem apólice/fiança vinculada, justifique o motivo: a ausência é um estado explícito, nunca um silêncio.";
  }
  if (get("stage") === "EXPECTATIVA") {
    const hasClause = Boolean(get("contractual_basis_clause_id"));
    if (!hasClause && get("contractual_basis_note").length < 10) {
      errors.contractual_basis_note = "Expectativa de sinistro só é aberta quando contratualmente prevista: selecione a cláusula ou descreva a base (mínimo de 10 caracteres).";
    }
    if (hasClause && !instrument.startsWith("policy:")) {
      errors.contractual_basis_clause_id = "A cláusula-base pertence a uma apólice: vincule a apólice como instrumento.";
    }
  }
  return errors;
}

export function validateEndorsementVerify(values: FormValues, textsMatch: boolean | null): FormErrors {
  const note = (values.divergence_note ?? "").trim();
  if (textsMatch === true) return {};
  return note.length >= 20 ? {} : { divergence_note: "Os textos solicitado e emitido diferem: descreva a divergência (mínimo de 20 caracteres) para conferir." };
}

export function validateDossierItem(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  const status = (values.status ?? "").trim();
  if (status === "ANEXADO" && !(values.document_id ?? "").trim()) errors.document_id = "Para marcar como anexado, selecione o documento.";
  if ((status === "DISPENSADO" || status === "NAO_APLICAVEL") && !(values.note ?? "").trim()) errors.note = "Ao dispensar ou marcar como não aplicável, registre o motivo.";
  return errors;
}

/** Deriva policy_id / bank_guarantee_id / other_guarantee_id do seletor único "instrument" (policy:<id> | bank:<id> | other:<id> | none). */
export function deriveClaimInstrument(instrument: string): Record<string, string> {
  const [kind, id] = instrument.split(":");
  if (kind === "policy" && id) return { policy_id: id };
  if (kind === "bank" && id) return { bank_guarantee_id: id };
  if (kind === "other" && id) return { other_guarantee_id: id };
  return {};
}

/** Todos os helpIds literais declarados nos formulários (usado por testes de catálogo). */
export function allFormHelpIds(): string[] {
  const out = new Set<string>();
  for (const spec of Object.values(FORMS) as FormSpec[]) {
    out.add(spec.helpId);
    out.add(spec.submitHelpId);
    for (const f of spec.fields) out.add(f.helpId);
  }
  return [...out].sort();
}
