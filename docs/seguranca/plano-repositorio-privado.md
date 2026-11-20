# Plano para tornar `axionconstrucoes/core-services-07` privado (preparado em 20/11/2026, não executado)

Nada deste plano foi executado. A mudança de visibilidade, as migrations e qualquer alteração de produção dependem de
autorização explícita.

## 1. Situação verificada

| Item | Situação | Como foi verificado |
|---|---|---|
| Visibilidade do repositório | **Pública** | API pública do GitHub, sem login |
| Supabase (org "Axion") | Plano **Pro** | Conector Supabase (`get_organization`) |
| Agendador no Supabase (pg_cron) | **Ativo em produção** desde 19/11: 11 jobs, todos com heartbeat recente e sem falha atual | `cron.job` e `acc_scheduler_heartbeats` (só leitura) |
| Jobs HTTP simples | **Já migrados**: `risk-alerts` (a cada 2 min) e `ssma-notifications` (a cada 5 min) chamam a Vercel direto do Supabase | Idem |
| Fallback no GitHub desses jobs | Desligado pela variável `ACC_SCHEDULER_PG_CRON_ENABLED=true` (`if:` nos workflows) | Código dos workflows |
| Vercel | Plano **não confirmado** (a API não expõe). Sinais de Hobby: nome padrão da equipe, crons só diários, nenhuma cobrança retornada | Conector Vercel |
| GitHub (plano da organização, colaboradores, proteção de branch) | **Não confirmado**: exige login de administrador; `gh` não está instalado e o conector GitHub falhou | — |
| Segredos no histórico | Nenhum segredo real encontrado (varredura manual de 1.045 commits) | Relatório anterior |

## 2. Consumo de GitHub Actions (medido)

Últimas 23,3 h (19–20/11), já com o agendador do Supabase disparando os workflows:

| Workflow | Execuções/dia | Min/dia (aprox.) |
|---|---:|---:|
| Gmail Inbound Sync (15 em 15 min) | 95 | 369 |
| Weekly Schedule Email Ingestion (10 em 10 min) | 142 | 296 |
| MPP Document Worker (10 em 10 min) | 142 | 275 |
| Document Processing Worker (10 em 10 min) | 141 | 264 |
| CI de PR e demais | ~50 | ~130 |
| **Total** | **~570** | **~1.340 → ~41.000 min/mês** |

Em repositório público isso não custa nada. Em privado:

- Plano gratuito da organização: 2.000 min/mês incluídos. Plano Team: 3.000 min/mês.
- Excedente em Linux: cerca de US$ 0,006–0,008/min, a confirmar em *Settings → Billing* do GitHub.
- Com o consumo atual, **sem otimização**: ~39.000 min excedentes, ou seja, **US$ 230–310/mês**.
- Com limite de gasto em US$ 0, os workflows **param** quando a cota acaba. Isso interromperia a ingestão de e-mails e documentos.

## 3. Reduzir o consumo antes de tornar privado

Os alertas de risco e as notificações SSMA **não dependem** destes passos: já rodam pelo Supabase e pela Vercel. A
periodicidade e a confiabilidade deles ficam preservadas.

1. **Disparo condicional dos workers de documentos.** É uma migration nova, aplicada só com autorização.
   - `acc_scheduler_dispatch_workflow` passa a disparar `document-worker` e `mpp-worker` somente quando houver item pendente na fila de processamento.
   - Quando não houver, registra o heartbeat como `IDLE` e não chama o GitHub.
   - Economia esperada: a maior parte dos ~540 min/dia, porque a fila costuma estar vazia. Medir antes de aplicar.
2. **Ingestão semanal (`weekly-all`).**
   - Disparar só quando houver e-mail novo na caixa monitorada; o mesmo critério de fila vale para o Gmail.
   - Ou reduzir de 10 para 30 min. Isso afeta a latência da ingestão do cronograma semanal, não os alertas.
3. **Gmail Inbound Sync.**
   - Manter os 15 min, porque alimenta respostas aos alertas.
   - Avaliar mover a etapa HTTP para uma rota da Vercel (limite de 300 s por execução). Antes disso, medir a duração das execuções (~3,9 min médios hoje); se passar do limite, não mover.
4. **Meta:** ficar abaixo de 2.000–3.000 min/mês. Medir por 7 dias depois de cada passo, com a mesma consulta usada neste plano (API de execuções do GitHub).

## 4. Pré-requisitos de plataforma

1. **Vercel:** confirmar o plano em *Settings → Billing*.
   - Se for Hobby: migrar para **Pro** (US$ 20 por membro/mês) **antes** da mudança.
   - Motivos: o Hobby não faz deploy automático de repositório privado de organização e é restrito a uso não comercial.
2. **GitHub:** confirmar o plano da organização, a lista de colaboradores e times, e a proteção da branch `main` com os checks obrigatórios.
3. **Token do agendador:** o PAT usado pelo pg_cron para disparar workflows precisa ter acesso ao repositório privado (*Actions: read/write*, *Metadata: read*).
4. **Varredura de segredos:**
   - Ativar gitleaks no CI (diff do PR) e uma varredura semanal do histórico.
   - Em repositório privado, a varredura e o bloqueio de push nativos do GitHub passam a ser pagos.
5. **Dados de terceiros (WEG):**
   - Anonimizar por PR as fixtures `apps/web/lib/integrations/construmanager/fixtures/*.weg-34164.json` e os e-mails pessoais `@weg.net`/`@axion.com.br` em testes e documentos.
   - Avaliar com o jurídico a confidencialidade com a WEG e a LGPD.
   - Reescrever o histórico é uma decisão separada: é destrutivo e exige force push e pedido ao suporte do GitHub.
6. **Documentação:**
   - `docs/SETUP-NOVO-PC.md` e `scripts/setup-new-pc.ps1` passam a exigir login no clone.
   - Atualizar também o nome antigo do repositório (redirecionado).

## 5. Execução da mudança (com autorização)

1. Concluir as seções 3 e 4 e anotar o consumo da última semana.
2. Em *Settings → General → Danger Zone → Change visibility → Private*: ação do proprietário da organização.
3. Validar na primeira hora:
   - um commit de teste gera deploy de preview na Vercel;
   - um PR roda o CI completo;
   - `acc_scheduler_heartbeats` continua com `last_success_at` atualizado em todos os jobs `GITHUB_WORKFLOW`;
   - nenhum erro `DISPATCH_HTTP_404` (token sem acesso).
4. Acompanhar o consumo diário de minutos por 7 dias.
5. **Reversão:** voltar para público pela mesma tela. Não há perda de dados. Os workflows retomam sem custo.

## 6. Riscos residuais

- O que já foi público pode ter sido clonado. Tornar privado não apaga cópias externas nem referências de PR.
- Sem o disparo condicional, o custo de Actions em privado é alto e cresce com a frequência do agendador.
