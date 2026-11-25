// Catálogo de ajuda (Hover Text) da persistência dos SUJEITOS ESPERADOS e do CHECKLIST RCC (Fase 3 / E). Arquivo NOVO do agente E; é espalhado em
// UMA linha em modules/seguros.ts e o manifesto correspondente em UMA linha de manifests/seguros.ts. Conteúdo lido do código:
// migrations 20261123400000/402000 (insurance_expected_subjects, insurance_rcc_checklists(+items), RPCs insurance_expected_subject_save e
// insurance_rcc_checklist_save), lib/insurance-ui/persistence.ts e components/insurance/panel-subjects-persisted.tsx.
import type { FeatureHelpDefinition, HelpManifestElement } from "../types";
import { HUMAN, P_MANAGE, P_READ, P_REGISTER, seg } from "./seguros-base";

const SRC = "Toda expectativa e toda resposta do RCC exige FONTE (documento do projeto OU referência da cláusula); sem fonte o banco recusa (SOURCE_REQUIRED).";
const VERSAO = "Cada gravação cria uma NOVA versão (append-only); a anterior nunca é alterada. Se outra pessoa gravou antes, o banco recusa com VERSION_CONFLICT e nada é gravado.";

export const SEGUROS_PERSISTENCIA_HELP: FeatureHelpDefinition[] = [
  seg("sujeitos.persist-esperados", "message", "Sujeitos esperados (gravados)", "Quem a fonte (contrato, edital, instrução do cliente) indica como segurado, beneficiário, tomador ou titular.",
    "Tabela dos sujeitos esperados VIGENTES (maior versão por papel) da apólice escolhida, com a fonte da expectativa, versão, autor e data. Papel sem registro mostra SEM DADOS e o sujeito não é conferido.",
    { source: "insurance_expected_subjects", permissions: `Ver: ${P_READ} Gravar: ${P_MANAGE}`, consequences: [VERSAO], limitations: ["Não se presume que o beneficiário final deva figurar como segurado."], humanReview: HUMAN }),
  seg("sujeitos.persist-auditoria", "message", "Auditoria dos sujeitos (cadastrado x esperado gravado)", "Compara as partes ativas da apólice com as expectativas gravadas.",
    "Aplica auditPolicySubjects às partes ATIVAS e às expectativas GRAVADAS: segurado diferente do esperado, proprietário/beneficiário final não identificado ou divergente da fonte, sujeito 'não esperado' cadastrado. Ausência de dado é FATO; divergência é INFERÊNCIA.",
    { source: "insurance_policy_parties x insurance_expected_subjects", limitations: ["Sujeito sem expectativa gravada não é conferido (nada é presumido).", "Beneficiário final não precisa ser segurado."], humanReview: HUMAN }),
  seg("sujeitos.persist-papel", "field", "Papel do sujeito esperado", "Segurado, beneficiário, proprietário/beneficiário final, tomador ou titular do interesse segurável.",
    "Papel cuja expectativa será gravada (party_role). Cada papel tem a sua própria sequência de versões.", { permissions: P_MANAGE, source: "insurance_expected_subjects.party_role" }),
  seg("sujeitos.persist-expectativa", "field", "Expectativa", "Esperado, ou não esperado (a fonte indica que não há esse sujeito).",
    "ESPERADO exige nome e/ou CNPJ/CPF; NÃO ESPERADO não leva nome nem documento. 'Não esperado' dispensa a identificação do sujeito na auditoria.", { permissions: P_MANAGE, source: "insurance_expected_subjects.expectation" }),
  seg("sujeitos.persist-nome", "field", "Nome esperado", "Nome do sujeito que a fonte indica.", "Comparado, sem acentos nem caixa, com o nome das partes ativas e identificadas. Até 300 caracteres.", { permissions: P_MANAGE, source: "insurance_expected_subjects.expected_name", missingData: "Em branco: vale o CNPJ/CPF; sem os dois, a expectativa 'esperado' não é gravada." }),
  seg("sujeitos.persist-documento", "field", "CNPJ/CPF esperado", "Documento do sujeito que a fonte indica.", "Comparado apenas pelos dígitos com o documento das partes ativas. Coincidência de documento OU de nome basta para considerar o sujeito conferido.", { permissions: P_MANAGE, source: "insurance_expected_subjects.expected_tax_id" }),
  seg("sujeitos.persist-fonte-tipo", "field", "Tipo da fonte da expectativa", "Contrato, edital, instrução do cliente ou outro documento.", "Classifica de onde vem a expectativa (source_kind). É exibido no texto dos achados da auditoria.", { permissions: P_MANAGE, source: "insurance_expected_subjects.source_kind", consequences: [SRC] }),
  seg("sujeitos.persist-fonte-documento", "field", "Documento-fonte da expectativa", "Documento do projeto que sustenta a expectativa.", "Lista os documentos do PRÓPRIO projeto; documento de outro projeto é recusado (REFERENCE_OUT_OF_PROJECT). Pode ser deixado em branco se houver referência.", { permissions: P_MANAGE, consequences: [SRC] }),
  seg("sujeitos.persist-fonte-referencia", "field", "Referência da fonte da expectativa", "Cláusula, página ou item em que a expectativa consta.", "Texto livre que identifica a passagem da fonte. Sozinha já satisfaz a exigência de fonte.", { permissions: P_MANAGE, consequences: [SRC] }),
  seg("sujeitos.persist-nota", "field", "Nota da expectativa", "Anotação opcional.", "Texto livre (até 4000 caracteres) gravado com a versão. Não entra em nenhum cálculo.", { permissions: P_MANAGE }),
  seg("sujeitos.persist-esperado-salvar", "button", "Gravar sujeito esperado", "Grava a expectativa como uma nova versão do papel escolhido.",
    "Chama insurance_expected_subject_save com a última versão que a tela viu (0 se não há). Exige nível de gestão porque altera o parâmetro da auditoria de sujeitos.",
    { permissions: P_MANAGE, consequences: [VERSAO, "Auditoria EXPECTED_SUBJECT_SAVED com autor e data."] }),
  seg("sujeitos.persist-esperado-historico", "table", "Histórico de sujeitos esperados", "Todas as versões gravadas, por papel.", "Lista as versões em ordem decrescente por papel, com expectativa, fonte, autor e data. Nada é apagado.", { source: "insurance_expected_subjects", permissions: P_READ }),
  seg("sujeitos.persist-rcc-versao", "status", "Versão vigente do checklist RCC", "Número, autor e data da versão mais recente gravada.", "Mostra a maior versão do checklist da apólice (sem evento). Sem versão gravada, aparece SEM DADOS.", { source: "insurance_rcc_checklists", missingData: "Sem checklist gravado: SEM DADOS." }),
  seg("sujeitos.persist-rcc-documento", "field", "Documento-fonte da resposta RCC", "Documento do projeto em que a resposta se apoia.", "Lista os documentos do PRÓPRIO projeto (outro projeto é recusado). A resposta exige documento OU referência da cláusula.", { permissions: P_REGISTER, consequences: [SRC] }),
  seg("sujeitos.persist-rcc-nota", "field", "Nota da versão do checklist RCC", "Anotação opcional sobre a versão.", "Texto livre (até 4000 caracteres) gravado com a versão do checklist.", { permissions: P_REGISTER }),
  seg("sujeitos.persist-rcc-salvar", "button", "Gravar checklist RCC", "Grava as respostas como uma nova versão do checklist.",
    "Chama insurance_rcc_checklist_save. Pergunta sem resposta é gravada como SEM DADOS (nunca presumida); a pergunta de bens de terceiros x própria obra exige a natureza do bem quando respondida.",
    { permissions: P_REGISTER, consequences: [VERSAO, SRC], limitations: ["Não presume que a RCC cubra defeito de execução ou danos à própria obra."], humanReview: HUMAN }),
  seg("sujeitos.persist-rcc-historico", "table", "Versões do checklist RCC", "Todas as versões gravadas do checklist da apólice.", "Lista as versões com a quantidade de perguntas respondidas, autor, data e nota. Nada é apagado.", { source: "insurance_rcc_checklists", permissions: P_READ }),
];

const ROUTE = "/[projectId]/seguros";
export const SEGUROS_PERSISTENCIA_MANIFEST: HelpManifestElement[] = SEGUROS_PERSISTENCIA_HELP.map((e): HelpManifestElement => ({
  route: ROUTE,
  tab: "Sujeitos e RCC",
  kind: e.kind ?? "field",
  label: e.title,
  helpId: e.id,
}));
