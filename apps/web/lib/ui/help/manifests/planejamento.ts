// Manifesto (inventário AUTORITATIVO) do módulo "planejamento": rotas e elementos funcionais com o helpId que os documenta.
// Arquivo EXCLUSIVO do módulo. Regras: ver lib/ui/help/types.ts (HelpManifest) e scripts/test-help-catalog.mjs.
// Rotas conferidas no repositório (page.tsx reais). Elementos inventariados a partir da leitura dos componentes de cada tela;
// o que não tem ícone individual aparece como `exempt` (coberto por outro helpId da MESMA tela) ou `gap` (com providência).
import type { HelpElementKind, HelpManifest, HelpManifestElement } from "../types";

const ACOES = "/[projectId]/acoes";
const CONFIG = "/[projectId]/acoes/configuracao";
const RESUMO = "/[projectId]/acoes/resumo-semanal/[digestId]";
const SOLICITACOES = "/[projectId]/action-requests";
const SOLICITACAO = "/[projectId]/action-requests/[actionRequestId]";
const ALERTA = "/[projectId]/alertas/[caseId]";
const ALERTA_ACAO = "/alertas/acao/[projectId]/[batchId]/[eventId]";
const CONSULTA_IA = "/alertas/consulta-ia/[projectId]/[subject]/[id]";
const ALERTA_LOTE = "/alertas/lote/[projectId]/[batchId]";
const ALERTA_PROVIDENCIA = "/alertas/providencia/[projectId]/[itemId]";
const REEMISSAO = "/[projectId]/reemissao-alertas";
const PROVIDENCIAS = "/[projectId]/providencias";
const EMAIL_ACTION = "/email-actions/[token]";
const LEDGER = "/[projectId]/ledger";
const LEDGER_EVENTO = "/[projectId]/ledger/[eventId]";
const LEDGER_LOTE = "/[projectId]/ledger/lote-alertas/[batchId]";
const TIMELINE = "/[projectId]/timeline";

const el = (route: string, kind: HelpElementKind, label: string, helpId: string, tab?: string): HelpManifestElement => ({ route, kind, label, helpId, ...(tab ? { tab } : {}) });
const gap = (route: string, kind: HelpElementKind, label: string, why: string, tab?: string): HelpManifestElement => ({ route, kind, label, gap: why, ...(tab ? { tab } : {}) });
const exempt = (route: string, kind: HelpElementKind, label: string, why: string, tab?: string): HelpManifestElement => ({ route, kind, label, exempt: why, ...(tab ? { tab } : {}) });

const A = "Ações abertas";
const G = "Visão gerencial";
const H = "Histórico";
const N = "Nova ação";

