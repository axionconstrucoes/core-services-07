# Retomada — Piloto WEG (envio único) — 2026-11-13

Documento público: não contém segredos, tokens, e-mails, identificadores de pessoas nem valores de configuração sensíveis. Os valores reais ficam apenas na Vercel (Production) e no banco DEV.

Nenhum e-mail real foi enviado até este registro. O primeiro envio real **não está autorizado**.

## Commit e PRs
- `origin/main` = `18284c9` (PR #184). Integrados: #180 (`eda41af`), #181 (`1182d5f`, cliente OAuth isolado opcional), #182 (`dfe0bdb`, gate pré-rede para PENDING), #183 (`28bdac5`, destino exclusivo + seleção de 1 destinatário), #184 (`18284c9`, exatamente 1 mensagem elegível + armamento duplo caso/destinatário).
- Abertos fora do piloto: #164, #137 (protocolo de sincronização entre computadores).

## Deployment (Vercel, projeto `axion-contract-intelligence-5d3g`)
- Produção atual: `dpl_F87bJyqiYp4sJTAoy4Z4Dw7yAvsU`, READY, redeploy oficial do commit `18284c9` (origem `dpl_2qY2RnkJS8Zi6jiVPhkWmppJdTZm`), feito para incorporar o token e o armamento. O alias de produção aponta para ele.
- Banco vinculado: Supabase DEV.

## Variáveis (Production; valores nunca registrados)
- Token OAuth do remetente do piloto: instalado, tipo Sensitive. E-mail do remetente: configurado, Sensitive.
- Caso e destinatário do piloto: **ARMADOS** (duas variáveis `ACC_PILOT_SINGLE_ALERT_CASE_ID` e `ACC_PILOT_SINGLE_ALERT_RECIPIENT_ID`; valores consultáveis no painel da Vercel). O caso era `DESARMADO` antes.
- `ACC_PROJECT_PILOT_TEST_GROUP` vazio (sem grupo). Destino físico exclusivo: caixa interna de teste da AXION.

## Dry-run oficial pós-redeploy (run 43512401640, main, `18284c9`)
`DRY_RUN`, sem bloqueios, 1 destinatário `WOULD_RETRY`, `sent=0`, `failed=0`, `risk_alerts_enabled=false` (inalterada).

## Outbox (DEV) — 3 linhas do caso de teste (chave `PILOT_SINGLE`)
Inalteradas (reconfirmado em 2026-11-14): `PENDING`, 1 tentativa, sem `provider_message_id`, sem `sent_at`.

## Testes (branch do #184)
`test-pilot-single-alert` 22 OK; `test:alerts` e `test:email` exit 0; `tsc` e `eslint` limpos; CI do #184 verde. Build local do worktree falha só por junction de `node_modules` (Turbopack); o Build do CI é o gate. Postgres real indisponível (Docker parado).

## Pendências
1. **Autorização final do responsável** para UM envio real, via workflow `pilot-single-alert.yml` (`mode=send`, com `case_id`, `recipient_user_id` e a confirmação textual exigida pelo workflow). Os valores dos parâmetros constam na Vercel/banco DEV, não aqui.
2. Logo após o envio: voltar a variável do caso a `DESARMADO`, remover/neutralizar a do destinatário (exige novo deployment para valer); verificar entrega, auditoria, outbox e respostas.
3. Não fazer: migrations, coleta histórica de 18 meses, deploy manual fora do combinado, force push, IA AXIA em produção, usar `scripts/tmp-send-real-batch.mjs` (envia e-mail real com IDs fixos).
4. Regras: sem `git push` sem autorização explícita; nunca expor tokens; o token fica só na Vercel (não é preciso `.env.local` para operar o piloto; ele é gitignored e não é transferido).
