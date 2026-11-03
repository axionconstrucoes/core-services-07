# Ensaio de alertas críticos — preparação (NÃO EXECUTADO)

Roteiro para repetir o ensaio controlado descrito em `docs/teste-controlado-alertas-criticos.md` em ambiente isolado.
Este documento só prepara: nada aqui foi executado, nenhum e-mail foi enviado e nenhum banco remoto foi consultado.

## Regra de escalonamento que o ensaio deve confirmar (CRÍTICO)
Fonte: `apps/web/lib/sla/default-matrix.ts`, `compute-escalation.ts`, testes em `scripts/test-sla-escalation.mjs`.

| Instante | Evento esperado |
|---|---|
| T0 | Responsável recebe o alerta. Prazo para assumir: 1 h corrida (`assumeDeadlineValue=1`, `CLOCK_HOURS`) |
| T+1 h (vencido) | `RESPONSAVEL → ESCALAO_1` (gestor). A pendência persiste; o responsável continua sendo o responsável |
| T+2 h | `ESCALAO_1 → DIRETORIA` (`escalation2AfterValue=1`, contada do vencimento do prazo de assumir) |
| T+2 h … T+4 h | Nível DIRETORIA, `topLevelReached=false`. Nenhum e-mail novo; ciclos repetidos são idempotentes (chave `…:ESCALATION:<nível>:<usuário>`); o caso segue aberto e acompanhado |
| após T+4 h (`boardAfterValue=2`, contado da subida à Diretoria) | `TOP_LEVEL_REACHED` registrado **uma única vez** (evento de sistema + `top_level_reached_at`). Sem destinatário, sem e-mail, estado preservado. Ciclos seguintes: 0 ações |

Precedência da matriz (`resolve-matrix-rule.ts`): regra do projeto **da área** > regra geral do projeto (`area = null`) > padrão do código.
Regras por área com prazos maiores devem ser conferidas no ambiente isolado; nenhum dado de projeto real faz parte do repositório.

## Pré-condições obrigatórias (todas verificáveis sem rede)
1. Container `supabase_db_acc-disposable-*` (nome validado por `scripts/sql/lib/disposable-target.mjs`), com todas as migrations aplicadas (ver `supabase/migrations`) e 0 tabelas sem RLS.
2. Servidor de teste com **as variáveis do Supabase sobrescritas** para o banco/stack descartável (`NEXT_PUBLIC_SUPABASE_URL` em `127.0.0.1`, chaves locais). Nunca carregar um `.env.local` real: iniciar a partir de uma cópia sem `.env*`.
3. `ACC_OUTBOUND_MODE=pilot`, `ACC_PILOT_RECIPIENT=crm@axion.com.br`, `ACC_EMAIL_ONLY_RECIPIENT=crm@axion.com.br`.
   Sem Gmail real configurado, usar `AXION_EMAIL_PROVIDER=fake` para a rodada seca; e-mail real só com autorização explícita.
4. `ACC_WEEKLY_REPORTS_ENABLED` ausente/`false` (impede os ciclos agendados).
5. Antes de qualquer envio: provar que 5 destinatários pretendidos distintos resolvem todos para a caixa de teste (`test-pilot-outbound-guard.mjs`, `test-only-recipient-guard.mjs`).
6. Prazos deslocados **só no banco isolado** (relógio simulado); nada global.

## WhatsApp (simulado) no ensaio
- Desligado por padrão (`ACC_WHATSAPP_ENABLED` ausente/`false`). Para observar o comportamento no ensaio isolado: `ACC_WHATSAPP_ENABLED=true`, `ACC_WHATSAPP_PROVIDER=simulated` (único aceito). Nenhuma mensagem real existe: o provedor só registra em `whatsapp_simulated_messages`.
- Só alerta CRÍTICO que chega à DIRETORIA, e só com telefone internacional da PESSOA cadastrado e canal autorizado (Usuários & Permissões, administrador), com vínculo ativo no projeto e papel de Diretoria no momento do envio. Sem isso: `SKIPPED` com o motivo.
- Esperado na repetição dos ciclos: nenhuma segunda linha (chave `wa:<origem>:ESCALATION:DIRETORIA:<usuário>`).

## Sequência
Mesma do relatório de teste controlado (passos 1–13). Acrescentar: verificar T+2 h … T+4 h (sem e-mail, sem novo evento), `TOP_LEVEL_REACHED` uma única vez e 0 ações na repetição.

## Condições de parada
- Qualquer destino efetivo diferente da caixa de teste; URL do Supabase não local; container fora do padrão; qualquer chamada de rede para provedor de IA.

## Antes de executar
Depende de autorização expressa do responsável: rodada seca (provider fake) primeiro; e-mails reais à caixa de teste só depois.
