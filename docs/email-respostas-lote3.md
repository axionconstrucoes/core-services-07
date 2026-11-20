# Respostas por e-mail — Lote 3 (todas as áreas)

Escopo: todo alerta operacional pode ser tratado **direto pelo e-mail**, sem abrir o ACC no navegador. Esta nota resume o que o Lote 3
acrescentou; o contrato completo das ações RESOLVIDO / EM ANDAMENTO / ENVIAR PARA continua em `docs/` (N3) e nos comentários de
`apps/web/lib/email-replies/`.

## Comandos (primeira linha do texto novo da resposta)

| Comando | Efeito | Altera o item? |
|---|---|---|
| `RESOLVIDO: <o que foi feito>` (+ anexo em ALTO/CRÍTICO; foto no SSMA) | conclui | sim |
| `EM ANDAMENTO: <providência>` + linha `Previsão: dd/mm/aaaa [hh:mm]` | registra andamento | sim (sem mudar prazos) |
| `ENVIAR PARA: <e-mail exato ou nome completo>` + `Justificativa: …` | transfere | sim |
| `ESPECIALISTA: <pergunta>` (novo) | consulta escrita ao Expert da **área** do item | **não** (nem estado, nem responsável, nem previsão, nem prazo; não consome o token) |

## ESPECIALISTA por e-mail

