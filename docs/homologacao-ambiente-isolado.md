# Ambiente ISOLADO de homologação autenticada do ACC (Fase 6 / H1)

Estado em 21/11/2026 (revisto na Fase 7 / H6a: **o projeto `acc-homolog` (ref `gtadbeaevxglrqkhcwfz`, sa-east-1, vazio) já foi criado em 21/11/2026 10:46Z**; custo e passo a passo em `docs/homologacao-acc-homolog-passo-a-passo.md`). Este documento entrega: (1) as opções reais de backend isolado COM Supabase Auth, com custo e comando; (2) o que só uma pessoa pode fazer;
(3) o KIT executável em `scripts/homolog/*` e como usá-lo; (4) variáveis; (5) rollback; (6) o que o kit prova e o que NÃO prova.
Complementa `docs/homologacao-autenticada-roteiro.md` (as 36 linhas e o status honesto por linha, seção 13).

**Regra-mãe (decisão do responsável):** o Supabase operacional (`plbcvwostmdmdmrziwmd`) NÃO é usado nem modificado; perfis de teste nascem SÓ pelo fluxo
legítimo de autenticação (login Google real de contas de teste + pré-cadastro/ativação do próprio app). Nada de sessão/JWT forjado, nada de senha, nada de
`auth.users` inserido à mão no ambiente de homologação.

## 1. Fatos que condicionam o ambiente (verificados no código e no Supabase em 21/11/2026)

| Fato | Evidência | Consequência |
|---|---|---|
| O login é **Google-only** (sem formulário de senha) | `apps/web/app/login/google-signin-button.tsx` (`signInWithOAuth({provider:"google"})`, redirect `/auth/callback`) | O ambiente precisa de **Supabase Auth com o provedor Google configurado** (OAuth client do Google Cloud). Postgres solto não basta |
| O callback **recusa e-mails fora de `@axion.com.br`** e faz `signOut` | `apps/web/app/auth/callback/route.ts` (`ALLOWED_EMAIL_DOMAIN`) | As contas de teste têm de ser **contas Google reais `@axion.com.br`** (aliases/contas de teste do Workspace). Contas `@gmail.com` NÃO entram, e isso não deve ser relaxado |
| O pré-cadastro também só aceita `@axion.com.br` | `project_member_invitations.email like '%@axion.com.br'` | Idem |
| Membership nasce no **1º login** (trigger `handle_new_user` ativa o pré-cadastro PENDING) | migration `20260825121000` | É o "fluxo legítimo": o kit grava o pré-cadastro; a pessoa entra com o Google e o próprio banco concede o acesso |
| Só ADMINISTRADOR pré-cadastra; projeto novo não tem administrador | `pre_register_project_member` | **Bootstrap do 1º administrador** por ação do dono do projeto de homologação (seção 4, passo K4); não é sessão forjada |
| O banco impede obra sem Administrador ativo; a auditoria é imutável | gatilho de `20260824090000`; `audit_log_entries` | O "reset" completo do ambiente é **descartar e recriar o projeto** (seção 7) |
| Sem Docker nesta máquina; `npx supabase` 2.114.0 existe; WSL existe | levantamento prévio + `supabase --version` | `supabase start` (stack local com GoTrue) **não é executável aqui**; ver opção C |
| A organização Supabase é **Axion (plano Pro)**; projetos existentes: `axion-contract-intelligence-dev` (operacional ACC), `Comercial Axion`, `Planejamento Axion` | MCP Supabase `list_organizations`/`get_organization`/`list_projects` (somente leitura) | Na Fase 6 nenhum projeto de homologação existia; **em 21/11/2026 10:46Z o `acc-homolog` passou a existir (vazio: 0 tabelas, 0 migrations)** — Fase 7/H6a. **Os três projetos anteriores são operacionais** e estão na lista negra da guarda; o `acc-homolog` é o alvo |

## 2. Opções de backend isolado

