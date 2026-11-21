# Pacote de criação e uso do projeto `acc-homolog` — passo a passo (Fase 7 / H6a)

Estado em 21/11/2026. Complementa `docs/homologacao-ambiente-isolado.md` (opções e kit) e `docs/homologacao-autenticada-roteiro.md` (as 36 linhas).
Nada aqui foi executado contra recurso remoto por este pacote. Rótulos: **VERIFICADO** (lido em fonte/ferramenta nesta data), **INFERIDO**, **DEPENDE DO RESPONSÁVEL**.

## 0. Achado importante: o projeto `acc-homolog` JÁ EXISTE

Leitura somente-leitura (MCP Supabase `list_projects`, `list_tables`, `list_migrations`), 21/11/2026:

| Item | Valor | Rótulo |
|---|---|---|
| ref | `gtadbeaevxglrqkhcwfz`, nome `acc-homolog`, organização Axion (`vlkuhdxanitymduyvhxi`) | VERIFICADO |
| Região / engine | `sa-east-1` / Postgres 17.12, status ACTIVE_HEALTHY | VERIFICADO |
| Criado em | 2026-11-21T10:46:12Z, **não por este agente** (provavelmente o responsável, após o pedido de custo da Fase 6) | INFERIDO |
| Conteúdo | **vazio**: 0 tabelas em `public`, 0 migrations registradas | VERIFICADO |
| Plano da organização | `pro` | VERIFICADO |

Consequência: o passo H1 (criar projeto) já foi feito; o custo (Micro, seção 1) **já está correndo** desde a criação. Restam migrations, Google Auth, variáveis, contas e execução. O procedimento (seção 9) tem o modo `--adopt-ref` para este caso. **Confirme no painel (Settings → General / Billing) o tamanho de compute realmente criado**: este agente não consegue ler o compute do projeto, só o plano da organização.
Os 3 outros projetos (`plbcvwostmdmdmrziwmd` operacional ACC, `jawaqwtcukrexnisogzo` Comercial, `asaraykwyhmdiyrlaupq` Planejamento) continuam na lista negra do kit. O `acc-homolog` NÃO está na lista negra (é o alvo).

## 1. Custo e isolamento (fonte e data)

Fontes consultadas em 21/11/2026: https://supabase.com/docs/guides/platform/manage-your-usage/compute, https://supabase.com/pricing, https://supabase.com/docs/guides/platform/regions.

| Pergunta | Resposta | Fonte |
|---|---|---|
| Preço do compute Micro | **US$ 0,01344/hora, ≈ US$ 10/mês** | docs de compute; a página de preços mostra US$ 10/mês |
| Crédito do plano Pro | US$ 10/mês de crédito de compute, cobre UM projeto Micro/Nano; reinicia todo mês e não acumula; é aplicado uma vez ao total da organização | docs de compute |
| Como projetos extras são cobrados | Cada projeto soma seu próprio compute (por hora de funcionamento; hora parcial conta como hora cheia); o crédito é abatido uma única vez. Exemplo da própria documentação: 3 projetos Small = subtotal US$ 70, total US$ 60. **Há 4 projetos na org** (3 existentes + `acc-homolog`): o crédito já era consumido pelos existentes, então o custo marginal do `acc-homolog` Micro ≈ **US$ 10/mês (≈ US$ 0,32/dia)** | docs de compute + página de preços |
| Pausa / exclusão | Projeto **pausado não conta** compute; **excluir encerra a cobrança**. Compute Hours não são cobertos pelo Spend Cap | docs de compute |
| Região `sa-east-1` | Listada como "South America (São Paulo)"; o projeto existente confirma a disponibilidade na prática | docs de regiões + `list_projects` |
| Isolamento | Projeto Supabase novo = **banco, Auth (GoTrue), chaves de API e URL próprios**. Compartilhado: **apenas a organização/cobrança**. Nada do operacional é herdado (confirmado: 0 tabelas, 0 migrations) | INFERIDO da arquitetura documentada + VERIFICADO (projeto vazio) |
| Custo adicional possível | Armazenamento/egresso acima das cotas do plano; sem uso relevante na homologação | INFERIDO |

