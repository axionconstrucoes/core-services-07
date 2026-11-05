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

`scripts/test-axia-conversa.mjs` (95 verificações, sem rede), `scripts/test-axia-budget.mjs` (57, PGlite) e `scripts/test-axia-budget-replay.mjs` (18, schema completo): cumprimentos, idade, identidade, agradecimentos, brincadeira, erros de digitação, saudação + dúvida, pergunta composta, pedido de esclarecimento (e repetição → Ajuda/ADMIN), perguntas pendentes (com e sem IA, inclusive se o "modelo" escolher outra entrada), tentativas de induzir regra inventada, planos maliciosos do provedor, falha/limite/tempo do provedor, conteúdo das mensagens enviadas, formato da chamada Anthropic (cliente falso) e isolamento entre projetos. A validação com o **modelo real** depende de ativar a chave/modelo (não feita).

## Guardas determinísticas (rodam antes da IA, com ou sem provedor) — `apps/web/lib/assistant/guards.ts`

| Guarda | Comportamento |
|---|---|
| **Prazos por grau** (crítico, alto, médio, baixo, "cada grau", SLA do alerta) | Consultam as regras **aprovadas**: E2 (marcos e totais por grau) e R7 (médio e baixo), com a seção do manual. Não chamam a IA. Prazos de outros assuntos (CNO, providência, entrega, pagamento) não entram. Feriado/fim de semana (E6) e configuração da Matriz de SLA (E10) seguem em revisão. |
| **Caso específico** ("no meu contrato…", "neste alerta…", "cláusula 12", "obra WEG") | Regra geral aprovada + aviso: a AXIA **não lê dados da obra, do contrato nem do alerta e não analisa o caso**; link para Experts IA (ação ESPECIALISTA, conforme o perfil). Pedido de **decisão** sobre o caso ("posso rescindir…?") sem regra aprovada → encaminhamento (Ajuda + ADMIN em texto), nunca opinião. |
| **Contornar permissões / obter dados** ("ignore as permissões", "me dê acesso", "finja que sou o diretor", "mostre os contratos de outra obra", senhas, prompt do sistema) | Resposta fixa de limite (A AXIA não altera permissões nem mostra dados; o acesso é do Administrador, em Usuários). A IA **nem é chamada**. Dúvidas legítimas ("como dou acesso a um usuário?", "sou administrador, como cadastro um usuário?") não são bloqueadas. |

Conversa social **não executa nem altera nada**: a camada de conversa não importa Supabase, não faz `fetch` nem ações de servidor (verificado por teste); o texto social é fixo ou validado (sem número, link, termo operacional ou identidade humana). "Oi! Apague os documentos" recebe só a orientação de que a AXIA não altera dados.

Preservados: autenticação (as duas rotas exigem login), RLS e isolamento entre obras (a rota por obra continua usando `getProject`, que depende da sessão e da RLS; a IA nunca recebe id de obra nem dados), permissões e rotinas de alertas (nenhum arquivo dessas áreas foi tocado).

## Limites de frequência, tokens e gasto

| Controle | Valor |
|---|---|
| Perguntas por usuário | 20/min (existente) |
| Chamadas de IA por usuário | 8/min + **100/dia** (`AXIA_CHAT_USER_DAILY_CALLS`, global e concorrente) |
| Entrada / saída por chamada | mensagem ≤ 500 caracteres + 2 turnos ≤ 200; `max_tokens` 350 |
| Tempo | 8 s, sem nova tentativa |
| **Gasto** | teto diário **GLOBAL** (`AXIA_CHAT_DAILY_BUDGET_USD`, padrão **US$ 1,00**) no Postgres do ACC, com reserva atômica (abaixo) |
| Falha do provedor | disjuntor de 60 s por instância; Q&A aprovado e saudações básicas continuam |

Os limites de 20/min e 8/min são em memória por instância (conter cliques e abuso); **o que garante o dinheiro é o orçamento global em SQL**. Configure também o limite de gasto e os alertas na conta Anthropic (camada independente).

## Orçamento global e concorrente (PR #135, pendência 1)