| Opção | Auth (Google) | Isolamento | Custo | Viabilidade agora | Veredito |
|---|---|---|---|---|---|
| **A. Novo projeto Supabase `acc-homolog`** (mesma organização, projeto SEPARADO) | Sim (GoTrue gerenciado; configurar Google no painel) | Total: ref, banco, chaves e Auth próprios | Compute Micro **≈ US$ 10/mês (≈ US$ 0,01344/h ≈ US$ 0,32/dia)**; o crédito de computação do plano Pro (US$ 10) já é consumido pelos projetos atuais, então o custo marginal é o do Micro. Confirmado em 21/11/2026 nas páginas oficiais (docs de compute e preços): Micro US$ 0,01344/h ≈ US$ 10/mês; crédito Pro de US$ 10 aplicado uma vez à organização; projeto pausado não conta compute; excluir encerra a cobrança (detalhes e fontes na seção 1 do passo a passo). O MCP não expõe API de custo. Cobrança para ao excluir (ou pausar) o projeto | Imediata, depende de 3 ações humanas (seção 3) | **RECOMENDADA** |
| B. Branch Supabase do projeto operacional | Sim | Banco separado, mas **nasce atrelado ao projeto operacional** (mesma família de ref, `merge_branch` existe) | ≈ US$ 0,01344/h por branch ativa | Possível, porém o risco de operar perto do operacional e o descompasso das 65 migrations pendentes tornam a guarda menos clara | **Não recomendada** |
| C. Stack local completa (`supabase start` / `scripts/sql/start-clean-local-stack.mjs`) | Sim (GoTrue local), mas o login é Google: precisaria de OAuth client apontando para localhost; o app local usa `http://127.0.0.1:3000` | Total | Zero | **Bloqueada: sem Docker nesta máquina** (instalar Docker Desktop é ação humana). Documentada em `docs/stack-local-completa-descartavel.md` | Alternativa gratuita se o responsável instalar Docker |
| D. Postgres 17 local (127.0.0.1:55434) | **Não** (sem GoTrue/PostgREST) | Total | Zero | Já em uso | Serve para RLS/regras por claims JWT no banco (EXECUTADO-BANCO-REAL), **não** para login/telas |

**Recomendação:** opção A, região `sa-east-1` (mesma do operacional, latência), plano Micro, com a guarda dura do kit.

### Pedido de confirmação (projeto JÁ criado fora deste agente; criação NÃO executada por agente)

Custo estimado: **≈ US$ 10/mês (Micro) enquanto existir; excluir o projeto ao final encerra a cobrança**. Comando exato, a ser rodado **pelo responsável** (ou autorizado por ele) com a CLI logada na organização Axion:

```
npx supabase projects create acc-homolog --org-id vlkuhdxanitymduyvhxi --region sa-east-1 --size micro --db-password "<senha forte gerada por você, guardada fora do repositório>"
```

(Equivalente no painel: Organização Axion → New project → nome `acc-homolog`, região South America (São Paulo), Compute Micro.) Este agente **não criou** projeto nem branch.

## 3. Ações exclusivamente humanas (bloqueio exato de cada uma)

| # | Ação | Quem | Por que não é automatizável por este agente |
|---|---|---|---|
| H1 | Aprovar o custo e criar o projeto `acc-homolog` (comando acima) | Responsável | Custo recorrente; regra "não crie projeto pago sem confirmação" |
| H2 | **Criar o OAuth client do Google Cloud** (tipo Web application): origem autorizada = URL do app de homologação; URI de redirecionamento = `https://<ref-homolog>.supabase.co/auth/v1/callback`. Tela de consentimento **Interna** (Workspace Axion). Copiar Client ID/Secret | Administrador do Google Workspace/Cloud da Axion | Exige console do Google Cloud e credencial de administrador do Workspace |
| H3 | No painel do projeto de homologação: Authentication → Providers → **Google** (colar Client ID/Secret) → URL Configuration: Site URL = URL do app de homologação; Redirect URLs = `<URL>/auth/callback` | Responsável | Segredo do OAuth; painel do projeto novo |
| H4 | Indicar **2–3 contas Google `@axion.com.br` de teste reais** (mínimo viável: uma por perfil crítico — ver seção 4.2) e **ceder a sessão de login** (as pessoas entram com o Google no navegador delas) | Responsável + titulares das contas | Autenticação real não pode ser feita pelo agente (CLAUDE.md, regra do responsável) |
| H5 | Onde o app de homologação roda: **(i)** `npm run dev`/`start` local com `.env.homolog` (redirect `http://localhost:3000/auth/callback` na lista do Supabase e do Google) ou **(ii)** projeto Vercel SEPARADO com as variáveis do `acc-homolog`. **Nunca** apontar o deploy/variáveis do projeto Vercel operacional | Responsável | Deploy/variáveis são ação de conta |

## 4. Kit executável (`scripts/homolog/`)

