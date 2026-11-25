// Base de REFERÊNCIAS do Consultor Jurídico IA para SEGUROS, GARANTIAS, ENDOSSOS e SINISTROS.
//
// IMPORTANTE (CLAUDE.md 11/12; briefing de qualidade):
//   - Isto NÃO é um corpus normativo e NÃO contém texto de lei. É um índice versionado de FONTES a conferir:
//     cada entrada traz o instrumento, o tema em que costuma ser relevante, o estado de VERIFICAÇÃO e as
//     limitações. Nenhum dispositivo é "citado de memória" como texto oficial: o Expert deve remeter ao texto
//     oficial/ao Jurídico humano (ver LEGAL_SOURCE_UNAVAILABLE_NOTICE em ./types.ts).
//   - Fontes SECUNDÁRIAS (blogs, portais, corretoras) apenas indicam onde procurar: nunca fundamentam uma
//     conclusão — "conferir em texto oficial".
//   - Edições/vigências foram pesquisadas em 2026-11-20 (WebSearch, resultados secundários); o que não foi
//     confirmado em fonte oficial está marcado como NOT_CONFIRMED_OFFICIAL.
//
// Puro, sem I/O e sem "server-only".

export const INSURANCE_WARRANTY_REFERENCES_VERSION = "2026-11-20.1";

export type ReferenceKind = "LEI" | "CODIGO" | "REGULAMENTO_SUSEP" | "NORMA_TECNICA" | "MANUAL_SETORIAL" | "FONTE_SECUNDARIA";

/** OFFICIAL_TEXT_PENDING: existência/identificação confirmada, texto oficial ainda não conferido linha a linha. */
export type ReferenceVerification =
  | "OFFICIAL_TEXT_PENDING"
  | "NOT_CONFIRMED_OFFICIAL"
  | "READ_LOCAL_FILE"
  | "SECONDARY_ONLY";

export interface LegalReference {
  id: string;
  kind: ReferenceKind;
  title: string;
  /** Identificação formal conhecida (número/ano); null quando não confirmada. */
  identification: string | null;
  /** Tema em que a referência costuma ser relevante (resumo próprio — NÃO é texto da norma). */
  relevance: string;
  verification: ReferenceVerification;
  /** Origem oficial a conferir; null quando não há URL oficial confirmada. */
  officialSourceToCheck: string | null;
  /** O que foi e o que NÃO foi confirmado, e cautelas de aplicação. */
  notes: string[];
  /** Fonte secundária nunca fundamenta conclusão. */
  isSecondary: boolean;
}

