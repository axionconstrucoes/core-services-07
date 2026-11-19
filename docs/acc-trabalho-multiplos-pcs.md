# ACC — trabalho seguro em diferentes computadores

Este procedimento permite alternar entre escritório, casa e notebook usando **GitHub como fonte de código**. Não é necessário manter o PC anterior ligado. Os serviços de produção continuam em Vercel/Supabase; este protocolo **não** faz deploy nem altera bancos.

## Primeira vez em cada PC

1. Abra PowerShell na pasta do repositório: `cd C:\VIBE\PROJETOS\axion-contract-intelligence` (adapte se a pasta for diferente).
2. Confirme o acesso ao GitHub (`git remote -v`) e a identidade Git (`git config user.name`; `git config user.email`).
3. Rode `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\acc-sync-pcs.ps1 -Acao inicio`.
4. Se houver alterações locais, stashes ou worktrees, pare e avalie o que deve ser preservado. O script nunca apaga nem guarda automaticamente mudanças.
5. Se a branch estiver limpa e somente atrás do upstream, use `-Acao inicio -Atualizar` para atualizar apenas via **fast-forward**.

## Ao terminar o trabalho

1. Rode `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\acc-sync-pcs.ps1 -Acao encerrar`.
2. Revise `git status`, `git diff` e `git diff --cached`; **não inclua arquivos .env, chaves, contratos ou dados privados**.
3. Crie commits na branch de trabalho (nunca diretamente em `main`).
4. Quando `behind=0`, `ahead>0` e tudo estiver limpo, opcionalmente execute `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\acc-sync-pcs.ps1 -Acao encerrar -Publicar`.
5. Abra um PR. Aguarde a validação e faça merge conforme as regras do projeto.

## No outro computador

Inicie na pasta do repositório, execute `-Acao inicio`, confira a branch e o upstream. Faça checkout da branch correta **somente depois de revisar o estado local**. Se a branch estiver limpa e atrás, rode `-Acao inicio -Atualizar`. Não use `git pull --rebase` em worktree sujo, `reset --hard`, `clean -fd` ou `push --force` como rotina.

## Trabalho que GitHub não sincroniza

- Alterações ainda não commitadas, arquivos não rastreados, stashes, worktrees e commits de branches não publicados.
- Arquivos ignorados, `.env.local`, credenciais, bancos Docker locais, arquivos grandes ou dados de teste.
- Sessão/autenticação do Claude Code e configurações de cada computador.

Esses itens exigem transporte seguro independente ou reconstrução documentada. **Nunca versionar segredos.** Se houver trabalho não publicado no PC anterior, não considere a troca concluída. Confirme primeiro que o branch/commit correspondente está no remoto.

## Limites e segurança

O script valida o remote, consulta SHA/branch/status/stashes/worktrees, executa `fetch` apenas em `inicio`, e só atualiza quando solicitado com `-Atualizar` em condições seguras. `-Publicar` só dá push de commits já revisados, em branch não protegida, sem alterações locais nem divergência remota. Não faz commit automático, stash, merge na main, deploy, migração ou mudanças em produção.

Critério para trabalho remoto validado: repetir em dois PCs distintos **uma alteração não sensível** via branch → commit → push → checkout/fast-forward no segundo PC → testes → PR. Registrar apenas hashes e resultados; não capturar segredos em logs.
