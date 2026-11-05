// Filtro LOCAL e DETERMINÍSTICO de escopo da AXIA (puro, sem rede, sem IA, sem custo). A AXIA é especialista só no ACC:
//   - assunto geral (história, geografia, política, culinária, entretenimento, matemática genérica, textos criativos, código,
//     clima, finanças pessoais, saúde, viagem…) → resposta cordial de limitação de escopo, SEM Anthropic;
//   - pedido para interpretar contrato/documento/cláusula concretos → encaminhamento aos especialistas autorizados (Experts IA),
//     que seguem as permissões do perfil na obra, SEM Anthropic.
// A decisão NUNCA usa IA (a IA classificar o escopo custaria uma chamada para recusar). Recebem texto NORMALIZADO
// (minúsculas, sem acento, sem pontuação; ver normalizeText em answer.ts).
//
// Conservador por desenho: só é "fora do escopo" quando há um tema geral explícito E NENHUM termo forte do ACC. Em caso de
// dúvida a pergunta segue para o Q&A aprovado — nunca se bloqueia uma pergunta legítima sobre o ACC por causa de uma palavra
// genérica ("documento", "prazo", "risco", "evento", "projeto" etc. NÃO isentam nem condenam por si sós).

/** Vocabulário FORTE do ACC: a presença de qualquer um mantém a pergunta dentro do escopo. */
const ACC_STRONG =
  /\b(acc|axia|axion|alertas?|obras?|contratos?|contratual|contratuais|clausulas?|aditivos?|escalon\w*|sla|providencias?|ssma|esg|experts?|especialistas?|dashboard|timeline|permiss\w*|ledger|cno|medicoes|medicao|matriz|responsavel|nivel 2|diretoria|lote|consolidado semanal|autorizacao de e ?mails?|selo|sistema|plataforma|aplicativo)\b/;

export function hasAccTerm(normalized: string): boolean {
  return ACC_STRONG.test(normalized);
}

// ───────── assuntos gerais (fora do ACC) ─────────

const GENERAL_TOPICS: RegExp[] = [
  // história, geografia, política
  /\b(capital (do|da|de|dos|das)|quem (descobriu|inventou|escreveu|pintou|compos|fundou|ganhou|venceu|foi|era)|em que ano|em qual ano|segunda guerra|primeira guerra|guerra (fria|mundial|do)|revolucao (francesa|industrial|russa)|imperio (romano|otomano)|napoleao|hitler|cleopatra|egito antigo|idade media|renascimento|historia (do brasil|mundial|antiga|geral|da arte)|continente|oceano|cordilheira|populacao (do|da|de)|maior (rio|pais|cidade|montanha|oceano|animal|planeta)|menor pais|fronteira|geografia|bandeira (do|da|de))\b/,
  /\b(politica|politico|politicos|eleicao|eleicoes|partido|presidente (do|da|dos) (brasil|eua|estados unidos|franca|russia)|primeiro ministro|governo federal|congresso nacional|senado|camara dos deputados|constituicao federal|ditadura|lula|bolsonaro|trump|biden|putin)\b/,
  // culinária e cotidiano
  /\b(receita de|ingredientes?|como (fazer|preparar|cozinhar|assar) (um |uma |o |a )?(bolo|pao|feijao|arroz|macarrao|pizza|churrasco|cafe|suco|omelete|lasanha|brigadeiro|carne|frango|sopa)|cozinh\w+|sobremesa|tempero|culinaria|restaurante|cardapio|vinho|cerveja|drink|coquetel)\b/,
  // entretenimento, esportes, cultura
  /\b(filmes?|series?|novela|musicas?|cantor|cantora|banda|albuns?|letra da musica|ator|atriz|celebridade|famoso|netflix|spotify|youtube|tiktok|instagram|futebol|campeonato|copa do mundo|olimpiadas?|nba|formula 1|tenis|volei|basquete|anime|romance|poesia|poema|horoscopo|signo|zodiaco|tarot|videogame|video game|playstation|xbox|minecraft|fortnite)\b/,
  // matemática e ciência genéricas
  /\b\d+(\.\d+)?\s*([+\-*/x×÷^])\s*\d+|\b(quanto (e|eh|da|da a soma)|raiz (quadrada|cubica)|equacao|derivada|integral|fatorial|seno|cosseno|tangente|teorema|pitagoras|tabuada|regra de tres|porcentagem de \d|converter (graus|moeda|km|milhas|libras)|fisica quantica|tabela periodica|fotossintese|evolucao das especies|buraco negro)\b/,
  // pedidos criativos ou de tarefas gerais
  /\b(escreva|redija|crie|gere|faca|invente|componha|elabore) (para mim )?(um|uma|o|a|uns|umas)? ?(poema|poesia|musica|historia|conto|texto|redacao|discurso|carta|resumo|resenha|slogan|nome para|piada|roteiro|post|legenda|curriculo|cronograma de estudos|plano de dieta|treino)\b/,
  /\b(traduza|traducao|como se diz .{1,40} em (ingles|espanhol|frances|alemao|italiano|japones)|em ingles|em espanhol|licao de casa|dever de casa|trabalho escolar|vestibular|enem|concurso publico|prova de)\b/,
  // código e tecnologia geral
  /\b(python|javascript|typescript|java script|c\+\+|programa em|codigo em|script em|funcao em|regex|html|css|react|node\.?js|linux|windows 11|como formatar (o )?(computador|pc|celular))\b/,
  // clima, finanças pessoais, saúde, viagem
  /\b(previsao do tempo|vai chover|clima (em|de|na|no)|temperatura (em|de|na|no)|cotacao|dolar|euro hoje|bitcoin|criptomoeda|bolsa de valores|acoes da|investir (em|no|na)|poupanca|tesouro direto|imposto de renda|financiamento de carro|sintomas?|remedio|doenca|medico|dieta|emagrecer|academia|exercicio fisico|gravidez|viagem|hotel|passagem aerea|turismo|ferias em|pontos turisticos)\b/,
  // conversa existencial / opiniões
  /\b(sentido da vida|existe deus|religiao|namorad[oa]|casamento|qual (e )?(o )?seu (filme|time|prato|livro|musica|cor) favorit\w*|voce acredita|sua opiniao sobre|o que voce acha (de|do|da))\b/,
];

