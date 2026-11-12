# WEG — condições para início dos testes com e-mail

O piloto só começa depois da validação das fontes. Até lá, `risk_alerts_enabled=false` na configuração da WEG. Recuperação de dados e diagnóstico não enviam e-mails.

## Destinatários definidos

| Caixa | Endereço |
|---|---|
| CRM | crm@axion.com.br |
| Reynaldo Duarte | reynaldo@axion.com.br |
| Jaime Ramos | jaime.ramos@axion.com.br |
| Carlos Evandro | carlos.evandro@axion.com.br |

Remetente: `crm@axion.com.br`. Mensagens identificadas como `[PILOTO]`; sem cópias originais e sem destinatários WEG ou de outras empresas.

O grupo de entrega é fixo no código e só vale para o projeto WEG `00000000-0000-4000-8000-000000000001`. A configuração futura é `ACC_PROJECT_PILOT_TEST_GROUP=WEG_INTERNAL_FOUR`, tanto no servidor quanto nos executores que enviam e-mail. Ausência da variável preserva o roteamento anterior; valor inválido bloqueia. Esta mudança, por si, não define a variável nem ativa envios.

Os três usuários humanos estão ACTIVE na WEG e constam da allowlist do piloto. CRM é uma caixa institucional de entrega, não um novo usuário nem uma ampliação de permissões. A lista de entrega recebe cópias de teste; destinatário lógico e permissões das ações permanecem separados.

## Validações antes do GO

- E-mails: conciliar a janela histórica com a caixa autorizada; separar o histórico completo do recorte de remetentes `@weg.net`; confirmar corpos, anexos, ausências justificadas e idempotência.
- Anexos/documentos: conferir persistência, integridade, extração e acesso ao conteúdo; distinguir recuperado de processado e tratar falhas/pêndencias.
- Diários: comprovar importação, datas cobertas, atualizações e execução automática; sucesso sem registros novos não comprova cobertura integral.
- Relatórios semanais: verificar planilhas, cronogramas, extrações e atualização efetiva do executor.
- Construmanager: separar catálogo/metadados de arquivos armazenados e conteúdo extraído; conciliar revisões e pendências.
- SSMA/Drive: validar registro real da WEG, salvamento, sincronização e acesso à evidência.
- E-mails de teste: conferir destinatários finais e MIME com provedor simulado; garantir somente as quatro caixas, ausência de CC/BCC externos e identificação de piloto. Conferir também respostas, deduplicação e os vínculos/permissões de quem usa os botões.

Não liberar o piloto enquanto houver pendência que comprometa o cenário a testar. Documentar qualquer exclusão e sua consequência. Confirmar a configuração efetiva em cada executor antes de habilitar o envio.

## Estado desta preparação

- Alertas de risco WEG desabilitados no banco e allowlist dos três usuários atualizada.
- Roteamento atual de produção ainda usa o perfil institucional anterior; a entrega às quatro caixas está preparada neste PR e não foi ativada.
- Nenhum envio real faz parte desta preparação.

## Caminhos de envio e travas (prova)

- Há um único transporte real: `users.messages.send` em `GmailEmailProvider`. Todos os remetentes de aplicação (alertas de risco, resumo semanal, SLA/escalonamento, SSMA, saúde do sistema, impacto de versão, lembretes de entrega, autorização de caixa, lotes de alerta) passam por `getEmailProvider()`; o WhatsApp é simulado.
- Ordem fixa no provider (Gmail e Fake): guarda global do piloto → perfil do projeto piloto → trava de destino único → MIME → conferência do MIME final (To exato nas quatro caixas, From = crm@, sem Cc/Bcc/Resent-*).
- Só mensagens com contexto do projeto WEG usam o grupo. Mensagem de outro projeto ou sem projeto continua no destinatário institucional (crm@) em modo piloto.
- Cobertura: `scripts/test-project-pilot-four-recipients.mjs` e `scripts/test-pilot-send-paths-convergence.mjs` (inclui MIME, injeção de cabeçalho, Reply-To externo e `ACC_OUTBOUND_MODE=production`).

