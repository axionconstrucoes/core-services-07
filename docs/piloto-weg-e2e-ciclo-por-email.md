# Piloto WEG: ciclo completo de tratamento de riscos por e-mail (prova encadeada)

Teste: `scripts/test-piloto-weg-e2e-realpg.mjs` (registrado em `scripts/test-scripts.list`; pula sem `ACC_REALPG_URL`, não roda no CI).
Ambiente: PostgreSQL 17 real local (127.0.0.1:55434), base descartável `acc_e2e_*` com TODAS as migrations aplicadas e apagada no fim.
Nenhuma rede (fetch e sockets bloqueados, exceto o PostgreSQL local), nenhum e-mail real, nenhuma chamada a Gmail/Graph/IA.

**Rótulo honesto: tudo é fixture + transporte falso. Nenhuma mensagem real foi lida ou enviada. Supabase operacional e acc-homolog não foram tocados.**

## Diagrama do ciclo

```
 [Gmail FALSO: caixas carla@ e carlos@]            elo 1
        | motor mail-universal (runMailboxSync, leitor Gmail somente-leitura, transporte falso)
        v   dedupe por chave canônica; cc/bcc/involved_domains; regra weg.net + subdomínios
 public.emails (+ email_message_sources, reconciliação, exclusões)      <- evidência original, nunca alterada
        |
        | runEmailPipeline (apply)                  elos 2, 3, 4
        |   acc_resolve_external_party (RPC real)   -> parte: cliente / gerenciadora (delegação) / fornecedor / ambígua / candidato
        |   vínculo org x projeto + contract_ref     -> LINKED | UNLINKED | CANDIDATE | AMBIGUOUS
        |   classificação                            -> oficialidade, pilares, área funcional, SEM DADOS, injection_flag
        v
 email_message_classifications + email_risk_signals (indício, não fato) + external_contact_candidates (PENDING)
        |
        | email_risk_signal_review (RPC real; GESTOR confirma/descarta; CANDIDATO fica PENDENTE)     elo 5
        | loadEmailRiskSignalRows + collectEmailRiskCases (só LINKED + ANALYZED + indício)
        v
 runRiskAlertCycle (REAL) -> caso EMAIL + ação SLA (prazo aprovado) -> outbox -> FakeEmailProvider
        |                         e-mail: 4 botões RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA,
        |                         Reply-To opaco, 3 mailto com token por item (email_reply_tokens)
        v
 [resposta recebida (fixture) do destinatário]       elo 6
        | processAlertReplies (REAL): correlação por token -> autenticação do remetente -> autorização
        |   -> comando (EM ANDAMENTO + Previsão | RESOLVIDO) -> applyAlertAction (máquina de estados da tela)
        |   negativos: UNAUTHORIZED_REPLY; comando ambíguo -> REVIEW_REQUIRED
        v
 record_risk_alert_action (RPC real, hotfix P0)      elo 7
        -> risk_alert_cases.state / sla_actions / risk_alert_action_events (ator, origem EMAIL, idempotency_key, message_id)
        -> audit_log_entries / risk_alert_outbox (confirmação) / token consumido uma vez
        -> confirmação ao autor pelo FakeEmailProvider (sucesso ou rejeição explicada)
```

## O que cada elo prova (resultado: 33 OK, 0 FAIL)

| Elo | Checks | Prova |
|---|---|---|
| 1 Ingestão | 4 | Recebido de gerenciadora e fornecedor com weg.net em To/Cc; enviado pela Axion com Cc, Bcc e `sub.weg.net`; mensagem sem weg.net excluída com motivo; identidade universo = processadas + excluídas + falhas; mesma mensagem em duas caixas = 1 linha + 2 origens (`DUPLICATE_CROSS_MAILBOX`); reexecução não duplica; colunas `cc_addresses`/`bcc_addresses`/`involved_domains` preenchidas (migration 20261201100000) e flag `ACC_EMAILS_PARTICIPANT_COLUMNS` ligada/desligada. |
| 2 Participantes | 5 | `acc_resolve_external_party` real: cliente, gerenciadora com `delegation_scope` (OS/RNC dentro da delegação), fornecedor; domínio compartilhado = ambíguo e NÃO vincula; contato novo e remetente de `sub.weg.net` viram candidato PENDING (nunca confirmado); domínios conhecidos não viram candidato; `emails` intacto. |
| 3 Projeto/contrato | 3 | Mensagem que cita CT-SINT-1 fica LINKED ao projeto fixo `00000000-0000-4000-8000-000000000001` e a base da decisão cita o contrato; mensagem com CT-SINT-B (outro projeto) fica UNLINKED, sem projeto, sem sinais; fornecedor de outra obra fica CANDIDATE. |
| 4 Classificação | 4 | Oficialidade por parte; pilares só PRAZO/CUSTO/SEGURANCA/QUALIDADE com área funcional COMERCIAL/JURIDICO à parte; sinais com `evidence_ref` rastreável (`email:<id>#...`); `SEM_DADOS` quando falta impacto; prompt injection marcada, oficialidade não elevada, sentença suspeita não vira sinal. |
| 5 Alerta | 5 | Revisão humana real (GESTOR confirma; CANDIDATO recusa CONFIRM com `PENDING_LINK_VALIDATION`; colaborador sem delegação recusado; DISCARD exige justificativa; auditoria append-only); coletor só gera caso de LINKED+ANALYZED (candidato, ambíguo, UNLINKED, descartado ficam fora); ciclo real cria caso EMAIL + ação SLA com prazo aprovado (ALTO 4h úteis); alerta enfileirado e "enviado" pelo FakeEmailProvider; MIME com os 4 botões em ordem, link autenticado do caso, Reply-To opaco e mailto com token em `email_reply_tokens`; segundo ciclo não duplica. |
| 6 Resposta | 5 | Remetente desconhecido e membro que não é destinatário: `UNAUTHORIZED_REPLY`, nada alterado, nada enviado a desconhecido; comando ambíguo: `REVIEW_REQUIRED` ("Múltiplas intenções operacionais"), nada aplicado; `EM ANDAMENTO` + `Previsão` aplicado (TAKING_ACTION, previsão válida); `RESOLVIDO` com descrição e evidência aplicado; confirmações geradas e "enviadas" pelo FakeEmailProvider. |
| 7 Resolução/trilha | 7 | Estado do caso e da ação SLA no PostgreSQL pela mesma máquina de estados; RESOLVIDO não toca RNC/garantia/sinistro (row_version e updated_at idênticos); `risk_alert_action_events` com ator, origem EMAIL, `message_id`, `idempotency_key` única e timestamp; `audit_log_entries`; token de uso único (replay com outra mensagem recusado, caso e trilha inalterados; mesma mensagem idempotente); chave de evento duplicada recusada; md5 do hotfix P0 `930f6d75898793479b418950b0053bd9` intacto no início e no fim, sem EXECUTE para anon/PUBLIC; `emails` byte a byte intacto. |

