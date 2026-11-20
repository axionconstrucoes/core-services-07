// Catálogo do módulo "seguros": botões de ação. Cada ação chama UMA RPC allowlistada (lib/insurance-ui/rpc-ops.ts) ou apenas abre um formulário.
import type { FeatureHelpDefinition } from "../types";
import { P_ADMIN, P_MANAGE, P_REGISTER, seg } from "./seguros-base";

type A = [id: string, title: string, short: string, description: string, permissions?: string];

const RPC = (name: string, rest: string) => `Chama a RPC ${name} sob a sessão do usuário (SECURITY DEFINER, com auditoria e controle de versão). ${rest}`;
const OPEN = (what: string) => `Apenas abre ou fecha o formulário ${what}; nada é gravado até enviar o formulário.`;
const CONFLICT = "Se outra pessoa alterou o registro antes (VERSION_CONFLICT), nada é gravado e a tela oferece Recarregar dados.";

const ACTIONS: A[] = [
  ["acoes.recarregar", "Recarregar dados", "Recarrega os dados do servidor após um conflito de versão.", "Aparece quando o banco recusa uma ação porque o registro mudou (VERSION_CONFLICT). Recarrega a página do servidor para você conferir o que mudou e refazer a ação; o texto digitado no formulário permanece."],
  ["acoes.apolice-nova", "Nova apólice", "Abre o formulário de nova apólice.", OPEN("de nova apólice"), P_MANAGE],
  ["acoes.apolice-registrar", "Registrar apólice", "Grava a apólice com fonte e cria a versão 1.", RPC("insurance_policy_create", "Exige modalidade, seguradora e fonte."), P_MANAGE],
  ["acoes.apolice-nova-versao-abrir", "Nova versão (abrir)", "Abre o formulário de nova versão com os valores atuais.", OPEN("de nova versão com os valores atuais pré-preenchidos"), P_MANAGE],
  ["acoes.apolice-nova-versao", "Gravar nova versão", "Grava só os campos alterados como nova versão da apólice.", RPC("insurance_policy_new_version", `Exige motivo de 10+ caracteres e ao menos um campo alterado. ${CONFLICT}`), P_MANAGE],
  ["acoes.parte-abrir", "Adicionar parte (abrir)", "Abre o formulário de parte da apólice.", OPEN("de parte"), P_MANAGE],
  ["acoes.parte-adicionar", "Adicionar parte", "Registra uma parte da apólice com fonte.", RPC("insurance_policy_party_add", CONFLICT), P_MANAGE],
  ["acoes.parte-ativar", "Ativar ou desativar parte", "Pede o motivo e ativa ou desativa a parte.", RPC("insurance_policy_party_set_active", `Exige motivo de 10+ caracteres. A parte nunca é apagada. ${CONFLICT}`), P_MANAGE],
  ["acoes.clausula-abrir", "Adicionar cláusula (abrir)", "Abre o formulário de cláusula.", OPEN("de cláusula"), P_MANAGE],
  ["acoes.clausula-adicionar", "Adicionar cláusula", "Registra a cláusula com fonte e gera nova versão da apólice.", RPC("insurance_policy_clause_add", CONFLICT), P_MANAGE],

  ["acoes.fianca-nova", "Nova fiança", "Abre o formulário de fiança bancária.", OPEN("de fiança bancária"), P_MANAGE],
  ["acoes.fianca-registrar", "Registrar fiança", "Grava a fiança bancária com fonte.", RPC("bank_guarantee_register", "A fiança bancária não é seguro."), P_MANAGE],
  ["acoes.fianca-atualizar-abrir", "Atualizar fiança (abrir)", "Abre o formulário de atualização da fiança.", OPEN("de atualização da fiança com os valores atuais"), P_MANAGE],
  ["acoes.fianca-atualizar", "Gravar alteração da fiança", "Grava os campos alterados da fiança.", RPC("bank_guarantee_update", CONFLICT), P_MANAGE],
  ["acoes.outra-nova", "Nova garantia", "Abre o formulário de caução ou outra garantia.", OPEN("de caução ou outra garantia"), P_MANAGE],
  ["acoes.outra-registrar", "Registrar garantia", "Grava a caução, carta de fiança não bancária ou outra garantia.", RPC("other_guarantee_register", "Não é seguro nem fiança bancária."), P_MANAGE],
  ["acoes.outra-atualizar-abrir", "Atualizar garantia (abrir)", "Abre o formulário de atualização da garantia.", OPEN("de atualização da garantia com os valores atuais"), P_MANAGE],
  ["acoes.outra-atualizar", "Gravar alteração da garantia", "Grava os campos alterados da garantia.", RPC("other_guarantee_update", CONFLICT), P_MANAGE],

  ["acoes.endosso-novo", "Registrar pedido de endosso (abrir)", "Abre o formulário de pedido de endosso.", OPEN("de pedido de endosso"), P_REGISTER],
  ["acoes.endosso-solicitar", "Registrar pedido (não é endosso emitido)", "Grava o pedido de endosso no estado SOLICITADO, sem efeito de cobertura.", RPC("insurance_endorsement_request", "Pedido não é endosso emitido."), P_REGISTER],
  ["acoes.endosso-analise", "Registrar em análise", "Marca o endosso como em análise pela seguradora.", RPC("insurance_endorsement_advance", `Estado EM_ANALISE. ${CONFLICT}`), P_REGISTER],
  ["acoes.endosso-emitir-abrir", "Registrar emissão (abrir)", "Abre o formulário do endosso emitido.", OPEN("do endosso emitido"), P_MANAGE],
  ["acoes.endosso-emitir", "Registrar emissão", "Grava o endosso emitido com número, texto e documento.", RPC("insurance_endorsement_advance", `Estado EMITIDO; ainda sem efeito de cobertura. ${CONFLICT}`), P_MANAGE],
  ["acoes.endosso-conferir-abrir", "Conferir texto emitido (abrir)", "Abre o formulário de conferência do endosso emitido.", OPEN("de conferência"), P_MANAGE],
  ["acoes.endosso-conferir", "Conferir e tornar efetivo", "Confere o texto emitido e passa o endosso a CONFERIDO com efeito de cobertura.", RPC("insurance_endorsement_advance", `Estado CONFERIDO: coverage_effective passa a verdadeiro conforme o TEXTO EMITIDO. ${CONFLICT}`), P_MANAGE],
  ["acoes.endosso-recusar-abrir", "Registrar recusa (abrir)", "Abre o formulário de recusa do endosso.", OPEN("de recusa"), P_MANAGE],
  ["acoes.endosso-recusar", "Registrar recusa", "Marca o endosso como RECUSADO, com motivo.", RPC("insurance_endorsement_advance", `Estado RECUSADO. ${CONFLICT}`), P_MANAGE],
  ["acoes.endosso-minuta", "Preparar minuta de endosso", "Leva à aba de minutas com este pedido selecionado.", "Navega para a aba Minutas e acionamento com o pedido de endosso escolhido; a minuta só é gravada ali, ao clicar em Criar minuta (DRAFT).", P_REGISTER],

  ["acoes.adiantamento-novo", "Registrar adiantamento (abrir)", "Abre o formulário de adiantamento.", OPEN("de adiantamento"), P_REGISTER],
  ["acoes.adiantamento-registrar", "Registrar adiantamento", "Grava o adiantamento com fonte.", RPC("insurance_advance_register", "Não calcula saldo devido nem indenização."), P_REGISTER],
  ["acoes.adiantamento-amortizar-abrir", "Amortizar (abrir)", "Abre o formulário de amortização.", OPEN("de amortização"), P_REGISTER],
  ["acoes.adiantamento-amortizar", "Registrar amortização", "Grava a amortização e atualiza o saldo não amortizado.", RPC("insurance_advance_amortize", `Recusa valor maior que o saldo. ${CONFLICT}`), P_REGISTER],

  ["acoes.sinistro-novo", "Abrir sinistro ou evento (abrir)", "Abre o formulário de evento.", OPEN("de sinistro ou evento"), P_REGISTER],
  ["acoes.sinistro-abrir", "Abrir evento", "Grava o evento e sua primeira etapa.", RPC("insurance_claim_open", "Expectativa exige base contratual; sem instrumento exige motivo."), P_REGISTER],
  ["acoes.sinistro-avancar-abrir", "Avançar para o estágio (abrir)", "Abre o formulário da próxima etapa permitida.", "Cada botão corresponde a um estágio permitido pela máquina de estados a partir do estágio atual; apenas abre o formulário da etapa.", P_REGISTER],
  ["acoes.sinistro-avancar", "Registrar nova etapa", "Grava a nova etapa do evento com nota, protocolo e documento.", RPC("insurance_claim_advance", `Valida a transição, a nota e o resultado da decisão. ${CONFLICT}`), P_REGISTER],
  ["acoes.acionamento-preparar", "Preparar acionamento", "Leva à aba de minutas com este evento para montar o fluxo e a minuta.", "Navega para a aba Minutas e acionamento com o evento escolhido. Nada é gravado nem enviado nesse clique.", P_REGISTER],

  ["acoes.dossie-gerar", "Gerar checklist do dossiê", "Cria os itens do roteiro da modalidade que ainda não existem.", RPC("insurance_dossier_sync", "Cria somente os itens faltantes (não sobrescreve nem apaga os existentes)."), P_MANAGE],
  ["acoes.dossie-item-abrir", "Atualizar item (abrir)", "Abre o formulário do item do dossiê.", OPEN("do item"), P_REGISTER],
  ["acoes.dossie-item-gravar", "Gravar item do dossiê", "Grava a situação, o documento e a nota do item.", RPC("insurance_dossier_item_set", CONFLICT), P_REGISTER],

  ["acoes.minuta-criar", "Criar minuta (DRAFT)", "Grava a minuta preparada em DRAFT; nada é enviado.", RPC("insurance_draft_create", "A minuta nasce sempre em DRAFT e nunca como gerada por IA nesta interface."), P_REGISTER],
  ["acoes.minuta-editar", "Editar minuta", "Abre o formulário de edição do texto.", OPEN("de edição da minuta"), P_REGISTER],
  ["acoes.minuta-salvar", "Salvar minuta", "Grava assunto e texto; uma aprovação anterior é revogada.", RPC("insurance_draft_update", `Editar após a aprovação volta a minuta a DRAFT. ${CONFLICT}`), P_REGISTER],
  ["acoes.minuta-aprovar-abrir", "Aprovar (abrir)", "Abre a aprovação humana expressa do Administrador.", OPEN("de aprovação"), P_ADMIN],
  ["acoes.minuta-aprovar", "Registrar aprovação (não envia)", "Registra a aprovação humana; não envia nada.", RPC("insurance_draft_approve", `Exige a confirmação literal e texto sem campos pendentes. ${CONFLICT}`), P_ADMIN],
  ["acoes.minuta-cancelar-abrir", "Cancelar minuta (abrir)", "Abre o formulário de cancelamento.", OPEN("de cancelamento"), P_REGISTER],
  ["acoes.minuta-cancelar", "Cancelar minuta", "Cancela a minuta, com motivo.", RPC("insurance_draft_cancel", `Exige motivo de 10+ caracteres. ${CONFLICT}`), P_REGISTER],
  ["acoes.minuta-tentar-envio", "Registrar tentativa de envio (será bloqueada)", "Testa a trava: registra a tentativa na auditoria e mostra por que o envio é bloqueado; nada é enviado.", RPC("insurance_draft_attempt_send", "Sempre devolve sent = falso e blocked = verdadeiro, com os motivos (trava desligada, não aprovada, canal ausente ou não verificado, sem transporte de envio)."), P_REGISTER],

  ["acoes.canal-novo", "Cadastrar canal (abrir)", "Abre o formulário de canal oficial.", OPEN("de canal oficial"), P_MANAGE],
  ["acoes.canal-cadastrar", "Cadastrar canal", "Grava o canal oficial com fonte, ainda não verificado.", RPC("insurance_channel_register", "O canal nasce não verificado."), P_MANAGE],
  ["acoes.canal-verificar", "Marcar canal como verificado", "Registra que um gestor conferiu o canal com a fonte.", RPC("insurance_channel_verify", "Grava quem verificou e quando. Verificar um canal não habilita envio."), P_MANAGE],
];

export const SEGUROS_ACOES: FeatureHelpDefinition[] = ACTIONS.map(([id, title, short, description, permissions]) => seg(id, "button", title, short, description, permissions ? { permissions } : {}));