export const INSURANCE_WARRANTY_REFERENCES: readonly LegalReference[] = [
  {
    id: "lei-15040-2024",
    kind: "LEI",
    title: "Lei nº 15.040/2024 — Marco Legal dos Seguros (normas de seguro privado)",
    identification: "Lei 15.040, de 9 de dezembro de 2024 (publicação em 10/12/2024, segundo fontes secundárias)",
    relevance:
      "Regime geral do contrato de seguro: aviso de sinistro, regulação, prazos de resposta da seguradora, prescrição e suspensão por pedido de reconsideração, renovação.",
    verification: "OFFICIAL_TEXT_PENDING",
    officialSourceToCheck: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/L15040.htm",
    notes: [
      "Leitura registrada por S1 (apps/web/lib/insurance/references.ts, texto do Planalto): art. 134 (vigência 1 ano após a publicação — DOU 10/12/2024), art. 133 (revoga arts. 757 a 802 do Código Civil e arts. 9º a 14 do Decreto-Lei 73/1966), art. 66 (aviso), art. 86 (30 dias para manifestação sobre a cobertura), arts. 126-127 (prescrição); sem regra intertemporal expressa e sem menção a seguro garantia. E1 NÃO reconferiu o texto oficial.",
      "Vigência: a lei prevê vacatio legis de um ano (art. 134, a conferir no texto oficial). Fontes secundárias divergem entre 10/12/2025 e 11/12/2025 como primeiro dia — NÃO CONFIRMADO em texto oficial; usar a data do texto oficial.",
      "Aplicação temporal: a leitura predominante nas fontes secundárias é de aplicação a contratos celebrados (e a renovações) a partir da vigência, mantendo-se o regime anterior para contratos anteriores; há debate. NÃO tratar como pacífico: a data de celebração/renovação da apólice e o texto oficial decidem. Conclusão sempre sujeita a revisão jurídica humana.",
      "A regulamentação complementar da SUSEP estava, segundo fontes secundárias, pendente/em curso — não presumir norma infralegal.",
    ],
    isSecondary: false,
  },
  {
    id: "cc-art-618",
    kind: "CODIGO",
    title: "Código Civil — art. 618 (responsabilidade do empreiteiro por solidez e segurança)",
    identification: "Lei 10.406/2002, art. 618",
    relevance:
      "Empreitada de edifícios e construções consideráveis: responsabilidade por solidez e segurança em prazo legal irredutível, com prazo próprio para ação (decadência) a partir do aparecimento do vício.",
    verification: "OFFICIAL_TEXT_PENDING",
    officialSourceToCheck: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm",
    notes: [
      "O prazo legal do art. 618 é distinto do prazo de garantia CONTRATUAL e NÃO é aplicável universalmente: depende de o contrato ser de empreitada de edifício/construção considerável e de a questão ser de solidez e segurança. Vício aparente/oculto, decadência, prescrição e indenização são institutos diferentes e devem ser tratados separadamente.",
      "Não aplicar prazo de 5 anos a todo defeito; não extinguir pretensão pelo simples término da garantia contratual.",
      "Sem texto oficial carregado no ACC (LEGAL_SOURCE_UNAVAILABLE_NOTICE continua valendo): citar apenas como indicação a conferir pelo Jurídico.",
    ],
    isSecondary: false,
  },
  {
    id: "cdc",
    kind: "LEI",
    title: "Código de Defesa do Consumidor (vício e fato do produto/serviço; garantia legal e contratual)",
    identification: "Lei 8.078/1990",
    relevance:
      "Relações de consumo (ex.: unidades habitacionais). Distingue vício (decadência) de fato do produto/serviço (prescrição) e garantia legal de contratual.",
    verification: "OFFICIAL_TEXT_PENDING",
    officialSourceToCheck: "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm",
    notes: [
      "Só se aplica se houver relação de consumo; contratos entre empresas (obras industriais/logísticas B2B) tipicamente seguem outro regime — verificar caso a caso, sem presumir.",
    ],
    isSecondary: false,
  },
  {
    id: "susep-cnsp",
    kind: "REGULAMENTO_SUSEP",
    title: "SUSEP / CNSP — regulação do mercado segurador",
    identification: null,
    relevance: "Órgão regulador (SUSEP) e conselho normativo (CNSP): condições gerais, processos de regulação, canais de atendimento/ouvidoria.",
    verification: "NOT_CONFIRMED_OFFICIAL",
    officialSourceToCheck: "https://www.gov.br/susep",
    notes: [
      "Nenhuma resolução CNSP específica foi confirmada nesta pesquisa; não citar número de resolução sem conferir no site oficial.",
      "Canal oficial de reclamação/ouvidoria: nunca inventar — usar somente o canal registrado no ACC/apólice ou conferido em fonte oficial.",
    ],
    isSecondary: false,
  },
  {
    id: "susep-circular-662-2022",
    kind: "REGULAMENTO_SUSEP",
    title: "Circular SUSEP nº 662/2022 — Seguro Garantia",
    identification: "Circular SUSEP 662, de 11 de abril de 2022",
    relevance:
      "Regras do seguro garantia (vigência da apólice em relação à obrigação garantida, caracterização/aviso de sinistro, modalidades). Revogou a Circular SUSEP 477/2013 (segundo fontes secundárias).",
    verification: "OFFICIAL_TEXT_PENDING",
    officialSourceToCheck: "https://www.gov.br/susep",
    notes: [
      "Publicação 12/04/2022 e início em 02/05/2022, adaptação das seguradoras até 01/01/2023 — informações de fontes secundárias; NÃO confirmadas em texto oficial.",
      "'E posteriores': não foi confirmada nesta pesquisa nenhuma circular posterior que a altere; conferir a versão consolidada no site da SUSEP antes de qualquer conclusão.",
      "Contratação pública: o seguro garantia em contratos públicos tem regras da Lei 14.133/2021 (garantias) — conferir texto oficial; este índice não reproduz dispositivos.",
    ],
    isSecondary: false,
  },
  {
    id: "lei-14133-2021",
    kind: "LEI",
    title: "Lei nº 14.133/2021 — Licitações e Contratos Administrativos (garantias contratuais)",
    identification: "Lei 14.133/2021",
    relevance: "Contratação pública: modalidades de garantia (caução, seguro-garantia, fiança bancária), exigências e liberação.",
    verification: "OFFICIAL_TEXT_PENDING",
    officialSourceToCheck: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/L14133.htm",
    notes: ["Só se aplica a contratos públicos regidos por ela; o edital/contrato do projeto define o regime."],
    isSecondary: false,
  },
  {
    id: "abnt-nbr-17170-2022",
    kind: "NORMA_TECNICA",
    title: "ABNT NBR 17170:2022 — Edificações — Garantias — Prazos recomendados e diretrizes",
    identification: "ABNT NBR 17170:2022 (publicada em dezembro de 2022, segundo fontes secundárias)",
    relevance: "Prazos de garantia RECOMENDADOS por sistema e diretrizes — referência técnica, não lei.",
    verification: "SECONDARY_ONLY",
    officialSourceToCheck: "https://www.abntcatalogo.com.br",
    notes: [
      "Norma técnica paga: o texto NÃO está no ACC; não citar prazos de memória. Fontes secundárias indicam que a norma não se aplicaria a edificações existentes/em construção nem a projetos protocolados antes de sua publicação — conferir o escopo no texto oficial.",
      "Prazo recomendado por norma não é prazo legal nem prazo do contrato AXION; o contrato/termo de garantia do projeto prevalece como garantia contratual.",
    ],
    isSecondary: false,
  },
  {
    id: "abnt-nbr-15575",
    kind: "NORMA_TECNICA",
    title: "ABNT NBR 15575 — Edificações habitacionais — Desempenho",
    identification: "Edição vigente NÃO confirmada (o Manual do Proprietário referencia a versão 2013)",
    relevance: "Desempenho, vida útil de projeto e prazos de garantia recomendados para edificações HABITACIONAIS.",
    verification: "NOT_CONFIRMED_OFFICIAL",
    officialSourceToCheck: "https://www.abntcatalogo.com.br",
    notes: ["Escopo habitacional: não aplicar a galpões/obras industriais sem justificativa técnica expressa e revisão humana."],
    isSecondary: false,
  },
  {
    id: "abnt-nbr-5674",
    kind: "NORMA_TECNICA",
    title: "ABNT NBR 5674 — Manutenção de edificações — Requisitos para o sistema de gestão de manutenção",
    identification: "Há indicação secundária da edição 2024 (NBR 5674:2024); o Manual do Proprietário referencia a edição 2012. Edição vigente NÃO confirmada em fonte oficial.",
    relevance: "Programa de manutenção e comprovação da manutenção — relevante para condições de garantia/uso adequado.",
    verification: "SECONDARY_ONLY",
    officialSourceToCheck: "https://www.abntcatalogo.com.br",
    notes: ["Fontes secundárias sugerem emendas para alinhar à NBR 17170; não confirmado se foram concluídas."],
    isSecondary: false,
  },
  {
    id: "abnt-nbr-14037",
    kind: "NORMA_TECNICA",
    title: "ABNT NBR 14037 — Manual de uso, operação e manutenção das edificações",
    identification: "Edição vigente NÃO confirmada (o Manual do Proprietário referencia a edição 2011)",
    relevance: "Conteúdo e apresentação do manual de uso, operação e manutenção entregue ao usuário.",
    verification: "NOT_CONFIRMED_OFFICIAL",
    officialSourceToCheck: "https://www.abntcatalogo.com.br",
    notes: [],
    isSecondary: false,
  },
  {
    id: "manual-proprietario-secovi-sinduscon-3ed-2013",
    kind: "MANUAL_SETORIAL",
    title: "Manual do Proprietário — Uso, Operação e Manutenção do Imóvel; Termo de Garantia; Programa de Manutenção (Secovi-SP / SindusCon-SP), 3ª edição, dezembro de 2013",
    identification: "Arquivo manual_do_proprietario_3_edicao1.pdf (sha256 78506bffa838e2b522fc970c62294945e3236bd83db6c47c3e283fc56d4336f2); 'Publicado em dezembro de 2013'",
    relevance:
      "Referência HISTÓRICA e setorial para EDIFICAÇÕES HABITACIONAIS (minuta para incorporadoras/construtoras): conceitos de garantia legal e contratual, vida útil, vício oculto, solidez, manutenção preventiva e hipóteses de perda de garantia.",
    verification: "READ_LOCAL_FILE",
    officialSourceToCheck: null,
    notes: [
      "NÃO aplicar indiscriminadamente a galpões, obras industriais, logísticas ou de saúde; usar apenas como analogia declarada, com revisão humana.",
      "Leitura pelo agente E1 (pdftotext, arquivo local somente leitura em Downloads): definições na p. 12 (garantia contratual e legal, solidez, vício oculto, vida útil, manutenção preventiva p. 11), seção 2 Termo de Garantia (pp. 13-14, com as Tabelas A e B de prazos recomendados com base na NBR 15575 — NÃO transcritas nem aplicáveis a galpões/obras industriais), contagem do prazo e garantia contratual facultativa (p. 21, seção 2.1) e perda de garantia (p. 21, seção 2.2). As demais páginas (sistemas e manutenção) NÃO foram lidas em detalhe. Alinhado à leitura de S1 em apps/web/lib/insurance/references.ts (branch feat/seguros-garantias-modelo-dominio), sem duplicar texto.",
      "Normas citadas no manual estão em edições antigas (NBR 5674:2012, NBR 14037:2011, NBR 15575:2013) e podem ter sido atualizadas.",
      "O PDF original não é copiado para o repositório (evidência/documento do usuário preservado em seu local); o ACC guarda apenas os conceitos abaixo, em paráfrase própria.",
    ],
    isSecondary: false,
  },
  {
    id: "sec-jusbrasil",
    kind: "FONTE_SECUNDARIA",
    title: "jusbrasil.com.br (artigos/jurisprudência compilada) — link complementar fornecido",
    identification: null,
    relevance: "Pista de pesquisa. Conteúdo de terceiros; jurisprudência deve ser conferida no tribunal de origem.",
    verification: "SECONDARY_ONLY",
    officialSourceToCheck: null,
    notes: ["FONTE SECUNDÁRIA — conferir em texto oficial. URL específica não foi fornecida/verificada."],
    isSecondary: true,
  },
  {
    id: "sec-barbosaestrutural",
    kind: "FONTE_SECUNDARIA",
    title: "barbosaestrutural — link complementar fornecido",
    identification: null,
    relevance: "Material técnico de terceiros sobre estruturas/garantias; não é norma nem lei.",
    verification: "SECONDARY_ONLY",
    officialSourceToCheck: null,
    notes: ["FONTE SECUNDÁRIA — conferir em texto oficial. URL específica não foi fornecida/verificada."],
    isSecondary: true,
  },
  {
    id: "sec-bravobrasil",
    kind: "FONTE_SECUNDARIA",
    title: "bravobrasil — link complementar fornecido",
    identification: null,
    relevance: "Conteúdo de terceiros sobre seguros/garantias; não é fonte oficial.",
    verification: "SECONDARY_ONLY",
    officialSourceToCheck: null,
    notes: ["FONTE SECUNDÁRIA — conferir em texto oficial. URL específica não foi fornecida/verificada."],
    isSecondary: true,
  },
  {
    id: "sec-akadseguros",
    kind: "FONTE_SECUNDARIA",
    title: "akadseguros — link complementar fornecido",
    identification: null,
    relevance: "Conteúdo de corretora/terceiros sobre seguros; não é fonte oficial.",
    verification: "SECONDARY_ONLY",
    officialSourceToCheck: null,
    notes: ["FONTE SECUNDÁRIA — conferir em texto oficial. URL específica não foi fornecida/verificada."],
    isSecondary: true,
  },
];

