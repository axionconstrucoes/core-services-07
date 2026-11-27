// Manifesto (inventário AUTORITATIVO) do módulo "admin": rotas e elementos funcionais com o helpId que os documenta.
// Arquivo EXCLUSIVO do módulo. Regras: ver lib/ui/help/types.ts (HelpManifest) e scripts/test-help-catalog.mjs.
//
// Rotas: /, /login, /vera, /projetos, /projetos/novo, /projetos/[projectId]/editar, /projetos/[projectId]/copiar-estrutura e as telas
// administrativas do projeto (usuarios, auditoria, autorizacoes, ajuda). Inventário feito a partir dos page.tsx e dos componentes
// exclusivos (components/users, components/projects, components/auth, app/login). Componentes compartilhados (AXIA, sidebar) são
// documentados pelo módulo shared.
import type { HelpManifest, HelpManifestElement } from "../types";

const ROOT = "/";
const LOGIN = "/login";
const VERA = "/vera";
const PROJ = "/projetos";
const NOVO = "/projetos/novo";
const EDIT = "/projetos/[projectId]/editar";
const COPY = "/projetos/[projectId]/copiar-estrutura";
const USERS = "/[projectId]/usuarios";
const AUDIT = "/[projectId]/auditoria";
const AUTH = "/[projectId]/autorizacoes";
const HELP = "/[projectId]/ajuda";

const el = (
  route: string,
  kind: HelpManifestElement["kind"],
  label: string,
  helpId: string
): HelpManifestElement => ({ route, kind, label, helpId });

const exempt = (route: string, kind: HelpManifestElement["kind"], label: string, why: string): HelpManifestElement => ({
  route,
  kind,
  label,
  exempt: why,
});

