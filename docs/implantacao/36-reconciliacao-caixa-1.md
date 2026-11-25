# 36 - Reconciliação da CAIXA-1 (Gmail) para o piloto WEG

Fonte: cópia local do backup lógico de produção de 22/11/2026 (04:46 UTC), somente leitura, por agregados (sem corpo de mensagem, sem endereços). Os números do Gmail vêm do registro de auditoria das execuções (`audit_log_entries`). **Nenhum APPLY foi repetido e nenhum cursor foi tocado nesta reconciliação.**

## 1. Histórico das execuções (14 registros de auditoria; 13 execuções do workflow manual)
| Data | Modo | Janela | Resultado |
|---|---|---|---|
| 20/08 (2 execuções do script legado) | APPLY | janela da configuração | 364 e depois 116 inseridas (480 no total), 364 duplicadas, rejeitadas 524 e 440 |
| 11/11 11:03 | DRY-RUN | 11/05/2025 a 11/11/2026 | 890 candidatas, 219 já existentes, 642 rejeitadas |
| 11/11 11:10 e 11:16 | APPLY | 01/12/2025 a 11/11/2026 | 599 candidatas; 10 inseridas e depois 0 (idempotência confirmada); 370 rejeitadas |
| 11/11 11:24 | APPLY | 11/05/2025 a 11/11/2026 | 890 candidatas; **19 inseridas**; 229 existentes; 642 rejeitadas |
| 21/11 (janelas de teste de 1 a 18 h) | DRY-RUN e APPLY | 08/06 e 18/11 | 4 e 1 candidatas; 2 e 1 inseridas; 0 rejeitadas |
| 23/11 (execução 13) | DRY-RUN | 22/05/2025 a 22/11/2026 (20:00 BRT) | **198 candidatas no Gmail, 198 analisadas, 197 já existentes, 0 rejeitadas, 0 inseridas** (registro `a585739f…`, lido com SELECT autorizado limitado a esse registro) |
Não há "checkpoint por mês": o backfill é por janela fixa, idempotente por (projeto, provedor, caixa, id); o "fim congelado" impede reexecutar o mesmo início com outro fim.

## 2. Conciliação dos números de 11/11
- 890 = 229 (já existentes antes do APPLY final) + 19 (inseridas) + 642 (rejeitadas pelo perímetro). **Fecha.**
- **A diferença de 29** entre os 219 do dry-run e os 248 depois = **10 + 19 inseridas** pelos dois APPLY de 11/11. No banco: 29 mensagens criadas em 11/11, todas IN_SCOPE, INBOUND, obra WEG, com corpo.
- Mais 3 mensagens criadas em 21/11 (janelas de teste), todas IN_SCOPE com corpo.
- O banco tem 681 mensagens da CAIXA-1 (480 do lote de 20/08 + 32 de 11/11 e 21/11 + 169 incrementais). **0 duplicidades** por (provedor, caixa, id da mensagem); 0 sem id.

## 3. Rejeições: o que se sabe e o que não se sabe
- As **642 rejeitadas não são gravadas**; o script conta por domínio e por escopo mas, no banco, só ficam as contagens do registro. **Não é possível, hoje, listar os motivos individuais.**
- **Alerta de validade:** o dry-run de 890/642 foi executado em 11/11 11:03 **antes** de duas mudanças da regra do perímetro (11/11 11:46-11:47, para um remetente confirmado e depois todos os remetentes `weg.net`; 21/11, qualquer participante From/To/Cc/Bcc e subdomínios). **Esses 642 foram avaliados com uma regra superada** e não são comparáveis com a regra vigente: parte pode passar a ser elegível. A execução 13 usa a regra vigente.
- Preservadas no banco: 389 mensagens OUT_OF_SCOPE (motivo "sem evidência suficiente de vínculo", exclusão auditada, corpo conservado) e 292 IN_SCOPE (244 com vínculo confirmado, 48 sem motivo gravado: a conferir).

## 4. Disponível para análise no ACC
| Item | Quantidade |
|---|---|
| Mensagens da CAIXA-1 | 681 (513 recebidas, 168 enviadas) |
| Elegíveis (IN_SCOPE) | 292, mais 32 sem caixa de origem, também IN_SCOPE |
| Com corpo gravado | 631 de 681 |
| Meses com dados | 09/2025 a 11/2026 (05 a 08/2025: nenhuma mensagem) |
| Anexos | 573 (153 processados, **420 pendentes**, 333 deles em mensagens elegíveis) |