export const PLANEJAMENTO_MANIFEST: HelpManifest = {
  module: "planejamento",
  routes: [
    ACOES, CONFIG, RESUMO, SOLICITACOES, SOLICITACAO, ALERTA, ALERTA_ACAO, CONSULTA_IA, ALERTA_LOTE, ALERTA_PROVIDENCIA,
    REEMISSAO, PROVIDENCIAS, EMAIL_ACTION, LEDGER, LEDGER_EVENTO, LEDGER_LOTE, TIMELINE,
  ],
  elements: [
    // ------------------------------------------------------------------ /[projectId]/acoes
    el(ACOES, "page", "Ações e Escalonamentos", "planejamento.acoes.pagina"),
    el(ACOES, "tab", "Ações abertas", "acoes-tab-abertas", A),
    el(ACOES, "tab", "Visão gerencial", "acoes-tab-gerencial", G),
    el(ACOES, "tab", "Histórico", "acoes-tab-historico", H),
    el(ACOES, "tab", "Nova ação", "acoes-tab-nova", N),
    el(ACOES, "button", "Verificar escalonamentos", "planejamento.acoes.verificar-escalonamentos"),
    el(ACOES, "admin-action", "Matriz de responsabilidades e prazos", "planejamento.acoes.matriz-link"),
    el(ACOES, "status", "Selo de criticidade da ação", "planejamento.acoes.risco-badge", A),
    el(ACOES, "status", "Selo de situação da ação", "planejamento.acoes.status-badge", A),
    el(ACOES, "status", "Selo do nível de escalonamento", "planejamento.acoes.nivel-badge", A),
    el(ACOES, "status", "Prazos para assumir, concluir e contratual", "planejamento.acoes.prazos", A),
    el(ACOES, "message", "Histórico de escalonamentos da ação", "planejamento.acoes.escalonamentos-historico", A),
    el(ACOES, "message", "Aviso: ação pertence a um alerta de risco", "planejamento.acoes.aviso-alerta-risco", A),
    el(ACOES, "button", "Assumir Ação", "planejamento.acoes.assumir", A),
    el(ACOES, "button", "Estudando solução", "planejamento.acoes.estudando-solucao", A),
    el(ACOES, "button", "Concluir Ação", "planejamento.acoes.concluir", A),
    el(ACOES, "field", "Observação de conclusão", "planejamento.acoes.observacao-conclusao", A),
    el(ACOES, "button", "Encaminhar", "planejamento.acoes.encaminhar", A),
    el(ACOES, "field", "Encaminhar para", "planejamento.acoes.encaminhar-para", A),
    el(ACOES, "field", "Motivo do encaminhamento", "planejamento.acoes.encaminhar-motivo", A),
    el(ACOES, "table", "Ações via e-mail", "planejamento.acoes.acoes-via-email", A),
    el(ACOES, "status", "Selos de criticidade, situação e nível no Histórico", "planejamento.acoes.status-badge", H),
    el(ACOES, "kpi", "Total", "planejamento.acoes.kpi-total", G),
    el(ACOES, "kpi", "Vencidas", "planejamento.acoes.kpi-vencidas", G),
    el(ACOES, "kpi", "Escaladas", "planejamento.acoes.kpi-escaladas", G),
    el(ACOES, "kpi", "Risco alto/crítico", "planejamento.acoes.kpi-risco-alto-critico", G),
    el(ACOES, "kpi", "Concluídas", "planejamento.acoes.kpi-concluidas", G),
    el(ACOES, "filter", "Filtro Risco", "planejamento.acoes.filtro-risco", G),
    el(ACOES, "filter", "Filtro Status", "planejamento.acoes.filtro-status", G),
    el(ACOES, "filter", "Filtro Área", "planejamento.acoes.filtro-area", G),
    el(ACOES, "filter", "Filtro Responsável", "planejamento.acoes.filtro-responsavel", G),
    el(ACOES, "filter", "Filtro Escalão", "planejamento.acoes.filtro-escalao", G),
    el(ACOES, "table", "Coluna Ação", "planejamento.acoes.col-acao", G),
    el(ACOES, "table", "Coluna Risco", "planejamento.acoes.risco-badge", G),
    el(ACOES, "table", "Coluna Área", "planejamento.acoes.col-area", G),
    el(ACOES, "table", "Coluna Responsável", "planejamento.acoes.col-responsavel", G),
    el(ACOES, "table", "Coluna Prazo", "planejamento.acoes.col-prazo", G),
    el(ACOES, "table", "Coluna Status", "planejamento.acoes.status-badge", G),
    el(ACOES, "table", "Coluna Escalão", "planejamento.acoes.nivel-badge", G),
    el(ACOES, "table", "Coluna Tempo restante / vencido há", "planejamento.acoes.col-tempo-restante", G),
    el(ACOES, "table", "Coluna Origem", "planejamento.acoes.col-origem", G),
    el(ACOES, "field", "Título da ação", "planejamento.acoes.nova-titulo", N),
    el(ACOES, "field", "Área responsável", "planejamento.acoes.nova-area", N),
    el(ACOES, "field", "Nível de risco", "planejamento.acoes.nova-risco", N),
    el(ACOES, "field", "Prazo contratual (opcional)", "planejamento.acoes.nova-prazo-contratual", N),
    el(ACOES, "field", "Descrição", "planejamento.acoes.nova-descricao", N),
    el(ACOES, "button", "Criar ação", "planejamento.acoes.criar-acao", N),
    exempt(ACOES, "message", "Mensagens Nenhuma ação aberta / Nenhuma ação concluída", "Estados vazios autoexplicativos, sem regra a documentar.", A),
    exempt(ACOES, "message", "Mensagens de erro e sucesso dos botões (Assumindo…, Registrando…, N ação(ões) escalada(s))", "Retorno imediato das ações já documentadas nos respectivos botões.", A),

    // ------------------------------------------------------------------ /[projectId]/acoes/configuracao
    el(CONFIG, "page", "Matriz de SLA e Escalonamento", "planejamento.acoes-config.pagina"),
    el(CONFIG, "setting", "Timezone e horário útil", "sla-config-timezone"),
    el(CONFIG, "setting", "Fuso e expediente do projeto", "planejamento.acoes-config.fuso-expediente"),
    gap(CONFIG, "field", "Campos Timezone do projeto, Início e Fim do expediente e Salvar", "O formulário (components/sla/sla-project-settings-form.tsx) é compartilhado com /[projectId]/usuarios e não pode ser editado por este módulo; o conteúdo está em planejamento.acoes-config.fuso-expediente. Providência: inserir ícone por campo no componente compartilhado."),
    el(CONFIG, "setting", "Prazos por nível de risco", "sla-config-matriz-prazos"),
    el(CONFIG, "setting", "Como os prazos e o escalonamento funcionam", "planejamento.acoes-config.regras-prazo"),
    el(CONFIG, "table", "Coluna Risco", "planejamento.acoes-config.col-risco"),
    el(CONFIG, "table", "Coluna Unidade", "planejamento.acoes-config.col-unidade"),
    el(CONFIG, "table", "Coluna Nível 1: assumir", "planejamento.acoes-config.col-assumir"),
    el(CONFIG, "table", "Coluna Responder", "planejamento.acoes-config.col-responder"),
    el(CONFIG, "table", "Coluna Concluir", "planejamento.acoes-config.col-concluir"),
    el(CONFIG, "table", "Coluna Nível 2", "planejamento.acoes-config.col-nivel2"),
    el(CONFIG, "table", "Coluna Nível 3", "planejamento.acoes-config.col-nivel3"),
    el(CONFIG, "table", "Coluna Opções (E-mail, Confirmação, Justificativa)", "planejamento.acoes-config.col-opcoes"),
    el(CONFIG, "table", "Coluna Ações (Salvar, Cancelar)", "planejamento.acoes-config.col-acoes"),
    exempt(CONFIG, "field", "Campos numéricos e seletor de unidade de cada linha da Matriz", "Cada controle é descrito pelo cabeçalho da sua coluna (planejamento.acoes-config.col-*); o componente da linha é compartilhado com /[projectId]/usuarios."),
    el(CONFIG, "setting", "Responsáveis por área e nível", "sla-config-responsaveis"),
    el(CONFIG, "setting", "Cadeia de responsáveis por área", "planejamento.acoes-config.cadeia-responsaveis"),
    gap(CONFIG, "field", "Seletores Nível 1, Corresponsável, Nível 2, Nível 3 e Salvar de cada área", "Componente sla-area-responsibles-form compartilhado com /[projectId]/usuarios; conteúdo em planejamento.acoes-config.cadeia-responsaveis. Providência: ícone por seletor no componente compartilhado."),
    el(CONFIG, "setting", "Alertas de risco por e-mail (piloto)", "planejamento.acoes-config.piloto-painel"),
    el(CONFIG, "status", "Habilitados / Desabilitados", "planejamento.acoes-config.piloto-status"),
    el(CONFIG, "message", "Agenda dos alertas do piloto", "planejamento.acoes-config.piloto-agenda"),
    el(CONFIG, "kpi", "Casos em aberto (piloto)", "planejamento.acoes-config.piloto-casos-abertos"),
    el(CONFIG, "table", "Níveis pela Matriz de responsabilidades e prazos", "planejamento.acoes-config.piloto-niveis"),
    el(CONFIG, "setting", "Destinatários do piloto (allowlist)", "planejamento.acoes-config.piloto-allowlist"),
    el(CONFIG, "table", "Últimos alertas (outbox)", "planejamento.acoes-config.piloto-outbox"),
    gap(CONFIG, "kpi", "Linhas Próximo e Último consolidado, Suprimidos até agora e Timezone do projeto do painel do piloto", "Valores derivados (agenda calculada, último resumo do outbox, contagem de suprimidos) descritos em texto nas entradas piloto-agenda, piloto-allowlist e piloto-outbox; sem ícone individual. Providência: ícone por linha, se a diretoria quiser rastro por indicador."),

    // ------------------------------------------------------------------ /[projectId]/acoes/resumo-semanal/[digestId]
    el(RESUMO, "page", "Resumo semanal — riscos médios e baixos", "planejamento.resumo-semanal.pagina"),
    el(RESUMO, "field", "Tratamento obrigatório", "planejamento.resumo-semanal.tratamento"),
    el(RESUMO, "button", "Enviar todas as respostas", "planejamento.resumo-semanal.enviar"),
    exempt(RESUMO, "field", "Direcionar para, nota (O que foi feito / Motivo / Providências) e Evidência", "Campos condicionais do tratamento escolhido; regras e mínimos de caracteres descritos em planejamento.resumo-semanal.tratamento."),
    exempt(RESUMO, "status", "Selo de criticidade de cada alerta do resumo", "Mesmo selo descrito em planejamento.acoes.risco-badge (critérios de risco e SLAs aprovados)."),

    // ------------------------------------------------------------------ /[projectId]/action-requests
    el(SOLICITACOES, "page", "Solicitações", "planejamento.solicitacoes.pagina"),
    gap(SOLICITACOES, "status", "Selo de status na lista", "O selo fica dentro de um link (a) que envolve a linha inteira; um ícone interativo ali geraria HTML inválido. A ajuda do status está no detalhe (planejamento.solicitacoes.status). Providência: reestruturar a linha da lista (componente da própria rota) para permitir ícone ao lado do link."),

    // ------------------------------------------------------------------ /[projectId]/action-requests/[actionRequestId]
    el(SOLICITACAO, "page", "Detalhe da solicitação", "planejamento.solicitacao-detalhe.pagina"),
    el(SOLICITACAO, "status", "Status da solicitação", "planejamento.solicitacoes.status"),
    el(SOLICITACAO, "button", "Enviar solicitação por e-mail", "planejamento.solicitacao-detalhe.envio-email"),
    exempt(SOLICITACAO, "field", "Destinatário, Assunto e Mensagem", "Campos do formulário de envio descritos em planejamento.solicitacao-detalhe.envio-email."),
    el(SOLICITACAO, "table", "Respostas", "planejamento.solicitacao-detalhe.respostas"),
    el(SOLICITACAO, "table", "Responsáveis", "planejamento.solicitacao-detalhe.responsaveis"),

    // ------------------------------------------------------------------ /[projectId]/alertas/[caseId]
    el(ALERTA, "page", "Alerta de risco", "planejamento.alerta.pagina"),
    el(ALERTA, "status", "Situação (selos de risco, estado e limite de escalonamento)", "planejamento.alerta.situacao"),
    el(ALERTA, "message", "Resumo, Impacto e Recomendação do Expert", "planejamento.alerta.resumo-impacto"),
    el(ALERTA, "status", "Responsável atual e anterior", "planejamento.alerta.responsaveis"),
    el(ALERTA, "status", "Nível atual e próximo", "planejamento.alerta.nivel-atual"),
    el(ALERTA, "status", "Prazos (Matriz)", "planejamento.alerta.prazos-matriz"),
    el(ALERTA, "status", "Ação SLA", "planejamento.alerta.acao-sla"),
    el(ALERTA, "status", "Previsão de conclusão", "planejamento.alerta.previsao-conclusao"),
    el(ALERTA, "status", "Próximo escalonamento por prazo", "planejamento.alerta.proximo-escalonamento"),
    el(ALERTA, "status", "Exigências da Matriz", "planejamento.alerta.exigencias-matriz"),
    el(ALERTA, "status", "Destinatários suprimidos (piloto)", "planejamento.alerta.suprimidos"),
    el(ALERTA, "setting", "Ações do alerta (os quatro botões)", "planejamento.alerta.acoes"),
    el(ALERTA, "button", "RESOLVIDO", "planejamento.alerta.btn-resolvido"),
    el(ALERTA, "button", "EM ANDAMENTO (TOMANDO PROVIDÊNCIAS)", "planejamento.alerta.btn-em-andamento"),
    el(ALERTA, "button", "ENVIAR PARA", "planejamento.alerta.btn-enviar-para"),
    el(ALERTA, "button", "ESPECIALISTA", "planejamento.alerta.btn-especialista"),
    el(ALERTA, "button", "OUTRO", "planejamento.alerta.btn-outro"),
    el(ALERTA, "button", "CONFIRMAR RESOLUÇÃO", "planejamento.alerta.btn-confirmar-resolucao"),
    el(ALERTA, "field", "Solução adotada", "planejamento.alerta.campo-solucao"),
    el(ALERTA, "field", "Evidência (ALTO e CRÍTICO)", "planejamento.alerta.campo-evidencia"),
    el(ALERTA, "field", "Justificativa", "planejamento.alerta.campo-justificativa"),
    el(ALERTA, "field", "Confirmo a resolução", "planejamento.alerta.campo-confirmo"),
    el(ALERTA, "field", "Providências em andamento", "planejamento.alerta.campo-providencias"),
    el(ALERTA, "field", "Previsão de conclusão (campo)", "planejamento.alerta.campo-previsao"),
    el(ALERTA, "filter", "Pesquisar colaborador", "planejamento.alerta.campo-pesquisar-colaborador"),
    el(ALERTA, "field", "Novo responsável", "planejamento.alerta.campo-novo-responsavel"),
    el(ALERTA, "field", "Justificativa do encaminhamento", "planejamento.alerta.campo-justificativa-encaminhamento"),
    el(ALERTA, "field", "Descrição (OUTRO)", "planejamento.alerta.campo-descricao-outro"),
    el(ALERTA, "table", "Timeline", "planejamento.alerta.timeline"),
    el(ALERTA, "table", "Mensagens e respostas (thread do alerta)", "planejamento.alerta.mensagens"),
    el(ALERTA, "table", "Encaminhamentos, devoluções e entregas", "planejamento.alerta.encaminhamentos-entregas"),
    el(ALERTA, "field", "Especialista e Pergunta dentro de ESPECIALISTA", "planejamento.consulta-ia.especialidade"),
    el(ALERTA, "button", "Consultar (dentro de ESPECIALISTA)", "planejamento.consulta-ia.consultar"),
    exempt(ALERTA, "button", "Botões CONFIRMAR / CONFIRMAR ENVIO / CONFIRMAR RESOLUÇÃO de envio do formulário", "Envio do formulário já descrito em cada botão de ação (RESOLVIDO, EM ANDAMENTO, ENVIAR PARA, OUTRO)."),

    // ------------------------------------------------------------------ /alertas/acao/.../[eventId]
    el(ALERTA_ACAO, "page", "Responder alerta do ACC (um alerta)", "planejamento.alerta-email-acao.pagina"),
    el(ALERTA_ACAO, "message", "Aviso de repetição do alerta", "planejamento.alerta-email-acao.aviso-repeticao"),
    el(ALERTA_ACAO, "field", "Enviado para", "planejamento.alerta-email-acao.enviado-para"),
    el(ALERTA_ACAO, "button", "CONFIRMAR", "planejamento.alerta-email-acao.confirmar"),
    exempt(ALERTA_ACAO, "status", "Selo Ação (RESOLVIDO / EM ANDAMENTO / ENVIADO P/)", "Mostra apenas a ação escolhida no e-mail, descrita em planejamento.alerta-email-acao.pagina e no aviso de repetição."),

    // ------------------------------------------------------------------ /alertas/consulta-ia/...
    el(CONSULTA_IA, "page", "Consultar IA sobre o alerta", "planejamento.consulta-ia.pagina"),
    el(CONSULTA_IA, "field", "Especialista", "planejamento.consulta-ia.especialidade"),
    el(CONSULTA_IA, "field", "Pergunta", "planejamento.consulta-ia.pergunta"),
    el(CONSULTA_IA, "button", "Consultar", "planejamento.consulta-ia.consultar"),
    el(CONSULTA_IA, "table", "Fontes utilizadas", "planejamento.consulta-ia.fontes"),
    gap(CONSULTA_IA, "expert", "Parecer do Expert e consolidação do CEO IA exibidos como resposta", "A resposta usa ExpertResponseDetails (components/ai/expert-query-panel), compartilhado com outros módulos; não pode ser editado aqui. Providência: o agente de Experts IA deve documentar os campos do parecer."),

    // ------------------------------------------------------------------ /alertas/lote/...
    el(ALERTA_LOTE, "page", "Responder alertas do ACC (lote)", "planejamento.alerta-lote.pagina"),
    el(ALERTA_LOTE, "field", "Ação do alerta", "planejamento.alerta-lote.acao"),
    el(ALERTA_LOTE, "field", "Enviado para", "planejamento.alerta-email-acao.enviado-para"),
    el(ALERTA_LOTE, "button", "Salvar esta ação", "planejamento.alerta-lote.salvar-acao"),
    el(ALERTA_LOTE, "button", "CONFIRMAR TUDO", "planejamento.alerta-lote.responder"),
    el(ALERTA_LOTE, "message", "Aviso de repetição do alerta", "planejamento.alerta-email-acao.aviso-repeticao"),

    // ------------------------------------------------------------------ /alertas/providencia/...
    el(ALERTA_PROVIDENCIA, "page", "Responder alerta de providência", "planejamento.alerta-providencia.pagina"),
    el(ALERTA_PROVIDENCIA, "message", "Aviso de repetição do alerta", "planejamento.alerta-email-acao.aviso-repeticao"),
    el(ALERTA_PROVIDENCIA, "field", "Enviado para", "planejamento.alerta-email-acao.enviado-para"),
    el(ALERTA_PROVIDENCIA, "field", "Evidência / documento / protocolo e Justificativa", "planejamento.alerta-providencia.evidencia"),
    el(ALERTA_PROVIDENCIA, "button", "CONFIRMAR", "planejamento.alerta-email-acao.confirmar"),

    // ------------------------------------------------------------------ /[projectId]/reemissao-alertas
    el(REEMISSAO, "page", "Reemissão de alertas à Diretoria", "reemissao-alertas"),
    el(REEMISSAO, "message", "Como funciona", "planejamento.reemissao.como-funciona"),
    el(REEMISSAO, "kpi", "Casos Crítico/Alto abertos e elegíveis", "planejamento.reemissao.contagem"),
    el(REEMISSAO, "table", "Coluna Aprovar", "planejamento.reemissao.col-aprovar"),
    el(REEMISSAO, "table", "Coluna Código", "planejamento.reemissao.col-codigo"),
    el(REEMISSAO, "table", "Colunas Área e Risco", "planejamento.reemissao.col-area-risco"),
    el(REEMISSAO, "table", "Coluna Idade", "planejamento.reemissao.col-idade"),
    el(REEMISSAO, "table", "Coluna Lacuna (quem não foi informado)", "planejamento.reemissao.col-lacuna"),
    el(REEMISSAO, "table", "Coluna Bloqueio manual", "planejamento.reemissao.col-bloqueio"),
    el(REEMISSAO, "table", "Coluna Situação", "planejamento.reemissao.col-situacao"),
    el(REEMISSAO, "field", "Justificativa da decisão", "planejamento.reemissao.justificativa"),
    el(REEMISSAO, "field", "Confirmação da decisão", "planejamento.reemissao.confirmacao"),
    el(REEMISSAO, "admin-action", "Aprovar reemissão", "planejamento.reemissao.aprovar"),
    exempt(REEMISSAO, "message", "Resultado da aprovação (decisões registradas / casos ignorados)", "Retorno imediato da ação Aprovar reemissão, descrito em planejamento.reemissao.aprovar."),

    // ------------------------------------------------------------------ /[projectId]/providencias
    el(PROVIDENCIAS, "page", "Providências e pendências para entrega", "planejamento.providencias.pagina"),
    el(PROVIDENCIAS, "admin-action", "Cadastrar checklist inicial", "planejamento.providencias.checklist-inicial"),
    el(PROVIDENCIAS, "admin-action", "Nova providência da obra", "planejamento.providencias.nova-providencia"),
    exempt(PROVIDENCIAS, "field", "Fase e botão Adicionar da nova providência", "Descritos em planejamento.providencias.nova-providencia."),
    el(PROVIDENCIAS, "message", "Término previsto e janela de alertas", "planejamento.providencias.aviso-data-final"),
    el(PROVIDENCIAS, "table", "Coluna Providência", "planejamento.providencias.col-providencia"),
    el(PROVIDENCIAS, "table", "Coluna Fase", "planejamento.providencias.col-fase"),
    el(PROVIDENCIAS, "table", "Coluna Data limite", "planejamento.providencias.col-data-limite"),
    el(PROVIDENCIAS, "table", "Coluna Responsável", "planejamento.providencias.col-responsavel"),
    el(PROVIDENCIAS, "table", "Coluna Situação", "planejamento.providencias.col-situacao"),
    el(PROVIDENCIAS, "table", "Coluna Grau de risco", "planejamento.providencias.col-risco"),
    el(PROVIDENCIAS, "table", "Coluna Evidência / protocolo", "planejamento.providencias.col-evidencia"),
    el(PROVIDENCIAS, "table", "Coluna Acompanhamento", "planejamento.providencias.col-acompanhamento"),
    el(PROVIDENCIAS, "table", "Coluna Ações (editor da linha)", "planejamento.providencias.col-acoes"),
    gap(PROVIDENCIAS, "field", "Campos do editor da linha (data limite, prazo interno, responsável, dependência, CNO, evidência, bloqueia a entrega, aplicabilidade, status e justificativa)", "O editor (components/delivery/delivery-item-editor.tsx) está descrito em conjunto em planejamento.providencias.col-acoes, sem ícone por campo. Providência: inserir um ícone por campo nesse componente (exclusivo desta rota) em uma próxima rodada."),
    gap(PROVIDENCIAS, "button", "Classificação de risco (RiskReviewPanel) e histórico de revisões", "Painel compartilhado (components/risk/risk-review-panel) com outros módulos; deve ser documentado pelo agente responsável por esse componente."),

    // ------------------------------------------------------------------ /email-actions/[token]
    el(EMAIL_ACTION, "page", "Ação de e-mail", "planejamento.email-action.pagina"),
    el(EMAIL_ACTION, "message", "Ação solicitada", "planejamento.email-action.acao"),
    el(EMAIL_ACTION, "field", "Resposta (RESPONDER AO ACC) e Comentário (DEFINIR PRAZO)", "planejamento.email-action.resposta"),
    el(EMAIL_ACTION, "field", "Novo prazo", "planejamento.email-action.novo-prazo"),
    el(EMAIL_ACTION, "button", "Confirmar", "planejamento.email-action.confirmar"),

    // ------------------------------------------------------------------ /[projectId]/ledger
    el(LEDGER, "page", "Eventos (Event Ledger)", "planejamento.ledger.pagina"),
    el(LEDGER, "table", "Coluna Data", "planejamento.ledger.col-data"),
    el(LEDGER, "table", "Coluna Evento", "planejamento.ledger.col-evento"),
    el(LEDGER, "table", "Coluna Fonte", "planejamento.ledger.col-fonte"),
    el(LEDGER, "table", "Coluna Categorias", "planejamento.ledger.col-categorias"),
    el(LEDGER, "table", "Coluna Status", "planejamento.ledger.col-status"),
    el(LEDGER, "table", "Coluna Achado IA", "planejamento.ledger.col-achado-ia"),

    // ------------------------------------------------------------------ /[projectId]/ledger/[eventId]
    el(LEDGER_EVENTO, "page", "Detalhe do evento", "planejamento.ledger-evento.pagina"),
    el(LEDGER_EVENTO, "message", "Achado da IA", "planejamento.ledger-evento.achado-ia"),
    el(LEDGER_EVENTO, "button", "Avaliar risco de atraso de cronograma", "planejamento.ledger-evento.avaliar-atraso"),
    el(LEDGER_EVENTO, "admin-action", "Enviar Alerta (e-mail de alerta de contrato)", "planejamento.ledger-evento.enviar-alerta"),
    el(LEDGER_EVENTO, "table", "Evidência original", "planejamento.ledger-evento.evidencia"),
    el(LEDGER_EVENTO, "table", "Confronto com outras fontes", "planejamento.ledger-evento.confronto-fontes"),
    el(LEDGER_EVENTO, "table", "Anotações do Evento", "planejamento.ledger-evento.anotacoes"),
    el(LEDGER_EVENTO, "table", "Ações via e-mail", "planejamento.acoes.acoes-via-email"),
    el(LEDGER_EVENTO, "table", "Confrontação contratual — Revisão humana", "planejamento.ledger-evento.confrontacao"),
    exempt(LEDGER_EVENTO, "field", "Justificativa da aprovação/rejeição e botões Aprovar relação / Rejeitar", "Formulários descritos em planejamento.ledger-evento.confrontacao (critérios, justificativa e permissão ADMINISTRADOR)."),
    el(LEDGER_EVENTO, "admin-action", "Executar análise multiagente", "planejamento.ledger-evento.curadoria"),
    gap(LEDGER_EVENTO, "field", "Formulário de nova anotação (EventNoteForm)", "Componente components/ledger/event-note-form.tsx não inventariado em campos; a seção está descrita em planejamento.ledger-evento.anotacoes. Providência: ícone por campo (categoria e texto) no componente exclusivo desta rota."),
    gap(LEDGER_EVENTO, "message", "Revisão de classificação de risco do evento e aviso pré-envio (EventRiskReviewSection, EventRiskPreSendNotice)", "Componentes de components/risk compartilhados com outros módulos; devem ser documentados pelo agente responsável."),
    gap(LEDGER_EVENTO, "expert", "Painel de consulta a Expert (ExpertQueryPanel, escopo evento)", "Painel compartilhado com os módulos de Experts IA; documentação a cargo do agente de Experts IA."),

    // ------------------------------------------------------------------ /[projectId]/ledger/lote-alertas/[batchId]
    el(LEDGER_LOTE, "page", "Responder alertas de contrato (lote)", "planejamento.ledger-lote.pagina"),
    el(LEDGER_LOTE, "field", "Ação obrigatória do alerta", "planejamento.alerta-lote.acao"),
    el(LEDGER_LOTE, "field", "Enviado para", "planejamento.alerta-email-acao.enviado-para"),
    el(LEDGER_LOTE, "button", "Salvar esta ação", "planejamento.alerta-lote.salvar-acao"),
    el(LEDGER_LOTE, "button", "RESPONDER AO ACC", "planejamento.alerta-lote.responder"),
    el(LEDGER_LOTE, "message", "Aviso de repetição do alerta", "planejamento.alerta-email-acao.aviso-repeticao"),

    // ------------------------------------------------------------------ /[projectId]/timeline
    el(TIMELINE, "page", "Timeline", "planejamento.timeline.pagina"),
    el(TIMELINE, "filter", "Buscar palavra / assunto", "planejamento.timeline.busca"),
    el(TIMELINE, "filter", "Fontes", "planejamento.timeline.filtro-fontes"),
    el(TIMELINE, "filter", "Categorias/Impactos", "planejamento.timeline.filtro-categorias"),
    el(TIMELINE, "filter", "Período (Todo período da obra, De, Até)", "planejamento.timeline.filtro-periodo"),
    el(TIMELINE, "filter", "Participantes (e-mail)", "planejamento.timeline.filtro-participantes"),
    el(TIMELINE, "table", "Lista da timeline e seleção para exportação", "planejamento.timeline.lista"),
    el(TIMELINE, "button", "Exportar Timeline Filtrado", "planejamento.timeline.exportar"),
    exempt(TIMELINE, "field", "Formatos (Dossiê PDF, Índice XLSX/CSV, Arquivos originais, Tudo em ZIP) e Confirmar exportação", "Painel de exportação descrito em planejamento.timeline.exportar."),
    gap(TIMELINE, "table", "Resultados da busca no acervo (TimelineArchiveResults)", "Lista de resultados da busca (e-mails, anexos, documentos, Diário de Obra, Construmanager etc.) sem ícone próprio; comportamento da busca está em planejamento.timeline.busca. Providência: documentar os tipos de resultado e o trecho exibido."),
  ],
};
