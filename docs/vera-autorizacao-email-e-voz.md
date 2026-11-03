# AXIA — Assistente ACC, autorização de e-mails por obra e voz ElevenLabs

> **Renomeação:** o nome público da assistente passou de VERA para **AXIA**. Por compatibilidade e rastreabilidade foram mantidos os identificadores técnicos: rota `/vera`, parâmetro `?vera=abrir`, evento `vera:open`, arquivos e símbolos `vera-*`/`Vera*`, CID do e-mail, chave `acc-vera-voz`, id `vera` da base de conhecimento, nomes dos docs e da branch. "VERA" ainda é aceita como apelido nas perguntas à assistente.

Estado: implementado em branch local (`feat/vera-autorizacoes-email`). **Nada publicado.** A voz (ElevenLabs) **não foi testada com chamada real**.


## 1. AXIA — Assistente ACC
- Nome definitivo: **AXIA — Assistente ACC**. Imagem: `apps/web/public/assistente/ajuda-acc.png` (256 px) e `ajuda-acc-email.png` (96 px, usada nos e-mails) — **ícone neutro provisório derivado do ícone oficial da marca ACC**. A arte definitiva da AXIA só entra depois de comprovadas a origem e os direitos de uso da imagem (autoria/licença e, se houver pessoa retratada, consentimento); nenhuma imagem de origem não comprovada deve ser versionada.
- "Fale com a AXIA" (foto circular + texto) no canto superior direito de todas as telas da obra (`TopBar`) e no cabeçalho do PWA do SSMA; em telas estreitas do ACC web, só a foto (nome acessível preservado).
- Abre a caixa de conversa; responde só com a base de conhecimento curada (`lib/assistant`), sem alterar dados. Exige login e participação na obra.
- Teclado: Tab alcança o gatilho, Enter abre (foco no campo), Esc fecha e devolve o foco.
- Links de e-mail abrem a AXIA: `/{obra}/ajuda?vera=abrir&contexto=alerta|providencia|ssma|geral`, `/autorizacao-email/{id}?vera=abrir` e `/vera` (ajuda geral). Só ids (UUID) e um tipo fixo na URL.

## 2. Autorização de acesso aos e-mails da obra
**O que é:** registro do consentimento (aceite, recusa, revogação) do colaborador para o ACC usar a conta de e-mail dele em UMA obra, com a versão do texto e o escopo apresentados.
**O que NÃO é:** a conexão da conta Google. Essa continua sendo o token OAuth guardado nos segredos do servidor (situação em `email_accounts.status`). O aceite no ACC não conecta nem desconecta a conta.

Fatos usados no texto (conferidos no código por `scripts/test-email-authorization.mjs`):
- Escopo OAuth: `gmail.readonly` (somente leitura). **O Google concede leitura da caixa inteira**; a restrição à obra é feita pelos filtros do ACC, nunca pelo Google.
- A sincronização consulta o Gmail por remetentes dos domínios autorizados da obra e período configurado e mantém só o que passa no escopo da obra (palavras-chave, assuntos, domínios do cliente, participantes). Mensagens fora do escopo são lidas em memória e não gravadas.

Fluxo: administrador solicita em **Autorizações** → e-mail individual (nome, conta, obra, finalidade, permissões, filtros) → o colaborador abre o link (GET sem efeito) → escolhe → confirma explicitamente (checkbox obrigatória + botão) → registro com obra, usuário, conta, decisão, data/hora, versão do texto e escopo. Revogação pelo colaborador (na própria página) ou por administrador (aba). Histórico imutável. Revogação no Google explicada à parte (https://myaccount.google.com/permissions; administrador do Workspace pelo Console).

Banco (`supabase/migrations/20261029120000_email_access_authorizations.sql`): duas tabelas (autorizações e eventos), RLS (titular ou administrador da obra), escrita só por 3 funções `SECURITY DEFINER` com `search_path` vazio, trigger de imutabilidade. Teste real: `scripts/sql/run-email-authorization-test.mjs` (22 verificações).

Aba **Autorizações**: só administradores — item de menu restrito, `notFound()` no servidor e RLS/funções no banco.

**Decisão pendente:** a sincronização ainda NÃO consulta essas autorizações. Recusa e revogação ficam registradas e visíveis ao administrador, que decide a conexão. Fazer a sincronização respeitar recusas/revogações (bloquear só quando houver recusa/revogação explícita; sem registro, nada muda) exige alterar o worker `gmail-inbound-sync` e precisa de autorização própria.

## 3. AXIA nos e-mails
Cabeçalho "Fale com a AXIA" (foto circular à direita + link) aplicado no ponto único de envio (`applyVeraEmailHeader`, depois da guarda do modo piloto), portanto em **todos** os e-mails que passam por `getEmailProvider()`: alerta individual, lote, resumo semanal, escalonamento SLA, acidente SSMA, lembretes de providência, ciclo de risco, solicitações de ação, saúde do sistema, revisão de impacto de versão e a autorização. Conteúdo, assuntos, botões, cores e agrupamento por obra não mudam. Alternativa legível: texto-link e `alt` da foto; versão em texto simples ganha uma linha com o endereço.

## 4. Voz da AXIA — ElevenLabs

A voz usa **ElevenLabs** (o piloto do Azure foi removido). Detalhes, custo estimado e configuração segura da chave em `docs/vera-voz-elevenlabs.md`.
Estado: implementada e testada só com serviço simulado; nenhuma chamada real; desligada até `ELEVENLABS_ENABLED`, `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_IDS` serem configuradas por você.

## 5. Plano de publicação (proposto)
1. PR da migration + teste SQL; aplicar em produção só após backup e dry-run (`supabase db push --dry-run`), como nas migrations anteriores.
2. PR do restante (AXIA, autorização, e-mails, Dashboard); deploy; verificar rotas protegidas e a aba com uma conta administradora real; enviar a primeira solicitação a um colaborador de teste (modo piloto: o e-mail vai à caixa de teste).
3. Só depois: decidir a sincronização respeitar recusas e a configuração da voz (ElevenLabs).
