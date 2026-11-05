# AXIA — camada de conversa natural (prévia)

Estado: implementada, **IA desligada por padrão** (`AXIA_CHAT_PROVIDER` ausente = `off`). Nada muda em produção até a ativação, que é uma decisão separada.

## O que a IA faz e o que não faz

| A IA faz | A IA não faz |
|---|---|
| Interpreta a mensagem: erros de digitação, variações de linguagem, perguntas compostas | Escrever regras, prazos, permissões, funcionalidades, perfis ou estados de rotina |
| Reconhece conversa social e responde com cordialidade (frases curtas) | Responder as 14 perguntas/tópicos das 18 entradas em revisão |
| Escolhe de 1 a 3 entradas **aprovadas** do catálogo | Criar citação do manual (a seção vem da entrada) |
| Faz UMA pergunta curta de esclarecimento ("não foi isso que perguntei") | Ler dados de obra, documentos ou do usuário |

O corpo de toda resposta operacional é o **texto aprovado da entrada**, palavra por palavra. O servidor descarta qualquer texto operacional vindo da IA: respostas sociais com número, link, termo operacional (prazo, alerta, perfil…) ou identidade/experiência humana são trocadas pelo texto fixo; ids fora do catálogo são ignorados; plano ilegível cai na base.

## Fluxo (`apps/web/lib/assistant/chat-orchestrator.ts`)

1. Bloqueios **sem IA**: pergunta de entrada em revisão (`PENDING_REVIEW_PATTERNS`) → encaminhamento (Ajuda + ADMIN em texto); pergunta que depende de obra na tela "Selecione um projeto" → orientação para escolher a obra.
2. Se a IA está ligada, dentro do limite do usuário e sem falha recente → um único pedido ao provedor (saída estruturada obrigatória).
3. O plano é validado e montado com texto aprovado. Se qualquer passo falhar → caminho determinístico (Q&A aprovado + saudações básicas).

Social: saudação, agradecimento, despedida, brincadeira, idade, identidade e capacidades **sem citação do manual e sem ADMIN**. "Bom dia! Como vejo os alertas?" → "Bom dia!" + resposta aprovada, com links da obra da sessão. Pergunta composta → um bloco por assunto, cada um com a sua seção.

## Continuidade

"Não foi isso que perguntei" → pergunta curta de esclarecimento. Se o turno anterior já não tinha resposta aprovada (ou foi outro esclarecimento), a AXIA oferece **Ajuda + "Falar com o ADMIN"** (texto; canal oficial segue indefinido). Preservados: "Isso não respondeu à minha pergunta", link da Ajuda e orientação ao ADMIN.

## O que é enviado ao provedor de IA

Uma única mensagem de sistema + uma de usuário (`buildSystemPrompt`, `buildUserMessage`):

- **Sistema (fixo):** identidade e regras da AXIA, 14 títulos de tópicos em revisão e o catálogo (`id | título | até 5 palavras-chave` das 42 entradas). Nenhum corpo de resposta.
- **Usuário:** a mensagem atual (≤ 500 caracteres) e, se houver, até **2** perguntas anteriores da conversa (≤ 200 caracteres cada) com o **título** do assunto respondido.
- **Nunca enviados:** id da obra, id/e-mail do usuário, cookies, credenciais, documentos, dados de obra, texto das respostas.

Contexto e isolamento: o histórico fica **só no navegador** (estado do componente, por obra) e viaja a cada pergunta; o servidor **não guarda** conversa, então não há como um usuário ou projeto enxergar o contexto de outro. O servidor re-saneia o histórico (máx. 2 turnos, ids só da base).

## Limites e falhas

| Controle | Valor |
|---|---|
| Entrada | mensagem ≤ 500 caracteres; contexto ≤ 2 × 200 |
| Saída | `max_tokens` 350, ferramenta estruturada obrigatória |
| Tempo | 8 s (com `Promise.race`; sem nova tentativa — `maxRetries: 0`) |
| Frequência | 20 perguntas/min por usuário (existente) + 8 chamadas de IA/min; acima disso segue só com a base |
| Falha do provedor | disjuntor de 60 s por instância; Q&A e saudações básicas continuam |
| Registro | só contagem de tokens (`[axia-conversa] provedor=… entrada=… saida=…`), nunca conteúdo |

