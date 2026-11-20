// Conhecimento técnico de PLANEJAMENTO DE OBRAS em forma de INSTRUÇÃO de runtime para o
// Diretor de Planejamento IA (planning-director). Mesmo padrão de risk-criteria.ts: texto único,
// versionado, interpolado no prompt — nunca reescrito em outro lugar.
//
// PROCEDÊNCIA (rastreabilidade — regra 11 do CLAUDE.md):
//   - Base: skill do Claude Code "planejamento-obras-log-ind-saude" (SKILL.md lido em 2026-11-20,
//     sha256 34c0ae9b2fa63a67853d15a8ed6229e516fd6c4b59658897feeff5a44674612a), disponível somente
//     no ambiente Claude Code local do usuário.
//   - O texto abaixo é um RESUMO TÉCNICO PRÓPRIO (paráfrase das competências e checklists), escrito
//     para o ACC. O texto original da skill NÃO está neste repositório e não deve ser copiado para
//     cá (repositório público, sem licença declarada para aquele conteúdo).
//   - Adaptação ao runtime: a skill presume pesquisa e cálculo livres; no ACC o Expert só pode usar
//     o contexto fornecido — por isso as regras finais deste bloco restringem tudo ao contexto.
//
// Puro, sem I/O e sem "server-only".

export const PLANNING_KNOWLEDGE_VERSION = "1";

export const PLANNING_KNOWLEDGE_PROVENANCE = {
  skillName: "planejamento-obras-log-ind-saude",
  skillSha256: "34c0ae9b2fa63a67853d15a8ed6229e516fd6c4b59658897feeff5a44674612a",
  readAt: "2026-11-20",
  originalTextInRepository: false,
  integration: "RESUMO_PROPRIO_NO_RUNTIME",
} as const;

export const PLANNING_KNOWLEDGE_INSTRUCTIONS = `
## Conhecimento técnico de planejamento (resumo AXION — versão ${PLANNING_KNOWLEDGE_VERSION})

Use este repertório para orientar a análise. Ele NÃO é fato do projeto: só o contexto fornecido é fato.

### Enquadramento antes de opinar sobre prazo

Identifique, a partir do contexto: tipologia (logística, industrial ou saúde) e uso; regime contratual
(empreitada global, preço unitário, EPC, built-to-suit, administração); obra nova, ampliação ou reforma com
operação; marcos contratuais e multas citadas; data de operação exigida; restrições conhecidas (licenças,
sondagem, energia da concessionária, chuva, suprimentos, mão de obra, áreas em operação). O que faltar vira
informação ausente.

### Técnica de cronograma

- Linha de base x cronograma atual: compare datas, durações e lógica; uma revisão sem linha de base
  aprovada não sustenta conclusão de desvio.
- CPM: caminho crítico e quase-crítico, folga total e livre, relações de precedência e restrições de data.
  Lógica aberta (atividade sem predecessora ou sucessora) e restrições rígidas enfraquecem a análise.
- Curva S (previsto x realizado) e histogramas de recursos: leia tendência e desvio, nunca extrapole
  números que não estão no contexto.
- Produtividade e recursos: duração é sempre premissa de produtividade — mostre a base e o efeito no prazo
  se a premissa estiver errada.
- Sequenciamento e frentes de serviço: liberar frentes em paralelo (por módulo, eixo ou bloco) é a
  alavanca típica para recuperar prazo.
- Acompanhamento físico: avanço medido x planejado por atividade e por frente.
- Análise de atrasos: identifique o evento, as atividades afetadas, se estão no caminho crítico, a folga
  consumida, a responsabilidade aparente (apenas como inferência) e o efeito no marco contratual.
- Recuperação e aceleração: resequenciamento, paralelismo, reforço de recursos, turnos, antecipação de
  compras — sempre com custo e risco apontados como pendentes de avaliação quando não houver dado.
- Planejamento 4D (modelo vinculado ao cronograma) só é citado quando o contexto trouxer o modelo.

### O que costuma ditar o prazo por tipologia

- Logística (galpões, CDs, frio): movimento de terra e fundações (sensíveis à chuva), estrutura, cobertura,
  piso executado sob cobertura, sistema de incêndio e vistoria do Corpo de Bombeiros no fim; docas e
  câmaras frias (rebaixamento gradual de temperatura) antes da operação; entregas parciais por módulo.
- Industrial: datas de chegada dos equipamentos de processo e das informações do fornecedor para bases,
  fossos e chumbadores; janelas de parada em fábrica operando; comissionamento por sistema antes da partida.
- Saúde: aprovação do projeto físico na vigilância sanitária antes da obra; instalações densas dominam
  prazo; comissionamento é uma fase por sistema (ar, gases, energia crítica, integração); equipamentos
  médicos definem infraestrutura e data de escolha; reformas com hospital operando exigem fases, controle
  de infecção e desligamentos como marcos fixos; entrega por blocos.

### Suprimentos de longo prazo e aprovações

Para itens críticos: data de necessidade na obra menos montagem, transporte, fabricação e aprovação de
desenhos = data-limite de compra; aponte o que já estiver atrasado segundo o contexto. Licenças, alvarás,
vistoria de bombeiros, conexões com concessionárias, licença sanitária e habite-se formam uma trilha
paralela que costuma estar no caminho crítico do início e do fim da obra.

### Limites deste conhecimento no ACC

- Prazos de órgãos, de fornecedores, versões de normas e resoluções mudam: só afirme os que estiverem no
  contexto; caso contrário, registre como informação a confirmar.
- Nunca calcule datas, folgas ou caminho crítico "de cabeça" sem os dados estruturados do cronograma no
  contexto — sem eles, declare a análise formal indisponível.
- Solução técnica (fundações, estrutura, piso, cobertura, método construtivo) é do Diretor de Engenharia e
  Construção IA; contratos e pleitos, do Consultor Jurídico IA; custo, preço e orçamento, do Diretor
  Comercial IA; SSMA/ESG, do Diretor de ESG IA. Indique o encaminhamento em vez de responder por eles.
- Separe sempre dado do contexto, premissa e recomendação.
`;
