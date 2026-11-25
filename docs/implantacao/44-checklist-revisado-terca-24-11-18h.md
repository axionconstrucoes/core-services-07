# 44 - Checklist revisado: backup às 11h30 e janela técnica às 18h00 de terça-feira 24/11/2026 (PREPARADO; NÃO EXECUTADO)

Decisão da Diretoria (23/11, noite): terça 24/11, 11h30 BRT = backup integral de produção e restauração validada; 18h00 BRT = início da janela técnica, condicionado ao GO; quarta 25/11 = monitoramento intensivo; aceitação funcional 02/12 mantida. Esta decisão NÃO autoriza migrations, merge, deploy nem alterações operacionais em produção: cada uma exige a autorização expressa da Diretoria no momento. Substitui os horários dos docs 42 e 43 (08h de 25/11), que ficam como histórico. Papéis: Reynaldo = decide e supervisiona e executa as etapas com credenciais; Claude Code = execução técnica; Carlos e Jaime = só a aceitação de 02/12.

## 1. Impedimentos à antecipação (o que muda por causa das 18h)
| # | Impedimento | Tratamento |
|---|---|---|
| 1 | O papel de backup das 11h expira em 6 h (cerca de 17h); a conferência pós-congelamento das 18h precisa de outro | Gerar UM SEGUNDO papel às ~17h45 (mesmo roteiro do doc 43, passos 1 a 3 e 6) |
| 2 | Token do Supabase para o executor (Management API) | Reynaldo cria às ~17h50, guarda com `salvar-token-supabase.ps1`, revoga ao fim |
| 3 | A secret key do Storage é revogada logo após o backup das 11h30 | Na conferência pós-congelamento, o Storage é comparado só por metadados (id, tamanho, eTag, versão) com o papel de leitura; só se houver diferença cria-se nova secret key para copiar o delta |
| 4 | 9 workflows agendados do GitHub continuam rodando durante a janela e a `gh` não está instalada | Reynaldo os desabilita pela interface às ~17h50 (lista no doc 41, seção K) e os reabilita só após a validação |
| 5 | Entre 11h30 e 18h a produção recebe e-mails e auditoria: o backup ficará defasado | Esperado. Após o congelamento compara-se a impressão digital; diferenças em tabelas de ingestão/auditoria obrigam novo dump (68 MB, minutos) com restauração e 13 de 13 antes das migrations. Política: se houver QUALQUER diferença não explicada, novo dump; não aceitar defasagem |
| 6 | CI do HEAD do PR | #217 (2b31b5db) verde. Existem 5 commits locais só de documentação (docs 41 a 44); fazer UM push consolidado até ~09h30 de terça, para a CI fechar até ~10h30. Depois disso, nenhum push: o merge das 18h usa um HEAD já verde |
| 7 | Outbox de risco com 1 linha PENDING (12/11, 2 tentativas) | Decisão de Reynaldo antes das 18h: aceitar (jobs pausados) ou tratar; não alterado |
| 8 | Compatibilidade do app antigo em runtime é parcial; rollback da Vercel não foi ensaiado | Risco aceito registrado; alvo do rollback: dpl_6ERyTgkFMK6oCjZqpQGbeCb4zx6L (main @ 27da839) |
| 9 | Sem segundo operador técnico; janela fora do expediente | Risco aceito em 23/11; paradas e retornos do doc 41, seção E |
| 10 | Cron `weekly-alert-digest` da Vercel (quarta 07:00 BRT) roda 13 h depois do deploy, já no app novo | F0 adia a fonte (governador); conferir na manhã de 25/11 que nada saiu |

