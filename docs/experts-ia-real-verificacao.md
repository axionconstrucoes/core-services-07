# Fase 7 / H6c — IA real dos 7 Experts: configuração, verificação por ambiente e como homologar

Data: 21/11/2026 · Sem chamada real de IA (guarda `block-live-ai`) · Só NOMES de variáveis; nenhum valor foi lido ou impresso.
Teste: `scripts/test-f7-experts-ia-real.mjs` (10 verificações) + `scripts/test-f6-h2c-experts-qualidade.mjs`.

## 1. Configuração no código (verificado)

Resolução por Expert (`apps/web/lib/ai/providers/resolve-provider-for-expert.ts`): variável do Expert > `AXION_AI_PROVIDER` > `fake`.
Valores aceitos: `fake` e `anthropic`. `openai`/`gemini` falham explicitamente (não implementados). Anthropic sem configuração completa
FALHA FECHADO (nunca cai em fake). Leitura só no servidor (`process.env` em módulos `lib/ai/providers/*`; nenhuma `NEXT_PUBLIC_*` de IA).

| Expert | Variável específica | Funcionalidades que dependem |
| --- | --- | --- |
| commercial-director | `AXION_AI_PROVIDER_COMMERCIAL_DIRECTOR` | Consulta Experts IA (comercial e estratégia), curadoria, consulta do alerta |
| esg-director | `AXION_AI_PROVIDER_ESG_DIRECTOR` | Consulta ESG/SSMA, ESPECIALISTA do alerta |
| ceo | `AXION_AI_PROVIDER_CEO` | Consulta CEO IA, consolidação da curadoria executiva |
| legal-consultant | `AXION_AI_PROVIDER_LEGAL_CONSULTANT` | Consulta Jurídico (`/juridico`, timeout longo), confronto de fonte do cliente (aditivos), seguros/garantias |
| planning-director | `AXION_AI_PROVIDER_PLANNING_DIRECTOR` | Consulta Planejamento/cronograma |
| engineering-director | `AXION_AI_PROVIDER_ENGINEERING_DIRECTOR` | Consulta Engenharia |
| quality-analyst | `AXION_AI_PROVIDER_QUALITY_ANALYST` | Consulta Qualidade/Garantias, análise de qualidade, ESPECIALISTA por e-mail de área Qualidade |

Variáveis comuns do provedor real (`anthropic-config.ts`): `AXION_AI_PROVIDER` (default global), `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL`
(obrigatórias), `ANTHROPIC_MAX_TOKENS` (padrão 4096) e `ANTHROPIC_TIMEOUT_MS` (padrão 180000) opcionais. Todos os caminhos (telas de
consulta, ESPECIALISTA por e-mail/ciclo, curadoria CEO, análise de qualidade, jurídico) passam por `withQuotaGate`/`gatedProviderForExpert`
(reserva ANTES da chamada). A AXIA (assistente de uso) usa outro conjunto (`AXIA_CHAT_*`) e NÃO é Expert.

## 2. Metadados por ambiente (sem valores)

Legenda: PRESENTE (nome visto) / AUSENTE (lista completa sem o nome) / NÃO VERIFICADO.

