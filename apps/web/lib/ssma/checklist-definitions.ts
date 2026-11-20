export type SsmaChecklistState = "FEITO" | "NA";

export type SsmaFieldDefinition = {
  id: string;
  label: string;
  placeholder?: string;
  type: "text" | "number" | "date" | "datetime-local" | "textarea" | "select";
  options?: readonly string[];
  required?: boolean;
  /** Ajuda contextual (Hover Text) do campo: id do catálogo lib/ui/help/modules/ssma.ts. */
  helpId?: string;
};

export type SsmaNearMissVariant = {
  submitAs: { slug: string; number: number; title: string; driveFolder: string };
  fields: readonly SsmaFieldDefinition[];
  checks: readonly string[];
  photoActions: readonly string[];
  /** Valores fixos gravados junto (classificação estruturada + tipo + origem). */
  fixedValues: Readonly<Record<string, string>>;
};

export const OCCURRENCE_TYPES = ["Acidente", "Near Miss (quase-acidente)"] as const;

export type SsmaChecklistDefinition = {
  number: number;
  slug: string;
  title: string;
  shortTitle: string;
  driveFolder: string;
  independent?: boolean;
  /** Nome exibido ao usuário. `title`/`shortTitle`/`checks` continuam sendo os valores GRAVADOS e validados pelo banco. */
  displayTitle?: string;
  displayShortTitle?: string;
  /** Variante do formulário com o mesmo cartão: Near Miss é gravado com a identidade (já validada pelo banco) de "Riscos apontados". */
  nearMissVariant?: SsmaNearMissVariant;
  /** Rótulo exibido de cada item do checklist (chave = valor gravado). */
  checkLabels?: Readonly<Record<string, string>>;
  requiredPhotoActions?: readonly string[];
  fields: readonly SsmaFieldDefinition[];
  checks: readonly string[];
  photoActions: readonly string[];
};