/** Conceitos extraídos (paráfrase própria) do Manual do Proprietário 3ª ed. — contexto HABITACIONAL, sempre com cautela. */
export interface ManualConcept {
  id: string;
  concept: string;
  paraphrase: string;
  /** Página IMPRESSA do manual (rodapé) e seção, conforme extração por pdftotext lida pelo agente E1. */
  page: string;
  /** Sempre true: o conceito é de edificação habitacional/histórico. */
  residentialHistoricalContext: true;
}

export const MANUAL_PROPRIETARIO_CONCEPTS: readonly ManualConcept[] = [
  {
    id: "garantia-contratual",
    page: "p. 12 (Definições)",
    concept: "Garantia contratual",
    paraphrase:
      "Concedida voluntariamente pelo fornecedor por termo/certificado, complementa a garantia legal e não implica, necessariamente, soma de prazos.",
    residentialHistoricalContext: true,
  },
  {
    id: "garantia-legal",
    page: "p. 12 (Definições)",
    concept: "Garantia legal",
    paraphrase: "Período previsto em lei para reclamar de vício ou defeito de produto durável.",
    residentialHistoricalContext: true,
  },
  {
    id: "vicio-oculto",
    page: "p. 12 (Definições)",
    concept: "Vício oculto",
    paraphrase: "Aquele não detectável no momento da entrega do imóvel.",
    residentialHistoricalContext: true,
  },
  {
    id: "solidez",
    page: "p. 12 (Definições)",
    concept: "Solidez da construção",
    paraphrase: "Itens ligados à solidez da edificação que possam comprometer a segurança (estrutura, fundações, contenções).",
    residentialHistoricalContext: true,
  },
  {
    id: "vida-util-nao-e-garantia",
    page: "p. 12 (Definições; Nota da vida útil)",
    concept: "Vida útil não é prazo de garantia",
    paraphrase:
      "Vida útil depende de uso e manutenção e não deve ser confundida com prazo de garantia legal ou contratual.",
    residentialHistoricalContext: true,
  },
  {
    id: "perda-de-garantia",
    page: "p. 21 (seção 2.2 Perda de garantia)",
    concept: "Hipóteses de perda de garantia (modelo habitacional)",
    paraphrase:
      "Mau uso, reforma/alteração que comprometa desempenho, ausência de programa de manutenção ou de sua comprovação, sobrecarga acima dos limites informados e impedimento de acesso para vistoria; desgaste natural não é coberto. Em obras industriais, estas hipóteses valem só se o contrato/termo do projeto as previr.",
    residentialHistoricalContext: true,
  },
  {
    id: "inicio-do-prazo",
    page: "p. 21 (seção 2.1, itens de contagem do prazo)",
    concept: "Início do prazo",
    paraphrase: "No modelo do manual, conta-se do Habite-se ou da entrega, o que ocorrer primeiro; no ACC o marco vale somente se o contrato/termo do projeto assim dispuser.",
    residentialHistoricalContext: true,
  },
];

export function getReference(id: string): LegalReference | null {
  return INSURANCE_WARRANTY_REFERENCES.find((reference) => reference.id === id) ?? null;
}

/** Referências cuja fundamentação NÃO pode sustentar conclusão (secundárias ou texto oficial não conferido). */
export function referencesRequiringOfficialCheck(): LegalReference[] {
  return INSURANCE_WARRANTY_REFERENCES.filter((reference) => reference.isSecondary || reference.verification !== "READ_LOCAL_FILE");
}
