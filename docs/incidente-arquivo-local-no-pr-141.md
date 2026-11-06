# Incidente: script local de envio real versionado por engano no PR #141 (05/11/2026)

## O que aconteceu
`scripts/tmp-send-real-batch.mjs` é um script **local, não versionado** (o CI proíbe versioná-lo: job "Guards"). Ele entrou no commit `c4bea56` da branch `feat/ssma-esg-acoes-notificacoes-perfis` porque um `git add -A apps scripts` (feito para incluir testes novos) também incluiu o arquivo não rastreado que já existia na pasta `scripts/`. O CI (Guards) acusou no PR #141; o arquivo foi retirado do índice em `eda4423`, mas **continua nos commits anteriores da branch**. Nenhum outro PR contém o arquivo (o PR #140 e a `main` não o têm).

## Conteúdo exposto (conferido commit a commit)
- **Sem segredos:** nenhuma chave, token, senha ou credencial. O script lê tudo de variáveis de ambiente e **recusa** rodar fora das travas do piloto.
- Contém: os endereços internos `reynaldo@axion.com.br` e `crm@axion.com.br` (já presentes em 24 e 33 arquivos da `main`), o id do projeto TESTE (já público), **um id de usuário (UUID de perfil)** e **um id de evento do projeto TESTE** — estes dois últimos **não existiam antes na `main`**. Não permitem acesso por si; o isolamento é por RLS.
- Risco avaliado: **baixo** (identificadores internos de ambiente de teste). Nenhuma rotação de credencial é necessária.

## Exposição pública e o que ainda é recuperável
O repositório `axionconstrucoes/core-services-07` é **PÚBLICO**. O arquivo está acessível por:
- a branch remota `feat/ssma-esg-acoes-notificacoes-perfis` (commits `c4bea56` … `eda4423`);
- `refs/pull/141/head` e `refs/pull/141/merge` (PR #141) — **estas referências do GitHub permanecem mesmo depois de fechar o PR ou apagar/reescrever a branch**;
- qualquer clone/fork/cache que tenha buscado esses commits, e a URL direta do commit pelo SHA (o GitHub mantém commits órfãos acessíveis por SHA até a coleta de lixo; apagar a branch não os remove).
**Squash merge NÃO remove nada disso:** só evita que o arquivo entre na história da `main`; o conteúdo anterior continua recuperável pelo PR #141 e pelos SHAs. Remoção efetiva só pelo **suporte do GitHub** (pedido de remoção de dados sensíveis em cache de PR/commits órfãos). Dado o conteúdo (sem segredos), a recomendação é **não** tratar como vazamento de credencial; abrir o pedido ao GitHub é opcional.

## Correção feita
- Arquivo local **preservado** (continua só no disco, não rastreado).
- Branch limpa `feat/ssma-esg-limpa`, a partir de `origin/main`, com **todos os commits necessários e o arquivo em nenhum deles** (reescrita só desta branch; árvore final idêntica à anterior exceto o arquivo; verificado com `git log -- scripts/tmp-send-real-batch.mjs` vazio).
- Nova prática: staging **sempre por caminhos explícitos**, nunca `git add -A` em pastas com arquivos locais; o CI Guards continua barrando.
