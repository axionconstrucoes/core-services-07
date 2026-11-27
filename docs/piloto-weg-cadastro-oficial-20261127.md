# Piloto WEG — cadastro oficial de participantes e responsabilidades (27/11/2026)

Decisão da Diretoria (Reynaldo) de 27/11/2026. Substitui atribuições anteriores conflitantes.
Projeto: WEG `00000000-0000-4000-8000-000000000001` (produção `plbcvwostmdmdmrziwmd`).

## Matriz oficial

| Participante | Vínculo WEG (produção) | Área(s) de responsabilidade | Recebe |
|---|---|---|---|
| Carlos Evandro (`carlos.evandro@`) | ACTIVE · ADMINISTRADOR · ADMINISTRATIVO | ADMINISTRATIVO (principal) e ESG_SSMA (adicional), Nível 1 nas duas | alertas administrativos e de SSMA |
| Jaime Ramos (`jaime.ramos@`) | ACTIVE · GERENTE · PLANEJAMENTO | PLANEJAMENTO, Nível 1 | planejamento, cronograma, atrasos e riscos de prazo |
| Carla (`carla@`) | convite PENDING · COLABORADOR · **FINANCEIRO** | FINANCEIRO, Nível 1 (convite) | financeiro, custos e riscos econômicos — após o primeiro acesso e a inclusão autorizada na allowlist (regra de 19/11/2026) |
| Reynaldo (`reynaldo@`) | ACTIVE · ADMINISTRADOR · DIRETORIA | Diretoria/Nível 3 de todas as áreas; Nível 2 substituto do Planejamento (exceção auditada de 18/11) | supervisão de todos os pilares e escalonamentos |
| CRM (`crm@`) | ACTIVE · **LEITURA** · **sem área** | nenhuma (não é responsável por riscos) | cópia institucional obrigatória (Cc) de todo alerta do piloto; caixa de respostas e monitoramento |

Enquanto o convite da Carla estiver pendente, o Nível 1 do FINANCEIRO não tem usuário e a cadeia segue para a Diretoria (Reynaldo).
Qualidade e Jurídico não foram atribuídos a nenhum participante por esta decisão (não existe área QUALIDADE na Matriz; JURIDICO
continua com a Diretoria como responsável direto, atribuição anterior de 18/11 que não foi alterada).

## Alterações efetivamente feitas

Produção (dados, transação única, com auditoria em `audit_log_entries`, 27/11/2026 15:33 UTC):

1. `project_memberships` de `crm@`: ADMINISTRADOR/DIRETORIA → LEITURA/sem área (`MEMBER_ROLE_CHANGED`, valores anteriores no `detail`).
   Efeito: deixa de entrar nas regras por área DIRETORIA (destinatário de revisão de impacto de versão, acesso ao dashboard financeiro)
   e de ser alvo de "ENVIAR PARA" (perfil LEITURA é excluído). Continua membro ACTIVE (respostas registradas com a própria identidade).
2. `project_member_invitations` da Carla: área ADMINISTRATIVO → FINANCEIRO (`MEMBER_INVITATION_AREA_CHANGED`). No primeiro login,
   `handle_new_user` cria o vínculo com a área do convite.

Código (branch `fix/weg-cadastro-oficial-piloto`):

3. `app/api/cron/system-health/route.ts`: alerta técnico de integração ia para `carla@` (fora do piloto e sem relação com Financeiro);
   agora vai só para a Diretoria, com `crm@` em cópia pelo perfil do piloto.
4. `lib/ai/experts/ceo/identity.ts`: mesma correção no texto do CEO IA (`CEO_VERSION` v5 → v6).

Sem alteração (já corretos): Matriz SLA (`sla_area_responsibles`), allowlist do piloto (Reynaldo, Jaime, Carlos), lista fixa
`PILOT_PARTICIPANT_ADDRESSES`, cópia obrigatória `crm@` e exceção do Nível 2 do Planejamento. Nenhum registro histórico foi apagado.