| Ambiente | Resultado |
| --- | --- |
| `.env.local` do repo principal (raiz e `apps/web`) | AUSENTE para `AXION_AI_PROVIDER*`, `ANTHROPIC_*`, `AXIA_*`. Vale só para a máquina local; não generalizar. |
| Vercel, projeto `axion-contract-intelligence-5d3g` (prj_n9RS…), **production** | `AXION_AI_PROVIDER` PRESENTE (sensível, valor não lido); `ANTHROPIC_API_KEY` PRESENTE; `ANTHROPIC_MODEL` PRESENTE; `ANTHROPIC_MAX_TOKENS` PRESENTE; `ANTHROPIC_TIMEOUT_MS` AUSENTE (usa padrão 180 s); as 7 `AXION_AI_PROVIDER_*` AUSENTES (todos os Experts herdam `AXION_AI_PROVIDER`). Também PRESENTES: `AXIA_CHAT_PROVIDER`, `AXIA_CHAT_MODEL`, `AXIA_CHAT_DAILY_BUDGET_USD`, `AXIA_CHAT_USER_DAILY_CALLS`, `AXIA_CHAT_ACCESS`. Lista completa lida em 21/11/2026 (1 consulta, sem decriptar). |
| Vercel, mesmo projeto, **preview** | Só `CONSTRUMANAGER_*` apareceram: nenhuma variável de IA em preview (AUSENTE). |
| Vercel, projeto `axion-contract-intelligence` (prj_BZjt…) | Lista vazia (0 variáveis) — AUSENTE (verificado na Fase 6/H2c; não reconsultado). |
| Supabase Edge Functions (operacional) | `list_edge_functions` devolveu 0 funções: não há função de IA ali. Nomes de secrets de função: sem ferramenta de leitura, NÃO VERIFICADO. |
| GitHub Secrets/Variables (workers) | NÃO VERIFICADO (inacessível). Conferir em Settings → Secrets and variables → Actions: `AXION_AI_PROVIDER*`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` nos workflows que rodam o ciclo ESPECIALISTA. |

**O que isto permite e NÃO permite afirmar.** `AXION_AI_PROVIDER` existe em produção Vercel, mas é "sensível": o valor NÃO foi lido. Portanto
NÃO se sabe se está `fake` ou `anthropic`. Se for `anthropic`, as quatro variáveis necessárias estão presentes e os 7 Experts operariam com
IA real (todos pelo default global, nenhum isolado). **Ação do responsável:** abrir a tela Experts IA em produção (ela mostra por Expert
"SIMULADA" ou "IA real configurada", calculado no servidor) ou ler o valor no painel Vercel. Até lá, o rótulo SIMULADA é o padrão seguro e só
some por comprovação do provedor real. Nos workers (GitHub), a ausência local/Vercel não implica ausência lá.

## 3. Como homologar uma resposta REAL com orçamento mínimo (procedimento; NÃO executado)

Pré-requisito: ambiente de homologação isolado (docs/homologacao-ambiente-isolado.md), NUNCA o operacional. Chave Anthropic dedicada de
homologação, com limite de gasto no console Anthropic; a chave de produção não é reutilizada.

1. Variáveis de teste no ambiente de homologação (Vercel separado ou `.env.local` fora do repo): `AXION_AI_PROVIDER=fake` global; ativar UM
   Expert por vez com `AXION_AI_PROVIDER_<EXPERT>=anthropic`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (modelo menor), `ANTHROPIC_MAX_TOKENS=1024`,
   `ANTHROPIC_TIMEOUT_MS=60000`. Os outros seis permanecem fake (isolamento provado pelo teste 5 do `test-f7-experts-ia-real.mjs`).
2. Cota baixa (service_role, uma vez): `update public.ai_consult_limits set per_user_day = 2, per_project_day = 7 where scope = 'DEFAULT';`
   (7 = uma consulta por Expert). Teto em US$ opcional: seção 4.
3. Antes: abrir Experts IA; o Expert escolhido deve aparecer "IA real configurada" e os demais "SIMULADA".
4. UMA consulta controlada por Expert, pergunta curta, obra de teste com dados sintéticos (nunca dados reais de cliente).
5. Rótulo SIMULADA → REAL: a resposta do Expert real NÃO traz o prefixo "RESPOSTA SIMULADA"; as dos demais trazem. Conferir o id do provedor e
   os tokens em `ai_consult_audit`.
6. Registro de consumo: 1 linha em `ai_consult_usage` por consulta (usuário, obra, Expert) e 1 em `ai_consult_audit` (sem texto de documento).
7. Encerrar: voltar `AXION_AI_PROVIDER_<EXPERT>` para fake/remover, restaurar limites e revogar a chave de teste; registrar o custo do console.

Aceite: 7 respostas rotuladas corretamente, 7 linhas de uso, custo total dentro do teto. O rótulo SIMULADA só deixa de ser padrão do produto
após essa evidência.

## 4. Custos e controles de consumo existentes (lidos no código e nas migrations)

| Controle | Onde | Valor atual | Como configurar o teto |
| --- | --- | --- | --- |
| Quantidade por usuário/dia e por obra/dia | `ai_consult_limits` (scope DEFAULT), reserva atômica `ai_consult_reserve_core` (migration 20261121150000) | 20 / 100 (operacional, não política aprovada) | `update public.ai_consult_limits set per_user_day=…, per_project_day=… where scope='DEFAULT'` (service_role) |
| Teto em US$ (usuário/obra/global; dia/mês) | `ai_consult_budget_settings` | DESLIGADO (`enabled=false`) | service_role: preencher `estimated_cost_per_call_usd`, os tetos e `decision_reference`; depois `enabled=true` (o banco recusa sem decisão e sem estimativa). Ver docs/ai/orcamento-monetario-ia.md |
| Reserva antes da chamada, sem estorno | `withQuotaGate` | sempre ativo | — |
| Trilha de consumo e auditoria | `ai_consult_usage`, `ai_consult_audit` | ativo | leitura por ADMINISTRADOR |
| AXIA (outro produto) | `AXIA_CHAT_DAILY_BUDGET_USD`, `AXIA_CHAT_USER_DAILY_CALLS` | variáveis presentes em produção (provedor da AXIA em "off") | variáveis de ambiente (Vercel) |
| Teto de tokens por resposta | `ANTHROPIC_MAX_TOKENS` | presente em produção (valor não lido) | variável de ambiente |
| Teto no provedor | console Anthropic | NÃO VERIFICADO | responsável, no console Anthropic |

## 5. Estado dos 7 Experts (com a evidência acima)

Configuração específica por Expert AUSENTE em todos os ambientes verificados; todos herdam `AXION_AI_PROVIDER`. Local: fake. Vercel production
(5d3g): depende do valor de `AXION_AI_PROVIDER` (NÃO VERIFICADO), chaves necessárias presentes. Workers: NÃO VERIFICADO. Nenhum Expert tem
"IA real comprovada"; o rótulo SIMULADA continua obrigatório sempre que o provedor resolvido não for um `anthropic` completo.
