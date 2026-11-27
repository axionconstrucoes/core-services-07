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

---

## REV.05 (27/11/2026) — decisões do proprietário, substituem a matriz acima onde conflitarem

| Participante | Vínculo WEG | Responsabilidade | Recebe |
|---|---|---|---|
| Reynaldo | ADMINISTRADOR · DIRETORIA | Nível 1 em DIRETORIA, JURIDICO, ORCAMENTO e **FINANCEIRO (provisório)**; Diretoria nas demais; Nível 2 substituto do Planejamento | supervisão, escalonamentos e alertas técnicos de falha de integração |
| Carlos Evandro | ADMINISTRADOR (mantido no piloto) · ADMINISTRATIVO | Nível 1 em ADMINISTRATIVO e ESG_SSMA | alertas administrativos e de SSMA; nada de Planejamento |
| Jaime Ramos | GERENTE · PLANEJAMENTO | Nível 1 em PLANEJAMENTO | prazo e cronograma |
| crm@ | LEITURA · sem área | nenhuma | cópia obrigatória e monitoramento; não elegível em ENVIAR PARA (LEITURA) |

Alterações em produção (27/11/2026, transação única, cada uma com `audit_log_entries`):

5. FINANCEIRO: Nível 1 = Reynaldo (antes convite da Carla); Diretoria limpa para não escalar à mesma pessoa (`SLA_AREA_RESPONSIBLES_UPDATED`).
   A área continua **INFORMATIVA** (registro de 18/11): os casos financeiros são registrados e visíveis, mas não geram e-mail.
   Os 8 casos financeiros existentes foram preservados sem alteração.
6. Carla: convite cancelado logicamente (`MEMBER_INVITATION_CANCELLED`), com área FINANCEIRO preservada no registro. Sem isso o primeiro
   login a incluiria automaticamente na WEG (`handle_new_user` ativa convites PENDING). Nova inclusão = novo convite autorizado.
7. axion@axion.com.br: convite ADMINISTRADOR/DIRETORIA cancelado e conta de e-mail `CONNECTED` → `NOT_CONNECTED` (nunca sincronizou,
   sem configuração vinculada). Não há usuário de autenticação, perfil nem vínculo ativo. Permanece em `PILOT_FORBIDDEN_ADDRESSES`.
   Histórico preservado: 1 lote de alerta enviado em 23/09/2026 e menções em textos de documentos.

Código: `scripts/test-weg-rev05-cadastro.mjs` (participantes, bloqueios, cópia crm@, destinatário técnico, acesso financeiro) e correção
de `scripts/test-f5-d-email-alerts-sql.mjs` (previsão relativa ao relógio do teste em vez da data fixa 2026-11-25).

Rollback dos dados: reverter cada linha para os valores anteriores registrados no `detail` da auditoria (convites voltam a PENDING com
`cancelled_at` nulo; FINANCEIRO volta ao convite 7c8c8449 e Diretoria = Reynaldo; crm@ volta a ADMINISTRADOR/DIRETORIA) e
registrar a reversão também em `audit_log_entries`.
