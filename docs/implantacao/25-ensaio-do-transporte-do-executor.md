# 25 - Ensaio do transporte do executor pela Management API (somente acc-homolog)

Objetivo: provar, **no `acc-homolog`**, o caminho que a produção vai usar para aplicar as ondas (Management API do Supabase com token pessoal), que ainda não foi exercitado: até agora o executor foi ensaiado por conexão direta (`--alvo pg`). Condição da decisão D1: o registro atômico (opção b) só vale se este transporte for validado. Nada neste documento toca a produção.

## 1. Segurança do token (leia antes de criar)
Um token pessoal do Supabase age com os poderes **da sua conta em todos os projetos da organização, inclusive a produção**. O executor só aceita o ref do `acc-homolog` no modo `homolog`, mas o token em si não é restrito. Por isso:
- Crie um token **novo e exclusivo** para este ensaio (nome: `acc-executor-ensaio-homolog`) e, se o painel oferecer, com a menor validade.
- **Revogue-o assim que o ensaio terminar.**
- Para a janela de produção, crie **outro** token na hora; nunca reutilize este.
- O token nunca deve aparecer em terminal, conversa, log ou arquivo versionado. O script abaixo o recebe sem eco e o grava cifrado com DPAPI (só o seu usuário do Windows, só esta máquina).

## 2. O que você faz (3 passos)
1. No painel do Supabase: avatar da conta > **Access Tokens** > **Generate new token**, nome `acc-executor-ensaio-homolog`. Copie o token (aparece uma vez).
2. Em uma janela normal do PowerShell (não pelo Claude), na raiz do repositório:
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\homolog\salvar-token-supabase.ps1`
   Cole o token no prompt (sem eco). O script valida ao vivo **só contra o `acc-homolog`** e grava `supabase-pat.dpapi`. Se o formato ou o projeto não baterem, não grava nada.
3. Avise: "token guardado".

## 3. O que será executado depois (pelo Claude, sem ver o token)
Todos pelo runner guardado (`scripts\homolog\executar-homolog.ps1 -Etapa executor-api -Extra "..."`), alvo fixo `gtadbeaevxglrqkhcwfz`:
| # | Comando (`--alvo homolog`) | Prova |
|---|---|---|
| 1 | `--verificar` | a Management API aceita o token, executa SQL somente leitura e o P0 e o histórico conferem (206 linhas, hash esperado) |
| 2 | `--ensaio-homolog` | atomicidade pela API real: falha no último comando, bloco `DO`, `statement_timeout`, sucesso compensado; histórico final igual ao inicial |
| 3 | `--dry-run --ondas N` e, se houver onda pendente no homolog, aplicação de uma onda trivial | corpo, limite de 1 MB e latência por arquivo |
Mede-se: latência por chamada, tamanho de corpo aceito, mensagens de erro da API (SQL inválido, timeout, token inválido) e comportamento em falha **incerta** (queda de rede) com a conferência do estado real.

## 4. Critérios de aprovação
- `--verificar` e `--ensaio-homolog` com 0 falhas, P0 `930f6d75...` antes e depois, histórico igual ao inicial.
- Nenhum valor de token, `Bearer` ou string de conexão em qualquer log (os logs passam pela redação do executor; conferir por varredura).
- Latência registrada; se alguma chamada passar de 30 s, avaliar o `statement_timeout`.
- **Se o transporte falhar ou se comportar de forma diferente**, a alternativa para a produção é `psql -1 -f` com `insert` na mesma transação (doc 12, seção 3), com a conexão de manutenção fornecida por você na hora; a decisão (b) permanece válida, só muda o transporte.

## 5. Depois do ensaio
1. **Revogar o token** no painel (Access Tokens).
2. Apagar o arquivo cifrado: `Remove-Item (Join-Path $env:SystemDrive 'vibe\homolog\secret\supabase-pat.dpapi')`.
3. Registrar o resultado no doc 18 (ciclo 4) e atualizar G3 do doc 22.

## 6. Observação
Nesta máquina o `fetch` do Node alcança `api.supabase.com` (testado com credencial inválida: HTTP 401), diferentemente dos hosts de projeto `*.supabase.co`, onde o `fetch` falhou e o `curl` funcionou (ver doc 18). Se o executor falhar por rede, o primeiro diagnóstico é esse.
