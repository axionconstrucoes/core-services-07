// Catálogo de ajuda (Hover Text) de SEGUROS — Fase 4 / B: coerência minuta x apólice x contrato, fundamentação de decisões de sinistro,
// fonte na atualização de fiança/caução, consolidação de adiantamentos e cláusula de cobertura identificada. Arquivo NOVO; espalhado em
// UMA linha em modules/seguros.ts e o manifesto em UMA linha de manifests/seguros.ts. Conteúdo lido do código: migrations 20261125200000..203000,
// lib/insurance/{coherence,grounds,advances,coverage-assessment,tax-id}.ts, lib/insurance-ui/forms.ts e components/insurance/*.
import type { FeatureHelpDefinition, HelpManifestElement } from "../types";
import { HUMAN, P_MANAGE, P_READ, P_REGISTER, seg } from "./seguros-base";

const APPEND = "Cada gravação é uma nova linha (append-only): a anterior nunca é alterada nem apagada.";
const SRC_MIN = "Sem fonte (documento do projeto ou referência) o banco recusa o registro.";

export const SEGUROS_F4B_HELP: FeatureHelpDefinition[] = [
  // ---- coerência ----
  seg("coerencia.painel", "message", "Coerência minuta × apólice × contrato", "Compara segurado, beneficiário, objeto, vigência, importância segurada e obrigação garantida.",
    "Mostra, para a minuta escolhida, a comparação estruturada dos termos declarados no CONTRATO, na APÓLICE e na própria MINUTA. Valor ausente em um documento é SEM DADOS e não conta como divergência; só se comparam valores presentes. Faltar todos os termos de um dos três instrumentos impede a validação.",
    { source: "insurance_instrument_terms, insurance_coherence_justifications (RPC insurance_coherence_check)", permissions: `Ver: ${P_READ}`, consequences: ["A aprovação da minuta (Administrador) é BLOQUEADA com divergência sem justificativa ou com termos ausentes (COHERENCE_BLOCKED)."], limitations: ["Compara o que foi DECLARADO nos termos; não lê o PDF do contrato nem da apólice sozinho.", "Textos (objeto, obrigação) são comparados sem acentos, caixa e pontuação: diferença de redação conta como divergência a justificar."], humanReview: HUMAN }),
  seg("coerencia.status", "status", "Situação da coerência", "Coerente, divergente justificada, divergente ou SEM DADOS.",
    "COERENTE = nenhum campo diverge. DIVERGENTE JUSTIFICADA = há divergência, todas com justificativa (texto + fonte) para os valores atuais. DIVERGENTE = há divergência sem justificativa: aprovação bloqueada. SEM DADOS = falta o conjunto de termos de ao menos um instrumento: aprovação bloqueada.",
    { source: "insurance_coherence_check", consequences: ["Só COERENTE e DIVERGENTE JUSTIFICADA permitem aprovar a minuta."] }),
  seg("coerencia.divergencias", "status", "Divergência de coerência", "Campo cujo valor difere entre os instrumentos, com a fonte de cada valor.",
    "Cada divergência lista o valor normalizado de cada instrumento e a fonte declarada. A justificativa fica presa à impressão digital dos valores: se qualquer valor mudar, a justificativa deixa de valer e a divergência volta a bloquear.",
    { source: "insurance_coherence_justifications.fingerprint", humanReview: HUMAN }),
  seg("coerencia.form-termos", "message", "Termos do instrumento", "Registra o que o contrato, a apólice ou a minuta declaram.",
    `Grava os termos declarados pelo instrumento escolhido (segurado, beneficiário, objeto, vigência, importância e obrigação garantida), sempre com a fonte. Campo em branco fica SEM DADOS. ${APPEND} ${SRC_MIN}`,
    { permissions: `Contrato e apólice: ${P_MANAGE} Minuta: ${P_REGISTER}`, source: "insurance_instrument_terms (RPC insurance_instrument_terms_save)", consequences: [APPEND] }),
  seg("coerencia.campo-segurado-nome", "field", "Segurado (nome)", "Nome ou razão social do segurado declarado.", "Comparado, sem acentos nem caixa, com o nome declarado nos outros instrumentos quando um dos lados não tem documento fiscal.", { permissions: P_MANAGE, source: "insurance_instrument_terms.insured_name", missingData: "Em branco: SEM DADOS (não diverge)." }),
  seg("coerencia.campo-segurado-documento", "field", "Segurado (CNPJ/CPF)", "Documento fiscal do segurado declarado.", "Comparado só pelos dígitos quando AMBOS os instrumentos têm documento. Documento diferente é divergência mesmo que o nome coincida.", { permissions: P_MANAGE, source: "insurance_instrument_terms.insured_tax_id", missingData: "Em branco: SEM DADOS." }),
  seg("coerencia.campo-beneficiario-nome", "field", "Beneficiário (nome)", "Nome ou razão social do beneficiário declarado.", "Mesma regra do segurado: documento fiscal quando os dois lados têm; senão, nome normalizado. Não se presume que o beneficiário deva ser o segurado.", { permissions: P_MANAGE, source: "insurance_instrument_terms.beneficiary_name", missingData: "Em branco: SEM DADOS." }),
  seg("coerencia.campo-beneficiario-documento", "field", "Beneficiário (CNPJ/CPF)", "Documento fiscal do beneficiário declarado.", "Comparado só pelos dígitos quando AMBOS os instrumentos têm documento.", { permissions: P_MANAGE, source: "insurance_instrument_terms.beneficiary_tax_id", missingData: "Em branco: SEM DADOS." }),
  seg("coerencia.campo-objeto", "field", "Objeto", "Objeto do contrato/seguro conforme o instrumento.", "Texto comparado sem acentos, caixa e pontuação. Diferença de redação é tratada como divergência a justificar (o sistema não interpreta o sentido).", { permissions: P_MANAGE, source: "insurance_instrument_terms.object_text", missingData: "Em branco: SEM DADOS." }),
  seg("coerencia.campo-importancia", "field", "Importância segurada / garantida", "Valor em reais declarado pelo instrumento.", "Comparado pelo valor exato (duas casas decimais). Vazio fica SEM DADOS (nunca zero).", { permissions: P_MANAGE, unit: "R$", source: "insurance_instrument_terms.insured_amount", missingData: "Em branco: SEM DADOS." }),
  seg("coerencia.campo-obrigacao", "field", "Obrigação garantida", "Obrigação que o seguro ou a garantia cobre, conforme o instrumento.", "Texto comparado sem acentos, caixa e pontuação, como o objeto.", { permissions: P_MANAGE, source: "insurance_instrument_terms.guaranteed_obligation", missingData: "Em branco: SEM DADOS." }),
  seg("coerencia.form-justificar", "message", "Justificar divergência", "Registra por que a divergência é aceita, com texto e fonte.",
    `Justificativa humana de uma divergência (texto de 20 a 4000 caracteres) com fonte obrigatória. Vale só para os valores atuais; se mudarem, a divergência volta a bloquear. ${APPEND}`,
    { permissions: P_MANAGE, source: "insurance_coherence_justifications (RPC insurance_coherence_justify)", limitations: ["Só minuta em DRAFT."], humanReview: HUMAN }),
  seg("coerencia.campo-campo-divergente", "field", "Campo divergente", "Qual campo divergente está sendo justificado.", "Lista os campos comparados. O banco recusa campo sem divergência (NOT_DIVERGENT) ou já justificado para os mesmos valores.", { permissions: P_MANAGE }),
  seg("coerencia.campo-justificativa", "field", "Justificativa da divergência", "Texto que explica a divergência (mínimo de 20 caracteres).", "Explique por que a diferença é aceitável (por exemplo, aditivo posterior). Fica registrada com autor, data e fonte.", { permissions: P_MANAGE, source: "insurance_coherence_justifications.justification", missingData: "Sem texto de 20 caracteres o banco recusa (JUSTIFICATION_REQUIRED)." }),
  seg("acoes.termos-abrir", "button", "Abrir termos do instrumento", "Abre o formulário de termos do contrato, da apólice ou da minuta.", "Abre o formulário para registrar o que o instrumento declara. Contrato e apólice exigem gestão; a minuta, registro.", { permissions: `Contrato e apólice: ${P_MANAGE} Minuta: ${P_REGISTER}` }),
  seg("acoes.termos-gravar", "button", "Gravar termos", "Grava os termos como uma nova versão, com a fonte.", "Chama insurance_instrument_terms_save. A linha mais recente de cada instrumento vale; as anteriores ficam no histórico.", { permissions: `Contrato e apólice: ${P_MANAGE} Minuta: ${P_REGISTER}`, consequences: [APPEND, "A auditoria registra INSTRUMENT_TERMS_SAVED."] }),
  seg("acoes.divergencia-abrir", "button", "Abrir justificativa de divergência", "Abre o formulário para justificar uma divergência.", "Disponível quando há divergência sem justificativa em minuta em DRAFT.", { permissions: P_MANAGE }),
  seg("acoes.divergencia-justificar", "button", "Registrar justificativa", "Grava a justificativa da divergência.", "Chama insurance_coherence_justify; a auditoria registra COHERENCE_DIVERGENCE_JUSTIFIED.", { permissions: P_MANAGE, consequences: [APPEND] }),

  // ---- fundamentação, fonte de atualização, cláusula identificada, consolidação ----
  seg("sinistros.campo-fontes-etapa", "field", "Fontes da fundamentação da etapa", "Uma fonte por linha: carta, e-mail, cláusula ou protocolo.",
    "Fontes que sustentam a nota da etapa. Decisão, indenização/cumprimento, negativa e contestação exigem fundamentação: nota com no mínimo 20 caracteres E ao menos uma fonte (aqui e/ou o documento da etapa). Sem isso o banco recusa (GROUNDS_REQUIRED / GROUNDS_SOURCES_REQUIRED).",
    { permissions: "Decisão, negativa, contestação, indenização e encerramento: Administrador, Gestor ou Gerente; demais etapas: perfis de registro.", source: "insurance_claim_steps.source_refs", missingData: "Etapa de fundamentação sem fonte: bloqueada.", consequences: ["As fontes ficam no passo (append-only) e na auditoria."] }),
  seg("garantias.campo-atualizacao-fonte-documento", "field", "Documento-fonte da atualização", "Documento do projeto que sustenta a mudança da fiança ou caução.", `Aditivo, carta do banco ou documento que justifica a mudança. ${SRC_MIN} Documento de outro projeto é recusado.`, { permissions: P_MANAGE, source: "insurance_guarantee_updates.source_document_id" }),
  seg("garantias.campo-atualizacao-fonte-referencia", "field", "Referência da fonte da atualização", "Aditivo, carta ou protocolo que sustenta a mudança.", "Referência textual da fonte da atualização; alternativa ao documento do projeto. Uma das duas é obrigatória (UPDATE_SOURCE_REQUIRED).", { permissions: P_MANAGE, source: "insurance_guarantee_updates.source_ref" }),
  seg("garantias.campo-atualizacao-motivo", "field", "Motivo da atualização", "Por que a fiança ou caução foi atualizada (mínimo de 10 caracteres).", "Registrado com o valor anterior e o novo no histórico append-only de atualizações e na auditoria.", { permissions: P_MANAGE, source: "insurance_guarantee_updates.reason", missingData: "Sem motivo o banco recusa (UPDATE_REASON_REQUIRED)." }),
  seg("apolices.campo-clausula-identificacao", "field", "Identificação da cláusula", "Número ou título da cláusula no texto da apólice (ex.: Cláusula 4.2).",
    "Obrigatória para cláusula do tipo COBERTURA. Cláusula genérica (sem identificação específica, ou de tipo cláusula/outro) NÃO é prova de cobertura: só cobertura específica, identificada e com fonte conta na avaliação.",
    { permissions: P_MANAGE, source: "insurance_policy_clauses.clause_identifier", missingData: "Cobertura sem identificação: a avaliação a desconsidera como prova e informa o motivo.", humanReview: HUMAN }),
  seg("adiantamentos.consolidado", "message", "Consolidado de adiantamentos", "Soma, amortizado e saldo sem dupla contagem.",
    "Soma dos adiantamentos, amortizado efetivo (nunca acima do adiantado) e saldo não amortizado. Adiantamentos idênticos (mesma apólice, contrato, data, valor e fonte) e amortizações idênticas contam uma vez e são listados como duplicidade. Saldo devido e valor indenizável NÃO são derivados.",
    { source: "insurance_advances_consolidated (insurance_advances + insurance_advance_amortizations)", formula: "saldo = adiantado − amortizado efetivo; amortizado efetivo = min(soma das amortizações distintas, adiantado)", unit: "R$", permissions: `Ver: ${P_READ}`, missingData: "Falha ao carregar: SEM DADOS (nunca zero).", limitations: ["O teto de garantia é a importância segurada da apólice; limites por adiantamento não são somados."], humanReview: HUMAN }),
];

const ROUTE = "/[projectId]/seguros";
const tabOf = (id: string): string => {
  if (id.startsWith("seguros.coerencia.") || id.startsWith("seguros.acoes.termos") || id.startsWith("seguros.acoes.divergencia")) return "Minutas e acionamento";
  if (id.startsWith("seguros.sinistros.")) return "Sinistros e eventos";
  if (id.startsWith("seguros.garantias.")) return "Fianças e garantias";
  if (id.startsWith("seguros.apolices.")) return "Apólices";
  return "Adiantamentos";
};
export const SEGUROS_F4B_MANIFEST: HelpManifestElement[] = SEGUROS_F4B_HELP.map((e): HelpManifestElement => ({
  route: ROUTE,
  tab: tabOf(e.id),
  kind: e.kind ?? "field",
  label: e.title,
  helpId: e.id,
}));