* **Desligado por padrão.** `ACC_EMAIL_SPECIALIST_ENABLED=true` (valor exato) liga o atalho `mailto` e o processamento. Pré-requisito:
  migration `20261121173000_email_specialist_consultations.sql` aplicada. Sem a chave a pergunta é recusada com explicação ("Nada foi
  alterado") e nada é gravado.
* **Roteamento**: área do item → Expert (Planejamento→`planning-director`, Engenharia→`engineering-director`, Jurídico→`legal-consultant`,
  Comercial/Financeiro/Orçamento→`commercial-director`, SSMA/ESG→`esg-director`). Administrativo, Diretoria e itens sem área
  (alerta de contrato) usam o **tema** da pergunta; vários temas → curadoria multi-Expert existente; sem tema → o remetente é
  orientado (nunca cai em Planejamento por falta de classificação). **A AXIA nunca é destino** (ela é só o assistente de uso da suíte).
* **IA com limites**: o consultor reserva 1 unidade do limite diário (usuário/obra, tipo `RISK_CYCLE`) na fronteira do provedor; sem
  reserva a IA não é chamada e o remetente é avisado. Resposta sempre rotulada como **recomendação**, com revisão humana obrigatória em
  ALTO/CRÍTICO (campo `requires_human_review` forçado no banco).
* **Segurança**: mesmas regras do canal (domínio corporativo, e-mail exato do perfil, membro ATIVO, DMARC/DKIM alinhado, perfil ≠ LEITURA,
  ator do item ou Administrador, limite por remetente/hora) + revalidação no banco. A pergunta fica só em `email_specialist_consultations`
  (nunca em log/auditoria; a auditoria `EMAIL_SPECIALIST_CONSULT_*` guarda ids, Expert, área e canal).
* **Entrega**: recibo ("pergunta registrada") e resposta enviados **uma vez** cada, na conversa do remetente (rota `cron/risk-alerts`,
  mesmo provedor e travas do piloto).

## Token por item

Todas as origens emitem token próprio por item (hash gravado antes do envio, 30 dias): risco (`RISK_CASE`), SLA, resumo semanal, contrato
(individual e por item do lote) e SSMA. RESOLVIDO e ENVIAR PARA consomem; EM ANDAMENTO e ESPECIALISTA não. Rejeições com mensagem clara:
`TOKEN_EXPIRED`, `TOKEN_ALREADY_USED`, `TOKEN_NOT_OWNER`, `ITEM_CLOSED`, `COMMAND_AMBIGUOUS`, `SPECIALIST_QUESTION_REQUIRED`,
`SPECIALIST_AREA_UNKNOWN`, `SPECIALIST_DISABLED`, etc. — sempre "NÃO aplicado / nada foi alterado".

### ACC_EMAIL_TOKEN_OWNER_STRICT (desligado por padrão)

`ACC_EMAIL_TOKEN_OWNER_STRICT=true` (valor exato) vincula o token ao destinatário original: só o **dono** do token, o **responsável atual**
do item (ou o encaminhado ativo, no risco) ou um **Administrador** respondem. Efeito colateral a decidir antes de ligar: encaminhar o
e-mail a outro colega que seja ator do item deixa de funcionar (o caminho formal é o ENVIAR PARA). Padrão desligado = comportamento anterior.

## SSMA

ENVIAR PARA e ESPECIALISTA (botões de link do registro SSMA) agora são **ativos por padrão** quando o registro é identificado; o desligador é
`ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED=false`. Os formulários existem no app SSMA e têm limites cobertos por testes SQL.

## Outlook / Gmail

Botões ativos têm retângulo **VML** condicional (`<!--[if mso]>`) clicável por inteiro; os demais clientes usam o `<a>` de sempre. Célula
com `bgcolor` (não depende de `border-radius`). Tema claro fixo (`color-scheme: light only`) contra a inversão automática. Imagens `cid:`
saem inline (`multipart/related`, `Content-ID`, `Content-Disposition: inline`). Validação visual em Outlook desktop/web/mobile e Gmail
fica no roteiro de homologação real (`checklist-gmail-outlook-crm.md`).

## Matriz área × emissor × ação

Gerada por `scripts/test-email-lote3-areas-matrix.mjs` (cada linha é uma asserção). `OK` = botões na ordem, atalhos mailto e resposta aceita
pelo decisor do canal; ESPECIALISTA mostra o Expert acionado.

| Área | Emissor | RESOLVIDO | EM ANDAMENTO | ENVIAR PARA | ESPECIALISTA |
|---|---|---|---|---|---|
| Planejamento | risco imediato / SLA / resumo semanal | OK | OK | OK | planning-director |
| Jurídico | risco imediato / SLA / resumo semanal | OK | OK | OK | legal-consultant |
| SSMA/ESG | risco imediato / SLA / resumo semanal | OK | OK | OK | esg-director |
| SSMA/ESG | ação corretiva SSMA (atraso, confirmação, crítico) | OK (exige foto) | OK | OK | esg-director |
| Engenharia | risco imediato / SLA / resumo semanal | OK | OK | OK | engineering-director |
| Comercial | risco imediato / SLA / resumo semanal | OK | OK | OK | commercial-director |
| Financeiro | risco imediato / SLA / resumo semanal | OK (*) | OK (*) | OK (*) | commercial-director |
| Orçamento | risco imediato / SLA / resumo semanal | OK | OK | OK | commercial-director |
| Administrativo | risco imediato / SLA / resumo semanal | OK | OK | OK | orienta (sem Expert dedicado: cite o tema) |
| Diretoria | risco imediato / SLA / resumo semanal | OK | OK | OK | orienta (sem Expert dedicado: cite o tema) |
| (sem área no modelo) | alerta de contrato individual e em lote | OK | OK | OK | por tema (legal/planning/commercial/engineering/esg) ou orienta |
| SSMA/ESG, Diretoria/TI | acidente SSMA, falha operacional, impacto de versão (informativos) | n/a | n/a | n/a | n/a — decisão pendente |

(*) Financeiro é **área informativa no piloto** (política existente): a resposta é registrada sem ação automática.

## Configuração: servidor e worker (Frente C)

As chaves `ACC_EMAIL_SPECIALIST_ENABLED`, `ACC_EMAIL_TOKEN_OWNER_STRICT`, `ACC_EMAIL_WORKSPACE_TENANT_DOMAINS`,
`ACC_EMAIL_TRUSTED_AUTHSERV_IDS` e `ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR` são lidas pela fase `replies` do **worker**
(`weekly-schedule-email-ingestion.yml`) e, as duas primeiras, também pelo **servidor** (atalho no e-mail, rota `cron/risk-alerts`).
O workflow agora repassa as cinco como `vars.*` do GitHub (vazio = padrão seguro); os valores devem ser IDÊNTICOS aos do servidor.
Teste: `scripts/test-email-worker-env-wiring.mjs` (no `test:email`).

A allowlist do provider em modo piloto é fixa em código (`crm@axion.com.br`); `ACC_PILOT_ADDITIONAL_RECIPIENTS` é inerte e
`ACC_PILOT_ALLOWED_RECIPIENTS` não é variável de ambiente. A allowlist de respostas de risco no piloto vem do banco
(`project_weekly_schedule_ingestion_configs.pilot_recipient_allowlist_user_ids`). A migration do ESPECIALISTA é a
`20261121173000_email_specialist_consultations.sql`.