/**
 * Pergunta realmente FORA do ACC: tema geral explícito e nenhum termo forte do ACC. Em dúvida → false (segue para o Q&A).
 */
export function isOutOfScope(normalized: string): boolean {
  if (normalized.trim() === "") return false;
  if (ACC_STRONG.test(normalized)) return false;
  return GENERAL_TOPICS.some((pattern) => pattern.test(normalized));
}

export const SCOPE_REPLY_TITLE = "Esse assunto está fora do que eu faço";
export const SCOPE_REPLY =
  "Sou a AXIA, assistente virtual especializada apenas no ACC: eu explico como usar o sistema — alertas, prazos e escalonamento, documentos, permissões, especialistas e a Ajuda. Para esse outro assunto, o melhor é consultar uma fonte adequada. Se tiver uma dúvida sobre o ACC, é só perguntar!";

// ───────── interpretação de contratos, documentos e cláusulas ─────────

const INTERPRETIVE_VERB =
  /\b(interprete|interpretar|interpretacao|analise|analisar|resuma|resumir|resumo|explique|explicar|o que diz|o que significa|o que quer dizer|e valida?|e valido|esta correta|esta correto|revise|revisar|confira|conferir|comente|compare|comparar|extraia|extrair|liste as clausulas|quais as obrigacoes|qual a multa|qual o valor|quando vence|e abusiv[ao])\b/;
const DOCUMENT_NOUN = /\b(contrato|contratos|clausula|clausulas|aditivo|aditivos|minuta|proposta comercial|edital|termo aditivo|ata|medicao|documento|documentos|pdf)\b/;
const INSTANCE_CUE =
  /\b(clausula \d|clausula [a-z]\b|(esse|este|essa|esta|nesse|neste|nessa|nesta|desse|deste|dessa|desta|meu|minha|nosso|nossa|o|a|do|da|no|na) (contrato|aditivo|documento|edital|minuta|clausula|pdf|ata|medicao)|(contrato|aditivo) (n|no|numero|da obra|do cliente|com a)|anexei|enviei|subi|carreguei|que enviei)\b/;

/** Pedido para o ACC/AXIA interpretar um contrato, documento ou cláusula CONCRETOS (a AXIA não lê nem interpreta). */
export function isContractInterpretation(normalized: string): boolean {
  if (/\bcomo\b/.test(normalized) && !/\b(clausula \d|esse contrato|este contrato|meu contrato)\b/.test(normalized)) return false;
  return INTERPRETIVE_VERB.test(normalized) && DOCUMENT_NOUN.test(normalized) && INSTANCE_CUE.test(normalized);
}

export const SPECIALIST_ENTRY_ID = "encaminha-especialista";
export const SPECIALIST_TITLE = "Para interpretar contratos e documentos, use os especialistas";
export const SPECIALIST_SUMMARY =
  "A AXIA não lê nem interpreta contratos, documentos ou cláusulas: ela só explica como usar o ACC. Para esse tipo de análise, use os especialistas de IA do ACC (tela Experts IA, ou a ação ESPECIALISTA do alerta). Eles trabalham com as suas permissões na obra e toda resposta deles exige revisão humana.";
export const SPECIALIST_SECTION = "8.1; 8.3";