export const SSMA_CHECKLISTS: readonly SsmaChecklistDefinition[] = [
  {
    number: 1,
    slug: "dda",
    title: "DDA",
    shortTitle: "DDA — Fotos",
    // Padronização: este é o Diálogo DIÁRIO de Segurança (DDS). A sigla DDA só permanece nos valores gravados.
    displayTitle: "DDS — Diálogo Diário de Segurança",
    displayShortTitle: "DDS — Fotos",
    checkLabels: { "DDA realizado": "DDS realizado" },
    driveFolder: "01 - DIÁLOGO DIÁRIO DE SEGURANÇA - DDA (FOTOS)",
    fields: [
      { id: "tema", helpId: "ssma.form.campo-tema", label: "Tema do diálogo", type: "text", placeholder: "Informe o tema do diálogo" },
      { id: "participantes", helpId: "ssma.form.campo-participantes", label: "Quantidade de participantes", type: "number", placeholder: "0" },
      { id: "observacoes", helpId: "ssma.form.campo-observacoes", label: "Observações", type: "textarea", placeholder: "Observações opcionais" },
    ],
    checks: ["DDA realizado", "Registro dos participantes"],
    photoActions: ["Tirar foto"],
  },
  {
    number: 2,
    slug: "dds",
    title: "DDS",
    shortTitle: "DDS — Fotos",
    // Padronização: este é o Diálogo SEMANAL de Segurança (DSS). A sigla DDS só permanece nos valores gravados.
    displayTitle: "DSS — Diálogo Semanal de Segurança",
    displayShortTitle: "DSS — Fotos",
    checkLabels: { "DDS realizado": "DSS realizado" },
    driveFolder: "02 - DIÁLOGO SEMANAL DE SEGURANÇA - DDS (FOTOS)",
    fields: [
      { id: "tema", helpId: "ssma.form.campo-tema", label: "Tema do diálogo semanal", type: "text", placeholder: "Informe o tema do diálogo" },
      { id: "participantes", helpId: "ssma.form.campo-participantes", label: "Quantidade de participantes", type: "number", placeholder: "0" },
      { id: "observacoes", helpId: "ssma.form.campo-observacoes", label: "Observações", type: "textarea", placeholder: "Observações opcionais" },
    ],
    checks: ["DDS realizado", "Registro dos participantes"],
    photoActions: ["Tirar foto"],
  },
  {
    number: 3,
    slug: "fotos-diarias",
    title: "Fotos diárias de segurança",
    shortTitle: "Fotos diárias",
    driveFolder: "03 - FOTOS DIÁRIAS DE SEGURANÇA",
    fields: [
      { id: "local", helpId: "ssma.form.campo-local", label: "Local da foto", type: "text", placeholder: "Informe o local" },
      {
        id: "categoria",
        helpId: "ssma.form.campo-fotos-categoria",
        label: "Categoria",
        type: "select",
        options: ["Condição segura", "Condição de risco", "EPI", "Sinalização", "Organização"],
      },
      { id: "descricao", helpId: "ssma.form.campo-descricao", label: "Descrição", type: "textarea", placeholder: "Descreva o registro" },
    ],
    checks: ["Condição registrada"],
    photoActions: ["Tirar foto"],
  },
  {
    number: 4,
    slug: "apr",
    title: "APR — Análise preliminar de risco",
    shortTitle: "APR",
    driveFolder: "04 - ANÁLISE PRELIMINAR DE RISCO - APR",
    fields: [
      { id: "atividade", helpId: "ssma.form.campo-atividade", label: "Descrição da atividade", type: "text", placeholder: "Informe a atividade" },
      { id: "local", helpId: "ssma.form.campo-local", label: "Local da atividade", type: "text", placeholder: "Informe o local" },
      { id: "empresa", helpId: "ssma.form.campo-empresa", label: "Empresa executora", type: "text", placeholder: "Informe a empresa" },
      { id: "responsavel", helpId: "ssma.form.campo-responsavel", label: "Responsável pela atividade", type: "text", placeholder: "Informe o responsável" },
    ],
    checks: ["Trabalho em altura", "Eletricidade", "Movimentação de cargas"],
    photoActions: ["Anexar foto"],
  },
  {
    number: 5,
    slug: "pt",
    title: "Permissão de trabalho — PT",
    shortTitle: "PT",
    driveFolder: "05 - PERMISSÃO DE TRABALHO - PT",
    fields: [
      { id: "numero", helpId: "ssma.form.campo-pt-numero", label: "Número da PT", type: "text", placeholder: "PT-00000" },
      { id: "atividade", helpId: "ssma.form.campo-atividade", label: "Atividade", type: "text", placeholder: "Informe a atividade" },
      { id: "local", helpId: "ssma.form.campo-local", label: "Local", type: "text", placeholder: "Informe o local" },
      { id: "empresa", helpId: "ssma.form.campo-empresa", label: "Empresa executora", type: "text", placeholder: "Informe a empresa" },
      { id: "validade", helpId: "ssma.form.campo-pt-validade", label: "Validade", type: "datetime-local" },
    ],
    checks: ["Área isolada", "EPI verificado", "Equipamentos inspecionados"],
    photoActions: ["Anexar foto"],
  },
  {
    number: 6,
    slug: "integracao",
    title: "Integração",
    shortTitle: "Integração",
    driveFolder: "06 - LISTA DE INTEGRAÇÃO",
    fields: [
      { id: "empresa", helpId: "ssma.form.campo-empresa", label: "Empresa do trabalhador", type: "text", placeholder: "Informe a empresa" },
      { id: "trabalhador", helpId: "ssma.form.campo-trabalhador", label: "Nome do trabalhador", type: "text", placeholder: "Informe o nome" },
      { id: "funcao", helpId: "ssma.form.campo-funcao", label: "Função", type: "text", placeholder: "Informe a função" },
      { id: "documento", helpId: "ssma.form.campo-documento", label: "Documento", type: "text", placeholder: "CPF ou documento" },
      { id: "instrutor", helpId: "ssma.form.campo-instrutor", label: "Instrutor", type: "text", placeholder: "Informe o instrutor" },
    ],
    checks: ["Normas de segurança", "Uso de EPI", "Riscos da obra"],
    photoActions: ["Anexar foto da lista", "Capturar assinatura"],
  },
  {
    number: 7,
    slug: "almoxarifado",
    title: "Organização do almoxarifado",
    shortTitle: "Almoxarifado",
    driveFolder: "08 - ORGANIZAÇÃO DO ALMOXARIFADO",
    fields: [
      { id: "area", helpId: "ssma.form.campo-area", label: "Área inspecionada", type: "text", placeholder: "Informe a área" },
      { id: "responsavel", helpId: "ssma.form.campo-responsavel", label: "Responsável pelo almoxarifado", type: "text", placeholder: "Informe o responsável" },
      { id: "observacoes", helpId: "ssma.form.campo-observacoes", label: "Observações", type: "textarea", placeholder: "Observações opcionais" },
    ],
    checks: [
      "Materiais identificados",
      "Empilhamento seguro",
      "Corredores desobstruídos",
      "Produtos químicos segregados",
      "Extintores acessíveis",
    ],
    photoActions: ["Tirar foto"],
  },
  {
    number: 8,
    slug: "riscos-apontados",
    title: "Riscos apontados",
    shortTitle: "Riscos apontados",
    driveFolder: "09 - RISCOS APONTADOS",
    fields: [
      {
        id: "classificacao",
        helpId: "ssma.form.campo-risco-classificacao",
        label: "Classificação",
        type: "select",
        options: ["Condição insegura", "Ato inseguro", "Quase-acidente", "Outra"],
        required: true,
      },
      { id: "local", helpId: "ssma.form.campo-risco-local", label: "Local do risco", type: "text", placeholder: "Informe o local" },
      { id: "descricao", helpId: "ssma.form.campo-risco-descricao", label: "Descrição do risco", type: "textarea", placeholder: "Descreva o risco" },
      { id: "acao", helpId: "ssma.form.campo-risco-acao", label: "Ação imediata adotada", type: "textarea", placeholder: "Informe a ação adotada" },
      { id: "responsavel", helpId: "ssma.form.campo-risco-responsavel", label: "Responsável pela correção", type: "text", placeholder: "Informe o responsável" },
      { id: "prazo", helpId: "ssma.form.campo-risco-prazo", label: "Prazo", type: "date" },
    ],
    checks: ["Área sinalizada"],
    photoActions: ["Tirar foto"],
  },
  {
    number: 9,
    slug: "limpeza",
    title: "Limpeza da obra",
    shortTitle: "Limpeza da obra",
    driveFolder: "10 - LIMPEZA DA OBRA",
    fields: [
      { id: "area", helpId: "ssma.form.campo-area", label: "Área inspecionada", type: "text", placeholder: "Informe a área" },
      { id: "observacoes", helpId: "ssma.form.campo-observacoes", label: "Observações", type: "textarea", placeholder: "Observações opcionais" },
    ],
    checks: [
      "Resíduos recolhidos",
      "Rotas desobstruídas",
      "Materiais organizados",
      "Coleta seletiva realizada",
      "Área sem materiais cortantes",
    ],
    photoActions: ["Foto antes", "Foto depois"],
  },
  {
    number: 10,
    slug: "outros",
    title: "Outros registros",
    shortTitle: "Outros",
    driveFolder: "11 - OUTROS",
    fields: [
      { id: "titulo", helpId: "ssma.form.campo-outros-titulo", label: "Título do registro", type: "text", placeholder: "Informe o título" },
      { id: "categoria", helpId: "ssma.form.campo-outros-categoria", label: "Categoria", type: "text", placeholder: "Informe a categoria" },
      { id: "local", helpId: "ssma.form.campo-local", label: "Local", type: "text", placeholder: "Informe o local" },
      { id: "descricao", helpId: "ssma.form.campo-descricao", label: "Descrição", type: "textarea", placeholder: "Descreva o registro" },
    ],
    checks: ["Registro conferido"],
    photoActions: ["Tirar foto"],
  },
  {
    number: 11,
    slug: "remessa-bota-fora",
    title: "Remessa para bota-fora",
    shortTitle: "Remessa para bota-fora",
    driveFolder: "07 - REMESSAS PARA BOTA-FORA",
    independent: true,
    fields: [
      { id: "residuo", helpId: "ssma.form.campo-remessa-residuo", label: "Tipo de resíduo", type: "text", placeholder: "Informe o resíduo" },
      { id: "quantidade", helpId: "ssma.form.campo-remessa-quantidade", label: "Quantidade estimada", type: "number", placeholder: "0" },
      { id: "unidade", helpId: "ssma.form.campo-remessa-unidade", label: "Unidade", type: "select", options: ["m³", "t", "kg", "caçamba", "viagem"] },
      { id: "transportadora", helpId: "ssma.form.campo-remessa-transportadora", label: "Transportadora", type: "text", placeholder: "Informe a transportadora" },
      { id: "motorista", helpId: "ssma.form.campo-remessa-motorista", label: "Motorista", type: "text", placeholder: "Informe o motorista" },
      { id: "placa", helpId: "ssma.form.campo-remessa-placa", label: "Placa do veículo", type: "text", placeholder: "ABC1D23" },
      { id: "destino", helpId: "ssma.form.campo-remessa-destino", label: "Destino autorizado", type: "text", placeholder: "Informe o destino" },
      { id: "comprovante", helpId: "ssma.form.campo-remessa-comprovante", label: "Número do MTR ou comprovante", type: "text", placeholder: "Informe o número" },
    ],
    checks: ["Carga conferida", "Destino autorizado"],
    photoActions: ["Foto da carga", "Anexar comprovante"],
  },
  {
    number: 12,
    slug: "ocorrencia-acidente",
    title: "Ocorrência / acidente",
    shortTitle: "Ocorrência / acidente",
    // O identificador e o título GRAVADOS não mudam (validados pelo banco); só o nome exibido.
    displayTitle: "Ocorrências: Acidentes e Near Misses",
    displayShortTitle: "Ocorrências: Acidentes e Near Misses",
    nearMissVariant: {
      submitAs: { slug: "riscos-apontados", number: 8, title: "Riscos apontados", driveFolder: "09 - RISCOS APONTADOS" },
      fixedValues: { classificacao: "Quase-acidente", tipoOcorrencia: "Near Miss", origem: "formulario-12" },
      fields: [
        { id: "local", helpId: "ssma.form.campo-risco-local", label: "Local do Near Miss", type: "text", placeholder: "Informe o local", required: true },
        { id: "descricao", helpId: "ssma.form.campo-nearmiss-descricao", label: "O que aconteceu (fatos conhecidos)", type: "textarea", placeholder: "Descreva o que quase aconteceu; sem diagnóstico", required: true },
        { id: "acao", helpId: "ssma.form.campo-risco-acao", label: "Ação imediata adotada", type: "textarea", placeholder: "Informe a ação adotada" },
        { id: "responsavel", helpId: "ssma.form.campo-nearmiss-responsavel", label: "Responsável pelo tratamento", type: "text", placeholder: "Informe o responsável" },
        { id: "prazo", helpId: "ssma.form.campo-risco-prazo", label: "Prazo", type: "date" },
      ],
      checks: ["Área sinalizada"],
      photoActions: ["Tirar foto"],
    },
    driveFolder: "12 - OCORRÊNCIAS E ACIDENTES",
    independent: true,
    fields: [
      {
        id: "afastamento",
        helpId: "ssma.form.campo-acidente-afastamento",
        label: "Classificação do acidente",
        type: "select",
        options: ["Sem afastamento", "Com afastamento"],
        required: true,
      },
      {
        id: "funcionario",
        helpId: "ssma.form.campo-acidente-funcionario",
        label: "Nome do funcionário",
        type: "text",
        placeholder: "Informe o nome completo",
        required: true,
      },
      {
        id: "causa",
        helpId: "ssma.form.campo-acidente-causa",
        label: "Causa informada",
        type: "textarea",
        placeholder: "Registre somente os fatos conhecidos; não faça diagnóstico",
        required: true,
      },
      {
        id: "remocaoEm",
        helpId: "ssma.form.campo-acidente-remocao",
        label: "Data e hora da remoção",
        type: "datetime-local",
        required: true,
      },
    ],
    checks: ["Atendimento inicial registrado", "Comunicação interna conferida"],
    photoActions: ["Foto do local", "Foto da remoção"],
    requiredPhotoActions: ["Foto do local", "Foto da remoção"],
  },
] as const;

export const SSMA_RISK_LEVELS = [
  { value: "BAIXA", label: "Baixo", className: "bg-[#166534] text-white" },
  { value: "MEDIA", label: "Médio", className: "bg-[#2563EB] text-white" },
  { value: "ALTA", label: "Alto", className: "bg-[#FFD600] text-black" },
  { value: "CRITICA", label: "Crítico", className: "bg-[#DC2626] text-white" },
] as const;

/** Título completo exibido (cabeçalho do formulário). */
export const checklistTitle = (definition: SsmaChecklistDefinition): string => definition.displayTitle ?? definition.title;
/** Título curto exibido (cartões, listas). */
export const checklistShortTitle = (definition: SsmaChecklistDefinition): string => definition.displayShortTitle ?? definition.shortTitle;
/** Rótulo exibido de um item do checklist (o valor gravado não muda). */
export const checklistCheckLabel = (definition: SsmaChecklistDefinition, check: string): string => definition.checkLabels?.[check] ?? check;
