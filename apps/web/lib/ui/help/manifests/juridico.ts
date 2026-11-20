// Manifesto (inventário AUTORITATIVO) do módulo "juridico": rotas e elementos funcionais com o helpId que os documenta.
// Arquivo EXCLUSIVO do módulo. Regras: ver lib/ui/help/types.ts (HelpManifest) e scripts/test-help-catalog.mjs.
import type { HelpManifest, HelpManifestElement } from "../types";

const JURIDICO = "/[projectId]/juridico";
const CONSULTA = "/[projectId]/juridico/consulta/[consultationId]";
const ANALISES = "/juridico";
const CLAUSULAS = "/[projectId]/revisao-clausulas";
const CONTRATUAL = "/[projectId]/revisao-contratual";
const DOCUMENTOS = "/[projectId]/documentos";
const EMAIL = "/[projectId]/documentos/emails/[emailId]";
const ANEXO = "/[projectId]/documentos/emails/[emailId]/anexos/[attachmentId]";
const VERSAO = "/[projectId]/documentos/versoes/[documentVersionId]";
const STARTUP = "/[projectId]/startup";

const WEEKLY_GAP =
  "Bloco do relatório semanal/ingestão de e-mail (rota condicionada à flag ACC_WEEKLY_REPORTS_ENABLED): regras de classificação, Matriz de escalões, comparação de cronograma MPP, baseline e revisão ainda sem texto próprio; providência: documentar em rodada dedicada junto com o módulo de relatórios semanais/planejamento.";