| Arquivo | Função |
|---|---|
| `guard.mjs` | **Guarda dura (pura, testada).** Recusa: o ref operacional `plbcvwostmdmdmrziwmd` e os demais projetos da org (lista negra, inclusive escondido na senha), qualquer host fora de `127.0.0.1:55434/acc_homolog_*`, `db.<ref>.supabase.co` e pooler com usuário `postgres.<ref>`, ref não confirmado por `HOMOLOG_TARGET_REF`, falta de `HOMOLOG_I_UNDERSTAND_ISOLATED=true`, ref igual ao do `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL`/`supabase/.temp/project-ref` |
| `connect.mjs` | Conexão guardada: URL só por `HOMOLOG_DATABASE_URL` (nunca por argumento, nunca impressa); exige o **marcador** `acc_homolog_marker`; recusa se o ambiente tem variáveis operacionais (`SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_*`, `GOOGLE_GMAIL_*`, `CRON_SECRET`, …) |
| `apply-migrations.mjs` | Dry-run por padrão; `--init-marker` (só banco vazio), `--apply [--through=<versão>]`, `--verify` (pendentes, tabelas sem RLS, função P0). Cada migration em transação, `lock_timeout=10s`, registra em `supabase_migrations.schema_migrations`; para na primeira falha. Modo local: `--create-local-db --local-platform-stub` |
| `seed-e-perfis.mjs` / `seed-lib.mjs` | Obras fictícias TESTE e TESTE-2; perfis do roteiro por **membership** (quem já entrou) ou **pré-cadastro PENDING** (quem ainda não entrou). Nunca toca `auth.users`. Dry-run por padrão (`--apply`) |
| `check-env.mjs` | Valida NOMES e coerência de um dotenv **fora do repositório** (`--file=`): URL aponta para o ref de homologação, chave secreta ≠ publicável, nenhuma integração real (Gmail/Construmanager/CRON/IA) presente, `ACC_OUTBOUND_MODE` ≠ `production`. Nunca imprime valores |
| `rollback-seed.mjs` | Rollback parcial do seed (seção 7) |

Testes: `scripts/test-homolog-guard.mjs` (39 verificações puras) e `scripts/test-homolog-kit-realpg.mjs` (24 verificações em Postgres 17 real local: recusas por processo real, marcador, replay de todas as migrations, idempotência, `--verify`, seed, ativação do pré-cadastro pelo trigger, rollback parcial).

### 4.1 Passo a passo (K = agente/kit, H = humano)

1. **H1** cria o projeto `acc-homolog` (seção 2). Anota o `ref` (20 letras).
2. **K1** — num shell LIMPO (sem as variáveis do app operacional), definir `HOMOLOG_TARGET_REF=<ref>`, `HOMOLOG_I_UNDERSTAND_ISOLATED=true` e `HOMOLOG_DATABASE_URL` (string de conexão do **pooler/direta do projeto de homologação**, do painel → Connect; a senha é a de H1). Não gravar em arquivo do repositório.
3. **K2** `node scripts/homolog/apply-migrations.mjs` (dry-run; confirma a guarda) → `--init-marker` → `--apply` → `--verify` (esperado: pendentes 0, tabelas sem RLS 0, `p0_funcoes` 1). **Janela:** banco vazio, sem risco de lock.
4. **H2, H3** configuram o Google Auth (seção 3). **K3** `node scripts/homolog/check-env.mjs --file=<dotenv-homolog>` com as variáveis do app (REQUIRED: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `AXION_APP_BASE_URL`; AUSENTES: integrações reais).
5. **H4/H5** sobem o app de homologação; o **P-ADM** abre o app e entra com o Google **uma vez** (cria o `profile` pelo trigger; ainda sem acesso).
6. **K4** `HOMOLOG_TEST_ACCOUNTS="P-ADM=...@axion.com.br;P-GES=...;P-COL=...;P-LEI=...;P-ADM2=...;P-PEN=..." node scripts/homolog/seed-e-perfis.mjs` (dry-run) → `--apply`. Concede ADMINISTRADOR na obra TESTE ao P-ADM (bootstrap do dono do projeto) e grava os pré-cadastros dos demais.
7. Cada pessoa de teste entra com o Google; o próprio app/banco ativa o acesso. Rodar `seed-e-perfis.mjs --apply` de novo após o 1º login do P-INA para inativar a membership (a seção 1 do roteiro pede inativo).
8. Uma **pessoa** executa o roteiro seção 4 a 8 e anexa prints; só então a linha vira EXECUTADO-AUTENTICADO.

