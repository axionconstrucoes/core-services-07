# 40 - Checklist simples de validação independente (Carlos Evandro, Eng-2) - janela 28/11/2026 09h BRT

Regra: Carlos valida e pode INTERROMPER. Nada começa sem a autorização final específica da Diretoria. Marcar só com evidência (print, saída, hora).

## A. Antes (até 27/11) - requisitos de acesso (comprovar; "provável" não vale)
| Acesso | Estado verificado em 23/11 | Comprovação exigida |
|---|---|---|
| ACC (login @axion.com.br, obra WEG) | COMPROVADO: membros ACTIVE (ADMINISTRADOR/ADMINISTRATIVO e GERENTE/SSMA-ESG) | Login real de Carlos no ACC |
| Vercel (equipe) | NÃO ATENDIDO: a equipe tem 1 membro (Reynaldo, OWNER); Carlos não é membro | Convite ao Carlos (papel mínimo para ver deployments e fazer rollback) e print dele no projeto |
| Supabase (organização Axion) | NÃO COMPROVADO (não verificável por mim) | Print dele no projeto de produção + consulta de leitura de teste |
| GitHub (PR #245, checks) | NÃO COMPROVADO | Print dele abrindo o PR #245 |
| Recuperação (rollback Vercel e restauração do backup) | NÃO COMPROVADO | Ensaio: ele executa em homologação (acc-homolog) o rollback e a restauração com Reynaldo observando |
Convidar membros da Vercel/Supabase é mudança de permissão corporativa: exige autorização da Diretoria.

## B. Pontos de APROVAÇÃO (Carlos diz "OK" por escrito antes de seguir)
1. CI verde no commit do PR #245 e `main` em 27da839.
2. Backup do dia existe (hash/tamanho) e a restauração local foi validada.
3. Congelamento avisado; crons sob controle (resumo semanal e system-health).
4. Cada onda concluída sem erro; P0 (função de risco, RLS, auditoria) validado.
5. Após deploy: deployment READY, login Google, obra WEG abre, sem erro 5xx.
6. Alertas em modo piloto: nenhum e-mail real a terceiros.

## C. Pontos de INTERRUPÇÃO (qualquer um = pare e chame a Diretoria)
- CI vermelha ou commit diferente do aprovado. - Backup ou restauração não validados.
- Onda com erro ou P0 divergente. - Deploy com erro, login falhando ou 5xx.
- Qualquer e-mail real fora do piloto, ou alerta acima dos limites (10/h, 30/dia).
- Qualquer sinal de dados de outra obra expostos.
Freios: `ACC_ALERT_KILL_SWITCH`; remover cron; rollback Vercel.

## D. RECUPERAÇÃO (só com decisão da Diretoria)
1. Aplicação: Vercel -> Deployments -> promover o deployment anterior da main (27da839).
2. Alertas: kill switch ou limpar `ACC_ALERT_ENABLED_PROJECTS`.
3. Banco: ondas aditivas, falha reverte a própria transação; restauração do backup do dia só por decisão da Diretoria, executada por Eng-1 com Carlos validando contagens e P0.
4. Registrar hora, causa e evidências.

## E. Aceitação 02/12/2026 (Reynaldo, Carlos, Jaime)
Seguir o checklist do doc 38, seção 12. Não programar a janela de publicação para quarta-feira.
