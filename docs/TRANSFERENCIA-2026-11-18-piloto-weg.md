# Transferência de sessão — Piloto WEG (18/11/2026)

> Repositório público: este relatório não contém credenciais, endereços de e-mail nem nomes de colaboradores.
> Pessoas aparecem pelo papel. Evidências locais (prévias com dados pessoais) ficam fora do repositório, na pasta
> de evidências do PC do escritório/casa: `acc-pr149-evidencias/2026-11-18/`.

## 1. Estado em produção

- Deployment ativo: `dpl_3Me5ngciPNywNUPkFbVfEKjvxaR5` (READY), commit `4c42f04` (merge do #210), alias acc.axion.com.br.
- Migrations: **nenhuma aplicada nesta sessão**. Continuam proibidas: 20261106120000 e 20261106130000.
  Arquivos novos **não aplicados**: `20261119034721_scheduler_pg_cron_dispatch.sql` (PR #203, rascunho) e
  `20261118140000_sla_matrix_rules_unique_active_key.sql` (índice único das regras SLA).
- AXIA: desligada (nenhum provedor de IA habilitado). Envio único de teste: **desarmado**.

## 2. PRs desta sessão

| PR | Estado | Conteúdo |
|---|---|---|
| #198–#201 | mesclados | dry-run real do ciclo WEG; teto de 404 do Gmail; conferência de cópias na crm@; Message-ID real nas respostas |
| #202 | mesclado | logs públicos do Construmanager sem nomes de arquivo |
| #204 / #208 | mesclado / revertido | roteamento temporário do FINANCEIRO (revertido por decisão de escopo) |
| #205, #211 | mesclados | coleta da caixa do titular (recebidos + enviados) e autorização OAuth reservada (só nesta máquina) |
| #206 | mesclado | Construmanager → pipeline documental existente |
| #207, #214, #216 | mesclados | base do indicador financeiro (mesma data de corte), referência do próprio relatório, script de reprocessamento só de exibição (dry-run) |
| #209 | mesclado | áreas informativas (FINANCEIRO sem alertas/SLA/escalonamento) |
| #212 | mesclado | seleção determinística da regra da Matriz + tela sem gerar duplicatas |
| #213, #217 | mesclados | supressão ≠ entrega (livro-razão) + trava de reemissão; texto de reemissão |
| #215, #218, #222 | mesclados | semanas perdidas com checkpoint e classificação por evidência; semana corrente com o mesmo critério; suspensão de comunicação por caso; intake histórico a partir do armazenamento |
| #219 | mesclado | exceção temporária do piloto: Nível 2 do Planejamento → Diretoria (auditável) |
| #220, #224 | mesclados | template operacional (cores por nível, ações laterais, sem faixa de teste, AXIA oculta); Gestor definitivo fora da lista do piloto |
| #221 | mesclado | feriados (nacionais + ES) no cálculo de dias/horas úteis |
| #223, #225, #226 | mesclados | canal SSMA restrito a ações corretivas da WEG; rota liberada ao agendador (Bearer); continuidade de escalonamento SSMA com trava dos níveis históricos |
| #227 | mesclado | verificar respostas antes de escalonar; recebimento × processamento; métricas de CPU das rotas |
| #210 | mesclado | previsão de término e resposta direta pelo corpo do e-mail |
| #203 | **rascunho** | agendador pg_cron/pg_net (2 camadas) + heartbeat/watchdog — **não instalado** |

## 3. O que está ATIVO e comprovado

- **Alertas recorrentes da WEG: ATIVOS** desde 18/11/2026 12:35 UTC (`risk_alerts_enabled=true`, auditoria `RISK_ALERTS_ENABLED`),
  após o dry-run final `44305227653` (sem bloqueios).
- **Primeiro ciclo real** (run `44305451479`, HTTP 200): 2 resumos consolidados (MÉDIO/BAIXO) enviados
  (responsável do Planejamento e Diretoria), Gmail ids `1a1eea9e09ac272c` e `1a1eea9ed2c2816e`.
  Conferidos nos Enviados da crm@ (runs `44306031244`, `44306157173`): From crm@, 1 destinatário esperado, Cc crm@,
  sem Bcc, sem endereço proibido. Isso comprova aceitação pelo Gmail, não entrega na caixa do destinatário.
- **Canal SSMA (ações corretivas da WEG)**: 2 avisos enviados ao responsável de SSMA/ESG em 18/11 05:01 UTC
  (Gmail ids `1a1ed07bcd0f3f30`, `1a1ed07d20600d4a`), conferidos na crm@. **Não repetir.**
- **Teste 22AF936B**: envio confirmado manualmente em 17/11 (Gmail id `1a1eb9a27b30c40c`). **Não repetir.**
- Matriz WEG: Planejamento (Nível 1 responsável + corresponsável Diretoria; Nível 2 = convite do Gestor definitivo,
  com exceção temporária para a Diretoria; Nível 3 Diretoria); SSMA/ESG e Administrativo com o responsável de SSMA
  no Nível 1; FINANCEIRO informativo (titular definitiva por convite). Regras SLA duplicadas desativadas (CRÍTICO 1/1/2 h;
  ALTO 4/4/4 h úteis; MÉDIO 1/1/1 d.u.; BAIXO 3/3/2 d.u.).

## 4. Travas em vigor (não liberar sem decisão específica)

- 4 casos históricos de Planejamento: 1F493F8C e DAC56702 (reemissíveis mediante decisão; prévia pronta);
  757AD4CF e 0A826844 (ausência não comprovada — comunicação suspensa até a integração da caixa do ex-responsável).
- Escalonamentos SSMA históricos das 2 ações (Gestor/Diretoria) travados; prévia de Diretoria pronta.
- Ação SSMA fc99b3f4: descrição indica teste feito pelo celular (sem foto); **origem a confirmar** pelo titular antes de qualquer escalonamento.

## 5. O que NÃO está operacional / limitações

- **Agendador confiável: NÃO instalado.** Coleta, respostas e ciclo dependem do schedule do GitHub (≈4% das execuções
  observadas, intervalos de horas). Incompatível com o SLA crítico (T+61/T+121). Execuções manuais não comprovam automação.
- Verificação de respostas antes de escalonar (#227) roda como "não verificado" enquanto a credencial de leitura da crm@
  não estiver na Vercel.
- Caixas próprias do ex-responsável do Planejamento e do atual: código pronto, **0 importado** (falta consentimento OAuth).
- Construmanager: 199 armazenados → 93 processados, 2 falhas, 1 duplicado, 103 sem extrator, 4 > 50 MB pendentes.
- Cronogramas históricos de 17/08 e 07/09: intake em revisão humana — **não** incorporados como versões.
- Feriados municipais de Linhares não confirmados em fonte oficial; função SQL de prazos SSMA ainda sem feriados.

## 6. Processos em execução

- Nenhum processo local em execução. Workflows agendados no GitHub (schedule): coleta Gmail, workers, semanal
  (inclui ciclo de alertas e respostas), SSMA notifications (hora em hora, escopo restrito), Diário, Construmanager.

## 7. Decisões e consentimentos pendentes

1. Agendador (PR #203): aplicar a migration, criar o token GitHub restrito e gravar os segredos no Vault; plano Vercel
   (Hobby: CPU medida 1–3 h/mês de 4 h; recomendação: Pro).
2. Gravar na Vercel a credencial de leitura da crm@ (`ACC_RISK_ALERTS_INBOUND_*`) para a verificação antes de escalonar.
3. Reemissão dos 2 casos de comparação de cronogramas; escalonamentos SSMA históricos; origem da fc99b3f4.
4. Intervalos de repetição sem política: ação com todos os níveis vencidos; previsão vencida sem conclusão.
5. Consentimento OAuth (somente leitura) dos titulares das caixas do Planejamento — exige conferência do app no Google
   Cloud Console (público Interno/Externo, status de publicação) por quem tem acesso ao projeto.
6. Reprocessamento de exibição das 18 planilhas financeiras (`financial-display-reprocess.yml`, `mode=apply`).
7. Manter ou não o corresponsável da Diretoria no Nível 1 do Planejamento.

## 8. Próximo passo exato para retomar

1. `git fetch origin && git log --oneline -1 origin/main` (esperado ≥ `4c42f04`).
2. Conferir o ciclo: `gh run list --workflow weekly-schedule-email-ingestion.yml --limit 5` e, no banco,
   `select status, count(*) from risk_alert_outbox where project_id='00000000-0000-4000-8000-000000000001' and created_at > now()-interval '1 day' group by 1`.
3. Se houver resposta de colaborador: `gh workflow run weekly-schedule-email-ingestion.yml --ref main -f phase=replies`
   e conferir `RISK_ALERT_REPLY_RECEIVED` / `SSMA_REPLY_PROCESSED` na auditoria.
4. Decidir o agendador (item 7.1) — é o principal impedimento para operação automática compatível com o SLA.
