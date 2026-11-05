# SSMA/ESG — validação de uso remoto, sincronização de fotos e indicadores (05/11/2026)

Critério de aceite mantido em todas as etapas: **Reynaldo acessa acc.axion.com.br de outro PC autorizado e continua o trabalho com o computador do escritório desligado.**

## 1. Verificação remota em produção — 17/17

Script de validação (conta real, projeto TESTE, produção): `remote-session-test.mjs` (fora do repositório; usa a sessão do navegador sem exibir token).

| # | Checagem | Resultado |
|---|---|---|
| 1–3 | Sessão 1 autenticada; cookies de sessão; token recuperado do navegador | OK |
| 4–6 | Registro SSMA criado em produção (RPC `ssma_field_record_submit`); reenvio não duplica; 1 linha no banco | OK |
| 7 | Navegador novo **sem login**: a página do projeto redireciona para `/login` | OK |
| 8–9 | Navegador novo (perfil vazio): lista de obras e Dashboard do projeto vêm do servidor | OK |
| 10–11 | Registro criado na sessão 1 recuperado na tela SSMA do ACC e pelo banco, com os mesmos dados | OK |
| 12 | Nada depende de `localStorage`/fila do navegador | OK |
| 13–17 | Chave pública não lê; gravar sem login = 401; em nome de outro usuário = `USER_MISMATCH`; em obra sem vínculo = `PROJECT_ACCESS_DENIED`; AXIA sem sessão = 307 | OK |

A falha da execução anterior (item 7) era do **teste**, não do app: um Chrome de teste antigo continuou aberto na mesma porta e reaproveitou os cookies da execução anterior. O teste agora usa porta livre verificada, perfil novo e encerra o navegador por perfil. O app sempre redirecionou (confirmado por `curl`: 307 para `/login?next=…`).

## 2. Onde a foto fica e por que o GitHub aparece

Ver `docs/modulo-seguranca-pwa.md` (“Operação sem sinal”). Resumo: foto no IndexedDB do aparelho → Storage `project-documents` + `ssma_field_record_photos` (autoridade) por envio automático do app (ao salvar, ao reconectar, ao voltar à aba, a cada 30 s). O GitHub só participa do **espelho no Google Drive** das fotos dos *formulários* (`ssma_submission_photos`), porque as credenciais do Drive estão nos secrets do GitHub e não na Vercel. É cópia/recuperação, não proteção.

## 3. O que mudou

- **Confirmação de recebimento** por foto (`confirmPhoto`: lê de volta a linha do servidor e compara hash e tamanho); arquivo local só sai do aparelho depois de todas as fotos confirmadas.
- **Estado por foto na tela**: Pendente no aparelho → Enviando → Sincronizada → Falha no envio (Registros e Envios).
- **Duplicidade**: `23505` (mesma foto já registrada no registro) deixa de ser erro e passa pela confirmação.
- **Dashboard SSMA estruturado** (`lib/ssma/dashboard-metrics.ts`): acidentes por campo `afastamento` do checklist `ocorrencia-acidente` (sem regex em texto livre), ocorrências de campo, ações corretivas abertas/em atraso (trilha B), obrigações ESG em aberto; **zero verdadeiro ≠ sem dado**.
- Nenhuma migration nova foi necessária (a RPC já verifica o objeto no Storage; a leitura de confirmação usa a RLS existente).

## 4. Validação ponta a ponta (app real + produção)

App compilado localmente (`next build`/`next start`) apontando para o Supabase de produção, navegador com rede **realmente cortada** e religada:

| Passo | Resultado |
|---|---|
| App de campo abre com a sessão em perfil de navegador novo | OK |
| Sem conexão: registro “Salvo no aparelho” e foto “Pendente no aparelho” (Registros e Envios) | OK |
| Sem conexão: nada no banco de produção | OK |
| Ao reconectar: envio automático; foto “Sincronizada” | OK |
| Produção: 1 registro (obra TESTE, autor = usuário da sessão) e 1 foto com hash e tamanho idênticos ao arquivo | OK |
| Storage de produção devolve o arquivo idêntico | OK |
| Reenvio manual não duplica registro nem foto | OK |
| 2ª sessão (produção, perfil novo): painel SSMA do ACC lista o registro; a foto abre por URL assinada (HTTP 200, bytes idênticos) | OK |
| Sem login a foto não abre; chave pública não lê o banco nem baixa do Storage | OK |

Registros de teste mantidos em produção (não apagados; marcados `[TESTE REMOTO …]`), projeto TESTE: `d2d07588-c051-43e8-aea8-770fd9c6c3b2` (sem foto) e `b67b7bfc-09e1-4605-9353-6303cc95c96e` (com foto). Total em produção: 2 registros de teste.

## 5. Testes que exigem aparelho real (NÃO realizados)

- iPhone/Safari: instalar na Tela de Início, câmera, IndexedDB com 5+ fotos, limpeza de dados do site pelo iOS, reabrir sem sinal.
- Android/Chrome: instalação (“Instalar app”), câmera, modo avião durante o envio e reconexão em rede móvel instável.
- Casca do app aberta sem rede com o app autenticado (só o mecanismo do service worker foi provado).
- Fotos grandes (15 MB × 20) em 4G.

## 6. Bloqueios que exigem acesso

- Credenciais do Google Drive na Vercel (ou um token do GitHub para disparar o workflow sob demanda) — só necessário para acelerar o espelho no Drive dos formulários; não afeta o uso remoto.
- Contas reais de teste com perfil LEITURA e de não-membro, para provar a recusa por perfil em produção (hoje coberta pelos testes de banco).
- Conector Supabase autenticado (migration do orçamento da AXIA, fora do escopo SSMA).