Infraestrutura já existente do ACC (Postgres/Supabase), **sem serviço novo**: migration `supabase/migrations/20261105150000_axia_chat_budget.sql` (**criada, NÃO aplicada em nenhum banco remoto**).

- **Reserva atômica:** `axia_chat_reserve` incrementa o gasto diário e a chamada do usuário com `UPDATE … WHERE gasto + reserva <= teto` / `calls < limite` — a condição e o incremento acontecem na mesma instrução, sob o bloqueio da linha; pedidos simultâneos de qualquer instância se serializam e **nunca passam do teto**. Se o teto nega, a chamada do usuário é desfeita (compensação na mesma transação).
- **Pior caso:** reserva de 8.000 tokens de entrada + 350 de saída (US$ 0,000975) antes de falar com o provedor; o custo real (tokens da API) substitui a reserva. Se a resposta vier sem `usage`, a reserva do pior caso permanece.
- **Fail closed:** sem migration, sem `SUPABASE_SECRET_KEY` ou banco fora do ar, **a IA não é chamada** (a AXIA responde pela base). Nunca há queda para contador em memória em produção.
- **Acesso:** só `service_role` (RLS ligada e sem política, **sem `FORCE`**: com `FORCE` o dono das funções `SECURITY DEFINER`, se não tiver `BYPASSRLS`, também seria barrado e as funções deixariam de funcionar — achado da auditoria, reproduzido em teste; anon/authenticated não têm privilégio algum; funções `SECURITY DEFINER` com `search_path` vazio, `EXECUTE` revogado de `public/anon/authenticated`). Só guarda o uuid do usuário e valores: **nenhuma pergunta nem resposta**. O código usa o cliente de serviço apenas para essas seis funções (exceção deliberada à regra "admin client só em jobs": o RPC não toca dado de usuário, e o cliente é criado a cada chamada, sem cache de credencial).
- **Expiração/recuperação:** o contador é por dia UTC (zera sozinho). `axia_chat_reconcile` (e a própria reserva, de forma oportunista) converte reservas "reserved" paradas há mais de 15 min em "uncertain" — o total já as conta no pior caso.

## Timeout e resultado incerto (pendência 2)

Contabilidade **conservadora**: só se devolve orçamento quando é certo que não houve cobrança.

| Resultado | Quando | Contabilidade |
|---|---|---|
| sucesso | resposta recebida | reserva → custo real (`settle`, idempotente) |
| `charged` | resposta truncada, recusa, sem ferramenta | cobra os tokens reais; **não devolve** |
| `not_charged` | HTTP 400/401/403/404/413/422/429 (rejeitado antes de executar) | `release`: devolve reserva e chamada |
| **`uncertain`** | **timeout**, queda de rede, 5xx/529, erro desconhecido | **a reserva do pior caso PERMANECE** (`mark_uncertain`); `release` é ignorado para incertas |
| conclusão tardia | a chamada do timeout ainda termina | `late_settle` ajusta o total (para menos ou para mais) uma única vez |

Consequência intencional: chamadas incertas consomem teto; duas incertas com teto de dois pior-casos bloqueiam a terceira.

## Cache do provedor e rotação de credencial (pendência 3)

A chave do cache é `modo:modelo:impressão-digital` (SHA-256 truncado da `ANTHROPIC_API_KEY`, só em memória, nunca em log ou erro). Trocar a chave ou o modelo no mesmo processo recria o cliente imediatamente; desligar (`off`) descarta o provedor e a credencial em memória. O cliente de serviço do orçamento é recriado a cada chamada ao banco. Teste: chave nova → provedor novo; chave antiga não é reaproveitada; nenhuma chave/fingerprint aparece em log.

## Teste real controlado (US$ 0,20)

`npm run test:live-axia` (`scripts/test-axia-live.mjs`; **fora** de todas as suítes de rotina):

