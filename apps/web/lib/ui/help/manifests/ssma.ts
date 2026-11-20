// Manifesto (inventário AUTORITATIVO) do módulo "ssma": rotas e elementos funcionais com o helpId que os documenta.
// Arquivo EXCLUSIVO do módulo. Regras: ver lib/ui/help/types.ts (HelpManifest) e scripts/test-help-catalog.mjs.
import type { HelpElementKind, HelpManifest, HelpManifestElement } from "../types";

const ESG = "/[projectId]/esg";
const AVAL = "/[projectId]/ssma-avaliacao";
const REG = "/[projectId]/ssma-registros";
const APP = "/ssma/[projectId]";
const PICK = "/ssma";
const OFF = "/ssma/offline";

const el = (route: string, kind: HelpElementKind, label: string, helpId: string, tab?: string): HelpManifestElement => ({ route, kind, label, helpId, ...(tab ? { tab } : {}) });
const gap = (route: string, kind: HelpElementKind, label: string, why: string, tab?: string): HelpManifestElement => ({ route, kind, label, gap: why, ...(tab ? { tab } : {}) });
const exempt = (route: string, kind: HelpElementKind, label: string, why: string, tab?: string): HelpManifestElement => ({ route, kind, label, exempt: why, ...(tab ? { tab } : {}) });