## O que é REAL e o que é FIXTURE

- REAL: migrations, tabelas, RPCs (`acc_resolve_external_party`, `email_risk_signal_review`, `record_risk_alert_action`), motor de ingestão, pipeline de classificação, coletor, ciclo de alertas, processador de respostas, máquina de estados, tokens por item (`email_reply_tokens`).
- FIXTURE: todas as mensagens, organizações, usuários e domínios (`*-sint.com`, `weg.net` apenas como texto); transporte Gmail falso; FakeEmailProvider; autenticação do remetente simulada por cabeçalho `Authentication-Results` fixture.
- Espelho: o ciclo e a outbox usam o store em memória (`scripts/lib/weg-alert-sim`), como nos demais testes do piloto. Casos, ações SLA, eventos, mensagens de resposta e tokens são espelhados no PostgreSQL, e a transição (`applyTransition`) passa pelo RPC real ANTES de alterar a memória. A outbox dos alertas iniciais não é gravada em `risk_alert_outbox` (somente as confirmações vindas do RPC e do enfileiramento de rejeição).

## Bloqueios e lacunas encontrados (nenhum P0 novo)

- **B1 (P2, comportamento fail-closed):** a ingestão elege `weg.net` e subdomínios (`sub.weg.net`), mas `acc_resolve_external_party` casa domínio EXATO. Mensagem de `sub.weg.net` entra em `emails` e vira candidato CANDIDATE/PENDING; não herda o vínculo do cliente. Seguro, porém exige cadastrar o subdomínio na organização para o vínculo automático.
- **B2 (P2, lacuna de rastreabilidade):** `acc_resolve_external_party` não devolve `delegation_clause_ref` e o contexto do pipeline não carrega cláusulas; `clause_ref` da classificação fica nulo e o alerta não mostra "Cláusula usada", embora o vínculo cite o contrato (`contract_ref`) na base do vínculo. Correção exigiria alterar RPC/contexto (migration), fora do escopo.
- **B3 (informativo):** o coletor não exige confirmação humana. Sinal LINKED+ANALYZED vira caso mesmo PENDENTE (o caso nasce como indício). A confirmação (`email_risk_signal_review`) só impede o CRÍTICO sem confirmação e o descarte retira o sinal. Sinal CANDIDATO permanece sem caso por regra de vínculo, e o `CONFIRM` dele é recusado.
- **B4 (informativo):** `email_alert_actions` é o mecanismo legado de ações por token de e-mail para eventos contratuais/SLA/pedidos; o caminho de riscos por e-mail grava em `risk_alert_action_events` e `audit_log_entries`. O teste não usa `email_alert_actions` de propósito.
- **B5 (informativo):** a RNC da gerenciadora com sinal `QUALIDADE_DEFEITO` sai como MÉDIO (consolidado, sem ação SLA individual) pela regra determinística; o ciclo de resposta foi provado no caso ALTO (atraso do fornecedor, PLANEJAMENTO).
- **B6 (observação):** RESOLVIDO de caso ALTO com evidência só em texto (sem anexo) foi aceito e levou o caso a RESOLVED, embora o atalho mailto indique anexo obrigatório (`REQUIRED_FILE`). Aceito pelo código atual; a decisão de exigir anexo é de produto.

## O que NÃO foi provado

- Entrega real: nenhum Gmail/Graph, DKIM/SPF/DMARC reais, `Authentication-Results` real do Workspace, escopos de delegação de domínio.
- Renderização real em clientes de e-mail (Outlook/Gmail) e a tela autenticada (`/alertas/<id>`); só o HTML/MIME gerado.
- Persistência do ciclo/outbox pelo `supabase-store` (o store do ciclo é em memória; o PostgreSQL recebe o espelho e o RPC).
- ENVIAR PARA e ESPECIALISTA por e-mail ponta a ponta (cobertos por `test-risk-email-commands-p2.mjs` e `test-email-specialist-realpg.mjs`); aqui só os botões presentes no MIME.
- Escalonamento por prazo vencido durante o ciclo, anexos reais como evidência, RLS por perfil (coberta nos testes `*-realpg` próprios).
- Dados reais da WEG e volume/concorrência.

## Como executar

Com o PostgreSQL local de homologação ativo e as variáveis `ACC_REALPG_URL` (127.0.0.1:55434) e `ACC_REALPG_PKG_DIR` definidas:
`node --import ./scripts/lib/block-live-ai.mjs scripts/test-piloto-weg-e2e-realpg.mjs`
Sem `ACC_REALPG_URL` o teste é pulado (exit 0).