## Provedor e modelo

Reaproveita a integração Anthropic existente (`@anthropic-ai/sdk`, `ANTHROPIC_API_KEY` só no servidor, mesmo padrão de saída estruturada dos especialistas). **Modelo escolhido: Claude Haiku 5.5 (`claude-haiku-5-5`)** — a tarefa é classificar e pedir esclarecimento, não raciocinar; é o modelo mais barato da família. Configuração à parte da dos especialistas: `AXIA_CHAT_MODEL`. Sem chave ou modelo, fail closed: a AXIA volta ao modo determinístico.

Variáveis: `AXIA_CHAT_PROVIDER=off|simulated|anthropic` (`simulated` só fora da Vercel — prévia e testes), `ANTHROPIC_API_KEY`, `AXIA_CHAT_MODEL`.

## Estimativa de custo por 1.000 conversas curtas

Preços oficiais (platform.claude.com/docs/en/about-claude/pricing, consultado em 05/11/2026): Haiku 5.5 — entrada **US$ 0,10 / MTok**, saída **US$ 0,50 / MTok** (prompts até 100 mil tokens).

Premissas: 1 chamada de IA por mensagem; prompt fixo medido ≈ 8.700 caracteres (≈ 2.650 tokens a ~3,3 caracteres/token em português) + definição da ferramenta e mensagem do usuário ≈ 700 tokens → **≈ 3.400 tokens de entrada por chamada**; saída estruturada ≈ 120 tokens; **sem cache de prompt** (o prefixo é menor que o mínimo cacheável do modelo; seria um ganho adicional).

| Cenário | Mensagens/conversa | Entrada/chamada | Saída/chamada | Custo por 1.000 conversas |
|---|---|---|---|---|
| Enxuto | 2 | 3.000 | 80 | **≈ US$ 0,68** |
| **Base (curta)** | **3** | **3.400** | **120** | **≈ US$ 1,20** |
| Conservador | 5 | 4.000 | 250 | **≈ US$ 2,63** |

Cálculo do cenário base: 3 × 3.400 = 10.200 tokens × US$ 0,10/MTok = US$ 0,00102; 3 × 120 = 360 tokens × US$ 0,50/MTok = US$ 0,00018; total US$ 0,0012 por conversa. Conversão para reais: multiplicar pelo câmbio do dia. Mensagens bloqueadas antes da IA (pendentes, dependência de obra), acima do limite ou com falha **não** geram custo. Os valores reais serão conferidos pelos tokens registrados no log e pela fatura.

## Validação

`scripts/test-axia-conversa.mjs` (65 verificações, sem rede): cumprimentos, idade, identidade, agradecimentos, brincadeira, erros de digitação, saudação + dúvida, pergunta composta, pedido de esclarecimento (e repetição → Ajuda/ADMIN), perguntas pendentes (com e sem IA, inclusive se o "modelo" escolher outra entrada), tentativas de induzir regra inventada, planos maliciosos do provedor, falha/limite/tempo do provedor, conteúdo das mensagens enviadas, formato da chamada Anthropic (cliente falso) e isolamento entre projetos. A validação com o **modelo real** depende de ativar a chave/modelo (não feita).

## Para ativar em produção (depois da aprovação)

1. Vercel: `AXIA_CHAT_PROVIDER=anthropic`, `AXIA_CHAT_MODEL=claude-haiku-5-5` (a `ANTHROPIC_API_KEY` dos especialistas é reutilizada).
2. Conferir os logs de tokens nas primeiras conversas e comparar com a estimativa.
3. Reverter: remover `AXIA_CHAT_PROVIDER` (ou `off`) — a AXIA volta ao modo determinístico sem novo deploy de código.
