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

## F. Evidências reais (23/11/2026, atualizado após a decisão da Diretoria)
| Item | Resultado | Evidência |
|---|---|---|
| Push de cef65355 e d0057135 | FEITO só em integration/acc-noturna (HEAD d0057135; main segue 27da839); varredura de segredos sem achados | `git ls-remote` |
| CI do PR #245 no d0057135 | EM ANDAMENTO (Guards e Typecheck rodando; Build ainda não iniciado) na última leitura | página de checks |
| E-mail corporativo de Carlos | carlos.evandro@axion.com.br (perfil ACC; confirmar com ele antes de convidar) | perfil no ACC |
| Vercel: equipe | 1 membro (Reynaldo, OWNER). Convite NÃO enviado: o papel que permite rollback não foi confirmado (a documentação consultada não traz a matriz de permissões; o painel exigiu login e eu não autentico) | list_team_members; login Vercel pendente |
| Vercel: papel mínimo proposto | Developer (ou o menor papel que o painel mostrar com "Rollback"); NÃO Owner. Confirmar no painel de convite antes de enviar | a confirmar por Reynaldo |
| Supabase | Papel mínimo proposto: acesso somente leitura ao projeto de produção (Read-only/Developer conforme o plano); sem Owner/Admin. Não aplicado | a confirmar por Reynaldo |
| GitHub | NÃO verificado: o painel de colaboradores exige permissão de admin do repositório; Carlos precisa abrir o PR #245 e enviar print. Permissão mínima: Read | pendente |
| P0 em acc-homolog | função record_risk_alert_action com md5 do corpo 930f6d75898793479b418950b0053bd9 (igual ao esperado em produção) | SELECT somente leitura |

## G. Ensaio de recuperação em acc-homolog (roteiro; NÃO executado - exige Carlos presente)
Somente homologação (gtadbeaevxglrqkhcwfz). Qualquer operação que altere dados exige autorização específica de Reynaldo antes de rodar. Produção intocada.
1. Identificação de falha: simular (sem alterar dados) um sinal de falha, por exemplo checagem P0 divergente ou 5xx no preview; Carlos registra hora e evidência.
2. Interrupção segura: Carlos pronuncia "PARE"; Eng-1 congela escritas e aciona o kill switch (em homolog), sem mexer em produção.
3. Verificação de backup: hash/tamanho do backup do dia e restauração em banco local descartável; Carlos confere contagens-chave.
4. Recuperação: rollback do preview/homolog para o deployment anterior (Carlos executa, com o acesso Vercel dele) e, se autorizado, restauração dos dados de teste a partir do backup.
5. Verificação P0 pós-recuperação: md5 do corpo da função = 930f6d75898793479b418950b0053bd9, RLS ativa, auditoria preservada.
Aprovação do ensaio: Carlos assina cada passo com hora e print.

## H. Papéis mínimos pesquisados na documentação (23/11/2026; nenhum acesso foi concedido)
**Vercel** (docs Vercel, Instant Rollback e RBAC): rollback e promote são cobertos pelo grupo "Full Production Deployment", que já vem em Owner e Member e é compatível com Developer. A página de Instant Rollback cita Owners, Members e Developers (Pro/Enterprise). Visualizar logs: Viewer do Pro NÃO vê logs; a matriz por papel não renderizou nas páginas lidas (logs de Member/Developer = não declarado). Conclusão: papel mínimo documentado = Developer com a permissão "Full Production Deployment" (não incluída por padrão); o mais baixo que a tem por padrão é Member. NÃO conceder Owner. Pendente: confirmar no painel do convite (somente o OWNER vê). Papéis por projeto exigem Enterprise.
**Supabase** (docs de controle de acesso e backups): papel Developer = leitura de organização e acesso total ao conteúdo do projeto, sem alterar configurações; vê e restaura backups agendados e PITR; executa SQL de escrita; vê chaves de API. Read-Only = só SELECT e só VISUALIZA backups (não baixa nem restaura). Project-scoped e Read-Only exigem Team/Enterprise.
- Permanente (validação P0, migrations, integridade, acompanhamento): Read-Only, se o plano permitir; caso contrário, Developer só no projeto de produção (que já permite escrita, portanto risco maior).
- Temporária (recuperação): Developer (restaura backup/PITR) concedida só na janela e removida ao final; "Restore do projeto" exige Administrator, não conceder.
- Plano do projeto de produção não verificado: confirmar se é Pro/Team (PITR/backups e papéis dependem disso).
**GitHub:** não verificado; evidência exigida de Carlos (print do PR #245). Permissão mínima: Read.
**Situação:** acessos e ensaio NÃO concluídos. Fonte das informações: páginas de documentação lidas (conteúdo externo, tratado só como dado).