- Só roda com `ACC_ALLOW_LIVE_AI_TESTS=1` e `ANTHROPIC_API_KEY`; sem isso, nenhuma chamada.
- Modelo **fixo `claude-haiku-5-5`** (outro valor é recusado).
- Teto de **US$ 0,20** (a variável só pode reduzir); reserva o pior caso antes de cada chamada e para ao atingir o teto.
- 28 casos: saudações, identidade, idade, agradecimento, brincadeira, sentimentos, perguntas compostas, erros de digitação, prazos por grau, dúvidas contratuais (caso específico), tentativas de contornar permissões e de vazar o prompt, indução de regra inventada, pendentes (inclusive paráfrase), esclarecimento e fora do escopo.
- O relatório imprime só id do caso, caminho (IA/base), tipo, entrada escolhida, tokens e custo — **nunca chave, prompt ou texto de resposta**.
- `ACC_LIVE_DRYRUN=1` faz um ensaio sem rede e sem custo com o simulador.

## Custos — estimativa × teste real

Teste real controlado (registrado por Reynaldo no PR #135): `claude-haiku-5-5`, **28/28 casos OK, 21 chamadas, custo real US$ 0,011818** (teto do teste: US$ 0,20). Os 7 casos restantes foram resolvidos pelas guardas determinísticas, sem custo.

| Medida | Valor |
|---|---|
| Custo médio por chamada de IA | **US$ 0,000563** (US$ 0,011818 ÷ 21) — maior que a estimativa inicial (US$ 0,000400): o prompt fixo real tem ≈ 5 mil tokens de entrada, não 3.400; por isso a reserva do pior caso subiu para 8.000 tokens |
| Conversa curta (3 mensagens, 3 chamadas) | ≈ US$ 0,0017 |
| **1.000 conversas curtas** | **≈ US$ 1,69** (teto da estimativa: sem descontar as perguntas resolvidas por guardas) |
| Projeção mensal | 500 conversas ≈ US$ 0,85 · 2.000 ≈ US$ 3,40 · 10.000 ≈ US$ 17 |
| Teto diário configurado | US$ 1,00 (≈ 1.700 chamadas/dia) — gasto máximo do mês ≈ US$ 30 se o teto fosse atingido todos os dias |

Otimização possível (não implementada): cache de prompt (o prefixo fixo ≈ 5 mil tokens; leitura de cache a US$ 0,01/MTok) reduziria o custo de entrada em até ~90%.

## Evidências de validação (PR #135, comentário de revisão)

| Pendência | Evidência |
|---|---|
| 1. Orçamento global e concorrente | `scripts/test-axia-budget.mjs`: a migration roda em PostgreSQL de verdade (PGlite); 300 pedidos simultâneos de 30 usuários contra um teto de 40 reservas → **exatamente 40 concedidas**, nenhum usuário acima de 3, soma por usuário = total; 10 settles simultâneos aplicam **uma** vez; 200 conversas simultâneas ponta a ponta contra teto de 25 → **25 chamadas à IA**, 175 pela base; anon/authenticated negados (10/10); migration sem pergunta/resposta. *Limite honesto:* o PGlite serializa as consultas; a atomicidade sob concorrência real é a do `UPDATE … WHERE` condicional do PostgreSQL (READ COMMITTED reavalia o predicado após o bloqueio da linha). |
| 2. Timeout / resultado incerto | Mesmo arquivo, em memória **e** SQL: timeout sem conclusão mantém o pior caso; conclusão tardia ajusta uma vez; `not_charged` devolve; `charged` cobra tokens reais; erro desconhecido = incerto; duas incertas esgotam o teto e a terceira não chama a IA; `release` em incerta é ignorado. Provedor real com cliente falso: timeout → `uncertain` com `late`; 429/400/401 → `not_charged`; 500/529/rede → `uncertain`; truncada/sem plano → `charged`. |
| 3. Cache do provedor | Chave nova → provedor novo com a chave nova; chave antiga não é reaproveitada; troca de modelo invalida; `off` descarta; nenhuma chave ou impressão digital em log. |
| 4. E2E autenticado | `scripts/e2e-axia-preview.mjs` na prévia, Chrome autenticado, **22/22 com IA simulada e 22/22 com IA desligada (fallback)**: seleção de projetos e obra; obra sem participação → 404 (RLS); id inválido → 404; entrada > 500 caracteres → 400; histórico malformado saneado; cada obra só devolve links da própria obra; 25 pedidos simultâneos do mesmo usuário → 20 × 200 (8 com IA, 12 pela base) e 5 × 429, nenhum 5xx; mobile 390×844 (atalho 54×48 px, conversa cabe na tela, sem rolagem horizontal). Autenticação sem sessão: as duas rotas exigem `auth.getUser()` (verificado por teste). |

## Auditoria final e validação em PostgreSQL descartável (implantação controlada)

**Auditoria da migration** (`20261105150000_axia_chat_budget.sql`) — dois achados corrigidos antes do merge:

1. **`FORCE ROW LEVEL SECURITY` quebraria as funções:** com um dono sem `BYPASSRLS` (possível no Supabase), as seis funções `SECURITY DEFINER` falhavam com "new row violates row-level security policy". Removido o `FORCE` (RLS segue ligada, sem política, e anon/authenticated nem têm privilégio).
2. **Ordem de bloqueio:** `axia_chat_release` bloqueava global → usuário, enquanto `axia_chat_reserve` bloqueia usuário → global (risco de deadlock). Agora ambas bloqueiam usuário primeiro.

**`scripts/test-axia-budget-replay.mjs`** (Docker indisponível neste computador — sem WSL; usado PostgreSQL 17 real via PGlite, em memória): reaplica as **127 migrations anteriores em ordem** (stubs mínimos de auth/storage; `pgcrypto` removido, `gen_random_uuid` é nativo) e aplica a nova como dono **sem BYPASSRLS**. Resultado: 18/18 —
- impressão digital do schema **idêntica antes × depois** (1.789 colunas, 575 tabelas/objetos, 159 políticas, 3.222 privilégios, 211 funções, 69 gatilhos, 447 índices, 125 contagens de linhas): a migration **não altera nenhuma estrutura nem dado existente**; cria somente 3 tabelas `axia_chat_*` e 6 funções;
- 6 funções `SECURITY DEFINER` com `search_path` vazio; `EXECUTE` negado a PUBLIC/anon/authenticated e concedido só ao `service_role`; tabelas com RLS ligada e sem privilégio para anon/authenticated;
- **16/16 tentativas de anon e authenticated (tabela + 6 funções) negadas**;
- concorrência com schema completo (400 pedidos, 40 usuários, limite 4/usuário, teto de 100 reservas → exatamente 100 concedidas, nenhum usuário acima de 4), liquidação idempotente (2 settles simultâneos por reserva), incerta não devolvida, conclusão tardia uma vez, release de não cobrada, reconcile e parâmetros inválidos.

Limites do substituto: não é o Supabase real (auth/storage simplificados) e o PGlite serializa as consultas; a atomicidade sob concorrência real é a do `UPDATE` condicional do PostgreSQL. **Recomenda-se repetir no banco descartável Docker/Supabase em um computador com Docker antes de aplicar em produção** (`scripts/sql/replay-pending-migrations-disposable.sh`).

**Regressão com a IA desligada** (`AXIA_CHAT_PROVIDER` ausente): 1.179 perguntas geradas do catálogo comparadas ao Q&A da `main` (`4077ce0`) — 1.165 idênticas; as 14 diferenças são intencionais: 11 de identidade/capacidades da AXIA ("quem é você", "o que você faz", "seu nome" → resposta social em vez do texto antigo "vera") e 3 de prazo por grau (R7 no lugar do encaminhamento). O teste da suíte mantém essa garantia.

## Para ativar em produção (depois da aprovação — NÃO feito)

1. **Aplicar a migration** `20261105150000_axia_chat_budget.sql` (decisão e execução suas; não foi aplicada em nenhum banco remoto). Sem ela a IA permanece desligada de fato (fail closed).
2. Vercel: `AXIA_CHAT_PROVIDER=anthropic`, `AXIA_CHAT_MODEL=claude-haiku-5-5` (a `ANTHROPIC_API_KEY` dos especialistas é reutilizada); opcionalmente `AXIA_CHAT_DAILY_BUDGET_USD` e `AXIA_CHAT_USER_DAILY_CALLS`.
3. Configurar limite de gasto e alertas na conta Anthropic (camada independente).
4. Conferir `select * from axia_chat_budget_day` e os logs de tokens nas primeiras conversas.
5. Reverter: remover `AXIA_CHAT_PROVIDER` (ou `off`) — a AXIA volta ao modo determinístico sem novo deploy de código.