### 4.2 Menor conjunto de contas que destrava a maior parte do roteiro

| Contas | Perfis cobertos | Passos destravados |
|---|---|---|
| 2 (P-ADM, P-COL) | administrador + colaborador | A-01/03/08/09/11, Q-02 a Q-05, G-02/04/05, S-03/04/14, SS-01, parte de Hover/Contraste em tela real |
| 3 (+ P-GES) | + gestor | Q-06 a Q-08, G-06 a G-10, S-02/13, D-01 a D-05, AL-01/02 |
| +1 (P-LEI) | leitura | A-01/10, Q-01, G-01, S-01, PIL-01, AL-03 |
| +1 (P-ADM2) e P-GER/P-GES2 | isolamento entre obras; dupla conferência (S-05 a S-09 exigem 3 pessoas distintas além do emissor) | A-04/05, G-09, S-17, PIL-03, SS-04 |

Observação: não existe papel GERENTE no pré-cadastro (só ADMINISTRADOR/GESTOR/COLABORADOR/LEITURA); P-GER = GESTOR (nível MANAGE) de outra pessoa.

## 5. Variáveis (nomes; nunca valores)

| Variável | Onde | Observação |
|---|---|---|
| `HOMOLOG_TARGET_REF`, `HOMOLOG_I_UNDERSTAND_ISOLATED`, `HOMOLOG_DATABASE_URL`, `HOMOLOG_TEST_ACCOUNTS` | shell do operador do kit | Não vão para o app nem para o repositório |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app de homologação | Do projeto `acc-homolog` |
| `SUPABASE_SECRET_KEY` | app (server-only) | Do projeto `acc-homolog`; nunca com prefixo `NEXT_PUBLIC_` |
| `AXION_APP_BASE_URL` | app | URL do app de homologação |
| `ACC_OUTBOUND_MODE` | app | **Ausente** (= modo piloto, fail-closed) ou `pilot`; jamais `production` |
| `NEXT_PUBLIC_ACC_TEST_MODE` | app | Ausente (etiqueta SISTEMA EM TESTE visível) |
| AUSENTES: `GOOGLE_GMAIL_*`, `CONSTRUMANAGER_*`, `CRON_SECRET`, `ACC_RISK_ALERTS_CRON_SECRET`, `ANTHROPIC_API_KEY` | — | Sem integração real na homologação |
| Google OAuth Client ID/Secret | painel Supabase (Auth → Google) | Nunca no repositório |

Os nomes acima vêm da leitura de nomes de `apps/web/.env.example` e do código; o `.env.local` operacional foi lido **somente pelos nomes** (nenhum valor impresso) e não é usado.

## 6. O que o kit prova e o que NÃO prova

- PROVA (Postgres 17 real local, FIXTURE de "login" = linha em `auth.users`): a guarda recusa o operacional/hosts desconhecidos; as 200 migrations aplicam do zero e de forma idempotente; o pré-cadastro só concede acesso no primeiro login (trigger real); o seed não cria usuários.
- NÃO PROVA: que o app autentica via Google, que o OAuth client/redirects estão certos, que as telas renderizam com sessão real. Isso só acontece após H1–H5.
- Nenhum comando do kit foi executado contra host remoto (nenhum alvo remoto existe). O único alvo usado foi `127.0.0.1:55434/acc_homolog_*` (base descartável, apagada no fim do teste).

## 7. Rollback

| Nível | Como | Reversível? |
|---|---|---|
| Seed parcial | `node scripts/homolog/rollback-seed.mjs` (dry-run) / `--apply`: remove pré-cadastros e memberships não administrativas das obras fictícias | Sim (reexecute o seed) |
| Migration individual | `supabase/rollbacks/<versão>.rollback.sql` por migration, aplicado manualmente no SQL Editor do projeto de homologação (`docs/implantacao/`) | Conforme cada rollback |
| **Reset completo** | **Excluir o projeto `acc-homolog`** (painel → Settings → General → Delete project) e recriar. É o caminho correto porque o banco bloqueia (por desenho) remover o último administrador e a auditoria é imutável. Encerra a cobrança | Sim (recria do zero em minutos com o kit) |
| Credenciais | Revogar o OAuth client de teste (Google Cloud) e remover as Redirect URLs de homologação | Sim |