const elements: HelpManifestElement[] = [
  // ---------------- /[projectId]/juridico ----------------
  { route: JURIDICO, kind: "page", label: "Jurídico", helpId: "juridico.projeto.pagina" },
  { route: JURIDICO, kind: "table", label: "Base documental", helpId: "juridico.projeto.base-documental" },
  { route: JURIDICO, kind: "button", label: "Gerenciar documentos", helpId: "juridico.projeto.base-documental" },
  { route: JURIDICO, kind: "field", label: "Pergunta ao especialista jurídico (Consultar)", helpId: "juridico.projeto.consulta-especialista" },
  { route: JURIDICO, kind: "message", label: "Aviso de provedor de IA (real x determinístico)", helpId: "juridico.projeto.consulta-especialista" },
  { route: JURIDICO, kind: "message", label: "Limite diário de consultas de IA (20 por usuário, 100 por obra)", helpId: "juridico.projeto.consulta-especialista" },
  { route: JURIDICO, kind: "table", label: "Minhas consultas jurídicas", helpId: "juridico.projeto.minhas-consultas" },
  { route: JURIDICO, kind: "button", label: "Abrir consulta", helpId: "juridico.projeto.minhas-consultas" },
  { route: JURIDICO, kind: "button", label: "Excluir consulta", helpId: "juridico.projeto.excluir-consulta" },
  { route: JURIDICO, kind: "field", label: "Documento da negociação (pré-contratual)", helpId: "juridico.precontratual.documento" },
  { route: JURIDICO, kind: "status", label: "Status do documento da negociação (Enviando, Processando, Pronto, Erro...)", helpId: "juridico.precontratual.documento" },
  { route: JURIDICO, kind: "button", label: "Consultar todos os especialistas (análise integrada)", helpId: "juridico.precontratual.analise-integrada" },

  // ---------------- /[projectId]/juridico/consulta/[consultationId] ----------------
  { route: CONSULTA, kind: "page", label: "Consulta jurídica", helpId: "juridico.consulta.pagina" },
  { route: CONSULTA, kind: "button", label: "Excluir consulta", helpId: "juridico.projeto.excluir-consulta" },

  // ---------------- /juridico ----------------
  { route: ANALISES, kind: "page", label: "Jurídico — análise prévia", helpId: "juridico.analises.pagina" },
  { route: ANALISES, kind: "field", label: "Nova análise pré-contratual (nome, cliente, Criar e anexar documentos)", helpId: "juridico.analises.nova-analise" },
  { route: ANALISES, kind: "table", label: "Análises pré-contratuais existentes (cards)", helpId: "juridico.analises.pagina" },

  // ---------------- /[projectId]/revisao-clausulas ----------------
  { route: CLAUSULAS, kind: "page", label: "Revisão de Cláusulas", helpId: "juridico.revisao-clausulas.pagina" },
  { route: CLAUSULAS, kind: "kpi", label: "Pendentes / Aprovados / Rejeitados / Total detectado", helpId: "juridico.revisao-clausulas.totais" },
  { route: CLAUSULAS, kind: "filter", label: "Buscar, Parte, Status, Só os que exigem conferência, Filtrar, Limpar", helpId: "juridico.revisao-clausulas.filtros" },
  { route: CLAUSULAS, kind: "table", label: "Lista de candidatos (número, título, parte, páginas, selos, paginação)", helpId: "juridico.revisao-clausulas.lista" },
  { route: CLAUSULAS, kind: "status", label: "Confiança da detecção", helpId: "juridico.revisao-clausulas.confianca" },
  { route: CLAUSULAS, kind: "status", label: "Exige conferência com o original / selo conferir", helpId: "juridico.revisao-clausulas.conferir" },
  { route: CLAUSULAS, kind: "message", label: "Evidência de origem e Abrir página original", helpId: "juridico.revisao-clausulas.evidencia" },
  { route: CLAUSULAS, kind: "message", label: "Aviso de leitura parcial por versão (cobertura)", helpId: "juridico.documentos.cobertura-leitura" },
  { route: CLAUSULAS, kind: "button", label: "Aprovar cláusula", helpId: "juridico.revisao-clausulas.aprovar" },
  { route: CLAUSULAS, kind: "field", label: "Número, Título, Texto contratual e Observação da revisão", helpId: "juridico.revisao-clausulas.aprovar" },
  { route: CLAUSULAS, kind: "button", label: "Rejeitar candidato (justificativa)", helpId: "juridico.revisao-clausulas.rejeitar" },
  { route: CLAUSULAS, kind: "message", label: "Regra de governança", helpId: "juridico.revisao-clausulas.regra-governanca" },
  { route: CLAUSULAS, kind: "button", label: "Documentos (atalho)", exempt: "Link de navegação para a tela Documentos; o destino já é documentado na própria tela e no item de menu." },

  // ---------------- /[projectId]/revisao-contratual ----------------
  { route: CONTRATUAL, kind: "page", label: "Revisão Contratual", helpId: "juridico.revisao-contratual.pagina" },
  { route: CONTRATUAL, kind: "kpi", label: "Pendentes / Sua permissão / Pode revisar", helpId: "juridico.revisao-contratual.resumo" },
  { route: CONTRATUAL, kind: "table", label: "Candidato (assunto, categorias, Score, Mensagens, Início, Última mensagem, evidências)", helpId: "juridico.revisao-contratual.candidato" },
  { route: CONTRATUAL, kind: "status", label: "Prioridade do candidato (Baixo, Médio, Alto, Crítico)", helpId: "shared.global.criticidade-medio" },
  { route: CONTRATUAL, kind: "button", label: "Aprovar como evento", helpId: "juridico.revisao-contratual.aprovar" },
  { route: CONTRATUAL, kind: "button", label: "Rejeitar candidato (justificativa)", helpId: "juridico.revisao-contratual.rejeitar" },

  // ---------------- /[projectId]/documentos ----------------
  { route: DOCUMENTOS, kind: "page", label: "Documentos", helpId: "juridico.documentos.pagina" },
  { route: DOCUMENTOS, tab: "documentos", kind: "tab", label: "Documentos", helpId: "documentos-tab-documentos" },
  { route: DOCUMENTOS, tab: "clausulas", kind: "tab", label: "Cláusulas", helpId: "documentos-tab-clausulas" },
  { route: DOCUMENTOS, tab: "cronograma", kind: "tab", label: "Cronograma", helpId: "documentos-tab-cronograma" },
  { route: DOCUMENTOS, tab: "anexos-email", kind: "tab", label: "Anexos de E-mail", helpId: "documentos-tab-anexos-email" },
  { route: DOCUMENTOS, tab: "registro-email", kind: "tab", label: "Registro por e-mail (somente com relatórios semanais ativos)", helpId: "documentos-tab-registro-email" },
  { route: DOCUMENTOS, tab: "documentos", kind: "field", label: "Adicionar documentos (arrastar e soltar, Selecionar arquivos)", helpId: "juridico.documentos.upload-multiplo" },
  { route: DOCUMENTOS, tab: "documentos", kind: "filter", label: "Tipo para aplicar ao lote / Aplicar aos arquivos aguardando / Iniciar envio", helpId: "juridico.documentos.tipo-lote" },
  { route: DOCUMENTOS, tab: "documentos", kind: "status", label: "Estado de cada arquivo do lote; Remover; Tentar novamente", helpId: "juridico.documentos.fila-status" },
  { route: DOCUMENTOS, tab: "documentos", kind: "kpi", label: "Progresso geral do lote e Limpar todos os erros", helpId: "juridico.documentos.progresso-lote" },
  { route: DOCUMENTOS, tab: "documentos", kind: "message", label: "Decisão: nova versão ou documento separado / conflito de tipo", helpId: "juridico.documentos.decisao-versao" },
  { route: DOCUMENTOS, tab: "documentos", kind: "field", label: "Upload individual (avançado)", helpId: "juridico.documentos.upload-individual" },
  { route: DOCUMENTOS, tab: "documentos", kind: "table", label: "Hierarquia contratual (Contrato-base, Aditivos e anexos)", helpId: "juridico.documentos.hierarquia" },
  { route: DOCUMENTOS, tab: "documentos", kind: "table", label: "Versões do documento (situação, idioma, revisão humana, download, Adicionar nova versão)", helpId: "juridico.documentos.versao" },
  { route: DOCUMENTOS, tab: "documentos", kind: "status", label: "Leitura parcial / revisão visual (cobertura)", helpId: "juridico.documentos.cobertura-leitura" },
  { route: DOCUMENTOS, tab: "documentos", kind: "field", label: "Partes e anexos do contrato", helpId: "juridico.documentos.anexos-contrato" },
  { route: DOCUMENTOS, tab: "documentos", kind: "admin-action", label: "Vincular como anexo contratual / Desvincular", helpId: "juridico.documentos.vincular-anexo" },
  { route: DOCUMENTOS, tab: "documentos", kind: "field", label: "Respostas do cliente / Vincular resposta do cliente", helpId: "juridico.documentos.respostas-cliente" },
  { route: DOCUMENTOS, tab: "documentos", kind: "admin-action", label: "Lixeira (enviar, restaurar, excluir definitivamente)", helpId: "juridico.documentos.lixeira" },
  { route: DOCUMENTOS, tab: "clausulas", kind: "table", label: "Lista e texto das cláusulas", helpId: "juridico.documentos.clausulas-lista" },
  { route: DOCUMENTOS, tab: "cronograma", kind: "table", label: "Atividades do cronograma e Analisar cronograma", helpId: "juridico.documentos.cronograma-lista" },
  { route: DOCUMENTOS, tab: "anexos-email", kind: "filter", label: "Filtros e ordenação dos anexos de e-mail", helpId: "juridico.documentos.anexos-email-filtros" },
  { route: DOCUMENTOS, tab: "anexos-email", kind: "table", label: "Anexo de e-mail (situação, e-mail de origem, proveniência, Incorporar aos Documentos)", helpId: "juridico.documentos.anexos-email-linha" },
  { route: DOCUMENTOS, tab: "anexos-email", kind: "status", label: "Considerado pelo ACC", helpId: "anexos-considerado" },
  { route: DOCUMENTOS, tab: "anexos-email", kind: "status", label: "Incorporado aos Documentos", helpId: "anexos-incorporado" },
  { route: DOCUMENTOS, tab: "registro-email", kind: "table", label: "Registro por e-mail: filtros, lista, painel de revisão e planilha do relatório semanal", gap: WEEKLY_GAP },

  // ---------------- /[projectId]/documentos/versoes/[documentVersionId] ----------------
  { route: VERSAO, kind: "page", label: "Visualizar documento", helpId: "juridico.versoes.pagina" },
  { route: VERSAO, kind: "status", label: "Leitura do documento (extração mais recente)", helpId: "juridico.versoes.cobertura" },
  { route: VERSAO, kind: "field", label: "Conteúdo extraído (Texto original / Normalizado)", helpId: "juridico.versoes.texto-extraido" },
  { route: VERSAO, kind: "field", label: "Arquivo original (seleção de arquivo e página)", helpId: "juridico.versoes.pagina" },

  // ---------------- /[projectId]/documentos/emails/[emailId] ----------------
  { route: EMAIL, kind: "page", label: "E-mail do registro documental", helpId: "juridico.emails.pagina" },
  { route: EMAIL, kind: "table", label: "Anexos do e-mail", helpId: "juridico.emails.anexos" },
  { route: EMAIL, kind: "table", label: "Metadados do e-mail e classificação", gap: WEEKLY_GAP },
  { route: EMAIL, kind: "table", label: "Envio semanal (ingestão)", gap: WEEKLY_GAP },
  { route: EMAIL, kind: "table", label: "Cronograma MPP e comparações; Relatório Semanal (Excel); Outros envios da mesma semana", gap: WEEKLY_GAP },
  { route: EMAIL, kind: "admin-action", label: "Revisão humana do envio e Baseline oficial", gap: WEEKLY_GAP },
  { route: EMAIL, kind: "table", label: "Histórico de revisão e auditoria", gap: WEEKLY_GAP },

  // ---------------- /[projectId]/documentos/emails/[emailId]/anexos/[attachmentId] ----------------
  { route: ANEXO, kind: "page", label: "Visualizar anexo de e-mail", helpId: "juridico.emails.anexo-pagina" },

  // ---------------- /[projectId]/startup ----------------
  { route: STARTUP, kind: "page", label: "Start-up ACC", helpId: "juridico.startup.pagina" },
  { route: STARTUP, kind: "kpi", label: "Progresso do checklist (N de 18 etapas, barra)", helpId: "juridico.startup.checklist" },
  { route: STARTUP, kind: "field", label: "Etapa do checklist (título-link, caixa de marcação, selo DONE)", helpId: "juridico.startup.etapa" },
  { route: STARTUP, kind: "button", label: "Dashboard (atalho)", exempt: "Link de navegação para o Dashboard; o destino já é documentado no item de menu e na própria tela." },
  {
    route: STARTUP,
    kind: "admin-action",
    label: "Revisão histórica: Desconsiderar, Já tratado / pacificado, Cuidar deste assunto, datas da obra e Concluir Start-up",
    exempt:
      "Não existe na tela atual: desde o commit 913d672 a página monta só o checklist. Os componentes históricos seguem no repositório sem uso; textos legados preservados (startup-dismiss, startup-resolve, startup-create-action, startup-complete, startup-project-start-date).",
  },
];

export const JURIDICO_MANIFEST: HelpManifest = {
  module: "juridico",
  routes: [JURIDICO, CONSULTA, ANALISES, CLAUSULAS, CONTRATUAL, DOCUMENTOS, EMAIL, ANEXO, VERSAO, STARTUP],
  elements,
};
