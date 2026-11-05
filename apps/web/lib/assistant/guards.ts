// Guardas determinísticas da AXIA (puras, sem importações): rodam ANTES de qualquer IA, com ou sem provedor.
//
//   1. Prazos por grau de alerta (crítico, alto, médio, baixo) → consultam as regras APROVADAS (E2 e R7).
//   2. Pergunta sobre CASO ESPECÍFICO (contrato, cláusula, alerta ou obra concretos) → a AXIA explica só a regra geral e avisa
//      que não lê dados nem analisa o caso.
//   3. Tentativa de contornar permissões ou de obter dados (outra obra, usuários, senhas) → resposta fixa de limite.
//
// Todos recebem texto NORMALIZADO (minúsculas, sem acento, sem pontuação; ver normalizeText em answer.ts).

// ───────── 1. prazos por grau ─────────

const GRADE_WORD = /\b(critic[oa]s?|alt[oa]s?|medi[oa]s?|baix[oa]s?)\b/;
const DEADLINE_WORD = /\b(prazos?|sla|quanto tempo|em quanto tempo|tempo (para|pra)|quando (o|um|esse) (alerta|aviso)? ?(sobe|escala)|assumir|agir)\b/;
const EVERY_GRADE = /\b(cada grau|por grau|todos os graus|cada nivel|todos os niveis|cada tipo de alerta)\b/;
/** Feriado e fim de semana são do tópico em revisão E6/R6: não entram aqui. */
const HOLIDAY_TOPIC = /\b(feriados?|fins? de semana|sabados?|domingos?)\b/;
/** Configuração da matriz é a entrada em revisão E10. */
const MATRIX_CONFIG = /\b(configur\w*|onde (se )?(muda|altera|edita|cadastra)|alterar|editar|mudar)\b.*\b(matriz|sla)\b|\bmatriz de sla\b/;

/** ids das entradas aprovadas que respondem prazos por grau: E2 (marcos e totais) e R7 (médio e baixo). */
export function gradeDeadlineEntryIds(normalized: string): string[] | null {
  if (HOLIDAY_TOPIC.test(normalized) || MATRIX_CONFIG.test(normalized)) return null;
  if (!DEADLINE_WORD.test(normalized)) return null;
  const grade = GRADE_WORD.exec(normalized);
  const every = EVERY_GRADE.test(normalized);
  if (!grade && !every) return null;
  // Não captura prazos de outros assuntos ("prazo do CNO", "prazo da providência", "prazo de entrega").
  if (/\b(cno|providencias?|documentos?|pagamentos?|medicao|medicoes|licenca|entrega|contratual|aditivos?)\b/.test(normalized)) return null;
  const word = grade ? grade[1] : "";
  const mediumOrLow = /^(medi|baix)/.test(word);
  const highOrCritical = /^(critic|alt)/.test(word);
  if (every) return ["qa-E2", "qa-R7"];
  if (mediumOrLow) return ["qa-R7", "qa-E2"];
  if (highOrCritical) return ["qa-E2"];
  return null;
}

// ───────── 2. caso específico ─────────

const CASE_SPECIFIC =
  /\b(meu|minha|nosso|nossa|meus|minhas) (contrato|contratos|aditivo|aditivos|clausula|clausulas|alerta|alertas|caso|obra|projeto|cliente|prazo|pedido|solicitacao|medicao)\b|\b(esse|este|essa|esta|nesse|neste|nessa|nesta|desse|deste|dessa|desta) (alerta|contrato|aditivo|caso|evento|risco|clausula|obra|projeto|pedido|medicao)\b|\bclausula \d|\b(contrato|aditivo) (n|no|nr|numero|da obra|do cliente|com a)\b|\bno meu caso\b|\bobra (weg|newport|0079|teste)\b|\b(posso|devo|preciso|tenho que) .*\b(rescindir|multar|cobrar|notificar|pagar|aprovar|assinar)\b/;
export function isCaseSpecific(normalized: string): boolean {
  return CASE_SPECIFIC.test(normalized);
}

const DECISION_VERBS = /\b(posso|devo|preciso|tenho que|tenho direito|consigo|vale a pena|e valido|e legal|cabe|podemos|devemos)\b/;
/** Pedido de decisão/aconselhamento sobre um caso concreto: a AXIA não tem regra aprovada nem lê o caso. */
export function isCaseAdvice(normalized: string): boolean {
  return isCaseSpecific(normalized) && DECISION_VERBS.test(normalized) && !/\bcomo\b/.test(normalized);
}

export const CASE_NOTICE =
  "Sua pergunta envolve um caso específico. A AXIA explica apenas as regras gerais aprovadas: ela não lê dados da obra, do contrato nem do alerta e não analisa o caso. Para isso, use a ação ESPECIALISTA do alerta ou a tela Experts IA, conforme o seu perfil na obra.";

// ───────── 3. contornar permissões / obter dados ─────────

const BYPASS =
  /\b(ignore|ignora|ignorar|desconsidere|desconsiderar|esqueca|esquecer|burlar|burle|contornar|contorne|driblar|desative|desativar|desligue)\b.*\b(permiss\w*|regras?|restric\w*|instruc\w*|seguranca|bloqueio\w*|limites?|perfil|perfis|acesso|acessos|rls|login)\b|\b(sem|mesmo sem|apesar de nao ter) (ter )?(permissao|autorizacao|acesso|login)\b|\bme (de|da|conceda|conceder|libere|liberar|promova|promover)\b.*\b(acesso|permissao|admin|administrador)\b|\b(trate-?me como|considere que sou|finja que sou|aja como|atue como|simule) .*\b(admin|administrador|gerente|diretor|dono|ceo|desenvolvedor|root)\b|\b(sou|eu sou)\b.*\b(admin|administrador|diretor|dono|ceo)\b.*\b(mostre|liste|libere|me de|abra|exiba|apague|delete|altere|ignore)\b|\b(modo desenvolvedor|jailbreak|prompt do sistema|instrucoes do sistema|mostre (o )?seu prompt)\b|\bfinja que .*\b(perfil|leitura|colaborador|permissao)\b/;
const DATA_REQUEST =
  /\b(mostre|mostra|mostrar|liste|listar|exiba|exibir|me (passe|envie|mande|de)|quais sao|qual (e|eh) (o|a)|abra|abrir|leia|ler)\b.*\b(contratos?|aditivos?|usuarios?|e-?mails?|senhas?|tokens?|chaves?|documentos?|valores?|financeiro|medicoes|pagamentos?|dados)\b.*\b(outra obra|outras obras|outro projeto|todas as obras|todos os projetos|de todos|do cliente|da obra \w+|obra \w+|dos usuarios|da empresa)\b|\b(senha|token|chave de api|api key|credencial\w*)\b.*\b(de|do|da)\b.*\b(admin|administrador|usuario|sistema|banco|servidor)\b/;

export function isPermissionBypass(normalized: string): boolean {
  return BYPASS.test(normalized) || DATA_REQUEST.test(normalized);
}

export const BOUNDARY_ENTRY_ID = "limite-permissoes";
export const BOUNDARY_TITLE = "A AXIA não altera permissões nem mostra dados";
export const BOUNDARY_SUMMARY =
  "A AXIA só orienta sobre como usar o ACC: ela não lê nem mostra dados de obras, contratos ou usuários, não altera nada e não concede, muda ou contorna permissões. O que você vê e pode fazer depende do seu perfil na obra, definido pelo Administrador na tela Usuários, e vale para qualquer pergunta.";
export const BOUNDARY_SECTION = "4.1 (fluxo principal, passos 1 a 6; permissões)";
