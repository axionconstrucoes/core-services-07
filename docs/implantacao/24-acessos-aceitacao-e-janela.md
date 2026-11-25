# 24 - Acessos para a aceitação com usuários reais e para a janela de produção (PREPARAÇÃO; nada foi criado)

Status: preparado em 22/11/2026 (decisão D7). **Nenhuma conta, vínculo ou credencial foi criada**: a criação é feita pelo Dono/Eng. TI, na hora, pelo próprio aplicativo. Este documento diz quais acessos são necessários, quem os concede e como revogar. Princípios: **um acesso por pessoa, mínimo necessário, nenhuma senha ou chave compartilhada, tudo revogado ao fim**. Nenhum dado real de terceiros em evidências (doc 20).

## 1. Contas de teste por perfil (aceitação, doc 20, pré-requisito P-03)
Cada conta pertence a uma **pessoa real presente**, com e-mail corporativo do domínio autorizado (login Google, como o aplicativo usa). O vínculo é concedido **pela tela de Usuários da obra TESTE** (`/[projectId]/usuarios`), por um ADMINISTRADOR, nunca por SQL direto.
| # | Perfil / situação | Obra | Para provar | Pessoa (preencher) | E-mail (preencher) | Concede | Revogar em |
|---|---|---|---|---|---|---|---|
| 1 | ADMINISTRADOR | TESTE | tudo do módulo de administração; criar os demais vínculos | | | Dono | fim da aceitação |
| 2 | GESTOR | TESTE | nível MANAGE: o que grava e o que não grava | | | ADMIN (1) | idem |
| 3 | GERENTE | TESTE | mesmo nível do GESTOR (MANAGE); confirmar equivalência | | | ADMIN (1) | idem |
| 4 | COLABORADOR | TESTE | nível REGISTER: registra, não decide | | | ADMIN (1) | idem |
| 5 | LEITURA | TESTE | só lê; qualquer gravação é P0 | | | ADMIN (1) | idem |
| 6 | Sem vínculo algum | nenhuma | não vê obra nenhuma | | | (não conceder) | — |
| 7 | Membro só de outra obra | TESTE-2 | isolamento: não vê a TESTE | | | Dono | idem |
| 8 | Auditor (leitura de auditoria) | TESTE | consulta de auditoria (bloco H) | | | ADMIN (1) | idem |
Observações do roteiro a respeitar: GESTOR e GERENTE são o mesmo nível na matriz; a leitura da auditoria vale para qualquer membro da obra; para os testes de e-mail, só caixas listadas na autorização P-01 e a caixa institucional `crm@axion.com.br`.

## 2. Como conceder e como revogar (sem SQL direto)
1. ADMINISTRADOR (1) abre `/[projectId]/usuarios` da obra **TESTE** e adiciona cada pessoa com o perfil da tabela.
2. Cada testador entra com **janela anônima ou perfil de navegador próprio** (doc 20, P-12) para não derrubar a sessão de outro.
3. Ao fim da aceitação, o mesmo ADMINISTRADOR **remove ou inativa** cada vínculo (`/[projectId]/usuarios`) e registra a hora. Os registros de auditoria permanecem (são imutáveis).
4. Contas das linhas 6 e 7 não recebem vínculo na TESTE.

## 3. Acessos operacionais da janela (Eng. TI e Dono)
| Acesso | Quem | Para quê | Como é concedido | Como é encerrado |
|---|---|---|---|---|
| Conexão de manutenção do banco de produção (`CONN`) | Eng-1 | congelamento, trava, conferências, rollbacks | fornecida **pelo responsável na hora**, em sessão do próprio Eng-1; nunca em arquivo, chat ou histórico compartilhado | sessão encerrada; senha rotacionada se houver dúvida |
| Token pessoal do Supabase (`PAT`) | Eng-1 | executor via Management API | criado **para a janela** (doc 25), guardado em DPAPI | **revogado** no painel ao fim |
| Merge do PR #245 | Dono ou quem ele designar | publicar na `main` | permissão no GitHub; aprovação registrada no PR | — |
| Habilitar/desabilitar workflows (`gh`) | Eng-1 | pausar e retomar o que escreve | sessão do `gh` do Eng-1 | logout ao fim |
| Painel da Vercel (somente leitura) | Eng-2 | conferir deployment e `request_rollback` se preciso | papel mínimo da equipe | — |
| Painel do Supabase (somente leitura) | Eng-2 | conferir jobs e saúde | papel mínimo | — |
| Pasta de evidências fora do repositório | Eng-2 | registros da janela | pasta com acesso restrito ao usuário | arquivada com o dono |
Regras: ninguém usa a credencial de outra pessoa; credenciais **nunca** entram em chat, e-mail, captura de tela ou documento; o Claude não recebe nenhuma delas (ele opera apenas pelos runners guardados, que leem DPAPI localmente).

## 4. Antes da janela (conferir)
- [ ] Tabela da seção 1 preenchida pelo Dono (pessoas e e-mails).
- [ ] Obra TESTE e TESTE-2 existem e estão marcadas como teste (P-02).
- [ ] Vínculos concedidos pelo ADMINISTRADOR na véspera; cada pessoa fez um login de teste.
- [ ] Eng-1 e Eng-2 designados; o Dono presente; canal de comunicação definido.
- [ ] Plano de revogação anotado (seção 2, passo 3, e doc 25, seção 5).
