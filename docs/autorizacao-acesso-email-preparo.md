# Autorização individual de acesso ao e-mail corporativo — preparo

Estado: PREPARADO, NADA ENVIADO, NADA APLICADO EM PRODUÇÃO. Não confundir com a autorização POR OBRA (`lib/email-authorization`, tabela `email_access_authorizations`, migration 20261029120000): esta é por COLABORADOR (pessoa).

## Implementado

- Minuta do e-mail (v1): `docs/autorizacao-acesso-email-minuta.md` (finalidade, dados, abrangência, duração, revogação, base LGPD, resposta explícita, aviso de que o aceite não concede acesso técnico).
- Regras puras: `apps/web/lib/email-access-authorizations/` (`types.ts`, `rules.ts`, `index.ts`; sem React/rede/banco/envio).
  - Estados: SOLICITADA, ACEITE_REGISTRADO, RECUSADA, REVOGADA, EXPIRADA (expiração derivada de datas). `consentStatus` separado de `technicalAuthorization` (NENHUMA | OAUTH_CONFIRMADA).
  - `classifyReply`: só "Autorizo" / "Não autorizo" explícitos e curtos; citações e cabeçalhos da mensagem original são ignorados; condição, pergunta, texto longo, vazio ou contradição => PENDENTE_REVISAO (nunca aceite). Recusa explícita prevalece.
  - `linkReplyToRequest`: exige In-Reply-To/References com o Message-ID da solicitação E remetente igual ao colaborador. Outro remetente não vale (a resposta fica guardada para revisão).
  - `applyReply` preserva remetente, Message-ID, In-Reply-To, References e hash SHA-256 do corpo; resposta tardia/ambígua/posterior ao aceite não altera o estado.
  - `canCollect(auth, now)`: só com aceite registrado + OAuth confirmado + não revogada + não expirada. Aceite sozinho => false. Revogação impede novas coletas.
  - Padrões: validade da solicitação 15 dias; duração do acesso 90 dias.
- Migration (NÃO aplicada): `supabase/migrations/20261106120000_email_access_authorizations.sql` — 4 tabelas `collaborator_email_access_{requests,replies,technical,revocations}`; RLS forçada; leitura/insert só Administrador (`is_any_project_admin()`); anon sem acesso; service_role grava; triggers bloqueiam UPDATE/DELETE/TRUNCATE (histórico imutável; revogação = nova linha); índices únicos (Message-ID da solicitação e da resposta, 1 confirmação técnica e 1 revogação por solicitação); sem RPC SECURITY DEFINER. Aditiva e idempotente.
  - Nota: as tabelas têm prefixo `collaborator_` para não colidir com `email_access_authorizations` (por obra), já existente.
  - Nota: `is_any_project_admin()` significa Administrador de QUALQUER obra (não há papel global no modelo atual). Se for preciso restringir a um conjunto menor de pessoas, trocar o predicado antes de aplicar.
- Testes: `scripts/test-email-access-authorizations.mjs` (puro; em `test:scripts`) e `scripts/test-email-access-authorizations-sql.mjs` (PGlite; em `test:sql`).

## Falta

1. Envio real da solicitação (usar o Mailer existente, com guarda de destinatário; guardar o Message-ID e gravar a solicitação). Nenhum envio foi criado.
2. Ingestão das respostas (extrair Message-ID, In-Reply-To, References, From e corpo; checar SPF/DKIM/DMARC como no fluxo do piloto) e gravação em `..._replies` via service_role.
3. Tela do Administrador (listar solicitações, revisar PENDENTE_REVISAO, registrar confirmação técnica e revogação).
4. Integração OAuth Google Workspace e vínculo da confirmação técnica à solicitação; o coletor deve chamar `canCollect` antes de cada ciclo.
5. Subpasta AUTORIZAÇÕES com acesso restrito no Drive para arquivar evidências (não criada; ver pendência de acesso ao Drive abaixo).
6. Revisão jurídica/DPO do texto v1; política de retenção do que já foi coletado após revogação.

## Riscos

- Escopo OAuth `gmail.readonly` é amplo; a restrição por pasta/assunto é do ACC, não do Google (a minuta declara isso).
- Resposta com cliente que não preserva cabeçalhos de threading (sem In-Reply-To) cairá em revisão manual; é o comportamento seguro.
- Remetente pode ser falsificado: exigir autenticação do remetente na ingestão (item 2).
- Predicado de Administrador é "de qualquer obra" (ver nota).
- O corpo da resposta completo não é guardado na tabela (só hash e metadados em `headers`); o original deve ser mantido no inventário de e-mails/Drive para evidência.

## Decisão pendente

Aplicar ou não a migration 20261106120000 (e quando). Não aplicada; depende de decisão do Administrador após revisão do predicado de acesso e do texto. Aplicação deve seguir o procedimento usual de migrations do repo (supabase/migrations), nunca só pelo Dashboard.

## Google Drive (leitura)

Tentada a localização da pasta SSMA-ESG do ACC e de uma subpasta AUTORIZAÇÕES: o conector `google-drive` respondeu "Incompatible auth server: does not support dynamic client registration" (autenticação do conector não concluída). Nada foi consultado, criado ou alterado. Pendente: autenticar o conector (ou informar o ID/URL da pasta) para listar permissões e verificar link público.
