// Manifesto (inventário AUTORITATIVO) do módulo "integracoes": rotas e elementos funcionais com o helpId que os documenta.
// Arquivo EXCLUSIVO do módulo. Regras: ver lib/ui/help/types.ts (HelpManifest) e scripts/test-help-catalog.mjs.
import type { HelpElementKind, HelpManifest, HelpManifestElement } from "../types";

const INT = "/[projectId]/integracoes";
const CX = "/[projectId]/integracoes/caixas";
const AUT = "/autorizacao-email/[authorizationId]";

const el = (route: string, kind: HelpElementKind, label: string, helpId: string): HelpManifestElement => ({ route, kind, label, helpId });
const gap = (route: string, kind: HelpElementKind, label: string, why: string): HelpManifestElement => ({ route, kind, label, gap: why });
const exempt = (route: string, kind: HelpElementKind, label: string, why: string): HelpManifestElement => ({ route, kind, label, exempt: why });

export const INTEGRACOES_MANIFEST: HelpManifest = {
  module: "integracoes",
  routes: [INT, CX, AUT],
  elements: [
    // ---------------------------------------------------------------- /[projectId]/integracoes
    el(INT, "page", "Administração de Integrações", "integracoes.integracoes.pagina"),
    el(INT, "setting", "IA e skills dos especialistas", "integracoes.integracoes.ia-skills"),
    el(INT, "table", "Quem alimenta o ACC neste projeto (matriz)", "integracoes.integracoes.matriz-fontes"),
    el(INT, "status", "Faróis das etapas (Aceite, Conexão técnica, Coleta, Material)", "integracoes.integracoes.farol-etapa"),
    el(INT, "status", "Selo de estado da fonte (Ativo, Pendente, Atenção, Erro)", "integracoes.integracoes.status-fonte"),
    el(INT, "table", "Cartão de fonte (descrição, detalhe, última sincronização)", "integracoes.integracoes.cartao-fonte"),
    el(INT, "table", "Origem da fonte", "integration-origin"),
    el(INT, "field", "Tipo de Drive (Meu Drive, Drive compartilhado, Pasta compartilhada)", "drive-type"),
    el(INT, "admin-action", "Editar origem / Salvar origem", "integracoes.integracoes.editar-origem"),
    el(INT, "table", "Cartão ESG / SSMA", "esg-ssma-source"),
    el(INT, "admin-action", "Validar pasta SSMA/ESG", "integracoes.integracoes.validar-drive-ssma"),
    el(INT, "admin-action", "Validar conexão (Construmanager)", "integracoes.integracoes.construmanager-validar"),
    el(INT, "admin-action", "Sincronizar metadados (Construmanager)", "integracoes.integracoes.construmanager-sincronizar"),
    el(INT, "table", "Novas versões vigentes (Construmanager)", "integracoes.integracoes.construmanager-novas-versoes"),
    el(INT, "admin-action", "Análise obrigatória de impacto e resposta do Orçamento", "integracoes.integracoes.construmanager-analise-impacto"),
    el(INT, "kpi", "Monitoramento do Construmanager", "integracoes.integracoes.construmanager-monitoramento"),
    el(INT, "kpi", "Monitoramento do Diário de Obra", "integracoes.integracoes.diario-monitoramento"),
    el(INT, "kpi", "Disponibilidade operacional por clima e catástrofes", "integracoes.integracoes.diario-clima-kpi"),
    el(INT, "status", "E-mail Corporativo (Google Workspace)", "integracoes.integracoes.email-cartao"),
    el(INT, "table", "Contas de e-mail AXION", "gmail-account-connected"),
    el(INT, "button", "+ Adicionar conta AXION", "gmail-add-account"),
    el(INT, "admin-action", "Registrar conta / Desconectar", "integracoes.integracoes.email-desconectar"),
    el(INT, "setting", "Configuração de ingestão deste projeto", "integracoes.integracoes.email-config"),
    el(INT, "field", "Campos preenchidos automaticamente (valores já salvos)", "gmail-prefilled-fields"),
    el(INT, "field", "Período de ingestão", "gmail-ingestion-period"),
    el(INT, "field", "Domínio do cliente", "gmail-client-domain"),
    el(INT, "field", "Participantes monitorados", "gmail-participant-monitored"),
    el(INT, "field", "Incluir anexos", "gmail-include-attachments"),
    el(INT, "setting", "Escopo automático dos e-mails (correspondência, palavras-chave, assuntos)", "integracoes.integracoes.email-escopo"),
    el(INT, "admin-action", "Prévia antes de importar / Confirmar sincronização", "integracoes.integracoes.email-previa"),
    el(INT, "message", "Sincronizações seguintes são incrementais", "gmail-incremental-sync"),
    el(INT, "chart", "Painel de sincronização (progresso)", "gmail-sync-progress"),
    el(INT, "kpi", "Contadores da última sincronização", "integracoes.integracoes.sync-contadores"),
    gap(INT, "field", "Campos do formulário de origem (Sistema, Projeto/Obra, Conta, Pasta/Local, Arquivo, Responsável) e tipos de participante", "A finalidade geral está em integration-origin, drive-type e gmail-participant-*; cada campo do formulário não tem ajuda individual. Providência: documentar campo a campo se a administração solicitar."),
    gap(INT, "message", "Badges Armazenado/Pendente/Somente no Construmanager e rótulos de monitoramento", "Descritos no texto das novas versões vigentes, sem entrada própria por rótulo. Providência: criar entradas de status se a equipe de Orçamento solicitar."),
    gap(INT, "table", "Cartões de fontes sem painel próprio (Contrato e Aditivos, Recebidos do cliente, RFI/RFP, Cronograma, Relatórios, ERP, Orçamento)", "Esses cartões usam apenas origem, estado e sincronização (cobertos por integracoes.integracoes.cartao-fonte e status-fonte); não há regra operacional específica para documentar além disso. Providência: revisar se uma fonte ganhar painel."),
    exempt(INT, "button", "Link Caixas de e-mail: diagnóstico por caixa (7 etapas)", "Link de navegação para /[projectId]/integracoes/caixas, documentada na própria rota."),

    // ---------------------------------------------------------------- /[projectId]/integracoes/caixas
    el(CX, "page", "Caixas de e-mail da obra", "integracoes.caixas.pagina"),
    el(CX, "table", "Caixas e etapas (7 etapas)", "integracoes.caixas.tabela"),
    el(CX, "status", "Estado da etapa (Comprovado, Indício, Parcial, Pendente, Bloqueado, Indisponível)", "integracoes.caixas.estado-etapa"),
    el(CX, "admin-action", "Registrar autorização corporativa", "integracoes.caixas.registrar-autorizacao"),
    el(CX, "admin-action", "Habilitar coleta (período obrigatório)", "integracoes.caixas.habilitar-coleta"),
    el(CX, "admin-action", "Desligar coleta", "integracoes.caixas.desligar-coleta"),
    el(CX, "admin-action", "Revogar coleta (efeito imediato)", "integracoes.caixas.revogar"),
    el(CX, "message", "Suspensão da coleta por erros (coluna Habilitada para coleta)", "integracoes.caixas.suspensao-erros"),
    el(CX, "table", "Mensagens e anexos efetivamente importados", "integracoes.caixas.mensagens-importadas"),
    gap(CX, "message", "Mensagens de resultado e de erro da página (Autorização registrada, Coleta habilitada etc.)", "Textos de confirmação e erro vindos das ações (FLASH/ERRORS); descritos na ajuda das ações, sem entrada própria. Providência: criar entradas de mensagem se necessário."),
    gap(CX, "message", "Dicas de evidência por etapa (atributo title das células)", "As células usam o atributo title para a evidência, o que a regra de Hover Text não permite; a evidência completa já aparece no detalhe da caixa. Providência: substituir por FeatureInfo/HelpHint em componente de tabela (alteração de layout fora do escopo desta rodada)."),

    // ---------------------------------------------------------------- /autorizacao-email/[authorizationId]
    el(AUT, "page", "Autorização de acesso aos e-mails da obra", "integracoes.autorizacao.pagina"),
    el(AUT, "status", "Aceite no ACC e Conexão da conta Google", "integracoes.autorizacao.estado"),
    el(AUT, "message", "Texto da autorização (escopo, filtros, como revogar no Google)", "integracoes.autorizacao.texto"),
    el(AUT, "button", "Autorizar acesso / Não autorizar / Confirmar", "integracoes.autorizacao.decisao"),
    el(AUT, "button", "Revogar autorização desta obra", "integracoes.autorizacao.revogar"),
    el(AUT, "table", "Histórico", "integracoes.autorizacao.historico"),
    exempt(AUT, "button", "Foto do assistente de dúvidas no cabeçalho e widget do assistente", "Assistente de dúvidas de uso do ACC (componente compartilhado); documentado fora deste módulo."),
  ],
};