export const ADMIN_MANIFEST: HelpManifest = {
  module: "admin",
  routes: [ROOT, LOGIN, VERA, PROJ, NOVO, EDIT, COPY, USERS, AUDIT, AUTH, HELP],
  elements: [
    // ---- / ----
    exempt(ROOT, "page", "Página inicial (/)", "A rota apenas redireciona (redirect) para /projetos e não renderiza interface própria; a tela de destino está documentada em admin.projetos.pagina."),

    // ---- /login ----
    el(LOGIN, "page", "AXION Controle de Contratos (cartão de login)", "admin.login.pagina"),
    el(LOGIN, "button", "Entrar com Google", "admin.login.entrar-google"),
    el(LOGIN, "message", "Mensagem de erro de login", "admin.login.erro-acesso"),

    // ---- /vera ----
    el(VERA, "page", "AXIA — Assistente ACC (entrada)", "admin.vera.pagina"),
    el(VERA, "button", "Lista de obras (Escolha a obra para conversar com a AXIA)", "admin.vera.escolher-obra"),

    // ---- /projetos ----
    el(PROJ, "page", "Selecione um projeto", "admin.projetos.pagina"),
    el(PROJ, "button", "Cartão do projeto", "admin.projetos.card-projeto"),
    el(PROJ, "status", "Selo de status do projeto (no cartão)", "admin.projetos.card-projeto"),
    el(PROJ, "admin-action", "NOVO PROJETO", "admin.projetos.novo-projeto"),
    el(PROJ, "admin-action", "Copiar estrutura", "admin.projetos.copiar-estrutura"),
    el(PROJ, "admin-action", "Editar projeto", "admin.projetos.editar-projeto"),
    el(PROJ, "button", "Jurídico IA (cartão)", "admin.projetos.card-juridico"),
    el(PROJ, "button", "Sair", "admin.projetos.sair"),
    exempt(PROJ, "button", "AXIA (botão Fale com a AXIA / widget do assistente)", "Componente compartilhado do assistente de dúvidas de uso (VeraTrigger/AssistantWidget), documentado pelo módulo shared; a página /vera e o perfil AXIA × especialistas explicam a diferença."),
    exempt(PROJ, "message", "Nenhum projeto disponível para sua conta", "Mensagem de estado vazio autoexplicativa; o motivo (sem vínculo ativo) está descrito em admin.projetos.pagina."),

    // ---- /projetos/novo ----
    el(NOVO, "page", "Novo projeto", "admin.novo.pagina"),
    el(NOVO, "field", "Nome do projeto no ACC", "admin.novo.nome"),
    el(NOVO, "field", "No. sistema UNO (nosso ERP)", "admin.novo.codigo-uno"),
    el(NOVO, "field", "Cliente", "admin.novo.cliente"),
    el(NOVO, "field", "Localização", "admin.novo.localizacao"),
    el(NOVO, "field", "Data de início da obra", "admin.novo.data-inicio"),
    el(NOVO, "field", "Data de término da baseline", "admin.novo.data-termino"),
    el(NOVO, "field", "Copiar equipe e perfis de acesso de outro projeto logo após criar", "admin.novo.copiar-equipe"),
    el(NOVO, "button", "Criar projeto", "admin.novo.criar"),
    exempt(NOVO, "button", "Voltar", "Link de navegação para /projetos, sem ação, dado ou consequência a explicar."),

    // ---- /projetos/[projectId]/editar ----
    el(EDIT, "page", "Editar projeto", "admin.editar.pagina"),
    el(EDIT, "field", "Nome do projeto no ACC", "admin.novo.nome"),
    el(EDIT, "field", "No. sistema UNO (nosso ERP)", "admin.novo.codigo-uno"),
    el(EDIT, "field", "Número do contrato (opcional)", "admin.editar.contrato"),
    el(EDIT, "field", "Cliente", "admin.novo.cliente"),
    el(EDIT, "field", "Localização", "admin.novo.localizacao"),
    el(EDIT, "field", "Data de início da obra", "admin.novo.data-inicio"),
    el(EDIT, "field", "Data de término da baseline", "admin.novo.data-termino"),
    el(EDIT, "button", "Salvar alterações", "admin.editar.salvar"),
    el(EDIT, "admin-action", "Copiar estrutura de outro projeto (equipe e perfis de acesso)", "admin.editar.link-copiar"),
    exempt(EDIT, "button", "Cancelar", "Link de navegação que descarta a edição e volta à tela de origem, sem dado ou consequência a explicar."),

    // ---- /projetos/[projectId]/copiar-estrutura ----
    el(COPY, "page", "Copiar estrutura de outro projeto", "admin.copiar.pagina"),
    el(COPY, "tab", "1. Origem", "admin.copiar.etapa-origem"),
    el(COPY, "tab", "2. Pessoas", "admin.copiar.etapa-pessoas"),
    el(COPY, "tab", "3. Perfis", "admin.copiar.etapa-perfis"),
    el(COPY, "tab", "4. Prévia", "admin.copiar.etapa-previa"),
    el(COPY, "tab", "5. Executar", "admin.copiar.etapa-executar"),
    el(COPY, "filter", "Projeto de origem (somente projetos em que você é Administrador)", "admin.copiar.projeto-origem"),
    el(COPY, "button", "Carregar equipe da origem", "admin.copiar.carregar-equipe"),
    el(COPY, "button", "Selecionar sugeridos / Limpar seleção", "admin.copiar.etapa-pessoas"),
    el(COPY, "table", "Pessoas da origem (Pessoa, Perfil na origem, Área, Situação no destino)", "admin.copiar.tabela-pessoas"),
    el(COPY, "field", "Incluir mesmo assim (contas compartilhadas, CRM e teste)", "admin.copiar.etapa-pessoas"),
    el(COPY, "field", "Perfil no destino", "admin.copiar.perfil-destino"),
    el(COPY, "field", "Confirmo conceder Administrador a esta pessoa", "admin.copiar.perfil-destino"),
    el(COPY, "field", "Área no destino", "admin.copiar.area-destino"),
    el(COPY, "message", "Grupos da prévia (Novos vínculos, Já vinculadas, Conflitos, Bloqueadas)", "admin.copiar.etapa-previa"),
    el(COPY, "message", "Aviso: o destino tem coleta de e-mail habilitada", "admin.copiar.aviso-email"),
    el(COPY, "field", "Revisei a prévia e confirmo a criação destes vínculos", "admin.copiar.etapa-executar"),
    el(COPY, "admin-action", "Copiar N pessoa(s)", "admin.copiar.executar"),
    el(COPY, "message", "Resultado da cópia", "admin.copiar.resultado"),
    exempt(COPY, "button", "Voltar / Revisar perfis / Gerar prévia / Continuar para confirmação / Voltar à prévia", "Botões de navegação entre as etapas do assistente; o efeito de cada etapa está documentado nos títulos admin.copiar.etapa-*."),
    exempt(COPY, "button", "Ver Usuários do destino / Concluir / Sair sem copiar", "Links de navegação ao final ou durante o assistente, sem dado ou consequência a explicar."),
    exempt(COPY, "status", "Indicador de etapas (1. Origem … 5. Executar)", "Indicador de progresso do assistente; cada etapa tem sua própria ajuda no título da seção."),

    // ---- /[projectId]/usuarios ----
    el(USERS, "page", "Usuários & Permissões", "admin.usuarios.pagina"),
    el(USERS, "filter", "Projeto exibido nos faróis de fontes", "admin.usuarios.seletor-projeto"),
    el(USERS, "admin-action", "+ Adicionar usuário", "admin.usuarios.adicionar-usuario"),
    el(USERS, "field", "Buscar por e-mail @axion.com.br", "admin.usuarios.busca-email"),
    el(USERS, "field", "Permissão (novo usuário)", "admin.usuarios.permissao-novo"),
    el(USERS, "field", "Área (novo usuário)", "admin.usuarios.area-novo"),
    el(USERS, "admin-action", "Pré-cadastrar usuário", "admin.usuarios.pre-cadastro"),
    el(USERS, "field", "Nome (pré-cadastro)", "admin.usuarios.pre-cadastro-nome"),
    exempt(USERS, "field", "Cargo (opcional) do pré-cadastro", "Campo informativo que não concede acesso, explicado em admin.usuarios.pre-cadastro-nome."),
    el(USERS, "admin-action", "Confirmar (adicionar usuário ao projeto)", "admin.usuarios.confirmar-adicao"),
    el(USERS, "admin-action", "Participantes do projeto (lista, caixas, Salvar alterações, Confirmar e salvar, Descartar)", "admin.usuarios.participantes"),
    el(USERS, "filter", "Buscar por nome, e-mail ou área / Filtrar por situação", "admin.usuarios.participantes-filtros"),
    el(USERS, "message", "Resumo das alterações", "admin.usuarios.participantes-resumo"),
    el(USERS, "table", "Usuário", "admin.usuarios.col-usuario"),
    el(USERS, "table", "Origem", "admin.usuarios.col-origem"),
    el(USERS, "table", "Cargo", "admin.usuarios.col-cargo"),
    el(USERS, "table", "Área", "admin.usuarios.col-area"),
    el(USERS, "table", "Permissão (Administrador, Gerente, Colaborador, Leitura)", "admin.usuarios.col-permissao"),
    el(USERS, "status", "Status (Ativo, Inativo e convites)", "admin.usuarios.col-status"),
    el(USERS, "status", "Fontes que alimentam o ACC neste projeto (faróis Aceite, Conexão, Coleta, Material)", "admin.usuarios.col-fontes"),
    el(USERS, "setting", "WhatsApp (alerta crítico na Diretoria): telefone e canal autorizado", "admin.usuarios.col-whatsapp"),
    el(USERS, "table", "Ações", "admin.usuarios.col-acoes"),
    el(USERS, "admin-action", "Editar cargo", "admin.usuarios.col-acoes"),
    el(USERS, "admin-action", "Alterar perfil (seletor + Salvar)", "admin.usuarios.col-acoes"),
    el(USERS, "admin-action", "Desativar / Reativar", "admin.usuarios.col-acoes"),
    el(USERS, "status", "Convite pendente (Aguardando primeiro login)", "admin.usuarios.col-status"),
    el(USERS, "setting", "Matriz de responsabilidades e prazos", "admin.usuarios.matriz-secao"),
    el(USERS, "setting", "Responsáveis por área", "sla-config-responsaveis"),
    el(USERS, "setting", "Prazos por grau de risco", "sla-config-matriz-prazos"),
    el(USERS, "setting", "Fuso horário e horário útil", "sla-config-timezone"),
    el(USERS, "field", "Início do expediente", "planejamento.acoes-config.campo-inicio-expediente"),
    el(USERS, "field", "Timezone do projeto", "planejamento.acoes-config.campo-timezone"),
    el(USERS, "field", "Fim do expediente", "planejamento.acoes-config.campo-fim-expediente"),
    el(USERS, "button", "Salvar fuso e expediente", "planejamento.acoes-config.salvar-fuso-expediente"),
    el(USERS, "field", "Nível 1 · Responsável (por área)", "planejamento.acoes-config.campo-nivel1-responsavel"),
    el(USERS, "field", "Nível 1 · Corresponsável (Engenharia e Planejamento)", "planejamento.acoes-config.campo-nivel1-corresponsavel"),
    el(USERS, "field", "Nível 2 · Gerência", "planejamento.acoes-config.campo-nivel2-gerencia"),
    el(USERS, "field", "Nível 3 · Diretoria", "planejamento.acoes-config.campo-nivel3-diretoria"),
    el(USERS, "button", "Salvar (responsáveis da área)", "planejamento.acoes-config.salvar-area"),
    el(USERS, "table", "Cabeçalho Risco", "planejamento.acoes-config.col-risco"),
    el(USERS, "table", "Cabeçalho Unidade", "planejamento.acoes-config.col-unidade"),
    el(USERS, "table", "Cabeçalho Nível 1: assumir", "planejamento.acoes-config.col-assumir"),
    el(USERS, "table", "Cabeçalho Responder", "planejamento.acoes-config.col-responder"),
    el(USERS, "table", "Cabeçalho Concluir", "planejamento.acoes-config.col-concluir"),
    el(USERS, "table", "Cabeçalho Nível 2", "planejamento.acoes-config.col-nivel2"),
    el(USERS, "table", "Cabeçalho Nível 3", "planejamento.acoes-config.col-nivel3"),
    el(USERS, "table", "Cabeçalho Opções", "planejamento.acoes-config.col-opcoes"),
    el(USERS, "table", "Cabeçalho Ações (Salvar, Cancelar)", "planejamento.acoes-config.col-acoes"),
    el(USERS, "setting", "Opção E-mail da regra de risco", "planejamento.acoes-config.opcao-email"),
    el(USERS, "setting", "Opção Confirmação da regra de risco", "planejamento.acoes-config.opcao-confirmacao"),
    el(USERS, "setting", "Opção Justificativa da regra de risco", "planejamento.acoes-config.opcao-justificativa"),
    exempt(USERS, "field", "Campos numéricos e seletor de unidade de cada linha da Matriz", "Cada controle é descrito pelo cabeçalho da sua coluna (planejamento.acoes-config.col-*), agora com ícone no cabeçalho desta tabela."),

    // ---- /[projectId]/auditoria ----
    el(AUDIT, "page", "Auditoria", "admin.auditoria.pagina"),
    el(AUDIT, "filter", "FILTRAR REGISTROS DE AUDITORIA (Todos, Projetos e versões, Atas, Relatórios e RDO, Medições, E-mails, Ações e SLA, SSMA/ESG, Integrações e falhas, Segurança e permissões; data, responsável, palavra-chave)", "admin.auditoria.filtros"),
    el(AUDIT, "message", "Supervisão do ACC (falhas e indisponibilidades)", "admin.auditoria.supervisao"),
    el(AUDIT, "table", "Data/Hora — Brasília", "admin.auditoria.col-data-hora"),
    el(AUDIT, "table", "Ator", "admin.auditoria.col-ator"),
    el(AUDIT, "table", "Ação", "admin.auditoria.col-acao"),
    el(AUDIT, "table", "Entidade", "admin.auditoria.col-entidade"),
    el(AUDIT, "table", "Detalhe", "admin.auditoria.col-detalhe"),

    // ---- /[projectId]/autorizacoes ----
    el(AUTH, "page", "Autorizações de acesso aos e-mails", "autorizacoes-email"),
    el(AUTH, "admin-action", "Solicitar autorização", "admin.autorizacoes.solicitar"),
    el(AUTH, "field", "Colaborador", "admin.autorizacoes.colaborador"),
    el(AUTH, "field", "Conta (em branco = e-mail do colaborador)", "admin.autorizacoes.conta"),
    el(AUTH, "button", "Solicitar e enviar e-mail", "admin.autorizacoes.botao-solicitar"),
    el(AUTH, "table", "Colaborador", "admin.autorizacoes.col-colaborador"),
    el(AUTH, "table", "Conta", "admin.autorizacoes.col-conta"),
    el(AUTH, "status", "Decisão", "admin.autorizacoes.col-decisao"),
    el(AUTH, "table", "Data", "admin.autorizacoes.col-data"),
    el(AUTH, "status", "Conexão da conta", "admin.autorizacoes.col-conexao"),
    el(AUTH, "table", "Ações", "admin.autorizacoes.col-acoes"),
    el(AUTH, "button", "Ver texto e histórico", "admin.autorizacoes.col-acoes"),
    el(AUTH, "admin-action", "Revogar / Cancelar solicitação", "admin.autorizacoes.revogar"),
    el(AUTH, "message", "Faixa de resultado (solicitada, revogada, erros)", "admin.autorizacoes.mensagem-resultado"),

    // ---- /[projectId]/ajuda ----
    el(HELP, "page", "Ajuda e tutorial", "admin.ajuda.pagina"),
    el(HELP, "button", "Abrir o PDF", "admin.ajuda.pdf"),
    el(HELP, "button", "Baixar o PowerPoint", "admin.ajuda.pptx"),
  ],
};