Mensagens por mês (CAIXA-1): 09/2025: 2; 10: 11; 11: 6; 12: 10; 01/2026: 54; 02: 67; 03: 71; 04: 60; 05: 57; 06: 74; 07: 58; 08: 78; 09: 91; 10: 39; 11: 3.

## 5. Resultado da execução 13 (regra vigente) e conciliação
- No Gmail, sob a regra vigente (domínio `weg.net` em qualquer participante, com subdomínios), há **198 mensagens candidatas em 18 meses**; **197 já estão no ACC**; **0 são rejeitadas**; 198 - 197 = **1 nova** que um APPLY inseriria (o dry-run não conta as que inseriria, e é por isso que, em 11/11, 890 = 219 + 642 + 29).
- **Por que 198 e não 197:** no código (`gmail-inbound-ingest.mjs`), o dry-run conta como "candidata" tanto a mensagem já existente quanto a elegível que um APPLY inseriria; esta última vai para a fila de inserção e **não** entra no contador de inseridas. Logo 198 - 197 - 0 = **1 mensagem elegível ainda não importada**. O dry-run não diz qual é; as hipóteses são uma mensagem chegada depois do backup de 22/11 (04:46 UTC) e antes do dry-run (23/11, 02:47 UTC), ou uma nunca importada. Identificá-la exige um APPLY de janela mínima (não autorizado) ou o dry-run com listagem de identificadores (não existe hoje; pode ser feito por mudança de código, sem tocar em produção).
- No ACC (backup de 22/11), a CAIXA-1 tem 202 mensagens com participante `weg.net` em From/To (Cc/Bcc não são guardados em colunas), contra 197 encontradas no Gmail: **5 a conferir** (podem ter sido apagadas ou movidas no Gmail depois da importação).
- **As 642 rejeições de 11/11 não existem mais** sob a regra vigente: eram artefato da regra superada. Nada a recuperar.
- O requisito dos 18 meses **na CAIXA-1** está, portanto, praticamente cumprido para o perímetro `weg.net`: o Gmail só tem 198 mensagens com esse domínio entre 22/05/2025 e 22/11/2026. **Isso não cobre os outros 6 colaboradores nem o Outlook.**
- 05 a 08/2025: o ACC não tem nada e o Gmail, sob a regra vigente, só tem as 198 acima (menor mensagem armazenada: 09/2025). Sem prova em contrário, a ausência é real, não falha de ingestão.
- **Novo APPLY não é necessário nesta etapa** (1 mensagem nova), e **não foi autorizado**.

## 6. Investigações
- **48 mensagens dentro do escopo sem motivo:** todas foram importadas pelo coletor do piloto, que usa o perímetro por participante e **não grava motivo** (29 de 11/11, 3 de 21/11, as demais incrementais de out/nov). **Legítimas**; falta apenas gravar um motivo padrão (correção de dados, não feita: sem escrita em produção).
- **90 mensagens dentro do escopo sem participante `weg.net`** (75 com motivo "vínculo confirmado por evidência", 15 sem): importadas por regras anteriores; **decisão do Dono** se permanecem (preservadas, nada foi alterado).
- **32 mensagens sem caixa de origem:** são registros **internos** (From `axion.com.br` e `axion.local`, sem provedor, sem identificador de mensagem, sem corpo e sem anexos; 28 sem classificação, 4 ESG_SSMA; criados de 28/08 a 19/11). Não são importações do Gmail. Origem provável: registros gerados pelo próprio ACC (alertas ou simulações); **confirmar no código antes de contá-los como cobertura de e-mail**.
- **Anexos:** os 573 estão no Storage, **0 com erro**. Os 420 "pendentes" são apenas **não processados** (152 PNG, 149 JPEG, 63 MS Project, 56 planilhas); o Drive está 100% pendente. Concentração: abr/2026 (136), ago e set/2026 (72 e 70). O worker novo continua desligado até a aceitação.

## 7. Diagnóstico das falhas de consulta à Vercel
Duas chamadas de listagem de variáveis falharam com `ECONNRESET` (conexão fechada pelo lado remoto) quando enviadas com o parâmetro `decrypt=false` (já marcado como obsoleto); a terceira, **sem** esse parâmetro, funcionou. A causa raiz não foi provada (pode ser falha transitória de transporte do conector). Nenhuma configuração foi alterada e nenhuma credencial alternativa foi usada.