## 2. Cronograma de terça 24/11 (BRT)
| Hora | Etapa | Responsável | Critério de passagem |
|---|---|---|---|
| ~09h30 | Push consolidado dos commits locais de documentação para integration/acc-noturna; CI | Claude Code (com autorização de push) | CI #218 verde antes das 11h30 |
| 10h30 | Papel de backup: `gerar-credencial-producao.ps1` e `1-criar-papel.sql`; `verificar-papel-producao.ps1` | Reynaldo (passo a passo no doc 43) | linha de conferência do papel; escrita impossível |
| 11h30 | Backup do banco e do Storage (secret key nova exclusiva) | Reynaldo e Claude Code | `ORIGEM_ESTAVEL_DURANTE_DUMP`; 1345 `OK` |
| ~12h30 | Revogação: `2-remover-papel.sql`, excluir a secret key, apagar segredos locais | Reynaldo | `ainda_existe=false`, `jobs_do_papel=0` |
| ~13h00 | Restauração em banco descartável local; verificações | Claude Code | **13 de 13, `TUDO_IGUAL=True`, `STORAGE_IGUAL=True`**, comparação objeto a objeto 0 divergentes |
| ~14h30 | Relatório do backup, manifestos e instruções de recuperação | Claude Code | relatório emitido; qualquer divergência = NO-GO |
| 15h00 | Reconfirmar CI verde no HEAD; migrations A a N (70 itens, 14 ondas), P0, compatibilidade e rollback (docs 28 e 41) | Claude Code | tudo conferido sem execução |
| 16h00 | Integrações críticas do piloto WEG: reconferir a matriz do doc 41 (seção L) sem alterar nada | Claude Code | tabela atualizada, nenhuma fonte declarada verde sem prova |
| 17h00 | Comunicado de indisponibilidade; decisão sobre o outbox PENDING; reunião de GO/NO-GO formal (formulário do doc 22) | Reynaldo | GO ou NO-GO assinado |
| 17h45 | Segundo papel de backup (só leitura) e token do executor; 9 workflows desabilitados | Reynaldo | itens 1, 2 e 4 da tabela acima |
| **18h00** | **T: só após autorização expressa**: pré-voo (histórico 134, md5 70a176da..., P0 930f6d75..., sem sessões ociosas, 11 jobs) | Claude Code | tudo igual ao esperado |
| T+2 | Congelamento técnico: pausar pg_cron (`6-pg-cron-pausar.sql`), workflows já desabilitados, congelar escrita (`1-aplicar-congelamento.sql`, `4-storage-congelar.sql`, `3-verificar-congelamento.sql`) | Claude Code | 0 jobs ativos, 0 escritas, 3 políticas de Storage |
| T+8 | Conferir produção contra o backup: impressão digital após o congelamento; Storage por metadados | Claude Code | iguais, ou novo dump validado (13 de 13) antes de continuar |
| T+20 | **GO/NO-GO formal** com a evidência acima | Reynaldo | autorização expressa para as ondas |
| T+25 | Migrations A a N (`executor-ondas.mjs --producao`; frase digitada), P0 após cada arquivo, histórico 204 linhas | Claude Code | `CONCLUÍDO: 70 aplicado(s)` |
| T+45 | Trava dos módulos, descongelar, `8-verificar-integridade.sql`, contagens de dados | Claude Code | 35 travadas, 0 resíduos, dados iguais |
| T+60 | **Merge do PR #245** e deploy Vercel (somente com a autorização expressa de merge) | Claude Code | deployment READY no commit esperado |
| T+70 | Retomar jobs (`7-pg-cron-retomar.sql`) e reabilitar workflows | Claude Code | 11 jobs ativos; nenhuma flag nova |
| T+80 | Testes operacionais (login, obra WEG, alerta simulado, resposta por e-mail na obra TESTE) | Claude Code | blocos P0 do doc 20 |
| T+100 | Decisão final do Dono; revogar token e papéis; observação inicial | Reynaldo | GO final ou rollback |

## 3. Liberação gradual (doc 34, seção 7), só com evidência
- **F0** (deploy sem automação nova): no deploy; 24 h sem incidente, `FAILED` ou 5xx (quarta 25/11 = monitoramento intensivo; consultas J1, J2, H1, I1).
- **F1** (usuários da equipe, obra TESTE e depois WEG): após F0 estável; aceitação do doc 20 (A, B, F, G).
- **F2** (obra WEG com caixa única do piloto, dry-run): só com aprovação do dry-run pelo Dono.
- **F3** (fontes uma a uma, 24 h cada), **F4** (alertas pilotados, caixa única, 48 h), **F5** (destinatários reais com allowlist, 7 dias): cada passo só com autorização escrita da Diretoria e as evidências do doc 34. Nenhum é liberado em 24/11.

## 4. Interrupção e recuperação (qualquer falha crítica)
Parar de imediato; não retomar jobs; aplicar a reversão da etapa corrente (doc 41, seção E): congelamento `2-reverter-congelamento.sql`/`5-storage-descongelar.sql`; ondas por `supabase/rollbacks/` em ordem inversa; app por `request_rollback` para dpl_6ERyTgkFMK6oCjZqpQGbeCb4zx6L; dados só por restauração do backup validado, decisão da Diretoria. Gatilhos de aborto: P0 divergente, falha de SQL, contagem divergente após descongelar, dado de outra obra visível, e-mail real fora da trava, deploy com erro, falha de job repetida duas vezes.

## 5. O que NÃO está feito (não declarar verde)
Backup do dia e restauração do dia; CI do HEAD final após o push consolidado; token do executor; 9 workflows desabilitados; runtime autenticado do app antigo; rollback da Vercel ensaiado; matriz de integrações em 0 fontes operacionais (a aceitação de 02/12 valida o produto sobre cobertura parcial).