O MCP Supabase desta sessão **não expõe** ferramenta de custo/confirmação de custo (apenas `get_organization`, `list_*`): nada foi confirmado nem criado. Para reduzir custo: **pausar** o projeto entre rodadas (painel → Settings → General → Pause project) ou excluí-lo ao final.

## 2. Google OAuth (Google Cloud Console + painel Supabase) — DEPENDE DO RESPONSÁVEL (administrador do Workspace/Cloud)

Lido no código: `apps/web/app/login/google-signin-button.tsx` chama `signInWithOAuth({provider:"google"})` com `redirectTo = <origem>/auth/callback[?next=]`; `apps/web/app/auth/callback/route.ts` troca o `code` por sessão (PKCE), **recusa e-mail fora de `@axion.com.br` e faz `signOut`**, e redireciona para `next` (padrão `/projetos`). O trigger `handle_new_user` (migração `20260825121000`) cria o `profile` e **ativa pré-cadastros PENDING por comparação exata de e-mail** no primeiro login.

**A. Google Cloud Console** (https://console.cloud.google.com, logado como administrador da Axion):
1. Criar (ou escolher) um projeto Google Cloud **de homologação** (sugestão de nome: `acc-homolog-auth`). Não reutilize o projeto do Gmail/Workspace de produção do ACC.
2. Google Auth Platform → **Branding**: nome do app "ACC Homologação", e-mail de suporte.
3. Google Auth Platform → **Audience**: Tipo de usuário **Interno** (só contas do Workspace axion.com.br). Se a opção Interno não aparecer, o projeto não está dentro da organização Workspace: mover o projeto para a organização. Não usar "Externo".
4. Google Auth Platform → **Data Access (Escopos)**: apenas `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (mínimos; `openid` adicionar manualmente, os outros dois vêm por padrão). Nenhum escopo sensível (Gmail/Drive).
5. Google Auth Platform → **Clients → Create client** → Tipo **Web application**, nome `acc-homolog-web`.
   - **Authorized JavaScript origins**: `http://localhost:3000` (execução local) e/ou a URL do app de homologação no Vercel (`https://<projeto-homolog>.vercel.app`).
   - **Authorized redirect URIs**: **`https://gtadbeaevxglrqkhcwfz.supabase.co/auth/v1/callback`** (formato `https://<ref>.supabase.co/auth/v1/callback`; é a URL de callback do Supabase, NÃO a do app). Conferir contra o valor exibido na página do provedor Google no painel Supabase.
6. Criar e copiar **Client ID** e **Client Secret** (o secret só é mostrado nesta etapa; guardar em cofre, nunca no repositório/chat).

**B. Painel Supabase do `acc-homolog`** (https://supabase.com/dashboard/project/gtadbeaevxglrqkhcwfz):
1. Authentication → Sign In / Providers → **Google** → Enable; colar Client ID e Client Secret; **deixar "Skip nonce check" desligado**; salvar.
2. Authentication → **URL Configuration**: **Site URL** = URL do app de homologação (`http://localhost:3000` ou a URL Vercel de homologação). **Redirect URLs** (lista de permissão) = `http://localhost:3000/auth/callback` e/ou `https://<projeto-homolog>.vercel.app/auth/callback`.
3. Não ativar outros provedores nem cadastro por e-mail/senha (o app é Google-only).

**C. Restrição de domínio**: já imposta pelo app (`ALLOWED_EMAIL_DOMAIN = "axion.com.br"` no callback) e pelo pré-cadastro (`email like '%@axion.com.br'`), além da tela Interna do Google. Observação (VERIFICADO no código): quando uma conta de outro domínio passa pelo Google, o `auth.users`/`profile` já foi criado pelo trigger antes do `signOut` do callback; com a tela **Interna** isso não ocorre para contas externas ao Workspace.

**Verificação**: abrir `/login` do app de homologação → "Entrar com Google" → volta em `/projetos` (sem acesso a obras até o seed). Se voltar para `/login?error=domain_not_allowed`, a conta não é `@axion.com.br`; `oauth_exchange_failed`, conferir Client ID/Secret e a URI de redirecionamento.

## 3. Variáveis separadas do ambiente de homologação

Templates (só nomes/placeholders, sem valores): `scripts/homolog/env-template/env.homolog.template` (dotenv do app) e `scripts/homolog/env-template/shell-operador.template.txt` (shell do operador do kit). Nomes conferidos contra `scripts/homolog/check-env.mjs` (REQUIRED / MUST_BE_ABSENT / SAFE_VALUES) e `apps/web/.env.example`.

**Regra:** NUNCA usar variáveis do operacional (`plbcvwostmdmdmrziwmd`) nem de integrações reais (Gmail, Construmanager, CRON, IA). O `check-env` reprova ref operacional, integrações presentes, chave secreta igual à publicável, segredo com prefixo `NEXT_PUBLIC_` e `ACC_OUTBOUND_MODE=production`.

Como carregar (escolher uma):
- **Local (`npm run dev`)**: copiar o template para um arquivo FORA do repositório; apontar o app para ele **somente** numa pasta/worktree limpa: o Next lê `apps/web/.env.local`; portanto, num worktree/clone dedicado à homologação, colocar o conteúdo em `apps/web/.env.local` **desse clone** (nunca no clone operacional). Conferir antes `node scripts/homolog/check-env.mjs --file=<arquivo>`.
- **Projeto Vercel SEPARADO** (ex.: `acc-homolog`): criar projeto novo, branch/deploy de homologação, cadastrar as variáveis no painel do projeto novo; não tocar o projeto Vercel operacional.

Checklist (marcar):
- [ ] `NEXT_PUBLIC_SUPABASE_URL` = `https://gtadbeaevxglrqkhcwfz.supabase.co` (ref de homologação)
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` copiadas do painel do **acc-homolog** (Project Settings → API), chave secreta só no servidor
- [ ] `AXION_APP_BASE_URL` = origem do app de homologação, igual à Site URL do Supabase
- [ ] `ACC_OUTBOUND_MODE` ausente ou `pilot`; `NEXT_PUBLIC_ACC_TEST_MODE` ausente
- [ ] Ausentes: `GOOGLE_GMAIL_*`, `CONSTRUMANAGER_*`, `CRON_SECRET`, `ACC_RISK_ALERTS_CRON_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AXIA_CHAT_*`
- [ ] `check-env` retornou "OK"
- [ ] Nenhum dos valores aparece em chat, commit, print ou log

## 4. Contas reais AXION necessárias (formulário para o responsável)

Não inventamos pessoas. O responsável preenche a coluna "Conta Google @axion.com.br" com **contas reais**, uma pessoa distinta por perfil (o seed recusa e-mail repetido).

| Código | Papel na obra | Mínimo (3) | Completo (~8, roteiro 4.2) | Para que serve | Conta Google @axion.com.br (preencher) | Titular (preencher) |
|---|---|:-:|:-:|---|---|---|
| P-ADM | ADMINISTRADOR (obra TESTE) | sim | sim | bootstrap; Usuários, Integrações, aprovação de minuta | | |
| P-COL | COLABORADOR | sim | sim | registra; não decide | | |
| P-GES | GESTOR | sim | sim | decide; 1º conferente | | |
| P-GER | GESTOR (outra pessoa) | | sim | 2º conferente (independência) | | |
| P-LEI | LEITURA | | sim | só consulta | | |
| P-ADM2 | ADMINISTRADOR da obra TESTE 2 | | sim | isolamento entre obras | | |
| P-INA | COLABORADOR depois INATIVO | | sim | acesso removido | | |
| P-PEN | convite PENDENTE (não entra) | | sim | convite não concede acesso | | |

O pré-cadastro não tem papel GERENTE (só ADMINISTRADOR/GESTOR/COLABORADOR/LEITURA): P-GER = GESTOR de outra pessoa. S-05 a S-09 (dupla conferência) exigem ainda um emissor (P-ADM) e dois conferentes distintos (P-GES e P-GER). Cobertura por conta: seção 4.2 de `docs/homologacao-ambiente-isolado.md`. Privacidade: guardar o formulário preenchido fora do repositório.

## 5. Bootstrap do primeiro administrador (passo a passo)

Projeto novo não tem administrador e só ADMINISTRADOR pré-cadastra (RPC `pre_register_project_member`). O bootstrap é feito pelo **dono do projeto de homologação**, sem sessão forjada:

1. (Pré) Migrations aplicadas e verificadas no `acc-homolog` (seção 9, passo 4): `--verify` = pendentes 0, tabelas sem RLS 0, `p0_funcoes` 1.
2. Google Auth configurado (seção 2) e app de homologação no ar (seção 3).
3. A pessoa **P-ADM** abre o app de homologação e entra com a conta Google **uma única vez**. O trigger `handle_new_user` cria o `profile` (ainda sem acesso a nada).
4. No shell limpo do operador (`shell-operador.template.txt`): `HOMOLOG_TARGET_REF=gtadbeaevxglrqkhcwfz`, `HOMOLOG_I_UNDERSTAND_ISOLATED=true`, `HOMOLOG_DATABASE_URL` (painel → Connect; senha do banco), `HOMOLOG_TEST_ACCOUNTS="P-ADM=...;P-COL=...;P-GES=..."`.
5. `node scripts/homolog/seed-e-perfis.mjs` (dry-run; se o P-ADM ainda não entrou, o script para com exit 3 e instrui) e depois `--apply`: cria as obras fictícias TESTE/TESTE-2, concede ADMINISTRADOR na obra TESTE ao P-ADM e grava pré-cadastros PENDING dos demais.
6. Cada pessoa entra com o Google; o trigger ativa o acesso. Para P-INA: após o 1º login, rodar o seed de novo (inativa a membership).
7. Guardas do kit que valem em todos os passos: ref ≠ operacional (lista negra), `HOMOLOG_TARGET_REF` igual ao host, `HOMOLOG_I_UNDERSTAND_ISOLATED=true`, marcador `acc_homolog_marker` no banco, recusa se há variáveis operacionais no ambiente, dry-run por padrão, nunca toca `auth.users`.

## 6. Os 36 casos do roteiro (linhas do quadro da seção 9)

Status em 21/11/2026 (de `homologacao-autenticada-roteiro.md`): **0 EXECUTADO-AUTENTICADO**, 18 BANCO-REAL, 8 FIXTURE, 10 BLOQUEADO. "Evidência exigida" = o que a pessoa logada anexa para virar EXECUTADO-AUTENTICADO. Dado mínimo: seção 2 do roteiro (obra TESTE, 4 documentos TESTE-, 2 e-mails, 2 fotos SSMA, 3 RNC, 2 garantias etc.).

| # | Tela / linha | Passos | Perfil(is) | Dado mínimo | Evidência exigida | Status atual |
|---|---|---|---|---|---|---|
| 1 | Menu e autorização por nível | A-01..A-11 | LEI, COL, GES, GER, ADM, ADM2, INA, PEN | obra TESTE e TESTE 2, 8 contas | print do menu por perfil; URL + resposta 404 | BANCO-REAL |
| 2 | Qualidade — Dashboard | Q-01, Q-11 | LEI, qualquer | 3 RNC | print da aba; totais lado a lado com a lista RNC | BLOQUEADO |
| 3 | Qualidade — RNC | Q-02..Q-09, Q-12 | COL, GES, GER, ADM2 | 3 RNC; alerta para vínculo | prints; aba Auditoria; 2 janelas no conflito de versão | BANCO-REAL |
| 4 | Qualidade — Evidências | Q-01, Q-04 | LEI, COL | 2 fotos SSMA | print do registro e da recusa ao reclassificar | BANCO-REAL |
| 5 | Qualidade — Inspeções | Q-01 | LEI | 1 inspeção | print da aba | BLOQUEADO |
| 6 | Qualidade — Reclamações | Q-01 | LEI | 1 reclamação | print da aba | BLOQUEADO |
| 7 | Qualidade — Ensaios e laudos | Q-01 | LEI | 1 laudo | print da aba | BLOQUEADO |
| 8 | Qualidade — Requisitos | Q-01 | LEI | 1 requisito | print da aba | BLOQUEADO |
| 9 | Qualidade — Ações (CAPA) | Q-01, Q-06 | LEI, GES | 1 CAPA | print + auditoria (autor/instante) | BANCO-REAL |
| 10 | Qualidade — Eficácia | Q-01, Q-06, Q-07 | LEI, GES | 1 RNC com CAPA | print da recusa sem eficácia e do aceite | BANCO-REAL |
| 11 | Qualidade — Recorrências | Q-01 | LEI | RNC repetidas | print da aba | BLOQUEADO |
| 12 | Qualidade — Custos de não qualidade | Q-01 | LEI | 1 custo com fonte | print da aba | BLOQUEADO |
| 13 | Qualidade — Auditoria | Q-01, Q-06 | LEI, GES | ações dos passos Q | print da aba com os registros | BANCO-REAL |
| 14 | Garantias — Lista | G-01, G-02 | LEI, COL | 2 casos (1 dentro, 1 fora do prazo) | prints; recusa sem origem | BANCO-REAL |
| 15 | Garantias — Detalhe | G-03..G-10 | COL, GES, ADM2 | caso + cláusula | prints; antes/depois na auditoria; URL negada ao ADM2 | BANCO-REAL |
| 16 | Seguros — Painel | S-01 | LEI | apólice | print das 12 abas | FIXTURE |
| 17 | Seguros — Apólices | S-01..S-03 | LEI, GES, COL | apólice TESTE | prints; recusa ao COL | BANCO-REAL |
| 18 | Seguros — Fianças e garantias | S-01 | LEI | 1 fiança | print | FIXTURE |
| 19 | Seguros — Endossos (dupla conferência) | S-04..S-09 | COL, ADM, GES, GER | 1 endosso; 4 pessoas | prints "1 de 2" e "2 de 2"; recusas (emissor/repetida) | BANCO-REAL |
| 20 | Seguros — Adiantamentos | S-10 | GES | adiantamento + amortização | print de saldo | BANCO-REAL |
| 21 | Seguros — Sinistros e eventos | S-11..S-13 | COL, GES | 1 aviso de sinistro | prints; recusa ao COL | BANCO-REAL |
| 22 | Seguros — Dossiês | S-01 | LEI | 1 dossiê | print | FIXTURE |
| 23 | Seguros — Minutas e acionamento | S-14..S-16 | COL, GES, ADM | 1 minuta | prints; "indisponível nesta fase" no Enviar | BANCO-REAL |
| 24 | Seguros — Canais oficiais | D-07..D-09 | GES | canal de teste | prints; evento na Auditoria | BANCO-REAL |
| 25 | Seguros — Sujeitos e RCC | S-01 | LEI | 1 sujeito | print | FIXTURE |
| 26 | Seguros — Referências | S-01 | LEI | 1 referência | print | FIXTURE |
| 27 | Seguros — Auditoria | S-18 | GES | ações anteriores | print com autor/instante | BANCO-REAL |
| 28 | Quatro Pilares | PIL-01..PIL-03 | LEI, GES, ADM2 | RNC, garantia, apólice | prints; "Ver origem" na mesma obra; URL negada | BLOQUEADO |
| 29 | Alertas — detalhe | AL-01..AL-03 | GES, COL, LEI | 1 alerta | prints; recusa ao LEI | BLOQUEADO |
| 30 | Solicitações — lista e detalhe | AL-04, D-01..D-06 | GES, COL | 1 solicitação; destinatários interno/externo | prints das mensagens de recusa; consulta de auditoria (ADM) | BANCO-REAL |
| 31 | Reemissão de alertas / Autorizações | AL-05 | ADM | 1 pedido de reemissão | print (só administrador) | BANCO-REAL |
| 32 | SSMA — registros e avaliação | SS-01..SS-04 | COL, LEI, GES, ADM2 | 2 fotos | prints; URL negada | BANCO-REAL |
| 33 | SSMA — fluxo offline | SS-05 | COL | celular | print/vídeo (offline→sincroniza) | FIXTURE |
| 34 | ESG | SS-03 | GES | indicadores | print com fonte e "SEM DADOS" | BLOQUEADO |
| 35 | Hover Text | H-01..H-05 | LEI, COL, GES | telas acima | print por tela; teclado; celular 390 px | FIXTURE |
| 36 | Contraste e legibilidade | C-01..C-03 | qualquer | telas acima | print da medição (4,5:1 / 3:1) | FIXTURE |

Conferência da contagem: 18 + 8 + 10 = 36 (iguais à seção 13 do roteiro). A **ordem recomendada** de execução: 1 (autorização) → 3, 14/15 (Qualidade/Garantias) → 16..27 (Seguros) → 30, 31, 29 (Solicitações/Alertas) → 32..34 (SSMA/ESG) → 28 (Pilares) → 35, 36.

## 7. O que o responsável faz × o que o kit faz

| Etapa | Quem | Observação |
|---|---|---|
| Confirmar compute/custo do `acc-homolog` e decidir pausa | Responsável | seção 0 e 1 |
| Google Cloud (seção 2A) e provedor no painel (2B) | Admin Workspace/Cloud | segredo do OAuth fora do chat |
| Variáveis (seção 3) | Responsável | `check-env` valida |
| Preencher contas (seção 4) | Responsável | pessoas reais |
| Migrations, seed, `--verify` | Operador do kit | seção 9 |
| Login Google e execução do roteiro | Pessoas dos perfis | prints; nenhuma sessão forjada |

## 8. Rollback e encerramento

Ver seção 7 de `homologacao-ambiente-isolado.md`: seed parcial (`rollback-seed.mjs`), reset completo = excluir o projeto (encerra a cobrança) ou **pausar** (não conta compute). Revogar o OAuth client de teste e remover as Redirect URLs ao encerrar.

## 9. Procedimento executável único: `scripts/homolog/provision-acc-homolog.mjs`

Dry-run por padrão: confere pré-requisitos, imprime o plano e o comando de criação (a senha vem de `HOMOLOG_DB_PASSWORD`, nunca aparece), **não acessa rede**.

```
node scripts/homolog/provision-acc-homolog.mjs
```

Execução (só após autorização do responsável). Como o projeto já existe, o caminho esperado é a **adoção**:

```
HOMOLOG_AUTHORIZED=SIM node scripts/homolog/provision-acc-homolog.mjs --adopt-ref=gtadbeaevxglrqkhcwfz --ref-file=<arquivo FORA do repositório> --execute
```

(requer `HOMOLOG_DATABASE_URL` no shell para aplicar as migrations; sem ela, grava o ref e para com segurança; com `HOMOLOG_ENV_FILE` roda o `check-env`; depois `apply-migrations` dry-run → `--init-marker` → `--apply` → `--verify`, parando na primeira falha).
Criação de um projeto novo (só se o atual for descartado): `HOMOLOG_AUTHORIZED=SIM HOMOLOG_DB_PASSWORD=<...> node scripts/homolog/provision-acc-homolog.mjs --execute --confirm-cost "<valor confirmado>" --ref-file=<fora do repo>`; o comando impresso é `npx supabase projects create acc-homolog --org-id vlkuhdxanitymduyvhxi --region sa-east-1 --size micro --db-password "$HOMOLOG_DB_PASSWORD"` (flags conferidas em `npx supabase projects create --help`).

Recusas (testadas em `scripts/test-homolog-provision.mjs`, 31 verificações, na `scripts/test-scripts.list`): `--execute` sem `HOMOLOG_AUTHORIZED=SIM` (valor exato); criação sem `--confirm-cost` ou sem senha no ambiente; `--ref-file` dentro do repositório; qualquer ref operacional (também em dry-run); ref igual ao do app/CLI; dry-run não chama rede, DNS nem processos filhos (provado por preload que bloqueia) e não imprime segredos. **Este procedimento não foi executado em modo que cria recurso nem contra o projeto remoto.**

Após as migrations, a migration da frente H6e (TENANT_ADMIN) e as demais ondas da sequência (`docs/implantacao/`) entram pelo mesmo `apply-migrations`.