export const SSMA_MANIFEST: HelpManifest = {
  module: "ssma",
  routes: [ESG, AVAL, REG, APP, PICK, OFF],
  elements: [
    // ---------------------------------------------------------------- /[projectId]/esg
    el(ESG, "page", "Comprovação de Obrigações ESG/SSMA", "ssma.esg.pagina"),
    el(ESG, "button", "Registros de campo / Abrir aplicativo", "ssma.esg.app-campo"),
    el(ESG, "filter", "Campo Obra", "ssma.esg.seletor-obra"),
    el(ESG, "filter", "Painel de filtro do Dashboard (Limpar filtro)", "ssma.esg.filtro-painel"),
    el(ESG, "tab", "Minhas pendências", "esg-tab-pendencias", "Minhas pendências"),
    el(ESG, "tab", "Visão gerencial", "esg-tab-gerencial", "Visão gerencial"),
    el(ESG, "tab", "Checklist do projeto", "esg-tab-checklist", "Checklist do projeto"),
    el(ESG, "tab", "Diretor de ESG IA", "esg-tab-consultar", "Diretor de ESG IA"),
    el(ESG, "table", "Lista de pendências (categoria, prazo, evidência)", "ssma.esg.pendencias-lista", "Minhas pendências"),
    el(ESG, "kpi", "Cartões Total / Cumpridas / Parciais / Pendentes / Não cumpridas / Risco alto-crítico", "ssma.esg.gerencial-contadores", "Visão gerencial"),
    el(ESG, "filter", "Filtros: status, categoria, risco, responsável, período", "ssma.esg.gerencial-filtros", "Visão gerencial"),
    el(ESG, "table", "Tabela: Obrigação, Categoria, Responsável, Último registro", "ssma.esg.gerencial-tabela", "Visão gerencial"),
    el(ESG, "status", "Coluna Status / selo de status da comprovação", "ssma.esg.status-comprovacao", "Visão gerencial"),
    el(ESG, "status", "Coluna Risco / selo de risco", "ssma.esg.risco-obrigacao", "Visão gerencial"),
    el(ESG, "admin-action", "Nova obrigação / Adicionar obrigação ao checklist", "ssma.esg.nova-obrigacao", "Checklist do projeto"),
    el(ESG, "field", "Categoria", "ssma.esg.obrigacao-categoria", "Checklist do projeto"),
    el(ESG, "field", "Periodicidade", "ssma.esg.obrigacao-periodicidade", "Checklist do projeto"),
    el(ESG, "field", "Cláusula/referência e Origem contratual", "ssma.esg.obrigacao-origem", "Checklist do projeto"),
    el(ESG, "field", "Evidência exigida", "ssma.esg.obrigacao-evidencia-exigida", "Checklist do projeto"),
    el(ESG, "field", "Penalidade prevista", "ssma.esg.obrigacao-penalidade", "Checklist do projeto"),
    el(ESG, "field", "Responsável (texto livre)", "ssma.esg.obrigacao-responsavel", "Checklist do projeto"),
    gap(ESG, "field", "Título da obrigação e Descrição", "Campos de texto livre sem regra própria de cálculo; não receberam ajuda individual nesta rodada. Providência: documentar o uso recomendado de título e descrição se a gestão ESG pedir.", "Checklist do projeto"),
    el(ESG, "table", "Cartão da obrigação (selo Inativa, cláusula, fonte, responsável)", "ssma.esg.obrigacao-cartao", "Checklist do projeto"),
    el(ESG, "table", "Histórico de comprovações (autor, evidências, revisão)", "ssma.esg.comprovacao-historico", "Checklist do projeto"),
    el(ESG, "button", "Registrar nova comprovação / Registrar comprovação", "ssma.esg.comprovacao-formulario", "Checklist do projeto"),
    el(ESG, "field", "Data de referência, Rótulo do período e Prazo", "ssma.esg.comprovacao-datas", "Checklist do projeto"),
    el(ESG, "field", "Status (formulário de comprovação)", "ssma.esg.comprovacao-status", "Checklist do projeto"),
    el(ESG, "field", "Campos do DDS: tema, equipe/público, participantes", "ssma.esg.comprovacao-dds", "Checklist do projeto"),
    el(ESG, "field", "Justificativa", "ssma.esg.comprovacao-justificativa", "Checklist do projeto"),
    el(ESG, "field", "Evidências (arquivos)", "ssma.esg.comprovacao-evidencias", "Checklist do projeto"),
    gap(ESG, "field", "Descrição e Observação da comprovação", "Campos de texto livre sem regra própria; só aparecem no histórico. Providência: nenhuma regra a documentar até haver exigência da gestão.", "Checklist do projeto"),
    el(ESG, "admin-action", "Revisar/ajustar status (Administrador) e Confirmar revisão", "ssma.esg.revisao-formulario", "Checklist do projeto"),
    gap(ESG, "expert", "Painel de consulta do Diretor de ESG IA (pergunta, resposta, avisos)", "Painel é o componente compartilhado components/ai/expert-query-panel (fora da área deste módulo); a aba está documentada por esg-tab-consultar. Providência: o dono dos componentes de especialistas documenta o painel.", "Diretor de ESG IA"),

    // ---------------------------------------------------------------- /[projectId]/ssma-registros
    el(REG, "page", "Registros de campo SSMA", "ssma.registros.pagina"),
    el(REG, "button", "Abrir app de campo", "ssma.registros.abrir-app"),
    el(REG, "kpi", "Resumo: Registros, Ações em aberto, Ações em atraso, Críticos em aberto", "ssma.registros.resumo"),
    el(REG, "admin-action", "Possíveis duplicidades de acidente (Mesmo fato / Fatos distintos)", "ssma.registros.duplicidades"),
    el(REG, "kpi", "Near Misses (quase-acidentes)", "ssma.registros.near-misses"),
    el(REG, "filter", "Filtro De / Até (Filtrar período, Limpar)", "ssma.registros.filtro-periodo"),
    el(REG, "table", "Tabela Registros (Fato, Tipo/categoria, Local, Registrado por, Responsável, Prazo, Fotos)", "ssma.registros.tabela"),
    el(REG, "status", "Coluna Risco", "ssma.registro.risco"),
    el(REG, "status", "Coluna Ação corretiva", "ssma.registro.acao-corretiva"),
    el(REG, "table", "Checklists enviados (galeria de fotos)", "ssma.registros.checklists-enviados"),
    el(REG, "setting", "Instalar no celular (QR Code)", "ssma.app.instalar-celular"),

    // ---------------------------------------------------------------- /[projectId]/ssma-avaliacao
    el(AVAL, "page", "Avaliação do técnico SSMA — PRÉVIA", "ssma.avaliacao.pagina"),
    el(AVAL, "filter", "Técnico, Mês e Calcular", "ssma.avaliacao.filtros"),
    el(AVAL, "message", "Aviso de PRÉVIA", "ssma.avaliacao.aviso-previa"),
    el(AVAL, "kpi", "Nota total (Ficha mensal / Ficha acumulada)", "ssma.avaliacao.nota"),
    el(AVAL, "table", "Dimensões (peso, nota, memória de cálculo, evidências)", "ssma.avaliacao.dimensoes"),
    el(AVAL, "button", "Manifestação e validação (demonstrativo)", "ssma.avaliacao.fluxo-demo"),

    // ---------------------------------------------------------------- /ssma (seleção de obra)
    el(PICK, "page", "Selecione a obra", "ssma.app.obras"),
    el(PICK, "setting", "Instalar no celular (QR Code)", "ssma.app.instalar-celular"),
    exempt(PICK, "button", "Lista de obras autorizadas", "Cada item é um link para a obra; o comportamento (apenas obras com vínculo ativo) está descrito em ssma.app.obras."),

    // ---------------------------------------------------------------- /ssma/[projectId] (aplicativo de campo)
    el(APP, "page", "Aplicativo SSMA/ESG (início)", "ssma.app.pagina"),
    el(APP, "kpi", "Checklist de hoje (n de 4 enviados)", "ssma.app.checklist-hoje"),
    el(APP, "status", "Aguardando envio / Sincronizado", "ssma.app.sincronizacao-estado"),
    el(APP, "button", "Relatórios diários obrigatórios (01, 03, 07 e 09)", "ssma.app.relatorios-diarios"),
    el(APP, "button", "Relatórios avulsos (02, 04, 05, 06, 08, 10, 11 e 12)", "ssma.app.relatorios-avulsos"),
    exempt(APP, "tab", "Aba Início", "A aba Início é a própria tela inicial do aplicativo, documentada em ssma.app.pagina.", "Início"),
    el(APP, "tab", "Aba Registros", "ssma.app.aba-registros", "Registros"),
    el(APP, "tab", "Aba Sincronização (Envios)", "ssma.app.aba-sincronizacao", "Sincronização"),
    el(APP, "tab", "Aba Perfil", "ssma.app.aba-perfil", "Perfil"),
    el(APP, "page", "Formulário de relatório (telas 1 a 12)", "ssma.form.pagina"),
    el(APP, "field", "Obra, Técnico responsável e Data e hora", "ssma.form.contexto"),
    el(APP, "field", "Tipo de ocorrência (Acidente / Near Miss)", "ssma.form.tipo-ocorrencia"),
    el(APP, "field", "Classificação do risco", "ssma.form.classificacao-risco"),
    el(APP, "field", "Checklist Feito / NA", "ssma.form.checklist"),
    el(APP, "field", "Fotos do formulário (ações de foto, selecionar fotos)", "ssma.form.fotos"),
    el(APP, "button", "Enviar dados", "ssma.form.enviar"),
    gap(APP, "field", "Campos próprios de cada formulário (tema, participantes, local, empresa, MTR, afastamento etc.)", "Definidos em lib/ssma/checklist-definitions.ts; são dados de preenchimento sem regra de cálculo própria. Os fluxos e as consequências estão em ssma.form.* e ssma.app.relatorios-*; ajuda por campo não foi criada. Providência: documentar campo a campo se a SSMA solicitar."),
    el(APP, "page", "Novo registro (ocorrência / inspeção)", "ssma.registro.novo"),
    el(APP, "field", "Tipo de registro e Categoria", "ssma.registro.tipo-categoria"),
    el(APP, "field", "Descrição, Local e Data e hora do fato", "ssma.registro.descricao-local-data"),
    el(APP, "field", "Risco do registro", "ssma.registro.risco"),
    el(APP, "field", "Ação corretiva: Responsável e Prazo", "ssma.registro.acao-corretiva-campos"),
    el(APP, "field", "Fotos do registro (Tirar foto, Da galeria)", "ssma.registro.fotos"),
    el(APP, "button", "Salvar registro", "ssma.registro.salvar"),
    el(APP, "table", "Registros da obra", "ssma.registro.lista", "Registros"),
    el(APP, "filter", "Filtros: categoria, tipo, risco, De/Até", "ssma.registro.filtros", "Registros"),
    el(APP, "button", "Atualizar", "ssma.registro.atualizar", "Registros"),
    el(APP, "status", "Neste aparelho: Salvo no aparelho / Aguardando envio / Sincronizado / Falha", "ssma.registro.estado-fila", "Registros"),
    el(APP, "status", "Estado das fotos (Pendente, Enviando, Sincronizada, Falha)", "ssma.registro.estado-foto", "Registros"),
    el(APP, "page", "Detalhe do registro", "ssma.registro.detalhe", "Registros"),
    el(APP, "message", "Avisos por e-mail do registro", "ssma.registro.aviso-email", "Registros"),
    el(APP, "status", "Ação corretiva (status, responsável, prazo, histórico)", "ssma.registro.acao-corretiva", "Registros"),
    el(APP, "button", "Registrar andamento / Concluir ação", "ssma.registro.andamento-conclusao", "Registros"),
    el(APP, "admin-action", "Encaminhar para outro responsável", "ssma.registro.encaminhar", "Registros"),
    el(APP, "button", "Usar como evidência ESG / Desfazer vínculo", "ssma.registro.evidencia-esg", "Registros"),
    el(APP, "expert", "Consultar IA — especialista de SSMA", "ssma.registro.consultar-ia", "Registros"),
    el(APP, "kpi", "Resumo da fila (Salvo, Aguardando, Sincronizado, Falha)", "ssma.sync.resumo", "Sincronização"),
    el(APP, "button", "Enviar agora / tentar de novo", "ssma.sync.enviar-agora", "Sincronização"),
    el(APP, "button", "Descartar este registro do aparelho", "ssma.sync.descartar", "Sincronização"),
    el(APP, "admin-action", "Registros de outra conta (Remover do aparelho)", "ssma.sync.outras-contas", "Sincronização"),
    el(APP, "message", "O que funciona sem sinal", "ssma.sync.offline-capacidades", "Sincronização"),
    el(APP, "button", "Sair da conta", "ssma.perfil.sair", "Perfil"),
    el(APP, "setting", "Instalar no celular (QR Code)", "ssma.app.instalar-celular"),
    exempt(APP, "button", "Botão Voltar e acesso à AXIA no cabeçalho", "Navegação e o assistente de dúvidas de uso (componente compartilhado de assistente) pertencem a outros módulos; sem regra própria do SSMA."),

    // ---------------------------------------------------------------- /ssma/offline
    el(OFF, "page", "Sem conexão (casca offline)", "ssma.offline.pagina"),
    el(OFF, "message", "O que funciona sem sinal", "ssma.sync.offline-capacidades"),
    el(OFF, "status", "Fila de envios do aparelho (estados)", "ssma.registro.estado-fila"),
    gap(OFF, "button", "Telas de Registros, Envios e Perfil em modo sem conexão", "A casca reutiliza as telas do aplicativo (FieldRecordsApp); os elementos estão documentados na rota /ssma/[projectId] (abas Registros, Sincronização e Perfil) e apareceriam aqui com os mesmos helpIds. Providência: validar em navegador real que o painel de ajuda funciona no modo offline (service worker)."),
  ],
};