## Limites conhecidos (decisão necessária antes de ativar)

1. Respostas por e-mail: com o grupo, a caixa de resposta do piloto passa a ser o remetente (`crm@`). Respostas escritas por reynaldo@, jaime.ramos@ ou carlos.evandro@ NÃO são atribuídas ao participante simulado (fail-closed); só botões/links e respostas de crm@ funcionam. Decidir se isto basta para o cenário a testar.
2. Em `ACC_OUTBOUND_MODE=production`, mensagens SEM contexto de projeto não passam pela guarda global e seguem aos destinatários originais (comportamento anterior, fora deste PR). Confirmar que a variável não está em `production` nos executores antes de ativar.
3. A variável `ACC_PROJECT_PILOT_TEST_GROUP` precisa existir igual no servidor (Vercel) e no workflow `weekly-schedule-email-ingestion` (variável de repositório). Este PR apenas repassa a variável ao job; não a define.

## Plano de publicação e ativação (para aprovação final)

Pré-condições: CI verde no HEAD final; backup/estado registrado; `risk_alerts_enabled=false` na WEG; fontes validadas (ver acima).

1. Merge do PR (com autorização explícita). Confirmar deploy READY.
2. Sem enviar nada: no Vercel, conferir `ACC_PROJECT_PILOT_PROJECT_ID` = id da WEG, `ACC_PROJECT_PILOT_SENDER=crm@axion.com.br`, `ACC_OUTBOUND_MODE` diferente de `production`, `ACC_PILOT_RECIPIENT=crm@axion.com.br`.
3. Definir `ACC_PROJECT_PILOT_TEST_GROUP=WEG_INTERNAL_FOUR` no Vercel e como variável de repositório (mesmo valor). Redeploy.
4. Verificação sem envio: executar a suíte `test:email` na main e uma simulação com `FakeEmailProvider` confirmando To exato, ausência de Cc/Bcc e `[PILOTO]`.
5. Somente com aprovação final: habilitar `risk_alerts_enabled=true` na WEG e disparar UM ciclo controlado; conferir os cabeçalhos da mensagem recebida (To, ausência de Cc/Bcc, assunto `[PILOTO]`, remetente) nas quatro caixas.
6. Rollback imediato: `risk_alerts_enabled=false` (para o envio), remover `ACC_PROJECT_PILOT_TEST_GROUP` (volta ao destino institucional), redeploy. Nenhuma migration envolvida.


## Respostas no grupo interno (WEG_INTERNAL_FOUR) — identidade própria

Com `ACC_PROJECT_PILOT_TEST_GROUP=WEG_INTERNAL_FOUR`, o processador de respostas deixa de atribuir a caixa do piloto (`crm@`) ao participante simulado:

| Remetente real (From) | Resultado |
|---|---|
| Destinatário lógico do alerta, na allowlist, vínculo ativo (qualquer das quatro caixas) | autorizado com a PRÓPRIA identidade; ação aplicada pela máquina de estados |
| Membro do grupo, vínculo ativo, mas não destinatário lógico (ou fora da allowlist) | resposta REGISTRADA com a própria identidade (`REVIEW_REQUIRED`, auditoria `RISK_ALERT_PILOT_GROUP_REPLY`); nenhuma ação sobre o alerta |
| `crm@` | trata-se como qualquer membro: nunca vira Jaime, Carlos, Reynaldo ou outro participante |
| Membro do grupo sem vínculo ativo, sem profile, autenticação com falha ou correlação fraca (código visível) | `UNAUTHORIZED_REPLY` (`PILOT_GROUP_*`) |
| Fora do grupo | regras normais (`authorizeReply`) |

Correlação exige token do Reply-To ou In-Reply-To (índice do próprio projeto); Message-ID repetido é ignorado. Testes: `scripts/test-pilot-group-reply.mjs` (12).
