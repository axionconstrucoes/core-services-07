# 37 - Configurações inspecionadas (Vercel, Supabase Auth) e checklist GO/NO-GO atualizado (23/11/2026)

Somente leitura. Nenhum valor sensível foi lido ou reproduzido; nada foi alterado.

## 1. Vercel (projeto de produção; variáveis só por nome e tipo)
| Variável | Situação encontrada | Ação |
|---|---|---|
| `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED` | **ausente** (o padrão do código é LIGADO) | criar `false` ANTES do merge. Criar uma variável nova **não dispara redeploy sozinha**, mas só vale no próximo deploy; como o merge faz deploy, criar antes dele. **Não criada** (aguarda autorização) |
| `ACC_ALERT_*` (limite global, doc 35) | ausentes | criar só na fase F0 aprovada: 10/h, 30/dia, lote 5, só WEG; hoje sem efeito, pois o código com o governador ainda não está em produção |
| `ACC_OUTBOUND_MODE` | existe, tipo `encrypted` (valor não lido) | **conferir no painel** que o valor NÃO é `production` (a trava só libera destinatários originais com o valor exato `production`) |
| `AXION_APP_BASE_URL` | existe, tipo `encrypted` (valor não lido) | **conferir no painel** que é `https://acc.axion.com.br` |
| `ACC_SSMA_NOTIFICATIONS_ENABLED` / `_SCOPE` | `true` / `WEG_CORRECTIVE_ACTIONS` (autorizado em 18/11) | **já envia** aviso de ação corretiva em atraso da WEG; o governador precisa tratá-lo (fonte SSMA) |
| `ACC_PILOT_SINGLE_ALERT_*` | `DESARMADO` | manter |
| `AXIA_CHAT_PROVIDER` | `off`; acesso `admins` | manter |
| `ACC_PROJECT_PILOT_TEST_GROUP` | vazio (decisão de 13/11) | manter |
| `ACC_WEEKLY_REPORTS_ENABLED` | existe, `sensitive` (valor não legível pela ferramenta) | registrar o valor pelo painel (doc 34) |
| `NEXT_PUBLIC_ACC_TEST_MODE` | existe, `encrypted` | **conferir** o valor (modo de teste não deve estar ligado em produção) |
Observação: não decifrei as variáveis `encrypted` porque a ferramenta decifra todas de uma vez (inclui destinos do piloto) e a própria orientação do conector é não decifrar sem necessidade.

## 2. Supabase Auth (projeto de produção)
- **Site URL:** `https://acc.axion.com.br` ✔.
- **Redirect URLs (8):** incluem `https://acc.axion.com.br` e `https://acc.axion.com.br/auth/callback` ✔; também `localhost` e curingas de preview da Vercel (`*-axionconstrucoes-projects.vercel.app/**`), aceitáveis, mas **revisar** (os curingas ampliam a superfície).
- **Provedores:** Email e Google habilitados; todos os demais desabilitados. Login anônimo e vinculação manual desligados; confirmação de e-mail ligada. **Cadastro de novos usuários ligado** no Supabase: a restrição a `@axion.com.br` depende do aplicativo (doc 34); **recomendado** validar com um teste anônimo e considerar desligar o cadastro aberto (decisão do Dono).
- **Google Cloud (OAuth):** não inspecionado (exige o console do Google); conferir URIs de redirecionamento autorizados e o tipo de usuário (interno).

## 3. Checklist GO/NO-GO atualizado
| # | Item | Estado |
|---|---|---|
| 1 | CI do commit publicado | **verde** (execução 212, `b452a25`); novos commits locais aguardam um único push |
| 2 | Código do governador de alertas | em correção final (portão antes da outbox, crítico preservado); testes passam |
| 3 | CAIXA-1 | **reconciliada** (doc 36): 198 candidatas, 197 no ACC, 0 rejeitadas; APPLY desnecessário |
| 4 | Ensaio do transporte do executor (Management API, homolog) | **PENDENTE: aguarda você inserir o token** (`scripts\homolog\salvar-token-supabase.ps1`) |
| 5 | Backup do dia e restauração validada | a refazer na véspera da janela (P3) |
| 6 | Vercel: `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=false`, `ACC_OUTBOUND_MODE`, `AXION_APP_BASE_URL` | **pendente de ação/conferência humana** (seção 1) |
| 7 | Auth/Redirects | **OK** (seção 2); Google Cloud pendente |
| 8 | Crons e janela fora de quarta-feira | inventariados (docs 12, 34); data **pendente** |
| 9 | Aceitação com usuários internos | preparada (doc 20, 24); pessoas e data **pendentes** |
| 10 | Cobertura de fontes | 0 OPERACIONAL; Gmail CAIXA-1 praticamente completa para `weg.net`; demais **parcial/não conectada** (doc 27) |
