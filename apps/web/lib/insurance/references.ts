// Base de REFERÊNCIAS que o domínio pressupõe. São referências, NÃO texto normativo reproduzido nem presumido.
// Cada item registra o que foi efetivamente consultado e as limitações. Verificação em 2026-11-20 (fontes abaixo).
export interface LegalReference {
  id: string;
  title: string;
  kind: "LEI" | "REGULAMENTO_SUSEP" | "REFERENCIA_TECNICA_HISTORICA";
  status: "CONFIRMADO_FONTE_OFICIAL" | "CONFIRMADO_FONTE_SECUNDARIA" | "NAO_VERIFICADO_NESTA_RODADA";
  checkedAt: string;
  source: string;
  whatWasRead: string;
  limitations: string[];
  usedByDomain: string;
}

export const INSURANCE_REFERENCES: LegalReference[] = [
  {
    id: "LEI_15040_2024",
    title: "Lei nº 15.040, de 9 de dezembro de 2024 (normas de seguro privado)",
    kind: "LEI",
    status: "CONFIRMADO_FONTE_OFICIAL",
    checkedAt: "2026-11-20",
    source: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/L15040.htm",
    whatWasRead:
      "Texto da lei no Planalto, lido por ferramenta automática de extração: art. 134 (vigência: 1 ano após a publicação oficial — DOU 10/12/2024); art. 133 (revoga arts. 757 a 802 do Código Civil e arts. 9º a 14 do Decreto-Lei 73/1966); art. 66 (aviso prompto ao segurador); art. 86 (30 dias da reclamação/aviso para manifestação sobre a cobertura); arts. 126-127 (prescrição). Não há menção expressa a seguro garantia nem a grandes riscos; não há regra intertemporal expressa para contratos anteriores.",
    limitations: [
      "A leitura não foi integral nem jurídica; artigos citados devem ser reconferidos no texto oficial antes de uso em peça.",
      "Aplicação a seguro garantia (regido também por regulamentação SUSEP) e a contratos anteriores à vigência NÃO está resolvida: tratar como questão para parecer jurídico.",
      "Alterações posteriores à lei não foram pesquisadas.",
      "O domínio NÃO calcula prazos legais automaticamente: prazos de aviso/prescrição entram somente como dado cadastrado com base.",
    ],
    usedByDomain: "claim-stages.evaluateNoticeDeadline (somente dado cadastrado); claim-flows (nota de prazos)",
  },
  {
    id: "CODIGO_CIVIL_2002",
    title: "Código Civil (Lei 10.406/2002) — contrato de seguro (arts. 757 a 802) e responsabilidade civil",
    kind: "LEI",
    status: "CONFIRMADO_FONTE_OFICIAL",
    checkedAt: "2026-11-20",
    source: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/L15040.htm",
    whatWasRead: "Somente a informação (art. 133 da Lei 15.040) de que arts. 757-802 foram revogados. Texto do Código Civil não foi aberto.",
    limitations: ["Qual regime vale para apólice em curso (Código Civil x Lei 15.040) depende de análise jurídica de direito intertemporal."],
    usedByDomain: "Pressuposto geral (não codificado)",
  },
  {
    id: "CDC_8078_1990",
    title: "Código de Defesa do Consumidor (Lei 8.078/1990)",
    kind: "LEI",
    status: "NAO_VERIFICADO_NESTA_RODADA",
    checkedAt: "2026-11-20",
    source: "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm",
    whatWasRead: "Nada: apenas registrado como referência pressuposta. Aplicabilidade a tomadores/segurados empresariais é questão jurídica em aberto.",
    limitations: ["Não aplicar presunções de consumo sem parecer."],
    usedByDomain: "Pressuposto geral (não codificado)",
  },
  {
    id: "SUSEP_CNSP_GERAL",
    title: "Regulação SUSEP/CNSP aplicável a seguros (resoluções CNSP e circulares SUSEP)",
    kind: "REGULAMENTO_SUSEP",
    status: "NAO_VERIFICADO_NESTA_RODADA",
    checkedAt: "2026-11-20",
    source: "https://www.gov.br/susep/pt-br",
    whatWasRead: "Nada individualmente. Resoluções CNSP específicas não foram pesquisadas.",
    limitations: ["O domínio não depende de nenhuma resolução específica; cláusulas vêm da apólice cadastrada."],
    usedByDomain: "Pressuposto geral (não codificado)",
  },
  {
    id: "CIRCULAR_SUSEP_662_2022",
    title: "Circular SUSEP nº 662/2022 (seguro garantia)",
    kind: "REGULAMENTO_SUSEP",
    status: "CONFIRMADO_FONTE_SECUNDARIA",
    checkedAt: "2026-11-20",
    source: "https://www.migalhas.com.br/depeso/369502/nova-regulacao-para-o-seguro-garantia",
    whatWasRead:
      "Resumos de escritórios/veículos especializados (Migalhas, Tozzini Freire, Demarest, Revista Apólice): publicada em 12/04/2022, em vigor em 02/05/2022, revogou a Circular SUSEP 477/2013 (e, segundo algumas fontes, a 577/2018) e eliminou as condições padronizadas, permitindo clausulado próprio das seguradoras com dispositivos mandatórios de proteção ao segurado.",
    limitations: [
      "O texto integral oficial NÃO foi obtido: tudo é fonte secundária.",
      "As fontes divergem quanto ao período de transição para planos registrados antes da vigência (ex.: adaptação até 01/01/2023); não presumir.",
      "Vigência atual (alterações/revogações posteriores à 2022) NÃO foi confirmada em fonte oficial: confirmar no portal da SUSEP.",
      "Fiança bancária e caução NÃO são regidas por esta circular; o domínio não presume procedimento SUSEP para elas.",
    ],
    usedByDomain: "claim-flows (SEGURO x FIANCA_BANCARIA); dossier (condições vêm do clausulado da apólice)",
  },
  {
    id: "MANUAL_PROPRIETARIO_3ED_2013",
    title: "Manual do Proprietário — 3ª edição (Secovi-SP / SindusCon-SP, publicado em dezembro de 2013)",
    kind: "REFERENCIA_TECNICA_HISTORICA",
    status: "CONFIRMADO_FONTE_SECUNDARIA",
    checkedAt: "2026-11-20",
    source: "arquivo local somente leitura (Downloads); não copiado para o repositório",
    whatWasRead:
      "Extração de texto por pdftotext e leitura das páginas 7 (ficha técnica; publicação dez/2013), 12 (definições: garantia contratual, garantia legal, solidez da construção, vícios ocultos, vida útil — VU, que 'não pode ser confundida com prazo de garantia'), 13 e 14 (seção 2 Termo de Garantia; Tabelas A e B de prazos recomendados com base na ABNT NBR 15575; nota de que prazos são totais, não somam à garantia legal; ANEXO I da NBR 15575:2013 como base da vida útil), 21 (prazos computados a partir do Auto de Conclusão/Habite-se ou entrega; garantia contratual facultativa, por termo escrito; seção 2.2 perda de garantia: mau uso, falta de manutenção conforme ABNT NBR 5674, reforma, etc.) e 22 (2.3 Termo de Garantia; 2.4 solicitação de assistência técnica: construtora repara sem ônus dentro dos prazos, cobrança de taxa de visita se fora da garantia). As demais páginas (sistemas e manutenção, ~94 páginas no total) NÃO foram lidas em detalhe.",
    limitations: [
      "Referência HISTÓRICA para edificações HABITACIONAIS (2013); NÃO aplicar suas tabelas de prazo a galpões, obras industriais ou outras tipologias.",
      "Não é norma nem contrato: prazos de garantia do ACC vêm do contrato/termo de cada obra.",
      "A ABNT NBR 15575 e a NBR 5674 são citadas apenas pelo manual; as normas não foram lidas.",
      "Texto extraído tem caracteres corrompidos pela fonte do PDF; trechos citados foram reconferidos visualmente na extração.",
      "Direitos autorais reservados às entidades: nenhuma reprodução em repositório.",
    ],
    usedByDomain: "Somente conceitos de apoio (garantia contratual x legal x vida útil; perda de garantia por falta de manutenção) — não codificados como regra",
  },
];

export const INSURANCE_REFERENCES_DISCLAIMER =
  "Referências de apoio, não consultoria jurídica. Toda conclusão de cobertura é INFERÊNCIA com revisão humana obrigatória.";
